"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const identity = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-target-identity-core.js"));

test("targetKey computes deterministic SHA-256 of NFC path", () => {
  const key1 = identity.targetKey("PARA/RESOURCES/Auction Regions/부산광역시-사하구.md");
  const key2 = identity.targetKey("PARA/RESOURCES/Auction Regions/부산광역시-사하구.md");
  assert.equal(key1, key2);
  assert.match(key1, /^[0-9a-f]{64}$/);
});

test("targetKey NFC-normalizes: NFD and NFC input produce same key", () => {
  const nfc = "PARA/RESOURCES/Auction Regions/\uBD80\uC0B0\uAD11\uC5ED\uC2DC-\uBD80\uD3C9\uAD6C.md"; // NFC
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd); // different byte sequences
  assert.equal(identity.targetKey(nfc), identity.targetKey(nfd)); // same hash
});

test("targetKey rejects empty string", () => {
  assert.throws(() => identity.targetKey(""), /비어 있습니다/);
  assert.throws(() => identity.targetKey("  "), /비어 있습니다/);
});

test("targetKey rejects absolute path", () => {
  assert.throws(() => identity.targetKey("<home>/test/file.md"), /상대 경로/);
});

test("targetKey rejects traversal", () => {
  assert.throws(() => identity.targetKey("../etc/passwd"), /traversal/);
  assert.throws(() => identity.targetKey("PARA/../../etc/passwd"), /traversal/);
});

test("canonicalRelativePath computes NFC relative path", () => {
  const vault = "<home>/test/Vault";
  const abs = "<home>/test/Vault/PARA/RESOURCES/Auction Regions/부산광역시-사하구.md";
  const rel = identity.canonicalRelativePath(vault, abs);
  assert.equal(rel, "PARA/RESOURCES/Auction Regions/부산광역시-사하구.md");
  assert.equal(rel, rel.normalize("NFC"));
});

test("canonicalRelativePath rejects path outside vault", () => {
  assert.throws(() => identity.canonicalRelativePath("<home>/test/Vault", "<home>/other/file.md"), /밖에 있습니다/);
});

test("canonicalRelativePath rejects empty inputs", () => {
  assert.throws(() => identity.canonicalRelativePath("", "/a/b"), /비어 있습니다/);
  assert.throws(() => identity.canonicalRelativePath("/a", ""), /비어 있습니다/);
});

test("NFD 부평 filename preservation: key uses NFC but path is not renamed", () => {
  // Simulate: filesystem has NFD filename, but targetKey hashes NFC
  const nfdName = "인천광역시-부평구.md".normalize("NFD");
  const nfcName = "인천광역시-부평구.md".normalize("NFC");
  const relNfd = `PARA/RESOURCES/Auction Regions/${nfdName}`;
  const relNfc = `PARA/RESOURCES/Auction Regions/${nfcName}`;
  // Both produce the same target key
  assert.equal(identity.targetKey(relNfd), identity.targetKey(relNfc));
  // But the strings themselves differ (filesystem path preserved)
  assert.notEqual(relNfd, relNfc);
});
