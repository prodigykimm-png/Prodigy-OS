"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../../");
const PROVENANCE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-claim-provenance.js");
const EVIDENCE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-evidence-contract.js");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function sha256(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function claimSetHash(claimSet) {
  return sha256(stable({
    contract_version: claimSet.contract_version,
    sources: claimSet.sources,
    claims: claimSet.claims.map((claim) => ({
      claim_id: claim.claim_id, origin: claim.origin, text: claim.text, citation_ids: claim.citation_ids,
      derived_from_claim_ids: claim.derived_from_claim_ids, human_justification: claim.human_justification || null,
      dispute_target_claim_id: claim.dispute_target_claim_id || null,
    })),
    citations: claimSet.citations,
    disputes: claimSet.disputes,
  }));
}
function api() {
  delete require.cache[PROVENANCE_PATH];
  delete require.cache[EVIDENCE_PATH];
  return { provenance: require(PROVENANCE_PATH), evidence: require(EVIDENCE_PATH) };
}
function snapshot(sourceId, text, overrides = {}) {
  return {
    source_id: sourceId,
    source_revision: HASH_A,
    extractor_revision: HASH_B,
    source_text: text,
    source_content_hash: sha256(text),
    provider_window: { start: 0, end: text.length },
    source_kind: "immutable_source",
    ...overrides,
  };
}
function span(text, substring) {
  const start = text.indexOf(substring);
  assert.notEqual(start, -1, `fixture substring missing: ${substring}`);
  return { start, end: start + substring.length, span_digest: sha256(substring) };
}
function baseInput(overrides = {}) {
  const sourceText = "Immutable source says bounded review preserves trust.";
  return {
    source_snapshots: [snapshot("source_primary", sourceText)],
    claims: [{
      origin: "source_extract",
      text: "bounded review preserves trust",
      citations: [{ source_id: "source_primary", provider_span: span(sourceText, "bounded review preserves trust") }],
    }, {
      origin: "human_authored",
      text: "Review scope is approved by the maintainer.",
      human_justification: { author_id: "reviewer_primary", authored_at: "2026-08-25T00:00:00.000Z", reason: "Recorded review decision." },
    }, {
      origin: "ai_interpretation",
      text: "Bounded review should precede acceptance.",
      derivation_indices: [0, 1],
    }],
    ...overrides,
  };
}
function build(input = baseInput()) {
  const result = api().provenance.createClaimSet(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

test("exact source substring binding derives local IDs and maps provider spans to immutable source spans", () => {
  const { provenance, evidence } = api();
  const result = provenance.createClaimSet(baseInput());
  assert.equal(result.ok, true, JSON.stringify(result));
  const [extract, human, interpretation] = result.value.claims;
  assert.match(extract.claim_id, /^claim_[0-9a-f]{24}$/u);
  assert.match(extract.citation_ids[0], /^citation_[0-9a-f]{24}$/u);
  assert.deepEqual(extract.citations[0].source_span, { start: 22, end: 52 });
  assert.equal(extract.citations[0].span_digest, sha256("bounded review preserves trust"));
  assert.deepEqual(human.human_justification, { kind: "human_authored", author_id: "reviewer_primary", authored_at: "2026-08-25T00:00:00.000Z", reason: "Recorded review decision." });
  assert.deepEqual(interpretation.derived_from_claim_ids, [extract.claim_id, human.claim_id].sort());
  assert.equal(interpretation.origin, "ai_interpretation");
  assert.equal(interpretation.status, "unreviewed");
  assert.equal(evidence.createClaimSet(baseInput()).value.claim_set_hash, result.value.claim_set_hash, "evidence contract delegates deterministic provenance");
});

test("AI derivation chains require cited local claims and research requires an ingested external snapshot", () => {
  const { provenance } = api();
  const derived = build();
  assert.equal(derived.claims[2].derived_from_claim_ids.length, 2);

  const external = "External snapshot documents the result.";
  const research = provenance.createClaimSet({
    source_snapshots: [snapshot("source_external", external, { source_kind: "external_ingested_snapshot", ingested_at: "2026-08-25T00:00:00.000Z", source_url: "https://example.test/evidence" })],
    claims: [{ origin: "ai_research", text: "The external result is documented.", citations: [{ source_id: "source_external", provider_span: span(external, "External snapshot documents the result.") }] }],
  });
  assert.equal(research.ok, true, JSON.stringify(research));
  assert.equal(research.value.claims[0].origin, "ai_research");

  const missingDerivation = provenance.createClaimSet(baseInput({ claims: [baseInput().claims[2]] }));
  const bareUrl = provenance.createClaimSet({ source_snapshots: [], claims: [{ origin: "ai_research", text: "Research", source_url: "https://example.test" }] });
  const uningestedResearch = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], origin: "ai_research" }] }));
  assert.equal(missingDerivation.reason, "derivation_claim_required");
  assert.equal(bareUrl.reason, "bare_url_research_forbidden");
  assert.equal(uningestedResearch.reason, "external_snapshot_required");
});

