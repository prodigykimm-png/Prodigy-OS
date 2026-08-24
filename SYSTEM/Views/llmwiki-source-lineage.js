(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  const MANIFEST_VERSION = "llmwiki_source_manifest_v1";
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const STATUS = Object.freeze(["active", "quarantined"]);

  function freezeValue(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
  }

  function reject(field, reason) { return Object.freeze({ ok: false, field, reason }); }
  function success(value) { return Object.freeze({ ok: true, value: freezeValue(value) }); }
  function trimmed(value) { return typeof value === "string" ? value.trim() : ""; }
  function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function isFailure(value) { return plainObject(value) && value.ok === false; }

  function utf8Bytes(value) {
    const text = String(value ?? "");
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    const bytes = [];
    for (let index = 0; index < text.length; index += 1) {
      let codePoint = text.charCodeAt(index);
      if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
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

  function sha256(value) {
    if (!hashApi || typeof hashApi.sha256 !== "function") return null;
    if (value instanceof Uint8Array && typeof hashApi.sha256Bytes === "function") return hashApi.sha256Bytes(value);
    if (typeof value === "string") return hashApi.sha256(value);
    if (value instanceof Uint8Array && typeof TextDecoder !== "undefined") {
      try { return hashApi.sha256(new TextDecoder("utf-8", { fatal: true }).decode(value)); } catch { return null; }
    }
    return hashApi.sha256(String(value ?? ""));
  }

  function normalizeUrl(value, field) {
    const raw = trimmed(value);
    if (!raw) return reject(field, "url_required");
    let parsed;
    try { parsed = new URL(raw); } catch { return reject(field, "invalid_url"); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return reject(field, "invalid_url");
    return parsed.href;
  }

  function optionalUrl(value, field) {
    if (value === undefined || value === null || trimmed(value) === "") return null;
    return normalizeUrl(value, field);
  }

  function validateSourceReference(input) {
    if (!plainObject(input)) return reject("source_reference", "malformed_source_reference");
    const sourcePath = trimmed(input.source_path);
    const sourceUrl = trimmed(input.source_url);
    if (sourcePath && sourceUrl) return reject("source_reference", "ambiguous_source_reference");
    if (!sourcePath && !sourceUrl) return reject("source_reference", "source_reference_required");
    if (sourceUrl) {
      const normalized = normalizeUrl(sourceUrl, "source_url");
      return isFailure(normalized) ? reject("source_url", "invalid_source_url") : success({ source_path: null, source_url: normalized });
    }
    const normalized = validateSourcePath(sourcePath);
    return isFailure(normalized) ? normalized : success({ source_path: normalized, source_url: null });
  }

  function unsafeVaultPath(value) {
    const segments = value.split("/");
    return !value || value.length > 1024
      || /[\u0000-\u001f\u007f?#]/u.test(value)
      || value.includes("\\")
      || value.startsWith("/")
      || value.startsWith("~")
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
    const legacyUnicodeEscape = /%u[0-9a-f]{4}/iu;
    const encodedSeparatorOrControl = /%(?:25)*(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu;
    const encodedDot = "(?:\\.|%(?:25)*2e)";
    const encodedDotSegment = new RegExp(`^(?:${encodedDot}){1,2}$`, "iu");
    return legacyUnicodeEscape.test(value)
      || encodedSeparatorOrControl.test(value)
      || value.split("/").some((segment) => encodedDotSegment.test(segment));
  }

  function validateSourcePath(value) {
    const sourcePath = trimmed(value);
    let decoded = sourcePath;
    for (let depth = 0; depth < 8; depth += 1) {
      if (unsafeVaultPath(decoded) || encodedPathHazard(decoded)) return reject("source_path", "invalid_source_path");
      const layer = decodePercentLayer(decoded);
      if (layer.invalid) return reject("source_path", "invalid_source_path");
      if (!layer.decodedAny) return sourcePath;
      decoded = layer.value;
    }
    return /%(?:[0-9a-f]{2}|u[0-9a-f]{4})/iu.test(decoded)
      ? reject("source_path", "invalid_source_path") : sourcePath;
  }

  function validateLocator(value) {
    const locator = trimmed(value);
    const pathPart = locator.split("#", 1)[0];
    const segments = pathPart.split("/");
    const unsafe = !locator
      || /[\u0000-\u001f\u007f]/u.test(locator)
      || locator.includes("\\")
      || locator.includes("[[")
      || locator.includes("]]")
      || locator.startsWith("/")
      || /^[A-Za-z]:/u.test(locator)
      || segments.some((segment) => segment === "." || segment === "..");
    return unsafe ? reject("locator", "invalid_locator") : locator;
  }

  function normalizeLocators(input) {
    if (input.locator !== undefined && input.locators !== undefined) return reject("locator", "ambiguous_locator");
    const raw = input.locators !== undefined ? input.locators : input.locator;
    const list = Array.isArray(raw) ? raw : [raw];
    if (!list.length || list.some((item) => item === undefined || item === null)) return reject("locator", "locator_required");
    const seen = new Set();
    const locators = [];
    for (const item of list) {
      const locator = validateLocator(item);
      if (isFailure(locator)) return locator;
      if (!seen.has(locator)) { seen.add(locator); locators.push(locator); }
    }
    return locators;
  }

  function rawBuffer(input) {
    if (input.raw_bytes instanceof Uint8Array) return input.raw_bytes;
    if (input.rawBytes instanceof Uint8Array) return input.rawBytes;
    if (typeof input.raw_bytes === "string") return utf8Bytes(input.raw_bytes);
    if (typeof input.rawBytes === "string") return utf8Bytes(input.rawBytes);
    return null;
  }

  function normalizeManifest(input) {
    if (!hashApi || typeof hashApi.sha256 !== "function" || typeof hashApi.sha256Bytes !== "function") {
      return reject("hash_capability", "lineage_capability_unavailable");
    }
    if (!plainObject(input)) return reject("manifest", "malformed_manifest");
    if (Object.hasOwn(input, "final_url")) return reject("final_url", "competing_url_authority");
    const sourceId = trimmed(input.source_id);
    if (!ID.test(sourceId)) return reject("source_id", "invalid_source_id");
    const contentHash = trimmed(input.content_hash);
    if (!HASH.test(contentHash)) return reject("content_hash", "invalid_content_hash");
    const requestedUrl = optionalUrl(input.requested_url, "requested_url");
    if (isFailure(requestedUrl)) return requestedUrl;
    const sourceUrl = normalizeUrl(input.source_url, "source_url");
    if (isFailure(sourceUrl)) return sourceUrl;
    const fetchedAt = trimmed(input.fetched_at);
    if (!Number.isFinite(Date.parse(fetchedAt))) return reject("fetched_at", "invalid_fetched_at");
    const parserVersion = trimmed(input.parser_version);
    if (!parserVersion) return reject("parser_version", "parser_version_required");
    const extractedTextHash = trimmed(input.extracted_text_hash);
    if (!HASH.test(extractedTextHash)) return reject("extracted_text_hash", "invalid_extracted_text_hash");
    const locators = normalizeLocators(input);
    if (isFailure(locators)) return locators;
    const revision = Number(input.refresh_revision);
    if (!Number.isSafeInteger(revision) || revision < 1) return reject("refresh_revision", "invalid_refresh_revision");
    const bytes = rawBuffer(input);
    if (!bytes || bytes.length === 0) return reject("raw_bytes", "raw_bytes_required");
    if (sha256(bytes) !== contentHash) return reject("content_hash", "content_hash_mismatch");
    if (input.extracted_text !== undefined && sha256(input.extracted_text) !== extractedTextHash) {
      return reject("extracted_text_hash", "extracted_text_hash_mismatch");
    }
    const metadata = plainObject(input.fetch_metadata) ? input.fetch_metadata : {};
    const metadataResolved = metadata.resolved_url === undefined ? sourceUrl : normalizeUrl(metadata.resolved_url, "fetch_metadata.resolved_url");
    if (isFailure(metadataResolved)) return metadataResolved;
    const metadataRequested = metadata.requested_url === undefined ? requestedUrl : optionalUrl(metadata.requested_url, "fetch_metadata.requested_url");
    if (isFailure(metadataRequested)) return metadataRequested;
    const metadataHash = metadata.content_hash === undefined ? contentHash : trimmed(metadata.content_hash);
    if (metadataResolved !== sourceUrl || metadataHash !== contentHash || metadataRequested !== requestedUrl) {
      return reject("fetch_metadata", "redirect_identity_mismatch");
    }
    const parseFailure = Boolean(input.parse_failure);
    const quarantine = plainObject(input.quarantine) ? { reason: trimmed(input.quarantine.reason || "parse_failure") || "parse_failure" } : null;
    const status = parseFailure || quarantine ? "quarantined" : trimmed(input.status || "active");
    if (!STATUS.includes(status)) return reject("status", "invalid_status");
    const predecessor = input.predecessor === undefined || input.predecessor === null ? null : trimmed(input.predecessor);
    const supersedes = input.supersedes === undefined || input.supersedes === null ? predecessor : trimmed(input.supersedes);
    const expectedPredecessor = input.expected_predecessor === undefined || input.expected_predecessor === null ? null : trimmed(input.expected_predecessor);
    return {
      manifest_version: MANIFEST_VERSION,
      source_id: sourceId,
      content_hash: contentHash,
      requested_url: requestedUrl,
      source_url: sourceUrl,
      fetched_at: fetchedAt,
      parser_version: parserVersion,
      extracted_text_hash: extractedTextHash,
      locators,
      status,
      quarantine: status === "quarantined" ? (quarantine || { reason: "parse_failure" }) : null,
      parse_failure: parseFailure,
      refresh_revision: revision,
      supersedes: supersedes || null,
      predecessor: predecessor || null,
      expected_predecessor: expectedPredecessor,
      raw_bytes: bytes,
    };
  }

  function validateSourceManifest(input) {
    const normalized = normalizeManifest(input);
    if (isFailure(normalized)) return normalized;
    const { raw_bytes: _raw, expected_predecessor: _expected, ...publicManifest } = normalized;
    return success(publicManifest);
  }

  function padRevision(value) { return String(value).padStart(6, "0"); }
  function manifestIdFor(manifest) {
    return `${manifest.source_id}/revision_${padRevision(manifest.refresh_revision)}_${manifest.content_hash.slice(0, 16)}`;
  }
  function joinPath(rootDir, ...parts) {
    return `${rootDir.replace(/\/+$/u, "")}/${parts.map((part) => String(part).replace(/^\/+|\/+$/gu, "")).join("/")}`;
  }
  function parentPath(value) { return value.slice(0, value.lastIndexOf("/")) || "/"; }
  function sourceDir(rootDir, sourceId) { return joinPath(rootDir, "manifests", sourceId); }
  function manifestPath(rootDir, manifestId) { return joinPath(rootDir, "manifests", `${manifestId}.json`); }
  function rawPath(rootDir, hash) { return joinPath(rootDir, "raw", hash.slice(0, 2), `${hash}.bin`); }
  function latestPath(rootDir, sourceId) { return joinPath(rootDir, "latest", `${sourceId}.json`); }

  function createSourceArchiveStore(options = {}) {
    const capability = options.capabilities || root.LLMWikiSourceArchiveCapability;
    const fs = capability && capability.fs;
    const required = ["access", "mkdir", "readFile", "writeFile", "readdir"];
    if (!fs || required.some((method) => typeof fs[method] !== "function")) {
      return reject("archive_capability", "archive_capability_unavailable");
    }
    const rootDir = trimmed(options.rootDir).replace(/\/+$/u, "");
    if (!rootDir || (!rootDir.startsWith("/") && !/^[A-Za-z]:\//u.test(rootDir))) return reject("rootDir", "invalid_archive_root");

    async function readJson(filePath) { return JSON.parse(await fs.readFile(filePath, "utf8")); }
    async function exists(filePath) { try { await fs.access(filePath); return true; } catch { return false; } }
    async function ensureArchiveDirs(sourceId, contentHash) {
      await fs.mkdir(sourceDir(rootDir, sourceId), { recursive: true });
      await fs.mkdir(parentPath(rawPath(rootDir, contentHash)), { recursive: true });
      await fs.mkdir(joinPath(rootDir, "latest"), { recursive: true });
    }

    async function listManifests(sourceId) {
      const id = trimmed(sourceId);
      if (!ID.test(id)) throw new Error("invalid source_id");
      const dir = sourceDir(rootDir, id);
      try {
        const names = (await fs.readdir(dir)).filter((name) => name.endsWith(".json")).sort();
        return Promise.all(names.map((name) => readJson(joinPath(dir, name))));
      } catch (error) {
        if (error && error.code === "ENOENT") return [];
        throw error;
      }
    }

    async function latestForSource(sourceId) {
      const id = trimmed(sourceId);
      if (!ID.test(id)) throw new Error("invalid source_id");
      try { return freezeValue(await readJson(latestPath(rootDir, id))); }
      catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
    }

    async function appendRevision(input) {
      const normalized = normalizeManifest(input);
      if (isFailure(normalized)) return normalized;
      const manifestId = manifestIdFor(normalized);
      await ensureArchiveDirs(normalized.source_id, normalized.content_hash);
      const existing = await listManifests(normalized.source_id);
      if (existing.some((item) => item.refresh_revision === normalized.refresh_revision)) {
        return reject("refresh_revision", "duplicate_revision");
      }
      const latest = await latestForSource(normalized.source_id);
      if (normalized.refresh_revision > 1 && latest && normalized.expected_predecessor && normalized.expected_predecessor !== latest.manifest_id) {
        return reject("expected_predecessor", "stale_predecessor");
      }
      if (normalized.refresh_revision > 1 && latest && !normalized.predecessor) normalized.predecessor = latest.manifest_id;
      if (normalized.refresh_revision > 1 && latest && !normalized.supersedes) normalized.supersedes = latest.manifest_id;
      const rawTarget = rawPath(rootDir, normalized.content_hash);
      if (await exists(rawTarget)) {
        const existingBytes = await fs.readFile(rawTarget);
        if (sha256(existingBytes) !== normalized.content_hash) return reject("content_hash", "raw_identity_collision");
      } else {
        await fs.writeFile(rawTarget, normalized.raw_bytes, { flag: "wx" });
      }
      const { raw_bytes: _raw, expected_predecessor: _expected, ...stored } = normalized;
      const record = freezeValue({ ...stored, manifest_id: manifestId, raw_path: `raw/${normalized.content_hash.slice(0, 2)}/${normalized.content_hash}.bin` });
      await fs.writeFile(manifestPath(rootDir, manifestId), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
      if (record.status === "active") {
        await fs.writeFile(latestPath(rootDir, record.source_id), `${JSON.stringify(record, null, 2)}\n`, { flag: "w" });
      }
      return success(record);
    }

    async function readManifest(manifestId) {
      const id = trimmed(manifestId);
      if (!/^[a-z][a-z0-9_-]{2,127}\/revision_[0-9]{6}_[0-9a-f]{16}$/u.test(id)) throw new Error("invalid manifest_id");
      return freezeValue(await readJson(manifestPath(rootDir, id)));
    }

    async function readRaw(contentHash) {
      const hash = trimmed(contentHash);
      if (!HASH.test(hash)) throw new Error("invalid content_hash");
      return fs.readFile(rawPath(rootDir, hash));
    }

    return freezeValue({ appendRevision, readManifest, readRaw, latestForSource, listManifests });
  }

  const api = freezeValue({
    MANIFEST_VERSION,
    validateSourceManifest,
    validateSourceReference,
    createSourceArchiveStore,
    sha256,
  });
  root.LLMWikiSourceLineage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
