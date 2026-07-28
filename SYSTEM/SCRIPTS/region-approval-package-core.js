#!/usr/bin/env node
"use strict";

/**
 * region-approval-package-core.js
 * Immutable approval envelope creation and validation.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md §Approval and writers
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const claimCore = require("./region-approval-claim-core.js");
const targetIdentity = require("./region-target-identity-core.js");

const WRITER_IDS = Object.freeze(["metrics", "research", "transit", "land_price"]);
const TTL_MINUTES = 30;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function generateNonce() {
  return crypto.randomUUID();
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sha256String(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Create an immutable approval envelope.
 * @param {object} options
 * @param {string} options.approvalRoot - SYSTEM/CACHE/region-approvals
 * @param {string} options.writerId - metrics|research|transit|land_price
 * @param {string} options.targetPath - repo-relative target (e.g. "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md")
 * @param {string} options.vaultRoot - absolute vault root for hash computation
 * @param {string} options.domainInputPath - repo-relative domain input path
 * @param {string} options.renderedOutputHash - SHA-256 of expected writer output
 * @param {object} [options.receiptHashes] - map of receipt filename → SHA-256
 * @param {string} [options.writerVersion] - writer version string
 * @param {object} [options.parameters] - extra parameters
 * @returns {{ nonce: string, envelope: object, envelopePath: string }}
 */
function createEnvelope(options) {
  const { approvalRoot, writerId, targetPath, vaultRoot, domainInputPath } = options;
  if (!approvalRoot) throw new Error("approvalRoot이 필요합니다.");
  if (!WRITER_IDS.includes(writerId)) throw new Error(`writer_id는 ${WRITER_IDS.join("|")} 중 하나여야 합니다: ${writerId}`);
  if (!targetPath || typeof targetPath !== "string") throw new Error("targetPath가 필요합니다.");
  if (path.isAbsolute(targetPath)) throw new Error("targetPath는 상대 경로여야 합니다.");
  if (!domainInputPath || typeof domainInputPath !== "string") throw new Error("domainInputPath가 필요합니다.");
  if (path.isAbsolute(domainInputPath)) throw new Error("domainInputPath는 상대 경로여야 합니다.");

  const nonce = generateNonce();
  const targetKeyHex = targetIdentity.targetKey(targetPath);

  // Compute preimage hash from actual target file
  const targetAbsolute = path.resolve(vaultRoot, targetPath);
  if (!fs.existsSync(targetAbsolute)) throw new Error(`대상 파일이 존재하지 않습니다: ${targetPath}`);
  const preimageHash = sha256File(targetAbsolute);

  // Compute domain input hash
  const domainInputAbsolute = path.resolve(vaultRoot, domainInputPath);
  if (!fs.existsSync(domainInputAbsolute)) throw new Error(`domain input 파일이 존재하지 않습니다: ${domainInputPath}`);
  const domainInputHash = sha256File(domainInputAbsolute);

  const renderedOutputHash = options.renderedOutputHash;
  if (!renderedOutputHash || !SHA256_RE.test(renderedOutputHash)) {
    throw new Error("renderedOutputHash는 유효한 SHA-256 hex여야 합니다.");
  }

  const envelope = {
    schema_version: 1,
    nonce,
    created_at: new Date().toISOString(),
    ttl_minutes: TTL_MINUTES,
    writer_id: writerId,
    target_path: targetPath.normalize("NFC"),
    target_key: targetKeyHex,
    preimage_hash: preimageHash,
    domain_input_path: domainInputPath,
    domain_input_hash: domainInputHash,
    rendered_output_hash: renderedOutputHash,
    receipt_hashes: options.receiptHashes || {},
    writer_version: options.writerVersion || "1.0.0",
    parameters: options.parameters || {}
  };

  // Write immutable envelope with wx+fsync
  claimCore.ensureDirs(approvalRoot);
  const envelopePath = path.join(approvalRoot, claimCore.SUBDIRS.envelopes, `${nonce}.json`);
  const created = claimCore.exclusiveCreate(envelopePath, envelope);
  if (!created) throw new Error(`envelope 생성 실패 (이미 존재): ${nonce}`);

  return { nonce, envelope, envelopePath };
}

/**
 * Validate an envelope by nonce.
 * @param {string} approvalRoot
 * @param {string} nonce
 * @param {Date} [now] - for TTL check
 * @returns {{ valid: boolean, envelope?: object, error?: string }}
 */
function validateEnvelope(approvalRoot, nonce, now) {
  if (!UUID_V4_RE.test(nonce)) {
    return { valid: false, error: `nonce가 UUIDv4 형식이 아닙니다: ${nonce}` };
  }
  const envelopePath = path.join(approvalRoot, claimCore.SUBDIRS.envelopes, `${nonce}.json`);
  if (!fs.existsSync(envelopePath)) {
    return { valid: false, error: `envelope가 존재하지 않습니다: ${nonce}` };
  }
  let envelope;
  try {
    envelope = JSON.parse(fs.readFileSync(envelopePath, "utf8"));
  } catch (e) {
    return { valid: false, error: `envelope 파싱 실패: ${e.message}` };
  }

  // Schema checks
  if (envelope.schema_version !== 1) return { valid: false, error: "schema_version은 1이어야 합니다." };
  if (envelope.nonce !== nonce) return { valid: false, error: "envelope 내부 nonce가 불일치합니다." };
  if (!WRITER_IDS.includes(envelope.writer_id)) return { valid: false, error: `알 수 없는 writer_id: ${envelope.writer_id}` };
  if (envelope.ttl_minutes !== TTL_MINUTES) return { valid: false, error: `TTL은 ${TTL_MINUTES}분이어야 합니다.` };
  if (!SHA256_RE.test(envelope.preimage_hash || "")) return { valid: false, error: "preimage_hash가 유효하지 않습니다." };
  if (!SHA256_RE.test(envelope.domain_input_hash || "")) return { valid: false, error: "domain_input_hash가 유효하지 않습니다." };
  if (!SHA256_RE.test(envelope.rendered_output_hash || "")) return { valid: false, error: "rendered_output_hash가 유효하지 않습니다." };
  if (!envelope.target_path || path.isAbsolute(envelope.target_path)) return { valid: false, error: "target_path가 유효하지 않습니다." };
  if (!envelope.domain_input_path || path.isAbsolute(envelope.domain_input_path)) return { valid: false, error: "domain_input_path가 유효하지 않습니다." };

  // TTL check
  if (isExpired(envelope, now || new Date())) {
    return { valid: false, error: "envelope가 만료되었습니다.", envelope, expired: true };
  }

  return { valid: true, envelope };
}

/**
 * Check if an envelope is expired.
 * @param {object} envelope
 * @param {Date} now
 * @returns {boolean}
 */
function isExpired(envelope, now) {
  const created = new Date(envelope.created_at);
  const expiryMs = created.getTime() + (envelope.ttl_minutes || TTL_MINUTES) * 60 * 1000;
  return now.getTime() > expiryMs;
}

module.exports = Object.freeze({
  WRITER_IDS,
  TTL_MINUTES,
  UUID_V4_RE,
  SHA256_RE,
  generateNonce,
  sha256File,
  sha256String,
  createEnvelope,
  validateEnvelope,
  isExpired
});
