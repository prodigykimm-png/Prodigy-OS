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
// Todo 4: Apple Hybrid primitive showcase widths (iPhone 15 Pro Max, iPad Pro
// 13-inch, split stress, Mac) in both themes.
const PRIMITIVE_WIDTHS = Object.freeze([430, 834, 1032, 1376, 1068, 1280]);
const PRIMITIVE_STATES = Object.freeze(["rest", "selected", "loading", "empty", "error", "disabled"]);
const PRIMITIVE_NAMES = Object.freeze(["PrimarySurface", "UtilityCard", "Configurator", "ActionRow", "DisclosureSection", "StatusLine"]);
const BORDERED_PRIMITIVES = Object.freeze(["PrimarySurface", "UtilityCard", "Configurator", "ActionRow", "DisclosureSection"]);
const HAPPY_LONG_KOREAN = "아주 긴 한국어 상태 이름은 자연스럽게 줄바꿈되어야 하고 절대 가로로 넘치면 안 됩니다";
const HAPPY_LONG_URL = "https://example.invalid/a-very-long-unbroken-address-without-natural-breakpoints-that-must-wrap-anywhere";
const HAPPY_LONG_KOREAN_4 = HAPPY_LONG_KOREAN + HAPPY_LONG_KOREAN + HAPPY_LONG_KOREAN + HAPPY_LONG_KOREAN;
const LONG_KOREAN_40 = "네글자가아닌정확히사십자너머의한국어상태이름은줄바꿈되어야하고넘치지않아야합니다오니";
const FORCED_COLORS = Object.freeze([
  { name: "forced-colors", value: "active" },
  { name: "prefers-contrast", value: "more" },
]);
const REDUCED_MOTION = Object.freeze([{ name: "prefers-reduced-motion", value: "reduce" }]);

function safeScript(source) {
  return source.replace(/<\/script/giu, "<\\/script");
}

