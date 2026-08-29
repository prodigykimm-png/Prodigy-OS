"use strict";

/*
 * Task 2 contract data for the LLM Wiki batch core simplification plan.
 *
 * Machine-readable, behavior-pinning data only:
 *  - one row per historical incident from
 *    .omo/plans/llmwiki-batch-core-simplification.md ("Historical failures
 *    this plan must close", items 1-14),
 *  - the required deterministic counter set,
 *  - the click-bound golden receipt schema invariants,
 *  - the adversarial input classes each invariant must reject.
 *
 * No prose pinning: rows carry machine assertion ids and objective
 * comparisons, never Korean UI copy or prompt wording.
 */

const PLAN_PATH = ".omo/plans/llmwiki-batch-core-simplification.md";

const HISTORICAL_INCIDENTS = Object.freeze([
  Object.freeze({ id: "H01", incident: "controller_selection_tab_subscriber_loss_on_remount", objective_assertion: "remount_preserves_controller_identity_selected_tab_and_exactly_one_subscriber", regression_suite: "test_llmwiki_hub_remount_persistence.js", owning_task: 13 }),
  Object.freeze({ id: "H02", incident: "feature_specific_provider_override_ignoring_global_provider", objective_assertion: "provider_key_equals_defaultProvider_and_set_provider_action_is_action_unavailable", regression_suite: "test_llmwiki_provider_selection.js", owning_task: 4 }),
  Object.freeze({ id: "H03", incident: "missing_credentials_advancing_into_run", objective_assertion: "unconfigured_provider_yields_zero_provider_calls_and_zero_created_runs", regression_suite: "test_llmwiki_unconfigured_provider_preflight.js", owning_task: 4 }),
  Object.freeze({ id: "H04", incident: "invalid_nested_json_schema_failing_before_inference", objective_assertion: "schema_normalization_rejects_invalid_schema_with_named_reason_and_zero_network_calls", regression_suite: "test_llmwiki_batch_provider.js", owning_task: 5 }),
  Object.freeze({ id: "H05", incident: "provider_dialect_schema_normalization_drift", objective_assertion: "same_semantic_schema_normalized_identically_for_json_schema_gemini_and_json_mode", regression_suite: "test_llmwiki_batch_provider.js", owning_task: 5 }),
  Object.freeze({ id: "H06", incident: "model_computed_offsets_aliases_and_automatic_repair_traffic", objective_assertion: "automatic_repairs_counter_is_zero_and_evidence_quotes_anchor_locally", regression_suite: "test_llmwiki_batch_core_golden_receipt.js", owning_task: 5 }),
  Object.freeze({ id: "H07", incident: "independent_provider_selector_and_stale_provider_copy", objective_assertion: "no_second_provider_selector_surface_exists_and_run_identity_is_frozen_at_creation", regression_suite: "test_llmwiki_batch_core_golden_receipt.js", owning_task: 4 }),
  Object.freeze({ id: "H08", incident: "openrouter_quota_rendered_as_antigravity_quota", objective_assertion: "blocked_reason_carries_exact_provider_key_and_model_of_the_failing_call", regression_suite: "test_llmwiki_provider_quota_attribution.js", owning_task: 4 }),
  Object.freeze({ id: "H09", incident: "real_provider_quota_blocking_analysis_despite_valid_credentials", objective_assertion: "quota_failure_keeps_pending_work_zero_writes_and_exposes_only_explicit_recovery_actions", regression_suite: "test_llmwiki_provider_quota_attribution_real_obsidian.js", owning_task: 8 }),
  Object.freeze({ id: "H10", incident: "auto_analysis_on_mount_or_file_events", objective_assertion: "mount_create_modify_restart_produce_zero_provider_calls_and_discovery_only_state_change", regression_suite: "test_llmwiki_batch_core_golden_receipt.js", owning_task: 7 }),
  Object.freeze({ id: "H11", incident: "repeated_per_source_prompt_and_schema_tokens", objective_assertion: "provider_calls_equal_non_empty_cache_miss_pack_count_with_fixed_prompt_bytes_counted_once_per_pack", regression_suite: "test_llmwiki_batch_core_golden_receipt.js", owning_task: 8 }),
  Object.freeze({ id: "H12", incident: "direct_permanent_proposal_routing_from_inbox", objective_assertion: "inbox_roles_map_only_to_lifecycle_proposal_classes_and_permanent_requires_promotion_gate", regression_suite: "test_llmwiki_lifecycle_product.js", owning_task: 9 }),
  Object.freeze({ id: "H13", incident: "ui_evidence_passing_outside_captured_state", objective_assertion: "assertions_read_machine_state_dom_data_attributes_and_counters_not_visual_prose", regression_suite: "test_llmwiki_batch_core_golden_receipt.js", owning_task: 12 }),
  Object.freeze({ id: "H14", incident: "two_provider_paths_inline_hub_orchestration_and_untracked_duplicates", objective_assertion: "one_batch_analyzer_one_provider_request_boundary_and_zero_runtime_duplicate_paths", regression_suite: "test_llmwiki_scope_fidelity.js", owning_task: 14 }),
]);

const REQUIRED_COUNTERS = Object.freeze([
  "provider_calls",
  "pack_count",
  "source_bytes",
  "candidate_context_bytes",
  "fixed_prompt_bytes",
  "cache_hits",
  "cache_misses",
  "canonical_writes",
  "source_writes",
  "audit_writes",
  "git_writes",
  "fallback_attempts",
  "automatic_retries",
  "automatic_repairs",
]);

