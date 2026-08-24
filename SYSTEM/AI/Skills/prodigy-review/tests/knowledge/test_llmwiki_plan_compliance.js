"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const PATHS = Object.freeze({
  plan: ".omo/plans/prodigy-llmwiki-autonomous-knowledge-git.md",
  gatewayPlan: ".omo/plans/prodigy-ai-gateway-llmwiki.md",
  approvalPlan: ".omo/plans/prodigy-llmwiki-autonomous-approval.md",
  productPlan: ".omo/plans/prodigy-llmwiki-productization-ux.md",
  manifest: "SYSTEM/Views/prodigy-workspace-manifest.js",
  hub: "HUB/50 Knowledge.md",
  candidateView: "SYSTEM/Views/knowledge-candidate-view.js",
  candidateHub: "SYSTEM/Views/knowledge-candidate-hub-adapter.js",
  candidateStore: "SYSTEM/Views/knowledge-candidate-store.js",
  realEvidence: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-21/independent-verification-final/independent-verification.json",
});

const DECISIONS = Object.freeze({
  "canonical-authority": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/knowledge-candidate-store.js", module: "KnowledgeCandidateStore", symbol: "renderCanonicalDocument" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_canonical_document.js",
    receipt: PATHS.realEvidence,
  }),
  "approval-interaction": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-lifecycle-view.js", module: "LLMWikiLifecycleView", symbol: "mountLlmWikiLifecycleView" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_lifecycle_product.js",
    receipt: PATHS.realEvidence,
  }),
  "hidden-knowledge-contract": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-knowledge-kind-contract.js", module: "LLMWikiKnowledgeKindContract", symbol: "parseProposal" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_knowledge_kind_contract.js",
    receipt: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-2/verification.json",
  }),
  "operation-vocabulary": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-operation-contract.js", module: "LLMWikiOperationContract", symbol: "parseOperation" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_operation_contract.js",
    receipt: PATHS.realEvidence,
  }),
  "approval-risk-tiers": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-risk-approval-packet.js", module: "LLMWikiRiskApprovalPacket", symbol: "buildRiskApprovalPacket" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_approval.js",
    receipt: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-14/final-verification.json",
  }),
  "inbox-autopilot-privacy": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-inbox-autopilot.js", module: "LLMWikiInboxAutopilot", symbol: "createInboxAutopilot" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_inbox_autopilot.js",
    receipt: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-7/reverification.json",
  }),
  "initial-connectors": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-source-adapters.js", module: "LLMWikiSourceAdapters", symbol: "createSourceAdapters" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_source_adapters.js",
    receipt: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-6/final-verification.json",
  }),
  "git-safety": Object.freeze({
    owners: Object.freeze([{ path: "SYSTEM/Views/llmwiki-git-adapter.js", module: "LLMWikiGitGateway", symbol: "create" }]),
    automated: "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_git_adapter.js",
    receipt: ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-18/safe-adapter/done-claim.json",
  }),
});

function read(relativePath, overrides = {}) {
  if (Object.hasOwn(overrides, relativePath)) return overrides[relativePath];
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath, missingPaths = new Set()) {
  return !missingPaths.has(relativePath) && fs.existsSync(path.join(ROOT, relativePath));
}

function taskStates(markdown) {
  const states = new Map();
  for (const match of markdown.matchAll(/^- \[([ x])\] (\d+)\./gmu)) states.set(Number(match[2]), match[1] === "x");
  return states;
}

function confirmedReceipt(relativePath, overrides, missingPaths) {
  if (!exists(relativePath, missingPaths)) return false;
  let value;
  try { value = JSON.parse(read(relativePath, overrides)); } catch (_error) { return false; }
  const verdicts = [value.verdict, value.AdversarialVerify, value.adversarial_verify, value.outcome,
    value.AdversarialVerify && value.AdversarialVerify.verdict].filter((item) => typeof item === "string");
  return verdicts.some((item) => ["confirmed", "succeeded"].includes(item))
    && value.confirmed !== false && value.done_claim_confirmed !== false
    && !(Array.isArray(value.findings) && value.findings.length);
}

function count(text, needle) { return text.split(needle).length - 1; }
function fail(errors, code, detail) { errors.push(Object.freeze({ code, detail })); }

