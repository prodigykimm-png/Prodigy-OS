#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { AsideCdpHarness } = require("./aside_cdp_harness.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const TOKEN_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/design-tokens.js"), "utf8");
const SHELL_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-app-shell.js"), "utf8");
const UI_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-ui.js"), "utf8");
const WIDTHS = Object.freeze([390, 834, 1068, 1440]);
const STATES = Object.freeze(["rest", "selected", "loading", "empty", "success", "warning", "error", "disabled"]);
const FORCED_COLORS = Object.freeze([
  { name: "forced-colors", value: "active" },
  { name: "prefers-contrast", value: "more" },
]);
const REDUCED_MOTION = Object.freeze([{ name: "prefers-reduced-motion", value: "reduce" }]);

function safeScript(source) {
  return source.replace(/<\/script/giu, "<\\/script");
}

function fixture(sources, overrideCss = "", theme = "light") {
  return `<!doctype html><html lang="ko" data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}:root{--background-primary:white;--background-secondary:whitesmoke;--background-modifier-hover:gainsboro;--background-modifier-cover:dimgray;--background-modifier-border:slategray;--text-normal:black;--text-muted:dimgray;--text-accent:mediumblue;--interactive-accent:mediumblue;--interactive-accent-hover:blue;--text-on-accent:white;--text-success:darkgreen;--text-warning:darkorange;--text-error:crimson;--shadow-s:none;--shadow-l:none}
html[data-theme="dark"]{--background-primary:black;--background-secondary:darkslategray;--background-modifier-hover:dimgray;--background-modifier-cover:black;--background-modifier-border:lightgray;--text-normal:white;--text-muted:lightgray;--text-accent:lightskyblue;--interactive-accent:royalblue;--interactive-accent-hover:dodgerblue;--text-on-accent:white;--text-success:lightgreen;--text-warning:gold;--text-error:lightcoral}
html,body,#host{margin:0;inline-size:100%;block-size:100%;min-inline-size:0}body{font-family:system-ui,sans-serif}.state-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(11rem,100%),1fr));gap:8px;padding:8px;min-inline-size:0}.state-control{border:1px solid var(--ke-color-border);min-inline-size:0}.state-control:focus{outline:none}.long-probe{overflow-wrap:anywhere;word-break:keep-all;min-inline-size:0}${overrideCss}
</style><body><div id="host"></div><script>${safeScript(sources.tokens)}</script><script>${safeScript(sources.shell)}</script><script>${safeScript(sources.ui)}</script><script>
HTMLElement.prototype.createEl=function(tag,options={}){const element=document.createElement(tag);if(options.text!=null)element.textContent=options.text;for(const [key,value] of Object.entries(options.attr||{})){if(key==='class')element.className=value;else if(key==='style')element.style.cssText=value;else element.setAttribute(key,value)}this.appendChild(element);return element};HTMLElement.prototype.empty=function(){this.replaceChildren()};
const stateLabels={rest:'기본',selected:'선택됨',loading:'불러오는 중',empty:'비어 있음',success:'완료',warning:'주의',error:'오류',disabled:'사용할 수 없음'};
ProdigyAppShell.AppShell(document.querySelector('#host'),{workspaceId:'knowledge',title:'의미 토큰 검증 워크스페이스',context:{items:['아주 긴 한국어 문맥은 자연스럽게 줄바꿈되어야 합니다 https://example.invalid/a-very-long-unbroken-address-without-natural-breakpoints'],actions:[{label:'문맥 작업',onClick(){}}]},renderBody(body){const grid=body.createEl('div',{attr:{class:'state-grid'}});Object.keys(stateLabels).forEach(state=>{const control=ProdigyUI.button(grid,stateLabels[state]+' — 아주 긴 한국어 상태 이름',{className:'state-control long-probe',disabled:state==='disabled'});control.dataset.state=state;if(state==='selected')control.setAttribute('aria-selected','true');if(state==='loading')control.setAttribute('aria-busy','true')})}});
function px(value){return Number.parseFloat(value)||0}function stateMetric(element){const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return{label:element.textContent,color:style.color,background:style.backgroundColor,borderColor:style.borderTopColor,borderTopStyle:style.borderTopStyle,borderTopWidth:px(style.borderTopWidth),borderLeftStyle:style.borderLeftStyle,borderLeftWidth:px(style.borderLeftWidth),outlineStyle:style.outlineStyle,outlineWidth:px(style.outlineWidth),outlineColor:style.outlineColor,opacity:Number(style.opacity),minBlockSize:px(style.minBlockSize),height:rect.height,width:rect.width,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,transitionDuration:style.transitionDuration,animationName:style.animationName}}
window.__themeMetrics=()=>{const shell=document.querySelector('.prodigy-app-shell');const body=document.querySelector('.prodigy-app-shell-body');const context=document.querySelector('.prodigy-context-item');const states=Object.fromEntries([...document.querySelectorAll('.state-control')].map(element=>[element.dataset.state,stateMetric(element)]));const scrollOwners=[...shell.querySelectorAll('*')].filter(element=>{const style=getComputedStyle(element);return /auto|scroll/.test(style.overflowY)}).map(element=>element.className);const active=document.activeElement;const activeStyle=getComputedStyle(active);const alphaCss=[0,.5,1].map(alpha=>ProdigyTokens.withAlpha(ProdigyTokens.SEMANTIC_COLORS.success,alpha));return{theme:document.documentElement.dataset.theme,width:innerWidth,zoom:getComputedStyle(document.documentElement).zoom,shell:{color:getComputedStyle(shell).color,background:getComputedStyle(shell).backgroundColor},states,context:{clientWidth:context.clientWidth,scrollWidth:context.scrollWidth,height:context.getBoundingClientRect().height},page:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},body:{clientWidth:body.clientWidth,scrollWidth:body.scrollWidth,overflow:getComputedStyle(body).overflow},scrollOwners,alphaCss,alphaValid:alphaCss.every(value=>CSS.supports('color',value)),focus:{state:active&&active.dataset?active.dataset.state:null,outlineStyle:activeStyle.outlineStyle,outlineWidth:px(activeStyle.outlineWidth),outlineColor:activeStyle.outlineColor}}};
</script>`;
}

