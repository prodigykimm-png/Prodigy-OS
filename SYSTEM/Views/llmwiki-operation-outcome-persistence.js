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
  function create(store = memoryStore()) {
    let tail = Promise.resolve();
    let revision = 0;
    async function persist(outcome) {
      revision += 1;
      const versioned = freeze({ ...clone(outcome), outcome_revision: revision });
      const pending = tail.then(() => store.save(versioned));
      tail = pending.catch(() => undefined);
      await pending;
      return versioned;
    }
    async function load(runId) {
      await tail;
      const value = await store.load(runId);
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
