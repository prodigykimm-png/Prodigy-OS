"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ASIDE_BUNDLE = "/Applications/Aside.app";
const OPEN_BINARY = "/usr/bin/open";
const LOOPBACK = "127.0.0.1";
const COMMAND_TIMEOUT_MS = 30000;
const START_TIMEOUT_MS = 30000;

function bounded(label, subscribe, timeout = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + " timed out")), timeout);
    subscribe(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function run(command, args, label) {
  const result = childProcess.spawnSync(command, args, { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed: ${(result.error && result.error.message) || result.stderr || result.status}`);
  }
  return result.stdout;
}

function bundleMetadata(bundlePath = ASIDE_BUNDLE) {
  const plist = path.join(bundlePath, "Contents", "Info.plist");
  const read = (key) => run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], `Aside ${key}`).trim();
  const executable = read("CFBundleExecutable");
  return {
    bundlePath,
    bundleIdentifier: read("CFBundleIdentifier"),
    bundleName: read("CFBundleName"),
    bundleVersion: read("CFBundleShortVersionString"),
    executable,
    binaryPath: path.join(bundlePath, "Contents", "MacOS", executable),
  };
}

const ASIDE_METADATA = bundleMetadata();
const ASIDE_BINARY = ASIDE_METADATA.binaryPath;

function closeServer(server) {
  return bounded("loopback server close", (resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }, 5000);
}

async function allocateTaskPort(preferredPort, protectedPorts = new Set()) {
  if (preferredPort && protectedPorts.has(Number(preferredPort))) {
    throw new Error("task-owned debug port is protected: " + preferredPort);
  }
  const server = net.createServer();
  const port = await bounded("task-owned port allocation", (resolve, reject) => {
    server.once("error", reject);
    server.listen(preferredPort || 0, LOOPBACK, () => resolve(server.address().port));
  }, 5000).catch((error) => {
    if (error && error.code === "EADDRINUSE") throw new Error("task-owned debug port is occupied: " + preferredPort);
    throw error;
  });
  await closeServer(server);
  if (protectedPorts.has(port)) throw new Error("allocated debug port matches protected Aside port: " + port);
  return port;
}

async function canBindPort(port) {
  const server = net.createServer();
  try {
    await bounded("cleanup port verification", (resolve, reject) => {
      server.once("error", reject);
      server.listen(port, LOOPBACK, resolve);
    }, 5000);
    await closeServer(server);
    return true;
  } catch (_) {
    try { server.close(); } catch (_) {}
    return false;
  }
}

function processRows() {
  const output = run("ps", ["-axo", "pid=,ppid=,pgid=,command="], "process ownership snapshot");
  return output.split(/\n/u).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\s\S]+)$/);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), command: match[4] } : null;
  }).filter(Boolean);
}

function descendantPids(rows, rootPid) {
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid);
        changed = true;
      }
    }
  }
  return descendants;
}

function listenerPids(port) {
  const result = childProcess.spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", timeout: 5000 });
  if (result.status !== 0 && result.status !== 1) throw new Error("unable to inspect debug-port listener");
  return result.stdout.split(/\s+/u).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}

function listenerPortsForPid(pid) {
  const result = childProcess.spawnSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8", timeout: 5000 });
  if (result.status !== 0 && result.status !== 1) throw new Error("unable to inspect protected Aside listeners");
  const ports = [];
  for (const line of result.stdout.split(/\n/u)) {
    const match = line.match(/TCP\s+.+:(\d+)\s+\(LISTEN\)/u);
    if (match) ports.push(Number(match[1]));
  }
  return [...new Set(ports)].sort((a, b) => a - b);
}

function snapshotProtectedAside(rows = processRows()) {
  const roots = rows.filter((row) => row.command === ASIDE_BINARY || row.command.startsWith(ASIDE_BINARY + " "));
  const pids = new Set();
  const pgids = new Set();
  const records = [];
  const ports = new Set();
  for (const root of roots) {
    const tree = descendantPids(rows, root.pid);
    for (const pid of tree) pids.add(pid);
    for (const row of rows) if (tree.has(row.pid)) pgids.add(row.pgid);
    const rootPorts = listenerPortsForPid(root.pid);
    for (const port of rootPorts) ports.add(port);
    records.push({ ...processIdentity(root.pid), pgid: root.pgid, command: root.command, ports: rootPorts });
  }
  assert.ok(records.length > 0, "a running protected user Aside instance is required");
  const hash = crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
  return { pids, pgids, ports, records, hash };
}

function assertProtectedAsideUnchanged(snapshot, rows = processRows(), options = {}) {
  if (!snapshot.records) return { continuous: true, replacements: [] };
  const portLookup = options.portLookup || listenerPortsForPid;
  const identityLookup = options.identityLookup || processIdentity;
  const signalledPids = new Set(options.signalledPids || []);
  const replacements = [];
  const used = new Set();
  for (const record of snapshot.records) {
    let current = rows.find((row) => row.pid === record.pid);
    if (!current) {
      current = rows.find((row) => !used.has(row.pid)
        && (row.command === ASIDE_BINARY || row.command.startsWith(ASIDE_BINARY + " "))
        && !signalledPids.has(row.pid));
      assert.ok(current, `protected Aside identity ${record.pid} must remain running or have an unsignalled bundle replacement`);
      assert.equal(signalledPids.has(record.pid), false, `harness must not signal replaced protected Aside PID ${record.pid}`);
      replacements.push({ previousPid: record.pid, currentPid: current.pid });
    }
    used.add(current.pid);
    const identity = current.startTime && current.executable
      ? { startTime: current.startTime, executable: normalizePath(current.executable) }
      : identityLookup(current.pid);
    assert.equal(identity.executable, normalizePath(record.executable || ASIDE_BINARY), `protected Aside PID ${current.pid} executable must not change`);
    if (current.pid === record.pid && record.startTime) {
      assert.equal(identity.startTime, record.startTime, `protected Aside PID ${record.pid} start identity must not change`);
    }
    assert.equal(current.command, record.command, `protected Aside PID ${current.pid} command must not change`);
    assert.deepEqual(portLookup(current.pid), record.ports, `protected Aside PID ${current.pid} listeners must not change`);
  }
  return { continuous: replacements.length === 0, replacements };
}

function validateDevtoolsEndpoint(websocketUrl, expectedPort, protectedSnapshot = { ports: new Set() }) {
  const parsed = new URL(websocketUrl);
  const port = Number(parsed.port);
  if (protectedSnapshot.ports && protectedSnapshot.ports.has(port)) {
    throw new Error("protected Aside endpoint was returned: " + websocketUrl);
  }
  if (parsed.protocol !== "ws:" || ![LOOPBACK, "::1", "[::1]"].includes(parsed.hostname) || port !== Number(expectedPort)) {
    throw new Error(`DevTools endpoint does not match task-owned loopback port: ${websocketUrl}`);
  }
  if (!/^\/devtools\/(?:browser|page)\//u.test(parsed.pathname)) {
    throw new Error("DevTools endpoint is not a recognized CDP endpoint: " + websocketUrl);
  }
  return { websocketUrl, httpEndpoint: `http://${LOOPBACK}:${expectedPort}` };
}

function createEndpointMonitor(stderrPath, options) {
  const { expectedPort, protectedPorts = new Set(), timeout = START_TIMEOUT_MS } = options;
  const allowedPorts = options.allowedPorts || new Set([expectedPort]);
  const requiredPorts = options.requiredPorts || new Set([expectedPort]);
  let settled = false;
  let closed = false;
  let error = null;
  let stderr = "";
  const seen = new Set();
  const trace = [];
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    error = new Error("forced-new Aside DevTools endpoint timed out");
    rejectReady(error);
  }, timeout);
  const inspect = () => {
    if (closed) return;
    try {
      stderr = fs.readFileSync(stderrPath, "utf8");
      const urls = [...stderr.matchAll(/DevTools listening on (ws:\/\/[^\s]+)/gu)].map((match) => match[1]);
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        const parsed = new URL(url);
        trace.push({ sequence: trace.length + 1, port: Number(parsed.port), websocketUrl: url });
        if (protectedPorts.has(Number(parsed.port))) {
          error = new Error("protected Aside endpoint was returned: " + url);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            rejectReady(error);
          }
          if (options.onViolation) options.onViolation(error);
          return;
        }
        if (!allowedPorts.has(Number(parsed.port))) {
          error = new Error("unexpected Aside endpoint was returned: " + url);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            rejectReady(error);
          }
          if (options.onViolation) options.onViolation(error);
          return;
        }
        if (Number(parsed.port) !== Number(expectedPort)) continue;
        const endpoint = validateDevtoolsEndpoint(url, expectedPort, { ports: protectedPorts });
        const observedPorts = new Set(trace.map((event) => event.port));
        if (!settled && [...requiredPorts].every((port) => observedPorts.has(Number(port)))) {
          settled = true;
          clearTimeout(timer);
          resolveReady({ ...endpoint, stderr, endpoints: [...seen], trace: [...trace] });
        }
      }
    } catch (inspectionError) {
      error = inspectionError;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectReady(inspectionError);
      }
    }
  };
  const watcher = fs.watch(stderrPath, inspect);
  watcher.once("error", (watchError) => {
    error = watchError;
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      rejectReady(watchError);
    }
  });
  return {
    ready,
    get error() { return error; },
    get stderr() { return stderr; },
    get endpoints() { return [...seen]; },
    get trace() { return [...trace]; },
    close() { if (!closed) watcher.close(); closed = true; clearTimeout(timer); },
  };
}

