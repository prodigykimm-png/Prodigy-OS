"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const manifests = require("../../../../../Views/prodigy-ai-consumer-manifests.js");
const clientApi = require("../../../../../Views/prodigy-ai-client.js");

const ACTIVE_CONSUMERS = [
  "auction.decision_support",
  "auction.region_experience",
  "auction.research_summary",
  "journal.daily_reflection",
  "journal.monthly_validation",
  "journal.weekly_filter",
  "knowledge.explorer_brief",
  "knowledge.source_batch",
  "project.workflow_draft",
  "reading.question",
  "reading.thinking_delta",
  "wiki.article_compile",
  "wiki.batch_analysis",
  "wiki.page_plan",
];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeRuntime(options = {}) {
  const calls = [];
  const runtime = {
    api: {
      getHandshake() {
        return {
          plugin_id: "prodigy-ai-runtime",
          runtime_version: "1.0.0",
          protocol_version: options.protocolVersion || clientApi.PROTOCOL_VERSION,
          consumer_manifest_range: options.manifestRange || ">=1 <2",
          runtime_epoch: options.epoch || "epoch-test-1",
          protocol_hash: options.protocolHash || clientApi.PROTOCOL_HASH,
          capabilities: options.capabilities || ["structured-strict", "chat-text"],
        };
      },
      getStatus() { return options.status === undefined ? { status: "ready" } : options.status; },
      requestStructured(request) {
        calls.push(request);
        if (options.requestStructured) return options.requestStructured(request, runtime);
        return Promise.resolve({
          protocol_version: clientApi.PROTOCOL_VERSION,
          runtime_epoch: runtime.api.getHandshake().runtime_epoch,
          request_id: request.request_id,
          status: "completed",
          payload: { workflow: [{ label: "검증" }] },
          receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
        });
      },
      requestChat(request) {
        calls.push(request);
        return Promise.resolve({
          protocol_version: clientApi.PROTOCOL_VERSION,
          runtime_epoch: runtime.api.getHandshake().runtime_epoch,
          request_id: request.request_id,
          status: "completed",
          payload: { text: "ok" },
          receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
        });
      },
      cancel(requestId) { calls.push({ cancel: requestId }); return { status: "cancel_requested", request_id: requestId }; },
      getRequestStatus(requestId) { return { status: "running", request_id: requestId }; },
      listProviders() { return options.providers || []; },
      listModels() { return options.models || []; },
      resolveProvider(requirements) { return options.resolution || { status: "ready", requirements }; },
      getConsentRequirement(requirements) { return options.consent || { status: "consent_required", requirements }; },
      grantConsumer(requirements) { return { status: "granted", requirements }; },
      openSettings() { return true; },
      subscribeStatus(listener) { runtime.listener = listener; return () => { runtime.listener = null; }; },
    },
  };
  return { runtime, calls };
}

function appWith(current) {
  return { plugins: { getPlugin(id) { return id === "prodigy-ai-runtime" ? current.value : null; } } };
}

function structuredInput(overrides = {}) {
  return {
    consumer_id: "project.workflow_draft",
    owner_session_id: "project-wizard-1",
    operation_id: "operation-project-1",
    attempt_id: "attempt-1",
    prompt: "프로젝트 workflow를 정리한다.",
    schema: { type: "object", required: ["workflow"], properties: { workflow: { type: "array" } } },
    ...overrides,
  };
}

test("consumer manifests cover exactly fourteen provider-neutral active consumers", () => {
  assert.deepEqual(manifests.list().map((entry) => entry.consumer_id), ACTIVE_CONSUMERS);
  manifests.list().forEach((manifest) => {
    assert.equal(manifests.validate(manifest).ok, true, manifest.consumer_id);
    assert.equal(Object.isFrozen(manifest), true, manifest.consumer_id);
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.contract_version, 1);
    assert.equal(manifest.background_allowed, false);
    assert.ok(manifest.max_output_bytes > 0);
  });
  assert.doesNotMatch(JSON.stringify(manifests.list()), /gemini|openai|codex|antigravity|lm studio/iu);
  assert.equal(Object.isFrozen(clientApi.PROTOCOL_DESCRIPTOR.runtime_methods), true);
  assert.equal(Object.isFrozen(clientApi.PROTOCOL_DESCRIPTOR.request_fields), true);
});

test("missing runtime leaves deterministic features available and makes zero calls", async () => {
  const current = { value: null };
  const client = clientApi.createClient({ app: appWith(current) });
  assert.deepEqual(client.getStatus(), { ok: false, status: "runtime_unavailable", deterministic_available: true });
  const result = await client.requestStructured(structuredInput());
  assert.deepEqual(result, { ok: false, status: "failed", error_code: "runtime_unavailable", deterministic_available: true });
});

