"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const adapter = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-read-adapter.js"));
const surfaceApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-wiki-surface.js"));
const stylesApi = require(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"));
const { createTrustedFixture } = require("./fixtures/llmwiki-canonical-v2-trust-fixture.js");

function fakeDocument() {
  let document;
  const make = (tag) => {
    const element = {
      tagName: tag,
      children: [],
      attributes: {},
      ownerDocument: document,
      textContent: "",
      value: "",
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter((item) => item !== child); },
      createEl(childTag, options) {
        const child = make(childTag);
        const config = options || {};
        if (config.text !== undefined) child.textContent = String(config.text);
        Object.entries(config.attr || {}).forEach(([key, value]) => {
          if (value !== undefined) child.setAttribute(key, value);
        });
        if (config.disabled) child.disabled = true;
        this.appendChild(child);
        return child;
      },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      empty() { this.children = []; this.textContent = ""; },
      focus() { this.focused = true; },
    };
    return element;
  };
  document = {
    head: make("head"),
    createElement: make,
    getElementById() { return null; },
  };
  return { document, container: make("div") };
}

function legacyAsset() {
  return { source_path: "ZETA/PERMANENT/alpha.md", path: "ZETA/PERMANENT/alpha.md", type: "knowledge", title: "Alpha", mtime: 10, frontmatter: { type: "knowledge", knowledge_domain: "coding", knowledge_topics: ["ai"] } };
}

function snapshot() {
  return adapter.buildSnapshot({
    registry,
    collection_revision: "surface-fixture",
    assets: [legacyAsset()],
    candidates: [{ type: "knowledge_candidate", path: "PARA/RESOURCES/Knowledge/Candidates/pending.md", title: "Pending", statement: "Pending statement", suggested_domain: "coding", suggested_topics: ["ai"], status: "saved", mtime: 20 }],
  });
}

async function snapshotWithTrustedRow() {
  const genuine = await createTrustedFixture();
  const current = adapter.buildSnapshot({
    registry,
    collection_revision: genuine.revision,
    assets: [genuine.row, legacyAsset()],
    candidates: [{ type: "knowledge_candidate", path: "PARA/RESOURCES/Knowledge/Candidates/pending.md", title: "Pending", statement: "Pending statement", suggested_domain: "coding", suggested_topics: ["ai"], status: "saved", mtime: 20 }],
  });
  assert.equal(current.counts.verified, 1, JSON.stringify(current.counts));
  assert.equal(current.rows.find((row) => row.trust === "verified").path, genuine.path);
  assert.equal(current.rows.find((row) => row.trust === "maintenance" && row.path === "ZETA/PERMANENT/alpha.md") !== undefined, true, "legacy knowledge row without finalized authority stays maintenance");
  return { genuine, current };
}

function descendants(root) {
  return [root, ...(root && Array.isArray(root.children) ? root.children.flatMap(descendants) : [])];
}

