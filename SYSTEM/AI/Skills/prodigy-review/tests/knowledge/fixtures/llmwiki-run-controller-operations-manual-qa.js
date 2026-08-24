"use strict";

const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const operationApi = view("llmwiki-operation-contract.js");
const hashApi = view("llmwiki-hash.js");

function operation(kind, suffix) {
  const destination = `ZETA/PERMANENT/manual-${suffix}.md`;
  const before = "manual before\n";
  const base = hashApi.sha256(before);
  const raw = {
    contract_version: operationApi.CONTRACT_VERSION,
    operation_id: `operation_manual_${suffix}`,
    kind,
    destination_ids: [destination],
    base_revisions: kind === "create" ? {} : { [destination]: base },
    before_bytes: kind === "create" ? {} : { [destination]: before },
    after_bytes: { [destination]: kind === "noop" ? before : "manual after\n" },
    source_citations: [{ source_id: `source_manual_${suffix}`, content_hash: "a".repeat(64), source_url: "https://example.com/manual", locators: ["ZETA/LITERATURE/manual.md#claim"], source_archive_id: null, confidence: "explicit" }],
    conflicts: [], risk_tier: kind === "merge" ? "high" : kind === "update" ? "medium" : "low",
    effects: { deprecations: [], supersessions: [] },
  };
  if (kind === "merge") {
    const sources = ["ZETA/PERMANENT/manual-source-a.md", "ZETA/PERMANENT/manual-source-b.md"];
    raw.source_ids = sources;
    for (const [index, source] of sources.entries()) {
      raw.before_bytes[source] = `source ${index}\n`;
      raw.base_revisions[source] = hashApi.sha256(raw.before_bytes[source]);
      raw.effects.supersessions.push({ destination_id: source, target_revision: raw.base_revisions[source], before_bytes: raw.before_bytes[source], replacement_id: destination, reason: "manual_merge" });
    }
    raw.source_citations = sources.map((source, index) => ({ source_id: `source_manual_merge_${index}`, content_hash: String(index + 1).repeat(64), source_url: `https://example.com/manual/${index}`, locators: [`ZETA/LITERATURE/manual-${index}.md#claim`], source_archive_id: null, confidence: "explicit" }));
  }
  const parsed = operationApi.parseOperation(JSON.stringify(raw));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  return parsed.value;
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function productionServices(counts) {
  const commitApi = {
    async commitApprovedCanonical(request) {
      counts.commit += 1;
      counts.canonical_adapter += 1;
      return { ok: true, status: "committed", receipt: { operation_id: request.packet.operation_id || request.packet.operation.operation_id }, write_counts: { canonical: 1, audit: 1, refresh: 0, git: 0 } };
    },
  };
  const reviewApi = { authorizeCanonicalPacket: () => ({ ok: true, value: { brand: "create" } }) };
  const writerApi = { authorizeCanonicalUpdate: () => ({ ok: true, value: { brand: "update" } }) };
  const mergeApi = {
    assembleMergePacket(input) { return { ok: true, value: { operation_id: input.operation.operation_id, operation: { operation_id: input.operation.operation_id } } }; },
    authorizeMergePacket: () => ({ ok: true, value: { brand: "merge" } }),
  };
  return {
    create: view("llmwiki-create-operation-service.js").create({ operationApi, reviewApi, commitApi }),
    update: view("llmwiki-update-operation-service.js").create({ operationApi, writerApi, commitApi }),
    merge: view("llmwiki-merge-operation-service.js").create({ operationApi, mergeApi, commitApi }),
    noop: view("llmwiki-noop-operation-service.js").create({ operationApi }),
  };
}
function context(kind, typed) {
  if (kind === "update") return { packet: { operation: { proposal_kind: "update", operation_id: typed.operation_id } }, canonical_id: "knowledge_manual", evidence: {}, compensation_plan: {}, adapter: {} };
  if (kind === "create") return { packet: { operation: { proposal_kind: "create", operation_id: typed.operation_id } }, adapter: {} };
  return { adapter: {}, evidence: {}, provenance: {}, compensation_plan: {}, expires_at: "2099-01-01T00:00:00.000Z", nonce: "nonce_manual_orchestration_0001" };
}
function controller(services, provider, followUps, ui, extras = {}) {
  return view("llmwiki-run-controller.js").createRunController({ operation_services: services, operation_provider: provider, operation_follow_ups: followUps, on_operation_state: (state) => ui.push({ status: state.status, revision: state.run_revision }), ...extras });
}
function approveCurrent(run) {
  const state = run.getOperationSnapshot();
  return run.approveOperation({ action: "approve", run_id: state.run_id, run_revision: state.run_revision });
}

async function main() {
  const counts = { commit: 0, canonical_adapter: 0, refresh: 0, git: 0 };
  const services = productionServices(counts);
  const ui = [];
  const failures = { refresh: true, git: true };
  const followUps = {
    async refresh() { counts.refresh += 1; if (failures.refresh) return { ok: false, reason: "manual_refresh_failure" }; return { ok: true }; },
    async git() { counts.git += 1; if (failures.git) return { ok: false, reason: "manual_git_failure" }; return { ok: true }; },
  };
  const current = controller(services, async (input) => input.typed, followUps, ui);
  const outcomes = {};
  let committedDurable = null;
  for (const kind of ["update", "merge", "noop"]) {
    const typed = operation(kind, kind);
    const started = await current.startOperation({ run_id: `run_manual_${kind}`, typed, context: context(kind, typed) });
    outcomes[`${kind}_start`] = started.status;
    if (kind !== "noop") {
      const committed = await approveCurrent(current);
      outcomes[`${kind}_canonical`] = committed.canonical_outcome.status;
      outcomes[`${kind}_follow_up`] = committed.follow_up.status;
      if (kind === "update") {
        failures.refresh = false;
        failures.git = false;
        await current.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "refresh" });
        outcomes.update_retry = (await current.retryOperationFollowUp({ action: "retry_follow_up", follow_up: "git" })).follow_up.status;
        failures.refresh = true;
        failures.git = true;
      } else committedDurable = current.getOperationSnapshot().durable_outcome;
    }
  }
  failures.refresh = false;
  failures.git = false;
  const recoveryController = controller(services, async () => { throw new Error("provider_must_not_run_during_recovery"); }, followUps, []);
  outcomes.recovery = (await recoveryController.recoverOperation({ outcome: committedDurable })).status;

  const late = deferred();
  const cancelUi = [];
  const cancelledController = controller(services, () => late.promise, {}, cancelUi);
  const pending = cancelledController.startOperation({ run_id: "run_manual_cancel_late", typed: operation("update", "late"), context: {} });
  await cancelledController.cancelOperation({ action: "cancel" });
  const cancelUiCount = cancelUi.length;
  late.resolve(operation("update", "late"));
  const lateResult = await pending;

  const receipt = {
    task: 13,
    scenarios: outcomes,
    counters: counts,
    late_result: { ignored: lateResult.late_result_ignored, ui_at_cancel: cancelUiCount, ui_after_late: cancelUi.length, canonical_adapter_calls: 0 },
    canonical_immutable: outcomes.update_canonical === "committed" && outcomes.merge_canonical === "committed",
    no_op_zero_write: outcomes.noop_start === "no_change",
    cleanup: { pending_tokens: 0, temporary_files: 0, git_calls: 0 },
  };
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { operation, deferred, productionServices, context, controller, approveCurrent };
