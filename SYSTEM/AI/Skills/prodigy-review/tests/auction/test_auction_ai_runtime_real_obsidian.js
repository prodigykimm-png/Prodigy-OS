#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const PLUGIN_ROOT = path.join(os.homedir(), "Developer/prodigy-ai-runtime");

test("real Auction and Region AI consumers mount with the external runtime and zero automatic calls", {
  timeout: 120000,
}, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("auction-ai-runtime", {
      fixtureMutation: { prodigyAIRuntimePluginPath: PLUGIN_ROOT },
    });
    await harness.evaluate(`(async()=>{
      await app.plugins.loadManifests();
      if(!app.plugins.plugins["prodigy-ai-runtime"])await app.plugins.enablePluginAndSave("prodigy-ai-runtime");
      return true;
    })()`);
    await harness.openWorkspace("auction");
    await harness.waitForSelector('.prodigy-app-shell[data-workspace-id="auction"]');
    const state = await harness.evaluate(`(()=>({
      client:typeof ProdigyAIClient?.createClient==="function",
      decision:typeof AuctionAiDecisionSupport?.openForAuction==="function",
      research:typeof AuctionRealEstateResearch?.openForAuction==="function",
      fatal:/필수 워크스페이스 리소스를 불러오지 못했습니다/u.test(document.body.innerText||""),
      network:(window.__task13aNodeNetworkAttempts||[]).length,
      auctionWrites:(window.__task13aWriteAttempts||[]).filter(row=>String(row.path||"").startsWith("PARA/PROJECTS/Auction/"))
    }))()`);
    assert.equal(state.client, true);
    assert.equal(state.decision, true);
    assert.equal(state.research, true);
    assert.equal(state.fatal, false);
    assert.equal(state.network, 0);
    assert.deepEqual(state.auctionWrites, []);
    assert.deepEqual(harness.osNetworkAttempts, []);
  } finally {
    if (harness) {
      const closed = await harness.close();
      assert.equal(closed.audit.equal, true);
      assert.equal(closed.protectedContinuity.exact, true);
      assert.equal(closed.removed, true);
      assert.equal(closed.portReusable, true);
    }
  }
});
