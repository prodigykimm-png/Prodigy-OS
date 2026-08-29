"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { spawn: spawnChild } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const antigravity = require(path.join(ROOT, "SYSTEM/Views/antigravity-exec-service.js"));

function fixtureStream() {
  const stream = new EventEmitter();
  stream.destroyed = false;
  stream.destroyCalls = 0;
  stream.unrefCalls = 0;
  stream.destroy = () => { stream.destroyed = true; stream.destroyCalls += 1; };
  stream.unref = () => { stream.unrefCalls += 1; };
  return stream;
}

function processFixture(schedule, options = {}) {
  const child = new EventEmitter();
  child.stdout = fixtureStream();
  child.stderr = fixtureStream();
  child.killCalls = [];
  child.unrefCalls = 0;
  child.kill = (signal) => { child.killCalls.push(signal); return options.killResult === undefined ? true : options.killResult; };
  child.unref = () => { child.unrefCalls += 1; };
  process.nextTick(() => schedule(child));
  return child;
}

function fakeChildProcess(output, exitCode) {
  return processFixture((child) => {
    if (output) child.stdout.emit("data", Buffer.from(output));
    child.stdout.emit("end");
    child.stderr.emit("end");
    child.emit("close", exitCode, null);
  });
}

function serviceForChild(child, dependencies = {}) {
  return antigravity.createService({
    spawn: () => child,
    getCommand: () => "agy",
    ...dependencies
  });
}

function serviceForRealFixture(mode, dependencies = {}) {
  const fixture = path.join(__dirname, "fixtures/antigravity_process_child.js");
  return antigravity.createService({
    spawn: () => spawnChild(process.execPath, [fixture, mode], { stdio: ["ignore", "pipe", "pipe"] }),
    getCommand: () => "agy",
    ...dependencies
  });
}

const VALID_STRUCTURED_PREFIX = '{"status":"SUCCESS","structured_output":';
const VALID_STRUCTURED_SUFFIX = '{"ok":true}}';

async function requestFixture(service, options = {}) {
  return service.requestStructuredJson({
    provider: antigravity.DEFAULT_PROVIDER,
    prompt: "provider-free lifecycle fixture",
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    ...options
  });
}

async function testRealChildExitCompletesWhenDescendantRetainsStdio() {
  const result = await requestFixture(serviceForRealFixture("exit-retained-stdio", { drainTimeoutMs: 10 }), { timeoutMs: 1000 });
  assert.deepEqual(result, { ok: true });
}

async function testRealChildExitCapturesDelayedBoundedDrain() {
  const result = await requestFixture(serviceForRealFixture("exit-delayed-drain", { drainTimeoutMs: 1000 }), { timeoutMs: 1000 });
  assert.deepEqual(result, { ok: true });
}

async function testRealChildNormalClosePath() {
  const result = await requestFixture(serviceForRealFixture("normal-close"), { timeoutMs: 1000 });
  assert.deepEqual(result, { ok: true });
}

async function testSuccessfulExitCompletesWithoutCloseAfterBoundedDrain() {
  const child = processFixture((fixture) => {
    fixture.stdout.emit("data", Buffer.from(VALID_STRUCTURED_PREFIX + VALID_STRUCTURED_SUFFIX));
    fixture.emit("exit", 0, null);
  });
  const result = await requestFixture(serviceForChild(child, { drainTimeoutMs: 5 }), { timeoutMs: 100 });
  assert.deepEqual(result, { ok: true });
  assert.equal(child.stdout.destroyCalls, 1);
  assert.equal(child.stderr.destroyCalls, 1);
  assert.equal(child.stdout.unrefCalls, 1);
  assert.equal(child.stderr.unrefCalls, 1);
  assert.equal(child.unrefCalls, 1, "an exited child with retained descendant stdio must be detached after bounded drain");
  assert.deepEqual(child.killCalls, [], "successful exit must not be reported as a termination request");
}

