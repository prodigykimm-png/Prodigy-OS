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
  const calls = [];
  const schema = { type: "object", properties: { ok: { type: "boolean" }, kind: { type: "string", enum: ["fixture"] } } };
  const child = fakeChildProcess(JSON.stringify({ status: "SUCCESS", structured_output: { ok: true } }), 0);
  const service = antigravity.createService({
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return child;
    },
    getCommand: () => "/Users/test/.local/bin/agy"
  });

  const payload = await service.requestStructuredJson({
    provider: antigravity.DEFAULT_PROVIDER,
    prompt: "저널 분석 fixture",
    schema
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/Users/test/.local/bin/agy");
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
      secretStorage: { getSecret: async (name) => name === antigravity.RELAY_TOKEN_SECRET ? "test-relay-token-placeholder" : "" },
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
  assert.equal(calls[0].headers.Authorization, "Bearer test-relay-token-placeholder");
  const body = JSON.parse(calls[0].body);
  assert.equal(body.kind, "structured");
  assert.equal(body.model, "gemini-3.6-flash-medium");
  assert.equal(body.prompt, "모바일 저널 분석 fixture");
}

async function main() {
  await testStructuredRequestUsesPrintModeAndSchema();
  await testChatRequestExtractsJsonResponse();
  await testMobileStructuredRequestUsesRelayAndSecretStorage();
  console.log("Antigravity exec service tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main, testMobileStructuredRequestUsesRelayAndSecretStorage };
