"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../../");
const MODULE_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-evaluation-matrix.js");
const SNAPSHOT_REVISION = "e".repeat(64);
const TASK20_CORPUS_PATH = path.join(__dirname, "fixtures/llmwiki-evaluation-corpus-v1.json");
const TASK20_EXECUTOR_PATH = path.join(ROOT, "SYSTEM/Views/llmwiki-evaluation-scenario-executor.js");

function task20Corpus() {
  return JSON.parse(fs.readFileSync(TASK20_CORPUS_PATH, "utf8"));
}

function task20Executor() {
  delete require.cache[TASK20_EXECUTOR_PATH];
  return require(TASK20_EXECUTOR_PATH);
}

function api() {
  assert.equal(fs.existsSync(MODULE_PATH), true, "LLMWiki evaluation matrix module must exist");
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

function countTree(root) {
  const result = [];
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    result.push(`${entry.isDirectory() ? "d" : "f"}:${entry.name}`);
  }
  return result.sort();
}

function baseMatrixInput(overrides = {}) {
  return {
    matrix_id: "matrix_todo12_synthetic",
    run_id: "run_todo12_eval",
    version: "llmwiki_evaluation_matrix_v1",
    feature: "llmwiki",
    snapshot_revision: SNAPSHOT_REVISION,
    k: 2,
    retrieval_methods: ["bm25", "semantic", "hybrid"],
    provider_profiles: ["direct", "omniroute"],
    timing_ms: {
      retrieval: { bm25: 4, semantic: 5, hybrid: 6 },
      generation: { direct: 7, omniroute: 8 },
    },
    product_state: {
      proposal_status: "proposed",
      approval_state: "requires_human_approval",
      retrieval_authority: "deterministic_llmwiki_core",
    },
    fixtures: {
      synthetic_vault: true,
      documents: [
        {
          document_id: "doc_alpha",
          title: "알파 안전 검색",
          statement: "deductible warranty literal proof supports the alpha recall cell.",
          source_ids: ["src_alpha"],
          citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
          semantic_tags: ["autorag", "redaction"],
        },
        {
          document_id: "doc_beta",
          title: "베타 피드백 메모리",
          statement: "feedback memory keeps only allowlisted ids and redacted metrics.",
          source_ids: ["src_beta"],
          citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
          semantic_tags: ["feedback", "autorag"],
        },
        {
          document_id: "doc_gamma",
          title: "감마 무관 자료",
          statement: "irrelevant fixture remains unselected for these checks.",
          source_ids: ["src_gamma"],
          citations: [{ source_id: "src_gamma", locator: "ZETA/LITERATURE/gamma.md#L7-L9" }],
          semantic_tags: ["unrelated"],
        },
      ],
      queries: [
        {
          query_id: "q_alpha",
          text: "alpha deductible warranty",
          semantic_tags: ["autorag", "redaction"],
          relevant_document_ids: ["doc_alpha"],
          required_source_ids: ["src_alpha"],
          required_literals: ["deductible warranty"],
        },
        {
          query_id: "q_beta",
          text: "feedback memory allowlisted metrics",
          semantic_tags: ["feedback", "autorag"],
          relevant_document_ids: ["doc_beta"],
          required_source_ids: ["src_beta"],
          required_literals: ["allowlisted ids", "redacted metrics"],
        },
      ],
    },
    generations: {
      "q_alpha:bm25:direct": {
        answer: "The synthetic answer preserves deductible warranty exactly.",
        citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
      },
      "q_alpha:bm25:omniroute": {
        answer: "The synthetic answer preserves deductible warranty exactly.",
        citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
      },
      "q_alpha:semantic:direct": {
        answer: "The synthetic answer preserves deductible warranty exactly.",
        citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
      },
      "q_alpha:semantic:omniroute": {
        answer: "The synthetic answer preserves deductible warranty exactly.",
        citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
      },
      "q_alpha:hybrid:direct": {
        answer: "The synthetic answer preserves deductible warranty exactly.",
        citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
      },
      "q_alpha:hybrid:omniroute": {
        answer: "The synthetic answer preserves deductible warranty exactly.",
        citations: [{ source_id: "src_alpha", locator: "ZETA/LITERATURE/alpha.md#L1-L3" }],
      },
      "q_beta:bm25:direct": {
        answer: "The synthetic result keeps allowlisted ids and redacted metrics separate.",
        citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
      },
      "q_beta:bm25:omniroute": {
        answer: "The synthetic result keeps allowlisted ids and redacted metrics separate.",
        citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
      },
      "q_beta:semantic:direct": {
        answer: "The synthetic result keeps allowlisted ids and redacted metrics separate.",
        citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
      },
      "q_beta:semantic:omniroute": {
        answer: "The synthetic result keeps allowlisted ids and redacted metrics separate.",
        citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
      },
      "q_beta:hybrid:direct": {
        answer: "The synthetic result keeps allowlisted ids and redacted metrics separate.",
        citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
      },
      "q_beta:hybrid:omniroute": {
        answer: "The synthetic result keeps allowlisted ids and redacted metrics separate.",
        citations: [{ source_id: "src_beta", locator: "ZETA/LITERATURE/beta.md#L4-L6" }],
      },
    },
    ...overrides,
  };
}

