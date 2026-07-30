"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const repoRoot = path.resolve(__dirname, "../../../../..");
const scriptPath = path.join(repoRoot, "SYSTEM/SCRIPTS/prodigy-known-red-ledger.js");
const nodeBin = process.execPath;

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-known-red-ledger-"));
}

function runCli(args) {
  return spawnSync(nodeBin, [scriptPath, ...args], { encoding: "utf8" });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("--help exits 0 and mentions all flags", () => {
  const tmpDir = makeTempDir();
  try {
    const result = runCli(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--command/);
    assert.match(result.stdout, /--exit/);
    assert.match(result.stdout, /--log/);
    assert.match(result.stdout, /--out/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("records a green result with a clean log", () => {
  const tmpDir = makeTempDir();
  try {
    const logPath = path.join(tmpDir, "clean.log");
    const outPath = path.join(tmpDir, "ledger.json");
    writeFile(logPath, "ok\n");

    const result = runCli([
      "--command", "direct-tests",
      "--exit", "0",
      "--log", logPath,
      "--out", outPath,
    ]);

    assert.equal(result.status, 0);
    const ledger = readJson(outPath);
    assert.deepEqual(Object.keys(ledger), ["direct-tests"]);
    assert.equal(ledger["direct-tests"].command, "direct-tests");
    assert.equal(ledger["direct-tests"].exit_code, 0);
    assert.equal(ledger["direct-tests"].log, logPath);
    assert.equal(ledger["direct-tests"].first_failure, null);
    assert.equal(ledger["direct-tests"].classification, "green");
    assert.match(ledger["direct-tests"].recorded_at, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("records a red result and captures the first failure line", () => {
  const tmpDir = makeTempDir();
  try {
    const logPath = path.join(tmpDir, "red.log");
    const outPath = path.join(tmpDir, "ledger.json");
    writeFile(logPath, [
      "ok 1 - setup",
      "FAIL: synthetic",
      "AssertionError: synthetic mismatch",
    ].join("\n"));

    const result = runCli([
      "--command", "direct-tests",
      "--exit", "1",
      "--log", logPath,
      "--out", outPath,
    ]);

    assert.equal(result.status, 0);
    const ledger = readJson(outPath);
    assert.equal(ledger["direct-tests"].exit_code, 1);
    assert.notEqual(ledger["direct-tests"].classification, "green");
    assert.match(ledger["direct-tests"].first_failure, /synthetic/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("FABRICATED-GREEN GUARD never records green for non-zero exits", () => {
  const tmpDir = makeTempDir();
  try {
    for (const exitCode of [1, 2, 137]) {
      const logPath = path.join(tmpDir, `guard-${exitCode}.log`);
      const outPath = path.join(tmpDir, `ledger-${exitCode}.json`);
      writeFile(logPath, [
        "ok 1 - setup",
        "FAIL: synthetic",
        "Error: synthetic",
      ].join("\n"));

      const result = runCli([
        "--command", `guard-${exitCode}`,
        "--exit", String(exitCode),
        "--log", logPath,
        "--out", outPath,
      ]);

      assert.equal(result.status, 0);
      const ledger = readJson(outPath);
      assert.notEqual(ledger[`guard-${exitCode}`].classification, "green");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("accumulates multiple commands in one output file", () => {
  const tmpDir = makeTempDir();
  try {
    const outPath = path.join(tmpDir, "ledger.json");
    const logA = path.join(tmpDir, "a.log");
    const logB = path.join(tmpDir, "b.log");
    writeFile(logA, "ok\n");
    writeFile(logB, "FAIL: synthetic\n");

    const first = runCli([
      "--command", "first",
      "--exit", "0",
      "--log", logA,
      "--out", outPath,
    ]);
    assert.equal(first.status, 0);

    const second = runCli([
      "--command", "second",
      "--exit", "1",
      "--log", logB,
      "--out", outPath,
    ]);
    assert.equal(second.status, 0);

    const ledger = readJson(outPath);
    assert.deepEqual(Object.keys(ledger).sort(), ["first", "second"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("invalid usage exits non-zero and writes nothing", async (t) => {
  await t.test("missing --out", () => {
    const tmpDir = makeTempDir();
    try {
      const logPath = path.join(tmpDir, "missing-out.log");
      writeFile(logPath, "ok\n");

      const result = runCli([
        "--command", "missing-out",
        "--exit", "0",
        "--log", logPath,
      ]);

      assert.notEqual(result.status, 0);
      assert.equal(fs.existsSync(path.join(tmpDir, "out.json")), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("--exit notanumber", () => {
    const tmpDir = makeTempDir();
    try {
      const logPath = path.join(tmpDir, "bad-exit.log");
      const outPath = path.join(tmpDir, "bad-exit.json");
      writeFile(logPath, "ok\n");

      const result = runCli([
        "--command", "bad-exit",
        "--exit", "notanumber",
        "--log", logPath,
        "--out", outPath,
      ]);

      assert.notEqual(result.status, 0);
      assert.equal(fs.existsSync(outPath), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test("output file is valid JSON parseable by JSON.parse", () => {
  const tmpDir = makeTempDir();
  try {
    const logPath = path.join(tmpDir, "parseable.log");
    const outPath = path.join(tmpDir, "ledger.json");
    writeFile(logPath, "ok\n");

    const result = runCli([
      "--command", "parseable",
      "--exit", "0",
      "--log", logPath,
      "--out", outPath,
    ]);

    assert.equal(result.status, 0);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(outPath, "utf8")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
