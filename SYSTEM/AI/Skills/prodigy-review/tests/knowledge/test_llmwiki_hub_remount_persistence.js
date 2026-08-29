"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildPages, runHub, remountHub } = require("./knowledge_hub_integration_harness.js");

async function testBatchApprovalVaultWriteExactHandlesStaleFolderLookup() {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../../..", "HUB/50 Knowledge.md"), "utf8");
  const method = source.match(/async writeExact\(targetPath, bytes\) \{([\s\S]*?return \{ ok: true \};)\n\s*\},/u);
  assert.ok(method);
  const writeExact = new Function("appRef", `return async function writeExact(targetPath, bytes) {${method[1]}
}`);
  const files = new Map();
  let folderCreates = 0;
  const vault = {
    getAbstractFileByPath(path) { return path === ".llmwiki-audit" ? null : (files.has(path) ? { path } : null); },
    async createFolder(path) { folderCreates += 1; if (folderCreates === 2) throw new Error("Folder already exists."); files.set(path, { path }); },
    async create(path, bytes) { files.set(path, { path, bytes }); },
    async modify(file, bytes) { file.bytes = bytes; },
  };
  await writeExact({ vault })(".llmwiki-audit/op.json", "one");
  await writeExact({ vault })(".llmwiki-audit/batch.json", "two");
  assert.equal(files.get(".llmwiki-audit/op.json").bytes, "one");
  assert.equal(files.get(".llmwiki-audit/batch.json").bytes, "two");
}

testBatchApprovalVaultWriteExactHandlesStaleFolderLookup().catch((error) => { console.error(error); process.exitCode = 1; });

async function main() {
  const hubSource = fs.readFileSync(path.resolve(__dirname, "../../../../../..", "HUB/50 Knowledge.md"), "utf8");
  assert.match(hubSource, /durableProcessed[\s\S]*operation_outcomes\.every\(\(row\) => row\.status === "committed"\)[\s\S]*archive_receipts\.length > 0/u);
  assert.match(hubSource, /durableProcessed && !startupFailure \? \{ status: "processed", reason: "" \}/u);

  const sourcePath = "ZETA/LITERATURE/remount-source.md";
  const first = await runHub({
    pages: buildPages(),
    extraFiles: {
      [sourcePath]: `---
type: "literature_note"
source_kind: "public"
source_id: "source_remount"
source_url: "https://example.com/remount"
source_title: "리마운트 출처"
---
# 리마운트 출처

탭을 벗어나도 선택과 검토 상태를 유지합니다.
`,
    },
  });
  first.window.KnowledgeExplorerHub.tabs.select("llmwiki");

  const controller = first.window.KnowledgeExplorerHub.llmWikiRunController;
  const choices = await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "select_source" });
  assert.equal(choices.ok, true);
  assert.ok(Array.isArray(choices.source_options) && choices.source_options.length > 0);
  const source = choices.source_options[0];
  const selected = await first.window.KnowledgeExplorerHub.dispatchLlmWikiAction({ action: "select_source", source_path: source.path });
  assert.equal(selected.ok, true);
  const snapshot = first.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot();
  assert.equal(snapshot.source_selection.selected, true);
  assert.equal(snapshot.source_selection.display_name, source.title);
  assert.equal(first.window.KnowledgeExplorerHub.tabs.getActiveTab(), "llmwiki");
  assert.equal(first.window.KnowledgeExplorerHub._lastTab, "llmwiki");
  assert.equal(first.window.KnowledgeExplorerHub._llmWikiSession.inboxSubscribers.size, 1);

  const second = await remountHub(first.runtime);
  assert.equal(second.window.KnowledgeExplorerHub.tabs.getActiveTab(), "llmwiki", "Knowledge remount restores the selected LLM Wiki tab");
  assert.equal(second.window.KnowledgeExplorerHub.llmWikiRunController, controller, "Knowledge remount reuses the active LLM Wiki run controller");
  assert.deepEqual(second.window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot(), snapshot, "LLM Wiki source, run, and review state survives remount");
  assert.equal(second.window.KnowledgeExplorerHub._llmWikiSession.inboxSubscribers.size, 1, "disposed mounts cannot keep receiving INBOX progress");

  console.log("LLM Wiki Hub remount persistence tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
