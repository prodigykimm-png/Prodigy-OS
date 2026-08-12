"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const DOCS = path.join(ROOT, "SYSTEM/docs");
const SCHEMA_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Artifact_Schema_v1.json");
const MANIFEST_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Manifest_v1.json");
const DECISIONS_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Decisions_v1.json");
const PROPOSAL_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Proposal_v1.md");
const INTEGRATION_MEMO_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Integration_Memo_v1.json");
const WALKTHROUGH_PATH = path.join(DOCS, "Prodigy_Knowledge_Workspace_Walkthrough_v1.json");
const CATALOG_PATH = path.join(DOCS, "Prodigy_User_Surface_Improvement_Catalog_v1.json");
const CITATION_CHECKS_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Citation_Checks_v1.json");
const EXCLUSIONS_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Exclusions_v1.json");
const EXECUTION_SCOPE_PATH = path.join(DOCS, "Prodigy_Knowledge_Revamp_Execution_Scope_v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertPlacementDecision(decision) {
  const allowed = new Set([
    "fixture_id",
    "decision_id",
    "recommendation",
    "requested_option",
    "user_choice",
    "decision_status",
    "selectable",
    "requirements_renegotiation_required",
    "blocking_wps",
    "owner",
    "rationale",
    "citation_ids",
  ]);
  for (const key of Object.keys(decision)) {
    assert.ok(allowed.has(key), `unknown placement decision field: ${key}`);
  }
  assert.equal(typeof decision.fixture_id, "string");
  assert.equal(decision.decision_id, "wiki_placement");
  assert.ok(["fourth_tab", "embedded_region"].includes(decision.recommendation));
  assert.ok(["fourth_tab", "embedded_region", "standalone_workspace", null].includes(decision.requested_option));
  assert.ok(["fourth_tab", "embedded_region", null].includes(decision.user_choice));
  assert.ok(["awaiting_user", "accepted", "rejected", "requirements_renegotiation_required"].includes(decision.decision_status));
  assert.equal(typeof decision.selectable, "boolean");
  assert.equal(typeof decision.requirements_renegotiation_required, "boolean");
  assert.ok(Array.isArray(decision.blocking_wps));
  assert.equal(decision.owner, "user");
  assert.ok(decision.citation_ids.length > 0);

  if (decision.decision_status === "accepted") {
    assert.ok(["fourth_tab", "embedded_region"].includes(decision.user_choice));
    assert.equal(decision.selectable, true);
    assert.equal(decision.requirements_renegotiation_required, false);
    assert.ok(!decision.blocking_wps.includes("WP1"));
    assert.equal(decision.requested_option, decision.user_choice);
  }

  if (decision.decision_status === "awaiting_user") {
    assert.equal(decision.user_choice, null);
    assert.equal(decision.selectable, true);
    assert.equal(decision.requirements_renegotiation_required, false);
    assert.ok(decision.blocking_wps.includes("WP1"));
  }

  if (decision.requested_option === "standalone_workspace" || decision.decision_status === "requirements_renegotiation_required") {
    assert.equal(decision.requested_option, "standalone_workspace");
    assert.equal(decision.user_choice, null);
    assert.equal(decision.decision_status, "requirements_renegotiation_required");
    assert.equal(decision.selectable, false);
    assert.equal(decision.requirements_renegotiation_required, true);
    assert.ok(decision.blocking_wps.includes("WP1"));
  }
}

function assertPlacementGate(decisions, { wp1Blocked }) {
  const active = decisions.filter((decision) => decision.decision_status !== "rejected");
  const accepted = active.filter((decision) => decision.decision_status === "accepted");
  assert.ok(accepted.length <= 1, "at most one active accepted placement decision");
  if (wp1Blocked) {
    assert.equal(accepted.length, 0, "WP1 cannot remain blocked after an accepted choice in this fixture");
    assert.ok(active.some((decision) => decision.blocking_wps.includes("WP1")));
  } else {
    assert.equal(accepted.length, 1, "only one accepted A/B choice can clear WP1");
    assert.ok(["fourth_tab", "embedded_region"].includes(accepted[0].user_choice));
    assert.ok(!accepted[0].blocking_wps.includes("WP1"));
  }
}