async function testExitWaitsForDelayedBoundedStdoutAndStderrDrain() {
  const child = processFixture((fixture) => {
    fixture.stdout.emit("data", Buffer.from(VALID_STRUCTURED_PREFIX));
    fixture.emit("exit", 0, null);
    setImmediate(() => {
      fixture.stderr.emit("data", Buffer.from("bounded diagnostic"));
      fixture.stdout.emit("data", Buffer.from(VALID_STRUCTURED_SUFFIX));
      fixture.stdout.emit("end");
      fixture.stderr.emit("end");
    });
  });
  const result = await requestFixture(serviceForChild(child, { drainTimeoutMs: 100 }), { timeoutMs: 100 });
  assert.deepEqual(result, { ok: true });
  assert.equal(child.stdout.destroyCalls, 0, "completed stream drain must not be destroyed");
  assert.equal(child.stderr.destroyCalls, 0);
}

async function testNormalCloseFallbackStillCompletes() {
  const child = fakeChildProcess(VALID_STRUCTURED_PREFIX + VALID_STRUCTURED_SUFFIX, 0);
  assert.deepEqual(await requestFixture(serviceForChild(child)), { ok: true });
}

async function testLifecycleFailuresAndTerminationDeliveryAreHonest() {
  const spawnErrorChild = processFixture((fixture) => fixture.emit("error", Object.assign(new Error("spawn failed"), { code: "EACCES" })));
  await assert.rejects(requestFixture(serviceForChild(spawnErrorChild)), /프로세스를 실행하지 못했습니다/u);

  const nonzeroChild = processFixture((fixture) => {
    fixture.stderr.emit("data", Buffer.from("bounded failure"));
    fixture.stdout.emit("end");
    fixture.stderr.emit("end");
    fixture.emit("exit", 7, null);
  });
  await assert.rejects(requestFixture(serviceForChild(nonzeroChild)), (error) => error.exitCode === 7 && error.signal === null);

  const signalChild = processFixture((fixture) => {
    fixture.stdout.emit("end");
    fixture.stderr.emit("end");
    fixture.emit("exit", null, "SIGKILL");
  });
  await assert.rejects(requestFixture(serviceForChild(signalChild)), (error) => error.exitCode === null && error.signal === "SIGKILL" && /SIGKILL/u.test(error.message));

  const timeoutChild = processFixture(() => {}, { killResult: false });
  await assert.rejects(requestFixture(serviceForChild(timeoutChild), { timeoutMs: 5 }), (error) => {
    assert.deepEqual(error.termination, { requestedSignal: "SIGTERM", signalDeliveryReported: false });
    return /초과/u.test(error.message);
  });
  assert.deepEqual(timeoutChild.killCalls, ["SIGTERM"]);

  const deliveryReportedChild = processFixture(() => {}, { killResult: true });
  await assert.rejects(requestFixture(serviceForChild(deliveryReportedChild), { timeoutMs: 5 }), (error) => {
    assert.deepEqual(error.termination, { requestedSignal: "SIGTERM", signalDeliveryReported: true });
    assert.equal(Object.prototype.hasOwnProperty.call(error.termination, "processExited"), false, "signal delivery must not claim unobserved process death");
    return true;
  });

  const controller = new AbortController();
  const abortChild = processFixture(() => {}, { killResult: false });
  const pending = requestFixture(serviceForChild(abortChild), { signal: controller.signal, timeoutMs: 100 });
  controller.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(error.name, "AbortError");
    assert.deepEqual(error.termination, { requestedSignal: "SIGTERM", signalDeliveryReported: false });
    return true;
  });
  assert.deepEqual(abortChild.killCalls, ["SIGTERM"]);
}

async function testExitCloseRaceSettlesExactlyOnce() {
  const child = processFixture((fixture) => {
    fixture.stdout.emit("data", Buffer.from(VALID_STRUCTURED_PREFIX + VALID_STRUCTURED_SUFFIX));
    fixture.stdout.emit("end");
    fixture.stderr.emit("end");
    fixture.emit("exit", 0, null);
    fixture.emit("close", 9, null);
    fixture.emit("error", new Error("late error must not replace settled success"));
  });
  assert.deepEqual(await requestFixture(serviceForChild(child)), { ok: true });
  assert.deepEqual(child.killCalls, []);
}

