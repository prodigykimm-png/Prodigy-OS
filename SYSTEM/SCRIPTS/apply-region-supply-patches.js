#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const patchApply = require("./region-summary-patch-apply.js");

const VAULT = path.resolve(__dirname, "../..");
const NOTES_REL = "PARA/RESOURCES/Auction Regions";
const PATCH_DIR_REL = "SYSTEM/CACHE/region-summary-patches";
const SUPPLY_START = "<!-- AI:PENDING:SUPPLY_PIPELINE:START -->";
const SUPPLY_END = "<!-- AI:PENDING:SUPPLY_PIPELINE:END -->";
const SOURCES_START = "<!-- AUTO:REGION_RESEARCH_SOURCES:START -->";
const SOURCES_END = "<!-- AUTO:REGION_RESEARCH_SOURCES:END -->";
const CITING_BLOCKS = [
  "AI:PENDING:SUMMARY", "AI:PENDING:ZONES", "AI:PENDING:TRANSPORT_LIFE", "AI:PENDING:RISKS",
  "AI:PENDING:SITE_VISIT", "AUTO:REGION_RESEARCH_LOG"
];

function blockSlice(content, key) {
  const start = `<!-- ${key}:START -->`;
  const end = `<!-- ${key}:END -->`;
  const s = content.indexOf(start);
  const e = content.indexOf(end);
  if (s < 0 || e < 0) return "";
  return content.slice(s, e);
}

function parseSources(content) {
  return [...blockSlice(content, "AUTO:REGION_RESEARCH_SOURCES").matchAll(/\*\*(S\d+) · ([^*]+)\*\* — (.+?) · <(.+?)> · 조회 (\S+)/g)]
    .map((m) => ({
      source_id: m[1], institution: m[2].trim(), title: m[3].trim(),
      url: m[4], accessed_at: m[5], source_type: "official_primary"
    }));
}

function citedElsewhere(content) {
  const cited = new Set();
  for (const key of CITING_BLOCKS) {
    for (const match of blockSlice(content, key).matchAll(/\[(S\d+)\]/g)) cited.add(match[1]);
  }
  return cited;
}

function clearBlock(content, start, end) {
  const re = new RegExp(`(${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[\\s\\S]*?(${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`);
  return content.replace(re, "$1\n$2");
}

function readSources(dir, preferNewestPackage) {
  if (!fs.existsSync(dir)) return [];
  let names = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  if (preferNewestPackage) names = names.sort().reverse();
  const recovered = [];
  const seen = new Set();
  for (const name of names) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { continue; }
    for (const source of parsed.sources || []) {
      if (!source || !source.source_id || seen.has(source.source_id)) continue;
      if (!/^https?:\/\//.test(String(source.url ?? ""))) continue;
      seen.add(source.source_id);
      recovered.push({
        source_id: source.source_id,
        institution: source.institution,
        title: source.title,
        url: source.url,
        accessed_at: source.accessed_at,
        source_type: "official_primary"
      });
    }
  }
  return recovered;
}

function recoverCachedSources(patchRoot, region) {
  return readSources(path.join(patchRoot, region), false);
}

function recoverPackageSources(region) {
  return readSources(path.join(VAULT, "SYSTEM/CACHE/region-research-packages", region), true);
}

function buildFinalPatch(patch, content, patchRoot) {
  const existing = parseSources(content);
  const cached = [...(patchRoot ? recoverCachedSources(patchRoot, patch.region_key) : []), ...recoverPackageSources(patch.region_key)];
  const known = new Map(cached.map((s) => [s.source_id, s]));
  for (const source of existing) if (!known.has(source.source_id)) known.set(source.source_id, source);
  const cited = citedElsewhere(content);
  const supplyIds = new Set(patch.supply_pipeline.flatMap((row) => row.source_ids || []));
  const pool = [...known.values()];
  const kept = pool.filter((source) => cited.has(source.source_id) || supplyIds.has(source.source_id));
  const merged = [...kept];
  for (const source of patch.sources) {
    if (!merged.some((x) => x.source_id === source.source_id)) merged.push(source);
  }
  return { ...patch, sources: merged };
}

function applyAll(options = {}) {
  const patchRoot = path.join(VAULT, PATCH_DIR_REL);
  const files = fs.readdirSync(patchRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const candidate = path.join(patchRoot, entry.name, "2026-09-29-supply.json");
      return fs.existsSync(candidate) ? { region: entry.name, file: candidate } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.region.localeCompare(b.region));

  const results = [];
  for (const { region, file } of files) {
    const notePath = path.join(VAULT, NOTES_REL, `${region}.md`);
    if (!fs.existsSync(notePath)) { results.push({ region, status: "no_note" }); continue; }
    const original = fs.readFileSync(notePath, "utf8");
    const patch = buildFinalPatch(JSON.parse(fs.readFileSync(file, "utf8")), original, patchRoot);
    try {
      patchApply.validatePatch(patch);
    } catch (error) {
      results.push({ region, status: "rejected", reason: error.message.slice(0, 120) });
      continue;
    }
    const appliedPath = path.join(patchRoot, region, "2026-09-29-supply-applied.json");
    fs.writeFileSync(appliedPath, JSON.stringify(patch, null, 2));
    const cleared = clearBlock(clearBlock(original, SUPPLY_START, SUPPLY_END), SOURCES_START, SOURCES_END);
    fs.writeFileSync(notePath, cleared);
    try {
      const outcome = patchApply.applySummaryPatch({ vaultRoot: VAULT, targetPath: notePath, patchPath: appliedPath, execute: !options.dryRun });
      results.push({ region, status: outcome.reason, changed: outcome.changed, blocks: outcome.blocks, dry_run: outcome.dry_run });
    } catch (error) {
      fs.writeFileSync(notePath, original);
      results.push({ region, status: "failed_restored", reason: error.message.slice(0, 120) });
    }
  }
  const summary = {
    schema_version: 1,
    regions: results.length,
    applied: results.filter((r) => r.status === "patch_applied").length,
    unchanged: results.filter((r) => r.status === "same_patch").length,
    rejected: results.filter((r) => r.status === "rejected").length,
    failed_restored: results.filter((r) => r.status === "failed_restored").length,
    no_note: results.filter((r) => r.status === "no_note").length,
    dry_run: Boolean(options.dryRun),
    problems: results.filter((r) => !["patch_applied", "same_patch", "no_note"].includes(r.status))
  };
  return { summary, results };
}

if (require.main === module) {
  try {
    const dryRun = !process.argv.includes("--execute");
    const outcome = applyAll({ dryRun });
    process.stdout.write(`${JSON.stringify(outcome.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ applyAll, buildFinalPatch, recoverCachedSources, recoverPackageSources, parseSources, citedElsewhere, clearBlock });
