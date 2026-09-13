"use strict";

// M1 phase 2/3 - legacy adoption write path. Owner-visible contract:
// a legacy ZETA/PERMANENT note that still lacks schema_version 2 / canonical_id
// must be adoptable in place, and the adoption must execute through the existing
// lifecycle migration authority (buildPlan/authorizePlan/executePlan) which in
// turn must use the canonical UPDATE gate (authorizeCanonicalUpdate /
// commitApprovedUpdate). No provider call, no new approval surface, no writes
// when the target is absent or already v2 but unverified.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const V = path.resolve(__dirname, "../../../../../Views");
const hash = require(path.join(V, "llmwiki-hash.js"));
const store = require(path.join(V, "knowledge-candidate-store.js"));

// Fake lifecycle migration adapter MODULE. It wraps the production adapter over
// the test vault and counts reserve/commit so the test can prove the adoption
// really executed through the migration transaction, exactly once.
const realMigrationAdapter = require(path.join(V, "llmwiki-lifecycle-migration-obsidian-adapter.js"));
const migrationCounters = { created: 0, reserve: 0, commit: 0, readExact: 0 };
const branded = new WeakSet();
globalThis.LLMWikiLifecycleMigrationObsidianAdapter = Object.freeze({
  ...realMigrationAdapter,
  createProductionAdapter(app) {
    const inner = realMigrationAdapter.createProductionAdapter(app);
    migrationCounters.created += 1;
    const wrapped = Object.freeze({
      ...inner,
      reserve: (...args) => { migrationCounters.reserve += 1; return inner.reserve(...args); },
      commit: (...args) => { migrationCounters.commit += 1; return inner.commit(...args); },
      readExact: (...args) => { migrationCounters.readExact += 1; return inner.readExact(...args); },
    });
    branded.add(wrapped);
    return wrapped;
  },
  isProductionAdapter(value) { return branded.has(value); },
});

const review = require(path.join(V, "llmwiki-document-canonical-review.js"));

const LEGACY_PATH = "ZETA/PERMANENT/legacy album guide.md";
const LEGACY_BYTES = [
  "---",
  "type: knowledge",
  'title: "legacy album guide"',
  'knowledge_domain: "wedding"',
  "---",
  "",
  "# legacy album guide",
  "",
  "가족사진은 신랑측 우선으로 배치한다.",
  "",
].join("\n");
const CLAIM = "가족사진은 신랑측 우선으로 배치한다.";
const SOURCE_PATH = "ZETA/LITERATURE/album standards.md";
const SOURCE_BYTES = `촬영 기준\n${CLAIM}\n`;
const FIELDS = {
  knowledge_kind: "claim", knowledge_domain: "coding", knowledge_topics: "ai",
  application_trigger: "앨범 정렬 점검", application_contexts: "coding/ai",
  conditions: "실내 앨범", invalidation_conditions: "원문 변경",
  relation_status: "resolved", classification: "epistemic", evidence_strength: "sufficient",
};

function record(filePath, bytes) {
  return { path: filePath, bytes, extension: filePath.endsWith(".md") ? "md" : "json", basename: filePath.split("/").pop().replace(/\.[^.]+$/u, "") };
}

function vault(seed = {}) {
  const files = new Map(Object.entries(seed).map(([filePath, bytes]) => [filePath, record(filePath, bytes)]));
  const folders = new Set();
  const touched = [];
  const app = {
    vault: {
      getAbstractFileByPath: (filePath) => files.get(filePath) || (folders.has(filePath) ? { path: filePath, children: [] } : null),
      getFiles: () => [...files.values()],
      getMarkdownFiles: () => [...files.values()].filter((file) => file.path.endsWith(".md")),
      read: async (file) => files.get(typeof file === "string" ? file : file.path).bytes,
      cachedRead: async (file) => files.get(typeof file === "string" ? file : file.path).bytes,
      createFolder: async (filePath) => { folders.add(filePath); },
      create: async (filePath, bytes) => { if (files.has(filePath)) throw new Error("file_exists"); files.set(filePath, record(filePath, bytes)); touched.push(["create", filePath]); return files.get(filePath); },
      modify: async (file, bytes) => { const filePath = typeof file === "string" ? file : file.path; if (!files.has(filePath)) throw new Error("missing_file"); files.get(filePath).bytes = bytes; touched.push(["modify", filePath]); return files.get(filePath); },
      delete: async (file) => { const filePath = typeof file === "string" ? file : file.path; files.delete(filePath); touched.push(["delete", filePath]); },
    },
    metadataCache: {
      getFileCache(file) {
        try { return { frontmatter: store.parseLifecycleDocument(files.get(file.path)?.bytes || "") }; }
        catch (_error) { return { frontmatter: {} }; }
      },
    },
  };
  return { app, files, touched, bytes: (filePath) => files.get(filePath)?.bytes ?? null };
}

