"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { FakeElement, collectText, findByText } = require("./knowledge_explorer_view_fakes.js");
const { buildPages, firstElement, runHub, MODULE_PATHS, HUB_MODULE_PATHS } = require("./knowledge_hub_integration_harness.js");
const ROOT = path.resolve(__dirname, "../../../../../..");
const workspaceManifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"));
const hubAdapter = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-hub-adapter.js"));
const authoringAdapter = require(path.join(ROOT, "SYSTEM/Views/knowledge-authoring-hub-adapter.js"));
const paraView = require(path.join(ROOT, "SYSTEM/Views/knowledge-para-view.js"));
function testFixtureModulePathsMatchKnowledgeHub() {
  assert.deepEqual(MODULE_PATHS, HUB_MODULE_PATHS);
  const liveKnowledgeManifest = workspaceManifest.get("knowledge");
  assert.deepEqual(HUB_MODULE_PATHS, liveKnowledgeManifest.required.concat(liveKnowledgeManifest.optional));
}

async function testHubLoadsExplorerAndDetailSections() {
  const pages = buildPages();
  const result = await runHub({ pages });
  const text = collectText(result.container);

  assert.match(text, /지식|자료|연결된 항목|저널|프로젝트|최근 학습|확인 필요|연결 근거/);
  assert.match(text, /분류:\s*(지식|자료|사람|프로젝트|저널|읽기|기타)/);
  assert.match(text, /연결 이유:/);
  // 부정 매칭은 제텔카스텐(Explorer) 패널로 한정 — PARA 탭에는 정당한 영문 지식 제목이 포함될 수 있음
  function findByAttrId(el, id) {
    if (!el) return null;
    if (el.attr && el.attr.id === id) return el;
    for (const child of el.children || []) { const found = findByAttrId(child, id); if (found) return found; }
    return null;
  }
  const zettelPanel = findByAttrId(result.container, "knowledge-panel-zettelkasten");
  assert.ok(zettelPanel, "제텔카스텐 탭 패널이 존재해야 합니다.");
  const zettelText = collectText(zettelPanel);
  assert.match(zettelText, /지식 구축/);
  assert.match(zettelText, /지식 축적 현황/);
  assert.match(zettelText, /영구 지식/);
  assert.match(zettelText, /검증 대기/);
  assert.doesNotMatch(zettelText, /\b(Knowledge|Resources|Related Objects|Journal|Projects|recent learning|warnings|provenance)\b/);
  assert.doesNotMatch(zettelText, /\b(category|reason|provenance_label|provenance_source_path)\b/);
  assert.doesNotMatch(zettelText, /\b(auction_region|literature_note|permanent_note)\b/);
  // PARA 탭 검증
  const paraPanel = findByAttrId(result.container, "knowledge-panel-para");
  assert.ok(paraPanel, "PARA 탭 패널이 존재해야 합니다.");
  const paraText = collectText(paraPanel);
  assert.match(paraText, /지식 활용|연결된 지식 없음|승인 지식/);
  const literatureAction = firstElement(paraPanel, "button", (node) => String(node.text || "").includes("문헌 노트 만들기"));
  assert.ok(literatureAction, "PARA must expose a working Literature Note handoff");
  await literatureAction.onclick({ preventDefault() {} });
  assert.match(collectText(result.openedModals.at(-1).contentEl), /문헌노트 한 건/);
  assert.equal(result.window.KnowledgeExplorerHub.error, undefined);
  const browsePanel = findByAttrId(result.container, "knowledge-panel-llmwiki-browse");
  assert.ok(browsePanel, "LLMWiki fourth-tab browse panel must be mounted.");
  assert.equal(result.window.KnowledgeWorkspaceTabs.TABS.length, 4);
  assert.deepEqual(Array.from(result.window.KnowledgeWorkspaceTabs.TABS, (tab) => tab.id), ["zettelkasten", "para", "llmwiki", "llmwiki-browse"]);
  assert.ok(result.window.KnowledgeExplorerHub.llmWikiBrowse);
  assert.ok(result.window.KnowledgeExplorerHub.model);
  assert.ok(result.window.KnowledgeExplorerHub.model.detail_sections_by_asset_path);
  assert.ok(findByText(result.container, "지식"));
  assert.ok(findByText(result.container, "검증 대기"));
  assert.equal(typeof result.window.KnowledgeExplorerHub.openBeside, "function");
  assert.equal(result.window.KnowledgeExplorerHub.openBeside.length, 1, "open-beside handler must remain a direct single-argument function");

  const clickable = firstElement(result.container, "a", (node) => node.attr && String(node.attr.class || "").includes("knowledge-explorer-brief-source"));
  assert.ok(clickable, "expected at least one clickable read-only source title");
  assert.equal(typeof clickable.onclick, "function");
  const targetPath = clickable.attr["data-asset-path"];
  assert.equal(typeof targetPath, "string");
  const beforeLeaves = result.app.workspace.leaves.length;
  let prevented = false;
  clickable.onclick({ preventDefault: () => { prevented = true; } });
  await Promise.resolve();
  assert.equal(prevented, true);
  assert.equal(result.app.workspace.calls.some(([name]) => name === "getLeaf"), true, JSON.stringify(result.app.workspace.calls));
  assert.equal(result.app.workspace.leaves.length > beforeLeaves, true, JSON.stringify(result.app.workspace.calls));
  const leaf = result.app.workspace.leaves[result.app.workspace.leaves.length - 1];
  assert.equal(leaf.mode, "split");
  assert.deepEqual(leaf.opened, [targetPath]);
}

