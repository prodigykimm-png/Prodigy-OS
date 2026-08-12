(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const lineageApi = root.LLMWikiSourceLineage || (typeof require === "function" ? require("./llmwiki-source-lineage.js") : null);
  const queryApi = root.LLMWikiQueryReadOnly || (typeof require === "function" ? require("./llmwiki-query-readonly.js") : null);
  const providerApi = root.LLMWikiProviderContract || (typeof require === "function" ? require("./llmwiki-provider-contract.js") : null);
  const bundleApi = root.LLMWikiProposalBundle || (typeof require === "function" ? require("./llmwiki-proposal-bundle.js") : null);

  const PIPELINE_VERSION = "llmwiki_librarian_pipeline_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const contexts = new Map();

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
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
  function sha256(value) {
    if (!crypto) throw new Error("crypto unavailable");
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason, extras = {}) {
    return freeze({ ok: false, field, reason, writer_count: 0, ...(plain(extras) ? extras : {}) });
  }
  function counters(capture = 0) {
    return freeze({ canonical: 0, candidate: 0, index: 0, memory: 0, feedback: 0, git: 0, validation_workspace: 0, capture });
  }
  function phase(name, status, reason) {
    return freeze({ phase: name, status, ...(reason ? { reason } : {}) });
  }
  function manifestId(manifest) {
    return `${manifest.source_id}/revision_${String(manifest.refresh_revision).padStart(6, "0")}_${manifest.content_hash.slice(0, 16)}`;
  }
  function sourceFailure(field, reason, phases) {
    return fail(field, reason, { phase_statuses: phases, write_counters: counters() });
  }
  function validateRunId(input) {
    const runId = trim(input && input.run_id);
    return ID.test(runId) ? runId : fail("run_id", "invalid_run_id");
  }
  function list(value) { return Array.isArray(value) ? value : []; }

  function selectedSources(input, runId) {
    const phases = [phase("ingest", "running")];
    if (!Array.isArray(input.sources) || input.sources.length === 0) return sourceFailure("sources", "source_required", phases);
    const normalized = [];
    for (const [index, source] of input.sources.entries()) {
      if (!plain(source) || !plain(source.manifest)) return sourceFailure(`sources.${index}`, "malformed_source", phases);
      if (trim(source.manifest.status) === "stale") return sourceFailure(`sources.${index}.status`, "source_stale", phases);
      const manifestResult = lineageApi.validateSourceManifest(source.manifest);
      if (manifestResult.ok === false) return sourceFailure(manifestResult.field, manifestResult.reason, phases);
      const manifest = manifestResult.value;
      if (manifest.status === "quarantined") return sourceFailure(`sources.${index}.status`, "source_quarantined", phases);
      if (manifest.status === "stale") return sourceFailure(`sources.${index}.status`, "source_stale", phases);
      const locator = manifest.locators[0];
      normalized.push(freeze({
        manifest,
        lineage_id: manifest.manifest_id || manifestId(manifest),
        locator,
        outbound_text: trim(source.outbound_text || source.manifest.extracted_text),
        selected: source.selected !== false,
        sensitivity: trim(source.sensitivity || "internal"),
        confidence: trim(source.confidence || "explicit"),
      }));
    }
    const context = freeze({
      context_id: `validation_context_${runId}`,
      logical_scope: "run_scoped",
      persistence: "none",
      source_lineage_manifest_ids: normalized.map((source) => source.lineage_id),
    });
    return ok({ sources: normalized, validation_context: context, phase_statuses: [phase("ingest", "completed")] });
  }

  function providerSources(sources) {
    return sources.map((source) => ({
      source_id: source.manifest.source_id,
      content_hash: source.manifest.content_hash,
      source_url: source.manifest.source_url,
      locator: source.locator,
      sensitivity: source.sensitivity,
      confidence: source.confidence,
      selected: source.selected,
      outbound_text: source.outbound_text,
    }));
  }

  function buildProviderRequest(input, selected, retrieval) {
    const provider = plain(input.provider) ? input.provider : {};
    return {
      feature: "llmwiki",
      provider_mode: trim(provider.mode || provider.provider_mode || "direct"),
      timeout_ms: Number(provider.timeout_ms || 5000),
      retry_owner: trim(provider.retry_owner || "prodigy"),
      request_metadata: plain(provider.request_metadata) ? provider.request_metadata : { request_id: `request_${input.run_id}` },
      source_scope: input.source_scope,
      outbound_policy: plain(input.outbound_policy) ? input.outbound_policy : {
        include_source_text: true,
        include_unselected_vault_data: false,
        include_credentials: false,
        include_cookies: false,
      },
      sources: providerSources(selected.sources),
      proposal_request: {
        run_id: input.run_id,
        validation_context: selected.validation_context,
        instruction: trim(input.proposal_request && input.proposal_request.instruction),
        retrieval_envelope_hash: retrieval.envelope_hash,
      },
    };
  }

  function lintBundle(bundle) {
    const conflicts = [];
    const abstentions = [];
    const uncertainty = [];
    for (const proposal of bundle.proposals) {
      for (const conflict of list(proposal.conflicts)) conflicts.push(conflict);
      if (proposal.kind === "abstain") abstentions.push({ proposal_id: proposal.proposal_id, reason: proposal.abstention_reason });
      if (proposal.confidence === "low") uncertainty.push({ proposal_id: proposal.proposal_id, confidence: "low" });
    }
    return freeze({ conflicts, abstentions, uncertainty });
  }

  function envelope(input, selected, retrieval, providerResult, captureResult, phaseStatuses) {
    const bundle = providerResult.value.proposal_envelope;
    const lint = lintBundle(bundle);
    const captureCount = captureResult && captureResult.value && captureResult.value.captured ? 1 : 0;
    const value = {
      pipeline_version: PIPELINE_VERSION,
      run_id: input.run_id,
      phase: "proposal_bundle",
      status: "completed",
      phase_statuses: phaseStatuses,
      selected_source_lineage_ids: selected.sources.map((source) => source.lineage_id),
      selected_source_ids: selected.sources.map((source) => source.manifest.source_id),
      retrieval_envelope: retrieval,
      proposal_bundle: bundle,
      provider_metadata: providerResult.value.provider_metadata,
      trust_state: providerResult.value.trust_state,
      approval_state: providerResult.value.approval_state,
      conflicts: lint.conflicts,
      abstentions: lint.abstentions,
      uncertainty: lint.uncertainty,
      capture: captureResult ? captureResult.value : { captured: false, reason: "capture_not_requested" },
      write_counters: counters(captureCount),
    };
    return ok({ ...value, envelope_hash: sha256(stable(value)) });
  }

  async function runLibrarian(input, options = {}) {
    if (!plain(input)) return fail("run", "malformed_run");
    const runId = validateRunId(input);
    if (runId.ok === false) return runId;
    input = { ...input, run_id: runId };
    const selected = selectedSources(input, runId);
    if (selected.ok === false) return selected;
    let phaseStatuses = [...selected.value.phase_statuses, phase("analyze", "running")];
    const providerProfile = providerApi.selectProviderProfile(buildProviderRequest(input, selected.value, {}), options);
    if (providerProfile.ok === false) return fail(providerProfile.field, providerProfile.reason, { phase_statuses: phaseStatuses, write_counters: counters() });
    phaseStatuses = [phase("ingest", "completed"), phase("analyze", "completed"), phase("retrieve_read", "running")];
    const retrieval = queryApi.queryRead(input.retrieval);
    if (retrieval.ok === false) return fail(retrieval.field, retrieval.reason, { phase_statuses: phaseStatuses, write_counters: counters() });
    if (retrieval.value.status === "stale_snapshot") return fail("retrieval.snapshot", "stale_snapshot", { phase_statuses: phaseStatuses, write_counters: counters() });
    phaseStatuses = [phase("ingest", "completed"), phase("analyze", "completed"), phase("retrieve_read", "completed"), phase("generate", "running")];
    const providerRequest = buildProviderRequest(input, selected.value, retrieval.value);
    const providerInvoker = typeof options.providerInvoker === "function" ? options.providerInvoker : providerApi.invokeProposalProvider;
    const providerResult = await providerInvoker(providerRequest, options);
    if (providerResult.ok === false) return fail(providerResult.field, providerResult.reason, { phase_statuses: phaseStatuses, write_counters: counters(), provider_mode: providerResult.provider_mode, fallback_attempted: providerResult.fallback_attempted });
    phaseStatuses = [
      phase("ingest", "completed"),
      phase("analyze", "completed"),
      phase("retrieve_read", "completed"),
      phase("generate", "completed"),
      phase("deduplicate_merge", "completed"),
      phase("conflict_lint", "completed"),
      phase("proposal_bundle", "completed"),
    ];
    const captureResult = bundleApi.captureProposalBundle(providerResult.value.proposal_envelope, {
      capture_requested: input.capture_requested === true,
      target: trim(input.capture_target),
      writer: options.captureWriter,
    });
    if (captureResult.ok === false) return fail(captureResult.field, captureResult.reason, { phase_statuses: phaseStatuses, write_counters: counters() });
    const result = envelope(input, selected.value, retrieval.value, providerResult, captureResult, phaseStatuses);
    contexts.set(runId, freeze({ validation_context: selected.value.validation_context, bundle_hash: providerResult.value.proposal_envelope.bundle_hash }));
    return result;
  }

  function inspectValidationContext(runId) {
    return ok(contexts.get(trim(runId)) || null);
  }
  function dropValidationContext(runId) {
    contexts.delete(trim(runId));
    return ok({ dropped: true, run_id: trim(runId), write_counters: counters() });
  }

  const api = freeze({ PIPELINE_VERSION, runLibrarian, inspectValidationContext, dropValidationContext });
  root.LLMWikiLibrarianPipeline = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
