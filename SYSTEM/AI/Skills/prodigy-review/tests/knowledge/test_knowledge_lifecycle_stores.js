"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const sourceStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-source-store.js"));
const candidateStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));
const fleetingStore = require(path.join(ROOT, "SYSTEM/Views/knowledge-fleeting-store.js"));
const promotion = require(path.join(ROOT, "SYSTEM/Views/llmwiki-promotion-contract.js"));

function makeVault() {
  const files = new Map();
  const writes = [];
  const file = (entryPath) => ({ path: entryPath, extension: "md", basename: entryPath.split("/").pop().replace(/\.md$/u, "") });
  const app = { vault: {
    getAbstractFileByPath(entryPath) {
      if (files.has(entryPath)) return file(entryPath);
      const children = [...files.keys()].filter((value) => value.startsWith(`${entryPath}/`) && !value.slice(entryPath.length + 1).includes("/")).map(file);
      return children.length ? { path: entryPath, children } : null;
    },
    async read(entry) { return files.get(entry.path); },
    async createFolder() {},
    async create(entryPath, content) {
      if (files.has(entryPath)) throw new Error("already exists");
      files.set(entryPath, content); writes.push({ kind: "create", path: entryPath, content }); return file(entryPath);
    },
    async modify(entry, content) { files.set(entry.path, content); writes.push({ kind: "modify", path: entry.path, content }); },
  } };
  return { app, files, writes, put(entryPath, content) { files.set(entryPath, content); } };
}

function sourceInput() {
  return {
    schema_version: 2,
    source_id: "source-lifecycle-store-001",
    source_kind: "article",
    source_url: "https://example.test/lifecycle",
    source_title: "Lifecycle source map",
    creator: "Author",
    publisher: "Publisher",
    published_at: "2026-08-25",
    source_claim: "The source makes a bounded claim.",
    my_interpretation: "The claim needs a source map.",
    reusable_knowledge: "Bounded claims retain their source map.",
    summary_origin: "manual",
    knowledge_domain: "coding",
    knowledge_topics: ["typescript"],
    sources: [{ source_id: "source-map-001", span: { start: 0, end: 32 } }],
    relations: [{ relation_id: "relation-map-001", target_id: "source-map-001", type: "supports" }],
    created: "2026-08-25T00:00:00.000Z",
    updated: "2026-08-25T00:00:00.000Z",
  };
}

function incompleteUnit() {
  return {
    knowledge_kind: "principle",
    classification: "epistemic",
    title: "Incomplete lifecycle principle",
    statement: "A candidate exists only for a real promotion gap.",
    evidence: [],
    claims: [],
    relation_status: "resolved",
    approval_status: "pending",
    principle_boundaries: { conditions: [], exclusions: [], invalidation_conditions: [] },
    principle_rationale: "",
  };
}

function candidateInput(unit) {
  return {
    candidate_id: "candidate-lifecycle-store-001",
    title: "Lifecycle promotion gap",
    statement: "A candidate exists only for a real promotion gap.",
    reason: "The promotion receipt has content gaps.",
    source_type: "manual_study",
    source_evidence_ids: [],
    source_objects: [],
    source_note: "Promotion fixture",
    confidence: "explicit",
    suggested_domain: "reading",
    suggested_topics: [],
    approval_note: "",
    created: "2026-08-25T00:00:00.000Z",
    updated: "2026-08-25T00:00:00.000Z",
    promotion_unit: unit,
  };
}

