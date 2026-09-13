#!/usr/bin/env node
"use strict";

// Native-only final-flow QA. No product API actions, fake Dataview, credentials,
// provider consent, or live-vault cleanup. CDP is inspection/subscription only.
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { Cdp, allocatePort, extractBlocks } = require("../shared/real_obsidian_harness.js");
const { sourceFixture, sha256 } = require("./llmwiki_proposal_fixtures.js");
const ROOT = fs.realpathSync(path.resolve(__dirname, "../../../../../.."));
const APP = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const HEAD = "2d2b62cb5bb76b034015d9e7737b148a46393d59";
const SOURCE = "INBOX/QA/Album-A.md";
const PRIVATE = "INBOX/Private/QA.md";
const RUN = "ex-20260911T075624Z-62a070ef";
const SCENARIOS = Array.from({ length: 12 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`);
const FILES = ["actions.json", "before.json", "after.json", "screenshot.png", "result.json", "cleanup.json"];
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
function scenarioId(value) {
  assert.ok(SCENARIOS.includes(value), `LW_SCENARIO missing or unknown: ${value || "<missing>"}`);
  assert.equal(value, "S01", `${value}: NOT_YET_IMPLEMENTED (not a pass)`);
  return value;
}
function bounded(label, subscribe, milliseconds = 15000) {
  return new Promise((resolve, reject) => {
    let dispose = () => {};
    const timer = setTimeout(() => { dispose(); reject(new Error(`BLOCKED: ${label} timeout`)); }, milliseconds);
    const finish = (error, result) => { clearTimeout(timer); dispose(); error ? reject(error) : resolve(result); };
    dispose = subscribe(value => finish(null, value), error => finish(error)) || (() => {});
  });
}
function raw(command, args) {
  const result = cp.spawnSync(command, args, { encoding: "utf8", timeout: 15000, env: { ...process.env, LC_ALL: "C" } });
  if (result.error) throw result.error;
  return result;
}
function processes() {
  const result = raw("/bin/ps", ["-axo", "pid=,ppid=,pgid=,lstart=,command="]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/u);
    return match ? [{ pid: +match[1], ppid: +match[2], pgid: +match[3], start: match[4], command: match[5] }] : [];
  });
}
function sameProcess(a, b) { return Boolean(a && b && a.pid === b.pid && a.start === b.start && a.command === b.command); }
function safePath(value, runtime) {
  const actual = fs.realpathSync(value);
  assert.notEqual(actual, ROOT, "REFUSE_DUSK");
  assert.ok(!actual.startsWith(ROOT + path.sep), "REFUSE_PATH_INSIDE_DUSK");
  assert.ok(actual === runtime || actual.startsWith(runtime + path.sep), "REFUSE_UNOWNED_REALPATH");
  assert.equal(actual, path.resolve(value), "REFUSE_SYMLINK_PATH");
  return actual;
}
function duskInventory() {
  // Track bytes, not mtimes. Evidence/agent metadata and this authorized test
  // entry are excluded; existing untracked user notes remain in the digest.
  const entries = [];
  function walk(dir, relative = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if ([".git", ".omo"].includes(name) || path.join(ROOT, name) === __filename) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) entries.push([name, "symlink", fs.readlinkSync(file)]);
      else if (entry.isDirectory()) walk(file, name);
      else if (entry.isFile()) entries.push([name, sha256(fs.readFileSync(file))]);
    }
  }
  walk(ROOT);
  return { digest: sha256(JSON.stringify(entries)), files: entries.length, entries };
}
class NativeQA {
  constructor(evidence) {
    this.evidence = evidence; this.actions = []; this.connections = []; this.commands = [];
    this.owner = { schema: "llmwiki-native-owner-v1", scenario: "S01", token: crypto.randomUUID(), runtime: null, paths: [], pids: [], ports: [], cleanup_todo: "not_created" };
    this.protected = processes().filter(row => row.command.startsWith("/Applications/Obsidian.app/"));
  }
  record(type, value = {}) { this.actions.push({ sequence: this.actions.length + 1, at: new Date().toISOString(), type, ...value }); json(path.join(this.evidence, "actions.json"), this.actions); }
  receipt() {
    json(path.join(this.evidence, "ownership.json"), this.owner);
    if (this.owner.runtime) json(path.join(this.owner.runtime, "ownership.json"), this.owner);
  }
  command(command, args, options = {}) {
    const line = [command, ...args].map(quote).join(" ");
    const result = cp.spawnSync(command, args, { encoding: "utf8", timeout: 15000, cwd: this.owner.runtime || ROOT, env: this.env || process.env, ...options });
    const entry = { command: line, args, pid: result.pid, exit: result.status, signal: result.signal, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error?.message || null };
    this.commands.push(entry); this.record("command", entry);
    if (result.error) throw new Error(`BLOCKED: ${line}: ${result.error.message}`);
    return entry;
  }
  ownTree() {
    if (!this.launch) return [];
    const rows = processes(), root = rows.find(row => row.pid === this.launch.pid);
    if (root) {
      assert.equal(root.pgid, root.pid, "native process must own its process group");
      assert.ok(root.command.includes(`--user-data-dir=${this.profile}`));
      assert.ok(root.command.includes(`--lw-owner=${this.owner.token}`));
      const owned = new Set([root.pid]);
      let changed = true;
      while (changed) { changed = false; for (const row of rows) if (owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; } }
      for (const row of rows.filter(row => owned.has(row.pid))) {
        assert.ok(!this.protected.some(item => item.pid === row.pid), "REFUSE_PROTECTED_PID");
        const prior = this.owner.pids.find(item => item.pid === row.pid);
        if (prior) assert.ok(sameProcess(prior, row), "REFUSE_REUSED_PID");
        else this.owner.pids.push(row);
      }
    }
    this.receipt(); return rows;
  }
  setup() {
    if (process.env.LW_QA_PATH && fs.existsSync(process.env.LW_QA_PATH)) {
      assert.notEqual(fs.realpathSync(process.env.LW_QA_PATH), ROOT, "REFUSE_DUSK");
      throw new Error("BLOCKED: LW_QA_PATH must be newly runner-owned, not an existing path");
    }
    const runtime = fs.realpathSync(fs.mkdtempSync("/private/tmp/llmwiki-S01-"));
    this.owner.runtime = runtime; this.owner.paths.push(runtime); this.owner.cleanup_todo = "open:S01:dispose-exact-owned-handles"; this.receipt();
    this.vault = path.join(runtime, "LLMWiki-S01-QA"); this.profile = path.join(runtime, "profile");
    const home = path.join(runtime, "home"), temp = path.join(runtime, "tmp");
    for (const dir of [this.vault, this.profile, home, temp]) { fs.mkdirSync(dir); this.owner.paths.push(safePath(dir, runtime)); this.receipt(); }
    this.env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: home, TMPDIR: temp, XDG_CONFIG_HOME: this.profile, LC_ALL: "C" };
    const put = (relative, bytes) => { const target = path.join(this.vault, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); };
    const copy = (from, relative) => put(relative, fs.readFileSync(path.join(ROOT, from)));
    copy("HUB/50 Knowledge.md", "HUB/50 Knowledge.md");
    for (const name of fs.readdirSync(path.join(ROOT, "SYSTEM/Views"))) if (name.endsWith(".js")) copy(`SYSTEM/Views/${name}`, `SYSTEM/Views/${name}`);
    for (const name of ["main.js", "manifest.json"]) copy(`SYSTEM/Plugins/prodigy-llm-wiki/${name}`, `.obsidian/plugins/prodigy-llm-wiki/${name}`);
    for (const name of ["main.js", "manifest.json", "styles.css"]) copy(`.obsidian/plugins/dataview/${name}`, `.obsidian/plugins/dataview/${name}`);
    put(".obsidian/plugins/dataview/data.json", JSON.stringify({ enableDataviewJs: true, enableInlineDataviewJs: true }));
    put(".obsidian/community-plugins.json", JSON.stringify(["dataview", "prodigy-llm-wiki"]));
    put(".obsidian/app.json", JSON.stringify({ promptDelete: true, defaultViewMode: "preview" }));
    put(".obsidian/core-plugins.json", JSON.stringify(["file-explorer", "command-palette"]));
    const fixture = sourceFixture("qa-album-a", "# QA Album A\n\n## Layout\n\nKeep paired album photographs at the same eye height. Check the horizon before placing a two-page spread.\n\n## Export\n\nKeep an untouched source copy and export a separate review copy.\n");
    this.source = { path: SOURCE, content_hash: sha256(fixture.outbound_text), synthetic: true };
    put(SOURCE, fixture.outbound_text);
    put(PRIVATE, "---\nprivacy: private\n---\n# Synthetic protected QA\n\nPRIVATE_QA_SENTINEL: never selectable or sent.\n");
    json(path.join(this.evidence, "fixtures.json"), { source: this.source, body: fixture.outbound_text, protected_path: PRIVATE, protected_hash: sha256(fs.readFileSync(path.join(this.vault, PRIVATE))) });
    json(path.join(this.profile, "obsidian.json"), { vaults: { [this.owner.token.replaceAll("-", "").slice(0, 16)]: { path: this.vault, ts: Date.now(), open: true } }, updateDisabled: true, cli: true });
    this.record("fixture-created", { vault: this.vault, profile: this.profile, source: this.source, real_dataview: true, fake_processor: false, credential_files_copied: 0 });
  }
  async evaluate(expression) {
    const value = await this.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || JSON.stringify(value.exceptionDetails));
    return value.result.value;
  }
  async arm(predicate, label, event = "click", selector = null) {
    const result = await this.evaluate(`(()=>{const predicate=()=>(${predicate}),label=${JSON.stringify(label)},selector=${JSON.stringify(selector)};let observer,timer,triggered=false;const promise=new Promise(resolve=>{const cleanup=()=>{observer.disconnect();clearTimeout(timer);document.removeEventListener(${JSON.stringify(event)},onEvent,true)},finish=()=>{if(!predicate())return;cleanup();resolve({ok:true,label,triggered})},onEvent=e=>{if(!selector||e.target.closest?.(selector)){triggered=e.isTrusted;queueMicrotask(finish)}};observer=new MutationObserver(finish);observer.observe(document,{childList:true,subtree:true,attributes:true,characterData:true});document.addEventListener(${JSON.stringify(event)},onEvent,true);timer=setTimeout(()=>{cleanup();resolve({ok:false,label,reason:'exact-state-timeout',triggered})},15000);finish()});window.__lwQAWait=promise;return{armed:true,label}})()`);
    this.record("subscribe-before-trigger", result);
  }
  async settled() { const result = await this.evaluate("window.__lwQAWait"); this.record("state-event", result); assert.ok(result.ok, `BLOCKED: ${result.label}: ${result.reason}`); return result; }
  async click(selector, predicate, label) {
    await this.arm(predicate, label, "click", selector);
    const bounds = await this.evaluate(`(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&!n.disabled});if(nodes.length!==1)throw new Error('ACTUAL_CONTROL_COUNT:'+nodes.length+':'+${JSON.stringify(selector)});const n=nodes[0];n.scrollIntoView({block:'center',behavior:'instant'});const b=n.getBoundingClientRect();if(b.top<0||b.bottom>innerHeight)throw new Error('CONTROL_OUTSIDE_VIEWPORT');return{x:Math.round(screenX+b.x+b.width/2),y:Math.round(screenY+(outerHeight-innerHeight)+b.y+b.height/2),label:n.textContent,selector:${JSON.stringify(selector)}}})()`);
    this.record("native-control-bounds", bounds);
    const script = `tell application "System Events"\nset p to first application process whose unix id is ${this.launch.pid}\nset frontmost of p to true\ntell p to click at {${bounds.x}, ${bounds.y}}\nend tell`;
    const result = this.command("/usr/bin/osascript", ["-e", script]);
    assert.equal(result.exit, 0, `BLOCKED: System Events: ${result.stderr}`);
    return this.settled();
  }
  async start() {
    this.port = await allocatePort(); this.owner.ports.push(this.port); this.receipt();
    const args = [`--user-data-dir=${this.profile}`, `--remote-debugging-port=${this.port}`, "--remote-debugging-address=127.0.0.1", `--lw-owner=${this.owner.token}`, "--use-mock-keychain", "--disable-background-networking", "--disable-component-update", "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1, EXCLUDE localhost", this.vault];
    this.record("native-launch", { command: [APP, ...args].map(quote).join(" "), env: this.env });
    this.launch = cp.spawn(APP, args, { detached: true, env: this.env, cwd: this.owner.runtime, stdio: ["ignore", "pipe", "pipe"] });
    // Listen to exact endpoint publication before any asynchronous launch work.
    const endpointPromise = bounded("native DevTools endpoint", (resolve, reject) => {
      let stderr = "";
      const data = chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/\S+)/u); if (match) resolve(match[1]); };
      const exit = (code, signal) => reject(new Error(`BLOCKED: native launch exited ${code}/${signal}: ${stderr}`));
      this.launch.stderr.on("data", data); this.launch.once("error", reject); this.launch.once("exit", exit);
      return () => { this.launch.stderr.off("data", data); this.launch.off("error", reject); this.launch.off("exit", exit); };
    }, 30000);
    this.ownTree();
    const endpoint = await endpointPromise;
    assert.ok(endpoint.startsWith(`ws://127.0.0.1:${this.port}/`));
    const browser = await Cdp.connect(endpoint); this.connections.push(browser);
    const targetPromise = bounded("native page target", (resolve, reject) => {
      const off = browser.on("Target.targetCreated", value => { if (value.targetInfo.type === "page") resolve(value.targetInfo); });
      browser.send("Target.setDiscoverTargets", { discover: true }).catch(reject); return off;
    });
    const target = await targetPromise;
    this.cdp = await Cdp.connect(`ws://127.0.0.1:${this.port}/devtools/page/${target.targetId}`); this.connections.push(this.cdp);
    await this.cdp.send("Runtime.enable"); await this.cdp.send("Page.enable");
    await this.arm("globalThis.app && app.workspace && app.vault?.adapter?.getBasePath", "native-app-ready"); await this.settled();
    const identity = await this.evaluate("({vault:app.vault.adapter.getBasePath(),name:app.vault.getName(),plugins:Object.keys(app.plugins.plugins)})");
    assert.equal(fs.realpathSync(identity.vault), this.vault, "REFUSE_WRONG_VAULT"); this.record("native-identity", identity);
    this.help = this.cli(["help"]);
    this.record("native-help-capabilities", { command: /\bcommand\b/u.test(this.help.stdout), screenshot: this.help.stdout.includes("dev:screenshot"), errors: this.help.stdout.includes("dev:errors"), exit: this.help.exit });
    await this.arm("document.querySelector('.mod-trust-folder') || (app.plugins.getPlugin('dataview') && app.plugins.getPlugin('prodigy-llm-wiki'))", "owned-trust-or-plugins"); await this.settled();
    if (await this.evaluate("!!document.querySelector('.mod-trust-folder')")) await this.click(".mod-trust-folder > .modal-button-container > button:not(.mod-cancel)", "!document.querySelector('.mod-trust-folder')", "owned-vault-trust-removed");
    await this.arm("app.plugins.getPlugin('dataview') && app.plugins.getPlugin('prodigy-llm-wiki')", "real-plugins-ready"); await this.settled();
    this.record("native-plugin-versions", await this.evaluate("({dataview:app.plugins.getPlugin('dataview').manifest.version,wiki:app.plugins.getPlugin('prodigy-llm-wiki').manifest.version})"));
  }
  cli(args) { return this.command(APP, [`--user-data-dir=${this.profile}`, `vault=${path.basename(this.vault)}`, ...args]); }
  async snapshot() {
    if (!this.cdp) return { status: "NOT_RUN", reason: "native inspection not attached" };
    return this.evaluate(`(()=>{const hub=window.KnowledgeExplorerHub,snapshot=hub?.llmWikiLifecycleSnapshot?.();return{vault:app?.vault?.adapter?.getBasePath?.(),active_file:app?.workspace?.getActiveFile?.()?.path,source:snapshot?.prodigy_wiki?.source,range:snapshot?.prodigy_wiki?.range,status:snapshot?.status,golden_status:snapshot?.golden_wiki?.status,provider_selection_error:snapshot?.provider_selection_error,review_reached:!!document.querySelector('.llmwiki-document-review'),controls:[...document.querySelectorAll('[data-action],[data-source-option],[data-select-range-id]')].map(n=>({action:n.dataset.action,source:n.dataset.sourceOption,range:n.dataset.selectRangeId,disabled:n.disabled})),text:document.querySelector('#knowledge-panel-llmwiki')?.innerText||document.querySelector('.modal')?.innerText||''}})()`);
  }
  async screenshot() {
    if (!this.cdp) return { status: "NOT_RUN", reason: "no owned native page" };
    const file = path.join(this.evidence, "screenshot.png");
    let bytes, method;
    if (this.help?.stdout.includes("dev:screenshot")) {
      const native = this.cli(["dev:screenshot", `path=${file}`]);
      if (native.exit === 0 && fs.existsSync(file)) { bytes = fs.readFileSync(file); method = "installed native dev:screenshot"; }
      else this.record("native-screenshot-unavailable", native);
    }
    if (!bytes) {
      const result = await this.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      bytes = Buffer.from(result.data, "base64"); fs.writeFileSync(file, bytes); method = "native Electron CDP Page.captureScreenshot";
    }
    const receipt = { method, sha256: sha256(bytes), bytes: bytes.length };
    this.record("screenshot", receipt); return receipt;
  }
  async s01() {
    await this.start();
    const help = this.help;
    assert.equal(help.exit, 0, `BLOCKED: installed app help: ${help.stderr || help.stdout}`);
    assert.ok(/\bcommand\b/u.test(help.stdout), "BLOCKED: native command unavailable in installed help");
    await this.arm("document.querySelector('#knowledge-panel-llmwiki [data-action=select-source]')", "native-organizer-entry");
    const entry = this.cli(["command", "id=prodigy-llm-wiki:open-wiki-organizer"]);
    assert.equal(entry.exit, 0, `BLOCKED: native entry: ${entry.stdout} ${entry.stderr}`); await this.settled();
    await this.click('#knowledge-panel-llmwiki [data-action="select-source"]', "document.querySelector('[data-source-choices]')", "source-picker-open");
    const options = await this.evaluate("[...document.querySelectorAll('[data-source-option]')].map(n=>n.dataset.sourceOption)");
    assert.ok(options.includes(SOURCE), "fixture source missing from actual picker"); assert.ok(!options.includes(PRIVATE), "protected fixture selectable");
    this.record("source-options", { options, protected_selectable: false });
    await this.click(`[data-source-option="${SOURCE}"]`, `document.querySelector('[data-source-option="${SOURCE}"]')?.getAttribute('aria-checked')==='true'`, "source-option-selected");
    await this.click('[data-action="confirm-source-selection"]', `window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().prodigy_wiki?.source?.path===${JSON.stringify(SOURCE)} && !document.querySelector('[data-source-choices]')`, "source-hash-pinned");
    let state = await this.snapshot(); assert.equal(state.source.content_hash, this.source.content_hash);
    if (!state.controls.some(control => control.range)) await this.click('[data-action="change-range"]', "document.querySelector('[data-select-range-id]')", "bounded-range-picker");
    const range = await this.evaluate("[...document.querySelectorAll('[data-select-range-id]')].find(n=>!n.disabled)?.dataset.selectRangeId");
    assert.ok(range, "first valid bounded section missing");
    await this.click(`[data-select-range-id="${range}"]`, `document.querySelector('[data-select-range-id="${range}"]')?.checked===true`, "bounded-section-selected");
    await this.click('[data-action="confirm-range"]', "window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().prodigy_wiki?.range && !document.querySelector('[data-range-tree]')", "bounded-section-confirmed");
    state = await this.snapshot(); assert.equal(state.source.content_hash, this.source.content_hash); assert.ok(state.range.end > state.range.start); assert.ok(state.range.end - state.range.start < fs.readFileSync(path.join(this.vault, SOURCE), "utf8").length);
    this.boundSelection = { source: state.source, range: state.range }; this.record("bound-selection", this.boundSelection);
    await this.click('[data-action="request-consent"]', "document.querySelector('[data-action=start-run]') || window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot().provider_selection_error || document.querySelector('.llmwiki-document-review')", "displayed-processing-action");
    state = await this.snapshot();
    if (!state.review_reached) throw new Error(`BLOCKED: ${state.provider_selection_error || 'explicit live provider consent is absent; start-run NOT RUN'}`);
    assert.equal(state.source.content_hash, this.source.content_hash); assert.deepEqual(state.range, this.boundSelection.range);
    return { status: "PASS", classification: "characterization", review_reached: true };
  }
  async cleanup() {
    const cleanup = { schema: "llmwiki-native-cleanup-v1", scenario: "S01", pre: null, post: null, assertions: [], errors: [], zero_owned_residue: false };
    const check = (name, run) => { try { const detail = run(); cleanup.assertions.push({ name, ok: true, detail }); return detail; } catch (error) { cleanup.errors.push({ name, error: error.message }); return null; } };
    try {
      await Promise.all(this.connections.map(connection => connection.ws.readyState === 3 ? Promise.resolve() : bounded("native inspection close", resolve => { connection.ws.addEventListener("close", resolve, { once: true }); connection.close(); })));
      cleanup.assertions.push({ name: "native-inspection-connections-closed", ok: true, count: this.connections.length });
      if (!this.owner.runtime) { cleanup.zero_owned_residue = true; cleanup.pre = cleanup.post = { pids: [], ports: [], paths: [] }; return cleanup; }
      const authenticated = check("matching-ownership-receipt", () => { safePath(this.owner.runtime, this.owner.runtime); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(this.owner.runtime, "ownership.json"))), this.owner); assert.equal(this.owner.scenario, "S01"); return true; });
      if (!authenticated) return cleanup;
      this.ownTree(); cleanup.pre = structuredClone(this.owner);
      const rows = processes();
      const live = this.owner.pids.filter(owned => rows.some(row => row.pid === owned.pid));
      for (const owned of live) assert.ok(sameProcess(owned, rows.find(row => row.pid === owned.pid)), "REFUSE_PID_IDENTITY_DRIFT");
      // Darwin kqueue NOTE_EXIT is subscribed before SIGTERM. No sleeps/polling.
      if (live.length) {
        const script = "import json,select,sys\npids=json.loads(sys.argv[1]); k=select.kqueue(); pending=set()\nfor pid in pids:\n try:\n  k.control([select.kevent(pid,filter=select.KQ_FILTER_PROC,flags=select.KQ_EV_ADD|select.KQ_EV_ONESHOT,fflags=select.KQ_NOTE_EXIT)],0,0);pending.add(pid)\n except ProcessLookupError: pass\nprint('ARMED',flush=True)\nwhile pending:\n events=k.control(None,len(pending),15)\n if not events: raise RuntimeError('owned PID exit timeout: '+str(sorted(pending)))\n for event in events: pending.discard(event.ident)\nprint('EXITED',flush=True)\nk.close()\n";
        const waiter = cp.spawn("/usr/bin/python3", ["-c", script, JSON.stringify(live.map(row => row.pid))], { env: this.env, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = ""; waiter.stderr.on("data", chunk => { stderr += chunk; });
        const done = bounded("owned process exit subscription", (resolve, reject) => { waiter.once("error", reject); waiter.once("exit", code => code === 0 ? resolve(true) : reject(new Error(`kqueue exit ${code}: ${stderr}`))); }, 20000);
        const armed = bounded("kqueue subscription", (resolve, reject) => { waiter.once("error", reject); const data = chunk => { stdout += chunk; if (stdout.includes("ARMED")) resolve(true); }; waiter.stdout.on("data", data); return () => waiter.stdout.off("data", data); });
        const watcher = processes().find(row => row.pid === waiter.pid);
        assert.ok(watcher, "owned kqueue watcher missing"); this.owner.pids.push(watcher); this.receipt();
        cleanup.pre = structuredClone(this.owner);
        await armed;
        for (const owned of [...live].reverse()) {
          const current = processes().find(row => row.pid === owned.pid);
          if (!current) continue;
          assert.ok(sameProcess(owned, current), "REFUSE_PID_REUSE_AT_SIGNAL");
          process.kill(owned.pid, "SIGTERM"); cleanup.assertions.push({ name: "SIGTERM-owned-only", ok: true, pid: owned.pid });
        }
        await done;
      }
      for (const owned of this.owner.pids) check(`kill-0-fails:${owned.pid}`, () => { const result = this.command("/bin/kill", ["-0", String(owned.pid)]); assert.notEqual(result.exit, 0); assert.match(result.stderr, /No such process/u); return result; });
      for (const port of this.owner.ports) check(`no-owned-listener:${port}`, () => { const result = this.command("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]); assert.equal(result.exit, 1); assert.equal(result.stdout, ""); return result; });
      if (cleanup.errors.length === 0) check("remove-realpath-verified-disposable-only", () => {
        for (const owned of this.owner.paths) assert.equal(safePath(owned, this.owner.runtime), owned);
        fs.rmSync(this.owner.runtime, { recursive: true });
        for (const owned of this.owner.paths) assert.equal(fs.existsSync(owned), false);
        return this.owner.paths;
      });
      const after = processes();
      check("protected-Obsidian-processes-unchanged", () => { for (const row of this.protected) assert.ok(sameProcess(row, after.find(item => item.pid === row.pid))); return this.protected.map(row => row.pid); });
      cleanup.post = { pids: this.owner.pids.filter(owned => after.some(row => row.pid === owned.pid)), ports: [], paths: this.owner.paths.filter(owned => fs.existsSync(owned)) };
      cleanup.zero_owned_residue = cleanup.errors.length === 0 && cleanup.post.pids.length === 0 && cleanup.post.paths.length === 0;
      this.owner.cleanup_todo = cleanup.zero_owned_residue ? "closed:S01:zero-owned-residue" : "open:S01:cleanup-failed";
      json(path.join(this.evidence, "ownership.json"), this.owner);
    } catch (error) { cleanup.errors.push({ name: "cleanup", error: error.stack }); }
    finally { json(path.join(this.evidence, "cleanup.json"), cleanup); this.record("cleanup", { zero_owned_residue: cleanup.zero_owned_residue, errors: cleanup.errors }); }
    return cleanup;
  }
}

// Isolated mutation proof for the runner's identity/destruction assertions.
function guardProof() {
  assert.throws(() => scenarioId(undefined)); assert.throws(() => scenarioId("UNKNOWN")); assert.throws(() => scenarioId("S02"));
  assert.throws(() => safePath(ROOT, "/private/tmp/not-owned"), /REFUSE_DUSK/u);
  assert.equal(sameProcess({ pid: 1, start: "a", command: "owned" }, { pid: 1, start: "b", command: "owned" }), false);
  const original = sourceFixture("guard", "synthetic immutable source");
  assert.throws(() => assert.equal(sha256(original.outbound_text + "mutation"), sha256(original.outbound_text)));
  const hub = fs.readFileSync(path.join(ROOT, "HUB/50 Knowledge.md"), "utf8");
  for (const block of extractBlocks(hub)) new (Object.getPrototypeOf(async function () {}).constructor)(block.source);
  return { unknown_missing_unimplemented_fail: true, dusk_refused: true, pid_reuse_refused: true, isolated_source_mutation_detected: true, real_hub_syntax: true };
}

test("native LLM Wiki final-flow frozen scenario", { timeout: 180000 }, async () => {
  if (process.env.LW_NATIVE_F3 === "1") {
    assert.ok(SCENARIOS.includes(process.env.LW_SCENARIO), `LW_SCENARIO missing or unknown: ${process.env.LW_SCENARIO || "<missing>"}`);
    return require(path.join(ROOT, ".omo/evidence/llmwiki-completion-contract", RUN, "F3-tools/scenarios.cjs")).run(process.env.LW_SCENARIO);
  }
  const id = scenarioId(process.env.LW_SCENARIO);
  const evidenceRoot = path.resolve(process.env.LW_EVIDENCE || path.join(ROOT, ".omo/evidence/llmwiki-completion-contract", RUN));
  assert.ok(evidenceRoot.startsWith(path.join(ROOT, ".omo/evidence/llmwiki-completion-contract") + path.sep));
  const evidence = path.join(evidenceRoot, id); fs.mkdirSync(evidence, { recursive: true });
  assert.ok(!FILES.some(file => fs.existsSync(path.join(evidence, file))), "Refuse evidence overwrite: preserve previous attempt before invoking again");
  const qa = new NativeQA(evidence);
  let verdict = { status: "BLOCKED", classification: "environment", review_reached: false }, after, cleanup, screenshot;
  const baseline = duskInventory();
  const before = { head: raw("git", ["rev-parse", "HEAD"]).stdout.trim(), dirty: raw("git", ["status", "--short"]).stdout, dusk: baseline, protected_processes: qa.protected, model: process.env.PI_MODEL || null, versions: { app: raw("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleShortVersionString", "/Applications/Obsidian.app/Contents/Info.plist"]).stdout.trim(), plugin: JSON.parse(fs.readFileSync(path.join(ROOT, "SYSTEM/Plugins/prodigy-llm-wiki/manifest.json"))).version, dataview: JSON.parse(fs.readFileSync(path.join(ROOT, ".obsidian/plugins/dataview/manifest.json"))).version, node: process.version }, guard_proof: guardProof() };
  json(path.join(evidence, "before.json"), before);
  try {
    assert.equal(before.head, HEAD);
    const access = qa.command("/usr/bin/osascript", ["-e", 'tell application "System Events" to get UI elements enabled']);
    assert.equal(access.stdout.trim(), "true", "BLOCKED: macOS Accessibility unavailable");
    qa.setup(); verdict = await qa.s01();
  } catch (error) { verdict.reason = error.message; verdict.stack = error.stack; }
  finally {
    try { after = await qa.snapshot(); } catch (error) { after = { status: "NOT_RUN", error: error.message }; }
    try { screenshot = await qa.screenshot(); } catch (error) { screenshot = { status: "NOT_RUN", error: error.message }; }
    try { if (qa.help?.stdout.includes("dev:errors")) qa.cli(["dev:errors"]); }
    catch (error) { qa.record("native-error-capture-failed", { error: error.message }); }
    finally { cleanup = await qa.cleanup(); }
    const final = duskInventory();
    const unchanged = baseline.digest === final.digest;
    const head = raw("git", ["rev-parse", "HEAD"]).stdout.trim();
    json(path.join(evidence, "after.json"), { ...after, dusk: final, dusk_unchanged: unchanged, head, screenshot });
    if (!unchanged || head !== HEAD || !cleanup.zero_owned_residue) { verdict.status = "FAIL"; verdict.preservation_or_cleanup_failed = true; }
    verdict = { ...verdict, scenario: id, mode: "native-no-provider-consent", provider_calls: 0, provider_calls_basis: "no credentials/settings copied; start-run never triggered", protected_provider_calls: 0, live_provider_attempt: "NOT_RUN", screenshot, cleanup_zero_owned_residue: cleanup.zero_owned_residue, dusk_unchanged: unchanged, head, not_run: SCENARIOS.slice(1) };
    json(path.join(evidence, "result.json"), verdict);
    const summaryDir = path.join(evidenceRoot, "task-2"); fs.mkdirSync(summaryDir, { recursive: true });
    const commands = qa.commands.map(row => `- \`${row.command}\` (exit ${row.exit})`).join("\n");
    fs.writeFileSync(path.join(summaryDir, "summary.md"), `# Task 2 native QA\n\nS01: ${verdict.status}. ${verdict.reason || "Review reached: characterization, not RED."}\n\nApp ${before.versions.app}; plugin ${before.versions.plugin}; real Dataview ${before.versions.dataview}; Node ${before.versions.node}; effective model ${before.model}.\n\nCleanup zero owned residue: ${cleanup.zero_owned_residue}. Dusk digest unchanged: ${unchanged}. HEAD: ${head}.\n\nGuard mutation proof and Hub syntax: ${JSON.stringify(before.guard_proof)}.\n\nNOT RUN: S02-S12, real owner stored album/native acceptance, live provider input-to-review, apply, mobile. No production change or provider consent.\n\nPlan correction: the shared RealObsidianHarness installs fake Dataview; final-flow QA must use its inspection utilities only and copy real Dataview. A fresh live positive needs explicit consent and a safely configured disposable provider; do not count blocked native setup or consent as product RED.\n\nExact launch/environment and all OS actions: ../S01/actions.json.\n\n## Commands\n${commands}\n`);
  }
  assert.equal(cleanup.zero_owned_residue, true, JSON.stringify(cleanup.errors));
  assert.equal(verdict.status, "PASS", JSON.stringify(verdict));
});
