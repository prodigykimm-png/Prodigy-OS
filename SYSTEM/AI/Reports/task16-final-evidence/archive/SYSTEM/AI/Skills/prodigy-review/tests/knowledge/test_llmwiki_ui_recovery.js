"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");
const recovery = require(path.join(ROOT, "SYSTEM/Views/llmwiki-ui-recovery.js"));

for (const input of [
  { code: "profile_missing" },
  { code: "provider_missing" },
  { code: "provider_unavailable" },
  { code: "provider_rate_limited" },
  { code: "provider_timeout" },
  { name: "AbortError" },
  { code: "response_malformed" },
  { code: "response_unknown_field" },
  { code: "proposal_bundle_invalid" },
  { code: "write_intent_forbidden" },
  { code: "source_selection_required" },
  { code: "query_failed" },
  { code: "mtime_conflict" },
  { code: "atomic_write_interrupted" },
  { code: "sync_pending" },
  { code: "approval_expired" },
  { code: "target_revision_mismatch" },
  { code: "derived_cache_missing" },
  { code: "authorized_mutation_rolled_back" },
  { code: "not-a-real-reason", message: "raw provider explanation must not render" }
]) {
  const mapped = recovery.mapRecovery(input);
  assert.equal(typeof mapped.copy, "string");
  assert.ok(mapped.copy.length > 0);
  assert.equal(mapped.copy.includes("raw provider"), false);
  assert.equal(mapped.copy.includes("not-a-real-reason"), false);
  assert.ok(mapped.action);
}

assert.equal(recovery.mapRecovery({ status: 429 }).code, "provider_rate_limited");
assert.equal(recovery.mapRecovery({ status: 503 }).code, "provider_unavailable_route");
assert.equal(recovery.mapRecovery({ code: "ETIMEDOUT" }).code, "provider_timeout");
assert.equal(recovery.mapRecovery({ code: "AbortError" }).code, "provider_aborted");
assert.equal(recovery.toUiState({ ok: true }).status, "ready");
assert.equal(recovery.toUiState({ ok: false, code: "provider_missing", reason: "raw" }).status, "recovery");
assert.equal(recovery.toUiState({ ok: false, code: "provider_missing", reason: "raw" }).copy.includes("raw"), false);

console.log("LLMWiki UI recovery tests passed.");
