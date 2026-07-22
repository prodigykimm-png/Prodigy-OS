(function (root) {
  "use strict";

  const TEMPLATE_PATH = /^SYSTEM\/TEMPLATE\//i;
  const METADATA_KEYS = Object.freeze([
    "type", "title", "summary", "review_summary", "knowledge_domain", "knowledge_topics", "connections",
    "updated", "created", "venue_category", "address", "region_sido", "region_sigungu", "region_dong",
    "project_type", "status", "relationship", "company", "role", "last_contact", "source_type"
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function token(value) {
    return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
  }

  function canonicalPath(value) {
    if (typeof value !== "string") return "";
    const parts = value.trim().replace(/\\/g, "/").normalize("NFC").split("/");
    const resolved = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!resolved.length) return "";
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join("/");
  }

  function finiteMtime(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    if (value && typeof value.toMillis === "function") return finiteMtime(value.toMillis());
    if (value && typeof value.toJSDate === "function") return finiteMtime(value.toJSDate().valueOf());
    const parsed = typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function list(value) {
    const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values.flatMap((item) => {
      if (!item) return [];
      if (typeof item === "string") return item.trim() ? [item.trim()] : [];
      if (isRecord(item)) {
        const raw = item.path || item.file || item.link || item.target || "";
        return typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
      }
      return [String(item).trim()].filter(Boolean);
    });
  }

  function copyValue(value) {
    if (Array.isArray(value)) return value.map(copyValue);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
    return value;
  }

  function plainFrontmatter(page) {
    const frontmatter = isRecord(page.frontmatter) ? copyValue(page.frontmatter) : {};
    for (const key of METADATA_KEYS) {
      if (page[key] !== undefined) frontmatter[key] = copyValue(page[key]);
    }
    return frontmatter;
  }

  function pathFor(page, file) {
    return canonicalPath(page.source_path || page.path || file.path || "");
  }

  function titleFor(page, frontmatter, sourcePath) {
    const supplied = [page.title, frontmatter.title].find((value) => typeof value === "string" && value.trim());
    if (supplied) return supplied.trim();
    return sourcePath.split("/").pop().replace(/\.md$/i, "") || "Untitled";
  }

  function sourceType(page, frontmatter) {
    return token(page.type || frontmatter.type);
  }

  function allowedTypes(registry) {
    const policy = registry && registry.SOURCE_TYPE_POLICY;
    if (!policy) throw new Error("KnowledgeExplorerRegistry is required");
    return new Set([...(policy.canonical || []), ...(policy.legacy || []), ...(policy.resource || [])]);
  }

  function projectPage(page, acceptedTypes) {
    if (!isRecord(page)) return null;
    const file = isRecord(page.file) ? page.file : {};
    const sourcePath = pathFor(page, file);
    if (!sourcePath || TEMPLATE_PATH.test(sourcePath)) return null;
    const frontmatter = plainFrontmatter(page);
    const type = sourceType(page, frontmatter);
    if (!acceptedTypes.has(type)) return null;
    const mtime = finiteMtime(page.source_mtime || page.mtime || file.mtime);
    return deepFreeze({
      source_path: sourcePath,
      path: sourcePath,
      type,
      title: titleFor(page, frontmatter, sourcePath),
      source_mtime: mtime,
      mtime,
      frontmatter,
      file: {
        path: sourcePath,
        mtime,
        outlinks: list(file.outlinks || page.outlinks),
        inlinks: list(file.inlinks || page.inlinks)
      },
      connections: list(page.connections || frontmatter.connections),
      outlinks: list(page.outlinks),
      backlinks: list(page.backlinks || page.inlinks || file.inlinks)
    });
  }

  function cacheIdentity(asset, schemaVersion) {
    const record = isRecord(asset) ? asset : {};
    const file = isRecord(record.file) ? record.file : {};
    const path = canonicalPath(record.path || record.source_path || file.path || "");
    const mtime = finiteMtime(record.mtime || record.source_mtime || file.mtime);
    return deepFreeze({ path, mtime, cache_key: `${schemaVersion}:${path}:${mtime}` });
  }

  function failure(identity, error) {
    return deepFreeze({
      status: "error",
      path: identity.path,
      mtime: identity.mtime,
      cache_key: identity.cache_key,
      error: error instanceof Error && error.message ? error.message : "Unable to load note body."
    });
  }

  function createKnowledgeExplorerDataSource(options = {}) {
    const registry = options.registry || root.KnowledgeExplorerRegistry;
    const acceptedTypes = allowedTypes(registry);
    const coreVersion = root.KnowledgeExplorerCore && root.KnowledgeExplorerCore.SCHEMA_VERSION;
    const schemaVersion = Number.isFinite(options.schemaVersion) ? options.schemaVersion : Number.isFinite(coreVersion) ? coreVersion : 1;
    const readBody = typeof options.readBody === "function" ? options.readBody : null;
    const cache = new Map();
    const keyByPath = new Map();

    function index(pages) {
      const records = Array.isArray(pages) ? pages : [];
      const assets = [];
      const seenPaths = new Set();
      for (const page of records) {
        const asset = projectPage(page, acceptedTypes);
        if (!asset) continue;
        const pathKey = asset.path.toLocaleLowerCase("en-US");
        if (seenPaths.has(pathKey)) continue;
        seenPaths.add(pathKey);
        assets.push(asset);
      }
      assets.sort((left, right) => left.path.localeCompare(right.path, "en"));
      return deepFreeze({ schema_version: schemaVersion, assets });
    }

    function hydrate(asset) {
      const identity = cacheIdentity(asset, schemaVersion);
      if (!identity.path) return Promise.resolve(failure(identity, new Error("A safe asset path is required.")));
      const previousKey = keyByPath.get(identity.path);
      if (previousKey && previousKey !== identity.cache_key) cache.delete(previousKey);
      keyByPath.set(identity.path, identity.cache_key);
      const existing = cache.get(identity.cache_key);
      if (existing) return existing;
      if (!readBody) return Promise.resolve(failure(identity, new Error("A body reader is required.")));

      let request;
      try {
        request = Promise.resolve(readBody(asset));
      } catch (error) {
        request = Promise.reject(error);
      }
      const result = request.then((body) => deepFreeze({
        status: "ready",
        path: identity.path,
        mtime: identity.mtime,
        cache_key: identity.cache_key,
        body: typeof body === "string" ? body : ""
      })).catch((error) => {
        if (cache.get(identity.cache_key) === result) cache.delete(identity.cache_key);
        if (keyByPath.get(identity.path) === identity.cache_key) keyByPath.delete(identity.path);
        return failure(identity, error);
      });
      cache.set(identity.cache_key, result);
      return result;
    }

    return Object.freeze({ index, hydrate });
  }

  const api = Object.freeze({ createKnowledgeExplorerDataSource });
  root.KnowledgeExplorerDataSource = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
