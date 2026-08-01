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

async function main() {
  await testStructuredRequestUsesOfficialCliBoundary();
  await testChatRequestExtractsAgentMessage();
  console.log("Codex exec service tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