function normalizePath(value) {
  try { return fs.realpathSync(value); } catch (_) { return value; }
}

function discoverTaskApplication(options) {
  const {
    profile, port, nonce = null, bundlePath, protectedSnapshot,
    rows = processRows(), listeners = listenerPids(port),
    environmentText = null, home, temp,
  } = options;
  const realBundle = normalizePath(bundlePath);
  const binarySuffix = `/Contents/MacOS/${ASIDE_METADATA.executable}`;
  const candidates = rows.filter((row) => {
    const commandBinary = row.command.split(" ")[0];
    return normalizePath(commandBinary) === realBundle + binarySuffix
      && commandHasExactArgument(row.command, `--user-data-dir=${profile}`)
      && commandHasExactArgument(row.command, `--remote-debugging-port=${port}`)
      && (!nonce || commandHasExactArgument(row.command, `--task-aside-nonce=${nonce}`));
  });
  assert.equal(candidates.length, 1, "exactly one forced-new Aside app must own task profile and port");
  const app = candidates[0];
  assert.equal(protectedSnapshot.pids.has(app.pid), false, "task app PID matches protected Aside PID");
  assert.equal(protectedSnapshot.pgids.has(app.pgid), false, "task app process group matches protected Aside group");
  const tree = descendantPids(rows, app.pid);
  assert.ok(listeners.length > 0, "task-owned debug port has no listener");
  assert.equal(listeners.every((pid) => tree.has(pid)), true, "listener does not belong to task app process tree");
  assert.equal(listeners.some((pid) => protectedSnapshot.pids.has(pid)), false, "protected Aside PID owns returned endpoint");
  const groupRows = rows.filter((row) => row.pgid === app.pgid);
  assert.equal(groupRows.every((row) => tree.has(row.pid)), true, "task app process group contains an unrelated process");
  if (environmentText !== null) {
    assert.match(environmentText, new RegExp(`(?:^|\\s)HOME=${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`), "task app HOME must be disposable");
    assert.match(environmentText, new RegExp(`(?:^|\\s)TMPDIR=${temp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`), "task app TMPDIR must be disposable");
  }
  return {
    appPid: app.pid,
    appPgid: app.pgid,
    listeners: [...listeners].sort((a, b) => a - b),
    processTree: [...tree].sort((a, b) => a - b),
    launchServicesParent: app.ppid,
    command: app.command,
  };
}