test("compatible runtime receives one bounded provider-neutral request and returns its receipt", async () => {
  const fake = fakeRuntime();
  const current = { value: fake.runtime };
  const client = clientApi.createClient({ app: appWith(current) });
  const result = await client.requestStructured(structuredInput());

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, { workflow: [{ label: "검증" }] });
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(Object.keys(fake.calls[0]).sort(), [
    "attempt_id", "consumer_id", "consumer_manifest", "operation_id", "owner_session_id",
    "prompt", "protocol_version", "request_id", "schema",
  ]);
  assert.equal(fake.calls[0].consumer_manifest.capability, "structured-strict");
  assert.match(fake.calls[0].request_id, /^[0-9a-f]{64}$/u);
  assert.equal(result.receipt.consumer_id, "project.workflow_draft");
});

test("deterministic fake runtime injects without an Obsidian plugin manager", async () => {
  const fake = fakeRuntime();
  const client = clientApi.createClient({ runtimeResolver: () => fake.runtime });
  const result = await client.requestStructured(structuredInput());
  assert.equal(result.ok, true);
  assert.equal(fake.calls.length, 1);
  assert.equal(client.getStatus().status, "ready");
});

test("same in-flight identity coalesces once but a completed request is not cached", async () => {
  const gate = deferred();
  const fake = fakeRuntime({
    requestStructured(request) {
      return gate.promise.then(() => ({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: request.request_id,
        status: "completed",
        payload: { ok: true },
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      }));
    },
  });
  const client = clientApi.createClient({ app: appWith({ value: fake.runtime }) });
  const first = client.requestStructured(structuredInput());
  const second = client.requestStructured(structuredInput());
  assert.equal(fake.calls.length, 1);
  gate.resolve();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, right);
  await client.requestStructured(structuredInput());
  assert.equal(fake.calls.length, 2);
  const retry = await client.requestStructured(structuredInput({ attempt_id: "attempt-2" }));
  assert.equal(retry.ok, true);
  assert.notEqual(fake.calls[0].request_id, fake.calls[2].request_id);
});

test("same identity with different in-flight content fails closed instead of coalescing", async () => {
  const gate = deferred();
  const fake = fakeRuntime({
    requestStructured(request) {
      return gate.promise.then(() => ({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: request.request_id,
        status: "completed",
        payload: { ok: true },
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      }));
    },
  });
  const client = clientApi.createClient({ app: appWith({ value: fake.runtime }) });
  const first = client.requestStructured(structuredInput());
  const conflictPending = client.requestStructured(structuredInput({ prompt: "다른 요청" }));
  gate.resolve();
  const conflict = await conflictPending;
  assert.equal(conflict.error_code, "request_identity_conflict");
  assert.equal(fake.calls.length, 1);
  assert.equal((await first).ok, true);
});

test("protocol mismatch, manifest mismatch, and missing capability fail before request", async () => {
  for (const [runtime, errorCode] of [
    [fakeRuntime({ protocolVersion: "2.0.0" }), "protocol_mismatch"],
    [fakeRuntime({ protocolHash: "0".repeat(64) }), "protocol_hash_mismatch"],
    [fakeRuntime({ manifestRange: ">=2 <3" }), "consumer_manifest_mismatch"],
    [fakeRuntime({ capabilities: ["chat-text"] }), "capability_unavailable"],
  ]) {
    const client = clientApi.createClient({ app: appWith({ value: runtime.runtime }) });
    const result = await client.requestStructured(structuredInput());
    assert.equal(result.ok, false, errorCode);
    assert.equal(result.error_code, errorCode);
    assert.equal(runtime.calls.length, 0, errorCode);
  }
});

test("runtime reload or removal during a request rejects the stale response", async () => {
  const gate = deferred();
  const first = fakeRuntime({
    requestStructured(request) {
      return gate.promise.then(() => ({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: request.request_id,
        status: "completed",
        payload: { stale: true },
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      }));
    },
  });
  const current = { value: first.runtime };
  const client = clientApi.createClient({ app: appWith(current) });
  const pending = client.requestStructured(structuredInput());
  current.value = fakeRuntime({ epoch: "epoch-test-2" }).runtime;
  gate.resolve();
  assert.deepEqual(await pending, { ok: false, status: "failed", error_code: "stale_runtime_epoch", deterministic_available: true });

  const removedGate = deferred();
  const removed = fakeRuntime({
    requestStructured(request) {
      return removedGate.promise.then(() => ({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: request.request_id,
        status: "completed",
        payload: {},
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      }));
    },
  });
  current.value = removed.runtime;
  const removedPending = client.requestStructured(structuredInput({ attempt_id: "attempt-removed" }));
  current.value = null;
  removedGate.resolve();
  assert.equal((await removedPending).error_code, "runtime_unavailable");
});