test("AI interpretations require derivation ancestry that reaches cited source evidence", () => {
  const { provenance } = api();
  const humanOnly = provenance.createClaimSet({
    source_snapshots: [],
    claims: [{
      origin: "human_authored",
      text: "A reviewer recorded an observation.",
      human_justification: { author_id: "reviewer_primary", authored_at: "2026-08-25T00:00:00.000Z", reason: "Direct observation." },
    }, {
      origin: "ai_interpretation",
      text: "An AI restates the observation.",
      derivation_indices: [0],
    }],
  });
  assert.equal(humanOnly.reason, "cited_derivation_ancestry_required");

  const chained = provenance.createClaimSet({
    source_snapshots: baseInput().source_snapshots,
    claims: [{ ...baseInput().claims[0] }, {
      origin: "ai_interpretation",
      text: "A first grounded interpretation.",
      derivation_indices: [0],
    }, {
      origin: "ai_interpretation",
      text: "A second grounded interpretation.",
      derivation_indices: [1],
    }],
  });
  assert.equal(chained.ok, true, JSON.stringify(chained));
});

test("provider-relative spans cannot bisect UTF-16 surrogate pairs", () => {
  const { provenance } = api();
  const text = "A😀B";
  const source = snapshot("source_emoji", text);
  const valid = provenance.createClaimSet({
    source_snapshots: [source],
    claims: [{ origin: "source_extract", text: "😀", citations: [{ source_id: source.source_id, provider_span: { start: 1, end: 3, span_digest: sha256("😀") } }] }],
  });
  const lowSurrogateStart = provenance.createClaimSet({
    source_snapshots: [source],
    claims: [{ origin: "source_extract", text: "invalid", citations: [{ source_id: source.source_id, provider_span: { start: 2, end: 3, span_digest: sha256(text.slice(2, 3)) } }] }],
  });
  const splitEnd = provenance.createClaimSet({
    source_snapshots: [source],
    claims: [{ origin: "source_extract", text: "invalid", citations: [{ source_id: source.source_id, provider_span: { start: 1, end: 2, span_digest: sha256(text.slice(1, 2)) } }] }],
  });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(lowSurrogateStart.reason, "invalid_utf16_span_boundary");
  assert.equal(splitEnd.reason, "invalid_utf16_span_boundary");
});

test("authorization rejects a hash-recomputed cyclic AI derivation graph despite cited ancestry", () => {
  const { provenance } = api();
  const sourceText = "Immutable source supports the graph test.";
  const valid = build({
    source_snapshots: [snapshot("source_graph", sourceText)],
    claims: [{ origin: "source_extract", text: "graph test", citations: [{ source_id: "source_graph", provider_span: span(sourceText, "graph test") }] }, {
      origin: "ai_interpretation", text: "AI A", derivation_indices: [0],
    }, {
      origin: "ai_interpretation", text: "AI B", derivation_indices: [1],
    }],
  });
  const forged = JSON.parse(JSON.stringify(valid));
  forged.claims[1].derived_from_claim_ids = [forged.claims[0].claim_id, forged.claims[2].claim_id].sort();
  forged.claim_set_hash = claimSetHash(forged);
  assert.equal(forged.claim_set_hash, claimSetHash(forged), "the attacker recomputes the deterministic public hash");
  const result = provenance.transitionClaimSet(forged, {
    claim_set_hash: forged.claim_set_hash,
    claim_ids: [forged.claims[2].claim_id],
    status: "accepted",
    authorized_by: "reviewer_primary",
    authorized_at: "2026-08-25T00:00:00.000Z",
  });
  assert.equal(result.reason, "cyclic_derivation_graph");
  assert.equal(provenance.assessClaimStaleness(forged, {}).reason, "cyclic_derivation_graph");
});

test("corrections create disputes, and claim-hash-bound actions preserve persistent AI labels", () => {
  const { provenance, evidence } = api();
  const accepted = build();
  const correction = provenance.createClaimSet({
    source_snapshots: baseInput().source_snapshots,
    known_claim_ids: [accepted.claims[0].claim_id],
    claims: [{ ...baseInput().claims[0] }, { origin: "ai_correction", text: "The extracted claim needs qualification.", derivation_indices: [0], disputes_claim_index: 0 }],
  });
  assert.equal(correction.ok, true, JSON.stringify(correction));
  assert.equal(correction.value.disputes.length, 1);
  assert.equal(correction.value.disputes[0].target_claim_id, accepted.claims[0].claim_id);

  const authorization = { claim_set_hash: accepted.claim_set_hash, claim_ids: [accepted.claims[2].claim_id], status: "accepted", authorized_by: "reviewer_primary", authorized_at: "2026-08-25T00:00:00.000Z" };
  const authorized = evidence.authorizeClaimSet(accepted, authorization);
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  assert.equal(authorized.value.claims[2].status, "accepted");
  assert.equal(authorized.value.claims[2].origin, "ai_interpretation");
  assert.equal(evidence.authorizeClaimSet(accepted, { ...authorization, claim_set_hash: HASH_C }).reason, "claim_set_hash_mismatch");

  const rejected = provenance.transitionClaimSet(authorized.value, { ...authorization, status: "rejected", claim_ids: [accepted.claims[1].claim_id] });
  assert.equal(rejected.ok, true, JSON.stringify(rejected));
  assert.equal(rejected.value.claims.find((claim) => claim.claim_id === accepted.claims[1].claim_id).status, "rejected");
  const superseded = provenance.transitionClaimSet(rejected.value, { ...authorization, status: "superseded", claim_ids: [accepted.claims[0].claim_id] });
  assert.equal(superseded.ok, true, JSON.stringify(superseded));
  assert.equal(superseded.value.claims.find((claim) => claim.claim_id === accepted.claims[0].claim_id).status, "superseded");
});

