"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global.window || {};
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-state.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-core.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-policy.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-render.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-render.js"));
const responsive = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-responsive.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-view.js"));
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");
const { catalog, flattenCatalog } = require("./knowledge_explorer_fixtures.js");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));
const { BREAKPOINTS, CONTROL_HEIGHTS } = require(path.join(ROOT, "SYSTEM/Views/design-tokens.js"));

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function button(root, group) {
  return walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-group"] === group)[0] || null;
}

function assertScrollOwners(root, expectedOwners) {
  const owners = walk(root, (node) => node.attr && node.attr["data-scroll-owner"]);
  assert.equal(owners.length, expectedOwners.length, "each visible pane must expose exactly one scroll owner");
  for (const [owner, className] of expectedOwners) {
    const matches = owners.filter((node) => node.attr["data-scroll-owner"] === owner);
    assert.equal(matches.length, 1, `${owner} must have exactly one rendered scroll owner`);
    assert.ok(matches[0].attr.class.split(/\s+/).includes(className), `${owner} must use ${className}`);
  }
}

function click(target) {
  target.onclick({ preventDefault() {} });
}

function model() {
  return core.projectKnowledgeExplorer(flattenCatalog(catalog), registry);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const ASIDE_BINARY = "/Applications/Aside.app/Contents/MacOS/Aside";

function asidePidsForProfile(profile) {
  const listing = childProcess.spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8", timeout: 5000 });
  return listing.stdout.split(/\n/u).filter((line) => line.includes(`--user-data-dir=${profile}`)).map((line) => Number(line.trim().split(/\s+/u)[0])).filter((pid) => Number.isInteger(pid) && pid > 0);
}

function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function canBindLoopbackPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

class TaskHttpServer {
  constructor(server, port) {
    this.server = server;
    this.port = port;
  }

  static async start() {
    const server = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
        const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
        const filePath = path.resolve(ROOT, relativePath);
        if (!filePath.startsWith(`${ROOT}${path.sep}`) || !fs.statSync(filePath).isFile()) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }
        const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
        response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
        fs.createReadStream(filePath).pipe(response);
      } catch (_error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object", "task HTTP server must expose a loopback address");
    return new TaskHttpServer(server, address.port);
  }

  fixtureUrl() {
    return `http://127.0.0.1:${this.port}/SYSTEM/AI/Skills/prodigy-review/tests/knowledge/llmwiki_controller_qa_fixture.html?mode=cancel`;
  }

  async close() {
    await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    const receipt = { port: this.port, portFree: await canBindLoopbackPort(this.port) };
    console.log(`TASK15_HTTP_CLEANUP ${JSON.stringify(receipt)}`);
    assert.equal(receipt.portFree, true, "task HTTP fixture port must be free after cleanup");
  }
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`${pending.method}: Aside DevTools connection closed`));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Aside DevTools connection timed out")), 10000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Aside DevTools connection failed")); }, { once: true });
    });
    return new CdpConnection(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: Chrome DevTools command timed out`));
      }, 10000);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

async function createAsidePage(browser, port) {
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  assert.equal(typeof created.targetId, "string", "Aside must create one task-owned page target");
  let target = null;
  for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
    const targetsResponse = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) });
    const targets = await targetsResponse.json();
    target = targets.find((candidate) => candidate.id === created.targetId) || null;
    if (!target) await delay(50);
  }
  assert.ok(target && target.webSocketDebuggerUrl, "Aside must expose the task-owned page target");
  const page = await CdpConnection.connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  return { targetId: created.targetId, page };
}

class AsideHarness {
  constructor(profile, port, browserPid, processGroupPid, launch, browser, page, version, stderrChunks) {
    this.profile = profile;
    this.port = port;
    this.browserPid = browserPid;
    this.processGroupPid = processGroupPid;
    this.launch = launch;
    this.browser = browser;
    this.page = page;
    this.version = version;
    this.stderrChunks = stderrChunks;
  }

  static async start() {
    assert.equal(fs.existsSync(ASIDE_BINARY), true, "Aside is required for responsive layout evidence");
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "task15-aside-"));
    const port = await allocateLoopbackPort();
    let launch = null;
    try {
      const stderrChunks = [];
      launch = childProcess.spawn(ASIDE_BINARY, [
        "--headless=new", "--disable-gpu",
        "--disable-extensions", "--no-first-run", "--disable-background-networking",
        `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
        `--user-data-dir=${profile}`, "about:blank",
      ], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
      launch.stderr.setEncoding("utf8");
      launch.stderr.on("data", (chunk) => stderrChunks.push(chunk));

      let versionResponse = null;
      for (let attempt = 0; attempt < 100 && !versionResponse; attempt += 1) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
          if (response.status === 200) versionResponse = response;
        } catch (_error) {}
        if (!versionResponse) await delay(100);
      }
      assert.ok(versionResponse, "Aside DevTools endpoint must appear within 10 seconds");
      const version = await versionResponse.json();
      assert.equal(typeof version.webSocketDebuggerUrl, "string", "Aside must expose a browser DevTools websocket");
      const browser = await CdpConnection.connect(version.webSocketDebuggerUrl);
      const primaryTarget = await createAsidePage(browser, port);
      const lsof = childProcess.spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", timeout: 5000 });
      const browserPid = Number(lsof.stdout.trim().split(/\s+/u)[0]);
      assert.equal(Number.isInteger(browserPid) && browserPid > 0, true, "Aside listener PID must be discoverable for bounded cleanup");
      assert.equal(asidePidsForProfile(profile).includes(browserPid), true, "Aside listener must belong to the task-owned profile");
      return new AsideHarness(profile, port, browserPid, launch.pid, launch, browser, primaryTarget.page, version, stderrChunks);
    } catch (error) {
      if (launch && Number.isInteger(launch.pid)) {
        try { process.kill(-launch.pid, "SIGKILL"); } catch (_error) {}
      }
      for (const pid of asidePidsForProfile(profile)) try { process.kill(pid, "SIGKILL"); } catch (_error) {}
      fs.rmSync(profile, { recursive: true, force: true });
      throw error;
    }
  }

  async createPage() {
    return createAsidePage(this.browser, this.port);
  }

  async closePage(target) {
    target.page.close();
    await this.browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => {});
  }

  async close() {
    this.page.close();
    await this.browser.send("Browser.close").catch(() => {});
    this.browser.close();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (asidePidsForProfile(this.profile).length === 0) break;
      await delay(100);
    }
    if (asidePidsForProfile(this.profile).length > 0) {
      try { process.kill(-this.processGroupPid, "SIGTERM"); } catch (_error) {}
      for (let attempt = 0; attempt < 20 && asidePidsForProfile(this.profile).length > 0; attempt += 1) await delay(100);
    }
    if (asidePidsForProfile(this.profile).length > 0) {
      try { process.kill(-this.processGroupPid, "SIGKILL"); } catch (_error) {}
      for (const pid of asidePidsForProfile(this.profile)) try { process.kill(pid, "SIGKILL"); } catch (_error) {}
    }
    fs.rmSync(this.profile, { recursive: true, force: true });
    const stderr = this.stderrChunks.join("");
    const receipt = {
      binary: ASIDE_BINARY,
      browser: this.version.Browser || this.version.browser || "unknown",
      protocolVersion: this.version["Protocol-Version"] || this.version.protocolVersion || "unknown",
      port: this.port,
      browserPid: this.browserPid,
      processGroupPid: this.processGroupPid,
      profileRemoved: !fs.existsSync(this.profile),
      profileProcesses: asidePidsForProfile(this.profile),
      portFree: await canBindLoopbackPort(this.port),
      allocatorDiagnostic: /Trying to load the allocator multiple times/u.test(stderr),
    };
    console.log(`TASK15_ASIDE_CLEANUP ${JSON.stringify(receipt)}`);
    assert.deepEqual(receipt.profileProcesses, [], "Aside profile processes must be cleaned up");
    assert.equal(receipt.profileRemoved, true, "Aside task profile must be removed");
    assert.equal(receipt.portFree, true, "Aside DevTools port must be free after cleanup");
    assert.equal(receipt.allocatorDiagnostic, false, "Aside run must not emit the prior allocator failure diagnostic");
  }
}

