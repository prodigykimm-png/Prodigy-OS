"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const claims = view("llmwiki-claim-provenance.js");
const promotion = view("llmwiki-promotion-contract.js");
const writer = view("llmwiki-operation-writer.js");
const flows = view("llmwiki-lifecycle-migration-flows.js");
const candidateStore = view("knowledge-candidate-store.js");
const literatureStore = view("knowledge-source-store.js");
const handoff = view("llmwiki-object-handoff-contract.js");
const operationContract = view("llmwiki-operation-contract.js");
const merge = view("llmwiki-merge-transaction.js");
const obsidian = view("llmwiki-obsidian-adapter.js");
const migration = view("llmwiki-lifecycle-migration.js");
const { createTrustedFixture } = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");

const NOW = "2026-08-25T12:00:00.000Z";
const ACTUAL_DUSK = "/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk";
const CLI = path.join(ROOT, "script/migrate-llmwiki-lifecycle.js");
const sha = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

function vault(seed = {}) {
  const files = new Map(); const folders = new Set(["HUB", "SYSTEM"]); const writes = [];
  const record = (filePath, bytes) => ({ path: filePath, extension: filePath.endsWith(".md") ? "md" : "json", basename: path.posix.basename(filePath, path.posix.extname(filePath)), bytes });
  for (const [filePath, bytes] of Object.entries(seed)) files.set(filePath, record(filePath, bytes));
  const app = { vault: {
    getAbstractFileByPath(filePath) { return files.get(filePath) || (folders.has(filePath) || [...files.keys()].some((entry) => entry.startsWith(`${filePath}/`)) ? { path: filePath, children: [] } : null); },
    getFiles() { return [...files.values()]; },
    async read(file) { return files.get(file.path).bytes; },
    async createFolder(folder) { folders.add(folder); },
    async create(filePath, bytes) { if (files.has(filePath)) throw new Error("exists"); const file = record(filePath, bytes); files.set(filePath, file); writes.push(["create", filePath]); return file; },
    async modify(file, bytes) { files.get(file.path).bytes = bytes; writes.push(["modify", file.path]); },
    async delete(file) { files.delete(file.path); writes.push(["delete", file.path]); },
  } };
  return { app, files, writes, bytes: (filePath) => files.get(filePath)?.bytes ?? null };
}

function authority(candidate = false, label = "migration") {
  const sourceText = `Approved ${label} source`;
  const source = { source_id: `source_${label}`, source_kind: "immutable_source", source_revision: "a".repeat(64), extractor_revision: "b".repeat(64), source_text: sourceText, source_content_hash: sha(sourceText), provider_window: { start: 0, end: sourceText.length } };
  const created = claims.createClaimSet({ source_snapshots: [source], claims: [{ origin: "source_extract", text: sourceText, citations: [{ source_id: source.source_id, provider_span: { start: 0, end: sourceText.length, span_digest: sha(sourceText) } }] }] });
  const accepted = claims.transitionClaimSet(created.value, { claim_set_hash: created.value.claim_set_hash, claim_ids: [created.value.claims[0].claim_id], status: "accepted", authorized_by: "migration_reviewer", authorized_at: NOW });
  const input = { claim_set_hash: accepted.value.claim_set_hash, knowledge_kind: "principle", classification: "epistemic", state: "current", title: "Migration", statement: "Approved migration", relation_status: "resolved", approval_status: candidate ? "pending" : "approved", evidence: candidate ? [] : [{ evidence_id: "evidence_migration", source_ref: source.source_id, strength: "strong" }], claims: candidate ? [] : [{ claim_id: "claim_migration", statement: "Approved migration", evidence_refs: ["evidence_migration"], origin: "source_extract", review_status: "accepted" }], principle_boundaries: candidate ? { conditions: [], exclusions: [], invalidation_conditions: [] } : { conditions: ["approved"], exclusions: ["unapproved"], invalidation_conditions: ["stale"] }, principle_rationale: candidate ? "" : "Exact authority" };
  return { claimSet: accepted.value, input, receipt: promotion.evaluatePromotion(input) };
}

