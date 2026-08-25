(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const contractApi = root.LLMWikiContract || (typeof require === "function" ? require("./llmwiki-contract.js") : null);

  const REGISTRY_VERSION = "llmwiki_source_registry_v1";
  const RECEIPT_VERSION = "llmwiki_source_registry_receipt_v1";
  const SERIALIZED_ENVELOPE_LIMIT = 6295552;
  const SOURCE_CONTENT_LIMIT = 1114112;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const MEDIA_KIND = /^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u;
  const REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
  const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
  const PROCESSING_STATES = Object.freeze(["pending", "queued", "failed"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function reject(field, reason) { return freeze({ ok: false, field, reason }); }
  function success(value) { return freeze({ ok: true, value }); }
  function failure(value) { return plain(value) && value.ok === false; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function digest(value) {
    return hashApi.sha256(typeof value === "string" ? value : stable(value));
  }

  function encodeUtf8(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value);
    const bytes = [];
    for (let index = 0; index < value.length; index += 1) {
      let codePoint = value.charCodeAt(index);
      if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
          index += 1;
        } else codePoint = 0xfffd;
      } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) codePoint = 0xfffd;
      if (codePoint <= 0x7f) bytes.push(codePoint);
      else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      else if (codePoint <= 0xffff) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    }
    return Uint8Array.from(bytes);
  }

  function sourceBytes(value) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    return typeof value === "string" ? encodeUtf8(value) : null;
  }

  function unsafeVaultPath(value) {
    const segments = value.split("/");
    return !value || value.length > 1024
      || /[\u0000-\u001f\u007f?#]/u.test(value)
      || value.includes("\\") || value.startsWith("/") || value.startsWith("~")
      || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
      || segments.some((segment) => !segment || segment === "." || segment === "..");
  }

  function decodePercentLayer(value) {
    if (/%[0-9a-f](?![0-9a-f])/iu.test(value)) return { invalid: true };
    let invalid = false;
    let decodedAny = false;
    const decoded = value.replace(/(?:%[0-9a-f]{2})+/giu, (encoded) => {
      decodedAny = true;
      const bytes = encoded.match(/[0-9a-f]{2}/giu).map((hex) => Number.parseInt(hex, 16));
      let text;
      try {
        if (typeof TextDecoder === "undefined") throw new Error("TextDecoder unavailable");
        text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
      } catch {
        invalid = true;
        return encoded;
      }
      if (/[\/\\\u0000-\u001f\u007f]/u.test(text)) invalid = true;
      return text;
    });
    return { invalid, decodedAny, value: decoded };
  }

  function encodedPathHazard(value) {
    const encodedSeparatorOrControl = /%(?:25)*(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu;
    const encodedDotSegment = /^(?:(?:\.|%(?:25)*2e)){1,2}$/iu;
    return /%u[0-9a-f]{4}/iu.test(value) || encodedSeparatorOrControl.test(value)
      || value.split("/").some((segment) => encodedDotSegment.test(segment));
  }

  function normalizeSourcePath(value) {
    const sourcePath = trim(value);
    let decoded = sourcePath;
    for (let depth = 0; depth < 8; depth += 1) {
      if (unsafeVaultPath(decoded) || encodedPathHazard(decoded)) return reject("source_path", "invalid_source_path");
      const layer = decodePercentLayer(decoded);
      if (layer.invalid) return reject("source_path", "invalid_source_path");
      if (!layer.decodedAny) return sourcePath;
      decoded = layer.value;
    }
    return /%(?:[0-9a-f]{2}|u[0-9a-f]{4})/iu.test(decoded) ? reject("source_path", "invalid_source_path") : sourcePath;
  }

  function normalizeSourceUrl(value) {
    if (typeof URL !== "function") return reject("capability", "registry_capability_unavailable");
    let parsed;
    try { parsed = new URL(trim(value)); } catch { return reject("source_url", "invalid_source_url"); }
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.href : reject("source_url", "invalid_source_url");
  }

  function validateSourceReference(input) {
    const sourcePath = trim(input.source_path);
    const sourceUrl = trim(input.source_url);
    if (sourcePath && sourceUrl) return reject("source_reference", "ambiguous_source_reference");
    if (!sourcePath && !sourceUrl) return reject("source_reference", "source_reference_required");
    if (sourceUrl) {
      const normalized = normalizeSourceUrl(sourceUrl);
      return failure(normalized) ? normalized : success({ source_path: null, source_url: normalized });
    }
    const normalized = normalizeSourcePath(sourcePath);
    return failure(normalized) ? normalized : success({ source_path: normalized, source_url: null });
  }

  function normalizeCursor(value) {
    if (value === undefined || value === null || value === "") return null;
    const cursor = trim(value);
    const parts = cursor.split("/");
    const unsafe = !cursor || cursor.length > 512 || /[\u0000-\u001f\u007f]/u.test(cursor)
      || cursor.includes("\\") || cursor.includes("[[") || cursor.includes("]]" )
      || cursor.startsWith("/") || /^[A-Za-z]:/u.test(cursor)
      || parts.some((part) => part === "." || part === "..");
    return unsafe ? reject("incremental_cursor", "invalid_incremental_cursor") : cursor;
  }

  function normalizeRetry(value) {
    if (!plain(value)) return reject("retry_state", "invalid_retry_state");
    const attempt = value.attempt;
    const maxAttempts = value.max_attempts;
    const lastError = value.last_error === undefined || value.last_error === null ? null : trim(value.last_error);
    if (typeof attempt !== "number" || typeof maxAttempts !== "number"
      || !Number.isSafeInteger(attempt) || attempt < 0 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1
      || attempt > maxAttempts || (value.last_error !== undefined && value.last_error !== null && !lastError)) {
      return reject("retry_state", "invalid_retry_state");
    }
    return { attempt, max_attempts: maxAttempts, last_error: lastError };
  }

  function validateSourceRegistration(input) {
    if (!hashApi || typeof hashApi.sha256Bytes !== "function" || !contractApi || typeof contractApi.validateSourceAccess !== "function") {
      return reject("capability", "registry_capability_unavailable");
    }
    if (!plain(input)) return reject("registration", "malformed_registration");
    const sourceId = trim(input.source_id);
    if (!ID.test(sourceId)) return reject("source_id", "invalid_source_id");
    const reference = validateSourceReference(input);
    if (failure(reference)) return reference;
    const mediaKind = trim(input.media_kind).toLowerCase();
    if (!MEDIA_KIND.test(mediaKind)) return reject("media_kind", "invalid_media_kind");
    const contentHash = trim(input.content_hash);
    if (!HASH.test(contentHash)) return reject("content_hash", "invalid_content_hash");
    const bytes = sourceBytes(input.source_bytes);
    if (!bytes || bytes.length === 0) return reject("source_bytes", "source_bytes_required");
    if (bytes.length > SOURCE_CONTENT_LIMIT) return reject("source_bytes", "source_content_too_large");
    if (hashApi.sha256Bytes(bytes) !== contentHash) return reject("content_hash", "content_hash_mismatch");
    const modifiedRevision = trim(input.modified_revision);
    if (!REVISION.test(modifiedRevision)) return reject("modified_revision", "invalid_modified_revision");
    const extractorId = trim(input.extractor_id);
    if (!ID.test(extractorId)) return reject("extractor_id", "invalid_extractor_id");
    const extractorVersion = trim(input.extractor_version);
    if (!VERSION.test(extractorVersion)) return reject("extractor_version", "invalid_extractor_version");
    const access = contractApi.validateSourceAccess(input);
    if (failure(access)) return access;
    const processingState = trim(input.processing_state);
    if (!PROCESSING_STATES.includes(processingState)) return reject("processing_state", "invalid_processing_state");
    const retry = normalizeRetry(input.retry_state);
    if (failure(retry)) return retry;
    const cursor = normalizeCursor(input.incremental_cursor);
    if (failure(cursor)) return cursor;
    const expectedSnapshotId = input.expected_snapshot_id === undefined || input.expected_snapshot_id === null
      ? null : trim(input.expected_snapshot_id);
    if (expectedSnapshotId !== null && !/^snapshot_[0-9a-f]{24}$/u.test(expectedSnapshotId)) {
      return reject("expected_snapshot_id", "invalid_expected_snapshot_id");
    }
    return success({
      source: {
        source_id: sourceId,
        source_path: reference.value.source_path,
        source_url: reference.value.source_url,
        media_kind: mediaKind,
        content_hash: contentHash,
        modified_revision: modifiedRevision,
      },
      extractor: { extractor_id: extractorId, extractor_version: extractorVersion },
      access: access.value,
      processing: { state: processingState, retry },
      incremental_cursor: cursor,
      expected_snapshot_id: expectedSnapshotId,
    });
  }

  function normalizeExtractors(value) {
    const entries = Array.isArray(value) ? value : [];
    const supported = new Set();
    for (const entry of entries) {
      if (!plain(entry) || !ID.test(trim(entry.extractor_id)) || !VERSION.test(trim(entry.extractor_version)) || !Array.isArray(entry.media_kinds)) continue;
      for (const kind of entry.media_kinds) {
        const mediaKind = trim(kind).toLowerCase();
        if (MEDIA_KIND.test(mediaKind)) supported.add(`${trim(entry.extractor_id)}\u0000${trim(entry.extractor_version)}\u0000${mediaKind}`);
      }
    }
    return supported;
  }

  function createSourceRegistry(options = {}) {
    const supported = normalizeExtractors(options.extractors);
    const snapshotsBySource = new Map();
    const revisionIndex = new Map();

    function listSnapshots(sourceId) {
      const items = snapshotsBySource.get(trim(sourceId)) || [];
      return freeze(items.slice());
    }
    function isCurrentSnapshot(sourceId, snapshotId) {
      const items = snapshotsBySource.get(trim(sourceId)) || [];
      return Boolean(items.length && items[items.length - 1].snapshot_id === trim(snapshotId));
    }

    function register(input, context = {}) {
      const normalized = validateSourceRegistration(input);
      if (failure(normalized)) return normalized;
      if (plain(context) && context.dirty_worktree === true) return reject("context.dirty_worktree", "dirty_worktree");
      const registration = normalized.value;
      const sourceId = registration.source.source_id;
      const sourceSnapshots = snapshotsBySource.get(sourceId) || [];
      const latest = sourceSnapshots.length ? sourceSnapshots[sourceSnapshots.length - 1] : null;
      if (latest && (latest.source.source_path !== registration.source.source_path || latest.source.source_url !== registration.source.source_url)) {
        return reject("source_reference", "source_locator_rebind");
      }
      const extractorKey = `${registration.extractor.extractor_id}\u0000${registration.extractor.extractor_version}\u0000${registration.source.media_kind}`;
      if (!supported.has(extractorKey)) {
        return success({ state: "extractor_required", replayed: false, work_created: 0, new_snapshots: 0, snapshot: null, receipt: null });
      }

      const revisionKey = `${sourceId}\u0000${registration.source.modified_revision}`;
      const prior = revisionIndex.get(revisionKey);
      const identity = {
        source: registration.source,
        extractor: registration.extractor,
        access: registration.access,
        processing: registration.processing,
        incremental_cursor: registration.incremental_cursor,
      };
      const identityHash = digest(identity);
      if (prior) {
        if (prior.identity_hash !== identityHash) return reject("modified_revision", "revision_replay_conflict");
        return success({
          state: prior.snapshot.processing.state,
          replayed: true,
          work_created: 0,
          new_snapshots: 0,
          snapshot: prior.snapshot,
          receipt: prior.receipt,
        });
      }
      if (registration.expected_snapshot_id !== null && (!latest || registration.expected_snapshot_id !== latest.snapshot_id)) {
        return reject("expected_snapshot_id", "stale_state");
      }

      const sequence = sourceSnapshots.length + 1;
      const snapshotId = `snapshot_${digest({ registry_version: REGISTRY_VERSION, identity, sequence }).slice(0, 24)}`;
      const snapshot = freeze({
        registry_version: REGISTRY_VERSION,
        snapshot_id: snapshotId,
        sequence,
        predecessor_snapshot_id: latest ? latest.snapshot_id : null,
        ...identity,
      });
      const receipt = freeze({
        receipt_version: RECEIPT_VERSION,
        receipt_id: `source_receipt_${digest({ snapshot_id: snapshotId, identity_hash: identityHash }).slice(0, 24)}`,
        source_id: sourceId,
        snapshot_id: snapshotId,
        content_hash: registration.source.content_hash,
        modified_revision: registration.source.modified_revision,
        state: registration.processing.state,
      });
      sourceSnapshots.push(snapshot);
      snapshotsBySource.set(sourceId, sourceSnapshots);
      revisionIndex.set(revisionKey, { identity_hash: identityHash, snapshot, receipt });
      return success({
        state: snapshot.processing.state,
        replayed: false,
        work_created: 1,
        new_snapshots: 1,
        snapshot,
        receipt,
      });
    }

    return freeze({ register, listSnapshots, isCurrentSnapshot });
  }

  const api = freeze({
    REGISTRY_VERSION,
    RECEIPT_VERSION,
    SERIALIZED_ENVELOPE_LIMIT,
    SOURCE_CONTENT_LIMIT,
    PROCESSING_STATES,
    validateSourceRegistration,
    createSourceRegistry,
  });
  root.LLMWikiSourceRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
