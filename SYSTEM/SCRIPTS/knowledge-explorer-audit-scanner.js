"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { auditRecord, buildRegistry } = require("./knowledge-explorer-audit-registry.js");

const ROOT = path.resolve(__dirname, "../..");

function shouldSkipPath(filePath, options) {
  const rel = filePath.split(path.sep).join("/");
  if (!options.includeDaily && /(^|\/)DAILY\//.test(rel)) return "excluded-by-default:daily";
  if (!options.includePre && /(^|\/)PRE\//.test(rel)) return "excluded-by-default:pre";
  return null;
}

function collectMarkdownFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  if (!stat.isDirectory()) return [];
  const stack = [targetPath];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(next);
      else if (entry.isFile() && next.endsWith(".md")) files.push(next);
    }
  }
  return files;
}

function buildReport(entries, skipped, scanned) {
  entries.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return Object.freeze({
    entries,
    skipped,
    counts: Object.freeze({
      scanned,
      reported: entries.length,
      skipped: skipped.length,
      manual_review: entries.filter((entry) => entry.manual_review).length,
      suggested: entries.filter((entry) => entry.suggestion).length,
    }),
  });
}

function auditPaths(targetPaths = [], options = {}) {
  const registry = options.registry || buildRegistry();
  const vaultRoot = options.vaultRoot || ROOT;
  const entries = [];
  const skipped = [];
  for (const target of targetPaths) {
    for (const filePath of collectMarkdownFiles(target)) {
      const skipReason = shouldSkipPath(filePath, options);
      const relativePath = path.relative(vaultRoot, filePath).split(path.sep).join("/");
      if (skipReason) {
        skipped.push({ path: relativePath, reason: skipReason });
        continue;
      }
      entries.push(auditRecord({
        source_path: relativePath,
        content: fs.readFileSync(filePath, "utf8"),
      }, registry));
    }
  }
  return buildReport(entries, skipped, entries.length + skipped.length);
}

function auditRecords(records, options = {}) {
  const registry = options.registry || buildRegistry();
  const entries = [];
  for (const record of records || []) entries.push(auditRecord(record, registry));
  return buildReport(entries, [], entries.length);
}

module.exports = Object.freeze({
  auditPaths,
  auditRecords,
  collectMarkdownFiles,
  shouldSkipPath,
});