async function testStructuredRequestUsesPrintModeAndSchema() {
  assert.equal(antigravity.DEFAULT_PROVIDER.structuredTimeoutMs, 120000, "long structured analysis must not keep the 60-second timeout");
  const calls = [];
  const schema = { type: "object", properties: { ok: { type: "boolean" }, kind: { type: "string", enum: ["fixture"] } } };
  const child = fakeChildProcess(JSON.stringify({ status: "SUCCESS", structured_output: { ok: true } }), 0);
  const service = antigravity.createService({
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return child;
    },
    getCommand: () => "agy",
    getCwd: () => "/tmp/prodigy-antigravity-runtime"
  });

  const payload = await service.requestStructuredJson({
    app: { vault: { adapter: { basePath: "/vault/with-agent-instructions" } } },
    provider: antigravity.DEFAULT_PROVIDER,
    prompt: "저널 분석 fixture",
    schema
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "agy");
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.cwd, "/tmp/prodigy-antigravity-runtime", "structured requests run outside the vault so the model has no project tools to inspect");
  assert.notEqual(calls[0].options.cwd, "/vault/with-agent-instructions");
  assert.equal(calls[0].args[0], "-p");
  assert.match(calls[0].args[1], /저널 분석 fixture/);
  assert.equal(calls[0].args.at(-1), "--disable-slash-commands");
  const normalizedSchema = JSON.parse(calls[0].args[calls[0].args.indexOf("--json-schema") + 1]);
  assert.equal(normalizedSchema.properties.kind.enum, undefined);
  assert.equal(normalizedSchema.properties.kind.type, "string");
  assert.doesNotMatch(JSON.stringify(calls[0]), /api[_-]?key|cookie|auth\.json/i);
}

async function testChatRequestExtractsJsonResponse() {
  const child = fakeChildProcess(JSON.stringify({ status: "SUCCESS", response: "Antigravity 응답\n" }), 0);
  const service = antigravity.createService({ spawn: () => child, getCommand: () => "agy" });

  const result = await service.requestChatText({ provider: antigravity.DEFAULT_PROVIDER, prompt: "fixture" });

  assert.equal(result, "Antigravity 응답");
}

