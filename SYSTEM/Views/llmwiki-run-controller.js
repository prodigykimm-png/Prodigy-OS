(function (root) {
  "use strict";

  // allow: SIZE_OK — the run controller is one security-sensitive lifecycle state machine and consent binding must remain atomic.

  // Task 11 cutover: analysis is delegated into the single canonical batch core
  // via options.analyze_batch. The legacy librarian/autopilot/provider request
  // paths are removed from production; fail closed when no core is supplied.
  const runStateApi = root.LLMWikiRunState || (typeof require === "function" ? require("./llmwiki-run-state.js") : null);
  const packetApi = root.LLMWikiCanonicalPacket || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const compensationApi = root.LLMWikiCompensationService || (typeof require === "function" ? require("./llmwiki-compensation-service.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const reviewApi = root.LLMWikiApprovalReviewCommit || (typeof require === "function" ? require("./llmwiki-approval-review-commit.js") : null);
  const commitApi = root.LLMWikiDeterministicCommit || (typeof require === "function" ? require("./llmwiki-deterministic-commit.js") : null);
  const adapterApi = root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
  const aiClientApi = root.ProdigyAIClient || (typeof require === "function" ? require("./prodigy-ai-client.js") : null);
  const refreshApi = root.LLMWikiDerivedRefresh || (typeof require === "function" ? require("./llmwiki-derived-refresh.js") : null);
  const operationWriterApi = root.LLMWikiOperationWriter || (typeof require === "function" ? require("./llmwiki-operation-writer.js") : null);
  const mergeApi = root.LLMWikiMergeTransaction || (typeof require === "function" ? require("./llmwiki-merge-transaction.js") : null);
  const operationRunStateApi = root.LLMWikiOperationRunState || (typeof require === "function" ? require("./llmwiki-operation-run-state.js") : null);
  const createOperationApi = root.LLMWikiCreateOperationService || (typeof require === "function" ? require("./llmwiki-create-operation-service.js") : null);
  const updateOperationApi = root.LLMWikiUpdateOperationService || (typeof require === "function" ? require("./llmwiki-update-operation-service.js") : null);
  const mergeOperationApi = root.LLMWikiMergeOperationService || (typeof require === "function" ? require("./llmwiki-merge-operation-service.js") : null);
  const noopOperationApi = root.LLMWikiNoopOperationService || (typeof require === "function" ? require("./llmwiki-noop-operation-service.js") : null);
  const approvalCallbackApi = root.LLMWikiOperationApprovalCallback || (typeof require === "function" ? require("./llmwiki-operation-approval-callback.js") : null);
  const commandBindingApi = root.LLMWikiOperationCommandBinding || (typeof require === "function" ? require("./llmwiki-operation-command-binding.js") : null);
  const followUpGuardApi = root.LLMWikiOperationFollowUpGuard || (typeof require === "function" ? require("./llmwiki-operation-follow-up-guard.js") : null);
  const outcomePersistenceApi = root.LLMWikiOperationOutcomePersistence || (typeof require === "function" ? require("./llmwiki-operation-outcome-persistence.js") : null);
  const runCommandsApi = root.LLMWikiOperationRunCommands || (typeof require === "function" ? require("./llmwiki-operation-run-commands.js") : null);
  const followUpRunnerApi = root.LLMWikiOperationFollowUpRunner || (typeof require === "function" ? require("./llmwiki-operation-follow-up-runner.js") : null);
  const runApprovalApi = root.LLMWikiOperationRunApproval || (typeof require === "function" ? require("./llmwiki-operation-run-approval.js") : null);
  const operationRunApi = root.LLMWikiOperationRunService || (typeof require === "function" ? require("./llmwiki-operation-run-service.js") : null);
  const riskPacketApi = root.LLMWikiRiskApprovalPacket;
  const riskTransactionApi = root.LLMWikiRiskVaultTransactionAdapter;
  const riskReviewControllerApi = root.LLMWikiRiskReviewController;

  const CONTROLLER_VERSION = "llmwiki_run_controller_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const COUNTER_KEYS = Object.freeze(["provider", "network", "canonical", "audit", "refresh", "git", "authorization"]);
  const RECOVERY_COUNTER_KEYS = Object.freeze(["audit_repair", "refresh_retry", "stale_repacket"]);
  const TAB_IDS = Object.freeze(["zettelkasten", "para", "llmwiki", "llmwiki-browse"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  // Internal state cloning preserves parser-branded operation records instead of serializing them.
  function clone(value) {
    if (operationApi?.isOperationRecord?.(value) || operationApi?.isCanonicalOperationRecord?.(value) || riskPacketApi?.isRiskApprovalPacket?.(value)) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== "object") return value;
    const result = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, { value: clone(item), enumerable: true, writable: true, configurable: true });
    return result;
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function frozen(value) {
    if (operationApi?.isOperationRecord?.(value) || operationApi?.isCanonicalOperationRecord?.(value) || riskPacketApi?.isRiskApprovalPacket?.(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(frozen));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozen(item)])));
  }
  function zeroCounters(keys) { return Object.fromEntries(keys.map((key) => [key, 0])); }
  function exactAction(intent, action, fields = []) {
    if (!plain(intent) || intent.action !== action) return false;
    const allowed = new Set(["action", ...fields]);
    return Object.keys(intent).every((key) => allowed.has(key));
  }

  function providerSelection(command, app, injectedClient) {
    const legacyMode = trim(command.provider && (command.provider.mode || command.provider.provider_mode));
    if (legacyMode === "omniroute") return { ok: false, reason: "omniroute_requires_advanced_selection" };
    const advanced = plain(command.advanced_settings) ? command.advanced_settings : {};
    if ((advanced.provider_mode && advanced.provider_mode !== "runtime") || advanced.provider_key) {
      return { ok: false, reason: "provider_selection_owned_by_runtime" };
    }
    const client = injectedClient || (aiClientApi && aiClientApi.createClient ? aiClientApi.createClient({ app }) : null);
    if (!client) return { ok: false, reason: "runtime_unavailable" };
    const resolved = client.resolveProvider("wiki.batch_analysis");
    if (!resolved || !["ready", "consent_required"].includes(resolved.status)) return { ok: false, reason: resolved && resolved.error_code || "provider_unavailable" };
    const timeoutMs = Number(advanced.timeout_ms || 5000);
    return { ok: true, value: {
      mode: "runtime", provider_key: resolved.profile_id || "", timeout_ms: timeoutMs,
      retry_owner: "prodigy", client, consent_required: resolved.status === "consent_required",
      request_metadata: { request_id: `request_${command.run_id}` },
    } };
  }

  function explicitSources(command) {
    if (!Array.isArray(command.sources) || command.sources.length === 0) return false;
    return command.sources.every((source) => plain(source) && source.selected === true && plain(source.manifest));
  }

  function canonicalDocument(proposal, defaults, now) {
    const statement = trim(proposal.claims && proposal.claims[0] && proposal.claims[0].text);
    const title = trim(proposal.title);
    return {
      title,
      statement,
      knowledge_domain: trim(defaults.knowledge_domain),
      knowledge_topics: clone(defaults.knowledge_topics || []),
      application_trigger: trim(defaults.application_trigger),
      application_contexts: clone(defaults.application_contexts || []),
      connections: clone(defaults.connections || []),
      invalidation_conditions: clone(defaults.invalidation_conditions || []),
      summary: trim(defaults.summary),
      created: trim(defaults.created || now),
      updated: trim(defaults.updated || now),
      body: typeof defaults.body === "string" ? defaults.body : `# ${title}\n\n${statement}\n`,
    };
  }

  // Task14: legacy librarian validation-context registry retired with the pipeline;
  // retained as a typed no-op until Task 14 removes the call sites.
  const CANONICAL_WRITE_PREFIXES = Object.freeze(["ZETA/PERMANENT/", "ZETA/LITERATURE/", "ZETA/CANDIDATES/"]);
  function boundedTransport(transport, request, signal, context = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const aborted = () => {
        const error = Object.assign(new Error("provider aborted"), { name: "AbortError", code: "ABORT_ERR" });
        finish(reject, error);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", aborted);
        callback(value);
      };
      const timer = setTimeout(() => finish(reject, Object.assign(new Error("provider timeout"), { code: "ETIMEDOUT" })), request.timeout_ms);
      if (signal) {
        if (signal.aborted) return aborted();
        signal.addEventListener("abort", aborted, { once: true });
      }
      const requestOptions = plain(context) ? { signal, ...context } : { signal };
      Promise.resolve().then(() => transport(request, requestOptions)).then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
  }

  function createRunController(options = {}) {
    const state = runStateApi.createRunState();
    const counters = zeroCounters(COUNTER_KEYS);
    const recoveryCounters = zeroCounters(RECOVERY_COUNTER_KEYS);
    const adapterResolution = adapterApi.resolveObsidianAdapter(options.app);
    const compensationAdapter = options.compensation_adapter || (adapterResolution.ok ? adapterResolution.adapter : null);
    const refreshResolution = refreshApi.resolveObsidianDerivedRefreshStore(options.app, { rootPath: options.derived_root || ".llmwiki-derived" });
    const operationServices = options.operation_services || {
      create: createOperationApi.create({ operationApi, reviewApi, commitApi }),
      update: updateOperationApi.create({ operationApi, writerApi: operationWriterApi, commitApi }),
      merge: mergeOperationApi.create({ operationApi, mergeApi, commitApi }),
      noop: noopOperationApi.create({ operationApi }),
    };
    const suppliedFollowUps = options.operation_follow_ups || {};
    const postEligibilityGit = async (input) => typeof options.postEligibilityGit === "function"
      ? options.postEligibilityGit(input) : { ok: false, status: "pending", reason: "GitUnavailable" };
    let current = { status: "idle", review_packets: [], proposals: [], filtered_kinds: [] };
    const operationRuns = operationRunApi.createOperationRunService({
      stateApi: operationRunStateApi,
      operationApi,
      services: operationServices,
      approvalCallbacks: approvalCallbackApi.create({ onAudit: options.audit_operation_approval_callback }),
      commandBindings: commandBindingApi.create({ onAudit: options.audit_operation_command }),
      followUpGuard: followUpGuardApi.create({ onAudit: options.audit_operation_follow_up_entry }),
      provider: options.operation_provider,
      followUps: suppliedFollowUps,
      postEligibilityGitReceiptAuthority: options.postEligibilityGitReceiptAuthority,
      postEligibilityGit,
      outcomePersistence: outcomePersistenceApi.create(options.operation_outcome_store),
      runCommandsApi,
      followUpRunnerApi,
      runApprovalApi,
      onState(state) {
        if (state?.status === "committed") current = { ...current, status: "committed", outcome: clone(state) };
        else if (state?.status === "cancelled") current = { ...current, status: "cancelled", outcome: clone(state) };
        if (typeof options.on_operation_state === "function") options.on_operation_state(state);
      },
      auditLateResult: options.audit_late_operation_result,
    });
    let generation = 0;
    let activeToken = null;
    let runContext = null;
    let recoveryContext = null;
    let approvalPending = false;
    let recoveryPending = false;
    let repacketSequence = 0;
    let compensationContext = null;
    let compensationSequence = 0;

    function snapshot() {
      const operationSnapshot = operationRuns.getSnapshot();
      const effectiveCurrent = current.status === "review" && ["committed", "cancelled"].includes(operationSnapshot.status)
        ? { ...current, status: operationSnapshot.status, outcome: operationSnapshot }
        : current;
      return frozen({
        controller_version: CONTROLLER_VERSION,
        ...clone(effectiveCurrent),
        run_state: state.getState(),
        counters: clone(counters),
        recovery_counters: clone(recoveryCounters),
        operation_run: operationSnapshot,
      });
    }
    function output(ok, status, extras = {}) {
      return frozen({ ok, status, ...extras, counters: clone(counters), recovery_counters: clone(recoveryCounters) });
    }
    function result(ok, status, extras = {}) {
      current = { ...current, status };
      return output(ok, status, extras);
    }
    function reject(reason, extras = {}) { return result(false, extras.status || "failed", { reason, ...extras }); }
    function rejectWithoutMutation(reason, extras = {}) { return output(false, extras.status || current.status || "failed", { reason, ...extras }); }
    function compensationSnapshot() {
      if (!compensationContext) return null;
      return frozen({
        eligible: compensationContext.eligible === true,
        confirmation_required: compensationContext.confirmation_required === true,
        consumed: compensationContext.consumed === true,
        packet_id: compensationContext.original_receipt.packet_id,
        packet_hash: compensationContext.original_receipt.packet_hash,
        immutable_audit_hash: compensationContext.immutable_audit.audit_hash,
        reason: compensationContext.reason || null,
      });
    }
    function committedWriterReceipt(receipt) {
      let writerReceipt = receipt;
      while (plain(writerReceipt) && !plain(writerReceipt.after_states) && plain(writerReceipt.writer_receipt)) writerReceipt = writerReceipt.writer_receipt;
      return writerReceipt;
    }
    function sameExactPaths(left, right) {
      return Array.isArray(left) && Array.isArray(right) && left.length === right.length
        && left.slice().sort().every((value, index) => value === right.slice().sort()[index]);
    }
    function canonicalCommitReceipt(packet, receipt) {
      const writerReceipt = committedWriterReceipt(receipt);
      const packetSnapshot = receipt && receipt.packet_snapshot;
      const before = writerReceipt && writerReceipt.before_states;
      const after = writerReceipt && writerReceipt.after_states;
      const operation = packet && packet.operation;
      const authorizedPaths = operation && [...operation.destination_ids, ...operation.effects.deprecations.map((effect) => effect.destination_id), ...operation.effects.supersessions.map((effect) => effect.destination_id)].sort();
      const paths = plain(after) ? Object.keys(after).sort() : null;
      if (!plain(packet) || !plain(operation) || !plain(packetSnapshot) || !plain(before) || !plain(after)
        || packetSnapshot.packet_id !== packet.packet_id || packetSnapshot.packet_hash !== packet.packet_hash
        || packetSnapshot.run_id !== packet.run_id || packetSnapshot.run_revision !== packet.run_revision
        || packetSnapshot.operation_id !== operation.operation_id || packetSnapshot.operation_kind !== operation.kind
        || receipt.path_boundary_verified !== true || !sameExactPaths(receipt.actual_touched_paths, authorizedPaths)
        || !sameExactPaths(packetSnapshot.write_set, authorizedPaths) || !sameExactPaths(paths, authorizedPaths)) return null;
      if (paths.some((filePath) => {
        const prior = before[filePath];
        const expectedBefore = Object.hasOwn(operation.before_bytes, filePath) ? operation.before_bytes[filePath] : null;
        // Task 11 cutover: lifecycle review destinations (Literature/Candidates)
        // join Permanent as canonical commit surfaces, matching the
        // write-boundary policy and vault transaction adapter.
        if (!CANONICAL_WRITE_PREFIXES.some((prefix) => filePath.startsWith(prefix)) || filePath.includes("..") || !plain(prior)) return true;
        if (expectedBefore === null) {
          if (prior.exists !== false) return true;
        } else if (prior.exists !== true || typeof prior.bytes !== "string" || prior.bytes !== expectedBefore
          || !HASH.test(prior.sha256) || packetApi.sha256(prior.bytes) !== prior.sha256 || operation.base_revisions[filePath] !== prior.sha256) return true;
        return !after[filePath]?.exists || typeof after[filePath].bytes !== "string"
          || !HASH.test(after[filePath].sha256) || packetApi.sha256(after[filePath].bytes) !== after[filePath].sha256
          || Object.hasOwn(operation.after_bytes, filePath) && operation.after_bytes[filePath] !== after[filePath].bytes;
      })) return null;
      const committed_at = String(typeof options.now === "function" ? options.now() : new Date().toISOString());
      if (!Number.isFinite(Date.parse(committed_at))) return null;
      return frozen({
        run_id: packet.run_id,
        packet_id: packet.packet_id,
        packet_hash: packet.packet_hash,
        committed_at,
        policy_snapshot: { operation_kind: operation.kind, risk_tier: operation.risk_tier || "unknown", approval: "individual" },
        source_revisions: clone(operation.base_revisions || {}),
        writes: paths.map((filePath) => frozen({
          path: filePath,
          before_bytes: before[filePath]?.exists ? before[filePath].bytes : null,
          before_sha256: before[filePath]?.exists ? before[filePath].sha256 : null,
          before_revision: before[filePath]?.exists ? before[filePath].sha256 : null,
          after_bytes: after[filePath].bytes,
          after_sha256: after[filePath].sha256,
          post_commit_revision: after[filePath].sha256,
        })),
        write_outcome: "committed",
        refresh_outcome: "pending",
        git_outcome: "pending",
      });
    }
    function compensationReceipt(canonicalReceipt) {
      if (!plain(canonicalReceipt) || canonicalReceipt.writes.some((write) => typeof write.before_bytes !== "string" || !HASH.test(write.before_sha256))) return null;
      return canonicalReceipt;
    }
    async function recordCanonicalCommit(packet, receipt) {
      if (!compensationApi) return frozen({ ok: false, reason: "compensation_service_unavailable" });
      if (!compensationAdapter) return frozen({ ok: false, reason: "compensation_adapter_unavailable" });
      const original_receipt = canonicalCommitReceipt(packet, receipt);
      if (!original_receipt) return frozen({ ok: false, reason: "canonical_commit_receipt_ineligible" });
      const service = compensationApi.create({ adapter: compensationAdapter, now: options.now });
      const recorded = await service.recordCompletedCommit({ original_receipt });
      return recorded.ok
        ? frozen({ ok: true, service, original_receipt, immutable_audit: recorded.audit })
        : frozen({ ok: false, reason: recorded.reason });
    }
    async function recordCompensationEligibility(canonicalRecord) {
      if (!canonicalRecord.ok) return frozen({ eligible: false, reason: canonicalRecord.reason });
      const original_receipt = compensationReceipt(canonicalRecord.original_receipt);
      if (!original_receipt) return frozen({ eligible: false, reason: "compensation_receipt_ineligible" });
      compensationContext = {
        service: canonicalRecord.service,
        original_receipt,
        eligible: true,
        confirmation_required: false,
        consumed: false,
        reason: null,
        immutable_audit: canonicalRecord.immutable_audit,
      };
      current = { ...current, compensation: compensationSnapshot() };
      return compensationSnapshot();
    }
    function compensationAction() {
      compensationSequence += 1;
      const confirmed_at = String(typeof options.now === "function" ? options.now() : new Date().toISOString());
      return frozen({
        type: "compensate",
        action_id: `compensation_${packetApi.sha256(`${compensationContext.original_receipt.packet_hash}:${compensationSequence}:${confirmed_at}`).slice(0, 24)}`,
        confirmed_at,
      });
    }
    function resetCounters() {
      for (const key of COUNTER_KEYS) counters[key] = 0;
      for (const key of RECOVERY_COUNTER_KEYS) recoveryCounters[key] = 0;
    }
    function beginToken(runId) {
      generation += 1;
      const abortController = typeof AbortController === "function" ? new AbortController() : null;
      activeToken = { generation, run_id: runId, abort_controller: abortController, invalid_reason: null };
      return activeToken;
    }
    function isCurrent(token) { return activeToken === token && token.generation === generation; }
    function invalidateToken(reason) {
      const token = activeToken;
      if (!token) return;
      token.invalid_reason = reason;
      if (token.abort_controller && !token.abort_controller.signal.aborted) token.abort_controller.abort();
      activeToken = null;
      generation += 1;
    }
    function lateOutput(token) {
      return output(false, current.status, { reason: token.invalid_reason || "run_superseded", late_result_ignored: true });
    }

    let riskAdapter = options.risk_transaction_adapter || null;
    if (!riskAdapter && riskTransactionApi && options.app?.vault) {
      const riskExecutors = { ...(options.risk_operation_executors || {}) };
      if (!riskExecutors.merge && mergeApi && adapterResolution?.ok) riskExecutors.merge = async ({ packet }) => {
        const operation = packet.operation;
        const assembled = mergeApi.assembleMergePacket({
          operation,
          evidence: { contract_version: "llmwiki_evidence_contract_v1", operation_id: operation.operation_id, approval_eligible: true, stale: false, claim_lineage: operation.source_citations.map((citation) => ({ claim_id: citation.source_id, citation_ids: [citation.source_id] })) },
          provenance: { source_snapshots: operation.source_ids.map((sourceId) => ({ source_id: sourceId, source_revision: operation.base_revisions[sourceId], extractor_revision: operation.base_revisions[sourceId] })) },
          compensation_plan: { strategy: "restore_all_exact_before_state" },
          expires_at: "2099-01-01T00:00:00.000Z",
          nonce: `risk_${packet.packet_id}`,
        });
        if (!assembled.ok) throw new Error(assembled.reason || "merge_packet_assembly_failed");
        const mergePacket = assembled.value;
        const authorized = mergeApi.authorizeMergePacket(mergePacket, { action: "approve_merge", operation_id: operation.operation_id });
        if (!authorized.ok) throw new Error(authorized.reason || "merge_authorization_failed");
        const committed = await mergeApi.commitApprovedMerge({ packet: mergePacket, authorization: authorized.value, adapter: adapterResolution.adapter });
        if (!committed.ok || committed.status !== "committed") throw new Error(committed.reason || "merge_commit_failed");
        return { actual_touched_paths: mergePacket.write_order, expected_after_bytes: Object.fromEntries(mergePacket.writes.map((row) => [row.target_path, row.after_bytes])), deterministic_writer_receipt: committed.receipt };
      };
      try { riskAdapter = riskTransactionApi.createRiskVaultTransactionAdapter({ app: options.app, executors: riskExecutors }); }
      catch (_error) { riskAdapter = null; }
    }

    async function invalidateRiskRun(identity) {
      const operationSnapshot = operationRuns.getSnapshot();
      const sessionPackets = riskCoordinator?.getSnapshot().risk_packets || [];
      const sessionBound = sessionPackets.some((packet) => packet.packet_id === identity.packet_id && packet.operation.operation_id === identity.operation_id);
      if (operationSnapshot.status !== "review" || operationSnapshot.run_id !== identity.run_id || operationSnapshot.run_revision !== identity.run_revision || operationSnapshot.operation_id !== identity.operation_id && !sessionBound) return { ok: false, status: "rejected", reason: "task13_run_identity_mismatch" };
      const bound = operationRuns.bindCancel({ action: "cancel", run_id: identity.run_id, run_revision: identity.run_revision });
      if (!bound?.ok) return bound;
      const cancelled = await operationRuns.cancel(bound.value);
      if (!cancelled?.ok) return cancelled;
      if (current.run_id === identity.run_id) invalidateToken("risk_repacket");
      return { ok: true, status: "cancelled" };
    }
    async function commitRiskRun(input) {
      const operationSnapshot = operationRuns.getSnapshot();
      const packet = input.batch && Array.isArray(input.packets)
        ? input.packets.find((item) => item.operation.operation_id === operationSnapshot.operation_id) || input.packet
        : input.packet;
      const operationResult = await operationRuns.approvePreparedRisk({
        run_id: packet.run_id,
        run_revision: packet.run_revision,
        operation_id: packet.operation.operation_id,
        authorization: input.authorization,
        commit: () => input.batch
          ? root.LLMWikiSafeBatchApproval.commitExactBatch({ packets: input.packets, authorization: input.authorization, adapter: riskAdapter })
          : reviewApi.commitRiskApproved({ packet, authorization: input.authorization, adapter: riskAdapter }),
      });
      if (!operationResult || operationResult.ok !== true) return operationResult;
      const receipt = operationResult.committed && operationResult.committed.receipt || null;
      const canonicalRecord = await recordCanonicalCommit(packet, receipt);
      const compensation = await recordCompensationEligibility(canonicalRecord);
      const git = canonicalRecord.ok
        ? await operationRuns.recordPostEligibilityGit({
          immutable_audit: canonicalRecord.immutable_audit,
          canonical_paths: canonicalRecord.original_receipt.writes.map((write) => write.path),
        })
        : null;
      return { ...operationResult, status: "committed", receipt, compensation, follow_up: git && git.follow_up || operationResult.follow_up };
    }
    const riskCoordinator = riskReviewControllerApi && riskAdapter ? riskReviewControllerApi.create({
      packetApi: riskPacketApi,
      reviewCommitApi: reviewApi,
      batchApi: root.LLMWikiSafeBatchApproval,
      repacketApi: root.LLMWikiApprovalRepacketService,
      operationApi,
      hashApi: root.LLMWikiHash,
      adapter: riskAdapter,
      invalidateRun: invalidateRiskRun,
      commitRun: commitRiskRun,
      activateReplacement(operation, identity) {
        return operationRuns.resumeRepacket({ run_id: identity.run_id, prior_revision: identity.run_revision, operation, context: { risk_review: true, adapter: riskAdapter } });
      },
      transform: options.risk_repacket_transform || (async (input) => {
        if (typeof options.operation_provider !== "function") throw new Error("risk_repacket_transform_required");
        return options.operation_provider({ action: "repacket", operation: input.operation, guidance: input.guidance, run_id: input.original_packet_identity.run_id }, { run_id: input.original_packet_identity.run_id, run_revision: input.original_packet_identity.run_revision + 1 });
      }),
      onStateChange(riskState) {
        const operationStatus = operationRuns.getSnapshot().status;
        current = {
          ...current,
          ...riskState,
          status: ["committed", "cancelled"].includes(operationStatus) ? operationStatus : riskState.status,
          compensation: compensationSnapshot(),
          approval_packet: riskState.approval_packet || null,
          review_packets: [],
          risk_packets: riskState.risk_packets || [],
        };
      },
    }) : null;

    function openRiskReview(input) {
      if (!riskCoordinator) return rejectWithoutMutation("risk_review_runtime_unavailable");
      if (!plain(input) || !Array.isArray(input.packets) || input.packets.length === 0) return rejectWithoutMutation("risk_packets_required");
      const operationSnapshot = operationRuns.getSnapshot();
      const packet = input.packets[0];
      if (operationSnapshot.status !== "review" || operationSnapshot.run_id !== packet.run_id || operationSnapshot.run_revision !== packet.run_revision || operationSnapshot.operation_id !== packet.operation.operation_id) return rejectWithoutMutation("task13_run_identity_mismatch");
      return riskCoordinator.open(input);
    }
    function openPreparedRiskReview(input) {
      if (!riskCoordinator || !riskPacketApi) return rejectWithoutMutation("risk_review_runtime_unavailable");
      if (!plain(input) || !ID.test(trim(input.run_id)) || !Array.isArray(input.proposals) || input.proposals.length === 0) return rejectWithoutMutation("typed_risk_proposals_required");
      const proposals = input.proposals;
      if (proposals.some((proposal) => !plain(proposal) || !operationApi.isOperationRecord(proposal.operation))) return rejectWithoutMutation("branded_operation_required");
      const started = operationRuns.startPreparedRisk({ run_id: trim(input.run_id), operation: proposals[0].operation, context: { risk_review: true, adapter: riskAdapter } });
      if (!started.ok) return started;
      const packets = [];
      for (const proposal of proposals) {
        const built = riskPacketApi.buildRiskApprovalPacket({
          run_id: started.run_id,
          run_revision: started.run_revision,
          packet_revision: 1,
          operation: proposal.operation,
          summary: trim(proposal.title) || trim(proposal.summary) || `${proposal.operation.kind} knowledge proposal`,
          provenance: { source: "librarian_pipeline", source_ids: proposal.operation.source_citations.map((citation) => citation.source_id) },
        });
        if (!built.ok) return built;
        packets.push(built.value);
      }
      return openRiskReview({ run_id: started.run_id, run_revision: started.run_revision, packets });
    }
    async function applyPreparedBatchApproval(input) {
      if (!plain(input) || input.user_action !== "explicit_user_approval" || !Array.isArray(input.selected_operation_ids) || input.selected_operation_ids.length === 0) return rejectWithoutMutation("explicit_batch_selection_required");
      if (typeof options.batch_approval_apply !== "function") return rejectWithoutMutation("batch_approval_runtime_unavailable");
      const applied = await options.batch_approval_apply(clone(input));
      if (!applied?.ok) return rejectWithoutMutation(applied?.reason || "batch_approval_failed", { status: applied?.status || "review" });
      counters.canonical += Number(applied.write_counts?.canonical || 0);
      counters.audit += Number(applied.write_counts?.audit || 0);
      current = { ...current, status: applied.status || "committed", outcome: clone(applied) };
      return output(true, current.status, clone(applied));
    }

    async function dispatchRiskAction(intent) {
      if (!riskCoordinator) return rejectWithoutMutation("risk_review_runtime_unavailable");
      const response = await riskCoordinator.dispatch(intent);
      if (response?.ok && ["approve_risk", "approve_risk_batch"].includes(intent.action)) current = { ...current, status: "committed", outcome: clone(response) };
      else if (response?.ok && intent.action === "reject_risk") current = { ...current, status: "cancelled", outcome: clone(response) };
      return response;
    }

    async function assemblePackets(command, proposals, consentArtifact, adapter, now, allowCreateCollision = false) {
      const packets = [];
      for (const [index, proposal] of proposals.entries()) {
        const canonicalOperation = operationApi.parseCanonicalOperation(JSON.stringify({
          operation_id: `operation_${proposal.proposal_id.slice("proposal_".length)}`,
          proposal_id: proposal.proposal_id,
          proposal_kind: proposal.kind,
          payload_hash: proposal.payload_hash,
        }));
        if (!canonicalOperation || canonicalOperation.ok !== true) return canonicalOperation || { ok: false, reason: "invalid_canonical_operation" };
        const assembled = await packetApi.assembleCanonicalPacket({
          run_id: command.run_id,
          operation: canonicalOperation.value,
          canonical_document: canonicalDocument(proposal, command.canonical_defaults || {}, now),
          source_citations: clone(proposal.source_citations),
          consent_hash: consentArtifact.consent_hash,
          expires_at: trim(command.approval && command.approval.expires_at),
          nonce: `${trim(command.approval && command.approval.nonce)}${index === 0 ? "" : `_${index + 1}`}`,
        }, adapter);
        if (!assembled.ok || (assembled.status === "stale_reconfirm_required" && !allowCreateCollision)) return assembled;
        packets.push(assembled.value);
      }
      return { ok: true, value: packets };
    }

    function refreshInput(packet, proposal) {
      const sourceRevision = packetApi.sha256(stable(packet.source_citations.map((item) => ({ source_id: item.source_id, content_hash: item.content_hash }))));
      return {
        refresh_id: `refresh_${current.run_id}`,
        canonical_revision: packet.after_sha256,
        current_canonical_revision: packet.after_sha256,
        source_revision: sourceRevision,
        current_source_revision: sourceRevision,
        documents: [{
          document_id: proposal.proposal_id,
          type: "knowledge",
          title: proposal.title,
          statement: proposal.claims[0].text,
          citations: clone(proposal.source_citations),
          conflicts: clone(proposal.conflicts),
          content_hash: packet.after_sha256,
        }],
        proposals: [{ proposal_id: proposal.proposal_id, kind: "create", status: "approved", title: proposal.title, statement: proposal.claims[0].text }],
        confidence: [{ target_id: proposal.proposal_id, confidence: proposal.confidence }],
        run_memory: { run_id: current.run_id, result_ids: [], proposal_ids: [proposal.proposal_id], retrieval_method: "readonly_verified", version: CONTROLLER_VERSION, metrics: {} },
      };
    }

    function resultLinks(packet, canonicalResult, refreshed) {
      const resultId = `result_${packetApi.sha256(`${current.run_id}:${packet.packet_hash}`).slice(0, 24)}`;
      const auditId = `audit_${canonicalResult.audit.hash.slice(0, 24)}`;
      const snapshotId = refreshed.snapshot_revision ? `snapshot_${refreshed.snapshot_revision}` : null;
      return {
        result_id: resultId,
        links: {
          canonical: { path: packet.target_path, sha256: packet.after_sha256 },
          audit: { id: auditId, path: adapterApi.auditPath(packet.nonce), sha256: canonicalResult.audit.hash },
          snapshot: snapshotId ? { id: snapshotId, path: `${options.derived_root || ".llmwiki-derived"}/snapshots/${refreshed.snapshot_revision}/snapshot.json` } : null,
        },
      };
    }

    async function startRun(command) {
      if (!plain(command) || !ID.test(trim(command.run_id))) return rejectWithoutMutation("invalid_run_id", { status: "failed" });
      if (!explicitSources(command)) return rejectWithoutMutation("explicit_source_selection_required", { status: "failed" });
      const provider = providerSelection(command, options.app, options.ai_client);
      if (!provider.ok) return rejectWithoutMutation(provider.reason, { status: "failed" });
      const consentCommandHash = packetApi.sha256(stable({
        run_id: command.run_id,
        sources: command.sources,
        source_scope: command.source_scope,
        retrieval: command.retrieval,
        proposal_request: command.proposal_request,
        advanced_settings: command.advanced_settings || {},
        consent: command.consent,
        approval: command.approval,
        canonical_defaults: command.canonical_defaults || {},
      }));
      const resumingConsent = current.status === "consent_required"
        && current.run_id === command.run_id
        && state.getState().state === "consent_required";
      let token;
      if (resumingConsent) {
        if (current.consent_command_hash !== consentCommandHash) return rejectWithoutMutation("consent_mismatch", { status: "consent_required" });
        token = activeToken;
        if (!token) return rejectWithoutMutation("consent_session_unavailable", { status: "consent_required" });
      } else {
        const admitted = state.dispatch({ type: "start", run_id: command.run_id });
        if (!admitted.ok) return rejectWithoutMutation(admitted.reason);
        token = beginToken(command.run_id);
        const validationContext = { context_id: `validation_context_${command.run_id}`, logical_scope: "run_scoped", persistence: "none" };
        const selected = state.dispatch({ type: "select_sources", run_id: command.run_id, validation_context: validationContext });
        if (!selected.ok) return reject(selected.reason);
        const firstSource = command.sources[0];
        current = {
          status: "consent_required",
          run_id: command.run_id,
          provider_mode: provider.value.mode,
          source_selection: {
            selected: true,
            display_name: trim(firstSource.display_name) || trim(firstSource.manifest.locator) || trim(firstSource.manifest.source_url) || "선택한 자료",
          },
          consent_command_hash: consentCommandHash,
          review_packets: [],
          proposals: [],
          filtered_kinds: [],
        };
        runContext = null;
        recoveryContext = null;
        repacketSequence = 0;
        compensationContext = null;
      }
      if (command.explicit_user_consent !== true) return result(false, "consent_required", { reason: "consent_required" });
      if (provider.value.consent_required) {
        const granted = await provider.value.client.grantConsumer("wiki.batch_analysis");
        if (!granted || granted.status !== "granted") return rejectWithoutMutation(granted && granted.error_code || "consent_required", { status: "consent_required" });
      }
      if (!adapterResolution.ok || !refreshResolution.ok || typeof options.analyze_batch !== "function") {
        invalidateToken("run_failed");
        return reject(!adapterResolution.ok ? adapterResolution.reason : !refreshResolution.ok ? refreshResolution.reason : "analysis_core_unavailable");
      }
      const consented = state.dispatch({ type: "grant_consent", run_id: command.run_id });
      if (!consented.ok) return rejectWithoutMutation(consented.reason, { status: "consent_required" });
      current = { ...current, status: "running" };
      // Task 11: single canonical analysis delegation. consent_hash is bound
      // from the frozen consent command so packets stay tamper-evident without
      // the removed librarian consent transport.
      let consentArtifact = null;
      const analyzed = await options.analyze_batch({
        command: clone(command),
        provider: provider.value,
        signal: token.abort_controller && token.abort_controller.signal,
      });
      if (!isCurrent(token)) return lateOutput(token);
      counters.provider = Number(analyzed && analyzed.provider_calls) || 0;
      if (!analyzed || analyzed.ok !== true) {
        state.dispatch({ type: "provider_failed", run_id: command.run_id });
        invalidateToken("run_failed");
        return reject(analyzed && analyzed.reason || "batch_analysis_failed", { provider_mode: provider.value.mode });
      }
      consentArtifact = { consent_hash: analyzed.consent_hash || consentCommandHash };
      const proposals = analyzed.proposals;
      const typedRiskProposals = proposals.filter((proposal) => operationApi.isOperationRecord(proposal.operation) && proposal.operation.kind !== "noop");
      if (options.enable_risk_review === true && typedRiskProposals.length) {
        state.dispatch({ type: "provider_succeeded", run_id: command.run_id });
        current = { ...current, proposals: clone(proposals), filtered_kinds: proposals.filter((proposal) => !typedRiskProposals.includes(proposal)).map((proposal) => proposal.kind), consent_hash: consentArtifact.consent_hash };
        const opened = openPreparedRiskReview({ run_id: command.run_id, proposals: typedRiskProposals });
        if (!opened.ok) return rejectWithoutMutation(opened.reason, { status: opened.status || "review_only" });
        return output(true, "review", { provider_mode: provider.value.mode, risk_packets: riskCoordinator.getSnapshot().risk_packets, batch_metrics: clone(analyzed.metrics || {}), batch_id: analyzed.batch_id || null, job_id: analyzed.job_id || analyzed.batch_id || null, source_groups: clone(analyzed.source_groups || []) });
      }
      const creates = proposals.filter((proposal) => proposal.kind === "create");
      const filteredKinds = proposals.filter((proposal) => proposal.kind !== "create").map((proposal) => proposal.kind);
      const now = String(typeof options.now === "function" ? options.now() : new Date().toISOString());
      runContext = { command: clone(command), consent_artifact: clone(consentArtifact), selected_proposals: clone(creates), now };
      current = { ...current, proposals: clone(proposals), filtered_kinds: filteredKinds, consent_hash: consentArtifact.consent_hash };
      if (creates.length === 0) {
        const abstained = proposals.every((proposal) => proposal.kind === "abstain");
        state.dispatch({ type: abstained ? "abstain" : "provider_succeeded", run_id: command.run_id });
        return result(true, abstained ? "abstained" : "review_only", { provider_mode: provider.value.mode, filtered_kinds: filteredKinds, review_packets: [] });
      }
      if (creates.some((proposal) => (proposal.conflicts || []).some((conflict) => conflict.status === "unresolved"))) {
        state.dispatch({ type: "provider_succeeded", run_id: command.run_id });
        state.dispatch({ type: "unresolved_conflict", run_id: command.run_id });
        current = { ...current, reason: "unresolved_conflict" };
        return result(true, "review_only", { reason: "unresolved_conflict", provider_mode: provider.value.mode, filtered_kinds: filteredKinds, review_packets: [] });
      }
      const assembled = await assemblePackets(command, creates, consentArtifact, adapterResolution.adapter, now);
      if (!isCurrent(token)) return lateOutput(token);
      state.dispatch({ type: "provider_succeeded", run_id: command.run_id });
      if (!assembled.ok || assembled.status === "stale_reconfirm_required") {
        if (assembled.status === "stale_reconfirm_required") state.dispatch({ type: "stale", run_id: command.run_id });
        return reject(assembled.reason, { status: assembled.status || "review_only", provider_mode: provider.value.mode });
      }
      current = { ...current, status: "review", review_packets: clone(assembled.value), selected_proposals: clone(creates), reconfirmation_required: false };
      return result(true, "review", { provider_mode: provider.value.mode, filtered_kinds: filteredKinds, review_packets: assembled.value });
    }

    async function approve(intent) {
      if (approvalPending) return rejectWithoutMutation("action_in_progress");
      if (current.reconfirmation_required === true) return rejectWithoutMutation("reconfirmation_required", { status: "review" });
      if (current.reason === "unresolved_conflict") return rejectWithoutMutation("unresolved_conflict", { status: "review_only" });
      if (state.getState().state !== "review") return rejectWithoutMutation("approval_not_available");
      const packet = current.review_packets.find((item) => item.packet_hash === trim(intent && intent.packet_hash));
      if (!packet) return rejectWithoutMutation("packet_not_selected", { status: "review" });
      const token = activeToken;
      if (!token) return rejectWithoutMutation("approval_not_available");
      approvalPending = true;
      try {
        let live;
        try { live = await adapterResolution.adapter.readBytes(packet.target_path); }
        catch (_error) { return rejectWithoutMutation("live_read_failed", { status: "review" }); }
        if (!isCurrent(token)) return lateOutput(token);
        if (live !== null) {
          state.dispatch({ type: "stale", run_id: current.run_id });
          current = { ...current, status: "stale_reconfirm_required", stale_packet_hash: packet.packet_hash };
          invalidateToken("run_stale");
          return output(false, "stale_reconfirm_required", { reason: "target_revision_mismatch" });
        }
        const authorization = reviewApi.authorizeCanonicalPacket(packet, {
          action: trim(intent && intent.action),
          selection_ids: [packet.operation.operation_id],
        });
        if (!authorization.ok) return rejectWithoutMutation(authorization.reason, { status: "review" });
        const approved = state.dispatch({ type: "approve", run_id: current.run_id });
        if (!approved.ok) return rejectWithoutMutation(approved.reason);
        counters.authorization += 1;
        const proposal = current.selected_proposals.find((item) => item.proposal_id === packet.operation.proposal_id);
        const refreshPayload = refreshInput(packet, proposal);
        const committed = await commitApi.commitApprovedCanonical(
          reviewApi.buildCommitRequest({ packet, authorization: authorization.value, adapter: adapterResolution.adapter }),
          { now: String(typeof options.now === "function" ? options.now() : new Date().toISOString()) },
        );
        if (!isCurrent(token)) return lateOutput(token);
        counters.canonical += Number(committed.write_counts && committed.write_counts.canonical || 0);
        counters.audit += Number(committed.write_counts && committed.write_counts.audit || 0);
        if (committed.status === "committed_audit_pending") {
          state.dispatch({ type: "commit_audit_pending", run_id: current.run_id });
          recoveryContext = { kind: "audit_pending", repair: clone(committed.repair), packet: clone(packet), proposal: clone(proposal), refresh_input: clone(refreshPayload) };
          current = { ...current, status: "committed_audit_pending", reason: committed.reason, packet_hash: packet.packet_hash, target_path: packet.target_path };
          return output(false, "committed_audit_pending", { reason: committed.reason, packet_hash: packet.packet_hash, target_path: packet.target_path });
        }
        if (!committed.ok) {
          if (committed.reason === "target_revision_mismatch") {
            state.dispatch({ type: "stale", run_id: current.run_id });
            current = { ...current, status: "stale_reconfirm_required", stale_packet_hash: packet.packet_hash };
            invalidateToken("run_stale");
            return output(false, "stale_reconfirm_required", { reason: committed.reason });
          }
          return reject(committed.reason, { status: "failed" });
        }

        const refreshed = await refreshApi.refreshAfterCanonicalAudit({
          canonicalResult: committed,
          refreshStore: refreshResolution.store,
          refreshInput: refreshPayload,
        });
        if (!isCurrent(token)) return lateOutput(token);
        counters.refresh += Number(refreshed.refresh_counts && refreshed.refresh_counts.snapshot || 0);
        state.dispatch({ type: refreshed.status === "committed" ? "commit_succeeded" : "commit_refresh_failed", run_id: current.run_id });
        const linked = resultLinks(packet, committed, refreshed);
        recoveryContext = refreshed.status === "committed_refresh_failed"
          ? { kind: "refresh_failed", canonical_result: clone(committed), packet: clone(packet), proposal: clone(proposal), refresh_input: clone(refreshPayload) }
          : null;
        current = { ...current, status: refreshed.status, result_id: linked.result_id, links: clone(linked.links), reason: refreshed.reason || null };
        return result(true, refreshed.status, {
          result_id: linked.result_id,
          packet_hash: packet.packet_hash,
          authorization_hash: authorization.value.authorization_hash,
          target_path: packet.target_path,
          links: linked.links,
        });
      } finally {
        approvalPending = false;
      }
    }

    function cancel(intent) {
      if (!exactAction(intent, "cancel")) return rejectWithoutMutation("malformed_action");
      const runId = current.run_id;
      const cancelled = state.dispatch({ type: "cancel", run_id: runId });
      if (!cancelled.ok) return rejectWithoutMutation(cancelled.reason);
      invalidateToken("run_cancelled");
      runContext = null;
      recoveryContext = null;
      current = { status: "cancelled", run_id: runId, review_packets: [], proposals: [], filtered_kinds: [], reason: "cancelled" };
      return output(true, "cancelled", { reason: "cancelled" });
    }

    function reload(intent) {
      if (!exactAction(intent, "reload")) return rejectWithoutMutation("malformed_action");
      const runId = current.run_id;
      state.dispatch({ type: "reload" });
      invalidateToken("run_reloaded");
      resetCounters();
      runContext = null;
      recoveryContext = null;
      approvalPending = false;
      recoveryPending = false;
      current = { status: "idle", review_packets: [], proposals: [], filtered_kinds: [] };
      return output(true, "idle");
    }

    function tabSwitch(intent) {
      if (!exactAction(intent, "tab_switch", ["tab_id"])) return rejectWithoutMutation("malformed_action");
      if (!TAB_IDS.includes(trim(intent.tab_id))) return rejectWithoutMutation("invalid_tab_id");
      const switched = state.dispatch({ type: "tab_switch", tab_id: trim(intent.tab_id) });
      if (!switched.ok) return rejectWithoutMutation(switched.reason);
      return output(true, current.status, { tab_id: trim(intent.tab_id) });
    }

    async function repairAudit(intent) {
      if (!exactAction(intent, "repair_audit")) return rejectWithoutMutation("malformed_action");
      if (recoveryPending) return rejectWithoutMutation("recovery_in_progress");
      if (current.status !== "committed_audit_pending" || !recoveryContext || recoveryContext.kind !== "audit_pending") {
        return rejectWithoutMutation("audit_repair_not_available");
      }
      const token = activeToken;
      if (!token) return rejectWithoutMutation("audit_repair_not_available");
      recoveryPending = true;
      recoveryCounters.audit_repair += 1;
      try {
        const repaired = await commitApi.repairCommittedAudit({ adapter: adapterResolution.adapter, repair: recoveryContext.repair });
        if (!isCurrent(token)) return lateOutput(token);
        counters.audit += Number(repaired.write_counts && repaired.write_counts.audit || 0);
        if (!repaired.ok || !["repaired", "duplicate"].includes(repaired.status)) {
          return rejectWithoutMutation(repaired.reason || "audit_repair_failed", { status: "committed_audit_pending" });
        }
        if (!repaired.audit) return rejectWithoutMutation("audit_repair_failed", { status: "committed_audit_pending" });
        state.dispatch({ type: "audit_repaired", run_id: current.run_id });
        recoveryContext = {
          ...recoveryContext,
          kind: "refresh_failed",
          canonical_result: clone(repaired),
        };
        current = { ...current, status: "committed_refresh_failed", reason: "derived_refresh_required" };
        return output(true, "committed_refresh_failed", { reason: "derived_refresh_required" });
      } finally {
        recoveryPending = false;
      }
    }

    async function retryRefresh(intent) {
      if (!exactAction(intent, "retry_refresh")) return rejectWithoutMutation("malformed_action");
      if (recoveryPending) return rejectWithoutMutation("recovery_in_progress");
      if (current.status !== "committed_refresh_failed" || !recoveryContext || recoveryContext.kind !== "refresh_failed") {
        return rejectWithoutMutation("refresh_retry_not_available");
      }
      const token = activeToken;
      if (!token) return rejectWithoutMutation("refresh_retry_not_available");
      recoveryPending = true;
      recoveryCounters.refresh_retry += 1;
      try {
        const refreshed = await refreshApi.refreshAfterCanonicalAudit({
          canonicalResult: recoveryContext.canonical_result,
          refreshStore: refreshResolution.store,
          refreshInput: recoveryContext.refresh_input,
        });
        if (!isCurrent(token)) return lateOutput(token);
        counters.refresh += Number(refreshed.refresh_counts && refreshed.refresh_counts.snapshot || 0);
        if (refreshed.status !== "committed") {
          state.dispatch({ type: "refresh_retry_failed", run_id: current.run_id });
          current = { ...current, reason: refreshed.reason || "refresh_failed" };
          return output(false, "committed_refresh_failed", { reason: current.reason });
        }
        state.dispatch({ type: "refresh_retry_succeeded", run_id: current.run_id });
        const linked = resultLinks(recoveryContext.packet, recoveryContext.canonical_result, refreshed);
        recoveryContext = null;
        current = { ...current, status: "committed", result_id: linked.result_id, links: clone(linked.links), reason: null };
        return output(true, "committed", { result_id: linked.result_id, links: linked.links });
      } finally {
        recoveryPending = false;
      }
    }

    async function repacketStale(intent) {
      if (!exactAction(intent, "repacket_stale")) return rejectWithoutMutation("malformed_action");
      if (recoveryPending) return rejectWithoutMutation("recovery_in_progress");
      if (current.status !== "stale_reconfirm_required" || !runContext || runContext.selected_proposals.length === 0) {
        return rejectWithoutMutation("new_run_required", { status: "stale_reconfirm_required" });
      }
      recoveryPending = true;
      recoveryCounters.stale_repacket += 1;
      repacketSequence += 1;
      const token = beginToken(current.run_id);
      try {
        const command = clone(runContext.command);
        command.approval = {
          ...command.approval,
          nonce: `${trim(command.approval && command.approval.nonce)}_repacket_${repacketSequence}`,
        };
        const assembled = await assemblePackets(command, runContext.selected_proposals, runContext.consent_artifact, adapterResolution.adapter, runContext.now, true);
        if (!isCurrent(token)) return lateOutput(token);
        if (!assembled.ok) {
          invalidateToken("new_run_required");
          return rejectWithoutMutation("new_run_required", { status: "stale_reconfirm_required" });
        }
        const transition = state.dispatch({ type: "repacket", run_id: current.run_id });
        if (!transition.ok) return rejectWithoutMutation(transition.reason, { status: "stale_reconfirm_required" });
        runContext = { ...runContext, command };
        current = {
          ...current,
          status: "review",
          reason: null,
          review_packets: clone(assembled.value),
          reconfirmation_required: true,
        };
        return output(true, "review", { review_packets: assembled.value, approval_enabled: false });
      } finally {
        recoveryPending = false;
      }
    }

    function reconfirmStale(intent) {
      if (!exactAction(intent, "reconfirm_stale", ["packet_hash"])) return rejectWithoutMutation("malformed_action");
      if (!HASH.test(trim(intent.packet_hash))) return rejectWithoutMutation("invalid_packet_hash");
      if (current.status !== "review" || current.reconfirmation_required !== true) return rejectWithoutMutation("reconfirmation_not_available");
      const packet = current.review_packets.find((item) => item.packet_hash === trim(intent.packet_hash));
      if (!packet) return rejectWithoutMutation("packet_not_selected", { status: "review" });
      const transition = state.dispatch({ type: "reconfirm", run_id: current.run_id });
      if (!transition.ok) return rejectWithoutMutation(transition.reason);
      current = { ...current, reconfirmation_required: false };
      return output(true, "review", { approval_enabled: true, packet_hash: packet.packet_hash });
    }

    function requestCompensation(intent) {
      if (!exactAction(intent, "request_compensation")) return rejectWithoutMutation("malformed_action");
      if (current.status !== "committed" || !compensationContext || !compensationContext.eligible || compensationContext.consumed) {
        return rejectWithoutMutation("compensation_not_available");
      }
      compensationContext.confirmation_required = true;
      current = { ...current, compensation: compensationSnapshot() };
      return output(true, "compensation_confirmation_required", { compensation: compensationSnapshot() });
    }

    async function confirmCompensation(intent) {
      if (!exactAction(intent, "confirm_compensation")) return rejectWithoutMutation("malformed_action");
      if (current.status !== "committed" || !compensationContext || !compensationContext.eligible || compensationContext.consumed
        || compensationContext.confirmation_required !== true) {
        return rejectWithoutMutation("compensation_confirmation_required");
      }
      const user_action = compensationAction();
      const prepared = compensationContext.service.prepareCompensation({
        original_receipt: compensationContext.original_receipt,
        user_action,
      });
      if (!prepared.ok) return rejectWithoutMutation(prepared.reason);
      const preparedAudit = await compensationContext.service.recordPreparedCompensation({ prepared });
      if (!preparedAudit.ok) return rejectWithoutMutation(preparedAudit.reason);
      current = { ...current, status: "compensation_committing", compensation: compensationSnapshot() };
      const committed = await compensationContext.service.commitCompensation({
        state: "compensation_committing",
        packet: prepared.packet,
        user_action,
      });
      if (!committed.ok) {
        compensationContext.confirmation_required = false;
        compensationContext.reason = committed.reason;
        current = { ...current, status: "committed", compensation: compensationSnapshot() };
        return output(false, "committed", { reason: committed.reason, compensation: compensationSnapshot() });
      }
      let refresh_outcome = "succeeded";
      try {
        const refreshed = typeof options.compensation_refresh === "function" ? await options.compensation_refresh() : { ok: true };
        if (!refreshed || refreshed.ok !== true) refresh_outcome = "failed";
      } catch (_error) {
        refresh_outcome = "failed";
      }
      const followUp = await compensationContext.service.recordCompensationOutcome({
        packet: prepared.packet,
        user_action,
        refresh_outcome,
        git_outcome: "not_requested",
      });
      compensationContext.eligible = false;
      compensationContext.confirmation_required = false;
      compensationContext.consumed = true;
      compensationContext.reason = followUp.ok ? null : followUp.reason;
      current = {
        ...current,
        status: followUp.ok ? "compensated" : "compensated_audit_pending",
        compensation: compensationSnapshot(),
      };
      return output(true, current.status, {
        compensation: compensationSnapshot(),
        audit: committed.audit,
        refresh_outcome,
        compensation_audit_outcome: followUp.ok ? "recorded" : "pending",
      });
    }

    return frozen({
      startRun,
      approve,
      cancel,
      reload,
      tabSwitch,
      repairAudit,
      retryRefresh,
      repacketStale,
      reconfirmStale,
      requestCompensation,
      confirmCompensation,
      startOperation: operationRuns.start,
      bindOperationApproval: operationRuns.bindApproval,
      approveOperation: operationRuns.approve,
      bindOperationCancel: operationRuns.bindCancel,
      cancelOperation: operationRuns.cancel,
      bindOperationFollowUpRetry: operationRuns.bindRetryFollowUp,
      retryOperationFollowUp: operationRuns.retryFollowUp,
      recoverOperation: operationRuns.recover,
      getOperationSnapshot: operationRuns.getSnapshot,
      openRiskReview,
      openPreparedRiskReview,
      dispatchRiskAction,
      applyPreparedBatchApproval,
      approveRisk: riskCoordinator ? riskCoordinator.approve : () => Promise.resolve(rejectWithoutMutation("risk_review_runtime_unavailable")),
      approveRiskBatch: riskCoordinator ? riskCoordinator.approveBatch : () => Promise.resolve(rejectWithoutMutation("risk_review_runtime_unavailable")),
      requestRiskRevision: riskCoordinator ? riskCoordinator.requestRevision : () => Promise.resolve(rejectWithoutMutation("risk_review_runtime_unavailable")),
      rejectRisk: riskCoordinator ? riskCoordinator.reject : () => Promise.resolve(rejectWithoutMutation("risk_review_runtime_unavailable")),
      async runMaintenance(input) {
        return typeof options.maintenance_action === "function" ? options.maintenance_action(input) : rejectWithoutMutation("maintenance_action_unavailable");
      },
      async recordResurfacingFeedback(input) {
        return typeof options.resurfacing_action === "function" ? options.resurfacing_action(input) : rejectWithoutMutation("resurfacing_action_unavailable");
      },
      getSnapshot: snapshot,
    });
  }

  const api = frozen({ CONTROLLER_VERSION, createRunController });
  root.LLMWikiRunController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
