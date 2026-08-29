"use strict";

// Task 10 remediation regression: parseCanonicalWritePath must explicitly
// accept ZETA/LITERATURE and ZETA/CANDIDATES lifecycle destinations while all
// Permanent authority behavior stays byte-for-byte identical.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const boundary = require(path.join(ROOT, "SYSTEM/Views/llmwiki-write-boundary-policy.js"));
const writeSet = require(path.join(ROOT, "SYSTEM/Views/llmwiki-risk-write-set.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

test("lifecycle prefixes are accepted canonical write targets", () => {
  for (const value of ["ZETA/LITERATURE/unit_alpha.md", "ZETA/CANDIDATES/cand_note.md", "ZETA/PERMANENT/Evergreen Note.md"]) {
    assert.equal(boundary.parseCanonicalWritePath(value).ok, true, value);
  }
});

test("Permanent authority behavior is unchanged: unsafe titles and foreign prefixes still rejected", () => {
  assert.equal(boundary.parseCanonicalWritePath("ZETA/PERMANENT/../escape.md").ok, false);
  assert.equal(boundary.parseCanonicalWritePath("ZETA/PERMANENT/bad$title.md").ok, false);
  assert.equal(boundary.parseCanonicalWritePath("PARA/RESOURCES/Knowledge/legacy.md").ok, false);
  assert.equal(boundary.parseCanonicalWritePath("ZETA/LITERATURE/bad$title.md").ok, false);
  assert.equal(boundary.parseCanonicalWritePath("ZETA/CANDIDATES/.hidden.md").ok, false);
  assert.equal(boundary.parseImmutableAuditGitPath(".llmwiki-audit/immutable/x.json").ok, false);
});

test("risk write set accepts lifecycle destinations and still rejects non-canonical paths", () => {
  const operation = (destinationIds) => ({
    destination_ids: destinationIds,
    effects: { deprecations: [], supersessions: [] },
  });
  assert.deepEqual(
    writeSet.operationPaths(operation(["ZETA/CANDIDATES/b.md", "ZETA/LITERATURE/a.md", "ZETA/PERMANENT/c.md"])),
    ["ZETA/CANDIDATES/b.md", "ZETA/LITERATURE/a.md", "ZETA/PERMANENT/c.md"].sort(),
  );
  assert.throws(() => writeSet.operationPaths(operation(["PARA/RESOURCES/legacy.md"])), /invalid_risk_write_path/u);
  assert.throws(() => writeSet.operationPaths(operation(["ZETA/LITERATURE/a.md", "ZETA/LITERATURE/a.md"])), /duplicate_risk_write_path/u);
});
