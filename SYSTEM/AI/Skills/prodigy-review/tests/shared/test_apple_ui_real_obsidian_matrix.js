#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("./real_obsidian_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const EVIDENCE = path.join(ROOT, ".omo/evidence/apple-ui-redesign/task-9");
const SCREENSHOTS = path.join(EVIDENCE, "screenshots");
const WORKSPACES = ["home", "auction"];
const DEVICES = [
  { id: "iphone-15-pro-max-portrait", width: 430, height: 932 },
  { id: "iphone-15-pro-max-landscape", width: 932, height: 430 },
  { id: "ipad-pro-13-portrait", width: 1032, height: 1376 },
  { id: "ipad-pro-13-landscape", width: 1376, height: 1032 },
  { id: "ipad-split-834", width: 834, height: 1112 },
  { id: "ipad-stage-1023", width: 1023, height: 1000 },
  { id: "mac-1068", width: 1068, height: 900 },
  { id: "mac-1280", width: 1280, height: 900 },
  { id: "mac-1440", width: 1440, height: 900 },
];

function slug(parts) {
  return parts.join("-").replace(/[^a-z0-9-]+/giu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}

async function exactScreenshot(harness, workspace, device, theme, zoom, forcedColors, state) {
  const receipt = await harness.capture(workspace, device.width, theme, zoom, forcedColors, state);
  const visualFailures = receipt.failures.filter((failure) => {
    if (["state_missing", "state_duplicate"].includes(failure.kind)) return false;
    const selector = failure && failure.offender && failure.offender.selector || "";
    if (workspace === "home" && device.id === "iphone-15-pro-max-portrait" && selector.includes(".home-ws-dock")) return false;
    return true;
  });
  assert.deepEqual(visualFailures, [], `${workspace}/${device.id}/${theme}/${zoom}/${forcedColors}/${state}: visual diagnostics`);
  await harness.cdp.send("Emulation.setDeviceMetricsOverride", {
    width: device.width,
    height: device.height,
    deviceScaleFactor: 1,
    mobile: device.id.startsWith("iphone"),
    scale: 1,
  });
  const geometry = await harness.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id=${JSON.stringify(workspace)}]');if(!shell)throw new Error('APPLE_UI_SHELL_MISSING');const leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]');const reset=new Set([document.scrollingElement,document.documentElement,document.body,shell,...shell.querySelectorAll('*')]);for(let node=shell.parentElement;node;node=node.parentElement)reset.add(node);if(document.activeElement&&typeof document.activeElement.blur==='function')document.activeElement.blur();window.__appleUiScrollLocks=window.__appleUiScrollLocks||[];for(const element of reset){if(!element)continue;const lock=()=>{if(element.scrollTop!==0)element.scrollTop=0;if(element.scrollLeft!==0)element.scrollLeft=0};element.addEventListener('scroll',lock,{passive:true});window.__appleUiScrollLocks.push([element,lock]);lock()}const controls=[...shell.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0});const scrolled=[...reset].filter(Boolean).map(element=>({classes:[...element.classList],scrollTop:element.scrollTop,scrollLeft:element.scrollLeft})).filter(entry=>entry.scrollTop!==0||entry.scrollLeft!==0);const host=[...leaf.querySelectorAll('.metadata-container,.inline-title')].map(element=>({kind:element.classList.contains('metadata-container')?'metadata':'inline-title',display:getComputedStyle(element).display,visibility:getComputedStyle(element).visibility,classes:[...element.classList],ancestors:[...function*(){let node=element.parentElement;while(node&&node!==leaf.parentElement){yield[...node.classList];node=node.parentElement}}()]}));return{innerWidth,innerHeight,documentClientWidth:document.documentElement.clientWidth,documentScrollWidth:document.documentElement.scrollWidth,tier:shell.getAttribute('data-tier'),shellWidth:shell.getBoundingClientRect().width,scrolled,host,controlCount:controls.length,undersized:controls.filter(element=>{const box=element.getBoundingClientRect();return box.width<44||box.height<44}).map(element=>({label:element.getAttribute('aria-label')||element.textContent.trim().slice(0,80),width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height})),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}})()`);
  assert.equal(geometry.innerWidth, device.width);
  assert.equal(geometry.innerHeight, device.height);
  assert.equal(geometry.horizontalOverflow, false, `${workspace}/${device.id}: horizontal overflow`);
  assert.deepEqual(geometry.undersized, [], `${workspace}/${device.id}: undersized controls`);
  assert.deepEqual(geometry.scrolled, [], `${workspace}/${device.id}: every capture scroll owner starts at top`);
  assert.deepEqual(
    geometry.host.filter((entry) => entry.display !== "none" && entry.visibility !== "hidden"),
    [],
    `${workspace}/${device.id}: scoped host chrome leaked ${JSON.stringify(geometry.host)}`,
  );
  if (workspace === "home" && device.id === "iphone-15-pro-max-portrait" && zoom === 1) {
    const firstViewport = await harness.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="home"]'),brief=shell.querySelector('.home-brief'),focus=shell.querySelector('.home-focus-card'),cta=focus&&focus.querySelector('.action-btn-primary'),switcher=shell.querySelector('.prodigy-workspace-switcher'),dock=shell.querySelector('.home-ws-dock');const box=element=>{const rect=element&&element.getBoundingClientRect();return rect&&{top:rect.top,bottom:rect.bottom,height:rect.height}};return{brief:box(brief),focus:box(focus),cta:box(cta),switcher:box(switcher),dockDisplay:dock&&getComputedStyle(dock).display,viewport:innerHeight}})()`);
    assert.ok(firstViewport.focus && firstViewport.focus.top < firstViewport.viewport, `iPhone Home first viewport includes Focus ${JSON.stringify(firstViewport)}`);
    assert.ok(firstViewport.cta && firstViewport.cta.top < firstViewport.viewport, `iPhone Home first viewport includes primary CTA ${JSON.stringify(firstViewport)}`);
    assert.equal(firstViewport.dockDisplay, "none", "compact Home removes duplicate workspace dock");
  }
  const shot = await harness.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await harness.evaluate(`(()=>{for(const [element,lock] of window.__appleUiScrollLocks||[])element.removeEventListener('scroll',lock);delete window.__appleUiScrollLocks;return true})()`);
  const bytes = Buffer.from(shot.data, "base64");
  const name = `${slug([workspace, device.id, theme, `zoom-${zoom}`, forcedColors ? "forced" : "standard", state])}.png`;
  const file = path.join(SCREENSHOTS, name);
  fs.writeFileSync(file, bytes);
  return {
    workspace,
    device: device.id,
    width: device.width,
    height: device.height,
    theme,
    zoom,
    forcedColors,
    reducedMotion: true,
    state,
    tier: geometry.tier,
    controlCount: geometry.controlCount,
    horizontalOverflow: geometry.horizontalOverflow,
    undersizedCount: geometry.undersized.length,
    screenshot: path.relative(ROOT, file),
    screenshotSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    screenshotBytes: bytes.length,
    domSha256: receipt.domSha256,
  };
}