async function testMobileStructuredRequestUsesRelayAndSecretStorage() {
  const calls = [];
  const service = antigravity.createService();
  const result = await service.requestStructuredJson({
    app: {
      isMobile: true,
      secretStorage: { getSecret: async (name) => name === antigravity.RELAY_TOKEN_SECRET ? "relay-secret" : "" },
      requestUrl: async (options) => {
        calls.push(options);
        return { status: 200, json: { structured_output: { ok: true } } };
      }
    },
    provider: Object.assign({}, antigravity.DEFAULT_PROVIDER, {
      relayURL: "https://youngjae-macmini-2.tail1992b9.ts.net:8443/v1/antigravity"
    }),
    prompt: "모바일 저널 분석 fixture",
    schema: { type: "object", properties: { ok: { type: "boolean" } } }
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://youngjae-macmini-2.tail1992b9.ts.net:8443/v1/antigravity");
  assert.equal(calls[0].headers.Authorization, "Bearer relay-secret");
  const body = JSON.parse(calls[0].body);
  assert.equal(body.kind, "structured");
  assert.equal(body.model, "gemini-3.6-flash-medium");
  assert.equal(body.prompt, "모바일 저널 분석 fixture");
}

async function testMobileRelayRejectsDirectTokenInjection() {
  let requests = 0;
  const service = antigravity.createService();
  await assert.rejects(
    service.requestStructuredJson({
      app: {
        isMobile: true,
        secretStorage: { getSecret: async () => "" },
        requestUrl: async () => { requests += 1; return { status: 200, json: { structured_output: { ok: true } } }; }
      },
      provider: Object.assign({}, antigravity.DEFAULT_PROVIDER, {
        relayURL: "https://fixture.ts.net/v1/antigravity"
      }),
      relayToken: "direct-bypass",
      prompt: "fixture",
      schema: { type: "object" }
    }),
    /SecretStorage|직접.*토큰|허용되지/u
  );
  assert.equal(requests, 0, "direct relay token must fail before network");
}

async function testRejectsCallerSelectedBinaryAndDisabledSandboxBeforeSpawn() {
  let spawns = 0;
  const service = antigravity.createService({ spawn: () => { spawns += 1; return fakeChildProcess("", 0); } });
  await assert.rejects(service.requestChatText({ provider: { ...antigravity.DEFAULT_PROVIDER, command: "/tmp/unapproved" }, prompt: "fixture" }), /공식 agy/u);
  await assert.rejects(service.requestChatText({ provider: { ...antigravity.DEFAULT_PROVIDER, command: "agy", sandbox: false }, prompt: "fixture" }), /sandbox/u);
  assert.equal(spawns, 0);
}

async function testRejectsEveryUnknownPublicOptionBeforeBoundaryEffects() {
  const attacks = [
    { executionMode: "unsafe" },
    { allowTools: true },
    { unknownScalar: 7 },
    { unknownObject: { enabled: true } },
    { unknownFunction() {} }
  ];
  let spawns = 0;
  const service = antigravity.createService({ spawn: () => { spawns += 1; return fakeChildProcess("", 0); } });
  for (const attack of attacks) {
    await assert.rejects(service.requestChatText({ provider: antigravity.DEFAULT_PROVIDER, prompt: "fixture", ...attack }), /알 수 없는.*옵션/u);
  }
  await assert.rejects(
    service.requestChatText({ provider: { ...antigravity.DEFAULT_PROVIDER, unknownObject: {} }, prompt: "fixture" }),
    /알 수 없는.*provider/u
  );
  assert.equal(spawns, 0);
}

async function testEnvironmentCannotOverrideOfficialExecutable() {
  const previous = process.env.AGY_BIN;
  try {
    for (const attack of ["/tmp/env-evil", "./agy", "agy; touch /tmp/pwn", "alternate-agy"]) {
      process.env.AGY_BIN = attack;
      let spawns = 0;
      const service = antigravity.createService({ spawn: () => { spawns += 1; return fakeChildProcess("", 0); } });
      await assert.rejects(service.requestChatText({ provider: antigravity.DEFAULT_PROVIDER, prompt: "fixture" }), /AGY_BIN|공식.*실행/u);
      assert.equal(spawns, 0);
    }
  } finally {
    if (previous === undefined) delete process.env.AGY_BIN;
    else process.env.AGY_BIN = previous;
  }
}

async function testRelayUrlValidationPrecedesSecretAndNetwork() {
  const attacks = [
    "https://evil.example/v1/antigravity",
    "http://fixture.ts.net/v1/antigravity",
    "https://user:pass@fixture.ts.net/v1/antigravity",
    "https://fixture.ts.net/v1/antigravity#fragment",
    "https://localhost/v1/antigravity",
    "https://127.0.0.1/v1/antigravity",
    "not a URL"
  ];
  const service = antigravity.createService();
  for (const relayURL of attacks) {
    let secretReads = 0;
    let requests = 0;
    await assert.rejects(service.requestChatText({
      app: {
        isMobile: true,
        secretStorage: { getSecret: async () => { secretReads += 1; return "relay-secret"; } },
        requestUrl: async () => { requests += 1; return { status: 200, json: { response: "unsafe" } }; }
      },
      provider: { ...antigravity.DEFAULT_PROVIDER, relayURL },
      prompt: "fixture"
    }), /Tailscale|중계 URL/u);
    assert.equal(secretReads, 0, `${relayURL} read SecretStorage before URL rejection`);
    assert.equal(requests, 0, `${relayURL} reached network`);
  }
}

async function testRelayErrorsAreSanitizedBeforeTheyBecomeUserFacing() {
  const secrets = [
    "SENSITIVE_TOKEN_12345678901234567890",
    "BEARER_SECRET_12345678901234567890",
    "API_KEY_SECRET_12345678901234567890",
    "JSON_SECRET_12345678901234567890"
  ];
  const payloads = [
    { error: `Antigravity token ${secrets[0]}` },
    { error: `Authorization: Bearer ${secrets[1]}` },
    { error: `api_key=${secrets[2]}` },
    { error: JSON.stringify({ secret: secrets[3], stack: "/private/source.js:1" }) }
  ];
  const service = antigravity.createService();
  for (const payload of payloads) {
    await assert.rejects(service.requestChatText({
      app: {
        isMobile: true,
        secretStorage: { getSecret: async () => "relay-secret" },
        requestUrl: async () => ({ status: 502, json: payload })
      },
      provider: { ...antigravity.DEFAULT_PROVIDER, relayURL: "https://fixture.ts.net/v1/antigravity" },
      prompt: "fixture"
    }), (error) => {
      const surfaced = `${error.message}\n${error.stack || ""}`;
      for (const secret of secrets) assert.equal(surfaced.includes(secret), false);
      assert.doesNotMatch(surfaced, /api_key|Authorization: Bearer|\/private\/source\.js/u);
      assert.match(error.message, /Antigravity 중계.*HTTP 502/u);
      return true;
    });
  }

  await assert.rejects(service.requestChatText({
    app: {
      isMobile: true,
      secretStorage: { getSecret: async () => "relay-secret" },
      requestUrl: async () => ({ status: 503, json: { error: { code: "UPSTREAM_BUSY", message: "safe detail" } } })
    },
    provider: { ...antigravity.DEFAULT_PROVIDER, relayURL: "https://fixture.ts.net/v1/antigravity" },
    prompt: "fixture"
  }), /HTTP 503.*UPSTREAM_BUSY/u);
}

async function testLoginFailureIsActionableWithoutRawDiagnostics() {
  const child = fakeChildProcess(JSON.stringify({
    status: "ERROR",
    response: "",
    error: "Google login required before this request"
  }), 1);
  const service = antigravity.createService({
    spawn: () => child,
    getCommand: () => "agy",
    getCwd: () => "/tmp/prodigy-antigravity-runtime"
  });
  await assert.rejects(
    service.requestStructuredJson({
      provider: antigravity.DEFAULT_PROVIDER,
      prompt: "fixture",
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
    }),
    (error) => {
      assert.match(error.message, /Antigravity Google 로그인이 필요합니다/u);
      assert.doesNotMatch(error.message, /Google login required before this request/u);
      return true;
    }
  );
}

async function testQuotaFailureIsDistinctFromConnectionFailure() {
  const child = fakeChildProcess(JSON.stringify({
    status: "ERROR",
    response: "",
    error: "Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 1h49m58s."
  }), 1);
  const service = antigravity.createService({
    spawn: () => child,
    getCommand: () => "agy",
    getCwd: () => "/tmp/prodigy-antigravity-runtime"
  });
  await assert.rejects(
    service.requestStructuredJson({
      provider: antigravity.DEFAULT_PROVIDER,
      prompt: "fixture",
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }
    }),
    (error) => {
      assert.equal(error.code, "ANTIGRAVITY_QUOTA_EXHAUSTED");
      assert.match(error.message, /사용 한도/u);
      assert.match(error.message, /1시간 49분 58초/u);
      assert.doesNotMatch(error.message, /upgrade your subscription/u);
      return true;
    }
  );
}

async function main() {
  await testRealChildExitCompletesWhenDescendantRetainsStdio();
  await testRealChildExitCapturesDelayedBoundedDrain();
  await testRealChildNormalClosePath();
  await testSuccessfulExitCompletesWithoutCloseAfterBoundedDrain();
  await testExitWaitsForDelayedBoundedStdoutAndStderrDrain();
  await testNormalCloseFallbackStillCompletes();
  await testLifecycleFailuresAndTerminationDeliveryAreHonest();
  await testExitCloseRaceSettlesExactlyOnce();
  await testStructuredRequestUsesPrintModeAndSchema();
  await testChatRequestExtractsJsonResponse();
  await testRejectsCallerSelectedBinaryAndDisabledSandboxBeforeSpawn();
  await testRejectsEveryUnknownPublicOptionBeforeBoundaryEffects();
  await testEnvironmentCannotOverrideOfficialExecutable();
  await testRelayUrlValidationPrecedesSecretAndNetwork();
  await testRelayErrorsAreSanitizedBeforeTheyBecomeUserFacing();
  await testMobileStructuredRequestUsesRelayAndSecretStorage();
  await testMobileRelayRejectsDirectTokenInjection();
  await testLoginFailureIsActionableWithoutRawDiagnostics();
  await testQuotaFailureIsDistinctFromConnectionFailure();
  console.log("Antigravity exec service tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main, testMobileStructuredRequestUsesRelayAndSecretStorage };
