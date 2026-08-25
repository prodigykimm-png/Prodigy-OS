(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const consentApi = root.LLMWikiOutboundConsent || (typeof require === "function" ? require("./llmwiki-outbound-consent.js") : null);
  const recoveryApi = root.LLMWikiUIRecovery || (typeof require === "function" ? require("./llmwiki-ui-recovery.js") : null);
  const privacyBoundaryApi = root.LLMWikiInboxPrivacyBoundary || (typeof require === "function" ? require("./llmwiki-inbox-privacy-boundary.js") : null);
  const sensitivePolicyApi = root.LLMWikiSensitiveContentPolicy || (typeof require === "function" ? require("./llmwiki-sensitive-content-policy.js") : null);
  const scopeApi = root.LLMWikiAnalysisScope || (typeof require === "function" ? require("./llmwiki-analysis-scope.js") : null);
  const nodeCrypto = typeof require === "function" ? require("node:crypto") : null;

  const ROUTES = Object.freeze(["knowledge", "people", "project", "venue", "auction", "hold"]);
  const DEFAULT_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
  const SERIALIZED_SOURCE_KEYS = new Set([
    "content_hash", "expected_snapshot_id", "media_kind", "modified_revision", "privacy_class",
    "provider_eligibility", "route_hint", "sensitive", "source_id", "source_kind", "source_path", "source_text", "text",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function recovery(reason) {
    return recoveryApi && typeof recoveryApi.mapRecovery === "function"
      ? recoveryApi.mapRecovery({ code: reason })
      : Object.freeze({ code: reason, copy: "LLMWiki 자동 분석을 완료하지 못했습니다.", action: "retry" });
  }
  function rejected(reason, extras = {}) {
    return freeze({
      ok: false,
      state: reason === "consent_required" ? "consent_required" : "rejected",
      reason,
      policy_state: reason === "consent_required" ? "consent_required" : "unchanged",
      analysis_runs: 0,
      source_writes: 0,
      raw_inbox_git_candidate: false,
      recovery: recovery(reason),
      ...extras,
    });
  }
  function success(extras) {
    return freeze({
      ok: true,
      state: "locally_indexed",
      policy_state: "standing",
      analysis_runs: 0,
      source_writes: 0,
      raw_inbox_git_candidate: false,
      ...extras,
    });
  }
  function byteView(value) {
    if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }
  function hashSourceBytes(bytes) {
    if (nodeCrypto) return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
    if (!hashApi || typeof hashApi.sha256 !== "function" || typeof TextDecoder === "undefined") return null;
    try { return hashApi.sha256(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch (_error) { return null; }
  }
  function safeInboxPath(value) {
    if (privacyBoundaryApi && typeof privacyBoundaryApi.isSafeInboxPath === "function" && !privacyBoundaryApi.isSafeInboxPath(value)) return null;
    const sourcePath = trim(value);
    const parts = sourcePath.split("/");
    return sourcePath.startsWith("INBOX/")
      && sourcePath.length <= 1024
      && !sourcePath.includes("\\")
      && !/[\u0000-\u001f\u007f?#]/u.test(sourcePath)
      && parts.every((part) => part && part !== "." && part !== "..")
      ? sourcePath : null;
  }
  function policyRoute(sourcePath, source) {
    if (source.sensitive === true || trim(source.privacy_class).toLowerCase() === "private") return "hold";
    const hint = trim(source.route_hint || source.route).toLowerCase();
    if (ROUTES.includes(hint)) return hint;
    const segment = sourcePath.split("/")[1].toLowerCase();
    return ROUTES.includes(segment) ? segment : "hold";
  }
  function matchesPrefix(sourcePath, prefixes) {
    return prefixes.some((prefix) => sourcePath.startsWith(prefix));
  }
  function serializedSource(input, sourceRegistryRecords, maxSourceBytes) {
    let serialized = input;
    if (typeof input !== "string") {
      serialized = sourceRegistryRecords && input && (typeof input === "object" || typeof input === "function")
        ? sourceRegistryRecords.get(input) : undefined;
      if (typeof serialized !== "string") return rejected("serialized_source_required");
    }
    const encodedLength = typeof TextEncoder === "undefined" ? serialized.length : new TextEncoder().encode(serialized).byteLength;
    if (encodedLength > maxSourceBytes * 4 + 4096) return rejected("source_too_large");
    let parsed;
    try { parsed = JSON.parse(serialized); }
    catch (_error) { return rejected("invalid_serialized_source"); }
    if (!plain(parsed) || Object.keys(parsed).some((key) => !SERIALIZED_SOURCE_KEYS.has(key))) return rejected("invalid_serialized_source");
    if (typeof parsed.source_text !== "string") return rejected("source_text_required");
    if (parsed.text !== undefined && parsed.text !== parsed.source_text) return rejected("invalid_serialized_source");
    for (const key of ["source_id", "source_path", "modified_revision", "media_kind", "content_hash", "route_hint", "privacy_class", "source_kind", "expected_snapshot_id"]) {
      if (parsed[key] !== undefined && typeof parsed[key] !== "string") return rejected("invalid_serialized_source");
    }
    if (parsed.sensitive !== undefined && typeof parsed.sensitive !== "boolean") return rejected("invalid_serialized_source");
    if (parsed.provider_eligibility !== undefined && (!Array.isArray(parsed.provider_eligibility) || parsed.provider_eligibility.some((item) => !["direct", "omniroute"].includes(item)))) return rejected("invalid_serialized_source");
    const sourceBytes = typeof TextEncoder === "undefined" ? null : new TextEncoder().encode(parsed.source_text);
    if (!sourceBytes) return rejected("text_encoder_unavailable");
    return { ok: true, value: { input: { ...parsed, text: parsed.source_text, source_bytes: sourceBytes }, serialized } };
  }
  function normalizeSource(input, maxSourceBytes) {
    const sourceId = trim(input.source_id);
    const sourcePath = safeInboxPath(input.source_path);
    const revision = trim(input.modified_revision);
    const bytes = byteView(input.source_bytes);
    if (!ID.test(sourceId)) return rejected("invalid_source_id");
    if (!sourcePath) return rejected("invalid_inbox_path");
    if (!REVISION.test(revision)) return rejected("invalid_modified_revision");
    if (!bytes || bytes.byteLength === 0) return rejected("source_bytes_required");
    if (bytes.byteLength > maxSourceBytes) return rejected("source_too_large");
    const localHash = hashSourceBytes(bytes);
    if (!HASH.test(localHash)) return rejected("hash_unavailable");
    if (input.content_hash !== undefined && trim(input.content_hash) !== localHash) return rejected("content_hash_mismatch");
    return { ok: true, value: { source_id: sourceId, source_path: sourcePath, modified_revision: revision, source_bytes: bytes, content_hash: localHash } };
  }
  function resolveExtractor(sourceAdapter) {
    if (sourceAdapter && typeof sourceAdapter.extract === "function") return sourceAdapter.extract.bind(sourceAdapter);
    if (sourceAdapter && typeof sourceAdapter.adapt === "function") return sourceAdapter.adapt.bind(sourceAdapter);
    return null;
  }

  function createInboxAutopilot(options = {}) {
    const registry = options.registry;
    const extract = resolveExtractor(options.sourceAdapter);
    const createScope = options.sourceAdapter && typeof options.sourceAdapter.createAnalysisScope === "function"
      ? options.sourceAdapter.createAnalysisScope.bind(options.sourceAdapter) : scopeApi?.createAnalysisScope;
    const transport = options.analysisTransport;
    const maxSourceBytes = Number.isSafeInteger(options.maxSourceBytes) && options.maxSourceBytes > 0
      ? options.maxSourceBytes : DEFAULT_MAX_SOURCE_BYTES;
    const sourceRegistryRecords = options.sourceRegistryRecords instanceof WeakMap ? options.sourceRegistryRecords : null;
    const chunkOrchestrator = options.chunkOrchestrator || null;
    if (chunkOrchestrator && typeof chunkOrchestrator.analyze !== "function") throw new TypeError("chunk_orchestrator_required");
    if (!registry || typeof registry.register !== "function") throw new TypeError("source_registry_required");
    if (!extract) throw new TypeError("source_adapter_required");
    if (typeof transport !== "function") throw new TypeError("analysis_transport_required");
    const standing = consentApi.createStandingPolicySnapshot(options.standingPolicy);
    if (!standing || standing.ok !== true) throw new TypeError("standing_policy_required");

    const listeners = new Set();
    const revisions = new Map();
    const generations = new Map();
    const inputs = new Map();
    const chunkRequests = new Map();

    function emit(event) {
      const safeEvent = freeze(event);
      for (const listener of [...listeners]) {
        try { listener(safeEvent); } catch (_error) { /* subscribers do not own autopilot state */ }
      }
    }
    function subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener_required");
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    function generation(sourceId) { return generations.get(sourceId) || 0; }
    function receiptFor(source, route, state, snapshotId, analysisRuns) {
      return freeze({
        receipt_version: "llmwiki_inbox_autopilot_receipt_v1",
        source_id: source.source_id,
        modified_revision: source.modified_revision,
        content_hash: source.content_hash,
        route,
        state,
        snapshot_id: snapshotId,
        standing_policy_hash: standing.value.policy_hash,
        analysis_runs: analysisRuns || 0,
        source_writes: 0,
        raw_inbox_git_candidate: false,
      });
    }
    function cancel(sourceId) {
      const id = trim(sourceId);
      generations.set(id, generation(id) + 1);
      const activeRequest = chunkRequests.get(id);
      if (activeRequest) activeRequest.authority.cancel(activeRequest.request);
      for (const [key, state] of revisions) if (key.startsWith(`${id}\u0000`) && state.status === "running") state.status = "cancelled";
      emit({ type: "analysis_cancelled", source_id: id });
      return freeze({ ok: true, state: "cancelled", source_id: id });
    }

    async function dispatch(input, context = {}) {
      if (plain(context) && context.dirty_worktree === true) return rejected("dirty_worktree");
      if (plain(context) && context.signal && context.signal.aborted === true) return rejected("provider_aborted", { state: "cancelled" });
      const policyCheck = consentApi.validateStandingPolicySnapshot(standing.value, plain(context) && context.currentPolicy ? context.currentPolicy : standing.value.policy);
      if (!policyCheck || policyCheck.ok !== true) return rejected(policyCheck && policyCheck.reason || "consent_required");
      const decoded = serializedSource(input, sourceRegistryRecords, maxSourceBytes);
      if (!decoded.ok) return decoded;
      const sourceInput = decoded.value.input;
      const normalized = normalizeSource(sourceInput, maxSourceBytes);
      if (!normalized.ok) return normalized;
      const source = normalized.value;
      const forceAnalysis = plain(context) && context.force === true;
      const route = policyRoute(source.source_path, sourceInput);
      const denied = matchesPrefix(source.source_path, standing.value.policy.denied_path_prefixes);
      const allowedKnowledge = route === "knowledge"
        && !denied
        && trim(sourceInput.privacy_class).toLowerCase() !== "private"
        && matchesPrefix(source.source_path, standing.value.policy.allowed_path_prefixes);
      const sensitive = allowedKnowledge && sensitivePolicyApi && sensitivePolicyApi.inspect({ source_path: source.source_path, source_text: sourceInput.source_text, metadata: sourceInput });
      if (sensitive && sensitive.type === "hold") return rejected("sensitive_content_hold", { route: "hold", policy: sensitive });
      const revisionKey = `${source.source_id}\u0000${source.modified_revision}`;
      const existing = revisions.get(revisionKey);
      if (existing && existing.content_hash !== source.content_hash) return rejected("source_revision_content_mismatch", { route, replayed: false });
      if (existing && existing.status === "completed" && !forceAnalysis) return success({ route, state: "completed", replayed: true, snapshot_id: existing.snapshot_id, receipt: receiptFor(source, route, "completed", existing.snapshot_id, 0) });
      if (existing && existing.status === "running") return success({ route, state: "analysis_pending", replayed: true, snapshot_id: existing.snapshot_id, receipt: receiptFor(source, route, "analysis_pending", existing.snapshot_id, 0) });

      let extracted;
      try { extracted = await extract(decoded.value.serialized, { signal: context.signal, local_content_hash: source.content_hash }); }
      catch (_error) { return rejected("extractor_failed", { route }); }
      if (!extracted || extracted.ok !== true || !plain(extracted.value)) return rejected(extracted && (extracted.reason || extracted.code) || "extractor_failed", { route });
      const extractedSource = plain(extracted.value.source) ? extracted.value.source : {};
      const extractedContent = plain(extracted.value.content) ? extracted.value.content : {};
      const extractedExtractor = plain(extracted.value.extractor) ? extracted.value.extractor : {};
      const extractedHash = trim(extracted.value.content_hash || extractedContent.content_hash);
      if (extractedHash !== source.content_hash) return rejected("content_hash_mismatch", { route });
      const registration = {
        source_id: source.source_id,
        source_path: source.source_path,
        source_bytes: source.source_bytes,
        content_hash: source.content_hash,
        modified_revision: source.modified_revision,
        media_kind: trim(extracted.value.media_kind || extractedSource.media_kind || sourceInput.media_kind),
        extractor_id: trim(extracted.value.extractor_id || extractedExtractor.extractor_id || "extractor_inbox"),
        extractor_version: trim(extracted.value.extractor_version || extractedExtractor.extractor_version || "1.0.0"),
        privacy_class: trim(sourceInput.privacy_class || extracted.value.privacy_class || "internal"),
        provider_eligibility: Array.isArray(sourceInput.provider_eligibility) ? sourceInput.provider_eligibility : Array.isArray(extracted.value.provider_eligibility) ? extracted.value.provider_eligibility : ["direct"],
        processing_state: "queued",
        retry_state: { attempt: 0, max_attempts: 3, last_error: null },
        incremental_cursor: null,
        expected_snapshot_id: extracted.value.expected_snapshot_id || sourceInput.expected_snapshot_id || null,
      };
      let registered;
      try { registered = await registry.register(registration, { dirty_worktree: false }); }
      catch (_error) { return rejected("source_registry_failed", { route }); }
      if (!registered || registered.ok !== true) {
        const reason = registered && registered.reason === "revision_replay_conflict"
          ? "source_revision_content_mismatch" : registered && registered.reason || "source_registry_failed";
        return rejected(reason, { route, replayed: false });
      }
      const snapshot = registered.value && registered.value.snapshot;
      if (!snapshot) return rejected("source_snapshot_required", { route });
      if (registered.value.replayed && trim(snapshot.source && snapshot.source.content_hash) !== source.content_hash) {
        return rejected("source_revision_content_mismatch", { route, replayed: false });
      }
      inputs.set(source.source_id, typeof input === "string" ? input : sourceRegistryRecords.get(input));

      if (!allowedKnowledge) {
        revisions.set(revisionKey, { status: "routed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash });
        const state = denied ? "source_denied" : "routed";
        return success({ route, state, replayed: Boolean(registered.value.replayed), snapshot_id: snapshot.snapshot_id, receipt: receiptFor(source, route, state, snapshot.snapshot_id, 0) });
      }
      if (!forceAnalysis && registered.value.replayed && (!existing || ["completed", "routed"].includes(existing.status))) {
        revisions.set(revisionKey, { status: "completed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash });
        return success({ route, state: "completed", replayed: true, snapshot_id: snapshot.snapshot_id, receipt: receiptFor(source, route, "completed", snapshot.snapshot_id, 0) });
      }

      for (const [key, prior] of revisions) {
        if (key !== revisionKey && key.startsWith(`${source.source_id}\u0000`) && prior.status === "running") cancel(source.source_id);
      }
      const runGeneration = generation(source.source_id);
      let chunkRequest = null;
      if (chunkOrchestrator) {
        if (typeof createScope !== "function") return rejected("analysis_scope_unavailable", { route });
        const scope = createScope({ source_id: source.source_id, source_path: source.source_path, content_hash: source.content_hash, source_text: sourceInput.source_text });
        const authority = scopeApi.createAnalysisRequestAuthority();
        chunkRequest = { authority, request: authority.begin(scope) };
        chunkRequests.set(source.source_id, chunkRequest);
      }
      revisions.set(revisionKey, { status: "running", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash });
      emit({ type: "analysis_queued", source_id: source.source_id, modified_revision: source.modified_revision, snapshot_id: snapshot.snapshot_id });
      let analysis;
      try {
        analysis = chunkOrchestrator
          ? await chunkOrchestrator.analyze({
            source_id: source.source_id, source_path: source.source_path, content_hash: source.content_hash,
            snapshot, extracted_text: sourceInput.source_text, authority: chunkRequest.authority, request: chunkRequest.request,
            signal: context.signal, force: forceAnalysis,
            provider: (work) => transport(freeze({ ...work, route, modified_revision: source.modified_revision, content_hash: source.content_hash, policy: standing.value, signal: context.signal })),
          })
          : await transport(freeze({
            route,
            source_id: source.source_id,
            modified_revision: source.modified_revision,
            content_hash: source.content_hash,
            snapshot,
            extracted_text: standing.value.policy.redaction_policy === "selected_source_text_only"
              ? trim(extracted.value.extracted_text || extractedContent.text) : "",
            policy: standing.value,
            signal: context.signal,
          }));
      } catch (_error) {
        if (generation(source.source_id) !== runGeneration) return success({ route, state: "cancelled", replayed: false, snapshot_id: snapshot.snapshot_id, receipt: receiptFor(source, route, "cancelled", snapshot.snapshot_id, 0) });
        revisions.set(revisionKey, { status: "failed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash });
        return rejected("analysis_failed", { route, snapshot_id: snapshot.snapshot_id });
      }
      if (generation(source.source_id) !== runGeneration || revisions.get(revisionKey).status === "cancelled") {
        return success({ route, state: "cancelled", replayed: false, snapshot_id: snapshot.snapshot_id, receipt: receiptFor(source, route, "cancelled", snapshot.snapshot_id, 0) });
      }
      if (typeof registry.isCurrentSnapshot === "function" && !registry.isCurrentSnapshot(source.source_id, snapshot.snapshot_id)) {
        revisions.set(revisionKey, { status: "failed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash, reason: "stale_source_revision" });
        return rejected("stale_source_revision", { route, snapshot_id: snapshot.snapshot_id });
      }
      if (!analysis || analysis.ok !== true) {
        const reason = analysis && analysis.reason || "analysis_failed";
        revisions.set(revisionKey, { status: "failed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash, reason });
        return rejected(reason, { route, snapshot_id: snapshot.snapshot_id, message: trim(analysis && analysis.message) });
      }
      if (chunkOrchestrator && (!analysis.coverage || analysis.coverage.complete !== true || analysis.coverage.durable !== true || analysis.coverage.exactCoverage !== true)) {
        revisions.set(revisionKey, { status: "failed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash, reason: "incomplete_coverage" });
        return rejected("incomplete_coverage", { route, snapshot_id: snapshot.snapshot_id });
      }
      revisions.set(revisionKey, { status: "completed", snapshot_id: snapshot.snapshot_id, content_hash: source.content_hash });
      if (chunkRequests.get(source.source_id) === chunkRequest) chunkRequests.delete(source.source_id);
      emit({ type: "analysis_completed", source_id: source.source_id, modified_revision: source.modified_revision, snapshot_id: snapshot.snapshot_id });
      return success({ route, state: "completed", replayed: false, analysis_runs: 1, snapshot_id: snapshot.snapshot_id, analysis: chunkOrchestrator ? analysis : undefined, receipt: receiptFor(source, route, "completed", snapshot.snapshot_id, 1) });
    }

    function resume(inputOrSourceId, context = {}) {
      const stored = typeof inputOrSourceId === "string" ? inputs.get(trim(inputOrSourceId)) : null;
      return dispatch(stored || inputOrSourceId, context);
    }

    return freeze({ standingPolicy: standing.value, subscribe, dispatch, cancel, resume });
  }

  const api = freeze({ ROUTES, DEFAULT_MAX_SOURCE_BYTES, createInboxAutopilot });
  root.LLMWikiInboxAutopilot = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
