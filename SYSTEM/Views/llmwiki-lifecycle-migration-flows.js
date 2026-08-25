(function (root) {
  "use strict";

  const planApi = root.LLMWikiLifecycleMigrationPlan || (root.process ? require("./llmwiki-lifecycle-migration-plan.js") : null);
  const writerApi = root.LLMWikiOperationWriter || (root.process ? require("./llmwiki-operation-writer.js") : null);
  const adapterApi = root.LLMWikiLifecycleMigrationObsidianAdapter || (root.process ? require("./llmwiki-lifecycle-migration-obsidian-adapter.js") : null);
  const transactionApi = root.LLMWikiLifecycleMigrationTransaction || (root.process ? require("./llmwiki-lifecycle-migration-transaction.js") : null);

  const BUCKET_MAP = Object.freeze({ legacy_knowledge: "knowledge", candidate: "candidate", literature: "literature" });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function fail(reason, extras = {}) { return Object.freeze({ ok: false, status: "rejected", reason, writes: 0, ...extras }); }

  function compareWithBoundSnapshot(inventory, bound) {
    if (!plain(bound)) return fail("bound_snapshot_required");
    const observed = {};
    for (const [className, bucket] of Object.entries(BUCKET_MAP)) if (inventory.counts[className]) observed[bucket] = inventory.counts[className];
    for (const key of Object.keys(bound)) if ((observed[key] || 0) !== bound[key]) return fail("inventory_drift", { expected_counts: bound, observed_counts: observed, zero_writes: true });
    return Object.freeze({ ok: true, status: "matched", expected_counts: bound, observed_counts: observed });
  }

  async function buildPlan(input = {}) { return planApi.buildPlan(input); }

  function authorizePlan(input = {}) {
    if (!planApi.verifyPlan(input.plan)) return fail("sealed_lifecycle_plan_required");
    return writerApi.authorizeLifecycleMigration(input);
  }

  async function executePlan(input = {}, options = {}) {
    if (!planApi.verifyPlan(input.plan) || !writerApi.isLifecycleMigrationApproval(input.approval)) return fail("sealed_plan_and_approval_required");
    let adapter;
    try { adapter = adapterApi.createProductionAdapter(input.app); }
    catch (_error) { return fail("production_vault_required"); }
    return transactionApi.execute({ plan: input.plan, approval: input.approval, adapter }, options);
  }

  async function executeDisposition() { return fail("preapproval_plan_required"); }

  const api = Object.freeze({ buildPlan, authorizePlan, executePlan, executeDisposition, compareWithBoundSnapshot });
  root.LLMWikiLifecycleMigrationFlows = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