test("unknown consumers, oversized inputs, and response identity drift fail closed", async () => {
  const fake = fakeRuntime();
  const client = clientApi.createClient({ app: appWith({ value: fake.runtime }) });
  assert.equal((await client.requestStructured(structuredInput({ consumer_id: "unknown.consumer" }))).error_code, "unknown_consumer");
  assert.equal((await client.requestStructured(structuredInput({ prompt: "x".repeat(70000) }))).error_code, "request_too_large");
  assert.equal(fake.calls.length, 0);

  const drift = fakeRuntime({
    requestStructured(request) {
      return Promise.resolve({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: `${request.request_id}-wrong`,
        status: "completed",
        payload: {},
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      });
    },
  });
  const driftClient = clientApi.createClient({ app: appWith({ value: drift.runtime }) });
  assert.equal((await driftClient.requestStructured(structuredInput())).error_code, "response_identity_mismatch");
});

test("caller schema and runtime payload stay mutable because the client clones protocol values", async () => {
  const schema = { type: "object", properties: { value: { type: "string" } } };
  const payload = { value: "ok" };
  const fake = fakeRuntime({
    requestStructured(request) {
      return Promise.resolve({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: request.request_id,
        status: "completed",
        payload,
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      });
    },
  });
  const client = clientApi.createClient({ app: appWith({ value: fake.runtime }) });
  const result = await client.requestStructured(structuredInput({ schema }));
  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(schema), false);
  assert.equal(Object.isFrozen(schema.properties), false);
  assert.equal(Object.isFrozen(payload), false);
  assert.notStrictEqual(result.payload, payload);
});

test("oversized or non-JSON runtime output and status fail closed", async () => {
  const oversized = fakeRuntime({
    requestStructured(request) {
      return Promise.resolve({
        protocol_version: clientApi.PROTOCOL_VERSION,
        runtime_epoch: "epoch-test-1",
        request_id: request.request_id,
        status: "completed",
        payload: { value: "x".repeat(140000) },
        receipt: { consumer_id: request.consumer_id, attempt_id: request.attempt_id },
      });
    },
  });
  const oversizedClient = clientApi.createClient({ app: appWith({ value: oversized.runtime }) });
  assert.equal((await oversizedClient.requestStructured(structuredInput())).error_code, "output_too_large");

  const cyclic = {};
  cyclic.self = cyclic;
  const malformed = fakeRuntime({ status: cyclic });
  const malformedClient = clientApi.createClient({ app: appWith({ value: malformed.runtime }) });
  assert.equal(malformedClient.getStatus().error_code, "malformed_runtime_response");
});

test("provider discovery wrappers and subscriptions expose only cloned protocol data", async () => {
  const providerRows = [{ profile_id: "profile-1", status: "ready" }];
  const fake = fakeRuntime({ providers: providerRows, models: [{ id: "model-1" }] });
  const client = clientApi.createClient({ app: appWith({ value: fake.runtime }) });
  const listed = client.listProviders();
  assert.deepEqual(listed, providerRows);
  assert.notStrictEqual(listed, providerRows);
  assert.deepEqual(client.listModels(), [{ id: "model-1" }]);
  assert.equal(client.resolveProvider("project.workflow_draft").status, "ready");
  assert.equal(client.getConsentRequirement("project.workflow_draft").status, "consent_required");
  assert.equal((await client.grantConsumer("project.workflow_draft")).status, "granted");
  let event = null;
  const unsubscribe = client.subscribeStatus((value) => { event = value; });
  const emitted = { status: "degraded" };
  fake.runtime.listener(emitted);
  assert.deepEqual(event, emitted);
  assert.notStrictEqual(event, emitted);
  assert.equal(Object.isFrozen(emitted), false);
  unsubscribe();
  assert.doesNotThrow(() => client.subscribeStatus(null));
});

test("cancel and status use deterministic identity without prompt or provider knowledge", () => {
  const fake = fakeRuntime();
  const client = clientApi.createClient({ app: appWith({ value: fake.runtime }) });
  const identity = {
    consumer_id: "project.workflow_draft",
    owner_session_id: "project-wizard-1",
    operation_id: "operation-project-1",
    attempt_id: "attempt-1",
  };
  const result = client.cancel(identity);
  assert.equal(result.status, "cancel_requested");
  assert.match(result.request_id, /^[0-9a-f]{64}$/u);
  assert.deepEqual(fake.calls, [{ cancel: result.request_id }]);
  assert.deepEqual(client.getRequestStatus(identity), { status: "running", request_id: result.request_id });
  assert.equal(client.getRequestStatus({}).error_code, "invalid_request_identity");
});