function proveRuntimeEndpointOwnership(options) {
  const {
    profile, port, internalPort, nonce, bundlePath, protectedSnapshot, home, temp,
    rows = processRows(), environmentText = null,
    listenersByPort = new Map([port, internalPort].map((endpointPort) => [endpointPort, listenerPids(endpointPort)])),
    identityLookup = processIdentity,
  } = options;
  const endpointPorts = [port, internalPort];
  const externalListeners = listenersByPort.get(port) || [];
  const ownership = discoverTaskApplication({
    profile, port, nonce, bundlePath, protectedSnapshot, rows,
    listeners: externalListeners, environmentText, home, temp,
  });
  const appRow = rows.find((row) => row.pid === ownership.appPid);
  const appIdentity = appRow && appRow.startTime && appRow.executable
    ? { pid: appRow.pid, startTime: appRow.startTime, executable: normalizePath(appRow.executable) }
    : identityLookup(ownership.appPid);
  assert.equal(appIdentity.executable, normalizePath(path.join(bundlePath, "Contents", "MacOS", ASIDE_METADATA.executable)), "task app executable identity must match the unique task bundle");
  const endpointListeners = {};
  const listenerIdentities = [];
  for (const endpointPort of endpointPorts) {
    const listeners = [...(listenersByPort.get(endpointPort) || [])].sort((a, b) => a - b);
    assert.ok(listeners.length > 0, `task endpoint ${endpointPort} must have a listener`);
    assert.equal(listeners.every((pid) => ownership.processTree.includes(pid)), true, `task endpoint ${endpointPort} listener must descend from exact task app identity`);
    assert.equal(listeners.some((pid) => protectedSnapshot.pids.has(pid)), false, `protected Aside must not own task endpoint ${endpointPort}`);
    endpointListeners[endpointPort] = listeners;
    for (const pid of listeners) {
      const row = rows.find((candidate) => candidate.pid === pid);
      const identity = row && row.startTime && row.executable
        ? { pid, startTime: row.startTime, executable: normalizePath(row.executable) }
        : identityLookup(pid);
      listenerIdentities.push({ ...identity, port: endpointPort });
    }
  }
  return { ...ownership, appIdentity, endpointListeners, listenerIdentities };
}

