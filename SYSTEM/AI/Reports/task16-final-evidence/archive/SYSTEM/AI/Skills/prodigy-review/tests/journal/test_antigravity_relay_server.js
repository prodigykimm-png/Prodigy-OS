"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const relay = require(path.join(ROOT, "SYSTEM/SCRIPTS/antigravity-relay-server.js"));

function request(port, options) {
  return new Promise((resolve, reject) => {
    const requestOptions = Object.assign({ hostname: "127.0.0.1", port, method: "GET", path: "/healthz" }, options || {});
    const req = http.request(requestOptions, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: body ? JSON.parse(body) : null }));
    });
    req.on("error", reject);
    if (requestOptions.body) req.write(requestOptions.body);
    req.end();
  });
}

async function withServer(service, run) {
  const logs = [];
  const instance = relay.createRelayServer({
    config: { host: "127.0.0.1", port: 0, path: "/v1/antigravity", token: "relay-secret", model: "gemini-test", agyBin: "agy", cwd: ROOT },
    service,
    logger: (line) => logs.push(line)
  });
  await new Promise((resolve) => instance.server.listen(0, "127.0.0.1", resolve));
  const port = instance.server.address().port;
  try {
    return await run(port, logs);
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
}

async function testRelayRequiresAuthAndExposesHealthOnly() {
  await withServer({ requestStructuredJson: async () => ({ ok: true }), requestChatText: async () => "ok" }, async (port) => {
    const health = await request(port);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { ok: true, service: "antigravity-relay" });
    const unauthorized = await request(port, {
      method: "POST",
      path: "/v1/antigravity",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "chat", prompt: "fixture" })
    });
    assert.equal(unauthorized.status, 401);
  });
}

async function testStructuredRelayForwardsOnlyValidatedRequest() {
  const calls = [];
  await withServer({
    requestStructuredJson: async (options) => {
      calls.push(options);
      return { evidence_blocks: [], knowledge_candidates: [] };
    },
    requestChatText: async () => "unused"
  }, async (port, logs) => {
    const response = await request(port, {
      method: "POST",
      path: "/v1/antigravity",
      headers: { "Content-Type": "application/json", Authorization: "Bearer relay-secret" },
      body: JSON.stringify({ kind: "structured", model: "claude-sonnet-4-6", prompt: "fixture", schema: { type: "object" } })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.structured_output, { evidence_blocks: [], knowledge_candidates: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider.model, "claude-sonnet-4-6");
    assert.equal(calls[0].provider.command, "agy");
    assert.doesNotMatch(logs.join("\n"), /relay-secret|fixture/);
  });
}

async function testRelaySerializesRequestsToLimitChildMemory() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  await withServer({
    requestStructuredJson: async () => {
      calls += 1;
      await gate;
      return { ok: true };
    },
    requestChatText: async () => "unused"
  }, async (port) => {
    const body = JSON.stringify({ kind: "structured", prompt: "fixture", schema: { type: "object" } });
    const first = request(port, { method: "POST", path: "/v1/antigravity", headers: { "Content-Type": "application/json", Authorization: "Bearer relay-secret" }, body });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await request(port, { method: "POST", path: "/v1/antigravity", headers: { "Content-Type": "application/json", Authorization: "Bearer relay-secret" }, body });
    assert.equal(second.status, 429);
    release();
    const firstResponse = await first;
    assert.equal(firstResponse.status, 200);
    assert.equal(calls, 1);
  });
}

async function main() {
  assert.throws(() => relay.configFromEnv({}), /ANTIGRAVITY_RELAY_TOKEN/);
  await testRelayRequiresAuthAndExposesHealthOnly();
  await testStructuredRelayForwardsOnlyValidatedRequest();
  await testRelaySerializesRequestsToLimitChildMemory();
  console.log("Antigravity relay server tests passed");
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });

module.exports = { main };
