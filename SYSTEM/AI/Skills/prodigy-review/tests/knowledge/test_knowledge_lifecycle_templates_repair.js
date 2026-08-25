"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const sourceStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-source-store.js"));
const candidateStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));
const canonical = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-packet.js"));
const operationContract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
const kindContract = require(path.join(ROOT, "SYSTEM/Views/llmwiki-knowledge-kind-contract.js"));

function hash(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function lifecycleCanonical(overrides = {}) {
  return {
    schema_version: 2, canonical_id: "canonical-repair-alpha", knowledge_kind: "principle", status: "active",
    title: "정식 경계", statement: "승인된 메타데이터만 정식 지식으로 보존한다.",
    knowledge_domain: "coding", knowledge_topics: ["ai"], application_trigger: "승인 전", application_contexts: ["coding/ai"],
    connections: [], invalidation_conditions: [], sources: [{ source_id: "source-repair-alpha", span: { start: 0, end: 12 } }],
    relations: [{ relation_id: "relation-repair-alpha", target_id: "canonical-repair-beta", type: "supports" }],
    claim_set_hash: "a".repeat(64), promotion_receipt_hash: "b".repeat(64), ai_enrichment_status: "accepted",
    created: "2026-08-25T00:00:00.000Z", updated: "2026-08-25T00:00:00.000Z", body: "# 정식 경계\n",
    ...overrides,
  };
}

function makeVault(seed = {}) {
  const files = new Map(Object.entries(seed));
  const writes = [];
  const file = (entryPath) => ({ path: entryPath, extension: "md", basename: path.posix.basename(entryPath, ".md") });
  return { writes, files, app: { vault: {
    getAbstractFileByPath(entryPath) {
      if (files.has(entryPath)) return file(entryPath);
      const children = [...files.keys()].filter((item) => item.startsWith(`${entryPath}/`) && !item.slice(entryPath.length + 1).includes("/")).map(file);
      return children.length ? { path: entryPath, children } : null;
    },
    async read(entry) { return files.get(entry.path); },
    async createFolder() {},
    async create(entryPath, content) { files.set(entryPath, content); writes.push({ kind: "create", path: entryPath }); return file(entryPath); },
    async modify(entry, content) { files.set(entry.path, content); writes.push({ kind: "modify", path: entry.path }); },
  } } };
}

function v2CandidateBytes() {
  return candidateStore.renderLifecycleCandidateDocument({
    schema_version: 2, candidate_id: "candidate-repair-alpha", status: "needs_more_evidence", title: "후보 경계",
    statement: "공백을 기록한다.", sources: [{ source_id: "source-repair-alpha", span: { start: 0, end: 12 } }],
    relations: [{ relation_id: "relation-repair-alpha", target_id: "canonical-repair-alpha", type: "supports" }],
    promotion_gaps: [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing_relation", evidence_refs: ["source-repair-alpha"] }],
    created: "2026-08-25T00:00:00.000Z", updated: "2026-08-25T00:00:00.000Z", body: "# 후보 경계\n",
  });
}

function testLiteratureMultilineRoundTripAndDeterministicProjection() {
  const interpretation = "첫 줄: 한글\n---\ntype: not_frontmatter\n둘째 줄";
  const first = sourceStore.renderLifecycleSourceDocument({
    schema_version: 2, source_id: "source-repair-alpha", source_kind: "article", source_url: "https://example.com/repair",
    source_title: "문헌 경계", my_interpretation: interpretation, knowledge_domain: "coding", knowledge_topics: ["ai"],
    sources: [{ source_id: "source-repair-alpha", locator: { end: 12, start: 0 } }],
    relations: [{ relation_id: "relation-repair-alpha", target_id: "canonical-repair-alpha", type: "supports" }],
    created: "2026-08-25T00:00:00.000Z", updated: "2026-08-25T00:00:00.000Z",
  });
  const parsed = sourceStore.parseLifecycleDocument(first);
  assert.equal(parsed.my_interpretation, interpretation);
  assert.equal(sourceStore.renderLifecycleSourceDocument(parsed), first);

  const base = lifecycleCanonical();
  const reordered = { updated: base.updated, body: base.body, relations: base.relations, ...base };
  assert.equal(candidateStore.renderCanonicalDocument(reordered), candidateStore.renderCanonicalDocument(base));
}

function testStructuredBoundaryRejectsUnsafeValues() {
  const base = lifecycleCanonical();
  for (const invalid of [
    [{ source_id: "source-repair-alpha", raw_source: "full source" }],
    [{ source_id: "source-repair-alpha", span: { start: -1, end: 1 } }],
    [{ source_id: "source-repair-alpha", span: { start: 0, end: 2 }, raw_source: "x".repeat(70000) }],
  ]) {
    assert.throws(() => candidateStore.renderCanonicalDocument({ ...base, sources: invalid }), /structured_source|unknown_structured|structured_value/);
  }
  assert.throws(() => candidateStore.renderCanonicalDocument({ ...base, relations: [{ relation_id: "relation-repair-alpha", target_id: "canonical-repair-beta", type: "supports", raw_source: "x" }] }), /structured_relation|unknown_structured/);
}

async function testCandidateRuntimeVersionBoundaryAndMutationGuard() {
  const legacyPath = "PARA/RESOURCES/Knowledge/Candidates/legacy.md";
  const unknownPath = "PARA/RESOURCES/Knowledge/Candidates/unknown.md";
  const fixture = makeVault({
    [legacyPath]: "---\ntype: knowledge_candidate\ncandidate_id: legacy-repair-alpha\nstatus: saved\ntitle: Legacy\nstatement: Legacy statement\nreason: Legacy reason\nsource_type: daily_evidence\nsource_evidence_ids: [\"evidence-alpha\"]\nsource_objects: []\nconfidence: explicit\nsuggested_domain: reading\nsuggested_topics: []\ncreated: 2026-08-25\nupdated: 2026-08-25\n---\n# Legacy\n",
    [unknownPath]: "---\nschema_version: 99\ntype: knowledge_candidate\ncandidate_id: candidate-unknown-alpha\n---\n# Unknown\n",
  });
  const legacy = await candidateStore.readCandidate(fixture.app, legacyPath);
  assert.equal(legacy.legacy_read_only, true);
  await assert.rejects(candidateStore.rejectCandidate(fixture.app, legacyPath), /legacy_read_only/);
  assert.equal(fixture.writes.length, 0);
  await assert.rejects(candidateStore.readCandidate(fixture.app, unknownPath), (error) => error && error.code === "unknown_schema_version");

  const v2Path = "PARA/RESOURCES/Knowledge/Candidates/v2.md";
  fixture.files.set(v2Path, v2CandidateBytes());
  const v2 = await candidateStore.readCandidate(fixture.app, v2Path);
  assert.equal(v2.legacy_read_only, false);
  assert.deepEqual(v2.sources, [{ source_id: "source-repair-alpha", span: { end: 12, start: 0 } }]);
}

async function testCanonicalPacketAndKindContractAcceptV2OnlyThroughExistingAuthority() {
  const document = lifecycleCanonical();
  const operation = operationContract.parseCanonicalOperation(JSON.stringify({
    operation_id: "operation_repair_alpha", proposal_id: "proposal_repair_alpha", proposal_kind: "create", payload_hash: hash(stable(document)),
  }));
  assert.equal(operation.ok, true);
  const adapter = { async readBytes() { return null; } };
  const result = await canonical.assembleCanonicalPacket({
    run_id: "run_repair_alpha", consent_hash: "c".repeat(64), operation: operation.value, canonical_document: document,
    source_citations: [{ source_id: "source-repair-alpha", content_hash: "a".repeat(64), source_url: "https://example.com/repair", locators: ["ZETA/LITERATURE/repair.md#claim"] }],
    expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_repair_alpha_0001",
  }, adapter);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(canonical.verifyCanonicalPacket(result.value).ok, true);
  const proposal = kindContract.parseProposal(document);
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  assert.equal(kindContract.serializeProposal(proposal), result.value.after_bytes);
}

async function testV1CandidateDispatchAndEveryMutationGuard() {
  const schemaLessPath = "PARA/RESOURCES/Knowledge/Candidates/schema-less.md";
  const v1Path = "PARA/RESOURCES/Knowledge/Candidates/v1.md";
  const base = "type: knowledge_candidate\ncandidate_id: candidate-legacy-alpha\nstatus: saved\ntitle: Legacy\nstatement: Legacy statement\nreason: Legacy reason\nsource_type: daily_evidence\nsource_evidence_ids: [\"evidence-alpha\"]\nsource_objects: []\nconfidence: explicit\nsuggested_domain: reading\nsuggested_topics: []\ncreated: 2026-08-25\nupdated: 2026-08-25";
  const schemaLess = `---\n${base}\n---\n# Legacy\n`;
  const v1 = `---\nschema_version: 1\n${base}\n---\n# Legacy\n`;
  const fixture = makeVault({ [schemaLessPath]: schemaLess, [v1Path]: v1 });
  for (const [candidatePath, original] of [[schemaLessPath, schemaLess], [v1Path, v1]]) {
    const read = await candidateStore.readCandidate(fixture.app, candidatePath);
    assert.equal(read.legacy_read_only, true);
    for (const action of [
      () => candidateStore.rejectCandidate(fixture.app, candidatePath),
      () => candidateStore.deferCandidate(fixture.app, candidatePath),
      () => candidateStore.resumeCandidate(fixture.app, candidatePath),
      () => candidateStore.approveCandidate(fixture.app, candidatePath, { title: "정식", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] }),
    ]) await assert.rejects(action(), /legacy_read_only/);
    assert.equal(fixture.files.get(candidatePath), original);
  }
  assert.equal(fixture.writes.length, 0);
}

async function testPromotionGapSyntaxBoundaryAndMaliciousVaultBytes() {
  const valid = {
    schema_version: 2, candidate_id: "candidate-gap-alpha", status: "needs_more_evidence", title: "공백 경계", statement: "공백을 기록한다.",
    promotion_gaps: [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing_relation", evidence_refs: ["source-repair-alpha"] }],
    blocking_content_gaps: [{ gate_id: "content", phase: "content", state: "pending", reason_code: "missing_content", evidence_refs: [] }],
    created: "2026-08-25T00:00:00.000Z", updated: "2026-08-25T00:00:00.000Z", body: "# 공백 경계\n",
  };
  const bytes = candidateStore.renderLifecycleCandidateDocument(valid);
  assert.equal(candidateStore.renderLifecycleCandidateDocument(candidateStore.parseLifecycleDocument(bytes)), bytes);
  for (const gaps of [
    [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing", evidence_refs: [], raw_source: "full source" }],
    [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing", evidence_refs: [] }, { gate_id: "relation", phase: "content", state: "fail", reason_code: "other", evidence_refs: [] }],
    [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing", evidence_refs: [{ raw: "nested" }] }],
    [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "x".repeat(1025), evidence_refs: [] }],
    [{ gate_id: "relation", phase: "relation", state: "fail", reason_code: "missing", evidence_refs: ["x".repeat(33000)] }],
    Array.from({ length: 65 }, (_, index) => ({ gate_id: `gate-${index}`, phase: "relation", state: "fail", reason_code: "missing", evidence_refs: [] })),
  ]) assert.throws(() => candidateStore.renderLifecycleCandidateDocument({ ...valid, promotion_gaps: gaps }), /promotion_gap|structured_value_too_large|duplicate_stable_id/);

  const malicious = bytes.replace(/promotion_gaps: .*$/m, "promotion_gaps: [{\"gate_id\":\"relation\",\"phase\":\"relation\",\"state\":\"fail\",\"reason_code\":\"missing\",\"evidence_refs\":[],\"raw_source\":\"full source\"}]");
  const candidatePath = "ZETA/CANDIDATES/malicious.md";
  const fixture = makeVault({ [candidatePath]: malicious });
  await assert.rejects(candidateStore.readCandidate(fixture.app, candidatePath), /unknown_promotion_gap_field/);
  await assert.rejects(candidateStore.rejectCandidate(fixture.app, candidatePath), /unknown_promotion_gap_field/);
  assert.equal(fixture.files.get(candidatePath), malicious);
  assert.equal(fixture.writes.length, 0);
}

async function main() {
  testLiteratureMultilineRoundTripAndDeterministicProjection();
  testStructuredBoundaryRejectsUnsafeValues();
  await testCandidateRuntimeVersionBoundaryAndMutationGuard();
  await testV1CandidateDispatchAndEveryMutationGuard();
  await testPromotionGapSyntaxBoundaryAndMaliciousVaultBytes();
  await testCanonicalPacketAndKindContractAcceptV2OnlyThroughExistingAuthority();
  console.log("Knowledge lifecycle template repair regressions passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