function cue(state, metric) {
  if (state === "selected") return `outline:${metric.outlineStyle}:${metric.outlineWidth}`;
  if (state === "loading" || state === "empty" || state === "error") return `top:${metric.borderTopStyle}:${metric.borderTopWidth}`;
  if (state === "success" || state === "warning") return `left:${metric.borderLeftStyle}:${metric.borderLeftWidth}`;
  if (state === "disabled") return `opacity:${metric.opacity}`;
  return `top:${metric.borderTopStyle}:${metric.borderTopWidth}:outline:${metric.outlineStyle}`;
}

function assertStateCues(metrics, label) {
  const state = metrics.states;
  assert.match(state.selected.outlineStyle, /solid|double/, label + " selected outline");
  assert.ok(state.selected.outlineWidth >= 2, label + " selected outline width");
  assert.equal(state.loading.borderTopStyle, "dashed", label + " loading dashed");
  assert.ok(state.loading.borderTopWidth >= 2, label + " loading width");
  assert.equal(state.empty.borderTopStyle, "dotted", label + " empty dotted");
  assert.equal(state.success.borderLeftStyle, "solid", label + " success solid edge");
  assert.ok(state.success.borderLeftWidth >= 4, label + " success edge width");
  assert.equal(state.warning.borderLeftStyle, "dashed", label + " warning dashed edge");
  assert.ok(state.warning.borderLeftWidth >= 4, label + " warning edge width");
  assert.equal(state.error.borderTopStyle, "double", label + " error double border");
  assert.ok(state.error.borderTopWidth >= 3, label + " error border width");
  assert.ok(state.disabled.opacity > 0 && state.disabled.opacity < 1, label + " disabled opacity");
  const signatures = ["selected", "loading", "empty", "success", "warning", "error", "disabled"].map((name) => cue(name, state[name]));
  assert.equal(new Set(signatures).size, signatures.length, label + " state cues must remain unique");
  for (const name of STATES) assert.match(state[name].label, /—/, label + " explicit state label " + name);
}

