"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const FIXTURE_PATH = path.join(ROOT, "LLMWiki Approval QA.md");

function findAction(root, action) {
  if (!root) return null;
  if (root.attr && root.attr["data-action"] === action) return root;
  for (const child of root.children || []) {
    const match = findAction(child, action);
    if (match) return match;
  }
  return null;
}

function findOperationInput(root, operationId) {
  if (!root) return null;
  if (root.tag === "input" && root.attr && root.attr["data-operation-id"] === operationId) return root;
  for (const child of root.children || []) {
    const match = findOperationInput(child, operationId);
    if (match) return match;
  }
  return null;
}

function dataviewSource(source) {
  const match = source.match(/```dataviewjs\n([\s\S]*?)\n```/u);
  assert.ok(match, "QA fixture must contain one DataviewJS block");
  return match[1];
}

function reviewModulePaths(source) {
  return [...source.matchAll(/^\s+"(SYSTEM\/Views\/[^"].+\.js)",?$/gmu)].map((match) => match[1]);
}

function installRuntimeBoundarySpies(sandbox) {
  const counts = {
    global: { fetch: 0, XMLHttpRequest: 0, WebSocket: 0 },
    child_process: {},
    process: {},
    filesystem: {},
  };
  const restoreActions = [];
  const requireRequests = [];
  const realFs = require("node:fs");
  const realChildProcess = require("node:child_process");
  const realProcess = require("node:process");
  const hostGlobal = globalThis;
  const childProcessHooks = ["exec", "execFile", "execFileSync", "fork", "spawn", "spawnSync"];
  const processHooks = ["execve"];
  const filesystemHooks = ["writeFileSync", "mkdirSync", "rmSync", "rmdirSync", "unlinkSync", "renameSync"];
  const filesystemPromiseHooks = ["writeFile", "mkdir", "rm", "rmdir", "unlink", "rename"];
  let wasRestored = false;

  function patch(target, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: descriptor ? descriptor.enumerable : true,
      writable: true,
      value,
    });
    restoreActions.push(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete target[key];
    });
  }

  function boundarySpy(scope, hook) {
    return function runtimeBoundarySpy() {
      counts[scope][hook] += 1;
      throw new Error(`Unexpected ${scope}.${hook} call in preview fixture`);
    };
  }

  function createFsSpy() {
    const fsSpy = Object.create(realFs);
    filesystemHooks.forEach((hook) => {
      counts.filesystem[hook] = 0;
      fsSpy[hook] = boundarySpy("filesystem", hook);
    });
    const promisesSpy = Object.create(realFs.promises);
    filesystemPromiseHooks.forEach((hook) => {
      const key = `promises.${hook}`;
      counts.filesystem[key] = 0;
      promisesSpy[hook] = boundarySpy("filesystem", key);
    });
    Object.defineProperty(fsSpy, "promises", { configurable: true, enumerable: true, writable: false, value: promisesSpy });
    return fsSpy;
  }

  function createChildProcessSpy() {
    const childProcessSpy = Object.create(realChildProcess);
    childProcessHooks.forEach((hook) => {
      counts.child_process[hook] = 0;
      childProcessSpy[hook] = boundarySpy("child_process", hook);
    });
    return childProcessSpy;
  }

  function createProcessSpy() {
    const processSpy = Object.create(realProcess);
    processHooks.filter((hook) => typeof realProcess[hook] === "function").forEach((hook) => {
      counts.process[hook] = 0;
      processSpy[hook] = boundarySpy("process", hook);
    });
    return processSpy;
  }

  const fsSpy = createFsSpy();
  const childProcessSpy = createChildProcessSpy();
  const processSpy = createProcessSpy();
  const originalGlobalFetch = typeof sandbox.fetch === "function";
  const originalGlobalXmlHttpRequest = typeof sandbox.XMLHttpRequest === "function";
  const originalGlobalWebSocket = typeof sandbox.WebSocket === "function";
  const originalHostFetch = typeof hostGlobal.fetch === "function";
  const originalHostXmlHttpRequest = typeof hostGlobal.XMLHttpRequest === "function";
  const originalHostWebSocket = typeof hostGlobal.WebSocket === "function";

  const fetchSpy = () => {
    counts.global.fetch += 1;
    throw new Error("Unexpected global fetch call in preview fixture");
  };
  patch(hostGlobal, "fetch", fetchSpy);
  patch(hostGlobal, "XMLHttpRequest", boundarySpy("global", "XMLHttpRequest"));
  patch(hostGlobal, "WebSocket", boundarySpy("global", "WebSocket"));
  patch(sandbox, "fetch", fetchSpy);
  patch(sandbox, "XMLHttpRequest", boundarySpy("global", "XMLHttpRequest"));
  patch(sandbox, "WebSocket", boundarySpy("global", "WebSocket"));
  patch(sandbox, "process", processSpy);
  patch(sandbox, "require", (request) => {
    requireRequests.push(request);
    if (request === "node:fs") return fsSpy;
    if (request === "node:child_process") return childProcessSpy;
    if (request === "node:process") return processSpy;
    if (request === "node:crypto" || request === "node:path") return require(request);
    if (request.startsWith("./") && request.endsWith(".js")) return require(path.join(ROOT, "SYSTEM/Views", request.slice(2)));
    throw new Error(`Unexpected module require in preview fixture: ${request}`);
  });

  return {
    available: {
      fetch: originalGlobalFetch,
      XMLHttpRequest: originalGlobalXmlHttpRequest,
      WebSocket: originalGlobalWebSocket,
      host_fetch: originalHostFetch,
      host_XMLHttpRequest: originalHostXmlHttpRequest,
      host_WebSocket: originalHostWebSocket,
      child_process: childProcessHooks.filter((hook) => typeof realChildProcess[hook] === "function"),
      process: Object.keys(counts.process),
      filesystem: [...filesystemHooks, ...filesystemPromiseHooks.map((hook) => `promises.${hook}`)],
    },
    requireRequests,
    snapshot() {
      return JSON.parse(JSON.stringify(counts));
    },
    restore() {
      if (wasRestored) return;
      for (const restoreAction of restoreActions.slice().reverse()) restoreAction();
      wasRestored = true;
    },
    restored() {
      return wasRestored;
    },
  };
}

