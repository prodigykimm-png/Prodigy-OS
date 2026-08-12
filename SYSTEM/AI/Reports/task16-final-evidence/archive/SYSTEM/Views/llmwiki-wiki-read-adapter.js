(function (root) {
  "use strict";

  const SNAPSHOT_VERSION = "llmwiki_wiki_read_v1";
  const HASH = /^[0-9a-f]{64}$/u;
  const TRUST_ORDER = Object.freeze({ verified: 0, legacy_verified: 1, literature: 2, pending: 3 });
  const TRUST_BY_TYPE = Object.freeze({
    knowledge: "verified",
    permanent_note: "legacy_verified",
    literature_note: "literature",
    knowledge_candidate: "pending",
  });
  const MODE_ORDER = Object.freeze(["verified", "literature", "pending", "all"]);
  const TYPE_BY_MODE = Object.freeze({
    verified: Object.freeze(["knowledge", "permanent_note"]),
    literature: Object.freeze(["literature_note"]),
    pending: Object.freeze(["knowledge_candidate"]),
    all: Object.freeze(["knowledge", "permanent_note", "literature_note", "knowledge_candidate"]),
  });
  const DEFAULT_CANDIDATE_ROOT = "PARA/RESOURCES/Knowledge/Candidates";
  const DEFAULT_LEGACY_CANDIDATE_ROOTS = Object.freeze([
    "PARA/RESOURCES/Reading/Candidates",
    "ZETA/FLEETING/Knowledge Candidates",
  ]);
  const DEFAULT_PREFIXES = Object.freeze({
    verified: Object.freeze(["ZETA/PERMANENT/"]),
    literature: Object.freeze(["ZETA/LITERATURE/"]),
    pending: Object.freeze([
      `${DEFAULT_CANDIDATE_ROOT}/`,
      ...DEFAULT_LEGACY_CANDIDATE_ROOTS.map((value) => `${value}/`),
    ]),
  });

  const ROUND_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const INITIAL_STATE = Object.freeze([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function trim(value) {
    return typeof value === "string" ? value.trim().normalize("NFC") : "";
  }

  function token(value) {
    return trim(value).toLocaleLowerCase("en-US").replace(/\s+/gu, "_");
  }

  function list(value) {
    return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    return value;
  }

  function stable(value) {
    if (value === undefined) return "null";
    if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    return JSON.stringify(String(value));
  }

  function bytesFor(value) {
    const encoded = encodeURIComponent(String(value));
    const bytes = [];
    for (let index = 0; index < encoded.length; index += 1) {
      if (encoded[index] === "%") {
        bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
        index += 2;
      } else bytes.push(encoded.charCodeAt(index));
    }
    return Uint8Array.from(bytes);
  }

  function rotateRight(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
  }

  function sha256Fallback(value) {
    const input = bytesFor(value);
    const bitLength = input.length * 8;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(input);
    padded[input.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    const state = INITIAL_STATE.slice();
    const words = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
      for (let index = 16; index < 64; index += 1) {
        const x = words[index - 15];
        const y = words[index - 2];
        const gamma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
        const gamma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
        words[index] = (gamma1 + words[index - 7] + gamma0 + words[index - 16]) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = state;
      for (let index = 0; index < 64; index += 1) {
        const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choose = (e & f) ^ (~e & g);
        const temp1 = (h + sigma1 + choose + ROUND_CONSTANTS[index] + words[index]) >>> 0;
        const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sigma0 + majority) >>> 0;
        [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
      }
      state[0] = (state[0] + a) >>> 0;
      state[1] = (state[1] + b) >>> 0;
      state[2] = (state[2] + c) >>> 0;
      state[3] = (state[3] + d) >>> 0;
      state[4] = (state[4] + e) >>> 0;
      state[5] = (state[5] + f) >>> 0;
      state[6] = (state[6] + g) >>> 0;
      state[7] = (state[7] + h) >>> 0;
    }
    return state.map((word) => word.toString(16).padStart(8, "0")).join("");
  }

  function sha256(value) {
    if (root.LLMWikiHash && typeof root.LLMWikiHash.sha256 === "function") {
      try { return root.LLMWikiHash.sha256(String(value)); } catch (_) { /* use local implementation */ }
    }
    if (typeof require === "function") {
      try { return require("node:crypto").createHash("sha256").update(String(value), "utf8").digest("hex"); } catch (_) { /* browser or restricted require */ }
    }
    return sha256Fallback(value);
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

  function finiteMtime(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    if (value && typeof value.toMillis === "function") return finiteMtime(value.toMillis());
    if (value && typeof value.toJSDate === "function") return finiteMtime(value.toJSDate().valueOf());
    const parsed = typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function safePath(value) {
    if (typeof value !== "string") return null;
    const raw = value.trim().normalize("NFC").replace(/\\/gu, "/");
    if (!raw || raw.startsWith("/") || /^[A-Za-z]:/u.test(raw) || /[\u0000-\u001f\u007f]/u.test(raw)) return null;
    if (raw.includes("[[") || raw.includes("]]")) return null;
    const parts = raw.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) return null;
    return parts.join("/");
  }

  function withSlash(value) {
    const text = trim(value).replace(/\\/gu, "/").replace(/\/+$/u, "");
    return text ? `${text}/` : "";
  }

  function sourceRoot(input, key, fallback) {
    const candidateStore = input && (input.KnowledgeCandidateStore || input.candidateStore)
      || root.KnowledgeCandidateStore;
    const value = input && input[key] !== undefined
      ? input[key]
      : key === "candidate_root" && candidateStore ? candidateStore.CANDIDATE_DIR : fallback;
    return withSlash(value);
  }

  function prefixMetadata(input) {
    const candidateRoot = sourceRoot(input, "candidate_root", DEFAULT_CANDIDATE_ROOT);
    const candidateStore = input && (input.KnowledgeCandidateStore || input.candidateStore)
      || root.KnowledgeCandidateStore;
    const legacyValues = input && input.legacy_candidate_roots !== undefined
      ? list(input.legacy_candidate_roots)
      : candidateStore && Array.isArray(candidateStore.LEGACY_CANDIDATE_DIRS)
        ? candidateStore.LEGACY_CANDIDATE_DIRS
        : DEFAULT_LEGACY_CANDIDATE_ROOTS;
    const legacy = [...new Set(legacyValues.map(withSlash).filter(Boolean))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const verified = ["ZETA/PERMANENT/"];
    const literature = ["ZETA/LITERATURE/"];
    const pending = [candidateRoot, ...legacy].filter((value, index, values) => values.indexOf(value) === index);
    const accepted = [...verified, ...literature, ...pending];
    return {
      verified: Object.freeze(verified),
      literature: Object.freeze(literature),
      pending: Object.freeze(pending),
      accepted: Object.freeze(accepted),
      candidate_root: candidateRoot,
      legacy_candidate_roots: Object.freeze(legacy),
    };
  }

  function prefixFor(path, prefixes) {
    if (!path || !prefixes) return null;
    if (prefixes.verified.some((prefix) => path.startsWith(prefix))) return "verified";
    if (prefixes.literature.some((prefix) => path.startsWith(prefix))) return "literature";
    if (prefixes.pending.some((prefix) => path.startsWith(prefix))) return "pending";
    return null;
  }

  function registryFor(input) {
    if (input && (input.registry || input.KnowledgeExplorerRegistry)) return input.registry || input.KnowledgeExplorerRegistry;
    if (root.KnowledgeExplorerRegistry) return root.KnowledgeExplorerRegistry;
    if (typeof require === "function") {
      try { return require("./knowledge-explorer-registry.js"); } catch (_) { /* optional global dependency */ }
    }
    return null;
  }

  function coreFor(input) {
    if (input && (input.core || input.KnowledgeExplorerCore)) return input.core || input.KnowledgeExplorerCore;
    if (root.KnowledgeExplorerCore) return root.KnowledgeExplorerCore;
    if (typeof require === "function") {
      try { return require("./knowledge-explorer-core.js"); } catch (_) { /* optional global dependency */ }
    }
    return null;
  }
  function candidateCoreFor(input) {
    if (input && (input.candidateCore || input.KnowledgeCandidateCore)) return input.candidateCore || input.KnowledgeCandidateCore;
    if (root.KnowledgeCandidateCore) return root.KnowledgeCandidateCore;
    if (typeof require === "function") {
      try { return require("./knowledge-candidate-core.js"); } catch (_) { /* optional global dependency */ }
    }
    return null;
  }

  function dataSourceFor() {
    if (root.KnowledgeExplorerDataSource) return root.KnowledgeExplorerDataSource;
    if (typeof require === "function") {
      try { return require("./knowledge-explorer-data-source.js"); } catch (_) { /* optional global dependency */ }
    }
    return null;
  }

  function sourceData(raw) {
    const frontmatter = plain(raw && raw.frontmatter) ? raw.frontmatter : {};
    return { ...frontmatter, ...(plain(raw) ? raw : {}) };
  }

  function titleFor(data, path) {
    const supplied = [data.title, data.name].find((value) => typeof value === "string" && value.trim());
    if (supplied) return trim(supplied);
    return path.split("/").pop().replace(/\.md$/iu, "") || "Untitled";
  }

  function normalizeDomain(registry, value) {
    if (registry && typeof registry.normalizeDomain === "function") {
      try { return trim(registry.normalizeDomain(value)) || "unclassified"; } catch (_) { /* fallback */ }
    }
    return token(value) || "unclassified";
  }

  function normalizeTopics(registry, value, domain) {
    if (registry && typeof registry.normalizeTopics === "function") {
      try { return [...registry.normalizeTopics(value, domain)]; } catch (_) { /* fallback */ }
    }
    const values = list(value).flatMap((item) => typeof item === "string" ? item.split(",") : []).map(token).filter(Boolean);
    return values.length ? [...new Set(values)] : ["unclassified"];
  }

  function explorerProjection(raw, registry, core) {
    if (!core || typeof core.projectKnowledgeExplorer !== "function" || !registry) return null;
    try {
      const result = core.projectKnowledgeExplorer([raw], registry);
      return result && Array.isArray(result.assets) ? result.assets[0] || null : null;
    } catch (_) {
      return null;
    }
  }

  function candidateRows(input) {
    return Array.isArray(input.candidates) ? input.candidates
      : Array.isArray(input.active_candidates) ? input.active_candidates
        : Array.isArray(input.activeCandidates) ? input.activeCandidates
          : Array.isArray(input.pending_candidates) ? input.pending_candidates
            : Array.isArray(input.pendingCandidates) ? input.pendingCandidates : [];
  }
  function pendingCandidateRows(input, candidateCore) {
    const rows = candidateRows(input);
    if (candidateCore && typeof candidateCore.groupByTier === "function") {
      try {
        const grouped = candidateCore.groupByTier(rows);
        if (grouped && Array.isArray(grouped.pending)) return grouped.pending;
      } catch (_) { /* malformed candidates are filtered below */ }
    }
    return rows;
  }

  function explorerAssets(input, registry) {
    if (Array.isArray(input.assets)) return input.assets;
    if (Array.isArray(input.rows)) return input.rows;
    if (input.explorer && Array.isArray(input.explorer.assets)) return input.explorer.assets;
    if (Array.isArray(input.pages)) {
      const dataSource = input.dataSource || input.KnowledgeExplorerDataSource || dataSourceFor();
      if (dataSource && typeof dataSource.createKnowledgeExplorerDataSource === "function") {
        try {
          return dataSource.createKnowledgeExplorerDataSource({ registry }).index(input.pages).assets;
        } catch (_) { /* use core projection below */ }
      }
      if (dataSource && typeof dataSource.index === "function") {
        try {
          const indexed = dataSource.index(input.pages);
          return Array.isArray(indexed) ? indexed : indexed && Array.isArray(indexed.assets) ? indexed.assets : [];
        } catch (_) { /* malformed records are safely excluded */ }
      }
      const core = coreFor(input);
      if (core && typeof core.projectKnowledgeExplorer === "function") {
        try {
          const result = core.projectKnowledgeExplorer(input.pages, registry);
          if (result && Array.isArray(result.assets)) return result.assets;
        } catch (_) { /* malformed records are safely excluded */ }
      }
    }
    return [];
  }

  function rowFrom(raw, kind, registry, prefixes, core) {
    if (!plain(raw)) return null;
    const data = sourceData(raw);
    const path = safePath(raw.source_path || raw.path || (raw.file && raw.file.path) || "");
    if (!path) return null;
    const type = token(kind === "candidate" ? "knowledge_candidate" : raw.type || data.type);
    const trust = TRUST_BY_TYPE[type];
    if (!trust) return null;
    const prefixKind = prefixFor(path, prefixes);
    if (!prefixKind || (trust === "verified" && prefixKind !== "verified")
      || (trust === "legacy_verified" && prefixKind !== "verified")
      || (trust === "literature" && prefixKind !== "literature")
      || (trust === "pending" && prefixKind !== "pending")) return null;

    const projected = kind === "candidate" ? null : explorerProjection(raw, registry, core);
    const projectedData = projected ? sourceData(projected) : {};
    const merged = { ...data, ...projectedData };
    const title = titleFor(merged, path);
    const domain = normalizeDomain(registry, merged.domain || merged.knowledge_domain || merged.suggested_domain);
    const topicInput = merged.topics || merged.knowledge_topics || merged.suggested_topics;
    const topics = normalizeTopics(registry, topicInput, domain);
    const mtime = finiteMtime(merged.mtime || merged.source_mtime || (merged.file && merged.file.mtime));
    const updatedSource = merged.updated !== undefined && merged.updated !== null && merged.updated !== ""
      ? merged.updated
      : merged.created !== undefined && merged.created !== null && merged.created !== "" ? merged.created : mtime;
    const updatedMtime = finiteMtime(updatedSource) || mtime;
    const status = trim(merged.status || (trust === "pending" ? "saved" : "active")) || "active";
    const sourceRevision = trim(merged.revision || merged.metadata_revision || merged.source_revision || "");
    const identity = {
      path,
      type,
      mtime,
      title,
      domain,
      topics: [...new Set(topics)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
      status,
      trust,
      source_revision: sourceRevision,
    };
    const rowRevision = sha256(stable(identity));
    const mode = trust === "pending" ? "pending" : trust === "literature" ? "literature" : "verified";
    const statement = typeof merged.statement === "string" ? trim(merged.statement) : typeof merged.body === "string" ? merged.body : "";
    const summary = typeof merged.summary === "string" ? trim(merged.summary) : "";
    return {
      document_id: `wiki_${sha256(path).slice(0, 24)}`,
      path,
      title,
      type,
      mode,
      trust,
      trust_status: trust,
      trust_tier: trust,
      canonical: trust === "verified" || trust === "legacy_verified",
      status,
      mtime,
      updated: updatedSource,
      updated_mtime: updatedMtime,
      revision: rowRevision,
      row_revision: rowRevision,
      source_revision: sourceRevision,
      domain,
      knowledge_domain: domain,
      topics: identity.topics,
      knowledge_topics: identity.topics,
      statement,
      summary,
    };
  }

  function rowCompare(left, right) {
    return TRUST_ORDER[left.trust] - TRUST_ORDER[right.trust]
      || right.updated_mtime - left.updated_mtime
      || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  }

  function identityFor(row) {
    return {
      path: row.path,
      type: row.type,
      mtime: row.mtime,
      title: row.title,
      domain: row.domain,
      topics: row.topics,
      status: row.status,
      trust: row.trust,
      source_revision: row.source_revision || "",
    };
  }

  function tierRows(rows) {
    const result = { verified: [], legacy_verified: [], literature: [], pending: [] };
    for (const row of rows) if (result[row.trust]) result[row.trust].push(row);
    return result;
  }

  function countRows(rows) {
    const counts = { verified: 0, legacy_verified: 0, literature: 0, pending: 0 };
    for (const row of rows) if (Object.prototype.hasOwnProperty.call(counts, row.trust)) counts[row.trust] += 1;
    return { ...counts, total: rows.length };
  }

  function buildSnapshot(input) {
    if (!plain(input)) return failure("input", "malformed_input");
    const registry = registryFor(input);
    const prefixes = prefixMetadata(input);
    const core = coreFor(input);
    const candidateCore = candidateCoreFor(input);
    const projectedRows = [];
    for (const raw of explorerAssets(input, registry)) {
      const row = rowFrom(raw, "asset", registry, prefixes, core);
      if (row) projectedRows.push(row);
    }
    for (const raw of pendingCandidateRows(input, candidateCore)) {
      let activeByCore = null;
      if (candidateCore && typeof candidateCore.isActive === "function") {
        try { activeByCore = candidateCore.isActive(raw); } catch (_) { activeByCore = null; }
      }
      if (activeByCore === false) continue;
      const row = rowFrom(raw, "candidate", registry, prefixes, core);
      if (row) {
        const candidateStatus = trim(raw.status);
        if (candidateStatus && !["proposed", "saved", "needs_more_evidence", "active"].includes(candidateStatus)) continue;
        projectedRows.push(row);
      }
    }
    projectedRows.sort((left, right) => left.path.localeCompare(right.path, "en")
      || TRUST_ORDER[left.trust] - TRUST_ORDER[right.trust]
      || left.row_revision.localeCompare(right.row_revision, "en"));
    const rows = [];
    const seen = new Set();
    for (const row of projectedRows) {
      const key = row.path.toLocaleLowerCase("en-US");
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    }
    rows.sort((left, right) => left.path.localeCompare(right.path, "en"));
    const collectionRevision = trim(input.collection_revision || input.collectionRevision || "");
    const identities = rows.map(identityFor).sort((left, right) => left.path.localeCompare(right.path, "en"));
    const snapshotRevision = sha256(stable({ version: SNAPSHOT_VERSION, collection_revision: collectionRevision, identities }));
    const tiers = tierRows(rows);
    const counts = countRows(rows);
    const allowedPrefixMetadata = {
      verified: prefixes.verified,
      literature: prefixes.literature,
      pending: prefixes.pending,
      accepted: prefixes.accepted,
      candidate_root: prefixes.candidate_root,
      legacy_candidate_roots: prefixes.legacy_candidate_roots,
    };
    return deepFreeze({
      ok: true,
      status: "ok",
      snapshot_version: SNAPSHOT_VERSION,
      snapshot_revision: snapshotRevision,
      current_revision: snapshotRevision,
      revision: snapshotRevision,
      collection_revision: collectionRevision,
      rows,
      documents: rows,
      tiers,
      counts,
      allowed_prefixes: prefixes.accepted,
      allowed_prefix_metadata: allowedPrefixMetadata,
      writer_count: 0,
      provider_count: 0,
    });
  }

  function snapshotValue(input) {
    const supplied = input && input.snapshot ? input.snapshot : input;
    if (supplied && supplied.ok === true && supplied.value && plain(supplied.value)) return supplied.value;
    return supplied;
  }

  function rowsForSnapshot(snapshot) {
    const value = snapshotValue(snapshot);
    return value && Array.isArray(value.rows) ? value.rows : value && Array.isArray(value.documents) ? value.documents : [];
  }

  function snapshotPrefixes(snapshot) {
    const metadata = snapshot && snapshot.allowed_prefix_metadata;
    if (metadata && Array.isArray(metadata.accepted)) return metadata;
    return prefixMetadata({});
  }

  function normalizeMode(value) {
    const normalized = token(value || "verified");
    if (normalized === "candidate") return "pending";
    if (normalized === "legacy" || normalized === "legacy_verified") return "legacy_verified";
    return MODE_ORDER.includes(normalized) || normalized === "legacy_verified" ? normalized : null;
  }

  function modeTiers(mode) {
    if (mode === "verified") return ["verified", "legacy_verified"];
    if (mode === "legacy_verified") return ["legacy_verified"];
    if (mode === "literature") return ["literature"];
    if (mode === "pending") return ["pending"];
    return ["verified", "legacy_verified", "literature", "pending"];
  }

  function filterValue(value) {
    if (Array.isArray(value)) return trim(value[0]);
    return trim(value);
  }

  function registryOrder(registry, key, rows) {
    const supplied = registry && (key === "domain" ? registry.DOMAIN_ORDER : null);
    const order = Array.isArray(supplied) ? supplied.map(token) : [];
    const seen = new Set(order);
    const values = [...new Set(rows.flatMap((row) => key === "domain" ? [token(row.domain)] : row.topics.map(token)).filter(Boolean))];
    for (const value of values.sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) if (!seen.has(value)) {
      seen.add(value);
      order.push(value);
    }
    if (values.includes("unclassified") && !order.includes("unclassified")) order.push("unclassified");
    return order;
  }

  function topicOrder(registry, rows) {
    const order = [];
    const seen = new Set();
    const byDomain = registry && plain(registry.TOPICS_BY_DOMAIN) ? registry.TOPICS_BY_DOMAIN : {};
    const domains = registry && Array.isArray(registry.DOMAIN_ORDER) ? registry.DOMAIN_ORDER : Object.keys(byDomain);
    for (const domain of domains) for (const topic of Array.isArray(byDomain[domain]) ? byDomain[domain] : []) {
      const normalized = token(topic);
      if (normalized && !seen.has(normalized)) { seen.add(normalized); order.push(normalized); }
    }
    const values = [...new Set(rows.flatMap((row) => row.topics.map(token)).filter(Boolean))]
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    for (const value of values) if (!seen.has(value)) { seen.add(value); order.push(value); }
    if (values.includes("unclassified") && !order.includes("unclassified")) order.push("unclassified");
    return order;
  }

  function matchesDomain(row, domain) {
    return !domain || token(row.domain) === token(domain);
  }

  function matchesTopic(row, topic) {
    return !topic || row.topics.map(token).includes(token(topic));
  }

  function facetItem(key, source, trustCounts) {
    return { key, label: key, count: source.length, counts: countRows(source), trust_counts: trustCounts };
  }

  function facetsFor(rows, domain, topic, registry) {
    const domainSource = rows.filter((row) => matchesTopic(row, topic));
    const topicSource = rows.filter((row) => matchesDomain(row, domain));
    const domainKeys = registryOrder(registry, "domain", rows);
    const topicKeys = topicOrder(registry, rows);
    const domains = domainKeys.map((key) => {
      const source = domainSource.filter((row) => matchesDomain(row, key));
      return facetItem(key, source, countRows(source));
    });
    const topics = topicKeys.map((key) => {
      const source = topicSource.filter((row) => matchesTopic(row, key));
      return facetItem(key, source, countRows(source));
    });
    return { domains, topics };
  }

  function queryEnvelope(result) {
    if (result && result.ok === false) return result;
    if (result && result.ok === true && result.value && plain(result.value)) return result.value;
    return result && plain(result) ? result : null;
  }

  function browseRead(input) {
    if (!plain(input)) return failure("input", "malformed_input");
    let snapshot = snapshotValue(input.snapshot);
    if (!snapshot && (Array.isArray(input.assets) || Array.isArray(input.pages) || Array.isArray(input.rows))) {
      snapshot = buildSnapshot(input);
    }
    if (snapshot && snapshot.ok === false) return snapshot;
    if (!plain(snapshot) || typeof snapshot.snapshot_revision !== "string") return failure("snapshot", "invalid_snapshot");
    if (snapshot.current_revision && snapshot.current_revision !== snapshot.snapshot_revision) {
      return deepFreeze({
        ok: true,
        status: "stale",
        reason: "stale_snapshot",
        action: "refresh",
        snapshot_revision: snapshot.snapshot_revision,
        current_revision: snapshot.current_revision,
        rows: [],
        results: [],
        facets: { domains: [], topics: [] },
        counts: { verified: 0, legacy_verified: 0, literature: 0, pending: 0, total: 0 },
        total: 0,
        writer_count: 0,
        provider_count: 0,
      });
    }
    const rows = rowsForSnapshot(snapshot);
    const prefixes = snapshotPrefixes(snapshot);
    const registry = input.registry || registryFor({});
    const reset = input.reset === true || input.clear_all === true || input.clearAll === true || input.action === "reset";
    const query = reset ? "" : trim(input.query);
    if (input.path !== undefined && input.path !== null && input.path !== "") {
      const selectedPath = safePath(input.path);
      if (!selectedPath) return failure("path", "unsafe_path");
      if (!prefixFor(selectedPath, prefixes)) return failure("path", "wrong_prefix");
      if (!rows.some((row) => row.path === selectedPath)) return failure("path", "unknown_path");
    }
    const mode = reset ? "verified" : normalizeMode(input.mode || input.trust || "verified");
    if (!mode) return failure("mode", "unknown_mode");
    const domain = reset ? "" : filterValue(input.domain !== undefined ? input.domain : input.knowledge_domain);
    const topic = reset ? "" : filterValue(input.topic !== undefined ? input.topic : input.knowledge_topic);
    const allowedTiers = new Set(modeTiers(mode));
    let candidates = rows.filter((row) => allowedTiers.has(row.trust));
    let delegatedStatus = "ok";
    if (query) {
      const queryApi = typeof input.queryRead === "function" ? input.queryRead
        : input.queryRead && typeof input.queryRead.queryRead === "function" ? input.queryRead.queryRead
          : input.queryReadOnly && typeof input.queryReadOnly.queryRead === "function" ? input.queryReadOnly.queryRead
            : input.LLMWikiQueryReadOnly && typeof input.LLMWikiQueryReadOnly.queryRead === "function" ? input.LLMWikiQueryReadOnly.queryRead
              : root.LLMWikiQueryReadOnly && root.LLMWikiQueryReadOnly.queryRead;
      if (typeof queryApi !== "function") return failure("query", "query_read_unavailable");
      const queryMode = mode === "pending" ? "candidate" : mode === "legacy_verified" ? "verified" : mode;
      const types = TYPE_BY_MODE[mode] || TYPE_BY_MODE.all;
      let delegated;
      try {
        delegated = queryApi({
          ...input,
          query,
          mode: queryMode,
          scope: input.scope || { paths: prefixes.accepted, types },
          snapshot,
        });
      } catch (_) {
        return failure("query", "query_read_failed");
      }
      const envelope = queryEnvelope(delegated);
      if (!envelope) return failure("query", "invalid_query_result");
      if (envelope.ok === false) return failure(envelope.field || "query", envelope.reason || "query_read_failed");
      delegatedStatus = trim(envelope.status) || "ok";
      if (["stale_snapshot", "unavailable_source", "conflict"].includes(delegatedStatus)) candidates = [];
      else {
        const resultRows = list(envelope.results);
        const resultPaths = new Set(resultRows.map((result) => trim(result && result.path)).filter(Boolean));
        const resultIds = new Set(resultRows.map((result) => trim(result && (result.document_id || result.id))).filter(Boolean));
        candidates = candidates.filter((row) => resultPaths.has(row.path) || resultIds.has(row.document_id));
      }
    }
    const facetRows = candidates.slice();
    const visible = candidates.filter((row) => matchesDomain(row, domain) && matchesTopic(row, topic)).sort(rowCompare);
    const counts = countRows(visible);
    const facets = facetsFor(facetRows, domain, topic, registry);
    const selectedPath = input.path ? safePath(input.path) : null;
    return deepFreeze({
      ok: true,
      status: visible.length ? delegatedStatus : (query && delegatedStatus !== "ok" ? delegatedStatus : "empty"),
      query,
      mode,
      domain,
      topic,
      snapshot_revision: snapshot.snapshot_revision,
      current_revision: snapshot.current_revision || snapshot.snapshot_revision,
      revision: snapshot.snapshot_revision,
      rows: visible,
      results: visible,
      facets,
      counts,
      total: visible.length,
      selection: {
        domain,
        topic,
        mode,
        path: selectedPath,
        detail_state: selectedPath ? "selected" : "rest",
      },
      allowed_prefixes: prefixes.accepted,
      writer_count: 0,
      provider_count: 0,
    });
  }

  const api = Object.freeze({
    SNAPSHOT_VERSION,
    TRUST_ORDER,
    TRUST_BY_TYPE,
    DEFAULT_CANDIDATE_ROOT,
    DEFAULT_LEGACY_CANDIDATE_ROOTS,
    safePath,
    prefixFor,
    prefixMetadata,
    stable,
    sha256,
    buildSnapshot,
    browseRead,
  });
  root.LLMWikiWikiReadAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
