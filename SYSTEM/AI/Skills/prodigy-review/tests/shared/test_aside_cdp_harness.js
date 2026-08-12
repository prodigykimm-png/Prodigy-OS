#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ASIDE_BINARY,
  CdpConnection,
  allocateTaskPort,
  assertProtectedAsideUnchanged,
  captureTaskProcessIdentities,
  cleanupTaskRuntime,
  createEndpointMonitor,
  discoverTaskApplication,
  proveRuntimeEndpointOwnership,
  selectOwnedRuntimeRows,
  validateDevtoolsEndpoint,
} = require("./aside_cdp_harness.js");

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function writeFromChild(filePath, value) {
  return childProcess.spawn(process.execPath, [
    "-e",
    'require("node:fs").appendFileSync(process.argv[1], process.argv[2])',
    filePath,
    value,
  ], { stdio: "ignore" });
}

function waitForMessage(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("dummy task process readiness timed out")), 5000);
    child.once("message", (message) => { clearTimeout(timer); resolve(message); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`dummy task process exited before ready: code=${code} signal=${signal}`));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("dummy process exit timed out")), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

test("protected existing endpoint is rejected before any CDP connection", () => {
  const protectedSnapshot = { pids: new Set([33261]), ports: new Set([45103]), pgids: new Set([33261]) };
  assert.throws(
    () => validateDevtoolsEndpoint("ws://[::1]:45103/devtools/browser/protected", 60100, protectedSnapshot),
    /protected Aside endpoint/,
  );
  console.log("ASIDE_LAUNCH_RED protected-existing-endpoint");
});