function taskEnvironmentText(pid) {
  return run("ps", ["eww", "-p", String(pid), "-o", "command="], "task app environment snapshot");
}

function buildBindInterposer(runtimeRoot, protectedPorts, internalPort) {
  const sourcePath = path.join(runtimeRoot, "task-bind-interposer.c");
  const dylibPath = path.join(runtimeRoot, "libtask-bind-interposer.dylib");
  const remapConditions = [...protectedPorts].map((protectedPort) => [
    `if(a->sa_family==AF_INET&&ntohs(((struct sockaddr_in*)&s)->sin_port)==${protectedPort})`,
    `((struct sockaddr_in*)&s)->sin_port=htons(${internalPort});`,
    `if(a->sa_family==AF_INET6&&ntohs(((struct sockaddr_in6*)&s)->sin6_port)==${protectedPort})`,
    `((struct sockaddr_in6*)&s)->sin6_port=htons(${internalPort});`,
  ].join("")).join("");
  const source = [
    "#include <arpa/inet.h>",
    "#include <string.h>",
    "#include <sys/socket.h>",
    "#include <sys/syscall.h>",
    "#include <unistd.h>",
    `static int task_bind(int fd,const struct sockaddr* a,socklen_t n){struct sockaddr_storage s;memcpy(&s,a,n);${remapConditions}return (int)syscall(SYS_bind,fd,(struct sockaddr*)&s,n);}`,
    '__attribute__((used)) static struct{const void*replacement;const void*replacee;} interpose_bind __attribute__((section("__DATA,__interpose")))={(const void*)task_bind,(const void*)bind};',
    "",
  ].join("\n");
  fs.writeFileSync(sourcePath, source);
  run("clang", ["-dynamiclib", "-o", dylibPath, sourcePath], "task bind interposer build");
  run("codesign", ["--force", "--sign", "-", dylibPath], "task bind interposer signature");
  return {
    interposerPath: dylibPath,
    interposerSha256: crypto.createHash("sha256").update(source).digest("hex"),
  };
}

function prepareTaskBundle(runtimeRoot, port, protectedPorts, internalPort) {
  const bundlePath = path.join(runtimeRoot, `AsideTask-${port}.app`);
  run("cp", ["-cR", ASIDE_BUNDLE, bundlePath], "APFS clone of Aside bundle");
  run("xattr", ["-cr", bundlePath], "task bundle xattr cleanup");
  const bundleIdentifier = `${ASIDE_METADATA.bundleIdentifier}.task.${process.pid}.${port}`;
  const plist = path.join(bundlePath, "Contents", "Info.plist");
  run("/usr/libexec/PlistBuddy", ["-c", `Set :CFBundleIdentifier ${bundleIdentifier}`, "-c", `Set :CFBundleName AsideTask${port}`, plist], "task bundle identity update");
  run("codesign", ["--force", "--sign", "-", bundlePath], "task bundle ad-hoc signature");
  assert.equal(bundleMetadata(bundlePath).bundleIdentifier, bundleIdentifier, "task bundle identity must be unique");
  return { bundlePath, bundleIdentifier, ...buildBindInterposer(runtimeRoot, protectedPorts, internalPort) };
}

function waitForTcpReady(port, timeout = 5000) {
  return bounded("task-owned DevTools TCP readiness", (resolve, reject) => {
    const socket = net.createConnection({ host: LOOPBACK, port });
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("error", reject);
  }, timeout);
}

async function readDevtoolsVersion(httpEndpoint) {
  const response = await fetch(httpEndpoint + "/json/version", { signal: AbortSignal.timeout(5000) });
  assert.equal(response.ok, true, "task-owned DevTools version endpoint must be ready");
  return response.json();
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Set();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(pending.method + ": " + message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      for (const waiter of [...this.events]) {
        if (waiter.method !== message.method || waiter.sessionId !== (message.sessionId || null)) continue;
        if (!waiter.predicate(message.params || {})) continue;
        this.events.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message.params || {});
      }
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(pending.method + ": DevTools connection closed"));
      }
      this.pending.clear();
      for (const waiter of this.events) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(waiter.method + ": DevTools connection closed"));
      }
      this.events.clear();
    });
  }

  static async connect(url, timeout = 10000) {
    const socket = new WebSocket(url);
    await bounded("Aside DevTools connection", (resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Aside DevTools connection failed")), { once: true });
    }, timeout);
    return new CdpConnection(socket);
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(method + ": Chrome DevTools command timed out"));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { method, resolve, reject, timer });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.socket.send(JSON.stringify(message));
    });
  }

  waitFor(method, sessionId = null, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const waiter = { method, sessionId, predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.events.delete(waiter);
        reject(new Error(method + ": Chrome DevTools event timed out"));
      }, COMMAND_TIMEOUT_MS);
      this.events.add(waiter);
    });
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

