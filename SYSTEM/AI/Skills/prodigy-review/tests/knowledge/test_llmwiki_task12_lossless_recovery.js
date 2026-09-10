"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const V = path.resolve(__dirname, "../../../../../Views");
const review = require(path.join(V, "llmwiki-document-canonical-review.js"));
const jobs = require(path.join(V, "llmwiki-batch-job-store.js"));
const hash = require(path.join(V, "llmwiki-hash.js"));
const documents = require(path.join(V, "knowledge-candidate-store.js"));
const fields = { knowledge_kind: "claim", knowledge_domain: "coding", knowledge_topics: "ai", application_trigger: "model check", application_contexts: "coding/ai", conditions: "indoor only", invalidation_conditions: "source changes", relation_status: "resolved", classification: "epistemic", evidence_strength: "sufficient" };
const T0 = "2026-09-10T01:00:00.000Z", T1 = "2026-09-10T01:05:00.000Z", T2 = "2026-09-10T03:00:00.000Z";
const json = file => JSON.parse(fs.readFileSync(file, "utf8"));
const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
function appAt(dir, fault) {
  const absolute = p => path.join(dir, "vault", p);
  const file = p => fs.existsSync(absolute(p)) ? { path: p, extension: p.endsWith(".md") ? "md" : "json", basename: path.basename(p, ".md") } : null;
  function write(p, bytes, create) {
    const canonical = p.startsWith("ZETA/PERMANENT/");
    if (canonical && fault === "before") process.exit(71);
    if (create && fs.existsSync(absolute(p))) throw new Error("exists");
    fs.mkdirSync(path.dirname(absolute(p)), { recursive: true });
    fs.writeFileSync(absolute(p), bytes);
    if (canonical) {
      fs.appendFileSync(path.join(dir, "writes.jsonl"), JSON.stringify({ path: p, sha256: hash.sha256(bytes), bytes: Buffer.byteLength(bytes) }) + "\n");
      if (fault === "after") throw new Error("saved_but_acknowledgement_lost");
      if (fault === "after_exit") process.exit(72);
    }
    return file(p);
  }
  const vault = { getAbstractFileByPath: file, getFiles: () => fs.readdirSync(path.join(dir, "vault"), { recursive: true }).filter(p => fs.statSync(absolute(p)).isFile()).map(file),
    read: async f => fs.readFileSync(absolute(f.path), "utf8"), createFolder: async p => fs.mkdirSync(absolute(p), { recursive: true }),
    create: async (p, bytes) => write(p, bytes, true), modify: async (f, bytes) => write(f.path, bytes, false) };
  return { vault, metadataCache: { getFileCache: f => { try { return { frontmatter: documents.parseLifecycleDocument(fs.readFileSync(absolute(f.path), "utf8")) }; } catch { return { frontmatter: {} }; } } } };
}
async function worker(dir, phase, fault) {
  fs.mkdirSync(path.join(dir, "vault"), { recursive: true });
  const app = appAt(dir, fault);
  const nodeStorage = jobs.createNodeStorage(dir);
  const storage = { ...nodeStorage, async writeAtomic(name, bytes) {
    await nodeStorage.writeAtomic(name, bytes);
    if (fault === "repacket" && Object.values(JSON.parse(bytes).plans).some(p => Object.values(p.canonical_reviews || {}).some(r => r.fields.conditions === "fresh review"))) process.exit(73);
    if (fault === "receipt_ui" && Object.values(JSON.parse(bytes).plans).some(p => Object.values(p.canonical_reviews || {}).some(r => r.status === "resolved"))) process.exit(74);
  } };
  const jobStore = jobs.createBatchJobStore({ storage });
  await jobStore.load();
  let config;
  if (phase === "prepare") {
    const sourcePath = "ZETA/LITERATURE/task12.md", text = "Exact evidence: café and 한글.\r\nPreserve trailing spaces.  \n";
    await app.vault.create(sourcePath, text);
    const item = { review_id: "review_task12", title: "Recovery model", document_body: "## Model\n\n" + text, grounded_claims: [{ text: "The model requires exact evidence.", citations: [{ source_id: "source_task12", source_path: sourcePath, locator: sourcePath + "#L1", content_hash: hash.sha256(text), evidence_quote: "Exact evidence: café and 한글." }] }] };
    const job = await jobStore.createJob({ request_key: hash.sha256("task12"), sources: [{ source_id: "source_task12", revision_hash: hash.sha256(text) }] });
    await jobStore.savePlanSnapshot({ job_id: job.job_id, source_id: "source_task12", source_revision: hash.sha256(text), inventory_hash: hash.sha256("inventory"), plan_hash: hash.sha256("plan"), plan_revision: 1, status: "compiled", plan: { plan_version: "task12", pages: [] }, pending_work: ["unrelated_pending_document"] });
    config = { item, jobId: job.job_id };
    put(path.join(dir, "config.json"), config);
  } else config = json(path.join(dir, "config.json"));
  const flow = review.create({ app, jobStore, jobId: config.jobId, now: () => phase === "prepare" ? T0 : ["repacket", "recover_repacket"].includes(phase) ? T2 : T1 });
  if (phase === "prepare" || phase === "repacket") return flow.prepare({ item: config.item, fields: phase === "repacket" ? { ...fields, conditions: "fresh review" } : fields });
  if (phase === "prepare_update") {
    const previous = Object.values(jobStore.getPlanSnapshot(config.jobId).canonical_reviews)[0];
    return flow.prepare({ item: config.item, fields: { ...fields, conditions: "updated scope" }, target_path: previous.packet.target_path });
  }
  const restored = await flow.restore(config.item);
  if (phase === "restore" || !restored.ok || restored.status === "completed") return restored;
  return flow.apply(restored.value, { approved: true, claims_accepted: true, packet_hash: restored.value.packet_hash });
}
if (process.env.TASK12_WORKER) {
  worker(process.env.TASK12_DIR, process.env.TASK12_PHASE, process.env.TASK12_FAULT).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.stack); process.exitCode = 1; });
} else {
  const test = require("node:test");
  function run(dir, phase, fault = "", exit = 0) {
    const result = spawnSync(process.execPath, [__filename], { env: { ...process.env, TASK12_WORKER: "1", TASK12_DIR: dir, TASK12_PHASE: phase, TASK12_FAULT: fault }, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, exit, result.stderr || result.stdout);
    return exit ? null : JSON.parse(result.stdout.trim());
  }
  function setup(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-task12-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); assert.equal(run(dir, "prepare").ok, true); return dir; }
  const plan = dir => Object.values(json(path.join(dir, jobs.STATE_FILE)).plans)[0];
  const record = dir => Object.values(plan(dir).canonical_reviews)[0];
  const count = dir => fs.existsSync(path.join(dir, "writes.jsonl")) ? fs.readFileSync(path.join(dir, "writes.jsonl"), "utf8").trim().split("\n").length : 0;
  function converged(t, dir, phase = "apply") {
    const expected = record(dir).packet;
    const result = run(dir, phase);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(fs.readFileSync(path.join(dir, "vault", expected.target_path)), Buffer.from(expected.after_bytes));
    assert.equal(count(dir), 1);
    assert.equal(run(dir, "restore").status, "completed");
    assert.equal(count(dir), 1);
    assert.deepEqual(plan(dir).pending_work, ["unrelated_pending_document"]);
    const counters = { point: t.name, canonical_writes: count(dir), second_writes: 0, provider_calls: 0, final_sha256: expected.after_sha256, final_bytes: Buffer.byteLength(expected.after_bytes), pending_work: plan(dir).pending_work.length };
    t.diagnostic(JSON.stringify(counters));
  }
  test("a: hard interruption after durable preparation before canonical write", t => {
    const dir = setup(t); run(dir, "apply", "before", 71); assert.equal(count(dir), 0); converged(t, dir);
  });
  test("b: save succeeds but acknowledgement and checkpoint are lost", t => {
    const dir = setup(t); const failed = run(dir, "apply", "after"); assert.equal(failed.ok, false); assert.equal(count(dir), 1); converged(t, dir);
  });
  test("c: stale repacket checkpoint survives interruption with both pending packets", t => {
    const dir = setup(t), original = record(dir).packet; run(dir, "repacket", "repacket", 73);
    const fresh = record(dir); assert.notEqual(fresh.packet.packet_hash, original.packet_hash);
    assert.ok(fresh.superseded_reviews?.some(r => r.packet.packet_hash === original.packet_hash && r.packet.after_bytes === original.after_bytes), "superseded pending bytes must survive");
    assert.equal(count(dir), 0); converged(t, dir, "recover_repacket");
  });
  test("repeated crashes after save before receipt and after receipt before UI do not write twice", t => {
    const dir = setup(t); run(dir, "apply", "after_exit", 72); assert.equal(count(dir), 1);
    run(dir, "apply", "receipt_ui", 74); assert.equal(count(dir), 1); converged(t, dir);
  });
  for (const fault of ["before", "after_exit"]) test(`update ${fault}: a fresh process resumes only the exact pending write`, t => {
    const dir = setup(t); assert.equal(run(dir, "apply").ok, true); assert.equal(run(dir, "prepare_update").ok, true);
    const expected = record(dir).packet;
    run(dir, "apply", fault, fault === "before" ? 71 : 72);
    assert.equal(count(dir), fault === "before" ? 1 : 2);
    const completed = run(dir, "apply"); assert.equal(completed.ok, true, JSON.stringify(completed));
    assert.equal(count(dir), 2); assert.deepEqual(fs.readFileSync(path.join(dir, "vault", expected.target_path)), Buffer.from(expected.after_bytes));
    assert.equal(run(dir, "restore").status, "completed"); assert.equal(count(dir), 2);
    t.diagnostic(JSON.stringify({ point: fault, baseline_writes: 1, update_writes: 1, second_writes: 0, provider_calls: 0, final_sha256: expected.after_sha256 }));
  });
  test("an old approval cannot replace the durable repacket checkpoint", async t => {
    const dir = setup(t), config = json(path.join(dir, "config.json"));
    const flow = review.create({ app: appAt(dir), jobStore: jobs.createBatchJobStore({ storage: jobs.createNodeStorage(dir) }), jobId: config.jobId, now: () => T1 });
    const original = await flow.restore(config.item); assert.equal(original.ok, true);
    const fresh = await flow.prepare({ item: config.item, fields: { ...fields, conditions: "fresh review" } }); assert.equal(fresh.ok, true);
    const checkpoint = fs.readFileSync(path.join(dir, jobs.STATE_FILE));
    const result = await flow.apply(original.value, { approved: true, claims_accepted: true, packet_hash: original.value.packet_hash });
    assert.equal(result.reason, "stale_review_packet"); assert.equal(count(dir), 0); assert.deepEqual(fs.readFileSync(path.join(dir, jobs.STATE_FILE)), checkpoint);
  });
  test("cached success rechecks the actual file before reporting completion", async t => {
    const dir = setup(t), config = json(path.join(dir, "config.json"));
    const flow = review.create({ app: appAt(dir), jobStore: jobs.createBatchJobStore({ storage: jobs.createNodeStorage(dir) }), jobId: config.jobId, now: () => T1 });
    const restored = await flow.restore(config.item); assert.equal(restored.ok, true);
    const decision = { approved: true, claims_accepted: true, packet_hash: restored.value.packet_hash };
    assert.equal((await flow.apply(restored.value, decision)).ok, true);
    const target = path.join(dir, "vault", restored.value.target_path); fs.appendFileSync(target, "\nIntervening edit\n"); const edited = fs.readFileSync(target);
    assert.equal((await flow.apply(restored.value, decision)).reason, "stale_before_write"); assert.equal(count(dir), 1); assert.deepEqual(fs.readFileSync(target), edited);
  });
  test("corrupt pending packet fails closed and retains exact recovery preview", t => {
    const dir = setup(t), statePath = path.join(dir, jobs.STATE_FILE), state = json(statePath), r = Object.values(Object.values(state.plans)[0].canonical_reviews)[0];
    r.packet.after_sha256 = "0".repeat(64); put(statePath, state);
    const before = fs.readFileSync(statePath); const result = run(dir, "restore");
    assert.equal(result.ok, false); assert.equal(result.retained_preview?.after, r.packet.after_bytes); assert.deepEqual(fs.readFileSync(statePath), before); assert.equal(count(dir), 0);
  });
  test("prepared audit hash mismatch preserves pending work without writing", t => {
    const dir = setup(t); run(dir, "apply", "before", 71);
    const auditPath = path.join(dir, "vault", ".llmwiki-audit", record(dir).packet.nonce + ".json");
    const audit = json(auditPath); audit.final_audit_sha256 = "0".repeat(64); put(auditPath, audit);
    const before = fs.readFileSync(auditPath); assert.equal(run(dir, "apply").ok, false);
    assert.deepEqual(fs.readFileSync(auditPath), before); assert.equal(count(dir), 0); assert.ok(record(dir).packet.after_bytes);
  });
  test("an intervening exact revert never recreates a previously committed update", t => {
    const dir = setup(t); assert.equal(run(dir, "apply").ok, true);
    assert.equal(run(dir, "prepare_update").ok, true);
    run(dir, "apply", "receipt_ui", 74); assert.equal(count(dir), 2);
    const statePath = path.join(dir, jobs.STATE_FILE), state = json(statePath), r = Object.values(Object.values(state.plans)[0].canonical_reviews)[0];
    r.status = "running"; r.outcome = null; put(statePath, state);
    const target = path.join(dir, "vault", r.packet.target_path); fs.writeFileSync(target, r.packet.before_bytes);
    const result = run(dir, "apply"); assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(fs.readFileSync(target, "utf8"), r.packet.before_bytes); assert.equal(count(dir), 2);
  });
  test("resolved record is not authority for corrupt packet or an intervening edit", t => {
    const dir = setup(t); assert.equal(run(dir, "apply").ok, true);
    const statePath = path.join(dir, jobs.STATE_FILE), state = json(statePath), r = Object.values(Object.values(state.plans)[0].canonical_reviews)[0];
    r.packet.before_sha256 = "0".repeat(64); put(statePath, state);
    assert.equal(run(dir, "restore").ok, false, "resolved must verify packet hashes");
    fs.appendFileSync(path.join(dir, "vault", r.packet.target_path), "\nIntervening edit\n");
    const edited = fs.readFileSync(path.join(dir, "vault", r.packet.target_path));
    assert.equal(run(dir, "apply").ok, false); assert.deepEqual(fs.readFileSync(path.join(dir, "vault", r.packet.target_path)), edited); assert.equal(count(dir), 1);
  });
}
