"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const runner = require(path.join(ROOT, "SYSTEM/Views/auction-real-estate-source-runner.js"));

function fakeChild(output, exitCode) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => {
    child.stdout.emit("data", Buffer.from(output));
    child.emit("close", exitCode, null);
  });
  return child;
}

test("Given an Auction Object, When the desktop runner builds args, Then only the pinned collector and providers are allowed", () => {
  const args = runner.commandArgs("/vault/Dusk", { file: { path: "PARA/PROJECTS/Auction/case.md" } });
  assert.equal(args[0], "/vault/Dusk/SYSTEM/SCRIPTS/real-estate-source-collect.js");
  assert.deepEqual(args.slice(1), [
    "--vault", "/vault/Dusk",
    "--case", "/vault/Dusk/PARA/PROJECTS/Auction/case.md",
    "--providers", "court,building,transactions,official-price,land-price"
  ]);
  assert.throws(() => runner.commandArgs("/vault/Dusk", { file: { path: "../outside.md" } }), /대상 경로/u);
});

test("Given a selected canonical identity, When the desktop runner builds args, Then selection values are passed without proxy defaults", () => {
  const args = runner.commandArgs("/vault/Dusk", { file: { path: "PARA/PROJECTS/Auction/case.md" } }, { court_code: "B000001", pnu: "1168010100101230004", unit_number: "1905" });
  assert.deepEqual(args.slice(-6), ["--court-code", "B000001", "--pnu", "1168010100101230004", "--unit-number", "1905"]);
  assert.throws(() => runner.selectionArgs({ unit_number: "1905\n--providers" }), /매칭 선택값/u);
});

test("Given a selected lawd code, When the desktop runner builds args, Then the exact region selector is passed", () => {
  assert.deepEqual(runner.selectionArgs({ lawd_cd: "11680" }), ["--lawd-cd", "11680"]);
});

test("Given an explicitly enabled proxy run, When the desktop runner starts a collector, Then only that child receives the proxy flag", async () => {
  const calls = [];
  await runner.run({ basePath: "/vault/Dusk", args: ["collector.js"], allowProxy: true, timeoutMs: 1000 }, {
    nodeCommand: "node",
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return fakeChild(JSON.stringify({ package_path: "SYSTEM/CACHE/package.json", package_id: "case-proxy" }), 0);
    }
  });
  assert.equal(calls[0].options.env.PRODIGY_REAL_ESTATE_ALLOW_PROXY, "1");
});

test("Given a proxy-enabled parent, When proxy is not requested for this run, Then the child receives an explicit deny flag", async () => {
  const calls = [];
  await runner.run({ basePath: "/vault/Dusk", args: ["collector.js"], allowProxy: false, timeoutMs: 1000 }, {
    nodeCommand: "node",
    spawn(command, args, options) { calls.push({ command, args, options }); return fakeChild(JSON.stringify({ package_path: "SYSTEM/CACHE/package.json", package_id: "case-direct" }), 0); }
  });
  assert.equal(calls[0].options.env.PRODIGY_REAL_ESTATE_ALLOW_PROXY, "0");
});

test("Given Obsidian's PATH does not expose Node, When the desktop runner resolves its executable, Then it uses a known per-user Node installation", () => {
  const home = "<home>/tester";
  const expected = `${home}/.hermes/node/bin/node`;
  assert.equal(runner.resolveNodeCommand({ HOME: home, PATH: "" }, (candidate) => candidate === expected), expected);
});

test("Given an unsafe Node override, When the desktop runner resolves its executable, Then it falls back to a trusted candidate", () => {
  assert.equal(runner.resolveNodeCommand({ PRODIGY_NODE_BIN: "<task-temp>/untrusted-node", HOME: "<home>/tester", PATH: "" }, (candidate) => candidate === "<home>/tester/.hermes/node/bin/node"), "<home>/tester/.hermes/node/bin/node");
});

test("Given Obsidian's PATH does not expose npm, When the desktop runner prepares the child environment, Then Node's bin directory is available to the collector", () => {
  const nodeBin = "<home>/tester/.hermes/node/bin/node";
  const runtimePath = runner.runtimePath(nodeBin, { HOME: "<home>/tester", PATH: "/usr/bin" });
  assert.equal(runtimePath.split(":")[0], "<home>/tester/.hermes/node/bin");
  assert.ok(runtimePath.split(":").includes("/usr/bin"));
});

test("Given collector JSON output, When the process exits successfully, Then the package identity is returned without exposing diagnostics", async () => {
  const calls = [];
  const result = await runner.run({
    basePath: "/vault/Dusk",
    args: ["SYSTEM/SCRIPTS/real-estate-source-collect.js", "--vault", "/vault/Dusk"],
    timeoutMs: 1000
  }, {
    nodeCommand: "node",
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return fakeChild("diagnostic\n{\"package_path\":\"SYSTEM/CACHE/package.json\",\"package_id\":\"case-1\"}\n", 0);
    }
  });
  assert.deepEqual(result, { package_path: "SYSTEM/CACHE/package.json", package_id: "case-1" });
  assert.equal(calls[0].command, "node");
  assert.equal(calls[0].options.cwd, "/vault/Dusk");
  assert.ok(calls[0].options.env.PATH);
  assert.equal(calls[0].options.shell, false);
});

test("Given pretty-printed collector JSON, When the process exits successfully, Then the package identity is recovered", () => {
  assert.deepEqual(runner.parseCollectorResult(`collector started\n${JSON.stringify({ package_path: "SYSTEM/CACHE/package.json", package_id: "case-2" }, null, 2)}\n`), {
    package_path: "SYSTEM/CACHE/package.json", package_id: "case-2"
  });
});

test("Given a failed collector, When the process exits nonzero, Then the runner fails without returning a partial package", async () => {
  await assert.rejects(
    runner.run({ basePath: "/vault/Dusk", args: ["collector.js"], timeoutMs: 1000 }, { spawn: () => fakeChild("{}", 1) }),
    /완료되지 않았습니다/u
  );
});

console.log("Auction real-estate source runner tests loaded");