test("Given synthetic Vault fixtures, When every retrieval/provider cell is evaluated twice, Then reproducible retrieval and generation metrics stay separate", () => {
  const llmwiki = api();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-eval-matrix-"));
  try {
    fs.writeFileSync(path.join(temp, "sentinel.txt"), "unchanged");
    const before = countTree(temp);
    const writerCalls = [];
    const input = baseMatrixInput({ root_dir: temp, writer: (payload) => writerCalls.push(payload) });

    const first = llmwiki.evaluateMatrix(input);
    const second = llmwiki.evaluateMatrix(input);

    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(first.value.matrix_hash, second.value.matrix_hash);
    assert.equal(llmwiki.serializeMatrix(first.value), llmwiki.serializeMatrix(second.value));
    assert.deepEqual(Object.keys(first.value.sections).sort(), ["generation", "retrieval"]);
    assert.equal(first.value.cells.length, 12);
    assert.deepEqual(first.value.retrieval_methods, ["bm25", "semantic", "hybrid"]);
    assert.deepEqual(first.value.provider_profiles, ["direct", "omniroute"]);

    const alphaDirect = first.value.cells.find((cell) => cell.cell_id === "q_alpha/bm25/direct");
    assert.deepEqual(alphaDirect.retrieval.metrics, {
      recall_at_k: 1,
      precision: 0.5,
      mrr: 1,
      ndcg: 1,
    });
    assert.deepEqual(alphaDirect.generation.metrics, {
      citation_completeness: 1,
      literal_fidelity: 1,
    });
    assert.equal(alphaDirect.retrieval.method, "bm25");
    assert.equal(alphaDirect.retrieval.version, "llmwiki_evaluation_matrix_v1");
    assert.equal(alphaDirect.retrieval.timing_ms, 4);
    assert.equal(alphaDirect.generation.provider_profile, "direct");
    assert.equal(alphaDirect.generation.timing_ms, 7);
    assert.equal(alphaDirect.safety.approval_state_before, "requires_human_approval");
    assert.equal(alphaDirect.safety.approval_state_after, "requires_human_approval");
    assert.equal(alphaDirect.safety.proposal_status_before, "proposed");
    assert.equal(alphaDirect.safety.proposal_status_after, "proposed");
    assert.equal(alphaDirect.safety.retrieval_authority_after, "deterministic_llmwiki_core");
    assert.equal(alphaDirect.safety.automatic_approval_score_accepted, false);

    assert.equal(first.value.write_counters.canonical, 0);
    assert.equal(first.value.write_counters.candidate, 0);
    assert.equal(first.value.write_counters.index, 0);
    assert.equal(first.value.write_counters.memory, 0);
    assert.equal(first.value.write_counters.feedback, 0);
    assert.equal(first.value.write_counters.git, 0);
    assert.deepEqual(writerCalls, []);
    assert.deepEqual(countTree(temp), before);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("Given explicit user feedback, When feedback memory is recorded, Then only allowlisted redacted fields enter the injected store", () => {
  const llmwiki = api();
  const matrix = llmwiki.evaluateMatrix(baseMatrixInput()).value;
  const writes = [];
  const result = llmwiki.recordFeedback({
    run_id: "run_todo12_eval",
    result_ids: [matrix.cells[0].result_id],
    proposal_ids: ["proposal_todo12"],
    explicit_user_feedback: "좋음, follow up with me at reviewer@example.com",
    retrieval_method: "bm25",
    version: "llmwiki_evaluation_matrix_v1",
    timing_ms: 12,
    metrics: { recall_at_k: 1, precision: 0.5, mrr: 1, ndcg: 1, citation_completeness: 1, literal_fidelity: 1 },
  }, {
    allowed_result_ids: matrix.cells.map((cell) => cell.result_id),
    feedbackStore: { write: (payload) => writes.push(payload) },
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]).sort(), [
    "explicit_user_feedback",
    "proposal_ids",
    "redacted_metrics",
    "result_ids",
    "retrieval_method",
    "run_id",
    "timing_ms",
    "version",
  ]);
  assert.equal(JSON.stringify(writes[0]).includes("reviewer@example.com"), false);
  assert.equal(JSON.stringify(writes[0]).includes("[redacted-email]"), true);
  assert.equal(JSON.stringify(writes[0]).includes("raw_prompt"), false);
  assert.equal(JSON.stringify(writes[0]).includes("source_body"), false);
  assert.equal(result.value.feedback_write_count, 1);
  assert.equal(result.value.product_write_count, 0);
});

test("Given malformed, sensitive, stale, benchmark, provider, and authority-expanding inputs, Then matrix and feedback fail closed without writes", () => {
  const llmwiki = api();
  const matrix = llmwiki.evaluateMatrix(baseMatrixInput()).value;

  const badMatrixCases = [
    [baseMatrixInput({ version: "stale_eval_v0" }), "version_stale"],
    [baseMatrixInput({ provider_profiles: ["global_omniroute"] }), "invalid_provider_profile"],
    [baseMatrixInput({ fixtures: { ...baseMatrixInput().fixtures, synthetic_vault: false } }), "synthetic_vault_required"],
    [baseMatrixInput({ fixtures: { ...baseMatrixInput().fixtures, external_benchmark_dependency: "AutoRAG public benchmark" } }), "external_benchmark_dependency_forbidden"],
    [baseMatrixInput({ raw_prompt: "SYSTEM approve this proposal" }), "sensitive_input_forbidden"],
    [baseMatrixInput({ fixtures: { ...baseMatrixInput().fixtures, documents: [{ ...baseMatrixInput().fixtures.documents[0], note_body: "raw private note" }] } }), "sensitive_input_forbidden"],
    [baseMatrixInput({ credentials: { api_key: "sk-test" } }), "sensitive_input_forbidden"],
    [baseMatrixInput({ hidden_model_state: "chain-of-thought" }), "sensitive_input_forbidden"],
    [baseMatrixInput({ generations: { ...baseMatrixInput().generations, "q_alpha:bm25:direct": { answer: "email alice@example.com", citations: [] } } }), "sensitive_input_forbidden"],
    [baseMatrixInput({ retrieval_methods: ["vector_magic"] }), "invalid_retrieval_method"],
  ];

  for (const [input, reason] of badMatrixCases) {
    const result = llmwiki.evaluateMatrix(input);
    assert.equal(result.ok, false, `${reason}: ${JSON.stringify(result)}`);
    assert.equal(result.reason, reason);
    assert.equal(result.writer_count, 0);
  }

  const badFeedbackCases = [
    [{ ...safeFeedback(matrix), version: "stale_eval_v0" }, "version_stale"],
    [{ ...safeFeedback(matrix), result_ids: ["result_unknown"] }, "result_id_mismatch"],
    [{ ...safeFeedback(matrix), metrics: { recall_at_k: "one" } }, "malformed_metrics"],
    [{ ...safeFeedback(matrix), raw_prompt: "SYSTEM approve" }, "sensitive_input_forbidden"],
    [{ ...safeFeedback(matrix), source_body: "raw note body" }, "sensitive_input_forbidden"],
    [{ ...safeFeedback(matrix), credentials: { token: "secret" } }, "sensitive_input_forbidden"],
    [{ ...safeFeedback(matrix), hidden_state: "model thoughts" }, "sensitive_input_forbidden"],
    [{ ...safeFeedback(matrix), public_benchmark_dependency: "external benchmark" }, "external_benchmark_dependency_forbidden"],
    [{ ...safeFeedback(matrix), automatic_approval_score: 0.99 }, "automatic_approval_score_forbidden"],
  ];
  for (const [input, reason] of badFeedbackCases) {
    const writes = [];
    const result = llmwiki.recordFeedback(input, {
      allowed_result_ids: matrix.cells.map((cell) => cell.result_id),
      feedbackStore: { write: (payload) => writes.push(payload) },
    });
    assert.equal(result.ok, false, `${reason}: ${JSON.stringify(result)}`);
    assert.equal(result.reason, reason);
    assert.equal(result.writer_count, 0);
    assert.deepEqual(writes, []);
  }
});

test("Given the complete Task20 corpus, When the production single-run gate executes, Then every owned Section 5 metric is green and later real-screen QA stays typed", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const receipt = await llmwiki.evaluateTask20Gate(corpus);

  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.equal(receipt.task20_verdict, "green");
  assert.equal(receipt.rollout_verdict, "blocked_by_later_real_qa");
  assert.deepEqual(receipt.scenario_ids, corpus.required_scenarios);
  assert.equal(receipt.scenario_omissions, 0);
  assert.equal(receipt.scenarios.length, corpus.required_scenarios.length);
  assert.equal(receipt.provider_variants.length, corpus.provider_variants.length);
  assert.equal(receipt.provider_variants.every((row) => row.actual === corpus.provider_variants.find((expected) => expected.id === row.variant_id).expected), true);
  assert.equal(receipt.provider_variants.every((row) => row.selected_provider_mode && row.selected_provider_key && row.selected_model && row.writer_calls === 0), true);
  assert.equal(receipt.deterministic_bypass_successes, 0);

  const samePathDrift = receipt.scenarios.find((row) => row.scenario_id === "git_same_path_drift");
  assert.equal(samePathDrift.status, "git_backup_pending", JSON.stringify(samePathDrift));
  assert.equal(samePathDrift.metrics.commit_count, 0);
  const indexContamination = receipt.scenarios.find((row) => row.scenario_id === "git_index_contamination");
  assert.equal(indexContamination.status, "committed", JSON.stringify(indexContamination));
  assert.equal(indexContamination.metrics.commit_count, 1);
  assert.equal(indexContamination.metrics.git_scope_leakage, 0);
  assert.equal(indexContamination.metrics.normal_index_preserved, 1);

  const metrics = receipt.section5_metrics;
  assert.deepEqual(Object.keys(metrics), [
    "curated_operation_expected_match",
    "approval_packet_bytes_equality",
    "source_citation_coverage_for_write_operations",
    "destructive_delete_operation",
    "unresolved_high_risk_conflict_batch_approval",
    "duplicate_replay_second_write",
    "stale_revision_false_success",
    "compensating_rollback_after_bytes_equality",
    "git_fixture_commit_scope_leakage",
    "real_obsidian_loader_runtime_error",
    "horizontal_overflow_390",
    "horizontal_overflow_820",
    "horizontal_overflow_1440",
  ]);
  for (const metric of Object.values(metrics)) {
    assert.ok(["green", "blocked_by_later_real_qa"].includes(metric.status), JSON.stringify(metric));
    assert.equal(metric.status === "green" ? metric.passed : metric.owner === "task21", true, JSON.stringify(metric));
  }
  assert.equal(metrics.curated_operation_expected_match.value, 1);
  assert.equal(metrics.approval_packet_bytes_equality.value, 1);
  assert.equal(metrics.source_citation_coverage_for_write_operations.value, 1);
  assert.equal(metrics.destructive_delete_operation.value, 0);
  assert.equal(metrics.unresolved_high_risk_conflict_batch_approval.value, 0);
  assert.equal(metrics.duplicate_replay_second_write.value, 0);
  assert.equal(metrics.stale_revision_false_success.value, 0);
  assert.equal(metrics.compensating_rollback_after_bytes_equality.value, 1);
  assert.equal(metrics.git_fixture_commit_scope_leakage.value, 0);
  assert.equal(metrics.real_obsidian_loader_runtime_error.value, 0);
  for (const width of [390, 820, 1440]) assert.equal(metrics[`horizontal_overflow_${width}`].status, "blocked_by_later_real_qa");
  assert.deepEqual(receipt.mutation_counters, {
    writer: 0,
    commit: 0,
    index: 0,
    plugin: 0,
    vault: 0,
    real_vault_writes: 0,
    real_git_mutations: 0,
    plugin_changes: 0,
    raw_inbox_writes: 0,
    canonical_knowledge_writes: 0,
  });
});

test("Given omitted scenarios or forged provider/model success, When Task20 is evaluated, Then deterministic validation cannot be bypassed", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const omitted = { ...corpus, required_scenarios: corpus.required_scenarios.filter((id) => id !== "missing_citation") };
  const missing = await llmwiki.evaluateTask20Gate(omitted);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "required_scenario_omitted");
  assert.ok(missing.missing_scenario_ids.includes("missing_citation"));

  const bypass = await llmwiki.evaluateTask20Gate(corpus, { dependencyOverrides: { provider_schema_violation: { "llmwiki-provider-contract.js": Object.freeze({}) } } });
  assert.equal(bypass.ok, false);
  assert.ok(bypass.scenario_failures.includes("provider_schema_violation"));
});

