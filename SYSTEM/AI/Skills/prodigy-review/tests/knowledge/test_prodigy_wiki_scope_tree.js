"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const api = require(path.join(ROOT, "SYSTEM/Views/llmwiki-golden-wiki-orchestrator.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function long(label, count = 140) {
  return `${label} `.repeat(count);
}

test("heading ranges form a stable H1-H3 tree with parent spans", () => {
  const source = [
    "# 전체 안내", long("전체"),
    "## 첫 장", long("첫째"),
    "### 첫 장 세부", long("세부"),
    "## 둘째 장", long("둘째"),
    "# 부록", long("부록"),
  ].join("\n");

  const tree = api.headingRangeTree(source);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].level, 1);
  assert.deepEqual(tree[0].children.map((row) => row.title), ["첫 장", "둘째 장"]);
  assert.equal(tree[0].children[0].children[0].title, "첫 장 세부");
  assert.equal(tree[0].end, tree[1].start);
  assert.ok(tree[0].preview.length > 0);
  assert.ok(["short", "medium", "large"].includes(tree[0].size));
});

test("oversized parent range returns only its child tree before provider calls", async () => {
  const source = [
    "# 대형 자료", long("머리말", 80),
    "## 선택 가능한 첫 장", long("첫 장", 700),
    "## 선택 가능한 둘째 장", long("둘째 장", 700),
  ].join("\n");
  const file = { path: "INBOX/대형 자료.md" };
  let providerCalls = 0;
  const vault = {
    getAbstractFileByPath: (pathValue) => pathValue === file.path ? file : null,
    cachedRead: async () => source,
  };
  const orchestrator = api.create({
    vault,
    hash,
    analysisScope: { createAnalysisScope: (value) => value },
    chunkManifest: {
      createChunkManifest: (scope) => ({
        chunks: Array.from(
          { length: scope.source_text.includes("선택 가능한 둘째 장") ? 40 : 10 },
          (_, index) => ({ text: `chunk ${index}` }),
        ),
      }),
    },
    limits: { max_chunks: 1, max_bytes: 24_576 },
    gate: { evaluate: () => { throw new Error("gate_not_expected"); } },
    runPlan: async () => { providerCalls += 1; throw new Error("provider_not_expected"); },
    compilePlan: async () => { throw new Error("compile_not_expected"); },
    getDocuments: () => [],
  });

  const full = await orchestrator.run({ source_path: file.path });
  assert.equal(full.status, "scope_required");
  assert.equal(full.provider_calls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(full.range_tree.length, 1);

  const parent = full.range_tree[0];
  const parentPreflight = await orchestrator.preflight({
    source_path: file.path,
    expected_content_hash: hash.sha256(source),
    scope: parent,
  });
  assert.ok(parentPreflight.packs > api.MAX_DIRECT_PACKS, JSON.stringify(parentPreflight));
  const narrowedParent = await orchestrator.run({
    source_path: file.path,
    expected_content_hash: hash.sha256(source),
    scope: parent,
  });
  assert.equal(narrowedParent.status, "scope_required");
  assert.deepEqual(
    narrowedParent.range_tree.map((row) => row.title),
    ["선택 가능한 첫 장", "선택 가능한 둘째 장"],
  );
  assert.equal(narrowedParent.provider_calls, 0);
  assert.equal(providerCalls, 0);

  const selected = await orchestrator.preflight({
    source_path: file.path,
    expected_content_hash: hash.sha256(source),
    scope: narrowedParent.range_tree[0],
  });
  assert.equal(selected.ok, true);
  assert.ok(selected.packs <= api.MAX_DIRECT_PACKS);
  assert.equal(selected.scope.start, narrowedParent.range_tree[0].start);
  assert.equal(selected.scope.end, narrowedParent.range_tree[0].end);
});

test("range selection rejects a changed source revision", async () => {
  const source = `# 자료\n${long("본문")}`;
  const file = { path: "INBOX/자료.md" };
  const orchestrator = api.create({
    vault: {
      getAbstractFileByPath: (pathValue) => pathValue === file.path ? file : null,
      cachedRead: async () => source,
    },
    hash,
    analysisScope: { createAnalysisScope: (value) => value },
    chunkManifest: { createChunkManifest: () => ({ chunks: [{ text: source }] }) },
    limits: { max_chunks: 4, max_bytes: 24_576 },
    gate: { evaluate: () => { throw new Error("gate_not_expected"); } },
    runPlan: async () => { throw new Error("provider_not_expected"); },
    compilePlan: async () => { throw new Error("compile_not_expected"); },
    getDocuments: () => [],
  });
  const range = api.headingRangeTree(source)[0];
  const result = await orchestrator.preflight({
    source_path: file.path,
    expected_content_hash: "f".repeat(64),
    scope: range,
  });
  assert.deepEqual(result, { ok: false, reason: "source_revision_changed" });
});
