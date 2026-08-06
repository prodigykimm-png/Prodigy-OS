(function (root) {
  "use strict";

  const crypto = typeof require === "function" ? require("node:crypto") : null;

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
  const METRIC_KEYS = Object.freeze(["recall_at_k", "precision", "mrr", "ndcg", "citation_completeness", "literal_fidelity"]);

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
  function serializeMatrix(value) { return stable(value); }

  const api = freeze({
    EVALUATION_VERSION,
    RETRIEVAL_METHODS,
    PROVIDER_PROFILES,
    evaluateMatrix,
    recordFeedback,
    sanitizeFeedbackMemory,
    serializeMatrix,
  });
  root.LLMWikiEvaluationMatrix = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