async function testHubMountsAuthoringActionsWithoutChangingExplorerProjection() {
  // Given: a metadata-only Explorer catalog and a fake Obsidian Modal runtime.
  const pages = buildPages();

  // When: the Knowledge Hub mounts its authoring actions.
  const result = await runHub({ pages });
  const beforeTotals = { ...result.window.KnowledgeExplorerHub.model.totals };
  const review = firstElement(result.container, "button", (node) => node.text === "검증 대기 열기");
  assert.ok(review, "candidate review launcher must be visible");
  const candidateInbox = () => firstElement(result.container, "section", (node) => node.attr && node.attr["data-section-key"] === "candidate-inbox");
  assert.equal(candidateInbox(), null, "candidate Inbox is collapsed on initial mount");
  assert.equal(result.window.KnowledgeExplorerHub.api.candidateInboxOpen(), false);
  review.onclick({ preventDefault() {} });
  assert.equal(result.window.KnowledgeExplorerHub.api.candidateInboxOpen(), true);
  assert.equal(result.window.KnowledgeExplorerHub.api.state().focusPane, "detail");
  assert.match(collectText(result.container), /검증 대기 0/);
  assert.equal(review.text, "검증 대기 닫기");
  assert.equal(review.attr["aria-expanded"], "true");
  assert.ok(candidateInbox(), "opening the launcher renders the candidate Inbox");
  review.onclick({ preventDefault() {} });
  assert.equal(result.window.KnowledgeExplorerHub.api.candidateInboxOpen(), false);
  assert.equal(review.text, "검증 대기 열기");
  assert.equal(review.attr["aria-expanded"], "false");
  assert.equal(candidateInbox(), null, "closing the launcher hides the candidate Inbox");
  review.onclick({ preventDefault() {} });
  const direct = firstElement(result.container, "button", (node) => node.text === "+ 지식 작성");
  const material = firstElement(result.container, "button", (node) => node.text === "+ 문헌노트 작성");

  // Then: both actions are visible but never become Explorer assets or briefs.
  assert.ok(direct, "direct Knowledge authoring action must be visible");
  assert.ok(material, "material authoring action must be visible");
  assert.deepEqual(JSON.parse(JSON.stringify(result.window.KnowledgeExplorerHub.model.totals)), beforeTotals);
  assert.equal(result.window.KnowledgeExplorerHub.model.totals.knowledge, beforeTotals.knowledge);
  assert.doesNotMatch(JSON.stringify(result.window.KnowledgeExplorerHub.model), /\+ 지식 작성|\+ 문헌노트 작성/);

  // And when: the user opens each action and chooses both material workflows.
  direct.onclick({ preventDefault() {} });
  assert.match(collectText(result.openedModals.at(-1).contentEl), /검증 대기에 저장/);
  material.onclick({ preventDefault() {} });
  const chooser = result.openedModals.at(-1);
  assert.match(collectText(chooser.contentEl), /문헌노트 한 건 작성/);
  assert.match(collectText(chooser.contentEl), /문헌노트 묶음 작성/);
  const single = firstElement(chooser.contentEl, "button", (node) => node.text === "문헌노트 한 건 작성");
  const batch = firstElement(chooser.contentEl, "button", (node) => node.text === "문헌노트 묶음 작성");
  single.onclick({ preventDefault() {} });
  assert.match(collectText(result.openedModals.at(-1).contentEl), /문헌노트 한 건/);
  material.onclick({ preventDefault() {} });
  const secondChooser = result.openedModals.at(-1);
  firstElement(secondChooser.contentEl, "button", (node) => node.text === "문헌노트 묶음 작성").onclick({ preventDefault() {} });
  assert.match(collectText(result.openedModals.at(-1).contentEl), /문헌노트 묶음/);
  assert.equal(result.app.workspace.calls.length, 0, "opening authoring modals must not write or navigate");
}