function assertFit(metrics, label, compact = false, zoom = 1) {
  assert.equal(metrics.page.scrollWidth, metrics.page.clientWidth, label + " page overflow");
  assert.equal(metrics.body.scrollWidth, metrics.body.clientWidth, label + " body overflow");
  assert.equal(metrics.context.scrollWidth, metrics.context.clientWidth, label + " CJK/URL overflow");
  assert.deepEqual(metrics.scrollOwners, ["prodigy-app-shell-body"], label + " one scroll owner");
  assert.equal(metrics.alphaValid, true, label + " alpha CSS validity");
  assert.equal(metrics.alphaCss.some((value) => /NaN|Infinity|undefined/.test(value)), false, label + " finite alpha CSS");
  for (const state of STATES) {
    assert.equal(metrics.states[state].scrollWidth <= metrics.states[state].clientWidth, true, label + " state overflow " + state);
    if (compact) {
      assert.ok(metrics.states[state].minBlockSize >= 44, label + " 44px CSS minimum " + state);
      assert.ok(metrics.states[state].height >= 44 * zoom, label + " 44px target " + state);
    }
  }
}

async function render(harness, sources, options = {}) {
  const page = await harness.createPage(fixture(sources, options.overrideCss, options.theme || "light"), {
    width: options.width || 390,
    mediaFeatures: options.mediaFeatures || [],
  });
  try {
    await harness.evaluate(page, `document.documentElement.style.zoom=${JSON.stringify(String(options.zoom || 1))}`);
    if (options.keyboard) {
      await harness.evaluate(page, "document.body.tabIndex=-1;document.body.focus()");
      await harness.key(page, "Tab", "Tab", 9);
      await harness.key(page, "Tab", "Tab", 9);
      await harness.key(page, "Tab", "Tab", 9);
    }
    const metrics = await harness.evaluate(page, "window.__themeMetrics()");
    const hash = crypto.createHash("sha256").update(JSON.stringify(metrics)).digest("hex");
    return { metrics, hash };
  } finally {
    await harness.closePage(page);
  }
}

const BASE_SOURCES = Object.freeze({ tokens: TOKEN_SOURCE, shell: SHELL_SOURCE, ui: UI_SOURCE });

function mutations() {
  return Object.freeze({
    "remove-shared-focus-outlines": {
      sources: {
        ...BASE_SOURCES,
        shell: SHELL_SOURCE.replace(/outline(?:-offset|-color)?:\s*[^;]+;/g, "outline:none;"),
        ui: UI_SOURCE.replace(/outline(?:-offset|-color)?:\s*[^;]+;/g, "outline:none;"),
      },
      options: { width: 390, keyboard: true },
      validate(result) {
        assert.notEqual(result.metrics.focus.outlineStyle, "none", "keyboard focus outline");
        assert.ok(result.metrics.focus.outlineWidth >= 2, "keyboard focus width");
      },
    },
    "remove-reduced-motion-rules": {
      sources: {
        ...BASE_SOURCES,
        shell: SHELL_SOURCE.replace(/prefers-reduced-motion:\s*reduce/g, "prefers-reduced-motion: no-preference"),
        ui: UI_SOURCE.replace(/prefers-reduced-motion:\s*reduce/g, "prefers-reduced-motion: no-preference"),
      },
      options: { width: 390, mediaFeatures: REDUCED_MOTION },
      validate(result) {
        assert.equal(result.metrics.states.rest.transitionDuration, "0s", "reduced transition");
        assert.equal(result.metrics.states.rest.animationName, "none", "reduced animation");
      },
    },
    "remove-compact-touch-minima": {
      sources: {
        ...BASE_SOURCES,
        shell: SHELL_SOURCE
          .replace(/var\(--ke-touch-target,\s*44px\)/g, "20px")
          .replace(/var\(--ke-control-height,\s*44px\)/g, "20px"),
        ui: UI_SOURCE
          .replace(/var\(--ke-touch-target,\s*44px\)/g, "20px")
          .replace(/var\(--ke-control-height,\s*44px\)/g, "20px"),
      },
      options: { width: 390 },
      validate(result) { assertFit(result.metrics, "touch mutation", true); },
    },
    "collapse-highlight-graytext": {
      sources: {
        ...BASE_SOURCES,
        shell: SHELL_SOURCE.replace(/Highlight|GrayText/g, "CanvasText"),
        ui: UI_SOURCE.replace(/Highlight|GrayText/g, "CanvasText"),
      },
      options: { width: 390, mediaFeatures: FORCED_COLORS },
      validate(result) {
        assert.notEqual(result.metrics.states.selected.outlineColor, result.metrics.states.disabled.color, "Highlight and GrayText separation");
      },
    },
    "collapse-semantic-state-cues": {
      sources: BASE_SOURCES,
      options: {
        width: 390,
        mediaFeatures: FORCED_COLORS,
        overrideCss: ".prodigy-app-shell [data-state=success],.prodigy-app-shell [data-state=warning],.prodigy-app-shell [data-state=error]{border:1px solid CanvasText!important;outline:none!important}",
      },
      validate(result) {
        const state = result.metrics.states;
        assert.equal(new Set([cue("success", state.success), cue("warning", state.warning), cue("error", state.error)]).size, 3, "success/warning/error cue separation");
      },
    },
  });
}

