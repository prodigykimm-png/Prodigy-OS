"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const antigravity = require(path.join(ROOT, "SYSTEM/Views/antigravity-exec-service.js"));

function fakeChildProcess(output, exitCode) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.once = child.once.bind(child);
  process.nextTick(() => {
    if (output) child.stdout.emit("data", Buffer.from(output));
    child.emit("close", exitCode, null);
  });
  return child;
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
    getCommand: () => "agy"
  });

  const payload = await service.requestStructuredJson({
    provider: antigravity.DEFAULT_PROVIDER,
    prompt: "저널 분석 fixture",
    schema
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "agy");
  assert.equal(calls[0].options.shell, false);
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
  await assert.rejects(service.requestChatText({ provider: { ...antigravity.DEFAULT_PROVIDER, command: "<task-temp>/unapproved" }, prompt: "fixture" }), /공식 agy/u);
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
    for (const attack of ["<task-temp>/env-evil", "./agy", "agy; touch <task-temp>/pwn", "alternate-agy"]) {
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

async function main() {
  await testStructuredRequestUsesPrintModeAndSchema();
  await testChatRequestExtractsJsonResponse();
  await testRejectsCallerSelectedBinaryAndDisabledSandboxBeforeSpawn();
  await testRejectsEveryUnknownPublicOptionBeforeBoundaryEffects();
  await testEnvironmentCannotOverrideOfficialExecutable();
  await testRelayUrlValidationPrecedesSecretAndNetwork();
  await testRelayErrorsAreSanitizedBeforeTheyBecomeUserFacing();
  await testMobileStructuredRequestUsesRelayAndSecretStorage();
  await testMobileRelayRejectsDirectTokenInjection();
  console.log("Antigravity exec service tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main, testMobileStructuredRequestUsesRelayAndSecretStorage };
