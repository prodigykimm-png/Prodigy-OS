"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");

function load(rel) {
  return require(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

class TrustedUiEvent {
  constructor(type, target, options = {}) {
    this.type = type;
    this.target = target;
    this.key = options.key || "";
    this.isTrusted = options.isTrusted === true;
    this.timeStamp = Date.now();
  }
}
function createTrustedUiHarness(runtime) {
  const listeners = new Map();
  const document = {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(event) { for (const callback of [...(listeners.get(event.type) || [])]) callback(event); }
  };
  const nodes = new Set();
  const button = { role: "button", dispatchEvent(event) { document.dispatch(event); } };
  nodes.add(button);
  const root = { ownerDocument: document, contains(node) { return nodes.has(node); } };
  const cleanups = [];
  const owner = runtime.mountTrustedInteractions({ root, document, scope: { track(cleanup) { cleanups.push(cleanup); } }, session_id: "knowledge-para-test-mount" });
  function confirmation(action, session, type = "click", key = "") {
    button.dispatchEvent(new TrustedUiEvent(type, button, { isTrusted: true, key }));
    return runtime.humanConfirmation(action, session);
  }
  return { document, button, owner, confirmation, register(node) { nodes.add(node); return node; }, dispose() { while (cleanups.length) cleanups.pop()(); } };
}

class FakeElement {
  constructor(harness, tag = "div", options = {}) {
    this.harness = harness; this.tag = tag; this.children = []; this.parent = null;
    this.ownerDocument = harness.document; this.textContent = String(options.text || "");
    this.attrs = Object.assign({}, options.attr || {}); this.disabled = false; this.onclick = null;
    harness.register(this);
  }
  createEl(tag, options) { const child = new FakeElement(this.harness, tag, options || {}); child.parent = this; this.children.push(child); return child; }
  createDiv(options) { return this.createEl("div", options); }
  empty() { this.children.length = 0; this.textContent = ""; }
  setText(value) { this.textContent = String(value); this.children.length = 0; }
  focus() { this.focused = true; }
  findText(text) { if (this.textContent === text) return this; for (const child of this.children) { const found = child.findText(text); if (found) return found; } return null; }
  findContains(text) { if (this.textContent.includes(text)) return this; for (const child of this.children) { const found = child.findContains(text); if (found) return found; } return null; }
  findAttr(name, value) { if (this.attrs[name] === value) return this; for (const child of this.children) { const found = child.findAttr(name, value); if (found) return found; } return null; }
  async activate(type = "click", key = "") { const event = new TrustedUiEvent(type, this, { isTrusted: true, key }); this.harness.document.dispatch(event); return this.onclick && this.onclick(event); }
}

// In-memory Obsidian vault fake. Records every create/createFolder so tests
// can prove exactly what was (and was not) written.
function makeFakeApp(existing) {
  const files = new Map();
  (existing || []).forEach((p) => files.set(p, ""));
  const created = [];
  const folders = [];
  return {
    created,
    folders,
    files,
    vault: {
      getAbstractFileByPath: (p) => (files.has(p) ? { path: p } : null),
      create: async (p, content) => {
        files.set(p, content);
        created.push({ path: p, content });
        return { path: p };
      },
      createFolder: async (p) => {
        folders.push(p);
        files.set(p, "");
        return { path: p };
      },
      read: async (file) => files.get(typeof file === "string" ? file : file.path) || ""
    },
    workspace: {
      openLinkText: async () => {},
      getLeaf: () => ({ openFile: async () => {} })
    }
  };
}

async function main() {
  const service = load("SYSTEM/Views/para-object-creator-service.js");
  load("SYSTEM/Views/object-creator-core.js");
  const core = globalThis.ObjectCreatorCore;
  globalThis.Event = TrustedUiEvent;
  const runtime = load("SYSTEM/Views/capture-action-runtime.js");
  const trustedUi = createTrustedUiHarness(runtime);
  assert.ok(service, "ParaObjectCreatorService must load");
  assert.ok(core, "ObjectCreatorCore must load");

  // --- Action surface: Area, Documentation, Literature, Project (no generic resource) ---
  const ids = service.ACTIONS.map((a) => a.id);
  assert.deepEqual(ids.slice().sort(), ["area", "documentation", "literature", "project"]);
  assert.ok(!ids.includes("resource"), "must NOT expose a generic resource type");
  // Only Area and Documentation are written by this service.
  assert.deepEqual(
    service.ACTIONS.filter((a) => a.writes).map((a) => a.id).sort(),
    ["area", "documentation"]
  );

  // --- Exact paths and types ---
  assert.equal(service.AREA_FOLDER, "PARA/AREAS");
  assert.equal(service.DOCUMENTATION_FOLDER, "PARA/RESOURCES/DOCUMENTATIONS");

  // Area: PARA/AREAS/<Name>/2. <Name>.md, type area_family
  {
    const app = makeFakeApp();
    await assert.rejects(() => service.createArea(app, "  Autonomous Vehicle AI Ethics  "), /Capture writer authority/);
    assert.equal(app.created.length, 0, "public Area writer requires canonical authority");
    assert.equal(app.folders.length, 0);
  }

  // Documentation: PARA/RESOURCES/DOCUMENTATIONS/<Name>.md, type documentation_note
  {
    const app = makeFakeApp();
    await assert.rejects(() => service.createDocumentation(app, "Safety Protocols"), /Capture writer authority/);
    assert.equal(app.created.length, 0, "public Documentation writer requires canonical authority");
    assert.equal(app.folders.length, 0);
  }

  // --- Both entry points use the SAME service (zero duplicate writer) ---
  // The Object Creator core must route area/documentation through ParaObjectCreatorService,
  // not reimplement the write. Prove by source inspection + behavior.
  const coreSrc = read("SYSTEM/Views/object-creator-core.js");
  assert.match(coreSrc, /ParaObjectCreatorService/, "core references shared service");
  assert.match(coreSrc, /para\.createArea/, "core delegates Area to service");
  assert.match(coreSrc, /para\.createDocumentation/, "core delegates Documentation to service");
  // Core must not itself build area/documentation frontmatter (no duplicate persistence).
  assert.ok(!/type: area_family/.test(coreSrc), "core must not write area frontmatter directly");
  assert.ok(!/type: documentation_note/.test(coreSrc), "core must not write documentation frontmatter directly");

  // Object Creator is fail-closed without a trusted UI confirmation.
  {
    const app = makeFakeApp();
    await assert.rejects(
      () => core.launchExistingCreator(app, "area", "Green Data Center Initiative"),
      (error) => error.message === "Object Creator requires explicit human confirmation before writing."
    );
    assert.equal(app.created.length, 0, "missing confirmation performs zero canonical writes");
    assert.equal(app.folders.length, 0, "missing confirmation performs zero vault writes");
  }

  // Real mounted click capability: Knowledge writes one exact reviewed note and receipt.
  {
    const app = makeFakeApp();
    const firstHuman = trustedUi.confirmation("object-creator-knowledge", "knowledge-click-session", "click");
    const first = await core.launchExistingCreator(app, "knowledge", "Green Data Center Initiative", { humanConfirmation: firstHuman });
    assert.equal(first.capture.record.state, "human_review");
    assert.equal(app.created.length, 0);
    const res = await core.launchExistingCreator(app, "knowledge", "Green Data Center Initiative", { captureReview: first.capture.record, humanConfirmation: trustedUi.confirmation("object-creator-knowledge", "knowledge-click-session", "keydown", "Enter") });
    const target = "ZETA/FLEETING/Green Data Center Initiative.md";
    assert.equal(res.ok, true);
    assert.equal(res.path, target);
    assert.equal(app.created.length, 1, "confirmed Knowledge action performs one canonical write");
    assert.equal(app.created[0].path, target);
    assert.match(app.created[0].content, /^type: fleeting_note$/m);
    assert.match(app.created[0].content, /^status: active$/m);
    assert.match(app.created[0].content, /^# Green Data Center Initiative$/m);
    assert.equal(res.capture.record.state, "object_committed");
    assert.equal(res.capture.receipt.contract_version, "capture_write_receipt_v3");
    assert.equal(res.capture.receipt.target_path, target);
    assert.equal(res.capture.receipt.operation, "create");
    assert.equal(res.capture.receipt.rollback_identity.before_revision, "absent");
    assert.match(res.capture.receipt.payload_hash, /^[0-9a-f]{64}$/);
    assert.match(res.capture.receipt.authorization_id, /^authorization_/);
    assert.equal(res.capture.receipt.session_id, "knowledge-click-session");
    assert.equal(Object.hasOwn(res.capture.receipt, "payload"), false, "receipt stays payload-free");
  }

  // Real mounted keyboard capabilities preserve both PARA delegation paths.
  {
    const app = makeFakeApp();
    const first = await core.launchExistingCreator(app, "area", "Green Data Center Initiative", { humanConfirmation: trustedUi.confirmation("object-creator-area", "area-enter-session", "keydown", "Enter") });
    assert.equal(first.capture.record.state, "human_review"); assert.equal(app.created.length, 0);
    const res = await core.launchExistingCreator(app, "area", "Green Data Center Initiative", { captureReview: first.capture.record, humanConfirmation: trustedUi.confirmation("object-creator-area", "area-enter-session", "click") });
    assert.equal(res.ok, true);
    assert.equal(res.path, "PARA/AREAS/Green Data Center Initiative/2. Green Data Center Initiative.md");
    assert.equal(app.created.length, 1);
    assert.match(app.created[0].content, /^type: area_family$/m);
    assert.match(app.created[0].content, /^area: Green Data Center Initiative$/m);
  }
  {
    const app = makeFakeApp();
    const first = await core.launchExistingCreator(app, "documentation", "Transparency Strategies", { humanConfirmation: trustedUi.confirmation("object-creator-documentation", "documentation-space-session", "keydown", " ") });
    assert.equal(first.capture.record.state, "human_review"); assert.equal(app.created.length, 0);
    const res = await core.launchExistingCreator(app, "documentation", "Transparency Strategies", { captureReview: first.capture.record, humanConfirmation: trustedUi.confirmation("object-creator-documentation", "documentation-space-session", "click") });
    assert.equal(res.ok, true);
    assert.equal(res.path, "PARA/RESOURCES/DOCUMENTATIONS/Transparency Strategies.md");
    assert.equal(app.created.length, 1);
    assert.match(app.created[0].content, /^type: documentation_note$/m);
    assert.match(app.created[0].content, /^reference:\s*$/m);
    assert.match(app.created[0].content, /^\s+- documentation_note$/m);
  }

  // Real rendered Knowledge PARA Area flow: first activation leaves exact review and zero writes;
  // a later activation on the rendered Confirm control commits exactly once.
  {
    load("SYSTEM/Views/knowledge-para-view.js");
    const view = globalThis.KnowledgeParaView;
    const app = makeFakeApp();
    const container = new FakeElement(trustedUi);
    const previousPrompt = globalThis.prompt;
    let review = null; let committed = null;
    globalThis.prompt = () => "렌더링 영역 검토";
    try {
      view.renderParaActions(container, {
        app,
        onReview(record) { review = record; },
        onCreated(result) { committed = result; }
      });
      const areaButton = container.findAttr("data-action", "area");
      assert.ok(areaButton, "rendered Area control exists");
      await areaButton.activate("click");
      assert.equal(review.state, "human_review");
      assert.equal(app.created.length, 0, "first rendered PARA activation writes zero files");
      assert.equal(review.authorization, null, "first activation creates zero authorization");
      assert.ok(container.findContains(review.target_path), "review renders canonical target");
      assert.ok(container.findContains(review.proposal_id), "review renders proposal ID");
      assert.ok(container.findContains(review.payload_hash), "review renders internally computed payload SHA");
      assert.ok(container.findContains("렌더링 영역 검토"), "CJK payload remains visible without truncation");
      const panel = container.findAttr("class", "capture-human-review");
      assert.match(panel.attrs.style, /max-width:100%/);
      assert.ok(container.findText("확인") && container.findText("거절") && container.findText("취소"), "review renders Confirm/Reject/Cancel");
      const confirm = container.findText("확인");
      assert.equal(confirm.focused, true, "rendered review moves focus to the native Confirm control");
      assert.match(confirm.attrs.style, /min-height:44px/);
      await confirm.activate("keydown", "Enter");
      assert.equal(committed.capture.record.state, "object_committed");
      assert.equal(app.created.length, 1, "second rendered PARA activation writes exactly once");
      assert.equal(app.created[0].path, review.target_path);
    } finally { globalThis.prompt = previousPrompt; }
  }

  // --- Delegation boundaries: Literature and Project are NOT written here ---
  {
    let wizardOpened = null;
    const prevWizard = globalThis.openProjectWizard;
    globalThis.openProjectWizard = (opts) => { wizardOpened = opts; };
    try {
      const app = makeFakeApp();
      const res = await service.executeAction("project", app, "Auction Calendar MVP");
      assert.equal(res.ok, true);
      assert.equal(res.deferred, true, "project is delegated, not written");
      assert.equal(app.created.length, 0, "project writes nothing via this service");
      assert.ok(wizardOpened, "project wizard opened");
      assert.equal(wizardOpened.initialProjectName, "Auction Calendar MVP");
    } finally {
      globalThis.openProjectWizard = prevWizard;
    }
  }
  {
    // Literature delegates to existing knowledge authoring; writes nothing here.
    const app = makeFakeApp();
    const res = await service.executeAction("literature", app, "Some Paper");
    assert.equal(res.ok, true);
    assert.equal(res.deferred, true, "literature is delegated, not written");
    assert.equal(app.created.length, 0, "literature writes nothing via this service");
  }

  // --- Reading handoff opens a prefilled manual modal, never auto-search ---
  {
    const app = makeFakeApp();
    let opened = false;
    const prevRBC = globalThis.ReadingBookCreate;
    globalThis.ReadingBookCreate = { open: () => { opened = true; } };
    try {
      const res = await service.executeAction("reading", app, "Atomic Habits");
      assert.equal(res.ok, true);
      assert.equal(res.deferred, true);
      assert.equal(opened, true, "reading manual modal opened");
      assert.equal(app.created.length, 0, "reading handoff writes nothing here");
    } finally {
      globalThis.ReadingBookCreate = prevRBC;
    }
    // Service source must not call the search-based reader.
    const svcSrc = read("SYSTEM/Views/para-object-creator-service.js");
    assert.ok(!/createReadingObject\(/.test(svcSrc), "no auto-search Reading");
    assert.match(svcSrc, /ReadingBookCreate/, "reading handoff uses ReadingBookCreate");
  }

  // --- Failure preservation: collision and invalid title write nothing ---
  {
    // Collision: existing area file → throw, no new write.
    const app = makeFakeApp(["PARA/AREAS/Dup Area/2. Dup Area.md"]);
    await assert.rejects(
      () => service.createArea(app, "Dup Area"),
      /Capture writer authority/
    );
    assert.equal(app.created.length, 0, "collision writes nothing");
  }
  {
    const app = makeFakeApp(["PARA/RESOURCES/DOCUMENTATIONS/Dup Doc.md"]);
    await assert.rejects(
      () => service.createDocumentation(app, "Dup Doc"),
      /Capture writer authority/
    );
    assert.equal(app.created.length, 0, "collision writes nothing");
  }
  {
    // Invalid (empty) title → throw, no write, input preserved (nothing mutated).
    const app = makeFakeApp();
    await assert.rejects(() => service.createArea(app, "   "), /제목을 입력해 주세요/);
    await assert.rejects(() => service.createDocumentation(app, ""), /제목을 입력해 주세요/);
    assert.equal(app.created.length, 0, "invalid title writes nothing");
  }
  {
    // Unknown action → throw.
    const app = makeFakeApp();
    await assert.rejects(() => service.executeAction("resource", app, "x"), /알 수 없는 PARA 액션/);
    assert.equal(app.created.length, 0);
  }

  // Programmatic events never mint a capability through the production runtime.
  {
    trustedUi.button.dispatchEvent(new TrustedUiEvent("click", trustedUi.button, { isTrusted: false }));
    assert.throws(
      () => runtime.humanConfirmation("object-creator-knowledge", "untrusted-session"),
      /trusted explicit interaction from a live mount/i
    );
  }

  // Disposal invalidates an outstanding intent before Object Creator can bind it.
  {
    const staleHuman = trustedUi.confirmation("object-creator-knowledge", "disposed-session", "click");
    trustedUi.dispose();
    const app = makeFakeApp();
    await assert.rejects(
      () => core.launchExistingCreator(app, "knowledge", "Disposed Knowledge", { humanConfirmation: staleHuman }),
      (error) => error.message === "Trusted mount owner is inactive or disposed."
    );
    assert.equal(app.created.length, 0, "disposed capability performs zero canonical writes");
    assert.equal(app.folders.length, 0, "disposed capability performs zero vault writes");
  }

  // Executable mutation: removing the explicit confirmation guard makes the
  // exact fail-closed security assertion RED, even though later layers also deny.
  {
    const source = read("SYSTEM/Views/object-creator-core.js");
    const mutated = source.replace(
      'if (!config.human) throw new Error("Object Creator requires explicit human confirmation before writing.");',
      ""
    );
    assert.notEqual(mutated, source, "confirmation-enforcement mutation must apply");
    const context = vm.createContext({
      globalThis: null, module: { exports: {} }, exports: {}, require: undefined,
      console, Date, Object, Array, String, Number, Boolean, Promise, RegExp,
      ParaObjectCreatorService: service,
      CaptureActionRuntime: runtime,
      CaptureAuthorizedWriter: globalThis.CaptureAuthorizedWriter,
      CaptureStateContract: globalThis.CaptureStateContract
    });
    context.globalThis = context;
    vm.runInContext(mutated, context, { filename: "object-creator-core.confirmation-mutation.js" });
    const app = makeFakeApp();
    let mutationError = null;
    try { await context.ObjectCreatorCore.launchExistingCreator(app, "area", "Mutation Area"); }
    catch (error) { mutationError = error; }
    assert.ok(mutationError);
    assert.throws(
      () => assert.equal(mutationError.message, "Object Creator requires explicit human confirmation before writing."),
      /Expected values to be strictly equal/,
      "removing confirmation enforcement must RED the exact security assertion"
    );
    assert.equal(app.created.length, 0, "confirmation mutation still records zero writes in the fail-closed stack");
  }

  // Executable mutation: if both trusted-event checks accept a programmatic
  // event, the production assertion above turns RED through the public mount API.
  {
    const listeners = new Map();
    const document = {
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); }
    };
    const context = vm.createContext({
      globalThis: null, module: undefined, exports: undefined, require: undefined,
      console, Date, JSON, Object, Array, String, Number, Boolean, Map, Set, WeakMap, WeakSet,
      Promise, RegExp, Symbol, Uint32Array, encodeURIComponent, unescape,
      Event: TrustedUiEvent, document
    });
    context.globalThis = context;
    const contractMutation = read("SYSTEM/Views/capture-state-contract.js").replace("event.isTrusted !== true", "false");
    const runtimeMutation = read("SYSTEM/Views/capture-action-runtime.js").replace("event.isTrusted !== true", "false");
    vm.runInContext(contractMutation, context, { filename: "capture-state-contract.untrusted-mutation.js" });
    vm.runInContext(read("SYSTEM/Views/capture-authorized-writer.js"), context, { filename: "capture-authorized-writer.js" });
    vm.runInContext(runtimeMutation, context, { filename: "capture-action-runtime.untrusted-mutation.js" });
    const mutationRuntime = context.CaptureActionRuntime;
    mutationRuntime.mountTrustedInteractions({ root: document, document, scope: { track() {} }, session_id: "untrusted-mutation" });
    listeners.get("click")(new TrustedUiEvent("click", document, { isTrusted: false }));
    assert.throws(
      () => assert.throws(() => mutationRuntime.humanConfirmation("object-creator-knowledge", "untrusted-mutation-session"), /trusted explicit interaction/i),
      /Missing expected exception/,
      "accepting programmatic events must RED the trusted-event assertion"
    );
  }

  // --- Empty state: PARA projection reports no connected knowledge (fail-closed) ---
  const projection = load("SYSTEM/Views/knowledge-para-projection.js");
  {
    const model = projection.projectParaKnowledge([], []);
    assert.equal(model.total_links, 0);
    assert.equal(model.total_sources, 0);
    assert.equal(model.links.length, 0);
  }
  {
    // A knowledge record with NO connections must not appear (fail-closed).
    const records = [{ path: "ZETA/PERMANENT/Note A.md", type: "knowledge", title: "Note A" }];
    const model = projection.projectParaKnowledge(records, []);
    assert.equal(model.total_knowledge, 1, "knowledge indexed");
    assert.equal(model.total_links, 0, "no connections → no links");
  }
  {
    // Candidate / literature_note / venue / auction_region are NOT verified knowledge.
    const records = [
      { path: "ZETA/CANDIDATE/c.md", type: "knowledge_candidate", title: "C" },
      { path: "ZETA/LITERATURE/l.md", type: "literature_note", title: "L" },
      { path: "PARA/RESOURCES/VENUES/v.md", type: "venue", title: "V" },
      { path: "PARA/PROJECTS/Auction/r.md", type: "auction_region", title: "R" }
    ];
    const model = projection.projectParaKnowledge(records, []);
    assert.equal(model.total_knowledge, 0, "non-verified types excluded from knowledge index");
  }
  {
    // A verified knowledge note explicitly connected from a Project IS surfaced.
    const records = [{ path: "ZETA/PERMANENT/Note A.md", type: "knowledge", title: "Note A" }];
    const relations = [{
      path: "PARA/PROJECTS/Proj/2. Proj.md",
      type: "project",
      title: "Proj",
      connections: ["[[Note A]]"]
    }];
    const model = projection.projectParaKnowledge(records, relations);
    assert.equal(model.total_links, 1);
    assert.equal(model.links[0].knowledge_path, "ZETA/PERMANENT/Note A");
    assert.equal(model.links[0].source_type, "project");
    assert.deepEqual(model.source_type_counts, { project: 1 });
    assert.deepEqual(model.link_counts.by_source, { "PARA/PROJECTS/Proj/2. Proj.md": 1 });
    assert.equal(projection.getSourceDetail(model, "PARA/PROJECTS/Proj/2. Proj.md").link_count, 1);
  }

  // --- PARA view exposes actions + empty-state rendering ---
  const viewSrc = read("SYSTEM/Views/knowledge-para-view.js");
  assert.match(viewSrc, /knowledge-para-search/, "view renders PARA search");
  assert.match(viewSrc, /knowledge-para-source-filter/, "view renders source filter");
  assert.match(viewSrc, /knowledge-para-selected-detail/, "view renders selected detail");
  assert.match(viewSrc, /renderParaActions/, "view renders PARA creator actions");
  assert.match(viewSrc, /ParaObjectCreatorService/, "view uses shared service");
  assert.match(viewSrc, /연결된 지식 없음/, "view has fail-closed empty state");
  assert.match(viewSrc, /knowledge-workspace-role-banner/, "view marks the PARA execution/context role");
  assert.match(viewSrc, /"data-workspace-role":\s*"knowledge-use"/, "view exposes the PARA role marker");
  assert.match(viewSrc, /knowledge-workspace-boundary-cue/, "view exposes the approved-Knowledge boundary cue");
  assert.match(viewSrc, /Candidates\(후보\).*Literature\(문헌\).*미승인 제안/, "boundary cue excludes candidate, literature, and unapproved proposals");
  assert.match(viewSrc, /Zettelkasten\(제텔카스텐\).*지식 검토·승인/, "role copy distinguishes Zettelkasten review");

  // --- HUB wiring loads the service and passes app to the PARA view ---
  const hub = read("HUB/50 Knowledge.md");
  const knowledgeRequired = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/workspace-manifest-v1.json")).entries.knowledge.required;
  assert.ok(knowledgeRequired.includes("SYSTEM/Views/para-object-creator-service.js"), "hub loads the shared service");
  // Service must load before the view that consumes it.
  assert.ok(
    knowledgeRequired.indexOf("SYSTEM/Views/para-object-creator-service.js") < knowledgeRequired.indexOf("SYSTEM/Views/knowledge-para-view.js"),
    "service loads before para view"
  );

  // --- Zero duplicate writer guarantee across the whole owned surface ---
  // Exactly one module builds area_family frontmatter; exactly one builds documentation_note.
  const ownedWriters = [
    "SYSTEM/Views/para-object-creator-service.js",
    "SYSTEM/Views/object-creator-core.js",
    "SYSTEM/Views/knowledge-para-view.js"
  ].map(read);
  const areaWriters = ownedWriters.filter((s) => /type: area_family/.test(s)).length;
  const docWriters = ownedWriters.filter((s) => /type: documentation_note/.test(s)).length;
  assert.equal(areaWriters, 1, "exactly one area_family writer");
  assert.equal(docWriters, 1, "exactly one documentation_note writer");

  console.log("Knowledge PARA creator tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