function legacyItem(overrides = {}) {
  return {
    review_id: "review_legacy_adoption",
    title: "legacy album guide",
    document_body: `## 앨범 정렬\n${CLAIM}\n`,
    proposed_target: { path: LEGACY_PATH, revision: hash.sha256(LEGACY_BYTES), action: "update" },
    grounded_claims: [{
      text: CLAIM,
      citations: [{ source_id: "source_album_standards", source_path: SOURCE_PATH, locator: `${SOURCE_PATH}#L2`, content_hash: hash.sha256(SOURCE_BYTES), evidence_quote: CLAIM }],
    }],
    ...overrides,
  };
}

function seeded() {
  return vault({ [LEGACY_PATH]: LEGACY_BYTES, [SOURCE_PATH]: SOURCE_BYTES });
}

function resetCounters() { for (const key of Object.keys(migrationCounters)) migrationCounters[key] = 0; }

test("legacy on-disk target is accepted for adoption and writes once through the migration flow", async () => {
  resetCounters();
  const state = seeded();
  const flow = review.create({ app: state.app });
  const item = legacyItem();

  const prepared = await flow.prepare({ item, fields: { ...FIELDS }, target_path: LEGACY_PATH, target_revision: hash.sha256(LEGACY_BYTES) });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.status, "review");
  assert.equal(prepared.value.target_path, LEGACY_PATH, "adoption must stay on the existing legacy path");
  assert.equal(prepared.value.legacy_adoption, true);
  assert.equal(prepared.value.before, LEGACY_BYTES, "before bytes are the legacy note, never invented");
  assert.match(prepared.value.after, /schema_version: 2/u);
  assert.equal(state.touched.length, 0, "prepare never writes");

  const applied = await flow.apply(prepared.value, { approved: true, claims_accepted: true, packet_hash: prepared.value.packet_hash });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(state.bytes(LEGACY_PATH), prepared.value.after, "the legacy path now holds the approved v2 document");
  assert.equal(migrationCounters.created, 1, "the migration production adapter was created");
  assert.equal(migrationCounters.reserve, 1, "the migration transaction reserved exactly one nonce");
  assert.equal(migrationCounters.commit, 1, "the migration transaction committed exactly one receipt");
  assert.equal(state.touched.filter(([kind, filePath]) => filePath === LEGACY_PATH && (kind === "modify" || kind === "create")).length, 1, "canonical bytes written exactly once");
  const verified = (await flow.targets()).find((row) => row.path === LEGACY_PATH);
  assert.ok(verified, "the adopted note is read back as a verified canonical target");
});

test("absent target and unverified v2 target are still refused without any write", async () => {
  resetCounters();
  const state = seeded();
  const flow = review.create({ app: state.app });
  const before = state.bytes(LEGACY_PATH);

  const absent = await flow.prepare({ item: legacyItem(), fields: { ...FIELDS }, target_path: "ZETA/PERMANENT/does not exist.md" });
  assert.equal(absent.ok, false);
  assert.equal(absent.reason, "verified_target_required");

  // schema_version 2 bytes that are not a verified target are not silently adopted either.
  const v2Bytes = "---\nschema_version: 2\ncanonical_id: knowledge_not_verified\n---\n\n# not verified\n";
  await state.app.vault.create("ZETA/PERMANENT/unverified v2.md", v2Bytes);
  const unverified = await flow.prepare({ item: legacyItem(), fields: { ...FIELDS }, target_path: "ZETA/PERMANENT/unverified v2.md" });
  assert.equal(unverified.ok, false);
  assert.equal(unverified.reason, "verified_target_required");

  assert.equal(migrationCounters.reserve, 0, "refusals never reach the migration transaction");
  assert.equal(state.touched.filter(([, filePath]) => filePath === LEGACY_PATH).length, 0, "refusals never write the legacy note");
  assert.equal(state.bytes(LEGACY_PATH), before);
});

test("a verified v2 target still updates through the normal canonical update path", async () => {
  resetCounters();
  const state = seeded();
  const flow = review.create({ app: state.app });

  const created = await flow.prepare({ item: legacyItem({ review_id: "review_v2_seed", title: "album standards v2", proposed_target: null }), fields: { ...FIELDS }, target_path: "" });
  assert.equal(created.ok, true, JSON.stringify(created));
  const first = await flow.apply(created.value, { approved: true, claims_accepted: true, packet_hash: created.value.packet_hash });
  assert.equal(first.ok, true, JSON.stringify(first));
  resetCounters();

  const added = "경고등이 켜지면 촬영을 멈춘다.";
  await state.app.vault.create("INBOX/stop.md", added);
  const followUp = {
    review_id: "review_v2_update",
    title: "album standards v2",
    document_body: `## 중단 규칙\n${added}\n`,
    proposed_target: { path: first.target_path, revision: hash.sha256(state.bytes(first.target_path)), action: "update" },
    grounded_claims: [{ text: added, citations: [{ source_id: "source_stop", source_path: "INBOX/stop.md", locator: "INBOX/stop.md#L1", content_hash: hash.sha256(added), evidence_quote: added }] }],
  };
  const prepared = await flow.prepare({ item: followUp, fields: { ...FIELDS }, target_path: first.target_path, target_revision: hash.sha256(state.bytes(first.target_path)) });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.value.legacy_adoption, false);
  const applied = await flow.apply(prepared.value, { approved: true, claims_accepted: true, packet_hash: prepared.value.packet_hash });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(migrationCounters.reserve, 0, "a verified v2 update never enters the migration transaction");
});

