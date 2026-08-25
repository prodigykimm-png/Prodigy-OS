(function (root) {
  "use strict";

  const DEFAULT_STATE_PATH = "SYSTEM/PRIVATE/llmwiki-fleeting-review-state.json";
  const STATE_VERSION = "knowledge_fleeting_review_state_v1";
  const FLEETING_ROOT = "ZETA/FLEETING/";
  const BLOCK = /<!-- fleeting-block-id: ([a-z][a-z0-9_-]{2,127}) -->\s*\n([\s\S]*?)(?=\n<!-- fleeting-block-id: |$)/gu;
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function emptyState() { return { version: STATE_VERSION, completed: {}, reviews: [] }; }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function validReview(value) {
    return plain(value) && /^[a-z][a-z0-9_-]{2,127}$/u.test(String(value.review_id || ""))
      && typeof value.destination === "string" && typeof value.title === "string";
  }
  function parseState(serialized) {
    let parsed;
    try { parsed = JSON.parse(serialized); } catch (_error) { return null; }
    if (!plain(parsed) || parsed.version !== STATE_VERSION || !plain(parsed.completed) || !Array.isArray(parsed.reviews)) return null;
    if (Object.entries(parsed.completed).some(([id, digest]) => !/^[a-z][a-z0-9_-]{2,127}$/u.test(id) || !/^[0-9a-f]{64}$/u.test(String(digest)))) return null;
    if (parsed.reviews.some((review) => !validReview(review))) return null;
    return { version: STATE_VERSION, completed: { ...parsed.completed }, reviews: parsed.reviews.map((review) => ({ ...review })) };
  }
  function serializeState(state) {
    const completed = Object.fromEntries(Object.entries(state.completed).sort(([left], [right]) => left.localeCompare(right)));
    const reviews = [...state.reviews].sort((left, right) => left.review_id.localeCompare(right.review_id));
    return `${JSON.stringify({ version: STATE_VERSION, completed, reviews }, null, 2)}\n`;
  }
  function parseBlocks(sourcePath, bytes) {
    const blocks = [];
    const seen = new Set();
    for (const match of String(bytes).matchAll(BLOCK)) {
      const blockId = match[1];
      const text = String(match[2] || "").trim();
      if (seen.has(blockId) || !text) return null;
      seen.add(blockId);
      blocks.push(freeze({ block_id: blockId, source_path: sourcePath, text, content_hash: hashApi.sha256(text) }));
    }
    return blocks;
  }
  function createFleetingReviewState(options = {}) {
    const vault = options.vault;
    const analyze = options.analyze;
    const statePath = typeof options.statePath === "string" && options.statePath ? options.statePath : DEFAULT_STATE_PATH;
    if (!vault || typeof vault.getMarkdownFiles !== "function" || typeof vault.getAbstractFileByPath !== "function"
      || typeof vault.create !== "function" || typeof vault.modify !== "function") throw new TypeError("vault_required");
    if (typeof analyze !== "function") throw new TypeError("fleeting_analyzer_required");
    let state;
    let loadStatus = "unloaded";
    let active = null;
    let generation = 0;
    let controller = null;

    async function load() {
      if (loadStatus !== "unloaded") return loadStatus === "ready";
      const file = vault.getAbstractFileByPath(statePath);
      if (!file) { state = emptyState(); loadStatus = "ready"; return true; }
      try {
        const read = typeof vault.cachedRead === "function" ? vault.cachedRead.bind(vault) : vault.read.bind(vault);
        state = parseState(await read(file));
      } catch (_error) { state = null; }
      loadStatus = state ? "ready" : "corrupt";
      return Boolean(state);
    }
    async function blocks() {
      const rows = [];
      const files = vault.getMarkdownFiles().filter((file) => file && typeof file.path === "string" && file.path.startsWith(FLEETING_ROOT) && file.path.endsWith(".md")).sort((left, right) => left.path.localeCompare(right.path));
      const read = typeof vault.cachedRead === "function" ? vault.cachedRead.bind(vault) : vault.read.bind(vault);
      for (const file of files) {
        const parsed = parseBlocks(file.path, await read(file));
        if (!parsed) return null;
        rows.push(...parsed);
      }
      return rows;
    }
    async function snapshot(status = "idle", reason = "") {
      if (!(await load())) return freeze({ status: "blocked", reason: "corrupt_fleeting_review_state", pending_count: 0, reviews: [] });
      const all = await blocks();
      if (!all) return freeze({ status: "blocked", reason: "corrupt_fleeting_blocks", pending_count: 0, reviews: [...state.reviews] });
      const pending = all.filter((block) => state.completed[block.block_id] !== block.content_hash);
      return freeze({ status, reason, pending_count: pending.length, pending, reviews: [...state.reviews] });
    }
    async function persist(next) {
      const bytes = serializeState(next);
      const file = vault.getAbstractFileByPath(statePath);
      if (file) await vault.modify(file, bytes);
      else {
        const parent = statePath.split("/").slice(0, -1).join("/");
        if (parent && !vault.getAbstractFileByPath(parent) && typeof vault.createFolder === "function") await vault.createFolder(parent);
        await vault.create(statePath, bytes);
      }
      state = next;
    }
    function reviewNew() {
      if (active) return active;
      const runGeneration = generation + 1;
      generation = runGeneration;
      controller = new AbortController();
      const runController = controller;
      active = (async () => {
        const current = await snapshot();
        if (current.status === "blocked" || current.pending_count === 0) return current;
        let result;
        try { result = await analyze({ blocks: current.pending, signal: runController.signal }); }
        catch (_error) { result = { ok: false, reason: "fleeting_analysis_failed", completed_block_ids: [], reviews: [] }; }
        if (runController.signal.aborted || generation !== runGeneration) return freeze({ status: "cancelled", reason: "cancelled", pending_count: current.pending_count, reviews: current.reviews });
        const completedIds = new Set(Array.isArray(result && result.completed_block_ids) ? result.completed_block_ids : []);
        const completed = { ...state.completed };
        for (const block of current.pending) if (completedIds.has(block.block_id)) completed[block.block_id] = block.content_hash;
        const suppliedReviews = Array.isArray(result && result.reviews) ? result.reviews.filter(validReview) : [];
        const reviewMap = new Map([...state.reviews, ...suppliedReviews].map((review) => [review.review_id, review]));
        if (completedIds.size > 0 || suppliedReviews.length > 0) await persist({ version: STATE_VERSION, completed, reviews: [...reviewMap.values()] });
        const next = await snapshot(result && result.ok === true ? "complete" : completedIds.size > 0 ? "partial" : "error", String(result && result.reason || ""));
        return next;
      })().finally(() => { if (generation === runGeneration) { active = null; controller = null; } });
      return active;
    }
    function cancel() {
      if (!active || !controller) return freeze({ status: "idle", reason: "fleeting_review_not_active" });
      generation += 1;
      controller.abort();
      active = null;
      controller = null;
      return freeze({ status: "cancelled", reason: "cancelled" });
    }
    async function repair() {
      if (active) return freeze({ status: "blocked", reason: "fleeting_review_active" });
      const next = emptyState();
      await persist(next);
      loadStatus = "ready";
      return snapshot();
    }
    return freeze({ refresh: snapshot, reviewNew, cancel, repair });
  }

  const api = freeze({ DEFAULT_STATE_PATH, STATE_VERSION, parseBlocks, createFleetingReviewState });
  root.KnowledgeFleetingReviewState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
