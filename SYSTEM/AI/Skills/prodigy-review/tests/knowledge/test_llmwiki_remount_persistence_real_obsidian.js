"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const OUT = path.resolve(process.env.LLMWIKI_REMOUNT_QA_OUT || path.join(ROOT, ".omo/evidence/llmwiki-remount-persistence"));

async function screenshot(harness, filename) {
  const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const bytes = Buffer.from(shot.data, "base64");
  fs.writeFileSync(path.join(OUT, filename), bytes);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("real Obsidian preserves LLM Wiki selection and controller across tab and workspace remounts", { timeout: 240000 }, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let harness;
  let receipt;
  try {
    harness = await RealObsidianHarness.start("llmwiki-remount-persistence");
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");

    const before = await harness.evaluate(`(async()=>{const hub=window.KnowledgeExplorerHub,choices=await hub.dispatchLlmWikiAction({action:"select_source"});if(!choices||choices.ok!==true||!Array.isArray(choices.source_options)||choices.source_options.length===0)throw new Error("NO_ELIGIBLE_LITERATURE_SOURCE");const source=choices.source_options[0],selected=await hub.dispatchLlmWikiAction({action:"select_source",source_path:source.path});if(!selected||selected.ok!==true)throw new Error("SOURCE_SELECTION_FAILED");hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());hub.__remountPersistenceController=hub.llmWikiRunController;const snapshot=hub.llmWikiLifecycleSnapshot();return{sourcePath:source.path,sourceTitle:source.title,selected:snapshot.source_selection&&snapshot.source_selection.selected,displayName:snapshot.source_selection&&snapshot.source_selection.display_name,controllerVersion:snapshot.controller_version,subscriberCount:hub._llmWikiSession.inboxSubscribers.size}})()`);
    assert.equal(before.selected, true);
    assert.equal(before.displayName, before.sourceTitle);
    assert.equal(before.subscriberCount, 1);
    const beforeSha256 = await screenshot(harness, "before-remount.png");

    await harness.renderedClick("#knowledge-tab-zettelkasten");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");
    const afterInternalTab = await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub,snapshot=hub.llmWikiLifecycleSnapshot();return{sameController:hub.llmWikiRunController===hub.__remountPersistenceController,activeTab:hub.tabs.getActiveTab(),selected:snapshot.source_selection&&snapshot.source_selection.selected,displayName:snapshot.source_selection&&snapshot.source_selection.display_name}})()`);
    assert.deepEqual(afterInternalTab, { sameController: true, activeTab: "llmwiki", selected: true, displayName: before.sourceTitle });

    try {
      await harness.openWorkspace("home");
      await harness.openWorkspace("knowledge");
    } catch (error) {
      receipt = receipt || {};
      receipt.remount_error_state = await harness.evaluate(`(()=>{const bounded=value=>String(value==null?"":value).slice(0,2000),hub=window.KnowledgeExplorerHub,snapshot=()=>{try{return typeof hub.llmWikiLifecycleSnapshot==='function'?hub.llmWikiLifecycleSnapshot():null}catch(_){return null}},active=app.workspace.getActiveFile&&app.workspace.getActiveFile(),files=app.vault.getFiles?app.vault.getFiles():[];return{error:{name:bounded(hub&&hub.error&&hub.error.name),message:bounded(hub&&hub.error&&hub.error.message),stack:bounded(hub&&hub.error&&hub.error.stack)},lifecycle_snapshot:snapshot(),workspace_ids:[...document.querySelectorAll('.prodigy-app-shell')].map(shell=>shell.dataset.workspaceId||null),alert_error_texts:[...document.querySelectorAll('.notice,.mod-warning,.mod-error,[role="alert"]')].map(node=>bounded(node.innerText||node.textContent)).filter(Boolean).slice(0,20),loader_error_texts:[...document.querySelectorAll('.prodigy-hub-loader-error,.prodigy-loader-error,[data-loader-error]')].map(node=>bounded(node.innerText||node.textContent)).filter(Boolean).slice(0,20),render_receipt:window.__task13aReceipts&&window.__task13aReceipts['HUB/50 Knowledge.md'],active_file_path:active&&active.path||null,processed_file_exists:files.some(file=>/processed/u.test(file.path||'')),provider_attempt_count:Number((hub&&hub.llmWikiRunController&&hub.llmWikiRunController.getSnapshot&&hub.llmWikiRunController.getSnapshot().counters||{}).provider_calls||0),writes_length:(window.__task13aWriteAttempts||[]).length}})()`);
      throw error;
    }
    await harness.waitForSelector('#knowledge-tab-llmwiki[aria-selected="true"]');
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");
    const afterRemount = await harness.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub,snapshot=hub.llmWikiLifecycleSnapshot();return{sameController:hub.llmWikiRunController===hub.__remountPersistenceController,activeTab:hub.tabs.getActiveTab(),selected:snapshot.source_selection&&snapshot.source_selection.selected,displayName:snapshot.source_selection&&snapshot.source_selection.display_name,controllerVersion:snapshot.controller_version,subscriberCount:hub._llmWikiSession.inboxSubscribers.size}})()`);
    assert.deepEqual(afterRemount, {
      sameController: true,
      activeTab: "llmwiki",
      selected: true,
      displayName: before.sourceTitle,
      controllerVersion: before.controllerVersion,
      subscriberCount: 1,
    });
    const afterSha256 = await screenshot(harness, "after-remount.png");

    receipt = {
      ok: true,
      source_path: before.sourcePath,
      source_title: before.sourceTitle,
      same_controller: true,
      active_tab: "llmwiki",
      selected_source_preserved: true,
      subscriber_count: 1,
      screenshots: {
        before: { file: "before-remount.png", sha256: beforeSha256 },
        after: { file: "after-remount.png", sha256: afterSha256 },
      },
    };
    fs.writeFileSync(path.join(OUT, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`LLMWIKI_REMOUNT_PERSISTENCE_GREEN ${JSON.stringify(receipt)}`);
  } finally {
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true, "disposable vault remains byte-identical");
      assert.equal(cleanup.protectedContinuity.exact, true, "protected live applications remain unchanged");
      assert.equal(cleanup.removed, true, "runtime is removed");
      assert.equal(cleanup.portReusable, true, "debug port is reusable");
    }
  }
});
