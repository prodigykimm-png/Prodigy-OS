(function (root) {
  "use strict";

  const sourceApi = root.LLMWikiSourceAdapters || (typeof require === "function" ? require("./llmwiki-source-adapters.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const riskApi = root.LLMWikiRiskApprovalPacket || (typeof require === "function" ? require("./llmwiki-risk-approval-packet.js") : null);
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  const MIGRATION_VERSION = "llmwiki_migration_packet_v1";
  const ROLLOUT_VERSION = "llmwiki_rollout_state_v1";
  const ROLLOUT_PHASES = Object.freeze(["create", "update", "merge", "maintenance", "git", "resurfacing"]);
  const PACKETS = new WeakSet();
  const AUTHORIZATIONS = new WeakSet();
  const CONSUMED = new WeakSet();

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function freeze(value) {
    if (operationApi?.isOperationRecord?.(value) || riskApi?.isRiskApprovalPacket?.(value) || PACKETS.has(value) || AUTHORIZATIONS.has(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha(value) { return hashApi.sha256(String(value)); }
  function zero() { return freeze({ canonical: 0, audit: 0, refresh: 0, git: 0 }); }
  function fail(reason, extras = {}) { return freeze({ ok: false, status: "rejected", reason, writer_calls: 0, write_counts: zero(), ...extras }); }
  function pathsFor(operation) {
    return [...new Set([
      ...operation.destination_ids,
      ...operation.effects.deprecations.map((item) => item.destination_id),
      ...operation.effects.supersessions.map((item) => item.destination_id),
    ])].sort();
  }
  function operationFrom(value) {
    if (operationApi?.isOperationRecord?.(value)) return value;
    if (plain(value) && operationApi?.isOperationRecord?.(value.operation)) return value.operation;
    const serialized = typeof value === "string" ? value : plain(value) && typeof value.serialized_operation === "string" ? value.serialized_operation : null;
    const parsed = serialized && operationApi?.parseOperation?.(serialized);
    return parsed && parsed.ok === true ? parsed.value : null;
  }

  function createMigrationService(options = {}) {
    const adapters = options.sourceAdapters || sourceApi?.createSourceAdapters?.(options.source_adapter_options || {});
    const transaction = options.transactionAdapter || null;
    const refresh = typeof options.refresh === "function" ? options.refresh : null;
    const git = typeof options.git === "function" ? options.git : null;
    const audit = typeof options.audit === "function" ? options.audit : null;
    const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    const dryRuns = new WeakSet();

    async function normalizeSources(inputs) {
      if (!adapters || typeof adapters.extract !== "function") return fail("source_adapter_unavailable", { status: "extractor_required" });
      if (!Array.isArray(inputs) || inputs.length === 0) return fail("source_inputs_required", { status: "extractor_required" });
      const sources = [];
      for (const input of inputs) {
        const adapted = await adapters.extract(input);
        if (!adapted || adapted.ok !== true) return freeze({ ...(adapted || fail("source_extraction_failed")), writer_calls: 0, user_authored_schema_fields: 0 });
        sources.push(adapted.value);
      }
      return freeze({ ok: true, status: "normalized", sources, writer_calls: 0, user_authored_schema_fields: 0 });
    }

    async function dryRun(input = {}) {
      const normalized = await normalizeSources(input.source_inputs);
      if (!normalized.ok) return normalized;
      if (typeof input.classify !== "function") return fail("migration_classifier_required");
      const decisions = [];
      for (let index = 0; index < normalized.sources.length; index += 1) {
        let supplied;
        try { supplied = await input.classify(normalized.sources[index], index, freeze({ canonical_documents: input.canonical_documents || [] })); }
        catch (_error) { return fail("migration_classification_failed"); }
        const operation = operationFrom(supplied);
        if (!operation) return fail("typed_migration_operation_required", { source_index: index });
        const conflict = operation.conflicts.some((item) => item.status !== "resolved");
        const kind = conflict ? "conflict" : operation.kind;
        decisions.push(freeze({
          decision_id: `migration_decision_${sha(`${normalized.sources[index].snapshot_id}:${operation.operation_id}:${kind}`).slice(0, 24)}`,
          source_snapshot_id: normalized.sources[index].snapshot_id,
          kind,
          operation,
          approval_eligible: !conflict,
          writer_calls: 0,
        }));
      }
      const body = { migration_version: MIGRATION_VERSION, source_snapshot_ids: normalized.sources.map((item) => item.snapshot_id), decision_ids: decisions.map((item) => item.decision_id) };
      const result = freeze({ ok: true, status: "classified", dry_run_id: `migration_dry_${sha(stable(body)).slice(0, 24)}`, sources: normalized.sources, decisions, writer_calls: 0, write_counts: zero(), user_authored_schema_fields: 0 });
      dryRuns.add(result);
      return result;
    }

    function createMigrationPacket(input = {}) {
      const dry = input.dry_run;
      if (!dry || !dryRuns.has(dry)) return fail("branded_migration_dry_run_required");
      const decision = dry.decisions.find((item) => item.decision_id === input.decision_id);
      if (!decision) return fail("migration_decision_required");
      if (!decision.approval_eligible) return fail("conflict_not_approval_eligible");
      const built = riskApi?.buildRiskApprovalPacket?.({
        run_id: `run_${dry.dry_run_id.slice("migration_dry_".length)}`,
        run_revision: 1,
        packet_revision: 1,
        operation: decision.operation,
        summary: `${decision.kind} migration`,
        provenance: { source: "existing_zeta_dry_run", source_ids: decision.operation.source_citations.map((item) => item.source_id) },
      });
      if (!built || built.ok !== true) return built || fail("risk_packet_unavailable");
      const body = { migration_version: MIGRATION_VERSION, dry_run_id: dry.dry_run_id, decision_id: decision.decision_id, risk_packet_id: built.value.packet_id, risk_packet_hash: built.value.packet_hash };
      const packetHash = sha(stable(body));
      const packet = freeze({ ...body, packet_id: `migration_packet_${packetHash.slice(0, 24)}`, packet_hash: packetHash, operation: decision.operation, risk_packet: built.value });
      PACKETS.add(packet);
      return freeze({ ok: true, status: "packet_ready", value: packet, writer_calls: 0, write_counts: zero() });
    }

    function authorizeMigrationPacket(packet, action) {
      if (!packet || !PACKETS.has(packet)) return fail("branded_migration_packet_required");
      if (!plain(action) || action.action !== "approve_migration" || action.packet_hash !== packet.packet_hash || Object.keys(action).some((key) => !["action", "packet_hash"].includes(key))) return fail("migration_authorization_required");
      const body = { authorization_version: "llmwiki_migration_authorization_v1", packet_id: packet.packet_id, packet_hash: packet.packet_hash, approved_at: now() };
      const authorization = freeze({ ...body, authorization_hash: sha(stable(body)) });
      AUTHORIZATIONS.add(authorization);
      return freeze({ ok: true, status: "authorized", value: authorization, writer_calls: 0, write_counts: zero() });
    }

    async function commitMigrationPacket(input = {}) {
      const packet = input.packet;
      const authorization = input.authorization;
      if (!packet || !PACKETS.has(packet)) return fail("branded_migration_packet_required");
      if (!authorization || !AUTHORIZATIONS.has(authorization) || authorization.packet_id !== packet.packet_id || authorization.packet_hash !== packet.packet_hash) return fail("migration_authorization_required");
      if (CONSUMED.has(authorization)) return freeze({ ok: true, status: "duplicate", writer_calls: 0, write_counts: zero() });
      const verified = riskApi.verifyRiskApprovalPacket(packet.risk_packet);
      if (!verified.ok) return fail(verified.reason || "risk_packet_invalid");
      const operation = packet.operation;
      if (operation.kind === "noop") {
        let auditResult = { ok: true };
        if (audit) {
          try { auditResult = await audit({ packet, authorization, outcome: "no_change" }); }
          catch (_error) { return fail("migration_audit_failed"); }
          if (!auditResult || auditResult.ok !== true) return fail("migration_audit_failed");
        }
        CONSUMED.add(authorization);
        return freeze({ ok: true, status: "no_change", writer_calls: 0, write_counts: { ...zero(), audit: audit ? 1 : 0 }, receipt: { packet_id: packet.packet_id, exact_after_bytes: operation.after_bytes } });
      }
      if (!transaction || typeof transaction.beginExactSet !== "function" || typeof transaction.preflight !== "function" || typeof transaction.commit !== "function") return fail("migration_transaction_adapter_required");
      const allowed = pathsFor(operation);
      const boundary = await transaction.beginExactSet({ batch_identity: packet.packet_id, allowed_write_set: allowed, packet_write_sets: { [packet.risk_packet.packet_id]: allowed } });
      if (!boundary?.ok) return fail(boundary?.reason || "migration_write_set_rejected");
      const preflight = await transaction.preflight(packet.risk_packet);
      if (!preflight?.ok) { transaction.resetBoundary?.(); return fail(preflight?.reason || "migration_preflight_failed"); }
      const committed = await transaction.commit(packet.risk_packet);
      transaction.resetBoundary?.();
      if (!committed?.ok) return freeze({ ...committed, writer_calls: 0 });
      CONSUMED.add(authorization);
      let refreshReceipt = { status: "pending", reason: "refresh_unavailable" };
      if (refresh) {
        try { const value = await refresh({ packet, receipt: committed.receipt }); refreshReceipt = value?.ok === true ? { status: "succeeded", reason: null } : { status: "failed", reason: value?.reason || "refresh_failed" }; }
        catch (_error) { refreshReceipt = { status: "failed", reason: "refresh_failed" }; }
      }
      let gitReceipt = { status: "pending", reason: "GitUnavailable" };
      if (git) {
        try { const value = await git({ packet, receipt: committed.receipt, paths: allowed }); gitReceipt = value?.ok === true ? { status: "succeeded", reason: null } : { status: "failed", reason: value?.reason || "git_backup_pending" }; }
        catch (_error) { gitReceipt = { status: "failed", reason: "git_backup_pending" }; }
      }
      return freeze({ ok: true, status: "committed", writer_calls: committed.write_counts?.canonical || allowed.length, write_counts: committed.write_counts, receipt: committed.receipt, exact_after_bytes: operation.after_bytes, follow_up: { refresh: refreshReceipt, git: gitReceipt } });
    }

    return freeze({ normalizeSources, dryRun, createMigrationPacket, authorizeMigrationPacket, commitMigrationPacket });
  }

  function createRolloutState() { return freeze({ version: ROLLOUT_VERSION, enabled_phases: [], gate_receipts: {} }); }
  function enableRolloutPhase(state, phase, gate) {
    if (!plain(state) || state.version !== ROLLOUT_VERSION || !Array.isArray(state.enabled_phases) || !plain(state.gate_receipts)) return fail("invalid_rollout_state");
    const index = ROLLOUT_PHASES.indexOf(phase);
    if (index < 0) return fail("unknown_rollout_phase");
    if (!plain(gate) || gate.available !== true || gate.status !== "green" || typeof gate.receipt_id !== "string" || !gate.receipt_id.trim()) return fail("rollout_gate_red");
    const expectedPrior = ROLLOUT_PHASES.slice(0, index);
    if (expectedPrior.some((item) => !state.enabled_phases.includes(item) || state.gate_receipts[item]?.status !== "green")) return fail("prior_rollout_gate_unavailable");
    if (state.enabled_phases.some((item) => !ROLLOUT_PHASES.includes(item))) return fail("invalid_rollout_state");
    const enabled = [...new Set([...state.enabled_phases, phase])].sort((left, right) => ROLLOUT_PHASES.indexOf(left) - ROLLOUT_PHASES.indexOf(right));
    if (enabled.some((item, position) => item !== ROLLOUT_PHASES[position])) return fail("rollout_order_violation");
    return freeze({ ok: true, status: "enabled", value: { version: ROLLOUT_VERSION, enabled_phases: enabled, gate_receipts: { ...state.gate_receipts, [phase]: { available: true, status: "green", receipt_id: gate.receipt_id } } }, writer_calls: 0, write_counts: zero() });
  }
  function restoreRolloutState(serialized) {
    let parsed;
    try { parsed = JSON.parse(serialized); } catch (_error) { return createRolloutState(); }
    if (!plain(parsed) || parsed.version !== ROLLOUT_VERSION || !Array.isArray(parsed.enabled_phases) || !plain(parsed.gate_receipts)) return createRolloutState();
    let state = createRolloutState();
    for (const phase of parsed.enabled_phases) {
      const enabled = enableRolloutPhase(state, phase, parsed.gate_receipts[phase]);
      if (!enabled.ok) return createRolloutState();
      state = enabled.value;
    }
    return state;
  }

  async function handoffLegacyCandidate(input = {}) {
    if (!plain(input.candidate) || !input.sourceAdapter || typeof input.sourceAdapter.extract !== "function" || typeof input.analyze !== "function") return fail("legacy_handoff_dependencies_required");
    const candidate = input.candidate;
    const serialized = JSON.stringify({ source_kind: "knowledge_candidate", source_path: candidate.path, record: { ...candidate, type: "knowledge_candidate" } });
    const adapted = await input.sourceAdapter.extract(serialized);
    if (!adapted?.ok) return freeze({ ...adapted, writer_calls: 0 });
    let analyzed;
    try { analyzed = await input.analyze(adapted.value); }
    catch (_error) { return fail("legacy_handoff_analysis_failed"); }
    return freeze({ ...(analyzed || fail("legacy_handoff_analysis_failed")), handoff: "llmwiki", source_snapshot_id: adapted.value.snapshot_id, writer_calls: 0, user_authored_schema_fields: 0 });
  }

  const api = freeze({ MIGRATION_VERSION, ROLLOUT_VERSION, ROLLOUT_PHASES, createMigrationService, createRolloutState, enableRolloutPhase, restoreRolloutState, handoffLegacyCandidate });
  root.LLMWikiMigrationRollout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
