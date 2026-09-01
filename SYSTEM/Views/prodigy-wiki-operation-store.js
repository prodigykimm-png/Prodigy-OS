(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STATE_FILE = "prodigy-wiki-operation.json";
  const HASH = /^[0-9a-f]{64}$/u;
  const STATUSES = Object.freeze(["running", "interrupted", "review_ready", "source_changed"]);

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function validSource(source) {
    return plain(source)
      && typeof source.path === "string" && source.path.length > 0
      && typeof source.title === "string" && source.title.length > 0
      && HASH.test(source.content_hash || "");
  }
  function normalizeRange(range) {
    if (!plain(range)) return null;
    const scopeId = String(range.scope_id || range.range_id || "");
    if (!scopeId || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start < 0 || range.end <= range.start) return null;
    return {
      scope_id: scopeId,
      range_id: scopeId,
      title: String(range.title || ""),
      start: range.start,
      end: range.end,
      ...(typeof range.preview === "string" ? { preview: range.preview } : {}),
      ...(typeof range.size === "string" ? { size: range.size } : {}),
    };
  }
  function identityBody(input) {
    if (!plain(input) || !validSource(input.source) || typeof input.orchestrator_version !== "string" || !input.orchestrator_version) {
      throw new TypeError("invalid_operation_identity");
    }
    return {
      source_path: input.source.path,
      source_revision: input.source.content_hash,
      range: normalizeRange(input.range),
      orchestrator_version: input.orchestrator_version,
    };
  }
  function operationIdentity(input, hash) {
    if (!hash || typeof hash.sha256 !== "function") throw new TypeError("hash_required");
    return hash.sha256(stable(identityBody(input)));
  }
  function validOperation(operation) {
    return plain(operation)
      && HASH.test(operation.operation_id || "")
      && validSource(operation.source)
      && typeof operation.orchestrator_version === "string" && operation.orchestrator_version.length > 0
      && STATUSES.includes(operation.status)
      && (operation.range === null || normalizeRange(operation.range) !== null)
      && typeof operation.stage === "string"
      && typeof operation.reason === "string"
      && typeof operation.resumable === "boolean"
      && (operation.result === null || plain(operation.result));
  }
  function parse(bytes) {
    let value;
    try { value = JSON.parse(String(bytes)); } catch (_error) { return null; }
    if (!plain(value) || value.schema_version !== SCHEMA_VERSION
      || !(value.operation === null || validOperation(value.operation))) return null;
    return value;
  }
  function empty() {
    return { schema_version: SCHEMA_VERSION, operation: null };
  }
  function assessRestore(operation, currentRevision) {
    if (!validOperation(operation)) return null;
    if (currentRevision !== operation.source.content_hash) {
      return freeze({
        ...copy(operation),
        status: "source_changed",
        reason: "source_revision_changed",
        resumable: false,
      });
    }
    if (operation.status === "running") {
      return freeze({
        ...copy(operation),
        status: "interrupted",
        reason: "app_reloaded_during_run",
        resumable: true,
      });
    }
    return freeze(copy(operation));
  }

  function createStore(options = {}) {
    const storage = options.storage;
    const hash = options.hash;
    if (!storage || ["exists", "read", "writeAtomic", "quarantine"].some((name) => typeof storage[name] !== "function")) {
      throw new TypeError("storage_required");
    }
    if (!hash || typeof hash.sha256 !== "function") throw new TypeError("hash_required");
    let state = null;
    let mutationTail = Promise.resolve();

    async function load() {
      if (state) return state.operation;
      if (!await storage.exists(STATE_FILE)) {
        state = empty();
        return null;
      }
      let parsed = null;
      try { parsed = parse(await storage.read(STATE_FILE)); } catch (_error) { parsed = null; }
      if (!parsed) {
        await storage.quarantine(STATE_FILE);
        state = empty();
        return null;
      }
      state = parsed;
      if (state.operation?.status === "running") {
        state.operation = assessRestore(state.operation, state.operation.source.content_hash);
      }
      return state.operation;
    }
    async function persist() {
      await storage.writeAtomic(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
    }
    function mutate(change) {
      const operation = mutationTail.then(async () => {
        await load();
        const before = JSON.stringify(state);
        try {
          change();
          await persist();
        } catch (error) {
          state = parse(before) || empty();
          throw error;
        }
      });
      mutationTail = operation.catch(() => undefined);
      return operation;
    }
    function current() {
      return state?.operation ? freeze(copy(state.operation)) : null;
    }

    return freeze({
      load,
      getOperation: current,
      async begin(input) {
        const body = identityBody(input);
        const operationId = operationIdentity(input, hash);
        await load();
        const existing = current();
        if (existing && existing.operation_id === operationId && existing.status === "running") {
          return freeze({ ok: true, status: "duplicate", operation: existing });
        }
        if (existing && existing.operation_id === operationId && existing.status === "review_ready") {
          return freeze({ ok: true, status: "replay", operation: existing });
        }
        const next = {
          operation_id: operationId,
          source: copy(input.source),
          range: normalizeRange(input.range),
          orchestrator_version: body.orchestrator_version,
          status: "running",
          stage: "preflight",
          reason: "",
          resumable: false,
          result: null,
        };
        await mutate(() => { state.operation = freeze(next); });
        return freeze({ ok: true, ...current() });
      },
      async setStage(stage) {
        if (typeof stage !== "string" || !stage) throw new TypeError("invalid_stage");
        await mutate(() => {
          if (!state.operation || state.operation.status !== "running") throw new Error("running_operation_required");
          state.operation = freeze({ ...state.operation, stage });
        });
        return current();
      },
      async complete(result) {
        if (!plain(result)) throw new TypeError("invalid_operation_result");
        await mutate(() => {
          if (!state.operation || state.operation.status !== "running") throw new Error("running_operation_required");
          state.operation = freeze({
            ...state.operation,
            status: "review_ready",
            stage: "complete",
            result: copy(result),
            reason: "",
            resumable: false,
          });
        });
        return current();
      },
      async interrupt(input = {}) {
        await mutate(() => {
          if (!state.operation) throw new Error("operation_required");
          state.operation = freeze({
            ...state.operation,
            status: "interrupted",
            reason: typeof input.reason === "string" && input.reason ? input.reason : "operation_interrupted",
            resumable: input.resumable === true,
          });
        });
        return current();
      },
      async markSourceChanged() {
        await mutate(() => {
          if (!state.operation) throw new Error("operation_required");
          state.operation = freeze({
            ...state.operation,
            status: "source_changed",
            reason: "source_revision_changed",
            resumable: false,
          });
        });
        return current();
      },
      async clear() {
        await mutate(() => { state.operation = null; });
        return null;
      },
    });
  }

  const api = freeze({
    SCHEMA_VERSION,
    STATE_FILE,
    STATUSES,
    operationIdentity,
    assessRestore,
    createStore,
  });
  root.ProdigyWikiOperationStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