async function testBoundedDestinationStores() {
  const vault = makeVault();
  let providerCalls = 0;
  let canonicalWriterCalls = 0;
  const source = await sourceStore.saveSource(vault.app, sourceInput());
  const sourceBytes = vault.files.get(source.path);
  const sourceReplay = await sourceStore.saveSource(vault.app, sourceInput());
  assert.equal(source.path, "ZETA/LITERATURE/Lifecycle source map.md");
  assert.equal(sourceReplay.reused, true);
  assert.equal(vault.files.get(source.path), sourceBytes);
  assert.deepEqual(sourceStore.parseFrontmatter(sourceBytes).data.sources, [{ source_id: "source-map-001", span: { start: 0, end: 32 } }]);

  const first = await fleetingStore.saveThought(vault.app, {
    block_id: "fleeting-block-001", date: "2026-08-25", text: "First editable thought.",
    sources: [{ source_id: "source-map-001", span: { start: 0, end: 32 } }],
    provider: () => { providerCalls += 1; }, canonicalWriter: () => { canonicalWriterCalls += 1; },
  });
  const fleetingPath = "ZETA/FLEETING/2026-08-25.md";
  const userEdited = `${vault.files.get(fleetingPath)}\nUser-authored text stays untouched.\n`;
  vault.files.set(fleetingPath, userEdited);
  const second = await fleetingStore.saveThought(vault.app, {
    block_id: "fleeting-block-002", date: "2026-08-25", text: "Second editable thought.",
  });
  const replayBytes = vault.files.get(fleetingPath);
  const replay = await fleetingStore.saveThought(vault.app, {
    block_id: "fleeting-block-002", date: "2026-08-25", text: "Second editable thought.",
  });
  assert.equal(first.path, fleetingPath);
  assert.equal(second.reused, false);
  assert.equal(replay.reused, true);
  assert.equal(vault.files.get(fleetingPath), replayBytes);
  assert.match(replayBytes, /## 생각 저장/m);
  assert.match(replayBytes, /User-authored text stays untouched\./);
  assert.equal(providerCalls, 0);
  assert.equal(canonicalWriterCalls, 0);

  const unit = incompleteUnit();
  const receipt = promotion.evaluatePromotion(unit);
  const saved = await candidateStore.saveCandidate(vault.app, candidateInput(unit), { promotion_receipt: receipt });
  const candidateBytes = vault.files.get(saved.path);
  const retry = await candidateStore.saveCandidate(vault.app, candidateInput(unit), { promotion_receipt: receipt });
  assert.equal(saved.path, "ZETA/CANDIDATES/Lifecycle promotion gap.md");
  assert.equal(retry.path, saved.path);
  assert.equal(vault.files.get(saved.path), candidateBytes);
  assert.deepEqual(saved.blocking_content_gaps.map((gap) => gap.reason_code), ["missing_evidence_refs", "unsupported_claim", "principle_boundaries_required", "principle_rationale_required"]);
  const deferred = await candidateStore.deferCandidate(vault.app, saved.path, { now: "2026-08-25T00:01:00.000Z" });
  assert.equal(deferred.status, "needs_more_evidence");
  const resumed = await candidateStore.resumeCandidate(vault.app, saved.path, { now: "2026-08-25T00:02:00.000Z" });
  assert.equal(resumed.status, "saved");

  const legacyPath = "PARA/RESOURCES/Knowledge/Candidates/legacy.md";
  const legacyBytes = `---
candidate_id: "legacy-candidate-001"
status: proposed
title: "Legacy"
statement: "Legacy statement"
reason: "Legacy reason"
source_session: "[[Reading/legacy]]"
source_book: "Legacy source"
created: "2026-08-24T00:00:00.000Z"
updated: "2026-08-24T00:00:00.000Z"
---
# Legacy
`;
  vault.put(legacyPath, legacyBytes);
  const listed = await candidateStore.listCandidates(vault.app, { status: "all" });
  assert.equal(listed.some((entry) => entry.path === legacyPath && entry.legacy_read_only), true);
  assert.equal(vault.files.get(legacyPath), legacyBytes);
  vault.put("PARA/RESOURCES/Reading/Candidates/duplicate.md", legacyBytes.replace("legacy-candidate-001", saved.candidate_id));
  const deduped = await candidateStore.listCandidates(vault.app, { status: "all" });
  assert.equal(deduped.filter((entry) => entry.candidate_id === saved.candidate_id).length, 1);
  assert.equal(deduped.find((entry) => entry.candidate_id === saved.candidate_id).path, saved.path);

  const complete = { ...unit, evidence: [{ evidence_id: "evidence-complete-001", source_ref: "INBOX/source.md", strength: "sufficient" }], claims: [{ claim_id: "claim-complete-001", statement: unit.statement, evidence_refs: ["evidence-complete-001"], origin: "source_extract", review_status: "accepted" }], principle_boundaries: { conditions: ["condition"], exclusions: ["exclusion"], invalidation_conditions: ["invalidation"] }, principle_rationale: "Rationale" };
  const completeResult = await candidateStore.saveCandidate(vault.app, candidateInput(complete), { promotion_receipt: promotion.evaluatePromotion(complete) });
  assert.equal(completeResult.disposition, "canonical_review");
  assert.equal(vault.files.has("ZETA/CANDIDATES/Incomplete lifecycle principle.md"), false);
  const staleUnit = { ...unit, state: "stale" };
  const staleBytes = JSON.stringify([...vault.files]);
  await assert.rejects(
    () => candidateStore.saveCandidate(vault.app, candidateInput(staleUnit), { promotion_receipt: promotion.evaluatePromotion(staleUnit) }),
    /candidate_promotion_gap_required/
  );
  assert.equal(JSON.stringify([...vault.files]), staleBytes);

  await assert.rejects(() => fleetingStore.saveThought(vault.app, { block_id: "fleeting-block-bad", date: "2026-8-25", text: "bad" }), /date|path/i);
  for (const invalidDate of ["2026-02-29", "2026-02-31", "2026-04-31"]) {
    const beforeInvalidDate = JSON.stringify([...vault.files]);
    await assert.rejects(
      () => fleetingStore.saveThought(vault.app, { block_id: `fleeting-invalid-${invalidDate.replace(/-/gu, "")}`, date: invalidDate, text: "must not write" }),
      /malformed_fleeting_date/
    );
    assert.equal(JSON.stringify([...vault.files]), beforeInvalidDate, `${invalidDate} rejects before a Vault write`);
  }
  const leapDate = await fleetingStore.saveThought(vault.app, { block_id: "fleeting-valid-leap-2028", date: "2028-02-29", text: "valid leap day" });
  assert.equal(leapDate.path, "ZETA/FLEETING/2028-02-29.md");
  const duplicateBytes = vault.files.get(fleetingPath);
  const duplicate = await fleetingStore.saveThought(vault.app, { block_id: "fleeting-block-001", date: "2026-08-25", text: "different" });
  assert.equal(duplicate.reused, true);
  assert.equal(vault.files.get(fleetingPath), duplicateBytes);
}

testBoundedDestinationStores().then(() => {
  console.log("Knowledge lifecycle stores tests passed");
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
