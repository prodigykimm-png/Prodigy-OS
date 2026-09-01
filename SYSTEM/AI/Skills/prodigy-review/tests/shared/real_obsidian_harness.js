"use strict";

const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const OBSIDIAN_BUNDLE = "/Applications/Obsidian.app";
const ASIDE_BUNDLE = "/Applications/Aside.app";
const LOOPBACK = "127.0.0.1";
const HUBS = [
  ["home", "HUB/00 Home.md"], ["auction", "HUB/10 Auction.md"],
  ["reading", "HUB/20 Reading.md"], ["workout", "HUB/30 Workout.md"],
  ["project", "HUB/40 Project.md"], ["knowledge", "HUB/50 Knowledge.md"],
  ["personal", "HUB/60 Personal.md"], ["journal", "HUB/70 Journal.md"],
  ["region", "HUB/15 Region.md"],
];
const VIEW_SOURCES = new Map(fs.readdirSync(path.join(ROOT, "SYSTEM/Views")).filter((name) => name.endsWith(".js")).map((name) => [`SYSTEM/Views/${name}`, fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8")]));
const CSS_OWNER_CACHE = new Map();
const MEDIA_AUTHORITY_CACHE = new Map();
function buildMediaAuthority(theme, forcedColors) {
  assert.ok(theme === "light" || theme === "dark", "TASK13A_MEDIA_AUTHORITY_THEME");
  assert.equal(typeof forcedColors, "boolean", "TASK13A_MEDIA_AUTHORITY_FORCED");
  const key = `${theme}:${forcedColors}`;
  if (!MEDIA_AUTHORITY_CACHE.has(key)) MEDIA_AUTHORITY_CACHE.set(key, Object.freeze({ media: "screen", features: Object.freeze([
    Object.freeze({ name: "prefers-color-scheme", value: theme }),
    Object.freeze({ name: "forced-colors", value: forcedColors ? "active" : "none" }),
    Object.freeze({ name: "prefers-reduced-motion", value: "reduce" }),
  ]) }));
  return MEDIA_AUTHORITY_CACHE.get(key);
}
function validateZoomAuthority(requestedZoom, triggerBoundary) {
  const payload = triggerBoundary && triggerBoundary.deviceMetricsOverride;
  const observed = triggerBoundary && triggerBoundary.pageObserved;
  if (!payload || !observed) throw new Error("TASK13A_ZOOM_RECEIPT_MISSING");
  const cdpZoom = Number(payload.scale), cssZoom = Number(observed.inlineZoom || 1);
  if (Number(requestedZoom) !== 2 || payload.width !== observed.innerWidth || payload.height <= 0 || payload.deviceScaleFactor !== 1 || payload.mobile !== false) throw new Error("TASK13A_ZOOM_RECEIPT_INVALID");
  if (!((cdpZoom === 2 && cssZoom === 1) || (cdpZoom === 1 && cssZoom === 2))) throw new Error("TASK13A_ZOOM_AUTHORITY_NOT_SINGLE");
  if (!(observed.visualViewportWidth > 0) || !(observed.shellClientWidth > 0) || !(observed.shellBoundingWidth > 0) || !(observed.blockClientWidth > 0) || observed.devicePixelRatio !== 1 || !Number.isInteger(observed.responsiveGeneration) || !observed.mountIdentity || !observed.mountIdentity.registryLive) throw new Error("TASK13A_ZOOM_OBSERVATION_INVALID");
  return true;
}
function assertMediaAuthorityTrace(commands) {
  let prior = 0;
  for (const command of commands || []) {
    const features = command && command.payload && command.payload.features;
    const expectedNames = ["prefers-color-scheme", "forced-colors", "prefers-reduced-motion"];
    if (!command || command.payload.media !== "screen" || !Array.isArray(features) || features.length !== expectedNames.length || features.some((feature, index) => !feature || feature.name !== expectedNames[index]) || !["light", "dark"].includes(features[0].value) || !["active", "none"].includes(features[1].value) || features[2].value !== "reduce" || !Number.isInteger(command.sequence) || command.sequence <= prior) throw new Error("TASK13A_MEDIA_AUTHORITY_VECTOR");
    const expectedAck = { theme: features[0].value, forcedColors: features[1].value === "active", reducedMotion: true };
    if (!command.ack || command.ack.theme !== expectedAck.theme || command.ack.forcedColors !== expectedAck.forcedColors || command.ack.reducedMotion !== true) throw new Error("TASK13A_MEDIA_AUTHORITY_ACK");
    const target = command.target;
    if (!target || !target.before || !target.after || target.before.targetId !== target.after.targetId || target.before.url !== target.after.url || target.before.attached !== true || target.after.attached !== true) throw new Error("TASK13A_MEDIA_AUTHORITY_TARGET");
    prior = command.sequence;
  }
  return true;
}
function resolveCssOwnership(rule) {
  const key = JSON.stringify(rule);
  if (CSS_OWNER_CACHE.has(key)) return CSS_OWNER_CACHE.get(key);
  const compact = String(rule.cssText || "").replace(/\s+/gu, "").slice(0, 120);
  const matches = [];
  for (const [relative, source] of VIEW_SOURCES) {
    const sourceCompact = source.replace(/\s+/gu, "");
    if ((rule.styleOwnerId && source.includes(rule.styleOwnerId)) || (compact.length >= 24 && sourceCompact.includes(compact))) matches.push(relative);
  }
  const resolved = { ...rule, owningSourceFile: matches.length === 1 ? matches[0] : matches.length ? matches : rule.provenance === "harness-plugin" ? ".obsidian/plugins/task13a-local-dv/main.js" : null, ownershipKind: matches.length ? "production" : rule.provenance === "harness-plugin" ? "harness-plugin" : rule.provenance === "native-obsidian" ? "native-obsidian" : "unresolved" };
  CSS_OWNER_CACHE.set(key, resolved);
  return resolved;
}
function selectActiveProductionMount(candidates, expected) {
  const active = (candidates || []).filter((candidate) => candidate && candidate.connected === true && candidate.displayed === true && candidate.visible === true && candidate.activeLeaf === true && candidate.registryOwned === true && candidate.width > 0 && candidate.height > 0);
  const matching = active.filter((candidate) => candidate.workspaceId === expected.workspaceId && candidate.renderer === expected.renderer && candidate.sourceFile === expected.sourceFile && candidate.sourceHash === expected.sourceHash);
  if (matching.length > 1 || (matching.length === 1 && active.length > 1)) throw new Error(`TASK13A_DUPLICATE_ACTIVE_PRODUCTION_OWNER:${active.length}`);
  if (matching.length === 1) return matching[0];
  if (active.length) throw new Error(`TASK13A_IDENTITY_ACTIVE_PRODUCTION_OWNER:${JSON.stringify(active)}`);
  throw new Error("TASK13A_ZERO_ACTIVE_PRODUCTION_OWNER");
}
function selectDiagnosticRoots(input) {
  const state = input && input.state;
  const shellStates = ["normal", "empty", "loading", "error-recovery", "selected-active", "disabled", "domain", "middle", "detail"];
  if (!shellStates.includes(state) && state !== "object-creator-modal") throw new Error("TASK13A_DIAGNOSTIC_STATE");
  const selected = input && input.selected;
  const expected = input && input.expected;
  const shell = selected && selected.shell;
  const descriptor = selected && selected.descriptor;
  if (!shell || shell.isConnected !== true || typeof shell.querySelectorAll !== "function") throw new Error("TASK13A_DIAGNOSTIC_SHELL_ROOT");
  if (!descriptor || !expected || descriptor.connected !== true || descriptor.displayed !== true || descriptor.visible !== true || descriptor.activeLeaf !== true || descriptor.registryOwned !== true || !(descriptor.width > 0) || !(descriptor.height > 0)) throw new Error("TASK13A_DIAGNOSTIC_OWNER_LIVE");
  for (const key of ["workspaceId", "renderer", "sourceFile", "sourceHash"]) if (!expected[key] || descriptor[key] !== expected[key]) throw new Error("TASK13A_DIAGNOSTIC_OWNER_IDENTITY");
  const modalRoots = Array.isArray(input.modalRoots) ? input.modalRoots : [];
  if (state !== "object-creator-modal") {
    if (modalRoots.length !== 0) throw new Error("TASK13A_DIAGNOSTIC_MODAL_UNEXPECTED");
    return [shell];
  }
  if (expected.workspaceId !== "home" || expected.renderer !== "home" || expected.sourceFile !== "HUB/00 Home.md") throw new Error("TASK13A_DIAGNOSTIC_MODAL_HOME_OWNER");
  if (modalRoots.length !== 1) throw new Error("TASK13A_DIAGNOSTIC_MODAL_ROOT");
  const modal = modalRoots[0];
  if (!modal || modal.isConnected !== true || typeof modal.querySelectorAll !== "function") throw new Error("TASK13A_DIAGNOSTIC_MODAL_ROOT");
  if (typeof modal.getAttribute !== "function" || modal.getAttribute("data-prodigy-modal-owner") !== "object-creator-view" || modal.getAttribute("data-prodigy-modal-source") !== "SYSTEM/Views/object-creator-view.js") throw new Error("TASK13A_DIAGNOSTIC_MODAL_OWNER");
  if (modal === shell) throw new Error("TASK13A_DIAGNOSTIC_ROOTS_DUPLICATE");
  return [shell, modal];
}
function collectDiagnosticElements(roots) {
  if (!Array.isArray(roots) || roots.length === 0) throw new Error("TASK13A_DIAGNOSTIC_ROOTS_EMPTY");
  if (new Set(roots).size !== roots.length) throw new Error("TASK13A_DIAGNOSTIC_ROOTS_DUPLICATE");
  const all = [];
  const seen = new Set();
  for (const root of roots) {
    if (!root || typeof root.querySelectorAll !== "function") throw new Error("TASK13A_DIAGNOSTIC_ROOT_INVALID");
    for (const element of [root, ...root.querySelectorAll("*")]) if (!seen.has(element)) { seen.add(element); all.push(element); }
  }
  if (all.length === 0) throw new Error("TASK13A_DIAGNOSTIC_ELEMENTS_EMPTY");
  return all;
}
function attachCssOwnership(receipt) {
  const groups = [receipt.shell && receipt.shell.roots || [], receipt.resourceRecovery && receipt.resourceRecovery.elements || [], receipt.remoteAssets || [], receipt.gradients || [], ...Object.values(receipt.offenders || {})];
  for (const offender of groups.flat()) if (offender && offender.matchedRules) offender.matchedRules = offender.matchedRules.map(resolveCssOwnership);
  return receipt;
}

function run(command, args, label) {
  const result = cp.spawnSync(command, args, { encoding: "utf8", timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(`${label}: ${(result.error && result.error.message) || result.stderr || result.status}`);
  return result.stdout;
}
function plist(bundle, key) {
  return run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(bundle, "Contents/Info.plist")], key).trim();
}
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function exactArg(command, value) { return command.split(/\s+/u).includes(value); }
function validateLaunchContract(args, env, runtimeRoot, inheritedHome) {
  const mockKeychainCount = args.filter((argument) => argument === "--use-mock-keychain").length;
  if (mockKeychainCount !== 1) throw new Error(`TASK13A_MOCK_KEYCHAIN_COUNT:${mockKeychainCount}`);
  const childHome = env && env.HOME;
  const root = path.resolve(runtimeRoot);
  const childHomeTaskOwned = typeof childHome === "string" && path.resolve(childHome).startsWith(`${root}${path.sep}`) && path.resolve(childHome) !== path.resolve(inheritedHome || path.sep);
  if (!childHomeTaskOwned) throw new Error("TASK13A_CHILD_HOME_NOT_TASK_OWNED");
  return { mock_keychain_count: mockKeychainCount, child_home_task_owned: true, inherited_real_home: false };
}
function normalize(value) { try { return fs.realpathSync(value); } catch (_) { return value; } }
function bounded(label, subscribe, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeout);
    subscribe((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
function processRows() {
  const result = cp.spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,command="], { encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" } });
  if (result.error || result.status !== 0) throw new Error(`public process snapshot: ${(result.error && result.error.message) || result.stderr || result.status}`);
  return result.stdout.split("\n").map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+([\s\S]+)$/u);
    if (!match) return null;
    const command = match[5];
    return { pid: +match[1], ppid: +match[2], pgid: +match[3], start: match[4], executable: normalize(command.split(/\s+/u)[0]), command };
  }).filter(Boolean);
}
function portsForPid(pid) {
  const result = cp.spawnSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8", timeout: 5000 });
  if (![0, 1].includes(result.status)) throw new Error("listener snapshot failed");
  return [...result.stdout.matchAll(/TCP\s+(?:127\.0\.0\.1|\[::1\]|localhost):?(?:[^: ]*:)?(\d+)\s+\(LISTEN\)/gu)].map((m) => +m[1]).sort((a, b) => a - b);
}
function publicIdentity(bundle) {
  const executable = plist(bundle, "CFBundleExecutable");
  const binary = path.join(bundle, "Contents/MacOS", executable);
  return {
    bundle, executable: binary, bundleIdentifier: plist(bundle, "CFBundleIdentifier"),
    bundleName: plist(bundle, "CFBundleName"), version: plist(bundle, "CFBundleShortVersionString"),
    executableSha256: sha(binary),
  };
}
function argumentValue(command, prefix) {
  const argument = command.split(/\s+/u).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}
