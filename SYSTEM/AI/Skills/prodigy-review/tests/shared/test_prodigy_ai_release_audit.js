"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const audit = require(path.join(ROOT, "SYSTEM/docs/Prodigy_AI_Runtime_Release_Audit_v1.json"));

function sha(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("release audit binds the installed plugin artifact and protocol", () => {
  assert.equal(audit.schema_version, "prodigy_ai_runtime_release_audit_v1");
  assert.equal(audit.release_status, "desktop_end_to_end_ready_mobile_safe_unconfigured");
  assert.equal(audit.protocol_version, "1.0.0");
  assert.equal(audit.protocol_hash, require(path.join(ROOT, "SYSTEM/Views/prodigy-ai-client.js")).PROTOCOL_HASH);
  for (const [name, expected] of Object.entries(audit.installed_artifacts)) {
    assert.equal(sha(path.join(ROOT, ".obsidian/plugins/prodigy-ai-runtime", name)), expected, name);
  }
  const enabled = JSON.parse(fs.readFileSync(path.join(ROOT, ".obsidian/community-plugins.json"), "utf8"));
  assert.equal(enabled.includes("prodigy-ai-runtime"), true);
  assert.equal(audit.installed_enabled, true);
  assert.equal(audit.repositories.plugin_head, "a43f6dc");
  assert.equal(audit.deferred_harness_gaps.length, 1);
});

test("release audit records exact safety and coverage gates", () => {
  assert.deepEqual(audit.verification, {
    active_consumers: 14,
    plugin_contract_tests: 25,
    real_obsidian_surfaces: [
      "home", "project", "reading", "journal", "auction", "prodigy-wiki", "plugin-settings", "workspace-settings",
    ],
    desktop_cold_profiles: ["antigravity", "codex"],
    desktop_live_consumers: ["project.workflow_draft"],
    mobile_relay_protocol_tested: true,
    mobile_relay_route_configured: false,
    direct_vault_ai_http_cli_calls: 0,
    source_canonical_writes: 0,
    synthetic_cache_residue: 0,
    isolated_cli_temp_residue: 0,
    secret_value_log_hits: 0,
    prompt_response_persistence_hits: 0,
    private_argv_routes: 0,
  });
  assert.equal(audit.rollback.legacy_runtime_restored, false);
  assert.equal(audit.rollback.consumer_deterministic_behavior_without_plugin, true);
});

test("private consumers bind only to the stdin desktop profile", () => {
  const manifests = require(path.join(ROOT, "SYSTEM/Views/prodigy-ai-consumer-manifests.js"));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, ".obsidian/plugins/prodigy-ai-runtime/data.json"), "utf8"));
  for (const manifest of manifests.list()) {
    assert.equal(
      data.bindings[manifest.consumer_id],
      manifest.sensitivity === "internal" ? "antigravity" : "codex",
      manifest.consumer_id,
    );
  }
  const cold = require(path.join(ROOT, "SYSTEM/docs/Prodigy_AI_Runtime_Cold_Verification_v1.json"));
  assert.equal(cold.desktop.profiles.find((profile) => profile.profile_id === "antigravity").prompt_transport, "argv");
  assert.equal(cold.desktop.profiles.find((profile) => profile.profile_id === "codex").prompt_transport, "stdin");
  assert.deepEqual(cold.desktop.profiles.find((profile) => profile.profile_id === "antigravity").allowed_consumer_sensitivities, ["internal"]);
  const acceptance = require(path.join(ROOT, "SYSTEM/docs/Prodigy_AI_Runtime_Desktop_Consumer_Acceptance_v1.json"));
  assert.equal(acceptance.status, "pass");
  assert.equal(acceptance.consumer_id, "project.workflow_draft");
  assert.equal(acceptance.provider_profile, "codex");
  assert.equal(acceptance.provider_command_boundary.prompt_via_stdin, true);
});
