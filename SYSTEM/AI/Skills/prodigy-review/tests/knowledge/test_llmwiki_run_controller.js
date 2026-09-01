"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../../../../../..");
const controllerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-run-controller.js"));
const proposalBundleApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-proposal-bundle.js"));

function aiClient(status = "ready") {
  return {
    resolveProvider: () => ({ status, profile_id: "runtime-profile", route_class: "local" }),
    grantConsumer: async () => ({ status: "granted" }),
  };
}
function fixtureApp() {
  const files = new Map();
  return {
    vault: {
      getAbstractFileByPath(filePath) { return files.get(filePath) || null; },
      async read(file) { return files.get(file.path)?.bytes || ""; },
      async create(filePath, bytes) {
        const file = { path: filePath };
        files.set(filePath, { ...file, bytes });
        return file;
      },
      async modify(file, bytes) {
        files.set(file.path, { ...file, bytes });
        return file;
      },
      async createFolder(filePath) {
        files.set(filePath, { path: filePath, bytes: "" });
        return files.get(filePath);
      },
    },
  };
}

function consentRunCommand() {
  const body = "controller consent fixture";
  const contentHash = crypto.createHash("sha256").update(body).digest("hex");
  const locator = "ZETA/LITERATURE/controller.md#p1";
  const sourceId = "source_controller_fixture";
  const fetchedAt = "2026-08-09T00:00:00.000Z";
  const manifest = {
    source_id: sourceId,
    content_hash: contentHash,
    requested_url: "https://example.com/controller",
    source_url: "https://example.com/controller",
    fetched_at: fetchedAt,
    parser_version: "controller_fixture_v1",
    extracted_text_hash: contentHash,
    locator,
    refresh_revision: 1,
    raw_bytes: body,
    extracted_text: body,
    fetch_metadata: { requested_url: "https://example.com/controller", resolved_url: "https://example.com/controller", content_hash: contentHash },
  };
  const bundle = proposalBundleApi.buildProposalBundle({
    run_id: "run_controller_consent_fixture",
    validation_context: { context_id: "validation_context_run_controller_consent_fixture" },
    proposals: [{
      kind: "abstain",
      title: "",
      confidence: "low",
      source_citations: [{ source_id: sourceId, content_hash: contentHash, locators: [locator], confidence: "explicit" }],
      abstention_reason: "fixture does not have enough evidence",
    }],
  });
  assert.equal(bundle.ok, true, JSON.stringify(bundle));
  return {
    run_id: "run_controller_consent_fixture",
    sources: [{ selected: true, display_name: "Controller fixture", sensitivity: "public", confidence: "explicit", outbound_text: body, manifest }],
    source_scope: { allowed_source_ids: [sourceId], allowed_locator_prefixes: ["ZETA/LITERATURE/"], allow_private_sources: false },
    retrieval: {
      query: "fixture",
      mode: "literature",
      scope: { paths: ["ZETA/LITERATURE/"], types: ["literature_note"] },
      snapshot: {
        snapshot_revision: contentHash,
        current_revision: contentHash,
        documents: [{
          document_id: "document_controller_fixture",
          type: "literature_note",
          path: "ZETA/LITERATURE/controller.md",
          title: "Controller fixture",
          statement: body,
          source_ids: [sourceId],
          citations: [{ source_id: sourceId, locator }],
          updated: fetchedAt,
          revision: contentHash,
        }],
      },
    },
    proposal_request: { instruction: "fixture consent propagation" },
    consent: { issued_at: fetchedAt, nonce: "consent_controller_fixture_0001" },
    approval: { expires_at: "2026-08-09T01:00:00.000Z", nonce: "approval_controller_fixture_0001" },
    advanced_settings: { timeout_ms: 5000 },
    canonical_defaults: { knowledge_domain: "reading", knowledge_topics: [], application_trigger: "fixture", application_contexts: ["reading"], connections: [], invalidation_conditions: [], summary: "" },
    explicit_user_consent: true,
    fixtureBundle: bundle.value,
  };
}

test("controller accepts canonical fourth-tab identities and rejects the legacy tab alias", () => {
  const controller = controllerApi.createRunController({ ai_client: aiClient() });
  assert.equal(controller.tabSwitch({ action: "tab_switch", tab_id: "llmwiki" }).ok, true);
  assert.equal(controller.tabSwitch({ action: "tab_switch", tab_id: "llmwiki-browse" }).ok, true);
  const legacy = controller.tabSwitch({ action: "tab_switch", tab_id: "llm_wiki" });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.reason, "invalid_tab_id");
});

test("controller rejects caller-selected providers before any run side effect", async () => {
  const controller = controllerApi.createRunController({ ai_client: aiClient() });
  const result = await controller.startRun({
    run_id: "run_controller_fixture",
    sources: [{ selected: true, manifest: {} }],
    advanced_settings: { provider_mode: "direct", provider_key: "openrouter", timeout_ms: 1000 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_selection_owned_by_runtime");
  assert.equal(result.counters.provider, 0);
  assert.equal(result.counters.network, 0);
});
test("controller binds the frozen consent hash to the canonical analysis delegation", async () => {
  const command = consentRunCommand();
  const crypto = require("node:crypto");
  let delegated = null;
  const controller = controllerApi.createRunController({
    app: fixtureApp(),
    ai_client: aiClient(),
    analyze_batch: async ({ command: forwarded }) => {
      delegated = forwarded;
      return { ok: true, provider_calls: 1, consent_hash: crypto.createHash("sha256").update(`delegated:${command.run_id}`).digest("hex"), proposals: [] };
    },
  });
  const result = await controller.startRun(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "abstained");
  assert.ok(delegated && delegated.explicit_user_consent === true, "explicit consent must reach the analysis core");
  assert.equal(delegated.sources[0].manifest.source_id, "source_controller_fixture");
  assert.match(controller.getSnapshot().consent_hash, /^[0-9a-f]{64}$/u);
  assert.equal(controller.getSnapshot().consent_hash, crypto.createHash("sha256").update(`delegated:${command.run_id}`).digest("hex"));
  assert.equal(result.counters.provider, 1);
});