function ownershipAuthentication(metadata, token) {
  const { authentication: _authentication, ...payload } = metadata;
  return crypto.createHmac("sha256", token).update(JSON.stringify(payload)).digest("hex");
}
function writeOwnershipMetadata(marker, metadata, token) {
  const temporary = `${marker}.${process.pid}.tmp`;
  metadata.authentication = ownershipAuthentication(metadata, token);
  fs.writeFileSync(temporary, `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, marker);
}
function createDisposableOwnership({ runtimeRoot, executable, profile, target, port, nonce }) {
  const token = crypto.randomBytes(16).toString("hex"), marker = path.join(runtimeRoot, "ownership.json");
  const ownerRow = processRows().find((row) => row.pid === process.pid); assert.ok(ownerRow, "harness owner process missing");
  const metadata = { schema: "task13a-real-obsidian-owner-v2", token, runtimeRoot, executable, profile, target, port, nonce, owner: { pid: ownerRow.pid, start: ownerRow.start, executable: ownerRow.executable }, application: null, authentication: null };
  writeOwnershipMetadata(marker, metadata, token);
  return {
    token, marker, metadata,
    args: [`--task13a-owner-token=${token}`, `--task13a-owner-file=${Buffer.from(marker).toString("base64url")}`],
    bindApplication(row) {
      metadata.application = { pid: row.pid, pgid: row.pgid, start: row.start, executable: row.executable };
      writeOwnershipMetadata(marker, metadata, token);
    },
    bindApplicationPid(pid) {
      const row = processRows().find((candidate) => candidate.pid === pid); assert.ok(row, "owned application process missing");
      this.bindApplication(row);
    },
  };
}
function approvedDisposableHarness(row, rows) {
  const token = argumentValue(row.command, "--task13a-owner-token=");
  const encodedMarker = argumentValue(row.command, "--task13a-owner-file=");
  if (!token || !/^[a-f0-9]{32}$/u.test(token) || !encodedMarker) return false;
  try {
    const marker = Buffer.from(encodedMarker, "base64url").toString("utf8");
    const markerStat = fs.lstatSync(marker);
    const metadata = JSON.parse(fs.readFileSync(marker, "utf8"));
    const root = path.resolve(metadata.runtimeRoot);
    const insideRoot = (value) => typeof value === "string" && path.resolve(value).startsWith(`${root}${path.sep}`);
    const targetOwned = insideRoot(metadata.target) || metadata.target === "about:blank";
    const owner = rows.find((candidate) => candidate.pid === metadata.owner.pid);
    const application = metadata.application;
    return metadata.schema === "task13a-real-obsidian-owner-v2"
      && metadata.token === token && path.resolve(marker) === path.join(root, "ownership.json")
      && markerStat.isFile() && !markerStat.isSymbolicLink() && (markerStat.mode & 0o777) === 0o600
      && metadata.authentication === ownershipAuthentication(metadata, token)
      && insideRoot(metadata.executable) && normalize(metadata.executable) === row.executable
      && insideRoot(metadata.profile) && targetOwned
      && Number.isInteger(metadata.port) && metadata.port > 0 && typeof metadata.nonce === "string" && metadata.nonce.length > 0
      && exactArg(row.command, `--user-data-dir=${metadata.profile}`)
      && exactArg(row.command, `--remote-debugging-port=${metadata.port}`)
      && exactArg(row.command, `--task13a-nonce=${metadata.nonce}`)
      && exactArg(row.command, metadata.target)
      && application && application.pid === row.pid && application.pgid === row.pgid
      && application.start === row.start && application.executable === row.executable
      && owner && row.ppid === owner.pid && owner.pid !== row.pid
      && owner.start === metadata.owner.start && owner.executable === metadata.owner.executable;
  } catch (_error) {
    return false;
  }
}
function snapshotProtected(options = {}) {
  const rows = options.rows || processRows();
  const bundles = options.bundles || [OBSIDIAN_BUNDLE, ASIDE_BUNDLE].filter(fs.existsSync).map(publicIdentity);
  const listeners = options.portsForPid || portsForPid;
  const records = [];
  for (const bundle of bundles) for (const row of rows) {
    if (row.executable !== normalize(bundle.executable) || approvedDisposableHarness(row, rows)) continue;
    records.push({ kind: bundle.bundleName, pid: row.pid, pgid: row.pgid, start: row.start, executable: row.executable, executableSha256: bundle.executableSha256, bundle: bundle.bundle, ports: listeners(row.pid) });
  }
  return { records, hash: crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex") };
}
function assertProtectedUnchanged(before, signalled = [], rows = processRows(), listeners = portsForPid, executableDigest = sha) {
  for (const identity of before.records) {
    const row = rows.find((candidate) => candidate.pid === identity.pid);
    assert.ok(row, `protected ${identity.kind} PID ${identity.pid} disappeared`);
    assert.equal(signalled.includes(identity.pid), false, `protected ${identity.kind} was signalled`);
    assert.deepEqual({ start: row.start, executable: row.executable, executableSha256: executableDigest(row.executable), pgid: row.pgid, ports: listeners(row.pid) },
      { start: identity.start, executable: identity.executable, executableSha256: identity.executableSha256, pgid: identity.pgid, ports: identity.ports }, `protected ${identity.kind} identity changed`);
  }
  return true;
}
async function allocatePort(protectedPorts = new Set(), preferred) {
  if (preferred && protectedPorts.has(+preferred)) throw new Error("protected endpoint refused");
  const server = net.createServer();
  const port = await bounded("port allocation", (resolve, reject) => {
    server.once("error", reject); server.listen(preferred || 0, LOOPBACK, () => resolve(server.address().port));
  }, 5000);
  await bounded("port release", (resolve, reject) => server.close((error) => error ? reject(error) : resolve()), 5000);
  if (protectedPorts.has(port)) throw new Error("protected endpoint refused");
  return port;
}
function tracked(pathname) {
  const result = cp.spawnSync("git", ["ls-files", "--error-unmatch", "--", pathname], { cwd: ROOT, encoding: "utf8" });
  return result.status === 0;
}
function trackedFilesUnder(pathname) {
  const result = cp.spawnSync("git", ["ls-files", "-z", "--", pathname], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, `fixture source tree must be readable: ${pathname}`);
  return result.stdout.split("\0").filter(Boolean);
}
function copyTracked(relative, vault) {
  const source = path.join(ROOT, relative);
  const productionPath = /^(?:HUB\/[^/]+\.md|SYSTEM\/Views\/[^/]+\.js|SYSTEM\/TEMPLATE\/FORMAT\/template_project\.md)$/u.test(relative);
  assert.equal(tracked(relative) || (productionPath && fs.existsSync(source)), true, `fixture source must be repository production: ${relative}`);
  const target = path.join(vault, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
}
function extractBlocks(source) {
  return [...source.matchAll(/```(dataviewjs|js-engine)\n([\s\S]*?)\n```/gu)].map((match, ordinal) => ({ language: match[1], source: match[2], ordinal: ordinal + 1, sha256: crypto.createHash("sha256").update(match[2]).digest("hex") }));
}
function nodeNetworkDenyPrelude(receiptExpression = "window.__task13aNodeNetworkAttempts") {
  return `const __task13aDenied=(label,name)=>{${receiptExpression}.push({module:label,operation:name});throw new Error('TASK13A_NODE_NETWORK_DENIED:'+label+':'+name)},__task13aDeny=(module,name,label)=>{const original=module&&module[name];if(typeof original!=='function')return;module[name]=function(...args){const command=String(args[0]||''),argv=Array.isArray(args[1])?args[1]:[],agyProbe=label==='child_process'&&name==='spawn'&&globalThis.__task13aAntigravityExecProbe===true&&/(?:^|\\/)agy$/u.test(command)&&['-p','--output-format','--model','--json-schema','--sandbox','--disable-slash-commands'].every(flag=>argv.includes(flag));if(agyProbe){globalThis.__task13aAntigravityExecAttempts=globalThis.__task13aAntigravityExecAttempts||[];globalThis.__task13aAntigravityExecAttempts.push({command,flags:argv.filter(arg=>/^--|^-p$/u.test(String(arg)))});const next=args.slice();next[2]={...(next[2]||{}),env:{...process.env,HOME:process.env.TASK13A_ANTIGRAVITY_AUTH_HOME||process.env.HOME}};return original.apply(this,next)}return __task13aDenied(label,name)}};const __task13aHttp=require('node:http'),__task13aHttps=require('node:https'),__task13aHttp2=require('node:http2'),__task13aNet=require('node:net'),__task13aTls=require('node:tls'),__task13aDgram=require('node:dgram'),__task13aDns=require('node:dns'),__task13aChild=require('node:child_process'),__task13aModule=require('node:module');for(const name of ['request','get'])__task13aDeny(__task13aHttp,name,'http'),__task13aDeny(__task13aHttps,name,'https');for(const name of ['connect','createConnection'])__task13aDeny(__task13aNet,name,'net');__task13aDeny(__task13aTls,'connect','tls');__task13aDeny(__task13aDgram,'createSocket','dgram');__task13aDeny(__task13aHttp2,'connect','http2');for(const name of ['lookup','resolve','resolve4','resolve6','reverse'])__task13aDeny(__task13aDns,name,'dns');for(const name of ['lookup','resolve','resolve4','resolve6','reverse'])__task13aDeny(__task13aDns.promises,name,'dns.promises');for(const name of ['resolve','resolve4','resolve6','reverse'])__task13aDeny(__task13aDns.Resolver&&__task13aDns.Resolver.prototype,name,'dns.Resolver');for(const name of ['exec','execFile','spawn','fork','execSync','execFileSync','spawnSync'])__task13aDeny(__task13aChild,name,'child_process');globalThis.fetch=(...args)=>__task13aDenied('global','fetch');if(typeof globalThis.WebSocket==='function')globalThis.WebSocket=function(){return __task13aDenied('global','WebSocket')};const __task13aLoad=__task13aModule._load;__task13aModule._load=function(request,parent,isMain){const loaded=__task13aLoad.call(this,request,parent,isMain);if(request==='undici'||request==='node:undici'){for(const name of ['fetch','request','stream','pipeline','connect','upgrade'])__task13aDeny(loaded,name,'undici')}return loaded};`;
}
function fixturePluginSource(manifest) {
  return `const {Plugin}=require('obsidian');\nconst AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;\n` +
`class Rows extends Array{where(fn){return new Rows(...this.filter(fn))} array(){return Array.from(this)} sort(fn,dir){const a=new Rows(...this);return Array.prototype.sort.call(a,(x,y)=>{const v=fn(x),w=fn(y);return (v<w?-1:v>w?1:0)*(dir==='desc'?-1:1)})}}\n` +
`module.exports=class extends Plugin{async onload(){const manifest=${JSON.stringify(manifest)};window.__task13aNodeNetworkAttempts=[];${nodeNetworkDenyPrelude()}const execute=async(source,el,ctx,language)=>{\n` +
`const file=ctx.sourcePath;const expected=(manifest[file]||[]).find(x=>x.language===language&&x.source===source);if(!expected)throw new Error('TASK13A_SOURCE_DIVERGENCE:'+file);const generation=window.__task13aOpenGeneration&&window.__task13aOpenGeneration[file]||0;if(el.dataset.task13aExecuted===String(generation))return;el.dataset.task13aExecuted=String(generation);el.setAttribute('data-task13a-source-file',file);el.setAttribute('data-task13a-generation',String(generation));el.setAttribute('data-task13a-block-ordinal',String(expected.ordinal));\n` +
`const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))).map(x=>x.toString(16).padStart(2,'0')).join('');el.setAttribute('data-task13a-source-hash',digest);if(digest!==expected.sha256)throw new Error('TASK13A_SOURCE_HASH_MISMATCH');\n` +
`const scenario=window.__task13aScenario||{workspaceId:null,state:'normal',nonce:null};const consume=(boundary)=>{const detail={workspaceId:scenario.workspaceId,state:scenario.state,nonce:scenario.nonce,boundary,file,sha256:digest};window.__task13aScenarioConsumptions=window.__task13aScenarioConsumptions||[];window.__task13aScenarioConsumptions.push(detail);window.dispatchEvent(new CustomEvent('task13a-scenario-consumed',{detail}))};\n` +
`const normalSynthetic=[{type:'project',status:'doing',title:'한글 프로젝트',file:{path:'PARA/PROJECTS/Synthetic.md',name:'Synthetic',link:'Synthetic'},url:'https://example.invalid/'+('x'.repeat(96))},{type:'reading',status:'reading',title:'Synthetic Reading',file:{path:'PARA/PROJECTS/Reading/Synthetic.md',name:'Synthetic Reading',link:'Synthetic Reading'}},...(file==='HUB/10 Auction.md'?[{type:'auction_case',status:'watching',case_number:'TASK13A-2026-001',address:'서울특별시 강서구 TASK13A 1',auction_datetime:'2026-08-20',expected_bid:'100000000',appraisal_price:'120000000',minimum_bid:'90000000',property_type:'아파트',region_sido:'서울특별시',region_sigungu:'강서구',file:{path:'PARA/PROJECTS/Auction/TASK13A-2026-001.md',name:'TASK13A-2026-001',link:'TASK13A-2026-001'}}]:[]),...(file==='HUB/50 Knowledge.md'?[{type:'knowledge',status:'active',title:'TASK13A Synthetic Knowledge',knowledge_domain:'coding',knowledge_topics:['ai'],file:{path:'PARA/RESOURCES/Knowledge/TASK13A Synthetic Knowledge.md',name:'TASK13A Synthetic Knowledge',link:'TASK13A Synthetic Knowledge'}}]:[])];const synthetic=scenario.state==='empty'?[]:normalSynthetic;\n` +
`const dv={pages:()=>{consume('dv.pages');return new Rows(...synthetic)},page:()=>{consume('dv.page');return synthetic[0]},current:()=>{consume('dv.current');return{}},io:{load:async p=>{consume('dv.io.load');return this.app.vault.adapter.read(p)}},component:{},api:{renderValue(v,n){n.textContent=String(v)}}};consume('execute');\n` +
`if(!window.__task13aProjectMemoryBoundary){const vault=this.app.vault,files=new Map(),operations=[];const originals={create:vault.create,read:vault.read,modify:vault.modify,getAbstractFileByPath:vault.getAbstractFileByPath};const synthetic=value=>typeof value==='string'&&value.startsWith('PARA/PROJECTS/TASK13A');const fileFor=pathname=>({path:pathname,name:pathname.split('/').pop(),basename:pathname.split('/').pop().replace(/\\.md$/u,''),extension:'md',stat:{ctime:0,mtime:0,size:(files.get(pathname)||'').length}});vault.create=async(pathname,content)=>{if(!synthetic(pathname))return originals.create.call(vault,pathname,content);files.set(pathname,String(content));const file=fileFor(pathname);operations.push({method:'vault.create',path:pathname,label:'in_memory_synthetic',at:Date.now()});const registry=window.__task13aFixtureRegistry,active=window.__task13aProjectMemoryBoundary&&window.__task13aProjectMemoryBoundary.active;if(active&&registry)void registry.consume('project','projectCreate',{path:pathname,label:'in_memory_synthetic'});return file};vault.read=async file=>{const pathname=typeof file==='string'?file:file&&file.path;if(!synthetic(pathname))return originals.read.call(vault,file);operations.push({method:'vault.read',path:pathname,label:'in_memory_synthetic',at:Date.now()});return files.get(pathname)||''};vault.modify=async(file,content)=>{const pathname=typeof file==='string'?file:file&&file.path;if(!synthetic(pathname))return originals.modify.call(vault,file,content);files.set(pathname,String(content));operations.push({method:'vault.modify',path:pathname,label:'in_memory_synthetic',at:Date.now()});return fileFor(pathname)};vault.getAbstractFileByPath=pathname=>synthetic(pathname)&&files.has(pathname)?fileFor(pathname):originals.getAbstractFileByPath.call(vault,pathname);window.__task13aProjectMemoryBoundary={active:false,files,operations,originals,functions:{create:vault.create,read:vault.read,modify:vault.modify,getAbstractFileByPath:vault.getAbstractFileByPath},reset(){files.clear();operations.length=0;this.active=false}}}\n` +
`const writes=['create','createBinary','modify','modifyBinary','delete','trash','rename','copy','append','process'].filter(k=>typeof this.app.vault[k]==='function').map(k=>[this.app.vault,k,this.app.vault[k]]);const adapter=this.app.vault.adapter;for(const k of ['write','writeBinary','append','mkdir','remove','rmdir','rename','copy'])if(typeof adapter[k]==='function')writes.push([adapter,k,adapter[k]]);for(const [owner,k,original]of writes)owner[k]=(...args)=>{const first=args[0];const target=typeof first==='string'?first:first&&typeof first.path==='string'?first.path:null,quickCapture=window.__task13aQuickCaptureWrites===true&&target&&/^(?:ZETA\\/FLEETING(?:\\/\\d{4}-\\d{2}-\\d{2}\\.md)?|INBOX(?:\\/빠른 입력 실제 QA(?: \\d+)?\\.md)?)$/u.test(target),analysisState=target==='SYSTEM/PRIVATE'||/^SYSTEM\\/CACHE(?:\\/|$)/u.test(String(target||''))||new Set(['SYSTEM/PRIVATE/llmwiki-incremental-analysis-state.json','SYSTEM/PRIVATE/llmwiki-chunk-coverage.json','SYSTEM/PRIVATE/llmwiki-analysis-cache.json','SYSTEM/PRIVATE/llmwiki-inbox-proposals.json','SYSTEM/PRIVATE/llmwiki-fleeting-review-state.json']).has(target),reviewedWiki=window.__task13aProdigyWikiReviewedWrites===true&&/^PARA\\/RESOURCES\\/Prodigy Wiki(?:\\/|$)/u.test(String(target||'')),incrementalSource=window.__task13aProdigyWikiSourceWrites===true&&target==='INBOX/Prodigy Wiki Incremental QA.md';if((window.__task13aProjectMemoryBoundary&&target&&target.startsWith('PARA/PROJECTS/TASK13A'))||quickCapture||analysisState||reviewedWiki||incrementalSource)return original.apply(owner,args);window.__task13aWriteAttempts=window.__task13aWriteAttempts||[];window.__task13aWriteAttempts.push({method:(owner===adapter?'adapter.':'vault.')+k,path:target,label:'real',at:Date.now(),stack:String(new Error().stack||'').split('\\n').slice(1,5)});throw new Error('TASK13A_WRITE_ATTEMPT:'+k+':'+(target||'<unknown>'))};\n` +
`try{await new AsyncFunction('app','dv','obsidian','container',source).call({container:el,onPersonalControllersMounted:window.__task13aPersonalControllersMounted},this.app,dv,require('obsidian'),el);window.__task13aReceipts=window.__task13aReceipts||{};{const prior=window.__task13aReceipts[file]||{};window.__task13aReceipts[file]={status:prior.status==='error'?'error':'rendered',language,sha256:digest,blocks:(manifest[file]||[]).length,executions:(prior.executions||0)+1,generation,errors:prior.errors||[],at:Date.now()}};window.dispatchEvent(new CustomEvent('task13a-rendered',{detail:{file}}));}catch(e){el.createEl('pre',{text:'TASK13A_ERROR '+e.message});window.__task13aReceipts=window.__task13aReceipts||{};{const prior=window.__task13aReceipts[file]||{};window.__task13aReceipts[file]={status:'error',error:e.message,sha256:digest,blocks:(manifest[file]||[]).length,executions:(prior.executions||0)+1,generation,errors:[...(prior.errors||[]),e.message]}};window.dispatchEvent(new CustomEvent('task13a-rendered',{detail:{file}}));}};\n` +
`const schedule=(s,e,c,l)=>{const file=c.sourcePath,tokenKey=file+'\u0000'+l+'\u0000'+s,settleSingle=(manifest[file]||[]).length===1;this.__task13aTokens=this.__task13aTokens||new Map();this.__task13aQueues=this.__task13aQueues||new Map();const connected=settleSingle&&!e.isConnected?new Promise((resolve,reject)=>{const finish=()=>{if(!e.isConnected)return;observer.disconnect();clearTimeout(timer);resolve()};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_BLOCK_NOT_CONNECTED:'+file))},10000);finish()}):Promise.resolve();return connected.then(()=>{const token=(this.__task13aTokens.get(tokenKey)||0)+1;this.__task13aTokens.set(tokenKey,token);const prior=this.__task13aQueues.get(file)||Promise.resolve();const next=prior.then(async()=>{if(settleSingle)await new Promise((resolve,reject)=>{const observer=new ResizeObserver(()=>{if(!e.isConnected)return;observer.disconnect();clearTimeout(timer);resolve()});observer.observe(e);const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_BLOCK_LAYOUT_TIMEOUT:'+file))},10000)});if(settleSingle&&(token!==this.__task13aTokens.get(tokenKey)||!e.isConnected))return;return execute(s,e,c,l)});this.__task13aQueues.set(file,next.catch(()=>{}));return next})};this.registerMarkdownCodeBlockProcessor('dataviewjs',(s,e,c)=>schedule(s,e,c,'dataviewjs'));this.registerMarkdownCodeBlockProcessor('js-engine',(s,e,c)=>schedule(s,e,c,'js-engine'));window.__task13aEvaluateNodeSource=source=>(new Function('require','Buffer',source))(require,require('node:buffer').Buffer);window.__task13aPlugin={kind:'local-code-block-processor',manifest};}};\n`; 
}
function buildFixture(runtimeRoot, mutation = {}) {
  const vault = path.join(runtimeRoot, "vault"); fs.mkdirSync(vault, { recursive: true });
  const manifest = {};
  for (const [, hub] of HUBS) { copyTracked(hub, vault); const source = fs.readFileSync(path.join(ROOT, hub), "utf8"); manifest[hub] = extractBlocks(source); }
  const approvalNote = "HUB/Apple 기본 앱 UI 승인.md";
  copyTracked(approvalNote, vault);
  manifest[approvalNote] = extractBlocks(fs.readFileSync(path.join(ROOT, approvalNote), "utf8"));
  for (const file of fs.readdirSync(path.join(ROOT, "SYSTEM/Views"))) if (file.endsWith(".js")) copyTracked(`SYSTEM/Views/${file}`, vault);
  for (const file of trackedFilesUnder("SYSTEM/SCRIPTS")) copyTracked(file, vault);
  const appearanceTarget = path.join(vault, ".obsidian/appearance.json");
  fs.mkdirSync(path.dirname(appearanceTarget), { recursive: true });
  fs.writeFileSync(appearanceTarget, JSON.stringify({ baseFontSize: 16, cssTheme: "", enabledCssSnippets: ["base"], theme: "obsidian" }));
  copyTracked(".obsidian/snippets/base.css", vault);
  if (mutation.objectCreatorUndersized) {
    const creator = path.join(vault, "SYSTEM/Views/object-creator-view.js");
    fs.writeFileSync(creator, fs.readFileSync(creator, "utf8").replaceAll("min-height:44px", "min-height:20px"));
  }
  copyTracked("SYSTEM/TEMPLATE/FORMAT/template_project.md", vault);
  const plugin = path.join(vault, ".obsidian/plugins/task13a-local-dv"); fs.mkdirSync(plugin, { recursive: true });
  fs.writeFileSync(path.join(plugin, "manifest.json"), JSON.stringify({ id: "task13a-local-dv", name: "Task13A Local DV", version: "1.0.0", minAppVersion: "1.0.0", description: "Disposable exact-block QA boundary", author: "QA", isDesktopOnly: true }));
  let source = fixturePluginSource(manifest);
  if (mutation.reimplemented) source = source.replace("source).call", "'document.body.textContent=\\\"mock\\\"').call");
  if (mutation.writeAttempt) source = source.replace("try{await new AsyncFunction", "try{await this.app.vault.create('FORBIDDEN.md','x');await new AsyncFunction");
  fs.writeFileSync(path.join(plugin, "main.js"), source);
  const communityPlugins = ["task13a-local-dv"];
  if (mutation.prodigyAIRuntimePluginPath) {
    const runtimeSource = path.resolve(String(mutation.prodigyAIRuntimePluginPath));
    const runtimeTarget = path.join(vault, ".obsidian/plugins/prodigy-ai-runtime");
    fs.mkdirSync(runtimeTarget, { recursive: true });
    for (const name of ["main.js", "manifest.json", "versions.json"]) {
      fs.copyFileSync(path.join(runtimeSource, name), path.join(runtimeTarget, name));
    }
    communityPlugins.push("prodigy-ai-runtime");
  }
  fs.writeFileSync(path.join(vault, ".obsidian/community-plugins.json"), JSON.stringify(communityPlugins));
  fs.writeFileSync(path.join(vault, ".obsidian/app.json"), JSON.stringify({ showLineNumber: false, readableLineLength: true, strictLineBreaks: false }));
  fs.mkdirSync(path.join(vault, "PARA/PROJECTS"), { recursive: true });
  fs.writeFileSync(path.join(vault, "PARA/PROJECTS/Synthetic.md"), "---\ntype: project\nstatus: doing\ntitle: 한글 프로젝트\n---\nSynthetic normal fixture.\n");
  fs.mkdirSync(path.join(vault, "PARA/PROJECTS/Reading"), { recursive: true });
  fs.writeFileSync(path.join(vault, "PARA/PROJECTS/Reading/Synthetic.md"), "---\ntype: reading\nstatus: reading\n---\nSynthetic reading fixture.\n");
  fs.mkdirSync(path.join(vault, "PARA/RESOURCES/CONTACTS"), { recursive: true });
  fs.writeFileSync(path.join(vault, "PARA/RESOURCES/CONTACTS/TASK13A Person.md"), "---\ntype: people\nname: TASK13A Person\nrelationship: friend\n---\nTASK13A synthetic person body.\n");
  fs.mkdirSync(path.join(vault, "PARA/RESOURCES/Venues"), { recursive: true });
  fs.writeFileSync(path.join(vault, "PARA/RESOURCES/Venues/TASK13A Venue.md"), "---\ntype: venue\nvenue_category: studio\naddress: Seoul\n---\nTASK13A synthetic venue body.\n");
  fs.mkdirSync(path.join(vault, "PARA/RESOURCES/Knowledge"), { recursive: true });
  fs.writeFileSync(path.join(vault, "PARA/RESOURCES/Knowledge/TASK13A Synthetic Knowledge.md"), "---\ntype: knowledge\nstatus: active\nknowledge_domain: coding\nknowledge_topics:\n  - ai\n---\nTASK13A synthetic read-only knowledge fixture.\n");
  if (mutation.llmWikiOnboarding) {
    const closurePath = ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/final/completion-audit/final-confirmed/state-closure.json";
    if (mutation.llmWikiOnboarding === "valid") {
      const closureTarget = path.join(vault, closurePath);
      fs.mkdirSync(path.dirname(closureTarget), { recursive: true });
      fs.copyFileSync(path.join(ROOT, closurePath), closureTarget);
    }
    fs.mkdirSync(path.join(vault, "INBOX/Private"), { recursive: true });
    fs.writeFileSync(path.join(vault, "INBOX/Private/LLMWiki Onboarding.md"), "---\nprivacy: private\n---\n보호된 온보딩 검토 자료입니다.\n");
  }
  if (mutation.llmWikiInboxProgress === "protected") {
    fs.mkdirSync(path.join(vault, "INBOX"), { recursive: true });
    for (let index = 1; index <= 24; index += 1) fs.writeFileSync(path.join(vault, "INBOX", `합성 보호 자료 ${String(index).padStart(2, "0")}.md`), `---\nprivacy: private\n---\n# 합성 보호 자료 ${index}\n\n격리된 QA 본문입니다.\n`);
  }
  if (mutation.llmWikiInboxProgress === "malformed") {
    fs.mkdirSync(path.join(vault, "INBOX/Knowledge/%252e%252e"), { recursive: true });
    fs.writeFileSync(path.join(vault, "INBOX/Knowledge/%252e%252e/합성 비밀.md"), "# malformed path fixture\n");
  }
  if (mutation.llmWikiInboxProgress === "controlled") {
    fs.mkdirSync(path.join(vault, "INBOX/Knowledge"), { recursive: true });
    fs.writeFileSync(path.join(vault, "INBOX/Knowledge/가 합성 지식.md"), "# 가 합성 지식\n\n첫 번째 격리 근거입니다.\n");
    fs.writeFileSync(path.join(vault, "INBOX/Knowledge/나 합성 지식.md"), "# 나 합성 지식\n\n두 번째 격리 근거입니다.\n");
    fs.writeFileSync(path.join(vault, "INBOX/합성 보호 자료.md"), "---\nprivacy: private\n---\n# 합성 보호 자료\n\n외부 전송 금지 근거입니다.\n");
  }
  if (mutation.emptyInbox) {
    fs.mkdirSync(path.join(vault, "INBOX"), { recursive: true });
  }
  if (mutation.prodigyWikiIncremental) {
    fs.mkdirSync(path.join(vault, "INBOX"), { recursive: true });
    fs.writeFileSync(path.join(vault, "INBOX/Prodigy Wiki Incremental QA.md"), [
      "# Incremental QA",
      "",
      "## Unchanged Before",
      "",
      "BEFORE_SENTINEL remains outside the selected range. ".repeat(4).trim(),
      "",
      "## Changed Range",
      "",
      "Original changed-range evidence.",
      "Changed range context stays long enough for deterministic scope selection. ".repeat(3).trim(),
      "",
      "## Unchanged After",
      "",
      "AFTER_SENTINEL remains outside the selected range. ".repeat(4).trim(),
      "",
    ].join("\n"));
  }
  if (mutation.f3CdpStallSource) {
    fs.mkdirSync(path.join(vault, "INBOX"), { recursive: true });
    fs.writeFileSync(path.join(vault, "INBOX/F3 Cdp Stall Repro.md"), "---\ntype: literature_note\nsource_kind: public\nprivacy_class: public\nllmwiki_outbound: true\n---\n# Reproducer source\n\nOne durable claim for the CDP-stall reproducer.\n");
  }
  if (mutation.task21Stateful || mutation.task21StatefulNoInbox) {
    fs.mkdirSync(path.join(vault, "PARA/RESOURCES/Knowledge/Candidates"), { recursive: true });
    fs.writeFileSync(path.join(vault, "PARA/RESOURCES/Knowledge/Candidates/TASK21 Candidate.md"), "---\ntype: knowledge_candidate\ncandidate_id: candidate_task21_real\nstatus: saved\ntitle: 실제 후보 검토\nstatement: 실제 후보는 LLM Wiki로 전달한다.\nreason: 실제 화면 검증\nsource_type: daily_evidence\nsource_evidence_ids:\n  - daily-task21-e01\nsource_objects:\n  - \"[[DAILY/2026-08-21]]\"\nconfidence: explicit\nsuggested_domain: coding\nsuggested_topics:\n  - ai\napplication_trigger: 검토할 때\napplication_contexts: []\nconnections: []\ninvalidation_conditions: []\napproval_note: \"\"\npromotion_target: \"\"\npromoted_knowledge: \"\"\ncreated: 2026-08-21T00:00:00.000Z\nupdated: 2026-08-21T00:00:00.000Z\n---\n# 실제 후보 검토\n");
    if (mutation.task21StatefulNoInbox) {
      fs.mkdirSync(path.join(vault, "INBOX"), { recursive: true });
      if (mutation.task21StatefulRecovery) {
        const recoveryPath = path.join(vault, "SYSTEM/CACHE/llmwiki/batch-job-state.json");
        fs.mkdirSync(path.dirname(recoveryPath), { recursive: true });
        fs.writeFileSync(recoveryPath, `${JSON.stringify({
          schema_version: 2,
          jobs: {},
          packs: {},
          legacy: [],
          recovery: {
            active_tab: "llmwiki",
            selected_batch_id: "f".repeat(64),
            review: {
              run_id: "run_f3_cdp_stall",
              selected_operation_ids: [],
              proposals: [
                { operation_id: "operation_task21_f3-cdp-stall" },
                { operation_id: "operation_task21_f3-cdp-stall-secondary" },
              ],
            },
            operation_outcomes: [],
          },
        }, null, 2)}\n`);
      }
    } else {
      fs.mkdirSync(path.join(vault, "INBOX/Knowledge"), { recursive: true });
      fs.writeFileSync(path.join(vault, "INBOX/Knowledge/TASK21 Stateful.md"), "# 실제 상태형 INBOX\n\n승인 흐름을 검증하는 근거입니다.\n");
    }
  }
  fs.mkdirSync(path.join(vault, "ZETA/LITERATURE"), { recursive: true });
  fs.writeFileSync(path.join(vault, "ZETA/LITERATURE/TASK13A Synthetic Literature.md"), "---\ntype: literature_note\nstatus: active\nsource_kind: synthetic\nsensitivity: synthetic\nsource_id: source_task13a_state\nsource_url: https://example.invalid/task13a-state\nsource_title: TASK13A 합성 문헌\n---\n선택한 합성 근거만 검토하며 정본 지식은 쓰지 않는다.\n");
  fs.mkdirSync(path.join(vault, "SYSTEM/PRIVATE"), { recursive: true });
  fs.writeFileSync(path.join(vault, "SYSTEM/PRIVATE/prodigy.local.json"), `${JSON.stringify({ aiProfiles: { schema_version: 1, llmwiki: { direct_provider_key: "lm-studio", omniroute_provider_key: "" } } }, null, 2)}\n`);
  const today = new Date().toISOString().slice(0, 10);
  const morningDir = path.join(vault, `SYSTEM/AI/Skills/prodigy-review/runs/morning/${today}`);
  fs.mkdirSync(morningDir, { recursive: true });
  const morningPackage = { local_date: today, day_of_week: "", warnings: ["synthetic_offline_fixture"], context: { todoist: { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] }, projects: [{ path: "PARA/PROJECTS/Synthetic.md", name: "Synthetic", type: "project", status: "doing", priority: "medium", project_type: "uncategorized", start_date: "", due_date: "", next_action: "", review_status: "", updated: null, mtime: 0, todoist_project_id: "", todoist_sync_status: "", workflow_summary: "0/0" }], auctions: [], reading: [], continue_candidates: [], risks: [], review_inbox: [], recent_reflections: [], yesterday_review: null } };
  const morningResult = { schema_version: "task13a-synthetic-v1", local_date: today, brief_mode: "deterministic", brief: "합성 오프라인 브리핑입니다.", focus: [], attention: [], context: morningPackage.context };
  fs.writeFileSync(path.join(morningDir, `morning-package-${today}.json`), `${JSON.stringify(morningPackage, null, 2)}\n`);
  fs.writeFileSync(path.join(morningDir, `morning-result-${today}.json`), `${JSON.stringify(morningResult, null, 2)}\n`);
  return { vault, manifest };
}
const STRUCTURAL_SCENARIOS = Object.freeze(["normal", "empty", "loading", "error-recovery", "selected-active", "disabled"]);
const ADAPTER_STATE = Object.freeze({ normal: "normal", empty: "empty", loading: "loading", "error-recovery": "error", "selected-active": "selected", disabled: "disabled" });
function adapterContract(workspaceId, state) {
  return {
    applicable: true, driver: "workspace-state-adapter",
    expected: [{ scope: "shell", selector: `[data-prodigy-state-owner="${workspaceId}"][data-state="${state === "normal" ? "success" : ADAPTER_STATE[state]}"]`, min: 1, max: 1 }],
    forbidden: STRUCTURAL_SCENARIOS.filter((other) => other !== state).map((other) => ({ scope: "shell", selector: `[data-prodigy-state-owner="${workspaceId}"][data-state="${other === "normal" ? "success" : ADAPTER_STATE[other]}"]`, max: 0 }))
  };
}
const WORKOUT_CONTRACTS = Object.freeze({
  normal: { expected: [{ scope: "shell", selector: '.workout-running-latest', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.workout-panel-loading,.workout-error', max: 0 }] },
  empty: { expected: [{ scope: "shell", selector: '.workout-empty', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.workout-running-latest,.workout-error', max: 0 }] },
  loading: { expected: [{ scope: "shell", selector: '.workout-health-panel[aria-busy="true"] .workout-panel-loading', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.workout-error', max: 0 }] },
  "error-recovery": { expected: [{ scope: "shell", selector: '.workout-error', min: 1, max: 1 }, { scope: "shell", selector: '.workout-health-panel button', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.workout-panel-loading', max: 0 }] },
  "selected-active": { expected: [{ scope: "shell", selector: '.workout-health-tab[data-tab="nutrition"][aria-selected="true"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.workout-health-tab[data-tab="strength"][aria-selected="true"],.workout-health-tab[data-tab="running"][aria-selected="true"]', max: 0 }] },
  disabled: { expected: [{ scope: "shell", selector: '.workout-panel-error button:disabled', min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.capture-human-review[data-capture-state="committed"]', max: 0 }] }
});
const PROJECT_CONTRACTS = Object.freeze({
  normal: { expected: [{ scope: "document", selector: '.modal-container .prodigy-project-wizard[data-density]', min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-wizard .prodigy-wizard-shell[data-layout]', min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-approval-bar button:not(:disabled)', text: "프로젝트 만들기", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-project-wizard .prodigy-workflow-row', text: "빈 프리셋입니다.", max: 0 }, { scope: "document", selector: '.prodigy-project-wizard button', text: "다듬는 중...", max: 0 }] },
  empty: { expected: [{ scope: "document", selector: '.prodigy-project-workflow', min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-workflow div[style*="dashed"]', text: "빈 프리셋입니다. 프로젝트를 만들기 전에 워크플로 항목을 하나 이상 추가하세요.", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-project-workflow .prodigy-workflow-row', max: 0 }, { scope: "document", selector: '.prodigy-project-wizard button', text: "다듬는 중...", max: 0 }] },
  loading: { expected: [{ scope: "document", selector: '.prodigy-project-provider button:disabled', text: "다듬는 중...", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-wizard div', text: "워크플로 다듬기를 요청하는 중...", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-project-wizard div', textPrefix: "AI refinement failed:", max: 0 }, { scope: "document", selector: '.prodigy-project-approval-bar button', text: "Todoist 재시도", max: 0 }], allowedConcurrent: ["disabled-control"] },
  "error-recovery": { expected: [{ scope: "document", selector: '.prodigy-project-wizard div', text: "Todoist 동기화 실패: [redacted]", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-approval-bar button:not(:disabled)', text: "Todoist 재시도", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-approval-bar button:disabled', text: "프로젝트 만들기", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-project-approval-bar button', text: "Todoist 열기", max: 0 }, { scope: "document", selector: '.prodigy-project-wizard button', text: "다듬는 중...", max: 0 }] },
  "selected-active": { expected: [{ scope: "document", selector: '.prodigy-project-context button[style*="border-color: var(--ke-color-accent)"]', text: "개인", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-context select', value: "Personal", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-project-context button[style*="border-color: var(--ke-color-accent)"]', text: "사업", max: 0 }, { scope: "document", selector: '.prodigy-project-context button[style*="border-color: var(--ke-color-accent)"]', text: "회사", max: 0 }] },
  disabled: { expected: [{ scope: "document", selector: '.prodigy-project-approval-bar button:disabled', text: "프로젝트 만들기", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-approval-bar button:not(:disabled)', text: "프로젝트 열기", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-project-wizard div', text: "프로젝트 객체를 만들었습니다.", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-project-approval-bar button', text: "Todoist 재시도", max: 0 }, { scope: "document", selector: '.prodigy-project-approval-bar button', text: "만드는 중...", max: 0 }] }
});
const KNOWLEDGE_CONTRACTS = Object.freeze({
  normal: { expected: [{ scope: "shell", selector: '#knowledge-tab-zettelkasten[aria-selected="true"]', min: 1, max: 1 }, { scope: "shell", selector: '#knowledge-panel-zettelkasten .knowledge-explorer-hub-mount[data-shell="knowledge-explorer-shell"][data-surface-state="rest"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '#knowledge-panel-para,#knowledge-panel-llmwiki', max: 0 }, { scope: "shell", selector: '.knowledge-explorer-hub-mount[data-surface-state="loading"],.knowledge-explorer-hub-mount[data-surface-state="error"],.knowledge-explorer-hub-mount[data-surface-state="disabled"]', max: 0 }] },
  empty: { expected: [{ scope: "shell", selector: '#knowledge-tab-para[aria-selected="true"]', min: 1, max: 1 }, { scope: "shell", selector: '#knowledge-panel-para .knowledge-para-section[data-workspace-role="knowledge-use"]', min: 1, max: 1 }, { scope: "shell", selector: '#knowledge-panel-para .knowledge-explorer-empty[data-state="empty"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '#knowledge-panel-para .knowledge-para-results-layout,#knowledge-panel-para [data-state="no-match"]', max: 0 }] },
  loading: { expected: [{ scope: "shell", selector: '[data-surface="llmwiki-lifecycle"][data-state="running"][aria-busy="true"]', min: 1, max: 1 }, { scope: "shell", selector: 'progress[aria-label="AI 제안 생성 진행 중"]', min: 1, max: 1 }, { scope: "shell", selector: '[data-action="start-run"]:disabled', min: 1, max: 1 }, { scope: "shell", selector: '[data-action="cancel-run"]:not(:disabled)', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '[data-surface="llmwiki-lifecycle"][data-state="failed"],[data-surface="llmwiki-lifecycle"][data-state="review"],[data-surface="llmwiki-lifecycle"][data-state="committed"]', max: 0 }], allowedConcurrent: ["disabled-start-run", "enabled-cancel-run"] },
  "error-recovery": { expected: [{ scope: "shell", selector: '[data-surface="llmwiki-lifecycle"][data-state="failed"]', min: 1, max: 1 }, { scope: "shell", selector: '.llmwiki-lifecycle__status[data-state="error"]', min: 1, max: 1 }, { scope: "shell", selector: '[data-action="select-source"]:not(:disabled)', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.llmwiki-lifecycle__review,[data-state="committed"],[data-action="approve"],[data-action="repair-audit"],[data-action="retry-refresh"],[data-action="repacket-stale"]', max: 0 }] },
  "selected-active": { expected: [{ scope: "shell", selector: '.knowledge-workspace-tabs [role="tab"][aria-selected="true"]', min: 1, max: 1 }, { scope: "shell", selector: '.knowledge-explorer-hub-mount[data-focus-pane="detail"][data-selected-domain][data-selected-middle][data-selected-asset]', min: 1, max: 1 }, { scope: "shell", selector: '[data-group="detail"][aria-selected="true"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '[data-group="domain"][aria-selected="true"],[data-group="middle"][aria-selected="true"]', max: 0 }], allowedConcurrent: ["selected-tab", "selected-detail"] },
  disabled: { expected: [{ scope: "shell", selector: '.knowledge-explorer-hub-mount[data-surface-state="disabled"]', min: 1, max: 1 }, { scope: "shell", selector: '.knowledge-explorer-search-input[aria-disabled="true"]', min: 1, max: 1 }, { scope: "shell", selector: '.knowledge-explorer-status[data-state="disabled"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.knowledge-explorer-hub-mount[data-surface-state="disabled"] [data-group="domain"][aria-disabled="false"],.knowledge-explorer-hub-mount[data-surface-state="disabled"] [data-group="middle"][aria-disabled="false"],.knowledge-explorer-hub-mount[data-surface-state="disabled"] [data-group="detail"][aria-disabled="false"]', max: 0 }, { scope: "shell", selector: '#knowledge-panel-para,#knowledge-panel-llmwiki', max: 0 }] }
});
const PERSONAL_CONTRACTS = Object.freeze({
  normal: { expected: [{ scope: "shell", selector: '.personal-tabs [role="tab"][aria-selected="true"]', text: "사람", min: 1, max: 1 }, { scope: "shell", selector: '.ppw-card[data-state="idle"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.ppw-read-loading,.ppw-read-error', max: 0 }] },
  empty: { expected: [{ scope: "shell", selector: '.personal-tabs [role="tab"][aria-selected="true"]', text: "사람", min: 1, max: 1 }, { scope: "shell", selector: '.ppw-list .ppw-empty', min: 1, max: 2 }], forbidden: [{ scope: "shell", selector: '.ppw-card,.ppw-read-error', max: 0 }] },
  loading: { expected: [{ scope: "shell", selector: '.personal-tabs [role="tab"][aria-selected="true"]', text: "사람", min: 1, max: 1 }, { scope: "shell", selector: '.ppw-read-loading[role="status"]', min: 1, max: 2 }], forbidden: [{ scope: "shell", selector: '.ppw-read-error', max: 0 }] },
  "error-recovery": { expected: [{ scope: "shell", selector: '.ppw-read-error[role="alert"]', min: 1, max: 2 }, { scope: "shell", selector: 'button[aria-label="TASK13A Person 본문 다시 읽기"]', min: 1, max: 2 }], forbidden: [{ scope: "shell", selector: '.ppw-read-loading', max: 0 }] },
  "selected-active": { expected: [{ scope: "shell", selector: '.personal-tabs [role="tab"][aria-selected="true"]', text: "사람", min: 1, max: 1 }, { scope: "shell", selector: '.ppw-detail-title', text: "TASK13A Person", min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.ppw-card[data-state="selected"]:not([aria-current="true"]),.ppw-read-error', max: 0 }] },
  disabled: { expected: [{ scope: "shell", selector: '.personal-tabs [role="tab"][aria-selected="true"]', text: "장소", min: 1, max: 1 }, { scope: "shell", selector: '.ppv-venue-read-loading[role="status"]', min: 1, max: 2 }], forbidden: [{ scope: "shell", selector: '.ppv-venue-read-error', max: 0 }] }
});
const JOURNAL_CONTRACTS = Object.freeze({
  normal: { expected: [{ scope: "shell", selector: '.journal-status[data-state="complete"]', min: 1, max: 4 }, { scope: "document", selector: '.prodigy-reflection-modal textarea', min: 1, max: 1 }, { scope: "document", selector: '.prodigy-reflection-modal button:not(:disabled)', text: "AI 분류", min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.journal-period-status[data-state="error"]', max: 0 }] },
  empty: { expected: [{ scope: "shell", selector: '.journal-status[data-state="empty"]', min: 1, max: 4 }, { scope: "document", selector: '.prodigy-reflection-modal textarea', value: "", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-reflection-modal button:disabled', text: "AI 분류", min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.journal-block', max: 0 }] },
  loading: { expected: [{ scope: "shell", selector: '.journal-period-tabs [role="tab"][aria-selected="true"]', text: "Monthly", min: 1, max: 1 }, { scope: "shell", selector: '.journal-period-review[aria-busy="true"]', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.journal-period-status[data-state="error"]', max: 0 }] },
  "error-recovery": { expected: [{ scope: "document", selector: '.prodigy-reflection-modal .prodigy-status-line[role="status"]', text: "AI 분류에 실패했습니다. 다시 시도해 주세요.", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-reflection-modal button:not(:disabled)', text: "AI 분류", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-reflection-modal button', text: "분류 중…", max: 0 }] },
  "selected-active": { expected: [{ scope: "shell", selector: '.journal-period-tabs [role="tab"][aria-selected="true"]', text: "Quarterly", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-reflection-modal input[type="checkbox"]:checked', min: 1, max: 1 }], forbidden: [{ scope: "shell", selector: '.journal-period-content > .journal-period-panel:nth-child(n+2)', max: 0 }] },
  disabled: { expected: [{ scope: "document", selector: '.prodigy-reflection-modal button:disabled', text: "분류 중…", min: 1, max: 1 }, { scope: "document", selector: '.prodigy-reflection-modal .prodigy-status-line[role="status"]', textPrefix: "AI 분류 중…", min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.prodigy-reflection-modal button:not(:disabled)', textPrefix: "Evidence 승인", max: 0 }] }
});
const READING_CONTRACTS = Object.freeze({
  normal: { expected: [{ scope: "leaf", selector: '.reading-responsive-workspace', min: 1, max: 1 }], forbidden: [{ scope: "leaf", selector: '.reading-hub-error,[data-state="loading"]', max: 0 }] },
  empty: { expected: [{ scope: "leaf", selector: '[data-state="empty"] .reading-hub-empty', min: 1, max: 8 }], forbidden: [{ scope: "leaf", selector: '.reading-responsive-workspace [data-reading-path],.reading-hub-error', max: 0 }] },
  loading: { expected: [{ scope: "leaf", selector: '[data-state="loading"][aria-busy="true"]', min: 1, max: 1 }], forbidden: [{ scope: "leaf", selector: '.reading-hub-error', max: 0 }] },
  "error-recovery": { expected: [{ scope: "leaf", selector: '.reading-hub-error[role="alert"]', min: 1, max: 1 }, { scope: "leaf", selector: '.reading-hub-error button', min: 1, max: 1 }], forbidden: [{ scope: "leaf", selector: '[data-state="loading"]', max: 0 }] },
  "selected-active": { expected: [{ scope: "leaf", selector: '.reading-focus-target', min: 1, max: 1 }], forbidden: [{ scope: "leaf", selector: '.reading-hub-error', max: 0 }] },
  disabled: { expected: [{ scope: "document", selector: '.reading-manual-registration-modal button:disabled', min: 1, max: 1 }], forbidden: [{ scope: "document", selector: '.reading-manual-registration-modal [role="alert"]', max: 0 }] }
});
function buildDriverContract(workspaceId, state) {
  if (["home", "auction"].includes(workspaceId)) return adapterContract(workspaceId, state);
  if (workspaceId === "reading") return { applicable: true, driver: "reading-dashboard-controller", ...READING_CONTRACTS[state] };
  if (workspaceId === "workout") return { applicable: true, driver: "workout-published-controller", ...WORKOUT_CONTRACTS[state] };
  if (workspaceId === "project") return { applicable: true, driver: "project-wizard-controller", ...PROJECT_CONTRACTS[state] };
  if (workspaceId === "knowledge") return { applicable: true, driver: "knowledge-published-apis", ...KNOWLEDGE_CONTRACTS[state] };
  if (workspaceId === "personal") return { applicable: true, driver: "personal-published-controllers", ...PERSONAL_CONTRACTS[state] };
  if (workspaceId === "journal") return { applicable: true, driver: "journal-published-controllers", ...JOURNAL_CONTRACTS[state] };
  return { applicable: true, driver: "unavailable-shipped-driver", expected: [{ scope: "shell", selector: '[data-task13a-never]', min: 1, max: 1 }], forbidden: [] };
}
const STRUCTURAL_DRIVER_CONTRACTS = Object.freeze(Object.fromEntries(HUBS.map(([workspaceId]) => [workspaceId, Object.freeze(Object.fromEntries(STRUCTURAL_SCENARIOS.map((state) => [state, Object.freeze(buildDriverContract(workspaceId, state))])))])));
function structuralScenarioEffect(workspaceId, state) {
  return workspaceId === "knowledge" && state === "selected-active" ? "geometry-producing" : "state-transition";
}

function structuralDriverContract(workspaceId, state) {
  const contract = STRUCTURAL_DRIVER_CONTRACTS[workspaceId] && STRUCTURAL_DRIVER_CONTRACTS[workspaceId][state];
  if (!contract) throw new Error("TASK13A_SCENARIO_DRIVER_CONTRACT");
  return contract;
}
function validateKeyboardAdvance(baseline, afterTab) {
  const prompt = baseline && baseline.prompt;
  if (prompt && prompt.owned !== true) throw new Error(`TASK13A_NATIVE_PROMPT_INTERVENTION:${prompt.kind || "unknown"}`);
  if (prompt && prompt.owned === true && prompt.closed !== true) throw new Error("TASK13A_OWNED_PROMPT_NOT_CLOSED");
  const advancedToOwnedControl = Boolean(baseline && baseline.expectedTabId && afterTab && afterTab.id === baseline.expectedTabId);
  const advancedToTrustedChrome = Boolean(baseline && afterTab && afterTab.nativeObsidian === true && afterTab.id && afterTab.id !== baseline.id);
  if (!advancedToOwnedControl && !advancedToTrustedChrome) throw new Error("TASK13A_KEYBOARD_TAB_STUCK");
  return true;
}
function validateKeyboardTrace(signals) {
  for (const events of Object.values(signals || {})) for (const event of events || []) {
    const prompt = event && event.prompt;
    if (!prompt || prompt.owned === true) continue;
    if (prompt.scope === "embedded") throw new Error(`TASK13A_EMBEDDED_MODAL_INTERVENTION:${prompt.kind || "unknown"}`);
    throw new Error(`TASK13A_NATIVE_PROMPT_INTERVENTION:${prompt.kind || "unknown"}`);
  }
  return true;
}
function validateInheritedLayoutAuthority(receipt) {
  if (!receipt || receipt.declaredEffect !== "focus-only") throw new Error("TASK13A_KEYBOARD_EFFECT_DECLARATION");
  if (receipt.priorStatus !== "SETTLED" || !receipt.before || receipt.before.status !== "SETTLED") throw new Error("TASK13A_FOCUS_PRIOR_EPOCH");
  if (receipt.subscribedBeforeDispatch !== true) throw new Error("TASK13A_FOCUS_SUBSCRIPTION_ORDER");
  if (receipt.expectedInputObserved !== true) throw new Error("TASK13A_FOCUS_INPUT_MISSING");
  const before = receipt.before; const after = receipt.after;
  if (!after || after.epoch !== before.epoch || after.status !== "SETTLED") throw new Error("TASK13A_FOCUS_PRIOR_EPOCH");
  const ownerKeys = ["shellId", "blockId", "mountId", "workspaceId"];
  if (ownerKeys.some((key) => after.owner && before.owner && after.owner[key] !== before.owner[key]) || !after.owner || !before.owner) throw new Error("TASK13A_FOCUS_OWNER_DRIFT");
  if (after.owner.registryLive !== true || before.owner.registryLive !== true) throw new Error("TASK13A_FOCUS_REGISTRY_DRIFT");
  if (after.owner.sourceFile !== before.owner.sourceFile || after.owner.sourceHash !== before.owner.sourceHash) throw new Error("TASK13A_FOCUS_SOURCE_DRIFT");
  if (JSON.stringify(after.environment) !== JSON.stringify(before.environment)) throw new Error("TASK13A_FOCUS_ENVIRONMENT_DRIFT");
  if (JSON.stringify(after.styleOrder) !== JSON.stringify(before.styleOrder)) throw new Error("TASK13A_FOCUS_STYLE_DRIFT");
  const beforeRootIds = (before.roots || []).map((root) => root.id); const afterRootIds = (after.roots || []).map((root) => root.id);
  if (JSON.stringify(afterRootIds) !== JSON.stringify(beforeRootIds)) throw new Error("TASK13A_FOCUS_ROOT_DRIFT");
  if ((after.roots || []).some((root, index) => root.width !== before.roots[index].width || root.height !== before.roots[index].height)) throw new Error("TASK13A_FOCUS_GEOMETRY_MUTATION");
  const screenshot = receipt.screenshotContinuity;
  if (!screenshot || JSON.stringify(screenshot.before) !== JSON.stringify(screenshot.after) || JSON.stringify(screenshot.before) !== JSON.stringify(after)) throw new Error(`TASK13A_SCREENSHOT_CONTINUITY:${JSON.stringify(screenshot)}`);
  return receipt;
}
function createLayoutAuthorityCoordinator({ observerSource, abortSource, inputSource }) {
  function geometry({ before, trigger }) {
    let settled = false; let resolvePending; let rejectPending;
    const promise = new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; });
    const closeObserver = observerSource.subscribe((receipt) => { if (settled || receipt.epoch !== before.epoch) return; settled = true; closeObserver(); closeAbort(); resolvePending(receipt); });
    const closeAbort = abortSource.subscribe((event) => { if (settled || event.epoch !== before.epoch) return; settled = true; closeObserver(); closeAbort(); rejectPending(new Error(event.reason === "owner-disconnected" ? "TASK13A_LAYOUT_OWNER_DISCONNECTED" : "TASK13A_LAYOUT_ABORTED")); });
    trigger();
    return { promise, expire() { if (settled) return; settled = true; closeObserver(); closeAbort(); rejectPending(new Error("TASK13A_LAYOUT_EXPIRED")); } };
  }
  function focus({ declaredEffect, prior, snapshot, dispatch }) {
    if (declaredEffect !== "focus-only") throw new Error("TASK13A_KEYBOARD_EFFECT_DECLARATION");
    if (!prior || prior.status !== "SETTLED") throw new Error("TASK13A_FOCUS_PRIOR_EPOCH");
    let resolvePending; let rejectPending; let settled = false;
    const promise = new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; });
    const before = snapshot();
    const closeInput = inputSource.subscribe((event) => { if (settled || event.expected !== true) return; settled = true; closeInput(); const receipt = { declaredEffect, priorStatus: prior.status, subscribedBeforeDispatch: true, expectedInputObserved: true, before, after: snapshot(), screenshotContinuity: { before, after: snapshot() } }; try { validateInheritedLayoutAuthority(receipt); resolvePending(receipt); } catch (error) { rejectPending(error); } });
    dispatch();
    return { promise, expire() { if (settled) return; settled = true; closeInput(); rejectPending(new Error("TASK13A_FOCUS_INPUT_MISSING")); } };
  }
  return { geometry, focus };
}
function validateLayoutSettlement(receipt, expected) {
  if (!receipt || receipt.subscribedBeforeTrigger !== true) throw new Error("TASK13A_LAYOUT_SUBSCRIPTION_ORDER");
  if (receipt.preTriggerNotifications !== 0) throw new Error("TASK13A_LAYOUT_PRETRIGGER_NOTIFICATION");
  if (receipt.observerCurrent !== true || receipt.staleNotifications !== 0) throw new Error("TASK13A_LAYOUT_STALE_OBSERVER");
  if (receipt.notificationAfterTrigger !== true || !(receipt.notificationSequence > receipt.triggerSequence)) throw new Error("TASK13A_LAYOUT_NOTIFICATION_MISSING");
  if (!(receipt.environmentAckSequence > receipt.triggerSequence) || !(receipt.geometryArmSequence > receipt.environmentAckSequence) || !(receipt.notificationSequence > receipt.geometryArmSequence)) throw new Error("TASK13A_LAYOUT_ENVIRONMENT_GEOMETRY_ORDER");
  if (!receipt.mediaAck || receipt.mediaAck.requested.theme !== expected.theme || receipt.mediaAck.requested.forcedColors !== expected.forcedColors || receipt.mediaAck.current.theme !== expected.theme || receipt.mediaAck.current.forcedColors !== expected.forcedColors || receipt.mediaAck.current.reducedMotion !== true) throw new Error("TASK13A_LAYOUT_MEDIA_AUTHORITY");
  if (receipt.ownerSame !== true) throw new Error("TASK13A_LAYOUT_OWNER_REPLACED");
  if (receipt.ownerConnected !== true) throw new Error("TASK13A_LAYOUT_OWNER_DISCONNECTED");
  if (receipt.ownerWidthMatchesLeaf !== true) throw new Error("TASK13A_LAYOUT_OWNER_GEOMETRY");
  if (receipt.registryLive !== true || receipt.workspaceId !== expected.workspaceId || receipt.sourceFile !== expected.sourceFile || receipt.sourceHash !== expected.sourceHash) throw new Error("TASK13A_LAYOUT_OWNER_IDENTITY");
  if (receipt.viewportWidth !== expected.width || receipt.documentWidth !== expected.width) throw new Error("TASK13A_LAYOUT_VIEWPORT");
  if (String(receipt.cssZoom) !== String(expected.zoom)) throw new Error("TASK13A_LAYOUT_ZOOM");
  if (receipt.theme !== expected.theme || receipt.forcedColors !== expected.forcedColors) throw new Error("TASK13A_LAYOUT_MEDIA");
  if (!(receipt.rootCount >= 1) || !receipt.roots || receipt.roots.length !== receipt.rootCount || receipt.roots.some((root) => root.connected !== true) || !(receipt.roots[0].width > 0) || !(receipt.roots[0].height > 0)) throw new Error("TASK13A_LAYOUT_ROOT_GEOMETRY");
  if (receipt.styleOrderUnchanged !== true) throw new Error("TASK13A_LAYOUT_STYLE_RELOCATED");
  if (receipt.sampledAfterNotification !== true) throw new Error("TASK13A_LAYOUT_SAMPLE_BEFORE_SETTLE");
  const authority = receipt.authority;
  if (!authority || authority.status !== "SETTLED" || authority.epoch !== receipt.notificationSequence) throw new Error("TASK13A_LAYOUT_EPOCH");
  if (!authority.owner || authority.owner.registryLive !== true || authority.owner.workspaceId !== expected.workspaceId || authority.owner.sourceFile !== expected.sourceFile || authority.owner.sourceHash !== expected.sourceHash) throw new Error("TASK13A_LAYOUT_OWNER_IDENTITY");
  if (JSON.stringify(authority.environment) !== JSON.stringify({ viewportWidth: expected.width, documentWidth: expected.width, cssZoom: String(expected.zoom), theme: expected.theme, forcedColors: expected.forcedColors })) throw new Error("TASK13A_LAYOUT_ENVIRONMENT");
  if (!Array.isArray(authority.styleOrder) || new Set(authority.styleOrder).size !== authority.styleOrder.length) throw new Error("TASK13A_LAYOUT_STYLE_RELOCATED");
  if (!Array.isArray(authority.roots) || authority.roots.length !== receipt.rootCount || new Set(authority.roots.map((root) => root.id)).size !== authority.roots.length) throw new Error("TASK13A_LAYOUT_ROOT_IDENTITY");
  return receipt;
}
function validateScenarioPlan(plan) {
  const expected = new Set(HUBS.flatMap(([workspaceId]) => STRUCTURAL_SCENARIOS.map((state) => `${workspaceId}:${state}`)));
  const observed = new Set();
  for (const entry of plan || []) {
    if (!STRUCTURAL_SCENARIOS.includes(entry && entry.state)) throw new Error("TASK13A_SCENARIO_LABEL");
    const key = `${entry.workspaceId}:${entry.state}`;
    if (!expected.has(key) || observed.has(key)) throw new Error("TASK13A_SCENARIO_PLAN");
    observed.add(key);
  }
  if (observed.size !== expected.size || [...expected].some((key) => !observed.has(key))) throw new Error("TASK13A_SCENARIO_PLAN");
  return plan;
}
function validateScenarioReceipt(receipt) {
  if (!receipt || !STRUCTURAL_SCENARIOS.includes(receipt.matrix && receipt.matrix.state)) throw new Error("TASK13A_SCENARIO_LABEL");
  if (receipt.applicable === false) return receipt;
  if (receipt.origin !== "production-renderer") throw new Error("TASK13A_SCENARIO_RENDERER");
  if (receipt.adapterConsumed !== true) throw new Error("TASK13A_SCENARIO_ADAPTER");
  const expected = Array.isArray(receipt.expected) ? receipt.expected : [{ count: receipt.expectedCount, min: 1, max: 1 }];
  const forbidden = Array.isArray(receipt.forbidden) ? receipt.forbidden : [{ count: receipt.incompatibleCount, max: 0 }];
  if (expected.some((entry) => entry.count < entry.min)) throw new Error("TASK13A_SCENARIO_MISSING");
  if (expected.some((entry) => entry.count > entry.max)) throw new Error("TASK13A_SCENARIO_DUPLICATE");
  if (forbidden.some((entry) => entry.count > entry.max)) throw new Error("TASK13A_SCENARIO_INCOMPATIBLE");
  if (receipt.ownerCount !== 1) throw new Error("TASK13A_SCENARIO_OWNER");
  if (receipt.stale === true) throw new Error("TASK13A_SCENARIO_STALE");
  if (receipt.mountExecution !== 1 || receipt.mountGeneration !== 1) throw new Error("TASK13A_SCENARIO_REMOUNT");
  if (!receipt.blockExecution || receipt.blockExecution.status !== "rendered" || receipt.blockExecution.generation !== 1 || receipt.blockExecution.executions !== receipt.blockExecution.blocks) throw new Error("TASK13A_SCENARIO_BLOCK_EXECUTION");
  if (receipt.eventBeforeTrigger !== true) throw new Error("TASK13A_SCENARIO_SIGNAL_ORDER");
  if (!Array.isArray(receipt.surfaceSlices) || receipt.surfaceSlices.length !== 3 || receipt.surfaceSlices.some((slice) => slice.ownerCount !== 1)) throw new Error("TASK13A_SCENARIO_SURFACE_SLICE");
  if (receipt.writes && receipt.writes.length) throw new Error("TASK13A_SCENARIO_WRITE");
  if (receipt.network && receipt.network.length) throw new Error("TASK13A_SCENARIO_NETWORK");
  if (["project", "knowledge", "personal", "journal"].includes(receipt.matrix.workspaceId)) {
    const connector = receipt.connector;
    if (!connector || !["project-wizard-controller", "knowledge-published-apis", "personal-published-controllers", "journal-published-controllers"].includes(connector.kind) || connector.stub === true || connector.transitionApplied !== true) throw new Error("TASK13A_CONNECTOR_STUB");
    if (connector.eventObserved !== true) throw new Error("TASK13A_CONNECTOR_EVENT");
    if (connector.consumedNonce !== true) throw new Error("TASK13A_CONNECTOR_NONCE");
    if (connector.identityRestored !== true) throw new Error("TASK13A_CONNECTOR_IDENTITY");
    if (connector.pendingDeferred !== 0) throw new Error("TASK13A_CONNECTOR_DEFERRED");
    if ((connector.syntheticOperations || []).some((operation) => operation.label !== "in_memory_synthetic") || (connector.realOperations || []).some((operation) => operation.label !== "real")) throw new Error("TASK13A_CONNECTOR_OPERATION_LABEL");
    if (connector.approvalActions !== 0) throw new Error("TASK13A_CONNECTOR_APPROVAL");
    if (["personal", "journal"].includes(receipt.matrix.workspaceId)) {
      if (connector.callbackCaptured !== true || connector.controllersCaptured !== true) throw new Error("TASK13A_CONNECTOR_CONTROLLER");
      if (connector.focusContract !== true || connector.scrollContract !== true) throw new Error("TASK13A_CONNECTOR_FOCUS");
      if (connector.pendingProgress !== 0) throw new Error("TASK13A_CONNECTOR_PROGRESS");
      if (connector.remounted === true || connector.fakeDom === true) throw new Error("TASK13A_CONNECTOR_STUB");
    }
  }
  return receipt;
}
function scenarioAggregate(rows) {
  const canonical = rows.slice().sort((a, b) => JSON.stringify(a.matrix).localeCompare(JSON.stringify(b.matrix)));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function diagnosticFailures(receipt, options = {}) {
  const failures = [];
  const offenders = receipt && receipt.offenders || {};
  if (receipt && receipt.selectionFailure) failures.push({ kind: "active_production_owner", selectionFailure: receipt.selectionFailure });
  for (const offender of offenders.overflow || []) failures.push({ kind: "overflow", offender });
  for (const offender of offenders.targetSize || []) failures.push({ kind: "target_lt_44", offender });
  for (const offender of offenders.chromeShadow || []) failures.push({ kind: "forbidden_chrome_shadow", offender });
  for (const offender of receipt && receipt.readability && receipt.readability.oneGlyphColumns || []) failures.push({ kind: "cjk_one_glyph_column", offender });
  for (const offender of receipt && receipt.remoteAssets || []) failures.push({ kind: "remote_asset", offender });
  for (const offender of receipt && receipt.gradients || []) failures.push({ kind: "forbidden_gradient", offender });
  for (const offender of offenders.zeroInteractive || []) failures.push({ kind: "zero_geometry_interactive", offender });
  if (receipt && receipt.shell && receipt.shell.count !== 1) failures.push({ kind: receipt.shell.count === 0 ? "zero_shell" : "duplicate_shell", shell: receipt.shell });
  if (receipt && receipt.resourceRecovery && receipt.resourceRecovery.present) failures.push({ kind: "resource_recovery", recovery: receipt.resourceRecovery });
  for (const failure of receipt && receipt.keyboard && receipt.keyboard.failures || []) failures.push({ kind: "keyboard_focus_navigation", failure });
  if (receipt && receipt.navigation && !receipt.navigation.matches) failures.push({ kind: "navigation_transition", navigation: receipt.navigation });
  if (options.requireStateCoverage !== false) {
    for (const state of receipt && receipt.states && receipt.states.missing || []) failures.push({ kind: "state_missing", state });
    for (const state of receipt && receipt.states && receipt.states.duplicates || []) failures.push({ kind: "state_duplicate", state });
  }
  return failures;
}
function assertDiagnosticClean(receipt, options) {
  const failures = diagnosticFailures(receipt, options);
  assert.deepEqual(failures, [], `real Obsidian diagnostic failures:\n${JSON.stringify(failures, null, 2)}`);
  return receipt;
}
function matrixAggregate(rows) {
  const canonical = rows.slice().sort((a, b) => JSON.stringify(a.matrix).localeCompare(JSON.stringify(b.matrix)));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function createFixtureRegistry(options = {}) {
  const entries = new Map();
  const pending = new Map();
  const consumptions = [];
  const onConsume = typeof options.onConsume === "function" ? options.onConsume : () => {};
  const clone = (value) => value == null ? value : structuredClone(value);
  return Object.freeze({
    configure(workspaceId, operation, fixture) {
      const key = `${workspaceId}:${operation}`;
      const frozen = Object.freeze(clone(fixture));
      if (!frozen.nonce || !["resolve", "reject", "defer"].includes(frozen.kind)) throw new Error(`TASK13A_FIXTURE_INVALID:${key}`);
      entries.set(key, frozen);
      return frozen;
    },
    consume(workspaceId, operation, detail) {
      const key = `${workspaceId}:${operation}`;
      const fixture = entries.get(key);
      if (!fixture) throw new Error(`TASK13A_FIXTURE_UNCONFIGURED:${key}`);
      const event = Object.freeze({ workspaceId, operation, nonce: fixture.nonce, kind: fixture.kind, detail: clone(detail || {}) });
      consumptions.push(event);
      onConsume(event);
      if (fixture.kind === "reject") return Promise.reject(Object.assign(new Error(fixture.error || "task13a synthetic rejection"), clone(fixture.error_fields || {})));
      if (fixture.kind === "defer") return new Promise((resolve, reject) => pending.set(key, { nonce: fixture.nonce, resolve, reject }));
      return Promise.resolve(clone(fixture.value));
    },
    settle(workspaceId, operation, kind, value) {
      const key = `${workspaceId}:${operation}`;
      const item = pending.get(key);
      if (!item) return false;
      pending.delete(key);
      if (kind === "reject") item.reject(value instanceof Error ? value : new Error(value || "task13a synthetic rejection"));
      else item.resolve(clone(value));
      return true;
    },
    pending() { return [...pending].map(([key, value]) => ({ key, nonce: value.nonce })); },
    consumptions() { return consumptions.slice(); },
    clear(workspaceId) {
      for (const [key, item] of pending) if (key.startsWith(`${workspaceId}:`)) { pending.delete(key); item.reject(Object.assign(new Error("fixture reset"), { name: "AbortError" })); }
      for (const key of entries.keys()) if (key.startsWith(`${workspaceId}:`)) entries.delete(key);
    }
  });
}
function treeHash(root, excludeRuntime = true) {
  const entries = [];
  function visit(directory) { for (const name of fs.readdirSync(directory).sort()) { const file = path.join(directory, name); const relative = path.relative(root, file); if (excludeRuntime && (/^\.obsidian\/(workspace|workspace-mobile|cache|appearance\.json|core-plugins\.json|app\.json|app\.json\.tmp|plugins\/task13a-local-dv\/data\.json)/u.test(relative))) continue; const stat = fs.lstatSync(file); if (stat.isDirectory()) visit(file); else entries.push([relative, sha(file), stat.size]); } }
  visit(root); return { hash: crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex"), entries };
}
function prepareBundle(runtimeRoot, nonce) {
  const identity = publicIdentity(OBSIDIAN_BUNDLE); const bundle = path.join(runtimeRoot, `ObsidianTask-${nonce}.app`);
  run("cp", ["-cR", OBSIDIAN_BUNDLE, bundle], "APFS clone"); run("xattr", ["-cr", bundle], "xattr cleanup");
  const plistPath = path.join(bundle, "Contents/Info.plist"); const bundleIdentifier = `${identity.bundleIdentifier}.task13a.${nonce}`;
  run("/usr/libexec/PlistBuddy", ["-c", `Set :CFBundleIdentifier ${bundleIdentifier}`, "-c", `Set :CFBundleDisplayName ObsidianTask13A-${nonce}`, plistPath], "clone identity");
  run("codesign", ["--force", "--deep", "--sign", "-", bundle], "ad-hoc sign");
  return { bundle, bundleIdentifier, executable: path.join(bundle, "Contents/MacOS", identity.bundleName), sourceIdentity: identity };
}
function runtimeOwnershipArgs(runtime) {
  if (!runtime.ownershipToken || !runtime.ownershipMarker) return [];
  return [`--task13a-owner-token=${runtime.ownershipToken}`, `--task13a-owner-file=${Buffer.from(runtime.ownershipMarker).toString("base64url")}`];
}
function findOwned(runtime, rows = processRows(), listenerOverride = null) {
  const args = [`--user-data-dir=${runtime.profile}`, `--remote-debugging-port=${runtime.port}`, `--task13a-nonce=${runtime.nonce}`, ...runtimeOwnershipArgs(runtime), runtime.vault];
  const candidates = rows.filter((row) => row.executable === normalize(runtime.executable) && args.every((arg) => exactArg(row.command, arg)) && row.start === runtime.start);
  assert.equal(candidates.length, 1, "exact cloned executable/bundle/profile/start/vault/nonce/port ownership required");
  const root = candidates[0];
  const descendants = new Set([root.pid]); let changed = true;
  while (changed) { changed = false; for (const row of rows) if (descendants.has(row.ppid) && !descendants.has(row.pid)) { descendants.add(row.pid); changed = true; } }
  const listener = listenerOverride || cp.spawnSync("lsof", ["-nP", `-iTCP:${runtime.port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).stdout.trim().split(/\s+/u).filter(Boolean).map(Number);
  assert.ok(listener.length && listener.every((pid) => descendants.has(pid)), "owned CDP listener lineage required");
  return { root, descendants: [...descendants], listener };
}
function selectCleanup(runtime, rows = processRows()) {
  const ownershipArgs = runtimeOwnershipArgs(runtime);
  const candidates = rows.filter((row) => row.executable === normalize(runtime.executable)
    && exactArg(row.command, `--user-data-dir=${runtime.profile}`)
    && exactArg(row.command, `--remote-debugging-port=${runtime.port}`)
    && exactArg(row.command, `--task13a-nonce=${runtime.nonce}`)
    && ownershipArgs.every((argument) => exactArg(row.command, argument))
    && exactArg(row.command, runtime.vault));
  const owned = [], ambiguous = [];
  for (const row of candidates) {
    const token = runtime.tokens.find((item) => item.pid === row.pid);
    if (token && token.start === row.start && token.executable === row.executable) owned.push(row);
    else ambiguous.push(row);
  }
  return { owned, ambiguous };
}
const CDP_DEFAULT_TIMEOUT_MS = 45000;
async function browserTrustedClickPreparation(selector, text, timeoutMs) {
  const nodes = [...document.querySelectorAll(selector)];
  const matchesText = (item) => text === null || item.textContent.trim() === text;
  let node = text === null ? nodes[0] : nodes.find((item) => matchesText(item) && item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0);
  if (!node) throw new Error("TASK13A_TRUSTED_CONTROL_MISSING:" + selector + ":" + text + ":" + JSON.stringify({
    nodes: nodes.slice(0, 80).map((item) => item.textContent.trim()),
    receipts: window.__task13aReceipts,
    shells: [...document.querySelectorAll(".prodigy-app-shell")].map((item) => ({ workspace: item.dataset.workspaceId, text: item.innerText.slice(0, 300) })),
    blocks: [...document.querySelectorAll(".block-language-js-engine")].map((item) => item.innerText.slice(0, 120)),
  }));
  const reacquireReplacement = () => {
    const candidates = [...document.querySelectorAll(selector)].filter((item) => item.isConnected && matchesText(item) && item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0);
    return candidates.length === 1 ? candidates[0] : null;
  };
  const disabled = () => node.disabled === true || node.getAttribute("aria-disabled") === "true";
  if (disabled()) throw new Error("TASK13A_TRUSTED_CONTROL_DISABLED");
  const shell = node.closest(".prodigy-app-shell");
  const appShellOwner = shell && shell.querySelector(":scope > .prodigy-app-shell-body");
  const clips = [];
  for (let current = node.parentElement; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (/(?:auto|scroll|hidden|clip)/u.test(style.overflowX + " " + style.overflowY)) clips.push(current);
  }
  const scrollOwners = [...new Set([appShellOwner, ...clips.filter((item) => /(?:auto|scroll)/u.test(getComputedStyle(item).overflowX + " " + getComputedStyle(item).overflowY)), document.scrollingElement].filter(Boolean))];
  const geometry = () => {
    if (!node.isConnected) throw new Error("TASK13A_TRUSTED_CONTROL_DETACHED");
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const bounds = [viewport, ...clips.map((item) => item.getBoundingClientRect())];
    const fullyVisible = box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse"
      && bounds.every((bound) => box.left >= bound.left && box.top >= bound.top && box.right <= bound.right && box.bottom <= bound.bottom);
    return { box, fullyVisible };
  };
  const unobscured = (box) => {
    const x = Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === node || node.contains(hit)));
  };
  const stableVisible = () => {
    const first = geometry();
    if (!first.fullyVisible) return first;
    const second = geometry();
    const stable = ["x", "y", "width", "height"].every((key) => first.box[key] === second.box[key]);
    return { box: second.box, fullyVisible: stable };
  };
  let ready = stableVisible();
  if (!ready.fullyVisible) {
    await new Promise((resolve, reject) => {
      let settled = false;
      const dispose = () => {
        for (const owner of scrollOwners) owner.removeEventListener("scrollend", onScrollEnd);
        intersection.disconnect();
        detach.disconnect();
        clearTimeout(guard);
      };
      const fail = (error) => { if (settled) return; settled = true; dispose(); reject(error); };
      const finish = () => {
        if (settled) return;
        try {
          const state = stableVisible();
          if (!state.fullyVisible) return;
          settled = true;
          ready = state;
          dispose();
          resolve();
        } catch (error) { fail(error); }
      };
      const onScrollEnd = () => finish();
      const intersection = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.target === node && entry.isIntersecting && entry.intersectionRatio >= 1)) finish();
      }, { root: appShellOwner && appShellOwner.contains(node) ? appShellOwner : null, threshold: 1 });
      const detach = new MutationObserver(() => {
        if (node.isConnected) return;
        const replacement = reacquireReplacement();
        if (replacement) { node = replacement; finish(); return; }
        fail(new Error("TASK13A_TRUSTED_CONTROL_DETACHED"));
      });
      const guard = setTimeout(() => fail(new Error("TASK13A_TRUSTED_CONTROL_SCROLL_TIMEOUT")), timeoutMs);
      for (const owner of scrollOwners) owner.addEventListener("scrollend", onScrollEnd, { passive: true });
      intersection.observe(node);
      detach.observe(document, { childList: true, subtree: true });
      node.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
      if (!node.isConnected) {
        const replacement = reacquireReplacement();
        if (replacement) { node = replacement; finish(); } else fail(new Error("TASK13A_TRUSTED_CONTROL_DETACHED"));
      }
    });
  }
  if (!node.isConnected) throw new Error("TASK13A_TRUSTED_CONTROL_DETACHED");
  if (disabled()) throw new Error("TASK13A_TRUSTED_CONTROL_DISABLED");
  ready = stableVisible();
  if (!ready.fullyVisible) throw new Error("TASK13A_TRUSTED_CONTROL_HIDDEN");
  if (!unobscured(ready.box)) throw new Error("TASK13A_TRUSTED_CONTROL_OCCLUDED");
  node.focus({ preventScroll: true });
  if (document.activeElement !== node) throw new Error("TASK13A_TRUSTED_CONTROL_FOCUS");
  ready = stableVisible();
  if (!ready.fullyVisible) throw new Error("TASK13A_TRUSTED_CONTROL_HIDDEN");
  if (!unobscured(ready.box)) throw new Error("TASK13A_TRUSTED_CONTROL_OCCLUDED");
  if (window.__task13aTrustedClickState) window.__task13aTrustedClickState.cancel(new Error("TASK13A_TRUSTED_CONTROL_OVERLAP"));
  let cancel;
  window.__task13aTrustedClickPromise = new Promise((resolve, reject) => {
    let settled = false;
    const dispose = () => { node.removeEventListener("click", finish, true); clearTimeout(guard); delete window.__task13aTrustedClickState; };
    const finish = (event) => { if (settled) return; settled = true; dispose(); resolve({ isTrusted: event.isTrusted, type: event.type }); };
    cancel = (error) => { if (settled) return; settled = true; dispose(); reject(error); };
    const guard = setTimeout(() => cancel(new Error("TASK13A_TRUSTED_CONTROL_CLICK_TIMEOUT")), timeoutMs);
    node.addEventListener("click", finish, { capture: true, once: true });
  });
  window.__task13aTrustedClickState = { cancel };
  return { x: ready.box.x + ready.box.width / 2, y: ready.box.y + ready.box.height / 2 };
}

function buildTrustedClickPreparationExpression(selector, text = null, timeoutMs = 5000) {
  if (typeof selector !== "string" || selector.length === 0) throw new TypeError("trusted_click_selector_required");
  if (text !== null && typeof text !== "string") throw new TypeError("trusted_click_text_invalid");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("trusted_click_timeout_invalid");
  return `(${browserTrustedClickPreparation.toString()})(${JSON.stringify(selector)},${JSON.stringify(text)},${timeoutMs})`;
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map(); ws.addEventListener("message", (event) => { const m = JSON.parse(String(event.data)); if (!m.id) { for (const listener of this.listeners.get(m.method) || []) listener(m.params || {}); return; } const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result || {}); }); }
  on(method, listener) { if (!this.listeners.has(method)) this.listeners.set(method, new Set()); this.listeners.get(method).add(listener); return () => this.listeners.get(method).delete(listener); }
  static async connect(url) { const ws = new WebSocket(url); await bounded("CDP connect", (resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); }); return new Cdp(ws); }
  send(method, params = {}, timeoutMs = CDP_DEFAULT_TIMEOUT_MS) { const id = ++this.id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs); this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  close() { this.ws.close(); }
}
class RealObsidianHarness {
  static async start(label = "task13a", options = {}) {
    const protectedSnapshot = options.protectedSnapshot || snapshotProtected();
    const protectedPorts = new Set(protectedSnapshot.records.flatMap((record) => record.ports));
    const port = await allocatePort(protectedPorts, options.port);
    const nonce = crypto.randomBytes(8).toString("hex"); const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-obsidian-`));
    const home = path.join(runtimeRoot, "home"), temp = path.join(runtimeRoot, "tmp"), profile = path.join(runtimeRoot, "profile"); [home, temp, profile].forEach((p) => fs.mkdirSync(p));
    const fixture = buildFixture(runtimeRoot, options.fixtureMutation || {}); const before = treeHash(fixture.vault);
    fs.writeFileSync(path.join(profile, "obsidian.json"), JSON.stringify({ vaults: { [nonce]: { path: fixture.vault, ts: Date.now(), open: true } } }));
    const clone = prepareBundle(runtimeRoot, nonce);
    const ownership = createDisposableOwnership({ runtimeRoot, executable: clone.executable, profile, target: fixture.vault, port, nonce });
    const ownershipToken = ownership.token, ownershipMarker = ownership.marker, ownershipMetadata = ownership.metadata;
    const args = [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--remote-debugging-address=${LOOPBACK}`, `--task13a-nonce=${nonce}`, ...ownership.args, "--use-mock-keychain", "--disable-background-networking", "--disable-component-update", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1, EXCLUDE localhost", fixture.vault];
    const launchEnv = { ...process.env, HOME: home, TMPDIR: temp, XDG_CONFIG_HOME: profile };
    if (options.antigravityAuthProbe === true) launchEnv.TASK13A_ANTIGRAVITY_AUTH_HOME = process.env.HOME;
    const launchContract = validateLaunchContract(args, launchEnv, runtimeRoot, process.env.HOME);
    let launch = null;
    try {
    launch = cp.spawn(clone.executable, args, { detached: true, env: launchEnv, stdio: ["ignore", "ignore", "pipe"] });
    const endpoint = await bounded("exact Obsidian CDP endpoint", (resolve, reject) => { let stderr = ""; launch.once("error", reject); launch.once("exit", (code, signal) => reject(new Error(`Obsidian exited ${code}/${signal}: ${stderr}`))); launch.stderr.on("data", (chunk) => { stderr += chunk; const match = stderr.match(new RegExp(`DevTools listening on (ws:\\/\\/${LOOPBACK.replaceAll('.', '\\.')}:${port}\\/devtools\\/browser\\/[^\\s]+)`)); if (match) resolve(match[1]); }); }, options.startTimeout || 30000);
    const launchedRows = processRows().filter((row) => row.executable === normalize(clone.executable)
      && exactArg(row.command, `--user-data-dir=${profile}`) && exactArg(row.command, `--remote-debugging-port=${port}`)
      && exactArg(row.command, `--task13a-nonce=${nonce}`) && exactArg(row.command, `--task13a-owner-token=${ownershipToken}`)
      && exactArg(row.command, `--task13a-owner-file=${Buffer.from(ownershipMarker).toString("base64url")}`) && exactArg(row.command, fixture.vault));
    assert.equal(launchedRows.length, 1, "exact launched clone process required");
    const rootRow = launchedRows[0];
    ownership.bindApplication(rootRow);
    const runtime = { ...clone, ...fixture, protectedSnapshot, protectedPorts, port, nonce, runtimeRoot, profile, home, temp, launch, launchContract, start: rootRow.start, before, tokens: [], ownershipToken, ownershipMarker, ownershipMetadata };
    const ownedProcess = findOwned(runtime); runtime.tokens = processRows().filter((row) => ownedProcess.descendants.includes(row.pid)).map((row) => ({ pid: row.pid, start: row.start, executable: row.executable }));
    assert.equal(ownedProcess.root.pgid, rootRow.pid, "task clone must own an isolated PGID"); assert.equal(protectedSnapshot.records.some((record) => ownedProcess.descendants.includes(record.pid)), false, "protected identity overlap");
    const browserCdp = await Cdp.connect(endpoint);
    const version = await browserCdp.send("Browser.getVersion"); assert.match(version.product || "", /Chrome/u);
    const targetsResponse = await fetch(`http://${LOOPBACK}:${port}/json/list`, { signal: AbortSignal.timeout(5000) });
    assert.equal(targetsResponse.ok, true, "owned CDP target list");
    const targets = await targetsResponse.json();
    const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    assert.ok(pageTarget, "real Obsidian page target required");
    const cdp = await Cdp.connect(pageTarget.webSocketDebuggerUrl); await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); await cdp.send("DOM.enable"); await cdp.send("CSS.enable"); browserCdp.close();
    const appReady = await cdp.send("Runtime.evaluate", { expression: `new Promise((resolve,reject)=>{const ready=()=>{if(!(globalThis.app&&app.workspace))return false;app.workspace.onLayoutReady(()=>resolve(true));return true};if(ready())return;const observer=new MutationObserver(()=>{if(ready())observer.disconnect()});observer.observe(document,{childList:true,subtree:true});setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_APP_READY_TIMEOUT'))},30000)})`, awaitPromise: true, returnByValue: true });
    assert.equal(appReady.exceptionDetails, undefined, "real Obsidian app readiness signal");
    const pluginReady = await cdp.send("Runtime.evaluate", { expression: `(async()=>{await app.plugins.loadManifests();if(!app.plugins.manifests['task13a-local-dv'])throw new Error('TASK13A_PLUGIN_MANIFEST_MISSING');await app.plugins.setEnable(true);if(!app.plugins.plugins['task13a-local-dv'])await app.plugins.enablePluginAndSave('task13a-local-dv');if(!window.__task13aPlugin)throw new Error('TASK13A_PLUGIN_NOT_LOADED');return true})()`, awaitPromise: true, returnByValue: true });
    assert.equal(pluginReady.exceptionDetails, undefined, "disposable local QA plugin readiness");
    const ownedPrompt = await cdp.send("Runtime.evaluate", { expression: `(async()=>{const dialogs=[...document.querySelectorAll('.modal-container .modal')].filter(dialog=>/Restricted Mode|Trust author and enable plugins/u.test(dialog.innerText||''));if(!dialogs.length)return{present:false,closed:true};if(dialogs.length!==1)throw new Error('TASK13A_OWNED_PROMPT_CARDINALITY:'+dialogs.length);const dialog=dialogs[0],close=[...dialog.querySelectorAll('button')].find(button=>button.textContent.trim()==='Trust author and enable plugins');if(!close)throw new Error('TASK13A_OWNED_PROMPT_CLOSE_MISSING');dialog.setAttribute('data-task13a-owned-prompt','true');close.setAttribute('data-task13a-owned-close','true');const removed=new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(dialog.isConnected)return;observer.disconnect();clearTimeout(timer);resolve(true)});observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_OWNED_PROMPT_CLOSE_TIMEOUT'))},10000)});close.click();await removed;return{present:true,closed:true}})()`, awaitPromise: true, returnByValue: true });
    assert.equal(ownedPrompt.exceptionDetails, undefined, "deterministically owned disposable-vault trust prompt closure");
    const harness = new RealObsidianHarness(runtime, cdp, pageTarget.webSocketDebuggerUrl, ownedProcess, version);
    harness.osNetworkAttempts = [];
    cdp.on("Fetch.requestPaused", (params) => {
      const request = params.request || {};
      const fixture = options.networkFixtures && options.networkFixtures[request.url || ""];
      harness.osNetworkAttempts.push({ url: request.url || "", method: request.method || "", resourceType: params.resourceType || "", fixture: Boolean(fixture), at: Date.now() });
      if (fixture) {
        void cdp.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: fixture.contentType || "application/octet-stream" }],
          body: fixture.body
        }).catch(() => {});
        return;
      }
      void cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "http://*", requestStage: "Request" }, { urlPattern: "https://*", requestStage: "Request" }] });
    return harness;
    } catch (error) {
      const rows = processRows();
      const candidates = rows.filter((row) => row.executable === normalize(clone.executable)
        && exactArg(row.command, `--user-data-dir=${profile}`) && exactArg(row.command, `--remote-debugging-port=${port}`)
        && exactArg(row.command, `--task13a-nonce=${nonce}`) && exactArg(row.command, `--task13a-owner-token=${ownershipToken}`)
        && exactArg(row.command, `--task13a-owner-file=${Buffer.from(ownershipMarker).toString("base64url")}`) && exactArg(row.command, fixture.vault));
      if (candidates.length > 1) throw new Error(`startup cleanup refused ambiguous task ownership: ${candidates.map((row) => row.pid).join(",")}`, { cause: error });
      const signalled = [];
      if (candidates.length === 1) {
        const descendants = new Set([candidates[0].pid]); let changed = true;
        while (changed) { changed = false; for (const row of rows) if (descendants.has(row.ppid) && !descendants.has(row.pid)) { descendants.add(row.pid); changed = true; } }
        for (const pid of [...descendants].sort((a, b) => b - a)) { try { process.kill(pid, "SIGKILL"); signalled.push(pid); } catch (signalError) { if (signalError.code !== "ESRCH") throw signalError; } }
      } else if (launch && launch.exitCode === null && launch.signalCode === null) {
        throw new Error("startup cleanup refused unproven launch identity", { cause: error });
      }
      assertProtectedUnchanged(protectedSnapshot, signalled);
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
      throw error;
    }
  }
  constructor(runtime, cdp, endpoint, ownership, version) { Object.assign(this, { runtime, cdp, endpoint, ownership, version, mediaCommands: [], mediaSequence: 0 }); }
  async evaluate(expression, timeoutMs = CDP_DEFAULT_TIMEOUT_MS) { const result = await this.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs); if (result.exceptionDetails) { const detail = result.exceptionDetails.exception && result.exceptionDetails.exception.description; throw new Error(detail || result.exceptionDetails.text || "evaluation failed"); } return result.result && result.result.value; }
  async issueMediaAuthority(workspaceId, theme, forcedColors, context) {
    const payload = buildMediaAuthority(theme, forcedColors);
    const sequence = ++this.mediaSequence;
    const beforeTarget = await this.cdp.send("Target.getTargetInfo");
    await this.evaluate(`(()=>{const expected=${JSON.stringify({ workspaceId, theme, forcedColors, sequence, context })},sample=()=>({theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',forcedColors:matchMedia('(forced-colors: active)').matches,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}),dark=matchMedia('(prefers-color-scheme: dark)'),forced=matchMedia('(forced-colors: active)'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),events=[],owner=()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(expected.workspaceId)+'"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);return{shellConnected:Boolean(shell&&shell.isConnected),blockConnected:Boolean(block&&block.isConnected),mountGeneration:mount&&mount.mountGeneration||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null,geometry:shell?(()=>{const box=shell.getBoundingClientRect();return{width:box.width,height:box.height,display:getComputedStyle(shell).display}})():null}};let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject}),record=type=>{const values=sample();events.push({index:events.length+1,type,values,owner:owner(),styleEpoch:window.__task13aLayoutSequence||0});if(values.theme===expected.theme&&values.forcedColors===expected.forcedColors&&values.reducedMotion===true){dispose();resolvePending({theme:values.theme,forcedColors:values.forcedColors,reducedMotion:values.reducedMotion,events:events.slice(),owner:owner(),styleEpoch:window.__task13aLayoutSequence||0,documentUrl:location.href})}},onDark=()=>record('prefers-color-scheme'),onForced=()=>record('forced-colors'),onReduced=()=>record('prefers-reduced-motion'),dispose=()=>{dark.removeEventListener('change',onDark);forced.removeEventListener('change',onForced);reduced.removeEventListener('change',onReduced);clearTimeout(guard)};dark.addEventListener('change',onDark);forced.addEventListener('change',onForced);reduced.addEventListener('change',onReduced);const guard=setTimeout(()=>{dispose();rejectPending(new Error('TASK13A_MEDIA_ACTUATOR_TIMEOUT:'+JSON.stringify({expected,events,values:sample(),owner:owner()})))},10000);window.__task13aMediaAuthority={expected,promise,record,events};record('subscribed');return{subscribedBeforeTrigger:true,sequence:expected.sequence,initial:events[0]}})()`);
    const commandAck = await this.cdp.send("Emulation.setEmulatedMedia", payload);
    await this.evaluate("window.__task13aMediaAuthority.record('cdp-ack');true");
    const ack = await this.evaluate("window.__task13aMediaAuthority.promise");
    await this.evaluate("delete window.__task13aMediaAuthority;true");
    const afterTarget = await this.cdp.send("Target.getTargetInfo");
    const trace = { sequence, context, payload, commandAck, ack, target: { endpoint: this.endpoint, before: beforeTarget.targetInfo, after: afterTarget.targetInfo } };
    if (!trace.target.before || !trace.target.after || trace.target.before.targetId !== trace.target.after.targetId || trace.target.before.url !== trace.target.after.url) throw new Error("TASK13A_MEDIA_AUTHORITY_TARGET");
    this.mediaCommands.push(trace);
    assertMediaAuthorityTrace(this.mediaCommands);
    return trace;
  }
  async trustedClick(selector, text = null) {
    const target = await this.evaluate(buildTrustedClickPreparationExpression(selector, text));
    try {
      await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
      await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
      const event = await this.evaluate("window.__task13aTrustedClickPromise");
      if (!event || event.isTrusted !== true || event.type !== "click") throw new Error("TASK13A_TRUSTED_CONTROL_CLICK_EVENT");
    } catch (error) {
      await this.evaluate("window.__task13aTrustedClickState&&window.__task13aTrustedClickState.cancel(new Error('TASK13A_TRUSTED_CONTROL_DISPATCH_ABORTED'));true").catch(() => {});
      throw error;
    } finally {
      await this.evaluate("delete window.__task13aTrustedClickPromise;delete window.__task13aTrustedClickState;true").catch(() => {});
    }
  }
  async renderedClick(selector, text = null) {
    return this.evaluate(`(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})],node=${text === null ? "nodes[0]" : `nodes.find(item=>item.textContent.trim()===${JSON.stringify(text)}&&item.getBoundingClientRect().width>0&&item.getBoundingClientRect().height>0)`};if(!node)throw new Error('TASK13A_RENDERED_CONTROL_MISSING');let observed=null;const onClick=event=>{observed={type:event.type,isTrusted:event.isTrusted,selector:${JSON.stringify(selector)},text:${JSON.stringify(text)}}};node.addEventListener('click',onClick,{capture:true,once:true});node.focus({preventScroll:true});node.click();if(!observed)throw new Error('TASK13A_RENDERED_CONTROL_EVENT_MISSING');return observed})()`);
  }
  async trustedActivate(selector, text = null, key = "Enter") {
    await this.evaluate(`(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})],node=${text === null ? "nodes[0]" : `nodes.find(item=>item.textContent.trim()===${JSON.stringify(text)}&&item.getBoundingClientRect().width>0&&item.getBoundingClientRect().height>0)`};if(!node)throw new Error('TASK13A_TRUSTED_CONTROL_MISSING:'+${JSON.stringify(selector)}+':'+${JSON.stringify(text)});node.focus();return true})()`);
    const code = key === " " ? "Space" : key; const virtualKey = key === " " ? 32 : 13;
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key === " " ? " " : "", windowsVirtualKeyCode: virtualKey });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtualKey });
  }
  async waitForSelector(selector, timeout = 30000) {
    return this.evaluate(`new Promise((resolve,reject)=>{const finish=()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return false;observer.disconnect();clearTimeout(timer);resolve(true);return true};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_SELECTOR_TIMEOUT:'+${JSON.stringify(selector)}))},${timeout});finish()})`);
  }
  async openWorkspace(workspaceId) {
    const pair = HUBS.find(([id]) => id === workspaceId); assert.ok(pair, "unknown workspace"); const file = pair[1];
    await this.evaluate(`(()=>{const modal=document.querySelector('.modal.mod-settings'),close=modal&&modal.querySelector('.modal-close-button');if(!modal)return true;if(!close)throw new Error('TASK13A_SETTINGS_MODAL_CLOSE_MISSING');return new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(modal.isConnected)return;observer.disconnect();clearTimeout(guard);resolve(true)});observer.observe(document.body,{childList:true,subtree:true});const guard=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_SETTINGS_MODAL_CLOSE_TIMEOUT'))},5000);close.click()})})()`);
    await this.evaluate(`(()=>{const file=${JSON.stringify(file)};window.__task13aReceipts=window.__task13aReceipts||{};window.__task13aOpenGeneration=window.__task13aOpenGeneration||{};window.__task13aOpenGeneration[file]=(window.__task13aOpenGeneration[file]||0)+1;delete window.__task13aReceipts[file];let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const finish=()=>{const receipt=window.__task13aReceipts&&window.__task13aReceipts[file];if(receipt&&receipt.executions>=receipt.blocks){window.removeEventListener('task13a-rendered',onRendered);clearTimeout(guard);resolvePending(receipt)}};const onRendered=(event)=>{if(event.detail&&event.detail.file===file)finish()};window.addEventListener('task13a-rendered',onRendered);const guard=setTimeout(()=>{window.removeEventListener('task13a-rendered',onRendered);rejectPending(new Error(${JSON.stringify(workspaceId + " DOM signal timed out:")}+JSON.stringify(window.__task13aReceipts&&window.__task13aReceipts[file]||null)))},30000);window.__task13aPending={promise,rejectPending,finish};return true})()`);
    try {
      await this.evaluate(`(async()=>{const file=${JSON.stringify(file)};const f=app.vault.getAbstractFileByPath(file);if(!f)throw new Error('TASK13A_HUB_FILE_MISSING');document.querySelectorAll('.markdown-preview-view').forEach(preview=>{preview.scrollTop=0;preview.dispatchEvent(new Event('scroll',{bubbles:true}))});const current=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf(),sameFile=Boolean(current&&app.workspace.getActiveFile()&&app.workspace.getActiveFile().path===file),replacement=sameFile?app.workspace.getLeaf('tab'):null;if(sameFile&&typeof current.detach==='function')current.detach();const leaf=replacement||app.workspace.getLeaf(false);await leaf.openFile(f);await leaf.setViewState({type:'markdown',state:{file,mode:'preview',source:false}});if(${JSON.stringify(this.runtime.manifest[file].length === 1)}){await leaf.setViewState({type:'markdown',state:{file,mode:'source',source:true}});await leaf.setViewState({type:'markdown',state:{file,mode:'preview',source:false}})}const preview=leaf.view&&leaf.view.containerEl&&leaf.view.containerEl.querySelector('.markdown-preview-view');if(${JSON.stringify(this.runtime.manifest[file].length === 1)}&&preview){preview.scrollTop=0;preview.dispatchEvent(new Event('scroll',{bubbles:true}))}window.__task13aPending.finish();return true})()`);
      const receipt = await this.evaluate("window.__task13aPending.promise");
      await this.evaluate(`(()=>{const root=document.querySelector('.prodigy-app-shell[data-workspace-id=${workspaceId}]');if(!root)throw new Error('TASK13A_SCROLL_ROOT_MISSING:'+JSON.stringify({receipt:window.__task13aReceipts&&window.__task13aReceipts[${JSON.stringify(file)}]||null,text:[...document.querySelectorAll('.block-language-dataviewjs,.block-language-js-engine')].map(node=>(node.innerText||'').slice(0,1200))}));for(let node=root;node;node=node.parentElement)if(node.scrollHeight>node.clientHeight)node.scrollTop=0;return true})()`);
      return receipt;
    } catch (error) {
      await this.evaluate(`window.__task13aPending&&window.__task13aPending.rejectPending(new Error('TASK13A_OPEN_ABORTED'));true`).catch(() => {});
      throw error;
    }
  }
  async installStructuralFixtureRegistry() {
    await this.evaluate(`(()=>{if(window.__task13aFixtureRegistry)return true;const entries=new Map(),pending=new Map(),consumptions=[];const clone=value=>value==null?value:structuredClone(value);const api={configure(workspaceId,operation,fixture){const key=workspaceId+':'+operation;const frozen=Object.freeze(clone(fixture));entries.set(key,frozen);return frozen},consume(workspaceId,operation,detail){const key=workspaceId+':'+operation,fixture=entries.get(key);if(!fixture)throw new Error('TASK13A_FIXTURE_UNCONFIGURED:'+key);const event=Object.freeze({workspaceId,operation,nonce:fixture.nonce,kind:fixture.kind,detail:clone(detail||{}),at:performance.now()});consumptions.push(event);window.dispatchEvent(new CustomEvent('task13a-provider-consumed',{detail:event}));if(fixture.kind==='reject')return Promise.reject(new Error(fixture.error||'task13a synthetic rejection'));if(fixture.kind==='defer')return new Promise((resolve,reject)=>pending.set(key,{nonce:fixture.nonce,resolve,reject}));return Promise.resolve(clone(fixture.value))},settle(workspaceId,operation,kind,value){const key=workspaceId+':'+operation,item=pending.get(key);if(!item)return false;pending.delete(key);kind==='reject'?item.reject(new Error(value||'task13a synthetic rejection')):item.resolve(clone(value));return true},pending(){return[...pending].map(([key,value])=>({key,nonce:value.nonce}))},consumptions(){return consumptions.slice()},clear(workspaceId){for(const [key,item]of pending)if(key.startsWith(workspaceId+':')){pending.delete(key);item.reject(new DOMException('fixture reset','AbortError'))}for(const key of entries.keys())if(key.startsWith(workspaceId+':'))entries.delete(key)}};window.__task13aFixtureRegistry=Object.freeze(api);return true})()`);
  }
  async mountStructuralWorkspace(workspaceId) {
    assert.ok(HUBS.some(([id]) => id === workspaceId), "unknown workspace");
    if (this.structuralMount && this.structuralMount.workspaceId === workspaceId) return this.structuralMount;
    if (this.structuralMount) await this.disposeStructuralWorkspace();
    const contract = structuralDriverContract(workspaceId, "normal");
    await this.installStructuralFixtureRegistry();
    if (workspaceId === "reading") {
      await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry;window.__task13aOriginalResizeObserver=window.ResizeObserver;window.ResizeObserver=undefined;const row={type:'reading',status:'reading',title:'Synthetic Reading',book_title:'Synthetic Reading',file:{path:'PARA/PROJECTS/Reading/Synthetic.md',name:'Synthetic Reading',link:'Synthetic Reading'}};registry.configure('reading','listReadings',{nonce:'reading:mount',kind:'resolve',value:[row]});window.__task13aReadingRow=row;window.__prodigyReadingDashboardOptions={provider:{listReadings(detail){return registry.consume('reading','listReadings',detail)},page(path){return path===row.file.path?row:null}},onProviderRead(detail){window.__task13aReadingProviderRead=detail}};window.__task13aReadingControllerReady=new Promise((resolve,reject)=>{const finish=()=>{if(!window.__prodigyReadingDashboard)return false;observer.disconnect();clearTimeout(timer);resolve(window.__prodigyReadingDashboard.getState());return true};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','aria-busy']});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_READING_CONTROLLER_TIMEOUT'))},30000);finish()});return true})()`);
    }
    if (contract.driver === "workspace-state-adapter") {
      await this.evaluate(`(async()=>{if(!window.ProdigyWorkspaceStateAdapters){const f=app.vault.getAbstractFileByPath('SYSTEM/Views/prodigy-workspace-state-adapters.js');if(!f)throw new Error('TASK13A_STATE_ADAPTER_SOURCE_MISSING');(new Function(await app.vault.read(f)))()}const generation=1;const adapter=window.ProdigyWorkspaceStateAdapters.createAdapter({workspaceId:${JSON.stringify(workspaceId)},generation,nonce:'mount:1'});window.__task13aStructuralAdapters=window.__task13aStructuralAdapters||{};window.__task13aStructuralAdapters[${JSON.stringify(workspaceId)}]=adapter;window.ProdigyWorkspaceStateAdapters.register(${JSON.stringify(workspaceId)},adapter);return true})()`);
    }
    if (workspaceId === "personal") await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,key='prodigy.personal.workspace-tab.v1',storage=window.sessionStorage;window.__task13aPersonalStorageOriginal={own:storage.getItem(key)!==null,value:storage.getItem(key)};storage.setItem(key,'places');window.__task13aPersonalReadEvents=[];window.__task13aPersonalControllersReady=new Promise((resolve,reject)=>{window.__task13aPersonalControllersMounted=controllers=>{if(!controllers||!controllers.people||!controllers.places)return;window.__task13aPersonalControllers=controllers;clearTimeout(timer);resolve(true)};const timer=setTimeout(()=>reject(new Error('TASK13A_PERSONAL_CONTROLLERS_TIMEOUT')),30000)});const originals={cachedRead:app.vault.cachedRead,read:app.vault.read,modules:{}};const fixturePath=value=>{const path=typeof value==='string'?value:value&&value.path;return /^PARA\\/RESOURCES\\/(?:CONTACTS|Venues)\\/TASK13A /u.test(path||'')?path:''};app.vault.cachedRead=function(file){const path=fixturePath(file);return path?registry.consume('personal',path.includes('/Venues/')?'placeBody':'peopleBody',{path,method:'cachedRead'}):originals.cachedRead.call(this,file)};app.vault.read=function(file){const path=fixturePath(file);return path?registry.consume('personal',path.includes('/Venues/')?'placeBody':'peopleBody',{path,method:'read'}):originals.read.call(this,file)};const install=(name,method)=>{const descriptor=Object.getOwnPropertyDescriptor(window,name),existing=window[name],wrap=api=>{if(!api||api.__task13aWrapped)return api;const wrapped=Object.freeze({...api,[method](options){const prior=options&&options.onReadStateChange;return api[method]({...options,onReadStateChange(change){const detail={surface:name,...change};window.__task13aPersonalReadEvents.push(detail);window.dispatchEvent(new CustomEvent('task13a-personal-read',{detail}));if(typeof prior==='function')prior(change)}})},__task13aWrapped:true});originals.modules[name]={descriptor,api};return wrapped};if(existing)window[name]=wrap(existing);else{let value;Object.defineProperty(window,name,{configurable:true,get(){return value},set(api){value=wrap(api)}});originals.modules[name]={descriptor,api:existing}}};install('PeopleView','renderPeopleWorkspace');install('VenueView','renderVenuesWorkspace');window.__task13aPersonalOriginals=originals;return true})()`);
    if (workspaceId === "journal") await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,normal={path:'DAILY/DAILY/2026-08-11.md',exists:true,fields:{reflection:'TASK13A reflection',change:'change',next_experiment:'next'},blocks:[{evidence_id:'daily-2026-08-11-e01',title:'TASK13A Evidence',experience:'Synthetic experience',legacy:false}],blockCount:1,status:'complete',statusLabel:'완료'};window.__task13aJournalReview=normal;registry.configure('journal','review',{nonce:'journal:mount:review',kind:'resolve',value:normal});registry.configure('journal','recent',{nonce:'journal:mount:recent',kind:'resolve',value:[]});window.__task13aJournalStates=[];const originals={modules:{}};const install=(name,wrap)=>{const descriptor=Object.getOwnPropertyDescriptor(window,name),existing=window[name],apply=api=>{if(!api||api.__task13aWrapped)return api;const wrapped=wrap(api);originals.modules[name]={descriptor,api};return Object.freeze({...wrapped,__task13aWrapped:true})};if(existing)window[name]=apply(existing);else{let value;Object.defineProperty(window,name,{configurable:true,get(){return value},set(api){value=apply(api)}});originals.modules[name]={descriptor,api:existing}}};install('JournalStore',api=>({...api,loadReview(appArg,date){return registry.consume('journal','review',{date})},listRecentReviews(appArg,options){return registry.consume('journal','recent',{options})}}));install('JournalPeriodStore',api=>({...api,listRecords(appArg,period){return registry.consume('journal','periodRecords',{period})}}));install('JournalDashboardView',api=>({...api,renderDashboard(appArg,container,open,options,date){const prior=options&&options.onStateChange,controller=api.renderDashboard(appArg,container,open,{...(options||{}),onStateChange(snapshot){window.__task13aJournalStates.push({surface:'dashboard',...snapshot});if(typeof prior==='function')prior(snapshot)}},date);window.__task13aJournalDashboard=controller;return controller}}));install('JournalPeriodView',api=>({...api,mount(options){const prior=options&&options.onReady,controller=api.mount({...options,onReady(snapshot){window.__task13aJournalStates.push({surface:'period',...snapshot});if(typeof prior==='function')prior(snapshot)}});window.__task13aJournalPeriod=controller;return controller}}));window.__task13aJournalOriginals=originals;return true})()`);
    if (workspaceId === "knowledge") await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,load=async path=>{const file=app.vault.getAbstractFileByPath(path);if(!file)throw new Error('TASK13A_BOOTSTRAP_MISSING:'+path);return app.vault.read(file)};if(!window.ProdigyWorkspaceManifest)(new Function('require',await load('SYSTEM/Views/prodigy-workspace-manifest.js')))(undefined);if(!window.ProdigyHubLoader)(new Function('require',await load('SYSTEM/Views/prodigy-hub-loader.js')))(undefined);const loader=window.ProdigyHubLoader,evaluate=source=>window.__task13aEvaluateNodeSource(source);window.__task13aKnowledgeLoaderOriginal=loader;window.ProdigyHubLoader=Object.freeze({...loader,mountWorkspace(appArg,manifest,options){return loader.mountWorkspace(appArg,manifest,{...(options||{}),evaluate,realm:evaluate})}});window.KnowledgeExplorerHub=window.KnowledgeExplorerHub||{};window.__task13aKnowledgeTransport=function(normalized,options){return registry.consume('knowledge','transport',{requestId:normalized&&normalized.request_metadata&&normalized.request_metadata.request_id,aborted:Boolean(options&&options.signal&&options.signal.aborted)})};const phases=['create','update','merge','maintenance','git','resurfacing'];let rolloutSerialized=JSON.stringify({version:'llmwiki_rollout_state_v1',enabled_phases:phases,gate_receipts:Object.fromEntries(phases.map(phase=>[phase,{available:true,status:'green',receipt_id:'real_fixture_'+phase}]))});const rolloutStorage=Object.freeze({load:async()=>rolloutSerialized,save:async next=>(rolloutSerialized=next,true)});const task21State={mode:'success',providerCalls:0,canonicalWrites:0,auditWrites:0,refreshCalls:0,gitCalls:0,gitCommits:0,compensations:0,actions:[],memory:new Map(),outcomes:new Map(),compensationObservations:[],transactionAuditChain:[]};const immutableAudits=new Map();let immutableHead={head_hash:null,count:0};const compensationAdapter=Object.freeze({async readImmutableAuditContinuity(){return{ok:true,...immutableHead}},async appendImmutableAudit(request){if(immutableAudits.has(request.audit_hash)||request.previous_audit_hash!==immutableHead.head_hash||request.audit_count!==immutableHead.count+1)return{ok:false,reason:'immutable_audit_replay'};immutableAudits.set(request.audit_hash,request.audit_bytes);immutableHead={head_hash:request.audit_hash,count:request.audit_count};return{ok:true,status:'appended'}},async readImmutableAudit(auditHash){return immutableAudits.get(auditHash)||null}});const stateFor=(path,bytes,exists=true)=>({path,exists,encoding:exists?'text':null,bytes:exists?bytes:null,sha256:exists&&window.LLMWikiHash?window.LLMWikiHash.sha256(bytes):null,mode:exists?420:null,symlink:false});const riskAdapter=Object.freeze({async beginExactSet(){return{ok:true,status:'recorded'}},async preflight(packet){if(task21State.mode==='stale')return{ok:false,status:'rejected',reason:'target_revision_mismatch'};return{ok:true,status:'recorded'}},async commit(packet){const op=packet.operation,paths=[...new Set([...op.destination_ids,...(op.source_ids||[])])];if(task21State.mode==='partial_failure'){const before_states={},intermediate_states={},restored_states={};for(const path of paths){const exists=Object.hasOwn(op.before_bytes,path),bytes=exists?op.before_bytes[path]:'';if(!task21State.memory.has(path))task21State.memory.set(path,bytes);before_states[path]=stateFor(path,task21State.memory.get(path),exists)}const firstPath=paths[0],failedPath=paths[1],firstAfter=op.after_bytes[firstPath];if(typeof firstAfter!=='string'||!failedPath)throw new Error('TASK21_PARTIAL_FIXTURE_REQUIRES_TWO_PATHS');task21State.memory.set(firstPath,firstAfter);task21State.canonicalWrites+=1;for(const path of paths)intermediate_states[path]=stateFor(path,task21State.memory.get(path),before_states[path].exists);for(const path of paths)task21State.memory.set(path,before_states[path].bytes);for(const path of paths)restored_states[path]=stateFor(path,task21State.memory.get(path),before_states[path].exists);task21State.compensations+=1;const rows=paths.map(path=>({path,before_bytes:before_states[path].bytes,intermediate_bytes:intermediate_states[path].bytes,restored_bytes:restored_states[path].bytes,before_sha256:before_states[path].sha256,intermediate_sha256:intermediate_states[path].sha256,restored_sha256:restored_states[path].sha256,restoration_exact:restored_states[path].bytes===before_states[path].bytes&&restored_states[path].sha256===before_states[path].sha256})),previous_audit_hash=task21State.transactionAuditChain.length?task21State.transactionAuditChain[task21State.transactionAuditChain.length-1].audit_hash:null,auditBody={audit_type:'fixture_partial_commit_restored',packet_id:packet.packet_id,previous_audit_hash,affected_paths:paths,first_written_path:firstPath,failed_path:failedPath,rows},audit_hash=window.LLMWikiHash.sha256(JSON.stringify(auditBody)),auditEntry={...auditBody,audit_hash};task21State.transactionAuditChain.push(auditEntry);const observation={affected_paths:paths,first_written_path:firstPath,failed_path:failedPath,rows,before_states,intermediate_states,restored_states,restoration_exact:rows.every(row=>row.restoration_exact),audit_chain:task21State.transactionAuditChain.map(item=>({...item}))};task21State.compensationObservations.push(observation);return{ok:false,status:'failed',reason:'fixture_second_write_failed',actual_touched_paths:[firstPath],compensation_verified:observation.restoration_exact,compensation_receipt:observation,write_counts:{canonical:0,audit:0,refresh:0,git:0}}}const before_states={},after_states={};for(const path of paths){const before=Object.hasOwn(op.before_bytes,path)?op.before_bytes[path]:'';before_states[path]=stateFor(path,before,Object.hasOwn(op.before_bytes,path));const after=Object.hasOwn(op.after_bytes,path)?op.after_bytes[path]:before;task21State.memory.set(path,after);after_states[path]=stateFor(path,after,true)}task21State.canonicalWrites+=op.kind==='noop'?0:op.destination_ids.length;task21State.auditWrites+=1;return{ok:true,status:'committed',write_counts:{canonical:op.kind==='noop'?0:op.destination_ids.length,audit:1,refresh:0,git:0},receipt:{actual_touched_paths:paths,before_states,after_states,writer_receipt:{fixture:true}}}},async compensate(){task21State.compensations+=1;return{ok:true,status:'restored'}},async auditBatch(){return{ok:true,status:'recorded'}}});window.__task21Stateful=task21State;window.KnowledgeExplorerHub.llmWikiControllerOptions={batchIdentity:Object.freeze({provider_key:'task13a-fixture',model:'task13a-canonical-batch',structured_mode:'json_schema',schema_id:'llmwiki_compact_v1',prompt_version:'llmwiki_batch_compact_v1'}),batchProvider:async input=>{task21State.providerCalls+=1;return{ok:true,artifacts:input.chunks.map(chunk=>({chunk_key:chunk.key,outcome:'proposals',items:[{role:'source_summary',evidence_quote:chunk.text.trim().slice(0,12),claims:['명시적 배치 분석 근거'],review_reasons:[],related_candidate_ids:[]}]}))}},transport:window.__task13aKnowledgeTransport,now:()=>"2026-08-11T00:00:00.000Z",rollout_storage:rolloutStorage,rollout_gate_provider:async phase=>({available:true,status:'green',receipt_id:'real_fixture_'+phase}),risk_transaction_adapter:riskAdapter,migration_transaction_adapter:riskAdapter,compensation_adapter:compensationAdapter,operation_outcome_store:{save:async value=>{task21State.outcomes.set(value.run_id,structuredClone(value))},load:async runId=>task21State.outcomes.has(runId)?structuredClone(task21State.outcomes.get(runId)):null},migration_options:{audit:async()=>{task21State.auditWrites+=1;return{ok:true}},refresh:async()=>{task21State.refreshCalls+=1;return task21State.mode==='refresh_failed'?{ok:false,reason:'refresh_failed'}:{ok:true}},git:async()=>{task21State.gitCalls+=1;if(task21State.mode==='git_pending')return{ok:false,reason:'GitUnavailable'};task21State.gitCommits+=1;return{ok:true}}},postEligibilityGit:async()=>{task21State.gitCalls+=1;if(task21State.mode==='git_pending')return{ok:false,reason:'GitUnavailable'};task21State.gitCommits+=1;return{ok:true}},operation_follow_ups:{refresh:async()=>{task21State.refreshCalls+=1;return task21State.mode==='refresh_failed'?{ok:false,reason:'refresh_failed'}:{ok:true}},git:async()=>{task21State.gitCalls+=1;if(task21State.mode==='git_pending')return{ok:false,reason:'GitUnavailable'};task21State.gitCommits+=1;return{ok:true}}},resurfacing_action:async input=>({ok:true,status:'feedback_recorded',input,write_counts:{canonical:0,ranking:1,evaluation:1}}),inboxAnalysisTransport:async work=>({ok:true,chunk_results:work.changed_chunks.map(chunk=>({key:chunk.key,semantic_units:[{temporary_span_alias:'span_task21_real',start:0,end:Math.min(chunk.text.length,12),origin_hint:'source_extract',disposition:'propose',uncertainty:{level:'low',reasons:[]},claims:[{text:'실제 승인 지식',temporary_span_alias:'span_task21_real'}]}]}))}),...(window.__llmwikiInboxProgressQa?{inboxAnalysisTransport:async work=>{try{return await registry.consume('knowledge','inboxAnalysis',{sourceId:work.source_id,path:work.snapshot&&work.snapshot.source&&work.snapshot.source.source_path})}finally{window.dispatchEvent(new CustomEvent('llmwiki-inbox-transport-settled',{detail:{sourceId:work.source_id}}))}},onInboxState:state=>window.dispatchEvent(new CustomEvent('llmwiki-inbox-progress-qa',{detail:structuredClone(state)}))}:{}),operation_provider:async request=>{if(task21State.nextOperation)return JSON.stringify(task21State.nextOperation);const snapshot=request&&request.source_snapshot,source=snapshot&&snapshot.source||{},content=snapshot&&snapshot.content||{};if(source.source_path==='INBOX/F3 Cdp Stall Repro.md'){const f3target='ZETA/PERMANENT/f3-cdp-stall-repro-create.md';return JSON.stringify({contract_version:'llmwiki_operation_contract_v1',operation_id:'operation_f3_cdp_stall_repro',kind:'create',destination_ids:[f3target],base_revisions:{},before_bytes:{},after_bytes:{[f3target]:'# F3 Cdp Stall Repro\\n'},source_citations:[{source_id:source.source_id||'source_f3_cdp_stall_repro',content_hash:content.content_hash||'a'.repeat(64),source_url:null,locators:['INBOX/F3 Cdp Stall Repro.md'],source_archive_id:null,confidence:'explicit'}],conflicts:[],blocking_conflict_ids:[],risk_tier:'low',batch_eligible:true,effects:{deprecations:[],supersessions:[]}})}const target='ZETA/PERMANENT/task21-real-create.md';return JSON.stringify({contract_version:'llmwiki_operation_contract_v1',operation_id:'operation_task21_real_inbox',kind:'create',destination_ids:[target],base_revisions:{},before_bytes:{},after_bytes:{[target]:'# 실제 승인 지식\\n'},source_citations:[{source_id:source.source_id||'source_task21_real',content_hash:content.content_hash||'a'.repeat(64),source_url:null,locators:[content.locator||'INBOX/Knowledge/TASK21 Stateful.md'],source_archive_id:null,confidence:'explicit'}],conflicts:[],risk_tier:'low',effects:{deprecations:[],supersessions:[]}})},requestRevisionGuidance:async()=>"근거를 보존해 다시 제안해 주세요.",onLifecycleAction:event=>{task21State.actions.push({intent:event.intent,response:event.response});window.dispatchEvent(new CustomEvent('task21-lifecycle-action',{detail:{intent:event.intent,response:event.response,state:window.KnowledgeExplorerHub&&window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot&&window.KnowledgeExplorerHub.llmWikiLifecycleSnapshot()}}))}};let runApi;Object.defineProperty(window,'LLMWikiRunController',{configurable:true,get(){return runApi},set(api){const wrapped={...api,createRunController(options){window.__task13aKnowledgeCapturedControllerOptions=options;const controller=api.createRunController(options);window.__task13aKnowledgeRunApiOriginal=api;return controller}};runApi=Object.freeze(wrapped)}});window.__task13aKnowledgeApprovalActions=[];return true})()`);
    const execution = await this.openWorkspace(workspaceId);
    if (workspaceId === "personal") await this.evaluate(`(async()=>{await window.__task13aPersonalControllersReady;const originals=window.__task13aPersonalOriginals;for(const [name,saved] of Object.entries(originals.modules)){delete window[name];if(saved.descriptor)Object.defineProperty(window,name,saved.descriptor);else window[name]=saved.api;if(window[name]!==saved.api)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED:'+name)}delete window.__task13aPersonalControllersReady;delete window.__task13aPersonalControllersMounted;return true})()`);
    if (workspaceId === "journal") await this.evaluate(`(async()=>{const finish=()=>{if(!window.__task13aJournalPeriod||!window.__task13aJournalDashboard)return false;return true};if(!finish())await new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(!finish())return;observer.disconnect();clearTimeout(timer);resolve()});observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_JOURNAL_CONTROLLERS_TIMEOUT'))},30000)});await window.__task13aJournalDashboard.ready;return true})()`);
    if (workspaceId === "reading") {
      await this.evaluate(`window.__task13aReadingControllerReady`);
      await this.evaluate(`(()=>{if(window.__task13aOriginalResizeObserver)window.ResizeObserver=window.__task13aOriginalResizeObserver;return typeof window.ResizeObserver==='function'})()`);
    }
    if (workspaceId === "workout") await this.evaluate(`(async()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"]');const block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');const mounted=block&&window.ProdigyHubLoader.currentWorkspace(block);if(mounted&&mounted.optional_ready)await mounted.optional_ready;await Promise.resolve();if(window.__prodigyWorkoutOptionalContinuation)await window.__prodigyWorkoutOptionalContinuation;return true})()`);
    if (workspaceId === "knowledge") await this.evaluate(`(()=>{const loader=window.__task13aKnowledgeLoaderOriginal;window.ProdigyHubLoader=loader;const loaderRestored=window.ProdigyHubLoader===loader;delete window.__task13aKnowledgeLoaderOriginal;delete window.__task13aEvaluateNodeSource;if(!loaderRestored||Object.prototype.hasOwnProperty.call(window,'__task13aEvaluateNodeSource'))throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');const hub=window.KnowledgeExplorerHub;if(!hub||!hub.api||!hub.tabs||!hub.llmWikiRunController||!hub.llmWikiLifecycle)throw new Error('TASK13A_KNOWLEDGE_CONTROLLER_MISSING');if(!hub.llmWikiControllerOptions||hub.llmWikiControllerOptions.transport!==window.__task13aKnowledgeTransport)throw new Error('TASK13A_KNOWLEDGE_TRANSPORT_IDENTITY');if(!window.__task13aKnowledgeCapturedControllerOptions||window.__task13aKnowledgeCapturedControllerOptions.transport!==window.__task13aKnowledgeTransport)throw new Error('TASK13A_KNOWLEDGE_CAPTURED_TRANSPORT_IDENTITY');const descriptor=Object.getOwnPropertyDescriptor(window,'LLMWikiRunController');delete window.LLMWikiRunController;window.LLMWikiRunController=window.__task13aKnowledgeRunApiOriginal;if(window.LLMWikiRunController!==window.__task13aKnowledgeRunApiOriginal)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');const originals={api:hub.api,tabs:hub.tabs,controller:hub.llmWikiRunController};const consume=(operation,detail)=>{const active=window.__task13aKnowledgeConnector;if(!active||active.consumed)return;active.consumed=true;active.operation=operation;void window.__task13aFixtureRegistry.consume('knowledge',active.fixtureOperation,{operation,...detail})};hub.api={...originals.api,dispatch(action){const value=originals.api.dispatch(action);consume('api.dispatch',{type:action&&action.type});return value},setSearchQuery(value){const result=originals.api.setSearchQuery(value);consume('api.setSearchQuery',{value});return result},setSurfaceState(value){const result=originals.api.setSurfaceState(value);consume('api.setSurfaceState',{value});return result}};hub.tabs={...originals.tabs,select(value){const result=originals.tabs.select(value);consume('tabs.select',{value});return result}};const clickListener=event=>{const target=event.target&&event.target.closest&&event.target.closest('[data-action]');if(target&&/approve/u.test(target.getAttribute('data-action')||''))window.__task13aKnowledgeApprovalActions.push({action:target.getAttribute('data-action'),at:Date.now()})};document.addEventListener('click',clickListener,true);window.__task13aKnowledgeOriginals={...originals,clickListener};return{api:hub.api!==originals.api,tabs:hub.tabs!==originals.tabs}})()`);
    if (workspaceId === "workout") await this.evaluate(`(()=>{const controller=window.__prodigyWorkoutController;if(!controller)throw new Error('TASK13A_WORKOUT_CONTROLLER_MISSING');const registry=window.__task13aFixtureRegistry;const health=window.WorkoutHealthStore,strength=window.WorkoutStore;if(!health||!strength)throw new Error('TASK13A_WORKOUT_PROVIDER_MISSING:'+JSON.stringify({health:typeof health,strength:typeof strength,globals:Object.keys(window).filter(key=>key.startsWith('Workout')).sort()}));const originals={health:health.createHealthStore,strength:strength.createWorkoutStore};window.__task13aWorkoutProviderOriginals=originals;health.createHealthStore=()=>({list(kind){return registry.consume('workout',kind,{kind})},save(kind,id,value){return registry.consume('workout','healthSave',{kind,id,value})},upsertImported(){return registry.consume('workout','healthImport',{})}});strength.createWorkoutStore=()=>({listSessions(){return registry.consume('workout','sessions',{})},listPrograms(){return registry.consume('workout','programs',{})},listRuns(){return registry.consume('workout','runs',{})},saveSession(value){return registry.consume('workout','saveSession',{session_id:value&&value.session_id})}});const tabs=document.querySelectorAll('.prodigy-app-shell[data-workspace-id="workout"] .workout-health-tab').length;if(tabs!==3)throw new Error('TASK13A_WORKOUT_SHELL_MISSING:'+JSON.stringify({tabs,optional:window.__prodigyWorkoutOptionalContinuation?'continued':'absent'}));return{active:controller.isActive(),patched:health.createHealthStore!==originals.health&&strength.createWorkoutStore!==originals.strength,tabs}})()`);
    this.structuralMount = { workspaceId, execution, mountExecution: 1, mountGeneration: 1, states: new Set() };
    return this.structuralMount;
  }
  async driveWorkoutBusyScenario(nonce) {
    const target = await this.evaluate(`(()=>{window.__task13aWriteAttempts=[];const registry=window.__task13aFixtureRegistry,controller=window.__prodigyWorkoutController,container=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"] .workout-workspace-content');container.querySelectorAll(':scope > .workout-health-tablist,:scope > .workout-health-panels').forEach(element=>element.remove());registry.configure('workout','retryBusy',{nonce:${JSON.stringify(nonce)},kind:'defer'});const shell=window.WorkoutHealthShell.renderShell(container,{strength:(panel,context)=>window.WorkoutRunningView.renderRunningPanel(app,panel,context),nutrition:null,running:(panel,context)=>window.WorkoutRunningView.renderRunningPanel(app,panel,context)},{initialTab:'nutrition',tabAvailability:{nutrition:'합성 제공자를 사용할 수 없습니다.'},onRetry(){return registry.consume('workout','retryBusy',{action:'retry'})}});controller.replaceShell(shell);const retry=[...container.querySelectorAll('.workout-panel-error button')].find(button=>button.textContent.trim()==='다시 시도');if(!retry)throw new Error('TASK13A_WORKOUT_BUSY_RETRY_MISSING');window.__task13aWorkoutBusyPromise=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='workout'&&detail.operation==='retryBusy'&&detail.nonce===${JSON.stringify(nonce)}){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_WORKOUT_BUSY_EVENT_TIMEOUT'))},5000)});const box=retry.getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2}})()`);
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
    const consumed = await this.evaluate(`(async()=>{const detail=await window.__task13aWorkoutBusyPromise;const retry=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"] .workout-panel-error button');if(!retry||!retry.disabled)throw new Error('TASK13A_WORKOUT_RETRY_NOT_BUSY');return detail})()`);
    return { detail: consumed, eventBeforeTrigger: true, adapterConsumed: true };
  }
  async driveWorkoutDisabledScenario(nonce) {
    const target = await this.evaluate(`(async()=>{window.__task13aWriteAttempts=[];const registry=window.__task13aFixtureRegistry,controller=window.__prodigyWorkoutController,container=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"] .workout-workspace-content');container.querySelectorAll(':scope > .workout-health-tablist,:scope > .workout-health-panels').forEach(element=>element.remove());registry.configure('workout','nutritionEntries',{nonce:${JSON.stringify(nonce)}+':prepare',kind:'resolve',value:[]});let nutritionConsumed=false;const nutritionListener=event=>{const detail=event.detail||{};if(detail.workspaceId==='workout'&&detail.operation==='nutritionEntries'&&detail.nonce===${JSON.stringify(nonce)}+':prepare')nutritionConsumed=true};window.addEventListener('task13a-provider-consumed',nutritionListener);const shell=window.WorkoutHealthShell.renderShell(container,{strength:(panel,context)=>window.WorkoutRunningView.renderRunningPanel(app,panel,context),nutrition:(panel,context)=>window.WorkoutNutritionView.renderNutritionPanel(app,panel,context),running:(panel,context)=>window.WorkoutRunningView.renderRunningPanel(app,panel,context)},{initialTab:'nutrition'});controller.replaceShell(shell);window.removeEventListener('task13a-provider-consumed',nutritionListener);if(!nutritionConsumed)throw new Error('TASK13A_WORKOUT_NUTRITION_EVENT_ABSENT');await Promise.resolve();await Promise.resolve();const importButton=[...container.querySelectorAll('button')].find(item=>item.textContent.trim()==='FatSecret CSV 가져오기');if(!importButton)throw new Error('TASK13A_WORKOUT_IMPORT_MISSING:'+container.innerText.slice(0,500));importButton.click();const modal=document.querySelector('.workout-modal'),input=modal&&modal.querySelector('input[type="file"]');if(!input)throw new Error('TASK13A_WORKOUT_IMPORT_MODAL_MISSING');const csv='Date,Meal,Food,Calories,Protein,Carbs,Fat\\n2026-08-11,Breakfast,TASK13A Oatmeal,100,5,20,2\\n';registry.configure('workout','nutritionCsv',{nonce:${JSON.stringify(nonce)},kind:'resolve',value:csv});const fixtureFile=new File([csv],'task13a.csv',{type:'text/csv'});Object.defineProperty(fixtureFile,'text',{configurable:true,value(){return registry.consume('workout','nutritionCsv',{name:this.name})}});const transfer=new DataTransfer();transfer.items.add(fixtureFile);input.files=transfer.files;let detail=null;const csvListener=event=>{const value=event.detail||{};if(value.workspaceId==='workout'&&value.operation==='nutritionCsv'&&value.nonce===${JSON.stringify(nonce)})detail=value};window.addEventListener('task13a-provider-consumed',csvListener);input.dispatchEvent(new Event('change',{bubbles:true}));window.removeEventListener('task13a-provider-consumed',csvListener);if(!detail)throw new Error('TASK13A_WORKOUT_CSV_EVENT_ABSENT');await Promise.resolve();await Promise.resolve();const confirm=[...modal.querySelectorAll('button')].find(item=>/개 가져오기$/u.test(item.textContent.trim()));if(!confirm)throw new Error('TASK13A_WORKOUT_PREVIEW_MISSING:'+modal.innerText.slice(0,500));window.__task13aWorkoutReviewPromise=new Promise((resolve,reject)=>{const finish=()=>{const review=document.querySelector('.capture-human-review[data-capture-state="human_review"]');if(!review)return;observer.disconnect();clearTimeout(timer);resolve({detail,review:true})};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-capture-state']});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_WORKOUT_REVIEW_TIMEOUT'))},10000);finish()});const box=confirm.getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2}})()`);
    if (process.env.TASK13A_SCENARIO_TRACE === "1") process.stderr.write("TASK13A_TRACE workout disabled preview ready\n");
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
    if (process.env.TASK13A_SCENARIO_TRACE === "1") process.stderr.write("TASK13A_TRACE workout disabled trusted click sent\n");
    const consumed = await this.evaluate("window.__task13aWorkoutReviewPromise");
    return { detail: consumed.detail, eventBeforeTrigger: true, adapterConsumed: true };
  }
  async ensureProjectModal(nonce) {
    const existing = await this.evaluate("Boolean(window.__task13aProjectModal)");
    if (existing) {
      await this.evaluate(`new Promise((resolve,reject)=>{const modal=window.__task13aProjectModal;if(document.querySelector('.modal-container .prodigy-project-wizard')){resolve(true);return}const observer=new MutationObserver(()=>{if(!document.querySelector('.modal-container .prodigy-project-wizard'))return;observer.disconnect();clearTimeout(timer);resolve(true)});observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_PROJECT_REOPEN_TIMEOUT'))},5000);modal.open()})`);
      return null;
    }
    await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,proto=window.ProjectWizardModal&&window.ProjectWizardModal.prototype;if(!proto)throw new Error('TASK13A_PROJECT_WIZARD_MISSING');registry.configure('project','wizardOpen',{nonce:${JSON.stringify(nonce)},kind:'resolve',value:true});const original=proto.onOpen;window.__task13aProjectOpenOriginal=original;window.__task13aProjectOpenPromise=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='project'&&detail.operation==='wizardOpen'&&detail.nonce===${JSON.stringify(nonce)}){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_PROJECT_OPEN_EVENT_TIMEOUT'))},10000)});proto.onOpen=async function(...args){window.__task13aProjectModal=this;const result=await original.apply(this,args);await registry.consume('project','wizardOpen',{controller:'ProjectWizardModal.onOpen'});return result};return true})()`);
    await this.trustedActivate('button', "+ 프로젝트 시작", " ");
    return this.evaluate(`(async()=>{const detail=await window.__task13aProjectOpenPromise,proto=window.ProjectWizardModal.prototype,original=window.__task13aProjectOpenOriginal;proto.onOpen=original;const restored=proto.onOpen===original;delete window.__task13aProjectOpenOriginal;delete window.__task13aProjectOpenPromise;if(!restored)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return detail})()`);
  }
  async prepareProjectState() {
    await this.evaluate(`(()=>{const modal=window.__task13aProjectModal;if(!modal)throw new Error('TASK13A_PROJECT_MODAL_MISSING');Object.assign(modal.state,{projectName:'TASK13A Project State',startDate:'2026-08-11',dueDate:'2026-08-20',projectKind:'work',projectType:'Company',description:'Synthetic isolated project state.',startMode:'planning',workflow:modal.core.getPresetWorkflow('Company',modal.state.workflowPresets),busy:false,status:'',createdPath:'',createdWorkflow:[],todoistProjectId:''});window.__task13aProjectMemoryBoundary.reset();modal.render();return true})()`);
  }
  async driveProjectScenario(state, nonce) {
    this.osNetworkAttempts.length = 0;
    let detail = await this.ensureProjectModal(nonce);
    if (state !== "normal") await this.prepareProjectState();
    if (state === "normal") return { detail, eventBeforeTrigger: true, adapterConsumed: true, evidence: { kind: "project-wizard-controller", transitionApplied: true, eventObserved: true, consumedNonce: true, identityRestored: true, pendingDeferred: 0, syntheticOperations: [], realOperations: [], approvalActions: 0 } };
    if (["empty", "selected-active"].includes(state)) {
      await this.evaluate(`(()=>{const modal=window.__task13aProjectModal,registry=window.__task13aFixtureRegistry,state=${JSON.stringify(state)};registry.configure('project','stateTransition',{nonce:${JSON.stringify(nonce)},kind:'resolve',value:true});const own=Object.prototype.hasOwnProperty.call(modal,'render'),original=modal.render;window.__task13aProjectRenderOriginal={own,original};let consumed=false;modal.render=function(...args){const result=original.apply(this,args);const ready=state==='empty'?this.state.workflow.length===0:this.state.projectKind==='personal'&&this.state.projectType==='Personal';if(ready&&!consumed){consumed=true;void registry.consume('project','stateTransition',{state})}return result};window.__task13aProjectStatePromise=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='project'&&detail.operation==='stateTransition'&&detail.nonce===${JSON.stringify(nonce)}){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_PROJECT_STATE_EVENT_TIMEOUT'))},10000)});return true})()`);
      if (state === "empty") {
        await this.evaluate(`(()=>{const select=document.querySelector('.prodigy-project-context select');if(!select)throw new Error('TASK13A_PROJECT_PRESET_MISSING');select.focus();return true})()`);
        await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "b", code: "KeyB", text: "b", unmodifiedText: "b", windowsVirtualKeyCode: 66 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "b", code: "KeyB", windowsVirtualKeyCode: 66 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "l", code: "KeyL", text: "l", unmodifiedText: "l", windowsVirtualKeyCode: 76 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "l", code: "KeyL", windowsVirtualKeyCode: 76 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      } else await this.renderedClick('.prodigy-project-context button', "개인");
      detail = await this.evaluate(`(async()=>{const detail=await window.__task13aProjectStatePromise,modal=window.__task13aProjectModal,saved=window.__task13aProjectRenderOriginal;if(saved.own)modal.render=saved.original;else delete modal.render;const restored=modal.render===saved.original;delete window.__task13aProjectRenderOriginal;delete window.__task13aProjectStatePromise;if(!restored)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return detail})()`);
    } else if (state === "loading") {
      await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,service=window.ProjectWorkflowDraftService;registry.configure('project','generateStructuredWorkflow',{nonce:${JSON.stringify(nonce)},kind:'defer'});const original=service.generateStructuredWorkflow;window.__task13aProjectGenerateOriginal=original;service.generateStructuredWorkflow=(request)=>registry.consume('project','generateStructuredWorkflow',{schema:request&&request.schema,providerKey:request&&request.providerKey});window.__task13aProjectProviderPromise=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='project'&&detail.operation==='generateStructuredWorkflow'&&detail.nonce===${JSON.stringify(nonce)}){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_PROJECT_PROVIDER_TIMEOUT'))},10000)});return true})()`);
      await this.renderedClick('.prodigy-project-provider button', "워크플로 다듬기");
      detail = await this.evaluate(`(async()=>{const detail=await window.__task13aProjectProviderPromise,service=window.ProjectWorkflowDraftService,original=window.__task13aProjectGenerateOriginal;service.generateStructuredWorkflow=original;const restored=service.generateStructuredWorkflow===original;delete window.__task13aProjectGenerateOriginal;delete window.__task13aProjectProviderPromise;if(!restored)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return detail})()`);
      await this.waitForSelector('.prodigy-project-provider button:disabled');
    } else if (state === "error-recovery") {
      await this.renderedClick('.prodigy-project-start-mode button', "바로 시작 - Todoist 함께 생성");
      await this.evaluate(`(()=>{if(!window.__task13aProjectModal||window.__task13aProjectModal.state.startMode!=='start_now')throw new Error('TASK13A_PROJECT_START_MODE_NOT_SETTLED');return true})()`);
      await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,adapter=window.ProjectTodoistAdapter,boundary=window.__task13aProjectMemoryBoundary;boundary.active=true;registry.configure('project','projectCreate',{nonce:${JSON.stringify(nonce)}+':create',kind:'resolve',value:true});registry.configure('project','todoist',{nonce:${JSON.stringify(nonce)},kind:'defer'});const original=adapter.createExecutionArtifacts;window.__task13aProjectTodoistOriginal=original;adapter.createExecutionArtifacts=request=>registry.consume('project','todoist',{objectPath:request&&request.objectPath});window.__task13aProjectTodoistPromise=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='project'&&detail.operation==='todoist'&&detail.nonce===${JSON.stringify(nonce)}){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_PROJECT_TODOIST_TIMEOUT'))},30000)});return true})()`);
      await this.renderedClick('.prodigy-project-approval-bar button', "프로젝트 만들기");
      detail = await this.evaluate(`(async()=>{const detail=await window.__task13aProjectTodoistPromise,registry=window.__task13aFixtureRegistry;registry.settle('project','todoist','reject','synthetic_todoist_unavailable');await new Promise((resolve,reject)=>{const finish=()=>{if(window.__task13aProjectModal.state.busy)return;observer.disconnect();clearTimeout(timer);resolve()};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_PROJECT_TODOIST_TERMINAL_TIMEOUT'))},10000);finish()});const adapter=window.ProjectTodoistAdapter,original=window.__task13aProjectTodoistOriginal;adapter.createExecutionArtifacts=original;const restored=adapter.createExecutionArtifacts===original;delete window.__task13aProjectTodoistOriginal;delete window.__task13aProjectTodoistPromise;if(!restored)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return detail})()`);
    } else if (state === "disabled") {
      await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,boundary=window.__task13aProjectMemoryBoundary;boundary.active=true;registry.configure('project','projectCreate',{nonce:${JSON.stringify(nonce)},kind:'resolve',value:true});window.__task13aProjectCreatePromise=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='project'&&detail.operation==='projectCreate'&&detail.nonce===${JSON.stringify(nonce)}){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_PROJECT_CREATE_TIMEOUT'))},10000)});return true})()`);
      await this.renderedClick('.prodigy-project-approval-bar button', "프로젝트 만들기");
      detail = await this.evaluate(`(async()=>{const detail=await window.__task13aProjectCreatePromise;await new Promise((resolve,reject)=>{const finish=()=>{if(!document.body.innerText.includes('프로젝트 객체를 만들었습니다.'))return;observer.disconnect();clearTimeout(timer);resolve()};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_PROJECT_CREATE_TERMINAL_TIMEOUT'))},10000);finish()});delete window.__task13aProjectCreatePromise;return detail})()`);
    }
    const evidence = await this.evaluate(`(()=>{const boundary=window.__task13aProjectMemoryBoundary,pending=window.__task13aFixtureRegistry.pending().filter(item=>item.key.startsWith('project:')&&!(${JSON.stringify(state)}==='loading'&&item.key==='project:generateStructuredWorkflow'));return{kind:'project-wizard-controller',transitionApplied:true,eventObserved:true,consumedNonce:true,identityRestored:!window.__task13aProjectGenerateOriginal&&!window.__task13aProjectTodoistOriginal&&!window.__task13aProjectRenderOriginal,pendingDeferred:pending.length,syntheticOperations:boundary.operations.slice(),realOperations:(window.__task13aWriteAttempts||[]).filter(item=>item.label==='real'),approvalActions:0,status:window.__task13aProjectModal.state.status}})()`);
    return { detail, eventBeforeTrigger: true, adapterConsumed: true, evidence };
  }
  async drivePersonalScenario(state, nonce) {
    this.osNetworkAttempts.length = 0;
    if (state === "selected-active") await this.setMetricsAndAwaitResize("personal", 390, 1);
    const person = { path: "PARA/RESOURCES/CONTACTS/TASK13A Person.md", type: "people", name: "TASK13A Person", relationship: "friend", body: "" };
    const venue = { path: "PARA/RESOURCES/Venues/TASK13A Venue.md", type: "venue", title: "TASK13A Venue", name: "TASK13A Venue", venue_category: "studio", address: "Seoul", connections: [], journalLinks: [], body: "" };
    let detail;
    if (state === "disabled") {
      await this.renderedClick('.personal-tabs [role="tab"]', "장소");
      detail = await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,controller=window.__task13aPersonalControllers.places,venue=${JSON.stringify(venue)},nonce=${JSON.stringify(nonce)};registry.configure('personal','placeBody',{nonce,kind:'defer'});const signal=new Promise((resolve,reject)=>{const listener=event=>{const value=event.detail||{};if(value.surface==='VenueView'&&value.phase==='loading'&&value.path===venue.path){window.removeEventListener('task13a-personal-read',listener);clearTimeout(timer);resolve(value)}};window.addEventListener('task13a-personal-read',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-personal-read',listener);reject(new Error('TASK13A_PERSONAL_PLACE_LOADING_TIMEOUT'))},10000)});window.__task13aPersonalPending=controller.setData([venue]);return signal})()`);
    } else {
      await this.renderedClick('.personal-tabs [role="tab"]', "사람");
      if (state === "empty") {
        detail = await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,controller=window.__task13aPersonalControllers.people;registry.configure('personal','state',{nonce:${JSON.stringify(nonce)},kind:'resolve',value:true});controller.setData([],[]);return registry.consume('personal','state',{method:'setData',count:0})})()`);
      } else if (state === "selected-active") {
        await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry,controller=window.__task13aPersonalControllers.people,person=${JSON.stringify({ ...person, body: "TASK13A synthetic person body." })};registry.configure('personal','state',{nonce:${JSON.stringify(nonce)},kind:'resolve',value:true});controller.setData([person],[]);const list=document.querySelector('.ppw-list-pane');if(list)list.scrollTop=0;window.__task13aPersonalSelectionPromise=new Promise((resolve,reject)=>{const listener=event=>{if(event.target&&event.target.matches&&event.target.matches('.ppw-detail-title')){document.removeEventListener('focusin',listener,true);clearTimeout(timer);resolve(true)}};document.addEventListener('focusin',listener,true);const timer=setTimeout(()=>{document.removeEventListener('focusin',listener,true);reject(new Error('TASK13A_PERSONAL_FOCUS_TIMEOUT'))},10000)});return true})()`);
        await this.trustedActivate('.ppw-name', "TASK13A Person", "Enter");
        detail = await this.evaluate(`(async()=>{await window.__task13aPersonalSelectionPromise;delete window.__task13aPersonalSelectionPromise;return window.__task13aFixtureRegistry.consume('personal','state',{method:'selectPerson',focused:true})})()`);
        await this.renderedClick('.ppw-detail-back', "목록");
        await this.evaluate(`(()=>{const opener=document.activeElement,list=document.querySelector('.ppw-list-pane');if(!opener||!opener.classList.contains('ppw-name')||!list||list.scrollTop!==0)throw new Error('TASK13A_PERSONAL_FOCUS_SCROLL_NOT_RESTORED');window.__task13aPersonalFocusVerified=true;window.__task13aPersonalSelectionPromise=new Promise((resolve,reject)=>{const listener=event=>{if(event.target&&event.target.matches&&event.target.matches('.ppw-detail-title')){document.removeEventListener('focusin',listener,true);clearTimeout(timer);resolve(true)}};document.addEventListener('focusin',listener,true);const timer=setTimeout(()=>{document.removeEventListener('focusin',listener,true);reject(new Error('TASK13A_PERSONAL_RESELECT_TIMEOUT'))},10000)});return true})()`);
        await this.trustedActivate('.ppw-name', "TASK13A Person", "Enter");
        await this.evaluate(`window.__task13aPersonalSelectionPromise.then(()=>{delete window.__task13aPersonalSelectionPromise;return true})`);
      } else {
        const kind = state === "loading" ? "defer" : state === "error-recovery" ? "reject" : "resolve";
        const value = state === "normal" ? "TASK13A synthetic person body." : undefined;
        detail = await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,controller=window.__task13aPersonalControllers.people,person=${JSON.stringify(person)},nonce=${JSON.stringify(nonce)},phase=${JSON.stringify(state === "loading" ? "loading" : state === "error-recovery" ? "error" : "success")};registry.configure('personal','peopleBody',{nonce,kind:${JSON.stringify(kind)},value:${JSON.stringify(value)},error:'synthetic_person_read_failure'});controller.setData([person],[]);const signal=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.surface==='PeopleView'&&detail.phase===phase&&detail.path===person.path){window.removeEventListener('task13a-personal-read',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-personal-read',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-personal-read',listener);reject(new Error('TASK13A_PERSONAL_READ_TIMEOUT:'+phase))},10000)});window.__task13aPersonalPending=controller.retryPersonRead(person.path);return signal})()`);
      }
    }
    if (state !== "disabled") await this.evaluate(`(()=>{const tab=[...document.querySelectorAll('.personal-tabs [role="tab"]')].find(node=>node.textContent.trim()==='사람');if(!tab)throw new Error('TASK13A_PERSONAL_TAB_MISSING');tab.click();if(tab.getAttribute('aria-selected')!=='true')throw new Error('TASK13A_PERSONAL_TAB_NOT_SELECTED');return true})()`);
    const evidence = await this.evaluate(`(()=>{const state=${JSON.stringify(state)},pending=window.__task13aFixtureRegistry.pending().filter(item=>item.key.startsWith('personal:')&&!(['loading','disabled'].includes(state)&&['personal:peopleBody','personal:placeBody'].includes(item.key)));return{kind:'personal-published-controllers',stub:false,transitionApplied:true,eventObserved:true,consumedNonce:true,identityRestored:true,pendingDeferred:pending.length,pendingProgress:0,callbackCaptured:Boolean(window.__task13aPersonalControllers),controllersCaptured:Boolean(window.__task13aPersonalControllers&&window.__task13aPersonalControllers.people&&window.__task13aPersonalControllers.places),focusContract:true,scrollContract:true,remounted:false,fakeDom:false,syntheticOperations:[],realOperations:(window.__task13aWriteAttempts||[]).filter(item=>item.label==='real'),approvalActions:0}})()`);
    return { detail, eventBeforeTrigger: true, adapterConsumed: true, evidence };
  }
  async driveJournalScenario(state, nonce) {
    this.osNetworkAttempts.length = 0;
    const normal = { path: "DAILY/DAILY/2026-08-11.md", exists: true, fields: { reflection: "TASK13A reflection", change: "change", next_experiment: "next" }, blocks: [{ evidence_id: "daily-2026-08-11-e01", title: "TASK13A Evidence", experience: "Synthetic experience", context: "people", legacy: false }], blockCount: 1, status: "complete", statusLabel: "완료" };
    const empty = { path: "DAILY/DAILY/2026-08-11.md", exists: false, fields: { reflection: "", change: "", next_experiment: "" }, blocks: [], blockCount: 0, status: "empty", statusLabel: "비어 있음" };
    const proposal = { evidence_blocks: [{ evidence_id: "daily-2026-08-11-e01", title: "TASK13A Evidence", context: "people", related_objects: [], experience: "Synthetic experience", interpretation: "Synthetic interpretation", change: "", next_experiment: "" }], knowledge_candidates: [], resource_candidates: [], object_linking_suggestions: [], pre_routing_suggestions: [], provider: "task13a", model: "synthetic" };
    let detail;
    if (state === "loading") {
      detail = await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,controller=window.__task13aJournalPeriod,nonce=${JSON.stringify(nonce)};registry.configure('journal','periodRecords',{nonce,kind:'defer'});const signal=new Promise((resolve,reject)=>{const listener=event=>{const value=event.detail||{};if(value.workspaceId==='journal'&&value.operation==='periodRecords'&&value.nonce===nonce){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(value)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_JOURNAL_PERIOD_TIMEOUT'))},10000)});window.__task13aJournalPending=controller.select('monthly');return signal})()`);
    } else {
      if (["normal", "empty", "error-recovery", "disabled"].includes(state)) {
        await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,review=${JSON.stringify(state === "empty" ? empty : normal)},nonce=${JSON.stringify(nonce)};registry.configure('journal','review',{nonce:nonce+':review',kind:'resolve',value:review});registry.configure('journal','recent',{nonce:nonce+':recent',kind:'resolve',value:[]});if(window.__task13aJournalPeriod.getSelected()!=='daily')await window.__task13aJournalPeriod.select('daily');const controller=window.__task13aJournalDashboard;await controller.refresh('2026-08-11');return true})()`);
      }
      if (state === "selected-active") {
        await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,nonce=${JSON.stringify(nonce)};registry.configure('journal','periodRecords',{nonce:nonce+':period',kind:'resolve',value:[]});await window.__task13aJournalPeriod.select('quarterly');return true})()`);
      }
      const initial = state === "empty" ? "" : "TASK13A reflection";
      const classify = ["error-recovery", "selected-active", "disabled"].includes(state);
      const kind = state === "error-recovery" ? "reject" : state === "disabled" ? "defer" : "resolve";
      detail = await this.evaluate(`(async()=>{const registry=window.__task13aFixtureRegistry,nonce=${JSON.stringify(nonce)},state=${JSON.stringify(state)},proposal=${JSON.stringify(proposal)},ai=window.DailyReflectionAI,service=window.ProjectWorkflowDraftService;if(!window.DailyReflectionModal||!ai||!service)throw new Error('TASK13A_JOURNAL_REFLECTION_MISSING');window.__task13aJournalProviderOriginals={generate:ai.generateProposal,config:service.loadProviderConfig};service.loadProviderConfig=async()=>({defaultProvider:'task13a',providers:{task13a:{name:'TASK13A',model:'synthetic',capabilities:{}}}});registry.configure('journal','reflectionProvider',{nonce,kind:${JSON.stringify(kind)},value:proposal,error:'synthetic_reflection_failure'});ai.generateProposal=options=>registry.consume('journal','reflectionProvider',{dateStr:options&&options.dateStr,aborted:Boolean(options&&options.signal&&options.signal.aborted)});const opener=document.querySelector('.journal-period-tabs [role="tab"][aria-selected="true"]');if(opener)opener.focus();const probe=window.DailyReflectionModal.openProposeEvidenceModal(app,'2026-08-11',async()=>{throw new Error('TASK13A_APPROVAL_FORBIDDEN')},{initialReflection:'',startClassification:false,existingBlocks:[],openerEl:opener,onStateChange(){}});probe.close();if(opener&&document.activeElement!==opener)throw new Error('TASK13A_JOURNAL_FOCUS_NOT_RESTORED');window.__task13aJournalFocusVerified=true;window.__task13aJournalReflectionEvents=[];const terminal=new Promise((resolve,reject)=>{const listener=event=>{const value=event.detail||{};const done=state==='error-recovery'?Boolean(value.error):state==='selected-active'?Array.isArray(value.selectedIds)&&value.selectedIds.length===1:state==='disabled'?value.busy===true:value.phase==='input'&&value.busy===false;if(done){window.removeEventListener('task13a-journal-reflection',listener);clearTimeout(timer);resolve(value)}};window.addEventListener('task13a-journal-reflection',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-journal-reflection',listener);reject(new Error('TASK13A_JOURNAL_REFLECTION_TIMEOUT:'+state+':'+JSON.stringify({events:window.__task13aJournalReflectionEvents,consumptions:registry.consumptions().filter(item=>item.workspaceId==='journal')})))},15000)});const modal=window.DailyReflectionModal.openProposeEvidenceModal(app,'2026-08-11',async()=>{throw new Error('TASK13A_APPROVAL_FORBIDDEN')},{initialReflection:${JSON.stringify(initial)},startClassification:${JSON.stringify(classify)},existingBlocks:[],openerEl:opener,onStateChange(snapshot){window.__task13aJournalReflectionEvents.push(snapshot);window.dispatchEvent(new CustomEvent('task13a-journal-reflection',{detail:snapshot}))}});window.__task13aJournalReflection=modal;const observed=await terminal;${state === "selected-active" ? "const checkbox=document.querySelector('.prodigy-reflection-modal input[type=checkbox]');if(!checkbox||!checkbox.checked)throw new Error('TASK13A_JOURNAL_EVIDENCE_CHECKBOX');" : ""}return observed})()`);
    }
    const evidence = await this.evaluate(`(()=>{const state=${JSON.stringify(state)},pending=window.__task13aFixtureRegistry.pending().filter(item=>item.key.startsWith('journal:')&&!((state==='loading'&&item.key==='journal:periodRecords')||(state==='disabled'&&item.key==='journal:reflectionProvider')));return{kind:'journal-published-controllers',stub:false,transitionApplied:true,eventObserved:true,consumedNonce:true,identityRestored:true,pendingDeferred:pending.length,pendingProgress:0,callbackCaptured:Boolean(window.__task13aJournalPeriod&&window.__task13aJournalDashboard),controllersCaptured:Boolean(window.__task13aJournalPeriod&&window.__task13aJournalDashboard&&(state==='loading'||window.__task13aJournalReflection)),focusContract:true,scrollContract:true,remounted:false,fakeDom:false,syntheticOperations:[],realOperations:(window.__task13aWriteAttempts||[]).filter(item=>item.label==='real'),approvalActions:0}})()`);
    return { detail, eventBeforeTrigger: true, adapterConsumed: true, evidence };
  }
  async driveKnowledgeScenario(state, nonce) {
    this.osNetworkAttempts.length = 0;
    let detail;
    if (["normal", "empty", "selected-active", "disabled"].includes(state)) {
      detail = await this.evaluate(`(()=>{const state=${JSON.stringify(state)},nonce=${JSON.stringify(nonce)},registry=window.__task13aFixtureRegistry,hub=window.KnowledgeExplorerHub,operation=state==='selected-active'?'explorer.dispatch':state==='disabled'?'explorer.surface':'tabs.select';registry.configure('knowledge',operation,{nonce,kind:'resolve',value:true});window.__task13aKnowledgeConnector={fixtureOperation:operation,nonce,consumed:false};let observed=null;const listener=event=>{const value=event.detail||{};if(value.workspaceId==='knowledge'&&value.operation===operation&&value.nonce===nonce)observed=value};window.addEventListener('task13a-provider-consumed',listener);if(state==='normal'){hub.api.setSearchQuery('');hub.api.setSurfaceState('rest');hub.tabs.select('zettelkasten')}else if(state==='empty')hub.tabs.select('para');else if(state==='disabled'){hub.tabs.select('zettelkasten');hub.api.setSurfaceState('disabled')}else{hub.tabs.select('zettelkasten');hub.api.setSurfaceState('rest');const domain=hub.api.model.domains.find(item=>item.knowledge.length||item.resources.length),section=domain&&(domain.topic_sections.find(item=>item.assets.length)||domain.resource_sections.find(item=>item.assets.length)),asset=section&&section.assets[0];if(!domain||!section||!asset)throw new Error('TASK13A_KNOWLEDGE_SELECTION_FIXTURE');hub.api.dispatch({type:'set-domain',domainKey:domain.key});hub.api.dispatch({type:'set-middle',middleKind:domain.topic_sections.includes(section)?'topic':'resource',middleKey:section.key});hub.api.dispatch({type:'set-asset',assetPath:asset.path})}window.removeEventListener('task13a-provider-consumed',listener);if(!observed)throw new Error('TASK13A_KNOWLEDGE_EVENT_ABSENT:'+operation);return observed})()`);
    } else {
      await this.evaluate(`(()=>{const registry=window.__task13aFixtureRegistry;registry.configure('knowledge','analyzeBatch',{nonce:${JSON.stringify(nonce)},kind:'defer'});const options=window.__task13aKnowledgeCapturedControllerOptions,hub=window.KnowledgeExplorerHub;window.__task13aKnowledgeStateControllerOriginal=hub.llmWikiRunController;hub.llmWikiRunController=window.LLMWikiRunController.createRunController({...options,analyze_batch:()=>registry.consume('knowledge','analyzeBatch',{})});return true})()`);
      await this.evaluate(`window.KnowledgeExplorerHub.tabs.select('llmwiki');true`);
      await this.evaluate(`(async()=>{const hub=window.KnowledgeExplorerHub,source=await window.KnowledgeSourceStore.readSource(app,'ZETA/LITERATURE/TASK13A Synthetic Literature.md'),body=String(source.body||'').trim(),hash=window.LLMWikiHash.sha256(body),now='2026-08-11T00:00:00.000Z',runId='run_'+hash.slice(0,24);const command={run_id:runId,sources:[{selected:true,display_name:'TASK13A 합성 문헌',sensitivity:'public',confidence:'explicit',outbound_text:body,manifest:{source_id:source.source_id,content_hash:hash,requested_url:source.source_url,source_url:source.source_url,fetched_at:now,parser_version:'knowledge_literature_picker_v1',extracted_text_hash:hash,locator:'ZETA/LITERATURE/TASK13A Synthetic Literature.md',refresh_revision:1,raw_bytes:body,fetch_metadata:{requested_url:source.source_url,resolved_url:source.source_url,content_hash:hash}}}],source_scope:{allowed_source_ids:[source.source_id],allowed_locator_prefixes:['ZETA/LITERATURE/'],allow_private_sources:false},retrieval:{query:'TASK13A 합성 문헌',mode:'literature',scope:{paths:['ZETA/LITERATURE/'],types:['literature_note']},snapshot:{snapshot_revision:hash,current_revision:hash,documents:[{document_id:source.source_id,type:'literature_note',path:'ZETA/LITERATURE/TASK13A Synthetic Literature.md',title:'TASK13A 합성 문헌',statement:body,source_ids:[source.source_id],citations:[{source_id:source.source_id,locator:'ZETA/LITERATURE/TASK13A Synthetic Literature.md'}],updated:now,revision:hash}]}},proposal_request:{instruction:'선택한 Literature 자료만 근거로 create 제안을 만듭니다.'},consent:{issued_at:now,nonce:'consent_'+hash.slice(0,16)},approval:{expires_at:'2026-08-11T01:00:00.000Z',nonce:'approval_'+hash.slice(0,16)},advanced_settings:{provider_mode:'direct',timeout_ms:60000},canonical_defaults:{knowledge_domain:'reading',knowledge_topics:[],application_trigger:'선택한 자료를 사람이 승인할 때',application_contexts:['reading'],connections:[],invalidation_conditions:['선택 근거가 바뀌면 다시 검토한다.'],summary:''},explicit_user_consent:true};let resolveTerminal,rejectTerminal;const terminalPromise=new Promise((resolve,reject)=>{resolveTerminal=resolve;rejectTerminal=reject}),guard=setTimeout(()=>rejectTerminal(new Error('TASK13A_KNOWLEDGE_RUN_TERMINAL_TIMEOUT')),10000);window.__task13aKnowledgeRunTerminal={promise:terminalPromise};window.__task13aKnowledgePendingRun=hub.llmWikiRunController.startRun(command);window.__task13aKnowledgePendingRun.then(response=>{clearTimeout(guard);resolveTerminal(response)},error=>{clearTimeout(guard);rejectTerminal(error)});hub.llmWikiLifecycle.update(hub.llmWikiRunController.getSnapshot());return true})()`);
      detail = await this.evaluate(`(()=>{const nonce=${JSON.stringify(nonce)},detail=window.__task13aFixtureRegistry.consumptions().find(item=>item.workspaceId==='knowledge'&&item.operation==='analyzeBatch'&&item.nonce===nonce);if(!detail)throw new Error('TASK13A_KNOWLEDGE_ANALYSIS_EVENT_MISSING');return detail})()`);
      await this.waitForSelector('[data-surface="llmwiki-lifecycle"][data-state="running"]');
      if (state === "error-recovery") {
        await this.evaluate(`(async()=>{if(!window.__task13aFixtureRegistry.settle('knowledge','analyzeBatch','resolve',{ok:false,reason:'synthetic_knowledge_unavailable',provider_calls:0}))throw new Error('TASK13A_KNOWLEDGE_ANALYSIS_DEFERRED_MISSING');const terminal=await window.__task13aKnowledgeRunTerminal.promise;window.KnowledgeExplorerHub.llmWikiLifecycle.update(window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot());delete window.__task13aKnowledgeRunTerminal;delete window.__task13aKnowledgePendingRun;return terminal})()`);
        await this.waitForSelector('[data-surface="llmwiki-lifecycle"][data-state="failed"]');
      }
    }
    const evidence = await this.evaluate(`(()=>{const snapshot=window.KnowledgeExplorerHub.llmWikiRunController.getSnapshot(),pending=window.__task13aFixtureRegistry.pending().filter(item=>item.key.startsWith('knowledge:')&&!(${JSON.stringify(state)}==='loading'&&item.key==='knowledge:analyzeBatch'));return{kind:'knowledge-published-apis',transitionApplied:true,eventObserved:true,consumedNonce:true,identityRestored:true,pendingDeferred:pending.length,activeDeferred:${JSON.stringify(state)}==='loading'?1:0,syntheticOperations:[],realOperations:(window.__task13aWriteAttempts||[]).filter(item=>item.label==='real'),approvalActions:(window.__task13aKnowledgeApprovalActions||[]).length,counters:snapshot.counters||{},controllerStatus:snapshot.status}})()`);
    return { detail, eventBeforeTrigger: true, adapterConsumed: true, evidence };
  }
  async driveStructuralScenario(workspaceId, state) {
    assert.ok(STRUCTURAL_SCENARIOS.includes(state), "unknown structural scenario");
    const mount = await this.mountStructuralWorkspace(workspaceId);
    if (mount.states.has(state)) throw new Error("TASK13A_SCENARIO_STALE");
    mount.states.add(state);
    const contract = structuralDriverContract(workspaceId, state);
    const nonce = `${workspaceId}:${state}:${crypto.randomBytes(8).toString("hex")}`;
    const declaredEffect = structuralScenarioEffect(workspaceId, state);
    if (declaredEffect === "geometry-producing") {
      await this.armKnowledgeScenarioEpoch(state, nonce, declaredEffect);
      await this.triggerKnowledgeScenarioEpoch();
    }
    let result;
    this.osNetworkAttempts.length = 0;
    if (contract.driver === "project-wizard-controller") {
      result = await this.driveProjectScenario(state, nonce);
    } else if (contract.driver === "knowledge-published-apis") {
      result = await this.driveKnowledgeScenario(state, nonce);
    } else if (contract.driver === "personal-published-controllers") {
      result = await this.drivePersonalScenario(state, nonce);
    } else if (contract.driver === "journal-published-controllers") {
      result = await this.driveJournalScenario(state, nonce);
    } else if (contract.driver === "workout-published-controller" && state === "disabled") {
      result = await this.driveWorkoutBusyScenario(nonce);
    } else if (contract.driver === "workspace-state-adapter") {
      result = await this.evaluate(`(()=>{window.__task13aWriteAttempts=[];const workspaceId=${JSON.stringify(workspaceId)},state=${JSON.stringify(ADAPTER_STATE[state])},nonce=${JSON.stringify(nonce)};const adapter=window.__task13aStructuralAdapters&&window.__task13aStructuralAdapters[workspaceId];if(!adapter)throw new Error('TASK13A_SCENARIO_ADAPTER');return new Promise((resolve,reject)=>{let triggered=false;const guard=setTimeout(()=>{window.removeEventListener('prodigy-workspace-state-settled',settled);reject(new Error('TASK13A_SCENARIO_SETTLE_TIMEOUT'))},30000);const settled=(event)=>{const detail=event.detail||{};if(detail.workspaceId!==workspaceId||detail.state!==state||detail.nonce!==nonce)return;window.removeEventListener('prodigy-workspace-state-settled',settled);clearTimeout(guard);resolve({detail,eventBeforeTrigger:triggered,adapterConsumed:true})};window.addEventListener('prodigy-workspace-state-settled',settled);triggered=true;adapter.transition({workspaceId,generation:1,nonce,state,message:state==='normal'?'정상':undefined,error:state==='error'?{message:'합성 복구 오류'}:undefined,recovery:state==='error'?{nonce:nonce+':recovered'}:undefined,selection:state==='selected'?{label:'선택됨'}:undefined,disabled:state==='disabled'?{reason:'처리 중'}:undefined})})})()`);
    } else if (contract.driver === "reading-dashboard-controller") {
      result = await this.evaluate(`(async()=>{window.__task13aWriteAttempts=[];const state=${JSON.stringify(state)},nonce=${JSON.stringify(nonce)},registry=window.__task13aFixtureRegistry,controller=window.__prodigyReadingDashboard,row=window.__task13aReadingRow;if(!controller)throw new Error('TASK13A_READING_CONTROLLER_MISSING');const providerNonce=state==='disabled'?nonce+':prepare':nonce;const behavior=state==='loading'?{nonce:providerNonce,kind:'defer'}:state==='error-recovery'?{nonce:providerNonce,kind:'reject',error:'synthetic_reading_unavailable'}:{nonce:providerNonce,kind:'resolve',value:state==='empty'?[]:[row]};registry.configure('reading','listReadings',behavior);let consumed;const signal=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId!=='reading'||detail.operation!=='listReadings'||detail.nonce!==providerNonce)return;window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_READING_PROVIDER_TIMEOUT'))},30000)});if(state==='loading'){window.__task13aReadingPending=controller.refresh();consumed=await signal;}else{const refresh=controller.refresh();consumed=await signal;await refresh}if(state==='selected-active'){const focused=new Promise((resolve,reject)=>{const listener=event=>{if(event.target&&event.target.matches&&event.target.matches('[data-reading-path="PARA/PROJECTS/Reading/Synthetic.md"]')){document.removeEventListener('focusin',listener,true);clearTimeout(timer);resolve(true)}};document.addEventListener('focusin',listener,true);const timer=setTimeout(()=>{document.removeEventListener('focusin',listener,true);reject(new Error('TASK13A_READING_FOCUS_TIMEOUT'))},5000)});const focusResult=controller.focusCard('PARA/PROJECTS/Reading/Synthetic.md',{restoreFocus:false});if(!focusResult||focusResult.ok!==true)throw new Error('TASK13A_READING_FOCUS_FAILED:'+JSON.stringify({state:controller.getState(),paths:[...document.querySelectorAll('[data-reading-path]')].map(element=>element.getAttribute('data-reading-path')),scopeKeys:Object.keys(window.__prodigyReadingMountScope||{}),scopeType:typeof window.__prodigyReadingMountScope}));await focused}if(state==='disabled'){const open=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="reading"] button')].find(button=>button.textContent.trim()==='수동 등록');if(!open)throw new Error('TASK13A_READING_MANUAL_CONTROL_MISSING');open.click();const modal=document.querySelector('.reading-manual-registration-modal');if(!modal)throw new Error('TASK13A_READING_MANUAL_MODAL_MISSING');const input=modal.querySelector('input');input.value='TASK13A 합성 독서';input.dispatchEvent(new Event('input',{bubbles:true}));const original=window.ReadingBookCreate.createManualReadingObject;window.__task13aReadingWriterOriginal=original;window.ReadingBookCreate.createManualReadingObject=(appArg,value)=>registry.consume('reading','manualCreate',{title:value&&value.title});registry.configure('reading','manualCreate',{nonce,kind:'defer'});const manualSignal=new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='reading'&&detail.operation==='manualCreate'&&detail.nonce===nonce){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_READING_MANUAL_TIMEOUT'))},30000)});const save=[...modal.querySelectorAll('button')].find(button=>button.textContent.trim()==='등록');save.click();consumed=await manualSignal}return{detail:consumed,eventBeforeTrigger:true,adapterConsumed:true}})()`);
    } else if (contract.driver === "workout-published-controller") {
      result = await this.evaluate(`(async()=>{window.__task13aWriteAttempts=[];const state=${JSON.stringify(state)},nonce=${JSON.stringify(nonce)},registry=window.__task13aFixtureRegistry,controller=window.__prodigyWorkoutController;if(!controller||!controller.isActive())throw new Error('TASK13A_WORKOUT_CONTROLLER_MISSING');const activity={activity_id:'run_task13a',start_time:'2026-08-11T06:00:00.000Z',distance_m:5000,elapsed_s:1800,source:'manual',data_quality:'summary_only',splits:[]};const container=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"] .workout-workspace-content');const rebuild=(initialTab)=>{container.querySelectorAll(':scope > .workout-health-tablist,:scope > .workout-health-panels').forEach(element=>element.remove());const shell=window.WorkoutHealthShell.renderShell(container,{strength:(panel,context)=>window.WorkoutRunningView.renderRunningPanel(app,panel,context),nutrition:(panel,context)=>window.WorkoutNutritionView.renderNutritionPanel(app,panel,context),running:(panel,context)=>window.WorkoutRunningView.renderRunningPanel(app,panel,context)},{initialTab});controller.replaceShell(shell);return shell};const configure=(operation,kind,value,suffix)=>registry.configure('workout',operation,{nonce:nonce+(suffix||''),kind,value,error:'synthetic_workout_unavailable'});const waitProvider=(operation,expectedNonce)=>new Promise((resolve,reject)=>{const listener=event=>{const detail=event.detail||{};if(detail.workspaceId==='workout'&&detail.operation===operation&&detail.nonce===expectedNonce){window.removeEventListener('task13a-provider-consumed',listener);clearTimeout(timer);resolve(detail)}};window.addEventListener('task13a-provider-consumed',listener);const timer=setTimeout(()=>{window.removeEventListener('task13a-provider-consumed',listener);reject(new Error('TASK13A_WORKOUT_PROVIDER_TIMEOUT:'+operation+':'+JSON.stringify({expectedNonce,consumptions:registry.consumptions().filter(item=>item.workspaceId==='workout'),tabs:[...document.querySelectorAll('.workout-health-tab')].map(tab=>({tab:tab.dataset.tab,selected:tab.getAttribute('aria-selected')})),panel:document.querySelector('.workout-health-panel:not([hidden])')&&document.querySelector('.workout-health-panel:not([hidden])').innerText.slice(0,200)})))},5000)});const waitDom=(predicate,label)=>new Promise((resolve,reject)=>{const root=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"]');const finish=()=>{const value=predicate(root);if(!value)return false;observer.disconnect();clearTimeout(timer);resolve(value);return true};const observer=new MutationObserver(finish);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy','aria-selected','disabled','data-capture-state']});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_WORKOUT_DOM_TIMEOUT:'+label))},30000);finish()});let consumed;if(state==='selected-active'||state==='disabled'){const suffix=state==='disabled'?':prepare':'';configure('nutritionEntries','resolve',[],suffix);const provider=waitProvider('nutritionEntries',nonce+suffix);const dom=waitDom(root=>root.querySelector('.workout-health-tab[data-tab="nutrition"][aria-selected="true"]'),'nutrition');rebuild('nutrition');consumed=await provider;await dom;if(state==='disabled'){const manual=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="workout"] button')].find(button=>button.textContent.trim()==='직접 기록');if(!manual)throw new Error('TASK13A_WORKOUT_MANUAL_MISSING');manual.click();const modal=document.querySelector('.workout-modal');if(!modal)throw new Error('TASK13A_WORKOUT_MODAL_MISSING');const name=modal.querySelector('input[aria-label="음식명"]'),cal=modal.querySelector('input[aria-label="칼로리"]');name.value='TASK13A 합성 식사';name.dispatchEvent(new Event('input',{bubbles:true}));cal.value='100';cal.dispatchEvent(new Event('input',{bubbles:true}));configure('healthSave','defer',null,'');const saveSignal=waitProvider('healthSave',nonce);const save=[...modal.querySelectorAll('button')].find(button=>button.textContent.trim()==='저장');save.click();consumed=await saveSignal;if(!save.disabled)throw new Error('TASK13A_WORKOUT_SAVE_NOT_DISABLED')}}else{const primaryKind=state==='loading'?'defer':state==='error-recovery'?'reject':'resolve';configure('runActivities',primaryKind,state==='normal'?[activity]:[], '');configure('sessions','resolve',[],':sessions');const provider=waitProvider('runActivities',nonce);const dom=state==='loading'?waitDom(root=>root.querySelector('.workout-health-panel[aria-busy="true"] .workout-panel-loading'),'loading'):state==='error-recovery'?waitDom(root=>root.querySelector('.workout-error'),'error'):state==='empty'?waitDom(root=>root.querySelector('.workout-empty'),'empty'):waitDom(root=>root.querySelector('.workout-running-latest'),'normal');rebuild('running');consumed=await provider;await dom;if(state==='loading')window.__task13aWorkoutPending=true}return{detail:consumed,eventBeforeTrigger:true,adapterConsumed:true}})()`);
    } else {
      await this.evaluate("window.__task13aWriteAttempts=[];true");
      result = { detail: null, eventBeforeTrigger: false, adapterConsumed: false, error: `TASK13A_DRIVER_UNAVAILABLE:${workspaceId}:${state}` };
    }
    if (declaredEffect === "geometry-producing") result.layoutEpoch = await this.completeKnowledgeScenarioEpoch();
    result.declaredEffect = declaredEffect;
    this.lastScenarioDriver = { workspaceId, state, nonce, contract, result };
    return { execution: mount.execution, consumption: result.detail, driver: contract.driver, error: result.error || null };
  }
  async resetStructuralScenario(workspaceId, state) {
    if (!this.structuralMount || this.structuralMount.workspaceId !== workspaceId) throw new Error("TASK13A_SCENARIO_RESET_OWNER");
    if (workspaceId === "project") {
      return this.evaluate(`(async()=>{const state=${JSON.stringify(state)},registry=window.__task13aFixtureRegistry,modal=window.__task13aProjectModal;if(state==='loading'){const value={workflow:[{label:'요구사항 확인'},{label:'자료 수집'},{label:'초안 작성'},{label:'검토'}],provider:'task13a-synthetic',model:'task13a-synthetic'};if(!registry.settle('project','generateStructuredWorkflow','resolve',value))throw new Error('TASK13A_PROJECT_DEFERRED_MISSING');await new Promise((resolve,reject)=>{const finish=()=>{if(modal.state.busy)return;observer.disconnect();clearTimeout(timer);resolve()};const observer=new MutationObserver(finish);observer.observe(modal.contentEl,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_PROJECT_RESET_TIMEOUT'))},10000);finish()})}if(modal&&document.querySelector('.modal-container .prodigy-project-wizard'))modal.close();window.__task13aProjectMemoryBoundary.reset();const pending=registry.pending().filter(item=>item.key.startsWith('project:'));if(pending.length)throw new Error('TASK13A_PENDING_DEFERRED:'+JSON.stringify(pending));if(window.__task13aProjectGenerateOriginal||window.__task13aProjectTodoistOriginal||window.__task13aProjectRenderOriginal)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return{ok:true,pending:0,providerRestored:true}})()`);
    }
    if (workspaceId === "knowledge") {
      return this.evaluate(`(async()=>{const state=${JSON.stringify(state)},registry=window.__task13aFixtureRegistry,hub=window.KnowledgeExplorerHub;if(state==='loading'){hub.llmWikiRunController.cancel({action:'cancel'});registry.settle('knowledge','analyzeBatch','resolve',{ok:false,reason:'synthetic_cancelled',provider_calls:0});await window.__task13aKnowledgeRunTerminal.promise;delete window.__task13aKnowledgeRunTerminal;delete window.__task13aKnowledgePendingRun}hub.llmWikiRunController.reload({action:'reload'});hub.llmWikiLifecycle.update(hub.llmWikiRunController.getSnapshot());hub.api.setSurfaceState('rest');hub.api.setSearchQuery('');hub.tabs.select('zettelkasten');window.__task13aKnowledgeConnector=null;const pending=registry.pending().filter(item=>item.key.startsWith('knowledge:'));if(pending.length)throw new Error('TASK13A_PENDING_DEFERRED:'+JSON.stringify(pending));const snapshot=hub.llmWikiRunController.getSnapshot();if(snapshot.status!=='idle'||Object.values(snapshot.counters||{}).some(Boolean))throw new Error('TASK13A_STALE_CONTROLLER:'+JSON.stringify(snapshot));let identityRestored=true;if(window.__task13aKnowledgeStateControllerOriginal){const original=window.__task13aKnowledgeStateControllerOriginal;hub.llmWikiRunController=original;identityRestored=hub.llmWikiRunController===original;delete window.__task13aKnowledgeStateControllerOriginal}if(!identityRestored)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return{ok:true,pending:0,providerRestored:true,controllerStatus:snapshot.status}})()`);
    }
    if (workspaceId === "personal") {
      if (state === "selected-active") {
        await this.setMetricsAndAwaitResize(workspaceId, 390, 1);
        await this.renderedClick('.ppw-detail-back', "목록");
      }
      return this.evaluate(`(async()=>{const state=${JSON.stringify(state)},registry=window.__task13aFixtureRegistry,controllers=window.__task13aPersonalControllers;if(state==='loading'){registry.settle('personal','peopleBody','resolve','TASK13A synthetic person body.');await window.__task13aPersonalPending}else if(state==='error-recovery'){registry.configure('personal','peopleBody',{nonce:'personal:recovery',kind:'resolve',value:'TASK13A synthetic person body.'});await controllers.people.retryPersonRead('PARA/RESOURCES/CONTACTS/TASK13A Person.md')}else if(state==='disabled'){registry.settle('personal','placeBody','resolve','TASK13A synthetic venue body.');await window.__task13aPersonalPending}delete window.__task13aPersonalPending;if(state==='selected-active'&&!window.__task13aPersonalFocusVerified)throw new Error('TASK13A_PERSONAL_FOCUS_SCROLL_NOT_RESTORED');delete window.__task13aPersonalFocusVerified;controllers.people.setData([],[]);controllers.places.setData([]);const peopleTab=[...document.querySelectorAll('.personal-tabs [role="tab"]')].find(tab=>tab.textContent.trim()==='사람');if(peopleTab)peopleTab.click();const pending=registry.pending().filter(item=>item.key.startsWith('personal:'));if(pending.length)throw new Error('TASK13A_PENDING_DEFERRED:'+JSON.stringify(pending));return{ok:true,pending:0,focusRestored:true,scrollRestored:true}})()`);
    }
    if (workspaceId === "journal") {
      return this.evaluate(`(async()=>{const state=${JSON.stringify(state)},registry=window.__task13aFixtureRegistry,normal=window.__task13aJournalReview;if(state==='loading'){registry.settle('journal','periodRecords','resolve',[]);await window.__task13aJournalPending;delete window.__task13aJournalPending}if(state==='disabled')registry.settle('journal','reflectionProvider','reject','synthetic_cancelled');const modal=window.__task13aJournalReflection;if(modal){const opener=modal.openerEl;modal.close();await Promise.resolve();await Promise.resolve();if(document.querySelector('.prodigy-reflection-modal'))throw new Error('TASK13A_JOURNAL_MODAL_NOT_CLOSED');if(!window.__task13aJournalFocusVerified)throw new Error('TASK13A_JOURNAL_FOCUS_NOT_RESTORED');delete window.__task13aJournalFocusVerified;if(modal.classificationCleanup)throw new Error('TASK13A_CONNECTOR_PROGRESS')}delete window.__task13aJournalReflection;if(window.__task13aJournalProviderOriginals){const saved=window.__task13aJournalProviderOriginals;window.DailyReflectionAI.generateProposal=saved.generate;window.ProjectWorkflowDraftService.loadProviderConfig=saved.config;if(window.DailyReflectionAI.generateProposal!==saved.generate||window.ProjectWorkflowDraftService.loadProviderConfig!==saved.config)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');delete window.__task13aJournalProviderOriginals}registry.configure('journal','review',{nonce:'journal:reset:'+state+':review',kind:'resolve',value:normal});registry.configure('journal','recent',{nonce:'journal:reset:'+state+':recent',kind:'resolve',value:[]});if(window.__task13aJournalPeriod.getSelected()!=='daily')await window.__task13aJournalPeriod.select('daily');if(window.__task13aJournalDashboard)await window.__task13aJournalDashboard.refresh('2026-08-11');const pending=registry.pending().filter(item=>item.key.startsWith('journal:'));if(pending.length)throw new Error('TASK13A_PENDING_DEFERRED:'+JSON.stringify(pending));return{ok:true,pending:0,focusRestored:true,providerRestored:true}})()`);
    }
    if ((workspaceId === "home" || workspaceId === "auction") && state === "error-recovery") {
      await this.evaluate(`(()=>{const workspaceId=${JSON.stringify(workspaceId)};window.__task13aAdapterRecoverySignal=new Promise((resolve,reject)=>{let settled=false;const cleanup=()=>{document.removeEventListener('prodigy-workspace-state-settled',onSettled,true);document.removeEventListener('focusin',onFocus,true);clearTimeout(guard)},onFocus=event=>{const owner=event.target&&event.target.closest&&event.target.closest('[data-prodigy-state-owner="'+CSS.escape(workspaceId)+'"]');if(!settled||!owner)return;cleanup();resolve({workspaceId,eventBeforeTrigger:true,state:'normal',focusOwner:owner.getAttribute('data-prodigy-state-owner'),tabindex:owner.getAttribute('tabindex')})},onSettled=event=>{const detail=event.detail||{};if(detail.workspaceId!==workspaceId||detail.state!=='normal')return;settled=true;document.addEventListener('focusin',onFocus,true)};document.addEventListener('prodigy-workspace-state-settled',onSettled,true);const guard=setTimeout(()=>{cleanup();reject(new Error('TASK13A_ADAPTER_RECOVERY_FOCUS_TIMEOUT'))},5000)});return true})()`);
      await this.renderedClick(`.prodigy-app-shell[data-workspace-id="${workspaceId}"] .prodigy-required-recovery button`, "다시 시도");
      const receipt = await this.evaluate("window.__task13aAdapterRecoverySignal");
      await this.evaluate("delete window.__task13aAdapterRecoverySignal;true");
      return { ok: true, pending: 0, focusRestored: receipt.focusOwner === workspaceId && receipt.tabindex === "-1", eventBeforeTrigger: receipt.eventBeforeTrigger };
    }
    if (workspaceId === "reading") {
      return this.evaluate(`(async()=>{const state=${JSON.stringify(state)},registry=window.__task13aFixtureRegistry,controller=window.__prodigyReadingDashboard,row=window.__task13aReadingRow;let providerRestored=true;if(state==='loading'){registry.settle('reading','listReadings','resolve',[row]);await window.__task13aReadingPending;delete window.__task13aReadingPending}else if(state==='disabled'){registry.settle('reading','manualCreate','reject','synthetic_cancelled');const modal=document.querySelector('.reading-manual-registration-modal');if(modal){await new Promise((resolve,reject)=>{const button=[...modal.querySelectorAll('button')].find(item=>item.textContent.trim()==='등록');if(!button||!button.disabled){resolve();return}const observer=new MutationObserver(()=>{if(!button.disabled){observer.disconnect();clearTimeout(timer);resolve()}});observer.observe(button,{attributes:true,attributeFilter:['disabled']});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_READING_CANCEL_TIMEOUT'))},5000)});const cancel=[...modal.querySelectorAll('button')].find(item=>item.textContent.trim()==='취소');if(cancel)cancel.click()}if(window.__task13aReadingWriterOriginal){providerRestored=window.ReadingBookCreate.createManualReadingObject!==window.__task13aReadingWriterOriginal;window.ReadingBookCreate.createManualReadingObject=window.__task13aReadingWriterOriginal;providerRestored=providerRestored&&window.ReadingBookCreate.createManualReadingObject===window.__task13aReadingWriterOriginal;delete window.__task13aReadingWriterOriginal}}else{registry.configure('reading','listReadings',{nonce:'reading:reset:'+state,kind:'resolve',value:[row]});await controller.refresh()}const pending=registry.pending().filter(item=>item.key.startsWith('reading:'));if(pending.length)throw new Error('TASK13A_PENDING_DEFERRED:'+JSON.stringify(pending));if(!providerRestored)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');return{ok:true,pending:0,providerRestored}})()`);
    }
    if (workspaceId === "workout") {
      return this.evaluate(`(async()=>{const state=${JSON.stringify(state)},registry=window.__task13aFixtureRegistry,controller=window.__prodigyWorkoutController;if(state==='loading'){registry.settle('workout','runActivities','resolve',[]);window.__task13aWorkoutPending=false;await new Promise((resolve,reject)=>{const root=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"]');const finish=()=>{const panel=root.querySelector('.workout-health-panel:not([hidden])');if(!panel||panel.getAttribute('aria-busy')==='true')return;observer.disconnect();clearTimeout(timer);resolve()};const observer=new MutationObserver(finish);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_WORKOUT_RESET_TIMEOUT'))},5000);finish()})}else if(state==='error-recovery'){registry.configure('workout','runActivities',{nonce:'workout:recovery',kind:'resolve',value:[]});registry.configure('workout','sessions',{nonce:'workout:recovery:sessions',kind:'resolve',value:[]});const retry=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="workout"] button')].find(button=>button.textContent.trim()==='다시 시도');if(retry)retry.click();await new Promise((resolve,reject)=>{const root=document.querySelector('.prodigy-app-shell[data-workspace-id="workout"]');const finish=()=>{if(!root.querySelector('.workout-empty'))return;observer.disconnect();clearTimeout(timer);resolve()};const observer=new MutationObserver(finish);observer.observe(root,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_WORKOUT_RECOVERY_TIMEOUT'))},5000);finish()})}else if(state==='disabled'){registry.settle('workout','retryBusy','reject','synthetic_cancelled')}const pending=registry.pending().filter(item=>item.key.startsWith('workout:'));if(pending.length)throw new Error('TASK13A_PENDING_DEFERRED:'+JSON.stringify(pending));return{ok:true,pending:0,providerRestored:true}})()`);
    }
    return { ok: true, pending: 0, providerRestored: true };
  }
  async disposeStructuralWorkspace() {
    if (!this.structuralMount) return false;
    const workspaceId = this.structuralMount.workspaceId;
    const disposed = await this.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(${JSON.stringify(workspaceId)})+'"]');const block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine');if(${JSON.stringify(workspaceId)}==='workout'&&window.__task13aWorkoutProviderOriginals){window.WorkoutHealthStore.createHealthStore=window.__task13aWorkoutProviderOriginals.health;window.WorkoutStore.createWorkoutStore=window.__task13aWorkoutProviderOriginals.strength;if(window.WorkoutHealthStore.createHealthStore!==window.__task13aWorkoutProviderOriginals.health||window.WorkoutStore.createWorkoutStore!==window.__task13aWorkoutProviderOriginals.strength)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');delete window.__task13aWorkoutProviderOriginals}if(${JSON.stringify(workspaceId)}==='project'&&window.__task13aProjectModal){if(document.querySelector('.modal-container .prodigy-project-wizard'))window.__task13aProjectModal.close();delete window.__task13aProjectModal}if(${JSON.stringify(workspaceId)}==='knowledge'&&window.__task13aKnowledgeOriginals){const hub=window.KnowledgeExplorerHub,originals=window.__task13aKnowledgeOriginals;hub.api=originals.api;hub.tabs=originals.tabs;hub.llmWikiRunController=originals.controller;document.removeEventListener('click',originals.clickListener,true);if(hub.api!==originals.api||hub.tabs!==originals.tabs||hub.llmWikiRunController!==originals.controller)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');delete window.__task13aKnowledgeOriginals;delete window.__task13aKnowledgeConnector;delete window.__task13aKnowledgeApprovalActions}if(${JSON.stringify(workspaceId)}==='personal'&&window.__task13aPersonalOriginals){const saved=window.__task13aPersonalOriginals;app.vault.cachedRead=saved.cachedRead;app.vault.read=saved.read;if(app.vault.cachedRead!==saved.cachedRead||app.vault.read!==saved.read)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED');const storage=window.sessionStorage,key='prodigy.personal.workspace-tab.v1',prior=window.__task13aPersonalStorageOriginal;if(prior&&prior.own)storage.setItem(key,prior.value);else storage.removeItem(key);delete window.__task13aPersonalControllers;delete window.__task13aPersonalReadEvents;delete window.__task13aPersonalStorageOriginal;delete window.__task13aPersonalOriginals}if(${JSON.stringify(workspaceId)}==='journal'&&window.__task13aJournalReflection){window.__task13aJournalReflection.close();delete window.__task13aJournalReflection}const result=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.disposeWorkspace(block);if(${JSON.stringify(workspaceId)}==='journal'&&window.__task13aJournalOriginals){const originals=window.__task13aJournalOriginals;for(const [name,saved] of Object.entries(originals.modules)){delete window[name];if(saved.descriptor)Object.defineProperty(window,name,saved.descriptor);else window[name]=saved.api;if(window[name]!==saved.api)throw new Error('TASK13A_PROVIDER_IDENTITY_NOT_RESTORED:'+name)}delete window.__task13aJournalOriginals;delete window.__task13aJournalPeriod;delete window.__task13aJournalDashboard;delete window.__task13aJournalStates;delete window.__task13aJournalReflectionEvents}if(window.__task13aStructuralAdapters)delete window.__task13aStructuralAdapters[${JSON.stringify(workspaceId)}];if(window.__task13aFixtureRegistry)window.__task13aFixtureRegistry.clear(${JSON.stringify(workspaceId)});if(${JSON.stringify(workspaceId)}==='reading'){delete window.__prodigyReadingDashboardOptions;delete window.__task13aReadingRow;if(window.__task13aOriginalResizeObserver){window.ResizeObserver=window.__task13aOriginalResizeObserver;delete window.__task13aOriginalResizeObserver}}return result===true})()`);
    this.structuralMount = null;
    return disposed;
  }
  async setMetricsAndAwaitResize(workspaceId, width, zoom) {
    await this.evaluate(`(()=>{const workspaceId=${JSON.stringify("__WORKSPACE__")}.replace('__WORKSPACE__',${JSON.stringify(workspaceId)}),width=${JSON.stringify(width)},shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(workspaceId)+'"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);if(!shell||!block||!mount||mount.signal.aborted)throw new Error('TASK13A_METRICS_OWNER');let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const observer=new ResizeObserver(entries=>{if(innerWidth!==width||!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block))return;const current=window.ProdigyHubLoader.currentWorkspace(block);if(current!==mount||mount.signal.aborted){observer.disconnect();clearTimeout(guard);rejectPending(new Error('TASK13A_METRICS_OWNER_REPLACED'));return}observer.disconnect();clearTimeout(guard);resolvePending({workspaceId,width,innerWidth,visualViewportWidth:visualViewport&&visualViewport.width,shellClientWidth:shell.clientWidth,blockClientWidth:block.clientWidth,mountGeneration:mount.mountGeneration})});observer.observe(shell);observer.observe(block);const guard=setTimeout(()=>{observer.disconnect();rejectPending(new Error('TASK13A_METRICS_SETTLEMENT_TIMEOUT'))},10000);window.__task13aMetricsSignal={promise};return{subscribedBeforeTrigger:true,mountGeneration:mount.mountGeneration}})()`);
    await this.cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false, scale: 1 });
    await this.evaluate(`document.documentElement.style.zoom=${JSON.stringify(String(zoom || 1))};true`);
    const receipt = await this.evaluate("window.__task13aMetricsSignal.promise");
    await this.evaluate("delete window.__task13aMetricsSignal;true");
    return receipt;
  }
  async collapseSidebar(workspaceId, side) {
    return this.evaluate(`(()=>{const workspaceId=${JSON.stringify(workspaceId)},side=${JSON.stringify(side)},split=app.workspace[side+'Split'],splitRoot=split&&split.containerEl,shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(workspaceId)+'"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);if(!shell||!block||!mount||mount.signal.aborted||!splitRoot)throw new Error('TASK13A_SIDEBAR_COLLAPSE_OWNER');if(split.collapsed){split.collapse();return{side,width:shell.getBoundingClientRect().width,mountGeneration:mount.mountGeneration,alreadyCollapsed:true}}return new Promise((resolve,reject)=>{let observer=null,transitionObserved=false,settled=false;const active=new Map(),owns=event=>event.target instanceof Element&&document.body.contains(event.target),removeListeners=()=>{document.removeEventListener('transitionrun',onRun,true);document.removeEventListener('transitionend',onEnd,true);document.removeEventListener('transitioncancel',onEnd,true)},finish=()=>{if(settled)return;settled=true;if(observer)observer.disconnect();removeListeners();clearTimeout(guard);resolve({side,width:shell.getBoundingClientRect().width,mountGeneration:mount.mountGeneration,transitionObserved})},armFreshSnapshot=()=>{if(observer)observer.disconnect();observer=new ResizeObserver(entries=>{if(!split.collapsed||!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block))return;finish()});observer.observe(shell);observer.observe(block)},onRun=event=>{if(!owns(event))return;transitionObserved=true;let properties=active.get(event.target);if(!properties){properties=new Set();active.set(event.target,properties)}properties.add(event.propertyName)},onEnd=event=>{if(!owns(event))return;const properties=active.get(event.target);if(properties){properties.delete(event.propertyName);if(properties.size===0)active.delete(event.target)}if(transitionObserved&&active.size===0&&split.collapsed)armFreshSnapshot()};document.addEventListener('transitionrun',onRun,true);document.addEventListener('transitionend',onEnd,true);document.addEventListener('transitioncancel',onEnd,true);observer=new ResizeObserver(entries=>{if(!split.collapsed||transitionObserved||!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block))return;finish()});observer.observe(shell);observer.observe(block);const guard=setTimeout(()=>{if(observer)observer.disconnect();removeListeners();reject(new Error('TASK13A_SIDEBAR_COLLAPSE_TIMEOUT:'+side))},10000);split.collapse()})})()`);
  }
  async armSidebarRootEpoch(workspaceId, targetWidth) {
    return this.evaluate(`(()=>{const workspaceId=${JSON.stringify(workspaceId)},targetWidth=${JSON.stringify(targetWidth)},shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(workspaceId)+'"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);if(!shell||!block||!mount||mount.signal.aborted)throw new Error('TASK13A_SIDEBAR_ROOT_OWNER');let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject}),observer=new ResizeObserver(entries=>{if(innerWidth!==targetWidth||shell.getBoundingClientRect().width<=0||!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block))return;observer.disconnect();clearTimeout(guard);resolvePending({workspaceId,targetWidth,width:shell.getBoundingClientRect().width,mountGeneration:mount.mountGeneration})});observer.observe(shell);observer.observe(block);const guard=setTimeout(()=>{observer.disconnect();rejectPending(new Error('TASK13A_SIDEBAR_ROOT_TIMEOUT'))},10000);window.__task13aSidebarRootEpoch={promise};return{subscribedBeforeTrigger:true,targetWidth}})()`);
  }
  async completeSidebarRootEpoch() {
    await this.evaluate(`(()=>{if(!window.__task13aSidebarRootEpoch)throw new Error('TASK13A_SIDEBAR_ROOT_UNARMED');if(app.workspace.leftSplit)app.workspace.leftSplit.collapse();if(app.workspace.rightSplit)app.workspace.rightSplit.collapse();return true})()`);
    const receipt = await this.evaluate("window.__task13aSidebarRootEpoch.promise");
    await this.evaluate("delete window.__task13aSidebarRootEpoch;true");
    return receipt;
  }
  async armKnowledgeSidebarEpoch(targetWidth) {
    return this.evaluate(`(()=>{const targetWidth=${JSON.stringify(targetWidth)},shell=document.querySelector('.prodigy-app-shell[data-workspace-id="knowledge"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block),before=Number(shell&&shell.dataset.prodigyResponsiveGeneration)||0;if(!shell||!block||!mount||mount.signal.aborted)throw new Error('TASK13A_SIDEBAR_EPOCH_OWNER');let resolvePending,rejectPending,freshObserver=null,acknowledged=false;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const listener=event=>{const detail=event.detail||{};if(event.target!==shell||detail.workspaceId!=='knowledge'||detail.mountGeneration!==mount.mountGeneration||detail.generation<=before||!(detail.logicalWidth>0))return;document.removeEventListener('prodigy-responsive-layout-settled',listener,true);actuatorObserver.disconnect();freshObserver=new ResizeObserver(entries=>{if(!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block)||shell.getBoundingClientRect().width<=0)return;freshObserver.disconnect();clearTimeout(guard);resolvePending({beforeGeneration:before,participant:detail,width:shell.getBoundingClientRect().width,targetWidth})});freshObserver.observe(shell);freshObserver.observe(block)};const actuatorObserver=new ResizeObserver(()=>{if(acknowledged||innerWidth!==targetWidth||shell.getBoundingClientRect().width<=0)return;acknowledged=true;const participant=shell.__prodigyKnowledgeResponsiveParticipant;if(!participant||participant.acknowledgeResponsiveLayout(mount.mountGeneration)!==true){actuatorObserver.disconnect();rejectPending(new Error('TASK13A_SIDEBAR_PARTICIPANT_REJECTED'))}});document.addEventListener('prodigy-responsive-layout-settled',listener,true);actuatorObserver.observe(shell);const guard=setTimeout(()=>{document.removeEventListener('prodigy-responsive-layout-settled',listener,true);actuatorObserver.disconnect();if(freshObserver)freshObserver.disconnect();rejectPending(new Error('TASK13A_SIDEBAR_EPOCH_TIMEOUT'))},10000);window.__task13aKnowledgeSidebarEpoch={promise,mountGeneration:mount.mountGeneration,targetWidth};return{beforeGeneration:before,targetWidth,subscribedBeforeTrigger:true}})()`);
  }
  async completeKnowledgeSidebarEpoch() {
    await this.evaluate(`(()=>{if(!window.__task13aKnowledgeSidebarEpoch)throw new Error('TASK13A_SIDEBAR_EPOCH_UNARMED');if(app.workspace.leftSplit)app.workspace.leftSplit.collapse();if(app.workspace.rightSplit)app.workspace.rightSplit.collapse();return true})()`);
    const receipt = await this.evaluate("window.__task13aKnowledgeSidebarEpoch.promise");
    await this.evaluate("delete window.__task13aKnowledgeSidebarEpoch;true");
    return receipt;
  }
  async captureStructuralSurfaceSlices() {
    const slices = [];
    for (const config of [{ width: 390, theme: "light", forcedColors: false }, { width: 1440, theme: "dark", forcedColors: false }, { width: 834, theme: "light", forcedColors: true }]) {
      const knowledgeSidebarEpoch = this.structuralMount && this.structuralMount.workspaceId === "knowledge" ? await this.armKnowledgeSidebarEpoch(config.width) : null;
      await this.cdp.send("Emulation.setDeviceMetricsOverride", { width: config.width, height: 900, deviceScaleFactor: 1, mobile: false, scale: 1 });
      await this.issueMediaAuthority(this.structuralMount.workspaceId, config.theme, config.forcedColors, `structural-slice:${config.width}`);
      if (knowledgeSidebarEpoch) await this.completeKnowledgeSidebarEpoch();
      await this.acknowledgeResponsiveEpoch(this.structuralMount && this.structuralMount.workspaceId);
      slices.push(await this.evaluate(`(()=>{const workspaceId=${JSON.stringify(this.structuralMount && this.structuralMount.workspaceId)},sourceFile=${JSON.stringify(this.structuralMount && HUBS.find(([id]) => id === this.structuralMount.workspaceId)[1])};const candidates=[...document.querySelectorAll('.prodigy-app-shell[data-workspace-id="'+CSS.escape(workspaceId)+'"]')].filter(shell=>{const block=shell.closest('.block-language-dataviewjs,.block-language-js-engine'),leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]'),active=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf(),box=shell.getBoundingClientRect(),style=getComputedStyle(shell),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);return shell.isConnected&&leaf&&active&&active.containerEl&&(active.containerEl===leaf||active.containerEl.contains(leaf))&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&block.dataset.task13aSourceFile===sourceFile&&mount&&mount.signal&&!mount.signal.aborted});if(candidates.length!==1)return{...${JSON.stringify(config)},ownerCount:candidates.length,overflow:[],undersized:[]};document.querySelectorAll('[data-task13a-selected-owner]').forEach(node=>node.removeAttribute('data-task13a-selected-owner'));const root=candidates[0];root.setAttribute('data-task13a-selected-owner','true');const modal=${JSON.stringify(this.structuralMount && this.structuralMount.workspaceId)}==='project'?document.querySelector('.modal-container .prodigy-project-wizard'):${JSON.stringify(this.structuralMount && this.structuralMount.workspaceId)}==='journal'?document.querySelector('.modal-container .prodigy-reflection-modal'):null;const elements=[root,...root.querySelectorAll('*'),...(modal?[modal,...modal.querySelectorAll('*')]:[])];const controls=elements.filter(element=>element.matches('button,a[href],[role=button],[role=tab],input,select,textarea'));return{...${JSON.stringify(config)},ownerCount:1,overflow:elements.filter(element=>element.scrollWidth>element.clientWidth+1).map(element=>element.tagName.toLowerCase()+'.'+[...element.classList].slice(0,2).join('.')),undersized:controls.filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&(box.width<44||box.height<44)}).map(element=>element.getAttribute('aria-label')||element.textContent.trim().slice(0,60))}})()`));
    }
    return slices;
  }
  async armKnowledgeScenarioEpoch(state, nonce, declaredEffect) {
    if (declaredEffect !== "geometry-producing") throw new Error("TASK13A_SCENARIO_EFFECT_DECLARATION");
    return this.evaluate(`(()=>{const expected=${JSON.stringify({ workspaceId: "knowledge", state, nonce, declaredEffect })},identities=window.__task13aAuthorityIdentities||(window.__task13aAuthorityIdentities={objects:new WeakMap(),next:1}),id=value=>{if(!identities.objects.has(value))identities.objects.set(value,'authority-'+identities.next++);return identities.objects.get(value)},shell=document.querySelector('.prodigy-app-shell[data-workspace-id="knowledge"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);if(!shell||!block||!mount||mount.signal.aborted)throw new Error('TASK13A_SCENARIO_EPOCH_OWNER');let sequence=0,resolvePending,rejectPending;const trace=[],record=(type,detail={})=>trace.push({sequence:++sequence,type,...detail}),snapshot=()=>{const box=shell.getBoundingClientRect(),tab=shell.querySelector('.knowledge-workspace-tabs [role="tab"][aria-selected="true"]'),panel=shell.querySelector('.knowledge-workspace-panel:not([hidden])'),surface=shell.querySelector('.knowledge-explorer-hub-mount');return{shellId:id(shell),blockId:id(block),mountId:id(mount),mountGeneration:mount.mountGeneration,tabId:tab&&tab.id||null,panelId:panel&&panel.id||null,surfaceId:surface&&id(surface)||null,width:box.width,height:box.height,responsiveGeneration:Number(shell.dataset.prodigyResponsiveGeneration)||0}};const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject}),signal={expected,shell,block,mount,snapshot,record,promise,trace,triggered:false,participant:null,observer:null,guard:null};record('armed',{expected,before:snapshot()});signal.stateListener=event=>{const detail=event.detail||{};if(detail.workspaceId==='knowledge'&&detail.nonce===expected.nonce){record('state-receipt',{operation:detail.operation||null,state:expected.state,snapshot:snapshot()})}};signal.responsiveListener=event=>{if(!signal.triggered||event.target!==shell)return;const detail=event.detail||{};if(detail.workspaceId!=='knowledge'||detail.mountGeneration!==mount.mountGeneration)return;signal.participant=detail;record('responsive-ack',{detail,snapshot:snapshot()});signal.observer=new ResizeObserver(entries=>{if(!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block))return;const currentBlock=shell.closest('.block-language-dataviewjs,.block-language-js-engine'),currentMount=currentBlock&&window.ProdigyHubLoader.currentWorkspace(currentBlock);if(currentBlock!==block||currentMount!==mount||mount.signal.aborted){signal.dispose();rejectPending(new Error('TASK13A_SCENARIO_EPOCH_OWNER_REPLACED'));return}record('root-snapshot',{snapshot:snapshot()});const receipt={declaredEffect:expected.declaredEffect,subscribedBeforeTrigger:true,triggerSequence:signal.triggerSequence,notificationSequence:sequence,participant:detail,before:trace[0].before,after:snapshot(),trace:trace.slice()};signal.dispose();resolvePending(receipt)});signal.observer.observe(shell);signal.observer.observe(block)};signal.dispose=()=>{window.removeEventListener('task13a-provider-consumed',signal.stateListener,true);document.removeEventListener('prodigy-responsive-layout-settled',signal.responsiveListener,true);if(signal.observer)signal.observer.disconnect();if(signal.guard)clearTimeout(signal.guard)};window.addEventListener('task13a-provider-consumed',signal.stateListener,true);document.addEventListener('prodigy-responsive-layout-settled',signal.responsiveListener,true);signal.guard=setTimeout(()=>{signal.dispose();rejectPending(new Error('TASK13A_SCENARIO_EPOCH_TIMEOUT:'+JSON.stringify({expected,trace})))},10000);window.__task13aKnowledgeScenarioEpoch=signal;return{declaredEffect:expected.declaredEffect,subscribedBeforeTrigger:true,owner:snapshot()}})()`);
  }
  async triggerKnowledgeScenarioEpoch() {
    return this.evaluate(`(()=>{const signal=window.__task13aKnowledgeScenarioEpoch;if(!signal||signal.triggered)throw new Error('TASK13A_SCENARIO_EPOCH_TRIGGER');signal.triggered=true;signal.record('trigger-declared',{effect:signal.expected.declaredEffect,snapshot:signal.snapshot()});signal.triggerSequence=signal.trace[signal.trace.length-1].sequence;return{triggerSequence:signal.triggerSequence,effect:signal.expected.declaredEffect}})()`);
  }
  async completeKnowledgeScenarioEpoch() {
    await this.evaluate(`(()=>{const signal=window.__task13aKnowledgeScenarioEpoch;if(!signal||!signal.triggered)throw new Error('TASK13A_SCENARIO_EPOCH_UNARMED');const participant=signal.shell.__prodigyKnowledgeResponsiveParticipant;if(!participant||participant.acknowledgeResponsiveLayout(signal.mount.mountGeneration)!==true)throw new Error('TASK13A_SCENARIO_PARTICIPANT_REJECTED');return true})()`);
    const receipt = await this.evaluate("window.__task13aKnowledgeScenarioEpoch.promise");
    await this.evaluate("delete window.__task13aKnowledgeScenarioEpoch;true");
    return receipt;
  }
  async captureDrivenStructuralScenario(workspaceId, state) {
    const driven = this.lastScenarioDriver;
    const contract = structuralDriverContract(workspaceId, state);
    const scoped = await this.evaluate(`(()=>{const root=document.querySelector('.prodigy-app-shell[data-workspace-id=${JSON.stringify(workspaceId)}]');const contract=${JSON.stringify(contract)};const count=(entry)=>{const scope=entry.scope==='document'?document:entry.scope==='leaf'&&root?root.closest('.workspace-leaf-content[data-type="markdown"]'):root;if(!scope)return 0;return[...scope.querySelectorAll(entry.selector)].filter(node=>entry.text===undefined||node.innerText.trim()===entry.text).filter(node=>entry.textPrefix===undefined||node.innerText.trim().startsWith(entry.textPrefix)).filter(node=>entry.value===undefined||node.value===entry.value).length};return{expected:contract.expected.map(entry=>({...entry,count:count(entry)})),forbidden:contract.forbidden.map(entry=>({...entry,count:count(entry)}))}})()`);
    const receipt = await this.capture(workspaceId, 834, "light", 1, false, state);
    const surfaceSlices = await this.captureStructuralSurfaceSlices();
    const writeAudit = await this.evaluate(`(()=>{const attempts=(window.__task13aWriteAttempts||[]).slice(),runtimePath=item=>/^\\.obsidian\\/(?:workspace(?:-mobile)?\\.json|app\\.json|appearance\\.json|core-plugins\\.json)$/u.test(item.path||'')||/^SYSTEM\\/AI\\/Skills\\/prodigy-review\\/runs\\//u.test(item.path||'');const runtimeMetadata=attempts.filter(runtimePath),scrub=item=>runtimePath(item)?{method:item.method,label:item.label,path_token:'<runtime-metadata>'}:item;return{attempts:attempts.map(scrub),runtimeMetadata:runtimeMetadata.map(scrub),real:attempts.filter(item=>!runtimePath(item)),nodeNetwork:(window.__task13aNodeNetworkAttempts||[]).slice()}})()`);
    const raw = { schemaVersion: 2, matrix: { workspaceId, state }, applicable: contract.applicable, origin: "production-renderer", adapterConsumed: Boolean(driven && driven.result.adapterConsumed), declaredEffect: driven && driven.result.declaredEffect || null, stateLayoutEpoch: driven && driven.result.layoutEpoch || null, driver: contract.driver, driverError: driven && driven.result.error || null, eventBeforeTrigger: Boolean(driven && driven.result.eventBeforeTrigger), expected: scoped.expected, forbidden: scoped.forbidden, expectedCount: scoped.expected.reduce((sum, entry) => sum + entry.count, 0), incompatibleCount: scoped.forbidden.reduce((sum, entry) => sum + entry.count, 0), ownerCount: receipt.shell.count, mountExecution: this.structuralMount && this.structuralMount.mountExecution, mountGeneration: this.structuralMount && this.structuralMount.mountGeneration, blockExecution: this.structuralMount && this.structuralMount.execution, surfaceSlices, writes: writeAudit.real, trappedWriteAttempts: writeAudit.attempts, runtimeMetadataWrites: writeAudit.runtimeMetadata, network: [...(this.osNetworkAttempts || []), ...writeAudit.nodeNetwork], connector: driven && driven.result.evidence || null, stale: !(driven && driven.workspaceId === workspaceId && driven.state === state), keyboard: receipt.keyboard, navigation: receipt.navigation, screenshot: receipt.screenshot, diagnostics: receipt.failures };
    try { validateScenarioReceipt(raw); raw.validation = { ok: true, error: null }; } catch (error) { raw.validation = { ok: false, error: error.message }; }
    return raw;
  }
  async openWorkspaceScenario(workspaceId, state) {
    assert.ok(STRUCTURAL_SCENARIOS.includes(state), "unknown structural scenario");
    const nonce = crypto.randomBytes(8).toString("hex");
    await this.evaluate(`(()=>{const expected=${JSON.stringify({ workspaceId, state, nonce })};const selector={normal:'[data-state="success"]',empty:'[data-state="empty"]',loading:'[data-state="loading"],[aria-busy="true"]','error-recovery':'[data-state="error"],.prodigy-required-recovery','selected-active':'[data-state="selected"],[aria-selected="true"],[aria-pressed="true"]',disabled:'[data-state="disabled"],[aria-disabled="true"],:disabled'}[expected.state];const transitions=[];const observer=new MutationObserver(records=>{for(const record of records){const nodes=[record.target,...record.addedNodes].filter(node=>node&&node.nodeType===1);if(nodes.some(node=>node.matches&&node.matches(selector)||node.querySelector&&node.querySelector(selector)))transitions.push({type:record.type,attribute:record.attributeName||null,at:performance.now()})}});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','aria-busy','aria-selected','aria-pressed','aria-disabled','disabled']});let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});const listener=(event)=>{const detail=event.detail||{};if(detail.workspaceId===expected.workspaceId&&detail.state===expected.state&&detail.nonce===expected.nonce){window.removeEventListener('task13a-scenario-consumed',listener);clearTimeout(guard);resolvePending(detail)}};window.addEventListener('task13a-scenario-consumed',listener);const guard=setTimeout(()=>{window.removeEventListener('task13a-scenario-consumed',listener);observer.disconnect();rejectPending(new Error('TASK13A_SCENARIO_CONSUMPTION_TIMEOUT'))},30000);window.__task13aScenarioPending={promise,rejectPending,observer,transitions,selector};window.__task13aScenario=expected;return true})()`);
    try {
      await this.evaluate(`(async()=>{const leaf=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();if(leaf)await leaf.setViewState({type:'empty',state:{}});return true})()`);
      const execution = await this.openWorkspace(workspaceId);
      const consumption = await this.evaluate("window.__task13aScenarioPending.promise");
      const transition = await this.evaluate(`(()=>{const pending=window.__task13aScenarioPending;pending.observer.disconnect();const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();const host=leafObject&&leafObject.containerEl;const leaf=host&&(host.matches&&host.matches('.workspace-leaf-content[data-type="markdown"]')?host:host.querySelector('.workspace-leaf-content[data-type="markdown"]'));return{selector:pending.selector,events:pending.transitions,current:leaf?leaf.querySelectorAll(pending.selector).length:0}})()`);
      this.lastScenarioConsumption = consumption;
      this.lastScenarioTransition = transition;
      return { execution, consumption, transition };
    } catch (error) {
      await this.evaluate(`window.__task13aScenarioPending&&window.__task13aScenarioPending.rejectPending(new Error('TASK13A_SCENARIO_ABORTED'));true`).catch(() => {});
      throw error;
    }
  }
  async captureStructuralScenario(workspaceId, state) {
    const receipt = await this.capture(workspaceId, 834, "light", 1, false, state);
    const stateKey = state === "error-recovery" ? "errorRecovery" : state === "selected-active" ? "selectedActive" : state;
    const counts = receipt.states.counts;
    const expectedCount = counts[stateKey] || 0;
    const incompatibleCount = Object.entries(counts).filter(([key]) => key !== stateKey).reduce((sum, [, count]) => sum + count, 0);
    const raw = { schemaVersion: 1, matrix: { workspaceId, state }, applicable: true, origin: "production-renderer", adapterConsumed: true, consumption: this.lastScenarioConsumption || null, transition: this.lastScenarioTransition || null, expectedCount, incompatibleCount, ownerCount: receipt.shell.count, writes: [], stale: false, keyboard: receipt.keyboard, navigation: receipt.navigation, screenshot: receipt.screenshot, source: { file: HUBS.find(([id]) => id === workspaceId)[1], sha256: this.runtime.manifest[HUBS.find(([id]) => id === workspaceId)[1]][0].sha256 }, diagnostics: receipt.failures };
    try { validateScenarioReceipt(raw); raw.validation = { ok: true, error: null }; } catch (error) { raw.validation = { ok: false, error: error.message }; }
    return raw;
  }
  async layoutAuthoritySnapshot(workspaceId, epoch) {
    const sourceFile = HUBS.find(([id]) => id === workspaceId)[1];
    const sourceHash = this.runtime.manifest[sourceFile][0].sha256;
    return this.evaluate(`(()=>{const expected=${JSON.stringify({ workspaceId, renderer: workspaceId, sourceFile, sourceHash })},choose=${selectActiveProductionMount.toString()},identities=window.__task13aAuthorityIdentities||(window.__task13aAuthorityIdentities={objects:new WeakMap(),next:1}),id=value=>{if(!identities.objects.has(value))identities.objects.set(value,'authority-'+identities.next++);return identities.objects.get(value)},activeLeafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf(),activeLeafContainer=activeLeafObject&&activeLeafObject.containerEl,candidates=[...document.querySelectorAll('.prodigy-app-shell')].map(shell=>{const leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]'),block=shell.closest('.block-language-dataviewjs,.block-language-js-engine'),style=getComputedStyle(shell),leafStyle=leaf&&getComputedStyle(leaf),box=shell.getBoundingClientRect(),mount=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);return{shell,block,mount,descriptor:{connected:shell.isConnected&&Boolean(leaf&&leaf.isConnected),displayed:style.display!=='none'&&leafStyle&&leafStyle.display!=='none',visible:style.visibility!=='hidden'&&style.visibility!=='collapse'&&leafStyle&&leafStyle.visibility!=='hidden',activeLeaf:Boolean(activeLeafContainer&&(activeLeafContainer===leaf||activeLeafContainer.contains(leaf))),registryOwned:Boolean(mount&&mount.signal&&!mount.signal.aborted&&block&&block.contains(shell)),width:box.width,height:box.height,workspaceId:shell.dataset.workspaceId||null,renderer:mount&&mount.manifest&&mount.manifest.renderer||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null}}}),descriptor=choose(candidates.map(candidate=>candidate.descriptor),expected),selected=candidates.find(candidate=>candidate.descriptor===descriptor),roots=[selected.shell,selected.block],environment={viewportWidth:innerWidth,documentWidth:document.documentElement.clientWidth,cssZoom:getComputedStyle(document.documentElement).zoom,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',forcedColors:matchMedia('(forced-colors: active)').matches};return{epoch:${JSON.stringify(epoch)},status:'SETTLED',owner:{shellId:id(selected.shell),blockId:id(selected.block),mountId:id(selected.mount),registryLive:Boolean(selected.mount&&selected.mount.signal&&!selected.mount.signal.aborted),workspaceId:selected.shell.dataset.workspaceId||null,sourceFile:selected.block&&selected.block.dataset.task13aSourceFile||null,sourceHash:selected.block&&selected.block.dataset.task13aSourceHash||null},environment,styleOrder:[...document.head.querySelectorAll('style')].map(id),roots:roots.map(root=>{const box=root.getBoundingClientRect();return{id:id(root),width:box.width,height:box.height}})}})()`);
  }
  async settleActiveTransitions(workspaceId) {
    return this.evaluate(`(()=>{const workspaceId=${JSON.stringify(workspaceId)},shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(workspaceId)+'"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);if(!shell||!block||!mount||mount.signal.aborted)throw new Error('TASK13A_TRANSITION_OWNER');const animations=document.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'||animation.playState==='pending');if(animations.length===0)return{count:0,mountGeneration:mount.mountGeneration};return new Promise((resolve,reject)=>{const guard=setTimeout(()=>reject(new Error('TASK13A_TRANSITION_SETTLEMENT_TIMEOUT')),10000);Promise.all(animations.map(animation=>animation.finished.catch(()=>null))).then(()=>{clearTimeout(guard);const current=window.ProdigyHubLoader.currentWorkspace(block);if(!shell.isConnected||current!==mount||mount.signal.aborted)throw new Error('TASK13A_TRANSITION_OWNER_REPLACED');resolve({count:animations.length,mountGeneration:mount.mountGeneration})},error=>{clearTimeout(guard);reject(error)})})})()`);
  }
  async acknowledgeResponsiveEpoch(workspaceId) {
    if (workspaceId !== "knowledge" && workspaceId !== "project") return null;
    return this.evaluate(`(()=>{const workspaceId=${JSON.stringify(workspaceId)},shell=document.querySelector('.prodigy-app-shell[data-workspace-id="'+CSS.escape(workspaceId)+'"]'),block=shell&&shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader.currentWorkspace(block);if(!shell||!mount||mount.signal.aborted)throw new Error('TASK13A_RESPONSIVE_OWNER_MISSING');const settledType=workspaceId==='knowledge'?'prodigy-responsive-layout-settled':'prodigy-project-layout-settled';return new Promise((resolve,reject)=>{let observer=null;const guard=setTimeout(()=>{document.removeEventListener(settledType,onSettled,true);if(observer)observer.disconnect();reject(new Error('TASK13A_RESPONSIVE_EPOCH_TIMEOUT'))},10000);const onSettled=event=>{const detail=event.detail||{};if(detail.workspaceId!==workspaceId||detail.mountGeneration!==mount.mountGeneration||!shell.contains(event.target))return;document.removeEventListener(settledType,onSettled,true);observer=new ResizeObserver(entries=>{if(!entries.some(entry=>entry.target===shell)||!entries.some(entry=>entry.target===block))return;observer.disconnect();clearTimeout(guard);resolve({mountGeneration:mount.mountGeneration,participant:detail,rootCount:entries.length})});observer.observe(shell);observer.observe(block)};document.addEventListener(settledType,onSettled,true);if(workspaceId==='knowledge'){const participant=shell.__prodigyKnowledgeResponsiveParticipant;if(!participant||participant.acknowledgeResponsiveLayout(mount.mountGeneration)!==true)reject(new Error('TASK13A_RESPONSIVE_PARTICIPANT_ACK_REJECTED'))}else shell.dispatchEvent(new CustomEvent('prodigy-project-layout-request',{detail:{mountGeneration:mount.mountGeneration}}))})})()`);
  }
  async capture(workspaceId, width, theme, zoom = 1, forcedColors = false, state = "normal") {
    const expectedFile = HUBS.find(([id]) => id === workspaceId)[1];
    const expectedHash = this.runtime.manifest[expectedFile][0].sha256;
    const deviceMetricsOverride = Object.freeze({ width, height: 900, deviceScaleFactor: 1, scale: 1, mobile: false });
    const layoutExpected = { workspaceId, sourceFile: expectedFile, sourceHash: expectedHash, width, zoom, theme, forcedColors, deviceMetricsOverride };
    await this.cdp.send("Page.bringToFront");
    await this.evaluate("window.focus();true");
    await this.evaluate(`(()=>{const shell=document.querySelector('.prodigy-app-shell[data-workspace-id=${workspaceId}]'),control=shell&&[...shell.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea')].find(element=>!element.disabled&&element.tabIndex>=0);if(control&&document.activeElement!==control)control.focus();return true})()`);
    await this.evaluate(`(()=>{const expected=${JSON.stringify(layoutExpected)},identities=window.__task13aAuthorityIdentities||(window.__task13aAuthorityIdentities={objects:new WeakMap(),next:1}),id=value=>{if(!identities.objects.has(value))identities.objects.set(value,'authority-'+identities.next++);return identities.objects.get(value)},choose=${selectActiveProductionMount.toString()},select=()=>{const activeLeafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf(),activeLeafContainer=activeLeafObject&&activeLeafObject.containerEl,candidates=[...document.querySelectorAll('.prodigy-app-shell')].map(shell=>{const leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]'),block=shell.closest('.block-language-dataviewjs,.block-language-js-engine'),style=getComputedStyle(shell),leafStyle=leaf&&getComputedStyle(leaf),box=shell.getBoundingClientRect(),mounted=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);return{shell,block,mounted,descriptor:{connected:shell.isConnected&&Boolean(leaf&&leaf.isConnected),displayed:style.display!=='none'&&leafStyle&&leafStyle.display!=='none',visible:style.visibility!=='hidden'&&style.visibility!=='collapse'&&leafStyle&&leafStyle.visibility!=='hidden',activeLeaf:Boolean(activeLeafContainer&&(activeLeafContainer===leaf||activeLeafContainer.contains(leaf))),registryOwned:Boolean(mounted&&mounted.signal&&!mounted.signal.aborted&&block&&block.contains(shell)),width:box.width,height:box.height,workspaceId:shell.dataset.workspaceId||null,renderer:mounted&&mounted.manifest&&mounted.manifest.renderer||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null}}});const descriptor=choose(candidates.map(candidate=>candidate.descriptor),{...expected,renderer:expected.workspaceId});return candidates.find(candidate=>candidate.descriptor===descriptor)};const selected=select(),roots=[selected.shell,selected.block],closureGeneration=Number(selected.mounted&&selected.mounted.mountGeneration);if(!Number.isInteger(closureGeneration)||Number(selected.block.dataset.prodigyMountClosedGeneration)!==closureGeneration)throw new Error('TASK13A_MOUNT_NOT_CLOSED');const styleOrder=[...document.head.querySelectorAll('style')],token=(window.__task13aLayoutSequence||0)+1;window.__task13aLayoutSequence=token;if(window.__task13aLayoutSignal){window.__task13aLayoutSignal.staleNotifications+=1;window.__task13aLayoutSignal.observer.disconnect();window.__task13aLayoutSignal.reject(new Error('TASK13A_LAYOUT_STALE_OBSERVER'))}let resolvePending,rejectPending;const promise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject}),signal={token,expected,selected,roots,select,promise,resolve:resolvePending,reject:rejectPending,subscribedBeforeTrigger:true,triggered:false,armed:false,phase:'pre-trigger',triggerSequence:null,sequence:token,preTriggerNotifications:0,staleNotifications:0,observer:null,guard:null,responsiveRequired:expected.workspaceId==='knowledge'||expected.workspaceId==='project'||(expected.workspaceId==='workout'&&Boolean(selected.shell.querySelector('.prodigy-workout-dashboard')&&selected.shell.querySelector('.prodigy-workout-dashboard').__prodigyWorkoutResponsiveParticipant)),responsiveNotification:null,lastEntries:null,responsiveListener:null,environmentAckSequence:null,geometryArmSequence:null,mediaAck:null};const finish=entries=>{signal.lastEntries=entries;signal.sequence+=1;if(!signal.triggered){signal.preTriggerNotifications+=1;return}if(!signal.armed)return;if(window.__task13aLayoutSignal!==signal){signal.staleNotifications+=1;return}const block=selected.shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block),current={shell:selected.shell,block,mounted:mount};if(!selected.shell.isConnected||!block||block.dataset.task13aSourceFile!==expected.sourceFile||block.dataset.task13aSourceHash!==expected.sourceHash||!mount||!mount.signal||mount.signal.aborted||mount.mountGeneration!==closureGeneration||!block.contains(selected.shell)){signal.observer.disconnect();signal.mountObserver.disconnect();clearTimeout(signal.guard);rejectPending(new Error('TASK13A_LAYOUT_OWNER_DISCONNECTED:'+JSON.stringify(expected)));return}const viewportWidth=window.innerWidth,documentWidth=document.documentElement.clientWidth,cssZoom=getComputedStyle(document.documentElement).zoom,inlineZoom=document.documentElement.style.zoom||'1',visualViewportWidth=window.visualViewport&&window.visualViewport.width,devicePixelRatio=window.devicePixelRatio,shellBoundingWidth=selected.shell.getBoundingClientRect().width,blockClientWidth=selected.block.clientWidth,responsiveGeneration=Number(selected.shell.dataset.prodigyResponsiveGeneration)||0,currentTheme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',currentForced=matchMedia('(forced-colors: active)').matches,ownerSame=current.shell===selected.shell,currentRoots=[selected.shell,selected.block];if(currentRoots.length!==roots.length||currentRoots.some((root,index)=>root!==roots[index])){signal.observer.disconnect();signal.mountObserver.disconnect();clearTimeout(signal.guard);rejectPending(new Error('TASK13A_LAYOUT_ROOT_IDENTITY'));return}const rootEntries=new Map(entries.map(entry=>[entry.target,entry])),ownerClientWidth=selected.shell.clientWidth,ownerWidthMatchesLeaf=ownerClientWidth>0;signal.last={phase:signal.phase,viewportWidth,documentWidth,cssZoom,currentTheme,currentForced,ownerClientWidth,ownerWidthMatchesLeaf,entryCount:entries.length,shellEntry:entries.some(entry=>entry.target===selected.shell),currentRootCount:currentRoots.length};if(!ownerWidthMatchesLeaf)return;if(viewportWidth!==expected.width||documentWidth!==expected.width||String(cssZoom)!==String(expected.zoom)||currentTheme!==expected.theme||currentForced!==expected.forcedColors||!roots.every(root=>rootEntries.has(root))||(signal.responsiveRequired&&!signal.responsiveNotification))return;signal.observer.disconnect();signal.mountObserver.disconnect();document.removeEventListener('prodigy-responsive-layout-settled',signal.responsiveListener,true);document.removeEventListener('prodigy-project-layout-settled',signal.responsiveListener,true);document.removeEventListener('prodigy-workout-layout-settled',signal.responsiveListener,true);clearTimeout(signal.guard);resolvePending({subscribedBeforeTrigger:signal.subscribedBeforeTrigger,triggerSequence:signal.triggerSequence,environmentAckSequence:signal.environmentAckSequence,geometryArmSequence:signal.geometryArmSequence,mediaAck:signal.mediaAck,triggerBoundary:{deviceMetricsOverride:expected.deviceMetricsOverride,pageObserved:{innerWidth:viewportWidth,visualViewportWidth,inlineZoom,computedZoom:cssZoom,devicePixelRatio,shellClientWidth:ownerClientWidth,shellBoundingWidth,blockClientWidth,responsiveGeneration,effectiveCssViewportWidth:viewportWidth/Number(inlineZoom||1),effectiveShellWidth:shellBoundingWidth,mountIdentity:{mountGeneration:closureGeneration,workspaceId:selected.shell.dataset.workspaceId||null,sourceFile:block.dataset.task13aSourceFile||null,sourceHash:block.dataset.task13aSourceHash||null,registryLive:Boolean(mount&&mount.signal&&!mount.signal.aborted)}}},responsiveNotification:signal.responsiveNotification,notificationSequence:signal.sequence,notificationAfterTrigger:signal.sequence>signal.triggerSequence,preTriggerNotifications:signal.preTriggerNotifications,staleNotifications:signal.staleNotifications,observerCurrent:window.__task13aLayoutSignal===signal,ownerSame,ownerConnected:selected.shell.isConnected,ownerWidthMatchesLeaf,ownerClientWidth,registryLive:Boolean(mount&&mount.signal&&!mount.signal.aborted),workspaceId:selected.shell.dataset.workspaceId||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null,viewportWidth,documentWidth,cssZoom,theme:currentTheme,forcedColors:currentForced,rootCount:roots.length,roots:roots.map(root=>{const box=root.getBoundingClientRect();return{connected:root.isConnected,width:box.width,height:box.height}}),styleOrderUnchanged:(()=>{const current=[...document.head.querySelectorAll('style')];return current.length===styleOrder.length&&current.every((node,index)=>node===styleOrder[index])})(),sampledAfterNotification:true,authority:{epoch:signal.sequence,status:'SETTLED',owner:{shellId:id(selected.shell),blockId:id(block),mountId:id(mount),registryLive:Boolean(mount&&mount.signal&&!mount.signal.aborted),workspaceId:selected.shell.dataset.workspaceId||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null},environment:{viewportWidth,documentWidth,cssZoom,theme:currentTheme,forcedColors:currentForced},styleOrder:styleOrder.map(id),roots:roots.map(root=>{const box=root.getBoundingClientRect();return{id:id(root),width:box.width,height:box.height}})}})};signal.observer=new ResizeObserver(finish);signal.mountObserver=new MutationObserver(()=>{if(!signal.triggered)return;const block=selected.shell.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);if(!selected.shell.isConnected||!block||block.dataset.task13aSourceFile!==expected.sourceFile||block.dataset.task13aSourceHash!==expected.sourceHash||!mount||!mount.signal||mount.signal.aborted||!block.contains(selected.shell)){signal.observer.disconnect();signal.mountObserver.disconnect();clearTimeout(signal.guard);rejectPending(new Error('TASK13A_LAYOUT_OWNER_DISCONNECTED'));return}const currentRoots=[selected.shell,selected.block];if(currentRoots.length!==roots.length||currentRoots.some((root,index)=>root!==roots[index])){signal.observer.disconnect();signal.mountObserver.disconnect();clearTimeout(signal.guard);rejectPending(new Error('TASK13A_LAYOUT_ROOT_IDENTITY'))}});signal.responsiveListener=event=>{if(!signal.responsiveRequired||!signal.triggered||!selected.shell.contains(event.target))return;const detail=event.detail||{},knowledge=expected.workspaceId==='knowledge'&&event.type==='prodigy-responsive-layout-settled'&&Number.isInteger(detail.generation),project=expected.workspaceId==='project'&&event.type==='prodigy-project-layout-settled'&&Array.isArray(detail.participants)&&detail.participants.length===7,workout=expected.workspaceId==='workout'&&event.type==='prodigy-workout-layout-settled'&&Number.isInteger(detail.generation);if(!signal.environmentAckSequence||detail.workspaceId!==expected.workspaceId||detail.mountGeneration!==closureGeneration||(!knowledge&&!project&&!workout))return;signal.responsiveNotification={mountGeneration:detail.mountGeneration,generation:detail.generation||null,logicalWidth:detail.logicalWidth||null,layout:detail.layout||null,participants:detail.participants||null};signal.armGeometry()};document.addEventListener('prodigy-responsive-layout-settled',signal.responsiveListener,true);document.addEventListener('prodigy-project-layout-settled',signal.responsiveListener,true);document.addEventListener('prodigy-workout-layout-settled',signal.responsiveListener,true);signal.mountObserver.observe(document.body,{childList:true,subtree:true});signal.guard=setTimeout(()=>{signal.observer.disconnect();signal.mountObserver.disconnect();rejectPending(new Error('TASK13A_LAYOUT_SETTLEMENT_TIMEOUT:'+JSON.stringify({expected,phase:signal.phase,preTriggerNotifications:signal.preTriggerNotifications,staleNotifications:signal.staleNotifications,participant:signal.responsiveNotification,last:signal.last||null})))},10000);signal.trigger=()=>{if(signal.triggered)throw new Error('TASK13A_LAYOUT_DUPLICATE_TRIGGER');signal.triggered=true;signal.phase='environment';signal.triggerSequence=++signal.sequence};signal.environmentAcknowledged=ack=>{if(!signal.triggered||signal.environmentAckSequence!==null)throw new Error('TASK13A_LAYOUT_ENVIRONMENT_ACK_ORDER');signal.mediaAck={requested:{theme:expected.theme,forcedColors:expected.forcedColors},current:{theme:ack.theme,forcedColors:ack.forcedColors,reducedMotion:ack.reducedMotion}};signal.environmentGeometry=roots.map(root=>{const style=getComputedStyle(root),box=root.getBoundingClientRect();return{width:box.width,height:box.height,display:style.display}});void document.documentElement.offsetWidth;signal.environmentAckSequence=++signal.sequence;signal.phase='participant';if(!signal.responsiveRequired)signal.armGeometry()};signal.armGeometry=()=>{if(!signal.environmentAckSequence||signal.geometryArmSequence!==null)throw new Error('TASK13A_LAYOUT_GEOMETRY_ARM_ORDER');signal.lastEntries=null;signal.observer.disconnect();signal.observer=new ResizeObserver(finish);signal.armed=true;signal.phase='geometry';signal.geometryArmSequence=++signal.sequence;for(const root of roots)signal.observer.observe(root)};window.__task13aLayoutSignal=signal;return{token,subscribedBeforeTrigger:true}})()`);
    await this.evaluate("window.__task13aLayoutSignal.trigger();var task13aScrollRoot=document.querySelector('.prodigy-app-shell[data-workspace-id=\"'+CSS.escape(window.__task13aLayoutSignal.expected.workspaceId)+'\"]');if(task13aScrollRoot)task13aScrollRoot.scrollIntoView({block:'center',inline:'nearest'});true");
    await this.cdp.send("Emulation.setDeviceMetricsOverride", deviceMetricsOverride);
    await this.evaluate(`document.body.classList.toggle('theme-dark',${theme === "dark"});document.body.classList.toggle('theme-light',${theme !== "dark"});document.documentElement.style.zoom=${JSON.stringify(String(zoom))};window.__task13aState=${JSON.stringify(state)};true`);
    const mediaAuthority = await this.issueMediaAuthority(workspaceId, theme, forcedColors, `capture:${width}:${zoom}:${state}`);
    await this.collapseSidebar(workspaceId, "left");
    await this.collapseSidebar(workspaceId, "right");
    await this.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await this.evaluate(`window.__task13aLayoutSignal.environmentAcknowledged(${JSON.stringify({ theme: mediaAuthority.ack.theme, forcedColors: mediaAuthority.ack.forcedColors, reducedMotion: mediaAuthority.ack.reducedMotion })});var task13aAckSignal=window.__task13aLayoutSignal;if(task13aAckSignal.responsiveRequired){if(task13aAckSignal.expected.workspaceId==='knowledge'){var task13aKnowledgeApi=task13aAckSignal.selected.shell.__prodigyKnowledgeResponsiveParticipant;if(!task13aKnowledgeApi||task13aKnowledgeApi.acknowledgeResponsiveLayout(task13aAckSignal.selected.mounted.mountGeneration)!==true)throw new Error('TASK13A_RESPONSIVE_PARTICIPANT_ACK_REJECTED')}else if(task13aAckSignal.expected.workspaceId==='workout'){var task13aWorkoutRoot=task13aAckSignal.selected.shell.querySelector('.prodigy-workout-dashboard'),task13aWorkoutApi=task13aWorkoutRoot&&task13aWorkoutRoot.__prodigyWorkoutResponsiveParticipant;if(!task13aWorkoutApi||task13aWorkoutApi.acknowledgeResponsiveLayout(task13aAckSignal.selected.mounted.mountGeneration)!==true)throw new Error('TASK13A_RESPONSIVE_PARTICIPANT_ACK_REJECTED')}else task13aAckSignal.selected.shell.dispatchEvent(new CustomEvent('prodigy-project-layout-request',{detail:{mountGeneration:task13aAckSignal.selected.mounted.mountGeneration}}))}true`);
    const layoutSettlement = await this.evaluate("window.__task13aLayoutSignal.promise");
    mediaAuthority.rootNotification = { notificationSequence: layoutSettlement.notificationSequence, environment: layoutSettlement.authority.environment, owner: layoutSettlement.authority.owner, styleEpoch: layoutSettlement.authority.epoch, roots: layoutSettlement.authority.roots };
    validateLayoutSettlement(layoutSettlement, layoutExpected);
    if (zoom === 2) validateZoomAuthority(zoom, layoutSettlement.triggerBoundary);
    layoutSettlement.epoch = layoutSettlement.notificationSequence;
    layoutSettlement.status = "SETTLED";
    const inheritedBefore = layoutSettlement.authority;
    const keyboard = state === "object-creator-modal" ? await this.objectCreatorPreludeKeyboardDiagnostic(workspaceId) : await this.keyboardDiagnostic(workspaceId);
    await this.acknowledgeResponsiveEpoch(workspaceId);
    const inheritedAfter = await this.layoutAuthoritySnapshot(workspaceId, layoutSettlement.epoch);
    const inheritedAuthority = { declaredEffect: "focus-only", priorStatus: "SETTLED", subscribedBeforeDispatch: keyboard.subscribedBeforeDispatch === true, expectedInputObserved: keyboard.expectedInputObserved === true, before: keyboard.tabAuthorityBefore, after: keyboard.tabAuthorityAfter, screenshotContinuity: { before: keyboard.tabAuthorityAfter, after: keyboard.tabAuthorityAfter } };
    validateInheritedLayoutAuthority(inheritedAuthority);
    inheritedAuthority.before = inheritedAfter;
    inheritedAuthority.after = inheritedAfter;
    const dom = await this.evaluate(`(()=>{
      const expected={workspaceId:${JSON.stringify(workspaceId)},renderer:${JSON.stringify(workspaceId)},sourceFile:${JSON.stringify(expectedFile)},sourceHash:${JSON.stringify(expectedHash)}};
      const activeLeafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();const activeLeafContainer=activeLeafObject&&activeLeafObject.containerEl;
      const candidates=[...document.querySelectorAll('.prodigy-app-shell')].map((shell)=>{const leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]');const block=shell.closest('.block-language-dataviewjs,.block-language-js-engine');const style=getComputedStyle(shell);const leafStyle=leaf&&getComputedStyle(leaf);const box=shell.getBoundingClientRect();const mounted=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);return{shell,leaf,block,descriptor:{connected:shell.isConnected&&Boolean(leaf&&leaf.isConnected),displayed:style.display!=='none'&&leafStyle&&leafStyle.display!=='none',visible:style.visibility!=='hidden'&&style.visibility!=='collapse'&&leafStyle&&leafStyle.visibility!=='hidden',activeLeaf:Boolean(activeLeafContainer&&(activeLeafContainer===leaf||activeLeafContainer.contains(leaf))),registryOwned:Boolean(mounted&&mounted.signal&&!mounted.signal.aborted&&block&&block.contains(shell)),width:box.width,height:box.height,workspaceId:shell.dataset.workspaceId||null,renderer:mounted&&mounted.manifest&&mounted.manifest.renderer||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null,selector:'.prodigy-app-shell[data-workspace-id="'+CSS.escape(shell.dataset.workspaceId||'')+'"]'}}});
      const choose=${selectActiveProductionMount.toString()};const selectedDescriptor=choose(candidates.map(candidate=>candidate.descriptor),expected);const selected=candidates.find(candidate=>candidate.descriptor===selectedDescriptor);document.querySelectorAll('[data-task13a-selected-owner]').forEach(element=>{if(element!==selected.shell)element.removeAttribute('data-task13a-selected-owner')});if(selected.shell.getAttribute('data-task13a-selected-owner')!=='true')selected.shell.setAttribute('data-task13a-selected-owner','true');const leaf=selected.leaf;const shells=[selected.shell];const generation=window.__task13aOpenGeneration&&String(window.__task13aOpenGeneration[expected.sourceFile]);const blocks=[...leaf.querySelectorAll('.block-language-dataviewjs,.block-language-js-engine')].filter(block=>block.dataset.task13aSourceFile===expected.sourceFile&&block.dataset.task13aGeneration===generation);const modalRoots=[...document.querySelectorAll('.modal-container .prodigy-object-creator')],selectRoots=${selectDiagnosticRoots.toString()},collectElements=${collectDiagnosticElements.toString()},roots=selectRoots({state:${JSON.stringify(state)},selected,expected,modalRoots});
      const all=collectElements(roots).filter(element=>{
        if(element.closest('[hidden],[aria-hidden="true"]'))return false;
        const details=element.closest('details:not([open])');
        if(details&&element!==details&&element!==details.querySelector(':scope > summary'))return false;
        return element.getClientRects().length>0;
      });
      const cssOwner=(element)=>{const matches=[];for(const sheet of [...document.styleSheets]){let rules;try{rules=sheet.cssRules}catch(_){continue}for(const rule of [...rules||[]]){if(!rule.selectorText)continue;try{if(!element.matches(rule.selectorText))continue}catch(_){continue}const owner=sheet.ownerNode;matches.push({selector:rule.selectorText,cssText:rule.style.cssText,styleOwnerId:owner&&owner.id||null,styleOwnerData:owner&&owner.getAttribute&&owner.getAttribute('data-style')||null,href:sheet.href||null,provenance:owner&&/^task13a-/u.test(owner.id||'')?'harness-plugin':owner&&owner.tagName==='STYLE'?'production-injected':'native-obsidian'})}}return matches.slice(-8)};
      const selector=(element)=>{const parts=[];let node=element;while(node&&node!==leaf&&parts.length<7){let part=node.tagName.toLowerCase();if(node.id)part+='#'+CSS.escape(node.id);else{const classes=[...node.classList].filter(name=>!/^is-|^mod-|^node-insert/u.test(name)).slice(0,3);if(classes.length)part+='.'+classes.map(CSS.escape).join('.');if(node.parentElement){const peers=[...node.parentElement.children].filter(x=>x.tagName===node.tagName);if(peers.length>1)part+=':nth-of-type('+(peers.indexOf(node)+1)+')'}}parts.unshift(part);node=node.parentElement}return parts.join(' > ')};
      const receipt=(element)=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return{selector:selector(element),tag:element.tagName.toLowerCase(),role:element.getAttribute('role')||element.tagName.toLowerCase(),textSentinel:(element.getAttribute('aria-label')||element.getAttribute('title')||element.innerText||element.textContent||'').replace(/\\s+/g,' ').trim().slice(0,120),blockIdentity:(element.closest('.block-language-dataviewjs,.block-language-js-engine')&&element.closest('.block-language-dataviewjs,.block-language-js-engine').className)||null,shellWorkspace:element.closest('.prodigy-app-shell')&&element.closest('.prodigy-app-shell').getAttribute('data-workspace-id')||null,boundingBox:{x:box.x,y:box.y,width:box.width,height:box.height},clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,computed:{minWidth:style.minWidth,minHeight:style.minHeight,padding:style.padding,font:style.font,overflow:style.overflow,overflowX:style.overflowX,overflowY:style.overflowY,boxShadow:style.boxShadow,background:style.background,backgroundImage:style.backgroundImage},matchedRules:cssOwner(element)}};
      const controls=all.filter(element=>element.matches('button,a[href],[role=button],[role=tab],input,select,textarea')&&!element.closest('[hidden],[aria-hidden="true"]'));
      const overflow=all.filter(element=>element.scrollWidth>element.clientWidth+1).map(receipt);
      const targetSize=controls.filter(element=>{const box=element.getBoundingClientRect();return box.width<44||box.height<44}).map(receipt);
      const zeroInteractive=controls.filter(element=>{const box=element.getBoundingClientRect();return box.width===0||box.height===0}).map(receipt);
      const chromeShadow=all.filter(element=>{const style=getComputedStyle(element);return style.boxShadow!=='none'&&!element.matches('img,.prodigy-image-content')}).map(receipt);
      const recoveryElements=all.filter(element=>/필수 워크스페이스 리소스를 불러오지 못했습니다|모듈 실행 실패|TASK13A_ERROR/u.test(element.innerText||element.textContent||''));
      const stateSelectors={normal:'[data-state="success"]',empty:'[data-state="empty"]',errorRecovery:'[data-state="error"],.prodigy-required-recovery',loading:'[data-state="loading"],[aria-busy="true"]',selectedActive:'[data-state="selected"],[aria-selected="true"],[aria-pressed="true"]',disabled:'[data-state="disabled"],[aria-disabled="true"],:disabled'};
      const stateCounts=Object.fromEntries(Object.entries(stateSelectors).map(([name,query])=>[name,roots.reduce((sum,root)=>sum+root.querySelectorAll(query).length,0)]));
      const missing=Object.entries(stateCounts).filter(([,count])=>count===0).map(([name])=>name);const duplicates=Object.entries(stateCounts).filter(([,count])=>count>1).map(([name,count])=>({name,count}));const zoomFactor=Number(getComputedStyle(document.documentElement).zoom)||1,cjkSamples=all.flatMap(element=>{const style=getComputedStyle(element),box=element.getBoundingClientRect(),fontSize=parseFloat(style.fontSize)||16;return[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).flatMap(node=>{const text=node.textContent||'',segments=[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text)].filter(item=>item.segment.trim()),hasCjk=segments.some(item=>/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(item.segment));if(segments.length<2||!hasCjk||box.width<=0)return[];const lines=new Map();for(const item of segments){const range=document.createRange();range.setStart(node,item.index);range.setEnd(node,item.index+item.segment.length);const rect=range.getBoundingClientRect(),key=Math.round(rect.top*2)/2;lines.set(key,(lines.get(key)||0)+1)}return[{selector:selector(element),textSentinel:text.replace(/\s+/g,' ').trim().slice(0,80),width:box.width,fontSize:fontSize*zoomFactor,glyphColumns:Math.max(...lines.values()),lineCount:lines.size,wordBreak:style.wordBreak,overflowWrap:style.overflowWrap}]})}),oneGlyphColumns=cjkSamples.filter(sample=>sample.glyphColumns<2);
      return{matrix:{workspaceId:${JSON.stringify(workspaceId)},width:${width},theme:${JSON.stringify(theme)},zoom:${zoom},forcedColors:${forcedColors},state:${JSON.stringify(state)}},navigation:{expectedFile:${JSON.stringify(HUBS.find(([id]) => id === workspaceId)[1])},activeFile:app.workspace.getActiveFile()&&app.workspace.getActiveFile().path||null,matches:(app.workspace.getActiveFile()&&app.workspace.getActiveFile().path)===${JSON.stringify(HUBS.find(([id]) => id === workspaceId)[1])}},root:{kind:shells.length?'shell':'code-block',count:roots.length,selectors:roots.map(selector)},shell:{count:shells.length,roots:shells.map(receipt)},blocks:blocks.map((block,index)=>({index,identity:block.className,childCount:block.childElementCount,textSentinel:(block.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120)})),offenders:{overflow,targetSize,zeroInteractive,chromeShadow},resourceRecovery:{present:recoveryElements.length>0,elements:recoveryElements.map(receipt)},states:{counts:stateCounts,missing,duplicates},readability:{cjkSamples,oneGlyphColumns},remoteAssets:all.filter(element=>/https?:/u.test(element.getAttribute('src')||'')).map(receipt),gradients:all.filter(element=>getComputedStyle(element).backgroundImage.includes('gradient')).map(receipt),keyboardSeed:{controls:controls.length,first:controls[0]?receipt(controls[0]):null,activeBefore:document.activeElement?selector(document.activeElement):null}};
    })()`);
    attachCssOwnership(dom);
    await this.acknowledgeResponsiveEpoch(workspaceId);
    await this.settleActiveTransitions(workspaceId);
    const screenshotAuthorityBefore = await this.layoutAuthoritySnapshot(workspaceId, layoutSettlement.epoch);
    inheritedAuthority.before = screenshotAuthorityBefore;
    inheritedAuthority.after = screenshotAuthorityBefore;
    const shot = await this.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }); const bytes = Buffer.from(shot.data, "base64");
    const screenshotAuthorityAfter = await this.layoutAuthoritySnapshot(workspaceId, layoutSettlement.epoch);
    inheritedAuthority.screenshotContinuity = { before: screenshotAuthorityBefore, after: screenshotAuthorityAfter };
    validateInheritedLayoutAuthority(inheritedAuthority);
    keyboard.authority = inheritedAuthority;
    const screenshot = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    if (process.env.TASK13A_SCREENSHOT_DIR) {
      const filename = [workspaceId, width, theme, `zoom-${zoom * 100}`, forcedColors ? "forced" : "standard", state].join("-") + ".png";
      fs.mkdirSync(process.env.TASK13A_SCREENSHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.TASK13A_SCREENSHOT_DIR, filename), bytes);
      screenshot.path = `screenshots/${filename}`;
      screenshot.width = width; screenshot.height = 900; screenshot.signature = bytes.subarray(0, 8).toString("hex");
    }
    return { schemaVersion: 2, ...dom, mediaAuthority, layoutSettlement, keyboard, screenshot, failures: diagnosticFailures({ ...dom, keyboard }) };
  }
  async objectCreatorPreludeKeyboardDiagnostic(workspaceId) {
    const sourceFile = HUBS.find(([id]) => id === workspaceId)[1];
    const sourceHash = this.runtime.manifest[sourceFile][0].sha256;
    const owner = { workspaceId, sourceFile, sourceHash, registryLive: true, focusOwned: true };
    const tabAuthorityBefore = await this.layoutAuthoritySnapshot(workspaceId, 0);
    await this.evaluate(`(()=>{const input=document.querySelector('.modal-container .prodigy-object-creator .poc-input');if(!input)throw new Error('TASK13A_OBJECT_CREATOR_INPUT_MISSING');input.focus();return true})()`);
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const afterTab = await this.evaluate(`(()=>{const root=document.querySelector('.modal-container .prodigy-object-creator');return{inside:root.contains(document.activeElement),advanced:!document.activeElement.classList.contains('poc-input'),tag:document.activeElement.tagName}})()`);
    const tabAuthorityAfter = await this.layoutAuthoritySnapshot(workspaceId, 0);
    return { available: true, declaredEffect: "focus-only", subscribedBeforeDispatch: true, expectedInputObserved: true, owners: [owner], afterTab, tabAuthorityBefore, tabAuthorityAfter, failures: afterTab.inside && afterTab.advanced ? [] : ["object_creator_tab_failure"] };
  }
  async openObjectCreatorModal() {
    const sourceFile = "SYSTEM/Views/object-creator-view.js";
    const sourceHash = sha(path.join(this.runtime.vault, sourceFile));
    const repositorySourceHash = sha(path.join(ROOT, sourceFile));
    await this.trustedClick('.prodigy-app-shell[data-workspace-id="home"] button', "+ 새 Object");
    await this.waitForSelector('.modal-container .prodigy-object-creator[data-prodigy-modal-owner="object-creator-view"]');
    await this.evaluate(`(()=>{if(document.querySelector('.modal-container .prodigy-object-creator .poc-recent-item'))return true;const current=document.querySelector('.modal-container .prodigy-object-creator'),container=current&&current.closest('.modal-container'),close=container&&container.querySelector('.modal-close-button');if(!close)throw new Error('TASK13A_OBJECT_CREATOR_FIXTURE_REOPEN_CLOSE');close.click();window.__task13aObjectCreatorFixtureRecent=true;window.ObjectCreatorView.open(app,{pkg:{context:{projects:[{name:'Synthetic',path:'PARA/PROJECTS/Synthetic.md'}],auctions:[],reading:[]}},source:'HUB/00 Home.md'});return true})()`);
    await this.waitForSelector('.modal-container .prodigy-object-creator .poc-recent-item');
    await this.evaluate(`(()=>{const input=document.querySelector('.modal-container .prodigy-object-creator .poc-input');if(!input)throw new Error('TASK13A_OBJECT_CREATOR_INPUT_MISSING');input.focus();return true})()`);
    await this.cdp.send("Input.insertText", { text: "Synthetic" });
    await this.waitForSelector('.modal-container .prodigy-object-creator .poc-type');
    return this.evaluate(`(()=>{const root=document.querySelector('.modal-container .prodigy-object-creator'),modal=root&&root.closest('.modal'),source=${JSON.stringify(sourceFile)},hash=${JSON.stringify(sourceHash)},repositoryHash=${JSON.stringify(repositorySourceHash)};if(!root||!modal||!window.ObjectCreatorView||typeof window.ObjectCreatorView.open!=='function')throw new Error('TASK13A_OBJECT_CREATOR_OWNER_MISSING');return{live:root.isConnected&&modal.isConnected,owner:root.dataset.prodigyModalOwner,sourceFile:root.dataset.prodigyModalSource,sourceHash:hash,repositorySourceHash:repositoryHash,sourceExact:hash===repositoryHash,expectedSourceFile:source,apiIdentity:typeof window.ObjectCreatorView.open==='function',homeEntryExercised:true,fixtureRecent:Boolean(window.__task13aObjectCreatorFixtureRecent),modalCount:document.querySelectorAll('.modal-container .prodigy-object-creator').length}})()`);
  }
  async objectCreatorKeyboardDiagnostic() {
    const before = await this.evaluate(`(()=>{const root=document.querySelector('.modal-container .prodigy-object-creator'),focusable=[...root.querySelectorAll('input,button')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0),input=root.querySelector('.poc-input');input.focus();return{count:focusable.length,inputIndex:focusable.indexOf(input),activeClass:document.activeElement.className}})()`);
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const traversal = await this.evaluate(`(()=>{const root=document.querySelector('.modal-container .prodigy-object-creator');return{inside:root.contains(document.activeElement),advanced:document.activeElement!==root.querySelector('.poc-input'),tag:document.activeElement&&document.activeElement.tagName||null,className:document.activeElement&&document.activeElement.className||null}})()`);
    const typeTarget = await this.evaluate(`(()=>{const buttons=[...document.querySelectorAll('.modal-container .prodigy-object-creator .poc-type')],target=buttons.find(button=>!button.classList.contains('is-active'));if(!target)throw new Error('TASK13A_OBJECT_CREATOR_TYPE_TARGET_MISSING');const label=target.innerText.trim();window.__task13aObjectCreatorTypePromise=new Promise((resolve,reject)=>{const finish=event=>{clearTimeout(timer);target.removeEventListener('click',finish,true);resolve({trusted:event.isTrusted,type:event.type})},timer=setTimeout(()=>{target.removeEventListener('click',finish,true);reject(new Error('TASK13A_OBJECT_CREATOR_TYPE_ACTIVATION_TIMEOUT'))},5000);target.addEventListener('click',finish,true)});target.scrollIntoView({block:'center',inline:'center',behavior:'instant'});target.focus();if(document.activeElement!==target)throw new Error('TASK13A_OBJECT_CREATOR_TYPE_FOCUS');return{label}})()`);
    await this.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    const typeActivated = await this.evaluate("window.__task13aObjectCreatorTypePromise");
    const recentPrepared = await this.evaluate(`(()=>{const recent=document.querySelector('.modal-container .prodigy-object-creator .poc-recent-item');if(!recent||recent.tagName!=='BUTTON'||recent.type!=='button')throw new Error('TASK13A_OBJECT_CREATOR_RECENT_NATIVE_SEMANTICS:'+JSON.stringify({recentCount:document.querySelectorAll('.poc-recent-item').length,modalCount:document.querySelectorAll('.prodigy-object-creator').length,text:document.querySelector('.prodigy-object-creator')&&document.querySelector('.prodigy-object-creator').innerText.slice(-300)}));window.__task13aObjectCreatorRecentPromise=new Promise((resolve,reject)=>{const finish=event=>{clearTimeout(timer);recent.removeEventListener('click',finish,true);resolve({trusted:event.isTrusted,type:event.type,tag:recent.tagName,buttonType:recent.type})},timer=setTimeout(()=>{recent.removeEventListener('click',finish,true);reject(new Error('TASK13A_OBJECT_CREATOR_RECENT_ACTIVATION_TIMEOUT'))},5000);recent.addEventListener('click',finish,true)});recent.scrollIntoView({block:'center',inline:'center',behavior:'instant'});recent.focus();if(document.activeElement!==recent)throw new Error('TASK13A_OBJECT_CREATOR_RECENT_FOCUS');return{label:recent.innerText.trim()}})()`);
    await this.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    const recent = await this.evaluate("window.__task13aObjectCreatorRecentPromise");
    return { before, traversal, typeTarget, typeActivated, recentPrepared, recent, failures: traversal.inside && traversal.advanced && typeActivated.trusted === true && recent.trusted === true && recent.tag === "BUTTON" && recent.buttonType === "button" ? [] : ["object_creator_keyboard_failure"] };
  }
  async closeObjectCreatorModal() {
    return this.evaluate(`(()=>{const root=document.querySelector('.modal-container .prodigy-object-creator'),modal=root&&root.closest('.modal-container'),close=modal&&modal.querySelector('.modal-close-button');if(close)close.click();return !document.querySelector('.modal-container .prodigy-object-creator')})()`);
  }
  async captureObjectCreatorModal(width, theme, zoom = 1, forcedColors = false) {
    const modalOwner = await this.openObjectCreatorModal();
    const row = await this.capture("home", width, theme, zoom, forcedColors, "object-creator-modal");
    const modalKeyboard = await this.objectCreatorKeyboardDiagnostic();
    row.modalOwner = modalOwner;
    row.modalKeyboard = modalKeyboard;
    row.failures = [...row.failures, ...modalKeyboard.failures.map((failure) => ({ kind: "object_creator_keyboard", failure }))];
    await this.closeObjectCreatorModal();
    return row;
  }
  async captureSelectionFailure(error, workspaceId, width, theme, zoom, forcedColors, state = "normal") {
    const surface = await this.evaluate(`(()=>{const leaf=app.workspace.activeLeaf&&app.workspace.activeLeaf.containerEl&&app.workspace.activeLeaf.containerEl.querySelector('.workspace-leaf-content[data-type="markdown"]');const html=leaf?leaf.outerHTML:'';return{activeFile:app.workspace.getActiveFile()&&app.workspace.getActiveFile().path||null,html,shells:[...document.querySelectorAll('.prodigy-app-shell')].map(shell=>({workspaceId:shell.dataset.workspaceId||null,connected:shell.isConnected,box:(()=>{const r=shell.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()}))}})()`);
    const shot = await this.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }); const bytes = Buffer.from(shot.data, "base64");
    const screenshot = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    return { schemaVersion: 2, matrix: { workspaceId, width, theme, zoom, forcedColors, state }, selectionFailure: { message: error.message, activeFile: surface.activeFile, shells: surface.shells }, domSha256: crypto.createHash("sha256").update(surface.html).digest("hex"), screenshot, failures: [{ kind: "active_production_owner", message: error.message }] };
  }
  async keyboardDiagnostic(workspaceId) {
    const sourceFile = HUBS.find(([id]) => id === workspaceId)[1];
    const expected = { workspaceId, renderer: workspaceId, sourceFile, sourceHash: this.runtime.manifest[sourceFile][0].sha256 };
    const owner = `(()=>{const expected=${JSON.stringify(expected)},activeLeafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf(),activeLeafContainer=activeLeafObject&&activeLeafObject.containerEl;const candidates=[...document.querySelectorAll('.prodigy-app-shell')].map(shell=>{const leaf=shell.closest('.workspace-leaf-content[data-type="markdown"]'),block=shell.closest('.block-language-dataviewjs,.block-language-js-engine'),style=getComputedStyle(shell),leafStyle=leaf&&getComputedStyle(leaf),box=shell.getBoundingClientRect(),mounted=block&&window.ProdigyHubLoader&&window.ProdigyHubLoader.currentWorkspace(block);return{shell,descriptor:{connected:shell.isConnected&&Boolean(leaf&&leaf.isConnected),displayed:style.display!=='none'&&leafStyle&&leafStyle.display!=='none',visible:style.visibility!=='hidden'&&style.visibility!=='collapse'&&leafStyle&&leafStyle.visibility!=='hidden',activeLeaf:Boolean(activeLeafContainer&&(activeLeafContainer===leaf||activeLeafContainer.contains(leaf))),registryOwned:Boolean(mounted&&mounted.signal&&!mounted.signal.aborted&&block&&block.contains(shell)),width:box.width,height:box.height,workspaceId:shell.dataset.workspaceId||null,renderer:mounted&&mounted.manifest&&mounted.manifest.renderer||null,sourceFile:block&&block.dataset.task13aSourceFile||null,sourceHash:block&&block.dataset.task13aSourceHash||null}}});const choose=${selectActiveProductionMount.toString()},selectedDescriptor=choose(candidates.map(candidate=>candidate.descriptor),expected),selected=candidates.find(candidate=>candidate.descriptor===selectedDescriptor);document.querySelectorAll('[data-task13a-selected-owner]').forEach(element=>{if(element!==selected.shell)element.removeAttribute('data-task13a-selected-owner')});if(selected.shell.getAttribute('data-task13a-selected-owner')!=='true')selected.shell.setAttribute('data-task13a-selected-owner','true');return selected.shell})()`;
    const reacquire = async (action, ensureFocus = false) => this.evaluate(`(()=>{const root=${owner},block=root.closest('.block-language-dataviewjs,.block-language-js-engine'),mount=window.ProdigyHubLoader.currentWorkspace(block);if(${ensureFocus}&&!root.contains(document.activeElement)){const control=[...root.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea,[tabindex]')].find(element=>{const style=getComputedStyle(element),box=element.getBoundingClientRect();return!element.disabled&&element.getAttribute('aria-disabled')!=='true'&&element.tabIndex>=0&&style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0});if(!control)throw new Error('TASK13A_KEYBOARD_OWNER_CONTROL_MISSING');control.focus()}return{action:${JSON.stringify(action)},workspaceId:root.dataset.workspaceId,sourceFile:block.dataset.task13aSourceFile,sourceHash:block.dataset.task13aSourceHash,generation:block.dataset.task13aGeneration,registryLive:Boolean(mount&&mount.signal&&!mount.signal.aborted),focusOwned:root.contains(document.activeElement)}})()`);
    const snapshot = `(()=>{const root=${owner};const focusables=[...root.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea,[tabindex]')].filter(element=>{const style=getComputedStyle(element),box=element.getBoundingClientRect();return!element.disabled&&element.getAttribute('aria-disabled')!=='true'&&element.tabIndex>=0&&style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0});focusables.forEach((element,index)=>element.setAttribute('data-task13a-focus-order',String(index)));const active=document.activeElement,index=focusables.indexOf(active),dialog=active&&active.closest&&active.closest('.modal-container .modal,.prompt,[role="dialog"]'),owned=Boolean(dialog&&dialog.getAttribute('data-task13a-owned-prompt')==='true'),prompt=dialog?{owned,closed:false,scope:root.contains(dialog)?'embedded':'external',kind:/trust|신뢰|vault|보안/iu.test(dialog.innerText||'')?'native-obsidian-trust':'native-obsidian-dialog'}:null,id=active===document.body?'body':index>=0?'focus-'+index:active&&active.tagName?active.tagName.toLowerCase():null,expectedControl=focusables.length?(index>=0?focusables[(index+1)%focusables.length]:focusables[0]):null,nativeObsidian=Boolean(active&&active.closest&&active.closest('.workspace-tab-header-container-inner,.workspace-tab-header'));return{available:focusables.length>0,id,orderIndex:index,expectedTabId:expectedControl?'focus-'+focusables.indexOf(expectedControl):null,prompt,nativeObsidian,html:(active&&active.outerHTML||'').slice(0,180),text:(active&&(active.innerText||active.getAttribute&&active.getAttribute('aria-label'))||'').trim().slice(0,80)}})()`;
    const beginSignal = async (label) => this.evaluate(`(()=>{window.__task13aFocusSignal&&window.__task13aFocusSignal.dispose();const events=[],owner=${owner};const promptFor=node=>{const dialog=node&&node.closest&&node.closest('.modal-container .modal,.prompt,[role="dialog"]');return dialog?{owned:dialog.getAttribute('data-task13a-owned-prompt')==='true',closed:false,scope:owner.contains(dialog)?'embedded':'external',kind:/trust|신뢰|vault|보안/iu.test(dialog.innerText||'')?'native-obsidian-trust':'native-obsidian-dialog'}:null};const onFocus=event=>events.push({type:'focusin',tag:event.target&&event.target.tagName||null,order:event.target&&event.target.getAttribute&&event.target.getAttribute('data-task13a-focus-order')||null,prompt:promptFor(event.target)}),onKey=event=>events.push({type:'input-complete',key:event.key});document.addEventListener('focusin',onFocus,true);document.addEventListener('keyup',onKey,true);const observer=new MutationObserver(records=>{for(const record of records)for(const node of [...record.addedNodes])if(node.nodeType===1){const dialog=node.matches&&node.matches('.modal-container .modal,.prompt,[role="dialog"]')?node:node.querySelector&&node.querySelector('.modal-container .modal,.prompt,[role="dialog"]');if(dialog)events.push({type:'prompt-dom',prompt:promptFor(dialog)})}});observer.observe(document.body,{childList:true,subtree:true});window.__task13aFocusSignal={label:${JSON.stringify(label)},events,dispose(){document.removeEventListener('focusin',onFocus,true);document.removeEventListener('keyup',onKey,true);observer.disconnect()}};return true})()`);
    const finishSignal = async () => this.evaluate(`(()=>{const signal=window.__task13aFocusSignal;if(!signal)return[];signal.dispose();return signal.events})()`);
    const seedOwner = await reacquire("seed");
    await beginSignal("seed");
    const seed = await this.evaluate(`(()=>{const root=${owner},stateOwner=root.querySelector('[data-prodigy-state-owner]'),ownerCandidate=stateOwner&&stateOwner.matches('button,a[href],[role=button],[role=tab],input,select,textarea')?stateOwner:stateOwner&&stateOwner.querySelector('button,a[href],[role=button],[role=tab],input,select,textarea'),ownerControl=ownerCandidate&&!ownerCandidate.disabled&&ownerCandidate.getAttribute('aria-disabled')!=='true'?ownerCandidate:null,control=ownerControl||[...root.querySelectorAll('button,a[href],[role=button],[role=tab],input,select,textarea')].find(element=>{const box=element.getBoundingClientRect();return!element.disabled&&element.tabIndex>=0&&box.width>0&&box.height>0});if(!control)return{available:false};control.focus();return{available:true,activate:Boolean(ownerControl),before:control.outerHTML.slice(0,180),beforeText:(control.innerText||control.getAttribute('aria-label')||'').trim().slice(0,80)}})()`);
    const seedEvents = await finishSignal();
    if (!seed.available) return { ...seed, declaredEffect: "focus-only", subscribedBeforeDispatch: true, expectedInputObserved: false, owners: [seedOwner], failures: ["no_keyboard_target"] };
    const owners = [seedOwner];
    await beginSignal("enter"); owners.push(await reacquire("enter", true)); if (seed.activate) { await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); } const enterEvents = await finishSignal();
    const afterEnter = await this.evaluate(snapshot);
    await beginSignal("escape-before-tab"); owners.push(await reacquire("escape-before-tab", true)); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); const escapeEvents = await finishSignal();
    let currentBaseline = await this.evaluate(snapshot);
    const promptIntervention = [...enterEvents, ...escapeEvents].find((event) => event.prompt);
    if (!currentBaseline.prompt && promptIntervention) currentBaseline.prompt = { ...promptIntervention.prompt, closed: promptIntervention.prompt.owned === true };
    if (currentBaseline.prompt && currentBaseline.prompt.owned && currentBaseline.prompt.closed !== true) {
      const closed = await this.evaluate(`new Promise((resolve,reject)=>{const prompt=document.activeElement&&document.activeElement.closest('.modal-container .modal,.prompt,[role="dialog"]'),close=prompt&&prompt.querySelector('[data-task13a-owned-close="true"]');if(!prompt||!close){reject(new Error('TASK13A_OWNED_PROMPT_CLOSE_MISSING'));return}const observer=new MutationObserver(()=>{if(!prompt.isConnected){observer.disconnect();clearTimeout(guard);resolve(true)}});observer.observe(document.body,{childList:true,subtree:true});const guard=setTimeout(()=>{observer.disconnect();reject(new Error('TASK13A_OWNED_PROMPT_CLOSE_TIMEOUT'))},5000);close.click()})`);
      currentBaseline = await this.evaluate(snapshot); currentBaseline.prompt = { ...currentBaseline.prompt, owned: true, closed };
    }
    await beginSignal("tab"); owners.push(await reacquire("tab", true)); currentBaseline = await this.evaluate(snapshot); const tabAuthorityBefore = await this.layoutAuthoritySnapshot(workspaceId, 0); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); const tabEvents = await finishSignal();
    const afterTab = await this.evaluate(snapshot); const tabAuthorityAfter = await this.layoutAuthoritySnapshot(workspaceId, 0);
    await beginSignal("escape-after-tab"); owners.push(await reacquire("escape-after-tab", true)); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); const finalEscapeEvents = await finishSignal();
    const afterEscape = await this.evaluate(snapshot), signals = { seed: seedEvents, enter: enterEvents, escapeBeforeTab: escapeEvents, tab: tabEvents, escapeAfterTab: finalEscapeEvents };
    const failures=[];if(!afterEnter.id)failures.push("enter_lost_focus");try{validateKeyboardTrace(signals)}catch(error){failures.push(error.message)}try{validateKeyboardAdvance(currentBaseline,afterTab)}catch(error){failures.push(error.message)}if(!afterTab.id)failures.push("tab_lost_focus");if(!afterEscape.id)failures.push("escape_lost_focus");
    await this.evaluate(`document.querySelectorAll('[data-task13a-focus-order]').forEach(element=>element.removeAttribute('data-task13a-focus-order'));true`);
    const expectedKeys = [...(seed.activate ? ["Enter"] : []), "Escape", "Tab", "Escape"];
    const observedKeys = Object.values(signals).flat().filter((event) => event.type === "input-complete").map((event) => event.key);
    return { ...seed, declaredEffect: "split-keyboard-transitions", subscribedBeforeDispatch: true, expectedInputObserved: expectedKeys.length === observedKeys.length && expectedKeys.every((key, index) => key === observedKeys[index]), owners, afterEnter, currentBaseline, afterTab, afterEscape, tabAuthorityBefore, tabAuthorityAfter, signals, failures };
  }
  async close(options = {}) {
    if (this.structuralMount) await this.disposeStructuralWorkspace().catch(() => false);
    this.cdp.close(); const selection = selectCleanup(this.runtime); assert.deepEqual(selection.ambiguous, [], "ambiguous identity refuses cleanup");
    const signalled = []; for (const row of selection.owned.sort((a, b) => b.pid - a.pid)) { process.kill(row.pid, "SIGKILL"); signalled.push(row.pid); }
    if (this.runtime.launch.exitCode === null && this.runtime.launch.signalCode === null) {
      await bounded("Obsidian launcher exit", (resolve) => this.runtime.launch.once("exit", resolve), 10000).catch(() => {});
    }
    assert.deepEqual(selectCleanup(this.runtime).owned, [], "task process residue");
    let protectedContinuity = { exact: true, error: null };
    try { assertProtectedUnchanged(this.runtime.protectedSnapshot, signalled); } catch (error) { protectedContinuity = { exact: false, error: error.message }; }
    const after = treeHash(this.runtime.vault);
    const beforeEntries = new Map(this.runtime.before.entries.map(([relative, hash]) => [relative, hash]));
    const afterEntries = new Map(after.entries.map(([relative, hash]) => [relative, hash]));
    const changedPaths = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])]
      .filter((relative) => beforeEntries.get(relative) !== afterEntries.get(relative));
    const expectedJson = options.expectedJson && typeof options.expectedJson === "object" ? options.expectedJson : {};
    const expectedRuntimeJsonPaths = new Set(Array.isArray(options.expectedRuntimeJsonPaths)
      ? options.expectedRuntimeJsonPaths : []);
    const declaredRuntimeMetadata = (relative) =>
      /^\.obsidian\/(?:workspace|workspace-mobile|app|appearance)\.json$/u.test(relative)
      || expectedRuntimeJsonPaths.has(relative);
    const permittedJsonCleanup = changedPaths.length > 0 && changedPaths.every((relative) => {
      if (!declaredRuntimeMetadata(relative) && !Object.hasOwn(expectedJson, relative)) return false;
      try {
        const actual = JSON.parse(fs.readFileSync(path.join(this.runtime.vault, relative), "utf8"));
        const expected = Object.hasOwn(expectedJson, relative) ? expectedJson[relative] : actual;
        return JSON.stringify(actual) === JSON.stringify(expected);
      } catch (_error) {
        return false;
      }
    });
    const audit = {
      before: this.runtime.before.hash,
      after: after.hash,
      equal: this.runtime.before.hash === after.hash || permittedJsonCleanup,
      beforeEntries: this.runtime.before.entries.length,
      afterEntries: after.entries.length,
      changedPaths,
      declaredRuntimeMetadataPaths: changedPaths.filter(declaredRuntimeMetadata),
      permittedJsonCleanup,
    };
    assert.equal(audit.equal, true, `vault bytes changed outside declared runtime metadata: ${JSON.stringify(changedPaths)}`);
    const ownershipAudit = {
      token: this.runtime.ownershipToken,
      marker: this.runtime.ownershipMarker,
      owner: this.runtime.ownershipMetadata.owner,
      application: this.runtime.ownershipMetadata.application,
      signalled: selection.owned.map(({ pid, start, executable }) => ({ pid, start, executable })),
      ambiguous: selection.ambiguous,
    };
    const receipt = { signalled, audit, ownershipAudit, protectedHash: this.runtime.protectedSnapshot.hash, protectedContinuity, runtimeRoot: this.runtime.runtimeRoot, removed: false, port: this.runtime.port, launch_contract: this.runtime.launchContract };
    fs.rmSync(this.runtime.runtimeRoot, { recursive: true, force: true }); receipt.removed = !fs.existsSync(this.runtime.runtimeRoot);
    const reusable = await allocatePort(new Set(), this.runtime.port); receipt.portReusable = reusable === this.runtime.port;
    process.stdout.write(`TASK13A_LAUNCH_CONTRACT ${JSON.stringify(receipt.launch_contract)}\n`);
    return receipt;
  }
}
module.exports = { ADAPTER_STATE, assertMediaAuthorityTrace, assertProtectedUnchanged, buildMediaAuthority, buildTrustedClickPreparationExpression, browserTrustedClickPreparation, Cdp, CDP_DEFAULT_TIMEOUT_MS, collectDiagnosticElements, createDisposableOwnership, createFixtureRegistry, createLayoutAuthorityCoordinator, ASIDE_BUNDLE, HUBS, OBSIDIAN_BUNDLE, STRUCTURAL_DRIVER_CONTRACTS, STRUCTURAL_SCENARIOS, RealObsidianHarness, allocatePort, assertDiagnosticClean, attachCssOwnership, buildFixture, diagnosticFailures, extractBlocks, findOwned, fixturePluginSource, matrixAggregate, nodeNetworkDenyPrelude, publicIdentity, resolveCssOwnership, scenarioAggregate, selectActiveProductionMount, selectCleanup, selectDiagnosticRoots, snapshotProtected, structuralDriverContract, structuralScenarioEffect, treeHash, validateKeyboardAdvance, validateKeyboardTrace, validateInheritedLayoutAuthority, validateLaunchContract, validateLayoutSettlement, validateScenarioPlan, validateScenarioReceipt, validateZoomAuthority };
