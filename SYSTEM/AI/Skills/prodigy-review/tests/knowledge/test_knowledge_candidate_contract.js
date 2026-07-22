"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CANDIDATE_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Knowledge_Candidate_Schema.md";
const EXPLORER_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md";
const CORE_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Core_Property_Schema.md";
const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_knowledge_candidate.md";
const DISPLAY_PATH = "SYSTEM/Views/display-registry.js";
const explorerRegistry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const explorerCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));
const readingCore = require(path.join(ROOT, "SYSTEM/Views/reading-core.js"));
const readingStore = require(path.join(ROOT, "SYSTEM/Views/reading-store.js"));

const REQUIRED_KEYS = Object.freeze([
  "type", "candidate_id", "status", "title", "statement", "reason", "source_type",
  "source_evidence_ids", "source_objects", "source_note", "application_trigger", "application_contexts",
  "confidence", "suggested_domain", "suggested_topics",
  "approval_note", "promotion_target", "promoted_knowledge", "created", "updated",
]);
const STATUS_VALUES = Object.freeze(["proposed", "saved", "approved", "rejected"]);
const SOURCE_TYPES = Object.freeze(["daily_evidence", "reading_session", "manual_study", "study_material"]);
const CONFIDENCE_VALUES = Object.freeze(["explicit", "inferred", "low"]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function frontmatter(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, "Candidate template must start with YAML frontmatter");
  return match[1];
}

