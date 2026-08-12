"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");

function loadBriefModules() {
  require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-core.js"));
  require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-policy.js"));
  require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"));
  return require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief.js"));
}

const brief = loadBriefModules();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
  return value;
}

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function packet() {
  return deepFreeze({
    schema_version: 1,
    domain: "coding",
    domain_label: "코딩",
    signals: {
      recent_additions: [
        { source_id: "ZETA/Coding/Main.md", title: "Main", recency: 300 },
        { source_id: "ZETA/Coding/Second.md", title: "Second", recency: 200 }
      ],
      explicit_link_frequency: [
        { source_id: "PARA/Projects/App.md", title: "App", mentions: 2 }
      ],
      repeated_related_topics: [
        { topic: "typescript", mentions: 2 }
      ],
      unclassified_items: [
        { source_id: "ZETA/Unknown.md", title: "Unknown", reason: "unclassified_domain" }
      ]
    }
  });
}

function baseResultAssertions(result, signalPacket) {
  assert.equal(result.schema_version, 1);
  assert.equal(result.domain, signalPacket.domain);
  assert.deepEqual(result.deterministic.lines, [
    "최근 추가: Main, Second",
    "가장 많이 연결된 항목: App (2회)",
    "반복 토픽: typescript (2회)",
    "미분류: Unknown"
  ]);
  assert.deepEqual(result.deterministic.source_ids, [
    "ZETA/Coding/Main.md",
    "ZETA/Coding/Second.md",
    "PARA/Projects/App.md",
    "ZETA/Unknown.md"
  ]);
  assert.equal(Array.isArray(result.brief_lines), true);
  assert.deepEqual(result.brief_lines, result.deterministic.lines);
}

function syntheticProviderConfig() {
  return { defaultProvider: "synthetic", providers: { synthetic: { name: "Synthetic", model: "brief-v1" } } };
}

module.exports = { assert, brief, deepFreeze, delay, packet, baseResultAssertions, syntheticProviderConfig, loadBriefModules };
