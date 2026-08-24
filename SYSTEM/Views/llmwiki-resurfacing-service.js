(function (root) {
  "use strict";

  const VERSION = "llmwiki_resurfacing_service_v2";
  const DOMAINS = Object.freeze(["auction", "project", "reading", "workout", "journal"]);
  const ACTIONS = Object.freeze(["open", "apply", "mute", "irrelevant"]);
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const SAFE_PATH = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _./()-]*\.md$/u;
  const OPAQUE_ACTIONS = new WeakSet();
  const nodeTypes = typeof require === "function" ? require("node:util").types : null;

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    try { const prototype = Reflect.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
    catch (_) { return false; }
  }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (value && typeof value === "object" && OPAQUE_ACTIONS.has(value)) return value;
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function effect(attempted = 0, committed = 0, rolledBack = 0, unknown = 0) { return freeze({ attempted, committed, rolled_back: rolledBack, unknown }); }
  function counters(ranking = effect(), evaluation = effect()) {
    return freeze({ canonical: 0, approval: 0, commit: 0, merge: 0, delete: 0, git_snapshot: 0, provider_command: 0, source_mutation: 0, ranking, evaluation });
  }
  function fail(field, reason, writeCounters = counters()) { return freeze({ ok: false, status: "error", field, reason, product_write_count: 0, write_counters: writeCounters }); }
  function inspect(value, field, seen = new Set(), depth = 0) {
    if (value === null || typeof value !== "object") return null;
    if (OPAQUE_ACTIONS.has(value)) return null;
    try {
      if ((nodeTypes && nodeTypes.isProxy(value)) || seen.has(value) || depth > 24) return fail(field, "uninspectable_input");
      seen.add(value);
      const prototype = Reflect.getPrototypeOf(value);
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return fail(field, "unsupported_object_prototype");
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") return fail(field, "symbol_property_forbidden");
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
        if (!descriptor) return fail(field, "uninspectable_input");
        if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) return fail(`${field}.${key}`, "accessor_property_forbidden");
        if (key !== "length") {
          const child = inspect(descriptor.value, `${field}.${key}`, seen, depth + 1);
          if (child) return child;
        }
      }
      return null;
    } catch (_) { return fail(field, "uninspectable_input"); }
  }
  function contextKey(context) { return stable({ workspace: context.workspace, tab: context.tab || null, selection: context.selection || null }); }
  function safePath(value) { const path = trim(value); return Boolean(path) && SAFE_PATH.test(path) && !path.includes("..") && !path.includes("//") && !path.includes("\\"); }
  function validContext(context) {
    const unsafe = inspect(context, "context");
    if (unsafe) return unsafe;
    if (!plain(context)) return fail("context", "object_required");
    if (!DOMAINS.includes(trim(context.workspace))) return fail("context.workspace", "supported_domain_required");
    if (context.tab !== undefined && context.tab !== null && typeof context.tab !== "string") return fail("context.tab", "string_or_null_required");
    if (context.selection !== undefined && context.selection !== null && typeof context.selection !== "string") return fail("context.selection", "string_or_null_required");
    return null;
  }
  function normalizeItem(item, context, readAdapter) {
    // WeakSet-backed trust is checked before any reflection. In no-require
    // runtimes an arbitrary Proxy therefore cannot execute an ownKeys trap.
    if (!readAdapter || typeof readAdapter.isTrustedRow !== "function" || !readAdapter.isTrustedRow(item)) return fail("item", "trusted_canonical_row_required");
    if (!ID.test(trim(item.item_id)) || !ID.test(trim(item.canonical_id)) || !HASH.test(trim(item.canonical_revision))) return fail("item", "invalid_canonical_identity");
    if (!trim(item.title) || !safePath(item.path)) return fail("item", "invalid_canonical_display");
    const relations = Array.isArray(item.relations) ? item.relations.filter((relation) => plain(relation) && relation.workspace === context.workspace && ID.test(trim(relation.relation)) && ID.test(trim(relation.target_id))) : [];
    if (relations.length === 0) return freeze({ ok: true, skip: true });
    const sources = Array.isArray(item.sources) ? item.sources.filter((source) => plain(source) && ID.test(trim(source.source_id)) && HASH.test(trim(source.source_revision)) && typeof source.locator === "string") : [];
    if (sources.length === 0) return fail("item.sources", "trusted_source_required");
    if (item.deadline !== null && item.deadline !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(item.deadline)) return fail("item.deadline", "iso_date_or_null_required");
    if (!["current", "stale", "unknown"].includes(item.stale_state) || typeof item.unresolved_judgement !== "boolean") return fail("item.why", "complete_machine_why_required");
    const rank = Number(item.rank === undefined ? 0 : item.rank);
    if (!Number.isFinite(rank)) return fail("item.rank", "finite_number_required");
    return freeze({ ok: true, value: { item_id: item.item_id, canonical_id: item.canonical_id, canonical_revision: item.canonical_revision, title: item.title, path: item.path, relation: relations[0], source: sources[0], deadline: item.deadline || null, stale_state: item.stale_state, unresolved_judgement: item.unresolved_judgement, rank } });
  }

  function create(options = {}) {
    void options.canonicalWriter; void options.approval; void options.commit; void options.merge; void options.delete; void options.gitSnapshot; void options.providerCommand; void options.sourceMutation;
    const baseReadAdapter = options.readAdapter || null;
    const feedbackStoreApi = root.LLMWikiResurfacingFeedbackStore || (typeof require === "function" ? require("./llmwiki-resurfacing-feedback-store.js") : null);
    const feedbackStore = feedbackStoreApi && feedbackStoreApi.isAtomicStore(options.feedbackStore) ? options.feedbackStore : null;
    const muted = new Set();
    const mutedRevisions = new Map();
    const adjustments = new Map();
    const tokens = new WeakMap();
    const consumed = new WeakMap();
    const activeTokens = new Map();
    const currentRevisions = new Map();

    function binding(context, itemId, revision) { return `${contextKey(context)}\u0000${itemId}\u0000${revision}`; }
    function identity(context, itemId) { return `${contextKey(context)}\u0000${itemId}`; }
    function mintActions(context, value) {
      const itemIdentity = identity(context, value.item_id);
      const previous = activeTokens.get(itemIdentity) || [];
      previous.forEach((token) => { const record = tokens.get(token); if (record) record.active = false; });
      const minted = ACTIONS.map((action) => {
        const token = Object.freeze({});
        OPAQUE_ACTIONS.add(token);
        tokens.set(token, { active: true, action, context_key: contextKey(context), item_id: value.item_id, canonical_id: value.canonical_id, canonical_revision: value.canonical_revision, path: value.path });
        return freeze({ type: action, enabled: true, identity: token });
      });
      activeTokens.set(itemIdentity, minted.map((row) => row.identity));
      return minted;
    }

    function resurface(input) {
      if (!input || typeof input !== "object") return fail("input", "object_required");
      const readAdapter = input.readAdapter || baseReadAdapter;
      if (!readAdapter || typeof readAdapter.isTrustedRow !== "function") return fail("item", "trusted_canonical_row_required");
      const contextFailure = validContext(input.context);
      if (contextFailure) return contextFailure;
      if (!Array.isArray(input.items)) return fail("items", "array_required");
      const output = [];
      for (const item of input.items) {
        const normalized = normalizeItem(item, input.context, readAdapter);
        if (!normalized.ok) return normalized;
        if (normalized.skip) continue;
        const value = normalized.value;
        const itemIdentity = identity(input.context, value.item_id);
        currentRevisions.set(itemIdentity, value.canonical_revision);
        const key = binding(input.context, value.item_id, value.canonical_revision);
        if (muted.has(key)) continue;
        const prior = mutedRevisions.get(itemIdentity) || new Set();
        output.push(freeze({ item_id: value.item_id, canonical_id: value.canonical_id, canonical_revision: value.canonical_revision, title: value.title, path: value.path, score: value.rank + (adjustments.get(key) || 0), revision_rule: prior.size > 0 && !prior.has(value.canonical_revision) ? "revision_change_resurfaces" : "exact_revision_binding", why: { relation: value.relation, source: value.source, deadline: value.deadline, stale_state: value.stale_state, unresolved_judgement: value.unresolved_judgement }, actions: mintActions(input.context, value) }));
      }
      output.sort((a, b) => b.score - a.score || a.canonical_id.localeCompare(b.canonical_id, "en") || a.canonical_revision.localeCompare(b.canonical_revision, "en") || a.item_id.localeCompare(b.item_id, "en"));
      return freeze({ ok: true, status: output.length ? "resurfaced" : "empty", workspace: input.context.workspace, items: output, count: output.length, product_write_count: 0, write_counters: counters() });
    }

    function persist(row) {
      if (!feedbackStore) return { ok: false, reason: "atomic_feedback_store_required", counters: counters() };
      const result = feedbackStore.transact(row);
      if (!result || result.ok !== true) {
        const attempted = result && result.attempted || 0;
        const rolledBack = result && result.rolled_back || 0;
        const unknown = result && result.residual === "unknown" ? 1 : 0;
        return { ok: false, reason: result && result.reason || "feedback_store_failed", counters: counters(effect(attempted, 0, rolledBack, unknown), effect(attempted, 0, rolledBack, unknown)) };
      }
      return { ok: true, counters: counters(effect(1, 1), effect(1, 1)) };
    }

    async function feedback(input) {
      const unsafe = inspect(input, "feedback");
      if (unsafe) return unsafe;
      if (!plain(input)) return fail("feedback", "object_required");
      const contextFailure = validContext(input.context);
      if (contextFailure) return contextFailure;
      if (!ACTIONS.includes(input.action)) return fail("feedback.action", "supported_action_required");
      const token = input.action_identity;
      const record = token && tokens.get(token);
      if (!record) return fail("feedback.action_identity", "minted_action_identity_required");
      if (record.action !== input.action) return fail("feedback.action", "action_identity_mismatch");
      if (record.context_key !== contextKey(input.context)) return fail("feedback.context", "action_context_mismatch");
      const prior = consumed.get(token);
      if (prior) return freeze({ ok: true, status: "duplicate", action: record.action, product_write_count: 0, write_counters: counters() });
      if (!record.active) return fail("feedback.action_identity", "late_action_identity");
      if (!baseReadAdapter || typeof baseReadAdapter.current !== "function") return fail("feedback.action_identity", "live_revision_reader_required");
      const live = await baseReadAdapter.current({ canonical_id: record.canonical_id, path: record.path });
      if (!live || live.ok !== true || live.revision !== record.canonical_revision || live.canonical_id !== record.canonical_id || live.path !== record.path) return fail("feedback.action_identity", "stale_action_revision");
      const delta = Object.freeze({ open: 1, apply: 2, mute: 0, irrelevant: -100 })[record.action];
      const row = freeze({ version: VERSION, action: record.action, workspace: input.context.workspace, context_key: record.context_key, item_id: record.item_id, canonical_id: record.canonical_id, canonical_revision: record.canonical_revision, ranking_delta: delta });
      const durable = persist(row);
      if (!durable.ok) return fail("feedback_store", durable.reason, durable.counters);
      const key = binding(input.context, record.item_id, record.canonical_revision);
      adjustments.set(key, (adjustments.get(key) || 0) + delta);
      if (record.action === "mute") {
        muted.add(key);
        const itemIdentity = identity(input.context, record.item_id);
        if (!mutedRevisions.has(itemIdentity)) mutedRevisions.set(itemIdentity, new Set());
        mutedRevisions.get(itemIdentity).add(record.canonical_revision);
      }
      record.active = false;
      consumed.set(token, row);
      return freeze({ ok: true, status: "recorded", action: record.action, ranking_write_count: 1, evaluation_write_count: 1, product_write_count: 0, write_counters: durable.counters });
    }

    function mount(input) {
      const result = resurface({ context: input.context, items: input.items, readAdapter: input.readAdapter });
      if (!result.ok || result.items.length === 0) return freeze({ ...result, dispose() {} });
      const host = input.container;
      if (!host || typeof host.createEl !== "function") return fail("mount.container", "dom_container_required");
      const section = host.createEl("section", { attr: { "data-llmwiki-resurfacing": input.context.workspace } });
      for (const item of result.items) {
        const card = section.createEl("article", { attr: { "data-resurfacing-item": item.item_id, "data-canonical-revision": item.canonical_revision } });
        card.createEl("strong", { text: item.title });
        const why = card.createEl("div", { attr: { "data-resurfacing-why": "structured" } });
        for (const [key, value] of Object.entries(item.why)) why.createEl("span", { text: `${key}:${typeof value === "object" ? stable(value) : String(value)}`, attr: { "data-why": key } });
        const actions = card.createEl("div", { attr: { "data-resurfacing-actions": "" } });
        for (const action of item.actions) {
          const button = actions.createEl("button", { text: action.type, attr: { type: "button", "data-action": action.type } });
          button.addEventListener("click", () => feedback({ action: action.type, context: input.context, action_identity: action.identity }));
        }
      }
      return Object.freeze({ ...result, element: section, dispose() { if (section && typeof section.remove === "function") section.remove(); } });
    }
    return Object.freeze({ resurface, feedback, mount, version: VERSION });
  }

  let defaultService = null;
  const servicesByReader = new WeakMap();
  function getDefaultService(readAdapter) {
    if (readAdapter && (typeof readAdapter === "object" || typeof readAdapter === "function")) {
      if (!servicesByReader.has(readAdapter)) servicesByReader.set(readAdapter, create({ readAdapter }));
      return servicesByReader.get(readAdapter);
    }
    if (!defaultService) defaultService = create();
    return defaultService;
  }
  const api = freeze({ VERSION, DOMAINS, ACTIONS, create, getDefaultService });
  root.LLMWikiResurfacingService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