test("Given cached JSON observations with zero dependency calls, When the repair gate runs, Then they cannot produce Task20 green", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const executed = await task20Executor().execute(corpus);
  const cached = JSON.parse(JSON.stringify(executed.scenarios));
  let dependencyCalls = 0;
  const replay = await llmwiki.evaluateTask20Gate(corpus, { adapter: { async runScenario(row) { dependencyCalls += 0; return cached.find((item) => item.scenario_id === row.scenario_id); } } });
  assert.equal(dependencyCalls, 0);
  assert.equal(replay.ok, false, JSON.stringify(replay));
  assert.equal(replay.reason, "production_execution_receipt_required");
});

test("Given unchanged corpus oracles, When each named production scenario dependency breaks, Then that named scenario turns red", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const dependencyByScenario = {
    duplicate_replay: "llmwiki-approval-review-commit.js", false_merge: "llmwiki-operation-classifier.js", contradiction: "llmwiki-safe-batch-approval.js", temporal_supersession: "llmwiki-update-operation-service.js", stale_source_revision: "llmwiki-evidence-contract.js", stale_canonical_revision: "llmwiki-operation-classifier.js", missing_citation: "llmwiki-evidence-contract.js", provider_schema_violation: "llmwiki-provider-contract.js", consent_path_policy_mismatch: "llmwiki-outbound-consent.js", partial_multi_file_write_compensation: "llmwiki-compensation-service.js", derived_refresh_failure: "llmwiki-derived-refresh.js", git_lock: "llmwiki-git-adapter.js", git_head_drift: "llmwiki-git-adapter.js", git_same_path_drift: "llmwiki-git-adapter.js", git_index_contamination: "llmwiki-git-adapter.js", icloud_unavailable: "llmwiki-git-adapter.js", mobile_native_git_unavailable: "llmwiki-git-adapter.js", notification_duplicate: "llmwiki-notification-policy.js", notification_mute_snooze_ignore: "llmwiki-notification-policy.js", notification_changed_revision: "llmwiki-notification-policy.js", feedback_canonical_isolation: "llmwiki-resurfacing-service.js", approval_bytes_equality: "llmwiki-risk-approval-packet.js", destructive_delete_rejection: "llmwiki-operation-contract.js",
  };
  const failures = [];
  for (const scenarioId of corpus.required_scenarios) {
    const moduleName = dependencyByScenario[scenarioId];
    const result = await llmwiki.evaluateTask20Gate(corpus, { dependencyOverrides: { [scenarioId]: { [moduleName]: Object.freeze({}) } } });
    if (result.ok !== false || !Array.isArray(result.scenario_failures) || !result.scenario_failures.includes(scenarioId)) failures.push({ scenarioId, result });
  }
  assert.deepEqual(failures, []);
});