async function testCandidateLauncherOpensAtomicDetailWithOneEnabledHandoff() {
  const candidateAdapter = `"use strict";(function(root){root.KnowledgeCandidateHubAdapter=Object.freeze({async createCandidateInboxConfig(){return{candidateInbox:{expanded:false,candidates:[{type:"knowledge_candidate",candidate_id:"candidate-task21",status:"saved",title:"Task 21 Candidate",statement:"Atomic launcher statement",reason:"Real launcher regression",source_type:"daily_evidence",source_evidence_ids:["task21-evidence"],source_objects:["[[DAILY/2026-08-21]]"],confidence:"explicit",suggested_domain:"coding",suggested_topics:["typescript"],application_trigger:"review",application_contexts:["coding"],connections:[],invalidation_conditions:["source changes"],approval_note:"",promotion_target:"",promoted_knowledge:"",created:"2026-08-21T00:00:00.000Z",updated:"2026-08-21T00:00:00.000Z",evidence_quality:{status:"usable"},path:"PARA/RESOURCES/Knowledge/Candidates/Task 21 Candidate.md"}]},candidateStore:{},loadCandidates:async()=>[],onLlmWikiHandoff:async()=>({ok:true,status:"review"})}}})})(typeof window!=="undefined"?window:globalThis);`;
  const result = await runHub({
    pages: [],
    extraFiles: { "SYSTEM/Views/knowledge-candidate-hub-adapter.js": candidateAdapter }
  });
  const api = result.window.KnowledgeExplorerHub.api;
  assert.equal(api.state().assetPath, null, "launcher scenario starts without a selected asset");
  assert.equal(typeof api.openCandidateInbox, "function", "Explorer must own one atomic Candidate detail operation");
  const review = firstElement(result.container, "button", (node) => node.text === "검증 대기 열기");
  assert.ok(review, "real Candidate review launcher must be present");

  review.onclick({ preventDefault() {} });

  const handoffs = [];
  (function walk(node) {
    if (!node) return;
    if (node.tag === "button" && node.attr && node.attr["data-action"] === "llmwiki-handoff") handoffs.push(node);
    for (const child of node.children || []) walk(child);
  })(result.container);
  assert.equal(api.state().focusPane, "detail");
  assert.equal(handoffs.length, 1, "Candidate detail scene must contain exactly one handoff");
  assert.equal(handoffs[0].disabled, false, "Candidate handoff must be enabled");
}

async function testHubBuildsLargeExplorerWithoutEagerBodyReads() {
  // Given: a one-thousand-record metadata catalog with bodies that must remain cold on first render.
  const pages = Array.from({ length: 1000 }, (_, index) => ({
    source_path: `ZETA/Coding/Lazy-${String(index).padStart(4, "0")}.md`,
    path: `ZETA/Coding/Lazy-${String(index).padStart(4, "0")}.md`,
    title: `Lazy ${index}`,
    type: "knowledge",
    content: `body ${index}`,
    frontmatter: {
      type: "knowledge",
      title: `Lazy ${index}`,
      knowledge_domain: "coding",
      knowledge_topics: ["typescript"],
      connections: index ? [`[[ZETA/Coding/Lazy-${String(index - 1).padStart(4, "0")}.md]]`] : []
    },
    file: {
      path: `ZETA/Coding/Lazy-${String(index).padStart(4, "0")}.md`,
      name: `Lazy-${index}`,
      mtime: index + 1,
      outlinks: index ? [`[[ZETA/Coding/Lazy-${String(index - 1).padStart(4, "0")}.md]]`] : [],
      inlinks: []
    },
    connections: index ? [`[[ZETA/Coding/Lazy-${String(index - 1).padStart(4, "0")}.md]]`] : [],
    outlinks: index ? [`[[ZETA/Coding/Lazy-${String(index - 1).padStart(4, "0")}.md]]`] : [],
    backlinks: []
  }));

  // When: the Hub renders its initial metadata projection.
  const result = await runHub({ pages });

  // Then: ordering remains stable and no note body has been read.
  assert.equal(result.window.KnowledgeExplorerHub.model.totals.knowledge, 1000);
  assert.equal(
    result.window.KnowledgeExplorerHub.model.domains.find((domain) => domain.key === "coding").knowledge.slice(0, 2).map((asset) => asset.path).join(","),
    "ZETA/Coding/Lazy-0999.md,ZETA/Coding/Lazy-0998.md"
  );
  assert.equal(result.readCounts.body, 0, "initial Explorer projection must not hydrate note bodies");

  // And when: the currently selected detail is explicitly hydrated twice.
  await result.window.KnowledgeExplorerHub.api.retrySelectedAsset();
  await result.window.KnowledgeExplorerHub.api.retrySelectedAsset();

  // Then: only that selected body is read, and the in-memory cache serves the retry.
  assert.equal(result.readCounts.body, 1, "only the selected detail may hydrate a body");
}