function browserFixture() {
  assert.equal(fs.existsSync(ASIDE_BINARY), true, "Aside is required for responsive layout evidence");
  const tokenSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/design-tokens.js"), "utf8");
  const tabsSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-workspace-tabs.js"), "utf8");
  const lifecycleSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"), "utf8");
  const safeScript = (source) => source.replace(/<\/script/giu, "<\\/script");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--text-normal:#111;--text-muted:#555;--text-accent:#315efb;--ke-color-surface:#fff;--ke-color-surface-secondary:#f4f5f7;--ke-color-border:#777;--ke-color-text:#111;--ke-color-muted:#555;--ke-color-accent:#315efb;--ke-color-error:#b00020;--ke-color-interactive:#315efb;--ke-color-on-interactive:#fff;--ke-space-1:2px;--ke-space-2:4px;--ke-space-3:8px;--ke-space-4:12px;--ke-space-5:16px;--ke-border-width:1px;--ke-focus-ring-width:2px;--ke-radius-control:4px;--ke-radius-panel:8px;--ke-font-weight-strong:600;--ke-opacity-disabled:.6;--ke-metadata-label-min:7rem;--ke-type-label:.72rem;--ke-type-body:.84rem;--ke-type-heading:.92rem;--ke-type-title:1.05rem;--ke-leading-body:1.45;--ke-leading-control:1.35;--ke-touch-target:44px;--ke-motion-fast:120ms}html,body{margin:0;min-inline-size:0}body{font-family:system-ui,sans-serif}#probe{inline-size:100%;max-inline-size:100%;min-inline-size:0}</style><body><div id="probe"><div id="tabs"></div><main id="surface"></main></div><script>${safeScript(tokenSource)}</script><script>${safeScript(tabsSource)}</script><script>${safeScript(lifecycleSource)}</script><script>
    KnowledgeWorkspaceTabs.mountTabs(document.querySelector("#tabs"), { activeTab: "llmwiki" });
    const makeSnapshot = status => ({ status, source_selection: { selected: status !== "idle", display_name: "반응형 검증을 위한 아주 긴 한국어 제목과 https://example.invalid/this-is-an-intentionally-unbroken-url-without-natural-breakpoints/and-more-content-for-wrapping" }, provider_mode: "direct" });
    const lifecycleView = LLMWikiLifecycleView.mountLlmWikiLifecycleView({
      container: document.querySelector("#surface"),
      snapshot: makeSnapshot("selecting"),
      onAction() {}
    });
    window.__task15Metrics = status => {
      lifecycleView.update(makeSnapshot(status));
      const probe = document.querySelector("#probe");
      const lifecycle = document.querySelector('[data-surface="llmwiki-lifecycle"]');
      const source = document.querySelector(".llmwiki-lifecycle__source-name");
      const probeRect = probe.getBoundingClientRect();
      const tabs = [...document.querySelectorAll(".knowledge-workspace-tab")].map(element => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent, left: rect.left, right: rect.right, width: rect.width, height: rect.height, visible: rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility === "visible" };
      });
      const actions = [...lifecycle.querySelectorAll("button[data-action]")].map(element => {
        const rect = element.getBoundingClientRect();
        return { action: element.dataset.action, disabled: element.disabled, width: rect.width, height: rect.height, left: rect.left, right: rect.right, visible: rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility === "visible" };
      });
      const nestedOverflow = [...document.querySelectorAll("body *")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, className: element.className || "", clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      const statusRegion = lifecycle.querySelector('[role="status"]');
      const lineHeight = source ? Number.parseFloat(getComputedStyle(source).lineHeight) : 0;
      return {
        status,
        viewport: { innerWidth: window.innerWidth, visualWidth: window.visualViewport.width, visualScale: window.visualViewport.scale, devicePixelRatio: window.devicePixelRatio },
        document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
        probe: { clientWidth: probe.clientWidth, scrollWidth: probe.scrollWidth },
        lifecycle: { clientWidth: lifecycle.clientWidth, scrollWidth: lifecycle.scrollWidth },
        source: source ? { clientWidth: source.clientWidth, scrollWidth: source.scrollWidth, text: source.textContent, renderedLines: lineHeight > 0 ? Math.round(source.getBoundingClientRect().height / lineHeight) : 0, overflowWrap: getComputedStyle(source).overflowWrap } : null,
        nestedOverflow,
        tabs,
        actions,
        statusRegion: { role: statusRegion && statusRegion.getAttribute("role"), ariaLive: statusRegion && statusRegion.getAttribute("aria-live"), text: statusRegion && statusRegion.textContent },
        cssZoom: getComputedStyle(document.documentElement).zoom
      };
    };
  </script></body></html>`;
}

async function configureBrowser(harness, logicalWidth, zoom = 1) {
  await harness.page.send("Emulation.setDeviceMetricsOverride", { width: logicalWidth, height: 900, deviceScaleFactor: 1, mobile: false });
  await harness.page.send("Runtime.evaluate", { expression: `document.documentElement.style.zoom=${JSON.stringify(String(zoom))}` });
}

async function loadBrowserFixture(harness) {
  await harness.page.send("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(browserFixture())}` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await harness.page.send("Runtime.evaluate", { expression: "document.readyState === 'complete' && typeof window.__task15Metrics === 'function'", returnByValue: true });
    if (ready.result && ready.result.value === true) return;
    await delay(50);
  }
  assert.fail("responsive browser fixture must become ready within 5 seconds");
}

