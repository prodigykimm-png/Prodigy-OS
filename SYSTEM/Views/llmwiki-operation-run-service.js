(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const boundaryPolicy = root.LLMWikiWriteBoundaryPolicy
    || (typeof require === "function" ? require("./llmwiki-write-boundary-policy.js") : null);
  const KINDS = Object.freeze(["create", "update", "merge", "noop"]);
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function samePaths(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.slice().sort().every((value, index) => value === right.slice().sort()[index]);
  }
  function validateServices(services) {
    if (!plain(services) || Object.keys(services).sort().join("\0") !== KINDS.slice().sort().join("\0")) return false;
    return KINDS.every((kind) => services[kind] && services[kind].kind === kind
      && ["prepare", "authorize", "commit"].every((name) => typeof services[kind][name] === "function"));
  }
  function trustedCanonicalPaths(audit, canonicalPaths, runId) {
    if (!hashApi || typeof hashApi.sha256 !== "function" || !plain(audit)
      || audit.audit_version !== "llmwiki_immutable_compensation_audit_v1"
      || audit.audit_type !== "canonical_committed" || audit.run_id !== runId
      || audit.write_outcome !== "committed" || audit.user_action?.type !== "approved_commit"
      || !HASH.test(audit.audit_hash)) return null;
    const unsigned = clone(audit);
    delete unsigned.audit_hash;
    if (hashApi.sha256(stable(unsigned)) !== audit.audit_hash) return null;
    const revisions = audit.canonical_post_commit_revisions;
    if (!plain(revisions)) return null;
    const canonical = Object.keys(revisions).sort();
    if (!canonical.length || canonical.some((path) => boundaryPolicy?.parseCanonicalWritePath?.(path).ok !== true || !HASH.test(revisions[path]))) return null;
    if (canonicalPaths !== undefined && !samePaths(canonical, canonicalPaths)) return null;
    return canonical.concat([
      `.llmwiki-audit/immutable/${audit.audit_hash}.json`,
      ".llmwiki-audit/immutable/head.json",
    ]);
  }
  function createPostEligibilityGitReceiptAuthority() {
    const minted = new WeakSet();
    function mint(input) {
      if (!plain(input) || !plain(input.canonical_outcome) || input.canonical_outcome.status !== "committed"
        || !ID.test(input.run_id) || !Number.isInteger(input.run_revision) || input.run_revision < 1
        || !ID.test(input.operation_id) || input.canonical_outcome.operation_id !== input.operation_id) return null;
      const paths = trustedCanonicalPaths(input.immutable_audit, input.canonical_paths, input.run_id);
      if (!paths) return null;
      const expectedHashes = Object.fromEntries(Object.entries(input.immutable_audit.canonical_post_commit_revisions));
      const receipt = freeze({
        identity: [input.run_id, input.run_revision, input.operation_id, input.immutable_audit.audit_hash].join(":"),
        operation_id: input.operation_id,
        run_id: input.run_id,
        run_revision: input.run_revision,
        paths,
        expected_hashes: expectedHashes,
        immutable_audit_hash: input.immutable_audit.audit_hash,
      });
      minted.add(receipt);
      return receipt;
    }
    function verify(receipt) { return minted.has(receipt); }
    return freeze({ mint, verify });
  }
  function createOperationRunService(options = {}) {
    const stateApi = options.stateApi;
    const operationApi = options.operationApi;
    const services = options.services;
    const approvalCallbacks = options.approvalCallbacks;
    const commandBindings = options.commandBindings;
    const followUpGuard = options.followUpGuard;
    const persistence = options.outcomePersistence;
    const runCommandsApi = options.runCommandsApi;
    const followUpRunnerApi = options.followUpRunnerApi;
    const runApprovalApi = options.runApprovalApi;
    if (!stateApi || typeof stateApi.createOperationRunState !== "function") throw new TypeError("operation_run_state_required");
    if (!operationApi || typeof operationApi.parseOperation !== "function") throw new TypeError("operation_contract_required");
    if (!approvalCallbacks || typeof approvalCallbacks.bind !== "function") throw new TypeError("approval_callback_contract_required");
    if (!commandBindings || !followUpGuard || !persistence || !runCommandsApi || !followUpRunnerApi || !runApprovalApi) throw new TypeError("operation_guard_contracts_required");
    if (!validateServices(services)) throw new TypeError("exhaustive_operation_services_required");
    const state = stateApi.createOperationRunState();
    const counters = { provider: 0, prepare: 0, approval: 0, approval_callback_audit: 0, command_audit: 0, follow_up_entry_audit: 0, commit: 0, canonical: 0, audit: 0, refresh: 0, git: 0, ui: 0, ignored_results: 0 };
    let revision = 0;
    let token = null;
    let prepared = null;
    let context = null;
    let operation = null;
    let operationService = null;
    let durableOutcome = null;
    let activeFollowUpName = null;
    let postEligibilityGitCandidate = null;

    function snapshot() { return freeze({ status: state.getState().state, ...clone(state.getState()), counters: clone(counters), approval_callback_audits: approvalCallbacks.getAudits(), command_audits: commandBindings.getAudits(), follow_up_entry_audits: followUpGuard.getAudits(), durable_outcome: clone(durableOutcome) }); }
    function output(ok, extras = {}) { return freeze({ ok, status: state.getState().state, run_id: state.getState().run_id, run_revision: state.getState().run_revision, ...extras, counters: clone(counters) }); }
    function publish() {
      if (typeof options.onState === "function") { counters.ui += 1; options.onState(snapshot()); }
    }
    function begin(runId) {
      revision = Math.max(revision + 1, state.getState().run_revision + 1);
      const abortController = typeof AbortController === "function" ? new AbortController() : null;
      token = { run_id: runId, run_revision: revision, abort_controller: abortController, invalid_reason: null };
      return token;
    }
    function current(runToken) { return token === runToken && runToken.run_revision === state.getState().run_revision && !runToken.invalid_reason; }
    function invalidate(reason) {
      const active = token;
      if (!active) return;
      active.invalid_reason = reason;
      if (active.abort_controller && !active.abort_controller.signal.aborted) active.abort_controller.abort();
      token = null;
    }
    function ignored(runToken) {
      counters.ignored_results += 1;
      if (typeof options.auditLateResult === "function") options.auditLateResult(freeze({ run_id: runToken.run_id, run_revision: runToken.run_revision, reason: runToken.invalid_reason || "stale_run", effect: "ignored" }));
      return output(false, { reason: runToken.invalid_reason || "stale_run", late_result_ignored: true });
    }
    function dispatch(type, extras = {}) {
      const currentState = state.getState();
      return state.dispatch({ type, run_id: currentState.run_id, run_revision: currentState.run_revision, ...extras });
    }
    function fail(reason, type = "provider_failed") {
      dispatch(type, { reason });
      publish();
      return output(false, { reason });
    }
    function packetIdentity() {
      return prepared && prepared.packet && (prepared.packet.packet_hash || prepared.packet.operation_id || prepared.packet.operation?.operation_id)
        || operation && operation.operation_id || null;
    }
    function currentApprovalIdentity() {
      const value = state.getState();
      return { run_id: value.run_id, run_revision: value.run_revision, operation_id: value.operation_id, packet_identity: packetIdentity() };
    }
    function auditApproval(callback, reason) {
      const before = approvalCallbacks.getAudits().length;
      const record = approvalCallbacks.audit(callback, reason, currentApprovalIdentity());
      if (approvalCallbacks.getAudits().length > before) counters.approval_callback_audit += 1;
      return output(false, { reason, approval_callback_ignored: true, audit: record });
    }
    function followUpIdentity(name) {
      const row = state.getState().follow_up && state.getState().follow_up[name];
      return row ? [state.getState().run_id, state.getState().run_revision, name, row.status, row.attempts].join(":") : null;
    }
    function parseProviderResult(value) {
      if (operationApi.isOperationRecord(value)) return { ok: true, value };
      const serialized = typeof value === "string" ? value : plain(value) ? value.serialized_operation : null;
      return operationApi.parseOperation(serialized);
    }
    async function saveOutcome(runToken, outcome) {
      const saved = await persistence.persist(outcome);
      if (!current(runToken)) return false;
      durableOutcome = saved;
      return true;
    }
    function followUpSeed() {
      const pending = Boolean(options.followUps?.refresh || options.followUps?.git);
      return freeze({ status: pending ? "pending" : "complete", refresh: { status: options.followUps?.refresh ? "pending" : "skipped", attempts: 0, reason: null }, git: { status: options.followUps?.git ? "pending" : "skipped", attempts: 0, reason: null } });
    }
    function pendingFollowUp() {
      const value = state.getState().follow_up;
      return state.getState().state === "committed" && value && (activeFollowUpName !== null || [value.refresh, value.git].some((row) => row && ["pending", "running"].includes(row.status)));
    }
    function cancelledFollowUp() {
      const value = clone(state.getState().follow_up);
      for (const name of ["refresh", "git"]) if (name === activeFollowUpName || ["pending", "running"].includes(value[name].status)) value[name] = { ...value[name], status: "cancelled", reason: "cancelled" };
      return freeze({ ...value, status: "cancelled" });
    }
    function summarizeFollowUp(value) {
      const rows = [value.refresh, value.git];
      return freeze({ ...value, status: rows.some((row) => row.status === "failed") ? "failed" : rows.some((row) => row.status === "pending") ? "pending" : "complete" });
    }
    async function runPendingGitRetry(runToken) {
      if (!current(runToken)) return ignored(runToken);
      const followUp = clone(state.getState().follow_up);
      followUp.git = { status: "pending", attempts: followUp.git.attempts + 1, reason: null };
      const summarized = summarizeFollowUp(followUp);
      dispatch("follow_up_changed", { follow_up: summarized });
      counters.git += 1;
      if (!await saveOutcome(runToken, { ...clone(durableOutcome), follow_up: clone(summarized) })) return ignored(runToken);
      publish();
      return output(true, { canonical_outcome: clone(state.getState().canonical_outcome), follow_up: clone(state.getState().follow_up) });
    }
    const followUpRunner = followUpRunnerApi.create({
      followUps: {
        ...options.followUps,
        git: async (input) => {
          if (postEligibilityGitCandidate && typeof options.postEligibilityGit === "function") {
            return options.postEligibilityGit(freeze({
              ...postEligibilityGitCandidate,
              signal: input.signal,
              guarded_entry: input.guarded_entry,
            }));
          }
          if (typeof options.followUps?.git === "function") return options.followUps.git(input);
          return { ok: false, status: "git_pending", reason: "post_eligibility_required" };
        },
      },
      guard: followUpGuard,
      getFollowUp: () => state.getState().follow_up,
      seed: followUpSeed,
      isCurrent: current,
      ignored,
      setActive(value) { activeFollowUpName = value; },
      dispatch(value) { dispatch("follow_up_changed", { follow_up: summarizeFollowUp(value) }); },
      operationId: () => state.getState().operation_id,
      currentIdentity: currentApprovalIdentity,
      getOutcome: () => clone(durableOutcome),
      getFollowUpExtras() { return {}; },
      addGuardAudits(value) { counters.follow_up_entry_audit += value; },
      increment(name) { counters[name] += 1; },
      summarize: summarizeFollowUp,
      async save(runToken, followUp) {
        durableOutcome = freeze({ ...clone(durableOutcome), follow_up: clone(followUp) });
        return saveOutcome(runToken, durableOutcome);
      },
      publish,
      output,
      canonicalOutcome: () => clone(state.getState().canonical_outcome),
    });
    function runFollowUps(runToken, selected = ["refresh", "git"]) {
      const git = state.getState().follow_up && state.getState().follow_up.git;
      if (selected.length === 1 && selected[0] === "git" && !postEligibilityGitCandidate && git && git.status === "pending") {
        return runPendingGitRetry(runToken);
      }
      return followUpRunner.run(runToken, selected);
    }
    async function recordPostEligibilityGit(input = {}) {
      const currentState = state.getState();
      if (currentState.state !== "committed") return output(false, { reason: "post_eligibility_git_unavailable" });
      if (typeof options.postEligibilityGit !== "function") return output(false, { reason: "post_eligibility_git_unavailable" });
      const candidate = freeze({
        run_id: currentState.run_id,
        run_revision: currentState.run_revision,
        operation_id: currentState.operation_id,
        canonical_outcome: currentState.canonical_outcome,
        immutable_audit: input.immutable_audit,
        canonical_paths: input.canonical_paths,
      });
      postEligibilityGitCandidate = candidate;
      const followUp = clone(state.getState().follow_up);
      if (!followUp || followUp.git.status === "succeeded" || typeof options.followUps?.git !== "function") {
        return output(false, { reason: "post_eligibility_git_unavailable" });
      }
      followUp.git = { status: "running", attempts: followUp.git.attempts + 1, reason: null };
      dispatch("follow_up_changed", { follow_up: summarizeFollowUp(followUp) });
      let result;
      try {
        result = await options.postEligibilityGit(freeze({ ...candidate, signal: token && token.abort_controller && token.abort_controller.signal }));
      } catch (error) { result = { ok: false, reason: error && error.message || "git_failed" }; }
      counters.git += 1;
      followUp.git = result && result.ok === true
        ? { status: "succeeded", attempts: followUp.git.attempts, reason: null }
        : { status: "failed", attempts: followUp.git.attempts, reason: result && result.reason || "git_failed" };
      const summarized = summarizeFollowUp(followUp);
      dispatch("follow_up_changed", { follow_up: summarized });
      durableOutcome = await persistence.persist({ ...clone(durableOutcome), follow_up: clone(summarized) });
      publish();
      return output(true, { canonical_outcome: clone(state.getState().canonical_outcome), follow_up: clone(state.getState().follow_up) });
    }

    async function start(input = {}) {
      const runId = input.run_id;
      if (!ID.test(runId || "")) return output(false, { reason: "invalid_run_id" });
      const active = stateApi.ACTIVE_STATES.includes(state.getState().state) || pendingFollowUp();
      if (active && input.active_run_policy !== "replace") return output(false, { reason: "run_in_progress" });
      if (active) {
        const old = token;
        const followUp = pendingFollowUp() ? cancelledFollowUp() : null;
        const replacementAction = followUp
          ? { type: "cancel_follow_up", run_id: old.run_id, run_revision: old.run_revision, follow_up: followUp }
          : { type: "cancel", run_id: old.run_id, run_revision: old.run_revision };
        const replacementCheck = stateApi.transitionOperationRunState(state.getState(), replacementAction);
        if (!replacementCheck.ok) return output(false, { reason: replacementCheck.reason });
        invalidate("run_replaced");
        state.dispatch(replacementAction);
        if (followUp && durableOutcome) {
          durableOutcome = await persistence.persist({ ...clone(durableOutcome), follow_up: followUp });
        }
        publish();
      }
      const runToken = begin(runId);
      const admitted = state.dispatch({ type: "start", run_id: runId, run_revision: runToken.run_revision });
      if (!admitted.ok) return output(false, { reason: admitted.reason });
      prepared = null; context = input.context || {}; operation = null; operationService = null; durableOutcome = null; postEligibilityGitCandidate = null;
      publish();
      let providerResult;
      try {
        if (typeof options.provider !== "function") return fail("operation_provider_required");
        counters.provider += 1;
        providerResult = await options.provider(input, freeze({ signal: runToken.abort_controller && runToken.abort_controller.signal, run_id: runId, run_revision: runToken.run_revision }));
      } catch (error) {
        if (!current(runToken)) return ignored(runToken);
        return fail(error && error.name === "AbortError" ? "provider_aborted" : "provider_failed");
      }
      if (!current(runToken)) return ignored(runToken);
      const parsed = parseProviderResult(providerResult);
      if (!parsed || parsed.ok !== true) return fail(parsed && parsed.reason || "invalid_operation");
      operation = parsed.value;
      operationService = services[operation.kind];
      counters.prepare += 1;
      const preparedResult = await operationService.prepare({ operation, context, provider_result: providerResult, signal: runToken.abort_controller && runToken.abort_controller.signal });
      if (!current(runToken)) return ignored(runToken);
      if (!preparedResult || preparedResult.ok !== true) return fail(preparedResult && preparedResult.reason || "operation_prepare_failed");
      const transitioned = dispatch("provider_ready", { operation_kind: operation.kind, operation_id: operation.operation_id });
      if (!transitioned.ok) return fail(transitioned.reason);
      if (operation.kind === "noop") {
        const outcome = freeze({ outcome_version: "llmwiki_operation_run_outcome_v1", run_id: runId, run_revision: runToken.run_revision, operation_kind: "noop", operation_id: operation.operation_id, status: "no_change", canonical_outcome: null, follow_up: { status: "complete", refresh: { status: "skipped", attempts: 0, reason: null }, git: { status: "skipped", attempts: 0, reason: null } }, audit: clone(preparedResult.audit), write_counts: { canonical: 0, audit: 0, refresh: 0, git: 0 } });
        if (!await saveOutcome(runToken, outcome)) return ignored(runToken);
        publish();
        return output(true, { audit: clone(outcome.audit), write_counts: clone(outcome.write_counts) });
      }
      prepared = preparedResult.value;
      publish();
      return output(true, { operation_kind: operation.kind, operation_id: operation.operation_id });
    }


    function admitPreparedRisk(input) {
      const runToken = begin(input.run_id);
      const admitted = state.dispatch({ type: "start", run_id: input.run_id, run_revision: runToken.run_revision });
      if (!admitted.ok) return output(false, { reason: admitted.reason });
      operation = input.operation;
      operationService = services[operation.kind];
      context = input.context || {};
      prepared = freeze({ operation, risk_review: true });
      durableOutcome = null;
      postEligibilityGitCandidate = null;
      counters.prepare += 1;
      const transitioned = dispatch("provider_ready", { operation_kind: operation.kind, operation_id: operation.operation_id });
      if (!transitioned.ok) return fail(transitioned.reason);
      publish();
      return output(true, { operation_kind: operation.kind, operation_id: operation.operation_id });
    }
    function startPreparedRisk(input = {}) {
      if (!ID.test(input.run_id || "")) return output(false, { reason: "invalid_run_id" });
      if (!operationApi.isOperationRecord(input.operation)) return output(false, { reason: "branded_operation_required" });
      if (stateApi.ACTIVE_STATES.includes(state.getState().state) || pendingFollowUp()) return output(false, { reason: "run_in_progress" });
      return admitPreparedRisk(input);
    }
    async function resumeRepacket(input = {}) {
      const currentState = state.getState();
      if (!operationApi.isOperationRecord(input.operation)) return output(false, { reason: "branded_operation_required" });
      if (currentState.state !== "cancelled" || input.run_id !== currentState.run_id || input.prior_revision !== currentState.run_revision) return output(false, { reason: "repacket_run_identity_mismatch" });
      return admitPreparedRisk(input);
    }

    async function approvePreparedRisk(input = {}) {
      const value = state.getState();
      const runToken = token;
      if (!runToken || value.state !== "review") return output(false, { reason: "risk_approval_not_available", approval_action_ignored: true });
      if (input.run_id !== value.run_id || input.run_revision !== value.run_revision || input.operation_id !== value.operation_id) return output(false, { reason: "stale_risk_action", approval_action_ignored: true });
      if (typeof input.commit !== "function" || !input.authorization) return output(false, { reason: "risk_commit_authorization_required" });
      const approved = dispatch("approve");
      if (!approved.ok) return output(false, { reason: approved.reason });
      counters.approval += 1;
      dispatch("authorization_ready");
      publish();
      counters.commit += 1;
      let committed;
      try { committed = await input.commit({ operation, authorization: input.authorization, signal: runToken.abort_controller && runToken.abort_controller.signal, is_current: () => current(runToken) }); }
      catch (error) { committed = { ok: false, status: "failed", reason: error && error.message || "commit_failed" }; }
      if (!current(runToken)) return ignored(runToken);
      counters.canonical += Number(committed && committed.write_counts && committed.write_counts.canonical || 0);
      counters.audit += Number(committed && committed.write_counts && committed.write_counts.audit || 0);
      if (!committed || committed.ok !== true || !["committed", "duplicate"].includes(committed.status)) return fail(committed && committed.reason || "commit_failed", "commit_failed");
      const canonicalOutcome = freeze({ status: "committed", operation_kind: operation.kind, operation_id: operation.operation_id, receipt: clone(committed.receipt || null), write_counts: clone(committed.write_counts || {}) });
      const followUp = followUpSeed();
      dispatch("commit_succeeded", { canonical_outcome: canonicalOutcome, follow_up: followUp });
      const outcome = freeze({ outcome_version: "llmwiki_operation_run_outcome_v1", run_id: runToken.run_id, run_revision: runToken.run_revision, operation_kind: operation.kind, operation_id: operation.operation_id, status: "committed", canonical_outcome: canonicalOutcome, follow_up: followUp });
      if (!await saveOutcome(runToken, outcome)) return ignored(runToken);
      publish();
      const followed = await runFollowUps(runToken, ["refresh"]);
      return followed.ok ? output(true, { canonical_outcome: clone(state.getState().canonical_outcome), follow_up: clone(state.getState().follow_up), committed }) : followed;
    }

    async function recover(input = {}) {
      if (stateApi.ACTIVE_STATES.includes(state.getState().state)) return output(false, { reason: "run_in_progress" });
      const loaded = input.outcome || (ID.test(input.run_id || "") ? await persistence.load(input.run_id) : null);
      if (!loaded || loaded.outcome_version !== "llmwiki_operation_run_outcome_v1" || !["committed", "no_change"].includes(loaded.status)) return output(false, { reason: "invalid_recovery_outcome" });
      revision = Math.max(revision, loaded.run_revision - 1); const runToken = begin(loaded.run_id);
      const normalized = { ...clone(loaded), run_revision: runToken.run_revision };
      const recovered = state.dispatch({ type: "recover", outcome: normalized });
      if (!recovered.ok) return output(false, { reason: recovered.reason });
      persistence.observe(loaded); durableOutcome = freeze(normalized); publish();
      return output(true, { canonical_outcome: clone(normalized.canonical_outcome), follow_up: clone(normalized.follow_up) });
    }

    const approval = runApprovalApi.create({
      callbacks: approvalCallbacks, output, audit: auditApproval, invalidate,
      getToken: () => token, getState: state.getState, currentIdentity: currentApprovalIdentity,
      counters: () => freeze(clone(counters)), isCurrent: current, getOperation: () => operation,
      packetIdentity, dispatch, publish,
      increment(name) { counters[name] += 1; },
      getService: () => operationService, getPrepared: () => prepared, getContext: () => context,
      fail, ignored,
      addWrites(committed) {
        counters.canonical += Number(committed && committed.write_counts && committed.write_counts.canonical || 0);
        counters.audit += Number(committed && committed.write_counts && committed.write_counts.audit || 0);
      },
      commitFailure(committed) {
        if (committed && ["stale", "stale_reconfirm_required"].includes(committed.status)) { dispatch("stale", { reason: committed.reason }); publish(); return output(false, { reason: committed.reason }); }
        return fail(committed && committed.reason || "commit_failed", "commit_failed");
      },
      followUpSeed, save: saveOutcome, runFollowUps,
    });
    const commands = runCommandsApi.create({
      bindings: commandBindings, output,
      getToken: () => token, getState: state.getState,
      currentIdentity: (name) => ({ ...currentApprovalIdentity(), follow_up: name || null, follow_up_identity: name ? followUpIdentity(name) : null }),
      followUpIdentity, isCurrent: current,
      pendingFollowUp, cancelledFollowUp,
      transition: stateApi.transitionOperationRunState, invalidate, dispatchRaw: state.dispatch,
      clearRun() { prepared = null; context = null; operation = null; operationService = null; },
      async persistCancelled(followUp) { durableOutcome = await persistence.persist({ ...clone(durableOutcome), follow_up: followUp }); },
      publish, runFollowUps,
      incrementAudit() { counters.command_audit += 1; },
    });
    return Object.freeze({ start, startPreparedRisk, resumeRepacket, approvePreparedRisk, recordPostEligibilityGit, bindApproval: approval.bind, approve: approval.approve, bindCancel: commands.bindCancel, cancel: commands.cancel, bindRetryFollowUp: commands.bindRetryFollowUp, retryFollowUp: commands.retryFollowUp, recover, getSnapshot: snapshot });
  }

  const api = Object.freeze({ KINDS, createOperationRunService, createPostEligibilityGitReceiptAuthority });
  root.LLMWikiOperationRunService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