test("forged provider IDs, fabricated citations, digest drift, and silent replacement fail closed or become selectively stale", () => {
  const { provenance } = api();
  const providerId = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], claim_id: "provider_claim" }] }));
  const providerCitationId = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], citations: [{ ...baseInput().claims[0].citations[0], citation_id: "provider_citation" }] }] }));
  const fabricated = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], citations: [{ source_id: "source_unknown", provider_span: { start: 0, end: 3, span_digest: sha256("bad") } }] }] }));
  const outOfRange = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], citations: [{ source_id: "source_primary", provider_span: { start: 0, end: 999, span_digest: sha256("bad") } }] }] }));
  const drifted = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], citations: [{ source_id: "source_primary", provider_span: { ...span(baseInput().source_snapshots[0].source_text, "bounded review preserves trust"), span_digest: HASH_C } }] }] }));
  assert.equal(providerId.reason, "provider_id_forbidden");
  assert.equal(providerCitationId.reason, "provider_id_forbidden");
  assert.equal(fabricated.reason, "unknown_source_snapshot");
  assert.equal(outOfRange.reason, "invalid_provider_span");
  assert.equal(drifted.reason, "span_digest_mismatch");

  const first = "First immutable source supports alpha.";
  const second = "Second immutable source supports beta.";
  const claimSet = build({
    source_snapshots: [snapshot("source_first", first), snapshot("source_second", second)],
    claims: [
      { origin: "source_extract", text: "alpha", citations: [{ source_id: "source_first", provider_span: span(first, "alpha") }] },
      { origin: "source_extract", text: "beta", citations: [{ source_id: "source_second", provider_span: span(second, "beta") }] },
      { origin: "ai_interpretation", text: "alpha derived", derivation_indices: [0] },
    ],
  });
  const replaced = provenance.assessClaimStaleness(claimSet, { source_first: snapshot("source_first", "Silently replaced bytes.", { source_revision: HASH_C }), source_second: snapshot("source_second", second) });
  assert.equal(replaced.ok, true, JSON.stringify(replaced));
  assert.deepEqual(replaced.value.stale_claim_ids, [claimSet.claims[0].claim_id, claimSet.claims[2].claim_id].sort());
  assert.deepEqual(replaced.value.current_claim_ids, [claimSet.claims[1].claim_id]);
});

test("malformed input and untrusted text remain typed zero-write data", () => {
  const { provenance } = api();
  const malformed = provenance.createClaimSet(null);
  const untrusted = provenance.createClaimSet(baseInput({ claims: [{ ...baseInput().claims[0], text: "untrusted provider text" }] }));
  assert.equal(malformed.reason, "malformed_input");
  assert.equal(untrusted.ok, true, JSON.stringify(untrusted));
  assert.equal(untrusted.value.write_counters.writer, 0);
});

test("exported provenance seams reject oversized, deep, cyclic, proxy, and accessor inputs without invoking getters", () => {
  const { provenance } = api();
  let getterCalls = 0;
  const accessorInput = {};
  Object.defineProperty(accessorInput, "claims", { enumerable: true, get() { getterCalls += 1; return []; } });
  const cyclicInput = { source_snapshots: [], claims: [] };
  cyclicInput.self = cyclicInput;
  let deepInput = { source_snapshots: [], claims: [] };
  for (let depth = 0; depth < 40; depth += 1) deepInput = { child: deepInput };
  const oversized = baseInput({ claims: Array.from({ length: 1500 }, (_, index) => ({
    origin: "human_authored",
    text: `Claim ${index}`,
    human_justification: { author_id: "reviewer_primary", authored_at: "2026-08-25T00:00:00.000Z", reason: "Bounded review." },
  })) });
  const proxied = new Proxy(baseInput(), {});

  for (const input of [accessorInput, cyclicInput, deepInput, oversized, proxied]) {
    const result = provenance.createClaimSet(input);
    assert.equal(result.ok, false);
    assert.equal(result.writer_count, 0);
  }
  for (const result of [
    provenance.validateClaimSet(accessorInput),
    provenance.transitionClaimSet(accessorInput, accessorInput),
    provenance.assessClaimStaleness(accessorInput, accessorInput),
  ]) assert.equal(result.ok, false);
  assert.equal(getterCalls, 0);
});