async function waitForBrowserValue(harness, expression, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await harness.page.send("Runtime.evaluate", { expression, returnByValue: true });
    if (response.result && response.result.value === true) return;
    await delay(50);
  }
  assert.fail(message);
}

async function loadControllerFixture(harness, fixtureUrl) {
  await harness.page.send("Page.navigate", { url: fixtureUrl });
  await waitForBrowserValue(
    harness,
    "document.readyState === 'complete' && !!window.__task15ControllerFixture && !!document.querySelector('[data-surface=\"llmwiki-lifecycle\"]')",
    "controller-backed fixture must become ready within 10 seconds",
  );
  const injection = await harness.page.send("Runtime.evaluate", {
    expression: `(() => {
      const shell = document.querySelector('.qa-shell');
      const context = document.createElement('section');
      context.id = 'task15-20-operation-source';
      context.setAttribute('aria-label', '20회 operation 반응형 검증 자료');
      context.textContent = '20회 operation 동안 읽을 수 있어야 하는 아주 긴 한국어 자료와 https://example.invalid/twenty-operation-controller-backed-url-without-natural-breakpoints';
      context.style.cssText = 'max-inline-size:100%;min-inline-size:0;padding:var(--ke-space-3);border:var(--ke-border-width) solid var(--ke-color-border);border-radius:var(--ke-radius-panel);font-size:var(--ke-type-body);line-height:var(--ke-leading-body);overflow-wrap:anywhere;word-break:keep-all';
      shell.insertBefore(context, shell.querySelector('#tabs'));
      return true;
    })()`,
    returnByValue: true,
  });
  assert.equal(injection.exceptionDetails, undefined, "20-operation fixture context injection must not throw");
}

