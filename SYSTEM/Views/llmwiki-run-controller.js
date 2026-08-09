(function (root) {
  "use strict";

  // allow: SIZE_OK — the run controller is one security-sensitive lifecycle state machine and consent binding must remain atomic.

  const pipelineApi = root.LLMWikiLibrarianPipeline || (typeof require === "function" ? require("./llmwiki-librarian-pipeline.js") : null);
  const consentApi = root.LLMWikiOutboundConsent || (typeof require === "function" ? require("./llmwiki-outbound-consent.js") : null);
  const runStateApi = root.LLMWikiRunState || (typeof require === "function" ? require("./llmwiki-run-state.js") : null);
  const packetApi = root.LLMWikiCanonicalPacket || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const reviewApi = root.LLMWikiApprovalReviewCommit || (typeof require === "function" ? require("./llmwiki-approval-review-commit.js") : null);
  const commitApi = root.LLMWikiDeterministicCommit || (typeof require === "function" ? require("./llmwiki-deterministic-commit.js") : null);
  const adapterApi = root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
  const refreshApi = root.LLMWikiDerivedRefresh || (typeof require === "function" ? require("./llmwiki-derived-refresh.js") : null);

  const CONTROLLER_VERSION = "llmwiki_run_controller_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const COUNTER_KEYS = Object.freeze(["provider", "network", "canonical", "audit", "refresh", "git", "authorization"]);
  const RECOVERY_COUNTER_KEYS = Object.freeze(["audit_repair", "refresh_retry", "stale_repacket"]);
  const TAB_IDS = Object.freeze(["zettelkasten", "para", "llm_wiki"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function frozen(value) {
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

  function providerSelection(command) {
    const legacyMode = trim(command.provider && (command.provider.mode || command.provider.provider_mode));
    if (legacyMode === "omniroute") return { ok: false, reason: "omniroute_requires_advanced_selection" };
    const advanced = plain(command.advanced_settings) ? command.advanced_settings : {};
    const mode = trim(advanced.provider_mode || "direct");
    if (!["direct", "omniroute"].includes(mode)) return { ok: false, reason: "invalid_provider_mode" };
    const providerKey = trim(advanced.provider_key || (mode === "omniroute" ? "omniroute" : "direct"));
    const timeoutMs = Number(advanced.timeout_ms || 5000);
    return { ok: true, value: {
      mode, timeout_ms: timeoutMs,
      retry_owner: mode === "omniroute" ? "gateway" : "prodigy",
      request_metadata: { request_id: `request_${command.run_id}`, provider_key: providerKey },
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

  function boundedTransport(transport, request, signal) {
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
      Promise.resolve().then(() => transport(request, { signal })).then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
  }

  function createRunController(options = {}) {
    const state = runStateApi.createRunState();
    const counters = zeroCounters(COUNTER_KEYS);
    const recoveryCounters = zeroCounters(RECOVERY_COUNTER_KEYS);
    const adapterResolution = adapterApi.resolveObsidianAdapter(options.app);
    const refreshResolution = refreshApi.resolveObsidianDerivedRefreshStore(options.app, { rootPath: options.derived_root || ".llmwiki-derived" });
    let current = { status: "idle", review_packets: [], proposals: [], filtered_kinds: [] };
    let generation = 0;
    let activeToken = null;
    let runContext = null;
    let recoveryContext = null;
    let approvalPending = false;
    let recoveryPending = false;
    let repacketSequence = 0;

    function snapshot() {
      return frozen({
        controller_version: CONTROLLER_VERSION,
        ...clone(current),
        run_state: state.getState(),
        counters: clone(counters),
        recovery_counters: clone(recoveryCounters),
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

    async function assemblePackets(command, proposals, consentArtifact, adapter, now, allowCreateCollision = false) {
      const packets = [];
      for (const [index, proposal] of proposals.entries()) {
        const assembled = await packetApi.assembleCanonicalPacket({
          run_id: command.run_id,
          operation: {
            operation_id: `operation_${proposal.proposal_id.slice("proposal_".length)}`,
            proposal_id: proposal.proposal_id,
            proposal_kind: proposal.kind,
            payload_hash: proposal.payload_hash,
          },
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
      const provider = providerSelection(command);
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
      }
      if (command.explicit_user_consent !== true) return result(false, "consent_required", { reason: "consent_required" });
      if (!adapterResolution.ok || !refreshResolution.ok || typeof options.transport !== "function") {
        invalidateToken("run_failed");
        return reject(!adapterResolution.ok ? adapterResolution.reason : !refreshResolution.ok ? refreshResolution.reason : "transport_required");
      }
      const consented = state.dispatch({ type: "grant_consent", run_id: command.run_id });
      if (!consented.ok) return rejectWithoutMutation(consented.reason, { status: "consent_required" });
      current = { ...current, status: "running" };
      let consentArtifact = null;
      const pipelineResult = await pipelineApi.runLibrarian({
        ...command,
        provider: provider.value,
        capture_requested: false,
      }, {
        config: options.config,
        providerInvoker: async (request, providerOptions) => {
          const issued = consentApi.createConsentArtifact(request, {
            ...providerOptions,
            explicit_user_consent: true,
            issued_at: trim(command.consent && command.consent.issued_at),
            nonce: trim(command.consent && command.consent.nonce),
          });
          if (!issued.ok) return issued;
          consentArtifact = issued.value;
          return consentApi.invokeProposalProvider(request, {
            ...providerOptions,
            consent: consentArtifact,
            transport: async (normalized) => {
              counters.provider += 1;
              counters.network += 1;
              return boundedTransport(options.transport, normalized, token.abort_controller && token.abort_controller.signal);
            },
          });
        },
      });
      if (!isCurrent(token)) return lateOutput(token);
      if (!pipelineResult.ok) {
        state.dispatch({ type: "provider_failed", run_id: command.run_id });
        pipelineApi.dropValidationContext(command.run_id);
        invalidateToken("run_failed");
        return reject(pipelineResult.reason, { provider_mode: provider.value.mode });
      }

      const proposals = pipelineResult.value.proposal_bundle.proposals;
      const creates = proposals.filter((proposal) => proposal.kind === "create");
      const filteredKinds = proposals.filter((proposal) => proposal.kind !== "create").map((proposal) => proposal.kind);
      const now = String(typeof options.now === "function" ? options.now() : new Date().toISOString());
      runContext = { command: clone(command), consent_artifact: clone(consentArtifact), selected_proposals: clone(creates), now };
      current = { ...current, proposals: clone(proposals), filtered_kinds: filteredKinds, consent_hash: consentArtifact.consent_hash };
      if (creates.length === 0) {
        const abstained = proposals.every((proposal) => proposal.kind === "abstain");
        state.dispatch({ type: abstained ? "abstain" : "provider_succeeded", run_id: command.run_id });
        if (abstained) pipelineApi.dropValidationContext(command.run_id);
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
          pipelineApi.dropValidationContext(current.run_id);
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
        pipelineApi.dropValidationContext(current.run_id);
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
      pipelineApi.dropValidationContext(runId);
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
      if (runId) pipelineApi.dropValidationContext(runId);
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
      getSnapshot: snapshot,
    });
  }

  const api = frozen({ CONTROLLER_VERSION, createRunController });
  root.LLMWikiRunController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
