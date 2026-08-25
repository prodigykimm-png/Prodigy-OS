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

  const api = Object.freeze({ create, createRetrievalReadService, isRetrievalReadService, isRetrievalSnapshot, isRevalidatedCandidate });
  root.LLMWikiWikiReadService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
