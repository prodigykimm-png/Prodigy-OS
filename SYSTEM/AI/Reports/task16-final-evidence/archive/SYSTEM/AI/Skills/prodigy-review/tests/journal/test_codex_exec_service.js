"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const codex = require(path.join(ROOT, "SYSTEM/Views/codex-exec-service.js"));

function fakeChildProcess(output, exitCode) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    writes: [],
    write(value) { this.writes.push(String(value)); },
    end() {
      process.nextTick(() => {
        if (output) child.stdout.emit("data", Buffer.from(output));
        child.emit("close", exitCode, null);
      });
    }
  };
  return child;
}

async function testStructuredRequestUsesOfficialCliBoundary() {
  const calls = [];
  const child = fakeChildProcess(JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: JSON.stringify({ evidence_blocks: [] }) }
  }), 0);
  const service = codex.createService({
    spawn(command, args, options) {
      calls.push({ command, args, options, child });
      return child;
    },
    getCommand: () => "/Applications/ChatGPT.app/Contents/Resources/codex"
  });

  const payload = await service.requestStructuredJson({
    provider: codex.DEFAULT_PROVIDER,
    prompt: "저널 분석 fixture",
    schema: { type: "object", properties: { evidence_blocks: { type: "array" } } }
  });

  assert.deepEqual(payload, { evidence_blocks: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/Applications/ChatGPT.app/Contents/Resources/codex");
  assert.deepEqual(calls[0].args.slice(0, 6), ["exec", "--json", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check"]);
  assert.equal(calls[0].args.at(-1), "-");
  assert.equal(calls[0].options.shell, false);
  assert.match(child.stdin.writes.join(""), /저널 분석 fixture/);
  assert.match(child.stdin.writes.join(""), /evidence_blocks/);
  assert.doesNotMatch(JSON.stringify(calls[0]), /api[_-]?key|cookie|auth\.json/i);
}

async function testChatRequestExtractsAgentMessage() {
  const child = fakeChildProcess([
    JSON.stringify({ type: "thread.started" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Codex 응답" } })
  ].join("\n"), 0);
  const service = codex.createService({ spawn: () => child, getCommand: () => "codex" });

  const result = await service.requestChatText({ provider: codex.DEFAULT_PROVIDER, prompt: "fixture" });

  assert.equal(result, "Codex 응답");
}

async function testRejectsCallerSelectedBinaryAndUnsafeSandboxBeforeSpawn() {
  let spawns = 0;
  const service = codex.createService({ spawn: () => { spawns += 1; return fakeChildProcess("", 0); } });
  await assert.rejects(service.requestChatText({ provider: { ...codex.DEFAULT_PROVIDER, command: "<task-temp>/unapproved" }, prompt: "fixture" }), /공식 codex/u);
  await assert.rejects(service.requestChatText({ provider: { ...codex.DEFAULT_PROVIDER, command: "codex", sandbox: "danger-full-access" }, prompt: "fixture" }), /read-only/u);
  assert.equal(spawns, 0);
}

async function testRejectsEveryUnknownPublicOptionBeforeSpawn() {
  const attacks = [
    { executionMode: "unsafe" },
    { allowTools: true },
    { unknownScalar: 7 },
    { unknownObject: { enabled: true } },
    { unknownFunction() {} }
  ];
  let spawns = 0;
  const service = codex.createService({ spawn: () => { spawns += 1; return fakeChildProcess("", 0); } });
  for (const attack of attacks) {
    await assert.rejects(service.requestChatText({ provider: codex.DEFAULT_PROVIDER, prompt: "fixture", ...attack }), /알 수 없는.*옵션/u);
  }
  await assert.rejects(
    service.requestChatText({ provider: { ...codex.DEFAULT_PROVIDER, unknownObject: {} }, prompt: "fixture" }),
    /알 수 없는.*provider/u
  );
  assert.equal(spawns, 0);
}

async function testEnvironmentCannotOverrideOfficialExecutable() {
  const previous = process.env.CODEX_BIN;
  try {
    for (const attack of ["<task-temp>/env-evil", "./codex", "codex; touch <task-temp>/pwn", "alternate-codex"]) {
      process.env.CODEX_BIN = attack;
      let spawns = 0;
      const service = codex.createService({ spawn: () => { spawns += 1; return fakeChildProcess("", 0); } });
      await assert.rejects(service.requestChatText({ provider: codex.DEFAULT_PROVIDER, prompt: "fixture" }), /CODEX_BIN|공식.*실행/u);
      assert.equal(spawns, 0);
    }
  } finally {
    if (previous === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previous;
  }
}

async function main() {
  await testStructuredRequestUsesOfficialCliBoundary();
  await testChatRequestExtractsAgentMessage();
  await testRejectsCallerSelectedBinaryAndUnsafeSandboxBeforeSpawn();
  await testRejectsEveryUnknownPublicOptionBeforeSpawn();
  await testEnvironmentCannotOverrideOfficialExecutable();
  console.log("Codex exec service tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
