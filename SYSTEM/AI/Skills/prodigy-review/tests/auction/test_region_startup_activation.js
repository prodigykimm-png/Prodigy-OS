/**
 * test_region_startup_activation.js
 *
 * Validates the Region Intelligence startup activation contract:
 * - activation stages prepared -> settings_verified -> complete
 * - decline leaves activation_required semantics + manual-only collection
 * - recovery states (resume_confirmation_required, blocked_manual)
 * - immutable activation receipt written once
 * - one startup path / listener guard
 *
 * node:test suite. CommonJS. Offline.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const VAULT_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const startup = require(path.join(VAULT_ROOT, "SYSTEM", "Views", "prodigy-region-startup.js"));

function makeMemApp() {
  const files = {};
  return {
    files,
    vault: {
      getAbstractFileByPath: (p) => (p in files ? { path: p } : null),
      read: async (f) => files[f.path],
      modify: async (f, text) => { files[f.path] = text; },
      create: async (p, text) => { files[p] = text; },
      createFolder: async () => {}
    },
    workspace: {
      on: () => ({}),
      offref: () => {}
    }
  };
}

function readJSON(files, p) {
  return p in files ? JSON.parse(files[p]) : null;
}

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

describe("Startup activation state machine", () => {
  it("starts at activation_required with manual collection available", () => {
    const state = startup.initialActivationState(1700000000000);
    assert.equal(state.stage, "activation_required");
    assert.equal(state.manual_collection_available, true);
  });

  it("advances prepared -> settings_verified -> complete", () => {
    let state = startup.initialActivationState(1700000000000);
    state = startup.advanceActivation(state, "prepared", 1700000001000);
    assert.equal(state.stage, "prepared");
    state = startup.advanceActivation(state, "settings_verified", 1700000002000);
    assert.equal(state.stage, "settings_verified");
    state = startup.advanceActivation(state, "complete", 1700000003000);
    assert.equal(state.stage, "complete");
  });

  it("rejects illegal transitions", () => {
    const state = startup.initialActivationState(1700000000000);
    assert.throws(() => startup.advanceActivation(state, "complete", 1700000001000));
    assert.throws(() => startup.advanceActivation(state, "settings_verified", 1700000001000));
  });

  it("decline keeps manual collection available", () => {
    let state = startup.initialActivationState(1700000000000);
    state = startup.advanceActivation(state, "declined", 1700000001000);
    assert.equal(state.stage, "declined");
    assert.equal(state.manual_collection_available, true);
  });

  it("builds an immutable complete receipt", () => {
    const state = { stage: "complete", updated_at: "2026-07-29T00:00:00.000Z" };
    const receipt = startup.buildActivationReceipt(state, "nonce-1", 1700000000000);
    assert.equal(receipt.stage, "complete");
    assert.equal(receipt.process_nonce, "nonce-1");
    assert.equal(receipt.manual_collection_available, true);
    assert.equal(receipt.schema_version, 1);
  });
});

// ---------------------------------------------------------------------------
// Recovery decisions
// ---------------------------------------------------------------------------

describe("Startup activation recovery", () => {
  it("no prior state → activation_required", () => {
    assert.equal(startup.decideActivationRecovery(null), "activation_required");
  });

  it("complete stays complete", () => {
    assert.equal(startup.decideActivationRecovery({ stage: "complete" }), "complete");
  });

  it("declined stays declined", () => {
    assert.equal(startup.decideActivationRecovery({ stage: "declined" }), "declined");
  });

  it("interrupted prepared → resume_confirmation_required", () => {
    assert.equal(startup.decideActivationRecovery({ stage: "prepared" }), "resume_confirmation_required");
    assert.equal(startup.decideActivationRecovery({ stage: "settings_verified" }), "resume_confirmation_required");
  });

  it("unknown stage → blocked_manual", () => {
    assert.equal(startup.decideActivationRecovery({ stage: "corrupted_garbage" }), "blocked_manual");
  });
});

// ---------------------------------------------------------------------------
// Runtime activation flow (in-memory Vault)
// ---------------------------------------------------------------------------

describe("Startup activation runtime flow", () => {
  it("activates through all stages and writes an immutable receipt once", async () => {
    const app = makeMemApp();
    const handle = startup.register(app);
    try {
      const result = await handle.activate(async () => true);
      assert.equal(result.stage, "complete");
      const state = readJSON(app.files, startup.ACTIVATION_STATE_PATH);
      assert.equal(state.stage, "complete");
      const receipt = readJSON(app.files, startup.ACTIVATION_RECEIPT_PATH);
      assert.equal(receipt.stage, "complete");
      // Capture receipt bytes, re-activate, and confirm receipt is unchanged.
      const receiptBytesBefore = app.files[startup.ACTIVATION_RECEIPT_PATH];
      await handle.activate(async () => true);
      assert.equal(app.files[startup.ACTIVATION_RECEIPT_PATH], receiptBytesBefore, "receipt must be immutable");
    } finally {
      handle.dispose();
    }
  });

  it("failed settings verification stops before complete", async () => {
    const app = makeMemApp();
    const handle = startup.register(app);
    try {
      const result = await handle.activate(async () => false);
      assert.equal(result.verified, false);
      const state = readJSON(app.files, startup.ACTIVATION_STATE_PATH);
      assert.equal(state.stage, "prepared");
      assert.equal(startup.ACTIVATION_RECEIPT_PATH in app.files, false, "no receipt before complete");
    } finally {
      handle.dispose();
    }
  });

  it("decline leaves manual collection available and no receipt", async () => {
    const app = makeMemApp();
    const handle = startup.register(app);
    try {
      const result = await handle.decline();
      assert.equal(result.stage, "declined");
      assert.equal(result.manual_collection_available, true);
      const state = readJSON(app.files, startup.ACTIVATION_STATE_PATH);
      assert.equal(state.stage, "declined");
      assert.equal(state.manual_collection_available, true);
      assert.equal(startup.ACTIVATION_RECEIPT_PATH in app.files, false);
    } finally {
      handle.dispose();
    }
  });

  it("runDueWork before activation is manual-only and dispatches nothing", async () => {
    const app = makeMemApp();
    const handle = startup.register(app);
    try {
      const result = await handle.runDueWork({ providers: [] });
      assert.equal(result.manual_only, true);
      assert.deepEqual(result.dispatched, []);
    } finally {
      handle.dispose();
    }
  });

  it("register is idempotent per process (one startup path)", () => {
    const app = makeMemApp();
    const h1 = startup.register(app);
    const h2 = startup.register(app);
    try {
      assert.equal(h1, h2);
    } finally {
      h1.dispose();
    }
  });

  it("does not run collection from hub render (no auto-dispatch on register)", async () => {
    const app = makeMemApp();
    const handle = startup.register(app);
    try {
      // Registering alone must not create any runtime lease/inflight files.
      const runtimeKeys = Object.keys(app.files).filter((k) => k.includes("region-runtime/providers"));
      assert.equal(runtimeKeys.length, 0);
    } finally {
      handle.dispose();
    }
  });
});
