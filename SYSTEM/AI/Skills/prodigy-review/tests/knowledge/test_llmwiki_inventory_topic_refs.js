"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const assemblerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-assembler.js"));
const materializerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-proposal-materializer.js"));
const reducerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-document-reducer.js"));
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const hashApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function connectedInput() {
  const item = (role, topic, texts, start) => ({
    role, ...(topic === undefined ? {} : { topic }),
    claims: texts.map((text) => ({ text })),
    evidence_quote: `Evidence ${start}`, span: { start, end: start + 10, alias: `span_${start}` },
    review_reasons: [], related_candidate_ids: [],
  });
  return {
    source: { source_id: "source_d1", source_path: "INBOX/d1.md", content_hash: "e".repeat(64) },
    artifacts: [{ chunk_key: "chunk_d1", outcome: "proposals", items: [
      item("hold", "권리산정기준일의 정의", ["Held claim"], 0),
      item("source_summary", " 공감각적 광각 점검 ", ["Shared claim", "First only", " Shared   claim "], 10),
      item("source_summary", "사진 배치 순서", ["Shared claim", "Second only"], 20),
      item("source_summary", undefined, ["No topic claim"], 30),
    ] }],
  };
}

function inventoryOf(documents, source = connectedInput().source) {
  const result = reducerApi.createClaimInventory({ source, documents });
  assert.equal(result.ok, true, result.reason);
  return result.value;
}

function factual(value) {
  return value.claims.map(({ original_topic_refs, source_topics, ...claim }) => claim);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function inventoryHash({ inventory_version, source, claims, citations }) {
  return hashApi.sha256(stable({ inventory_version, source, claims, citations }));
}

test("connected materializer -> assembler -> inventory -> suggestion preserves exact occurrence lineage", () => {
  const input = connectedInput();
  const result = materializerApi.createInboxProposalMaterializer().materialize(input);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.holds.length, 1);
  assert.equal(result.proposals.length, 1);
  const document = result.proposals[0].document;
  const inventory = inventoryOf([document]);
  const byText = new Map(inventory.claims.map((claim) => [claim.text, claim]));
  const citationId = (start) => inventory.citations.find((row) => row.locators.includes(`INBOX/d1.md#${start}-${start + 10}`)).citation_id;
  const ref = (topic, item_index, claim_index, start) => ({ topic, chunk_key: "chunk_d1", item_index, claim_index, citation_id: citationId(start) });
  assert.deepEqual(byText.get("Shared claim").original_topic_refs, [
    ref(" 공감각적 광각 점검 ", 1, 0, 10),
    ref(" 공감각적 광각 점검 ", 1, 2, 10),
    ref("사진 배치 순서", 2, 0, 20),
  ], "deduplicated claim must retain exact topic/item/claim/citation occurrences");
  assert.deepEqual(byText.get("First only").original_topic_refs, [ref(" 공감각적 광각 점검 ", 1, 1, 10)]);
  assert.deepEqual(byText.get("Second only").original_topic_refs, [ref("사진 배치 순서", 2, 1, 20)]);
  assert.equal("original_topic_refs" in byText.get("No topic claim"), false);
  assert.equal(byText.has("Held claim"), false);
  assert.ok(inventory.claims.every((claim) => !("source_topics" in claim)));
  assert.equal(document.original_topic_refs.length, 5);
  assert.ok(document.claims.every((claim) => Object.keys(claim).join() === "text"));
  const selected = [byText.get("Shared claim")];
  const suggestion = registry.suggestClassification({ claims: selected, documents: [document] });
  assert.equal(suggestion.uncertain, true);
  assert.equal(suggestion.knowledge_domain, "wedding");
  assert.equal(suggestion.knowledge_kind, "procedure");
  assert.deepEqual(suggestion.knowledge_topics, [" 공감각적 광각 점검 ", "사진 배치 순서"]);
  assert.deepEqual(suggestion.basis, selected.map(({ claim_id, original_topic_refs }) => ({ claim_id, original_topic_refs })));
  const unlabelled = registry.suggestClassification({ claims: [byText.get("No topic claim")], documents: [document] });
  assert.deepEqual(unlabelled.knowledge_topics, []);
  assert.equal(unlabelled.knowledge_domain, "");
  assert.equal(unlabelled.knowledge_kind, "");
  const { original_topic_refs, ...legacyDocument } = document;
  const legacy = inventoryOf([legacyDocument]);
  assert.deepEqual(factual(inventory), factual(legacy));
  assert.deepEqual(inventory.citations, legacy.citations);
  assert.ok(legacy.claims.every((claim) => !("original_topic_refs" in claim) && !("source_topics" in claim)));
  assert.equal(registry.suggestClassification({ claims: legacy.claims }).knowledge_domain, "");
  assert.equal(inventoryHash(inventory), inventory.inventory_hash);
  const tampered = JSON.parse(JSON.stringify(inventory));
  tampered.claims[0].original_topic_refs[0].item_index = 99;
  assert.notEqual(inventoryHash(tampered), inventory.inventory_hash);
});

