"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const {
  CdpConnection,
} = require("../../../../../SYSTEM/AI/Skills/prodigy-review/tests/shared/aside_cdp_harness.js");

const chrome =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome";
const loopback = "127.0.0.1";

function bounded(label, subscribe, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeout);
    subscribe(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function allocatePort() {
  const server = net.createServer();
  return bounded("ephemeral port allocation", (resolve, reject) => {
    server.once("error", reject);
    server.listen(0, loopback, () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function directoryBytes(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? directoryBytes(entryPath) : fs.lstatSync(entryPath).size;
  }
  return total;
}

function groupProcesses(pgid) {
  if (!pgid) return [];
  const output = childProcess.spawnSync("ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
  });
  assert.equal(output.status, 0, "process inventory");
  return output.stdout
    .split(/\n/u)
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter((match) => match && Number(match[2]) === pgid)
    .map((match) => ({ pid: Number(match[1]), command: match[3] }));
}

function canBind(port) {
  const server = net.createServer();
  return bounded("port reuse", (resolve, reject) => {
    server.once("error", reject);
    server.listen(port, loopback, () =>
      server.close((error) => (error ? reject(error) : resolve(true))),
    );
  });
}

function signalChrome(runtime, signal) {
  if (!runtime.child.pid || runtime.child.exitCode !== null) return;
  try {
    process.kill(-runtime.child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function cleanupChromeRuntime(runtime) {
  const bytesBefore = fs.existsSync(runtime.root) ? directoryBytes(runtime.root) : 0;
  if (runtime.connection) {
    await runtime.connection.send("Browser.close").catch(() => undefined);
    runtime.connection.close();
  }
  signalChrome(runtime, "SIGTERM");
  try {
    await bounded(
      "Chrome process close",
      (resolve, reject) => runtime.closed.then(resolve, reject),
      5_000,
    );
  } catch {
    signalChrome(runtime, "SIGKILL");
    await bounded(
      "Chrome forced process close",
      (resolve, reject) => runtime.closed.then(resolve, reject),
      5_000,
    );
  }
  const residue = groupProcesses(runtime.child.pid);
  assert.deepEqual(residue, [], "task Chrome process tree must exit before profile removal");
  fs.rmSync(runtime.root, { recursive: true, force: true });
  return {
    root: runtime.root,
    bytesBefore,
    afterExists: fs.existsSync(runtime.root),
    processResidue: residue,
    portReusable: await canBind(runtime.port),
  };
}

async function startChromeRuntime(failure = "none") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pva-layout-chrome-"));
  const profile = path.join(root, "profile");
  fs.mkdirSync(profile);
  const port = await allocatePort();
  const executable =
    failure === "launch"
      ? path.join(root, "missing-chrome")
      : failure === "timeout"
        ? "/usr/bin/tail"
        : chrome;
  const args =
    failure === "timeout"
      ? ["-f", "/dev/null"]
      : [
          "--headless=new",
          "--disable-gpu",
          "--disable-extensions",
          "--no-first-run",
          "--disable-background-networking",
          `--remote-debugging-port=${port}`,
          `--remote-debugging-address=${loopback}`,
          `--user-data-dir=${profile}`,
          "about:blank",
        ];
  const child = childProcess.spawn(executable, args, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const closed = new Promise((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal })),
  );
  const runtime = { root, profile, port, child, closed, connection: null };
  try {
    const websocketUrl = await bounded(
      "Chrome DevTools endpoint",
      (resolve, reject) => {
        let stderr = "";
        child.once("error", reject);
        child.once("close", (code, signal) =>
          reject(new Error(`Chrome closed before endpoint: ${code}/${signal}`)),
        );
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
          const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
          if (!match) return;
          const endpoint = new URL(match[1]);
          if (Number(endpoint.port) !== port) {
            reject(
              new Error(
                `Chrome DevTools endpoint mismatch: expected ${port}, got ${endpoint.port}`,
              ),
            );
            return;
          }
          resolve(match[1]);
        });
      },
      failure === "timeout" ? 250 : 15_000,
    );
    runtime.connection = await CdpConnection.connect(websocketUrl);
    runtime.endpoint = `http://${loopback}:${port}`;
    return runtime;
  } catch (error) {
    error.cleanup = await cleanupChromeRuntime(runtime);
    throw error;
  }
}

async function createChromePage(runtime, html) {
  const response = await fetch(`${runtime.endpoint}/json/new?about%3Ablank`, {
    method: "PUT",
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.ok, true, "Chrome target creation");
  const target = await response.json();
  const connection = await CdpConnection.connect(target.webSocketDebuggerUrl);
  await connection.send("Page.enable");
  await connection.send("Runtime.enable");
  await connection.send("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = connection.waitFor("Page.loadEventFired");
  await connection.send("Page.navigate", {
    url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  });
  await loaded;
  return { targetId: target.id, connection };
}

async function evaluateChrome(page, expression) {
  const response = await page.connection.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  assert.equal(response.exceptionDetails, undefined, "browser evaluation");
  return response.result.value;
}

async function closeChromePage(runtime, page) {
  page.connection.close();
  await runtime.connection.send("Target.closeTarget", { targetId: page.targetId });
}

module.exports = {
  cleanupChromeRuntime,
  closeChromePage,
  createChromePage,
  evaluateChrome,
  startChromeRuntime,
};