test("clicking a verified canonical v2 result opens hydrated detail in an Obsidian modal while legacy rows stay excluded", async () => {
  const { genuine, current } = await snapshotWithTrustedRow();
  const { document, container } = fakeDocument();
  const modals = [];
  class FakeModal {
    constructor() {
      this.modalEl = document.createElement("div");
      this.contentEl = document.createElement("div");
      this.modalEl.appendChild(this.contentEl);
      modals.push(this);
    }
    open() {
      this.opened = true;
      if (typeof this.onOpen === "function") this.onOpen();
    }
    close() {
      this.opened = false;
      if (typeof this.onClose === "function") this.onClose();
    }
  }
  const readService = {
    browseRead(input) {
      return adapter.browseRead({ ...input, registry });
    },
    hydrateBody(input) {
      return Promise.resolve({ ok: true, status: "ready", path: input.path, body: "popup body", writer_count: 0, provider_count: 0 });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({
      app: {},
      container,
      snapshot: current,
      readAdapter: adapter,
      readService,
      obsidian: { Modal: FakeModal },
    });
    surface.setMode("verified");
    assert.equal(descendants(container).some((node) => typeof node.textContent === "string" && node.textContent.includes("Alpha")), false, "legacy row is never rendered as a verified result");
    const resultButton = descendants(container).find((node) => node.attributes && node.attributes.class === "llmwiki-wiki-surface__result");
    assert.ok(resultButton);
    resultButton.onclick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(modals.length, 1);
    assert.equal(modals[0].opened, true);
    const modalText = descendants(modals[0].contentEl).map((node) => node.textContent).filter(Boolean).join(" ");
    assert.match(modalText, /Fixture authority/u);
    assert.match(modalText, /popup body/u);
    assert.equal(descendants(container).some((node) => node.attributes && node.attributes["data-component"] === "WikiDetailPane"), false);
    modals[0].close();
    assert.equal(surface.getState().selection.path, null);
  } finally {
    global.document = previousDocument;
  }
});

test("compact modal keeps its sticky close footer inside the native dialog", () => {
  const { document } = fakeDocument();
  stylesApi.ensureStyles(document);
  const css = document.head.children.find((node) => node.attributes && node.attributes["data-knowledge-styles"] !== undefined).textContent;
  assert.match(css, /\.llmwiki-wiki-detail-modal__article\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*max-block-size:\s*80vh;/u);
  assert.doesNotMatch(css, /\.llmwiki-wiki-detail-modal__article\s*\{\s*max-block-size:\s*(?:8[1-9]|9\d|100)vh/u);
});

test("fourth-tab browse surface renders read-only facets, selection, and hydrated detail", async () => {
  const { document, container } = fakeDocument();
  const current = snapshot();
  let browseCalls = 0;
  let hydrationCalls = 0;
  const readService = {
    browseRead(input) {
      browseCalls += 1;
      return adapter.browseRead({ ...input, registry });
    },
    hydrateBody(input) {
      hydrationCalls += 1;
      return Promise.resolve({ ok: true, status: "ready", path: input.path, body: "read-only body", writer_count: 0, provider_count: 0 });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: current, readAdapter: adapter, readService });
    assert.equal(surface.getState().status, "ready");
    const pending = surface.setMode("pending");
    assert.equal(pending.status, "ready");
    assert.equal(pending.result.rows[0].trust, "pending");
    assert.equal(pending.result.writer_count, 0);
    assert.equal(pending.result.provider_count, 0);

    const selected = surface.select("PARA/RESOURCES/Knowledge/Candidates/pending.md");
    assert.equal(selected.selection.path, "PARA/RESOURCES/Knowledge/Candidates/pending.md");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(surface.getState().bodyState, "ready");
    assert.equal(surface.getState().body, "read-only body");
    const queried = surface.setQuery("pending");
    assert.equal(queried.selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    surface.select("PARA/RESOURCES/Knowledge/Candidates/pending.md");
    await new Promise((resolve) => setImmediate(resolve));
    const modeChanged = surface.setMode("verified");
    assert.equal(modeChanged.selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    assert.ok(browseCalls >= 2);
    assert.equal(hydrationCalls, 2);
    assert.equal(current.writer_count, 0);
    assert.equal(current.provider_count, 0);
  } finally {
    global.document = previousDocument;
  }
});
test("inactive Knowledge tab does not retain zero-sized native controls and remounts from retained state when shown", () => {
  const { document, container } = fakeDocument();
  const panel = { hidden: true };
  container.closest = () => panel;
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: snapshot(), readAdapter: adapter });
    assert.equal(container.children.length, 0);
    panel.hidden = false;
    surface.update({ status: "ready" });
    assert.equal(container.children.length, 1);
    assert.equal(surface.getState().status, "ready");
    surface.destroy();
  } finally {
    global.document = previousDocument;
  }
});