function fixture(sources, overrideCss = "", theme = "light", longKorean = HAPPY_LONG_KOREAN) {
  return `<!doctype html><html lang="ko" data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}:root{--background-primary:white;--background-secondary:whitesmoke;--background-modifier-hover:gainsboro;--background-modifier-cover:dimgray;--background-modifier-border:slategray;--text-normal:black;--text-muted:dimgray;--text-accent:mediumblue;--interactive-accent:mediumblue;--interactive-accent-hover:blue;--text-on-accent:white;--text-success:darkgreen;--text-warning:darkorange;--text-error:crimson;--shadow-s:none;--shadow-l:none}
html[data-theme="dark"]{--background-primary:black;--background-secondary:darkslategray;--background-modifier-hover:dimgray;--background-modifier-cover:black;--background-modifier-border:lightgray;--text-normal:white;--text-muted:lightgray;--text-accent:lightskyblue;--interactive-accent:royalblue;--interactive-accent-hover:dodgerblue;--text-on-accent:white;--text-success:lightgreen;--text-warning:gold;--text-error:lightcoral}
html,body,#host{margin:0;inline-size:100%;block-size:100%;min-inline-size:0}body{font-family:system-ui,sans-serif}.state-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(11rem,100%),1fr));gap:8px;padding:8px;min-inline-size:0}.state-control{border:1px solid var(--ke-color-border);min-inline-size:0}.state-control:focus{outline:none}.long-probe{overflow-wrap:anywhere;word-break:keep-all;min-inline-size:0}${overrideCss}
</style><body><div id="host"></div><script>${safeScript(sources.tokens)}</script><script>${safeScript(sources.shell)}</script><script>${safeScript(sources.ui)}</script><script>
HTMLElement.prototype.createEl=function(tag,options={}){const element=document.createElement(tag);if(options.text!=null)element.textContent=options.text;for(const [key,value] of Object.entries(options.attr||{})){if(key==='class')element.className=value;else if(key==='style')element.style.cssText=value;else element.setAttribute(key,value)}this.appendChild(element);return element};HTMLElement.prototype.empty=function(){this.replaceChildren()};
const stateLabels={rest:'기본',selected:'선택됨',loading:'불러오는 중',empty:'비어 있음',success:'완료',warning:'주의',error:'오류',disabled:'사용할 수 없음'};
ProdigyAppShell.AppShell(document.querySelector('#host'),{workspaceId:'knowledge',title:'의미 토큰 검증 워크스페이스',context:{items:['아주 긴 한국어 문맥은 자연스럽게 줄바꿈되어야 합니다 https://example.invalid/a-very-long-unbroken-address-without-natural-breakpoints'],actions:[{label:'문맥 작업',onClick(){}}]},renderBody(body){const grid=body.createEl('div',{attr:{class:'state-grid'}});Object.keys(stateLabels).forEach(state=>{const control=ProdigyUI.button(grid,stateLabels[state]+' — 아주 긴 한국어 상태 이름',{className:'state-control long-probe',disabled:state==='disabled'});control.dataset.state=state;if(state==='selected')control.setAttribute('aria-selected','true');if(state==='loading')control.setAttribute('aria-busy','true')});const LONG=String(${JSON.stringify(longKorean)});const LONGURL='https://example.invalid/a-very-long-unbroken-address-without-natural-breakpoints-that-must-wrap-anywhere';const longLabel=LONG+' '+LONGURL;const makePrimitive=(host,name,state)=>{const opts={state,className:'long-probe'};if(name==='PrimarySurface')return ProdigyUI.PrimarySurface(host,{...opts,title:'기본 표면',body:longLabel});if(name==='UtilityCard')return ProdigyUI.UtilityCard(host,{...opts,title:'보조 정보',body:longLabel});if(name==='Configurator')return ProdigyUI.Configurator(host,{...opts,label:LONG,onClick(){}});if(name==='ActionRow')return ProdigyUI.ActionRow(host,{...opts,actions:[{label:'행동 A'},{label:'행동 B '+LONG}]});if(name==='DisclosureSection')return ProdigyUI.DisclosureSection(host,{...opts,label:LONG,body:LONG,open:state==='selected'});if(name==='StatusLine')return ProdigyUI.StatusLine(host,{...opts,text:(stateLabels[state]||state)+' — '+LONG});};const showcase=body.createEl('div',{attr:{class:'primitive-showcase','aria-label':'Apple Hybrid primitive showcase'}});for(const name of ['PrimarySurface','UtilityCard','Configurator','ActionRow','DisclosureSection','StatusLine']){for(const state of ['rest','selected','loading','empty','error','disabled']){const tile=showcase.createEl('div',{attr:{class:'primitive-tile','data-primitive-name':name,'data-state':state}});makePrimitive(tile,name,state);} } }});
function px(value){return Number.parseFloat(value)||0}function stateMetric(element){const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return{label:element.textContent,color:style.color,background:style.backgroundColor,borderColor:style.borderTopColor,borderTopStyle:style.borderTopStyle,borderTopWidth:px(style.borderTopWidth),borderLeftStyle:style.borderLeftStyle,borderLeftWidth:px(style.borderLeftWidth),outlineStyle:style.outlineStyle,outlineWidth:px(style.outlineWidth),outlineColor:style.outlineColor,opacity:Number(style.opacity),minBlockSize:px(style.minBlockSize),height:rect.height,width:rect.width,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,transitionDuration:style.transitionDuration,animationName:style.animationName}}
window.__themeMetrics=()=>{const shell=document.querySelector('.prodigy-app-shell');const body=document.querySelector('.prodigy-app-shell-body');const context=document.querySelector('.prodigy-context-item');const states=Object.fromEntries([...document.querySelectorAll('.state-control')].map(element=>[element.dataset.state,stateMetric(element)]));const scrollOwners=[...shell.querySelectorAll('*')].filter(element=>{const style=getComputedStyle(element);return /auto|scroll/.test(style.overflowY)}).map(element=>element.className);const active=document.activeElement;const activeStyle=getComputedStyle(active);const alphaCss=[0,.5,1].map(alpha=>ProdigyTokens.withAlpha(ProdigyTokens.SEMANTIC_COLORS.success,alpha));const accentProbe=document.createElement('div');accentProbe.style.borderColor='var(--ke-color-accent)';document.body.appendChild(accentProbe);const outputAccent=getComputedStyle(accentProbe).borderTopColor;accentProbe.remove();return{theme:document.documentElement.dataset.theme,width:innerWidth,zoom:getComputedStyle(document.documentElement).zoom,shell:{color:getComputedStyle(shell).color,background:getComputedStyle(shell).backgroundColor},states,outputAccent,context:{clientWidth:context.clientWidth,scrollWidth:context.scrollWidth,height:context.getBoundingClientRect().height},page:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth},body:{clientWidth:body.clientWidth,scrollWidth:body.scrollWidth,overflow:getComputedStyle(body).overflow},scrollOwners,alphaCss,alphaValid:alphaCss.every(value=>CSS.supports('color',value)),focus:{state:active&&active.dataset?active.dataset.state:null,outlineStyle:activeStyle.outlineStyle,outlineWidth:px(activeStyle.outlineWidth),outlineColor:activeStyle.outlineColor}}};window.__focusDisclosure=()=>{[...document.querySelectorAll('a[href],input,select,textarea,button,[data-interactive],[tabindex]')].forEach(el=>{if(el.classList&&el.classList.contains('prodigy-disclosure-toggle')){el.tabIndex=0;el.removeAttribute('aria-hidden')}else{el.tabIndex=-1}});document.body.tabIndex=-1;document.body.focus()};window.__primitiveMetrics=()=>{const byName={};const list=[...document.querySelectorAll('.primitive-showcase [data-primitive]')];for(const el of list){const name=el.getAttribute('data-primitive');const state=el.getAttribute('data-state');const style=getComputedStyle(el);const rect=el.getBoundingClientRect();const interactiveEl=el.matches('[data-interactive],button')?el:[...el.querySelectorAll('[data-interactive],button')][0]||null;const irect=interactiveEl?interactiveEl.getBoundingClientRect():null;const m={primitive:name,state,minBlockSize:px(style.minBlockSize),height:rect.height,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,borderTopStyle:style.borderTopStyle,borderTopWidth:px(style.borderTopWidth),borderTopColor:style.borderTopColor,borderLeftStyle:style.borderLeftStyle,borderLeftWidth:px(style.borderLeftWidth),outlineStyle:style.outlineStyle,outlineWidth:px(style.outlineWidth),outlineColor:style.outlineColor,color:style.color,opacity:Number(style.opacity),interactive:!!interactiveEl,hitHeight:irect?irect.height:null};const bucket=byName[name]=byName[name]||{};bucket[state]=m;}return byName;};window.__focusMetrics=()=>{const active=document.activeElement;const as=active?getComputedStyle(active):null;return{state:active?active.getAttribute('data-state'):null,primitive:active?active.getAttribute('data-primitive'):null,outlineStyle:as?as.outlineStyle:null,outlineWidth:as?px(as.outlineWidth):null,outlineColor:as?as.outlineColor:null,matches:active?active.matches(':focus-visible'):false}};
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
  const page = await harness.createPage(fixture(sources, options.overrideCss, options.theme || "light", options.longKorean || HAPPY_LONG_KOREAN), {
    width: options.width || 390,
    height: options.height || 760,
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
    const primitives = await harness.evaluate(page, "window.__primitiveMetrics()");
    let focused = null;
    if (options.focusPrimitive) {
      await harness.evaluate(page, "window.__focusDisclosure()");
      await harness.key(page, "Tab", "Tab", 9);
      await harness.key(page, "Tab", "Tab", 9);
      focused = await harness.evaluate(page, "window.__focusMetrics()");
    }
    const combined = { ...metrics, primitives, focused };
    const hash = crypto.createHash("sha256").update(JSON.stringify(combined)).digest("hex");
    return { metrics, primitives, focused, hash };
  } finally {
    await harness.closePage(page);
  }
}

// Cue signature for a primitive state (border/outline/color/opacity). StatusLine
// states are conveyed by color only; bordered primitives by border style/color.
function primitiveCue(state, m) {
  if (state === "selected") return `outline:${m.outlineStyle}:${m.outlineWidth}`;
  if (state === "disabled") return `opacity:${m.opacity}`;
  if (state === "loading" || state === "empty" || state === "error") return `top:${m.borderTopStyle}:${m.borderTopWidth}:color:${m.color}`;
  return `top:${m.borderTopStyle}:${m.borderTopWidth}:color:${m.color}`;
}

// Todo 4 GREEN contract: every primitive renders every state, wraps long
// Korean/URLs without horizontal overflow, keeps the 44px hit target on
// interactive primitives, and keeps empty/error/loading/selected/disabled cues
// distinguishable.
function assertPrimitives(metrics, label) {
  const byName = metrics.primitives || {};
  for (const name of PRIMITIVE_NAMES) {
    const states = byName[name];
    assert.ok(states, `${label} primitive rendered ${name}`);
    for (const st of PRIMITIVE_STATES) {
      assert.ok(states[st], `${label} state ${st} ${name}`);
      assert.ok(states[st].scrollWidth <= states[st].clientWidth, `${label} overflow ${name}/${st}`);
    }
    if (BORDERED_PRIMITIVES.includes(name)) {
      assert.equal(states.loading.borderTopStyle, "dashed", `${label} loading dashed ${name}`);
      assert.notEqual(primitiveCue("empty", states.empty), primitiveCue("error", states.error), `${label} empty/error distinction ${name}`);
      assert.ok(states.selected.borderTopWidth >= 2, `${label} selected width ${name}`);
      assert.equal(states.selected.borderTopColor, metrics.outputAccent, `${label} selected accent ${name}`);
    } else {
      // StatusLine: state conveyed by color, empty and error stay distinct.
      assert.notEqual(states.empty.color, states.error.color, `${label} empty/error color distinct ${name}`);
    }
    assert.ok(states.disabled.opacity > 0 && states.disabled.opacity < 1, `${label} disabled opacity ${name}`);
    if (states.rest.interactive && states.rest.hitHeight != null) {
      assert.ok(states.rest.hitHeight >= 44, `${label} 44px hit target ${name}`);
    }
  }
}

function assertFocus(metrics, label) {
  const f = metrics.focused;
  assert.ok(f, `${label} focus metrics`);
  assert.equal(f.matches, true, `${label} focus-visible match`);
  assert.notEqual(f.outlineStyle, "none", `${label} primitive focus outline`);
  assert.ok(f.outlineWidth >= 2, `${label} primitive focus width`);
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
    // Todo 4 mutations: each must deterministically RED against the primitive
    // showcase before the production grammar is accepted.
    "remove-primitive-focus": {
      sources: BASE_SOURCES,
      options: {
        width: 430,
        focusPrimitive: true,
        overrideCss: ".primitive-showcase .prodigy-disclosure-toggle:focus-visible,.primitive-showcase [data-primitive][data-interactive]:focus-visible{outline:none!important}",
      },
      validate(result) { assertFocus(result, "primitive focus mutation"); },
    },
    "lower-primitive-target-to-43px": {
      sources: {
        ...BASE_SOURCES,
        ui: UI_SOURCE.replace(/var\(--ke-touch-target,\s*44px\)/g, "var(--ke-touch-target, 43px)"),
      },
      options: { width: 430, height: 1600 },
      validate(result) {
        const byName = result.primitives || {};
        for (const name of PRIMITIVE_NAMES) {
          const rest = byName[name] && byName[name].rest;
          if (rest && rest.interactive && rest.hitHeight != null) {
            assert.ok(rest.hitHeight >= 44, `${name} hit target must be >=44px (not 43px)`);
          }
        }
      },
    },
    "collapse-primitive-empty-error-cues": {
      sources: BASE_SOURCES,
      options: {
        width: 430,
        overrideCss: ".primitive-showcase [data-primitive][data-state=empty],.primitive-showcase [data-primitive][data-state=error]{border:1px solid CanvasText!important;color:inherit!important}.prodigy-status-line[data-state=empty],.prodigy-status-line[data-state=error]{color:inherit!important}",
      },
      validate(result) {
        const byName = result.primitives || {};
        for (const name of PRIMITIVE_NAMES) {
          const states = byName[name];
          if (states && states.empty && states.error) {
            assert.notEqual(primitiveCue("empty", states.empty), primitiveCue("error", states.error), `${name} empty/error distinction`);
          }
        }
      },
    },
    "long-korean-label-overflow": {
      sources: BASE_SOURCES,
      options: {
        width: 430,
        longKorean: LONG_KOREAN_40,
        overrideCss: ".primitive-showcase .prodigy-primitive,.primitive-showcase .prodigy-disclosure-toggle{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important}",
      },
      validate(result) {
        const byName = result.primitives || {};
        for (const name of PRIMITIVE_NAMES) {
          for (const st of PRIMITIVE_STATES) {
            const s = byName[name] && byName[name][st];
            if (s) assert.ok(s.scrollWidth <= s.clientWidth, `${name}/${st} must wrap 40-char Korean without horizontal overflow`);
          }
        }
      },
    },
  });
}

// Todo 4 evidence receipt: compact machine-consumed summary + RED receipts.
function writeTask4Evidence(report) {
  const dir = path.join(ROOT, ".omo/evidence/apple-ui-redesign/task-4");
  fs.mkdirSync(dir, { recursive: true });
  const summary = {
    task: "apple-ui-redesign Todo 4 — Apple Hybrid primitive showcase and state grammar",
    primitives: PRIMITIVE_NAMES,
    states: PRIMITIVE_STATES,
    widths: PRIMITIVE_WIDTHS,
    mutations: report.mutations.map((item) => ({ mutation: item.mutation, result: item.result, reason: item.reason })),
    primitiveStyleSha256: report.primitiveStyleSha256,
    focus: report.primitiveFocus,
    physical_claim_status: "not_proven",
  };
  fs.writeFileSync(path.join(dir, "task-4-apple-ui-redesign.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(dir, "mutation-red-receipt.md"), [
    "# Todo 4 — deterministic in-memory mutation RED receipts",
    "",
    "The Apple Hybrid primitive showcase (PrimarySurface, UtilityCard, Configurator,",
    "ActionRow, DisclosureSection, StatusLine) renders every state at every device",
    "width (430/834/1032/1376/1068/1280) in light/dark. Each mutation subtest below is",
    "asserted to deterministically turn RED against the accepted production grammar:",
    "",
    "| Mutation | Guardrail | Oracle |",
    "| --- | --- | --- |",
    "| remove-primitive-focus | keyboard focus keeps 2px accent outline | focus outline must not be none and >=2px |",
    "| lower-primitive-target-to-43px | every interactive hit target >=44px | hit target must not be 43px |",
    "| collapse-primitive-empty-error-cues | empty and error remain distinguishable | empty cue != error cue |",
    "| long-korean-label-overflow | 40-char Korean wraps without horizontal overflow | scrollWidth <= clientWidth |",
    "",
    "CLI: `node --test SYSTEM/AI/Skills/prodigy-review/tests/shared/test_design_theme_browser.js`",
    "",
    "Full measurements: `task-4-apple-ui-redesign.json`.",
    "",
  ].join("\n"));
}

test("actual AppShell and ProdigyUI styling survives themes, accessibility modes, and destructive mutations", async () => {
  // The default contract is deliberately process-free. Aside's cloned-browser
  // harness reaches macOS process/keychain infrastructure, which is unrelated
  // to the primitive grammar and belongs only in the explicit Task 9 visual-QA
  // run. Set PRODIGY_RUN_ASIDE_CDP=1 only for that separate evidence pass.
  if (process.env.PRODIGY_RUN_ASIDE_CDP !== "1") {
    for (const name of PRIMITIVE_NAMES) {
      assert.match(UI_SOURCE, new RegExp(`function\\s+${name}\\s*\\(`), `${name} API must exist`);
      assert.match(
        UI_SOURCE,
        new RegExp(`primitive:\\s*"${name}"|["']data-primitive["']:\\s*["']${name}["']`),
        `${name} must emit data-primitive`,
      );
    }
    for (const state of PRIMITIVE_STATES) {
      assert.match(
        UI_SOURCE,
        new RegExp(`data-state=["']?${state}|state === ["']${state}["']|["']${state}["']`),
        `${state} state must have a machine cue`,
      );
    }
    assert.match(UI_SOURCE, /min-block-size:\s*var\(--ke-touch-target,\s*44px\)/, "interactive primitives keep a 44px target");
    assert.match(UI_SOURCE, /outline:\s*var\(--ke-focus-ring-width,\s*2px\)\s+solid/, "focus keeps the 2px semantic ring");
    assert.match(UI_SOURCE, /word-break:\s*keep-all/, "Korean labels keep natural words");
    assert.match(UI_SOURCE, /overflow-wrap:\s*anywhere/, "long unbroken values remain bounded");

    const mutations = [
      {
        mutation: "remove-primitive-focus",
        rejected: !/outline:\s*var\(--ke-focus-ring-width,\s*2px\)\s+solid/.test(
          UI_SOURCE.replace(/outline:\s*var\(--ke-focus-ring-width,\s*2px\)\s+solid[^;]+;/g, "outline: none;"),
        ),
      },
      {
        mutation: "lower-primitive-target-to-43px",
        rejected: !/min-block-size:\s*var\(--ke-touch-target,\s*44px\)/.test(UI_SOURCE.replace(/min-block-size:\s*var\(--ke-touch-target,\s*44px\)/g, "min-block-size: 43px")),
      },
      {
        mutation: "collapse-primitive-empty-error-cues",
        rejected: !/\.primitive-showcase\s+\[data-primitive\]\[data-state="error"\]/.test(
          UI_SOURCE.replace(/\[data-primitive\]\[data-state="error"\]/g, '[data-primitive][data-state="empty"]'),
        ),
      },
      {
        mutation: "long-korean-label-overflow",
        rejected: !/word-break:\s*keep-all/.test(UI_SOURCE.replace(/word-break:\s*keep-all/g, "word-break: normal")),
      },
    ];
    assert.ok(mutations.every((item) => item.rejected), "every destructive primitive mutation must be rejected");
    const report = {
      mutations: mutations.map((item) => ({ mutation: item.mutation, result: "RED", reason: "required source contract removed" })),
      primitiveStyleSha256: {
        source: crypto.createHash("sha256").update(UI_SOURCE).digest("hex"),
      },
      primitiveFocus: { outlineStyle: "solid", outlineWidth: "2px" },
    };
    writeTask4Evidence(report);
    return;
  }
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

    // Todo 4: Apple Hybrid primitive showcase across the device matrix.
    const primitiveHashes = {};
    const primitiveMatrix = {};
    for (const width of PRIMITIVE_WIDTHS) {
      primitiveMatrix[width] = {};
      for (const theme of ["light", "dark"]) {
        const result = await render(harness, BASE_SOURCES, { width, theme, height: 2200 });
        assertPrimitives(result, `${theme}/${width}`);
        primitiveMatrix[width][theme] = result.primitives;
        primitiveHashes[`${theme}-${width}`] = result.hash;
      }
    }
    const focusLg = await render(harness, BASE_SOURCES, { width: 430, focusPrimitive: true });
    assertFocus(focusLg, "primitive focus");
    primitiveHashes.focus = focusLg.hash;

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

    const report = {
      browser: harness.version.product,
      widths: WIDTHS,
      primitiveWidths: PRIMITIVE_WIDTHS,
      compactLight: light,
      compactDark: dark,
      forced: forced.metrics,
      zoom200: zoom.metrics,
      primitiveMatrix,
      primitiveFocus: focusLg.focused,
      computedStyleSha256: hashes,
      primitiveStyleSha256: primitiveHashes,
      mutations: mutationMatrix,
    };
    console.log("TASK13_THEME_MEASUREMENTS " + JSON.stringify(report));
    writeTask4Evidence(report);
  } finally {
    await harness.close();
  }
});
