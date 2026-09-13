"use strict";

// Todo 2 (D2/D3): suggestClassification as pure registry functionality.
// Failing-first: the helper must exist and map exact observed topics.

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));

function claim(id, topics) {
  return { claim_id: id, original_topic_refs: topics.map((topic) => ({ topic, chunk_key: "chunk_t2" })) };
}

test("D2 helper exists with the review-only envelope shape", () => {
  assert.equal(typeof registry.suggestClassification, "function");
  const result = registry.suggestClassification({ claims: [claim("claim_a", ["공감각적 광각 점검"])] });
  assert.equal(result.suggestion_version, "llmwiki_classification_suggestions_v1");
  assert.equal(result.origin, "original_item_topics");
  assert.equal(result.uncertain, true);
  assert.ok(Array.isArray(result.knowledge_topics));
  assert.ok(Array.isArray(result.domain_candidates));
  assert.ok(Array.isArray(result.kind_candidates));
  assert.ok(Array.isArray(result.basis));
});

test("D2 wedding procedures suggest wedding/procedure", () => {
  const result = registry.suggestClassification({ claims: [
    claim("claim_a", ["공감각적 광각 점검"]),
    claim("claim_b", ["사진 배치 순서"]),
  ] });
  assert.deepEqual(result.knowledge_topics, ["공감각적 광각 점검", "사진 배치 순서"]);
  assert.equal(result.knowledge_domain, "wedding");
  assert.equal(result.knowledge_kind, "procedure");
  assert.equal(result.basis.length, 2);
});

test("D2 real-estate definition suggests real_estate/concept", () => {
  const result = registry.suggestClassification({ claims: [claim("claim_c", ["권리산정기준일의 정의"])] });
  assert.equal(result.knowledge_domain, "real_estate");
  assert.equal(result.knowledge_kind, "concept");
});

test("D2 mixed and unknown topics abstain without dropping labels", () => {
  const mixed = registry.suggestClassification({ claims: [
    claim("claim_a", ["공감각적 광각 점검"]),
    claim("claim_b", ["낯선 이와의 거래 시 금전적 유인의 영향력"]),
  ] });
  assert.equal(mixed.knowledge_domain, "");
  assert.deepEqual(mixed.domain_candidates.sort(), ["business", "real_estate", "wedding"].sort());
  assert.deepEqual(mixed.knowledge_topics, ["공감각적 광각 점검", "낯선 이와의 거래 시 금전적 유인의 영향력"]);
  const unknown = registry.suggestClassification({ claims: [claim("claim_z", ["들어본 적 없는 주제"])] });
  assert.equal(unknown.knowledge_domain, "");
  assert.equal(unknown.knowledge_kind, "");
  assert.deepEqual(unknown.knowledge_topics, ["들어본 적 없는 주제"]);
  const empty = registry.suggestClassification({ claims: [{ claim_id: "claim_n", original_topic_refs: [] }] });
  assert.deepEqual(empty.knowledge_topics, []);
  assert.equal(empty.knowledge_domain, "");
});

test("D2 missing, unmapped and mixed evidence abstains as a whole", () => {
  for (const claims of [
    [claim("known", ["공감각적 광각 점검"]), { claim_id: "legacy" }],
    [claim("known", ["공감각적 광각 점검"]), claim("unknown", ["Unmapped label"])],
    [claim("mixed_domain", ["혼주 촬영 렌즈", "직영 공사의 비용 절감 효과"])],
    [claim("ambiguous_domain", ["낯선 이와의 거래 시 금전적 유인의 영향력"])],
    [claim("mixed_kind", ["공감각적 광각 점검", "혼주 촬영 렌즈"])],
  ]) {
    const result = registry.suggestClassification({ claims });
    assert.equal(result.knowledge_domain, "");
    assert.equal(result.knowledge_kind, "");
    assert.equal(result.uncertain, true);
    assert.deepEqual(result.knowledge_topics, [...new Set(claims.flatMap((row) => (row.original_topic_refs || []).map((ref) => ref.topic)))]);
  }
});

test("D2 suggestions use selected original refs only and do not register labels", () => {
  const seedSnapshot = JSON.stringify([registry.DOMAIN_ORDER, registry.TOPICS_BY_DOMAIN]);
  const selected = claim("selected", ["  사진 배치 순서  ", "사진 배치 순서".normalize("NFD")]);
  const input = {
    claims: [selected],
    verifiedRows: [{ domain: "coding", topics: ["사진 배치 순서"] }],
    documents: [{ original_topic_refs: [{ topic: "권리산정기준일의 정의" }] }],
  };
  const before = JSON.stringify(input);
  const result = registry.suggestClassification(input);
  assert.equal(result.knowledge_domain, "wedding");
  assert.equal(result.knowledge_kind, "procedure");
  assert.deepEqual(result.knowledge_topics, selected.original_topic_refs.map((ref) => ref.topic));
  assert.deepEqual(result.basis[0].original_topic_refs, selected.original_topic_refs);
  const unmapped = registry.suggestClassification({
    claims: [claim("unknown", ["New topic"])], verifiedRows: [{ domain: "coding", topics: ["New topic"] }],
  });
  assert.equal(unmapped.knowledge_domain, "");
  assert.equal(unmapped.knowledge_kind, "");
  const legacy = registry.suggestClassification({ claims: [{ claim_id: "legacy", topic: "사진 배치 순서", source_topics: ["사진 배치 순서"] }] });
  assert.deepEqual(legacy.knowledge_topics, []);
  assert.equal(legacy.knowledge_domain, "");
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify([registry.DOMAIN_ORDER, registry.TOPICS_BY_DOMAIN]), seedSnapshot);
  assert.deepEqual(registry.normalizeTopics("사진 배치 순서", "wedding"), ["unclassified"]);
});

test("registered suggestions are separate from verbatim original labels", () => {
  const result = registry.suggestClassification({ claims: [claim("selected", ["사진 배치 순서"])] });
  assert.deepEqual(result.stored_knowledge_topics, ["editing"]);
  assert.deepEqual(result.knowledge_topics, ["사진 배치 순서"]);
  for (const labels of [["unknown"], ["사진 배치 순서", "unknown"], ["사진 배치 순서", "권리산정기준일의 정의"]]) {
    assert.deepEqual(registry.suggestClassification({ claims: [claim("partial", labels)] }).stored_knowledge_topics, []);
  }
});
