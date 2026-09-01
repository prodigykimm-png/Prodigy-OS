"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const capability = require(path.join(ROOT, "SYSTEM/Views/llmwiki-provider-capability.js"));

function client(options = {}) {
  return {
    getStatus() {
      return {
        ok: true,
        handshake: {
          runtime_epoch: options.epoch || "epoch-1",
          protocol_hash: "a".repeat(64),
        },
      };
    },
    resolveProvider() {
      return {
        status: options.status || "ready",
        profile_id: options.profile || "profile-1",
        route_class: options.route || "local",
      };
    },
  };
}

test("certified runtime readiness creates one frozen provider-neutral identity", async () => {
  const fake = client();
  const ready = await capability.resolveBatchReadiness({}, null, { client: fake });
  assert.equal(ready.ok, true);
  assert.equal(ready.call_allowed, true);
  assert.equal(ready.identity.adapter, "prodigy-ai-runtime");
  assert.equal(ready.identity.profile_revision, "epoch-1");
  assert.equal(Object.isFrozen(ready.identity), true);
  assert.equal(ready.network_calls, 0);
});

test("consent, absent capability, and runtime epoch drift fail with zero network", async () => {
  const consent = await capability.resolveBatchReadiness({}, null, { client: client({ status: "consent_required" }) });
  assert.equal(consent.code, "consent_required");
  const missing = capability.resolveBatchCapability(null, { client: client({ status: "unavailable" }) });
  assert.equal(missing.code, "capability_unavailable");
  const first = await capability.resolveBatchReadiness({}, null, { client: client({ epoch: "epoch-1" }) });
  const drift = capability.assertIdentityMatches(first.identity, null, { client: client({ epoch: "epoch-2" }) });
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.changed_fields, ["profile_revision"]);
  assert.equal(drift.network_calls, 0);
});

test("schema remains provider-neutral and caller-owned", () => {
  const schema = { type: "object", properties: { value: { type: "string" } } };
  assert.strictEqual(capability.normalizeSchemaForIdentity({}, schema), schema);
  assert.equal(Object.isFrozen(schema), false);
});
