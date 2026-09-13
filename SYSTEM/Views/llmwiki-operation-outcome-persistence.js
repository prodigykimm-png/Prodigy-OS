(function (root) {
  "use strict";

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function memoryStore() {
    const values = new Map();
    return Object.freeze({ async save(value) { values.set(value.run_id, clone(value)); }, async load(runId) { return clone(values.get(runId) || null); } });
  }
  function validateOptionalAttempts(value) {
    if (value?.attempts === undefined) return;
    const jobs = root.LLMWikiBatchJobStore || (typeof require === "function" ? require("./llmwiki-batch-job-store.js") : null);
    if (!Array.isArray(value.attempts) || !jobs || !value.attempts.every(jobs.validAttempt)) throw new TypeError("invalid_attempt_record");
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!value || typeof value !== "object") return JSON.stringify(value);
    return `{${Object.keys(value).filter(key => key !== "outcome_revision").sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function create(store = memoryStore()) {
    let tail = Promise.resolve();
    let revision = 0;
    async function persist(outcome) {
      validateOptionalAttempts(outcome);
      const copy = clone(outcome);
      const pending = tail.then(async () => {
        const previous = await store.load(copy.run_id);
        validateOptionalAttempts(previous);
        if (previous && stable(previous) === stable(copy)) return freeze(clone(previous));
        revision = Math.max(revision, previous?.outcome_revision || 0) + 1;
        const versioned = freeze({ ...copy, outcome_revision: revision });
        await store.save(versioned);
        return versioned;
      });
      tail = pending.catch(() => undefined);
      return pending;
    }
    async function load(runId) {
      await tail;
      const value = await store.load(runId);
      validateOptionalAttempts(value);
      if (value && Number.isSafeInteger(value.outcome_revision)) revision = Math.max(revision, value.outcome_revision);
      return value;
    }
    function observe(value) {
      if (value && Number.isSafeInteger(value.outcome_revision)) revision = Math.max(revision, value.outcome_revision);
    }
    return Object.freeze({ persist, load, observe });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationOutcomePersistence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
