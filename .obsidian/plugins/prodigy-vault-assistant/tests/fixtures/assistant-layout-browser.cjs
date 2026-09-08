"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const {
  cleanupChromeRuntime,
  closeChromePage,
  createChromePage,
  evaluateChrome,
  startChromeRuntime,
} = require("./chrome-cdp-runtime.cjs");

const pluginRoot = path.resolve(__dirname, "../..");
const mode = process.argv[2] || "matrix";
const source = esbuild.buildSync({
  stdin: {
    contents:
      'export { createAssistantView } from "./assistant-view"; export { createViewModel } from "./view-model";',
    resolveDir: path.join(pluginRoot, "src"),
    sourcefile: "assistant-layout-entry.ts",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  globalName: "PVA",
  target: "es2021",
}).outputFiles[0].text;
const overrides = {
  normal: "",
  target:
    ".prodigy-vault-assistant button,.prodigy-vault-assistant textarea{min-block-size:20px;padding-block:0}",
  reflow:
    ".prodigy-vault-assistant{overflow:visible}.pva-transcript{overflow-inline:visible}.pva-answers>*{overflow-wrap:normal;word-break:normal;white-space:pre}",
};
const css = fs.readFileSync(path.join(pluginRoot, "styles.css"), "utf8");
assert.ok(
  ["matrix", "normal", "target", "reflow", "endpoint-failure", "launch-failure"].includes(mode),
  `unknown mode ${mode}`,
);

function safeScript(value) {
  return value.replace(/<\/script/giu, "<\\/script");
}

function fixture(variant) {
  const longToken = `https://example.invalid/${"unbroken-token-".repeat(40)}`;
  const longKorean =
    "아주긴한국어문장이자연스럽게여러줄로감싸지고가로스크롤을만들지않아야합니다".repeat(8);
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--background-primary:white;--background-secondary:whitesmoke;--background-modifier-border:gray;--background-modifier-hover:gainsboro;--text-normal:black;--text-muted:dimgray;--text-accent:mediumblue;--text-on-accent:white;--interactive-accent:mediumblue;--text-error:crimson;--ke-touch-target:44px;--ke-radius-control:8px;--ke-leading-body:1.45;--ke-leading-control:1.35;--ke-space-1:4px;--ke-space-2:8px;--ke-space-3:12px;--ke-space-4:17px}
html,body,#host{margin:0;inline-size:100%;block-size:100%;min-inline-size:0;overflow:hidden}body{font-family:system-ui,sans-serif}#host{inline-size:135px;block-size:388px}${css}${overrides[variant]}
</style><body><div id="host"></div><script>${safeScript(source)}</script><script>
window.__calls=[];const view=PVA.createAssistantView(document,{onModeChange(){},onMentionRemove(){},onMentionSelect(){},onHistoryOpen(){},onSourceOpen(){},onSubmit(){},onCancel(){},onLater(){window.__calls.push('later')},onRetry(){},onSettings(){},onClearHistory(){}});document.querySelector('#host').append(view.root);const blocks=Array.from({length:18},(_,index)=>({kind:'paragraph',text:index===0?${JSON.stringify(`${longKorean} ${longToken}`)}:'반복되는 근거 답변 '+index,citationIds:[]}));view.render(PVA.createViewModel({mode:'current_document',currentDocumentLabel:'OO홀.md',mentions:[{kind:'vault_file',path:'People/김민수.md',label:${JSON.stringify(longKorean)}}],mentionSuggestions:[],history:[{id:'h1',label:${JSON.stringify(longToken)}}],provider:{status:'ready',providerLabel:'Inherited',modelLabel:'Model'},result:{state:'answered',operationId:'op',blocks,sources:[{id:'s1',status:'current',path:'People/김민수.md',heading:'최근 만남',startLine:3,endLine:5,revision:{algorithm:'sha256',hash:'abc',capturedAt:1}}],coverage:{status:'complete',filesConsidered:2,filesRead:2},receipt:{providerLabel:'local-runtime',modelLabel:'configured-model-v2',routeClass:'local'}},priorBlocks:[]}));window.__measure=()=>{const root=view.root;const transcript=root.querySelector('.pva-transcript');const header=root.querySelector('.pva-header');const composer=root.querySelector('.pva-composer');const probe=root.querySelector('[data-answer-block]');const before={header:header.getBoundingClientRect().top,composer:composer.getBoundingClientRect().top};const layoutRects={header:{top:header.getBoundingClientRect().top,bottom:header.getBoundingClientRect().bottom,height:header.getBoundingClientRect().height},transcript:{top:transcript.getBoundingClientRect().top,bottom:transcript.getBoundingClientRect().bottom,height:transcript.getBoundingClientRect().height},composer:{top:composer.getBoundingClientRect().top,bottom:composer.getBoundingClientRect().bottom,height:composer.getBoundingClientRect().height}};transcript.scrollTop=transcript.scrollHeight;const after={header:header.getBoundingClientRect().top,composer:composer.getBoundingClientRect().top};const rootRect=root.getBoundingClientRect();const controls=[...root.querySelectorAll('button,textarea')].map(element=>{const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return{tag:element.tagName,text:(element.textContent||'').trim(),minBlockSize:Number.parseFloat(style.minBlockSize)||0,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}});const fixedControls=[...root.querySelectorAll('.pva-tabs button,.pva-composer button,.pva-composer textarea')].map(element=>{const rect=element.getBoundingClientRect();return{text:(element.textContent||'').trim(),visible:rect.left>=rootRect.left&&rect.right<=rootRect.right&&rect.top>=rootRect.top&&rect.bottom<=rootRect.bottom}});const scrollOwners=[...root.querySelectorAll('*')].filter(element=>/auto|scroll/.test(getComputedStyle(element).overflowY)&&element.scrollHeight>element.clientHeight).map(element=>element.getAttribute('data-scroll-owner')||element.className);const answerOverflow=probe.scrollWidth>probe.clientWidth;const answerWrapped=probe.getBoundingClientRect().height>(Number.parseFloat(getComputedStyle(probe).lineHeight)||0);const providerText=root.querySelector('.pva-provider').textContent;view.render(PVA.createViewModel({mode:'current_document',currentDocumentLabel:null,mentions:[],mentionSuggestions:[],history:[],provider:{status:'ready',providerLabel:'stale-provider',modelLabel:'stale-model'},result:{state:'error',operationId:'op-error',code:'provider_error',message:'Provider unavailable',recovery:{action:'later'}},priorBlocks:blocks}));const recoveryActions=[...root.querySelector('.pva-actions').querySelectorAll('[data-action]')].map(element=>element.getAttribute('data-action'));root.querySelector('[data-action=later]').click();return{providerText,recoveryActions,recoveryCalls:window.__calls,width:innerWidth,zoom:Number.parseFloat(getComputedStyle(document.documentElement).zoom)||1,rootRect:{left:rootRect.left,right:rootRect.right,top:rootRect.top,bottom:rootRect.bottom,width:rootRect.width,height:rootRect.height},computedRootWidth:Number.parseFloat(getComputedStyle(root).width),fixedRegions:layoutRects,fixedControls,pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,rootOverflow:root.scrollWidth>root.clientWidth,probeOverflow:answerOverflow,probeWrapped:answerWrapped,scrollOwners,controls,headerStable:before.header===after.header,composerStable:before.composer===after.composer,transcriptScrolled:transcript.scrollTop>0};};
</script>`;
}

function validate(metrics) {
  assert.equal(
    metrics.providerText,
    "local-runtime / configured-model-v2",
    "provider display must use runtime receipt",
  );
  assert.deepEqual(
    metrics.recoveryActions,
    ["later"],
    "runtime error must expose only its recovery action",
  );
  assert.deepEqual(
    metrics.recoveryCalls,
    ["later"],
    "recovery control must invoke the matching port",
  );
  assert.equal(metrics.pageOverflow, false, "horizontal overflow at 430px and 200% zoom");
  assert.equal(metrics.rootOverflow, false, "Assistant root horizontal overflow");
  assert.equal(metrics.probeOverflow, false, "CJK/long-token horizontal overflow");
  assert.equal(metrics.probeWrapped, true, "CJK/long-token content must wrap");
  assert.deepEqual(metrics.scrollOwners, ["assistant-transcript"], "one computed scroll owner");
  assert.equal(metrics.headerStable, true, "header must remain fixed while transcript scrolls");
  assert.equal(metrics.composerStable, true, "composer must remain fixed while transcript scrolls");
  assert.equal(metrics.transcriptScrolled, true, "transcript must own scrolling");
  assert.ok(
    metrics.fixedRegions.transcript.height >= 88,
    "transcript retains one 44px row at 200% zoom",
  );
  for (const control of metrics.fixedControls) {
    assert.equal(
      control.visible,
      true,
      `${control.text || "question input"} remains inside Assistant viewport`,
    );
  }
  for (const control of metrics.controls) {
    assert.ok(control.minBlockSize >= 44, `${control.tag} computed 44px target`);
    assert.ok(control.height >= 88, `${control.tag} rendered 44px target at 200% zoom`);
  }
}

async function render(runtime, variant) {
  const page = await createChromePage(runtime, fixture(variant));
  try {
    await evaluateChrome(page, "document.documentElement.style.zoom='2'");
    return await evaluateChrome(page, "window.__measure()");
  } finally {
    await closeChromePage(runtime, page);
  }
}

async function expectedMutation(runtime, variant) {
  const metrics = await render(runtime, variant);
  try {
    validate(metrics);
  } catch (error) {
    if (error instanceof assert.AssertionError) return { exit: 1, message: error.message };
    throw error;
  }
  assert.fail(`${variant} mutation did not fail`);
}

async function expectedStartupFailure(failure, message) {
  try {
    await startChromeRuntime(failure);
  } catch (error) {
    assert.match(error.message, message);
    assert.equal(error.cleanup.afterExists, false);
    assert.deepEqual(error.cleanup.processResidue, []);
    assert.equal(error.cleanup.portReusable, true);
    return { exit: 1, message: error.message, cleanup: error.cleanup };
  }
  assert.fail(`${failure} startup did not fail`);
}

async function runLayout(variant) {
  const runtime = await startChromeRuntime();
  let value;
  let cleanup;
  let failure;
  try {
    if (variant === "matrix") {
      const normal = await render(runtime, "normal");
      validate(normal);
      value = {
        launchCount: 1,
        normal,
        mutations: {
          target: await expectedMutation(runtime, "target"),
          reflow: await expectedMutation(runtime, "reflow"),
        },
      };
    } else {
      const metrics = await render(runtime, variant);
      if (process.env.PVA_GEOMETRY === "1")
        process.stdout.write(`PVA_GEOMETRY ${JSON.stringify(metrics)}\n`);
      validate(metrics);
      value = metrics;
    }
  } catch (error) {
    failure = error;
  } finally {
    cleanup = await cleanupChromeRuntime(runtime);
  }
  if (failure) {
    failure.cleanup = cleanup;
    throw failure;
  }
  return { ...value, cleanup };
}

async function main() {
  let result;
  switch (mode) {
    case "matrix": {
      const layout = await runLayout(mode);
      const endpointFailure = await expectedStartupFailure("timeout", /endpoint timed out/u);
      const launchFailure = await expectedStartupFailure("launch", /spawn/u);
      const roots = [layout.cleanup.root, endpointFailure.cleanup.root, launchFailure.cleanup.root];
      assert.equal(
        new Set(roots).size,
        roots.length,
        "runtime roots must be unique per invocation",
      );
      result = { ...layout, lifecycle: { endpointFailure, launchFailure }, roots };
      break;
    }
    case "normal":
    case "target":
    case "reflow":
      result = await runLayout(mode);
      break;
    case "endpoint-failure":
      await startChromeRuntime("timeout");
      return assert.fail("endpoint timeout fixture did not fail");
    case "launch-failure":
      result = await expectedStartupFailure("launch", /spawn/u);
      break;
    default:
      assert.fail(`unhandled mode ${mode}`);
  }
  process.stdout.write(`PVA_RESULT ${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  if (error.cleanup) process.stderr.write(`PVA_CLEANUP ${JSON.stringify(error.cleanup)}\n`);
  process.exitCode = 1;
});
