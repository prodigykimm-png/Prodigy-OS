"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../../../../../..");
const configService = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));
const controllerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-run-controller.js"));
const proposalBundleApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-proposal-bundle.js"));

function config() {
  return configService.mergeConfig(configService.DEFAULT_CONFIG, {
    aiProfiles: {
      schema_version: 1,
      llmwiki: { direct_provider_key: "groq", omniroute_provider_key: "openrouter" },
    },
    providers: {
      groq: { adapter: "openai-compatible", model: "controller-fixture", authMode: "none" },
      openrouter: { adapter: "openai-compatible", model: "route-fixture", authMode: "none" },
    },
  });
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
    advanced_settings: { provider_mode: "direct", provider_key: "groq", timeout_ms: 5000 },
    canonical_defaults: { knowledge_domain: "reading", knowledge_topics: [], application_trigger: "fixture", application_contexts: ["reading"], connections: [], invalidation_conditions: [], summary: "" },
    explicit_user_consent: true,
    fixtureBundle: bundle.value,
  };
}

test("controller accepts canonical fourth-tab identities and rejects the legacy tab alias", () => {
  const controller = controllerApi.createRunController({ config: config() });
  assert.equal(controller.tabSwitch({ action: "tab_switch", tab_id: "llmwiki" }).ok, true);
  assert.equal(controller.tabSwitch({ action: "tab_switch", tab_id: "llmwiki-browse" }).ok, true);
  const legacy = controller.tabSwitch({ action: "tab_switch", tab_id: "llm_wiki" });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.reason, "invalid_tab_id");
});

test("controller binds the selected provider key to config before any run side effect", async () => {
  const controller = controllerApi.createRunController({ config: config() });
  const result = await controller.startRun({
    run_id: "run_controller_fixture",
    sources: [{ selected: true, manifest: {} }],
    advanced_settings: { provider_mode: "direct", provider_key: "openrouter", timeout_ms: 1000 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_identity_mismatch");
  assert.equal(result.counters.provider, 0);
  assert.equal(result.counters.network, 0);
});
test("controller passes the validated consent artifact to the provider transport", async () => {
  const command = consentRunCommand();
  const providerBundle = JSON.parse(JSON.stringify(command.fixtureBundle));
  delete providerBundle.proposals[0].write_intent;
  delete providerBundle.proposals[0].source_citations[0].source_url;
  delete providerBundle.proposals[0].target;
  delete providerBundle.proposals[0].target_revision;
  let transportOptions = null;
  const controller = controllerApi.createRunController({
    app: fixtureApp(),
    config: config(),
    transport: async (_normalized, options) => {
      transportOptions = options;
      return { status: "ok", proposal_bundle: providerBundle };
    },
  });
  const result = await controller.startRun(command);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "abstained");
  assert.ok(transportOptions && transportOptions.consent);
  assert.equal(transportOptions.consent.consent_hash, controller.getSnapshot().consent_hash);
  assert.match(transportOptions.consent.consent_hash, /^[0-9a-f]{64}$/u);
  assert.equal(result.counters.provider, 1);
  assert.equal(result.counters.network, 1);
});
