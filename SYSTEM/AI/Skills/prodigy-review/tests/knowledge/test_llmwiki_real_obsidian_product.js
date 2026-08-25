#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");
const { terminalActionReceipt } = require("./task21_stateful_terminal_contract.js");
const { ROOT, appForOperations, hash, operation, sourceFixtures, sourceKinds } = require("./llmwiki_real_product_fixtures.js");

const PRODUCT = path.join(ROOT, "SYSTEM/Views/llmwiki-migration-rollout.js");
const CANDIDATE_VIEW = path.join(ROOT, "SYSTEM/Views/knowledge-candidate-view.js");
const EVIDENCE = path.join(ROOT, ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-21");
const REPAIR_EVIDENCE = path.join(EVIDENCE, "repair-production-stateful-qa");
const ATOMIC_CANDIDATE_EVIDENCE = path.join(REPAIR_EVIDENCE, "atomic-candidate-open");

function load() { delete require.cache[PRODUCT]; return require(PRODUCT); }
function parseOperations(values) {
  const api = require(path.join(ROOT, "SYSTEM/Views/llmwiki-operation-contract.js"));
  return values.map((value) => {
    const parsed = api.parseOperation(JSON.stringify(value));
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    return parsed.value;
  });
}
function directLegacyPathCount() {
  const source = fs.readFileSync(CANDIDATE_VIEW, "utf8");
  return (source.match(/candidateStore\.approveCandidate|store\.approveCandidate/gu) || []).length;
}
function transactionFor(app, failMerge = false) {
  const hashApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
  const packetApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-risk-approval-packet.js"));
  const writeSetApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-risk-write-set.js"));
  global.LLMWikiHash = hashApi;
  return require(path.join(ROOT, "SYSTEM/Views/llmwiki-risk-vault-transaction-adapter.js")).createRiskVaultTransactionAdapter({
    app, packetApi, writeSetApi,
    executors: {
      async merge({ packet }) {
        for (const target of packet.operation.destination_ids) await app.vault.modify(app.vault.getAbstractFileByPath(target), packet.operation.after_bytes[target]);
        if (failMerge) throw new Error("fixture_second_write_failed");
        return { expected_after_bytes: { ...packet.operation.before_bytes, ...packet.operation.after_bytes } };
      },
    },
  });
}

// Baseline characterization is intentionally runnable before the Task 21 production module exists.
test("baseline: source adapters, controller DI, real harness, and current legacy owner remain characterized", async () => {
  const adapters = require(path.join(ROOT, "SYSTEM/Views/llmwiki-source-adapters.js")).createSourceAdapters();
  const schemas = [];
  for (const fixture of sourceFixtures()) {
    const before = JSON.stringify(fixture);
    const adapted = await adapters.extract(before);
    assert.equal(adapted.ok, true, JSON.stringify(adapted));
    assert.equal(JSON.stringify(fixture), before);
    schemas.push(Object.keys(adapted.value).join(","));
  }
  assert.equal(new Set(schemas).size, 1);
  assert.equal(typeof RealObsidianHarness.start, "function");
  const controllerSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-run-controller.js"), "utf8");
  assert.match(controllerSource, /options\.operation_services/);
  assert.ok([0, 1].includes(directLegacyPathCount()));
});

test("Reading, Daily Evidence, and Candidate migration intake is uniform, inert, and typed on malformed input", async () => {
  const product = load();
  const writes = [];
  const service = product.createMigrationService({ canonicalWriter: (...args) => writes.push(args) });
  const result = await service.normalizeSources(sourceFixtures().map(JSON.stringify));
  assert.equal(result.ok, true);
  assert.deepEqual(result.sources.map((row) => row.source.source_kind), sourceKinds);
  assert.equal(new Set(result.sources.map((row) => Object.keys(row).join(","))).size, 1);
  assert.equal(result.user_authored_schema_fields, 0);
  assert.equal(writes.length, 0);
  const malformed = await service.normalizeSources(["{not-json"]);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, "extractor_required");
  assert.equal(malformed.writer_calls, 0);
});

test("ZETA migration is classification-only until an exact typed user approval commits", async () => {
  const product = load();
  const operations = parseOperations([operation("create"), operation("update"), operation("merge"), operation("noop")]);
  const { app, vault } = appForOperations(operations);
  const transaction = transactionFor(app);
  const service = product.createMigrationService({ transactionAdapter: transaction, now: () => "2026-08-21T00:00:00.000Z" });
  const dry = await service.dryRun({ source_inputs: [...sourceFixtures(), sourceFixtures()[2]].map(JSON.stringify), classify: (_snapshot, index) => operations[index] });
  assert.equal(dry.ok, true);
  assert.deepEqual(dry.decisions.map((row) => row.kind), ["create", "update", "merge", "noop"]);
  assert.equal(dry.writer_calls, 0);
  assert.equal(vault.calls.filter((row) => String(row[1]).startsWith("ZETA/PERMANENT/")).length, 0);

  for (const decision of dry.decisions) {
    const packet = service.createMigrationPacket({ dry_run: dry, decision_id: decision.decision_id });
    assert.equal(packet.ok, true, JSON.stringify(packet));
    assert.equal((await service.commitMigrationPacket({ packet: packet.value })).reason, "migration_authorization_required");
    const authorization = service.authorizeMigrationPacket(packet.value, { action: "approve_migration", packet_hash: packet.value.packet_hash });
    assert.equal(authorization.ok, true, JSON.stringify(authorization));
    const committed = await service.commitMigrationPacket({ packet: packet.value, authorization: authorization.value });
    assert.equal(committed.ok, true, JSON.stringify(committed));
    for (const target of decision.operation.destination_ids) assert.equal(vault.files.get(target), decision.operation.after_bytes[target]);
    const repeated = await service.commitMigrationPacket({ packet: packet.value, authorization: authorization.value });
    assert.equal(repeated.status, "duplicate");
  }
});

