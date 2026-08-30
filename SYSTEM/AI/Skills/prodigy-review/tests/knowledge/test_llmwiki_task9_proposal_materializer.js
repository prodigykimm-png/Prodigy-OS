"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../../../../../..");
const materializerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-proposal-materializer.js"));
const handoffApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-object-handoff-contract.js"));

function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

function item(role, extra = {}) {

  return {
    role,
    evidence_quote: extra.evidence_quote || "deterministic local quote",
    claims: extra.claims === undefined ? [{ text: "A reusable deterministic claim" }] : extra.claims,
    review_reasons: extra.review_reasons || [],
    related_candidate_ids: extra.related_candidate_ids || [],
    ...(extra.span === undefined ? { span: { start: 16, end: 16 + (extra.evidence_quote || "deterministic local quote").length, alias: `span_${(aliasCounter += 1)}` } } : { span: extra.span }),
    ...extra.raw,
  };
}

let aliasCounter = 0;

function artifact(chunkKey, outcome, items) {
  return { chunk_key: chunkKey, outcome, items };
}

function source() {
  const bytes = "INBOX source with a deterministic local quote inside.";
  return { source_id: "source_task9_01", source_path: "INBOX/Knowledge/task9.md", content_hash: sha256(bytes) };
}

function materializer(options = {}) {
  return materializerApi.createInboxProposalMaterializer({
    allowedCandidateIds: options.allowedCandidateIds || [],
    relatedCandidates: options.relatedCandidates || [],
    canonicalDocuments: options.canonicalDocuments || [],
    localObjectIndex: options.localObjectIndex || [],
    localObjectRoutes: options.localObjectRoutes || [],
    objectResolver: options.localObjectIndex ? handoffApi.createLocalObjectResolver(options.localObjectIndex) : undefined,
  });
}

function assertLifecycleContract(result) {
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('"promotion_complete":true'), "no promotion_complete:true may be emitted");
  assert.ok(!serialized.includes("ZETA/PERMANENT"), "no direct Permanent destination may be emitted");
}