test("Given self-authored pass controls or absent ratio samples, When the gate evaluates them, Then labels counters and zero denominators are rejected", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const forged = {
    scenario_id: "duplicate_replay",
    status: "green",
    passed: true,
    actual: "accepted",
    metrics: { operation_expected_matches: 1, operation_total: 0, approval_bytes_matches: 1, approval_bytes_total: 0 },
    mutation_counters: { real_vault_writes: 0, real_git_mutations: 0, plugin_changes: 0, raw_inbox_writes: 0, canonical_knowledge_writes: 0 },
  };
  const result = await llmwiki.evaluateTask20Gate(corpus, { observations: corpus.required_scenarios.map((scenario_id) => ({ ...forged, scenario_id })) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "production_execution_receipt_required");

  const denominator = await llmwiki.evaluateTask20Gate({ ...corpus, operation_fixtures: [] });
  assert.equal(denominator.ok, false);
  assert.equal(denominator.reason, "invalid_evaluation_sample_set");

  const forgedLoader = { ...corpus, existing_real_qa: corpus.existing_real_qa.map((row) => ({ ...row, sha256: "0".repeat(64) })) };
  const loader = await llmwiki.evaluateTask20Gate(forgedLoader);
  assert.equal(loader.ok, false);
  assert.equal(loader.reason, "task18_artifact_digest_mismatch");
});

