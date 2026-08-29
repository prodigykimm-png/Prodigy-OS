"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const OUT_DIR = process.env.LLMWIKI_PROVIDER_QA_DIR || "/tmp/llmwiki-provider-inheritance-qa";

test("real Obsidian blocks an unconfigured provider before LLM Wiki analysis starts", { timeout: 240000 }, async () => {
  let harness;
  let configPath;
  let originalConfig;
  try {
    harness = await RealObsidianHarness.start("llmwiki-provider-preflight");
    configPath = path.join(harness.runtime.vault, "SYSTEM/PRIVATE/prodigy.local.json");
    originalConfig = fs.readFileSync(configPath, "utf8");
    fs.writeFileSync(configPath, `${JSON.stringify({
      defaultProvider: "openrouter",
      aiProfiles: {
        schema_version: 1,
        llmwiki: {
          direct_provider_key: "antigravity",
          omniroute_provider_key: "",
        },
      },
    }, null, 2)}\n`);

    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");
    const observed = await harness.evaluate(`(async()=>{const hub=window.KnowledgeExplorerHub,choices=await hub.dispatchLlmWikiAction({action:"select_source"}),source=choices&&choices.source_options&&choices.source_options[0];if(!source)throw new Error("TASK13A_LITERATURE_SOURCE_MISSING");await hub.dispatchLlmWikiAction({action:"select_source",source_path:source.path});const result=await hub.dispatchLlmWikiAction({action:"request_consent"});hub.llmWikiLifecycle.update(hub.llmWikiLifecycleSnapshot());const snapshot=hub.llmWikiLifecycleSnapshot(),selected=snapshot.provider_options.find(option=>option.provider_key==="openrouter"),inherited=document.querySelector('[data-provider-inheritance="global"]');return{result:{ok:result.ok,status:result.status,reason:result.reason},providerKey:snapshot.provider_key,configured:selected&&selected.configured,runCommand:Boolean(hub.llmWikiSelectedRunCommand),providerError:Boolean(snapshot.provider_selection_error),inheritedKey:inherited&&inherited.getAttribute("data-provider-key"),providerSelectorCount:document.querySelectorAll('[data-provider-selector="llmwiki"]').length}})()`);
    assert.deepEqual(observed, {
      result: { ok: false, status: "failed", reason: "provider_selection_unavailable" },
      providerKey: "openrouter",
      configured: false,
      runCommand: false,
      providerError: true,
      inheritedKey: "openrouter",
      providerSelectorCount: 0,
    });
    await harness.waitForSelector(".llmwiki-lifecycle__provider-error");
    await harness.evaluate(`Promise.all([app.workspace.leftSplit&&app.workspace.leftSplit.collapse?app.workspace.leftSplit.collapse():null,app.workspace.rightSplit&&app.workspace.rightSplit.collapse?app.workspace.rightSplit.collapse():null])`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const width of [375, 768, 1280]) {
      const resized = harness.cdp.send("Runtime.evaluate", {
        expression: `new Promise((resolve,reject)=>{if(innerWidth===${width})return resolve(true);const observer=new ResizeObserver(()=>{if(innerWidth!==${width})return;observer.disconnect();clearTimeout(timer);resolve(true)});observer.observe(document.documentElement);const timer=setTimeout(()=>{observer.disconnect();reject(new Error("LLMWIKI_PROVIDER_RESIZE_TIMEOUT"))},10000)})`,
        awaitPromise: true,
        returnByValue: true,
      });
      await harness.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      const resizeResult = await resized;
      assert.equal(resizeResult.exceptionDetails, undefined, `${width}px resize settles`);
      const geometry = await harness.evaluate(`new Promise((resolve)=>{const provider=document.querySelector('[data-provider-inheritance="global"]'),error=document.querySelector(".llmwiki-lifecycle__provider-error");provider.scrollIntoView({block:"center"});requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({viewport:innerWidth,providerVisible:Boolean(provider&&provider.getBoundingClientRect().width>0),errorVisible:Boolean(error&&error.getBoundingClientRect().width>0),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})))})`);
      assert.deepEqual(geometry, { viewport: width, providerVisible: true, errorVisible: true, horizontalOverflow: false });
      const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      fs.writeFileSync(path.join(OUT_DIR, `provider-inheritance-${width}.png`), Buffer.from(shot.data, "base64"));
    }
    console.log(`LLMWIKI_REAL_OBSIDIAN_PROVIDER_PREFLIGHT_GREEN ${JSON.stringify(observed)}`);
  } finally {
    if (configPath && originalConfig !== undefined) fs.writeFileSync(configPath, originalConfig);
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true, "disposable vault remains byte-identical");
      assert.equal(cleanup.protectedContinuity.exact, true, "protected live applications remain unchanged");
      assert.equal(cleanup.removed, true, "runtime is removed");
      assert.equal(cleanup.portReusable, true, "debug port is reusable");
    }
  }
});