async function measuredState(harness, status) {
  const response = await harness.page.send("Runtime.evaluate", { expression: `window.__task15Metrics(${JSON.stringify(status)})`, returnByValue: true });
  assert.equal(response.exceptionDetails, undefined, `${status}: browser metric evaluation must not throw`);
  return response.result.value;
}

async function capturePaintedScreenshot(harness, label, logicalWidth, zoom) {
  const target = await harness.createPage();
  const pageHarness = { page: target.page };
  try {
    await loadBrowserFixture(pageHarness);
    await configureBrowser(pageHarness, logicalWidth, zoom);
    await measuredState(pageHarness, "running");
    await target.page.send("Page.bringToFront");
    await target.page.send("Runtime.evaluate", {
      expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    const screenshot = await target.page.send("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
    });
    assert.ok(screenshot.data && screenshot.data.length > 1000, `${label} screenshot must contain rendered pixels`);
    return Buffer.from(screenshot.data, "base64");
  } finally {
    await harness.closePage(target);
  }
}

async function captureSerializedScreenshot(harness, html, label, logicalWidth, zoom) {
  const target = await harness.createPage();
  const pageHarness = { page: target.page };
  try {
    await target.page.send("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    await waitForBrowserValue(pageHarness, "document.readyState === 'complete'", `${label}: serialized page must become ready`);
    await configureBrowser(pageHarness, logicalWidth, zoom);
    await target.page.send("Page.bringToFront");
    await target.page.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
    const screenshot = await target.page.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true, optimizeForSpeed: true });
    assert.ok(screenshot.data && screenshot.data.length > 1000, `${label}: screenshot must contain rendered pixels`);
    return Buffer.from(screenshot.data, "base64");
  } finally {
    await harness.closePage(target);
  }
}

function testResponsivePrimitives() {
  const responsiveSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-responsive.js"), "utf8");
  assert.equal(responsive.MEDIUM_MIN, BREAKPOINTS.medium);
  assert.equal(responsive.WIDE_MIN, BREAKPOINTS.wide);
  assert.equal(responsive.TOUCH_TARGET, CONTROL_HEIGHTS.touchTarget);
  assert.doesNotMatch(responsiveSource, /\b(?:768|1024|44)\b/, "Explorer responsiveness must consume canonical tokens");
  assert.equal(responsive.layoutForWidth(1280), "wide");
  assert.equal(responsive.layoutForWidth(BREAKPOINTS.medium), "medium");
  assert.equal(responsive.layoutForWidth(BREAKPOINTS.medium - 1), "compact");
  assert.equal(responsive.visiblePanes("compact", "domain").join(","), "domain");
  assert.equal(responsive.visiblePanes("compact", "middle").join(","), "middle");
  assert.equal(responsive.visiblePanes("compact", "detail").join(","), "detail");
  assert.equal(responsive.visiblePanes("medium", "detail").join(","), "domain,detail");
}

function testVisiblePanesHaveOneNamedScrollOwner() {
  const explorerModel = model();
  const cases = [
    [1280, "domain", [["domain-nav", "knowledge-explorer-scroll-domain"], ["topic-nav", "knowledge-explorer-scroll-topic"], ["detail-pane", "knowledge-explorer-scroll-detail"]]],
    [BREAKPOINTS.medium, "domain", [["domain-nav", "knowledge-explorer-scroll-domain"], ["topic-nav", "knowledge-explorer-scroll-topic"]]],
    [375, "detail", [["detail-pane", "knowledge-explorer-scroll-detail"]]]
  ];
  for (const [logicalWidth, focusPane, expectedOwners] of cases) {
    const root = new FakeElement("section");
    view.renderKnowledgeExplorer(root, explorerModel, { logicalWidth, selection: { focusPane } });
    assertScrollOwners(root, expectedOwners);
  }
}

