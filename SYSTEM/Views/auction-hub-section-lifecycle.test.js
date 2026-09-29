"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The Auction hub note empties its own note container (the js-engine block calls
// container.empty()) before the native shell mounts, so every legacy section
// block below it owns a container that can never become connected. The bounded
// readiness poller must not spend its whole maxAttempts x interval budget
// waiting for that: measured on the Auction dom_render span it burned ~19.2s per
// mount and then failed with "Auction section container did not connect", which
// also pinned the workspace navigation request in the "error" state forever.

const HUB_NOTE = path.resolve(__dirname, "../../HUB/10 Auction.md");

function readLifecycleSource() {
  const lines = fs.readFileSync(HUB_NOTE, "utf8").split("\n");
  const start = lines.findIndex((line) => /window\.ProdigyAuctionLifecycle\s*=/.test(line));
  assert.ok(start >= 0, "HUB/10 Auction.md must define window.ProdigyAuctionLifecycle");
  const end = lines.findIndex((line, index) => index > start && /^\}\)\(\);?\s*$/.test(line));
  assert.ok(end > start, "ProdigyAuctionLifecycle IIFE must be closed in HUB/10 Auction.md");
  return lines.slice(start, end + 1).join("\n");
}

function fakeElement() {
  const element = {
    textContent: "",
    setAttribute() {},
    setAttr() {},
    empty() {},
    createEl() {
      return fakeElement();
    },
    querySelector() {
      return null;
    }
  };
  element.onclick = null;
  return element;
}

// A window whose setTimeout runs the callback synchronously, so the poller is
// driven deterministically and the assertions count real scheduling decisions
// instead of racing a clock.
function harness(source) {
  const scheduled = [];
  const win = {
    setTimeout(callback) {
      scheduled.push(callback);
      callback();
      return scheduled.length;
    },
    clearTimeout() {}
  };
  new Function("window", source)(win);
  return { lifecycle: win.ProdigyAuctionLifecycle, scheduled, win };
}

(async () => {
  const source = readLifecycleSource();

  // 1. Regression: a container that is not in the document must not consume the
  //    full maxAttempts budget. connectAttempts caps the wait; maxAttempts is
  //    reserved for the "mounted but never settled" case.
  {
    const { lifecycle, scheduled } = harness(source);
    const errors = [];
    lifecycle.start({
      container: { isConnected: false, querySelector: () => null },
      label: "입찰 예정",
      run: () => {
        throw new Error("run must not execute for a detached container");
      },
      onError: (error) => errors.push(error),
      maxAttempts: 1000,
      connectAttempts: 3,
      interval: 1
    });
    assert.equal(
      scheduled.length,
      2,
      "a detached container must be abandoned after connectAttempts, not after maxAttempts"
    );
    assert.equal(errors.length, 1, "abandoning a detached container must report exactly one failure");
    assert.match(
      String(errors[0] && errors[0].message),
      /Auction section container did not connect/,
      "the detached-container failure reason must stay unchanged"
    );
  }

  // 2. The transient case still works: a container that is connected runs
  //    immediately and a satisfied section finishes without further polling.
  {
    const { lifecycle, scheduled } = harness(source);
    let runs = 0;
    let settled = null;
    const connected = { isConnected: true, ownerDocument: null, querySelector: () => null, createEl: fakeElement };
    settled = lifecycle.start({
      container: connected,
      label: "관심",
      run: () => {
        runs += 1;
        return true;
      },
      onError: () => {
        throw new Error("a connected, satisfied section must not fail");
      },
      connectAttempts: 3,
      interval: 1
    });
    assert.equal(runs, 1, "a connected section runs exactly once");
    assert.equal(scheduled.length, 0, "a satisfied section must not schedule a retry");
    assert.equal(settled && settled.dispose && typeof settled.dispose, "function");
  }

  // 3. maxAttempts still governs the other branch: a connected container whose
  //    render never settles must still be retried and must still fail with the
  //    "did not settle" reason rather than the detached-container reason.
  {
    const { lifecycle, scheduled } = harness(source);
    const errors = [];
    lifecycle.start({
      container: { isConnected: true, ownerDocument: null, querySelector: () => null, createEl: fakeElement },
      label: "달력",
      run: () => false,
      onError: (error) => errors.push(error),
      maxAttempts: 4,
      connectAttempts: 10,
      interval: 1
    });
    assert.equal(scheduled.length, 3, "an unsettled connected section retries up to maxAttempts");
    assert.equal(errors.length, 1, "an unsettled connected section reports exactly one failure");
    assert.match(
      String(errors[0] && errors[0].message),
      /Auction section render did not settle/,
      "the unsettled-render failure reason must stay unchanged"
    );
  }

  // 4. When the native renderer owns the note, a detached legacy block must
  //    stand down at once: no wait, no failure. A recorded failure would keep the
  //    workspace navigation request pinned in the "error" state forever, because
  //    acknowledgeNavigation() only settles once renderFailures is empty.
  {
    const { lifecycle, scheduled, win } = harness(source);
    win.__prodigyAuctionPrimarySectionsManaged = true;
    const errors = [];
    let runs = 0;
    lifecycle.start({
      container: { isConnected: false, querySelector: () => null },
      label: "달력",
      run: () => {
        runs += 1;
        return true;
      },
      onError: (error) => errors.push(error),
      maxAttempts: 1000,
      connectAttempts: 10,
      interval: 1
    });
    assert.equal(scheduled.length, 0, "a managed legacy section must not schedule any retry");
    assert.equal(runs, 0, "a managed legacy section must not run its fallback renderer");
    assert.deepEqual(errors, [], "a managed legacy section must not report a failure");
  }

  console.log("auction hub section lifecycle tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
