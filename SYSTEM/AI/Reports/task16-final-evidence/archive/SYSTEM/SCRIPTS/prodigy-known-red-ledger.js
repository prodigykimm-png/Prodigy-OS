#!/usr/bin/env node
/**
 * prodigy-known-red-ledger.js
 *
 * CLI recorder for known-red test baselines.
 * Reads a command log, classifies the result, and atomically updates a JSON
 * ledger keyed by command name.
 *
 * CommonJS. Uses only Node.js built-in modules.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const USAGE = [
  "Usage: prodigy-known-red-ledger.js --command <name> --exit <code> --log <path> --out <path>",
  "",
  "Flags:",
  "  --command <name>  Command name used as the ledger key",
  "  --exit <code>     Exit code to record",
  "  --log <path>      Path to the command log file",
  "  --out <path>      Path to the JSON ledger file",
  "  --help            Show this message",
].join("\n");

function atomicWrite(destPath, content) {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(destPath)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`
  );
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, destPath);
  let dirFd;
  try {
    dirFd = fs.openSync(dir, "r");
    fs.fsyncSync(dirFd);
  } catch (_error) {
    // Some filesystems do not allow directory fsync.
  } finally {
    if (dirFd !== undefined) {
      try {
        fs.closeSync(dirFd);
      } catch (_error) {
        // Ignore close failures on directory handles.
      }
    }
  }
}

function parseArgs(argv) {
  const args = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      return { error: `Unexpected argument: ${token}` };
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      return { error: `Missing value for ${token}` };
    }
    if (token === "--command") args.command = value;
    else if (token === "--exit") args.exitText = value;
    else if (token === "--log") args.logPath = value;
    else if (token === "--out") args.outPath = value;
    else return { error: `Unknown flag: ${token}` };
    i += 1;
  }
  return { args };
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function firstFailureFromLog(logText) {
  const lines = logText.split(/\r?\n/);
  for (const line of lines) {
    if (/\bnot ok\b|AssertionError|^FAIL\b|^Error:|✗/.test(line)) {
      return line.trim();
    }
  }
  for (const line of lines) {
    if (line.trim()) {
      return line.trim();
    }
  }
  return null;
}

function classify(exitCode, logText) {
  if (exitCode === 0) {
    return { classification: "green", needsReview: false };
  }
  if (exitCode >= 128) {
    return { classification: "harness drift", needsReview: false };
  }
  const hasFailureEvidence = /AssertionError|\bnot ok\b|^FAIL\b|^Error:|✗/m.test(logText);
  if (hasFailureEvidence) {
    return { classification: "pre-existing product defect", needsReview: false };
  }
  return { classification: "pre-existing product defect", needsReview: true };
}

function loadLedger(outPath) {
  if (!fs.existsSync(outPath)) {
    return {};
  }
  const text = readText(outPath);
  const data = JSON.parse(text);
  if (data === null || Array.isArray(data) || typeof data !== "object") {
    throw new Error("Ledger must be a JSON object");
  }
  return data;
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n${USAGE}\n`);
    return 1;
  }
  if (parsed.args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const { command, exitText, logPath, outPath } = parsed.args;
  if (!command || exitText === undefined || !logPath || !outPath) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  if (!/^-?\d+$/.test(exitText)) {
    process.stderr.write("Invalid --exit: must be an integer\n");
    return 1;
  }

  const exitCode = Number(exitText);
  let logText;
  try {
    logText = readText(logPath);
  } catch (_error) {
    process.stderr.write(`Unreadable --log: ${logPath}\n`);
    return 1;
  }

  let ledger;
  try {
    ledger = loadLedger(outPath);
  } catch (_error) {
    process.stderr.write(`Unreadable --out: ${outPath}\n`);
    return 1;
  }

  const firstFailure = exitCode === 0 ? null : firstFailureFromLog(logText);
  const verdict = classify(exitCode, logText);
  const entry = {
    command,
    exit_code: exitCode,
    log: logPath,
    first_failure: firstFailure,
    classification: verdict.classification,
    recorded_at: new Date().toISOString(),
  };
  if (verdict.needsReview) {
    entry.needs_review = true;
  }

  ledger[command] = entry;
  atomicWrite(outPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

