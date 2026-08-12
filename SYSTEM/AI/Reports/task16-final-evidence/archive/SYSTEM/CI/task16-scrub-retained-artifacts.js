#!/usr/bin/env node
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const TEXT = new Set([".css", ".html", ".js", ".json", ".jsonl", ".log", ".md", ".py", ".sh", ".txt", ".yaml", ".yml"]);
const RULES = Object.freeze([
  [/\/Users\//gu, "<home>/"], [/(?<![A-Za-z0-9._-])\/home\//gu, "<linux-home>/"],
  [/\/(?:private\/)?tmp\//gu, "<task-temp>/"], [/\/var\/folders\//gu, "<task-temp>/"],
  [/\.senpi\/worktrees/gu, "<worktree>"], [/<repository-token>/gu, "<repository-token>"], [/<vault-token>/gu, "<vault-token>"], [/file:\/\//gu, "<file-uri>"],
  [/AKIA[0-9A-Z]{16}/gu, "<synthetic-secret>"], [/gh[opsu]_[A-Za-z0-9]{30,}/gu, "<synthetic-secret>"],
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/gu, "<synthetic-secret>"], [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu, "<synthetic-secret>"],
]);
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function gitBlobSha1(value) { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"); }
function walk(root, excluded) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (path.resolve(target) === excluded) return [];
    if (entry.isSymbolicLink()) throw new Error("retained_artifact_symlink_forbidden");
    return entry.isDirectory() ? walk(target, excluded) : entry.isFile() && TEXT.has(path.extname(target).toLowerCase()) ? [target] : [];
  }).sort();
}
function normalizeInternalDigests(file, text) {
  const name = path.basename(file);
  if (name !== "real-obsidian-visual-288.json" && name !== "real-rendered-journeys.json") return text;
  const body = JSON.parse(text);
  if (name === "real-obsidian-visual-288.json") body.aggregate_sha256 = sha256(JSON.stringify(body.rows.slice().sort((a, b) => JSON.stringify(a.matrix).localeCompare(JSON.stringify(b.matrix)))));
  else for (const row of body.journeys) { delete row.digest; row.digest = sha256(JSON.stringify(row)); }
  delete body.digest; body.digest = sha256(JSON.stringify(body));
  return `${JSON.stringify(body, null, 2)}\n`;
}
function gateResult(text) {
  const executed = text.match(/Executed:\s*(\d+)/u), skipped = text.match(/Skipped:\s*(\d+)/u), na = text.match(/Not applicable:\s*(\d+)/u), failures = text.match(/Failures:\s*(\d+)/u), verdict = text.match(/VERDICT:\s*(GREEN|RED)/u);
  if (![executed, skipped, na, failures, verdict].every(Boolean)) return null;
  return { executed: Number(executed[1]), skipped: Number(skipped[1]), not_applicable: Number(na[1]), failures: Number(failures[1]), verdict: verdict[1] };
}
function scrub(root, manifestFile) {
  root = path.resolve(root); const excluded = manifestFile ? path.resolve(manifestFile) : "";
  const entries = []; let replacements = 0;
  for (const file of walk(root, excluded)) {
    const before = fs.readFileSync(file); let afterText = before.toString("utf8"), changed = 0;
    for (const [pattern, token] of RULES) afterText = afterText.replace(pattern, () => { changed += 1; replacements += 1; return token; });
    afterText = normalizeInternalDigests(file, afterText);
    const after = Buffer.from(afterText); const rawResult = gateResult(before.toString("utf8")), persistedResult = gateResult(afterText);
    if (JSON.stringify(rawResult) !== JSON.stringify(persistedResult)) throw new Error(`redaction_changed_command_result:${path.relative(root, file)}`);
    if (!after.equals(before)) fs.writeFileSync(file, after);
    entries.push({ path: path.relative(root, file).split(path.sep).join("/"), raw_sha256: sha256(before), raw_git_blob_sha1: gitBlobSha1(before), raw_bytes: before.length, persisted_sha256: sha256(after), persisted_bytes: after.length, replacements: changed, command_result: rawResult });
  }
  const manifest = { schema_version: "task16-retained-redaction-v1", file_count: entries.length, replacement_count: replacements, entries };
  manifest.digest = sha256(JSON.stringify(manifest));
  if (manifestFile) { fs.mkdirSync(path.dirname(manifestFile), { recursive: true }); fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`); }
  return manifest;
}
if (require.main === module) {
  const root = process.argv[2] && path.resolve(process.argv[2]), output = process.argv[3] && path.resolve(process.argv[3]);
  if (!root || !output || !fs.statSync(root).isDirectory()) throw new Error("Usage: node SYSTEM/CI/task16-scrub-retained-artifacts.js <retained-root> <manifest-output>");
  process.stdout.write(`${JSON.stringify(scrub(root, output))}\n`);
}
module.exports = { RULES, TEXT, gateResult, gitBlobSha1, normalizeInternalDigests, scrub };
