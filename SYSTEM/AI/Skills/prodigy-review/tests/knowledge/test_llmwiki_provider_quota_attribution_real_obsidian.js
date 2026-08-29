"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const OUT = process.env.LLMWIKI_QUOTA_QA_SCREENSHOT || "/tmp/llmwiki-openrouter-quota-qa.png";

test("real Obsidian attributes a quota failure to the inherited provider", { timeout: 240000 }, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("llmwiki-quota-attribution");
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");
    await harness.evaluate(`Promise.all([app.workspace.leftSplit&&app.workspace.leftSplit.collapse?app.workspace.leftSplit.collapse():null,app.workspace.rightSplit&&app.workspace.rightSplit.collapse?app.workspace.rightSplit.collapse():null])`);
    await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 1400, deviceScaleFactor: 1, mobile: false });

    const observed = await harness.evaluate(`new Promise((resolve)=>{const hub=window.KnowledgeExplorerHub,current=hub.llmWikiLifecycleSnapshot(),openrouter={provider_key:"openrouter",name:"OpenRouter",model:"stealth/ox-alpha",configured:true};hub.llmWikiLifecycle.update({...current,status:"idle",provider_key:"openrouter",provider_options:[openrouter],inbox:{state:"error",reason:"provider_quota_exhausted",scanned_total:1,eligible:1,held:0,pending:1,unchanged:0,processed:1,succeeded:0,failed:1}});requestAnimationFrame(()=>requestAnimationFrame(()=>{const statuses=[...document.querySelectorAll('.llmwiki-lifecycle__status[data-state="error"]')],status=statuses.at(-1),provider=document.querySelector('[data-provider-inheritance="global"]'),rect=status.getBoundingClientRect();resolve({providerKey:provider&&provider.getAttribute("data-provider-key"),mentionsOpenRouter:Boolean(status&&status.textContent.includes("OpenRouter")),mentionsAntigravity:Boolean(status&&status.textContent.includes("Antigravity")),statusVisible:rect.top>=0&&rect.bottom<=innerHeight,horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,statusTop:rect.top,statusBottom:rect.bottom,viewportHeight:innerHeight})}))})`);
    console.log(`LLMWIKI_REAL_OBSIDIAN_QUOTA_GEOMETRY ${JSON.stringify(observed)}`);
    assert.equal(observed.providerKey, "openrouter");
    assert.equal(observed.mentionsOpenRouter, true);
    assert.equal(observed.mentionsAntigravity, false);
    assert.equal(observed.statusVisible, true);
    assert.equal(observed.horizontalOverflow, false);
    const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
    console.log(`LLMWIKI_REAL_OBSIDIAN_QUOTA_ATTRIBUTION_GREEN ${JSON.stringify(observed)}`);
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