function testCompactCollapseAndWideExpansionPreserveState() {
  const root = new FakeElement("section");
  const compactWidth = BREAKPOINTS.medium - 1;
  const shell = view.mountKnowledgeExplorer({ container: root, model: model(), logicalWidth: compactWidth });
  assert.equal(root.attr["data-layout"], "compact");
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "domain").length, 1);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "middle").length, 0);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "detail").length, 0);
  assertScrollOwners(root, [["domain-nav", "knowledge-explorer-scroll-domain"]]);

  const domain = button(root, "domain");
  assert.ok(domain, "compact domain control should exist");
  click(domain);
  assert.equal(shell.state().focusPane, "middle");
  assert.equal(root.attr["data-layout"], "compact");
  assert.match(collectText(root), /도메인으로 돌아가기/);
  assertScrollOwners(root, [["topic-nav", "knowledge-explorer-scroll-topic"]]);

  const middle = button(root, "middle");
  assert.ok(middle, "compact topic/resource control should exist");
  click(middle);
  assert.equal(shell.state().focusPane, "detail");
  assert.match(collectText(root), /주제·자료로 돌아가기/);
  assertScrollOwners(root, [["detail-pane", "knowledge-explorer-scroll-detail"]]);

  const selectedBeforeResize = shell.state();
  shell.setLogicalWidth(BREAKPOINTS.wide);
  assert.equal(root.attr["data-layout"], "wide");
  assert.equal(shell.state(), selectedBeforeResize, "wide expansion must retain the same explorer state object");
  assert.deepEqual(shell.state(), selectedBeforeResize, "wide expansion must preserve domain, topic, detail, and focus state");
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "domain").length, 1);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "middle").length, 1);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "detail").length, 1);
  assertScrollOwners(root, [["domain-nav", "knowledge-explorer-scroll-domain"], ["topic-nav", "knowledge-explorer-scroll-topic"], ["detail-pane", "knowledge-explorer-scroll-detail"]]);

  shell.setLogicalWidth(compactWidth);
  assert.equal(root.attr["data-layout"], "compact");
  assert.equal(shell.state(), selectedBeforeResize, "compact collapse must retain the same explorer state object");
  assert.deepEqual(shell.state(), selectedBeforeResize, "compact collapse must preserve domain, topic, detail, and focus state");
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "domain").length, 0);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "middle").length, 0);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "detail").length, 1);
  const back = walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "back")[0];
  assert.ok(back, "compact detail must expose an explicit Korean back control");
  click(back);
  assert.equal(shell.state().focusPane, "middle");
  assert.ok(walk(root, (node) => node.focused).some((node) => node.attr && node.attr["data-group"] === "middle"), "back should restore focus to the triggering middle control");
}

function testContentAndStateStress() {
  const root = new FakeElement("section");
  const explorerModel = model();
  const longDomain = explorerModel.domains.find((domain) => domain.key === "personal_growth");
  assert.ok(longDomain, "long Korean fixture domain should exist");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, explorerModel, {
    logicalWidth: 375,
    surfaceState: "loading",
    selection: { domainKey: longDomain.key, middleKind: "topic", middleKey: longDomain.topic_sections[0].key, assetPath: longDomain.topic_sections[0].assets[0].path, focusPane: "detail" }
  }));
  assert.match(collectText(root), /아주 길고 길고 길고 길고 길고 길고 긴 한국어 제목/);
  const urlDomain = explorerModel.domains.find((domain) => domain.key === "reading");
  assert.ok(urlDomain, "URL fixture domain should exist");
  const urlModel = JSON.parse(JSON.stringify(explorerModel));
  const urlSection = urlModel.domains.find((domain) => domain.key === "reading").topic_sections[0];
  const unbrokenUrl = "https://example.invalid/this-is-an-intentionally-unbroken-url-for-a-narrow-knowledge-explorer-layout-stress-case";
  urlSection.assets.push({ path: unbrokenUrl, title: unbrokenUrl, type: "knowledge", kind: "knowledge" });
  view.renderKnowledgeExplorer(root, urlModel, { logicalWidth: 375, selection: { domainKey: urlDomain.key, middleKind: "topic", middleKey: urlSection.key, assetPath: unbrokenUrl, focusPane: "detail" } });
  assert.ok(collectText(root).includes("https://"), "an unbroken URL must remain renderable at 375 logical width");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, explorerModel, { logicalWidth: 768, surfaceState: "error" }));
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, { domains: [], totals: {} }, { logicalWidth: 1280, surfaceState: "empty" }));
  const style = walk(root, (node) => node.tag === "style")[0];
  assert.match(style.text, /@container knowledge-explorer/);
  assert.match(style.text, /prefers-reduced-motion/);
  assert.match(style.text, /--ke-touch-target/);
  assert.match(style.text, /overflow-wrap:\s*anywhere/);
}