test("happy path: source_summary and reusable_claim map to Literature and Candidate create proposals", () => {
  const result = materializer().materialize({
    source: source(),
    artifacts: [artifact("chunk_alpha", "proposals", [
      item("source_summary", { claims: [{ text: "Source argues deterministic intake" }] }),
      item("reusable_claim"),
    ])],
  });
  assert.equal(result.ok, true, result && result.reason);
  assert.equal(result.proposals.length, 2);
  assert.equal(result.holds.length, 0);
  const literature = result.proposals.find((proposal) => proposal.decision.destination === "literature");
  const candidate = result.proposals.find((proposal) => proposal.decision.destination === "knowledge_candidate");
  assert.ok(literature && candidate);
  assert.equal(literature.class, "create");
  assert.equal(literature.capture_target, "zeta_literature");
  assert.equal(candidate.class, "create");
  assert.equal(candidate.capture_target, "knowledge_candidate");
  for (const proposal of result.proposals) {
    assert.equal(proposal.operation.kind, "create");
    assert.equal(proposal.operation.approval_eligible, true);
    assert.equal(proposal.operation.risk_tier, "low");
    assert.match(proposal.operation.destination_ids[0], /^ZETA\/(LITERATURE|CANDIDATES)\/[a-z0-9_-]+\.md$/u);
    assert.equal(proposal.operation.source_citations[0].source_id, "source_task9_01");
    assert.equal(proposal.operation.source_citations[0].confidence, "explicit");
    assert.equal(proposal.selected, false);
    assert.equal(proposal.decision.review_state, "review");
  }
  assert.ok(literature.operation.destination_ids[0].startsWith("ZETA/LITERATURE/"));
  assert.ok(candidate.operation.destination_ids[0].startsWith("ZETA/CANDIDATES/"));
  assert.match(candidate.operation.after_bytes[candidate.operation.destination_ids[0]], /^# task9$/mu);
  assert.match(candidate.operation.after_bytes[candidate.operation.destination_ids[0]], /^## 핵심 내용$/mu);
  assert.notEqual(literature.operation.operation_id, candidate.operation.operation_id);
  assertLifecycleContract(result);
});

test("multiple reusable items from one source materialize as one document operation", () => {
  const result = materializer().materialize({
    source: source(),
    artifacts: [
      artifact("chunk_album_a", "proposals", [
        item("reusable_claim", { evidence_quote: "원본 파일을 먼저 정리한다.", claims: [{ text: "원본 파일을 먼저 정리한다." }], span: { start: 10, end: 26, alias: "span_album_1" } }),
      ]),
      artifact("chunk_album_b", "proposals", [
        item("reusable_claim", { evidence_quote: "홀수 사진은 오른쪽 페이지부터 시작한다.", claims: [{ text: "홀수 사진은 오른쪽 페이지부터 시작한다." }], span: { start: 50, end: 72, alias: "span_album_2" } }),
        item("reusable_claim", { evidence_quote: "가로 사진은 양면 파노라마로 배치한다.", claims: [{ text: "가로 사진은 양면 파노라마로 배치한다." }], span: { start: 90, end: 111, alias: "span_album_3" } }),
      ]),
    ],
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.proposals.length, 1);
  const [proposal] = result.proposals;
  assert.equal(proposal.operation.kind, "create");
  const after = proposal.operation.after_bytes[proposal.operation.destination_ids[0]];
  assert.match(after, /^# task9$/mu);
  assert.match(after, /원본 파일을 먼저 정리한다/u);
  assert.match(after, /홀수 사진은 오른쪽 페이지부터 시작한다/u);
  assert.match(after, /가로 사진은 양면 파노라마로 배치한다/u);
  assert.equal(proposal.operation.source_citations.length, 1);
  assert.equal(proposal.operation.source_citations[0].locators.length, 4);
});

test("compiled Source Guide links resolve to exact hashed candidate paths", () => {
  const documents = [
    {
      role: "source_summary",
      document_kind: "source_guide",
      title: "투자일기 자료 안내",
      body: "# 투자일기 자료 안내\n\n## 연결 문서\n\n- [[부동산 권리 안전장치]]\n",
      claims: [],
      citations: [],
      review_reasons: [],
      matched_candidate_ids: [],
    },
    {
      role: "reusable_claim",
      document_kind: "topic_article",
      page_id: `page_${"a".repeat(24)}`,
      title: "부동산 권리 안전장치",
      body: "# 부동산 권리 안전장치\n\n## 핵심\n\n권리 관계를 확인한다.\n",
      claims: [{ text: "권리 관계를 확인한다." }],
      citations: [],
      review_reasons: [],
      matched_candidate_ids: [],
    },
  ];
  const result = materializer().materializeDocuments({ source: source(), documents });
  assert.equal(result.ok, true, result.reason);
  const guide = result.proposals.find((proposal) => proposal.decision.destination === "literature");
  const candidate = result.proposals.find((proposal) => proposal.decision.destination === "knowledge_candidate");
  const candidatePath = candidate.operation.destination_ids[0].replace(/\.md$/u, "");
  const guideBytes = guide.operation.after_bytes[guide.operation.destination_ids[0]];
  assert.match(guideBytes, new RegExp(`\\[\\[${candidatePath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\|부동산 권리 안전장치\\]\\]`, "u"));
  assert.doesNotMatch(guideBytes, /\[\[부동산 권리 안전장치\]\]/u);
});

test("materialization is deterministic and mutates nothing (zero-write purity)", () => {
  const input = Object.freeze({
    source: Object.freeze(source()),
    artifacts: Object.freeze([artifact("chunk_alpha", "proposals", [
      item("source_summary"), item("reusable_claim"),
    ])]),
  });
  const first = materializer().materialize(input);
  const second = materializer().materialize(input);
  assert.equal(first.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
});

test("object_context maps to a typed PARA handoff draft without writes", async () => {
  const localObjectIndex = [{ object_id: "project_alpha", object_type: "project", path: "PARA/PROJECTS/Alpha.md", revision: "revision_alpha", bytes: "# Alpha\n" }];
  const m = materializer({
    localObjectIndex,
    localObjectRoutes: [{ semantic_id: "chunk_object", object_type: "project", object_id: "project_alpha", slot: "progress_note", lane: "operational" }],
  });
  const result = m.materialize({
    source: source(),
    artifacts: [artifact("chunk_object", "proposals", [item("object_context")])],
  });
  assert.equal(result.ok, true, result && result.reason);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.para_drafts.length, 1);
  assert.equal(result.para_drafts[0].object_type, "project");
  assert.equal(result.para_drafts[0].slot, "progress_note");
  const proposed = await m.materializeParaObject({
    handoff_id: result.para_drafts[0].handoff_id, object_type: "project", object_id: "project_alpha",
    slot: "progress_note", text: result.para_drafts[0].text, linked_lifecycle_ids: result.para_drafts[0].linked_lifecycle_ids,
  });
  assert.equal(proposed.ok, true);
  assert.equal(proposed.value.target.path, "PARA/PROJECTS/Alpha.md");
  assertLifecycleContract(result);
});

test("source-level object context without a trusted local Object route becomes one hold", () => {
  const result = materializer().materialize({
    source: source(),
    artifacts: [artifact("chunk_unrouted_object", "proposals", [item("object_context")])],
  });
  assert.equal(result.ok, true, result && result.reason);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.para_drafts.length, 0);
  assert.equal(result.holds.length, 1);
  assert.equal(result.holds[0].reason, "object_route_unresolved");
  assertLifecycleContract(result);
});

test("allowlisted candidates preserve one update target and hold ambiguous multi-target merge", () => {
  const rows = [
    { candidate_id: "cand_alpha", path: "ZETA/CANDIDATES/Alpha.md", content_hash: sha256("alpha-bytes"), revision: sha256("alpha-bytes"), before_bytes: "alpha-bytes" },
    { candidate_id: "cand_beta", path: "ZETA/CANDIDATES/Beta.md", content_hash: sha256("beta-bytes"), revision: sha256("beta-bytes"), before_bytes: "beta-bytes" },
  ];
  const m = materializer({ allowedCandidateIds: ["cand_alpha", "cand_beta"], relatedCandidates: rows });
  const result = m.materialize({
    source: source(),
    artifacts: [artifact("chunk_rel", "proposals", [
      item("reusable_claim", { related_candidate_ids: ["cand_alpha"] }),
      item("reusable_claim", { claims: [{ text: "Conflicting update input" }], related_candidate_ids: ["cand_alpha"], review_reasons: ["contradicts stored claim"] }),
      item("reusable_claim", { claims: [{ text: "Second merge input" }], related_candidate_ids: ["cand_alpha", "cand_beta"] }),
    ])],
  });
  assert.equal(result.ok, true, result && result.reason);
  const update = result.proposals.find((proposal) => proposal.operation.kind === "update");
  const mergeHold = result.holds.find((hold) => hold.reason === "explicit_merge_destination_required");
  assert.ok(update && mergeHold);
  assert.equal(result.proposals.length, 1, "ambiguous merge must not mint an operation");
  assert.equal(update.operation.kind, "update");
  assert.equal(update.operation.destination_ids[0], "ZETA/CANDIDATES/Alpha.md", "path authority must come from the local index");
  assert.equal(update.operation.base_revisions["ZETA/CANDIDATES/Alpha.md"], sha256("alpha-bytes"));
  assert.equal(update.operation.risk_tier, "high");
  assert.equal(update.operation.conflicts.length, 1);
  assert.equal(update.operation.conflicts[0].status, "unresolved");
  assert.match(update.operation.after_bytes["ZETA/CANDIDATES/Alpha.md"], /A reusable deterministic claim/u);
  assert.match(update.operation.after_bytes["ZETA/CANDIDATES/Alpha.md"], /Conflicting update input/u);
  assert.equal(update.capture_target, "knowledge_candidate");
  assert.equal(update.selected, false);
  assert.equal(mergeHold.selected, false);
  assertLifecycleContract(result);
});

test("claims already covered by canonical Knowledge return no_change and no create proposal", () => {
  const claim = "A reusable deterministic claim";
  const result = materializer({
    canonicalDocuments: [{
      document_id: "canonical_task9",
      path: "ZETA/PERMANENT/Task9.md",
      title: "Task9",
      content: `# Task9\n\n- ${claim}\n`,
      revision: sha256(claim),
    }],
  }).materialize({
    source: source(),
    artifacts: [artifact("chunk_existing", "proposals", [
      item("reusable_claim", { claims: [{ text: claim }] }),
    ])],
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.no_changes.length, 1);
  assert.equal(result.no_changes[0].operation_hint, "no_change");
  assert.equal(result.no_changes[0].matched_document_id, "canonical_task9");
});

test("hold outcomes, hold roles, empty claims, and ambiguous identity become unselected holds", () => {
  const result = materializer().materialize({
    source: source(),
    artifacts: [
      artifact("chunk_hold_outcome", "hold", [item("reusable_claim")]),
      artifact("chunk_hold_role", "proposals", [item("hold", { claims: [] })]),
      artifact("chunk_weak", "proposals", [item("reusable_claim", { claims: [] })]),
      artifact("chunk_nochange", "no_change", []),
    ],
  });
  assert.equal(result.ok, true, result && result.reason);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.holds.length, 3);
  for (const hold of result.holds) {
    assert.equal(hold.selected, false);
    assert.equal(hold.operation, undefined);
    assert.ok(hold.reason && hold.reason.length > 0);
  }
  assertLifecycleContract(result);
});

test("forged model authority fields and unallowed candidate ids are rejected", () => {
  const forgedCases = [
    item("reusable_claim", { raw: { path: "ZETA/PERMANENT/Evil.md" } }),
    item("reusable_claim", { raw: { operation_kind: "create" } }),
    item("reusable_claim", { raw: { destination_ids: ["ZETA/PERMANENT/Evil.md"] } }),
    item("reusable_claim", { related_candidate_ids: ["cand_forged"] }),
    { role: "unknown_role", evidence_quote: "q", claims: [], review_reasons: [], related_candidate_ids: [] },
  ];
  for (const [index, forged] of forgedCases.entries()) {
    const result = materializer({ allowedCandidateIds: ["cand_allowed"] }).materialize({
      source: source(),
      artifacts: [artifact(`chunk_forged_${index}`, "proposals", [forged])],
    });
    assert.equal(result.ok, false, `forged case ${index} must be rejected`);
  }
});

test("no Permanent proposal or promotion flag can ever be produced from INBOX analysis", () => {
  const rows = [
    { candidate_id: "cand_alpha", path: "ZETA/CANDIDATES/Alpha.md", content_hash: sha256("alpha-bytes"), revision: sha256("alpha-bytes"), before_bytes: "alpha-bytes" },
  ];
  const result = materializer({ allowedCandidateIds: ["cand_alpha"], relatedCandidates: rows }).materialize({
    source: source(),
    artifacts: [artifact("chunk_perm", "proposals", [
      item("source_summary"),
      item("reusable_claim", { related_candidate_ids: ["cand_alpha"] }),
      item("object_context"),
    ])],
  });
  if (result.ok) assertLifecycleContract(result);
});