function commandHasExactArgument(command, argument) {
  return command.split(/\s+/u).includes(argument);
}

function taskRows(runtime, rows = processRows()) {
  const profileArgument = `--user-data-dir=${runtime.profile}`;
  return rows.filter((row) => commandHasExactArgument(row.command, profileArgument));
}

function processIdentity(pid) {
  const output = run("ps", ["-p", String(pid), "-o", "lstart=", "-o", "comm="], "process identity snapshot").trim();
  const match = output.match(/^(.{24})\s+([\s\S]+)$/u);
  if (!match) throw new Error(`unable to parse process identity for PID ${pid}`);
  return { pid, startTime: match[1], executable: normalizePath(match[2].trim()) };
}

function captureTaskProcessIdentities(runtime, rows = processRows(), identityLookup = processIdentity) {
  return taskRows(runtime, rows).map((row) => {
    const identity = row.startTime && row.executable
      ? { pid: row.pid, startTime: row.startTime, executable: normalizePath(row.executable) }
      : identityLookup(row.pid);
    return { ...identity, pgid: row.pgid };
  });
}

function selectOwnedRuntimeRows(runtime, rows = processRows(), identityLookup = processIdentity) {
  const tokens = runtime.ownedProcesses || [];
  const tokenByPid = new Map(tokens.map((identity) => [identity.pid, identity]));
  const candidates = taskRows(runtime, rows);
  const owned = [];
  const ambiguous = [];
  const startupApp = tokenByPid.get(runtime.appPid);
  const appRow = rows.find((row) => row.pid === runtime.appPid);
  let liveAppIdentity = null;
  if (startupApp && appRow) {
    try { liveAppIdentity = identityLookup(appRow.pid); } catch (_) {}
  }
  const appIdentityMatches = liveAppIdentity
    && liveAppIdentity.startTime === startupApp.startTime
    && liveAppIdentity.executable === normalizePath(startupApp.executable);
  const liveTaskTree = appIdentityMatches ? descendantPids(rows, runtime.appPid) : new Set();
  const bundlePrefix = normalizePath(runtime.bundlePath || "") + path.sep + "Contents" + path.sep;
  for (const row of candidates) {
    const expected = tokenByPid.get(row.pid);
    let current;
    try {
      current = row.startTime && row.executable
        ? { pid: row.pid, startTime: row.startTime, executable: normalizePath(row.executable) }
        : identityLookup(row.pid);
    } catch (_) {
      continue;
    }
    if (!expected) {
      const taskCreatedDescendant = liveTaskTree.has(row.pid) && current.executable.startsWith(bundlePrefix);
      if (taskCreatedDescendant) {
        runtime.ownedProcesses.push({ ...current, pgid: row.pgid });
        owned.push(row);
      } else {
        ambiguous.push({ ...row, reason: "not captured or descended from the exact task app identity" });
      }
      continue;
    }
    if (current.startTime !== expected.startTime || current.executable !== normalizePath(expected.executable)) {
      ambiguous.push({ ...row, reason: "PID identity changed since task startup" });
      continue;
    }
    owned.push(row);
  }
  return { owned, ambiguous };
}

function launchExitPromise(launch, timeout = 10000) {
  if (!launch || launch.exitCode !== null || launch.signalCode !== null) {
    return Promise.resolve({ code: launch ? launch.exitCode : null, signal: launch ? launch.signalCode : null });
  }
  return bounded("LaunchServices waiter exit", (resolve) => launch.once("exit", (code, signal) => resolve({ code, signal })), timeout);
}

function signalOwnedRuntime(runtime, signal = "SIGKILL") {
  const rows = processRows();
  if (!runtime.ownedProcesses) runtime.ownedProcesses = captureTaskProcessIdentities(runtime, rows);
  const selection = selectOwnedRuntimeRows(runtime, rows);
  const protectedPids = runtime.protectedSnapshot.pids;
  const protectedOverlap = selection.owned.filter((row) => protectedPids.has(row.pid));
  assert.deepEqual(protectedOverlap, [], "cleanup ownership overlaps protected Aside");
  assert.deepEqual(selection.ambiguous, [], "cleanup refused ambiguous task process ownership");
  for (const row of selection.owned.reverse()) {
    try {
      process.kill(row.pid, signal);
    } catch (error) {
      if (!error || error.code !== "ESRCH") throw error;
    }
  }
  return selection.owned.map((row) => row.pid);
}

