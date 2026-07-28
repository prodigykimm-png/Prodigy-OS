#!/usr/bin/env node
"use strict";

/**
 * region-target-identity-core.js
 * Deterministic target identity: NFC-normalized SHA-256 of repo-relative path.
 * NFD filesystem filenames are preserved; hashing always uses NFC.
 */

const crypto = require("node:crypto");
const path = require("node:path");

/**
 * Compute SHA-256 hex of the NFC-normalized relative path (UTF-8 encoded).
 * @param {string} relativePath - repo-relative target path (e.g. "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md")
 * @returns {string} 64-char lowercase hex
 */
function targetKey(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new Error("target path가 비어 있습니다.");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error("target path는 상대 경로여야 합니다: " + relativePath);
  }
  // Reject traversal
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..") || normalized.split(path.sep).includes("..")) {
    throw new Error("target path에 traversal(..)이 포함되어 있습니다: " + relativePath);
  }
  const nfc = relativePath.normalize("NFC");
  return crypto.createHash("sha256").update(nfc, "utf8").digest("hex");
}

/**
 * Compute the canonical repo-relative path from vaultRoot and absolutePath.
 * Returns NFC-normalized relative path with forward slashes.
 * @param {string} vaultRoot - absolute vault root
 * @param {string} absolutePath - absolute file path
 * @returns {string} NFC-normalized repo-relative path
 */
function canonicalRelativePath(vaultRoot, absolutePath) {
  if (typeof vaultRoot !== "string" || vaultRoot.trim() === "") {
    throw new Error("vaultRoot이 비어 있습니다.");
  }
  if (typeof absolutePath !== "string" || absolutePath.trim() === "") {
    throw new Error("absolutePath가 비어 있습니다.");
  }
  const resolvedVault = path.resolve(vaultRoot);
  const resolvedTarget = path.resolve(absolutePath);
  const rel = path.relative(resolvedVault, resolvedTarget);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("absolutePath가 vaultRoot 밖에 있습니다: " + absolutePath);
  }
  // Normalize separators to forward slash and NFC
  return rel.split(path.sep).join("/").normalize("NFC");
}

module.exports = Object.freeze({ targetKey, canonicalRelativePath });