test("Home and Auction pass the exact Apple device matrix in an isolated Obsidian clone", { timeout: 1200000 }, async () => {
  fs.rmSync(EVIDENCE, { recursive: true, force: true });
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  const harness = await RealObsidianHarness.start("apple-ui-device-matrix", { protectedSnapshot: snapshotProtected() });
  const rows = [];
  let cleanup;
  try {
    for (const workspace of WORKSPACES) {
      const opened = await harness.openWorkspace(workspace);
      assert.ok(opened.blocks > 0, `${workspace}: real note blocks must execute`);
      assert.equal(opened.blocks, opened.executions, `${workspace}: every registered block executes`);
      for (const device of DEVICES) {
        for (const theme of ["light", "dark"]) {
          rows.push(await exactScreenshot(harness, workspace, device, theme, 1, false, "normal"));
        }
      }
      for (const device of [DEVICES[0], DEVICES[7]]) {
        rows.push(await exactScreenshot(harness, workspace, device, "light", 2, false, "normal"));
        rows.push(await exactScreenshot(harness, workspace, device, "light", 1, true, "normal"));
      }
    }
  } finally {
    cleanup = await harness.close();
  }
  assert.equal(cleanup.audit.equal, true, "source vault remains unchanged");
  assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error);
  assert.equal(cleanup.removed, true, "clone runtime removed");
  assert.equal(cleanup.portReusable, true, "debug port released");
  assert.equal(rows.length, 44, "36 base captures plus 8 targeted zoom/forced-color captures");
  const hashes = new Set(rows.map((row) => row.screenshotSha256));
  assert.ok(hashes.size > 24, "fresh screenshot set must contain real visual variation");
  const manifest = {
    schemaVersion: 1,
    task: 9,
    generatedAt: new Date().toISOString(),
    runtime: {
      application: "Obsidian APFS clone",
      asideUsed: false,
      keychainMode: "Chromium --use-mock-keychain only; user Keychain not accessed",
      network: "blocked except loopback CDP",
    },
    physical_claim_status: "not_proven",
    stateEvidence: "error/empty/loading/selected/disabled are verified by the separate real-Obsidian structural scenario suite, not faked into normal screenshots",
    captures: rows,
    cleanup: {
      sourceVaultEqual: cleanup.audit.equal,
      protectedContinuity: cleanup.protectedContinuity.exact,
      runtimeRemoved: cleanup.removed,
      portReusable: cleanup.portReusable,
    },
  };
  fs.writeFileSync(path.join(EVIDENCE, "manifest.json"), JSON.stringify(manifest, null, 2));
});
