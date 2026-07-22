"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global.window || {};
require(path.join(ROOT, "SYSTEM/Views/display-registry.js"));
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-core.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-policy.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-state.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-responsive.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-render.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-render.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-view.js"));
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");
const { catalog, flattenCatalog } = require("./knowledge_explorer_fixtures.js");

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function findControl(root, predicate) {
  return walk(root, predicate)[0] || null;
}

function visibleText(node) {
  if (!node || node.tag === "style") return "";
  return [node.text, ...(node.children || []).map(visibleText)].filter(Boolean).join(" ");
}

function click(control) {
  let prevented = false;
  control.onclick({ preventDefault() { prevented = true; } });
  return prevented;
}

function model() {
  const explorer = core.projectKnowledgeExplorer(flattenCatalog(catalog), registry);
  const domain = explorer.domains.find((item) => item.knowledge.length) || explorer.domains[0];
  explorer.brief_signals_by_domain = {
    [domain.key]: {
      recent_additions: [{ source_path: domain.knowledge[0].path, title: domain.knowledge[0].title, recency: 1 }],
      explicit_link_frequency: [],
      repeated_related_topics: [],
      unclassified_items: []
    }
  };
  explorer.selection = { domain: domain.key };
  return explorer;
}

function testSourcesUseSeparatedSemanticRows() {
  // Given: long paths that must stay fully available to open beside.
  const root = new FakeElement("section");
  const sourcePaths = [
    "ZETA/Knowledge/Very/Long/Source/Path/That/Must/Wrap/Without/Losing/Identity/One.md",
    "ZETA/Knowledge/Very/Long/Source/Path/That/Must/Wrap/Without/Losing/Identity/Two.md"
  ];

  // When: the Brief renders its sources.
  global.window.KnowledgeExplorerBriefRender.renderBrief(root, {
    brief: { lines: [], source_ids: sourcePaths },
    onOpenBeside: () => {}
  });
  const sourceList = findControl(root, (node) => node.tag === "ul" && node.attr.class === "knowledge-explorer-brief-source-list");
  const sourceRows = walk(sourceList, (node) => node.tag === "li" && node.attr.class === "knowledge-explorer-brief-source-row");

  // Then: each source has its own semantic row; the responsive stylesheet supplies token-driven separation and wrapping.
  assert.ok(sourceList, "sources must use a semantic list");
  assert.equal(sourceRows.length, sourcePaths.length);
  assert.deepEqual(sourceRows.map((row) => row.children[0].attr["data-asset-path"]), sourcePaths);
  const style = global.window.KnowledgeExplorerResponsive.CSS;
  assert.match(style, /knowledge-explorer-brief-source-list[^}]*gap:var\(--ke-space-2\)/);
  assert.match(style, /knowledge-explorer-brief-source-row[^}]*min-inline-size:0/);
  assert.match(style, /knowledge-explorer-brief-source-row[^}]*overflow-wrap:anywhere/);
}

async function main() {
  testSourcesUseSeparatedSemanticRows();
  const root = new FakeElement("section");
  const opened = [];
  let providerCalls = 0;
  let abortSignal = null;
  let resolveRequest;
  const briefService = {
    buildDeterministicBrief(packet) {
      return {
        lines: ["최근 추가: 결정적 항목", "가장 많이 연결된 항목: 없음", "반복 토픽: 없음", "미분류: 없음"],
        source_ids: [packet.signals.recent_additions[0].source_path]
      };
    },
    generateBrief(_packet, options) {
      providerCalls += 1;
      abortSignal = options.signal;
      return new Promise((resolve) => { resolveRequest = resolve; });
    }
  };

  // Given: a mounted Explorer with an injected Brief service.
  // When: the detail pane first renders.
  // Then: only deterministic facts and explicit sources are visible; no provider request occurs.
  view.mountKnowledgeExplorer({ container: root, model: model(), briefService, onOpenBeside: (target) => opened.push(target) });
  assert.match(collectText(root), /오늘의 브리핑/);
  assert.match(collectText(root), /최근 추가: 결정적 항목/);
  assert.equal(providerCalls, 0);
  const source = findControl(root, (node) => node.tag === "a" && node.attr.class === "knowledge-explorer-brief-source");
  assert.ok(source, "deterministic source path must be an open-beside link");
  assert.equal(click(source), true);
  assert.deepEqual(opened, [source.attr["data-asset-path"]]);

  // Given: deterministic content is already rendered.
  // When: the user explicitly requests an AI summary and then cancels it.
  // Then: loading/cancel states appear, the signal is aborted, and deterministic content remains available.
  const request = findControl(root, (node) => node.tag === "button" && node.text === "AI 요약 만들기");
  assert.ok(request);
  assert.equal(click(request), true);
  assert.equal(providerCalls, 1);
  assert.match(collectText(root), /AI 요약을 불러오는 중입니다/);
  const cancel = findControl(root, (node) => node.tag === "button" && node.text === "취소");
  assert.ok(cancel);
  click(cancel);
  assert.equal(abortSignal.aborted, true);
  resolveRequest({
    status: "cancelled",
    brief_lines: ["최근 추가: 결정적 항목", "가장 많이 연결된 항목: 없음", "반복 토픽: 없음", "미분류: 없음"],
    ai_summary: null,
    redacted_status: "request cancelled"
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.match(collectText(root), /결정적 요약은 그대로 유지됩니다/);
  assert.match(collectText(root), /다시 시도/);

  // Given: a cancelled request with deterministic content still present.
  // When: the user retries and the service reports its internal missing-provider fallback.
  // Then: the UI shows only concise Korean fallback copy; internal English status never leaks.
  const retry = findControl(root, (node) => node.tag === "button" && node.text === "다시 시도");
  click(retry);
  resolveRequest({
    status: "deterministic",
    brief_lines: ["최근 추가: 결정적 항목", "가장 많이 연결된 항목: 없음", "반복 토픽: 없음", "미분류: 없음"],
    ai_summary: null,
    redacted_status: "provider missing; deterministic brief only"
  });
  await Promise.resolve();
  await Promise.resolve();
  const text = visibleText(root);
  assert.match(text, /AI 요약을 사용할 수 없습니다/);
  assert.match(text, /결정적 요약은 그대로 유지됩니다/);
  assert.match(text, /최근 추가: 결정적 항목/);
  assert.doesNotMatch(text, /provider missing|deterministic brief only/i);
  assert.equal(findControl(root, (node) => node.tag === "h4" && node.text === "AI 보조 요약"), null);

  console.log("Knowledge Explorer Brief UI tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
