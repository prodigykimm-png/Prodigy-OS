"use strict";

// Failing-first proof for crowded-chunk fan-out:
// one manifest chunk with >64 semantic candidates must NOT fail with
// semantic_unit_limit_exceeded. It must fan out to multiple provider calls
// under the parent chunk key, with parent-relative spans tiling the text.

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const batchProvider = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"));
const evidenceCandidates = require(path.join(ROOT, "SYSTEM/Views/llmwiki-evidence-candidates.js"));

function crowdedText(lines) {
  const out = [];
  for (let i = 0; i < lines; i += 1) out.push(`관찰 기록 ${i + 1}번: 배치 경계는 청크 단위로만 확정된다`);
  return out.join("\n");
}

const PARENT_TEXT = crowdedText(70);
const PARENT_CANDIDATES = evidenceCandidates.createSemantic(PARENT_TEXT, { max_bytes: 2048 });

test("crowded chunk fans out instead of refusing", async () => {
  assert.equal(PARENT_CANDIDATES.length, 70);
  const calls = [];
  const consumerRuntime = {
    requestStructured: async (options) => {
      calls.push(options);
      const chunks = JSON.parse(options.prompt).chunks;
      assert.ok(chunks.length >= 1 && chunks.length <= 4);
      const results = chunks.map((chunk) => ({
        chunk_key: chunk.key,
        outcome: "proposals",
        items: (chunk.evidence_candidates || []).map((c) => ({
          role: "source_summary",
          evidence_key: c.key,
          evidence_quote: c.text,
          claims: [c.text.slice(0, 40)],
          review_reasons: [],
          related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true,
    run_id: "run-crowded",
    mode: "semantic",
    chunks: [{ key: "chunk_parent", text: PARENT_TEXT }],
    candidate_ids: [],
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1, `two sub-chunks fit one pack: ${calls.length} call(s)`);
  const sentKeys = JSON.parse(calls[0].prompt).chunks.map((c) => c.key);
  assert.deepEqual(sentKeys, ["chunk_parent__p0", "chunk_parent__p1"]);
  for (const c of JSON.parse(calls[0].prompt).chunks) assert.ok(c.evidence_candidates.length <= 64);
  assert.equal(result.artifacts.length, 1);
  const artifact = result.artifacts[0];
  assert.equal(artifact.chunk_key, "chunk_parent");
  assert.equal(artifact.items.length, 70);
  // Merged spans must match every parent candidate span exactly once.
  const spans = artifact.items.map((item) => item.span);
  const bySpan = new Map(spans.map((s, i) => [`${s.start}:${s.end}`, i]));
  for (const c of PARENT_CANDIDATES) {
    assert.ok(bySpan.has(`${c.start}:${c.end}`), `missing span ${c.start}:${c.end}`);
    assert.equal(artifact.items[bySpan.get(`${c.start}:${c.end}`)].evidence_quote, PARENT_TEXT.slice(c.start, c.end));
  }
  // Evidence keys unique and pattern-valid after merge.
  const keys = artifact.items.map((item) => item.evidence_key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^evidence_[1-9][0-9]{0,2}$/u);
});

test("many candidates span packs", async () => {
  const text = crowdedText(300);
  let calls = 0;
  const consumerRuntime = {
    requestStructured: async (options) => {
      calls += 1;
      const body = JSON.parse(options.prompt);
      assert.ok(body.chunks.length >= 1 && body.chunks.length <= 4);
      const results = body.chunks.map((c) => ({
        chunk_key: c.key,
        outcome: "proposals",
        items: (c.evidence_candidates || []).map((cand) => ({
          role: "source_summary",
          evidence_key: cand.key,
          evidence_quote: cand.text,
          claims: [cand.text.slice(0, 40)],
          review_reasons: [],
          related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true,
    run_id: "run-many",
    mode: "semantic",
    chunks: [{ key: "chunk_big", text }],
    candidate_ids: [],
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].items.length, 300);
});

test("heading-like boundary lines are not reclassified", async () => {
  const lines = [];
  for (let i = 0; i < 65; i += 1) lines.push(`- # fact ${i + 1} content here`);
  const text = lines.join("\n");
  const calls = [];
  const consumerRuntime = {
    requestStructured: async (options) => {
      calls.push(options);
      const body = JSON.parse(options.prompt);
      const results = body.chunks.map((c) => ({
        chunk_key: c.key,
        outcome: "proposals",
        items: (c.evidence_candidates || []).map((cand) => ({
          role: "source_summary", evidence_key: cand.key, evidence_quote: cand.text,
          claims: [cand.text.slice(0, 40)], review_reasons: [], related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true, run_id: "run-heading", mode: "semantic",
    chunks: [{ key: "chunk_head", text }], candidate_ids: [],
  });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].items.length, 65);
});

test("mixed part outcomes merge to proposals with parent keys", async () => {
  const text = crowdedText(70);
  const consumerRuntime = {
    requestStructured: async (options) => {
      const body = JSON.parse(options.prompt);
      const results = body.chunks.map((c, chunkIndex) => ({
        chunk_key: c.key,
        outcome: chunkIndex === 0 ? "no_change" : "proposals",
        items: (c.evidence_candidates || []).slice().reverse().map((cand) => ({
          role: "source_summary", evidence_key: cand.key, evidence_quote: cand.text,
          claims: [cand.text.slice(0, 40)], review_reasons: [], related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true, run_id: "run-mixed", mode: "semantic",
    chunks: [{ key: "chunk_mix", text }], candidate_ids: [],
  });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  const artifact = result.artifacts[0];
  assert.equal(artifact.outcome, "proposals");
  assert.equal(artifact.items.length, 70);
  const keys = artifact.items.map((item) => item.evidence_key);
  assert.equal(new Set(keys).size, 70);
  const bySpan = new Map(artifact.items.map((item) => [`${item.span.start}:${item.span.end}`, item]));
  for (const c of PARENT_CANDIDATES) {
    const item = bySpan.get(`${c.start}:${c.end}`);
    assert.ok(item, `missing span ${c.start}:${c.end}`);
    assert.equal(item.evidence_key, c.key);
    assert.equal(item.evidence_quote, PARENT_TEXT.slice(c.start, c.end));
  }
});

test("hold contaminates merged outcome", async () => {
  const text = crowdedText(70);
  const consumerRuntime = {
    requestStructured: async (options) => {
      const body = JSON.parse(options.prompt);
      const results = body.chunks.map((c, chunkIndex) => ({
        chunk_key: c.key,
        outcome: chunkIndex === 0 ? "no_change" : "hold",
        items: (c.evidence_candidates || []).map((cand) => ({
          role: cand.key.endsWith("1") ? "hold" : "source_summary",
          evidence_key: cand.key, evidence_quote: cand.text,
          claims: [cand.text.slice(0, 40)], review_reasons: [], related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true, run_id: "run-hold", mode: "semantic",
    chunks: [{ key: "chunk_hold", text }], candidate_ids: [],
  });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].outcome, "hold");
  assert.equal(result.artifacts[0].items.length, 70);
});

test("derived keys never collide with crafted input keys", async () => {
  const text = crowdedText(65);
  const ordinary = "일반 청크 본문 한 줄이다";
  const seenPrompts = [];
  const consumerRuntime = {
    requestStructured: async (options) => {
      const body = JSON.parse(options.prompt);
      seenPrompts.push(body);
      const results = body.chunks.map((c) => ({
        chunk_key: c.key,
        outcome: "proposals",
        items: (c.evidence_candidates || []).map((cand) => ({
          role: "source_summary", evidence_key: cand.key, evidence_quote: cand.text,
          claims: [cand.text.slice(0, 40)], review_reasons: [], related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true, run_id: "run-collide", mode: "semantic",
    chunks: [
      { key: "chunk_parent", text },
      { key: "chunk_parent__p0", text: ordinary },
    ],
    candidate_ids: [],
  });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal(result.artifacts.length, 2);
  const byKey = new Map(result.artifacts.map((a) => [a.chunk_key, a]));
  assert.equal(byKey.get("chunk_parent").items.length, 65);
  assert.equal(byKey.get("chunk_parent__p0").items.length, 1);
  assert.equal(byKey.get("chunk_parent__p0").items[0].evidence_quote, ordinary);
});

test("derived keys respect the 128-char key contract", async () => {
  const longParent = "c".repeat(124);
  const text = crowdedText(65);
  const ordinary = "일반 청크 본문 한 줄이다";
  const sentKeys = [];
  const consumerRuntime = {
    requestStructured: async (options) => {
      const body = JSON.parse(options.prompt);
      for (const c of body.chunks) {
        assert.ok(c.key.length >= 3 && c.key.length <= 128, `key length ${c.key.length}`);
        sentKeys.push(c.key);
      }
      const results = body.chunks.map((c) => ({
        chunk_key: c.key,
        outcome: "proposals",
        items: (c.evidence_candidates || []).map((cand) => ({
          role: "source_summary", evidence_key: cand.key, evidence_quote: cand.text,
          claims: [cand.text.slice(0, 40)], review_reasons: [], related_candidate_ids: [],
        })),
      }));
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true, run_id: "run-keylen", mode: "semantic",
    chunks: [
      { key: longParent, text },
      { key: `${longParent}__p0`, text: ordinary },
    ],
    candidate_ids: [],
  });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  assert.equal(result.artifacts.length, 2);
  const byKey = new Map(result.artifacts.map((a) => [a.chunk_key, a]));
  assert.equal(byKey.get(longParent).items.length, 65);
  assert.equal(byKey.get(`${longParent}__p0`).items.length, 1);
});

test("uncrowded chunk keeps the single-call path", async () => {
  let calls = 0;
  let seenKeys = null;
  const consumerRuntime = {
    requestStructured: async (options) => {
      calls += 1;
      seenKeys = JSON.parse(options.prompt).chunks.map((c) => c.key);
      const results = JSON.parse(options.prompt).chunks.map((c) => {
        const cands = evidenceCandidates.createSemantic(c.text, { max_bytes: 2048 });
        return {
          chunk_key: c.key,
          outcome: "no_change",
          items: cands.map((cand) => ({
            role: "source_summary",
            evidence_key: cand.key,
            evidence_quote: cand.text,
            claims: [cand.text.slice(0, 40)],
            review_reasons: [],
            related_candidate_ids: [],
          })),
        };
      });
      return { payload: { status: "ok", results } };
    },
  };
  const provider = batchProvider.createBatchAnalysisProvider({ consumerRuntime });
  const result = await provider({
    outbound_allowed: true,
    run_id: "run-normal",
    mode: "semantic",
    chunks: [{ key: "chunk_alpha", text: "짧은 본문 한 줄이다" }],
    candidate_ids: [],
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.deepEqual(seenKeys, ["chunk_alpha"]);
});
