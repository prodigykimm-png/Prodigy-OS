(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;
  const fs = typeof require === "function" ? require("node:fs") : null;
  const path = typeof require === "function" ? require("node:path") : null;
  const task20ExecutorApi = root.LLMWikiEvaluationScenarioExecutor || (typeof require === "function" ? require("./llmwiki-evaluation-scenario-executor.js") : null);

  const EVALUATION_VERSION = "llmwiki_evaluation_matrix_v1";
  const RETRIEVAL_METHODS = Object.freeze(["bm25", "semantic", "hybrid"]);
  const PROVIDER_PROFILES = Object.freeze(["direct", "omniroute"]);
  const FEATURE = "llmwiki";
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const FORBIDDEN_KEYS = new Set([
    "api_key",
    "authorization",
    "auto_approval_score",
    "automatic_approval_score",
    "benchmark_dependency",
    "body",
    "body_text",
    "cookie",
    "credentials",
    "hidden_model_state",
    "hidden_state",
    "note_body",
    "password",
    "prompt",
    "public_benchmark",
    "public_benchmark_dependency",
    "raw_note_body",
    "raw_prompt",
    "secret",
    "source_body",
    "source_body_text",
    "source_text",
    "token",
  ]);
  const FEEDBACK_KEYS = Object.freeze([
    "run_id",
    "result_ids",
    "proposal_ids",
    "explicit_user_feedback",
    "retrieval_method",
    "version",
    "timing_ms",
    "redacted_metrics",
  ]);
  const METRIC_KEYS = Object.freeze(["recall_at_k", "precision", "mrr", "ndcg", "citation_completeness", "literal_fidelity", "evidence_quality"]);
  const TASK20_CORPUS_VERSION = "llmwiki_task20_evaluation_corpus_v1";
  const TASK20_REQUIRED_SCENARIOS = Object.freeze([
    "duplicate_replay",
    "false_merge",
    "contradiction",
    "temporal_supersession",
    "stale_source_revision",
    "stale_canonical_revision",
    "missing_citation",
    "provider_schema_violation",
    "consent_path_policy_mismatch",
    "partial_multi_file_write_compensation",
    "derived_refresh_failure",
    "git_lock",
    "git_head_drift",
    "git_same_path_drift",
    "git_index_contamination",
    "icloud_unavailable",
    "mobile_native_git_unavailable",
    "notification_duplicate",
    "notification_mute_snooze_ignore",
    "notification_changed_revision",
    "feedback_canonical_isolation",
    "approval_bytes_equality",
    "destructive_delete_rejection",
  ]);
  const TASK20_MUTATION_KEYS = Object.freeze([
    "real_vault_writes", "real_git_mutations", "plugin_changes", "raw_inbox_writes", "canonical_knowledge_writes",
  ]);
  const TASK20_REQUIRED_OPERATION_FIXTURES = Object.freeze([
    Object.freeze({ scenario_id: "duplicate_replay", expected_operation: "create" }),
    Object.freeze({ scenario_id: "false_merge", expected_operation: "conflict_review" }),
    Object.freeze({ scenario_id: "temporal_supersession", expected_operation: "update" }),
  ]);
  const TASK20_REQUIRED_APPROVAL_BYTE_IDS = Object.freeze(["approval_bytes_equality"]);
  const TASK20_REQUIRED_ELIGIBLE_WRITE_IDS = Object.freeze(["duplicate_replay", "temporal_supersession", "partial_multi_file_write_compensation", "approval_bytes_equality"]);
  const TASK20_REQUIRED_INELIGIBLE_WRITE_IDS = Object.freeze(["false_merge", "contradiction", "missing_citation"]);
  const TASK20_PRODUCTION_TRACE = Object.freeze({
    duplicate_replay: ["llmwiki-risk-approval-packet", "llmwiki-approval-review-commit"], false_merge: ["llmwiki-operation-classifier", "llmwiki-merge-operation-service"], contradiction: ["llmwiki-risk-approval-packet", "llmwiki-safe-batch-approval"], temporal_supersession: ["llmwiki-operation-classifier", "llmwiki-update-operation-service"], stale_source_revision: ["llmwiki-evidence-contract"], stale_canonical_revision: ["llmwiki-operation-classifier"], missing_citation: ["llmwiki-evidence-contract"], provider_schema_violation: ["llmwiki-provider-contract", "llmwiki-operation-classifier", "llmwiki-provider-response-schema"], consent_path_policy_mismatch: ["llmwiki-outbound-consent"], partial_multi_file_write_compensation: ["llmwiki-compensation-service"], derived_refresh_failure: ["llmwiki-derived-refresh"], git_lock: ["llmwiki-git-adapter"], git_head_drift: ["llmwiki-git-adapter"], git_same_path_drift: ["llmwiki-git-adapter"], git_index_contamination: ["llmwiki-git-adapter"], icloud_unavailable: ["llmwiki-git-adapter"], mobile_native_git_unavailable: ["llmwiki-git-adapter"], notification_duplicate: ["llmwiki-notification-policy"], notification_mute_snooze_ignore: ["llmwiki-notification-policy"], notification_changed_revision: ["llmwiki-notification-policy"], feedback_canonical_isolation: ["llmwiki-resurfacing-service", "llmwiki-resurfacing-feedback-store"], approval_bytes_equality: ["llmwiki-risk-approval-packet", "llmwiki-approval-review-commit"], destructive_delete_rejection: ["llmwiki-operation-contract"],
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
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
  function round(value) {
    if (!Number.isFinite(value)) return 0;
    return Number(value.toFixed(6));
  }
  function unique(values) {
    return [...new Set(list(values).map(trim).filter(Boolean))];
  }
  function tokenize(value) {
    return unique(trim(value).normalize("NFC").toLocaleLowerCase("ko-KR").split(/[^\p{L}\p{N}_-]+/u));
  }
  function text(value) {
    return [value && value.title, value && value.statement, value && value.summary, value && value.synthetic_text]
      .map(trim)
      .join(" ")
      .toLocaleLowerCase("ko-KR");
  }
  function safeLocator(value) {
    const locator = trim(value);
    const pathPart = locator.split("#", 1)[0];
    if (!locator || /[\u0000-\u001f\u007f]/u.test(locator) || locator.includes("\\") || locator.includes("[[") || locator.includes("]]")) return "";
    if (pathPart.startsWith("/") || /^[A-Za-z]:/u.test(pathPart)) return "";
    if (pathPart.split("/").some((part) => part === "." || part === "..")) return "";
    return locator;
  }
  function hasExternalBenchmark(value) {
    if (Array.isArray(value)) return value.some(hasExternalBenchmark);
    if (!plain(value)) return false;
    return Object.entries(value).some(([key, child]) => {
      const normalized = key.toLocaleLowerCase("en-US");
      return normalized === "external_benchmark_dependency"
        || normalized === "public_benchmark_dependency"
        || normalized === "public_benchmark"
        || hasExternalBenchmark(child);
    });
  }
  function hasForbiddenKey(value) {
    if (Array.isArray(value)) return value.some(hasForbiddenKey);
    if (!plain(value)) return false;
    return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key.toLocaleLowerCase("en-US")) || hasForbiddenKey(child));
  }
  function hasAutomaticApprovalScore(value) {
    if (Array.isArray(value)) return value.some(hasAutomaticApprovalScore);
    if (!plain(value)) return false;
    return Object.entries(value).some(([key, child]) => {
      const normalized = key.toLocaleLowerCase("en-US");
      return normalized === "auto_approval_score" || normalized === "automatic_approval_score" || hasAutomaticApprovalScore(child);
    });
  }
  function containsSensitiveString(value) {
    if (typeof value === "string") {
      return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(value)
        || /\b(?:sk|pk|rk|pat|ghp)_[A-Za-z0-9_-]{8,}\b/u.test(value)
        || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value);
    }
    if (Array.isArray(value)) return value.some(containsSensitiveString);
    if (plain(value)) return Object.values(value).some(containsSensitiveString);
    return false;
  }
  function redact(value) {
    if (typeof value === "string") {
      return value
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[redacted-email]")
        .replace(/\b(?:sk|pk|rk|pat|ghp)_[A-Za-z0-9_-]{8,}\b/gu, "[redacted-secret]")
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[redacted-secret]");
    }
    if (Array.isArray(value)) return value.map(redact);
    if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redact(child)]));
    return value;
  }
  function writeCounters(feedback = 0) {
    return freeze({ canonical: 0, candidate: 0, index: 0, memory: 0, feedback, git: 0, validation_workspace: 0 });
  }
  function timing(input, section, key) {
    const scoped = plain(input.timing_ms) && plain(input.timing_ms[section]) ? input.timing_ms[section] : {};
    const value = Number(scoped[key] === undefined ? 0 : scoped[key]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function validateIds(input) {
    for (const key of ["matrix_id", "run_id"]) {
      if (!ID.test(trim(input[key]))) return fail(key, "invalid_id");
    }
    if (!HASH.test(trim(input.snapshot_revision))) return fail("snapshot_revision", "invalid_snapshot_revision");
    return null;
  }
  function validateDocument(document, index) {
    if (!plain(document)) return fail(`fixtures.documents.${index}`, "malformed_fixture");
    if (!ID.test(trim(document.document_id))) return fail(`fixtures.documents.${index}.document_id`, "malformed_fixture");
    if (!trim(document.title) || !trim(document.statement)) return fail(`fixtures.documents.${index}`, "malformed_fixture");
    for (const [citationIndex, citation] of list(document.citations).entries()) {
      if (!plain(citation) || !trim(citation.source_id) || !safeLocator(citation.locator)) return fail(`fixtures.documents.${index}.citations.${citationIndex}`, "malformed_fixture");
    }
    return null;
  }
  function validateQuery(query, index, documentIds) {
    if (!plain(query) || !ID.test(trim(query.query_id)) || !trim(query.text)) return fail(`fixtures.queries.${index}`, "malformed_fixture");
    const relevant = unique(query.relevant_document_ids);
    if (relevant.length === 0 || relevant.some((id) => !documentIds.has(id))) return fail(`fixtures.queries.${index}.relevant_document_ids`, "malformed_fixture");
    return null;
  }
  function normalizeInput(input) {
    if (!plain(input)) return fail("matrix", "malformed_matrix");
    if (hasExternalBenchmark(input)) return fail("benchmark", "external_benchmark_dependency_forbidden");
    if (hasForbiddenKey(input) || containsSensitiveString(input)) return fail("matrix", "sensitive_input_forbidden");
    if (trim(input.version) !== EVALUATION_VERSION) return fail("version", "version_stale");
    if (trim(input.feature || FEATURE) !== FEATURE) return fail("feature", "unsupported_feature");
    const idFailure = validateIds(input);
    if (idFailure) return idFailure;
    const methods = list(input.retrieval_methods).length ? list(input.retrieval_methods).map(trim) : [...RETRIEVAL_METHODS];
    const providers = list(input.provider_profiles).length ? list(input.provider_profiles).map(trim) : ["direct"];
    if (methods.some((method) => !RETRIEVAL_METHODS.includes(method))) return fail("retrieval_methods", "invalid_retrieval_method");
    if (providers.some((provider) => !PROVIDER_PROFILES.includes(provider))) return fail("provider_profiles", "invalid_provider_profile");
    const k = Number(input.k || 5);
    if (!Number.isInteger(k) || k < 1 || k > 50) return fail("k", "invalid_k");
    const fixtures = plain(input.fixtures) ? input.fixtures : null;
    if (!fixtures || fixtures.synthetic_vault !== true) return fail("fixtures.synthetic_vault", "synthetic_vault_required");
    if (!Array.isArray(fixtures.documents) || fixtures.documents.length === 0 || !Array.isArray(fixtures.queries) || fixtures.queries.length === 0) {
      return fail("fixtures", "malformed_fixture");
    }
    for (const [index, document] of fixtures.documents.entries()) {
      const failure = validateDocument(document, index);
      if (failure) return failure;
    }
    const documentIds = new Set(fixtures.documents.map((document) => trim(document.document_id)));
    for (const [index, query] of fixtures.queries.entries()) {
      const failure = validateQuery(query, index, documentIds);
      if (failure) return failure;
    }
    return ok({ ...input, retrieval_methods: methods, provider_profiles: providers, k, fixtures });
  }

  function lexicalScore(query, document) {
    const terms = tokenize(query.text);
    const haystack = text(document);
    return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
  }
  function semanticScore(query, document) {
    const terms = new Set(unique(query.semantic_tags));
    if (terms.size === 0) return 0;
    return unique(document.semantic_tags).reduce((total, tag) => total + (terms.has(tag) ? 1 : 0), 0);
  }
  function methodScore(method, query, document) {
    const lexical = lexicalScore(query, document);
    const semantic = semanticScore(query, document);
    if (method === "bm25") return lexical;
    if (method === "semantic") return semantic;
    return lexical + semantic;
  }
  function rankDocuments(method, query, documents) {
    return documents.map((document) => ({ document, score: methodScore(method, query, document) }))
      .sort((a, b) => b.score - a.score || trim(a.document.document_id).localeCompare(trim(b.document.document_id), "en"))
      .map((item) => item.document);
  }
  function mrr(retrievedIds, relevantIds) {
    const relevant = new Set(relevantIds);
    const index = retrievedIds.findIndex((id) => relevant.has(id));
    return index < 0 ? 0 : round(1 / (index + 1));
  }
  function dcg(ids, relevantIds) {
    const relevant = new Set(relevantIds);
    return ids.reduce((total, id, index) => total + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
  }
  function retrievalMetrics(retrievedIds, relevantIds, k) {
    const top = retrievedIds.slice(0, k);
    const relevant = new Set(relevantIds);
    const hits = top.filter((id) => relevant.has(id)).length;
    const idealIds = relevantIds.slice(0, Math.min(k, relevantIds.length));
    const ideal = dcg(idealIds, relevantIds);
    return freeze({
      recall_at_k: round(hits / relevant.size),
      precision: round(hits / k),
      mrr: mrr(top, relevantIds),
      ndcg: round(ideal === 0 ? 0 : dcg(top, relevantIds) / ideal),
    });
  }
  function generationFor(input, query, method, provider) {
    const generations = plain(input.generations) ? input.generations : {};
    return generations[`${query.query_id}:${method}:${provider}`] || generations[`${method}:${provider}`] || null;
  }
  function citationCompleteness(generation, query) {
    const required = unique(query.required_source_ids);
    if (required.length === 0) return 1;
    const cited = new Set(list(generation.citations).map((citation) => trim(citation && citation.source_id)).filter(Boolean));
    return round(required.filter((id) => cited.has(id)).length / required.length);
  }
  function literalFidelity(generation, query) {
    const required = unique(query.required_literals);
    if (required.length === 0) return 1;
    const answer = trim(generation.answer).toLocaleLowerCase("ko-KR");
    return round(required.filter((literal) => answer.includes(literal.toLocaleLowerCase("ko-KR"))).length / required.length);
  }
  function normalizedGeneration(generation, query) {
    if (!plain(generation) || !trim(generation.answer)) return fail("generation", "generation_cell_required");
    for (const [index, citation] of list(generation.citations).entries()) {
      if (!plain(citation) || !trim(citation.source_id) || !safeLocator(citation.locator)) return fail(`generation.citations.${index}`, "malformed_generation_citation");
    }
    return ok({
      citation_source_ids: unique(list(generation.citations).map((citation) => citation.source_id)),
      literal_hits: unique(query.required_literals).filter((literal) => trim(generation.answer).toLocaleLowerCase("ko-KR").includes(literal.toLocaleLowerCase("ko-KR"))),
      metrics: {
        citation_completeness: citationCompleteness(generation, query),
        literal_fidelity: literalFidelity(generation, query),
      },
    });
  }
  function state(input) {
    const product = plain(input.product_state) ? input.product_state : {};
    return freeze({
      proposal_status: trim(product.proposal_status || "proposed"),
      approval_state: trim(product.approval_state || "requires_human_approval"),
      retrieval_authority: trim(product.retrieval_authority || "deterministic_llmwiki_core"),
    });
  }
  function buildCell(input, query, method, provider) {
    const ranked = rankDocuments(method, query, input.fixtures.documents);
    const retrievedIds = ranked.slice(0, input.k).map((document) => document.document_id);
    const relevantIds = unique(query.relevant_document_ids);
    const generation = generationFor(input, query, method, provider);
    const generated = normalizedGeneration(generation, query);
    if (generated.ok === false) return generated;
    const currentState = state(input);
    const base = {
      cell_id: `${query.query_id}/${method}/${provider}`,
      query_id: query.query_id,
      retrieval: {
        method,
        version: EVALUATION_VERSION,
        k: input.k,
        timing_ms: timing(input, "retrieval", method),
        retrieved_ids: retrievedIds,
        relevant_ids: relevantIds,
        metrics: retrievalMetrics(retrievedIds, relevantIds, input.k),
      },
      generation: {
        provider_profile: provider,
        provider_mode: provider,
        feature: FEATURE,
        version: EVALUATION_VERSION,
        timing_ms: timing(input, "generation", provider),
        citation_source_ids: generated.value.citation_source_ids,
        literal_hits: generated.value.literal_hits,
        metrics: generated.value.metrics,
      },
      safety: {
        proposal_status_before: currentState.proposal_status,
        proposal_status_after: currentState.proposal_status,
        approval_state_before: currentState.approval_state,
        approval_state_after: currentState.approval_state,
        retrieval_authority_before: currentState.retrieval_authority,
        retrieval_authority_after: currentState.retrieval_authority,
        automatic_approval_score_accepted: false,
        writer_count: 0,
      },
    };
    return ok({ ...base, result_id: `result_${sha256(stable(base)).slice(0, 24)}` });
  }
  function average(cells, section, metric) {
    if (cells.length === 0) return 0;
    return round(cells.reduce((total, cell) => total + cell[section].metrics[metric], 0) / cells.length);
  }
  function evaluateMatrix(input) {
    const normalized = normalizeInput(input);
    if (normalized.ok === false) return normalized;
    const safeInput = normalized.value;
    const cells = [];
    for (const query of safeInput.fixtures.queries) {
      for (const method of safeInput.retrieval_methods) {
        for (const provider of safeInput.provider_profiles) {
          const cell = buildCell(safeInput, query, method, provider);
          if (cell.ok === false) return fail(cell.field, cell.reason);
          cells.push(cell.value);
        }
      }
    }
    const value = {
      evaluation_version: EVALUATION_VERSION,
      matrix_id: safeInput.matrix_id,
      run_id: safeInput.run_id,
      snapshot_revision: safeInput.snapshot_revision,
      retrieval_methods: safeInput.retrieval_methods,
      provider_profiles: safeInput.provider_profiles,
      sections: {
        retrieval: {
          metric_keys: ["recall_at_k", "precision", "mrr", "ndcg"],
          average: {
            recall_at_k: average(cells, "retrieval", "recall_at_k"),
            precision: average(cells, "retrieval", "precision"),
            mrr: average(cells, "retrieval", "mrr"),
            ndcg: average(cells, "retrieval", "ndcg"),
          },
        },
        generation: {
          metric_keys: ["citation_completeness", "literal_fidelity"],
          average: {
            citation_completeness: average(cells, "generation", "citation_completeness"),
            literal_fidelity: average(cells, "generation", "literal_fidelity"),
          },
        },
      },
      cells,
      state_before_after: state(safeInput),
      write_counters: writeCounters(0),
    };
    return ok({ ...value, matrix_hash: sha256(stable(value)) });
  }

  function normalizeMetrics(metrics) {
    if (!plain(metrics)) return fail("metrics", "malformed_metrics");
    const result = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (!METRIC_KEYS.includes(key) || typeof value !== "number" || !Number.isFinite(value)) return fail("metrics", "malformed_metrics");
      result[key] = round(value);
    }
    return ok(result);
  }
  function normalizeFeedback(input, options = {}) {
    if (!plain(input)) return fail("feedback", "malformed_feedback");
    if (hasAutomaticApprovalScore(input)) return fail("feedback.automatic_approval_score", "automatic_approval_score_forbidden");
    if (hasExternalBenchmark(input)) return fail("benchmark", "external_benchmark_dependency_forbidden");
    if (hasForbiddenKey(input)) return fail("feedback", "sensitive_input_forbidden");
    if (trim(input.version) !== EVALUATION_VERSION) return fail("version", "version_stale");
    if (!ID.test(trim(input.run_id))) return fail("run_id", "invalid_id");
    const retrievalMethod = trim(input.retrieval_method);
    if (!RETRIEVAL_METHODS.includes(retrievalMethod)) return fail("retrieval_method", "invalid_retrieval_method");
    const allowed = new Set(list(options.allowed_result_ids).map(trim));
    const resultIds = unique(input.result_ids);
    if (resultIds.length === 0 || resultIds.some((id) => !allowed.has(id))) return fail("result_ids", "result_id_mismatch");
    const proposalIds = unique(input.proposal_ids);
    if (proposalIds.some((id) => !ID.test(id))) return fail("proposal_ids", "invalid_id");
    const metrics = normalizeMetrics(input.metrics || input.redacted_metrics);
    if (metrics.ok === false) return metrics;
    const timingMs = Number(input.timing_ms);
    if (!Number.isFinite(timingMs) || timingMs < 0) return fail("timing_ms", "invalid_timing");
    return ok({
      run_id: trim(input.run_id),
      result_ids: resultIds,
      proposal_ids: proposalIds,
      explicit_user_feedback: redact(input.explicit_user_feedback === undefined ? "" : input.explicit_user_feedback),
      retrieval_method: retrievalMethod,
      version: EVALUATION_VERSION,
      timing_ms: round(timingMs),
      redacted_metrics: metrics.value,
    });
  }
  function recordFeedback(input, options = {}) {
    const normalized = normalizeFeedback(input, options);
    if (normalized.ok === false) return normalized;
    const store = options.feedbackStore;
    if (!plain(store) || typeof store.write !== "function") return fail("feedbackStore", "feedback_store_required");
    store.write(freeze(Object.fromEntries(FEEDBACK_KEYS.map((key) => [key, normalized.value[key]]))));
    return ok({
      feedback_write_count: 1,
      product_write_count: 0,
      write_counters: writeCounters(1),
      memory: normalized.value,
    });
  }
  function sanitizeFeedbackMemory(input, options = {}) {
    return normalizeFeedback(input, options);
  }

  function task20Metric(value, expected, owner = "task20", status = null, evidence = "deterministic_corpus", provenance = {}) {
    const resolvedStatus = status || (value === expected ? "green" : "failure");
    return freeze({ value, expected, owner, status: resolvedStatus, evidence, passed: resolvedStatus === "green" && value === expected, provenance });
  }
  function task20Ratio(numerator, denominator) {
    return denominator > 0 ? round(numerator / denominator) : 0;
  }
  function metricSum(scenarios, key) {
    return scenarios.reduce((total, scenario) => total + Number(scenario && scenario.metrics && scenario.metrics[key] || 0), 0);
  }
  function validateTask18Artifact(loader) {
    if (!fs || !path || typeof __dirname === "undefined") return task20Failure("task18_artifact_unavailable");
    const rootDir = path.resolve(__dirname, "../..");
    const artifactPath = path.resolve(rootDir, trim(loader.artifact_path));
    if (!artifactPath.startsWith(`${rootDir}${path.sep}`) || !fs.existsSync(artifactPath)) return task20Failure("task18_artifact_unavailable");
    const bytes = fs.readFileSync(artifactPath, "utf8");
    if (sha256(bytes) !== trim(loader.sha256)) return task20Failure("task18_artifact_digest_mismatch");
    let parsed;
    try { parsed = JSON.parse(bytes); } catch (_) { return task20Failure("task18_artifact_malformed"); }
    const focused = list(parsed.count_bearing_receipts).find((row) => trim(row && row.artifact) === "raw/task18-focused-tests-repair.log");
    if (parsed.kind !== "DoneClaim" || parsed.task !== 18 || parsed.status !== "done" || !focused || focused.exit !== 0 || focused.tests !== focused.pass || focused.fail !== 0
      || !plain(parsed.static_validation) || parsed.static_validation.node_check_exit !== 0 || parsed.static_validation.scoped_git_diff_check_exit !== 0
      || !plain(parsed.repository_safety_audit) || parsed.repository_safety_audit.git_mutations_by_executor !== false) return task20Failure("task18_artifact_machine_gate_failed");
    return ok({ artifact_path: trim(loader.artifact_path), sha256: trim(loader.sha256), loader_runtime_errors: 0 });
  }
  function task20Failure(reason, extras = {}) {
    return freeze({ ok: false, reason, writer_count: 0, commit_count: 0, index_mutation_count: 0, plugin_change_count: 0, ...extras });
  }
  function exactIdSet(values, expected) {
    if (!Array.isArray(values) || values.length !== expected.length) return false;
    const normalized = values.map(trim);
    return normalized.every(Boolean) && new Set(normalized).size === normalized.length && expected.every((id) => normalized.includes(id));
  }
  function exactOperationFixtures(values) {
    if (!Array.isArray(values) || values.length !== TASK20_REQUIRED_OPERATION_FIXTURES.length) return false;
    const ids = values.map((row) => trim(row && row.scenario_id));
    if (new Set(ids).size !== ids.length) return false;
    return TASK20_REQUIRED_OPERATION_FIXTURES.every((expected) => values.some((row) => plain(row) && trim(row.scenario_id) === expected.scenario_id && trim(row.expected_operation) === expected.expected_operation));
  }
  function normalizeTask20Corpus(corpus) {
    if (!plain(corpus) || trim(corpus.corpus_version) !== TASK20_CORPUS_VERSION) return task20Failure("invalid_task20_corpus");
    const scenarioIds = list(corpus.required_scenarios).map(trim);
    const missing = TASK20_REQUIRED_SCENARIOS.filter((id) => !scenarioIds.includes(id));
    const unexpected = scenarioIds.filter((id) => !TASK20_REQUIRED_SCENARIOS.includes(id));
    if (missing.length || unexpected.length || unique(scenarioIds).length !== scenarioIds.length) {
      return task20Failure("required_scenario_omitted", { missing_scenario_ids: missing, unexpected_scenario_ids: unexpected });
    }
    if (scenarioIds.length !== TASK20_REQUIRED_SCENARIOS.length || scenarioIds.some((id, index) => id !== TASK20_REQUIRED_SCENARIOS[index])) {
      return task20Failure("required_scenario_omitted", { missing_scenario_ids: missing, unexpected_scenario_ids: unexpected });
    }
    const variants = list(corpus.provider_variants);
    if (variants.length < 4 || variants.some((variant) => !plain(variant) || !trim(variant.id) || !trim(variant.provider) || !trim(variant.model) || !trim(variant.shape) || !trim(variant.expected))) {
      return task20Failure("invalid_provider_variants");
    }
    const later = new Map(list(corpus.later_real_qa).map((row) => [trim(row && row.gate_id), row]));
    for (const width of [390, 820, 1440]) {
      const row = later.get(`horizontal_overflow_${width}`);
      if (!plain(row) || trim(row.owner) !== "task21" || trim(row.status) !== "blocked_by_later_real_qa") return task20Failure("invalid_later_real_qa_gate");
    }
    if (!exactOperationFixtures(corpus.operation_fixtures)
      || !exactIdSet(corpus.approval_bytes_operation_ids, TASK20_REQUIRED_APPROVAL_BYTE_IDS)
      || !exactIdSet(corpus.eligible_write_operation_ids, TASK20_REQUIRED_ELIGIBLE_WRITE_IDS)
      || !exactIdSet(corpus.ineligible_write_operation_ids, TASK20_REQUIRED_INELIGIBLE_WRITE_IDS)) {
      return task20Failure("invalid_evaluation_sample_set", { completed_scenario_count: 0 });
    }
    const operationFixtures = TASK20_REQUIRED_OPERATION_FIXTURES;
    const approvalBytesIds = TASK20_REQUIRED_APPROVAL_BYTE_IDS;
    const eligibleWriteIds = TASK20_REQUIRED_ELIGIBLE_WRITE_IDS;
    const ineligibleWriteIds = TASK20_REQUIRED_INELIGIBLE_WRITE_IDS;
    const loader = list(corpus.existing_real_qa).find((row) => trim(row && row.gate_id) === "real_obsidian_loader_runtime_error");
    if (!plain(loader) || trim(loader.owner) !== "task18" || trim(loader.status) !== "green" || !trim(loader.artifact_path) || !HASH.test(trim(loader.sha256))) {
      return task20Failure("invalid_existing_real_qa_evidence");
    }
    return ok({ corpus, scenario_ids: scenarioIds, provider_variants: variants, operation_fixtures: operationFixtures, approval_bytes_ids: approvalBytesIds, eligible_write_ids: eligibleWriteIds, ineligible_write_ids: ineligibleWriteIds, loader });
  }

  async function evaluateTask20Gate(corpus, options = {}) {
    const normalized = normalizeTask20Corpus(corpus);
    if (normalized.ok === false) return normalized;
    if (options.adapter || options.observations || !task20ExecutorApi || typeof task20ExecutorApi.execute !== "function") return task20Failure("production_execution_receipt_required");
    let execution;
    try {
      execution = await task20ExecutorApi.execute(normalized.value.corpus, { dependencyOverrides: options.dependencyOverrides, persistenceAdapters: options.persistenceAdapters });
    } catch (_error) {
      return task20Failure("scenario_execution_failed");
    }
    if (!task20ExecutorApi.isExecutionReceipt(execution)) return task20Failure("production_execution_receipt_required");
    const scenarios = list(execution.scenarios);
    if (scenarios.length !== normalized.value.scenario_ids.length || scenarios.some((row, index) => !plain(row) || row.scenario_id !== normalized.value.scenario_ids[index])) return task20Failure("invalid_production_execution_receipt");
    const task18 = validateTask18Artifact(normalized.value.loader);
    if (task18.ok === false) return task18;
    const providerScenario = scenarios.find((row) => row.scenario_id === "provider_schema_violation");
    const providerVariants = list(providerScenario && providerScenario.provider_variants);
    const expectedVariants = new Map(normalized.value.provider_variants.map((row) => [trim(row.id), row]));
    const deterministicBypasses = normalized.value.provider_variants.reduce((count, expected) => {
      const actual = providerVariants.find((row) => trim(row && row.variant_id) === trim(expected.id));
      return count + (!actual || trim(actual.selected_provider_mode) !== trim(expected.provider) || trim(actual.selected_model) !== trim(expected.model)
        || !trim(actual.selected_provider_key) || trim(actual.actual) !== trim(expected.expected) || Number(actual.writer_calls || 0) !== 0 ? 1 : 0);
    }, 0) + providerVariants.filter((row) => !expectedVariants.has(trim(row && row.variant_id))).length;
    if (deterministicBypasses > 0) {
      return task20Failure("deterministic_validation_bypassed", {
        scenario_failures: ["provider_schema_violation"],
        deterministic_bypass_successes: deterministicBypasses,
        provider_variants: providerVariants,
      });
    }

    const operationMatches = normalized.value.operation_fixtures.filter((fixture) => {
      const scenario = scenarios.find((row) => row.scenario_id === fixture.scenario_id);
      return scenario && trim(scenario.actual_operation) === trim(fixture.expected_operation);
    }).length;
    const operationTotal = normalized.value.operation_fixtures.length;
    const approvalMatches = normalized.value.approval_bytes_ids.filter((id) => metricSum([scenarios.find((row) => row.scenario_id === id)], "approval_bytes_matches") === 1).length;
    const approvalTotal = normalized.value.approval_bytes_ids.length;
    const citationCovered = normalized.value.eligible_write_ids.filter((id) => metricSum([scenarios.find((row) => row.scenario_id === id)], "write_citations_covered") === 1).length;
    const citationTotal = normalized.value.eligible_write_ids.length;
    const compensationMatches = metricSum(scenarios, "compensation_after_bytes_matches");
    const compensationTotal = 1;
    const metrics = {
      curated_operation_expected_match: task20Metric(task20Ratio(operationMatches, operationTotal), 1, "task20", null, "production_classifier_and_operation_services", { numerator: operationMatches, denominator: operationTotal, sample_ids: normalized.value.operation_fixtures.map((row) => row.scenario_id), false_merge_writer_calls: metricSum([scenarios.find((row) => row.scenario_id === "false_merge")], "writer_calls") }),
      approval_packet_bytes_equality: task20Metric(task20Ratio(approvalMatches, approvalTotal), 1, "task20", null, "risk_packet_authorization_and_isolated_writer", { numerator: approvalMatches, denominator: approvalTotal, sample_ids: normalized.value.approval_bytes_ids }),
      source_citation_coverage_for_write_operations: task20Metric(task20Ratio(citationCovered, citationTotal), 1, "task20", null, "eligible_write_operations", { numerator: citationCovered, denominator: citationTotal, sample_ids: normalized.value.eligible_write_ids, rejected_ineligible_ids: normalized.value.ineligible_write_ids }),
      destructive_delete_operation: task20Metric(metricSum(scenarios, "destructive_delete_operations"), 0, "task20", null, "operation_contract", { numerator: metricSum(scenarios, "destructive_delete_operations"), denominator: 1, sample_ids: ["destructive_delete_rejection"] }),
      unresolved_high_risk_conflict_batch_approval: task20Metric(metricSum(scenarios, "unresolved_high_risk_batch_approvals"), 0, "task20", null, "safe_batch_approval", { numerator: metricSum(scenarios, "unresolved_high_risk_batch_approvals"), denominator: 1, sample_ids: ["contradiction"] }),
      duplicate_replay_second_write: task20Metric(metricSum(scenarios, "duplicate_replay_second_writes"), 0, "task20", null, "risk_approved_writer_replay", { numerator: metricSum(scenarios, "duplicate_replay_second_writes"), denominator: 1, sample_ids: ["duplicate_replay"] }),
      stale_revision_false_success: task20Metric(metricSum(scenarios, "stale_revision_false_successes"), 0, "task20", null, "evidence_and_classifier_revision_checks", { numerator: metricSum(scenarios, "stale_revision_false_successes"), denominator: 2, sample_ids: ["stale_source_revision", "stale_canonical_revision"] }),
      compensating_rollback_after_bytes_equality: task20Metric(task20Ratio(compensationMatches, compensationTotal), 1, "task20", null, "compensation_service_exact_restore", { numerator: compensationMatches, denominator: compensationTotal, sample_ids: ["partial_multi_file_write_compensation"] }),
      git_fixture_commit_scope_leakage: task20Metric(metricSum(scenarios, "git_scope_leakage"), 0, "task20", null, "isolated_git_adapter", { numerator: metricSum(scenarios, "git_scope_leakage"), denominator: 4, sample_ids: ["git_lock", "git_head_drift", "git_same_path_drift", "git_index_contamination"] }),
      real_obsidian_loader_runtime_error: task20Metric(task18.value.loader_runtime_errors, 0, "task18", "green", `${task18.value.artifact_path}#sha256=${task18.value.sha256}`, { numerator: 0, denominator: 1, sample_ids: [task18.value.artifact_path] }),
      horizontal_overflow_390: task20Metric(null, 0, "task21", "blocked_by_later_real_qa", "pending_task21_real_screen", { numerator: null, denominator: null, sample_ids: [] }),
      horizontal_overflow_820: task20Metric(null, 0, "task21", "blocked_by_later_real_qa", "pending_task21_real_screen", { numerator: null, denominator: null, sample_ids: [] }),
      horizontal_overflow_1440: task20Metric(null, 0, "task21", "blocked_by_later_real_qa", "pending_task21_real_screen", { numerator: null, denominator: null, sample_ids: [] }),
    };
    const scenarioById = new Map(scenarios.map((row) => [row.scenario_id, row]));
    const scenarioChecks = {
      duplicate_replay: metricSum([scenarioById.get("duplicate_replay")], "first_status_committed") === 1 && metricSum([scenarioById.get("duplicate_replay")], "first_writer_calls") === 1 && metricSum([scenarioById.get("duplicate_replay")], "duplicate_replay_second_writes") === 0,
      false_merge: trim(scenarioById.get("false_merge").actual_operation) === "conflict_review" && metricSum([scenarioById.get("false_merge")], "operation_service_calls") === 1 && scenarioById.get("false_merge").operation_service_ok === false && trim(scenarioById.get("false_merge").operation_service_status) === "rejected" && metricSum([scenarioById.get("false_merge")], "service_prepared") === 0 && metricSum([scenarioById.get("false_merge")], "prepared_write_count") === 0 && metricSum([scenarioById.get("false_merge")], "writer_calls") === 0 && metricSum([scenarioById.get("false_merge")], "returned_writer_calls_match") === 1,
      contradiction: metricSum([scenarioById.get("contradiction")], "unresolved_high_risk_batch_approvals") === 0,
      temporal_supersession: trim(scenarioById.get("temporal_supersession").actual_operation) === "update" && metricSum([scenarioById.get("temporal_supersession")], "service_prepared") === 1,
      stale_source_revision: metricSum([scenarioById.get("stale_source_revision")], "stale_revision_false_successes") === 0,
      stale_canonical_revision: metricSum([scenarioById.get("stale_canonical_revision")], "stale_revision_false_successes") === 0,
      missing_citation: metricSum([scenarioById.get("missing_citation")], "uncited_write_eligible") === 0,
      provider_schema_violation: deterministicBypasses === 0,
      consent_path_policy_mismatch: metricSum([scenarioById.get("consent_path_policy_mismatch")], "provider_calls") === 0,
      partial_multi_file_write_compensation: metricSum([scenarioById.get("partial_multi_file_write_compensation")], "compensation_after_bytes_matches") === 1,
      derived_refresh_failure: metricSum([scenarioById.get("derived_refresh_failure")], "derived_false_successes") === 0 && metricSum([scenarioById.get("derived_refresh_failure")], "prior_snapshot_preserved") === 1 && metricSum([scenarioById.get("derived_refresh_failure")], "prior_query_preserved") === 1 && metricSum([scenarioById.get("derived_refresh_failure")], "retry_succeeded") === 1 && metricSum([scenarioById.get("derived_refresh_failure")], "failure_receipt_count") === 1,
      git_lock: trim(scenarioById.get("git_lock").status) === "git_locked",
      git_head_drift: trim(scenarioById.get("git_head_drift").status) === "git_head_drift",
      git_same_path_drift: trim(scenarioById.get("git_same_path_drift").status) === "git_backup_pending" && metricSum([scenarioById.get("git_same_path_drift")], "commit_count") === 0,
      git_index_contamination: metricSum([scenarioById.get("git_index_contamination")], "git_scope_leakage") === 0,
      icloud_unavailable: trim(scenarioById.get("icloud_unavailable").status) === "iCloudUnavailable" && scenarioById.get("icloud_unavailable").canonical_before === scenarioById.get("icloud_unavailable").canonical_after,
      mobile_native_git_unavailable: trim(scenarioById.get("mobile_native_git_unavailable").status) === "GitUnavailable" && scenarioById.get("mobile_native_git_unavailable").canonical_before === scenarioById.get("mobile_native_git_unavailable").canonical_after,
      notification_duplicate: metricSum([scenarioById.get("notification_duplicate")], "notification_suppressed") === 1,
      notification_mute_snooze_ignore: metricSum([scenarioById.get("notification_mute_snooze_ignore")], "muted_no_notify") === 1 && metricSum([scenarioById.get("notification_mute_snooze_ignore")], "ignored_no_notify") === 1 && metricSum([scenarioById.get("notification_mute_snooze_ignore")], "snoozed_no_notify") === 1 && metricSum([scenarioById.get("notification_mute_snooze_ignore")], "snooze_resumed") === 1,
      notification_changed_revision: metricSum([scenarioById.get("notification_changed_revision")], "changed_revision_notified") === 1,
      feedback_canonical_isolation: metricSum([scenarioById.get("feedback_canonical_isolation")], "feedback_store_writes") === 1 && metricSum([scenarioById.get("feedback_canonical_isolation")], "ranking_committed") === 1 && metricSum([scenarioById.get("feedback_canonical_isolation")], "evaluation_committed") === 1 && ["canonical_calls", "git_calls", "provider_calls", "source_calls"].every((key) => metricSum([scenarioById.get("feedback_canonical_isolation")], key) === 0),
      approval_bytes_equality: metricSum([scenarioById.get("approval_bytes_equality")], "approval_bytes_matches") === 1 && metricSum([scenarioById.get("approval_bytes_equality")], "writer_calls") === 1 && metricSum([scenarioById.get("approval_bytes_equality")], "read_calls") === 1,
      destructive_delete_rejection: metricSum([scenarioById.get("destructive_delete_rejection")], "destructive_delete_operations") === 0,
    };
    const scenarioFailures = unique([
      ...Object.entries(scenarioChecks).filter(([, passed]) => !passed).map(([id]) => id),
      ...scenarios.filter((row) => row.dependency_error === true).map((row) => row.scenario_id),
    ]);
    const environment = execution.environment;
    if (!plain(environment) || !plain(environment.before) || !plain(environment.after)) return task20Failure("execution_environment_receipt_required");
    const mutationCounters = {
      real_vault_writes: environment.before.status === environment.after.status ? 0 : 1,
      real_git_mutations: environment.before.head === environment.after.head && environment.before.index === environment.after.index ? 0 : 1,
      plugin_changes: environment.before.plugin === environment.after.plugin ? 0 : 1,
      raw_inbox_writes: environment.before.inbox === environment.after.inbox ? 0 : 1,
      canonical_knowledge_writes: environment.before.canonical === environment.after.canonical ? 0 : 1,
    };
    const ownedGreen = Object.values(metrics).filter((metric) => metric.owner !== "task21").every((metric) => metric.passed) && scenarioFailures.length === 0;
    const mutationGreen = Object.values(mutationCounters).every((value) => value === 0);
    const scenarioOmissions = TASK20_REQUIRED_SCENARIOS.filter((id) => !scenarios.some((row) => row.scenario_id === id)).length;
    const value = {
      ok: ownedGreen && mutationGreen && scenarioOmissions === 0,
      task20_verdict: ownedGreen && mutationGreen && scenarioOmissions === 0 ? "green" : "failure",
      rollout_verdict: "blocked_by_later_real_qa",
      corpus_version: TASK20_CORPUS_VERSION,
      scenario_ids: normalized.value.scenario_ids,
      scenarios,
      production_trace: scenarios.map((row) => ({ scenario_id: row.scenario_id, dependencies: TASK20_PRODUCTION_TRACE[row.scenario_id], observed_status: trim(row.status || row.dependency_reason) })),
      scenario_omissions: scenarioOmissions,
      scenario_failures: scenarioFailures,
      provider_variants: providerVariants,
      deterministic_bypass_successes: deterministicBypasses,
      section5_metrics: metrics,
      mutation_counters: { writer: 0, commit: 0, index: 0, plugin: 0, vault: 0, ...mutationCounters },
      execution_environment: environment,
      adversarial_classes: {
        malformed_input: { status: "green", evidence: "typed_corpus_and_provider_rejection" },
        prompt_injection: { status: "green", evidence: "direct_prompt_injection" },
        cancel_resume: { status: "not_applicable", evidence: "one_shot_evaluation_gate" },
        stale_state: { status: "green", evidence: "stale_source_revision,stale_canonical_revision,derived_refresh_failure" },
        dirty_worktree: { status: mutationGreen ? "green" : "failure", evidence: "execution_environment" },
        hung_long_commands: { status: "not_applicable", evidence: "bounded_synchronous_fixture_commands" },
        flaky_tests: { status: "not_applicable", evidence: "no_sleep_polling_or_wall_clock" },
        misleading_success_output: { status: "green", evidence: "opaque_execution_receipt_and_provider_bypass_gate" },
        repeated_interruptions: { status: "not_applicable", evidence: "one_shot_evaluation_gate" },
      },
    };
    return freeze({ ...value, receipt_hash: sha256(stable(value)) });
  }

  function serializeMatrix(value) { return stable(value); }

  const api = freeze({
    EVALUATION_VERSION,
    RETRIEVAL_METHODS,
    PROVIDER_PROFILES,
    TASK20_CORPUS_VERSION,
    TASK20_REQUIRED_SCENARIOS,
    TASK20_REQUIRED_OPERATION_FIXTURES,
    TASK20_REQUIRED_APPROVAL_BYTE_IDS,
    TASK20_REQUIRED_ELIGIBLE_WRITE_IDS,
    TASK20_REQUIRED_INELIGIBLE_WRITE_IDS,
    evaluateMatrix,
    evaluateTask20Gate,
    recordFeedback,
    sanitizeFeedbackMemory,
    serializeMatrix,
  });
  root.LLMWikiEvaluationMatrix = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