async function testRelationTargetsRemainMetadataOnlyAndClickable() {
  // Given: one Knowledge asset with explicit Dataview links to non-asset relation targets.
  const pages = [
    {
      source_path: "ZETA/Coding/Main.md",
      path: "ZETA/Coding/Main.md",
      title: "Main",
      type: "knowledge",
      content: "body must remain unread",
      frontmatter: { type: "knowledge", title: "Main", knowledge_domain: "coding", knowledge_topics: ["typescript"], connections: ["[[PARA/People/Alice.md]]", "[[PARA/Projects/App.md]]", "[[DAILY/DAILY/2026-07-20.md]]"] },
      file: { path: "ZETA/Coding/Main.md", name: "Main", mtime: 3, outlinks: ["[[PARA/People/Alice.md]]", "[[PARA/Projects/App.md]]", "[[DAILY/DAILY/2026-07-20.md]]"], inlinks: [] },
      connections: ["[[PARA/People/Alice.md]]", "[[PARA/Projects/App.md]]", "[[DAILY/DAILY/2026-07-20.md]]"],
      outlinks: ["[[PARA/People/Alice.md]]", "[[PARA/Projects/App.md]]", "[[DAILY/DAILY/2026-07-20.md]]"],
      backlinks: []
    },
    { source_path: "PARA/People/Alice.md", path: "PARA/People/Alice.md", title: "Alice", type: "people", content: "", frontmatter: { type: "people", title: "Alice" }, file: { path: "PARA/People/Alice.md", name: "Alice", mtime: 2, outlinks: [], inlinks: [] }, connections: [], outlinks: [], backlinks: [] },
    { source_path: "PARA/Projects/App.md", path: "PARA/Projects/App.md", title: "App", type: "project", content: "", frontmatter: { type: "project", title: "App" }, file: { path: "PARA/Projects/App.md", name: "App", mtime: 2, outlinks: [], inlinks: [] }, connections: [], outlinks: [], backlinks: [] },
    { source_path: "DAILY/DAILY/2026-07-20.md", path: "DAILY/DAILY/2026-07-20.md", title: "2026-07-20", type: "daily_note", content: "", frontmatter: { type: "daily_note", title: "2026-07-20" }, file: { path: "DAILY/DAILY/2026-07-20.md", name: "2026-07-20", mtime: 2, outlinks: [], inlinks: [] }, connections: [], outlinks: [], backlinks: [] }
  ];

  // When: the metadata-only Hub projects the detail sections.
  const result = await runHub({ pages });
  const sections = result.window.KnowledgeExplorerHub.model.detail_sections_by_asset_path["zeta/coding/main.md"];
  const related = sections.find((section) => section.key === "related-objects");

  // Then: all explicit targets keep their display category and remain openable without body reads.
  assert.equal(result.readCounts.body, 0);
  assert.equal(related.items.map((item) => `${item.path}:${item.category}:${item.clickable}`).join(","), "DAILY/DAILY/2026-07-20.md:저널:true,PARA/People/Alice.md:사람:true,PARA/Projects/App.md:프로젝트:true");
}

