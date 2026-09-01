"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const MANIFEST_PATH = path.join(ROOT, "SYSTEM/docs/Prodigy_Wiki_Provider_Neutral_Acceptance_v1.json");

test("Prodigy Wiki provider-neutral acceptance owns every core release gate", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  assert.equal(manifest.schema_version, "prodigy_wiki_provider_neutral_acceptance_v1");
  assert.equal(manifest.product, "prodigy-wiki");
  assert.equal(manifest.provider_runtime.disposition, "external_plugin_release_gate");
  assert.equal(manifest.provider_runtime.owner, "prodigy-ai-runtime");
  assert.equal(manifest.provider_runtime.blocks_core_release, false);
  assert.equal(manifest.provider_runtime.vault_transport_modules_allowed, false);

  const requirements = new Map(manifest.requirements.map((entry) => [entry.id, entry]));
  [
    "reviewed_catalog",
    "source_navigation",
    "local_incremental_diff",
    "selected_range_consent",
    "reviewed_supersession",
    "deterministic_replay",
    "write_boundary",
    "synthetic_cleanup",
  ].forEach((id) => {
    const requirement = requirements.get(id);
    assert.ok(requirement, id);
    assert.equal(requirement.status, "required", id);
    assert.ok(Array.isArray(requirement.production) && requirement.production.length > 0, id);
    assert.ok(Array.isArray(requirement.evidence) && requirement.evidence.length > 0, id);
    [...requirement.production, ...requirement.evidence].forEach((relativePath) => {
      assert.equal(fs.existsSync(path.join(ROOT, relativePath)), true, `${id}: ${relativePath}`);
    });
  });

  assert.deepEqual(manifest.protected_state, {
    existing_review_items: 50,
    existing_review_mutation_allowed: false,
    canonical_knowledge_mutation_allowed: false,
    source_mutation_allowed: false,
  });
  assert.deepEqual(manifest.core_cold_warm_contract, {
    cold_injected_transport_calls: "greater_than_zero",
    warm_injected_transport_calls: 0,
    stable_operation_id: true,
    stable_document_hash: true,
    stable_receipt_hash: true,
    external_network_required: false,
  });
});
