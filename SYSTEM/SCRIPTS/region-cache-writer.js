/**
 * region-cache-writer.js
 *
 * Immutable cache writer for Region Intelligence generations.
 * Writes generation-qualified hash-addressed artifacts in the acyclic
 * lineage order:
 *
 *   request.json -> raw/** -> raw-manifest.json -> normalized.json ->
 *   diff.json -> receipt.json + domain-inputs/** -> hashes.json ->
 *   immutable selection-receipt.json -> selected.json
 *
 * Only selected.json is a mutable current-head pointer. hashes.json cannot
 * include itself. Atomic writes use a temp file + fsync + rename.
 *
 * CommonJS. Uses only Node.js built-in modules.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const runState = require("./region-run-state-core.js");

// ---------------------------------------------------------------------------
// Declared immutable artifact members (relative to generation root)
// ---------------------------------------------------------------------------

// Ordered lineage stages. domain-inputs/** leaves are added dynamically.
const IMMUTABLE_MEMBERS = [
  "request.json",
  "raw-manifest.json",
  "normalized.json",
  "diff.json",
  "receipt.json",
  "hashes.json",
  "selection-receipt.json",
];

// Members that hashes.json must NEVER include.
const HASHES_EXCLUDED = new Set(["hashes.json"]);

// The only mutable pointer (lives at provider root, not generation root).
const MUTABLE_POINTER = "selected.json";

// ---------------------------------------------------------------------------
// Low-level atomic write
// ---------------------------------------------------------------------------

function sha256hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Atomically write bytes to destPath: write temp, fsync file, rename, fsync dir.
 * Returns the sha256 of the written bytes.
 */
function atomicWrite(destPath, buf) {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(destPath)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, buf);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, destPath);
  // fsync parent directory
  let dirFd;
  try {
    dirFd = fs.openSync(dir, "r");
    fs.fsyncSync(dirFd);
  } catch (_e) {
    // Some filesystems don't support opening a dir for fsync; ignore.
  } finally {
    if (dirFd !== undefined) {
      try { fs.closeSync(dirFd); } catch (_e) { /* ignore */ }
    }
  }
  return sha256hex(buf);
}

function toBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") return Buffer.from(content, "utf8");
  // Object -> canonical JSON
  return Buffer.from(runState.canonicalJSON(content), "utf8");
}

// ---------------------------------------------------------------------------
// Generation writer
// ---------------------------------------------------------------------------

/**
 * Create a GenerationWriter bound to a vault root, provider, and generation
 * directory name. All immutable artifacts are written under the generation
 * root; the mutable selected.json lives at the provider root.
 */
class GenerationWriter {
  constructor(vaultRoot, providerId, generationDirName) {
    this.vaultRoot = vaultRoot;
    this.providerId = runState.validateProviderId(providerId);
    this.generationDirName = generationDirName;
    this.providerRoot = path.join(vaultRoot, runState.providerCacheRoot(providerId));
    this.generationRoot = path.join(this.providerRoot, "generations", generationDirName);
    this.hashes = {}; // member relpath -> sha256
    this.written = new Set();
    this.finalized = false;
  }

  _assertNotFinalized() {
    if (this.finalized) {
      throw new Error("Generation already finalized; immutable artifacts cannot change");
    }
  }

  _genPath(relPath) {
    // Reject traversal outside generation root.
    if (relPath.includes("..")) {
      throw new Error(`Artifact path contains dot segment: "${relPath}"`);
    }
    const abs = path.join(this.generationRoot, relPath);
    const resolved = path.resolve(abs);
    if (!resolved.startsWith(path.resolve(this.generationRoot) + path.sep)) {
      throw new Error(`Artifact path escapes generation root: "${relPath}"`);
    }
    return abs;
  }