async function testSelectedBodyFallsBackToVaultReaderAfterDataviewFailure() {
  // Given: a selected asset where Dataview body loading fails but the Vault can still read the same file.
  const pages = [{
    source_path: "ZETA/Coding/Fallback.md",
    path: "ZETA/Coding/Fallback.md",
    title: "Fallback",
    type: "knowledge",
    content: "Vault fallback body",
    frontmatter: { type: "knowledge", title: "Fallback", knowledge_domain: "coding", knowledge_topics: ["typescript"], connections: [] },
    file: { path: "ZETA/Coding/Fallback.md", name: "Fallback", mtime: 1, outlinks: [], inlinks: [] },
    connections: [], outlinks: [], backlinks: []
  }];

  // When: the explicitly selected detail hydrates after the Dataview reader rejects.
  const result = await runHub({ pages, bodyLoadError: new Error("Dataview body reader unavailable") });
  await result.window.KnowledgeExplorerHub.api.retrySelectedAsset();

  // Then: the recoverable Vault fallback supplies the body without affecting initial-read behavior.
  assert.equal(result.readCounts.body, 1);
  assert.match(collectText(result.container), /Vault fallback body/);
}

async function testMissingModuleProducesRecoverableError() {
  const pages = buildPages();
  const result = await runHub({ pages, omittedModulePaths: ["SYSTEM/Views/knowledge-explorer-relations.js"] });
  const text = collectText(result.container);
  assert.match(text, /필수 워크스페이스 리소스를 불러오지 못했습니다/);
  assert.match(text, /SYSTEM\/Views\/knowledge-explorer-relations\.js/);
  assert.match(text, /동기화가 끝나지 않았을 수 있습니다/);
  const retry = firstElement(result.container, "button", (node) => node.text === "다시 시도");
  assert.ok(retry);
  assert.equal(retry.__prodigyRetry, retry.__prodigyError.retry);
  assert.equal(result.container.children.length > 0, true);
  assert.equal(result.window.KnowledgeExplorerHub.api, undefined);
}

async function testMalformedAndBrokenDataStayRenderable() {
  const pages = buildPages();
  pages.push({
    source_path: "SYNTHETIC/knowledge-explorer/invalid/malformed.md",
    path: "SYNTHETIC/knowledge-explorer/invalid/malformed.md",
    title: "Malformed",
    type: "",
    content: "",
    frontmatter: { knowledge_domain: "unknown", knowledge_topics: ["bad"], connections: ["[[SYNTHETIC/knowledge-explorer/missing/ghost.md]]"] },
    file: { path: "SYNTHETIC/knowledge-explorer/invalid/malformed.md", name: "malformed", mtime: 1, outlinks: ["[[SYNTHETIC/knowledge-explorer/missing/ghost.md]]"], inlinks: [] },
    connections: ["[[SYNTHETIC/knowledge-explorer/missing/ghost.md]]"],
    outlinks: ["[[SYNTHETIC/knowledge-explorer/missing/ghost.md]]"],
    backlinks: []
  });

  const result = await runHub({ pages });
  const text = collectText(result.container);
  assert.match(text, /확인 필요/);
  assert.match(text, /연결 근거/);
  assert.doesNotMatch(text, /\b(warnings|provenance)\b/);
  assert.ok(result.window.KnowledgeExplorerHub.model.warnings.length > 0);
  assert.ok(result.window.KnowledgeExplorerHub.model.detail_warnings.length > 0);
  assert.ok(result.container.children.length > 0);
}

async function testSystemAuctionRegionTemplateIsNotCollectedAsAResource() {
  // Given: a real auction-region Resource and its Templater source, both with the supported type.
  const pages = buildPages();
  const templatePath = "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md";
  pages.push({
    source_path: templatePath,
    path: templatePath,
    title: "<% title %>",
    type: "auction_region",
    content: "---\ntype: auction_region\ntitle: <% title %>\n---\n",
    frontmatter: { type: "auction_region", title: "<% title %>" },
    file: { path: templatePath, name: "template_auction_region", mtime: 1, outlinks: [], inlinks: [] },
    connections: [],
    outlinks: [],
    backlinks: []
  });

  // When: the Hub collects records for the Explorer.
  const result = await runHub({ pages });
  const records = await result.window.KnowledgeExplorerHub.collectRecords();
  const collectedPaths = records.map((record) => record.source_path);

  // Then: system templates never project as Resources, while real auction-region Resources remain.
  assert.equal(collectedPaths.includes(templatePath), false, "system template must not project as a Resource");
  assert.equal(collectedPaths.includes("SYNTHETIC/knowledge-explorer/auction-region/서울-강남구.md"), true, "real auction-region Resource must remain projected");
  assert.doesNotMatch(collectText(result.container), /<% title %>/);
}

