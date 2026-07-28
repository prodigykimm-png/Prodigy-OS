/**
 * prodigy-region-startup.js
 *
 * Region Intelligence startup activation script.
 *
 * Exact path: SYSTEM/Views/prodigy-region-startup.js
 * Registered once through the JS Engine plugin startupScripts list.
 *
 * Activation uses:
 *   SYSTEM/CACHE/region-startup-activation/activation-state.json   (mutable)
 *   SYSTEM/CACHE/region-startup-activation/activation-receipt.json (immutable)
 *
 * Stages: prepared -> settings_verified -> complete
 * Decline leaves activation_required and keeps manual collection available.
 * Recovery uses resume_confirmation_required | blocked_manual and never
 * silently edits JS Engine settings.
 *
 * This script does NOT run collection from hub render and does NOT claim
 * exact-time background operation. It only triggers due-work evaluation on
 * Obsidian start / focus-resume / manual action, after explicit activation.
 *
 * CommonJS/IIFE compatible.
 */
(function (root) {
  "use strict";

  const ACTIVATION_STATE_PATH = "SYSTEM/CACHE/region-startup-activation/activation-state.json";
  const ACTIVATION_RECEIPT_PATH = "SYSTEM/CACHE/region-startup-activation/activation-receipt.json";

  const STAGE = Object.freeze({
    ACTIVATION_REQUIRED: "activation_required",
    PREPARED: "prepared",
    SETTINGS_VERIFIED: "settings_verified",
    COMPLETE: "complete",
    DECLINED: "declined",
    RESUME_CONFIRMATION_REQUIRED: "resume_confirmation_required",
    BLOCKED_MANUAL: "blocked_manual"
  });

  // Guard: one startup path / listener / request per renderer process.
  const STARTUP_GUARD_KEY = "__prodigyRegionStartupRegistered";

  // ---------------------------------------------------------------------------
  // Pure activation state machine
  // ---------------------------------------------------------------------------

  function initialActivationState(nowMs) {
    return {
      stage: STAGE.ACTIVATION_REQUIRED,
      created_at: new Date(nowMs || Date.now()).toISOString(),
      updated_at: new Date(nowMs || Date.now()).toISOString(),
      manual_collection_available: true
    };
  }

  /**
   * Advance the mutable activation state. Returns the next state or throws on
   * an illegal transition. Receipt-worthy transitions are flagged.
   */
  function advanceActivation(state, toStage, nowMs) {
    const now = new Date(nowMs || Date.now()).toISOString();
    const from = state.stage;
    const allowed = {
      activation_required: ["prepared", "declined"],
      prepared: ["settings_verified", "declined"],
      settings_verified: ["complete", "declined"],
      declined: ["prepared"],
      resume_confirmation_required: ["prepared", "declined"],
      blocked_manual: ["prepared"],
      complete: []
    };
    if (!(allowed[from] || []).includes(toStage)) {
      throw new Error(`Illegal activation transition: ${from} -> ${toStage}`);
    }
    const next = Object.assign({}, state, { stage: toStage, updated_at: now });
    // Decline always preserves manual collection availability.
    if (toStage === STAGE.DECLINED) next.manual_collection_available = true;
    return next;
  }

  /**
   * Build the immutable activation receipt. Written once at complete; never
   * mutated afterward.
   */
  function buildActivationReceipt(state, processNonce, nowMs) {
    return {
      stage: STAGE.COMPLETE,
      completed_at: new Date(nowMs || Date.now()).toISOString(),
      process_nonce: processNonce,
      activation_state_hash_input: `${state.stage}|${state.updated_at}`,
      manual_collection_available: true,
      schema_version: 1
    };
  }

  /**
   * Decide the recovery stage observed at a startup/resume when a prior
   * incomplete activation is present.
   */
  function decideActivationRecovery(state, nowMs) {
    if (!state) return STAGE.ACTIVATION_REQUIRED;
    switch (state.stage) {
      case STAGE.COMPLETE:
        return STAGE.COMPLETE;
      case STAGE.DECLINED:
        return STAGE.DECLINED;
      case STAGE.PREPARED:
      case STAGE.SETTINGS_VERIFIED:
        // Interrupted mid-activation: require explicit resume confirmation.
        return STAGE.RESUME_CONFIRMATION_REQUIRED;
      case STAGE.ACTIVATION_REQUIRED:
        return STAGE.ACTIVATION_REQUIRED;
      default:
        return STAGE.BLOCKED_MANUAL;
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime wiring (Obsidian only)
  // ---------------------------------------------------------------------------

  function resolveService(name) {
    if (root[name]) return root[name];
    if (typeof require === "function") {
      try {
        if (name === "RegionCollectorService") return require("./region-collector-service.js");
        if (name === "RegionCollectorScheduler") return require("./region-collector-scheduler.js");
        if (name === "ProdigyConfigService") return require("./prodigy-config-service.js");
      } catch (_e) { /* ignore */ }
    }
    return null;
  }

  async function readJSON(app, path) {
    if (!app || !app.vault) return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    try { return JSON.parse(await app.vault.read(file)); } catch (_e) { return null; }
  }

  async function writeJSON(app, path, value) {
    if (!app || !app.vault) throw new Error("Vault access is not available.");
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!app.vault.getAbstractFileByPath(dir) && typeof app.vault.createFolder === "function") {
        try { await app.vault.createFolder(dir); } catch (_e) { /* ignore */ }
      }
    }
    const file = app.vault.getAbstractFileByPath(path);
    const text = JSON.stringify(value, null, 2) + "\n";
    if (file) await app.vault.modify(file, text);
    else await app.vault.create(path, text);
  }

  /**
   * Load the registry JSON from the Vault (Todo 1 artifact).
   */
  async function loadRegistry(app) {
    const reg = await readJSON(app, "SYSTEM/SCRIPTS/region-source-registry.json");
    return reg && Array.isArray(reg.providers) ? reg : { providers: [] };
  }

  /**
   * Register the startup activation flow. Idempotent per renderer process.
   * Returns a handle with the activation API and a disposer.
   */
  function register(app, options) {
    options = options || {};
    if (root[STARTUP_GUARD_KEY]) {
      return root[STARTUP_GUARD_KEY];
    }

    let disposed = false;
    const listeners = [];

    async function getState() {
      const state = await readJSON(app, ACTIVATION_STATE_PATH);
      return state || initialActivationState();
    }

    async function persistState(state) {
      await writeJSON(app, ACTIVATION_STATE_PATH, state);
    }

    /**
     * Run the activation handshake: prepared -> settings_verified -> complete.
     * verifySettings is an injectable async () => boolean (default checks that
     * the config service loads). On success writes the immutable receipt.
     */
    async function activate(verifySettings) {
      let state = await getState();
      if (state.stage === STAGE.COMPLETE) return { stage: STAGE.COMPLETE, already: true };
      if (state.stage === STAGE.ACTIVATION_REQUIRED ||
          state.stage === STAGE.RESUME_CONFIRMATION_REQUIRED ||
          state.stage === STAGE.BLOCKED_MANUAL ||
          state.stage === STAGE.DECLINED) {
        state = advanceActivation(state, STAGE.PREPARED);
        await persistState(state);
      }
      const verify = verifySettings || defaultVerifySettings;
      const ok = await verify();
      if (!ok) {
        return { stage: state.stage, verified: false };
      }
      state = advanceActivation(state, STAGE.SETTINGS_VERIFIED);
      await persistState(state);
      state = advanceActivation(state, STAGE.COMPLETE);
      await persistState(state);
      const nonce = root.__prodigyRegionProcessNonce || "";
      const receipt = buildActivationReceipt(state, nonce);
      // Immutable receipt: write once, never overwrite an existing receipt.
      const existingReceipt = await readJSON(app, ACTIVATION_RECEIPT_PATH);
      if (!existingReceipt) await writeJSON(app, ACTIVATION_RECEIPT_PATH, receipt);
      return { stage: STAGE.COMPLETE, receipt };
    }

    async function defaultVerifySettings() {
      const svc = resolveService("ProdigyConfigService");
      if (!svc || typeof svc.load !== "function") return true;
      try { await svc.load(app); return true; } catch (_e) { return false; }
    }

    /**
     * Decline activation. Leaves activation_required semantics and keeps manual
     * collection available.
     */
    async function decline() {
      let state = await getState();
      if (state.stage === STAGE.COMPLETE) return { stage: STAGE.COMPLETE };
      state = advanceActivation(state, STAGE.DECLINED);
      await persistState(state);
      return { stage: STAGE.DECLINED, manual_collection_available: true };
    }

    /**
     * Evaluate and dispatch due work. Requires an activated (complete) state OR
     * an explicit manual action. Never runs from hub render.
     */
    async function runDueWork(registryOverride) {
      const state = await getState();
      const registry = registryOverride || await loadRegistry(app);
      const service = resolveService("RegionCollectorService");
      if (!service) return { dispatched: [], reason: "service_unavailable" };
      const collector = service.getCollector(app, registry);
      // Recovery sweep first (expired/abandoned/unknown-inflight handling).
      await collector.recover();
      if (state.stage !== STAGE.COMPLETE) {
        // Manual collection remains available even when declined.
        return { dispatched: [], stage: state.stage, manual_only: true };
      }
      const providerStates = registry.providers.map((p) => ({
        provider_id: p.provider_id,
        cadence: p.cadence,
        status: p.status,
        fetched_at: null
      }));
      return collector.collectDue(providerStates);
    }

    /**
     * Manual 지금 수집 for a single provider. Available regardless of activation
     * stage (decline keeps manual collection available).
     */
    async function collectNow(providerId, registryOverride) {
      const registry = registryOverride || await loadRegistry(app);
      const service = resolveService("RegionCollectorService");
      if (!service) return { status: "service_unavailable" };
      const collector = service.getCollector(app, registry);
      return collector.collectManual(providerId);
    }

    function onWorkspaceResume(callback) {
      if (!app || !app.workspace || typeof app.workspace.on !== "function") return () => {};
      const ref = app.workspace.on("active-leaf-change", () => { if (!disposed) callback(); });
      listeners.push(ref);
      return () => { try { app.workspace.offref(ref); } catch (_e) { /* ignore */ } };
    }

    const handle = {
      getState,
      activate,
      decline,
      runDueWork,
      collectNow,
      onWorkspaceResume,
      decideActivationRecovery: (state) => decideActivationRecovery(state),
      dispose() {
        disposed = true;
        listeners.forEach((ref) => { try { app.workspace.offref(ref); } catch (_e) { /* ignore */ } });
        if (root[STARTUP_GUARD_KEY] === handle) delete root[STARTUP_GUARD_KEY];
      }
    };

    root[STARTUP_GUARD_KEY] = handle;
    return handle;
  }

  // ---------------------------------------------------------------------------
  // Auto-registration when running inside Obsidian with a global app
  // ---------------------------------------------------------------------------

  function autoRegister() {
    if (typeof root.app === "undefined" || !root.app) return null;
    if (root[STARTUP_GUARD_KEY]) return root[STARTUP_GUARD_KEY];
    const handle = register(root.app);
    // Evaluate due work once on load (not from hub render), then on resume.
    Promise.resolve().then(() => handle.runDueWork().catch(() => {}));
    handle.onWorkspaceResume(() => { handle.runDueWork().catch(() => {}); });
    return handle;
  }

  // Only auto-register in a browser/Obsidian context, never under Node tests.
  if (typeof window !== "undefined" && typeof root.app !== "undefined") {
    try { autoRegister(); } catch (_e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  const api = {
    ACTIVATION_STATE_PATH,
    ACTIVATION_RECEIPT_PATH,
    STAGE,
    STARTUP_GUARD_KEY,
    initialActivationState,
    advanceActivation,
    buildActivationReceipt,
    decideActivationRecovery,
    register,
    autoRegister
  };

  root.ProdigyRegionStartup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
