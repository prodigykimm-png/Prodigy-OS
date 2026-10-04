"use strict";

// CLI: node SYSTEM/SCRIPTS/auction-frontmatter-guard-cli.js [--check|--fix] [--dir <path>]
// Exits 1 when --check finds frontmatter Obsidian cannot parse, so a pass can gate on it.
const fs = require("node:fs");
const path = require("node:path");
const guard = require("./auction-frontmatter-guard.js");

const args = process.argv.slice(2);
const mode = args.includes("--fix") ? "fix" : "check";
const dirFlag = args.indexOf("--dir");
const target = dirFlag !== -1 ? args[dirFlag + 1] : path.resolve(__dirname, "../../PARA/PROJECTS/Auction");

if (!fs.existsSync(target)) { console.error("directory not found: " + target); process.exit(2); }

const files = fs.readdirSync(target).filter((name) => name.endsWith(".md")).sort();
const affected = [];
const notCards = [];
for (const name of files) {
  const full = path.join(target, name);
  const text = fs.readFileSync(full, "utf8");
  const report = guard.analyze(text);
  if (report.ok) continue;
  // A file with no frontmatter cannot be a card and cannot fail a save; report it
  // so a converted note is still visible, but do not fail the gate on it.
  if (report.reason === "no_frontmatter") { notCards.push({ name, action: "no_frontmatter" }); continue; }
  if (mode === "fix") {
    const result = guard.repair(text);
    if (result.changed && result.ok) {
      fs.writeFileSync(full, result.text);
      affected.push({ name, action: "repaired", kinds: result.changes.map((c) => c.kind) });
    } else {
      affected.push({ name, action: "unresolved", reason: result.remaining.parseError || result.remaining.reason });
    }
    continue;
  }
  affected.push({
    name,
    action: "broken",
    gluedDelimiterLine: report.gluedDelimiter ? report.gluedDelimiter.line : null,
    unquotedValues: report.unquotedMappingValues.map((v) => v.key),
    duplicateKeys: report.duplicateKeys.map((v) => v.key),
    unclosedQuotes: report.unclosedQuotes.map((v) => v.key),
    reason: report.reason || null,
    parseError: report.parseError
  });
}

console.log(JSON.stringify({ mode, dir: target, scanned: files.length, affected: affected.length, noFrontmatter: notCards.length, hasYamlParser: guard.hasYamlParser(), files: affected, notCards }, null, 1));
process.exit(mode === "check" && affected.length > 0 ? 1 : 0);