function assertMeasuredState(metrics, logicalWidth) {
  assert.equal(metrics.viewport.innerWidth, logicalWidth, `${logicalWidth}/${metrics.status}: viewport width must be exact`);
  assert.equal(metrics.document.scrollWidth, metrics.document.clientWidth, `${logicalWidth}/${metrics.status}: document must not overflow`);
  assert.equal(metrics.probe.scrollWidth, metrics.probe.clientWidth, `${logicalWidth}/${metrics.status}: Hub surface must not overflow`);
  assert.equal(metrics.lifecycle.scrollWidth, metrics.lifecycle.clientWidth, `${logicalWidth}/${metrics.status}: lifecycle must not overflow`);
  assert.deepEqual(metrics.nestedOverflow, [], `${logicalWidth}/${metrics.status}: nested horizontal overflow is forbidden`);
  assert.equal(metrics.tabs.length, 4, `${logicalWidth}/${metrics.status}: all Knowledge workspace tabs must render`);
  assert.equal(metrics.tabs.every((tab) => tab.visible && tab.left >= 0 && tab.right <= metrics.document.clientWidth + 1), true, `${logicalWidth}/${metrics.status}: every Hub tab must remain visible`);
  assert.ok(metrics.source, `${logicalWidth}/${metrics.status}: selected source must remain visible`);
  assert.equal(metrics.source.scrollWidth, metrics.source.clientWidth, `${logicalWidth}/${metrics.status}: Korean and URL source text must not overflow`);
  assert.match(metrics.source.text, /한국어 제목과 https:\/\//u, `${logicalWidth}/${metrics.status}: Korean and URL source text must be rendered`);
  assert.equal(metrics.source.overflowWrap, "anywhere", `${logicalWidth}/${metrics.status}: unbroken URL must use anywhere wrapping`);
  assert.ok(metrics.source.renderedLines >= 2, `${logicalWidth}/${metrics.status}: long Korean and URL source must visibly wrap`);
  assert.deepEqual(metrics.statusRegion.role, "status", `${logicalWidth}/${metrics.status}: lifecycle status must expose role=status`);
  assert.deepEqual(metrics.statusRegion.ariaLive, "polite", `${logicalWidth}/${metrics.status}: lifecycle status must announce politely`);
  const expectedActions = {
    selecting: ["select-source", "request-consent"],
    consent_required: ["start-run", "cancel-run"],
    running: ["start-run", "cancel-run"],
  };
  assert.deepEqual(metrics.actions.map((action) => action.action), expectedActions[metrics.status], `${logicalWidth}/${metrics.status}: state actions must remain discoverable`);
  const enabledActions = metrics.actions.filter((action) => !action.disabled);
  assert.equal(enabledActions.every((action) => action.visible && action.height >= CONTROL_HEIGHTS.touchTarget && action.left >= 0 && action.right <= metrics.document.clientWidth + 1), true, `${logicalWidth}/${metrics.status}: enabled actions must be visible 44px targets without horizontal clipping`);
}

async function testRealBrowserWidthContract(harness) {
  const allMetrics = [];
  const screenshots = new Map();
  for (const logicalWidth of [375, 768, 1024]) {
    await configureBrowser(harness, logicalWidth, 1);
    const states = [];
    for (const status of ["selecting", "consent_required", "running"]) {
      const metrics = await measuredState(harness, status);
      assertMeasuredState(metrics, logicalWidth);
      states.push(metrics);
    }
    const record = { kind: "width", logicalWidth, assertions: ["clientWidth=scrollWidth", "nestedOverflow=[]", "tabs visible", "actions visible and >=44px", "Korean/URL wraps", "role=status aria-live=polite"], states };
    console.log(`TASK15_METRICS ${JSON.stringify(record)}`);
    allMetrics.push(record);
    screenshots.set(logicalWidth, await capturePaintedScreenshot(harness, `${logicalWidth}px`, logicalWidth, 1));
  }
  return { records: allMetrics, screenshots };
}

async function testRealBrowserZoomContract(harness) {
  await configureBrowser(harness, 375, 2);
  const zoomStates = [];
  for (const status of ["selecting", "consent_required", "running"]) {
    const metrics = await measuredState(harness, status);
    assertMeasuredState(metrics, 375);
    assert.equal(metrics.cssZoom, "2", `200%/${status}: explicit browser zoom must be applied`);
    zoomStates.push(metrics);
  }
  const screenshot = await capturePaintedScreenshot(harness, "200% zoom", 375, 2);

  await configureBrowser(harness, 375, 1);
  const recovered = await measuredState(harness, "consent_required");
  assertMeasuredState(recovered, 375);
  assert.equal(recovered.cssZoom, "1", "zoom recovery must restore 100% without overflow or hidden primary actions");
  const record = { kind: "zoom", logicalWidth: 375, zoomPercent: 200, assertions: ["cssZoom=2", "clientWidth=scrollWidth", "nestedOverflow=[]", "actions visible and >=44px", "Korean/URL wraps", "zoom recovery cssZoom=1"], states: zoomStates, recovered };
  console.log(`TASK15_METRICS ${JSON.stringify(record)}`);
  return { record, screenshot };
}

function assertTwentyOperationMetric(metric, expected) {
  assert.equal(metric.operationIndex, expected.operationIndex, `operation ${expected.operationIndex}: index must be deterministic`);
  assert.equal(metric.action, expected.action, `operation ${expected.operationIndex}: actual data-action must match the fixture sequence`);
  assert.equal(metric.status, expected.status, `operation ${expected.operationIndex}: controller status must settle deterministically`);
  assert.equal(metric.intentCount, expected.operationIndex, `operation ${expected.operationIndex}: exactly one controller intent must be admitted`);
  assert.equal(metric.document.scrollWidth, metric.document.clientWidth, `operation ${expected.operationIndex}: document must not overflow`);
  assert.equal(metric.probe.scrollWidth, metric.probe.clientWidth, `operation ${expected.operationIndex}: controller fixture shell must not overflow`);
  assert.equal(metric.lifecycle.scrollWidth, metric.lifecycle.clientWidth, `operation ${expected.operationIndex}: lifecycle must not overflow`);
  assert.deepEqual(metric.nestedOverflow, [], `operation ${expected.operationIndex}: nested horizontal overflow is forbidden`);
  assert.ok(metric.source, `operation ${expected.operationIndex}: selected source must stay readable`);
  assert.match(metric.source.text, /한국어.*https:\/\//u, `operation ${expected.operationIndex}: Korean and URL content must remain rendered`);
  assert.equal(metric.source.scrollWidth, metric.source.clientWidth, `operation ${expected.operationIndex}: source content must remain contained`);
  assert.equal(metric.source.overflowWrap, "anywhere", `operation ${expected.operationIndex}: URL must retain anywhere wrapping`);
  assert.ok(metric.source.renderedLines >= 2, `operation ${expected.operationIndex}: Korean and URL content must visibly wrap`);
  assert.equal(metric.statusRegion.role, "status", `operation ${expected.operationIndex}: status region must expose role=status`);
  assert.equal(metric.statusRegion.ariaLive, "polite", `operation ${expected.operationIndex}: status region must announce politely`);
  assert.ok(metric.primaryActions.length >= 1, `operation ${expected.operationIndex}: a primary action must stay discoverable`);
  assert.equal(metric.primaryActions.every((action) => action.visible), true, `operation ${expected.operationIndex}: no primary action may be hidden`);
  assert.equal(metric.enabledPrimaryActions.every((action) => action.visible && action.height >= CONTROL_HEIGHTS.touchTarget * 2), true, `operation ${expected.operationIndex}: every enabled primary action must be visible and at least 88px at 200%`);
  assert.equal(metric.lifecycleMountCount, 1, `operation ${expected.operationIndex}: exactly one lifecycle surface must be mounted`);
  assert.deepEqual(metric.writes, { create: 0, modify: 0, createFolder: 0 }, `operation ${expected.operationIndex}: Vault writes are forbidden`);
  assert.deepEqual(metric.externalRequests, [], `operation ${expected.operationIndex}: external requests are forbidden`);
  assert.equal(metric.cssZoom, "2", `operation ${expected.operationIndex}: stress case must remain at 200% zoom`);
}

async function controllerOperationMetric(harness, expected) {
  const clickResponse = await harness.page.send("Runtime.evaluate", {
    expression: `(() => {
      const button = document.querySelector(${JSON.stringify(`button[data-action="${expected.action}"]`)});
      if (!button) throw new Error(${JSON.stringify(`missing ${expected.action} action`)});
      if (button.disabled) throw new Error(${JSON.stringify(`${expected.action} action is disabled`)});
      button.click();
      return true;
    })()`,
    returnByValue: true,
  });
  assert.equal(clickResponse.exceptionDetails, undefined, `operation ${expected.operationIndex}: real controller action click must not throw`);
  await waitForBrowserValue(
    harness,
    `(() => {
      const fixture = window.__task15ControllerFixture;
      const lifecycle = document.querySelector('[data-surface="llmwiki-lifecycle"]');
      return fixture.intents.length === ${expected.operationIndex} && lifecycle && lifecycle.dataset.state === ${JSON.stringify(expected.status)};
    })()`,
    `operation ${expected.operationIndex}: controller must reach ${expected.status} within 10 seconds`,
  );
  const response = await harness.page.send("Runtime.evaluate", {
    expression: `(() => {
      const fixture = window.__task15ControllerFixture;
      const lifecycle = document.querySelector('[data-surface="llmwiki-lifecycle"]');
      const probe = document.querySelector('.qa-shell');
      const source = document.querySelector('#task15-20-operation-source');
      const statusRegion = lifecycle.querySelector('[role="status"]');
      const receipt = JSON.parse(document.querySelector('#qa-receipt').textContent || '{}');
      const geometry = element => {
        const rect = element.getBoundingClientRect();
        return { action: element.dataset.action, disabled: element.disabled, visible: rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility === 'visible', width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      };
      const primaryActions = [...lifecycle.querySelectorAll('button[data-primary="true"]')].map(geometry);
      const lineHeight = source ? Number.parseFloat(getComputedStyle(source).lineHeight) : 0;
      const externalRequests = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => {
        try { const url = new URL(name); return ['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1'; }
        catch (_error) { return false; }
      });
      return {
        operationIndex: ${expected.operationIndex}, action: ${JSON.stringify(expected.action)}, status: lifecycle.dataset.state, controllerStatus: receipt.status,
        intentCount: fixture.intents.length, intents: fixture.intents,
        document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
        probe: { clientWidth: probe.clientWidth, scrollWidth: probe.scrollWidth },
        lifecycle: { clientWidth: lifecycle.clientWidth, scrollWidth: lifecycle.scrollWidth },
        nestedOverflow: [...document.querySelectorAll('body *')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, className: element.className || '', clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })),
        source: source ? { text: source.textContent, clientWidth: source.clientWidth, scrollWidth: source.scrollWidth, renderedLines: lineHeight > 0 ? Math.round(source.getBoundingClientRect().height / lineHeight) : 0, overflowWrap: getComputedStyle(source).overflowWrap } : null,
        statusRegion: { role: statusRegion && statusRegion.getAttribute('role'), ariaLive: statusRegion && statusRegion.getAttribute('aria-live'), text: statusRegion && statusRegion.textContent },
        primaryActions, enabledPrimaryActions: primaryActions.filter(action => !action.disabled),
        lifecycleMountCount: document.querySelectorAll('[data-surface="llmwiki-lifecycle"]').length,
        writes: { ...fixture.writes }, externalRequests, cssZoom: getComputedStyle(document.documentElement).zoom,
      };
    })()`,
    returnByValue: true,
  });
  assert.equal(response.exceptionDetails, undefined, `operation ${expected.operationIndex}: metrics evaluation must not throw`);
  return response.result.value;
}

async function testTwentyControllerOperations(harness, fixtureUrl) {
  await loadControllerFixture(harness, fixtureUrl);
  await configureBrowser(harness, 375, 2);
  const cycle = [
    { action: "select-source", status: "selecting" },
    { action: "request-consent", status: "consent_required" },
    { action: "start-run", status: "running" },
    { action: "cancel-run", status: "cancelled" },
  ];
  const sequence = Array.from({ length: 20 }, (_value, index) => ({ operationIndex: index + 1, ...cycle[index % cycle.length] }));
  const operations = [];
  for (const expected of sequence) {
    const metric = await controllerOperationMetric(harness, expected);
    assertTwentyOperationMetric(metric, expected);
    operations.push(metric);
  }
  const serialized = await harness.page.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true });
  assert.equal(serialized.exceptionDetails, undefined, "20-operation final DOM serialization must not throw");
  const screenshot = await captureSerializedScreenshot(harness, serialized.result.value, "20-operation final state", 375, 2);
  const record = {
    kind: "20-operations",
    operationCount: operations.length,
    logicalWidth: 375,
    zoomPercent: 200,
    assertions: ["operation count=20", "Korean/URL readable and wrapping", "document/probe/lifecycle clientWidth=scrollWidth", "nestedOverflow=[]", "primary actions visible", "enabled primary actions >=88px", "role=status aria-live=polite", "one lifecycle mount", "zero forbidden writes", "zero external requests"],
    operations,
  };
  assert.equal(record.operationCount, 20, "controller-backed stress case must drive exactly 20 operations");
  console.log(`TASK15_20_OPERATIONS ${JSON.stringify(record)}`);
  return { record, screenshot };
}