test("assembler retains raw labels and original claim coordinates through no_changes", () => {
  const input = connectedInput();
  const first = { ...input.artifacts[0].items[1], role: "reusable_claim", topic: "50mm  렌즈 선택", claims: [{ text: "" }, { text: " Shared   claim " }, { text: "Shared claim" }] };
  const second = { ...input.artifacts[0].items[2], role: "reusable_claim", topic: "50mm 렌즈 고르기", claims: [{ text: "Shared claim" }] };
  input.artifacts[0].items = [input.artifacts[0].items[0], first, second];
  const result = assemblerApi.createDocumentAssembler({ canonicalDocuments: [{ document_id: "canonical_d1", content: "Shared claim" }] }).assemble(input);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.documents.length, 0);
  assert.equal(result.no_changes.length, 1);
  const document = result.no_changes[0];
  assert.deepEqual(document.claims, [{ text: "Shared claim" }]);
  assert.deepEqual(document.original_topic_refs.map(({ topic, chunk_key, item_index, claim_index }) => ({ topic, chunk_key, item_index, claim_index })), [
    { topic: first.topic, chunk_key: "chunk_d1", item_index: 1, claim_index: 1 },
    { topic: first.topic, chunk_key: "chunk_d1", item_index: 1, claim_index: 2 },
    { topic: second.topic, chunk_key: "chunk_d1", item_index: 2, claim_index: 0 },
  ]);
  assert.equal(inventoryOf(result.no_changes).claims[0].original_topic_refs.length, 3);
});

test("lineage requires both exact normalized claim text and its originating citation", () => {
  const assembled = assemblerApi.createDocumentAssembler().assemble(connectedInput());
  assert.equal(assembled.ok, true, assembled.reason);
  const document = assembled.documents[0];
  const inventory = inventoryOf([document]);
  const refs = document.original_topic_refs;
  // Same claim ID encountered again: merge occurrences once, without changing facts.
  const half = Math.floor(refs.length / 2);
  const split = inventoryOf([
    { ...document, original_topic_refs: refs.slice(0, half) },
    { ...document, original_topic_refs: refs.slice(half) },
    document,
  ]);
  assert.deepEqual(split.claims, inventory.claims);
  assert.deepEqual(split.citations, inventory.citations);
  // Equal claim/citation counts invoke the existing positional factual assignment.
  // Here the shared claim's assigned citation is not either originating item.
  const noTopicCitation = document.citations[2];
  const mismatched = { ...document, claims: [{ text: "Shared claim" }], citations: [noTopicCitation] };
  const mismatchedClaim = inventoryOf([mismatched]).claims[0];
  assert.equal("original_topic_refs" in mismatchedClaim, false);
  // Equal text elsewhere must not leak refs when its citation differs.
  const combined = inventoryOf([document, mismatched]);
  assert.equal("original_topic_refs" in combined.claims.find((claim) => claim.claim_id === mismatchedClaim.claim_id), false);
  const changedText = inventoryOf([{ ...document, claims: [{ text: "shared claim" }] }]);
  assert.equal("original_topic_refs" in changedText.claims[0], false);
  const legacy = inventoryOf([{ ...document, original_topic_refs: [{ topic: "사진 배치 순서", chunk_key: "chunk_d1" }] }]);
  assert.ok(legacy.claims.every((claim) => !("original_topic_refs" in claim) && !("source_topics" in claim)));
});