function auditCompliance(options = {}) {
  const overrides = options.textOverrides || {};
  const missingPaths = new Set(options.missingPaths || []);
  const decisions = options.decisions || DECISIONS;
  const errors = [];
  const plan = read(PATHS.plan, overrides);
  const manifest = read(PATHS.manifest, overrides);
  const hub = read(PATHS.hub, overrides);
  const candidateView = read(PATHS.candidateView, overrides);
  const candidateHub = read(PATHS.candidateHub, overrides);
  const candidateStore = read(PATHS.candidateStore, overrides);

  const matrix = Object.entries(decisions).map(([id, decision]) => {
    if (!Array.isArray(decision.owners) || decision.owners.length !== 1) fail(errors, decision.owners?.length ? "duplicate_decision_owner" : "missing_decision_owner", id);
    for (const owner of decision.owners || []) {
      if (!exists(owner.path, missingPaths)) fail(errors, "missing_owner_path", `${id}:${owner.path}`);
      else {
        const source = read(owner.path, overrides);
        if (!source.includes(owner.symbol) || !source.includes(`root.${owner.module}`)) fail(errors, "missing_owner_symbol", `${id}:${owner.module}.${owner.symbol}`);
        if (owner.path.startsWith("SYSTEM/Views/llmwiki-") && count(manifest, `"${owner.path}"`) !== 1) fail(errors, "owner_not_once_in_production_manifest", `${id}:${owner.path}`);
      }
    }
    if (!exists(decision.automated, missingPaths)) fail(errors, "missing_evidence_path", `${id}:${decision.automated}`);
    if (!confirmedReceipt(decision.receipt, overrides, missingPaths)) fail(errors, "stale_or_unsuccessful_evidence", `${id}:${decision.receipt}`);
    return Object.freeze({ id, owner: decision.owners?.[0] || null, automated: decision.automated, receipt: decision.receipt });
  });

  const numeric = taskStates(plan);
  for (let id = 1; id <= 21; id += 1) if (numeric.get(id) !== true) fail(errors, "incomplete_numeric_production_task", id);
  if (numeric.size !== 21) fail(errors, "unexpected_numeric_production_task_set", [...numeric.keys()]);

  if (!candidateView.includes('action: "llmwiki-handoff"') || !candidateHub.includes("handoffCandidateToLlmWiki") || !hub.includes("KnowledgeExplorerHub.handoffCandidateToLlmWiki")) {
    fail(errors, "candidate_handoff_missing", "candidate-visible approval must enter LLM Wiki");
  }
  const visibleSources = [candidateView, candidateHub, hub];
  if (visibleSources.some((source) => /approveCandidate\s*\(/u.test(source))) fail(errors, "legacy_visible_direct_approval", "approveCandidate");
  if (visibleSources.some((source) => /vault\.(?:create|modify)\s*\([^\n]*ZETA\/PERMANENT/u.test(source))) fail(errors, "separate_visible_canonical_writer", "visible vault writer");
  if (!candidateStore.includes("function approveCandidate") || !candidateStore.includes("approveCandidate,")) fail(errors, "internal_candidate_store_api_missing", "approveCandidate");
  const approvalOwners = options.approvalOwners || ["llmwiki"];
  if (approvalOwners.length !== 1 || approvalOwners[0] !== "llmwiki") fail(errors, "canonical_approval_owner_conflict", approvalOwners);
  if (!hub.includes("llmWikiRunController.dispatchRiskAction") || !hub.includes("llmWikiRunController.approveMigration")) fail(errors, "llmwiki_approval_dispatch_missing", PATHS.hub);

  const gateway = taskStates(read(PATHS.gatewayPlan, overrides));
  const approval = taskStates(read(PATHS.approvalPlan, overrides));
  const product = taskStates(read(PATHS.productPlan, overrides));
  const requiredStructuralStates = [
    ["gateway-contract-baseline", gateway, 12, true],
    ["approval-packet", approval, 8, true],
    ["approval-exact-commit", approval, 9, true],
    ["one-active-run", product, 4, true],
    ["stale-invalidation", product, 5, true],
    ["exact-packet", product, 6, true],
    ["exact-writer", product, 7, true],
    ["create-controller", product, 11, true],
    ["cancel-stale-recovery", product, 12, true],
    ["old-update-expansion-not-authority", product, 17, false],
    ["old-merge-expansion-not-authority", product, 18, false],
    ["current-update-expanded", numeric, 10, true],
    ["current-merge-expanded", numeric, 11, true],
    ["current-controller-expanded", numeric, 13, true],
  ];
  for (const [id, states, task, expected] of requiredStructuralStates) {
    if (states.get(task) !== expected) fail(errors, "predecessor_trust_conflict", `${id}:task-${task}`);
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    matrix: Object.freeze(matrix),
    metrics: Object.freeze({
      locked_decisions: matrix.length,
      missing_decision_owner: errors.filter((item) => item.code.includes("decision_owner") || item.code.includes("owner_path") || item.code.includes("owner_symbol")).length,
      missing_evidence_path: errors.filter((item) => item.code === "missing_evidence_path" || item.code === "stale_or_unsuccessful_evidence").length,
      canonical_approval_owners: approvalOwners,
      complete_numeric_tasks: [...numeric.values()].filter(Boolean).length,
      predecessor_trust_conflicts: errors.filter((item) => item.code === "predecessor_trust_conflict").length,
    }),
  });
}

function expectMutation(code, mutate) {
  const result = auditCompliance(mutate());
  assert.equal(result.ok, false, `mutation must fail with ${code}`);
  assert.ok(result.errors.some((item) => item.code === code), JSON.stringify(result.errors));
}

function requestedRedMutation() {
  if (process.env.LLMWIKI_F1_RED_MUTATION === "missing-owner") {
    return { decisions: { ...DECISIONS, "canonical-authority": { ...DECISIONS["canonical-authority"], owners: [] } } };
  }
  if (process.env.LLMWIKI_F1_RED_MUTATION === "missing-evidence") return { missingPaths: [PATHS.realEvidence] };
  if (process.env.LLMWIKI_F1_RED_MUTATION === "unchecked-task") {
    return { textOverrides: { [PATHS.plan]: read(PATHS.plan).replace("- [x] 21.", "- [ ] 21.") } };
  }
  return {};
}

if (process.env.LLMWIKI_F1_REPORT_ONLY !== "1") {
test("authoritative plan has one production owner and current evidence for every locked decision", () => {
  const result = auditCompliance(requestedRedMutation());
  assert.deepEqual(result.errors, []);
  assert.equal(result.metrics.locked_decisions, 8);
  assert.equal(result.metrics.missing_decision_owner, 0);
  assert.equal(result.metrics.missing_evidence_path, 0);
  assert.deepEqual(result.metrics.canonical_approval_owners, ["llmwiki"]);
  assert.equal(result.metrics.complete_numeric_tasks, 21);
  assert.equal(result.metrics.predecessor_trust_conflicts, 0);
});

test("missing and duplicate decision owners fail for the intended reason", () => {
  const missing = { ...DECISIONS, "canonical-authority": { ...DECISIONS["canonical-authority"], owners: [] } };
  expectMutation("missing_decision_owner", () => ({ decisions: missing }));
  const duplicate = { ...DECISIONS, "canonical-authority": { ...DECISIONS["canonical-authority"], owners: [DECISIONS["canonical-authority"].owners[0], DECISIONS["approval-interaction"].owners[0]] } };
  expectMutation("duplicate_decision_owner", () => ({ decisions: duplicate }));
});

test("stale evidence path fails rather than accepting a prose claim", () => {
  expectMutation("stale_or_unsuccessful_evidence", () => ({ missingPaths: [PATHS.realEvidence] }));
});

test("an unchecked numeric production task fails while F1-F5 are ignored", () => {
  const plan = read(PATHS.plan).replace("- [x] 21.", "- [ ] 21.");
  expectMutation("incomplete_numeric_production_task", () => ({ textOverrides: { [PATHS.plan]: plan } }));
});

test("legacy visible Candidate direct approval fails while internal store API remains allowed", () => {
  const source = `${read(PATHS.candidateView)}\nKnowledgeCandidateStore.approveCandidate(app, path, request);\n`;
  expectMutation("legacy_visible_direct_approval", () => ({ textOverrides: { [PATHS.candidateView]: source } }));
});

test("a separate visible canonical writer fails", () => {
  const source = `${read(PATHS.candidateHub)}\napp.vault.create(\"ZETA/PERMANENT/rogue.md\", bytes);\n`;
  expectMutation("separate_visible_canonical_writer", () => ({ textOverrides: { [PATHS.candidateHub]: source } }));
});

test("a second user-facing approval owner fails", () => {
  expectMutation("canonical_approval_owner_conflict", () => ({ approvalOwners: ["llmwiki", "candidate"] }));
});

test("predecessor exact-byte trust regression conflicts with the current expansion", () => {
  const product = read(PATHS.productPlan).replace("- [x] 7.", "- [ ] 7.");
  expectMutation("predecessor_trust_conflict", () => ({ textOverrides: { [PATHS.productPlan]: product } }));
});
}

module.exports = Object.freeze({ PATHS, DECISIONS, auditCompliance });
