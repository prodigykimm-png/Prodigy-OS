"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const view = name => require(path.join(ROOT, "SYSTEM/Views", name + ".js"));
const sha = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
const SELECTED = "PARA/AREAS/Reading/QA Album.md";
class Element {
  constructor(tag = "div", options = {}) { this.tag = tag; this.textContent = options.text || ""; this.attributes = options.attr || {}; this.children = []; this.listeners = {}; this.classList = { add() {} }; }
  createEl(tag, options) { const child = new Element(tag, options); child.parent = this; this.children.push(child); return child; }
  createDiv(options) { return this.createEl("div", options); }
  empty() { this.children = []; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttr(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  async click() { return this.listeners.click?.({ target: this, preventDefault() {} }); }
  all(predicate) { return [ ...(predicate(this) ? [this] : []), ...this.children.flatMap(child => child.all(predicate)) ]; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { const match = /^\[data-reading-path(?:="(.*)")?\]$/u.exec(selector); return match ? this.all(el => el.attributes["data-reading-path"] && (!match[1] || el.attributes["data-reading-path"] === match[1])) : []; }
}
async function fixture({ missing = false, relation = true, multipleLocators = false } = {}) {
  const files = new Map(), front = new Map(), counts = { writes: 0, provider: 0, canonical: 0, adoption: 0, feedback: 0 }, opens = [], reads = [];
  const vault = {
    getAbstractFileByPath: p => files.get(p) || null, getFiles: () => [...files.values()].filter(f => f.extension),
    getMarkdownFiles() { return this.getFiles().filter(f => f.extension === "md"); },
    async read(file) { reads.push(file.path); return file.bytes; }, async cachedRead(file) { return this.read(file); },
    async createFolder(p) { const file = { path: p }; files.set(p, file); return file; },
    async create(p, bytes) { counts.writes++; if (p.startsWith("ZETA/PERMANENT/")) counts.canonical++; const file = { path: p, bytes, basename: path.basename(p, ".md"), extension: path.extname(p).slice(1) }; files.set(p, file); return file; },
    async modify(file, bytes) { counts.writes++; if (file.path.startsWith("ZETA/PERMANENT/")) counts.canonical++; file.bytes = bytes; }
  };
  const app = { vault, metadataCache: { getFileCache: file => ({ frontmatter: front.get(file.path) || {} }) }, workspace: { getActiveFile: () => ({ path: "HUB/20 Reading.md" }), async openLinkText(link, source, newLeaf) { const p = link.split("#")[0]; assert.ok(files.has(p.endsWith(".md") ? p : p + ".md"), `open resolves: ${link}`); opens.push({ link, source, newLeaf }); } } };
  app.fileManager = { async processFrontMatter(file, change) { counts.writes++; counts.adoption++; const value = front.get(file.path) || {}; change(value); front.set(file.path, value); } };
  const sourcePaths = [SELECTED, "ZETA/LITERATURE/QA Album supplement.md"], text = "Verified album source.";
  for (const p of sourcePaths) await vault.create(p, text);
  const snapshots = sourcePaths.map((p, i) => ({ source_id: `source_album_${i}`, source_kind: "immutable_source", source_revision: sha(p), extractor_revision: sha("extractor"), source_text: text, source_content_hash: sha(text), provider_window: { start: 0, end: text.length } }));
  const claims = view("llmwiki-claim-provenance");
  const created = claims.createClaimSet({ source_snapshots: snapshots, claims: snapshots.map(s => ({ origin: "source_extract", text, citations: [{ source_id: s.source_id, provider_span: { start: 0, end: text.length, span_digest: sha(text) } }] })) });
  assert.equal(created.ok, true);
  const accepted = claims.transitionClaimSet(created.value, { claim_set_hash: created.value.claim_set_hash, claim_ids: created.value.claims.map(c => c.claim_id), status: "accepted", authorized_by: "reviewer", authorized_at: "2026-08-20T00:00:00.000Z" });
  assert.equal(accepted.ok, true);
  const sources = snapshots.map(s => ({ source_id: s.source_id, span: { start: 0, end: text.length } }));
  const relations = relation ? [{ relation_id: "relation_album", target_id: "reading_album", type: "supports" }] : [];
  const promotion = { receipt_version: "reading_reuse_test", canonical_write_eligible: true };
  const document = { schema_version: 2, type: "knowledge", canonical_id: "knowledge_album", knowledge_kind: "principle", status: "active", title: "QA 앨범 배치", statement: text, knowledge_domain: "coding", knowledge_topics: ["ai"], application_trigger: "approved", application_contexts: ["coding/ai"], connections: [], invalidation_conditions: [], sources, relations, claim_set_hash: accepted.value.claim_set_hash, promotion_receipt_hash: sha(stable(promotion)), ai_enrichment_status: "none", created: "2026-08-20T00:00:00.000Z", updated: "2026-08-20T00:00:00.000Z", body: "# QA 앨범 배치\n" + (missing ? "" : snapshots.map((s, i) => `- [${s.source_id}](${sourcePaths[i].split("/").map(encodeURIComponent).join("/")}#L1)`).join("\n")) };
  if (multipleLocators) document.body += `\n- [source_album_0](${SELECTED.split("/").map(encodeURIComponent).join("/")}#L2)`;
  const canonicalPath = "ZETA/PERMANENT/QA Album.md", bytes = view("knowledge-candidate-store").renderCanonicalDocument(document), revision = sha(bytes);
  await vault.create(canonicalPath, bytes);
  front.set(canonicalPath, { ...document, stale_state: "current", unresolved_judgement: false, deadline: null, sources: [{ source_id: "source_album_0", locator: "PRIVATE/forged.md" }] });
  const adapter = view("llmwiki-obsidian-adapter").createObsidianAdapter(app), nonce = "nonce_reading_reuse_0001", packet = sha("packet"), authorization = sha("auth");
  const audit = { audit_version: "llmwiki_packet_bound_commit_audit_v1", result: "committed", canonical_id: document.canonical_id, target_path: canonicalPath, before_sha256: sha(""), after_sha256: revision, packet_hash: packet, authorization_hash: authorization, operation_id: "operation_reading_reuse", nonce, live_revision: sha("live"), consent_hash: sha("consent"), source_ids: snapshots.map(s => s.source_id), committed_at: document.created };
  const prepared = await adapter.prepareAudit({ target_path: canonicalPath, before_bytes: "", before_sha256: sha(""), after_bytes: bytes, after_sha256: revision, allowed_properties: [], source_citations: [], live_revision: audit.live_revision, packet_hash: packet, authorization_hash: authorization, operation_id: audit.operation_id, nonce, audit });
  assert.equal(prepared.ok, true);
  const finalBytes = JSON.stringify(audit, null, 2) + "\n";
  assert.equal((await adapter.finalizeAudit(prepared, finalBytes)).ok, true);
  const receipt = { run_id: "run_reading_reuse", packet_id: "packet_reading_reuse", packet_hash: packet, policy_snapshot: { mode: "approved" }, source_revisions: Object.fromEntries(snapshots.map(s => [s.source_id, s.source_revision])), committed_at: audit.committed_at, writes: [{ path: canonicalPath, before_bytes: "", after_bytes: bytes, before_sha256: sha(""), after_sha256: revision, before_revision: "missing", post_commit_revision: revision }], write_outcome: "committed", refresh_outcome: "complete", git_outcome: "disabled", resurfacing_bindings: [{ canonical_id: document.canonical_id, path: canonicalPath, revision, nonce, final_audit_sha256: sha(finalBytes), packet_hash: packet, authorization_hash: authorization }], canonical_v2_authority: { canonical_id: document.canonical_id, schema_version: 2, canonical_sha256: revision, claim_set_hash: accepted.value.claim_set_hash, claim_set: accepted.value, promotion_receipt_hash: document.promotion_receipt_hash, promotion_receipt: promotion, sources, relations, ai_enrichment_status: "none", status: "active" } };
  assert.equal((await view("llmwiki-compensation-service").create({ adapter, now: () => document.created }).recordCompletedCommit({ original_receipt: receipt })).ok, true);
  const selected = { id: "reading_album", type: "reading", title: "QA Album", status: "reading", next_action: "Read chapter", file: { path: SELECTED, name: "QA Album" } };
  Object.keys(counts).forEach(key => { counts[key] = 0; }); reads.length = 0;
  return { app, files, front, counts, opens, reads, canonicalPath, document, selected, sourcePaths };
}
async function mountHub(p) {
  const globals = new Map(), set = (key, value) => { if (!globals.has(key)) globals.set(key, Object.getOwnPropertyDescriptor(global, key)); Object.defineProperty(global, key, { configurable: true, writable: true, value }); };
  let mounted, passed;
  const body = new Element(), container = new Element(), scope = { track() {} };
  set("window", global); set("document", undefined);
  set("fetch", () => { p.counts.provider++; throw Error("unexpected provider/network call"); });
  for (const [key, module] of Object.entries({ LLMWikiResurfacingReadAdapter: "llmwiki-resurfacing-read-adapter", LLMWikiResurfacingService: "llmwiki-resurfacing-service", LLMWikiResurfacingFeedbackStore: "llmwiki-resurfacing-feedback-store" })) set(key, view(module));
  const reader = view("llmwiki-resurfacing-read-adapter").create();
  let storageBytes = null;
  const store = view("llmwiki-resurfacing-feedback-store").create({ storage: { getItem: () => storageBytes, setItem(_key, value) { p.counts.feedback++; storageBytes = value; }, removeItem() { p.counts.feedback++; storageBytes = null; } } });
  const adapter = view("reading-context-adapter");
  set("ReadingContextAdapter", { ...adapter, async mountResurfacing(options) { passed = options; mounted = await adapter.mountResurfacing({ ...options, readAdapter: reader, feedbackStore: store }); return mounted; } });
  set("ProdigyWorkspaceManifest", { get: () => ({ workspaceId: "reading" }) });
  set("ProdigyWorkspaceNavigation", { mount: () => ({ body }), renderLoaderError(_c, error) { throw error; } });
  set("ProdigyHubLoader", { async mountWorkspace(_app, _manifest, options) { await options.renderers.reading({ scope, signal: { aborted: false } }); }, preserveRequiredRecovery() { return false; } });
  set("ProdigyAdaptiveControls", { AdaptiveActionBar: () => ({ element: new Element() }) });
  set("ProdigyUI", { ensureStyles() {}, button: parent => parent.createEl("button") });
  set("__readingWorkspaceModel", { focus_path: SELECTED, today: { object: p.selected } });
  set("ProdigyTokens", { RESPONSIVE_BREAKPOINTS: { contentMax: 1000 } });
  set("ObjectEngine", { createRuntimeSession: () => ({}) });
  set("ReadingWorkspaceCore", { shareRuntimeModel: rows => ({ focus_path: rows[0]?.path, today: null }) });
  let listPane;
  set("ReadingView", { mountResponsiveWorkspace(options) { listPane = new Element(); options.renderList(listPane); return { dispose() {} }; } });
  set("renderReadingCard", (page, parent) => parent.createEl("article", { attr: { "data-reading-path": page.file.path } }));
  set("__prodigyReadingDashboardOptions", {});
  // Both actual Hub caller blocks run. Only unrelated shell/card rendering is faked.
  const hub = fs.readFileSync(path.join(ROOT, "HUB/20 Reading.md"), "utf8");
  const first = /```js-engine\n([\s\S]*?)\n```/u.exec(hub)[1];
  const dashboard = /```dataviewjs\n([\s\S]*?)\n```/u.exec(hub)[1].split("let dashboardController = null;")[0];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  try {
    await new AsyncFunction("app", "obsidian", "container", first)(p.app, {}, container);
    const render = await new AsyncFunction("app", "dv", dashboard + "\nreturn renderDashboard;").call({ container: new Element() }, p.app, {});
    await render({ rows: [p.selected] });
    // Await the exact request initiated by the caller, with no sleeps/polling.
    if (global.__readingWorkspaceMeasurement?.relatedKnowledgeReady) await global.__readingWorkspaceMeasurement.relatedKnowledgeReady;
    return { body, reader, store, get passed() { return passed; }, get mounted() { return mounted; }, async select(page) { await render({ rows: [page] }); if (global.__readingWorkspaceMeasurement?.relatedKnowledgeReady) await global.__readingWorkspaceMeasurement.relatedKnowledgeReady; }, async clickCard() { await listPane.children[0].click(); if (global.__readingWorkspaceMeasurement?.relatedKnowledgeReady) await global.__readingWorkspaceMeasurement.relatedKnowledgeReady; }, cleanup() { for (const [key, old] of globals) { if (old) Object.defineProperty(global, key, old); else delete global[key]; } } };
  } catch (error) { for (const [key, old] of globals) { if (old) Object.defineProperty(global, key, old); else delete global[key]; } throw error; }
}
const action = (hub, name) => hub.body.all(el => el.attributes["data-action"] === name);
const assertLocal = p => { assert.deepEqual(p.counts, { writes: 0, provider: 0, canonical: 0, adoption: 0, feedback: 0 }); assert.ok(!p.reads.includes(SELECTED)); assert.ok(!p.reads.includes("PRIVATE/forged.md")); };

test("actual Reading caller forwards selected Object and only existing allowed context", async () => {
  const p = await fixture(), hub = await mountHub(p);
  try { await hub.clickCard(); assert.equal(hub.passed.selection, SELECTED, "selected Object identity must reach adapter"); const context = view("reading-context-adapter").buildContext(hub.passed); assert.equal(context.snapshot[0].id, p.selected.id); assert.equal(context.snapshot[0].title, p.selected.title); assert.deepEqual(Object.keys(context).sort(), ["citations", "locale", "selection", "snapshot", "tab", "workspace"]); assert.equal(typeof hub.passed.openKnowledge, "function"); assert.equal(typeof hub.passed.openSource, "function"); assertLocal(p); } finally { hub.cleanup(); }
});
test("actual Reading mount renders title and semantic reason, never structured internals", async () => {
  const p = await fixture(), hub = await mountHub(p);
  try { assert.equal(hub.mounted.count, 1); assert.equal(hub.body.all(el => el.tag === "strong")[0].textContent, p.document.title); const why = hub.body.all(el => el.attributes["data-resurfacing-why"])[0]; assert.equal(why.attributes["data-resurfacing-why"], "readable"); assert.ok(why.textContent.trim().length > 0); assert.equal(why.all(el => el.attributes["data-why"]).length, 0); assertLocal(p); } finally { hub.cleanup(); }
});
test("verified canonical source links survive reader; separate opens resolve every source with zero writes or adoption", async () => {
  const p = await fixture(), hub = await mountHub(p);
  try { const knowledge = action(hub, "open"), sources = action(hub, "open-source"); assert.equal(knowledge.length, 1); assert.equal(sources.length, 2, "each verified source needs a working source action"); assert.equal(knowledge[0].disabled, false); await knowledge[0].click(); for (const button of sources) await button.click(); assert.deepEqual(p.opens.map(row => row.link), [p.canonicalPath, ...p.sourcePaths.map(p => p + "#L1")]); assert.equal(hub.store.records().length, 0); assertLocal(p); } finally { hub.cleanup(); }
});
test("missing verified locators are unavailable, never replaced by untrusted metadata paths", async () => {
  const p = await fixture({ missing: true }), hub = await mountHub(p);
  try { const buttons = action(hub, "open-source"); assert.equal(buttons.length, 2); assert.ok(buttons.every(button => button.disabled)); assert.equal(hub.body.all(el => el.attributes["data-source-unavailable"]).length, 2); assertLocal(p); } finally { hub.cleanup(); }
});
test("selected source matches a finalized document without domain relations; unrelated selection stays empty", async () => {
  const p = await fixture({ relation: false }), hub = await mountHub(p);
  try { assert.equal(hub.mounted.count, 1, "source-linked selected Object must resurface"); await hub.select({ ...p.selected, id: "reading_unrelated", file: { path: "PARA/AREAS/Reading/Other.md" } }); assert.equal(hub.mounted.count, 0); assert.equal(action(hub, "open").length, 0); assertLocal(p); } finally { hub.cleanup(); }
});
test("stale and unverified rows remain unreadable through actual mount", async () => {
  for (const mode of ["stale", "unverified", "stale_source", "unknown_source"]) { const p = await fixture(); if (mode === "stale") p.files.get(p.canonicalPath).bytes += "changed"; else if (mode === "unverified") p.files.delete(".llmwiki-audit/immutable/head.json"); else p.front.get(p.canonicalPath).stale_state = mode === "stale_source" ? "stale" : "unknown"; const hub = await mountHub(p); try { assert.equal(hub.mounted.count, 0); assert.equal(action(hub, "open").length, 0); assertLocal(p); } finally { hub.cleanup(); } }
});
test("every locator retained for the same verified source has its own resolvable open", async () => {
  const p = await fixture({ multipleLocators: true }), hub = await mountHub(p);
  try { const buttons = action(hub, "open-source"); assert.equal(buttons.length, 3); for (const button of buttons) await button.click(); assert.deepEqual(p.opens.map(row => row.link), [SELECTED + "#L1", SELECTED + "#L2", p.sourcePaths[1] + "#L1"]); assertLocal(p); } finally { hub.cleanup(); }
});
test("source removed after display reports an unavailable target without creating or adopting", async () => {
  const p = await fixture(), hub = await mountHub(p);
  try { p.files.delete(SELECTED); const result = await action(hub, "open-source")[0].click(); assert.equal(result.reason, "source_missing"); assert.equal(p.opens.length, 0); assert.equal(hub.body.all(el => el.attributes.role === "status").length, 1); assertLocal(p); } finally { hub.cleanup(); }
});
test("latest Object selection wins an event-controlled in-flight reader mount", { timeout: 5000 }, async () => {
  const p = await fixture(), hub = await mountHub(p);
  const originalRead = p.app.vault.read;
  let enter, release, held = false;
  const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
  p.app.vault.read = async file => { if (file.path === p.canonicalPath && !held) { held = true; enter(); await gate; } return originalRead(file); };
  try {
    const earlier = hub.select(p.selected);
    await entered;
    await hub.select({ ...p.selected, id: "reading_unrelated", file: { path: "PARA/AREAS/Reading/Other.md" } });
    release(); await earlier;
    assert.equal(action(hub, "open").length, 0);
    assertLocal(p);
  } finally { release(); hub.cleanup(); }
});
test("Reading apply, mute and irrelevant remain feedback-only", async () => {
  for (const name of ["apply", "mute", "irrelevant"]) { const p = await fixture(), hub = await mountHub(p); try { const result = await action(hub, name)[0].click(); assert.equal(result.status, "recorded"); assert.equal(result.product_write_count, 0); assert.equal(result.write_counters.canonical, 0); assert.equal(result.write_counters.provider_command, 0); assert.equal(hub.store.records().length, 1); assert.equal(p.counts.writes, 0); assert.equal(p.counts.adoption, 0); } finally { hub.cleanup(); } }
});