async function cleanupTaskRuntime(runtime, options = {}) {
  if (!options.quiet) console.log("ASIDE_CDP_CLEANUP_BEGIN " + JSON.stringify({ launchPid: runtime.launch && runtime.launch.pid, appPid: runtime.appPid, appPgid: runtime.appPgid, ports: runtime.ports || [runtime.port] }));
  if (runtime.connection) runtime.connection.close();
  const launchExit = launchExitPromise(runtime.launch, options.exitTimeout || 10000).catch(() => null);
  const signalledPids = signalOwnedRuntime(runtime, "SIGKILL");
  if (!options.quiet) console.log("ASIDE_CDP_CLEANUP_SIGNALLED " + JSON.stringify({ pids: signalledPids, signal: "SIGKILL" }));
  let exit = await launchExit;
  if (!exit && runtime.launch && runtime.launch.pid) {
    try { process.kill(runtime.launch.pid, "SIGKILL"); } catch (_) {}
    exit = await launchExitPromise(runtime.launch, 5000).catch(() => null);
  }
  if (runtime.endpointMonitor) runtime.endpointMonitor.close();
  if (runtime.endpointMonitor && runtime.endpointMonitor.error) throw runtime.endpointMonitor.error;
  const residue = taskRows(runtime).map((row) => row.pid);
  assert.deepEqual(residue, [], "task-owned Aside process residue");
  for (const port of runtime.ports || [runtime.port]) {
    assert.equal(await canBindPort(port), true, `task-owned debug port ${port} must be reusable after cleanup`);
  }
  const protectedContinuity = assertProtectedAsideUnchanged(runtime.protectedSnapshot, processRows(), { signalledPids });
  const profileHash = crypto.createHash("sha256").update(runtime.profile).digest("hex");
  const bundleIdentityHash = crypto.createHash("sha256").update(runtime.bundleIdentifier || runtime.bundlePath || "").digest("hex");
  fs.rmSync(runtime.runtimeRoot, { recursive: true, force: true });
  const receipt = {
    launchPid: runtime.launch && runtime.launch.pid,
    appPid: runtime.appPid,
    appPgid: runtime.appPgid,
    port: runtime.port,
    internalPort: runtime.internalPort || null,
    profileHash,
    bundleIdentityHash,
    protectedHash: runtime.protectedSnapshot.hash || null,
    protectedContinuity,
    signalledPids,
    observedEndpoints: runtime.endpointMonitor ? runtime.endpointMonitor.endpoints : [],
    exit,
    processResidue: residue,
    portReusable: true,
    runtimeRootRemoved: !fs.existsSync(runtime.runtimeRoot),
  };
  if (!options.quiet) console.log("ASIDE_CDP_CLEANUP " + JSON.stringify(receipt));
  return receipt;
}

async function cleanupFailedStart(runtime) {
  try {
    signalOwnedRuntime(runtime, "SIGKILL");
    if (runtime.launch && runtime.launch.exitCode === null && runtime.launch.signalCode === null) {
      const exited = launchExitPromise(runtime.launch, 5000);
      if (runtime.appPgid) {
        await exited.catch(async () => {
          const forced = launchExitPromise(runtime.launch, 5000).catch(() => null);
          try { process.kill(runtime.launch.pid, "SIGKILL"); } catch (_) {}
          await forced;
        });
      } else {
        const forced = exited.catch(() => null);
        try { process.kill(runtime.launch.pid, "SIGKILL"); } catch (_) {}
        await forced;
      }
    }
    if (runtime.endpointMonitor) runtime.endpointMonitor.close();
    for (const port of runtime.ports || [runtime.port]) {
      assert.equal(await canBindPort(port), true, `failed launch must release task-owned port ${port}`);
    }
    assertProtectedAsideUnchanged(runtime.protectedSnapshot);
    fs.rmSync(runtime.runtimeRoot, { recursive: true, force: true });
  } catch (error) {
    return error;
  }
  return null;
}

class AsideCdpHarness {
  constructor(runtime, connection, version, endpoint, startup) {
    this.runtime = runtime;
    this.profile = runtime.profile;
    this.launch = runtime.launch;
    this.port = runtime.port;
    this.connection = connection;
    this.version = version;
    this.endpoint = endpoint;
    this.startup = startup;
    this.targets = new Set();
    this.cleanupReceipt = null;
  }

