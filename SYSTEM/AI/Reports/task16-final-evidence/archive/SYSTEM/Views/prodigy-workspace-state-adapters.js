(function (root) {
  "use strict";

  if (root.ProdigyWorkspaceStateAdapters) {
    if (typeof module !== "undefined" && module.exports) module.exports = root.ProdigyWorkspaceStateAdapters;
    return;
  }

  const ALLOWED_WORKSPACES = Object.freeze(["home", "auction"]);
  const ALLOWED_STATES = Object.freeze(["normal", "empty", "loading", "error", "selected", "disabled"]);
  const registrations = new Map();
  const adapterBrand = new WeakSet();
  const claimBrand = new WeakSet();

  function fail(message) { throw new TypeError("Workspace state adapter: " + message); }
  function assertWorkspace(workspaceId) {
    const id = String(workspaceId || "");
    if (ALLOWED_WORKSPACES.indexOf(id) === -1) fail("unsupported workspaceId");
    return id;
  }
  function deepFreeze(value, seen) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    const visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }
  function clone(value) {
    if (!value || typeof value !== "object") return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function createAdapter(options) {
    const opts = options || {};
    const workspaceId = assertWorkspace(opts.workspaceId);
    const generation = Number(opts.generation);
    if (!Number.isSafeInteger(generation) || generation < 1) fail("generation must be a positive integer");
    let disposed = false;
    let claimed = false;
    let sequence = 0;
    const subscribers = new Set();
    const seenNonces = new Set();
    let current = null;

    function assertActive() { if (disposed) fail("adapter is disposed"); }
    function prepare(input) {
      assertActive();
      const fixture = clone(input || {});
      if (fixture.workspaceId !== workspaceId) fail("fixture workspaceId does not match adapter");
      if (fixture.generation !== generation) fail("fixture generation is stale");
      if (ALLOWED_STATES.indexOf(fixture.state) === -1) fail("unsupported fixture state");
      if (typeof fixture.nonce !== "string" || !fixture.nonce) fail("fixture nonce is required");
      if (seenNonces.has(fixture.nonce)) fail("fixture nonce is stale or duplicate");
      seenNonces.add(fixture.nonce);
      return deepFreeze(fixture);
    }
    function publish(input) {
      const fixture = prepare(input);
      current = fixture;
      Array.from(subscribers).forEach(function (subscriber) { subscriber(fixture); });
      return fixture;
    }
    function nextNonce(prefix) {
      sequence += 1;
      return String(prefix || "state") + ":" + generation + ":" + sequence;
    }
    const initial = prepare({
      workspaceId,
      generation,
      nonce: typeof opts.nonce === "string" && opts.nonce ? opts.nonce : nextNonce("mount"),
      state: "normal"
    });
    current = initial;

    const adapter = {
      workspaceId,
      generation,
      transition: publish,
      reset: function (input) {
        assertActive();
        const reset = input || {};
        return publish({
          workspaceId,
          generation,
          nonce: typeof reset.nonce === "string" && reset.nonce ? reset.nonce : nextNonce("reset"),
          state: "normal"
        });
      },
      subscribe: function (subscriber) {
        assertActive();
        if (typeof subscriber !== "function") fail("subscriber must be a function");
        subscribers.add(subscriber);
        let active = true;
        return function () { if (!active) return false; active = false; return subscribers.delete(subscriber); };
      },
      current: function () { assertActive(); return current; },
      stats: function () { return Object.freeze({ subscribers: subscribers.size, claimed, disposed }); }
    };
    Object.defineProperties(adapter, {
      __claim: { value: function () { assertActive(); if (claimed) fail("adapter was already claimed"); claimed = true; } },
      __dispose: { value: function () { if (disposed) return false; disposed = true; subscribers.clear(); return true; } }
    });
    adapterBrand.add(adapter);
    return Object.freeze(adapter);
  }

  function register(workspaceId, adapter) {
    const id = assertWorkspace(workspaceId);
    if (!adapterBrand.has(adapter) || adapter.workspaceId !== id) fail("an exact created adapter is required");
    if (registrations.has(id)) fail("duplicate adapter registration");
    registrations.set(id, adapter);
    return Object.freeze({
      workspaceId: id,
      unregister: function () {
        if (registrations.get(id) !== adapter) return false;
        registrations.delete(id);
        return true;
      }
    });
  }

  function claim(workspaceId) {
    const id = assertWorkspace(workspaceId);
    const adapter = registrations.get(id);
    if (!adapter) return null;
    adapter.__claim();
    registrations.delete(id);
    const claim = Object.freeze({ workspaceId: id, adapter });
    claimBrand.add(claim);
    return claim;
  }

  function createController(options) {
    const opts = options || {};
    const workspaceId = assertWorkspace(opts.workspaceId);
    const claim = opts.claim;
    const body = opts.body;
    if (!claimBrand.has(claim) || claim.workspaceId !== workspaceId || claim.adapter.workspaceId !== workspaceId) fail("wrong workspace or unclaimed adapter");
    if (!body || typeof body.createEl !== "function") fail("shell body is required");
    const ui = root.ProdigyUI;
    if (!ui || typeof ui.button !== "function" || typeof ui.StatusLine !== "function" || typeof ui.InlineError !== "function") fail("production shared state components are required");
    const adapter = claim.adapter;
    const subscribers = new Set();
    let owner = null;
    let disposed = false;
    let settled = null;
    let ownerObserver = null;

    function assertActive() { if (disposed) fail("controller is disposed"); }
    function findBody() {
      const documentRef = body.ownerDocument;
      if (!documentRef || typeof documentRef.querySelector !== "function") return body;
      return documentRef.querySelector('.prodigy-app-shell[data-workspace-id="' + workspaceId + '"] .prodigy-app-shell-body');
    }
    function currentBody() { return findBody() || body; }
    function own(element, fixture) {
      element.setAttribute("data-prodigy-state-owner", workspaceId);
      element.setAttribute("data-prodigy-state-generation", String(fixture.generation));
      element.setAttribute("data-prodigy-state-nonce", fixture.nonce);
      return element;
    }
    function render(fixture) {
      assertActive();
      let next;
      const target = currentBody();
      const documentRef = body.ownerDocument;
      const restoreFocus = !!(owner && documentRef && owner.contains && owner.contains(documentRef.activeElement));
      if (fixture.state === "error") {
        const recoveryNonce = fixture.recovery && fixture.recovery.nonce || fixture.nonce + ":retry";
        next = ui.InlineError(target, {
          message: fixture.error && fixture.error.message || "문제가 발생했습니다.",
          retryLabel: "다시 시도",
          onRetry: function () { return adapter.reset({ nonce: recoveryNonce }); }
        });
        if (next.classList && typeof next.classList.add === "function") next.classList.add("prodigy-required-recovery");
        else next.setAttribute("class", ((next.getAttribute && next.getAttribute("class")) || "") + " prodigy-required-recovery");
      } else if (fixture.state === "selected") {
        next = ui.button(target, fixture.selection && fixture.selection.label || "선택됨", { selected: true, state: "selected", onClick: function () {} });
        next.setAttribute("aria-selected", "true");
      } else if (fixture.state === "disabled") {
        next = ui.button(target, fixture.disabled && fixture.disabled.reason || "사용 불가", { disabled: true, state: "disabled" });
        next.setAttribute("aria-disabled", "true");
        next.disabled = true;
      } else {
        const state = fixture.state === "normal" ? "success" : fixture.state;
        next = ui.StatusLine(target, {
          text: fixture.message || (fixture.state === "normal" ? "정상" : fixture.state === "empty" ? "표시할 항목이 없습니다." : "불러오는 중"),
          state,
          busy: fixture.state === "loading"
        });
      }
      own(next, fixture);
      if (target.firstElementChild !== next && typeof target.insertBefore === "function") target.insertBefore(next, target.firstElementChild);
      if (owner && owner !== next) {
        if (typeof owner.remove === "function") owner.remove();
        else if (owner.parentElement && typeof owner.parentElement.removeChild === "function") owner.parentElement.removeChild(owner);
      }
      owner = next;
      settled = fixture;
      const detail = deepFreeze({ workspaceId, state: fixture.state, nonce: fixture.nonce, generation: fixture.generation, fixture });
      const view = body.ownerDocument && body.ownerDocument.defaultView || root;
      const EventConstructor = view && view.CustomEvent || root.CustomEvent;
      if (typeof next.dispatchEvent === "function" && typeof EventConstructor === "function") {
        next.dispatchEvent(new EventConstructor("prodigy-workspace-state-settled", { detail, bubbles: true }));
      }
      if (restoreFocus && typeof next.focus === "function") {
        next.setAttribute("tabindex", "-1");
        next.focus({ preventScroll: true });
      }
      Array.from(subscribers).forEach(function (subscriber) { subscriber(detail); });
      return fixture;
    }

    const unsubscribeAdapter = adapter.subscribe(render);
    render(adapter.current());
    function disposeController() {
      if (disposed) return false;
      disposed = true;
      unsubscribeAdapter();
      subscribers.clear();
      if (ownerObserver) { ownerObserver.disconnect(); ownerObserver = null; }
      adapter.__dispose();
      if (owner && typeof owner.remove === "function") owner.remove();
      owner = null;
      return true;
    }
    const documentRef = body.ownerDocument;
    const view = documentRef && documentRef.defaultView || root;
    const Observer = view && view.MutationObserver;
    if (typeof Observer === "function") {
      ownerObserver = new Observer(function () {
        const target = findBody();
        if (disposed) return;
        if (!target || target.isConnected === false) { disposeController(); return; }
        if (!owner || owner.parentElement === target || typeof target.appendChild !== "function") return;
        target.appendChild(owner);
      });
      try { ownerObserver.observe(documentRef && documentRef.documentElement || body, { childList: true, subtree: true }); }
      catch (_error) { ownerObserver = null; }
    }
    const controller = {
      transition: function (fixture) { assertActive(); return adapter.transition(fixture); },
      reset: function (input) { assertActive(); return adapter.reset(input); },
      subscribe: function (subscriber) {
        assertActive();
        if (typeof subscriber !== "function") fail("subscriber must be a function");
        subscribers.add(subscriber);
        let active = true;
        return function () { if (!active) return false; active = false; return subscribers.delete(subscriber); };
      },
      current: function () { assertActive(); return settled; },
      dispose: disposeController,
      stats: function () { return Object.freeze({ subscribers: subscribers.size, owners: owner ? 1 : 0, disposed }); }
    };
    return Object.freeze(controller);
  }

  const api = Object.freeze({ createAdapter, register, claim, createController, workspaces: ALLOWED_WORKSPACES, states: ALLOWED_STATES });
  root.ProdigyWorkspaceStateAdapters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