test("single-instance redirection fails on the protected endpoint event", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aside-redirection-contract-"));
  const stderrPath = path.join(root, "stderr.log");
  fs.writeFileSync(stderrPath, "");
  const monitor = createEndpointMonitor(stderrPath, {
    expectedPort: 60101,
    protectedPorts: new Set([45103]),
    timeout: 1000,
  });
  const writer = writeFromChild(stderrPath, "DevTools listening on ws://[::1]:45103/devtools/browser/protected\n");
  try {
    await assert.rejects(monitor.ready, /protected Aside endpoint/);
    assert.equal(writer.exitCode === 0 || writer.exitCode === null, true);
    console.log("ASIDE_LAUNCH_RED single-instance-redirection");
  } finally {
    monitor.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("wrong app PID cannot own the task endpoint", () => {
  const profile = "/tmp/task-profile";
  const bundlePath = "/tmp/AsideTask.app";
  const rows = [
    { pid: 72000, ppid: 1, pgid: 72000, command: `${bundlePath}/Contents/MacOS/Aside --remote-debugging-port=60102 --user-data-dir=${profile}` },
    { pid: 33261, ppid: 1, pgid: 33261, command: "/Applications/Aside.app/Contents/MacOS/Aside" },
  ];
  assert.throws(() => discoverTaskApplication({
    profile,
    port: 60102,
    bundlePath,
    rows,
    listeners: [33261],
    protectedSnapshot: { pids: new Set([33261]), ports: new Set([45103]), pgids: new Set([33261]) },
    environmentText: `HOME=/tmp/home TMPDIR=/tmp/tmp --user-data-dir=${profile}`,
    home: "/tmp/home",
    temp: "/tmp/tmp",
  }), /listener does not belong to task app/);
  console.log("ASIDE_LAUNCH_RED wrong-app-pid");
});

test("LaunchServices parent may exit before independently parented app discovery", () => {
  const profile = "/tmp/task-profile";
  const bundlePath = "/tmp/AsideTask.app";
  const rows = [
    { pid: 73000, ppid: 1, pgid: 73000, command: `${bundlePath}/Contents/MacOS/Aside --remote-debugging-port=60103 --user-data-dir=${profile}` },
    { pid: 73001, ppid: 73000, pgid: 73000, command: `${bundlePath}/Contents/Frameworks/Aside Helper --user-data-dir=${profile}` },
  ];
  const ownership = discoverTaskApplication({
    profile,
    port: 60103,
    bundlePath,
    rows,
    listeners: [73000],
    protectedSnapshot: { pids: new Set([33261]), ports: new Set([45103]), pgids: new Set([33261]) },
    environmentText: "HOME=/tmp/home TMPDIR=/tmp/tmp",
    home: "/tmp/home",
    temp: "/tmp/tmp",
  });
  assert.equal(ownership.appPid, 73000);
  assert.equal(ownership.appPgid, 73000);
  assert.deepEqual(ownership.processTree, [73000, 73001]);
  console.log("ASIDE_LAUNCH_GREEN open-parent-exit-independent-app");
});

test("delayed forced-new endpoint resolves from the exact file event", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aside-delayed-contract-"));
  const stderrPath = path.join(root, "stderr.log");
  fs.writeFileSync(stderrPath, "");
  const monitor = createEndpointMonitor(stderrPath, {
    expectedPort: 60104,
    protectedPorts: new Set([45103]),
    allowedPorts: new Set([60104, 60105]),
    timeout: 1000,
  });
  const writer = writeFromChild(stderrPath, "launching forced-new bundle\nDevTools listening on ws://127.0.0.1:60105/devtools/browser/remapped-internal\nDevTools listening on ws://127.0.0.1:60104/devtools/browser/task\n");
  try {
    const ready = await monitor.ready;
    assert.equal(writer.exitCode === 0 || writer.exitCode === null, true);
    assert.equal(ready.websocketUrl, "ws://127.0.0.1:60104/devtools/browser/task");
    assert.deepEqual(monitor.endpoints, [
      "ws://127.0.0.1:60105/devtools/browser/remapped-internal",
      "ws://127.0.0.1:60104/devtools/browser/task",
    ]);
    console.log("ASIDE_LAUNCH_GREEN delayed-forced-new-endpoint");
  } finally {
    monitor.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("post-settlement ownership snapshot includes a late internal listener descendant", () => {
  const profile = "/tmp/task-profile";
  const bundlePath = "/tmp/AsideTask.app";
  const nonce = "late-listener-nonce";
  const app = { pid: 73500, ppid: 1, pgid: 73500, startTime: "Tue Aug 11 01:02:03 2026", executable: `${bundlePath}/Contents/MacOS/Aside`, command: `${bundlePath}/Contents/MacOS/Aside --remote-debugging-port=60106 --user-data-dir=${profile} --task-aside-nonce=${nonce}` };
  const helper = { pid: 73501, ppid: 73500, pgid: 73500, startTime: "Tue Aug 11 01:02:04 2026", executable: `${bundlePath}/Contents/Frameworks/Aside Helper`, command: `${bundlePath}/Contents/Frameworks/Aside Helper --user-data-dir=${profile} --task-aside-nonce=${nonce}` };
  const protectedSnapshot = { pids: new Set([33261]), ports: new Set([45103]), pgids: new Set([33261]) };
  const staleOwnership = discoverTaskApplication({
    profile, port: 60106, nonce, bundlePath, rows: [app], listeners: [73500], protectedSnapshot,
    environmentText: "HOME=/tmp/home TMPDIR=/tmp/tmp", home: "/tmp/home", temp: "/tmp/tmp",
  });
  assert.equal(staleOwnership.processTree.includes(helper.pid), false, "pre-listener snapshot reproduces the stale tree");
  assert.equal([helper.pid].every((pid) => staleOwnership.processTree.includes(pid)), false, "legacy internal ownership assertion deterministically RED");
  const proof = proveRuntimeEndpointOwnership({
    profile, port: 60106, internalPort: 60107, nonce, bundlePath, protectedSnapshot,
    home: "/tmp/home", temp: "/tmp/tmp", rows: [app, helper],
    listenersByPort: new Map([[60106, [app.pid]], [60107, [helper.pid]]]),
    environmentText: "HOME=/tmp/home TMPDIR=/tmp/tmp",
  });
  assert.deepEqual(proof.processTree, [app.pid, helper.pid]);
  assert.deepEqual(proof.endpointListeners, { 60106: [app.pid], 60107: [helper.pid] });
  assert.equal(proof.appIdentity.startTime, app.startTime);
  assert.equal(proof.appIdentity.executable, app.executable);
  console.log("ASIDE_LAUNCH_GREEN post-settlement-late-listener-owned");
});

test("occupied task port rejects before LaunchServices", async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  try {
    await assert.rejects(allocateTaskPort(port, new Set()), /task-owned debug port is occupied/);
    console.log("ASIDE_LAUNCH_RED occupied-port " + port);
  } finally {
    await closeServer(server);
  }
});

test("CDP connection failure rejects rather than attaching elsewhere", async () => {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  try {
    await assert.rejects(CdpConnection.connect(`ws://127.0.0.1:${port}/devtools/browser/not-cdp`, 1000), /Aside DevTools connection failed|connection timed out/);
    console.log("ASIDE_LAUNCH_RED connection-failure " + port);
  } finally {
    await closeServer(server);
  }
});

test("cleanup exact identity excludes a live prefix-collision sentinel that legacy selection targets", async () => {
  const port = await allocateTaskPort(undefined, new Set([45103]));
  const sentinelPort = await allocateTaskPort(undefined, new Set([45103, port]));
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aside-cleanup-contract-"));
  const profile = path.join(runtimeRoot, "profile");
  fs.mkdirSync(profile);
  const script = [
    'const net=require("node:net");',
    'const port=Number(process.argv.find(value=>value.startsWith("--task-port=")).split("=")[1]);',
    'const server=net.createServer();',
    'server.listen(port,"127.0.0.1",()=>process.send({ready:true,port,pid:process.pid}));',
  ].join("");
  const spawnDummy = (ownedProfile, ownedPort) => childProcess.spawn(process.execPath, [
    "-e", script, "--", `--user-data-dir=${ownedProfile}`, `--task-port=${ownedPort}`,
  ], { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const app = spawnDummy(profile, port);
  const sentinel = spawnDummy(profile + "-protected", sentinelPort);
  try {
    const [message, sentinelMessage] = await Promise.all([waitForMessage(app), waitForMessage(sentinel)]);
    assert.equal(message.pid, app.pid);
    assert.equal(sentinelMessage.pid, sentinel.pid);
    const rows = [
      { pid: app.pid, ppid: process.pid, pgid: app.pid, command: `${process.execPath} --user-data-dir=${profile} --task-port=${port}` },
      { pid: sentinel.pid, ppid: process.pid, pgid: sentinel.pid, command: `${process.execPath} --user-data-dir=${profile}-protected --task-port=${sentinelPort}` },
    ];
    const legacyTargets = rows.filter((row) => row.command.includes(profile));
    assert.deepEqual(legacyTargets.map((row) => row.pid).sort(), [app.pid, sentinel.pid].sort(), "legacy broad cleanup would target protected sentinel");
    const runtime = {
      appPid: app.pid,
      appPgid: app.pid,
      bundlePath: path.join(runtimeRoot, "DummyTask.app"),
      connection: null,
      endpointMonitor: { error: null, close() {} },
      launch: app,
      port,
      profile,
      protectedSnapshot: { pids: new Set([sentinel.pid]), ports: new Set([sentinelPort]), pgids: new Set([sentinel.pid]) },
      runtimeRoot,
    };
    runtime.ownedProcesses = captureTaskProcessIdentities(runtime, rows);
    assert.deepEqual(runtime.ownedProcesses.map((identity) => identity.pid), [app.pid], "positive startup identity owns exactly the task process");
    const receipt = await cleanupTaskRuntime(runtime, { quiet: true });
    assert.deepEqual(receipt.processResidue, []);
    assert.equal(receipt.portReusable, true);
    assert.equal(receipt.runtimeRootRemoved, true);
    assert.equal(process.kill(sentinel.pid, 0), true, "protected sentinel remains continuous");
    assert.equal(await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", (error) => resolve(error.code === "EADDRINUSE"));
      server.listen(sentinelPort, "127.0.0.1", () => server.close(() => resolve(false)));
    }), true, "protected sentinel endpoint remains owned");
    console.log("ASIDE_LAUNCH_GREEN exact-cleanup " + JSON.stringify({ ...receipt, sentinelPid: sentinel.pid }));
  } finally {
    if (sentinel.exitCode === null && sentinel.signalCode === null) process.kill(sentinel.pid, "SIGKILL");
    await waitForExit(sentinel).catch(() => {});
    if (app.exitCode === null && app.signalCode === null) process.kill(app.pid, "SIGKILL");
    await waitForExit(app).catch(() => {});
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test("protected bundle replacement is distinguished from harness harm by endpoint lineage and signal audit", () => {
  const oldPid = 75000;
  const replacementPid = 75001;
  const record = {
    pid: oldPid,
    pgid: oldPid,
    startTime: "Tue Aug 11 01:00:00 2026",
    executable: ASIDE_BINARY,
    command: ASIDE_BINARY,
    ports: [45103],
  };
  const rows = [{
    pid: replacementPid,
    ppid: 1,
    pgid: replacementPid,
    startTime: "Tue Aug 11 01:10:00 2026",
    executable: ASIDE_BINARY,
    command: ASIDE_BINARY,
  }];
  assert.throws(() => assert.ok(rows.some((row) => row.pid === oldPid), "legacy PID-only continuity"), /legacy PID-only continuity/);
  const continuity = assertProtectedAsideUnchanged({ records: [record] }, rows, {
    signalledPids: [],
    portLookup: (pid) => pid === replacementPid ? [45103] : [],
  });
  assert.deepEqual(continuity, { continuous: false, replacements: [{ previousPid: oldPid, currentPid: replacementPid }] });
  assert.throws(() => assertProtectedAsideUnchanged({ records: [record] }, rows, {
    signalledPids: [oldPid],
    portLookup: () => [45103],
  }), /must not signal replaced protected Aside/);
  console.log("ASIDE_LAUNCH_GREEN independent-protected-replacement-distinguished");
});

test("cleanup refuses a reused PID whose executable or start identity changed", () => {
  const profile = "/tmp/aside-task-nonce/profile";
  const runtime = {
    profile,
    ownedProcesses: [{ pid: 74000, pgid: 74000, startTime: "Tue Aug 11 01:02:03 2026", executable: "/tmp/AsideTask.app/Contents/MacOS/Aside" }],
  };
  const rows = [{
    pid: 74000,
    ppid: 1,
    pgid: 74000,
    startTime: "Tue Aug 11 01:05:00 2026",
    executable: "/Applications/Aside.app/Contents/MacOS/Aside",
    command: `/Applications/Aside.app/Contents/MacOS/Aside --user-data-dir=${profile}`,
  }];
  const selection = selectOwnedRuntimeRows(runtime, rows);
  assert.deepEqual(selection.owned, []);
  assert.equal(selection.ambiguous.length, 1);
  assert.match(selection.ambiguous[0].reason, /identity changed/);
  console.log("ASIDE_LAUNCH_RED stale-pid-identity-refused");
});
