#!/usr/bin/env node
"use strict";

/**
 * region-approval-claim-core.js
 * Immutable nonce claims, target locks, and fsync-durable exclusive creation.
 * Storage layout under SYSTEM/CACHE/region-approvals/:
 *   envelopes/{nonce}.json  — immutable UUIDv4 nonce envelopes
 *   receipts/{nonce}.json   — immutable terminal receipts
 *   claims/{nonce}.json     — immutable nonce claims
 *   locks/{target_key}.json — exclusive temporary target locks
 */

const fs = require("node:fs");
const path = require("node:path");

const SUBDIRS = Object.freeze({
  envelopes: "envelopes",
  receipts: "receipts",
  claims: "claims",
  locks: "locks"
});

function ensureDirs(approvalRoot) {
  for (const sub of Object.values(SUBDIRS)) {
    fs.mkdirSync(path.join(approvalRoot, sub), { recursive: true });
  }
}

function fsyncDir(dirPath) {
  let fd;
  try {
    fd = fs.openSync(dirPath, "r");
    fs.fsyncSync(fd);
  } catch (_e) {
    // best effort on platforms that don't support dir fsync
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_e) { /* ignore */ }
    }
  }
}

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2) + "\n";
}

/**
 * Exclusive-create a JSON file with wx + fsync (file and parent dir).
 * @returns {boolean} true if created, false if already existed
 */
function exclusiveCreate(filePath, data) {
  const content = canonicalJson(data);
  let fd;
  try {
    fd = fs.openSync(filePath, "wx", 0o600);
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fsyncDir(path.dirname(filePath));
    return true;
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_e) { /* ignore */ }
    }
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

/**
 * Acquire an exclusive target lock.
 * @param {string} approvalRoot - path to region-approvals directory
 * @param {string} targetKeyHex - SHA-256 hex target key
 * @param {string} nonce - UUIDv4 nonce
 * @param {string} preimageHash - SHA-256 of target file content
 * @param {string} ownerToken - opaque owner identifier
 * @param {number} generation - monotonic generation counter
 * @returns {{ acquired: boolean, lock?: object }}
 */
function acquireTargetLock(approvalRoot, targetKeyHex, nonce, preimageHash, ownerToken, generation) {
  ensureDirs(approvalRoot);
  const lockPath = path.join(approvalRoot, SUBDIRS.locks, `${targetKeyHex}.json`);
  const lockData = {
    schema_version: 1,
    target_key: targetKeyHex,
    nonce,
    preimage_hash: preimageHash,
    owner_token: ownerToken,
    generation: typeof generation === "number" ? generation : 0,
    acquired_at: new Date().toISOString()
  };
  const acquired = exclusiveCreate(lockPath, lockData);
  if (!acquired) {
    return { acquired: false };
  }
  return { acquired: true, lock: lockData };
}

/**
 * Acquire an immutable nonce claim.
 * Nonce claims are NEVER removed or reused.
 * @returns {{ acquired: boolean, claim?: object }}
 */
function acquireNonceClaim(approvalRoot, nonce, targetKeyHex, preimageHash, ownerToken, generation) {
  ensureDirs(approvalRoot);
  const claimPath = path.join(approvalRoot, SUBDIRS.claims, `${nonce}.json`);
  const claimData = {
    schema_version: 1,
    nonce,
    target_key: targetKeyHex,
    preimage_hash: preimageHash,
    owner_token: ownerToken,
    generation: typeof generation === "number" ? generation : 0,
    claimed_at: new Date().toISOString()
  };
  const acquired = exclusiveCreate(claimPath, claimData);
  if (!acquired) {
    return { acquired: false };
  }
  return { acquired: true, claim: claimData };
}

/**
 * Release a target lock (unlink + fsync parent).
 * @returns {boolean} true if released, false if not found
 */
function releaseTargetLock(approvalRoot, targetKeyHex) {
  const lockPath = path.join(approvalRoot, SUBDIRS.locks, `${targetKeyHex}.json`);
  try {
    fs.unlinkSync(lockPath);
    fsyncDir(path.dirname(lockPath));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Read and parse a nonce claim.
 * @returns {object|null}
 */
function readClaim(approvalRoot, nonce) {
  const claimPath = path.join(approvalRoot, SUBDIRS.claims, `${nonce}.json`);
  try {
    return JSON.parse(fs.readFileSync(claimPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Read and parse a target lock.
 * @returns {object|null}
 */
function readLock(approvalRoot, targetKeyHex) {
  const lockPath = path.join(approvalRoot, SUBDIRS.locks, `${targetKeyHex}.json`);
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Write an immutable receipt (wx + fsync).
 * @returns {boolean} true if written, false if already exists
 */
function writeReceipt(approvalRoot, nonce, receiptData) {
  ensureDirs(approvalRoot);
  const receiptPath = path.join(approvalRoot, SUBDIRS.receipts, `${nonce}.json`);
  return exclusiveCreate(receiptPath, receiptData);
}

/**
 * Read a receipt.
 * @returns {object|null}
 */
function readReceipt(approvalRoot, nonce) {
  const receiptPath = path.join(approvalRoot, SUBDIRS.receipts, `${nonce}.json`);
  try {
    return JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

module.exports = Object.freeze({
  SUBDIRS,
  ensureDirs,
  fsyncDir,
  canonicalJson,
  exclusiveCreate,
  acquireTargetLock,
  acquireNonceClaim,
  releaseTargetLock,
  readClaim,
  readLock,
  writeReceipt,
  readReceipt
});