function frontmatterKeys(document) {
  return frontmatter(document)
    .split("\n")
    .filter((line) => /^[a-z][a-z0-9_]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
}

function loadDisplayRegistry() {
  const sandbox = { window: {} };
  vm.runInNewContext(read(DISPLAY_PATH), sandbox, { filename: DISPLAY_PATH });
  return sandbox.window.prodigyDisplay;
}

function assertCandidateShape(candidate) {
  for (const key of REQUIRED_KEYS) assert.ok(Object.hasOwn(candidate, key), `missing ${key}`);
  assert.equal(candidate.type, "knowledge_candidate");
  assert.match(candidate.candidate_id, /\S/);
  assert.ok(STATUS_VALUES.includes(candidate.status), "invalid status");
  assert.ok(SOURCE_TYPES.includes(candidate.source_type), "invalid source_type");
  assert.ok(CONFIDENCE_VALUES.includes(candidate.confidence), "invalid confidence");
  assert.ok(Array.isArray(candidate.source_evidence_ids), "source_evidence_ids must be a YAML list");
  assert.ok(Array.isArray(candidate.source_objects), "source_objects must be a YAML list");
  assert.ok(Array.isArray(candidate.application_contexts), "application_contexts must be a YAML list");
  assert.ok(Array.isArray(candidate.suggested_topics), "suggested_topics must be a YAML list");
}

function testCandidateSchemaAndTransitions() {
  const schema = read(CANDIDATE_SCHEMA_PATH);
  const core = read(CORE_SCHEMA_PATH);

  assert.match(core, /`knowledge_candidate`/);
  for (const key of REQUIRED_KEYS) assert.match(schema, new RegExp("`" + key + "`"));
  assert.match(schema, /`source_type`[^\n]*`daily_evidence`\s*\\\|\s*`reading_session`\s*\\\|\s*`manual_study`\s*\\\|\s*`study_material`/);
  assert.match(schema, /\|\s*`proposed`\s*\|\s*`saved`\s*\\\|\s*`rejected`\s*\|/);
  assert.match(schema, /\|\s*`saved`\s*\|\s*`approved`\s*\\\|\s*`rejected`\s*\|/);
  assert.match(schema, /`approved`[^\n]*terminal|terminal[^\n]*`approved`/i);
  assert.match(schema, /`rejected`[^\n]*terminal|terminal[^\n]*`rejected`/i);
  assert.match(schema, /PARA\/RESOURCES\/Knowledge\/Candidates\//);
  assert.match(schema, /PARA\/RESOURCES\/Reading\/Candidates\//);
  assert.match(schema, /ZETA\/FLEETING\/Knowledge Candidates/);
  assert.match(schema, /Daily[^\n]*status:\s*saved/);
  assert.match(schema, /Reading[^\n]*status:\s*proposed/);
  assert.doesNotMatch(schema, /type:\s*resource\b/);
}

function testTemplateAndKoreanDisplay() {
  const template = read(TEMPLATE_PATH);
  const display = loadDisplayRegistry();

  assert.deepEqual(frontmatterKeys(template), REQUIRED_KEYS);
  assert.match(frontmatter(template), /^type:\s*knowledge_candidate$/m);
  assert.match(frontmatter(template), /^status:\s*saved$/m);
  assert.match(frontmatter(template), /^source_evidence_ids:\s*\[\]$/m);
  assert.match(frontmatter(template), /^source_objects:\s*\[\]$/m);
  assert.match(frontmatter(template), /^source_note:\s*$/m);
  assert.match(frontmatter(template), /^application_trigger:\s*$/m);
  assert.match(frontmatter(template), /^application_contexts:\s*\[\]$/m);
  assert.match(frontmatter(template), /^suggested_topics:\s*\[\]$/m);
  assert.equal(display.type("knowledge_candidate"), "지식 후보");
  assert.equal(display.status("proposed"), "제안");
  assert.equal(display.status("saved"), "보관");
  assert.equal(display.status("approved"), "승인");
  assert.equal(display.status("rejected"), "반려");
  assert.equal(display.knowledgeSourceType("manual_study"), "직접 학습");
  assert.equal(display.knowledgeSourceType("study_material"), "학습 자료");
  for (const key of REQUIRED_KEYS) assert.match(display.property(key), /[가-힣]/);
}

function testExplorerBoundaryAndFailureFixtures() {
  const explorerSchema = read(EXPLORER_SCHEMA_PATH);
  const valid = {
    type: "knowledge_candidate", candidate_id: "candidate-1", status: "saved", title: "후보",
    statement: "근거 있는 문장", reason: "이유", source_type: "daily_evidence",
    source_evidence_ids: ["daily-2026-07-20-e01"], source_objects: ["[[2026-07-20]]"],
    source_note: "", application_trigger: "", application_contexts: [], confidence: "explicit",
    suggested_domain: "reading", suggested_topics: [], approval_note: "",
    promotion_target: "", promoted_knowledge: "", created: "2026-07-20T12:00:00+09:00",
    updated: "2026-07-20T12:00:00+09:00",
  };
  const manualStudy = {
    ...valid,
    source_type: "manual_study",
    source_evidence_ids: [],
    source_objects: [],
    source_note: "직접 학습한 강의 노트",
    application_trigger: "다음 설계 검토",
    application_contexts: ["reading"],
  };
  const studyMaterial = {
    ...valid,
    source_type: "study_material",
    source_evidence_ids: [],
    source_objects: ["[[자료 노트]]"],
    source_note: "자료에서 정리",
    application_contexts: ["reading/topic"],
  };

  assert.match(explorerSchema, /knowledge_candidate[^\n]*excluded|excluded[^\n]*knowledge_candidate/i);
  assert.match(explorerSchema, /검증 대기|separate[ -]inbox/i);
  assert.doesNotMatch(explorerSchema, /^global_domain:/m);
  assert.doesNotMatch(explorerSchema, /^\s*resource\s*:/m);
  assertCandidateShape(valid);
  assertCandidateShape(manualStudy);
  assertCandidateShape(studyMaterial);
  assert.throws(() => assertCandidateShape({ ...valid, status: "active" }));
  assert.throws(() => assertCandidateShape({ ...valid, source_evidence_ids: "daily-2026-07-20-e01" }));
  assert.throws(() => assertCandidateShape({ ...manualStudy, source_type: "unknown_source" }));
  const { source_note: _missingSourceNote, ...missingSourceNote } = manualStudy;
  assert.throws(() => assertCandidateShape(missingSourceNote));
  const { application_trigger: _missingApplicationTrigger, ...missingApplicationTrigger } = manualStudy;
  assert.throws(() => assertCandidateShape(missingApplicationTrigger));
  const { application_contexts: _missingApplicationContexts, ...missingApplicationContexts } = manualStudy;
  assert.throws(() => assertCandidateShape(missingApplicationContexts));
  const { candidate_id: _missing, ...missingId } = valid;
  assert.throws(() => assertCandidateShape(missingId));
}

function testExplorerRuntimeExcludesCandidateFromValidatedCounts() {
  // Given: one canonical Knowledge record and one saved Candidate record.
  const sources = Object.freeze([
    Object.freeze({
      source_path: "SYNTHETIC/knowledge/canonical.md", source_mtime: 2,
      frontmatter: Object.freeze({ type: "knowledge", title: "검증된 지식", knowledge_domain: "coding", knowledge_topics: ["ai"] }),
    }),
    Object.freeze({
      source_path: "SYNTHETIC/knowledge/candidate.md", source_mtime: 3,
      frontmatter: Object.freeze({ type: "knowledge_candidate", status: "saved", title: "검증 대기", suggested_domain: "coding", suggested_topics: ["ai"] }),
    }),
  ]);

  // When: the real Explorer projection builds its validated Knowledge totals.
  const model = explorerCore.projectKnowledgeExplorer(sources, explorerRegistry);

  // Then: Candidate never appears as an asset or inflates validated Knowledge counts.
  assert.equal(model.totals.knowledge, 1);
  assert.equal(model.assets.some((asset) => asset.type === "knowledge_candidate"), false);
  assert.equal(model.domains.find((domain) => domain.key === "coding").count, 1);
}

async function testReadingRuntimeKeepsLegacyProposedCandidateReadable() {
  // Given: a minimal legacy Reading candidate without Daily-specific Candidate fields.
  const legacyPath = "ZETA/FLEETING/Knowledge Candidates/legacy-proposed.md";
  const legacyDocument = "---\ntype: knowledge_candidate\ncandidate_id: legacy-1\nstatus: proposed\ntitle: Legacy\nstatement: Existing Reading proposal\nsource_type: reading_session\ncreated: 2026-07-20\n---\n";
  const legacyName = "legacy-proposed.md";
  const legacyFile = { path: legacyPath, name: legacyName, basename: "legacy-proposed", extension: "md" };
  const app = {
    vault: {
      getAbstractFileByPath(value) {
        if (value === legacyPath) return legacyFile;
        if (value === "ZETA/FLEETING/Knowledge Candidates") return { path: value, children: [legacyFile] };
        return null;
      },
      async read(file) { return file.path === legacyPath ? legacyDocument : ""; },
      async createFolder() {},
    },
  };

  // When: the real Reading store requests active candidates.
  const candidates = await readingStore.listCandidates(app, { status: "active" });

  // Then: the legacy proposed candidate remains visible without migration or mutation.
  assert.deepEqual(candidates.map((candidate) => ({ path: candidate.path, status: candidate.status, source_type: candidate.source_type })), [{
    path: legacyPath, status: "proposed", source_type: "reading_session",
  }]);
  assert.equal(await app.vault.read({ path: legacyPath }), legacyDocument);
  assert.equal(readingCore.parseSimpleFrontmatter(legacyDocument).status, "proposed");
}

async function main() {
  testCandidateSchemaAndTransitions();
  testTemplateAndKoreanDisplay();
  testExplorerBoundaryAndFailureFixtures();
  testExplorerRuntimeExcludesCandidateFromValidatedCounts();
  await testReadingRuntimeKeepsLegacyProposedCandidateReadable();
  console.log("Knowledge Candidate contract tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
