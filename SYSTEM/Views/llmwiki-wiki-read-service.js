(function (root) {
  "use strict";

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

  function create(options) {
    const settings = plain(options) ? options : {};
    const adapter = settings.adapter || adapterFor();
    const collectSnapshot = typeof settings.collectSnapshot === "function" ? settings.collectSnapshot : null;
    const readBody = typeof settings.readBody === "function" ? settings.readBody : null;
    let currentSnapshot = null;
    const cache = new Map();

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

    function clearCache() {
      const size = cache.size;
      cache.clear();
      return deepFreeze({ ok: true, status: "cleared", cleared: size, writer_count: 0, provider_count: 0 });
    }

    return Object.freeze({ publishSnapshot, getSnapshot, browseRead, hydrateBody, clearCache });
  }

  const api = Object.freeze({ create });
  root.LLMWikiWikiReadService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