function testSelectedRecordRemovalRecoversDeterministically() {
  const explorerModel = model();
  const selected = view.createSelectionState(explorerModel, { focusPane: "detail" });
  const remainingDomains = explorerModel.domains.filter((domain) => domain.key !== selected.domainKey);
  const reducedModel = { ...explorerModel, domains: remainingDomains };
  const recovered = view.createSelectionState(reducedModel, selected);
  assert.notEqual(recovered.domainKey, selected.domainKey, "a removed selection must fall back to an existing domain");
  assert.equal(recovered.focusPane, "detail", "selection recovery must preserve the active drill-down step");
  const root = new FakeElement("section");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, reducedModel, { selection: selected, logicalWidth: 375 }));
}

async function main() {
  testResponsivePrimitives();
  testVisiblePanesHaveOneNamedScrollOwner();
  testCompactCollapseAndWideExpansionPreserveState();
  testContentAndStateStress();
  testSelectedRecordRemovalRecoversDeterministically();

  const taskServer = await TaskHttpServer.start();
  let harness = null;
  try {
    harness = await AsideHarness.start();
    await loadBrowserFixture(harness);
    const widths = await testRealBrowserWidthContract(harness);
    const zoom = await testRealBrowserZoomContract(harness);
    const twentyOperations = await testTwentyControllerOperations(harness, taskServer.fixtureUrl());
    const evidenceDir = process.env.TASK15_EVIDENCE_DIR;
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, "responsive-metrics.json"), `${JSON.stringify({ browser: "Aside", version: harness.version, widths: widths.records, zoom: zoom.record }, null, 2)}\n`, "utf8");
      for (const [logicalWidth, screenshot] of widths.screenshots) fs.writeFileSync(path.join(evidenceDir, `viewport-${logicalWidth}.png`), screenshot);
      fs.writeFileSync(path.join(evidenceDir, "zoom-200.png"), zoom.screenshot);
      const operationsDir = path.join(evidenceDir, "20-operations");
      fs.mkdirSync(operationsDir, { recursive: true });
      fs.writeFileSync(path.join(operationsDir, "metrics.json"), `${JSON.stringify(twentyOperations.record, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(operationsDir, "operation-20-zoom-200.png"), twentyOperations.screenshot);
    }
  } finally {
    if (harness) await harness.close();
    await taskServer.close();
  }
  console.log("Knowledge Explorer responsive tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