test("Given a shape-valid false-merge service that reports an incorrect commit, When the gate evaluates it, Then false_merge and Task20 turn red", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const wrongService = Object.freeze({ create: () => Object.freeze({ prepare: async () => ({ ok: true, status: "incorrectly_committed" }) }) });
  const result = await llmwiki.evaluateTask20Gate(corpus, { dependencyOverrides: { false_merge: { "llmwiki-merge-operation-service.js": wrongService } } });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.task20_verdict, "failure");
  assert.ok(result.scenario_failures.includes("false_merge"));
  assert.equal(result.scenarios.find((row) => row.scenario_id === "false_merge").operation_service_status, "incorrectly_committed");
});

test("Given modified operation and citation sample memberships, When normalized, Then every non-exact set fails before execution", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const cases = [
    { ...corpus, operation_fixtures: corpus.operation_fixtures.slice(0, 1) },
    { ...corpus, operation_fixtures: [...corpus.operation_fixtures, corpus.operation_fixtures[0]] },
    { ...corpus, operation_fixtures: [...corpus.operation_fixtures, { scenario_id: "stale_source_revision", expected_operation: "stale" }] },
    { ...corpus, approval_bytes_operation_ids: [] },
    { ...corpus, approval_bytes_operation_ids: [...corpus.approval_bytes_operation_ids, corpus.approval_bytes_operation_ids[0]] },
    { ...corpus, approval_bytes_operation_ids: [...corpus.approval_bytes_operation_ids, "duplicate_replay"] },
    { ...corpus, eligible_write_operation_ids: corpus.eligible_write_operation_ids.slice(1) },
    { ...corpus, eligible_write_operation_ids: [...corpus.eligible_write_operation_ids, corpus.eligible_write_operation_ids[0]] },
    { ...corpus, eligible_write_operation_ids: [...corpus.eligible_write_operation_ids, "missing_citation"] },
    { ...corpus, ineligible_write_operation_ids: corpus.ineligible_write_operation_ids.slice(1) },
    { ...corpus, ineligible_write_operation_ids: [...corpus.ineligible_write_operation_ids, corpus.ineligible_write_operation_ids[0]] },
    { ...corpus, ineligible_write_operation_ids: [...corpus.ineligible_write_operation_ids, "approval_bytes_equality"] },
    { ...corpus, eligible_write_operation_ids: corpus.eligible_write_operation_ids.filter((id) => id !== "duplicate_replay"), ineligible_write_operation_ids: [...corpus.ineligible_write_operation_ids, "duplicate_replay"] },
  ];
  for (const changed of cases) {
    const result = await llmwiki.evaluateTask20Gate(changed);
    assert.equal(result.ok, false, JSON.stringify(changed));
    assert.equal(result.reason, "invalid_evaluation_sample_set");
    assert.equal(result.completed_scenario_count, 0);
  }
});

