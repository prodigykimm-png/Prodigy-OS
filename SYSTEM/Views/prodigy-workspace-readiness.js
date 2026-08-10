(function (root) {
  "use strict";

  var SCHEMA_VERSION = 1;
  var CONTRACT_VERSION = "wave3-workspace-readiness-v1";

  var REASON_CODES = Object.freeze({
    READY: "READY",
    STATE_NOT_SETTLED: "STATE_NOT_SETTLED",
    SYNC_PENDING: "SYNC_PENDING",
    UNAVAILABLE: "UNAVAILABLE",
    DEFERRED_SURFACE: "DEFERRED_SURFACE",
    PERIOD_NOT_SELECTED: "PERIOD_NOT_SELECTED",
    ACTION_UNAVAILABLE: "ACTION_UNAVAILABLE",
    ACTION_DISABLED: "ACTION_DISABLED",
    ACTION_MISMATCH: "ACTION_MISMATCH",
    ACTION_AMBIGUOUS: "ACTION_AMBIGUOUS",
    INVALID_SELECTOR: "INVALID_SELECTOR",
    INVALID_STATE: "INVALID_STATE"
  });

  var SETTLED_STATES = Object.freeze({
    deterministic: "deterministic",
    ready: "deterministic",
    settled: "deterministic",
    success: "deterministic",
    ok: "deterministic",
    empty: "empty",
    no_data: "empty",
    "no-data": "empty",
    error: "error",
    failed: "error",
    failure: "error"
  });

  var SYNC_STATES = Object.freeze({
    "sync-pending": true,
    sync_pending: true,
    syncing: true,
    pending_sync: true,
    awaiting_sync: true,
    "awaiting-sync": true
  });

  var UNAVAILABLE_STATES = Object.freeze({
    unavailable: true,
    missing: true,
    blocked: true,
    deferred: true,
    "not-available": true,
    not_available: true
  });

  /*
   * Action IDs are deliberately part of the contract. A timer, an elapsed
   * duration, or a truthy loading flag cannot satisfy one of these actions.
   */
  var SELECTOR_CONTRACT = Object.freeze({
    home: Object.freeze({ workspace: "home", selector: "home", action: "home.open", predicateVersion: "readiness.home.v1" }),
    knowledge: Object.freeze({ workspace: "knowledge", selector: "knowledge", action: "knowledge.open", predicateVersion: "readiness.knowledge.v1" }),
    "journal.daily": Object.freeze({ workspace: "journal", selector: "journal.daily", action: "journal.daily.open", predicateVersion: "readiness.journal.daily.v1" }),
    "journal.weekly": Object.freeze({ workspace: "journal", selector: "journal.weekly", action: "journal.weekly.open", predicateVersion: "readiness.journal.weekly.v1", requiresSelectedPeriod: true }),
    "journal.monthly": Object.freeze({ workspace: "journal", selector: "journal.monthly", action: "journal.monthly.open", predicateVersion: "readiness.journal.monthly.v1", requiresSelectedPeriod: true }),
    reading: Object.freeze({ workspace: "reading", selector: "reading", action: "reading.open", predicateVersion: "readiness.reading.v1" }),
    "personal.people": Object.freeze({ workspace: "personal", selector: "personal.people", action: "personal.people.open", predicateVersion: "readiness.personal.people.v1" }),
    "personal.places": Object.freeze({ workspace: "personal", selector: "personal.places", action: "personal.places.open", predicateVersion: "readiness.personal.places.v1", deferred: true, deferredReady: true }),
    project: Object.freeze({ workspace: "project", selector: "project", action: "project.open", predicateVersion: "readiness.project.v1" }),
    auction: Object.freeze({ workspace: "auction", selector: "auction", action: "auction.open", predicateVersion: "readiness.auction.v1" }),
    "auction.site_visit": Object.freeze({ workspace: "auction", selector: "auction.site_visit", action: "auction.site_visit.open", predicateVersion: "readiness.auction.site_visit.v1" }),
    workout: Object.freeze({ workspace: "workout", selector: "workout", action: "workout.open", predicateVersion: "readiness.workout.v1" }),
    "workout.health": Object.freeze({ workspace: "workout", selector: "workout.health", action: "workout.health.open", predicateVersion: "readiness.workout.health.v1", deferred: true }),
    "workout.import": Object.freeze({ workspace: "workout", selector: "workout.import", action: "workout.import.open", predicateVersion: "readiness.workout.import.v1", deferred: true }),
    region: Object.freeze({ workspace: "region", selector: "region", action: "region.open", predicateVersion: "readiness.region.v1" }),
    inbox: Object.freeze({ workspace: "inbox", selector: "inbox", action: "inbox.open", predicateVersion: "readiness.inbox.v1" })
  });

  var SELECTORS = Object.freeze(Object.keys(SELECTOR_CONTRACT));
  var PREDICATE_VERSIONS = Object.freeze(SELECTORS.reduce(function (out, selector) {
    out[selector] = SELECTOR_CONTRACT[selector].predicateVersion;
    return out;
  }, {}));

  var SELECTOR_ALIASES = Object.freeze({
    "journal": "journal.daily",
    "daily": "journal.daily",
    "weekly": "journal.weekly",
    "monthly": "journal.monthly",
    "personal": "personal.people",
    "people": "personal.people",
    "places": "personal.places",
    "auction.site-visit": "auction.site_visit",
    "site_visit": "auction.site_visit",
    "site-visit": "auction.site_visit",
    "workout.health-import": "workout.import",
    "health": "workout.health",
    "import": "workout.import"
  });

  function own(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function normalizeSelector(selector) {
    var key = String(selector === undefined || selector === null ? "" : selector)
      .trim()
      .toLowerCase()
      .replace(/\//g, ".")
      .replace(/\s+/g, "_");
    if (own(SELECTOR_CONTRACT, key)) return key;
    return SELECTOR_ALIASES[key] || "";
  }

  function selectorSpec(selector) {
    var key = normalizeSelector(selector);
    return key ? SELECTOR_CONTRACT[key] : null;
  }

  function stateStatus(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return "";
    var value = snapshot.status;
    if (value === undefined) value = snapshot.state;
    if (value === undefined) value = snapshot.lifecycle;
    if (value === undefined) value = snapshot.phase;
    if (value === undefined) value = snapshot.readinessState;
    if (value === undefined) {
      if (snapshot.error === true || snapshot.failed === true
        || (Array.isArray(snapshot.failures) && snapshot.failures.length > 0)
        || (Array.isArray(snapshot.required_failures) && snapshot.required_failures.length > 0)) value = "error";
      else if (snapshot.empty === true) value = "empty";
      else if (snapshot.deterministic === true) value = "deterministic";
    }
    return String(value === undefined || value === null ? "" : value).trim().toLowerCase().replace(/\s+/g, "_");
  }

  function stateResult(snapshot, spec) {
    var status = stateStatus(snapshot);
    var syncPending = !!(snapshot && (snapshot.syncPending === true || snapshot.sync_pending === true));
    if (SYNC_STATES[status] || syncPending) {
      return { ok: false, status: status || "sync-pending", stateKind: "sync-pending", reasonCode: REASON_CODES.SYNC_PENDING };
    }
    if (snapshot && (snapshot.loading === true || snapshot.pending === true || snapshot.settling === true)) {
      return { ok: false, status: status || "pending", stateKind: "pending", reasonCode: REASON_CODES.STATE_NOT_SETTLED };
    }
    if (UNAVAILABLE_STATES[status]) {
      return { ok: false, status: status, stateKind: "unavailable", reasonCode: REASON_CODES.UNAVAILABLE };
    }
    if (!status || !own(SETTLED_STATES, status)) {
      return { ok: false, status: status || "unknown", stateKind: "unknown", reasonCode: REASON_CODES.STATE_NOT_SETTLED };
    }
    if (snapshot.settled === false || snapshot.settled_state === false) {
      return { ok: false, status: status, stateKind: SETTLED_STATES[status], reasonCode: REASON_CODES.STATE_NOT_SETTLED };
    }
    if (snapshot.deterministic === false && SETTLED_STATES[status] === "deterministic") {
      return { ok: false, status: status, stateKind: "non-deterministic", reasonCode: REASON_CODES.STATE_NOT_SETTLED };
    }
    return { ok: true, status: status, stateKind: SETTLED_STATES[status] };
  }

  function actionCandidate(snapshot, expectedAction) {
    if (!snapshot || typeof snapshot !== "object") return { kind: "missing" };
    var candidate;
    var source = "";
    if (own(snapshot, "enabledAction")) {
      candidate = snapshot.enabledAction;
      source = "enabledAction";
    } else if (own(snapshot, "enabled_action")) {
      candidate = snapshot.enabled_action;
      source = "enabled_action";
    } else if (own(snapshot, "exactAction")) {
      candidate = snapshot.exactAction;
      source = "exactAction";
    } else if (own(snapshot, "exact_action")) {
      candidate = snapshot.exact_action;
      source = "exact_action";
    } else if (own(snapshot, "action")) {
      candidate = snapshot.action;
      source = "action";
    } else if (own(snapshot, "primaryAction")) {
      candidate = snapshot.primaryAction;
      source = "primaryAction";
    } else if (own(snapshot, "primary_action")) {
      candidate = snapshot.primary_action;
      source = "primary_action";
    }

    if (candidate !== undefined) return normalizeActionCandidate(candidate, source);

    if (Array.isArray(snapshot.enabledActions)) {
      var matches = snapshot.enabledActions.filter(function (entry) {
        var item = normalizeActionCandidate(entry, "enabledActions");
        return item.id === expectedAction;
      });
      if (matches.length > 1) return { kind: "ambiguous", id: expectedAction, source: "enabledActions" };
      if (matches.length === 1) return matches[0];
      return { kind: "missing", source: "enabledActions" };
    }

    if (snapshot.actions && typeof snapshot.actions === "object" && !Array.isArray(snapshot.actions)) {
      if (own(snapshot.actions, expectedAction)) {
        var enabled = snapshot.actions[expectedAction];
        if (enabled && typeof enabled === "object") return normalizeActionCandidate(enabled, "actions");
        return { kind: enabled === false ? "disabled" : "id", id: expectedAction, enabled: enabled !== false, source: "actions" };
      }
    }
    return { kind: "missing" };
  }

  function normalizeActionCandidate(candidate, source) {
    if (typeof candidate === "string") {
      return { kind: "id", id: candidate, enabled: true, source: source };
    }
    if (!candidate || typeof candidate !== "object") return { kind: "missing", source: source };
    var id = candidate.id;
    if (id === undefined) id = candidate.actionId;
    if (id === undefined) id = candidate.action_id;
    if (id === undefined) id = candidate.name;
    var implicitEnabled = /^(?:enabledAction|enabled_action|enabledActions)$/u.test(String(source || ""));
    return {
      kind: id === undefined || id === null || String(id).trim() === "" ? "missing" : "id",
      id: id === undefined || id === null ? "" : String(id),
      enabled: candidate.disabled !== true && (candidate.enabled === undefined ? implicitEnabled : candidate.enabled === true),
      source: source
    };
  }

  function actionResult(snapshot, expectedAction) {
    var candidate = actionCandidate(snapshot, expectedAction);
    if (candidate.kind === "ambiguous") {
      return { ok: false, enabled: false, actual: candidate.id || "", reasonCode: REASON_CODES.ACTION_AMBIGUOUS };
    }
    if (candidate.kind === "missing" || !candidate.id) {
      return { ok: false, enabled: false, actual: "", reasonCode: REASON_CODES.ACTION_UNAVAILABLE };
    }
    if (!candidate.enabled || (snapshot && (snapshot.actionEnabled === false || snapshot.action_enabled === false))) {
      return { ok: false, enabled: false, actual: candidate.id, reasonCode: REASON_CODES.ACTION_DISABLED };
    }
    if (candidate.id !== expectedAction) {
      return { ok: false, enabled: true, actual: candidate.id, reasonCode: REASON_CODES.ACTION_MISMATCH };
    }
    return { ok: true, enabled: true, actual: candidate.id, reasonCode: REASON_CODES.READY };
  }

  function selectedPeriod(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    var period = snapshot.selectedPeriod;
    if (period === undefined) period = snapshot.selected_period;
    if (period === undefined) period = snapshot.period;
    if (period === undefined) period = snapshot.periodId;
    if (period === undefined) period = snapshot.period_id;
    if (period === undefined) return null;
    if (period === null || period === false || period === "") return null;
    if (typeof period === "object") {
      if (period.selected === false || period.enabled === false) return null;
      var id = period.id;
      if (id === undefined) id = period.key;
      if (id === undefined) id = period.periodId;
      if (id === undefined) id = period.period_id;
      if (id === undefined || id === null || String(id).trim() === "") return null;
      return String(id);
    }
    return String(period);
  }

  function resultFor(spec, snapshot, state, action, selected, reasonCode, extra) {
    var reasons = reasonCode === REASON_CODES.READY ? [] : [reasonCode];
    var result = {
      schemaVersion: SCHEMA_VERSION,
      contractVersion: CONTRACT_VERSION,
      predicateVersion: spec.predicateVersion,
      selector: spec.selector,
      workspace: spec.workspace,
      ready: reasonCode === REASON_CODES.READY,
      available: reasonCode === REASON_CODES.READY,
      status: state.status,
      stateKind: state.stateKind,
      settled: state.ok,
      action: {
        expected: spec.action,
        actual: action.actual || "",
        enabled: !!action.enabled,
        exact: action.ok
      },
      selectedPeriod: selected || null,
      reasonCode: reasonCode,
      reasonCodes: reasons,
      reasons: reasons.slice()
    };
    if (spec.deferred) result.deferred = true;
    if (extra) Object.keys(extra).forEach(function (key) { result[key] = extra[key]; });
    return Object.freeze(result);
  }

  function evaluateReadiness(selector, snapshot, options) {
    var spec = selectorSpec(selector);
    if (!spec) {
      return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        contractVersion: CONTRACT_VERSION,
        predicateVersion: "unknown",
        selector: String(selector === undefined || selector === null ? "" : selector),
        workspace: "",
        ready: false,
        available: false,
        status: "unknown",
        stateKind: "unknown",
        settled: false,
        action: { expected: "", actual: "", enabled: false, exact: false },
        selectedPeriod: null,
        reasonCode: REASON_CODES.INVALID_SELECTOR,
        reasonCodes: [REASON_CODES.INVALID_SELECTOR],
        reasons: [REASON_CODES.INVALID_SELECTOR]
      });
    }
    var input = snapshot && typeof snapshot === "object" ? snapshot : {};
    var opts = options && typeof options === "object" ? options : {};
    var expectedAction = opts.expectedAction === undefined ? spec.action : String(opts.expectedAction);
    var selected = selectedPeriod(input);

    var state = stateResult(input, spec);
    var deferredActivated = spec.deferred && spec.deferredReady === true
      && (opts.activated === true || input.activated === true || input.deferredReady === true);
    if (deferredActivated) {
      if (!state.ok) {
        var activatedUnavailableAction = actionResult(input, expectedAction);
        return resultFor(spec, input, state, activatedUnavailableAction, selected, state.reasonCode, { activated: true });
      }
      var activatedAction = actionResult(input, expectedAction);
      if (!activatedAction.ok) return resultFor(spec, input, state, activatedAction, selected, activatedAction.reasonCode, { activated: true });
      return resultFor(spec, input, state, activatedAction, selected, REASON_CODES.READY, { deferred: true, activated: true });
    }
    if (spec.deferred) {
      var deferredAction = actionResult(input, expectedAction);
      var deferredReasons = [REASON_CODES.DEFERRED_SURFACE];
      if (!state.ok && state.reasonCode !== REASON_CODES.DEFERRED_SURFACE) deferredReasons.unshift(state.reasonCode);
      return resultFor(spec, input, state, deferredAction, selected, REASON_CODES.DEFERRED_SURFACE, {
        available: false,
        ready: false,
        reasonCodes: deferredReasons,
        reasons: deferredReasons.slice()
      });
    }
    if (!state.ok) {
      var unavailableAction = actionResult(input, expectedAction);
      return resultFor(spec, input, state, unavailableAction, selected, state.reasonCode);
    }
    if (spec.requiresSelectedPeriod && !selected) {
      var periodAction = actionResult(input, expectedAction);
      return resultFor(spec, input, state, periodAction, null, REASON_CODES.PERIOD_NOT_SELECTED);
    }
    var action = actionResult(input, expectedAction);
    if (!action.ok) return resultFor(spec, input, state, action, selected, action.reasonCode);
    return resultFor(spec, input, state, action, selected, REASON_CODES.READY);
  }

  function snapshotForSelector(source, selector) {
    if (!source || typeof source !== "object") return {};
    if (own(source, "status") || own(source, "state") || own(source, "lifecycle")
      || own(source, "phase") || own(source, "readinessState")
      || own(source, "enabledAction") || own(source, "enabled_action")
      || own(source, "action") || own(source, "exactAction") || own(source, "exact_action")) {
      return source;
    }
    if (own(source, selector)) return source[selector];
    var spec = selectorSpec(selector);
    if (spec && own(source, spec.workspace)) {
      var workspace = source[spec.workspace];
      if (workspace && typeof workspace === "object") {
        if (own(workspace, selector)) return workspace[selector];
        var suffix = selector.indexOf(spec.workspace + ".") === 0 ? selector.slice(spec.workspace.length + 1) : "";
        if (suffix && own(workspace, suffix)) return workspace[suffix];
        if (selector === spec.workspace) return workspace;
      }
    }
    return {};
  }

  function evaluateAll(source, options) {
    var opts = options && typeof options === "object" ? options : {};
    var selectors = Array.isArray(opts.selectors) && opts.selectors.length
      ? opts.selectors.map(normalizeSelector).filter(Boolean)
      : SELECTORS.slice();
    var results = {};
    selectors.forEach(function (selector) {
      results[selector] = evaluateReadiness(selector, snapshotForSelector(source, selector), opts);
    });
    return Object.freeze(results);
  }

  function summarize(source, options) {
    var results = evaluateAll(source, options);
    var ready = [];
    var blocked = [];
    Object.keys(results).forEach(function (selector) {
      if (results[selector].ready) ready.push(selector);
      else blocked.push(selector);
    });
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      contractVersion: CONTRACT_VERSION,
      results: results,
      readySelectors: Object.freeze(ready),
      blockedSelectors: Object.freeze(blocked),
      physicalMobileClaim: "not_proven"
    });
  }

  function createPredicate(selector, options) {
    var key = normalizeSelector(selector);
    var opts = options && typeof options === "object" ? Object.assign({}, options) : {};
    return function readinessPredicate(snapshot) {
      return evaluateReadiness(key, snapshot, opts);
    };
  }

  function observe(getSnapshot, selectors, options) {
    var getter = typeof getSnapshot === "function" ? getSnapshot : function () { return getSnapshot || {}; };
    var opts = Object.assign({}, options || {});
    if (selectors) opts.selectors = Array.isArray(selectors) ? selectors : [selectors];
    return Object.freeze({
      read: function () { return summarize(getter(), opts); },
      readSelector: function (selector) { return evaluateReadiness(selector, getter(), opts); }
    });
  }

  function renderReadiness(container, result) {
    if (!container || typeof container.createEl !== "function") return null;
    var item = container.createEl("div", { cls: "prodigy-readiness" });
    if (typeof item.setAttribute === "function") {
      item.setAttribute("data-readiness-selector", result && result.selector ? result.selector : "");
      item.setAttribute("data-readiness", result && result.ready ? "ready" : "blocked");
      item.setAttribute("aria-live", "polite");
    }
    item.textContent = result && result.ready ? "준비됨" : "준비되지 않음";
    return item;
  }

  function isReady(selector, snapshot, options) {
    return evaluateReadiness(selector, snapshot, options).ready;
  }
  var api = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_VERSION: CONTRACT_VERSION,
    REASON_CODES: REASON_CODES,
    SETTLED_STATES: SETTLED_STATES,
    SELECTORS: SELECTORS,
    SELECTOR_CONTRACT: SELECTOR_CONTRACT,
    PREDICATE_VERSIONS: PREDICATE_VERSIONS,
    normalizeSelector: normalizeSelector,
    selectorSpec: selectorSpec,
    evaluateReadiness: evaluateReadiness,
    isReady: isReady,
    evaluate: evaluateReadiness,
    readinessFor: evaluateReadiness,
    evaluateAll: evaluateAll,
    evaluateWorkspaceReadiness: evaluateAll,
    readinessPredicate: createPredicate,
    createReadinessPredicate: createPredicate,
    summarize: summarize,
    buildReadinessReceipt: summarize,
    readinessReceipt: summarize,
    createPredicate: createPredicate,
    observe: observe,
    renderReadiness: renderReadiness
  });

  root.ProdigyWorkspaceReadiness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