  /**
   * Write an immutable artifact at a generation-relative path.
   * Records its hash. Rejects re-writing an already-written immutable member.
   */
  writeArtifact(relPath, content) {
    this._assertNotFinalized();
    if (relPath === "hashes.json") {
      throw new Error("hashes.json is written only by finalizeHashes()");
    }
    if (relPath === MUTABLE_POINTER) {
      throw new Error("selected.json is a mutable pointer and cannot be written as an immutable artifact");
    }
    if (this.written.has(relPath)) {
      throw new Error(`Immutable artifact already written: "${relPath}"`);
    }
    const buf = toBuffer(content);
    const hash = atomicWrite(this._genPath(relPath), buf);
    this.hashes[relPath] = hash;
    this.written.add(relPath);
    return hash;
  }

  /**
   * Write a raw response byte under raw/{name}.
   */
  writeRaw(name, buf) {
    if (!Buffer.isBuffer(buf)) {
      throw new Error("raw artifact must be a Buffer of original response bytes");
    }
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
      throw new Error(`raw name must be a flat filename: "${name}"`);
    }
    return this.writeArtifact(path.join("raw", name), buf);
  }

  /**
   * Write a domain-input leaf under domain-inputs/{domain}/{name}.
   * domain must be one of metrics|transit|research|land-price.
   */
  writeDomainInput(domain, name, content) {
    const allowed = ["metrics", "transit", "research", "land-price"];
    if (!allowed.includes(domain)) {
      throw new Error(`domain must be one of ${allowed.join("|")}: "${domain}"`);
    }
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
      throw new Error(`domain-input name must be flat: "${name}"`);
    }
    return this.writeArtifact(path.join("domain-inputs", domain, name), content);
  }

  /**
   * Write hashes.json covering every written immutable member EXCEPT itself.
   * Returns the hashes.json hash (recorded but excluded from its own content).
   */
  finalizeHashes() {
    this._assertNotFinalized();
    const members = {};
    for (const relPath of Object.keys(this.hashes).sort()) {
      if (HASHES_EXCLUDED.has(relPath)) continue;
      members[relPath] = this.hashes[relPath];
    }
    const hashesDoc = {
      generation: this.generationDirName,
      provider: this.providerId,
      members,
    };
    const buf = toBuffer(hashesDoc);
    const hash = atomicWrite(this._genPath("hashes.json"), buf);
    // Record hashes.json's own hash for the selection receipt, but it is NOT
    // included inside hashes.json content.
    this.hashes["hashes.json"] = hash;
    this.written.add("hashes.json");
    return hash;
  }

  /**
   * Write the immutable selection-receipt.json. Requires hashes.json finalized.
   * The mutable pointer's bytes never participate here.
   */
  writeSelectionReceipt(extra) {
    this._assertNotFinalized();
    if (!this.written.has("hashes.json")) {
      throw new Error("hashes.json must be finalized before selection-receipt.json");
    }
    if (this.written.has("selection-receipt.json")) {
      throw new Error("selection-receipt.json already written");
    }
    const doc = Object.assign(
      {
        generation: this.generationDirName,
        provider: this.providerId,
        hashes_json_hash: this.hashes["hashes.json"],
        member_hashes: Object.assign({}, this.hashes),
      },
      extra || {}
    );
    const hash = this.writeArtifact("selection-receipt.json", doc);
    this.finalized = true;
    return hash;
  }

  /**
   * Advance the mutable current-head pointer selected.json at the provider root.
   * This is the ONLY mutable write. It references the immutable selection
   * receipt by hash; its own bytes are never hashed into history.
   */
  advancePointer(selectionReceiptHash, selectedAt) {
    if (!this.finalized) {
      throw new Error("Cannot advance pointer before selection-receipt.json is written");
    }
    const sel = runState.createSelectionState(
      this.providerId,
      this.generationDirName,
      selectionReceiptHash,
      selectedAt
    );
    const buf = toBuffer(sel);
    atomicWrite(path.join(this.providerRoot, MUTABLE_POINTER), buf);
    return sel;
  }
}

/**
 * Convenience: create a generation writer.
 */
function createGenerationWriter(vaultRoot, providerId, generationDirName) {
  return new GenerationWriter(vaultRoot, providerId, generationDirName);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  IMMUTABLE_MEMBERS,
  HASHES_EXCLUDED,
  MUTABLE_POINTER,
  atomicWrite,
  sha256hex,
  GenerationWriter,
  createGenerationWriter,
};
