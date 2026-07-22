(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const REASON_RANK = Object.freeze({ connection: 0, direct_outlink: 1, backlink: 2 });
  const PROVENANCE_LABEL = Object.freeze({
    connection: "connections",
    direct_outlink: "direct outlink",
    backlink: "backlink"
  });
  const RESOURCE_TYPES = new Set(["literature_note", "venue", "auction_region"]);
  const DOMAIN_ORDER = Object.freeze([
    "real_estate", "wedding", "coding", "workout", "reading", "business", "personal_growth"
  ]);

  function token(value) {
    return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
  }

  function metadata(source) {
    const frontmatter = source && source.frontmatter && typeof source.frontmatter === "object"
      && !Array.isArray(source.frontmatter) ? source.frontmatter : {};
    return source && typeof source === "object" ? { ...frontmatter, ...source } : {};
  }

  function normalizeSegments(value, basePath) {
    const input = String(value || "").trim().replace(/\\/g, "/").normalize("NFC");
    if (!input || /^(?:[a-z]+:|\/)/i.test(input)) return { path: "", unsafe: Boolean(input) };
    const relative = input.startsWith("./") || input.startsWith("../");
    const base = relative ? String(basePath || "").split("/").slice(0, -1) : [];
    for (const part of input.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!base.length) return { path: "", unsafe: true };
        base.pop();
      } else {
        base.push(part);
      }
    }
    const joined = base.join("/");
    return { path: joined && !/\.md$/i.test(joined) ? `${joined}.md` : joined, unsafe: false };
  }

  function canonicalSourcePath(source) {
    const filePath = source && source.file && typeof source.file === "object" ? source.file.path : "";
    return normalizeSegments(source && (source.source_path || source.path || filePath), "").path;
  }

  function rawLink(value) {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object") return String(value.path || value.file || value.link || "").trim();
    return "";
  }

  function parseLink(value, sourcePath) {
    const raw = rawLink(value);
    if (!raw) return { code: "malformed_link" };
    let target = raw;
    if (raw.startsWith("[[")) {
      if (!raw.endsWith("]]")) return { code: "malformed_link" };
      target = raw.slice(2, -2).split("|")[0].split("#")[0].trim();
    } else {
      target = raw.split("#")[0].trim();
    }
    if (!target || /\[\[|\]\]/.test(target)) return { code: "malformed_link" };
    const normalized = normalizeSegments(target, sourcePath);
    return normalized.unsafe ? { code: "unsafe_path" } : normalized.path ? { path: normalized.path } : { code: "malformed_link" };
  }

  function list(value) {
    return Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  }

  function linkValues(source, kind) {
    const data = metadata(source);
    const file = source.file && typeof source.file === "object" ? source.file : {};
    if (kind === "connection") return list(data.connections);
    if (kind === "backlink") return [...list(source.backlinks), ...list(source.inlinks), ...list(file.inlinks)];
    return [...list(source.outlinks), ...list(file.outlinks)];
  }

  function filename(path) {
    return (String(path || "").split("/").pop() || "").replace(/\.md$/i, "");
  }

  function buildIndex(sources, warnings) {
    const records = [];
    const byPath = new Map();
    for (const source of Array.isArray(sources) ? sources : []) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const path = canonicalSourcePath(source);
      if (!path) {
        warnings.push({ code: "unsafe_path", source_path: null, target_path: null });
        continue;
      }
      const key = path.toLocaleLowerCase("en-US");
      if (byPath.has(key)) continue;
      const data = metadata(source);
      const record = { source, data, path, title: String(data.title || filename(path)).trim() || filename(path) };
      records.push(record);
      byPath.set(key, record);
    }
    return { records, byPath };
  }

  function resolveTarget(path, index) {
    const exact = index.byPath.get(path.toLocaleLowerCase("en-US"));
    if (exact) return exact;
    const wanted = filename(path).toLocaleLowerCase("en-US");
    const matches = index.records.filter((item) => filename(item.path).toLocaleLowerCase("en-US") === wanted);
    return matches.length === 1 ? matches[0] : null;
  }

  function categoryFor(data, path) {
    const type = token(data.type);
    if (type === "knowledge" || type === "permanent_note") return "Knowledge";
    if (RESOURCE_TYPES.has(type)) return "Resources";
    if (type === "people") return "People";
    if (type === "project" || type === "auction_case") return "Projects";
    if (type === "journal" || type === "daily_note" || /^DAILY\/DAILY\//i.test(path)) return "Journal";
    if (type === "reading") return "Reading";
    return "Other";
  }

  function addCandidate(buckets, source, targetPath, reason, provenancePath, index, warnings) {
    const target = resolveTarget(targetPath, index);
    const canonicalTarget = target ? target.path : targetPath;
    if (canonicalTarget.toLocaleLowerCase("en-US") === source.path.toLocaleLowerCase("en-US")) return;
    const relation = {
      source_path: source.path,
      target_path: canonicalTarget,
      target_title: target ? target.title : filename(canonicalTarget),
      target_type: target ? token(target.data.type) || null : null,
      category: target ? categoryFor(target.data, target.path) : "Other",
      reason,
      provenance_label: PROVENANCE_LABEL[reason],
      provenance_source_path: provenancePath,
      clickable: Boolean(target),
      warning: target ? null : "broken_link"
    };
    const bucket = buckets.get(source.path);
    const key = canonicalTarget.toLocaleLowerCase("en-US");
    const current = bucket.get(key);
    if (!current || REASON_RANK[reason] < REASON_RANK[current.reason]
      || (reason === current.reason && provenancePath.localeCompare(current.provenance_source_path, "en") < 0)) {
      bucket.set(key, relation);
    }
    if (!target) warnings.push({ code: "broken_link", source_path: source.path, target_path: canonicalTarget, reason });
  }

  function processLinks(source, reason, index, buckets, warnings) {
    for (const value of linkValues(source.source, reason)) {
      const parsed = parseLink(value, source.path);
      if (!parsed.path) {
        warnings.push({ code: parsed.code, source_path: source.path, target_path: null, reason });
        continue;
      }
      const provenance = reason === "backlink" ? parsed.path : source.path;
      addCandidate(buckets, source, parsed.path, reason, provenance, index, warnings);
    }
  }

  function domainFor(record) {
    const type = token(record.data.type);
    if (type === "venue") return "wedding";
    if (type === "auction_region") return "real_estate";
    if (type !== "knowledge" && type !== "permanent_note" && type !== "literature_note") return null;
    const domain = token(record.data.knowledge_domain);
    return DOMAIN_ORDER.includes(domain) ? domain : "unclassified";
  }

  function topicValues(value) {
    const values = Array.isArray(value) ? value : [value];
    return [...new Set(values.flatMap((item) => typeof item === "string" ? item.split(",") : []).map(token).filter(Boolean))];
  }

  function recency(record) {
    const values = [record.data.updated, record.data.created, record.source.source_mtime, record.source.mtime];
    return values.reduce((latest, value) => {
      const parsed = typeof value === "number" ? value : Date.parse(String(value || ""));
      return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
    }, 0);
  }

  function buildSignals(index, relationsBySource) {
    const signals = {};
    for (const domain of [...DOMAIN_ORDER, "unclassified"]) {
      const local = index.records.filter((record) => domainFor(record) === domain);
      if (!local.length) continue;
      const relationLists = local.flatMap((record) => relationsBySource[record.path] || []);
      const frequency = new Map();
      for (const relation of relationLists) {
        const current = frequency.get(relation.target_path) || { target_path: relation.target_path, title: relation.target_title, mentions: 0 };
        current.mentions += 1;
        frequency.set(relation.target_path, current);
      }
      const relatedPaths = [...new Set(relationLists.filter((item) => item.clickable).map((item) => item.target_path))];
      const topicCounts = new Map();
      for (const path of relatedPaths) {
        const target = index.byPath.get(path.toLocaleLowerCase("en-US"));
        for (const topic of topicValues(target && target.data.knowledge_topics)) {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
      }
      signals[domain] = {
        recent_additions: local.map((record) => ({ source_path: record.path, title: record.title, recency: recency(record) }))
          .sort((left, right) => right.recency - left.recency || left.source_path.localeCompare(right.source_path, "en")),
        explicit_link_frequency: [...frequency.values()].sort((left, right) => right.mentions - left.mentions
          || left.target_path.localeCompare(right.target_path, "en")),
        repeated_related_topics: [...topicCounts].filter(([, count]) => count > 1).map(([topic, mentions]) => ({ topic, mentions }))
          .sort((left, right) => right.mentions - left.mentions || left.topic.localeCompare(right.topic, "en")),
        unclassified_items: domain === "unclassified" ? local.map((record) => ({
          source_path: record.path, title: record.title, reason: "unclassified_domain"
        })).sort((left, right) => left.source_path.localeCompare(right.source_path, "en")) : []
      };
    }
    return signals;
  }

  function projectRelations(sources) {
    const warnings = [];
    const index = buildIndex(sources, warnings);
    const buckets = new Map(index.records.map((record) => [record.path, new Map()]));
    for (const source of index.records) {
      processLinks(source, "connection", index, buckets, warnings);
      processLinks(source, "direct_outlink", index, buckets, warnings);
      processLinks(source, "backlink", index, buckets, warnings);
    }
    for (const origin of index.records) {
      for (const reason of ["connection", "direct_outlink"]) {
        for (const value of linkValues(origin.source, reason)) {
          const parsed = parseLink(value, origin.path);
          const target = parsed.path && resolveTarget(parsed.path, index);
          if (target) addCandidate(buckets, target, origin.path, "backlink", origin.path, index, warnings);
        }
      }
    }
    const relationsBySource = Object.fromEntries(index.records.map((record) => [record.path, [...buckets.get(record.path).values()]
      .sort((left, right) => REASON_RANK[left.reason] - REASON_RANK[right.reason]
        || left.target_path.localeCompare(right.target_path, "en"))]));
    const uniqueWarnings = [...new Map(warnings.map((item) => [JSON.stringify(item), item])).values()]
      .sort((left, right) => String(left.source_path || "").localeCompare(String(right.source_path || ""), "en")
        || left.code.localeCompare(right.code, "en") || String(left.target_path || "").localeCompare(String(right.target_path || ""), "en"));
    return {
      schema_version: SCHEMA_VERSION,
      relations_by_source: relationsBySource,
      signals_by_domain: buildSignals(index, relationsBySource),
      warnings: uniqueWarnings
    };
  }

  const api = Object.freeze({ SCHEMA_VERSION, projectRelations });
  root.KnowledgeExplorerRelations = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