  static async start(label = "design-theme", options = {}) {
    const protectedSnapshot = options.protectedSnapshot || snapshotProtectedAside();
    const nonce = options.nonce || crypto.randomUUID();
    const port = await allocateTaskPort(options.port, protectedSnapshot.ports);
    const internalPort = await allocateTaskPort(undefined, new Set([...protectedSnapshot.ports, port]));
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), label + "-aside-runtime-"));
    const profile = path.join(runtimeRoot, "profile");
    const home = path.join(runtimeRoot, "home");
    const temp = path.join(runtimeRoot, "tmp");
    const crash = path.join(runtimeRoot, "crash");
    const stderrPath = path.join(runtimeRoot, "aside.stderr.log");
    const stdoutPath = path.join(runtimeRoot, "aside.stdout.log");
    for (const directory of [profile, home, temp, crash]) fs.mkdirSync(directory);
    fs.writeFileSync(stderrPath, "");
    fs.writeFileSync(stdoutPath, "");
    const taskBundle = prepareTaskBundle(runtimeRoot, port, protectedSnapshot.ports, internalPort);
    const runtime = {
      ...taskBundle, protectedSnapshot, port, internalPort, nonce, ports: [port, internalPort],
      profile, home, temp, crash, stderrPath, stdoutPath, runtimeRoot,
      launch: null, connection: null, endpointMonitor: null, appPid: null, appPgid: null,
    };
    const browserArgs = [
      "--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
      "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync",
      "--disable-crash-reporter", `--crash-dumps-dir=${crash}`,
      `--remote-debugging-port=${port}`, `--remote-debugging-address=${LOOPBACK}`,
      `--user-data-dir=${profile}`, `--task-aside-nonce=${nonce}`, "about:blank",
    ];
    const launchArgs = [
      "--stderr", stderrPath, "--stdout", stdoutPath,
      "--env", `HOME=${home}`, "--env", `TMPDIR=${temp}`,
      "--env", `DYLD_INSERT_LIBRARIES=${taskBundle.interposerPath}`,
      "-n", "-W", "-g", "-a", taskBundle.bundlePath, "--args", ...browserArgs,
    ];
    try {
      runtime.endpointMonitor = createEndpointMonitor(stderrPath, {
        expectedPort: port,
        protectedPorts: protectedSnapshot.ports,
        allowedPorts: new Set([port, internalPort]),
        timeout: options.startTimeout || START_TIMEOUT_MS,
      });
      runtime.launch = childProcess.spawn(OPEN_BINARY, launchArgs, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
      const launchFailure = new Promise((_, reject) => {
        runtime.launch.once("error", reject);
        runtime.launch.once("exit", (code, signal) => {
          if (code && code !== 0) reject(new Error(`open forced-new launch failed: code=${code} signal=${signal}`));
        });
      });
      const ready = await Promise.race([runtime.endpointMonitor.ready, launchFailure]);
      await waitForTcpReady(port);
      const preliminaryRows = processRows();
      const preliminary = discoverTaskApplication({
        profile, port, nonce, bundlePath: taskBundle.bundlePath, protectedSnapshot, rows: preliminaryRows,
        listeners: listenerPids(port), environmentText: null, home, temp,
      });
      const listenersByPort = new Map([[port, listenerPids(port)], [internalPort, listenerPids(internalPort)]]);
      const rows = processRows();
      const ownership = proveRuntimeEndpointOwnership({
        profile, port, internalPort, nonce, bundlePath: taskBundle.bundlePath, protectedSnapshot, rows,
        listenersByPort, environmentText: taskEnvironmentText(preliminary.appPid), home, temp,
      });
      runtime.appPid = ownership.appPid;
      runtime.appPgid = ownership.appPgid;
      const allTaskRows = taskRows(runtime, rows);
      runtime.ownedProcesses = captureTaskProcessIdentities(runtime, rows);
      assert.ok(runtime.ownedProcesses.some((identity) => identity.pid === ownership.appPid), "task app identity must be captured before cleanup");
      assert.equal(allTaskRows.some((row) => row.command.includes("/Library/Application Support/Aside/")), false, "task app must not use the protected user application-support tree");
      const internalListeners = ownership.endpointListeners[internalPort];
      const profileStat = fs.statSync(profile);
      assert.equal(profileStat.uid, process.getuid(), "task profile must be owned by current user");
      assert.equal(normalizePath(profile).startsWith(normalizePath(runtimeRoot) + path.sep), true, "task profile must stay inside disposable runtime");
      const versionEndpoint = await readDevtoolsVersion(ready.httpEndpoint);
      validateDevtoolsEndpoint(versionEndpoint.webSocketDebuggerUrl, port, protectedSnapshot);
      assert.equal(versionEndpoint.webSocketDebuggerUrl, ready.websocketUrl, "stderr and HTTP browser endpoints must agree");
      assert.equal(runtime.endpointMonitor.error, null, "protected endpoint must not appear before CDP connection");
      const connection = await (options.connect || CdpConnection.connect)(versionEndpoint.webSocketDebuggerUrl);
      runtime.connection = connection;
      const version = await connection.send("Browser.getVersion");
      const startup = {
        launchCommand: [OPEN_BINARY, ...launchArgs],
        launchPid: runtime.launch.pid,
        appPid: ownership.appPid,
        appPgid: ownership.appPgid,
        nonce,
        appIdentity: ownership.appIdentity,
        listenerIdentities: ownership.listenerIdentities,
        launchServicesParent: ownership.launchServicesParent,
        profile,
        bundlePath: taskBundle.bundlePath,
        bundleIdentifier: taskBundle.bundleIdentifier,
        port,
        internalPort,
        endpoint: ready.websocketUrl,
        observedEndpoints: runtime.endpointMonitor.endpoints,
        endpointTrace: ready.trace,
        stderrSha256: crypto.createHash("sha256").update(ready.stderr).digest("hex"),
        listeners: ownership.listeners,
        processTree: ownership.processTree,
        protectedHash: protectedSnapshot.hash,
        protectedPids: protectedSnapshot.records.map((record) => record.pid),
        protectedPorts: [...protectedSnapshot.ports].sort((a, b) => a - b),
        internalListeners,
        interposerSha256: taskBundle.interposerSha256,
        browser: version.product,
      };
      if (!options.quiet) console.log("ASIDE_CDP_START " + JSON.stringify(startup));
      return new AsideCdpHarness(runtime, connection, version, ready.httpEndpoint, startup);
    } catch (error) {
      const cleanupError = await cleanupFailedStart(runtime);
      if (cleanupError) error.cleanupError = cleanupError;
      throw error;
    }
  }

  assertHealthy() {
    if (this.runtime.endpointMonitor.error) throw this.runtime.endpointMonitor.error;
    assertProtectedAsideUnchanged(this.runtime.protectedSnapshot);
  }

  async createPage(html, options = {}) {
    this.assertHealthy();
    const response = await fetch(this.endpoint + "/json/new?about%3Ablank", { method: "PUT", signal: AbortSignal.timeout(5000) });
    assert.equal(response.ok, true, "Aside target creation endpoint must succeed");
    const target = await response.json();
    assert.ok(target.id && target.webSocketDebuggerUrl, "created Aside target must expose DevTools");
    validateDevtoolsEndpoint(target.webSocketDebuggerUrl, this.port, this.runtime.protectedSnapshot);
    this.targets.add(target.id);
    const pageConnection = await CdpConnection.connect(target.webSocketDebuggerUrl);
    const page = { targetId: target.id, connection: pageConnection };
    await pageConnection.send("Page.enable");
    await pageConnection.send("Runtime.enable");
    await pageConnection.send("Emulation.setDeviceMetricsOverride", {
      width: options.width || 390, height: options.height || 760, deviceScaleFactor: 1, mobile: false,
    });
    if (options.mediaFeatures) {
      await pageConnection.send("Emulation.setEmulatedMedia", { media: "screen", features: options.mediaFeatures });
    }
    const loaded = pageConnection.waitFor("Page.loadEventFired");
    await pageConnection.send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
    await loaded;
    this.assertHealthy();
    return page;
  }

  evaluate(page, expression) {
    this.assertHealthy();
    return page.connection.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }).then((response) => {
      assert.equal(response.exceptionDetails, undefined, "browser evaluation must not throw");
      return response.result ? response.result.value : undefined;
    });
  }

  key(page, key, code, windowsVirtualKeyCode) {
    this.assertHealthy();
    return Promise.all([
      page.connection.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode }),
      page.connection.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode }),
    ]);
  }

  async closePage(page) {
    page.connection.close();
    await this.connection.send("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
    this.targets.delete(page.targetId);
  }

  async close() {
    for (const targetId of [...this.targets]) {
      await this.connection.send("Target.closeTarget", { targetId }).catch(() => {});
      this.targets.delete(targetId);
    }
    this.cleanupReceipt = await cleanupTaskRuntime(this.runtime);
    return this.cleanupReceipt;
  }
}

module.exports = {
  ASIDE_BINARY,
  ASIDE_BUNDLE,
  ASIDE_METADATA,
  AsideCdpHarness,
  CdpConnection,
  allocateTaskPort,
  assertProtectedAsideUnchanged,
  canBindPort,
  captureTaskProcessIdentities,
  cleanupTaskRuntime,
  createEndpointMonitor,
  discoverTaskApplication,
  proveRuntimeEndpointOwnership,
  selectOwnedRuntimeRows,
  snapshotProtectedAside,
  validateDevtoolsEndpoint,
};
