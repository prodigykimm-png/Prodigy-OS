(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const DEFAULT_DIR = "SYSTEM/CACHE/llmwiki";
  const STATE_FILE = "batch-job-state.json";
  const SCHEMA_VERSION = 2;
  const STATES = Object.freeze(["pending", "running", "review_ready", "resolved", "blocked", "outcome_unknown"]);
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function sorted(values) { return [...values].sort(); }
  function empty() { return { schema_version: SCHEMA_VERSION, jobs: {}, packs: {}, legacy: [], recovery: null }; }
  function jsonClone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

  function parse(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (_error) { return null; }
    if (plain(parsed) && parsed.schema_version === 1 && plain(parsed.jobs) && plain(parsed.packs) && Array.isArray(parsed.legacy)) {
      parsed = { ...parsed, schema_version: SCHEMA_VERSION, recovery: null };
    }
    if (!plain(parsed) || parsed.schema_version !== SCHEMA_VERSION || !plain(parsed.jobs) || !plain(parsed.packs) || !Array.isArray(parsed.legacy) || !(parsed.recovery === null || validRecovery(parsed.recovery))) return null;
    for (const job of Object.values(parsed.jobs)) {
      if (!validJob(job)) return null;
    }
    for (const pack of Object.values(parsed.packs)) {
      if (!validPack(pack)) return null;
    }
    if (parsed.legacy.some((entry) => !plain(entry) || typeof entry.proposal_id !== "string")) return null;
    return parsed;
  }

  function validIdentity(identity) {
    const fields = ["provider_key", "model", "structured_mode", "schema_id", "prompt_version", "candidate_context_hash"];
    return plain(identity) && fields.every((field) => typeof identity[field] === "string" && identity[field].length > 0);
  }
  function validJob(job) {
    return plain(job) && HASH.test(job.job_id) && HASH.test(job.batch_id) && HASH.test(job.request_key)
      && STATES.includes(job.status) && plain(job.sources)
      && (job.parent_job_id === undefined || HASH.test(job.parent_job_id))
      && (job.retry_parent_job_id === undefined || HASH.test(job.retry_parent_job_id))
      && !(job.parent_job_id !== undefined && job.retry_parent_job_id !== undefined)
      && (job.retry_intent_id === undefined || typeof job.retry_intent_id === "string" && job.retry_intent_id.length > 0)
      && (job.frozen_identity === undefined || validIdentity(job.frozen_identity))
      && Object.entries(job.sources).every(([id, revision]) => typeof id === "string" && id.length > 0 && HASH.test(revision));
  }
  function validRecovery(value) {
    if (!plain(value) || !["llmwiki"].includes(value.active_tab) || !HASH.test(value.selected_batch_id || "")
      || !plain(value.review) || typeof value.review.run_id !== "string" || !Array.isArray(value.review.selected_operation_ids)
      || !Array.isArray(value.review.proposals) || !Array.isArray(value.operation_outcomes)) return false;
    const operationIds = value.review.proposals.map((row) => plain(row) && row.operation_id);
    return operationIds.every((id) => typeof id === "string" && id.length > 0)
      && value.review.selected_operation_ids.every((id) => operationIds.includes(id))
      && value.operation_outcomes.every((row) => plain(row) && typeof row.operation_id === "string" && typeof row.status === "string");
  }
  function validPack(pack) {
    return plain(pack) && HASH.test(pack.pack_id) && HASH.test(pack.job_id) && HASH.test(pack.pack_hash)
      && Number.isSafeInteger(pack.received_at) && (pack.historical !== true || pack.artifact_hash === null);
  }

  function createNodeStorage(dir) {
    const fs = root.process ? require("node:fs") : null;
    const path = root.process ? require("node:path") : null;
    if (!fs) throw new Error("node_fs_unavailable");
    function resolve(name) { return path.join(dir, name); }
    return freeze({
      async exists(name) { return fs.existsSync(resolve(name)); },
      async read(name) { return fs.readFileSync(resolve(name), "utf8"); },
      async writeAtomic(name, text) {
        const target = resolve(name);
        const temp = `${target}.tmp-${root.process.pid}-${Date.now()}`;
        try { fs.writeFileSync(temp, text); fs.renameSync(temp, target); } catch (error) { try { fs.unlinkSync(temp); } catch (_ignored) {} throw error; }
      },
      async quarantine(name, text) { fs.renameSync(resolve(name), resolve(`${name}.quarantine`)); void text; },
    });
  }

  function createBatchJobStore(options = {}) {
    const storage = options.storage;
    const counters = options.counters || {};
    if (!storage || ["exists", "read", "writeAtomic", "quarantine"].some((method) => typeof storage[method] !== "function")) throw new TypeError("storage_required");
    let state = null;
    let mutationTail = Promise.resolve();

    async function load() {
      if (state) return state;
      if (await storage.exists(STATE_FILE)) {
        let parsed = null;
        try { parsed = parse(await storage.read(STATE_FILE)); } catch (_error) { parsed = null; }
        if (parsed) {
          state = parsed;
        } else {
          await storage.quarantine(STATE_FILE, "");
          state = empty();
        }
      } else state = empty();
      // Restart recovery: running means an in-flight request without a durable receipt.
      // Mapped in memory only; reload makes zero provider calls and zero writes.
      for (const job of Object.values(state.jobs)) {
        if (job.status === "running") state.jobs[job.job_id] = freeze({ ...job, status: "outcome_unknown" });
      }
      return state;
    }

    async function persist() {
      const serialized = JSON.stringify(state, null, 2);
      await storage.writeAtomic(STATE_FILE, serialized);
    }

    function mutate(fn) {
      const operation = mutationTail.then(async () => {
        await load();
        const durable = JSON.stringify(state);
        try {
          fn();
          await persist();
        } catch (error) {
          // Failed persistence must not leave memory ahead of disk.
          state = parse(durable) || empty();
          throw error;
        }
      });
      mutationTail = operation.catch(() => undefined);
      return operation;
    }

    function getJob(jobId) { return state?.jobs[jobId] || null; }
    async function findRetryParent(sources) {
      validSourceRows(sources);
      await load();
      const normalized = stableSources(Object.fromEntries(sources.map((row) => [row.source_id, row.revision_hash])));
      return freeze(Object.values(state.jobs).reverse().find((job) => ["blocked", "outcome_unknown"].includes(job.status) && stableSources(job.sources) === normalized) || null);
    }

    return freeze({
      load,
      getJob,
      findRetryParent,
      async createJob(input) {
        if (!plain(input) || !HASH.test(input.request_key)) throw new TypeError("invalid_job_input");
        validSourceRows(input.sources);
        const batchId = batchIdFor(input.sources, input.request_key);
        const sources = Object.fromEntries(sorted(input.sources.map((source) => source.source_id)).map((id) => [id, input.sources.find((source) => source.source_id === id).revision_hash]));
        let conflict = false;
        await mutate(() => {
          const existing = state.jobs[batchId];
          if (existing) {
            if (existing.request_key !== input.request_key || stableSources(existing.sources) !== stableSources(sources)) conflict = true;
            return;
          }
          state.jobs[batchId] = freeze({ job_id: batchId, batch_id: batchId, request_key: input.request_key, status: "pending", sources, ...(validIdentity(input.frozen_identity) ? { frozen_identity: jsonClone(input.frozen_identity) } : {}) });
        });
        if (conflict) throw new Error("batch_conflict");
        return freeze(getJob(batchId));
      },
      async setJobState(jobId, nextStatus) {
        if (!STATES.includes(nextStatus)) throw new TypeError("invalid_state");
        await mutate(() => {
          const job = state.jobs[jobId];
          if (!job) throw new Error("unknown_job");
          state.jobs[jobId] = freeze({ ...job, status: nextStatus });
        });
      },
      async recordPackReceipt(receipt) {
        if (!plain(receipt) || !HASH.test(receipt.job_id) || !HASH.test(receipt.pack_id) || typeof receipt.pack_hash !== "string" || !receipt.pack_hash) throw new TypeError("invalid_receipt");
        let conflict = false; let unknownJob = false;
        await mutate(() => {
          if (!state.jobs[receipt.job_id]) { unknownJob = true; return; }
          const existing = state.packs[receipt.pack_id];
          if (existing) {
            if (existing.historical === true) throw new Error("pack_conflict");
            if (existing.job_id !== receipt.job_id || existing.pack_hash !== receipt.pack_hash) conflict = true;
            return;
          }
          state.packs[receipt.pack_id] = freeze({ pack_id: receipt.pack_id, job_id: receipt.job_id, pack_hash: receipt.pack_hash, artifact_hash: receipt.artifact_hash ?? null, received_at: Date.now(), historical: false });
        });
        if (conflict) throw new Error("pack_conflict");
        if (unknownJob) throw new Error("unknown_job");
        return freeze(state.packs[receipt.pack_id]);
      },
      async lookupPackReceipt(packId, packHash, requestKey) {
        await load();
        const pack = state.packs[packId];
        if (!pack || pack.historical === true) return false;
        const job = state.jobs[pack.job_id];
        return Boolean(pack.pack_hash === packHash && job && job.request_key === requestKey);
      },
      getRecoverySnapshot() { return state?.recovery ? freeze(jsonClone(state.recovery)) : null; },
      async saveRecoverySnapshot(snapshot) {
        const copy = jsonClone(snapshot);
        if (!validRecovery(copy)) throw new TypeError("invalid_recovery_snapshot");
        await mutate(() => { state.recovery = freeze(copy); });
        return freeze(jsonClone(state.recovery));
      },
      async invalidateRecoveryOperation(input) {
        if (!plain(input) || typeof input.operation_id !== "string" || !["source_hash_changed", "packet_changed", "repacket_required"].includes(input.reason)) throw new TypeError("invalid_recovery_invalidation");
        let found = false;
        await mutate(() => {
          if (!state.recovery) throw new Error("recovery_snapshot_unavailable");
          const outcomes = state.recovery.operation_outcomes.map((row) => {
            if (row.operation_id !== input.operation_id) return row;
            found = true;
            return { ...row, status: "stale", reason: input.reason, action: "repacket" };
          });
          if (!found) throw new Error("unknown_operation");
          state.recovery = freeze({ ...state.recovery, operation_outcomes: outcomes });
        });
        return freeze({ ok: true, operation_id: input.operation_id, status: "stale", action: "repacket" });
      },
      async claimExplicitRetry(input) {
        const parentJobId = input && (input.retry_parent_job_id || input.parent_job_id);
        if (!plain(input) || !HASH.test(parentJobId || "") || typeof input.retry_intent_id !== "string" || !input.retry_intent_id
          || !HASH.test(input.request_key || "") || !validIdentity(input.frozen_identity)) throw new TypeError("invalid_retry_input");
        validSourceRows(input.sources);
        let retryJob = null;
        await mutate(() => {
          const parent = state.jobs[parentJobId];
          if (!parent || !["blocked", "outcome_unknown"].includes(parent.status)
            || stableSources(parent.sources) !== stableSources(Object.fromEntries(input.sources.map((row) => [row.source_id, row.revision_hash])))) throw new Error("retry_not_available");
          const existing = Object.values(state.jobs).find((job) => (job.retry_parent_job_id || job.parent_job_id) === parent.job_id && job.retry_intent_id === input.retry_intent_id);
          if (existing) {
            if (existing.request_key !== input.request_key || stableSources(existing.sources) !== stableSources(Object.fromEntries(input.sources.map((row) => [row.source_id, row.revision_hash])))) throw new Error("retry_intent_conflict");
            retryJob = existing;
            return;
          }
          const batchId = batchIdFor(input.sources, input.request_key);
          const jobId = sha(`${parent.job_id}|${input.retry_intent_id}|${input.request_key}`);
          const sources = Object.fromEntries(sorted(input.sources.map((row) => row.source_id)).map((id) => [id, input.sources.find((row) => row.source_id === id).revision_hash]));
          retryJob = freeze({ job_id: jobId, batch_id: batchId, request_key: input.request_key, status: "pending", sources, retry_parent_job_id: parent.job_id, retry_intent_id: input.retry_intent_id, frozen_identity: jsonClone(input.frozen_identity) });
          state.jobs[jobId] = retryJob;
        });
        return freeze(retryJob);
      },
      async importLegacyCompleted(entries) {
        if (!Array.isArray(entries) || entries.some((entry) => !plain(entry) || typeof entry.proposal_id !== "string" || typeof entry.review_state !== "string")) throw new TypeError("invalid_legacy_entries");
        let imported = 0;
        await mutate(() => {
          const seen = new Set(state.legacy.map((entry) => entry.proposal_id));
          for (const entry of entries) {
            if (seen.has(entry.proposal_id)) continue;
            seen.add(entry.proposal_id);
            imported += 1;
            state.legacy.push(freeze({ ...entry, historical: true }));
            const packId = sha(`legacy:${entry.proposal_id}`);
            state.packs[packId] = freeze({ pack_id: packId, job_id: sha(`legacy-job:${entry.proposal_id}`), pack_hash: sha(`legacy-pack:${entry.proposal_id}:${entry.proposal_hash || ""}`), artifact_hash: null, received_at: 0, historical: true });
          }
        });
        return freeze({ ok: true, imported });
      },
    });
  }

  function sha(value) { return hashApi.sha256(value); }
  function stableSources(sources) { return JSON.stringify(Object.keys(sources).sort().map((key) => `${key}:${sources[key]}`)); }
  function validSourceRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new TypeError("invalid_batch_sources");
    const seen = new Set();
    for (const row of rows) {
      if (!plain(row) || typeof row.source_id !== "string" || row.source_id.length === 0 || !HASH.test(row.revision_hash)
        || row.source_id === "__proto__" || Object.prototype.hasOwnProperty.call(row, "__proto__")) throw new TypeError("invalid_batch_sources");
      if (seen.has(row.source_id)) throw new TypeError("duplicate_source_id");
      seen.add(row.source_id);
    }
  }
  function batchIdFor(rows, requestKey) {
    validSourceRows(rows);
    const keyed = sorted(rows.map((source) => `${source.source_id}:${source.revision_hash}`));
    return sha(`${JSON.stringify(keyed)}+${requestKey}`);
  }
  function packId(jobId, chunkHashes) { return sha(`${jobId}+${JSON.stringify(sorted(chunkHashes))}`); }
  function requestKey(identityValue) {
    const fields = ["provider_key", "model", "structured_mode", "schema_id", "prompt_version", "candidate_context_hash"];
    if (!plain(identityValue) || fields.some((field) => typeof identityValue[field] !== "string" || identityValue[field].length === 0)) throw new TypeError("invalid_identity");
    return sha(fields.map((field) => identityValue[field]).join("|"));
  }

  const api = Object.freeze({ DEFAULT_DIR, STATE_FILE, SCHEMA_VERSION, STATES, requestKey, packId, batchId: batchIdFor, createNodeStorage, createBatchJobStore });
  root.LLMWikiBatchJobStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
