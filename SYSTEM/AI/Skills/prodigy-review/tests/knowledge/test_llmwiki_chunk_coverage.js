"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const scopeApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js"));
const manifestApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-manifest.js"));
const coverageApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-coverage-store.js"));
const cacheApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-cache.js"));
const stateApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-incremental-analysis-state.js"));

function revision(text, sourceId = "source_coverage_alpha") {
  return {
    source_id: sourceId,
    source_path: "INBOX/coverage.md",
    content_hash: hash.sha256(text),
    source_text: text,
  };
}

function scope(text, sourceId) {
  return scopeApi.createAnalysisScope(revision(text, sourceId));
}

function vault(seed = {}, failures = {}) {
  const files = { ...seed };
  return {
    files,
    getAbstractFileByPath(filePath) { return Object.hasOwn(files, filePath) ? { path: filePath } : null; },
    async cachedRead(file) { return files[file.path]; },
    async createFolder(folderPath) { files[folderPath] = "__folder__"; },
    async create(filePath, text) {
      if (failures.create) throw new Error("create_failed");
      files[filePath] = text;
      return { path: filePath };
    },
    async modify(file, text) {
      if (failures.modify) throw new Error("modify_failed");
      files[file.path] = text;
      return file;
    },
  };
}

async function persistAll(coverage, manifest, scoped) {
  for (const chunk of manifest.chunks) await coverage.recordReceipt({ manifest, scope: scoped, chunk, artifact: { result: chunk.semantic_id } });
}

test("large mixed Unicode chunking completes within the bounded timeout", () => {
  const manifestPath = path.join(ROOT, "SYSTEM/Views/llmwiki-chunk-manifest.js");
  const scopePath = path.join(ROOT, "SYSTEM/Views/llmwiki-analysis-scope.js");
  const hashPath = path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js");
  const child = `
    const hash = require(${JSON.stringify(hashPath)});
    const scopeApi = require(${JSON.stringify(scopePath)});
    const manifestApi = require(${JSON.stringify(manifestPath)});
    let text = "";
    while (Buffer.byteLength(text, "utf8") < 256 * 1024) text += "ASCII text 日本語 😀\\n";
    const scoped = scopeApi.createAnalysisScope({ source_id: "large_unicode", source_path: "INBOX/large.md", content_hash: hash.sha256(text), source_text: text });
    const manifest = manifestApi.createChunkManifest(scoped);
    if (manifest.chunks.map(chunk => chunk.text).join("") !== text) throw new Error("coverage");
    if (!manifest.chunks.every(chunk => Buffer.byteLength(chunk.text, "utf8") <= manifestApi.DEFAULT_MAX_BYTES)) throw new Error("size");
    if (!manifest.chunks.every(chunk => !(text.charCodeAt(chunk.end - 1) >= 0xd800 && text.charCodeAt(chunk.end - 1) <= 0xdbff) && !(text.charCodeAt(chunk.end) >= 0xdc00 && text.charCodeAt(chunk.end) <= 0xdfff))) throw new Error("surrogate");
    process.stdout.write(String(manifest.chunks.length));
  `;
  const output = execFileSync(process.execPath, ["-e", child], { encoding: "utf8", timeout: 5000 });
  assert.ok(Number(output) > 1);
});

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function forgedManifest(scoped, manifest, replacement) {
  const original = manifest.chunks[0];
  const textHash = hash.sha256(replacement);
  const semanticId = `semantic_${hash.sha256(replacement.trim().normalize("NFC")).slice(0, 24)}`;
  const chunk = {
    ...original,
    text: replacement,
    text_hash: textHash,
    semantic_id: semanticId,
    instance_id: `instance_${hash.sha256(stable({ semantic_id: semanticId, occurrence: original.occurrence, text_hash: textHash })).slice(0, 24)}`,
  };
  const chunks = [chunk, ...manifest.chunks.slice(1)];
  const body = { scope_id: scoped.scope_id, max_bytes: manifest.max_bytes, chunks: chunks.map(item => ({ semantic_id: item.semantic_id, instance_id: item.instance_id, start: item.start, end: item.end, text_hash: item.text_hash })) };
  return { ...manifest, chunks, manifest_id: `manifest_${hash.sha256(stable(body)).slice(0, 24)}` };
}