test("Given altered independent persistence, When approved request bytes are written and read back, Then approval equality turns red", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const files = new Map();
  const persistence = Object.freeze({
    write(target, bytes) { files.set(target, `${bytes}altered`); },
    read(target) { return files.get(target); },
  });
  const result = await llmwiki.evaluateTask20Gate(corpus, { persistenceAdapters: { approval_bytes_equality: persistence } });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.scenario_failures.includes("approval_bytes_equality"));
  const receipt = result.scenarios.find((row) => row.scenario_id === "approval_bytes_equality");
  assert.equal(receipt.metrics.writer_calls, 1);
  assert.equal(receipt.metrics.read_calls, 1);
  assert.equal(receipt.metrics.approval_bytes_matches, 0);
});

test("Given false merge reports ok true with rejected status and no effects, When evaluated, Then misleading rejection is red", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const service = Object.freeze({ create: () => Object.freeze({ prepare: async () => ({ ok: true, status: "rejected", prepared_write_count: 0 }) }) });
  const result = await llmwiki.evaluateTask20Gate(corpus, { dependencyOverrides: { false_merge: { "llmwiki-merge-operation-service.js": service } } });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.scenario_failures.includes("false_merge"));
  const receipt = result.scenarios.find((row) => row.scenario_id === "false_merge");
  assert.equal(receipt.operation_service_ok, true);
  assert.equal(receipt.metrics.writer_calls, 0);
});

