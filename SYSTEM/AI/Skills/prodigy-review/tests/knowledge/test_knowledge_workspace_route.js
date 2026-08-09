"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const modulePath = path.join(ROOT, "SYSTEM/Views/knowledge-workspace-route.js");

async function main() {
  const previousHub = global.KnowledgeExplorerHub;
  const previousNotice = global.Notice;
  const opened = [];
  try {
    delete global.KnowledgeExplorerHub;
    global.Notice = class Notice {};
    delete require.cache[require.resolve(modulePath)];
    const route = require(modulePath);
    const app = {
      workspace: {
        async openLinkText(pathValue, sourcePath, mode) {
          opened.push([pathValue, sourcePath, mode]);
        }
      }
    };

    assert.equal(await route.openReview(app), true);
    assert.deepEqual(opened, [["HUB/50 Knowledge", "", false]]);
    assert.equal(global.KnowledgeExplorerHub._lastTab, "zettelkasten");
    assert.equal(global.KnowledgeExplorerHub._pendingFocus, "candidate-review");

    const failed = await route.openReview({ workspace: { async openLinkText() { throw new Error("unavailable"); } } });
    assert.equal(failed, false);
    assert.equal(global.KnowledgeExplorerHub._pendingFocus, "");
  } finally {
    delete require.cache[require.resolve(modulePath)];
    if (previousHub === undefined) delete global.KnowledgeExplorerHub;
    else global.KnowledgeExplorerHub = previousHub;
    if (previousNotice === undefined) delete global.Notice;
    else global.Notice = previousNotice;
  }
  console.log("Knowledge workspace route tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
