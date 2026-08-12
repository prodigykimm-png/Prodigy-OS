#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, matrixAggregate, snapshotProtected } = require("../shared/real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");

test("Journal action groups remain operable and overflow-free at 390px and 200% zoom", { timeout: 300000 }, async () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/journal-dashboard-view.js"), "utf8");
  assert.match(source, /@media\(max-width:419px\)\{\.journal-card\.prodigy-full-bleed\{padding-inline:0\}/u,
    "Journal must remove full-bleed inline padding when it would consume the 44px action track");

  const harness = await RealObsidianHarness.start("journal-compact-actions", { protectedSnapshot: snapshotProtected() });
  const rows = [];
  try {
    await harness.openWorkspace("journal");
    for (const theme of ["light", "dark"]) for (const forcedColors of [false, true]) {
      const receipt = await harness.capture("journal", 390, theme, 2, forcedColors, "normal");
      const geometry = await harness.evaluate(`(()=>{const root=document.querySelector('.prodigy-journal-workspace'),selectors=['.journal-primary-actions','.journal-actions'];const groups=selectors.map(selector=>{const group=root.querySelector(selector),controls=[...group.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')].filter(control=>{const box=control.getBoundingClientRect(),style=getComputedStyle(control);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'}),ancestors=[];for(let node=group;node&&root.contains(node);node=node.parentElement)ancestors.push({className:node.className,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth});const groupStyle=getComputedStyle(group),cardStyle=getComputedStyle(group.parentElement);return{selector,clientWidth:group.clientWidth,scrollWidth:group.scrollWidth,style:{display:groupStyle.display,flexWrap:groupStyle.flexWrap,gap:groupStyle.gap,minInlineSize:groupStyle.minInlineSize,maxInlineSize:groupStyle.maxInlineSize,boxSizing:groupStyle.boxSizing},card:{clientWidth:group.parentElement.clientWidth,scrollWidth:group.parentElement.scrollWidth,paddingInline:cardStyle.paddingInline},controls:controls.map(control=>{const box=control.getBoundingClientRect(),style=getComputedStyle(control);return{text:(control.textContent||control.getAttribute('aria-label')||'').trim(),width:box.width,height:box.height,tabIndex:control.tabIndex,minInlineSize:style.minInlineSize,maxInlineSize:style.maxInlineSize,flex:style.flex,boxSizing:style.boxSizing}}),ancestors}});const visibleControls=[...root.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"]')].filter(control=>{const box=control.getBoundingClientRect(),style=getComputedStyle(control);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'}).map(control=>{const box=control.getBoundingClientRect();return{text:(control.textContent||control.getAttribute('aria-label')||'').trim(),width:box.width,height:box.height,tabIndex:control.tabIndex}});return{groups,visibleControls}})()`);
      assert.equal(geometry.groups.length, 2);
      for (const group of geometry.groups) {
        assert.ok(group.clientWidth >= 44, `${group.selector} client width ${group.clientWidth}`);
        assert.ok(group.scrollWidth <= group.clientWidth + 1, `${group.selector} horizontal overflow`);
        assert.deepEqual(group.style, { display: "flex", flexWrap: "wrap", gap: "4px", minInlineSize: "0px", maxInlineSize: "100%", boxSizing: "border-box" });
        assert.equal(group.card.paddingInline, "0px", `${group.selector} compact full-bleed padding`);
        assert.ok(group.card.scrollWidth <= group.card.clientWidth + 1, `${group.selector} card overflow`);
        assert.ok(group.controls.length > 0, `${group.selector} controls`);
        assert.ok(group.controls.every((control) => control.width >= 88 && control.height >= 88 && control.tabIndex >= 0 && Number.parseFloat(control.minInlineSize) >= 44 && control.maxInlineSize === "100%" && control.boxSizing === "border-box"), `${group.selector} 44px logical controls and keyboard order`);
        assert.ok(group.ancestors.every((ancestor) => ancestor.scrollWidth <= ancestor.clientWidth + 1), `${group.selector} ancestor overflow`);
      }
      assert.ok(geometry.visibleControls.every((control) => control.width >= 88 && control.height >= 88 && control.tabIndex >= 0), "all visible Journal controls retain 44px logical targets and keyboard order");
      assert.deepEqual(receipt.keyboard.failures, []);
      rows.push({ matrix: receipt.matrix, geometry, screenshot: receipt.screenshot.sha256 });
    }
    assert.equal(rows.length, 4);
    process.stdout.write(`TASK13A_JOURNAL_COMPACT_ACTIONS ${JSON.stringify({ runId: harness.runtime.nonce, count: rows.length, aggregateSha256: matrixAggregate(rows), rows })}\n`);
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true);
    assert.equal(cleanup.protectedContinuity.exact, true);
    assert.equal(cleanup.removed, true);
    assert.equal(cleanup.portReusable, true);
  }
});