function assertManifest(manifest) {
  assert.equal(manifest.schema_version, "1.0");
  assert.equal(manifest.artifact_type, "manifest");
  const payload = manifest.payload;
  assert.equal(payload.manifest_id, "prodigy-knowledge-revamp");
  assert.equal(payload.lifecycle, "complete");
  assert.equal(payload.validation_status, "valid");
  assert.ok(Array.isArray(payload.entries));

  const ids = new Set();
  const deferred = [];
  const implementationGate = [];
  for (const entry of payload.entries) {
    assert.ok(!ids.has(entry.id), `duplicate manifest id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(!path.isAbsolute(entry.path), `absolute artifact path: ${entry.path}`);
    assert.ok(!entry.path.split(path.sep).includes(".."), `traversal artifact path: ${entry.path}`);
    const artifactPath = path.join(ROOT, entry.path);
    if (entry.lifecycle === "deferred") {
      deferred.push(entry);
      assert.equal(entry.sha256, null);
      assert.equal(entry.validation_status, "not_created");
      assert.equal(entry.activation_gate, "implementation_gate");
      assert.equal(fs.existsSync(artifactPath), false, "deferred integration memo must not be a placeholder");
      continue;
    }
    if (entry.lifecycle === "implementation_gate_required") {
      implementationGate.push(entry);
      assert.equal(entry.validation_status, "valid");
      assert.equal(entry.activation_gate, "implementation_gate");
      assert.equal(fs.existsSync(artifactPath), true, `missing implementation-gate artifact: ${entry.path}`);
      assert.equal(entry.sha256, sha256(artifactPath), `implementation-gate hash mismatch: ${entry.path}`);
      continue;
    }
    assert.equal(entry.lifecycle, "complete");
    assert.equal(entry.validation_status, "valid");
    assert.equal(fs.existsSync(artifactPath), true, `missing complete artifact: ${entry.path}`);
    assert.equal(entry.sha256, sha256(artifactPath), `hash closure mismatch: ${entry.path}`);
  }
  const acceptedIntegration = payload.entries.find((entry) => entry.id === "revamp-integration-memo" && entry.lifecycle === "complete");
  assert.ok(
    (deferred.length === 1 && implementationGate.length === 0) ||
      (deferred.length === 0 && implementationGate.length === 1) ||
      (deferred.length === 0 && implementationGate.length === 0 && acceptedIntegration),
    "integration memo must be deferred, implementation-gated, or accepted with complete hash closure",
  );
  const integrationEntry = acceptedIntegration || deferred[0] || implementationGate[0];
  assert.equal(integrationEntry.id, "revamp-integration-memo");
}
function assertWalkthrough(artifact) {
  assert.equal(artifact.schema_version, "1.0");
  assert.equal(artifact.artifact_type, "walkthrough");
  const payload = artifact.payload;
  assert.equal(payload.walkthrough_id, "prodigy-knowledge-workspace-walkthrough");
  assert.equal(payload.status, "ready");
  assert.ok(Array.isArray(payload.counting_rules) && payload.counting_rules.length > 0);
  assert.ok(Array.isArray(payload.citations) && payload.citations.length > 0);
  assert.ok(Array.isArray(payload.routes));
  assert.deepEqual(new Set(payload.routes.map((route) => route.route_id)), new Set(["candidate-review", "wiki-search", "wiki-browse"]));
  const citationIds = new Set(payload.citations.map((citation) => citation.citation_id));
  for (const route of payload.routes) {
    assert.equal(route.single_screen, true);
    assert.equal(route.workspace_switches, 0);
    assert.ok(route.proposed_total_actions <= route.action_budget);
    assert.ok(route.recovery_route && route.recovery_route.steps.length > 0);
    let cumulative = 0;
    for (const step of route.steps) {
      assert.equal(step.cumulative, cumulative + step.delta, `${route.route_id} cumulative arithmetic`);
      cumulative = step.cumulative;
      for (const citationId of step.citation_ids) assert.ok(citationIds.has(citationId), `unknown step citation ${citationId}`);
    }
    assert.equal(cumulative, route.proposed_total_actions, `${route.route_id} total arithmetic`);
    for (const citationId of [...route.citation_ids, ...route.single_screen_citation_ids, ...route.recovery_route.citation_ids]) {
      assert.ok(citationIds.has(citationId), `unknown route citation ${citationId}`);
    }
  }
  const search = payload.routes.find((route) => route.route_id === "wiki-search");
  const browse = payload.routes.find((route) => route.route_id === "wiki-browse");
  assert.equal(search.proposed_total_actions, 3);
  assert.equal(browse.proposed_total_actions, 4);
  assert.equal(search.status, "ready");
  assert.equal(browse.status, "ready");
  const tabsCitation = payload.citations.find((citation) => citation.citation_id === "tabs-mount");
  assert.match(tabsCitation.claim, /four tabs|fourth-tab/iu);
  assert.equal(browse.dependencies[0], "accepted fourth_tab placement decision");
  assert.match(browse.steps[0].annotation, /accepted placement is fourth_tab/iu);
}
function assertCatalogArtifacts(catalogArtifact, checksArtifact, exclusionsArtifact) {
  assert.equal(catalogArtifact.schema_version, "1.0");
  assert.equal(catalogArtifact.artifact_type, "improvement_catalog");
  assert.equal(checksArtifact.artifact_type, "citation_checks");
  assert.equal(exclusionsArtifact.artifact_type, "exclusions");
  const catalog = catalogArtifact.payload;
  const checks = checksArtifact.payload;
  const exclusions = exclusionsArtifact.payload;
  assert.equal(catalog.status, "ready");
  assert.equal(checks.status, "ready");
  assert.equal(exclusions.status, "ready");
  const catalogCitationIds = new Set(catalog.citations.map((citation) => citation.citation_id));
  assert.ok(catalog.items.length >= 3);
  for (const item of catalog.items) {
    for (const citationId of item.citation_ids) assert.ok(catalogCitationIds.has(citationId), `unknown catalog citation ${citationId}`);
    assert.ok(item.observed_problem && item.expected_effect);
    assert.ok(["P0", "P1", "P2", "P3"].includes(item.priority));
    assert.ok(["preserve", "review_required", "out_of_scope"].includes(item.gate_disposition));
  }
  const checkIds = new Set(checks.checks.map((check) => check.citation_id));
  assert.deepEqual(checkIds, catalogCitationIds);
  const claimSentinels = {
    "launcher-workspaces": ["WORKSPACE_CONFIG", 'id: "auction"', 'id: "workout"', 'id: "reading"', 'id: "project"', 'id: "personal"'],
    "knowledge-hub-mount": ["KnowledgeExplorerHub.render", "ProdigyHubLoader.mountWorkspace", "mountContext"],
    "brief-provider-default": ["mountKnowledgeExplorer", "options.briefService ||", "aiProviderService: {}", "providerConfigService: {}"],
    "brief-recovery-copy": ["statusCopy", "다시 시도"],
    "hydration-controller": ["hydrateSelectedAsset", "requestId", "asset.path", 'status: "loading"', 'status: "error"'],
    "hydration-render": ["appendHydrationSection", 'hydration.status === "error"', "다시 선택해 시도해 주세요"],
    "authoring-actions": ["mountKnowledgeAuthoringActions", "+ 지식 작성", "+ 문헌노트 작성", "생각·경험", "출처가 있는 자료"]
  };
  for (const check of checks.checks) {
    assert.equal(check.status, "verified");
    assert.equal(check.disposition, "keep");
    const match = /^([^:]+):(.+)#L(\d+)-L(\d+)$/.exec(check.excerpt_ref);
    assert.ok(match, `invalid excerpt ref ${check.excerpt_ref}`);
    const excerptPath = path.join(ROOT, match[2]);
    const excerpt = fs.readFileSync(excerptPath, "utf8").split(/\n/).slice(Number(match[3]) - 1, Number(match[4])).join("\n") + "\n";
    const catalogCitation = catalog.citations.find((citation) => citation.citation_id === check.citation_id);
    assert.ok(catalogCitation, `missing catalog citation ${check.citation_id}`);
    assert.equal(catalogCitation.path, match[2], `${check.citation_id} path binding`);
    assert.equal(catalogCitation.line_start, Number(match[3]), `${check.citation_id} line_start binding`);
    assert.equal(catalogCitation.line_end, Number(match[4]), `${check.citation_id} line_end binding`);
    assert.ok(excerpt.includes(catalogCitation.symbol), `${check.citation_id} excerpt must contain declared symbol ${catalogCitation.symbol}`);
    for (const sentinel of claimSentinels[check.citation_id] || []) assert.ok(excerpt.includes(sentinel), `${check.citation_id} missing claim sentinel ${sentinel}`);
    if (check.citation_id === "launcher-workspaces") assert.equal(excerpt.includes('id: "knowledge"'), false, "launcher excerpt must support the Knowledge omission claim");
    assert.equal(crypto.createHash("sha256").update(excerpt).digest("hex"), check.excerpt_hash, check.citation_id);
    const mutatedExcerpt = excerpt.replace(/\S/, (character) => character === "x" ? "y" : "x");
    assert.notEqual(crypto.createHash("sha256").update(mutatedExcerpt).digest("hex"), check.excerpt_hash, `${check.citation_id} must reject mutated bytes`);
  }
  const exclusionIds = new Set(exclusions.items.map((item) => item.id));
  assert.ok(exclusionIds.has("exclude-collection-pipelines"));
  assert.ok(exclusionIds.has("exclude-auto-approval"));
  assert.ok(exclusionIds.has("exclude-architecture-rewrite"));
  assert.ok(catalog.exclusion_ids.every((id) => exclusionIds.has(id)));
  for (const item of exclusions.items) {
    assert.ok(item.surface && item.reason && item.scope_rule && item.owner);
    assert.equal(item.status, "explicit");
  }
}
function assertExecutionScope(artifact) {
  assert.equal(artifact.schema_version, "1.0");
  assert.equal(artifact.artifact_type, "execution_scope");
  const payload = artifact.payload;
  assert.equal(payload.scope_id, "prodigy-knowledge-revamp-execution-scope");
  assert.equal(payload.status, "accepted");
  assert.equal(payload.source_brief.seed_scope, "WP0 kickoff seed");
  assert.equal(payload.authorization.kind, "user_directive");
  assert.ok(payload.authorization.evidence.length >= 1);
  assert.equal(payload.approved_plan.sha256, "956830213ad7f8ae0b3d187c673410a9c7126cff3d9e9c25ae1155a4cbc95bb6");
  assert.deepEqual(payload.stories.map((story) => story.id), ["G001", "G002", "G003", "G004", "G005", "G006", "G007"]);
  assert.equal(payload.stories.find((story) => story.id === "G003").status, "complete");
  assert.equal(payload.constraints.placement, "fourth_tab_selected; embedded_region is the only alternate; standalone requires renegotiation_and_replan");
  assert.equal(payload.constraints.f11, "standalone_requires_renegotiation_and_replan");
}



const schema = readJson(SCHEMA_PATH);
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.ok(schema.$defs.placementDecision, "placementDecision definition missing");
assert.ok(schema.$defs.integrationMemo, "integrationMemo definition missing");
assert.ok(schema.$defs.walkthrough, "walkthrough definition missing");
assert.equal(schema.$defs.placementDecision.additionalProperties, false);
assert.equal(schema.$defs.walkthrough.additionalProperties, false);
assert.ok(schema.$defs.placementDecision.required.includes("fixture_id"));
assert.ok(schema.$defs.walkthrough.required.includes("citations"));
assert.ok(schema.$defs.improvementCatalog, "improvementCatalog definition missing");
assert.ok(schema.$defs.citationChecks, "citationChecks definition missing");
assert.ok(schema.$defs.exclusions, "exclusions definition missing");
assert.ok(schema.$defs.executionScope, "executionScope definition missing");

const manifest = readJson(MANIFEST_PATH);
const decisionsArtifact = readJson(DECISIONS_PATH);
const proposal = fs.readFileSync(PROPOSAL_PATH, "utf8");
const walkthrough = readJson(WALKTHROUGH_PATH);
assertManifest(manifest);
assertWalkthrough(walkthrough);
const integrationMemo = readJson(INTEGRATION_MEMO_PATH);
const catalogArtifact = readJson(CATALOG_PATH);
const checksArtifact = readJson(CITATION_CHECKS_PATH);
const exclusionsArtifact = readJson(EXCLUSIONS_PATH);
const executionScope = readJson(EXECUTION_SCOPE_PATH);
assertExecutionScope(executionScope);
assertCatalogArtifacts(catalogArtifact, checksArtifact, exclusionsArtifact);
assert.equal(integrationMemo.schema_version, "1.0");
assert.equal(integrationMemo.artifact_type, "integration_memo");
assert.equal(integrationMemo.payload.status, "accepted");
assert.equal(integrationMemo.payload.selected_baseline, "codex/journal-codex-exec@606d68ecdd206e1b3dbb186a526fe11298eb0637");
assert.equal(integrationMemo.payload.strategy, "file_reconciliation");
assert.equal(integrationMemo.payload.collisions.length >= 1, true);
assert.equal(integrationMemo.payload.baseline_evidence.length >= 1, true);
assert.ok(integrationMemo.payload.approval_evidence.length >= 1);
assert.equal(decisionsArtifact.schema_version, "1.0");
assert.equal(decisionsArtifact.artifact_type, "placement_decisions");
const decisions = decisionsArtifact.payload.decisions;
assert.equal(decisions.length, 2);
assert.equal(new Set(decisions.map((decision) => decision.fixture_id)).size, decisions.length);
for (const decision of decisions) assertPlacementDecision(decision);
assert.equal(decisions[0].fixture_id, "wiki_placement_fourth_tab_accepted");
assert.equal(decisions[1].fixture_id, "wiki_placement_standalone_request_under_f11");
assertPlacementGate(decisions, { wp1Blocked: false });

for (const requiredText of [
  "fourth_tab",
  "embedded_region",
  "Standalone",
  "user_choice",
  "WP1",
  "Evidence Gate",
  "Human Review Gate",
  "Knowledge Approval",
  "P1",
  "Prodigy_Knowledge_Workspace_Walkthrough_v1.json"
]) {
  assert.ok(proposal.includes(requiredText), `proposal missing ${requiredText}`);
}

// Negative contract fixtures: each must fail closed without mutating the real decision artifact.
const standaloneAccepted = structuredClone(decisions[1]);
standaloneAccepted.decision_status = "accepted";
assert.throws(() => assertPlacementDecision(standaloneAccepted), /requirements_renegotiation_required|selectable|accepted|user_choice/);

const standaloneChoice = structuredClone(decisions[1]);
standaloneChoice.user_choice = "standalone_workspace";
assert.throws(() => assertPlacementDecision(standaloneChoice), /user_choice/);

const missingBlock = structuredClone(decisions[1]);
missingBlock.blocking_wps = [];
assert.throws(() => assertPlacementDecision(missingBlock), /WP1/);

const unknownWaiver = structuredClone(decisions[1]);
unknownWaiver.f11_waiver = true;
assert.throws(() => assertPlacementDecision(unknownWaiver), /unknown placement decision field/);

const falseGate = structuredClone(decisions[0]);
falseGate.decision_status = "rejected";
assert.throws(() => assertPlacementGate([falseGate], { wp1Blocked: false }), /accepted A\/B/);

console.log("Prodigy Knowledge Revamp artifact contract tests passed");