test("stale and conflicted migration packets are blocked before canonical writer authority", async () => {
  const product = load();
  const update = parseOperations([operation("update", "stale")])[0];
  const { app, vault } = appForOperations([update]);
  const transaction = transactionFor(app);
  const service = product.createMigrationService({ transactionAdapter: transaction });
  const dry = await service.dryRun({ source_inputs: [JSON.stringify(sourceFixtures()[0])], classify: () => update });
  const packet = service.createMigrationPacket({ dry_run: dry, decision_id: dry.decisions[0].decision_id }).value;
  const authorization = service.authorizeMigrationPacket(packet, { action: "approve_migration", packet_hash: packet.packet_hash }).value;
  vault.files.set(update.destination_ids[0], "# changed after review\n");
  const stale = await service.commitMigrationPacket({ packet, authorization });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "target_revision_mismatch");
  assert.equal(vault.calls.filter((row) => ["create", "modify"].includes(row[0]) && row[1] === update.destination_ids[0]).length, 0);

  const conflicted = parseOperations([operation("update", "conflict", { conflicts: [{ conflict_id: "conflict_task21", status: "unresolved", source_ids: ["source_task21_a"], summary: "사람의 판단 필요" }] })])[0];
  const conflictDry = await service.dryRun({ source_inputs: [JSON.stringify(sourceFixtures()[0])], classify: () => conflicted });
  assert.equal(conflictDry.decisions[0].kind, "conflict");
  assert.equal(service.createMigrationPacket({ dry_run: conflictDry, decision_id: conflictDry.decisions[0].decision_id }).reason, "conflict_not_approval_eligible");
});

test("partial migration failure compensates exact before bytes and follow-up failure never reverses canonical success", async () => {
  const product = load();
  const merge = parseOperations([operation("merge", "partial")])[0];
  const failedFixture = appForOperations([merge]);
  const failedService = product.createMigrationService({ transactionAdapter: transactionFor(failedFixture.app, true) });
  const dry = await failedService.dryRun({ source_inputs: [JSON.stringify(sourceFixtures()[0])], classify: () => merge });
  const packet = failedService.createMigrationPacket({ dry_run: dry, decision_id: dry.decisions[0].decision_id }).value;
  const authorization = failedService.authorizeMigrationPacket(packet, { action: "approve_migration", packet_hash: packet.packet_hash }).value;
  const failed = await failedService.commitMigrationPacket({ packet, authorization });
  assert.equal(failed.ok, false);
  assert.equal(failed.compensation_verified, true, JSON.stringify(failed));
  for (const [target, before] of Object.entries(merge.before_bytes)) assert.equal(failedFixture.vault.files.get(target), before);
  assert.equal(failedFixture.vault.calls.some((row) => row[0] === "delete" && row[1].startsWith("ZETA/PERMANENT/")), false);

  const create = parseOperations([operation("create", "follow-up")])[0];
  const successFixture = appForOperations([create]);
  let gitCalls = 0;
  const service = product.createMigrationService({
    transactionAdapter: transactionFor(successFixture.app),
    refresh: async () => ({ ok: false, reason: "refresh_failed" }),
    git: async () => { gitCalls += 1; return { ok: false, reason: "GitUnavailable" }; },
  });
  const prepared = await service.dryRun({ source_inputs: [JSON.stringify(sourceFixtures()[0])], classify: () => create });
  const successPacket = service.createMigrationPacket({ dry_run: prepared, decision_id: prepared.decisions[0].decision_id }).value;
  const successAuth = service.authorizeMigrationPacket(successPacket, { action: "approve_migration", packet_hash: successPacket.packet_hash }).value;
  const committed = await service.commitMigrationPacket({ packet: successPacket, authorization: successAuth });
  assert.equal(committed.status, "committed");
  assert.equal(committed.follow_up.refresh.status, "failed");
  assert.equal(committed.follow_up.git.reason, "GitUnavailable");
  assert.equal(successFixture.vault.files.get(create.destination_ids[0]), create.after_bytes[create.destination_ids[0]]);
  assert.equal(gitCalls, 1);
});

test("rollout flags enforce create to resurfacing order and persisted uncertainty fails closed", () => {
  const product = load();
  const phases = ["create", "update", "merge", "maintenance", "git", "resurfacing"];
  let state = product.createRolloutState();
  assert.deepEqual(state.enabled_phases, []);
  for (const phase of phases) {
    const enabled = product.enableRolloutPhase(state, phase, { available: true, status: "green", receipt_id: `receipt_${phase}` });
    assert.equal(enabled.ok, true, JSON.stringify(enabled));
    state = enabled.value;
  }
  assert.deepEqual(state.enabled_phases, phases);
  assert.equal(product.enableRolloutPhase(product.createRolloutState(), "merge", { available: true, status: "green", receipt_id: "receipt_merge" }).reason, "prior_rollout_gate_unavailable");
  assert.equal(product.restoreRolloutState('{"version":"unknown","enabled_phases":["create","update"]}').enabled_phases.length, 0);
  assert.equal(product.restoreRolloutState("{bad-json").enabled_phases.length, 0);
  assert.doesNotMatch(fs.readFileSync(PRODUCT, "utf8"), /globalThis\.__.*(?:QA|TEST)|process\.env.*(?:QA|TEST)/u);
});

test("legacy Candidate approval is a source-adapter LLM Wiki handoff with no schema controls or direct canonical writer", async () => {
  const product = load();
  const adapters = require(path.join(ROOT, "SYSTEM/Views/llmwiki-source-adapters.js")).createSourceAdapters();
  const seen = [];
  const candidate = sourceFixtures()[2].record;
  const result = await product.handoffLegacyCandidate({ candidate: { ...candidate, path: sourceFixtures()[2].source_path }, sourceAdapter: adapters, analyze: (snapshot) => { seen.push(snapshot); return { ok: true, status: "review" }; } });
  assert.equal(result.status, "review");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].source.source_kind, "knowledge_candidate");
  assert.equal(directLegacyPathCount(), 0);
  const source = fs.readFileSync(CANDIDATE_VIEW, "utf8");
  assert.doesNotMatch(source, /name:\s*"(?:title|statement|knowledge_domain|knowledge_topics|topics_confirmed|approval_note|thin_override)"/u);
  assert.match(source, /handoff/i);
});

test("production surface exposes Task 21 migration and rollout ownership through the manifest", () => {
  const manifest = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js")).get("knowledge").required;
  assert.equal(manifest.filter((entry) => entry === "SYSTEM/Views/llmwiki-migration-rollout.js").length, 1);
  assert.ok(manifest.indexOf("SYSTEM/Views/llmwiki-source-adapters.js") < manifest.indexOf("SYSTEM/Views/llmwiki-migration-rollout.js"));
  assert.ok(manifest.indexOf("SYSTEM/Views/llmwiki-migration-rollout.js") < manifest.indexOf("SYSTEM/Views/llmwiki-run-controller.js"));
});