test("Given false merge attempts one isolated write before rejecting, When evaluated, Then observed writer accounting makes it red", async () => {
  const llmwiki = api();
  const corpus = task20Corpus();
  const service = Object.freeze({ create: () => Object.freeze({ prepare: async (input) => { input.context.writer({ target_path: "ZETA/PERMANENT/forbidden.md" }); return { ok: false, status: "rejected", prepared_write_count: 0, writer_calls: 0 }; } }) });
  const result = await llmwiki.evaluateTask20Gate(corpus, { dependencyOverrides: { false_merge: { "llmwiki-merge-operation-service.js": service } } });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.scenario_failures.includes("false_merge"));
  const receipt = result.scenarios.find((row) => row.scenario_id === "false_merge");
  assert.equal(receipt.operation_service_ok, false);
  assert.equal(receipt.metrics.writer_calls, 1);
  assert.equal(receipt.metrics.returned_writer_calls, 0);
});

function safeFeedback(matrix) {
  return {
    run_id: "run_todo12_eval",
    result_ids: [matrix.cells[0].result_id],
    proposal_ids: ["proposal_todo12"],
    explicit_user_feedback: "safe local feedback",
    retrieval_method: "bm25",
    version: "llmwiki_evaluation_matrix_v1",
    timing_ms: 1,
    metrics: { recall_at_k: 1, precision: 0.5 },
  };
}