test("actual AppShell and ProdigyUI styling survives themes, accessibility modes, and destructive mutations", async () => {
  const harness = await AsideCdpHarness.start("task13-theme");
  const measurements = [];
  const hashes = {};
  const mutationMatrix = [];
  try {
    for (const width of WIDTHS) {
      for (const theme of ["light", "dark"]) {
        const result = await render(harness, BASE_SOURCES, { width, theme });
        assertStateCues(result.metrics, `${theme}/${width}`);
        assertFit(result.metrics, `${theme}/${width}`, width === 390);
        measurements.push(result.metrics);
        hashes[`${theme}-${width}`] = result.hash;
      }
    }
    const light = measurements.find((item) => item.width === 390 && item.theme === "light");
    const dark = measurements.find((item) => item.width === 390 && item.theme === "dark");
    assert.notEqual(light.shell.background, dark.shell.background, "light/dark surface distinction");
    assert.notEqual(light.shell.color, dark.shell.color, "light/dark text distinction");
    assert.notEqual(light.states.rest.background, dark.states.rest.background, "light/dark control surface distinction");
    assert.notEqual(light.states.rest.borderColor, dark.states.rest.borderColor, "light/dark control border distinction");

    const keyboard = await render(harness, BASE_SOURCES, { width: 390, keyboard: true });
    assert.equal(keyboard.metrics.focus.state, "rest", "keyboard reaches first state control");
    assert.notEqual(keyboard.metrics.focus.outlineStyle, "none", "focus-visible outline");
    assert.ok(keyboard.metrics.focus.outlineWidth >= 2, "focus-visible width");
    hashes.keyboard = keyboard.hash;

    const reduced = await render(harness, BASE_SOURCES, { width: 390, mediaFeatures: REDUCED_MOTION });
    assert.equal(reduced.metrics.states.rest.transitionDuration, "0s");
    assert.equal(reduced.metrics.states.rest.animationName, "none");
    hashes.reduced = reduced.hash;

    const forced = await render(harness, BASE_SOURCES, { width: 390, mediaFeatures: FORCED_COLORS });
    assertStateCues(forced.metrics, "forced-colors");
    assertFit(forced.metrics, "forced-colors", true);
    assert.notEqual(forced.metrics.states.selected.outlineColor, forced.metrics.states.disabled.color, "forced selected/disabled system colors");
    hashes.forced = forced.hash;

    const zoom = await render(harness, BASE_SOURCES, { width: 390, zoom: 2 });
    assert.equal(zoom.metrics.zoom, "2");
    assertStateCues(zoom.metrics, "zoom-200");
    assertFit(zoom.metrics, "zoom-200", true, 2);
    hashes.zoom200 = zoom.hash;

    for (const [name, mutation] of Object.entries(mutations())) {
      const result = await render(harness, mutation.sources, { ...mutation.options, capture: false });
      let red = false;
      let reason = "mutation unexpectedly passed";
      try {
        mutation.validate(result);
      } catch (error) {
        red = true;
        reason = error.message;
      }
      assert.equal(red, true, name + " must deterministically RED");
      mutationMatrix.push({ mutation: name, result: "RED", reason });
    }

    console.log("TASK13_THEME_MEASUREMENTS " + JSON.stringify({
      browser: harness.version.product,
      widths: WIDTHS,
      compactLight: light,
      compactDark: dark,
      forced: forced.metrics,
      zoom200: zoom.metrics,
      computedStyleSha256: hashes,
      mutations: mutationMatrix,
    }));
  } finally {
    await harness.close();
  }
});