test("Hub review_migration answers honestly for legacy notes without covering analysis", async () => {
  const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");
  const runtime = await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BYTES } });
  const hub = runtime.window.KnowledgeExplorerHub;
  const scanned = await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  assert.equal(scanned.ok, true, JSON.stringify(scanned));
  const decision = hub.llmWikiLifecycleSnapshot().migration.decisions.find((row) => row.path === LEGACY_PATH);
  assert.ok(decision, "the legacy note must be listed as a migration decision");

  const reviewed = await hub.dispatchLlmWikiAction({ action: "review_migration", decision_id: decision.decision_id });
  assert.equal(reviewed.ok, false, JSON.stringify(reviewed));
  assert.equal(reviewed.reason, "migration_review_unavailable");
  assert.equal(reviewed.provider_calls, 0);
  assert.equal(reviewed.write_counts?.canonical ?? 0, 0);
  assert.equal(runtime.app.vault.touched.filter(([kind, filePath]) => filePath === LEGACY_PATH).length, 0, "migration review never writes the legacy note");

  const approved = await hub.dispatchLlmWikiAction({ action: "approve_migration", decision_id: decision.decision_id });
  assert.equal(approved.ok, false, JSON.stringify(approved));
  assert.equal(approved.reason, "migration_review_unavailable");
  assert.equal(runtime.app.vault.touched.filter(([kind, filePath]) => filePath === LEGACY_PATH).length, 0);
});

async function hubWithCoveringReview() {
  const { buildPages, runHub } = require("./knowledge_hub_integration_harness.js");
  const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
  const disk = new Map();
  const storage = {
    exists: async (key) => disk.has(key),
    read: async (key) => disk.get(key),
    writeAtomic: async (key, bytes) => { disk.set(key, bytes); },
    quarantine: async () => { throw new Error("unexpected corrupt job"); },
  };
  const jobStore = jobs.createBatchJobStore({ storage });
  await jobStore.load();
  const job = await jobStore.createJob({ request_key: hash.sha256("legacy-adoption-hub"), sources: [{ source_id: "source_album_standards", revision_hash: hash.sha256(SOURCE_BYTES) }] });
  const item = { ...legacyItem(), processing_job_id: job.job_id };
  await jobStore.savePlanSnapshot({ job_id: job.job_id, source_id: "source_album_standards", source_revision: hash.sha256(SOURCE_BYTES), inventory_hash: hash.sha256("inventory"), plan_hash: hash.sha256("legacy adoption plan"), plan_revision: 1, status: "compiled", plan: { plan_version: "fixture_document_v1", pages: [] } });
  const snapshot = jobStore.getPlanSnapshot(job.job_id);
  await jobStore.savePlanSnapshot({ ...snapshot, plan_revision: snapshot.plan_revision + 1, canonical_reviews: { [hash.sha256(item.review_id)]: { item, fields: { ...FIELDS }, status: "review_ready", packet: null, claim_set: {} } } });
  return { runtime: await runHub({ pages: buildPages(), extraFiles: { [LEGACY_PATH]: LEGACY_BYTES, "SYSTEM/CACHE/llmwiki/batch-job-state.json": disk.get(jobs.STATE_FILE) } }) };
}

test("Hub review_migration opens the covering prepared review and never approves separately", async () => {
  const { runtime } = await hubWithCoveringReview();
  const hub = runtime.window.KnowledgeExplorerHub;
  await hub.dispatchLlmWikiAction({ action: "scan_migration" });
  const decision = hub.llmWikiLifecycleSnapshot().migration.decisions.find((row) => row.path === LEGACY_PATH);
  assert.ok(decision, "the legacy note must be listed as a migration decision");

  const reviewed = await hub.dispatchLlmWikiAction({ action: "review_migration", decision_id: decision.decision_id });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  assert.equal(reviewed.status, "waiting_for_human_review");
  assert.equal(reviewed.migration_path, LEGACY_PATH);
  assert.equal(reviewed.provider_calls, 0);
  assert.equal(reviewed.canonical_writes, 0);
  assert.equal(runtime.app.vault.touched.filter(([kind, filePath]) => filePath === LEGACY_PATH).length, 0, "opening a review never writes");
});