test("strict manifest validation rejects self-consistent replacement text", () => {
  const text = "# Alpha\nbody\n";
  const scoped = scope(text);
  const manifest = manifestApi.createChunkManifest(scoped);
  const forged = forgedManifest(scoped, manifest, "# Omega\nbody\n");
  assert.equal(manifestApi.validateChunkManifest(forged, scoped).ok, false);
});

test("chunks cover exact UTF-16 spans without overlap and never split surrogate pairs", () => {
  const text = "# Alpha\nfirst paragraph.\n\n# Beta\nemoji 😀 stays whole.\n";
  const scoped = scope(text);
  const manifest = manifestApi.createChunkManifest(scoped, { max_bytes: 20 });

  assert.equal(manifest.chunks.map(chunk => text.slice(chunk.start, chunk.end)).join(""), text);
  assert.equal(manifestApi.validateChunkManifest(manifest, scoped).ok, true);
  assert.ok(manifest.chunks.every(chunk => Object.isFrozen(chunk) && chunk.text_hash === hash.sha256(text.slice(chunk.start, chunk.end))));
  for (const chunk of manifest.chunks.slice(0, -1)) {
    assert.notEqual(text.charCodeAt(chunk.end - 1) >= 0xd800 && text.charCodeAt(chunk.end - 1) <= 0xdbff, true);
    assert.notEqual(text.charCodeAt(chunk.end) >= 0xdc00 && text.charCodeAt(chunk.end) <= 0xdfff, true);
  }
  assert.throws(() => manifestApi.assertExactCoverage({ ...manifest, chunks: manifest.chunks.slice(1) }), /gap_in_chunk_coverage/u);
  assert.throws(() => manifestApi.assertExactCoverage({ ...manifest, chunks: [{ ...manifest.chunks[0], end: manifest.chunks[0].start }] }), /malformed_chunk_span/u);
  assert.throws(() => manifestApi.assertExactCoverage({ ...manifest, chunks: [manifest.chunks[0], { ...manifest.chunks[0], instance_id: "instance_overlap" }] }), /overlap_in_chunk_coverage/u);
});

test("chunk splitting follows heading, paragraph, sentence, line, then slice fallback", () => {
  const cases = [
    ["# One\na\n# Two\nb", "heading"],
    ["alpha paragraph\n\nbeta paragraph", "paragraph"],
    ["First sentence. Second sentence", "sentence"],
    ["first line\nsecond line", "line"],
    ["😀😀😀😀😀😀😀😀😀😀", "slice"],
  ];
  for (const [text, expected] of cases) {
    const manifest = manifestApi.createChunkManifest(scope(text), { max_bytes: expected === "slice" ? 9 : 18 });
    assert.equal(manifest.chunks[0].boundary_kind, expected);
    assert.equal(manifest.chunks.map(chunk => chunk.text).join(""), text);
  }
});

