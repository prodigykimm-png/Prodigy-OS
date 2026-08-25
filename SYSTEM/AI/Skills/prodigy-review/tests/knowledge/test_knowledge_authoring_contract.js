"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const CORE_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Core_Property_Schema.md";
const CANDIDATE_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Knowledge_Candidate_Schema.md";
const EXPLORER_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md";
const LITERATURE_SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Literature_Source_Schema.md";
const CANDIDATE_TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_knowledge_candidate.md";
const KNOWLEDGE_TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_knowledge.md";
const LITERATURE_TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_literature_note.md";
const DISPLAY_PATH = "SYSTEM/Views/display-registry.js";

const LEGACY_CANDIDATE_SOURCE_TYPES = Object.freeze(["daily_evidence", "reading_session"]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function loadDisplayRegistry() {
  const sandbox = { window: {} };
  vm.runInNewContext(read(DISPLAY_PATH), sandbox, { filename: DISPLAY_PATH });
  return sandbox.window.prodigyDisplay;
}

function frontmatter(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, "template must start with YAML frontmatter");
  return match[1];
}

function frontmatterKeys(document) {
  return frontmatter(document)
    .split("\n")
    .filter((line) => /^[a-z][a-z0-9_]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
}

function storedPropertyKeys(schema) {
  const section = schema.match(/## 저장 Property\n\n([\s\S]*?)(?=\n## |$)/);
  assert.ok(section, "schema must have a 저장 Property table");
  return Object.freeze([...section[1].matchAll(/^\| `([a-z][a-z0-9_]*)` \|/gm)].map((match) => match[1]));
}

function enumValues(schema, property) {
  const row = schema.match(new RegExp("^\\| `" + property + "` \\| ([^\\n]+)$", "m"));
  assert.ok(row, `schema is missing ${property} enum row`);
  return Object.freeze([...row[1].matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1]));
}

function recoveryRule(schema, rule) {
  const row = schema.match(new RegExp("^\\| `" + rule + "` \\| ([^|]+)\\| `([^`]+)` \\|$", "m"));
  assert.ok(row, `schema is missing ${rule} validation/recovery rule`);
  return Object.freeze({ constraint: row[1].trim(), message: row[2] });
}

function explorerRegistry(schema) {
  const registry = schema.match(/domains:\n((?:  [a-z][a-z0-9_]*: \[[^\n]*\]\n?)+)/);
  assert.ok(registry, "Knowledge Explorer schema must expose its approved registry");
  return Object.freeze(Object.fromEntries([...registry[1].matchAll(/^  ([a-z][a-z0-9_]*): \[([^\]]*)\]$/gm)]
    .map((match) => [match[1], Object.freeze(match[2] ? match[2].split(", ") : [])])));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function authoringContract() {
  const literatureSchema = read(LITERATURE_SCHEMA_PATH);
  const candidateSchema = read(CANDIDATE_SCHEMA_PATH);
  const explorerSchema = read(EXPLORER_SCHEMA_PATH);
  const sourceUrlRule = recoveryRule(literatureSchema, "source_url");
  const literaturePath = literatureSchema.match(/canonical 신규 저장 경로는 `([^`]+)`/);
  assert.ok(literaturePath, "Literature Source schema must publish its canonical path");
  const sourceUrlProtocols = Object.freeze([...sourceUrlRule.constraint.matchAll(/`(https?:)`/g)].map((match) => match[1]));
  assert.match(sourceUrlRule.constraint, /URL parser/);
  assert.deepEqual(sourceUrlProtocols.length, 2, "source_url rule must publish both HTTP(S) protocols");
  return Object.freeze({
    literatureKeys: new Set([...storedPropertyKeys(literatureSchema), "tags"]),
    sourceKinds: enumValues(literatureSchema, "source_kind"),
    sourceUrlProtocols,
    candidateKeys: new Set(storedPropertyKeys(candidateSchema)),
    candidateSourceTypes: enumValues(candidateSchema, "source_type"),
    literaturePath: literaturePath[1],
    registry: explorerRegistry(explorerSchema),
    recovery: Object.freeze({
      unknownProperty: recoveryRule(literatureSchema, "allowed_properties").message,
      sourceKind: recoveryRule(literatureSchema, "source_kind").message,
      sourceUrl: sourceUrlRule.message,
      knowledgeTopics: recoveryRule(literatureSchema, "knowledge_topics").message,
      candidateUnknownProperty: recoveryRule(candidateSchema, "allowed_properties").message,
      candidateSourceType: recoveryRule(candidateSchema, "source_type").message,
      sourceNote: recoveryRule(candidateSchema, "source_note").message,
      sourceObjects: recoveryRule(candidateSchema, "source_objects").message,
      applicationContexts: recoveryRule(candidateSchema, "application_contexts").message,
    }),
  });
}

function isCanonicalLiteratureWikilink(value, literaturePath) {
  const emptyWikilink = "[[" + literaturePath + "]]";
  return typeof value === "string"
    && value.startsWith("[[" + literaturePath)
    && value.endsWith("]]")
    && value.length > emptyWikilink.length;
}

function isContractHttpUrl(value, protocols) {
  try {
    return typeof value === "string" && protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function testLegacyLiteratureCharacterization() {
  // Characterization: existing Literature notes remain a readable, Korean-labelled Resource.
  const template = read(LITERATURE_TEMPLATE_PATH);
  const display = loadDisplayRegistry();

  assert.match(template, /^schema_version:\s*2$/m);
  assert.match(template, /^type:\s*literature_note$/m);
  assert.doesNotMatch(template, /^reference:/m);
  assert.equal(display.type("literature_note"), "문헌");
}

function testNewAuthoringContract() {
  const core = read(CORE_SCHEMA_PATH);
  const candidateSchema = read(CANDIDATE_SCHEMA_PATH);
  const explorerSchema = read(EXPLORER_SCHEMA_PATH);
  const literatureSchema = read(LITERATURE_SCHEMA_PATH);
  const candidateTemplate = read(CANDIDATE_TEMPLATE_PATH);
  const knowledgeTemplate = read(KNOWLEDGE_TEMPLATE_PATH);
  const literatureTemplate = read(LITERATURE_TEMPLATE_PATH);
  const display = loadDisplayRegistry();
  const literatureKeys = storedPropertyKeys(literatureSchema);
  const sourceKinds = enumValues(literatureSchema, "source_kind");
  const summaryOrigins = enumValues(literatureSchema, "summary_origin");
  const literatureTemplateKeys = Object.freeze([
    "schema_version", "type", "status", "source_kind", "summary_origin", "created", "updated", "tags",
  ]);

  assert.match(literatureSchema, /canonical 신규 저장 경로는 `ZETA\/LITERATURE\/`/);
  assert.match(literatureSchema, /기존 Literature[\s\S]*read-compatible|read-compatible[\s\S]*기존 Literature/i);
  assert.match(literatureSchema, /기존 Literature[\s\S]*migration[\s\S]*금지|migration[\s\S]*기존 Literature/i);
  assert.match(literatureSchema, /원문 전문[\s\S]*(?:저장하거나 복사하지 않는다|넣지 않는다)|전문[\s\S]*저장하지 않는다/);
  assert.match(literatureSchema, /`유효하지 않은 자료 유형입니다\. 다시 선택해 주세요\.`/);
  assert.match(literatureSchema, /`지원하지 않는 속성입니다\. 저장하지 않았습니다\.`/);
  assert.match(literatureSchema, /prompt-injection[\s\S]*자료 데이터/);
  for (const key of literatureKeys) assert.match(literatureSchema, new RegExp("`" + key + "`"));
  for (const value of sourceKinds) assert.match(literatureSchema, new RegExp("`" + value + "`"));
  for (const value of summaryOrigins) assert.match(literatureSchema, new RegExp("`" + value + "`"));

  const candidateKeys = storedPropertyKeys(candidateSchema);
  const candidateSourceTypes = enumValues(candidateSchema, "source_type");
  const knowledgeApplicationKeys = [];
  assert.deepEqual(frontmatterKeys(candidateTemplate), ["schema_version", "type", "status", "created", "updated"]);
  for (const value of candidateSourceTypes) assert.match(display.knowledgeSourceType(value), /[가-힣]/,
    `missing Korean source-type label: ${value}`);
  for (const value of LEGACY_CANDIDATE_SOURCE_TYPES) {
    assert.ok(candidateSourceTypes.includes(value), `legacy Candidate source type must remain supported: ${value}`);
    assert.match(candidateSchema, new RegExp("`" + value + "`[\\s\\S]*(?:읽기|지원)"));
  }
  for (const key of knowledgeApplicationKeys) {
    assert.match(core, new RegExp("`" + key + "`"));
    assert.match(explorerSchema, new RegExp("`" + key + "`"));
    assert.ok(frontmatterKeys(knowledgeTemplate).includes(key), `Knowledge template is missing ${key}`);
  }
  assert.match(frontmatter(knowledgeTemplate), /^schema_version:\s*2\s*$/m);
  assert.doesNotMatch(frontmatter(knowledgeTemplate), /^knowledge_topics:/m);
  assert.match(explorerSchema, /승격[\s\S]*application_trigger[\s\S]*application_contexts|application_trigger[\s\S]*application_contexts[\s\S]*승격/);
  assert.match(explorerSchema, /knowledge_candidate[\s\S]*(?:count|카운트)[\s\S]*(?:제외|포함하지 않)|(?:count|카운트)[\s\S]*(?:제외|포함하지 않)[\s\S]*knowledge_candidate/i);

  assert.deepEqual(frontmatterKeys(candidateTemplate), ["schema_version", "type", "status", "created", "updated"]);
  assert.deepEqual(frontmatterKeys(literatureTemplate), literatureTemplateKeys);
  assert.match(frontmatter(literatureTemplate), /^schema_version:\s*2$/m);
  assert.match(frontmatter(literatureTemplate), /^type:\s*literature_note$/m);
  assert.match(frontmatter(literatureTemplate), /^status:\s*active$/m);
  assert.match(frontmatter(literatureTemplate), /^source_kind:\s*article$/m);
  assert.match(frontmatter(literatureTemplate), /^summary_origin:\s*manual$/m);
  for (const document of [candidateTemplate, knowledgeTemplate, literatureTemplate]) {
    assert.equal(/^[^\n:]*[가-힣][^\n:]*:/m.test(frontmatter(document)), false, "storage keys must remain English snake_case");
  }
  for (const heading of ["출처 주장", "내 해석", "재사용 가능한 지식"]) {
    assert.match(literatureTemplate, new RegExp("^## " + heading + "$", "m"));
  }
  assert.match(literatureTemplate, /원문 전문을 저장하거나 복사하지 않습니다/);

  for (const key of [...literatureKeys, ...candidateKeys, ...knowledgeApplicationKeys]) {
    assert.match(display.property(key), /[가-힣]/, `missing Korean property label: ${key}`);
  }
  assert.equal(display.type("literature_note"), "문헌");
  assert.equal(display.status("active"), "활성");
  for (const value of sourceKinds) assert.match(display.knowledgeSourceKind(value), /[가-힣]/);
  for (const value of summaryOrigins) assert.match(display.summaryOrigin(value), /[가-힣]/);
  const contract = authoringContract();
  for (const domain of Object.keys(contract.registry)) {
    assert.match(display.knowledgeDomain(domain), /[가-힣]/, `missing Korean Domain label: ${domain}`);
    assert.notEqual(display.knowledgeDomain(domain), "미분류", `unregistered Domain label: ${domain}`);
    for (const topic of contract.registry[domain]) {
      assert.match(display.knowledgeTopic(topic), /[가-힣]/, `missing Korean Topic label: ${topic}`);
      assert.notEqual(display.knowledgeTopic(topic), "미분류", `unregistered Topic label: ${topic}`);
    }
  }
}

// Static-contract guarantees only: Todo 2 owns runtime persistence enforcement and writes.
function validateAuthoringContractFixture(input, contract) {
  const { literature, candidate } = input;
  const unknownKey = Object.keys(literature).find((key) => !contract.literatureKeys.has(key));
  if (unknownKey) return Object.freeze({ ok: false, field: unknownKey, message: contract.recovery.unknownProperty });
  if (!contract.sourceKinds.includes(literature.source_kind)) {
    return Object.freeze({ ok: false, field: "source_kind", message: contract.recovery.sourceKind });
  }
  if (literature.source_url && !isContractHttpUrl(literature.source_url, contract.sourceUrlProtocols)) {
    return Object.freeze({ ok: false, field: "source_url", message: contract.recovery.sourceUrl });
  }
  const domainTopics = contract.registry[literature.knowledge_domain];
  if (!Array.isArray(literature.knowledge_topics)
    || !domainTopics
    || literature.knowledge_topics.some((topic) => !domainTopics.includes(topic))) {
    return Object.freeze({ ok: false, field: "knowledge_topics", message: contract.recovery.knowledgeTopics });
  }
  const candidateUnknownKey = Object.keys(candidate).find((key) => !contract.candidateKeys.has(key));
  if (candidateUnknownKey) return Object.freeze({ ok: false, field: candidateUnknownKey, message: contract.recovery.candidateUnknownProperty });
  if (!contract.candidateSourceTypes.includes(candidate.source_type)) {
    return Object.freeze({ ok: false, field: "source_type", message: contract.recovery.candidateSourceType });
  }
  if (candidate.source_type === "manual_study" && (typeof candidate.source_note !== "string" || !candidate.source_note.trim())) {
    return Object.freeze({ ok: false, field: "source_note", message: contract.recovery.sourceNote });
  }
  if (candidate.source_type === "study_material"
    && (!Array.isArray(candidate.source_objects)
      || candidate.source_objects.length !== 1
      || !isCanonicalLiteratureWikilink(candidate.source_objects[0], contract.literaturePath))) {
    return Object.freeze({ ok: false, field: "source_objects", message: contract.recovery.sourceObjects });
  }
  if (!Array.isArray(candidate.application_contexts)
    || candidate.application_contexts.some((context) => {
      if (typeof context !== "string") return true;
      const segments = context.split("/");
      const [domain, topic] = segments;
      return segments.length > 2 || !contract.registry[domain]
        || (segments.length === 2 && (!topic || !contract.registry[domain].includes(topic)));
    })) {
    return Object.freeze({ ok: false, field: "application_contexts", message: contract.recovery.applicationContexts });
  }
  return Object.freeze({ ok: true });
}

module.exports = Object.freeze({ authoringContract, deepFreeze, validateAuthoringContractFixture });

if (require.main === module) {
  testLegacyLiteratureCharacterization();
  testNewAuthoringContract();
  console.log("Knowledge authoring contract tests passed");
}