test("facet changes clear detail selection and stale reads render an explicit stale state", async () => {
  const { document, container } = fakeDocument();
  const current = snapshot();
  const staleService = {
    browseRead() {
      return {
        ok: true,
        value: {
          status: "stale",
          reason: "stale_snapshot",
          total: 0,
          rows: [],
          facets: { domains: [], topics: [] },
          selection: { domain: "", topic: "", mode: "verified", path: null, detail_state: "rest" },
        },
      };
    },
    hydrateBody() {
      return Promise.resolve({ ok: false, status: "stale", reason: "stale_snapshot" });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: current, readAdapter: adapter, readService: staleService });
    assert.equal(surface.setFacet("domain", "coding").selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    assert.equal(surface.setQuery("changed").status, "stale");
    assert.equal(surface.getState().status, "stale");
  } finally {
    global.document = previousDocument;
  }
});
test("late hydration cannot repopulate cleared selection after a mode change", async () => {
  const { document, container } = fakeDocument();
  const current = snapshot();
  let resolveBody;
  const delayedService = {
    browseRead(input) {
      return adapter.browseRead({ ...input, registry });
    },
    hydrateBody() {
      return new Promise((resolve) => { resolveBody = resolve; });
    },
  };
  const previousDocument = global.document;
  global.document = document;
  try {
    const surface = surfaceApi.mountLlmWikiWikiSurface({ container, snapshot: current, readAdapter: adapter, readService: delayedService });
    surface.select("PARA/RESOURCES/Knowledge/Candidates/pending.md");
    assert.equal(surface.getState().bodyState, "loading");
    const changed = surface.setMode("pending");
    assert.equal(changed.selection.path, null);
    assert.equal(changed.bodyState, "empty");
    resolveBody({ ok: true, status: "ready", body: "late body", writer_count: 0, provider_count: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(surface.getState().selection.path, null);
    assert.equal(surface.getState().bodyState, "empty");
    assert.equal(surface.getState().body, null);
  } finally {
    global.document = previousDocument;
  }
});

test("review failure preserves branded answer and retries the same handoff without duplicate requests", async () => {
  const dom = fakeDocument();
  const previousDocument = global.document;
  const previousService = global.LLMWikiWikiReadService;
  let providerCalls = 0, preparationCalls = 0, handoffCalls = 0, release;
  const answer = Object.freeze({ ok: true, context: { coverage_complete: false }, answers: [{ text: "합성 사실", citation: { excerpt: "합성 사실", locator: "fixture.md#L1", source_path: "fixture.md" } }] });
  const prepared = Object.freeze({ ok: true, proposal_bundle: { status: "proposed" } });
  global.document = dom.document;
  global.LLMWikiWikiReadService = {
    async answerSourceQuestion() { providerCalls++; return answer; },
    async prepareQuestionProposal(input) { preparationCalls++; assert.equal(input.answer, answer); return prepared; },
  };
  const allNodes = (node) => [node, ...node.children.flatMap(allNodes)];
  let surface;
  try {
    surface = surfaceApi.mountLlmWikiWikiSurface({ container: dom.container, snapshot: snapshot(), readAdapter: adapter,
      getSelectedSource: () => ({ path: "fixture.md" }),
      async openQuestionReview(proposal) {
        assert.equal(proposal, prepared);
        handoffCalls++;
        if (handoffCalls === 1) return { ok: false, reason: "review_handoff_failed" };
        await new Promise((resolve) => { release = resolve; });
        return { ok: true, status: "review" };
      },
    });
    surface.setQuery("합성 질문");
    await surface.askQuestion("합성 질문");
    assert.equal((await surface.prepareReview()).reason, "review_handoff_failed");
    assert.equal(surface.getQuestionState().result, answer);
    assert.ok(allNodes(dom.container).some((node) => node.textContent === "선택 자료 일부 근거만 확인했습니다. 조건·예외를 포함한 전체 요약은 아닙니다."));
    assert.equal(surface.getQuestionState().proposal, prepared);
    assert.equal(surface.getState().query, "합성 질문");
    assert.equal(surface.getQuestionState().reviewError.reason, "review_handoff_failed");
    const retryButton = allNodes(dom.container).find((node) => node.attributes["data-action"] === "review-question-proposal");
    assert.equal(retryButton.textContent, "검토 전달 다시 시도");
    assert.equal(retryButton.disabled, false);
    const retry = retryButton.onclick();
    assert.equal((await surface.prepareReview()).reason, "action_in_progress");
    release();
    const success = await retry;
    assert.equal(success.ok, true);
    assert.equal(surface.getQuestionState().stage, "review");
    assert.equal(surface.getQuestionState().reviewError, null);
    assert.equal(await surface.prepareReview(), success);
    assert.equal(providerCalls, 1);
    assert.equal(preparationCalls, 1);
    assert.equal(handoffCalls, 2);
  } finally {
    surface?.destroy(); global.document = previousDocument; global.LLMWikiWikiReadService = previousService;
  }
});

test("thrown review handoff errors preserve the answer and allow an explicit retry", async () => {
  const dom = fakeDocument(), previousDocument = global.document, previousService = global.LLMWikiWikiReadService;
  const answer = { ok: true, answers: [{ text: "합성 사실", citation: { excerpt: "합성 사실", locator: "fixture.md#L1" } }] };
  let calls = 0;
  global.document = dom.document;
  global.LLMWikiWikiReadService = {
    async answerSourceQuestion() { return answer; },
    async prepareQuestionProposal({ answer: received }) { assert.equal(received, answer); return { ok: true }; },
  };
  let surface;
  try {
    surface = surfaceApi.mountLlmWikiWikiSurface({ container: dom.container, snapshot: snapshot(), readAdapter: adapter,
      getSelectedSource: () => ({ path: "fixture.md" }),
      async openQuestionReview() { if (++calls === 1) throw new Error("fixture failure"); return { ok: true, status: "review" }; },
    });
    await surface.askQuestion("합성 질문");
    assert.equal((await surface.prepareReview()).reason, "review_handoff_failed");
    assert.equal(surface.getQuestionState().result, answer);
    assert.equal((await surface.prepareReview()).ok, true);
  } finally {
    surface?.destroy(); global.document = previousDocument; global.LLMWikiWikiReadService = previousService;
  }
});

test("prepared proposal without a review controller is not reported as review ready", async () => {
  const dom = fakeDocument(), previousDocument = global.document, previousService = global.LLMWikiWikiReadService;
  const answer = { ok: true, answers: [{ text: "합성 사실", citation: { excerpt: "합성 사실", locator: "fixture.md#L1" } }] };
  global.document = dom.document;
  global.LLMWikiWikiReadService = {
    async answerSourceQuestion() { return answer; },
    async prepareQuestionProposal() { return { ok: true }; },
  };
  let surface;
  try {
    surface = surfaceApi.mountLlmWikiWikiSurface({ container: dom.container, snapshot: snapshot(), readAdapter: adapter, getSelectedSource: () => ({ path: "fixture.md" }) });
    await surface.askQuestion("합성 질문");
    assert.equal((await surface.prepareReview()).reason, "review_handoff_failed");
    assert.notEqual(surface.getQuestionState().stage, "review");
    assert.equal(surface.getQuestionState().result, answer);
  } finally {
    surface?.destroy(); global.document = previousDocument; global.LLMWikiWikiReadService = previousService;
  }
});

test('conversation preserves navigation state, retries once and excludes removed-scope history',async()=>{
 const prior=global.LLMWikiWikiReadService;const requests=[];let fail=true;
 global.LLMWikiWikiReadService={answerSourceQuestion:async input=>{requests.push(input);if(fail){fail=false;return {ok:false,reason:'provider_transport_error'};}return {ok:true,answers:[{text:'해솔 실내 10분',citation:{source_path:input.sources[0].path,locator:input.sources[0].path+'#L1-L1',excerpt:'해솔 실내 10분',content_hash:'a'.repeat(64)}}],review_notes:[]};}};
 try{
  const doc=fakeDocument();const session={};const opts={container:doc.document.createElement('div'),snapshot:{rows:[],snapshot_revision:'a'},readAdapter:adapter,getSelectedSource:()=>({path:'INBOX/A.md',content_hash:'a'.repeat(64)}),conversationSession:session};
  const first=surfaceApi.mountLlmWikiWikiSurface(opts);await first.askQuestion('해솔?');assert.equal(first.getConversation().draft,'해솔?');assert.equal(first.getConversation().messages.length,0);
  await first.askQuestion('해솔?',true);assert.equal(first.getConversation().messages.length,2);first.destroy();
  const second=surfaceApi.mountLlmWikiWikiSurface({...opts,container:doc.document.createElement('div')});assert.equal(second.getConversation().messages.length,2);
  await second.askQuestion('두 번째?');assert.equal(requests[2].history.length,2);
  second.removeSource('INBOX/A.md');assert.equal(second.getConversation().messages.length,0);assert.equal(second.getConversation().sources.length,0);
  second.destroy();
 }finally{global.LLMWikiWikiReadService=prior;}
});

test('new conversation discards a late response and duplicate sends',async()=>{
 const prior=global.LLMWikiWikiReadService;let release,calls=0;
 global.LLMWikiWikiReadService={answerSourceQuestion:()=>{calls++;return new Promise(resolve=>{release=resolve;});}};
 try{
  const doc=fakeDocument();const surface=surfaceApi.mountLlmWikiWikiSurface({container:doc.document.createElement('div'),snapshot:{rows:[],snapshot_revision:'a'},readAdapter:adapter,getSelectedSource:()=>({path:'INBOX/A.md',content_hash:'a'.repeat(64)})});
  const pending=surface.askQuestion('해솔?');assert.equal((await surface.askQuestion('해솔?')).reason,'action_in_progress');surface.resetConversation();release({ok:true,answers:[{text:'late',citation:{}}]});
  assert.equal((await pending).reason,'conversation_changed');assert.equal(surface.getConversation().messages.length,0);assert.equal(surface.getQuestionState().result,null);assert.equal(calls,1);surface.destroy();
 }finally{global.LLMWikiWikiReadService=prior;}
});

test('Wiki chat retains structured citations, refuses overflow without dropping context and respects Korean IME',async()=>{
 const {ChatSessionStore}=require(path.join(ROOT,'SYSTEM/Views/ai-chat-session-store.js'));
 const store=new ChatSessionStore({sessionStorage:null,rejectOverflow:true});const citation={source_path:'INBOX/A.md',locator:'INBOX/A.md#L3-L3',content_hash:'a'.repeat(64),excerpt:'조건'};
 store.appendMessage({role:'assistant',body:'조건',citations:[citation]});assert.deepEqual(store.getMessages()[0].citations,[citation]);
 assert.throws(()=>store.appendMessage({role:'user',body:'x'.repeat(70000)}),error=>error.code==='context_limit');assert.equal(store.getMessages().length,1);
 const prior=global.LLMWikiWikiReadService;let calls=0;
 global.LLMWikiWikiReadService={answerSourceQuestion:async()=>{calls++;return {ok:true,status:'abstain',answers:[]};}};
 try{
  const doc=fakeDocument();const surface=surfaceApi.mountLlmWikiWikiSurface({container:doc.container,snapshot:{rows:[],snapshot_revision:'a'},readAdapter:adapter,getSelectedSource:()=>({path:'INBOX/A.md',content_hash:'a'.repeat(64)})});
  const walk=el=>[el,...el.children.flatMap(walk)];const input=walk(doc.container).find(el=>el.tagName==='textarea');input.value='조건?';input.oncompositionstart();
  input.onkeydown({key:'Enter',isComposing:true,preventDefault(){throw Error('must not submit IME');}});assert.equal(calls,0);input.oncompositionend();
  input.onkeydown({key:'Enter',isComposing:false,preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);surface.destroy();
 }finally{global.LLMWikiWikiReadService=prior;}
});

test('closed canonical review reopens the same draft without provider or approval replay',async()=>{
 const prior=global.LLMWikiWikiReadService;let providerCalls=0,prepares=0,opens=0,close;
 const answer={ok:true,answers:[{text:'원문 주장',citation:{locator:'INBOX/A.md#L1',excerpt:'원문 주장'}}]},prepared={ok:true,document_body:'원문 주장'};
 global.LLMWikiWikiReadService={answerSourceQuestion:async()=>{providerCalls++;return answer;},prepareQuestionProposal:async()=>{prepares++;return prepared;}};
 try{
  const dom=fakeDocument();const surface=surfaceApi.mountLlmWikiWikiSurface({container:dom.container,snapshot:snapshot(),readAdapter:adapter,getSelectedSource:()=>({path:'INBOX/A.md',content_hash:'a'.repeat(64)}),openQuestionReview:async(item,callbacks)=>{assert.equal(item.document_body,prepared.document_body);opens++;let open=true;close=()=>{open=false;callbacks.onClose();};return{ok:true,status:'waiting_for_human_review',reopenable:true,isOpen:()=>open};}});
  await surface.askQuestion('원문?');const first=await surface.prepareReview();assert.equal(await surface.prepareReview(),first);assert.equal(opens,1);
  close();const allNodes=node=>[node,...node.children.flatMap(allNodes)];const button=allNodes(dom.container).find(node=>node.attributes['data-action']==='review-question-proposal');assert.equal(button.textContent,'검토 다시 열기');assert.equal(button.disabled,false);
  await button.onclick();assert.equal(opens,2);assert.equal(providerCalls,1);assert.equal(prepares,1);surface.destroy();
 }finally{global.LLMWikiWikiReadService=prior;}
});

test('changed source cannot reopen an old citation or cached proposal and preserves the old answer',async()=>{
 const priorService=global.LLMWikiWikiReadService,priorRuntime=global.ProdigyAIConsumerRuntime;
 const readService=require(path.join(ROOT,'SYSTEM/Views/llmwiki-wiki-read-service.js')),hash=require(path.join(ROOT,'SYSTEM/Views/llmwiki-hash.js'));
 let bytes='# 합성 근거\n\n청록-951 점검은 실내에서 10분이다.\n',calls=0,opened=0,handoffs=0;
 const source={path:'INBOX/Changed citation fixture.md',content_hash:hash.sha256(bytes)};
 global.ProdigyAIConsumerRuntime={requestStructured:async request=>{calls++;const p=JSON.parse(request.prompt);return {payload:{status:'ok',results:p.chunks.map(c=>({chunk_key:c.key,outcome:'proposals',items:c.evidence_candidates.map(e=>({role:'reusable_claim',topic:'점검',evidence_key:e.key,evidence_quote:e.text,claims:[e.text],review_reasons:[],related_candidate_ids:[]}))}))}};}};
 global.LLMWikiWikiReadService=readService;
 try{
  const app={vault:{getAbstractFileByPath:p=>p===source.path?{path:p}:null,read:async()=>bytes,create(){throw Error('write forbidden');},modify(){throw Error('write forbidden');}}};
  const dom=fakeDocument();const surface=surfaceApi.mountLlmWikiWikiSurface({app,container:dom.container,snapshot:snapshot(),readAdapter:adapter,getSelectedSource:()=>source,onOpenCitation:()=>{opened++;return {ok:true};},openQuestionReview:async()=>{handoffs++;return {ok:false,reason:'review_handoff_failed'};}});
  const answer=await surface.askQuestion('청록-951 점검?');assert.equal(answer.ok,true);const citation=answer.answers[0].citation;
  assert.equal((await surface.openQuestionCitation(citation)).ok,true);assert.equal(opened,1);
  assert.equal((await surface.prepareReview()).reason,'review_handoff_failed');const prepared=surface.getQuestionState().proposal;
  bytes=bytes.replace('10분','20분');
  assert.equal((await surface.openQuestionCitation(citation)).reason,'source_revision_changed');assert.equal(opened,1);
  assert.equal((await surface.prepareReview()).reason,'source_revision_changed');assert.equal(handoffs,1);
  assert.equal(surface.getQuestionState().result,answer);assert.equal(surface.getQuestionState().proposal,prepared);assert.equal(surface.getConversation().sources[0].content_hash,source.content_hash);assert.equal(calls,1);
  assert.equal((await surface.askQuestion('청록-951 재확인?')).reason,'source_revision_changed');assert.equal(calls,1);assert.equal(surface.getConversation().draft,'청록-951 재확인?');assert.equal(surface.getConversation().turns[0].result,answer);
  app.vault.getAbstractFileByPath=()=>null;assert.equal((await surface.openQuestionCitation(citation)).reason,"source_unavailable");assert.equal((await surface.askQuestion("원문 확인?")).reason,"source_unavailable");assert.equal(calls,1);
  surface.destroy();
 }finally{global.LLMWikiWikiReadService=priorService;global.ProdigyAIConsumerRuntime=priorRuntime;}
});

test('provider format failure retains the question and earlier result until an explicit retry',async()=>{
 const prior=global.LLMWikiWikiReadService;let calls=0;const first={ok:true,answers:[{text:'기존 답변',citation:{source_path:'INBOX/A.md',content_hash:'a'.repeat(64),locator:'INBOX/A.md#L1',excerpt:'기존 근거'}}]};
 global.LLMWikiWikiReadService={answerSourceQuestion:async()=>{calls++;return calls===2?{ok:false,reason:'provider_schema_invalid',detail:'invalid_review_reasons',stage:'validation'}:first;}};
 try{
  const dom=fakeDocument();const surface=surfaceApi.mountLlmWikiWikiSurface({container:dom.container,snapshot:snapshot(),readAdapter:adapter,getSelectedSource:()=>({path:'INBOX/A.md',content_hash:'a'.repeat(64)})});
  await surface.askQuestion('처음 질문');const failed=await surface.askQuestion('추가 질문');assert.equal(failed.reason,'provider_schema_invalid');assert.equal(failed.detail,'invalid_review_reasons');assert.equal(surface.getConversation().draft,'추가 질문');assert.equal(surface.getConversation().turns.length,1);assert.equal(surface.getConversation().turns[0].result,first);assert.equal(calls,2);
  await surface.askQuestion('추가 질문',true);assert.equal(calls,3);assert.equal(surface.getConversation().turns.length,2);assert.equal(surface.getConversation().messages.filter(row=>row.role==='user'&&row.body==='추가 질문').length,1);surface.destroy();
 }finally{global.LLMWikiWikiReadService=prior;}
});