test("uses the last eligible boundary in the byte window and preserves deterministic exact coverage", () => {
  const text = Array.from({ length: 120 }, (_, index) => `sentence ${index} has useful content.`).join(" ");
  const scoped = scope(text, "source_last_boundary");
  const first = manifestApi.createChunkManifest(scoped, { max_bytes: 1200 });
  const second = manifestApi.createChunkManifest(scoped, { max_bytes: 1200 });
  const chunk = first.chunks[0];
  const candidates = [...text.slice(0, 1200).matchAll(/[.!?](?:[ \t]+|\n|$)/gu)]
    .map(match => match.index + match[0].length).filter(end => end > 0);

  assert.equal(chunk.boundary_kind, "sentence");
  assert.equal(chunk.end, candidates.at(-1));
  assert.ok(Buffer.byteLength(chunk.text, "utf8") <= 1200);
  assert.ok(Buffer.byteLength(chunk.text, "utf8") > 1000, "boundary selection should not fragment the window");
  assert.equal(first.chunks.map(item => item.text).join(""), text);
  assert.equal(manifestApi.assertExactCoverage(first, scoped), true);
  assert.deepEqual(first, second);
  assert.ok(first.chunks.every(item => Buffer.byteLength(item.text, "utf8") <= 1200));
  assert.ok(first.chunks.every(item => {
    const end = item.end;
    return !(text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff)
      && !(text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff);
  }));
});

test("semantic cache continuity survives a preceding insertion but renamed heading misses once", async () => {
  const original = "# Alpha\nunchanged alpha.\n\n# Beta\nunchanged beta.\n";
  const inserted = "# Intro\nnew introduction.\n\n" + original;
  const edited = "# Alpha renamed\nunchanged alpha.\n\n# Beta\nunchanged beta.\n";
  const cache = cacheApi.createAnalysisCache({ vault: vault() });
  const originalScope = scope(original);
  const originalManifest = manifestApi.createChunkManifest(originalScope);
  for (const chunk of originalManifest.chunks) await cache.put({ chunk, artifact: { analysis: chunk.semantic_id } });
  const insertedScope = scope(inserted);
  const stable = await cache.lookup(manifestApi.createChunkManifest(insertedScope), insertedScope);
  assert.equal(stable.misses.length, 1);
  assert.equal(stable.hits.length, originalManifest.chunks.length - 1);
  const editedScope = scope(edited);
  const renamed = await cache.lookup(manifestApi.createChunkManifest(editedScope), editedScope);
  assert.equal(renamed.misses.length, 1);
  assert.equal(renamed.hits.length, originalManifest.chunks.length - 1);
});

test("duplicate occurrences with an empty cache are all misses and remain analyzable", async () => {
  const text = "# Same\nrepeat\n\n# Same\nrepeat\n";
  const scoped = scope(text);
  const manifest = manifestApi.createChunkManifest(scoped);
  const result = await cacheApi.createAnalysisCache({ vault: vault() }).lookup(manifest, scoped);
  assert.equal(result.ok, true);
  assert.equal(result.hits.length, 0);
  assert.equal(result.misses.length, manifest.chunks.length);
});

test("identical text under different source ids has distinct instance ids", () => {
  const text = "# Same\nrepeat\n";
  const left = manifestApi.createChunkManifest(scope(text, "source_left"));
  const right = manifestApi.createChunkManifest(scope(text, "source_right"));
  assert.notEqual(left.chunks[0].instance_id, right.chunks[0].instance_id);
});

test("duplicate occurrences retain distinct instances and conservatively miss cache continuity", async () => {
  const text = "# Same\nrepeat\n\n# Same\nrepeat\n";
  const manifest = manifestApi.createChunkManifest(scope(text));
  assert.equal(new Set(manifest.chunks.map(chunk => chunk.instance_id)).size, 2);
  assert.equal(new Set(manifest.chunks.map(chunk => chunk.semantic_id)).size, 1);
  const cache = cacheApi.createAnalysisCache({ vault: vault() });
  await cache.put({ chunk: manifest.chunks[0], artifact: { analysis: "first" } });
  await cache.put({ chunk: manifest.chunks[1], artifact: { analysis: "second" } });
  const result = await cache.lookup(manifest, scope(text));
  assert.equal(result.ok, true);
  assert.equal(result.hits.length, 0);
  assert.equal(result.misses.length, 2);
  await assert.rejects(cache.put({ chunk: manifest.chunks[0], artifact: { analysis: "retry" }, retry_generation: cacheApi.MAX_RETRY_GENERATION + 1 }), /retry_generation_exhausted/u);
});

