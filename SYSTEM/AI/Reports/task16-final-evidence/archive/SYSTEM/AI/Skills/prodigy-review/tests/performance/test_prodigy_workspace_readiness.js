"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const readiness = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-readiness.js"));

function state(selector, status = "deterministic", extra = {}) {
  return Object.assign({
    status,
    settled: true,
    enabledAction: readiness.SELECTOR_CONTRACT[selector].action
  }, extra);
}

function testDeterministicStateAndExactAction() {
  const result = readiness.evaluateReadiness("home", state("home"));
  assert.equal(result.ready, true);
  assert.equal(result.available, true);
  assert.equal(result.reasonCode, "READY");
  assert.equal(result.predicateVersion, "readiness.home.v1");
  assert.equal(result.action.actual, "home.open");
}

function testEmptyAndSettledErrorAreObservableStates() {
  for (const status of ["empty", "error"]) {
    const result = readiness.evaluateReadiness("knowledge", state("knowledge", status));
    assert.equal(result.ready, true, `${status} is settled when its exact action is enabled`);
    assert.equal(result.stateKind, status);
  }
  const unsettled = readiness.evaluateReadiness("knowledge", state("knowledge", "error", { settled: false }));
  assert.equal(unsettled.ready, false);
  assert.equal(unsettled.reasonCode, "STATE_NOT_SETTLED");
}

function testTimerCannotSatisfyReadiness() {
  const result = readiness.evaluateReadiness("reading", {
    status: "loading",
    elapsedMs: 0,
    timerReady: true,
    settled: false
  });
  assert.equal(result.ready, false);
  assert.equal(result.reasonCode, "STATE_NOT_SETTLED");
  assert.equal(result.action.exact, false);
}

function testSyncPendingAndUnavailableReasons() {
  const pending = readiness.evaluateReadiness("region", {
    status: "sync-pending",
    settled: false,
    enabledAction: "region.open"
  });
  assert.equal(pending.ready, false);
  assert.equal(pending.reasonCode, "SYNC_PENDING");

  const missing = readiness.evaluateReadiness("inbox", {
    status: "unavailable",
    settled: true,
    enabledAction: "inbox.open"
  });
  assert.equal(missing.ready, false);
  assert.equal(missing.reasonCode, "UNAVAILABLE");
}

function testExactActionIsRequired() {
  const mismatch = readiness.evaluateReadiness("project", state("project", "deterministic", { enabledAction: "project.retry" }));
  assert.equal(mismatch.ready, false);
  assert.equal(mismatch.reasonCode, "ACTION_MISMATCH");

  const disabled = readiness.evaluateReadiness("auction", state("auction", "deterministic", {
    enabledAction: { id: "auction.open", enabled: false }
  }));
  assert.equal(disabled.ready, false);
  assert.equal(disabled.reasonCode, "ACTION_DISABLED");

  const absent = readiness.evaluateReadiness("workout", state("workout", "deterministic", { enabledAction: undefined }));
  assert.equal(absent.ready, false);
  assert.equal(absent.reasonCode, "ACTION_UNAVAILABLE");
}

function testSelectedJournalPeriodsAndSeparateSiteVisit() {
  const weeklyWithoutSelection = readiness.evaluateReadiness("journal.weekly", state("journal.weekly"));
  assert.equal(weeklyWithoutSelection.ready, false);
  assert.equal(weeklyWithoutSelection.reasonCode, "PERIOD_NOT_SELECTED");

  const weekly = readiness.evaluateReadiness("journal.weekly", state("journal.weekly", "empty", { selectedPeriod: "2026-W32" }));
  assert.equal(weekly.ready, true);
  assert.equal(weekly.selectedPeriod, "2026-W32");

  const monthly = readiness.evaluateReadiness("journal.monthly", state("journal.monthly", "deterministic", {
    selectedPeriod: { id: "2026-08", selected: true }
  }));
  assert.equal(monthly.ready, true);

  const auction = readiness.evaluateReadiness("auction", state("auction"));
  const siteVisit = readiness.evaluateReadiness("auction.site_visit", state("auction.site_visit"));
  assert.equal(auction.ready, true);
  assert.equal(siteVisit.ready, true);
  assert.notEqual(auction.selector, siteVisit.selector);
  assert.notEqual(auction.predicateVersion, siteVisit.predicateVersion);
}

function testDeferredSurfacesRequireExplicitActivation() {
  const places = readiness.evaluateReadiness("personal.places", state("personal.places"));
  assert.equal(places.ready, false);
  assert.equal(places.available, false);
  assert.equal(places.deferred, true);
  assert.equal(places.reasonCode, "DEFERRED_SURFACE");

  const activatedPlaces = readiness.evaluateReadiness("personal.places", state("personal.places", "empty", { activated: true }));
  assert.equal(activatedPlaces.ready, true);
  assert.equal(activatedPlaces.available, true);
  assert.equal(activatedPlaces.deferred, true);
  assert.equal(activatedPlaces.activated, true);
  assert.equal(activatedPlaces.reasonCode, "READY");

  for (const selector of ["workout.health", "workout.import"]) {
    const result = readiness.evaluateReadiness(selector, state(selector));
    assert.equal(result.ready, false, selector);
    assert.equal(result.available, false, selector);
    assert.equal(result.deferred, true, selector);
    assert.equal(result.reasonCode, "DEFERRED_SURFACE", selector);
  }
}

function testAllSelectorsAndObservableReader() {
  const source = {};
  readiness.SELECTORS.forEach((selector) => {
    source[selector] = state(selector, "empty", selector.startsWith("journal.") && selector !== "journal.daily" ? { selectedPeriod: "selected" } : {});
  });
  const results = readiness.evaluateWorkspaceReadiness(source);
  assert.deepEqual(Object.keys(results), readiness.SELECTORS);
  assert.equal(results["auction.site_visit"].ready, true);
  assert.equal(results["personal.places"].reasonCode, "DEFERRED_SURFACE");

  let current = state("home");
  const observer = readiness.observe(() => current, "home");
  assert.equal(observer.read().results.home.ready, true);
  current = Object.assign({}, current, { status: "sync-pending", settled: false });
  assert.equal(observer.readSelector("home").reasonCode, "SYNC_PENDING");
}

function main() {
  const tests = [
    ["deterministic state and exact action", testDeterministicStateAndExactAction],
    ["empty and settled error states", testEmptyAndSettledErrorAreObservableStates],
    ["timer cannot satisfy readiness", testTimerCannotSatisfyReadiness],
    ["sync-pending and unavailable reasons", testSyncPendingAndUnavailableReasons],
    ["exact action is required", testExactActionIsRequired],
    ["selected periods and separate site visit", testSelectedJournalPeriodsAndSeparateSiteVisit],
    ["deferred surfaces require explicit activation", testDeferredSurfacesRequireExplicitActivation],
    ["all selectors and observable reader", testAllSelectorsAndObservableReader]
  ];
  let failures = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  console.log(`${tests.length - failures}/${tests.length} workspace readiness checks passed`);
  if (failures) process.exitCode = 1;
}

main();
