#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness } = require("../shared/real_obsidian_harness.js");

const PARA_CONTROLS = [
  ".knowledge-para-action-btn",
  ".knowledge-para-search",
  ".knowledge-para-source-filter",
  ".knowledge-para-sort",
  ".knowledge-para-clear",
  ".knowledge-para-clear-no-match",
];
const KNOWLEDGE_OWNERS = new Set([
  "SYSTEM/Views/knowledge-para-view.js",
  "SYSTEM/Views/knowledge-workspace-tabs.js",
  "SYSTEM/Views/knowledge-explorer-render.js",
  "SYSTEM/Views/knowledge-explorer-view.js",
  "SYSTEM/Views/knowledge-explorer-responsive.js",
]);

function matchesParaControl(offender) {
  return PARA_CONTROLS.some((selector) => String(offender.selector || "").includes(selector));
}
function isKnowledgeOwned(offender) {
  return (offender.matchedRules || []).some((rule) => {
    const owners = Array.isArray(rule.owningSourceFile) ? rule.owningSourceFile : [rule.owningSourceFile];
    return owners.some((owner) => KNOWLEDGE_OWNERS.has(owner));
  });
}

test("exact real Obsidian keeps the active 390px PARA slice operable without retaining inactive controls", { timeout: 180000 }, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("knowledge-para-390");
    await harness.openWorkspace("knowledge");
    const activation = await harness.evaluate(`(()=>{const tab=document.querySelector('#knowledge-tab-para');if(!tab)throw new Error('PARA_TAB_MISSING');tab.click();return{active:tab.getAttribute('aria-selected'),attachedPanels:[...document.querySelectorAll('.knowledge-workspace-panel')].map(panel=>panel.id),inactiveAttached:[...document.querySelectorAll('.knowledge-workspace-panel:not(#knowledge-panel-para)')].length}})()`);
    assert.equal(activation.active, "true");
    assert.deepEqual(activation.attachedPanels, ["knowledge-panel-para"], "only the active panel remains attached");
    assert.equal(activation.inactiveAttached, 0);

    const receipt = await harness.capture("knowledge", 390, "light", 1, false, "normal");
    const paraTargets = receipt.offenders.targetSize.filter(matchesParaControl);
    const paraZeros = receipt.offenders.zeroInteractive.filter(matchesParaControl);
    const ownedOverflow = receipt.offenders.overflow.filter(isKnowledgeOwned);
    assert.deepEqual(paraTargets, [], `undersized PARA controls:\n${JSON.stringify(paraTargets, null, 2)}`);
    assert.deepEqual(paraZeros, [], `zero-geometry PARA controls:\n${JSON.stringify(paraZeros, null, 2)}`);
    assert.deepEqual(ownedOverflow, [], `Knowledge-owned horizontal overflow:\n${JSON.stringify(ownedOverflow, null, 2)}`);

    const semantics = await harness.evaluate(`(()=>{const root=document.querySelector('#knowledge-panel-para');const controls=[...root.querySelectorAll(${JSON.stringify(PARA_CONTROLS.join(","))})];const style=controls.map(control=>{const box=control.getBoundingClientRect(),css=getComputedStyle(control);return{className:control.className,width:box.width,height:box.height,whiteSpace:css.whiteSpace,overflowWrap:css.overflowWrap,wordBreak:css.wordBreak}});const scrollOwners=[...document.querySelectorAll('[data-scroll-owner]')].map(node=>node.getAttribute('data-scroll-owner'));return{count:controls.length,style,scrollOwners,activeInside:root.contains(document.activeElement)}})()`);
    assert.ok(semantics.count > 0, "active PARA controls must render");
    assert.ok(semantics.style.every((item) => item.width >= 44 && item.height >= 44));
    assert.ok(semantics.style.every((item) => item.whiteSpace === "normal" && item.overflowWrap === "anywhere" && item.wordBreak === "keep-all"));
    assert.deepEqual(semantics.scrollOwners, [], "PARA must not introduce a fourth inner scroll owner");

    const matrix = [];
    let matrixIndex = 0, configuredWidth = 390, configuredZoom = 1;
    for (const width of [390, 834, 1068, 1440]) for (const theme of ["light", "dark"]) for (const zoom of [1, 2]) for (const forcedColors of [false, true]) {
      const explorerState = ["domain", "middle", "detail"][matrixIndex % 3];
      if (width !== configuredWidth || zoom !== configuredZoom) {
        await harness.setMetricsAndAwaitResize("knowledge", width, zoom);
        configuredWidth = width; configuredZoom = zoom;
      }
      const activation = await harness.evaluate(`(()=>{document.querySelector('#knowledge-tab-zettelkasten').click();const root=()=>document.querySelector('#knowledge-panel-zettelkasten'),focus=()=>root().querySelector('.knowledge-explorer-shell').dataset.focusPane,activate=group=>{const control=root().querySelector('[data-group="'+group+'"]');if(!control)throw new Error('EXPLORER_CONTROL_MISSING:'+group);control.click();return control};let back;while((back=root().querySelector('[data-action="back"]')))back.click();const state=${JSON.stringify(explorerState)};if(state==='middle'||state==='detail'){const domain=activate('domain');if(focus()!=='middle')domain.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}if(state==='detail'){const middle=activate('middle');if(focus()!=='detail')middle.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}return{focusPane:focus(),layout:root().querySelector('.knowledge-explorer-shell').dataset.layout}})()`);
      assert.equal(activation.focusPane, explorerState, `Explorer reached ${explorerState} after ${activation.layout} metrics settled`);
      const explorerRow = await harness.capture("knowledge", width, theme, zoom, forcedColors, explorerState);
      assert.deepEqual(explorerRow.offenders.overflow, [], `${width}/${theme}/${zoom}/${forcedColors}/${explorerState} strict Hub-root overflow:\n${JSON.stringify(explorerRow.offenders.overflow, null, 2)}`);
      const explorerComposition = await harness.evaluate(`(()=>{const shell=document.querySelector('#knowledge-panel-zettelkasten .knowledge-explorer-shell');const owners=[...document.querySelectorAll('#knowledge-panel-zettelkasten [data-scroll-owner]')].map(node=>node.getAttribute('data-scroll-owner'));const tabs=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="knowledge"] .knowledge-workspace-tab')];return{layout:shell&&shell.dataset.layout,owners:[...new Set(owners)],tabVerticalOverflow:tabs.filter(tab=>tab.scrollHeight>tab.clientHeight+1).map(tab=>tab.textContent.trim())}})()`);
      const expectedOwners = explorerComposition.layout === "wide"
        ? ["detail-pane", "domain-nav", "topic-nav"]
        : explorerComposition.layout === "medium"
          ? explorerState === "detail" ? ["detail-pane", "domain-nav"] : ["domain-nav", "topic-nav"]
          : [explorerState === "detail" ? "detail-pane" : explorerState === "middle" ? "topic-nav" : "domain-nav"];
      assert.deepEqual(explorerComposition.owners.sort(), expectedOwners, `Explorer scroll owners match its measured ${explorerComposition.layout} layout`);
      assert.deepEqual(explorerComposition.tabVerticalOverflow, [], `Knowledge tabs contain their labels at ${width}/${zoom}`);

      await harness.evaluate(`(()=>{document.querySelector('#knowledge-tab-para').click();return true})()`);
      const row = await harness.capture("knowledge", width, theme, zoom, forcedColors, "normal");
      const domain = await harness.evaluate(`(()=>{const root=document.querySelector('#knowledge-panel-para');const all=[root,...root.querySelectorAll('*')];const overflow=all.filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>({className:node.className,text:(node.textContent||'').slice(0,100),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}));const longUrl=all.find(node=>/https?:\\/\\//u.test(node.textContent||''));const cjk=all.find(node=>/[가-힣]/u.test(node.textContent||''));const focus=root.querySelector('.knowledge-para-search');focus.focus();const focusStyle=getComputedStyle(focus);return{overflow,longUrl:longUrl?{clientWidth:longUrl.clientWidth,scrollWidth:longUrl.scrollWidth,wrap:getComputedStyle(longUrl).overflowWrap}:null,cjk:!!cjk,focus:{outlineStyle:focusStyle.outlineStyle,outlineWidth:focusStyle.outlineWidth},motion:all.some(node=>{const css=getComputedStyle(node);return css.animationDuration!=='0s'||css.transitionDuration!=='0s'})}})()`);
      assert.deepEqual(row.offenders.targetSize.filter(matchesParaControl), [], `${width}/${theme}/${zoom}/${forcedColors} target size`);
      assert.deepEqual(row.offenders.zeroInteractive.filter(matchesParaControl), [], `${width}/${theme}/${zoom}/${forcedColors} zero geometry`);
      assert.deepEqual(row.keyboard.failures, [], `${width}/${theme}/${zoom}/${forcedColors} keyboard navigation`);
      assert.deepEqual(domain.overflow, [], `${width}/${theme}/${zoom}/${forcedColors} PARA overflow`);
      assert.equal(domain.cjk, true, "CJK fixture remains rendered");
      if (domain.longUrl) {
        assert.ok(domain.longUrl.scrollWidth <= domain.longUrl.clientWidth + 1, "long URL wraps inside PARA");
        assert.equal(domain.longUrl.wrap, "anywhere");
      }
      assert.notEqual(domain.focus.outlineStyle, "none", `${width}/${theme}/${zoom}/${forcedColors}: focused PARA search has a visible outline`);
      assert.ok(Number.parseFloat(domain.focus.outlineWidth) >= 2);
      assert.equal(domain.motion, false, "reduced-motion capture removes PARA animation and transition durations");
      matrix.push({ explorer: explorerRow.matrix, para: row.matrix });
      matrixIndex += 1;
    }
    assert.equal(matrix.length, 32, "complete PARA responsive/theme/zoom/forced-colors matrix");
    console.log("TASK13A_PARA_390_REDUCTION " + JSON.stringify({
      selectors: Object.fromEntries(PARA_CONTROLS.map((selector) => [selector, { undersized: 0, zeroGeometry: 0 }])),
      knowledgeOwnedHorizontalOverflow: ownedOverflow.length,
      allHubRootHorizontalOverflow: receipt.offenders.overflow.length,
      matrixRows: matrix.length,
    }));
  } finally {
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit.equal, true);
      assert.equal(cleanup.protectedContinuity.exact, true);
      assert.equal(cleanup.removed, true);
      assert.equal(cleanup.portReusable, true);
    }
  }
});