test("cache and coverage quarantine corrupt persisted artifacts and preserve newest retry generation", async () => {
  const scoped = scope("# Alpha\nbody\n");
  const manifest = manifestApi.createChunkManifest(scoped);
  const cacheVault = vault();
  const cache = cacheApi.createAnalysisCache({ vault: cacheVault });
  await cache.put({ chunk: manifest.chunks[0], artifact: { result: "new" }, retry_generation: 1 });
  assert.equal((await cache.put({ chunk: manifest.chunks[0], artifact: { result: "new" }, retry_generation: 1 })).state, "replayed");
  await assert.rejects(cache.put({ chunk: manifest.chunks[0], artifact: { result: "conflict" }, retry_generation: 1 }), /retry_generation_conflict/u);
  await cache.put({ chunk: manifest.chunks[0], artifact: { result: "late" }, retry_generation: 0 });
  assert.equal((await cache.lookup(manifest, scoped)).hits[0].artifact.result, "new");
  const cacheState = JSON.parse(cacheVault.files[cacheApi.DEFAULT_CACHE_PATH]);
  cacheState.entries[manifest.chunks[0].semantic_id][0].artifact.result = "poisoned";
  cacheVault.files[cacheApi.DEFAULT_CACHE_PATH] = JSON.stringify(cacheState);
  const corruptCache = cacheApi.createAnalysisCache({ vault: cacheVault });
  assert.equal((await corruptCache.lookup(manifest, scoped)).state, "quarantined");

  const coverageVault = vault();
  const coverage = coverageApi.createChunkCoverageStore({ vault: coverageVault });
  await coverage.recordReceipt({ manifest, scope: scoped, chunk: manifest.chunks[0], artifact: { result: "done" } });
  const coverageState = JSON.parse(coverageVault.files[coverageApi.DEFAULT_COVERAGE_PATH]);
  coverageState.manifests[manifest.manifest_id].receipts[manifest.chunks[0].instance_id].receipt_id = "coverage_forged";
  coverageVault.files[coverageApi.DEFAULT_COVERAGE_PATH] = JSON.stringify(coverageState);
  assert.equal((await coverageApi.createChunkCoverageStore({ vault: coverageVault }).status(manifest, scoped)).state, "quarantined");
});

test("cancelled or superseded requests reject late cache and coverage writes", async () => {
  const firstScope = scope("# Alpha\nbody\n", "source_generation_alpha");
  const firstManifest = manifestApi.createChunkManifest(firstScope);
  const authority = scopeApi.createAnalysisRequestAuthority();
  const first = authority.begin(firstScope);
  authority.cancel(first);
  const cacheVault = vault();
  const cache = cacheApi.createAnalysisCache({ vault: cacheVault });
  await assert.rejects(cache.put({ chunk: firstManifest.chunks[0], artifact: { result: "late" }, authority, request: first }), /analysis_request_inactive/u);
  assert.equal(Object.hasOwn(cacheVault.files, cacheApi.DEFAULT_CACHE_PATH), false);

  const secondScope = scope("# Alpha\nrevised\n", "source_generation_alpha");
  authority.begin(secondScope);
  const coverageVault = vault();
  const coverage = coverageApi.createChunkCoverageStore({ vault: coverageVault });
  await assert.rejects(coverage.recordReceipt({ manifest: firstManifest, scope: firstScope, chunk: firstManifest.chunks[0], artifact: { result: "late" }, authority, request: first }), /analysis_request_inactive/u);
  assert.equal(Object.hasOwn(coverageVault.files, coverageApi.DEFAULT_COVERAGE_PATH), false);
});

