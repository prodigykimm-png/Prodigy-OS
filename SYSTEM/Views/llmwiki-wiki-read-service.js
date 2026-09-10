(function (root) {
  "use strict";

  const READ_SERVICES = new WeakSet();
  const RETRIEVAL_SNAPSHOTS = new WeakSet();
  const REVALIDATED_CANDIDATES = new WeakSet();
  const REVALIDATION_REQUESTS = new WeakSet();
  const REVALIDATION_READERS = new WeakSet();
  const REVALIDATION_OWNERS = new WeakMap();

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function trim(value) {
    return typeof value === "string" ? value.trim().normalize("NFC") : "";
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    return value;
  }

  function cloneValue(value) {
    const trust = root.LLMWikiCanonicalTrust || (typeof require === "function" ? (() => { try { return require("./llmwiki-canonical-trust.js"); } catch (_) { return null; } })() : null);
    if (trust && typeof trust.isVerifiedRow === "function" && trust.isVerifiedRow(value)) return value;
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }

  function failure(field, reason, extra) {
    return deepFreeze({
      ok: false,
      status: "error",
      field: field || "input",
      reason: reason || "invalid_input",
      writer_count: 0,
      provider_count: 0,
      ...(plain(extra) ? extra : {}),
    });
  }

  function stale(reason, extra) {
    return deepFreeze({
      ok: true,
      status: "stale",
      reason: reason || "stale_snapshot",
      action: "refresh",
      writer_count: 0,
      provider_count: 0,
      ...(plain(extra) ? extra : {}),
    });
  }

  function adapterFor() {
    if (root.LLMWikiWikiReadAdapter) return root.LLMWikiWikiReadAdapter;
    if (typeof require === "function") {
      try { return require("./llmwiki-wiki-read-adapter.js"); } catch (_) { /* optional browser global */ }
    }
    return null;
  }

  function safePath(adapter, value) {
    if (adapter && typeof adapter.safePath === "function") return adapter.safePath(value);
    if (typeof value !== "string") return null;
    const raw = value.trim().replace(/\\/gu, "/");
    if (!raw || raw.startsWith("/") || /^[A-Za-z]:/u.test(raw) || /[\u0000-\u001f\u007f]/u.test(raw)) return null;
    if (raw.split("/").some((part) => !part || part === "." || part === "..")) return null;
    return raw;
  }

  function prefixFor(adapter, path, snapshot) {
    if (adapter && typeof adapter.prefixFor === "function") {
      const metadata = snapshot && snapshot.allowed_prefix_metadata;
      if (metadata) return adapter.prefixFor(path, metadata);
      const prefixes = adapter.prefixMetadata ? adapter.prefixMetadata({}) : null;
      return prefixes ? adapter.prefixFor(path, prefixes) : null;
    }
    return null;
  }

  function rowsFor(snapshot) {
    return snapshot && Array.isArray(snapshot.rows) ? snapshot.rows
      : snapshot && Array.isArray(snapshot.documents) ? snapshot.documents : [];
  }

  function snapshotFrom(value) {
    const source = value && value.snapshot ? value.snapshot : value;
    if (source && source.ok === true && source.value && plain(source.value)) return source.value;
    return source;
  }

  function isSnapshot(value) {
    const snapshot = snapshotFrom(value);
    return plain(snapshot) && typeof snapshot.snapshot_revision === "string"
      && Array.isArray(snapshot.rows || snapshot.documents);
  }

  function normalizeCollected(value, adapter) {
    if (value && value.ok === false) return value;
    const source = snapshotFrom(value);
    if (isSnapshot(source)) return deepFreeze(cloneValue(source));
    if (!plain(source)) return failure("snapshot", "invalid_snapshot");
    const buildInput = {
      ...source,
      ...(plain(source.metadata) ? source.metadata : {}),
      collection_revision: source.collection_revision || source.collectionRevision
        || (plain(source.metadata) && (source.metadata.collection_revision || source.metadata.collectionRevision))
        || source.current_revision || source.revision || "",
    };
    if (!adapter || typeof adapter.buildSnapshot !== "function") return failure("snapshot", "adapter_unavailable");
    let built;
    try {
      built = adapter.buildSnapshot(buildInput);
    } catch (_) {
      return failure("snapshot", "snapshot_build_failed");
    }
    return built && built.ok === false ? built : isSnapshot(built) ? built : failure("snapshot", "invalid_snapshot");
  }

  function collectorInput(input, pass, phase) {
    return plain(input) ? { ...input, pass, phase } : { pass, phase };
  }

  function invokeCollector(collectSnapshot, input, pass, phase, adapter) {
    if (typeof collectSnapshot !== "function") return Promise.resolve(failure("collectSnapshot", "collector_required"));
    let result;
    try {
      result = collectSnapshot(collectorInput(input, pass, phase));
    } catch (_) {
      return Promise.resolve(failure("snapshot", "snapshot_collection_failed"));
    }
    return Promise.resolve(result).then((value) => normalizeCollected(value, adapter), () => failure("snapshot", "snapshot_collection_failed"));
  }

  function revisionOf(snapshot) {
    return snapshot && typeof snapshot.snapshot_revision === "string" ? snapshot.snapshot_revision : "";
  }
  function currentOf(snapshot) {
    return snapshot && typeof snapshot.current_revision === "string" && snapshot.current_revision
      ? snapshot.current_revision : revisionOf(snapshot);
  }

  function rowFor(snapshot, path) {
    return rowsFor(snapshot).find((row) => row && row.path === path) || null;
  }

  function rowRevision(row) {
    return trim(row && (row.row_revision || row.revision));
  }

  function cacheKey(snapshotRevision, path, rowRevisionValue) {
    return `${snapshotRevision}:${path}:${rowRevisionValue}`;
  }

  function readArgument(readBody, payload) {
    let source = "";
    try { source = Function.prototype.toString.call(readBody); } catch (_) { /* default to object */ }
    const parameter = /^\s*(?:async\s+)?(?:function\s*[^ (]*\s*)?\(\s*([^,)=]+)/u.exec(source);
    const arrow = /^\s*(?:async\s+)?([^=(),\s]+)\s*=>/u.exec(source);
    const first = trim(parameter ? parameter[1] : arrow ? arrow[1] : "");
    return first === "path" || first === "filePath" || first === "file_path" ? payload.path : payload;
  }

  function safeBodyResult(status, fields) {
    return deepFreeze({ ok: true, status, writer_count: 0, provider_count: 0, ...fields });
  }

  function create(options, retrievalAuthority) {
    const settings = plain(options) ? options : {};
    const adapter = settings.adapter || adapterFor();
    const collectSnapshot = typeof settings.collectSnapshot === "function" ? settings.collectSnapshot : null;
    const readBody = typeof settings.readBody === "function" ? settings.readBody : null;
    let currentSnapshot = null;
    const cache = new Map();
    const revalidationOwner = Object.freeze({});
    const revalidationReader = retrievalAuthority === true ? Object.freeze({}) : null;
    if (revalidationReader) {
      REVALIDATION_READERS.add(revalidationReader);
      REVALIDATION_OWNERS.set(revalidationReader, revalidationOwner);
    }

    async function publishSnapshot(input) {
      if (!collectSnapshot) return failure("collectSnapshot", "collector_required");
      const first = await invokeCollector(collectSnapshot, input, 1, "publish_before", adapter);
      if (first && first.ok === false) return first;
      const second = await invokeCollector(collectSnapshot, input, 2, "publish_after", adapter);
      if (second && second.ok === false) return second;
      const firstRevision = revisionOf(first);
      const secondRevision = revisionOf(second);
      const firstCurrent = currentOf(first);
      const secondCurrent = currentOf(second);
      if (!firstRevision || !secondRevision) return failure("snapshot", "invalid_snapshot");
      if (firstRevision !== secondRevision || firstCurrent !== secondCurrent) {
        return stale("stale_snapshot", {
          snapshot_revision: firstRevision,
          current_revision: secondRevision,
          published: false,
        });
      }
      currentSnapshot = deepFreeze(cloneValue(second));
      RETRIEVAL_SNAPSHOTS.add(currentSnapshot);
      cache.clear();
      return deepFreeze({
        ok: true,
        status: "published",
        published: true,
        snapshot: currentSnapshot,
        snapshot_revision: currentSnapshot.snapshot_revision,
        current_revision: currentSnapshot.current_revision || currentSnapshot.snapshot_revision,
        writer_count: 0,
        provider_count: 0,
      });
    }

    function getSnapshot() {
      return currentSnapshot;
    }

    function getRetrievalSnapshot() {
      return currentSnapshot;
    }

    function browseRead(input) {
      if (!currentSnapshot) return failure("snapshot", "snapshot_unavailable");
      if (!adapter || typeof adapter.browseRead !== "function") return failure("browseRead", "adapter_unavailable");
      const supplied = plain(input) ? input.snapshot : null;
      if (supplied && revisionOf(snapshotFrom(supplied)) !== revisionOf(currentSnapshot)) {
        return stale("stale_snapshot", {
          snapshot_revision: revisionOf(snapshotFrom(supplied)),
          current_revision: revisionOf(currentSnapshot),
        });
      }
      const request = plain(input) ? { ...input, snapshot: currentSnapshot } : { snapshot: currentSnapshot };
      try {
        return adapter.browseRead(request);
      } catch (_) {
        return failure("browseRead", "browse_failed");
      }
    }

    async function currentRevision(phase, request) {
      const result = await invokeCollector(collectSnapshot, request, phase === "before" ? 1 : 2, `hydrate_${phase}`, adapter);
      return result;
    }

    function hydrateBody(input) {
      const request = plain(input) ? input : {};
      if (!currentSnapshot) return Promise.resolve(failure("snapshot", "snapshot_unavailable"));
      if (!readBody) return Promise.resolve(failure("readBody", "body_reader_required"));
      const requestedPath = safePath(adapter, request.path);
      if (!requestedPath) return Promise.resolve(failure("path", "unsafe_path"));
      const prefix = prefixFor(adapter, requestedPath, currentSnapshot);
      if (!prefix) return Promise.resolve(failure("path", "wrong_prefix"));
      if (trim(request.snapshot_revision) !== revisionOf(currentSnapshot)) {
        return Promise.resolve(stale("stale_snapshot", {
          path: requestedPath,
          snapshot_revision: trim(request.snapshot_revision),
          current_revision: revisionOf(currentSnapshot),
        }));
      }
      const row = rowFor(currentSnapshot, requestedPath);
      if (!row) return Promise.resolve(failure("path", "unknown_path", { path: requestedPath }));
      const expectedRowRevision = trim(request.row_revision || request.revision);
      const actualRowRevision = rowRevision(row);
      if (!expectedRowRevision) return Promise.resolve(failure("row_revision", "row_revision_required", { path: requestedPath }));
      if (!actualRowRevision || expectedRowRevision !== actualRowRevision) {
        return Promise.resolve(stale("stale_row_revision", {
          path: requestedPath,
          snapshot_revision: revisionOf(currentSnapshot),
          row_revision: expectedRowRevision,
          current_row_revision: actualRowRevision,
        }));
      }
      const key = cacheKey(revisionOf(currentSnapshot), requestedPath, actualRowRevision);


      const snapshotRevision = revisionOf(currentSnapshot);
      const publishedCurrent = currentOf(currentSnapshot);
      const payload = {
        path: requestedPath,
        row,
        snapshot: currentSnapshot,
        snapshot_revision: snapshotRevision,
        row_revision: actualRowRevision,
      };
      const cached = cache.get(key);
      if (cached) {
        return currentRevision("before", payload).then((before) => {
          const beforeRevision = revisionOf(before);
          const beforeCurrent = currentOf(before);
          const beforeRow = rowFor(before, requestedPath);
          if (!before || before.ok === false || beforeRevision !== snapshotRevision || beforeCurrent !== publishedCurrent
            || !beforeRow || rowRevision(beforeRow) !== actualRowRevision) {
            cache.delete(key);
            return stale("stale_snapshot", {
              path: requestedPath,
              cache_key: key,
              snapshot_revision: snapshotRevision,
              current_revision: beforeCurrent,
            });
          }
          return cached;
        }, () => {
          cache.delete(key);
          return failure("snapshot", "snapshot_collection_failed");
        });
      }
      const pending = (async () => {
        const before = await currentRevision("before", payload);
        if (!before || before.ok === false) return before || failure("snapshot", "snapshot_collection_failed");
        const beforeRevision = revisionOf(before);
        const beforeCurrent = currentOf(before);
        const beforeRow = rowFor(before, requestedPath);
        if (beforeRevision !== snapshotRevision || beforeCurrent !== publishedCurrent
          || !beforeRow || rowRevision(beforeRow) !== actualRowRevision) {
          return stale("stale_snapshot", {
            path: requestedPath,
            cache_key: key,
            snapshot_revision: snapshotRevision,
            current_revision: beforeCurrent,
          });
        }
        let body;
        let bodyError = false;
        try {
          body = await readBody(readArgument(readBody, payload), row, payload);
        } catch (_) {
          bodyError = true;
        }
        const after = await currentRevision("after", payload);
        if (!after || after.ok === false) return after || failure("snapshot", "snapshot_collection_failed");
        const afterRevision = revisionOf(after);
        const afterCurrent = currentOf(after);
        const afterRow = rowFor(after, requestedPath);
        if (afterRevision !== snapshotRevision || afterCurrent !== publishedCurrent
          || !afterRow || rowRevision(afterRow) !== actualRowRevision) {
          return stale("stale_snapshot", {
            path: requestedPath,
            cache_key: key,
            snapshot_revision: snapshotRevision,
            current_revision: afterCurrent,
          });
        }
        if (bodyError) {
          return safeBodyResult("error", {
            path: requestedPath,
            cache_key: key,
            snapshot_revision: snapshotRevision,
            row_revision: actualRowRevision,
            reason: "body_read_failed",
          });
        }
        if (typeof body !== "string" || body.length === 0) {
          return safeBodyResult("empty", {
            path: requestedPath,
            cache_key: key,
            snapshot_revision: snapshotRevision,
            row_revision: actualRowRevision,
            body: "",
          });
        }
        return safeBodyResult("ready", {
          path: requestedPath,
          cache_key: key,
          snapshot_revision: snapshotRevision,
          row_revision: actualRowRevision,
          body,
        });
      })();
      cache.set(key, pending);
      pending.then((result) => {
        if (cache.get(key) !== pending) return;
        if (!result || !["ready", "empty"].includes(result.status)) cache.delete(key);
      }, () => {
        if (cache.get(key) === pending) cache.delete(key);
      });
      return pending;
    }

    function createRevalidationCandidate(documentIdValue, pathValue, snapshotRevisionValue, canonicalRevisionValue) {
      if ([documentIdValue, pathValue, snapshotRevisionValue, canonicalRevisionValue].some((value) => typeof value !== "string")) {
        return failure("candidate", "primitive_candidate_fields_required");
      }
      const documentId = trim(documentIdValue);
      const path = safePath(adapter, pathValue);
      const snapshotRevision = trim(snapshotRevisionValue);
      const canonicalRevision = trim(canonicalRevisionValue);
      if (!documentId || !path || !snapshotRevision || !canonicalRevision) return failure("candidate", "invalid_revalidation_candidate");
      if (retrievalAuthority !== true) return failure("candidate", "retrieval_authority_required");
      const candidate = deepFreeze({ document_id: documentId, path, snapshot_revision: snapshotRevision, canonical_revision: canonicalRevision });
      REVALIDATION_REQUESTS.add(candidate);
      REVALIDATION_OWNERS.set(candidate, revalidationOwner);
      return candidate;
    }

    function getRevalidationReaderCapability() {
      return revalidationReader;
    }

    async function revalidateCandidate(input, readerCapability) {
      const inputObject = Boolean(input) && (typeof input === "object" || typeof input === "function");
      const readerObject = Boolean(readerCapability) && (typeof readerCapability === "object" || typeof readerCapability === "function");
      if (!inputObject || !REVALIDATION_REQUESTS.has(input) || REVALIDATION_OWNERS.get(input) !== revalidationOwner) {
        return failure("candidate", "untrusted_revalidation_candidate");
      }
      if (!readerObject || !REVALIDATION_READERS.has(readerCapability)
        || REVALIDATION_OWNERS.get(readerCapability) !== revalidationOwner) {
        return failure("reader", "untrusted_revalidation_reader");
      }
      const request = input;
      if (!currentSnapshot) return failure("snapshot", "snapshot_unavailable");
      const requestedRevision = trim(request.snapshot_revision);
      const snapshotRevision = revisionOf(currentSnapshot);
      if (!requestedRevision || requestedRevision !== snapshotRevision) {
        return stale("stale_snapshot", { snapshot_revision: requestedRevision, current_revision: snapshotRevision });
      }
      const requestedPath = request.path === undefined ? "" : safePath(adapter, request.path);
      if (request.path !== undefined && !requestedPath) return failure("path", "unsafe_path");
      const documentId = trim(request.document_id);
      const publishedRow = rowsFor(currentSnapshot).find((row) => row
        && ((requestedPath && row.path === requestedPath) || (documentId && trim(row.document_id) === documentId))) || null;
      if (!publishedRow) return stale("canonical_candidate_missing", { path: requestedPath || undefined, document_id: documentId || undefined });
      const checked = await currentRevision("before", { ...request, row: publishedRow, snapshot: currentSnapshot });
      if (!checked || checked.ok === false) return checked || failure("snapshot", "snapshot_collection_failed");
      const currentRow = rowsFor(checked).find((row) => row
        && ((requestedPath && row.path === requestedPath) || (documentId && trim(row.document_id) === documentId))) || null;
      if (revisionOf(checked) !== snapshotRevision || currentOf(checked) !== currentOf(currentSnapshot) || !currentRow
        || rowRevision(currentRow) !== rowRevision(publishedRow)) {
        return stale("canonical_candidate_missing", {
          path: requestedPath || undefined,
          document_id: documentId || undefined,
          snapshot_revision: snapshotRevision,
          current_revision: currentOf(checked),
        });
      }
      const result = deepFreeze({
        ok: true,
        status: "current",
        row: cloneValue(currentRow),
        snapshot_revision: snapshotRevision,
        canonical_revision: rowRevision(currentRow),
        stale_rechecked: Boolean(trim(request.canonical_revision || request.row_revision))
          && trim(request.canonical_revision || request.row_revision) !== rowRevision(currentRow),
        writer_count: 0,
        provider_count: 0,
      });
      REVALIDATED_CANDIDATES.add(result);
      return result;
    }

    function clearCache() {
      const size = cache.size;
      cache.clear();
      return deepFreeze({ ok: true, status: "cleared", cleared: size, writer_count: 0, provider_count: 0 });
    }

    const service = Object.freeze({
      publishSnapshot,
      getSnapshot,
      getRetrievalSnapshot,
      browseRead,
      hydrateBody,
      createRevalidationCandidate,
      getRevalidationReaderCapability,
      revalidateCandidate,
      clearCache,
    });
    if (retrievalAuthority === true) READ_SERVICES.add(service);
    return service;
  }

  function createRetrievalReadService(collectSerializedSnapshot, options = {}) {
    if (typeof collectSerializedSnapshot !== "function") return create({}, false);
    const collectSnapshot = async (input) => {
      let serialized;
      try { serialized = collectSerializedSnapshot(input); } catch (_) { return failure("snapshot", "snapshot_collection_failed"); }
      if (typeof serialized !== "string") return failure("snapshot", "serialized_snapshot_required");
      if (!serialized || serialized.length > 8 * 1024 * 1024) return failure("snapshot", "serialized_snapshot_limit_exceeded");
      let parsed;
      try { parsed = JSON.parse(serialized); }
      catch (_) { return failure("snapshot", "invalid_serialized_snapshot"); }
      if (!plain(parsed)) return failure("snapshot", "invalid_serialized_snapshot");
      if (!options.app) return parsed;
      const readApi = root.LLMWikiResurfacingReadAdapter || (typeof require === "function" ? require("./llmwiki-resurfacing-read-adapter.js") : null);
      if (!readApi || typeof readApi.create !== "function") return failure("snapshot", "trusted_audit_reader_required");
      const durable = await readApi.create().read({ app: options.app, signal: input && input.signal });
      if (!durable || durable.ok !== true) return failure("snapshot", durable && durable.reason || "trusted_audit_reader_required");
      const adapter = adapterFor();
      if (!adapter || typeof adapter.buildSnapshot !== "function") return failure("snapshot", "adapter_unavailable");
      return adapter.buildSnapshot({
        collection_revision: trim(parsed.snapshot_revision || parsed.current_revision),
        assets: durable.rows,
        unavailable_source_ids: parsed.unavailable_source_ids,
        conflicts: parsed.conflicts,
      });
    };
    return create({ collectSnapshot }, true);
  }

  function isRetrievalReadService(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function") && READ_SERVICES.has(value);
  }

  function isRetrievalSnapshot(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function") && RETRIEVAL_SNAPSHOTS.has(value);
  }

  function isRevalidatedCandidate(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function") && REVALIDATED_CANDIDATES.has(value);
  }

  const QUESTION_ANSWERS = new WeakSet();
  const QUESTION_PROPOSALS = new WeakMap();
  const QUESTION_VERIFIED_ROWS = new WeakMap();
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  function questionProvider() { return root.LLMWikiBatchProvider || (typeof require === "function" ? require("./llmwiki-batch-provider.js") : null); }
  function questionFailure(reason, extras = {}) { return { ok: false, reason, writer_count: 0, ...extras }; }

  function parseDocMentions(question) {
    const mentions = [];
    const seen = new Set();
    const push = (candidate) => {
      const cleaned = String(candidate || "").replace(/[.,;:!?)\]]+$/u, "");
      if (cleaned && !seen.has(cleaned)) { seen.add(cleaned); mentions.push(cleaned); }
    };
    const text = String(question || "");
    const quoted = /@"([^"]+)"/gu;
    let match;
    while ((match = quoted.exec(text)) !== null) push(match[1]);
    const unquoted = text.replace(/@"[^"]+"/gu, " ");
    const bare = /(?:^|\s)@([^\s@][^\s]*)/gu;
    while ((match = bare.exec(unquoted)) !== null) push(match[1]);
    return mentions;
  }
  async function resolveReadableWikiScope({ app, verified_paths } = {}) {
    if (verified_paths === undefined || verified_paths === null) return { ok: true, status: "open", rows: [], unresolved: [] };
    const wanted = [...new Set((Array.isArray(verified_paths) ? verified_paths : [verified_paths]).filter((entry) => typeof entry === "string" && entry))];
    if (!wanted.length) return { ok: true, status: "empty", reason: "verified_scope_empty", rows: [], unresolved: [] };
    const readApi = root.LLMWikiResurfacingReadAdapter || (typeof require === "function" ? require("./llmwiki-resurfacing-read-adapter.js") : null);
    if (!readApi?.create) return { ok: false, reason: "retrieval_unavailable" };
    const read = await readApi.create().read({ app });
    if (!read.ok) return { ok: false, reason: read.reason };
    const byPath = new Map(read.rows.map((row) => [row.path, row]));
    const heldApi = root.LLMWikiWikiReadAdapter || (typeof require === "function" ? require("./llmwiki-wiki-read-adapter.js") : null);
    const rows = [], unresolved = [];
    for (const candidate of wanted) {
      const row = byPath.get(candidate);
      if (!row) {
        unresolved.push(candidate);
        continue;
      }
      if (heldApi && typeof heldApi.isPrivacyHeldCanonical === "function" && heldApi.isPrivacyHeldCanonical(row, null)) continue;
      rows.push(row);
    }
    if (!rows.length) return { ok: true, status: "empty", reason: "verified_scope_unreadable", rows, unresolved };
    return { ok: true, status: "ready", rows, unresolved };
  }
  async function answerSourceQuestion(options) {
    const started = performance.now(), app = options.app || root.app;
    const progress = stage => { if (typeof options.onProgress === "function") options.onProgress(stage); };
    const fail = (reason, stage) => ({ ok: false, reason, stage, writer_count: 0 });
    const history = Array.isArray(options.history) ? options.history : [];
    if (history.length > 30 || new TextEncoder().encode(JSON.stringify(history)).length > 65536) return fail("context_limit", "context");
    if (history.some(row => !["user", "assistant"].includes(row.role) || typeof row.body !== "string")) return fail("invalid_history", "context");
    const adapter = root.LLMWikiWikiReadAdapter || (typeof require === "function" ? require("./llmwiki-wiki-read-adapter.js") : null);
    const retrievalQuestion = [options.question, ...history.filter(row => row.role === "user").map(row => row.body)].join(" ");
    if (retrievalQuestion.length > 2000) return fail("context_limit", "context");
    const sources = [...(Array.isArray(options.sources) ? options.sources : options.source ? [options.source] : [])];
    const docMentions = parseDocMentions(options.question);
    const explicitVerifiedPaths = [...new Set([...(Array.isArray(options.verified_paths) ? options.verified_paths : []), ...docMentions])];
    let scopeInfo = { requested_paths: explicitVerifiedPaths, resolved_paths: [], unresolved_paths: [] };
    let verifiedRows = [];
    if (explicitVerifiedPaths.length) {
      const scoped = await resolveReadableWikiScope({ app, verified_paths: explicitVerifiedPaths });
      if (!scoped.ok) return fail(scoped.reason, "source");
      scopeInfo = { requested_paths: explicitVerifiedPaths, resolved_paths: scoped.rows.map((row) => row.path), unresolved_paths: scoped.unresolved };
      if (scoped.unresolved.length) {
        return { ok: true, status: "abstain", reason: scoped.reason || "no_relevant_evidence", answers: [], provider_count: 0, writer_count: 0, scope: scopeInfo };
      }
      for (const row of scoped.rows) if (!sources.some((source) => source.path === row.path)) sources.push({ path: row.path, content_hash: row.canonical_revision, verified_row: row });
      if (!scoped.rows.length && !sources.length) {
        return { ok: true, status: "abstain", reason: scoped.reason || "no_relevant_evidence", answers: [], provider_count: 0, writer_count: 0, scope: scopeInfo };
      }
      verifiedRows = scoped.rows;
    }
    if (options.includeVerified === true) {
      const readApi = root.LLMWikiResurfacingReadAdapter || (typeof require === "function" ? require("./llmwiki-resurfacing-read-adapter.js") : null);
      if (!readApi?.create) return fail("retrieval_unavailable", "source");
      const read = await readApi.create().read({ app, signal: options.signal });
      if (!read.ok) return fail(read.reason, "source");
      const verifiedSnapshot = adapter.buildSnapshot({ assets: read.rows.map(row => ({ ...row, source_revisions: row.sources, body: row.canonical_bytes })) });
      const matches = adapter.browseRead({ snapshot: verifiedSnapshot, mode: "verified", query: retrievalQuestion,
        queryRead: root.LLMWikiQueryReadOnly || (typeof require === "function" ? require("./llmwiki-query-readonly.js") : null) });
      if (!matches.ok) return fail(matches.reason, "retrieval");
      verifiedRows = [...verifiedRows, ...matches.rows.slice(0, Math.max(0, 4 - sources.length)).map(match => read.rows.find(row => row.path === match.path)).filter(Boolean).filter((row) => !verifiedRows.some((scoped) => scoped.path === row.path))];
      for (const row of verifiedRows) if (!sources.some(source => source.path === row.path)) sources.push({ path: row.path, content_hash: row.canonical_revision, verified_row: row });
    }
    if (!sources.length) return options.includeVerified ? { ok: true, status: "abstain", reason: "no_relevant_evidence", answers: [], provider_count: 0, writer_count: 0 } : fail("source_selection_required", "source");
    if (sources.length > 4) return fail("context_limit", "context");
    const sourceTexts = new Map(), contexts = [];
    // Prior user questions help resolve references. Assistant text is context,
    // never retrieval evidence; scope reductions clear this history in the UI.
    progress("source_ready");
    for (const source of sources) {
      if (!source?.path || !source.content_hash) return fail("source_selection_required", "source");
      const file = app?.vault?.getAbstractFileByPath(source.path);
      if (!file) return fail("source_unavailable", "source");
      let sourceText;
      try { sourceText = await app.vault.read(file); } catch (_) { return fail("source_unavailable", "source"); }
      if (hashApi.sha256(sourceText) !== source.content_hash) return fail("source_revision_changed", "source");
      sourceTexts.set(source.path, sourceText);
      progress("searching");
      const context = adapter.prepareQuestionContext({ source_path: source.path, source_text: sourceText,
        source_id: `source_${hashApi.sha256(source.path).slice(0, 24)}`, content_hash: source.content_hash,
        metadata: app.metadataCache?.getFileCache(file)?.frontmatter || {}, question: retrievalQuestion, verified_row: source.verified_row, include_selected_evidence: sources.filter(row => !row.verified_row).length > 1 });
      if (!context.ok) return fail(context.reason, "retrieval");
      contexts.push(context);
    }
    const evidence = contexts.flatMap(context => context.evidence);
    if (evidence.length > 4 || new TextEncoder().encode(JSON.stringify(evidence)).length > 32768) return fail("context_limit", "context");
    const context = { ok: true, question: String(options.question || "").trim(), history: history.map(row => ({ role: row.role, body: row.body })),
      evidence: evidence.map((item, index) => ({ ...item, key: `question_evidence_${index + 1}` })),
      coverage_complete: contexts.every(row => row.coverage_complete),
      status: evidence.length ? "ready" : "abstain", reason: evidence.length ? null : "no_relevant_evidence",
      timings: Object.fromEntries(["projection", "retrieval", "context_assembly"].map(key => [key, contexts.reduce((total, row) => total + row.timings[key], 0)])),
      source_scope: sources.map(source => ({ path: source.path, content_hash: source.content_hash, trust: source.verified_row ? "verified" : "literature" })), writer_count: 0,
      scope: scopeInfo };
    const source = sources[0];
    context.evidence.forEach(Object.freeze);
    Object.freeze(context.evidence); Object.freeze(context.timings); deepFreeze(context);
    if (!context.evidence.length) return { ...context, answers: [], provider_count: 0, timings: { ...context.timings, provider: 0, parsing: 0, validation: 0, total: performance.now() - started } };
    const runId = `question_${hashApi.sha256(`${source.content_hash}:${context.question}:${Date.now()}`).slice(0, 24)}`;
    progress("calling_provider");
    const providerStart = performance.now();
    const result = await questionProvider().createBatchAnalysisProvider({ app })({ run_id: runId, outbound_allowed: true,
      chunks: context.evidence.map(item => ({ key: item.key, text: item.excerpt })), candidate_ids: [], question_context: context },
      { signal: options.signal, confirmConsent: options.confirmConsent, ownerSessionId: runId, operationId: runId, attemptId: "attempt-1" });
    const providerMs = performance.now() - providerStart;
    if (!result.ok) {
      const schemaFailure = !result.reason.startsWith("provider_") && !["transport_unavailable", "consent_required"].includes(result.reason);
      const reason = result.reason === "malformed_json" ? "provider_response_parse_failed" : schemaFailure ? "provider_schema_invalid" : result.reason;
      return { ...result, reason, detail: result.detail || result.reason, stage: schemaFailure ? "validation" : "provider", context, timings: { ...context.timings, provider: providerMs } };
    }
    progress("validating_answer");
    const validationStart = performance.now();
    if (options.signal?.aborted) return fail("provider_aborted", "validation");
    for (const source of sources) {
      const currentFile = app.vault.getAbstractFileByPath(source.path);
      if (!currentFile) return fail("source_unavailable", "validation");
      let currentBytes;
      try { currentBytes = await app.vault.read(currentFile); } catch (_) { return fail("source_unavailable", "validation"); }
      if (hashApi.sha256(currentBytes) !== source.content_hash) return fail("source_revision_changed", "validation");
    }
    const answers = [];
    for (const artifact of result.artifacts) {
      const evidence = context.evidence.find(item => item.key === artifact.chunk_key);
      for (const item of artifact.items) {
        // A held pack may contain supported answers alongside irrelevant held
        // items. They remain unapproved answers, never an approval decision.
        if (artifact.outcome === "no_change" || item.role === "hold") continue;
        if (!evidence || evidence.excerpt.slice(item.span.start, item.span.end) !== item.evidence_quote) return fail("provider_schema_invalid", "validation");
        const quoteStart = evidence.start + item.span.start;
        const firstLine = sourceTexts.get(evidence.source_path).slice(0, quoteStart).split("\n").length;
        const lastLine = firstLine + item.evidence_quote.split("\n").length - 1;
        for (const claim of item.claims) answers.push(Object.freeze({ text: claim.text, title: item.topic || context.question,
          citation: Object.freeze({ ...evidence, start: quoteStart, locator: `${evidence.source_path}#L${firstLine}-L${lastLine}`, excerpt: item.evidence_quote }), confidence: "inferred", review_reasons: item.review_reasons }));
      }
    }
    const groupedAnswers = new Map();
    for (const row of answers) { if (!groupedAnswers.has(row.title)) groupedAnswers.set(row.title, []); groupedAnswers.get(row.title).push(row.text); }
    const conversationText = [...groupedAnswers].map(([title, texts], index) => `${index + 1}. ${title}\n${texts.map(text => `- ${text}`).join("\n")}`).join("\n");
    const answer = Object.freeze({ conversation_text: conversationText, ok: true, status: answers.length ? "proposed" : "abstain", reason: answers.length ? null : "no_relevant_evidence",
      source_scope: context.source_scope,
      scope: context.scope,
      run_id: runId, question: context.question, context, answers: Object.freeze(answers), source_path: source.path, content_hash: source.content_hash,
      review_notes: Object.freeze([...new Set(result.artifacts.flatMap(artifact => artifact.items.flatMap(item => item.review_reasons)))]),
      provider_count: 1, writer_count: 0, timings: { ...context.timings, provider: providerMs, parsing: 0,
        validation: performance.now() - validationStart, total: performance.now() - started } });
    deepFreeze(answer);
    if (verifiedRows.length) {
      const rereadApi = root.LLMWikiResurfacingReadAdapter || (typeof require === "function" ? require("./llmwiki-resurfacing-read-adapter.js") : null);
      const reread = rereadApi?.create ? await rereadApi.create().read({ app }) : { ok: false };
      const revisions = new Map(reread.ok ? reread.rows.map((row) => [row.path, row.canonical_revision]) : []);
      for (const row of verifiedRows) {
        if (revisions.get(row.path) !== row.canonical_revision) {
          return fail("source_revision_changed", "answer");
        }
      }
    }
    QUESTION_VERIFIED_ROWS.set(answer, verifiedRows);
    QUESTION_ANSWERS.add(answer);
    return answer;
  }

  async function validateQuestionCitation(options) {
    const citation = options.citation || {}, app = options.app || root.app;
    const adapter = adapterFor();
    const path = safePath(adapter, citation.source_path || String(citation.locator || "").split("#")[0]);
    const quote = citation.excerpt || citation.evidence_quote;
    if (!path || !citation.content_hash || typeof quote !== "string" || !quote) return questionFailure("source_unavailable", { stage: "citation" });
    const file = app?.vault?.getAbstractFileByPath(path);
    if (!file) return questionFailure("source_unavailable", { stage: "citation" });
    let bytes;
    try { bytes = await app.vault.read(file); } catch (_) { return questionFailure("source_unavailable", { stage: "citation" }); }
    if (hashApi.sha256(bytes) !== citation.content_hash) return questionFailure("source_revision_changed", { stage: "citation" });
    const location = /^#L(\d+)(?:-L(\d+))?$/u.exec(String(citation.locator || "").slice(path.length));
    if (!String(citation.locator || "").startsWith(path) || !location) return questionFailure("source_unavailable", { stage: "citation" });
    const line = Number(location[1]), lines = bytes.split("\n");
    const lineOffset = lines.slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0);
    const start = Number.isSafeInteger(citation.start) ? citation.start : bytes.indexOf(quote, lineOffset);
    if (line < 1 || line > lines.length || start < 0 || bytes.slice(start, start + quote.length) !== quote
      || bytes.slice(0, start).split("\n").length !== line
      || location[2] && Number(location[2]) !== line + quote.split("\n").length - 1) return questionFailure("source_unavailable", { stage: "citation" });
    return { ok: true, status: "current", source_path: path, content_hash: citation.content_hash, writer_count: 0 };
  }

  async function validateQuestionEvidence(options) {
    const answer = options.answer, app = options.app || root.app;
    if (!QUESTION_ANSWERS.has(answer)) return questionFailure("proposal_validation_failed");
    for (const source of answer.source_scope || [{ path: answer.source_path, content_hash: answer.content_hash }]) {
      const file = app?.vault?.getAbstractFileByPath(source.path);
      if (!file) return questionFailure("source_unavailable", { stage: "source" });
      let bytes;
      try { bytes = await app.vault.read(file); } catch (_) { return questionFailure("source_unavailable", { stage: "source" }); }
      if (hashApi.sha256(bytes) !== source.content_hash) return questionFailure("source_revision_changed", { stage: "source" });
    }
    const citations = options.proposal?.grounded_claims?.flatMap(claim => claim.citations) || answer.answers.map(row => row.citation);
    for (const citation of citations) { const checked = await validateQuestionCitation({ app, citation }); if (!checked.ok) return checked; }
    return { ok: true, status: "current", writer_count: 0 };
  }

  async function prepareQuestionProposal(options) {
    const started = performance.now(), answer = options.answer, app = options.app || root.app;
    if (!QUESTION_ANSWERS.has(answer) || !answer.answers.length) return questionFailure("proposal_validation_failed");
    const proposalAnswers = [];
    const verifiedRows = QUESTION_VERIFIED_ROWS.get(answer) || [];
    const obsidianApi = root.LLMWikiObsidianAdapter || (typeof require === "function" ? require("./llmwiki-obsidian-adapter.js") : null);
    for (const row of answer.answers) {
      if (row.citation.trust !== "verified") { proposalAnswers.push(row); continue; }
      const original = verifiedRows.find(item => item.path === row.citation.source_path);
      const binding = original && obsidianApi.finalizedCanonicalAuthorityData(original.trust_receipt);
      const claimSet = binding?.canonical_v2_authority?.claim_set;
      // A paraphrase cannot mint new lineage from an arbitrary Wiki paragraph.
      // Only an already accepted exact claim is restored to its source graph.
      const matched = claimSet?.claims.filter(claim => claim.status === "accepted" && claim.text.trim() === row.text.trim()) || [];
      if (!matched.length) return questionFailure("document_review_required", { detail: "기존 승인 주장과 정확히 연결되지 않은 답변입니다. 원자료를 선택하여 문서 변경 검토를 진행해 주세요." });
      const lineage = (claim, seen = new Set()) => {
        if (!claim || seen.has(claim.claim_id)) return []; seen.add(claim.claim_id);
        return [...(claim.citation_ids || []), ...(claim.derived_from_claim_ids || []).flatMap(id => lineage(claimSet.claims.find(item => item.claim_id === id), seen))];
      };
      const ids = [...new Set(matched.flatMap(claim => lineage(claim)))];
      if (!ids.length) return questionFailure("document_review_required", { detail: "원자료 lineage를 확인할 수 없습니다." });
      for (const id of ids) {
        const bound = claimSet.citations.find(citation => citation.citation_id === id);
        const source = claimSet.sources.find(source => source.source_id === bound?.source_id);
        const marker = `[${bound?.source_id}](`;
        const markerStart = original.canonical_bytes.indexOf(marker);
        const markerEnd = markerStart < 0 ? -1 : original.canonical_bytes.indexOf(")", markerStart + marker.length);
        const linked = markerEnd < 0 ? "" : original.canonical_bytes.slice(markerStart + marker.length, markerEnd);
        const fallback = (original.citations || []).find(citation => citation.source_id === bound?.source_id)?.locator || "";
        const sourcePath = (linked || fallback).split("#")[0];
        const file = sourcePath && app.vault.getAbstractFileByPath(sourcePath);
        if (!file) return questionFailure("source_unavailable", { stage: "source" });
        let bytes;
        try { bytes = await app.vault.read(file); } catch (_) { return questionFailure("source_unavailable", { stage: "source" }); }
        const span = bound?.source_span;
        if (!source || !file || !span || hashApi.sha256(bytes) !== source.source_content_hash
          || hashApi.sha256(bytes.slice(span.start, span.end)) !== bound.span_digest) return questionFailure("source_revision_changed");
        const quote = bytes.slice(span.start, span.end), firstLine = bytes.slice(0, span.start).split("\n").length;
        proposalAnswers.push({ ...row, citation: { source_id: bound.source_id, source_path: sourcePath,
          content_hash: source.source_content_hash, excerpt: quote, start: span.start,
          locator: `${sourcePath}#L${firstLine}-L${firstLine + quote.split("\n").length - 1}`, trust: "literature" } });
      }
    }
    for (const source of answer.source_scope || [{ path: answer.source_path, content_hash: answer.content_hash }]) {
      const file = app.vault.getAbstractFileByPath(source.path);
      if (!file) return questionFailure("source_unavailable", { stage: "source" });
      let bytes;
      try { bytes = await app.vault.read(file); } catch (_) { return questionFailure("source_unavailable", { stage: "source" }); }
      if (hashApi.sha256(bytes) !== source.content_hash) return questionFailure("source_revision_changed", { stage: "source" });
    }
    const bundleApi = root.LLMWikiProposalBundle || (typeof require === "function" ? require("./llmwiki-proposal-bundle.js") : null);
    if (!bundleApi) return questionFailure("proposal_validation_failed", { detail: "proposal_contract_unavailable" });
    // Preserve the grounded answer set together: conditions and opposing
    // evidence cannot safely be inferred from just the first sentence.
    const chosen = proposalAnswers[0], citation = chosen.citation;
    const sourceCitations = [...new Set(proposalAnswers.map(row => row.citation.source_id))].map(sourceId => ({
      source_id: sourceId, content_hash: proposalAnswers.find(row => row.citation.source_id === sourceId).citation.content_hash,
      locators: [...new Set(proposalAnswers.filter(row => row.citation.source_id === sourceId).map(row => row.citation.locator))], confidence: "explicit" }));
    const built = bundleApi.buildProposalBundle({ run_id: answer.run_id,
      validation_context: { source_text_authority: "untrusted_data_only", source_hash: answer.content_hash },
      proposals: [{ kind: "create", title: chosen.title, status: "proposed", confidence: chosen.confidence,
        source_citations: sourceCitations,
        claims: [...new Set(proposalAnswers.map(row => row.text))].map(text => ({ claim_id: `claim_${hashApi.sha256(text).slice(0, 24)}`, text, source_ids: [...new Set(proposalAnswers.filter(row => row.text === text).map(row => row.citation.source_id))] })),
        conflicts: [] }] });
    if (!built.ok) return questionFailure("proposal_validation_failed", { detail: { validator: "buildProposalBundle", field: built.field, reason: built.reason } });
    const proposal = built.value.proposals[0];
    const userContext = (answer.context.history || []).filter(row => row.role === "user").map(row => row.body);
    // Runtime-owned identities, links and approval metadata complement the
    // unchanged provider semantic schema. They confer no approval authority.
    const librarianPacket = Object.freeze({ run_id: answer.run_id, proposal_id: proposal.proposal_id,
      payload_hash: proposal.payload_hash, status: "proposed", kind: "create", citations: proposal.source_citations,
      locators: sourceCitations.flatMap(row => row.locators), confidence: chosen.confidence, entity_links: [], theme_links: [], material_links: sourceCitations.map(row => row.source_id),
      graph: { nodes: [{ id: proposal.proposal_id, type: "proposal" }, ...sourceCitations.map(row => ({ id: row.source_id, type: "material" }))],
        edges: sourceCitations.map(row => ({ from: proposal.proposal_id, to: row.source_id, relation: "cites" })) },
      lint: { findings: [{ code: "canonical_comparison_not_performed", severity: "review" }] }, contradictions: [],
      approval: { required: true, approver: "human", model_output_can_approve: false, canonical_promotion: "user_approved_deterministic_commit_only" }, refusals: [] });
    const prepared = Object.freeze({ ok: true, status: "proposed", proposal_bundle: built.value, librarian_packet: librarianPacket,
      review_id: proposal.proposal_id, title: answer.question,
      document_body: `# ${answer.question}\n\n${[...new Set(proposalAnswers.map(row => row.text))].map(text => `- ${text}`).join("\n")}\n\n${answer.review_notes?.length ? `## 확인 필요\n\n${answer.review_notes.map(note => `- ${note}`).join("\n")}\n\n` : ""}## 출처\n\n${sourceCitations.flatMap(row => row.locators).map(locator => `- ${locator}`).join("\n")}\n${userContext.length ? `\n## 사용자 제공 맥락 — 출처 검증 아님\n\n${userContext.map(body => `- ${body.replace(/\n/g, "\n  ")}`).join("\n")}\n` : ""}`,
      user_context: userContext,
      grounded_claims: [...new Set(proposalAnswers.map(row => row.text))].map(text => ({ text, citations: proposalAnswers.filter(row => row.text === text).map(row => ({ source_id: row.citation.source_id,
        source_path: row.citation.source_path, locator: row.citation.locator, content_hash: row.citation.content_hash, evidence_quote: row.citation.excerpt })) })),
      contains_verified_context: false, uses_canonical_provenance: answer.answers.some(row => row.citation.trust === "verified"),
      source_path: citation.source_path, content_hash: citation.content_hash, evidence: citation, evidence_items: proposalAnswers.map(row => row.citation),
      review_notes: answer.review_notes, related_knowledge: verifiedRows.map(row => ({ path: row.path, title: row.title, canonical_id: row.canonical_id })),
      comparison_status: "not_checked", writer_count: 0, timings: { ...answer.timings, proposal_assembly: performance.now() - started } });
    deepFreeze(prepared);
    QUESTION_PROPOSALS.set(prepared, answer);
    return prepared;
  }

  async function handoffQuestionProposal(options) {
    const started = performance.now(), prepared = options.proposal, answer = QUESTION_PROPOSALS.get(prepared);
    if (!answer || !options.materializer || !options.controller) return questionFailure("review_handoff_failed");
    if (new Set(answer.answers.map(row => row.citation.source_path)).size > 1 || answer.answers.some(row => row.citation.trust === "verified") || (answer.context.history || []).length)
      return questionFailure("document_review_required", { detail: "Use the existing document change review to preserve multi-source provenance." });
    if (options.controller.getSnapshot().risk_packets?.length) return questionFailure("existing_review_must_resolve_first");
    const answerSource = answer.answers[0].citation;
    const file = options.app.vault.getAbstractFileByPath(answerSource.source_path);
    if (!file) return questionFailure("source_unavailable", { stage: "source" });
    let sourceText;
    try { sourceText = await options.app.vault.read(file); } catch (_) { return questionFailure("source_unavailable", { stage: "source" }); }
    if (hashApi.sha256(sourceText) !== answerSource.content_hash) return questionFailure("source_revision_changed");
    const citation = answer.answers[0].citation;
    const items = [];
    for (const row of answer.answers) {
      const quote = row.citation;
      const span = { start: quote.start, end: quote.start + quote.excerpt.length };
      if (sourceText.slice(span.start, span.end) !== quote.excerpt) return questionFailure("proposal_validation_failed");
      // One shared topic keeps the complete answer in one document while each
      // statement retains its own exact evidence span.
      items.push({ role: "reusable_claim", topic: answer.question, evidence_quote: quote.excerpt,
        claims: [{ text: row.text }], review_reasons: [...(row.review_reasons || [])], related_candidate_ids: [],
        span: { ...span, alias: questionProvider().spanAlias("question_claim", sourceText, span, quote.excerpt) } });
    }
    // Held evidence may carry uncertainty absent from supported claims. Keep
    // those provider observations as review notes, never verified assertions.
    for (const note of answer.review_notes || []) {
      if (items.some(item => item.review_reasons.includes(note))) continue;
      const item = items.find(row => row.review_reasons.length < 4);
      if (!item) return questionFailure("proposal_validation_failed", { detail: "review_notes_capacity_exceeded" });
      item.review_reasons = [...item.review_reasons, note];
    }
    const materialized = options.materializer.materialize({ source: { source_id: citation.source_id,
      source_path: answerSource.source_path, content_hash: answerSource.content_hash }, artifacts: Array.from({ length: Math.ceil(items.length / 8) }, (_, index) => ({
        chunk_key: `question_claim_${index}`, outcome: "proposals", items: items.slice(index * 8, index * 8 + 8).map(item => ({
          ...item, span: { ...item.span, alias: questionProvider().spanAlias(`question_claim_${index}`, sourceText, item.span, item.evidence_quote) } })) })) });
    if (!materialized.ok || !materialized.proposals.length) return questionFailure("proposal_validation_failed", { detail: materialized.reason || "no_change" });
    const opened = options.controller.openPreparedRiskReview({ run_id: answer.run_id, proposals: materialized.proposals });
    if (!opened.ok) return questionFailure("review_handoff_failed", { detail: opened.reason });
    return { ok: true, status: "review", writer_count: 0, packets: options.controller.getSnapshot().risk_packets,
      timings: { ...prepared.timings, review_handoff: performance.now() - started } };
  }

  const api = Object.freeze({ answerSourceQuestion, parseDocMentions, resolveReadableWikiScope, validateQuestionCitation, validateQuestionEvidence, prepareQuestionProposal, handoffQuestionProposal, create, createRetrievalReadService, isRetrievalReadService, isRetrievalSnapshot, isRevalidatedCandidate });
  root.LLMWikiWikiReadService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