function testInvalidRecencyWarningUsesKoreanDisplayCopy() {
  // Given: the projection retains its machine-readable invalid_recency warning.
  const sectionsByPath = hubAdapter.buildDetailSections({
    domains: [{ key: "coding", label: "코딩", knowledge: [{ path: "ZETA/Coding/Date.md", title: "날짜 점검", topics: [] }], resources: [] }],
    warnings: [{
      code: "invalid_recency",
      path: "ZETA/Coding/Date.md",
      message: "updated could not be parsed; source mtime was used."
    }]
  }, {});

  // When: that warning reaches the user-facing detail-section adapter.
  const warning = sectionsByPath["zeta/coding/date.md"].find((section) => section.key === "warnings").items[0];

  // Then: the code remains available to the renderer, while raw implementation copy never reaches the user.
  assert.equal(warning.warning, "invalid_recency");
  assert.match(warning.detail, /업데이트 시각 형식을 확인해 주세요/);
  assert.doesNotMatch(warning.detail, /updated could not be parsed|source mtime/i);
}
async function testDirectReviewHandoffClosesAndFocuses() {
  const previousView = globalThis.KnowledgeDirectAuthoringView;
  let authoringOptions = null;
  let closeCalls = 0;
  let refreshCalls = 0;
  let refreshInFlight = null;
  let focusCalls = 0;
  globalThis.KnowledgeDirectAuthoringView = {
    openDirectAuthoringModal(_app, options) {
      authoringOptions = options;
      return {
        onClose() {},
        close() {
          closeCalls += 1;
          if (typeof this.onClose === "function") this.onClose();
        }
      };
    }
  };
  const refresh = () => {
    if (refreshInFlight) return refreshInFlight;
    refreshCalls += 1;
    refreshInFlight = Promise.resolve().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  };
  try {
    authoringAdapter.openDirectAuthoring({}, {
      candidateStore: {},
      authoringCore: { normalizeDirectStudy(input) { return input; } }
    }, refresh, () => { focusCalls += 1; });
    assert.ok(authoringOptions && typeof authoringOptions.onReview === "function");
    await authoringOptions.onReview();
    assert.equal(closeCalls, 1);
    assert.equal(refreshCalls, 1);
    assert.equal(focusCalls, 1);
  } finally {
    if (previousView === undefined) delete globalThis.KnowledgeDirectAuthoringView;
    else globalThis.KnowledgeDirectAuthoringView = previousView;
  }
}
function testParaEmptyStateOffersReviewRoute() {
  const previousProjection = globalThis.KnowledgeParaProjection;
  const previousCreator = globalThis.ParaObjectCreatorService;
  let zettelOpens = 0;
  globalThis.KnowledgeParaProjection = { sourceTypeLabel: (value) => String(value || "Object") };
  globalThis.ParaObjectCreatorService = { ACTIONS: [], executeAction: async () => ({ ok: true }) };
  try {
    const root = new FakeElement("section");
    paraView.renderParaPanel(root, {
      total_knowledge: 2,
      total_sources: 0,
      total_links: 0,
      groups: [],
      source_type_options: []
    }, { onOpenZettel: () => { zettelOpens += 1; } });
    assert.match(collectText(root), /원본 Object의 connections/);
    const open = firstElement(root, "button", (node) => node.text === "지식 구축에서 검증 대기 열기");
    assert.ok(open, "empty PARA state must expose a route back to Knowledge review");
    open.onclick({ preventDefault() {} });
    assert.equal(zettelOpens, 1);
  } finally {
    if (previousProjection === undefined) delete globalThis.KnowledgeParaProjection;
    else globalThis.KnowledgeParaProjection = previousProjection;
    if (previousCreator === undefined) delete globalThis.ParaObjectCreatorService;
    else globalThis.ParaObjectCreatorService = previousCreator;
  }
}

async function main() {
  testFixtureModulePathsMatchKnowledgeHub();
  await testHubLoadsExplorerAndDetailSections();
  await testHubMountsAuthoringActionsWithoutChangingExplorerProjection();
  await testCandidateLauncherOpensAtomicDetailWithOneEnabledHandoff();
  await testHubBuildsLargeExplorerWithoutEagerBodyReads();
  await testDirectReviewHandoffClosesAndFocuses();
  testParaEmptyStateOffersReviewRoute();
  await testRelationTargetsRemainMetadataOnlyAndClickable();
  await testSelectedBodyFallsBackToVaultReaderAfterDataviewFailure();
  await testMissingModuleProducesRecoverableError();
  await testMalformedAndBrokenDataStayRenderable();
  await testSystemAuctionRegionTemplateIsNotCollectedAsAResource();
  testInvalidRecencyWarningUsesKoreanDisplayCopy();
  console.log("Knowledge hub integration tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