test("coverage is durable, partial/cancelled work stays incomplete, and corrupt cache is quarantined", async () => {
  const text = "# Alpha\na\n\n# Beta\nb\n";
  const scoped = scope(text);
  const manifest = manifestApi.createChunkManifest(scoped, { max_bytes: 12 });
  const storeVault = vault();
  const coverage = coverageApi.createChunkCoverageStore({ vault: storeVault });
  await coverage.recordReceipt({ manifest, scope: scoped, chunk: manifest.chunks[0], artifact: { status: "done" } });
  assert.equal((await coverage.status(manifest, scoped)).complete, false);
  await persistAll(coverage, manifest, scoped);
  assert.equal((await coverage.status(manifest, scoped)).complete, true);
  const restart = coverageApi.createChunkCoverageStore({ vault: storeVault });
  assert.equal((await restart.status(manifest, scoped)).complete, true);

  const corrupt = cacheApi.createAnalysisCache({ vault: vault({ "SYSTEM/PRIVATE/llmwiki-analysis-cache.json": "{bad" }) });
  const quarantined = await corrupt.lookup(manifest, scoped);
  assert.equal(quarantined.ok, false);
  assert.equal(quarantined.state, "quarantined");
  assert.equal(quarantined.reason, "corrupt_cache_quarantined");

  const failed = coverageApi.createChunkCoverageStore({ vault: vault({}, { create: true }) });
  await assert.rejects(failed.recordReceipt({ manifest, scope: scoped, chunk: manifest.chunks[0], artifact: { status: "done" } }), /coverage_persist_failed/u);
  assert.equal((await failed.status(manifest, scoped)).complete, false);
});

test("repeated partial restarts never report complete before the final durable receipt", async () => {
  const scoped = scope("# Alpha\na\n\n# Beta\nb\n\n# Gamma\nc\n");
  const manifest = manifestApi.createChunkManifest(scoped, { max_bytes: 12 });
  const storeVault = vault();
  for (let index = 0; index < manifest.chunks.length - 1; index += 1) {
    const resumed = coverageApi.createChunkCoverageStore({ vault: storeVault });
    await resumed.recordReceipt({ manifest, scope: scoped, chunk: manifest.chunks[index], artifact: { interrupted_after: index } });
    assert.equal((await resumed.status(manifest, scoped)).complete, false);
  }
  const finalResume = coverageApi.createChunkCoverageStore({ vault: storeVault });
  await finalResume.recordReceipt({ manifest, scope: scoped, chunk: manifest.chunks.at(-1), artifact: { interrupted_after: "final" } });
  assert.equal((await finalResume.status(manifest, scoped)).complete, true);
});

test("v1 state is stale, while v2 completion is hash-bound to durable exact coverage", async () => {
  const text = "# Alpha\na\n\n# Beta\nb\n";
  const scoped = scope(text, "source_state_alpha");
  const manifest = manifestApi.createChunkManifest(scoped, { max_bytes: 12 });
  const legacy = {
    schema_version: 1,
    completed: {
      source_state_alpha: {
        source_path: scoped.source_path,
        content_hash: scoped.content_hash,
        analysis_contract_version: 1,
      },
    },
  };
  const stateVault = vault({ [stateApi.DEFAULT_STATE_PATH]: JSON.stringify(legacy) });
  const state = stateApi.createIncrementalAnalysisState({ vault: stateVault });
  assert.equal(await state.isCompleted(scoped), false);
  await assert.rejects(state.markCompleted({ scope: scoped, manifest, coverage: { receipts: [] } }), /incomplete_coverage/u);

  const coverage = coverageApi.createChunkCoverageStore({ vault: vault() });
  await persistAll(coverage, manifest, scoped);
  const receipt = await coverage.status(manifest, scoped);
  await state.markCompleted({ scope: scoped, manifest, coverage: receipt });
  assert.equal(await state.isCompleted(scoped), true);
  assert.equal(await state.isCompleted(scope(text + "changed", "source_state_alpha")), false);
  assert.doesNotMatch(stateVault.files[stateApi.DEFAULT_STATE_PATH], /source_text|# Alpha/u);
});
