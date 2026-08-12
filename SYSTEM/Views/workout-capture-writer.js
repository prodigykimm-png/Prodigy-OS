(function (root) {
  "use strict";

  function dependency(name, path) { if (root[name]) return root[name]; if (typeof require === "function") return require(path); throw new Error(`${name} is unavailable.`); }
  function runtime() { return dependency("CaptureActionRuntime", "./capture-action-runtime.js"); }
  function authority() { return dependency("CaptureAuthorizedWriter", "./capture-authorized-writer.js"); }
  function targetForProgram(objects, normalized) { return String(normalized.source_path || `${objects.PROGRAM_FOLDER}/${objects.safeName(normalized.title)}.md`); }
  async function vaultSnapshot(app, target) { const file = app.vault.getAbstractFileByPath(target); if (!file) return null; const bytes = await app.vault.read(file); return { path: target, revision: runtime().sha256(bytes), bytes }; }
  async function vaultRevision(app, target) { const snapshot = await vaultSnapshot(app, target); return snapshot && snapshot.revision; }
  function bind(intent, proposal, action) { return runtime().bindTrustedConfirmation(intent, proposal, { action_id: action, session_id: intent && intent.session_id }); }
  async function transact(store, callback) {
    if (store && typeof store.transaction === "function") return store.transaction(callback, { retainRollback: true });
    if (store && !store.adapter) return { value: await callback(store), rollback: async function () {} };
    throw new Error("Workout composite writes require a transactional store.");
  }
  async function restoreVault(app, snapshot) {
    const current = app.vault.getAbstractFileByPath(snapshot.path);
    if (snapshot.bytes === null) {
      if (current) {
        if (typeof app.vault.delete === "function") await app.vault.delete(current, true);
        else if (typeof app.vault.trash === "function") await app.vault.trash(current, true);
        else throw new Error("Vault rollback cannot remove a newly-created program Object.");
      }
    } else if (current) await app.vault.modify(current, snapshot.bytes);
    else await app.vault.create(snapshot.path, snapshot.bytes);
    return { path: snapshot.path, revision: snapshot.revision };
  }

  async function saveProgram(app, store, objects, program, human, options) {
    const normalized = dependency("WorkoutCore", "./workout-core.js").normalizeProgram(program);
    const action = String(options && options.action_id || "workout-program-save");
    const target = targetForProgram(objects, normalized); const readRevision = () => vaultRevision(app, target);
    const proposalInput = { action_id: action, target_path: target, payload: normalized, source_id: "workout-program-review", locator: String(options && options.locator || "WorkoutProgramModal:explicit-confirm"), readRevision };
    const review = options && options.review;
    if (!review) return { saved: null, review_required: true, capture: { record: await runtime().prepareHumanReview(proposalInput, human), receipt: null } };
    if (review.target_path !== target || review.payload_hash !== runtime().hashPayload(target, normalized)) throw new Error("Workout program review binding changed.");
    let saved = null; let rollback = null;
    const before = await vaultSnapshot(app, target) || { path: target, revision: null, bytes: null };
    const capture = await runtime().confirmHumanReview(review, human, action, {
      readRevision,
      writeCanonical: async (request) => {
        const immediate = await readRevision();
        try {
          const committed = await transact(store, async (transaction) => {
            saved = await objects.saveProgramObject(app, normalized, { captureRequest: request, expectedRevision: immediate });
            await transaction.saveProgram(saved);
            return saved;
          });
          rollback = committed.rollback;
          return { revision: await readRevision(), path: target };
        } catch (error) { await restoreVault(app, before); throw error; }
      },
      readCanonical: () => vaultSnapshot(app, target),
      rollbackCanonical: async (request) => {
        const current = await readRevision(); authority().assertCanonicalRollbackRequest(request, current);
        if (rollback) await rollback();
        return restoreVault(app, before);
      }
    });
    return { saved: capture.receipt ? saved : null, capture };
  }

  async function importRunning(store, projection, running, activities, receiptInput, human, review) {
    const importId = String(receiptInput.import_id || ""); if (!importId) throw new Error("Running import_id is required before review.");
    const action = String(human && human.action_id || "workout-running-import"); const target = `${store.basePath}/run-imports/${importId}.json`;
    const readSnapshot = async () => { const value = await store.read("runImports", importId); return value ? { path: target, revision: runtime().hashCanonical(value), value } : null; };
    const readRevision = async () => { const snapshot = await readSnapshot(); return snapshot && snapshot.revision; };
    const payload = { activities, receipt_input: receiptInput };
    const proposalInput = { action_id: action, operation: "create", target_path: target, payload, source_id: "workout-running-preview", locator: "WorkoutRunningImport:explicit-confirm", readRevision };
    if (!review) return { result: null, review_required: true, capture: { record: await runtime().prepareHumanReview(proposalInput, human), receipt: null } };
    if (review.target_path !== target || review.payload_hash !== runtime().hashPayload(target, payload)) throw new Error("Workout running review binding changed.");
    let result = null; let rollback = null;
    const capture = await runtime().confirmHumanReview(review, human, action, {
      readRevision,
      writeCanonical: async (request) => {
        const immediate = await readRevision(); authority().assertCanonicalWriteRequest(request, immediate);
        const committed = await transact(store, async (transaction) => {
          const saved = await projection.saveActivities(transaction, activities, { captureRequest: request });
          const created = saved.filter((item) => item.created).length; const updated = saved.filter((item) => item.updated).length;
          const receipt = running.buildRunImportReceipt(Object.assign({}, receiptInput, { import_id: importId, activity_count: activities.length, created_count: created, updated_count: updated }));
          await transaction.save("runImports", importId, receipt); return { saved, receipt };
        });
        result = committed.value; rollback = committed.rollback;
        return { revision: runtime().hashCanonical(result.receipt), path: target };
      },
      readCanonical: readSnapshot,
      rollbackCanonical: async (request) => { const current = await readRevision(); authority().assertCanonicalRollbackRequest(request, current); if (rollback) await rollback(); return { path: target, revision: await readRevision() }; }
    });
    return { result: capture.receipt ? result : null, capture };
  }

  async function importNutrition(store, nutrition, entries, warnings, receiptInput, human, review) {
    const importId = String(receiptInput.import_id || (entries[0] && entries[0].import_id) || ""); if (!importId) throw new Error("Nutrition import_id is required before review.");
    const action = "workout-nutrition-import"; const target = `${store.basePath}/nutrition-imports/${importId}.json`;
    const readSnapshot = async () => { const value = await store.read("nutritionImports", importId); return value ? { path: target, revision: runtime().hashCanonical(value), value } : null; };
    const readRevision = async () => { const snapshot = await readSnapshot(); return snapshot && snapshot.revision; };
    const payload = { entries, warning_count: warnings.length, receipt_input: receiptInput };
    const proposalInput = { action_id: action, operation: "create", target_path: target, payload, source_id: "workout-nutrition-preview", locator: "WorkoutNutritionImport:explicit-confirm", readRevision };
    if (!review) return { result: null, review_required: true, capture: { record: await runtime().prepareHumanReview(proposalInput, human), receipt: null } };
    if (review.target_path !== target || review.payload_hash !== runtime().hashPayload(target, payload)) throw new Error("Workout nutrition review binding changed.");
    let result = null; let rollback = null;
    const capture = await runtime().confirmHumanReview(review, human, action, {
      readRevision,
      writeCanonical: async (request) => {
        const immediate = await readRevision(); authority().assertCanonicalWriteRequest(request, immediate);
        const committed = await transact(store, async (transaction) => {
          const saved = await transaction.upsertImported("nutritionEntries", entries, "source", "source_key", { captureRequest: request });
          const created = saved.filter((item) => item.created).length; const updated = saved.filter((item) => !item.created && !item.skipped).length;
          const receipt = nutrition.buildImportReceipt(Object.assign({}, receiptInput, { import_id: importId, entry_count: entries.length, created_count: created, updated_count: updated, warning_count: warnings.length }));
          await transaction.save("nutritionImports", importId, receipt); return { saved, receipt };
        });
        result = committed.value; rollback = committed.rollback;
        return { revision: runtime().hashCanonical(result.receipt), path: target };
      },
      readCanonical: readSnapshot,
      rollbackCanonical: async (request) => { const current = await readRevision(); authority().assertCanonicalRollbackRequest(request, current); if (rollback) await rollback(); return { path: target, revision: await readRevision() }; }
    });
    return { result: capture.receipt ? result : null, capture };
  }

  const api = Object.freeze({ saveProgram, importRunning, importNutrition });
  root.WorkoutCaptureWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
