(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const privacyApi = root.LLMWikiInboxPrivacyBoundary || (typeof require === "function" ? require("./llmwiki-inbox-privacy-boundary.js") : null);
  const sensitiveApi = root.LLMWikiSensitiveContentPolicy || (typeof require === "function" ? require("./llmwiki-sensitive-content-policy.js") : null);
  const storeApi = root.LLMWikiBatchJobStore || (typeof require === "function" ? require("./llmwiki-batch-job-store.js") : null);
  const nodeCrypto = typeof require === "function" ? require("node:crypto") : null;

  const DEFAULT_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu;
  const PROVISIONAL_REQUEST_KEY = hashApi.sha256("llmwiki_inbox_discovery_provisional_request_key_v1");
  // Serialized-source keys accepted from the legacy autopilot input format.
  const SERIALIZED_SOURCE_KEYS = new Set([
    "content_hash", "expected_snapshot_id", "media_kind", "modified_revision", "privacy_class",
    "provider_eligibility", "route_hint", "sensitive", "source_id", "source_kind", "source_path", "source_text", "text",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function lower(value) { return trim(value).toLowerCase(); }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function shaBytes(bytes) {
    if (nodeCrypto) return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
    return hashApi.sha256(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  function shaText(text) { return shaBytes(new TextEncoder().encode(text)); }
  function stableRevision(text) {
    // Same normalization as the Hub intake: control characters are stripped
    // before hashing so the revision is stable across read paths.
    const normalized = text.replace(CONTROL_CHARS, "");
    return { normalized, revision_hash: shaText(normalized) };
  }

  function rejected(reason) { return freeze({ ok: false, reason }); }

  /*
   * Normalize a raw discovery entry ({ source_path, source_text, metadata })
   * or a legacy serialized JSON source string/object into
   * { source_path, source_text, metadata, bytes, revision_hash }.
   * The body never appears in any rejected result beyond the reason code.
   */
  function normalizeEntry(input, maxSourceBytes, sourceRegistryRecords) {
    let record = input;
    if (typeof input !== "string") {
      if (plain(input)) record = input;
      else {
        record = sourceRegistryRecords && input && (typeof input === "object" || typeof input === "function")
          ? sourceRegistryRecords.get(input) : undefined;
        if (typeof record !== "string") return rejected("serialized_source_required");
      }
    }
    if (typeof record === "string") {
      let parsed;
      try { parsed = JSON.parse(record); }
      catch (_error) { return rejected("invalid_serialized_source"); }
      if (!plain(parsed) || Object.keys(parsed).some((key) => !SERIALIZED_SOURCE_KEYS.has(key))) return rejected("invalid_serialized_source");
      if (parsed.text !== undefined && parsed.text !== parsed.source_text) return rejected("invalid_serialized_source");
      for (const key of ["source_id", "source_path", "modified_revision", "media_kind", "content_hash", "route_hint", "privacy_class", "source_kind", "expected_snapshot_id"]) {
        if (parsed[key] !== undefined && typeof parsed[key] !== "string") return rejected("invalid_serialized_source");
      }
      if (parsed.sensitive !== undefined && typeof parsed.sensitive !== "boolean") return rejected("invalid_serialized_source");
      record = parsed;
    }
    if (typeof record.source_text !== "string") return rejected("source_text_required");
    const sourcePath = trim(record.source_path);
    if (!sourcePath) return rejected("malformed_inbox_path");
    if (!privacyApi.isSafeInboxPath(sourcePath)) return rejected("malformed_inbox_path");
    if (!sourcePath.startsWith("INBOX/") || !sourcePath.endsWith(".md")) return rejected("outside_inbox_boundary");
    if (record.source_text.length === 0) return rejected("entry_body_required");
    const rawBytes = new TextEncoder().encode(record.source_text);
    if (rawBytes.byteLength > maxSourceBytes) return rejected("source_too_large");
    const revision = stableRevision(record.source_text);
    if (revision.normalized.length === 0) return rejected("entry_body_required");
    const bytes = new TextEncoder().encode(revision.normalized);
    const claimedHash = trim(record.content_hash);
    if (claimedHash && !HASH.test(claimedHash)) return rejected("content_hash_mismatch");
    if (claimedHash && claimedHash !== revision.revision_hash) return rejected("content_hash_mismatch");
    return freeze({
      ok: true,
      value: {
        source_path: sourcePath,
        source_text: revision.normalized,
        metadata: {
          route_hint: trim(record.metadata?.route_hint ?? record.route_hint),
          privacy_class: lower(record.metadata?.privacy_class ?? record.privacy_class ?? record.metadata?.privacy),
          sensitive: (record.metadata?.sensitive ?? record.sensitive) === true,
          private: (record.metadata?.private ?? record.private) === true,
          type: lower(record.metadata?.type ?? record.type),
          llmwiki_outbound: record.metadata?.llmwiki_outbound ?? record.llmwiki_outbound,
        },
        bytes,
        revision_hash: revision.revision_hash,
      },
    });
  }

  function sourceIdFor(sourcePath) { return `source_${shaText(sourcePath).slice(0, 24)}`; }

  function zeroCounters(extra) {
    return freeze({
      provider_calls: 0,
      pack_count: 0,
      canonical_writes: 0,
      source_writes: 0,
      audit_writes: 0,
      git_writes: 0,
      fallback_attempts: 0,
      automatic_retries: 0,
      automatic_repairs: 0,
      ...extra,
    });
  }

  function createInboxDiscoveryQueue(options = {}) {
    const registry = options.registry;
    const jobStore = options.jobStore;
    const maxSourceBytes = Number.isSafeInteger(options.maxSourceBytes) && options.maxSourceBytes > 0
      ? options.maxSourceBytes : DEFAULT_MAX_SOURCE_BYTES;
    const sourceRegistryRecords = options.sourceRegistryRecords instanceof WeakMap ? options.sourceRegistryRecords : null;
    if (!registry || typeof registry.register !== "function") throw new TypeError("source_registry_required");
    if (!jobStore || typeof jobStore.createJob !== "function" || typeof jobStore.load !== "function") throw new TypeError("job_store_required");

    const listeners = new Set();
    const latestEligible = new Map(); // source_path -> normalized eligible source
    let frozenRows = null; // Map<source_id, revision_hash> captured by freezeBatch()

    function emit(event) {
      const safe = freeze(event);
      for (const listener of [...listeners]) { try { listener(safe); } catch (_error) { /* subscribers never own queue state */ } }
    }

    /*
     * Recorded revisions across every durable snapshot job in the Task 3
     * store. Restart/remount safe: no AI call, no write.
     */
    async function recordedRevisions() {
      const state = await jobStore.load();
      const recorded = new Map();
      for (const job of Object.values(state.jobs)) {
        for (const [id, revision] of Object.entries(job.sources)) {
          if (!recorded.has(id)) recorded.set(id, new Set());
          recorded.get(id).add(revision);
        }
      }
      return recorded;
    }

    function heldReason(sourcePath, value) {
      const metadata = value.metadata;
      const markedPrivate = metadata.private || metadata.sensitive
        || ["private", "protected", "sensitive"].includes(metadata.privacy_class);
      const explicitOutbound = [true, "allow", "allowed", "yes", "true"].includes(metadata.llmwiki_outbound);
      // Contradictory local signals (private marker + outbound consent) are
      // held, never resolved silently.
      if (markedPrivate && explicitOutbound) return "mixed_ambiguous_classification";
      const boundary = privacyApi.classifyInboxSource({ source_path: sourcePath, metadata });
      if (boundary.route === "ignored") return boundary.reason; // outside_inbox_boundary
      if (boundary.route === "hold") return boundary.reason; // protected_source
      const sensitive = sensitiveApi.inspect({ source_path: sourcePath, source_text: value.source_text, metadata });
      if (sensitive && sensitive.type === "hold") return sensitive.reason === "people_local_only" ? "people_local_only" : "sensitive_content";
      return null;
    }

    async function discover(entries, context = {}) {
      // A dirty Git worktree is explicitly a local concern only: it never
      // blocks local discovery. context.dirty_worktree is deliberately not
      // consulted as a gate.
      void context;
      const recorded = await recordedRevisions();
      const outEntries = [];
      const eligibleRows = [];
      const discoveredPaths = new Set();
      let eligibleTotal = 0;
      let heldTotal = 0;
      let unchangedTotal = 0;
      let pendingTotal = 0;
      let sourceBytes = 0;

      for (const input of (Array.isArray(entries) ? entries : [])) {
        let discoveryInput = input;
        if (plain(input) && typeof input.source_text !== "string" && typeof input.read_source_text === "function") {
          const sourcePath = trim(input.source_path);
          const metadata = plain(input.metadata) ? input.metadata : {};
          if (!privacyApi.isSafeInboxPath(sourcePath) || !sourcePath.startsWith("INBOX/") || !sourcePath.endsWith(".md")) {
            heldTotal += 1;
            outEntries.push(freeze({ source_path: sourcePath, classification: "held", reason: "malformed_inbox_path" }));
            continue;
          }
          const markedPrivate = metadata.private === true || metadata.sensitive === true || ["private", "protected", "sensitive"].includes(lower(metadata.privacy || metadata.privacy_class));
          const explicitOutbound = [true, "allow", "allowed", "yes", "true"].includes(metadata.llmwiki_outbound);
          const boundary = privacyApi.classifyInboxSource({ source_path: sourcePath, metadata });
          if (markedPrivate && explicitOutbound || boundary.outbound_allowed !== true) {
            const reason = markedPrivate && explicitOutbound ? "mixed_ambiguous_classification" : boundary.reason || "protected_source";
            heldTotal += 1;
            outEntries.push(freeze({ source_path: sourcePath, classification: "held", reason }));
            emit({ type: "discovered", source_path: sourcePath, classification: "held", reason });
            continue;
          }
          let sourceText;
          try { sourceText = await input.read_source_text(); } catch (_error) { sourceText = null; }
          discoveryInput = { source_path: sourcePath, source_text: sourceText, metadata };
        }
        const normalized = normalizeEntry(discoveryInput, maxSourceBytes, sourceRegistryRecords);
        if (!normalized.ok) {
          heldTotal += 1;
          const attemptedPath = typeof discoveryInput === "string"
            ? (() => { try { const parsed = JSON.parse(discoveryInput); return typeof parsed.source_path === "string" ? parsed.source_path : ""; } catch (_error) { return ""; } })()
            : (plain(discoveryInput) && typeof discoveryInput.source_path === "string" ? discoveryInput.source_path : "");
          outEntries.push(freeze({ source_path: attemptedPath, classification: "held", reason: normalized.reason }));
          continue;
        }
        const value = normalized.value;
        if (value.source_path === "INBOX/README.md") {
          outEntries.push(freeze({ source_path: value.source_path, classification: "ignored", reason: "control_document" }));
          emit({ type: "discovered", source_path: value.source_path, classification: "ignored", reason: "control_document" });
          continue;
        }
        discoveredPaths.add(value.source_path);
        const membership = frozenRows
          ? (frozenRows.get(sourceIdFor(value.source_path)) === value.revision_hash ? "frozen_batch" : "next_batch")
          : "unfrozen";
        const held = heldReason(value.source_path, value);
        if (held) {
          heldTotal += 1;
          outEntries.push(freeze({ source_path: value.source_path, classification: "held", reason: held, batch_membership: membership }));
          emit({ type: "discovered", source_path: value.source_path, classification: "held", reason: held });
          continue;
        }
        eligibleTotal += 1;
        sourceBytes += value.bytes.byteLength;
        const sourceId = sourceIdFor(value.source_path);
        latestEligible.set(value.source_path, freeze({
          source_id: sourceId,
          source_path: value.source_path,
          extracted_text: value.source_text,
          content_hash: value.revision_hash,
          source_bytes: value.bytes,
        }));
        const known = recorded.get(sourceId)?.has(value.revision_hash) ?? false;
        if (known) {
          unchangedTotal += 1;
          eligibleRows.push({ source_id: sourceId, revision_hash: value.revision_hash });
          outEntries.push(freeze({ source_path: value.source_path, source_id: sourceId, classification: "unchanged", reason: "revision_already_recorded", revision_hash: value.revision_hash, batch_membership: membership }));
          emit({ type: "discovered", source_path: value.source_path, classification: "unchanged", source_id: sourceId });
          continue;
        }
        pendingTotal += 1;
        eligibleRows.push({ source_id: sourceId, revision_hash: value.revision_hash });
        outEntries.push(freeze({ source_path: value.source_path, source_id: sourceId, classification: "pending", reason: "pending_snapshot_recorded", revision_hash: value.revision_hash, batch_membership: membership }));
        emit({ type: "discovered", source_path: value.source_path, classification: "pending", source_id: sourceId });
      }

      for (const sourcePath of [...latestEligible.keys()]) {
        if (!discoveredPaths.has(sourcePath)) latestEligible.delete(sourcePath);
      }

      // Durable pending snapshots through the Task 3 store. The provisional
      // request key carries no provider identity: discovery is provider-blind.
      // Provider identity is frozen at run creation (Task 8), which derives its
      // own job from these exact {source_id, revision_hash} rows.
      let snapshotJobId = null;
      if (eligibleRows.length > 0) {
        const job = await jobStore.createJob({ request_key: PROVISIONAL_REQUEST_KEY, sources: eligibleRows });
        snapshotJobId = job.batch_id;
      }

      return freeze({
        ok: true,
        counters: zeroCounters({
          discovered_total: outEntries.length,
          eligible_total: eligibleTotal,
          held_total: heldTotal,
          unchanged_total: unchangedTotal,
          pending_total: pendingTotal,
          source_bytes: sourceBytes,
        }),
        entries: outEntries,
        snapshot_job_id: snapshotJobId,
      });
    }

    /*
     * Freeze the current durable revision set as the batch under analysis.
     * Anything discovered afterwards belongs to the next batch.
     */
    async function freezeBatch() {
      await recordedRevisions();
      frozenRows = new Map();
      const sources = [...latestEligible.values()].sort((left, right) => left.source_id.localeCompare(right.source_id));
      const rows = sources.map((source) => {
        frozenRows.set(source.source_id, source.content_hash);
        return freeze({ source_id: source.source_id, revision_hash: source.content_hash });
      });
      return freeze({ frozen: true, batch_token: PROVISIONAL_REQUEST_KEY, rows, sources });
    }

    return freeze({
      discover,
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("listener_required");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      freezeBatch,
      currentSources() { return freeze([...latestEligible.values()].sort((left, right) => left.source_id.localeCompare(right.source_id))); },
    });
  }

  const api = freeze({ DEFAULT_MAX_SOURCE_BYTES, PROVISIONAL_REQUEST_KEY, createInboxDiscoveryQueue, normalizeEntry, sourceIdFor, stableRevision });
  root.LLMWikiInboxDiscoveryQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
