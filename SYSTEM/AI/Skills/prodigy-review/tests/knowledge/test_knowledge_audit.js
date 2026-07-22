"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const fixtures = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/knowledge_explorer_fixtures.js"));
const audit = require(path.join(ROOT, "SYSTEM/SCRIPTS/knowledge-explorer-audit.js"));

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeTempFixture(baseDir, fixture) {
  const rel = fixture.source_path.replace(/^SYNTHETIC\/knowledge-explorer\//, "");
  const target = path.join(baseDir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fixture.content, "utf8");
  return target;
}

function assertTemplateBodies() {
  const knowledgeTemplate = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_knowledge.md"), "utf8");
  const permanentTemplate = fs.readFileSync(path.join(ROOT, "SYSTEM/TEMPLATE/FORMAT/template_permanent_note.md"), "utf8");
  assert.match(knowledgeTemplate, /type: knowledge/);
  assert.match(knowledgeTemplate, /knowledge_domain:\nknowledge_topics:\nsummary:/);
  assert.match(knowledgeTemplate, /## 핵심 요약/);
  assert.match(knowledgeTemplate, /## 연결된 Object/);
  assert.match(knowledgeTemplate, /## 본문/);
  assert.doesNotMatch(knowledgeTemplate.split("---\n").pop(), /knowledge_domain|knowledge_topics|summary|connections/);
  assert.match(permanentTemplate, /type: permanent_note/);
  assert.match(permanentTemplate, /knowledge_domain:\nknowledge_topics:/);
  assert.doesNotMatch(permanentTemplate.split("---\n").pop(), /knowledge_domain|knowledge_topics/);
}

function assertAuditOutputShape(report) {
  assert.ok(Array.isArray(report.entries));
  assert.ok(Array.isArray(report.skipped));
  assert.equal(typeof report.counts.scanned, "number");
  assert.equal(typeof report.counts.reported, "number");
  assert.equal(typeof report.counts.skipped, "number");
  assert.equal(typeof report.counts.manual_review, "number");
  assert.equal(typeof report.counts.suggested, "number");
  const paths = report.entries.map((entry) => entry.path);
  assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b)));
}

function main() {
  assertTemplateBodies();

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-audit-"));
  const tempFixtures = fixtures.flattenCatalog(fixtures.catalog).slice(0, 5);
  const tempFiles = tempFixtures.map((fixture) => writeTempFixture(tmpRoot, fixture));
  const dailyPath = path.join(tmpRoot, "DAILY/DAILY/2026-07-19.md");
  const prePath = path.join(tmpRoot, "PRE/2026-07-19.md");
  fs.mkdirSync(path.dirname(dailyPath), { recursive: true });
  fs.mkdirSync(path.dirname(prePath), { recursive: true });
  fs.writeFileSync(dailyPath, fixtures.catalog.dailyNotes[0].content, "utf8");
  fs.writeFileSync(prePath, fixtures.catalog.journals[0].content, "utf8");
  const beforeHashes = new Map([...tempFiles, dailyPath, prePath].map((filePath) => [filePath, hashFile(filePath)]));

  const records = fixtures.flattenCatalog(fixtures.catalog).map((fixture) => ({
    source_path: fixture.source_path,
    content: fixture.content,
    frontmatter: fixture.frontmatter,
    type: fixture.type,
  }));
  const report = audit.auditRecords(records);
  assertAuditOutputShape(report);

  const canonical = report.entries.find((entry) => entry.path.endsWith("validated-knowledge.md"));
  assert.ok(canonical);
  assert.equal(canonical.current_type, "knowledge");
  assert.equal(canonical.manual_review, true);
  assert.ok(canonical.missing_invalid_metadata.some((item) => item.field === "knowledge_topics"));

  const legacy = report.entries.find((entry) => entry.path.endsWith("legacy-permanent-note.md"));
  assert.ok(legacy);
  assert.equal(legacy.current_type, "permanent_note");
  assert.equal(legacy.manual_review, true);
  assert.ok(legacy.missing_invalid_metadata.some((item) => item.field === "knowledge_topics"));

  const approvedRecords = audit.auditRecords([
    {
      source_path: "SYNTHETIC/knowledge-explorer/knowledge/approved.md",
      type: "knowledge",
      frontmatter: {
        type: "knowledge",
        knowledge_domain: "coding",
        knowledge_topics: ["electron", "react"],
      },
      content: [
        "---",
        "type: knowledge",
        "knowledge_domain: coding",
        "knowledge_topics:",
        "  - electron",
        "  - react",
        "---",
        "",
      ].join("\n"),
    },
    {
      source_path: "SYNTHETIC/knowledge-explorer/knowledge/approved-legacy.md",
      type: "permanent_note",
      frontmatter: {
        type: "permanent_note",
        knowledge_domain: "coding",
        knowledge_topics: "electron, react",
      },
      content: [
        "---",
        "type: permanent_note",
        "knowledge_domain: coding",
        "knowledge_topics: electron, react",
        "---",
        "",
      ].join("\n"),
    },
  ]);
  const approvedCanonical = approvedRecords.entries.find((entry) => entry.path.endsWith("approved.md"));
  const approvedLegacy = approvedRecords.entries.find((entry) => entry.path.endsWith("approved-legacy.md"));
  assert.deepEqual(approvedCanonical.missing_invalid_metadata, []);
  assert.deepEqual(approvedCanonical.suggestion, {
    knowledge_domain: "coding",
    knowledge_topics: ["electron", "react"],
  });
  assert.deepEqual(approvedLegacy.missing_invalid_metadata, []);
  assert.deepEqual(approvedLegacy.suggestion, {
    knowledge_domain: "coding",
    knowledge_topics: ["electron", "react"],
  });

  const unsupported = report.entries.find((entry) => entry.current_type === "people" || entry.current_type === "project");
  assert.ok(unsupported);
  assert.equal(unsupported.manual_review, true);
  assert.match(JSON.stringify(unsupported), /unsupported/);

  const invalid = report.entries.find((entry) => entry.path.endsWith("bad-topics.md"));
  assert.ok(invalid);
  assert.equal(invalid.manual_review, true);
  assert.ok(invalid.missing_invalid_metadata.some((item) => item.field === "knowledge_domain"));
  assert.ok(invalid.missing_invalid_metadata.some((item) => item.field === "knowledge_topics"));

  const dryRun = audit.auditPaths([tmpRoot]);
  assertAuditOutputShape(dryRun);
  assert.ok(dryRun.skipped.some((item) => /excluded-by-default:daily/.test(item.reason)));
  assert.ok(dryRun.skipped.some((item) => /excluded-by-default:pre/.test(item.reason)));
  assert.equal(dryRun.entries.some((entry) => /DAILY|PRE/.test(entry.path)), false);

  const textOne = audit.renderText(report);
  const textTwo = audit.renderText(report);
  const jsonOne = audit.renderJson(report);
  const jsonTwo = audit.renderJson(report);
  assert.equal(textOne, textTwo);
  assert.equal(jsonOne, jsonTwo);
  assert.deepEqual(JSON.parse(jsonOne), report);

  for (const [filePath, before] of beforeHashes.entries()) {
    assert.equal(hashFile(filePath), before);
  }

  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/SCRIPTS/knowledge-explorer-audit.js"), "utf8");
  assert.doesNotMatch(source, /vault\.modify/);
  assert.doesNotMatch(source, /fs\.write/);
  assert.doesNotMatch(source, /\bmigrate\b/i);
  assert.doesNotMatch(source, /\bapply\b/i);
  assert.doesNotMatch(source, /read-only.*write/i);

  console.log("Knowledge audit tests passed");
}

main();