test("real Obsidian production renderer captures responsive Knowledge lifecycle without overflow", { timeout: 240000 }, async (t) => {
  if (process.env.TASK21_EMPTY_OBSIDIAN !== "1") return t.skip("superseded by populated stateful capture");
  fs.mkdirSync(path.join(EVIDENCE, "screenshots"), { recursive: true });
  const previous = process.env.TASK13A_SCREENSHOT_DIR;
  process.env.TASK13A_SCREENSHOT_DIR = path.join(EVIDENCE, "screenshots");
  let harness;
  const captures = [];
  try {
    harness = await RealObsidianHarness.start("task21-real-product");
    await harness.openWorkspace("knowledge");
    for (const width of [390, 820, 1440]) for (const theme of ["light", "dark"]) {
      const receipt = await harness.capture("knowledge", width, theme, 1, false, "normal");
      assert.equal(receipt.resourceRecovery.present, false);
      assert.deepEqual(receipt.offenders.overflow, []);
      assert.deepEqual(receipt.readability.oneGlyphColumns, []);
      await harness.evaluate(`(()=>{let resolvePending,rejectPending;window.__task21LifecycleVisible=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const finish=()=>{const node=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle');if(!node||!node.isConnected)return;observer.disconnect();clearTimeout(timer);resolvePending(true)};const observer=new MutationObserver(finish),timer=setTimeout(()=>{observer.disconnect();rejectPending(new Error('TASK21_LIFECYCLE_RENDER_TIMEOUT'))},10000);observer.observe(document.body,{childList:true,subtree:true});finish();return true})()`);
      await harness.renderedClick("#knowledge-tab-llmwiki");
      await harness.evaluate("window.__task21LifecycleVisible");
      const metrics = await harness.evaluate(`(()=>{const root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),visible=node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},all=[root,...root.querySelectorAll('*')].filter(visible),controls=all.filter(node=>node.matches('button,a[href],input,select,textarea,[role=button]')),overflow=all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).map(node=>({tag:node.tagName,className:String(node.className),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth})),errors=all.filter(node=>/TASK13A_ERROR|TypeError:|ReferenceError:|at \\w+ \\(/u.test(node.innerText||''));return{lifecycleCount:document.querySelectorAll('#knowledge-panel-llmwiki .llmwiki-lifecycle').length,overflow,documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,undersized:controls.filter(node=>{const box=node.getBoundingClientRect();return box.width<44||box.height<44}).map(node=>(node.innerText||node.getAttribute('aria-label')||node.tagName).trim()),runtimeErrors:errors.length,cjkClip:all.filter(node=>/[\\uac00-\\ud7af]/u.test(node.textContent||'')&&node.scrollWidth>node.clientWidth+1).length}})()`);
      assert.equal(metrics.lifecycleCount, 1);
      assert.deepEqual(metrics.overflow, []);
      assert.equal(metrics.documentOverflow, false);
      assert.deepEqual(metrics.undersized, []);
      assert.equal(metrics.runtimeErrors, 0);
      assert.equal(metrics.cjkClip, 0);
      const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const bytes = Buffer.from(shot.data, "base64");
      const filename = `llmwiki-product-${width}-${theme}.png`;
      fs.writeFileSync(path.join(EVIDENCE, "screenshots", filename), bytes);
      captures.push({ width, theme, path: `screenshots/${filename}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, metrics, keyboard: receipt.keyboard });
    }
  } finally {
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true);
      assert.equal(cleanup.protectedContinuity.exact, true);
      assert.equal(cleanup.removed, true);
    }
    if (previous === undefined) delete process.env.TASK13A_SCREENSHOT_DIR; else process.env.TASK13A_SCREENSHOT_DIR = previous;
  }
  fs.writeFileSync(path.join(EVIDENCE, "real-product-capture.json"), JSON.stringify({ ok: true, captures }, null, 2) + "\n");
});

test("real Obsidian drives populated production lifecycle states and keyboard actions", { timeout: 240000 }, async (t) => {
  if (process.env.TASK21_REAL_OBSIDIAN !== "1") return t.skip("stateful manual capture runs after automated GREEN");
  const screenshotDir = process.env.TASK21_LEGACY_ONLY === "1"
    ? path.join(ATOMIC_CANDIDATE_EVIDENCE, "screenshots")
    : path.join(REPAIR_EVIDENCE, "screenshots");
  if (process.env.TASK21_LEGACY_ONLY !== "1") fs.rmSync(screenshotDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  let harness;
  const captures = [];
  const keyboard = [];
  const interactions = [];
  let compensationEvidence = null;
  const raw = (kind, suffix, overrides = {}) => operation(kind, `real-${suffix}`, overrides);
  try {
    harness = await RealObsidianHarness.start("task21-stateful-product", { fixtureMutation: { task21Stateful: true } });
    await harness.mountStructuralWorkspace("knowledge");
    await harness.collapseSidebar("knowledge", "left");
    await harness.collapseSidebar("knowledge", "right");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    const initialInbox = await harness.evaluate(`window.KnowledgeExplorerHub.whenKnowledgeInboxSettled().then(async value=>({settled:value,snapshot:window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot(),capturedKeys:Object.keys(window.__task13aKnowledgeCapturedControllerOptions||{}),rolloutStored:window.__task13aKnowledgeCapturedControllerOptions&&window.__task13aKnowledgeCapturedControllerOptions.rollout_storage?await window.__task13aKnowledgeCapturedControllerOptions.rollout_storage.load():null,providerType:typeof (window.__task13aKnowledgeCapturedControllerOptions&&window.__task13aKnowledgeCapturedControllerOptions.operation_provider)}))`);
    assert.equal(initialInbox.snapshot.status, "review", JSON.stringify(initialInbox));
    await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="approve"]');
    if (process.env.TASK21_LEGACY_ONLY === "1") {
      await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub;hub.tabs.select('zettelkasten');window.__task21CandidateOpenPromise=new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{observer.disconnect();clearTimeout(timer)},finish=()=>{if(settled)return;const nodes=[...document.querySelectorAll('#knowledge-panel-zettelkasten [data-action="llmwiki-handoff"]')];if(nodes.length!==1||nodes[0].disabled)return;settled=true;cleanup();resolve({count:nodes.length,enabled:!nodes[0].disabled,focusPane:hub.api.state().focusPane,apiOpen:hub.api.candidateInboxOpen(),text:(document.querySelector('#knowledge-panel-zettelkasten')&&document.querySelector('#knowledge-panel-zettelkasten').innerText||'').slice(0,1200)})};const observer=new MutationObserver(finish),timer=setTimeout(()=>{cleanup();reject(new Error('TASK21_CANDIDATE_DETAIL_NOT_RENDERED:'+JSON.stringify({focusPane:hub.api.state().focusPane,apiOpen:hub.api.candidateInboxOpen(),actions:[...document.querySelectorAll('#knowledge-panel-zettelkasten [data-action]')].map(node=>node.getAttribute('data-action')),text:(document.querySelector('#knowledge-panel-zettelkasten')&&document.querySelector('#knowledge-panel-zettelkasten').innerText||'').slice(0,1200)})))},10000);observer.observe(document.querySelector('#knowledge-panel-zettelkasten'),{childList:true,subtree:true,attributes:true});finish()});return true})()`);
      await harness.renderedClick(".knowledge-candidate-review-launcher button");
      const opened = await harness.evaluate("window.__task21CandidateOpenPromise");
      assert.deepEqual({ count: opened.count, enabled: opened.enabled, focusPane: opened.focusPane, apiOpen: opened.apiOpen }, { count: 1, enabled: true, focusPane: "detail", apiOpen: true });
      await harness.evaluate(`(()=>{window.__task21Stateful.nextOperation=${JSON.stringify(operation("create", "legacy-bounded"))};window.__task21ActivatedHandoffPromise=new Promise((resolve,reject)=>{const finish=()=>{const review=document.querySelector('#knowledge-panel-llmwiki [data-action="review-migration"]');if(!review)return;observer.disconnect();clearTimeout(timer);resolve({activated:true,reviewEnabled:!review.disabled,selectedTab:window.KnowledgeExplorerHub.tabs.getActiveTab()})},observer=new MutationObserver(finish),timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK21_ACTIVATED_HANDOFF_TIMEOUT'))},15000);observer.observe(document.body,{childList:true,subtree:true,attributes:true});finish()});return true})()`);
      await harness.renderedClick('#knowledge-panel-zettelkasten [data-action="llmwiki-handoff"]');
      const activated = await harness.evaluate("window.__task21ActivatedHandoffPromise");
      const receipt = { ok: true, launcher: opened, handoff: activated };
      fs.writeFileSync(path.join(ATOMIC_CANDIDATE_EVIDENCE, "legacy-handoff-activated-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
      assert.equal(activated.activated, true);
      assert.equal(activated.reviewEnabled, true);
      assert.equal(activated.selectedTab, "llmwiki");
      return;
    }

    const stateCounters = () => harness.evaluate(`(()=>{const state=window.__task21Stateful;return{canonicalWrites:state.canonicalWrites,auditWrites:state.auditWrites,refreshCalls:state.refreshCalls,gitCalls:state.gitCalls,gitCommits:state.gitCommits,compensations:state.compensations}})()`);
    const setMode = (mode) => harness.evaluate(`window.__task21Stateful.mode=${JSON.stringify(mode)};true`);
    const updateLifecycle = () => harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub;hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());return hub.llmWikiLifecycleSnapshot().migration&&hub.llmWikiLifecycleSnapshot().migration.status||hub.llmWikiLifecycleSnapshot().status})()`);
    const statePresentation = Object.freeze({
      proposal_ready: { phrase: "검토할 제안이 준비되었습니다", selector: '[data-action="approve"]' },
      create_approval: { phrase: "지식 변경 검토", selector: '[data-action="approve"]' },
      committed: { phrase: "지식 반영 완료", selector: '[data-action="select-source"]' },
      update_approval: { phrase: "마이그레이션 변경안을 최종 확인", selector: '[data-action="approve-migration"]' },
      merge_approval: { phrase: "마이그레이션 변경안을 최종 확인", selector: '[data-action="approve-migration"]' },
      noop: { phrase: "이미 반영된 지식", selector: '[data-action="resurfacing-feedback"]' },
      conflict: { phrase: "충돌을 먼저 해결", selector: '[data-action="migration-conflict-repacket"]' },
      stale: { phrase: "검토 중 원본이 바뀌어", selector: '[data-action="migration-repacket"]' },
      refresh_failed: { phrase: "파생 데이터 새로고침에 실패", selector: '[data-action="retry-migration-refresh"]' },
      git_backup_pending: { phrase: "Git 백업 보류", selector: '[data-action="retry-migration-git"]' },
      compensation_recovery: { phrase: "원래 바이트로 복구", selector: '[data-action="migration-recovery"]' },
      migration_review: { phrase: "마이그레이션 분류가 준비", selector: '[data-action="review-migration"]' },
      legacy_handoff: { phrase: "마이그레이션 분류가 준비", selector: '[data-action="review-migration"]' },
      resurfacing_feedback: { phrase: "왜 표시됐나요", selector: '[data-action="resurfacing-feedback"]' },
    });
    const stateOrder = Object.keys(statePresentation);
    const captureState = async (stateId) => {
      const expected = statePresentation[stateId];
      assert.ok(expected, `unknown capture state: ${stateId}`);
      const rows = [];
      for (const [widthIndex, width] of [390, 820, 1440].entries()) {
        const theme = (stateOrder.indexOf(stateId) + widthIndex) % 2 === 0 ? "light" : "dark";
        await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false });
        const settlement = await harness.evaluate(`new Promise((resolve,reject)=>{const selector=${JSON.stringify(expected.selector)},root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),action=root&&root.querySelector(selector),shell=root&&root.closest('.prodigy-app-shell'),inner=shell&&shell.querySelector(':scope > .prodigy-app-shell-body'),ancestorNodes=(()=>{const rows=[];for(let node=shell&&shell.parentElement;node;node=node.parentElement)rows.push(node);return rows})(),ownerable=node=>{if(!node)return false;const style=getComputedStyle(node);return/(auto|scroll)/u.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1},ownerDeclared=node=>{if(!node)return false;return/(auto|scroll)/u.test(getComputedStyle(node).overflowY)},outer=ancestorNodes.find(ownerable)||ancestorNodes.find(ownerDeclared)||(ownerable(document.scrollingElement)?document.scrollingElement:null),visible=node=>{if(!node)return false;const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},events=[];if(!visible(root)||!visible(action))return reject(new Error('TASK21_FRAME_TARGET_MISSING:'+${JSON.stringify(stateId)}+':'+selector));document.body.classList.toggle('theme-dark',${theme === "dark"});document.body.classList.toggle('theme-light',${theme !== "dark"});document.documentElement.style.zoom='1';let stable=0,last='',done=false;const frameAction=()=>{const frameOwner=ownerDeclared(inner)?inner:outer,chrome=[...document.querySelectorAll('.status-bar')].filter(visible).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];if(!frameOwner||!chrome)return;const actionBox=action.getBoundingClientRect(),ownerBox=frameOwner.getBoundingClientRect(),chromeBox=chrome.getBoundingClientRect(),top=Math.max(0,ownerBox.top),bottom=Math.min(ownerBox.bottom,chromeBox.top),desired=frameOwner.scrollTop+actionBox.top-top-Math.max(0,(bottom-top-actionBox.height)/2);frameOwner.scrollTop=Math.max(0,desired)},cleanup=()=>{observer.disconnect();resize.disconnect();for(const owner of [inner,outer])if(owner)owner.removeEventListener('scroll',onScroll);clearTimeout(timer)},finish=()=>{if(done)return;frameAction();const actionBox=action.getBoundingClientRect(),rootBox=root.getBoundingClientRect(),signature=[actionBox.x,actionBox.y,actionBox.width,actionBox.height,rootBox.x,rootBox.y,rootBox.width,rootBox.height,inner&&inner.scrollTop,outer&&outer.scrollTop,shell&&shell.getAttribute('data-tier')].join(':');stable=signature===last?stable+1:0;last=signature;if(stable>=2){done=true;cleanup();resolve({events,tier:shell&&shell.getAttribute('data-tier'),innerScrollTop:inner&&inner.scrollTop||0,outerScrollTop:outer&&outer.scrollTop||0});return}requestAnimationFrame(finish)},onScroll=event=>events.push({type:'scroll',className:String(event.currentTarget.className),top:event.currentTarget.scrollTop});const observer=new MutationObserver(()=>events.push({type:'dom'})),resize=new ResizeObserver(()=>events.push({type:'layout'})),timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('TASK21_FRAME_SETTLEMENT_TIMEOUT:'+${JSON.stringify(stateId)}+':'+width+':'+JSON.stringify({events,last})))},5000);observer.observe(root,{childList:true,subtree:true,attributes:true});resize.observe(root);resize.observe(action);if(inner){resize.observe(inner);inner.addEventListener('scroll',onScroll,{passive:true})}if(outer){resize.observe(outer);outer.addEventListener('scroll',onScroll,{passive:true})}action.focus({preventScroll:true});action.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});frameAction();requestAnimationFrame(finish)})`);
        const metrics = await harness.evaluate(`(()=>{const selector=${JSON.stringify(expected.selector)},phrase=${JSON.stringify(expected.phrase)},root=document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle'),action=root&&root.querySelector(selector),shell=root&&root.closest('.prodigy-app-shell'),inner=shell&&shell.querySelector(':scope > .prodigy-app-shell-body'),ancestorNodes=(()=>{const rows=[];for(let node=shell&&shell.parentElement;node;node=node.parentElement)rows.push(node);return rows})(),ownerable=node=>{if(!node)return false;const style=getComputedStyle(node);return/(auto|scroll)/u.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1},ownerDeclared=node=>{if(!node)return false;return/(auto|scroll)/u.test(getComputedStyle(node).overflowY)},outer=ancestorNodes.find(ownerable)||ancestorNodes.find(ownerDeclared)||(ownerable(document.scrollingElement)?document.scrollingElement:null),target=node=>node.matches('input[type=checkbox],input[type=radio]')?(node.closest('label')||node):node,visible=node=>{if(!node)return false;const box=node.getBoundingClientRect(),style=getComputedStyle(node);return node.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'},all=root?[root,...root.querySelectorAll('*')].filter(visible):[],controls=all.filter(node=>node.matches('button,a[href],input,select,textarea,[role=button]')),overflow=all.filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1),errors=all.filter(node=>/TASK13A_ERROR|TypeError:|ReferenceError:|at \\w+ \\(/u.test(node.innerText||'')),titles=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id=knowledge] .prodigy-workspace-title')].filter(visible),chrome=[...document.querySelectorAll('.status-bar')].filter(visible).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0],framed=action&&(()=>{const frameOwner=ownerDeclared(inner)?inner:outer;if(frameOwner&&chrome){const actionBox=action.getBoundingClientRect(),ownerBox=frameOwner.getBoundingClientRect(),chromeBox=chrome.getBoundingClientRect(),top=Math.max(0,ownerBox.top),bottom=Math.min(ownerBox.bottom,chromeBox.top),desired=frameOwner.scrollTop+actionBox.top-top-Math.max(0,(bottom-top-actionBox.height)/2);frameOwner.scrollTop=Math.max(0,desired)}action.focus({preventScroll:true});return true})(),actionBox=action&&action.getBoundingClientRect(),chromeBox=chrome&&chrome.getBoundingClientRect(),overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)),ownerActive=node=>{if(!node)return false;const style=getComputedStyle(node);return/(auto|scroll)/u.test(style.overflowY)},outerScrollOwners=Number(ownerActive(outer)),innerScrollOwners=Number(ownerActive(inner)),viewportBottom=chromeBox?chromeBox.top:window.innerHeight,safeGap=12,rootBox=root&&root.getBoundingClientRect(),blankFraming=!rootBox||rootBox.top>viewportBottom*.6||rootBox.bottom<viewportBottom*.18,requiredActionFocused=document.activeElement===action,text=(root&&root.innerText||'').trim();if(!chromeBox)throw new Error('TASK21_EXTERNAL_STATUS_BAR_MISSING');return{root:root&&visible(root),text:text.slice(0,600),statePhrasePresent:text.includes(phrase),requiredAction:action&&((action.innerText||action.getAttribute('aria-label')||'').trim()),requiredActionFocused,requiredActionFullyVisible:Boolean(actionBox&&actionBox.top>=0&&actionBox.bottom<=chromeBox.top-safeGap),externalChromeIntersection:actionBox?overlap(actionBox,chromeBox):null,externalChromeSafeGap:actionBox?chromeBox.top-actionBox.bottom:null,externalChromeRect:{top:chromeBox.top,bottom:chromeBox.bottom,height:chromeBox.height},actionRect:actionBox&&{top:actionBox.top,bottom:actionBox.bottom,height:actionBox.height},rootRect:rootBox&&{top:rootBox.top,bottom:rootBox.bottom,height:rootBox.height},blankFraming,outerScrollOwners,innerScrollOwners,scrollOwnerMetrics:{outer:outer&&{className:String(outer.className),overflowY:getComputedStyle(outer).overflowY,clientHeight:outer.clientHeight,scrollHeight:outer.scrollHeight,scrollTop:outer.scrollTop},inner:inner&&{className:String(inner.className),overflowY:getComputedStyle(inner).overflowY,clientHeight:inner.clientHeight,scrollHeight:inner.scrollHeight,scrollTop:inner.scrollTop},ancestors:ancestorNodes.map(node=>({tag:node.tagName,className:String(node.className),overflowY:getComputedStyle(node).overflowY,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop})).slice(0,12)},horizontalOverflow:overflow.length,overflowDetails:overflow.map(node=>({tag:node.tagName,className:String(node.className),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,text:(node.innerText||'').trim().slice(0,80)})),documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,cjkClip:all.filter(node=>/[\\uac00-\\ud7af]/u.test(node.textContent||'')&&node.scrollWidth>node.clientWidth+1).length,runtimeErrors:errors.length,duplicateTitles:Math.max(0,titles.length-1),undersized:controls.filter(node=>{const box=target(node).getBoundingClientRect();return box.width<44||box.height<44}).length,undersizedDetails:controls.filter(node=>{const box=target(node).getBoundingClientRect();return box.width<44||box.height<44}).map(node=>({tag:node.tagName,action:node.getAttribute('data-action'),text:(target(node).innerText||node.getAttribute('aria-label')||'').trim(),box:(()=>{const b=target(node).getBoundingClientRect();return{width:b.width,height:b.height}})()})),visibleActions:controls.filter(node=>node.tagName==='BUTTON').length}})()`);
        assert.equal(metrics.root, true, stateId);
        assert.equal(metrics.statePhrasePresent, true, `${stateId}-${width}: expected phrase missing`);
        assert.equal(metrics.horizontalOverflow, 0, `${stateId}-${width}: ${JSON.stringify(metrics.overflowDetails)}`);
        assert.equal(metrics.documentOverflow, false, `${stateId}-${width}`);
        assert.equal(metrics.cjkClip, 0, `${stateId}-${width}`);
        assert.equal(metrics.runtimeErrors, 0, `${stateId}-${width}`);
        assert.equal(metrics.duplicateTitles, 0, `${stateId}-${width}`);
        assert.equal(metrics.undersized, 0, `${stateId}-${width}: ${JSON.stringify(metrics.undersizedDetails)}`);
        assert.equal(metrics.externalChromeIntersection, 0, `${stateId}-${width}: ${JSON.stringify(metrics)}`);
        assert.equal(metrics.requiredActionFullyVisible, true, `${stateId}-${width}: ${JSON.stringify(metrics)}`);
        assert.equal(metrics.requiredActionFocused, true, `${stateId}-${width}`);
        assert.equal(metrics.blankFraming, false, `${stateId}-${width}: ${JSON.stringify(metrics)}`);
        assert.equal(metrics.outerScrollOwners + metrics.innerScrollOwners, 1, `${stateId}-${width}: ${JSON.stringify(metrics.scrollOwnerMetrics)}`);
        assert.doesNotMatch(metrics.text, /INBOX에 분석할 자료가 없습니다/u, stateId);
        const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        const bytes = Buffer.from(shot.data, "base64");
        const filename = `${stateId}-${width}-${theme}.png`;
        fs.writeFileSync(path.join(screenshotDir, filename), bytes);
        const row = { state_id: stateId, viewport_width: width, theme, path: `screenshots/${filename}`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, expected_phrase: expected.phrase, expected_action: metrics.requiredAction, image_inspected: false, settlement, metrics, counters: await stateCounters() };
        captures.push(row);
        rows.push(row);
      }
      return rows;
    };
    const terminalActionSource = terminalActionReceipt.toString();
    const activate = async (action, selector, expectedAction) => {
      const prepared = await harness.evaluate(`(()=>{const action=${JSON.stringify(action)},selector=${JSON.stringify(selector)},expected=${JSON.stringify(expectedAction)},target=document.querySelector(selector),hub=window.KnowledgeExplorerHub,terminalActionReceipt=(${terminalActionSource});if(!target||target.disabled)throw new Error('TASK21_KEYBOARD_TARGET:'+selector);const emitted=target.getAttribute('data-emitted-action')||target.getAttribute('data-intent-action')||target.getAttribute('data-action');if(emitted!==expected)throw new Error('TASK21_EMITTED_ACTION:'+emitted+':'+expected);const raw=window.__task21Stateful,before={canonicalWrites:raw.canonicalWrites,auditWrites:raw.auditWrites,refreshCalls:raw.refreshCalls,gitCalls:raw.gitCalls,gitCommits:raw.gitCommits,compensations:raw.compensations};window.__task21TrustedActivation=false;window.__task21KeyboardPromise=new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{observer.disconnect();document.removeEventListener('click',click,true);window.removeEventListener('task21-lifecycle-action',finish);clearTimeout(timer)},finish=()=>{if(settled||!window.__task21TrustedActivation)return;const state=hub.llmWikiLifecycleSnapshot(),current=window.__task21Stateful,counters={canonicalWrites:current.canonicalWrites,auditWrites:current.auditWrites,refreshCalls:current.refreshCalls,gitCalls:current.gitCalls,gitCommits:current.gitCommits,compensations:current.compensations},result=terminalActionReceipt({action,expectedAction:expected,state,lastAction:hub.lastLlmWikiAction,counters,before,domText:(document.querySelector('#knowledge-panel-llmwiki .llmwiki-lifecycle')?.innerText||'')});if(!result)return;settled=true;cleanup();resolve({activate:true,focus_target:selector,emitted_action:emitted,...result})},click=event=>{if(event.target!==target)return;window.__task21TrustedActivation=event.isTrusted;queueMicrotask(finish)},observer=new MutationObserver(finish),timer=setTimeout(()=>{cleanup();reject(new Error('TASK21_KEYBOARD_STATE_TIMEOUT:'+expected+':'+JSON.stringify({trusted:window.__task21TrustedActivation,before,lastAction:hub.lastLlmWikiAction,snapshot:hub.llmWikiLifecycleSnapshot(),counters:window.__task21Stateful})))},15000);document.addEventListener('click',click,true);window.addEventListener('task21-lifecycle-action',finish);observer.observe(document.querySelector('#knowledge-panel-llmwiki'),{childList:true,subtree:true,attributes:true});finish()});target.focus();return{focused:document.activeElement===target,label:(target.innerText||target.getAttribute('aria-label')||'').trim(),emitted}})()`);
      assert.equal(prepared.focused, true, action);
      await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " ", unmodifiedText: " ", windowsVirtualKeyCode: 32 });
      await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      const result = await harness.evaluate("window.__task21KeyboardPromise");
      assert.equal(result.activate, true, action);
      keyboard.push({ action, ...result, label: prepared.label });
      interactions.push({ state: result.resulting_state, action, emitted_action: result.emitted_action, writer_counts: result.writer_counts, deltas: result.deltas });
      return result;
    };
    const prepareRisk = async (rawOperation, suffix) => {
      const value = await harness.evaluate(`(async()=>{const raw=${JSON.stringify(rawOperation)},parsed=window.LLMWikiOperationContract.parseOperation(JSON.stringify(raw));if(!parsed.ok)throw new Error('TASK21_OPERATION:'+parsed.reason);window.__task21Stateful.nextOperation=raw;const hub=window.KnowledgeExplorerHub,prior=hub.llmWikiRunController.getOperationSnapshot();if(prior.status==='committed'&&prior.follow_up&&prior.follow_up.status==='pending'){const bound=hub.llmWikiRunController.bindOperationCancel({action:'cancel'});if(!bound.ok)throw new Error('TASK21_SETTLE_BIND:'+bound.reason);const cancelled=await hub.llmWikiRunController.cancelOperation(bound.value);if(!cancelled.ok)throw new Error('TASK21_SETTLE_CANCEL:'+cancelled.reason)}const result=hub.llmWikiRunController.openPreparedRiskReview({run_id:${JSON.stringify(`run_task21_${suffix}`)},proposals:[{operation:parsed.value,title:'실제 상태형 제안'}]});hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());return{ok:result.ok,reason:result.reason,status:hub.llmWikiLifecycleSnapshot().status}})()`);
      assert.equal(value.ok, true, JSON.stringify(value));
      await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="approve"]');
    };
    const startMigration = async (rawOperation, sourceKind = "knowledge_candidate") => {
      const result = await harness.evaluate(`(async()=>{const raw=${JSON.stringify(rawOperation)},hub=window.KnowledgeExplorerHub;window.__task21Stateful.nextOperation=raw;const record=${JSON.stringify(sourceFixtures()[2].record)},input=JSON.stringify({source_kind:${JSON.stringify(sourceKind)},source_path:'PARA/RESOURCES/Knowledge/Candidates/TASK21 Candidate.md',record:{...record,type:'knowledge_candidate'}});const value=await hub.startLlmWikiMigration([input],'task21_stateful_migration');hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());return{ok:value.ok,status:hub.llmWikiLifecycleSnapshot().migration&&hub.llmWikiLifecycleSnapshot().migration.status,reason:value.reason}})()`);
      assert.equal(result.ok, true, JSON.stringify(result));
      await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="review-migration"]');
      return result;
    };
    const openMigrationPacket = async () => {
      await harness.renderedClick('#knowledge-panel-llmwiki [data-action="review-migration"]');
      await harness.waitForSelector('#knowledge-panel-llmwiki [data-action="approve-migration"]');
    };

    await captureState("proposal_ready");
    await captureState("create_approval");
    const beforeCreate = await stateCounters();
    await activate("approve", '#knowledge-panel-llmwiki [data-action="approve"]', "approve_risk");
    const afterCreate = await stateCounters();
    assert.equal(afterCreate.canonicalWrites, beforeCreate.canonicalWrites + 1);
    await captureState("committed");
    if (process.env.TASK21_PROPOSAL_ONLY === "1") {
      fs.writeFileSync(path.join(REPAIR_EVIDENCE, "proposal-ready-seam-receipt.json"), JSON.stringify({ ok: true, captures, keyboard, interactions, counters: afterCreate }, null, 2) + "\n");
      return;
    }

    await prepareRisk(raw("create", "reject"), "reject");
    await activate("reject", '#knowledge-panel-llmwiki [data-action="reject"]', "reject_risk");

    await setMode("success");
    await startMigration(raw("update", "update"));
    await openMigrationPacket();
    await captureState("update_approval");
    await activate("migration_update_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");

    await startMigration(raw("merge", "merge"));
    await openMigrationPacket();
    await captureState("merge_approval");
    await activate("migration_merge_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");

    await startMigration(raw("noop", "noop"));
    await openMigrationPacket();
    const noopBefore = await stateCounters();
    await activate("migration_noop_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");
    const noopAfter = await stateCounters();
    assert.equal(noopAfter.canonicalWrites, noopBefore.canonicalWrites);
    await captureState("noop");

    const conflict = raw("update", "conflict", { conflicts: [{ conflict_id: "conflict_task21_real", status: "unresolved", source_ids: ["source_task21_a"], summary: "실제 충돌 검토" }] });
    await startMigration(conflict);
    const conflictBefore = await stateCounters();
    await captureState("conflict");
    assert.equal((await stateCounters()).canonicalWrites, conflictBefore.canonicalWrites);

    await setMode("stale");
    await startMigration(raw("update", "stale"));
    await openMigrationPacket();
    const staleBefore = await stateCounters();
    await activate("migration_stale_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");
    assert.equal((await stateCounters()).canonicalWrites, staleBefore.canonicalWrites);
    await captureState("stale");

    await setMode("refresh_failed");
    await startMigration(raw("create", "refresh"));
    await openMigrationPacket();
    const migrationRefreshFailure = await activate("migration_refresh_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");
    assert.equal(migrationRefreshFailure.deltas.refresh, 1, "initial migration refresh failure must count one trusted attempt");
    const refreshWrites = (await stateCounters()).canonicalWrites;
    await captureState("refresh_failed");
    await setMode("success");
    const migrationRefreshRetry = await activate("retry_refresh", '#knowledge-panel-llmwiki [data-action="retry-migration-refresh"]', "retry_migration_refresh");
    assert.deepEqual({ canonical: migrationRefreshRetry.deltas.canonical, audit: migrationRefreshRetry.deltas.audit, refresh: migrationRefreshRetry.deltas.refresh, git_calls: migrationRefreshRetry.deltas.git_calls }, { canonical: 0, audit: 0, refresh: 1, git_calls: 0 });
    assert.equal((await stateCounters()).canonicalWrites, refreshWrites);

    await setMode("git_pending");
    await startMigration(raw("create", "git"));
    await openMigrationPacket();
    await activate("migration_git_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");
    const gitWrites = (await stateCounters()).canonicalWrites;
    const gitCommits = (await stateCounters()).gitCommits;
    await captureState("git_backup_pending");
    await setMode("success");
    await activate("retry_git", '#knowledge-panel-llmwiki [data-action="retry-migration-git"]', "retry_migration_git");
    assert.equal((await stateCounters()).canonicalWrites, gitWrites);
    assert.equal((await stateCounters()).gitCommits, gitCommits + 1);

    await setMode("partial_failure");
    await startMigration(raw("merge", "partial"));
    await openMigrationPacket();
    await activate("migration_partial_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");
    compensationEvidence = await harness.evaluate(`(()=>{const state=window.__task21Stateful,observations=state.compensationObservations.map(value=>structuredClone(value)),audit_chain=state.transactionAuditChain.map(value=>structuredClone(value));return{observations,audit_chain,memory:Object.fromEntries(state.memory)}})()`);
    assert.equal(compensationEvidence.observations.length, 1);
    assert.equal(compensationEvidence.observations[0].restoration_exact, true);
    assert.ok(compensationEvidence.observations[0].rows.some((row) => row.before_bytes !== row.intermediate_bytes), "first canonical write was not observed");
    for (const row of compensationEvidence.observations[0].rows) {
      assert.equal(row.restored_bytes, row.before_bytes, row.path);
      assert.equal(row.restored_sha256, row.before_sha256, row.path);
      assert.equal(row.restoration_exact, true, row.path);
    }
    assert.equal(compensationEvidence.audit_chain.length, 1);
    assert.equal(compensationEvidence.audit_chain[0].previous_audit_hash, null);
    await captureState("compensation_recovery");
    await activate("recovery", '#knowledge-panel-llmwiki [data-action="migration-recovery"]', "migration_recovery");

    await setMode("success");
    await startMigration(raw("create", "migration-review"));
    await captureState("migration_review");

    await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub;hub.tabs.select('zettelkasten');hub.api.setCandidateInboxOpen(true);hub.api.dispatch({type:'focus-pane',focusPane:'detail'});return true})()`);
    await harness.waitForSelector('[data-action="llmwiki-handoff"]');
    await harness.evaluate(`window.__task21Stateful.nextOperation=${JSON.stringify(raw("create", "legacy"))};true`);
    await harness.evaluate(`(()=>{const target=document.querySelector('[data-action="llmwiki-handoff"]');window.__task21LegacyPromise=new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{const review=document.querySelector('#knowledge-panel-llmwiki [data-action="review-migration"]');if(!review)return;observer.disconnect();clearTimeout(timer);resolve(true)});observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK21_LEGACY_TIMEOUT'))},15000)});target.focus();return document.activeElement===target})()`);
    await harness.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await harness.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    assert.equal(await harness.evaluate("window.__task21LegacyPromise"), true);
    await captureState("legacy_handoff");

    await openMigrationPacket();
    await setMode("success");
    await activate("migration_resurfacing_approve", '#knowledge-panel-llmwiki [data-action="approve-migration"]', "approve_migration");
    const feedbackBefore = await stateCounters();
    await captureState("resurfacing_feedback");
    await activate("resurfacing_feedback", '#knowledge-panel-llmwiki [data-action="resurfacing-feedback"]', "resurfacing_feedback");
    assert.equal((await stateCounters()).canonicalWrites, feedbackBefore.canonicalWrites);

    await prepareRisk(raw("update", "repacket"), "repacket");
    await activate("repacket", '#knowledge-panel-llmwiki [data-action="request-revision"]', "request_risk_revision");

    const aggregate = { horizontal_overflow: 0, cjk_clipping: 0, runtime_errors: 0, duplicate_titles: 0, undersized_controls: 0 };
    for (const item of captures) {
      aggregate.horizontal_overflow += item.metrics.horizontalOverflow + Number(item.metrics.documentOverflow);
      aggregate.cjk_clipping += item.metrics.cjkClip;
      aggregate.runtime_errors += item.metrics.runtimeErrors;
      aggregate.duplicate_titles += item.metrics.duplicateTitles;
      aggregate.undersized_controls += item.metrics.undersized;
    }
    assert.equal(captures.length, Object.keys(statePresentation).length * 3, "Task 21 cartesian state-width matrix incomplete");
    assert.equal(new Set(captures.map((item) => `${item.state_id}:${item.viewport_width}`)).size, captures.length, "duplicate state-width key");
    assert.equal(new Set(captures.map((item) => item.sha256)).size, captures.length, "duplicate state image");
    const manifest = { schema: "Task21StatefulScreenshotManifest/v2", ok: true, current_build: true, states: Object.keys(statePresentation), widths: [390, 820, 1440], captures, metrics: aggregate };
    fs.writeFileSync(path.join(REPAIR_EVIDENCE, "stateful-screenshot-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(path.join(REPAIR_EVIDENCE, "real-stateful-interaction-receipt.json"), JSON.stringify({ schema: "Task21StatefulInteractionReceipt/v2", ok: true, empty_only: false, interactions, keyboard, compensation: compensationEvidence, final_counters: await stateCounters() }, null, 2) + "\n");
  } finally {
    if (harness) {
      await harness.evaluate(`(async()=>{for(const path of ['SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json','SYSTEM/PRIVATE/llmwiki-chunk-coverage.json','SYSTEM/PRIVATE/llmwiki-analysis-cache.json','SYSTEM/PRIVATE/llmwiki-inbox-proposals.json','SYSTEM/PRIVATE/llmwiki-fleeting-review-state.json']){const file=app.vault.getAbstractFileByPath(path);if(file)await app.vault.delete(file,true)}return true})()`);
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true);
      assert.equal(cleanup.protectedContinuity.exact, true);
      assert.equal(cleanup.removed, true);
      fs.writeFileSync(path.join(process.env.TASK21_LEGACY_ONLY === "1" ? ATOMIC_CANDIDATE_EVIDENCE : REPAIR_EVIDENCE, "real-cleanup.json"), JSON.stringify(cleanup, null, 2) + "\n");
    }
  }
});