function source(disposition, sourcePath, bytes) {
  const target = Object.freeze({ path: sourcePath, lifecycle_class: "legacy_knowledge", disposition, quarantine_reason: null, bytes: Buffer.byteLength(bytes), revision: 1, sha256: sha(bytes) });
  return { inventory: Object.freeze({ digest: sha(`inventory:${disposition}:${sourcePath}`), items: Object.freeze([target]), counts: Object.freeze({ legacy_knowledge: 1 }) }), source_path: sourcePath, source_bytes: bytes, disposition };
}

function approve(plan, auth, nonce, expiresAt = "2099-01-01T00:00:00.000Z") {
  const result = flows.authorizePlan({ plan, claim_set: auth.claimSet, promotion_input: auth.input, promotion_receipt: auth.receipt, expires_at: expiresAt, nonce });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

function candidateInput(auth) {
  return { candidate_id: "candidate-migration-001", title: "Migration", statement: "Approved migration", reason: "Promotion gap", source_type: "manual_study", source_evidence_ids: [], source_objects: [], source_note: "Legacy Candidate", confidence: "explicit", suggested_domain: "reading", suggested_topics: [], approval_note: "", created: NOW, updated: NOW, promotion_unit: auth.input };
}

function literatureInput() {
  return { schema_version: 2, source_id: "source-migration-001", source_kind: "article", source_url: "https://example.test/migration", source_title: "Migration Literature", creator: "Author", publisher: "Publisher", published_at: "2026-08-25", source_claim: "Bounded source claim", my_interpretation: "Bounded interpretation", reusable_knowledge: "Reusable migration knowledge", summary_origin: "manual", knowledge_domain: "coding", knowledge_topics: ["typescript"], sources: [{ source_id: "source-map-001", span: { start: 0, end: 20 } }], relations: [{ relation_id: "relation-map-001", target_id: "source-map-001", type: "supports" }], created: NOW, updated: NOW };
}

async function planned(disposition, common, auth, extras = {}) {
  assert.equal(common.disposition, disposition);
  const result = await flows.buildPlan({ ...common, ...extras, promotion_receipt: auth.receipt, now: NOW });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

function projectServices(execution, preview) {
  const recordFor = (state) => [{ object_id: "project_alpha", object_type: "project", path: "PARA/PROJECTS/Alpha.md", revision: "r1", bytes: state.bytes("PARA/PROJECTS/Alpha.md") }];
  const make = (state) => handoff.create({ registry: handoff.createProductionAdapterRegistry(), objectResolver: handoff.createLocalObjectResolver(recordFor(state)), knowledgeResolver: handoff.createLocalKnowledgeResolver([]) });
  return { execution: make(execution), planning: make(preview) };
}

test("it exposes pre-approval sealed planning and no generic lifecycle transaction factory", () => {
  assert.equal(typeof flows.buildPlan, "function"); assert.equal(typeof flows.authorizePlan, "function"); assert.equal(typeof flows.executePlan, "function");
  assert.equal(writer.createLifecycleTransaction, undefined);
});

test("approval binds complete target, after bytes, authority method, finalization, and plan digest", async () => {
  const auth = authority(true); const common = source("candidate_migrate", "PARA/RESOURCES/Knowledge/Candidates/Legacy.md", "legacy candidate bytes");
  const planA = await planned("candidate_migrate", common, auth, { candidate_input: candidateInput(auth) });
  const approval = approve(planA, auth, "nonce_plan_binding_0001");
  assert.equal(approval.packet.plan_digest, planA.plan_digest);
  assert.deepEqual(approval.packet.target_paths, ["ZETA/CANDIDATES/Migration.md"]);
  assert.equal(approval.packet.writes[0].after_bytes, planA.steps[0].after_bytes);
  assert.equal(approval.packet.writes[0].after_sha256, sha(planA.steps[0].after_bytes));
  assert.deepEqual(approval.packet.authority_methods, ["KnowledgeCandidateStore.saveCandidate"]);
  const planB = await planned("candidate_migrate", common, auth, { candidate_input: { ...candidateInput(auth), candidate_id: "candidate-migration-002", title: "Other Migration" } });
  const disposable = vault();
  const rejected = await flows.executePlan({ plan: planB, approval, app: disposable.app }, { now: NOW });
  assert.equal(rejected.reason, "approval_plan_mismatch"); assert.equal(disposable.files.size, 0);
});

test("Candidate and Literature execute real Todo 9 stores and parse through established parsers", async () => {
  const candidateAuth = authority(true, "candidate"); const candidateCommon = source("candidate_migrate", "PARA/RESOURCES/Knowledge/Candidates/Legacy.md", "legacy candidate bytes");
  const candidatePlan = await planned("candidate_migrate", candidateCommon, candidateAuth, { candidate_input: candidateInput(candidateAuth) });
  const candidateVault = vault();
  const candidateResult = await flows.executePlan({ plan: candidatePlan, approval: approve(candidatePlan, candidateAuth, "nonce_candidate_real_01"), app: candidateVault.app }, { now: NOW });
  assert.equal(candidateResult.status, "committed", JSON.stringify(candidateResult));
  const candidateDoc = candidateStore.parseLifecycleDocument(candidateVault.bytes(candidatePlan.steps[0].target_path));
  assert.equal(candidateDoc.schema_version, 2); assert.equal(candidateDoc.type, "knowledge_candidate");

  const literatureAuth = authority(false, "literature"); const literatureCommon = source("literature_reclassify", "ZETA/LITERATURE/Legacy.md", "legacy literature bytes");
  const literaturePlan = await planned("literature_reclassify", literatureCommon, literatureAuth, { literature_input: literatureInput() });
  const literatureVault = vault();
  assert.equal((await flows.executePlan({ plan: literaturePlan, approval: approve(literaturePlan, literatureAuth, "nonce_literature_real_01"), app: literatureVault.app }, { now: NOW })).status, "committed");
  const literatureDoc = literatureStore.parseLifecycleDocument(literatureVault.bytes(literaturePlan.steps[0].target_path));
  assert.equal(literatureDoc.schema_version, 2); assert.equal(literatureDoc.type, "literature_note");
});

test("PARA executes Todo 10 approve/apply and exact target bytes", async () => {
  const before = "---\ntype: project\n---\n## ✍️ 메모 및 진행 상황\n\n### 다음 프로젝트에서는\n";
  const execution = vault({ "PARA/PROJECTS/Alpha.md": before }); const preview = vault({ "PARA/PROJECTS/Alpha.md": before }); const services = projectServices(execution, preview);
  const auth = authority(false, "para"); const common = source("para_handoff", "ZETA/PERMANENT/PARA Legacy.md", "legacy para bytes");
  const draft = { handoff_id: "handoff_migration_para", object_type: "project", object_id: "project_alpha", slot: "progress_note", text: "Approved local handoff", linked_lifecycle_ids: ["knowledge_migration"] };
  const plan = await planned("para_handoff", common, auth, { planning_handoff: services.planning, execution_handoff: services.execution, handoff: draft, preview_app: preview.app });
  const result = await flows.executePlan({ plan, approval: approve(plan, auth, "nonce_para_real_0001"), app: execution.app }, { now: NOW });
  assert.equal(result.status, "committed"); assert.equal(execution.bytes("PARA/PROJECTS/Alpha.md"), plan.steps[0].after_bytes); assert.match(execution.bytes("PARA/PROJECTS/Alpha.md"), /Approved local handoff/u);
});

test("production nonce reservation permits one concurrent apply and durable restart duplicate", async () => {
  const auth = authority(true, "nonce"); const common = source("candidate_migrate", "PARA/RESOURCES/Knowledge/Candidates/Legacy.md", "legacy candidate bytes");
  const plan = await planned("candidate_migrate", common, auth, { candidate_input: candidateInput(auth) }); const approval = approve(plan, auth, "nonce_concurrent_real_01"); const disposable = vault();
  const results = await Promise.all([flows.executePlan({ plan, approval, app: disposable.app }, { now: NOW }), flows.executePlan({ plan, approval, app: disposable.app }, { now: NOW })]);
  assert.equal(results.filter((item) => item.status === "committed").length, 1, JSON.stringify(results)); assert.equal(results.filter((item) => item.reason === "nonce_in_progress").length, 1);
  assert.equal(disposable.writes.filter(([kind, filePath]) => kind === "create" && filePath === plan.steps[0].target_path).length, 1);
  assert.equal((await flows.executePlan({ plan, approval, app: disposable.app }, { now: NOW })).status, "duplicate");
});

test("canonical adoption executes Todo 11 finalization and Todo 13 authority", async () => {
  const fixture = await createTrustedFixture({ authorizedOnly: true }); const sourceBytes = "---\ntype: knowledge\n---\nLegacy canonical\n";
  const common = source("adopt_update", "ZETA/PERMANENT/Legacy Canonical.md", sourceBytes);
  const plan = await planned("adopt_update", common, { receipt: fixture.promotion_receipt }, { canonical_request: { packet: fixture.packet, authorization: fixture.authorization }, source_action: "preserve" });
  const approval = approve(plan, { claimSet: fixture.claim_set, input: { ...fixture.promotion_input, claim_set_hash: fixture.claim_set.claim_set_hash }, receipt: promotion.evaluatePromotion({ ...fixture.promotion_input, claim_set_hash: fixture.claim_set.claim_set_hash }) }, "nonce_canonical_lifecycle_01");
  const result = await flows.executePlan({ plan, approval, app: fixture.app }, { now: NOW });
  assert.equal(result.status, "committed", JSON.stringify(result));
  const authorities = await obsidian.createObsidianAdapter(fixture.app).readFinalizedCanonicalAuthorities();
  assert.equal(authorities.some((receipt) => obsidian.finalizedCanonicalAuthorityData(receipt)?.path === fixture.packet.target_path), true);
});

test("canonical target finalizes before approved merge supersedes source with zero deletions", async () => {
  const fixture = await createTrustedFixture({ authorizedOnly: true, title: "fixture-authority" });
  const sourcePath = "ZETA/PERMANENT/legacy-merge-source.md"; const sourceBytes = "---\ntype: knowledge\n---\nLegacy merge source\n";
  const secondSourcePath = "ZETA/PERMANENT/legacy-merge-support.md"; const secondSourceBytes = "---\ntype: knowledge\n---\nLegacy merge support\n";
  await fixture.app.vault.create(sourcePath, sourceBytes); await fixture.app.vault.create(secondSourcePath, secondSourceBytes);
  const destinationPath = fixture.packet.target_path; const destinationBytes = fixture.packet.after_bytes;
  const baseRevisions = { [destinationPath]: sha(destinationBytes), [sourcePath]: sha(sourceBytes), [secondSourcePath]: sha(secondSourceBytes) };
  const operation = operationContract.parseOperation(JSON.stringify({
    contract_version: operationContract.CONTRACT_VERSION, operation_id: "operation_lifecycle_merge", kind: "merge",
    destination_ids: [destinationPath], source_ids: [sourcePath, secondSourcePath], base_revisions: baseRevisions,
    before_bytes: { [destinationPath]: destinationBytes, [sourcePath]: sourceBytes, [secondSourcePath]: secondSourceBytes }, after_bytes: { [destinationPath]: destinationBytes },
    source_citations: [{ source_id: "evidence_merge_source", content_hash: "c".repeat(64), source_url: "https://example.test/merge", locators: ["ZETA/LITERATURE/merge.md#claim"], source_archive_id: null, confidence: "explicit" }],
    conflicts: [], risk_tier: "high", effects: { deprecations: [], supersessions: [
      { destination_id: sourcePath, target_revision: baseRevisions[sourcePath], before_bytes: sourceBytes, replacement_id: destinationPath, reason: "approved_migration_merge" },
      { destination_id: secondSourcePath, target_revision: baseRevisions[secondSourcePath], before_bytes: secondSourceBytes, replacement_id: destinationPath, reason: "approved_migration_merge" },
    ] },
  }));
  assert.equal(operation.ok, true, JSON.stringify(operation));
  const assembled = merge.assembleMergePacket({ operation: operation.value, evidence: { contract_version: "llmwiki_evidence_contract_v1", operation_id: "operation_lifecycle_merge", approval_eligible: true, stale: false, claim_lineage: [{ claim_id: "claim_merge", citation_ids: ["citation_merge"] }] }, provenance: { source_snapshots: [{ source_id: sourcePath, source_revision: baseRevisions[sourcePath], extractor_revision: "d".repeat(64) }, { source_id: secondSourcePath, source_revision: baseRevisions[secondSourcePath], extractor_revision: "e".repeat(64) }] }, compensation_plan: { strategy: "restore_all_exact_before_state" }, expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_lifecycle_merge_01" });
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  const mergeAuthorization = merge.authorizeMergePacket(assembled.value, { action: "approve_merge", operation_id: "operation_lifecycle_merge" });
  assert.equal(mergeAuthorization.ok, true);
  const common = source("adopt_update", sourcePath, sourceBytes);
  const plan = await planned("adopt_update", common, { receipt: fixture.promotion_receipt }, { canonical_request: { packet: fixture.packet, authorization: fixture.authorization }, merge_request: { packet: assembled.value, authorization: mergeAuthorization.value }, source_action: "supersede", merge_intent: "merge" });
  const lifecycleAuth = { claimSet: fixture.claim_set, input: { ...fixture.promotion_input, claim_set_hash: fixture.claim_set.claim_set_hash }, receipt: promotion.evaluatePromotion({ ...fixture.promotion_input, claim_set_hash: fixture.claim_set.claim_set_hash }) };
  const result = await flows.executePlan({ plan, approval: approve(plan, lifecycleAuth, "nonce_lifecycle_plan_merge_01"), app: fixture.app }, { now: NOW });
  assert.equal(result.status, "committed", JSON.stringify(result)); assert.deepEqual(result.receipt.deletions, []);
  assert.match(await fixture.app.vault.read(fixture.app.vault.getAbstractFileByPath(sourcePath)), /llmwiki_supersession_relation_v1/u);
  const authorities = await obsidian.createObsidianAdapter(fixture.app).readFinalizedCanonicalAuthorities();
  assert.equal(authorities.some((receipt) => obsidian.finalizedCanonicalAuthorityData(receipt)?.path === destinationPath), true);
});

test("hold, legacy, and noop produce durable zero-target receipts", async () => {
  for (const disposition of ["hold_quarantine", "legacy_unchanged", "noop"]) {
    const auth = authority(false, disposition); const common = source(disposition, `ZETA/PERMANENT/${disposition}.md`, `${disposition} bytes`); const plan = await planned(disposition, common, auth); const disposable = vault();
    const result = await flows.executePlan({ plan, approval: approve(plan, auth, `nonce_zero_${disposition}_01`), app: disposable.app }, { now: NOW });
    assert.equal(result.status, "committed"); assert.deepEqual(result.receipt.target_paths, []); assert.equal(result.write_counts.canonical, 0);
  }
});

test("closed-world write, finalize, consumption, and rollback failures restore exact declared and audit state", async () => {
  const auth = authority(true, "failure"); const common = source("candidate_migrate", "PARA/RESOURCES/Knowledge/Candidates/Legacy.md", "legacy candidate bytes"); const plan = await planned("candidate_migrate", common, auth, { candidate_input: candidateInput(auth) });

  const writeFailure = vault(); const writeCreate = writeFailure.app.vault.create;
  writeFailure.app.vault.create = async (filePath, bytes) => { if (filePath === plan.steps[0].target_path) throw new Error("injected"); return writeCreate(filePath, bytes); };
  const writeResult = await flows.executePlan({ plan, approval: approve(plan, auth, "nonce_write_failure_01"), app: writeFailure.app }, { now: NOW });
  assert.equal(writeResult.compensation.status, "restored"); assert.equal(writeFailure.bytes(plan.steps[0].target_path), null); assert.equal(writeFailure.bytes(".llmwiki-audit/lifecycle/nonce_write_failure_01.json"), null);

  const consumeFailure = vault(); const consumeModify = consumeFailure.app.vault.modify;
  consumeFailure.app.vault.modify = async (file, bytes) => { if (file.path === ".llmwiki-audit/lifecycle/nonce_consume_failure_01.json") throw new Error("injected"); return consumeModify(file, bytes); };
  const consumeResult = await flows.executePlan({ plan, approval: approve(plan, auth, "nonce_consume_failure_01"), app: consumeFailure.app }, { now: NOW });
  assert.equal(consumeResult.compensation.status, "restored"); assert.equal(consumeFailure.files.size, 0);

  const rollbackFailure = vault(); const rollbackModify = rollbackFailure.app.vault.modify;
  rollbackFailure.app.vault.modify = async (file, bytes) => { if (file.path === ".llmwiki-audit/lifecycle/nonce_rollback_failure_01.json") throw new Error("injected"); return rollbackModify(file, bytes); };
  rollbackFailure.app.vault.delete = async () => { throw new Error("injected"); };
  const rollbackResult = await flows.executePlan({ plan, approval: approve(plan, auth, "nonce_rollback_failure_01"), app: rollbackFailure.app }, { now: NOW });
  assert.equal(rollbackResult.reason, "compensation_failed"); assert.equal(rollbackResult.compensation.status, "manual_restore_required"); assert.equal(rollbackResult.compensation.plan_digest, plan.plan_digest);

  const fixture = await createTrustedFixture({ authorizedOnly: true, title: "finalize-failure" }); const canonicalCommon = source("adopt_update", "ZETA/PERMANENT/finalize-source.md", "legacy canonical bytes");
  const canonicalPlan = await planned("adopt_update", canonicalCommon, { receipt: fixture.promotion_receipt }, { canonical_request: { packet: fixture.packet, authorization: fixture.authorization }, source_action: "preserve" });
  const lifecycleAuth = { claimSet: fixture.claim_set, input: { ...fixture.promotion_input, claim_set_hash: fixture.claim_set.claim_set_hash }, receipt: promotion.evaluatePromotion({ ...fixture.promotion_input, claim_set_hash: fixture.claim_set.claim_set_hash }) };
  const originalModify = fixture.app.vault.modify;
  fixture.app.vault.modify = async (file, bytes) => { if (file.path === `.llmwiki-audit/${fixture.packet.nonce}.json`) throw new Error("injected finalize"); return originalModify(file, bytes); };
  const finalizeResult = await flows.executePlan({ plan: canonicalPlan, approval: approve(canonicalPlan, lifecycleAuth, "nonce_finalize_failure_01"), app: fixture.app }, { now: NOW });
  assert.equal(finalizeResult.compensation.status, "restored"); assert.equal(fixture.files.has(fixture.packet.target_path), false); assert.equal(fixture.files.has(`.llmwiki-audit/${fixture.packet.nonce}.json`), false);
});

test("snapshot failure aborts only its reservation and preserves pre-existing immutable audit bytes", async () => {
  const auth = authority(false, "backup"); const common = source("noop", "ZETA/PERMANENT/backup.md", "backup bytes"); const plan = await planned("noop", common, auth); const approval = approve(plan, auth, "nonce_backup_integrity_01");
  const existingPath = ".llmwiki-audit/existing-authority.json"; const existingBytes = "immutable-existing-audit\n"; const disposable = vault({ [existingPath]: existingBytes });
  const getFiles = disposable.app.vault.getFiles; let fail = true;
  disposable.app.vault.getFiles = () => { if (fail) { fail = false; throw new Error("injected_snapshot_failure"); } return getFiles(); };
  const failed = await flows.executePlan({ plan, approval, app: disposable.app }, { now: NOW });
  assert.equal(failed.reason, "backup_failed"); assert.equal(failed.compensation.status, "not_needed");
  assert.equal(disposable.bytes(existingPath), existingBytes); assert.equal(disposable.bytes(".llmwiki-audit/lifecycle/nonce_backup_integrity_01.json"), null);
  const retry = await flows.executePlan({ plan, approval, app: disposable.app }, { now: NOW });
  assert.equal(retry.status, "committed"); assert.equal(disposable.bytes(existingPath), existingBytes);
});

test("expired approval rejects before reserve and old generic adversarial seam is closed", async () => {
  const auth = authority(false, "expired"); const common = source("noop", "ZETA/PERMANENT/noop.md", "noop bytes"); const plan = await planned("noop", common, auth); const approval = approve(plan, auth, "nonce_expired_plan_01", "2000-01-01T00:00:00.000Z"); const disposable = vault();
  assert.equal((await flows.executePlan({ plan, approval, app: disposable.app }, { now: NOW })).reason, "approval_expired");
  assert.equal((await flows.executeDisposition({ approval, canonical_document: { title: "caller" } })).reason, "preapproval_plan_required");
});

test("it retains the 24/3/4 actual-Dusk zero-write inventory", { skip: process.env.LLMWIKI_MIGRATION_DRY_RUN !== "1" || !fs.existsSync(ACTUAL_DUSK) }, () => {
  const inventory = migration.buildInventory({ vault_root: ACTUAL_DUSK }); assert.equal(inventory.total_items, 31); assert.equal(flows.compareWithBoundSnapshot(inventory, { knowledge: 24, candidate: 3, literature: 4 }).status, "matched");
  for (const flags of [[], ["--inventory", "--dry-run"]]) { const result = spawnSync(process.execPath, [CLI, "--vault-path", ACTUAL_DUSK, ...flags], { encoding: "utf8" }); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).zero_writes, true); }
});