function assertRuntimeSpiesZero(spies, phase) {
  const snapshot = spies.snapshot();
  assert.deepEqual(snapshot, {
    global: { fetch: 0, XMLHttpRequest: 0, WebSocket: 0 },
    child_process: Object.fromEntries(Object.keys(snapshot.child_process).map((hook) => [hook, 0])),
    process: Object.fromEntries(Object.keys(snapshot.process).map((hook) => [hook, 0])),
    filesystem: Object.fromEntries(Object.keys(snapshot.filesystem).map((hook) => [hook, 0])),
  }, `runtime boundary spies must remain zero after ${phase}`);
}

test("Given the isolated LLMWiki QA fixture, When its source contract is inspected, Then it exposes only the explicit preview review flow", () => {
  // Given: the fixture is a test-owned DataviewJS source, not a production object.
  assert.equal(fs.existsSync(FIXTURE_PATH), true, "QA fixture source must exist");
  const source = fs.readFileSync(FIXTURE_PATH, "utf8");

  // When: machine-consumed action, loading, packet, navigation, and reset markers are inspected.
  const prepareHandler = source.match(/prepareButton\.onclick\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\};\n\nstalePrepareButton\.onclick/u);

  // Then: packet creation and Hub handoff are gated by the visible action and remain preview-only.
  assert.match(source, /["']data-action["']\s*:\s*["']prepare-llmwiki-qa-packet["']/u);
  assert.ok(prepareHandler, "packet preparation must be inside the prepare button handler");
  assert.match(prepareHandler[1], /LLMWikiApprovalReviewView\.createSyntheticApprovalPacket\(\)/u);
  assert.match(prepareHandler[1], /createPacketBoundPreview\(packet\)/u);
  assert.match(prepareHandler[1], /KnowledgeExplorerHub\.approvalPacket\s*=\s*packet/u);
  assert.match(prepareHandler[1], /KnowledgeExplorerHub\.commitOptions\s*=\s*\{\s*preview:\s*true\s*\}/u);
  assert.match(prepareHandler[1], /KnowledgeExplorerHub\.buildCommitRequest\s*=\s*buildCommitRequest/u);
  assert.match(source, /const hubPath\s*=\s*["']HUB\/50 Knowledge\.md["']/u);
  assert.match(prepareHandler[1], /openKnowledgeHub\(\)/u);
  assert.match(source, /app\.vault\.getAbstractFileByPath\(modulePath\)/u);
  assert.match(source, /new Function\(await app\.vault\.read\(tFile\)\)/u);
  assert.match(source, /["']data-action["']\s*:\s*["']reset-llmwiki-qa-packet["']/u);
  assert.match(source, /delete\s+KnowledgeExplorerHub\.approvalPacket/u);
  assert.match(source, /delete\s+KnowledgeExplorerHub\.commitOptions/u);
  assert.doesNotMatch(source, /type\s*:\s*["']llmwiki["']/u);
  assert.doesNotMatch(source, /vault\.(create|modify|delete|rename)\s*\(/u);
  assert.match(source, /workspace\.getLeaf\([^)]*\)/u);
  assert.match(source, /\.openFile\(hubFile\)/u);
});

test("Given the isolated LLMWiki QA fixture, When the stale action is inspected, Then its current packet-bound preview adapter and reset markers are present", () => {
  // Given: the fixture source is the only operator entry point for the stale preview scenario.
  const source = fs.readFileSync(FIXTURE_PATH, "utf8");
  const stalePrepareHandler = source.match(/stalePrepareButton\.onclick\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\};\n\nresetButton\.onclick/u);

  // When: the stale action and its fixture-owned wrapper are inspected structurally.
  assert.match(source, /const\s+stalePrepareButton\s*=\s*container\.createEl\(\s*["']button["']/u);
  assert.match(source, /["']data-action["']\s*:\s*["']prepare-llmwiki-qa-stale-packet["']/u);
  assert.ok(stalePrepareHandler, "stale packet preparation must be inside its visible action handler");

  // Then: the stale fixture changes only its in-memory live target and reset owns its restoration.
  assert.match(stalePrepareHandler[1], /LLMWikiApprovalReviewView\.createSyntheticApprovalPacket\(\)/u);
  assert.match(stalePrepareHandler[1], /KnowledgeExplorerHub\.commitOptions\s*=\s*\{\s*preview:\s*true\s*\}/u);
  assert.match(stalePrepareHandler[1], /createPacketBoundPreview\(packet,\s*\{\s*stale:\s*true\s*\}\)/u);
  assert.match(stalePrepareHandler[1], /KnowledgeExplorerHub\.buildCommitRequest\s*=\s*buildCommitRequest/u);
  assert.match(source, /LLMWikiCanonicalPacket\.assembleCanonicalPacket/u);
  assert.match(source, /LLMWikiApprovalReviewCommit\.authorizeCanonicalPacket/u);
  assert.match(source, /LLMWikiApprovalReviewCommit\.buildCommitRequest/u);
  assert.match(source, /files\.set\(assembled\.value\.target_path,\s*["']QA stale collision bytes\\n["']\)/u);
  assert.doesNotMatch(source, /buildPreviewCommitRequest/u);
  assert.doesNotMatch(source, /canonical_revision\s*:/u);
  assert.match(stalePrepareHandler[1], /openKnowledgeHub\(\)/u);
  assert.match(source, /delete\s+KnowledgeExplorerHub\.buildCommitRequest/u);
  assert.match(source, /hasBuildCommitRequest/u);
  assert.match(source, /buildCommitRequest:\s*KnowledgeExplorerHub\.buildCommitRequest/u);
});

test("Given the stale QA action, When the real review view is approved, Then packet-bound live collision invalidates selection with no retry or write", async () => {
  const source = fs.readFileSync(FIXTURE_PATH, "utf8");
  const moduleSources = new Map(reviewModulePaths(source).map((modulePath) => [modulePath, fs.readFileSync(path.join(ROOT, modulePath), "utf8")]));
  const fixtureRoot = new FakeElement("section");
  const vaultReads = [];
  const vaultWrites = [];
  const openedFiles = [];
  const previousApprovalPacket = { sentinel: "approval-packet" };
  const previousCommitOptions = { preview: false };
  const previousBuildCommitRequest = () => ({ sentinel: "build-request" });
  const sandbox = {
    console,
    URL,
    URL,
    window: null,
    dv: { container: fixtureRoot },
    app: {
      vault: {
        getAbstractFileByPath(filePath) { return { path: filePath }; },
        async read(file) {
          vaultReads.push(file.path);
          const content = moduleSources.get(file.path);
          assert.ok(content, `fixture may only load listed review module: ${file.path}`);
          return content;
        },
        create() { vaultWrites.push("create"); },
        modify() { vaultWrites.push("modify"); },
        delete() { vaultWrites.push("delete"); },
        rename() { vaultWrites.push("rename"); },
        write() { vaultWrites.push("write"); }
      },
      workspace: {
        getLeaf() {
          return { async openFile(file) { openedFiles.push(file.path); } };
        }
      }
    },
    KnowledgeExplorerHub: {
      approvalPacket: previousApprovalPacket,
      commitOptions: previousCommitOptions,
      buildCommitRequest: previousBuildCommitRequest
    }
  };
  sandbox.window = sandbox;
  const spies = installRuntimeBoundarySpies(sandbox);
  const originalFunction = Object.getOwnPropertyDescriptor(sandbox, "Function");
  try {
    assert.equal(typeof sandbox.fetch, "function", "global fetch runtime spy must be installed before fixture execution");
    const context = vm.createContext(sandbox);
    sandbox.Function = function fixtureFunction(...args) {
      const body = args.pop() || "";
      return () => vm.runInContext(body, context, { filename: FIXTURE_PATH });
    };
    vm.runInContext(dataviewSource(source), context, { filename: FIXTURE_PATH });

    assert.match(collectText(fixtureRoot), /합성 컴포넌트 fixture/u);
    assert.match(collectText(fixtureRoot), /제품 E2E 증거로 사용할 수 없음/u);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.__llmwikiApprovalQaFixtureContract)), {
      fixture_kind: "synthetic_component",
      product_e2e_eligible: false,
    });

    const staleButton = findAction(fixtureRoot, "prepare-llmwiki-qa-stale-packet");
    assert.ok(staleButton, "stale packet button must be visible in the rendered fixture");
    await staleButton.onclick();
    assertRuntimeSpiesZero(spies, "prepare");

    const hub = sandbox.KnowledgeExplorerHub;
    assert.equal(hub.commitOptions.preview, true, collectText(fixtureRoot));
    assert.notEqual(hub.approvalPacket, previousApprovalPacket);
    assert.equal(typeof hub.buildCommitRequest, "function");
    assert.deepEqual(openedFiles, ["HUB/50 Knowledge.md"]);

    const packet = hub.approvalPacket;
    const selectedOperationId = packet.selection_allowlist[0];
    const approvalResult = sandbox.LLMWikiApprovalPacket.applyApprovalAction(packet, {
      action: "approve_selected",
      packet_hash: packet.packet_hash,
      selection_ids: [selectedOperationId]
    });
    assert.equal(approvalResult.ok, true, JSON.stringify(approvalResult));
    const calls = [];
    const commitApi = {
      ...sandbox.LLMWikiDeterministicCommit,
      commitApprovedCanonical(request, options) {
        calls.push({ request, options });
        return sandbox.LLMWikiDeterministicCommit.commitApprovedCanonical(request, options);
      }
    };
    const reviewRoot = new FakeElement("section");
    const reviewSurface = sandbox.LLMWikiApprovalReviewView.mountLlmWikiApprovalReview({
      container: reviewRoot,
      packet,
      approvalApi: sandbox.LLMWikiApprovalPacket,
      commitApi,
      buildCommitRequest: hub.buildCommitRequest,
      commitOptions: hub.commitOptions
    });
    findAction(reviewRoot, "open-review").onclick({ preventDefault() {} });
    findOperationInput(reviewRoot, selectedOperationId).onclick();
    findAction(reviewRoot, "approve-selected").onclick({ preventDefault() {} });
    assertRuntimeSpiesZero(spies, "selected approval");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].request.packet.operation.operation_id, selectedOperationId);
    assert.equal(calls[0].request.authorization.action, "approve_selected");
    assert.deepEqual(Array.from(calls[0].request.authorization.selection_set), [selectedOperationId]);
    assert.equal(calls[0].options.preview, true);
    assert.equal(findAction(reviewRoot, "retry-approval"), null);
    assert.ok(findAction(reviewRoot, "regenerate-packet"));
    assert.match(collectText(reviewRoot), /새 승인 패킷/u);
    assert.deepEqual(Array.from(reviewSurface.state().selectedIds), []);
    assert.equal(reviewSurface.state().authorizationInvalidated, true);

    findAction(fixtureRoot, "reset-llmwiki-qa-packet").onclick();
    assertRuntimeSpiesZero(spies, "reset");

    assert.equal(hub.approvalPacket, previousApprovalPacket);
    assert.equal(hub.commitOptions, previousCommitOptions);
    assert.equal(hub.buildCommitRequest, previousBuildCommitRequest);
    assert.equal(sandbox.__llmwikiApprovalQaFixtureState, undefined);
    assert.equal(vaultWrites.length, 0);
    assert.ok(vaultReads.length > 0);

    await staleButton.onclick();
    assertRuntimeSpiesZero(spies, "second prepare");
    const externalBuildCommitRequest = () => ({ sentinel: "external-build-request" });
    hub.buildCommitRequest = externalBuildCommitRequest;
    findAction(fixtureRoot, "reset-llmwiki-qa-packet").onclick();
    assertRuntimeSpiesZero(spies, "second reset");
    assert.equal(hub.buildCommitRequest, externalBuildCommitRequest, "reset must not overwrite a non-fixture wrapper installed after setup");
  } finally {
    spies.restore();
    if (originalFunction) Object.defineProperty(sandbox, "Function", originalFunction);
    else delete sandbox.Function;
  }
  assert.equal(spies.restored(), true, "all runtime boundary spies must restore in finally");
});

test("Given the QA fixture source, When reset and persistence boundaries are inspected, Then stale state is memory-only and no new type or Vault writer is introduced", () => {
  const source = fs.readFileSync(FIXTURE_PATH, "utf8");
  const resetBody = source.match(/const\s+resetQaState\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\};/u);
  assert.ok(resetBody, "fixture reset function must be explicit");
  assert.match(resetBody[1], /delete\s+KnowledgeExplorerHub\.approvalPacket/u);
  assert.match(resetBody[1], /delete\s+KnowledgeExplorerHub\.commitOptions/u);
  assert.match(resetBody[1], /delete\s+KnowledgeExplorerHub\.buildCommitRequest/u);
  assert.match(resetBody[1], /delete\s+window\[qaStateKey\]/u);
  assert.doesNotMatch(resetBody[1], /app\.vault/u);
  assert.doesNotMatch(source, /type\s*:\s*["']llmwiki["']/u);
  assert.doesNotMatch(source, /vault\.(create|modify|delete|rename|write|append)\s*\(/u);
});