const ZERO_ON_GOLDEN_PATH = Object.freeze([
  "fallback_attempts",
  "automatic_retries",
  "automatic_repairs",
]);

const GOLDEN_STATE_SEQUENCE = Object.freeze([
  "pending",
  "running",
  "review_ready",
  "approved",
  "committed",
  "processed",
]);

/*
 * Receipt invariants for the single click-bound run. Each invariant names the
 * adversarial classes it rejects.
 */
const GOLDEN_RECEIPT_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "G01",
    invariant: "single_click_creates_single_logical_run_and_duplicate_click_returns_existing_run_id",
    assertion: "second_click_run_id === first_click_run_id && clicks_observed === 2",
    rejects: ["cancel_resume", "flaky_tests"],
  }),
  Object.freeze({
    id: "G02",
    invariant: "run_id_bound_to_sorted_source_revision_hashes_plus_request_key",
    assertion: "batch_id === sha256(sorted(source_revision_hashes) + request_key)",
    rejects: ["stale_state"],
  }),
  Object.freeze({
    id: "G03",
    invariant: "mount_and_file_events_change_pending_state_with_zero_provider_calls",
    assertion: "provider_calls === 0 after mount/create/modify without explicit click",
    rejects: ["misleading_success_output", "flaky_tests"],
  }),
  Object.freeze({
    id: "G04",
    invariant: "proposal_creation_performs_zero_canonical_source_audit_or_git_writes",
    assertion: "canonical_writes === 0 && source_writes === 0 && audit_writes === 0 && git_writes === 0 before approval",
    rejects: ["misleading_success_output"],
  }),
  Object.freeze({
    id: "G05",
    invariant: "processed_state_requires_prior_approval_in_same_bound_run",
    assertion: "processed_path_exists implies approval_event.observed_before === true for the same run_id",
    rejects: ["misleading_success_output", "stale_state"],
  }),
  Object.freeze({
    id: "G06",
    invariant: "source_moves_byte_identically_to_INBOX/Processed/YYYY-MM/",
    assertion: "sha256(processed_bytes) === sha256(original_bytes) && destination matches ^INBOX/Processed/\\d{4}-\\d{2}/",
    rejects: ["malformed_input", "dirty_worktree"],
  }),
  Object.freeze({
    id: "G07",
    invariant: "provider_identity_frozen_for_whole_run",
    assertion: "receipt.provider_key/model/structured_mode/schema_id/prompt_version constant across all pack receipts",
    rejects: ["stale_state", "prompt_injection"],
  }),
  Object.freeze({
    id: "G08",
    invariant: "pack_atomic_failure_persists_none_of_that_packs_results_and_issues_no_second_call",
    assertion: "failed_pack => its chunk results absent locally && provider_calls unchanged by repair attempts",
    rejects: ["malformed_input", "prompt_injection"],
  }),
  Object.freeze({
    id: "G09",
    invariant: "restart_after_unreceipted_pack_yields_outcome_unknown_without_auto_resubmit",
    assertion: "reload marks running-without-receipt outcome_unknown && automatic_retries === 0",
    rejects: ["cancel_resume", "flaky_tests"],
  }),
  Object.freeze({
    id: "G10",
    invariant: "stale_source_hash_before_proposal_creation_suppresses_results",
    assertion: "source hash at proposal time differs from run creation => proposals not created for that source",
    rejects: ["stale_state", "dirty_worktree"],
  }),
  Object.freeze({
    id: "G11",
    invariant: "evidence_quote_is_exact_unique_substring_of_outbound_chunk",
    assertion: "each quote occurs exactly once in its outbound chunk text",
    rejects: ["prompt_injection", "malformed_input"],
  }),
]);

const ADVERSARIAL_CLASSES = Object.freeze([
  Object.freeze({ class_id: "malformed_input", rejected_by: ["G06", "G08", "G11"], rejection_summary: "strict pack-atomic schema validation and local quote anchoring fail closed" }),
  Object.freeze({ class_id: "prompt_injection", rejected_by: ["G07", "G08", "G11"], rejection_summary: "model may only emit allowlisted roles/outcomes/candidate ids; quotes anchor to real chunk bytes" }),
  Object.freeze({ class_id: "cancel_resume", rejected_by: ["G01", "G09"], rejection_summary: "duplicate click returns existing run; unreceipted packs become outcome_unknown without resubmission" }),
  Object.freeze({ class_id: "stale_state", rejected_by: ["G02", "G05", "G07", "G10"], rejection_summary: "hash-bound run ids, frozen identity, and pre-proposal source hash suppression" }),
  Object.freeze({ class_id: "dirty_worktree", rejected_by: ["G06", "G10"], rejection_summary: "byte-identical archival plus stale-input checks; dirty worktree alone never blocks discovery" }),
  Object.freeze({ class_id: "flaky_tests", rejected_by: ["G01", "G03", "G09"], rejection_summary: "event-subscribed assertions on machine states and counters, no sleeps or timing luck" }),
  Object.freeze({ class_id: "misleading_success_output", rejected_by: ["G03", "G04", "G05"], rejection_summary: "success requires observed counters and lifecycle transitions, never prose or viewport evidence" }),
]);

function incidentIds() {
  return HISTORICAL_INCIDENTS.map((row) => row.id);
}

module.exports = {
  PLAN_PATH,
  HISTORICAL_INCIDENTS,
  REQUIRED_COUNTERS,
  ZERO_ON_GOLDEN_PATH,
  GOLDEN_STATE_SEQUENCE,
  GOLDEN_RECEIPT_INVARIANTS,
  ADVERSARIAL_CLASSES,
  incidentIds,
};
