(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const manifestApi = root.LLMWikiChunkManifest || (typeof require === "function" ? require("./llmwiki-chunk-manifest.js") : null);
  const DEFAULT_COVERAGE_PATH = "SYSTEM/PRIVATE/llmwiki-chunk-coverage.json";
  const COVERAGE_VERSION = 1;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function reject(reason) { return freeze({ ok: false, state: "quarantined", reason, complete: false }); }
  function empty() { return { coverage_version: COVERAGE_VERSION, manifests: {} }; }
  function parse(serialized) {
    try {
      const parsed = JSON.parse(serialized);
      if (!plain(parsed) || parsed.coverage_version !== COVERAGE_VERSION || !plain(parsed.manifests)) return null;
      for (const record of Object.values(parsed.manifests)) {
        if (!plain(record) || !plain(record.receipts)) return null;
      }
      return parsed;
    } catch (_error) { return null; }
  }
  function receiptFor(manifest, chunk, artifact) {
    if (!plain(artifact) || !manifest || !manifest.chunks?.some(item => stable(item) === stable(chunk))) throw new TypeError("invalid_coverage_receipt");
    const artifactHash = hashApi.sha256(stable(artifact));
    return freeze({ receipt_id: `coverage_${hashApi.sha256(stable({ manifest_id: manifest.manifest_id, instance_id: chunk.instance_id, semantic_id: chunk.semantic_id, artifact })).slice(0, 24)}`,
      manifest_id: manifest.manifest_id, instance_id: chunk.instance_id, semantic_id: chunk.semantic_id, artifact_hash: artifactHash, artifact });
  }
  function validReceipt(manifest, chunk, receipt) {
    return plain(receipt) && plain(receipt.artifact) && receipt.manifest_id === manifest.manifest_id && receipt.instance_id === chunk.instance_id
      && receipt.semantic_id === chunk.semantic_id && receipt.artifact_hash === hashApi.sha256(stable(receipt.artifact))
      && receipt.receipt_id === `coverage_${hashApi.sha256(stable({ manifest_id: manifest.manifest_id, instance_id: chunk.instance_id, semantic_id: chunk.semantic_id, artifact: receipt.artifact })).slice(0, 24)}`;
  }
  function active(input) { return !input?.authority && !input?.request || Boolean(input?.authority && typeof input.authority.isActive === "function" && input.authority.isActive(input.request)); }
  function createChunkCoverageStore(options = {}) {
    const vault = options.vault;
    const statePath = typeof options.statePath === "string" && options.statePath.trim() ? options.statePath.trim() : DEFAULT_COVERAGE_PATH;
    if (!vault || ["getAbstractFileByPath", "create", "modify"].some(method => typeof vault[method] !== "function")) throw new TypeError("vault_required");
    let state = null;
    let quarantined = false;
    let queue = Promise.resolve();
    async function load() {
      if (state || quarantined) return state;
      const file = vault.getAbstractFileByPath(statePath);
      if (!file) { state = empty(); return state; }
      try {
        const read = typeof vault.cachedRead === "function" ? vault.cachedRead.bind(vault) : vault.read.bind(vault);
        state = parse(await read(file));
        if (!state) quarantined = true;
      } catch (_error) { quarantined = true; }
      return state;
    }
    async function persist(next) {
      const text = `${JSON.stringify(next, null, 2)}\n`;
      try {
        const existing = vault.getAbstractFileByPath(statePath);
        if (existing) await vault.modify(existing, text);
        else {
          const parent = statePath.split("/").slice(0, -1).join("/");
          if (parent && !vault.getAbstractFileByPath(parent) && typeof vault.createFolder === "function") await vault.createFolder(parent);
          await vault.create(statePath, text);
        }
      } catch (_error) { throw new Error("coverage_persist_failed"); }
    }
    async function status(manifest, scope) {
      if (!manifestApi.validateChunkManifest(manifest, scope).ok) return reject("invalid_chunk_manifest");
      await load();
      if (quarantined) return reject("corrupt_coverage_quarantined");
      const record = state.manifests[manifest.manifest_id] || { receipts: {} };
      const expected = manifest.chunks.map(chunk => chunk.instance_id);
      const actual = Object.keys(record.receipts);
      const unknown = actual.filter(id => !expected.includes(id));
      const missing = expected.filter(id => !Object.hasOwn(record.receipts, id));
      if (unknown.length || actual.some(id => !validReceipt(manifest, manifest.chunks.find(chunk => chunk.instance_id === id), record.receipts[id]))) { quarantined = true; return reject("corrupt_coverage_quarantined"); }
      const complete = missing.length === 0;
      return freeze({ ok: true, durable: complete, exactCoverage: unknown.length === 0, complete, manifest_id: manifest.manifest_id,
        receipts: Object.values(record.receipts), missing_instance_ids: missing, covered_instance_ids: actual.filter(id => expected.includes(id)) });
    }
    async function recordReceipt(input) {
      const { manifest, scope, chunk, artifact } = input || {};
      const valid = manifestApi.validateChunkManifest(manifest, scope);
      if (!valid.ok) throw new TypeError(valid.reason);
      if (!active(input)) throw new Error("analysis_request_inactive");
      const receipt = receiptFor(manifest, chunk, artifact);
      queue = queue.then(async () => {
        await load();
        if (quarantined) throw new Error("corrupt_coverage_quarantined");
        if (!active(input)) throw new Error("analysis_request_inactive");
        const current = state.manifests[manifest.manifest_id] || { receipts: {} };
        const next = { ...state, manifests: { ...state.manifests, [manifest.manifest_id]: { receipts: { ...current.receipts, [receipt.instance_id]: receipt } } } };
        await persist(next);
        state = next;
      });
      await queue;
      return freeze({ ok: true, receipt });
    }
    return freeze({ recordReceipt, status });
  }

  const api = Object.freeze({ DEFAULT_COVERAGE_PATH, COVERAGE_VERSION, createChunkCoverageStore, validateCoverageReceipt: validReceipt });
  root.LLMWikiChunkCoverageStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
