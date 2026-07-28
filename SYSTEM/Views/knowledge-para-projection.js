"use strict";

(function (root) {
  var KNOWLEDGE_TYPES = new Set(["knowledge", "permanent_note"]);

  function text(value) { return typeof value === "string" ? value.trim() : ""; }

  function normalizeList(value) {
    if (Array.isArray(value)) return value.map(function (item) {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") return text(item.path || item.file || item.link || item.target || "");
      return "";
    }).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  function canonicalPath(value) {
    var raw = text(value).replace(/\\/g, "/");
    if (!raw) return "";
    raw = raw.replace(/\.md$/i, "");
    if (/^(?:[a-z]+:|\/)/i.test(raw)) return "";
    if (raw.split("/").some(function (p) { return !p || p === "." || p === ".."; })) return "";
    return raw;
  }

  function parseWikilink(value) {
    var raw = text(value);
    if (raw.startsWith("[[") && raw.endsWith("]]")) raw = raw.slice(2, -2);
    raw = raw.split("|")[0].split("#")[0].trim();
    return canonicalPath(raw);
  }

  function isKnowledge(record) {
    return KNOWLEDGE_TYPES.has(text(record && record.type));
  }

  function collectLinkedKnowledge(relationRecords, knowledgeIndex) {
    var results = [];
    var seen = new Set();
    // Wikilinks are usually basenames; resolve them against an unambiguous
    // basename map in addition to full canonical paths (fail-closed on collision).
    var baseCounts = new Map();
    knowledgeIndex.forEach(function (k) {
      var base = k.path.split("/").pop().toLowerCase();
      baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
    });
    var byBase = new Map();
    knowledgeIndex.forEach(function (k) {
      var base = k.path.split("/").pop().toLowerCase();
      if (baseCounts.get(base) === 1) byBase.set(base, k);
    });

    for (var i = 0; i < relationRecords.length; i++) {
      var record = relationRecords[i];
      if (!record || isKnowledge(record)) continue;
      var sourcePath = text(record.path || record.source_path);
      var sourceType = text(record.type);
      var sourceTitle = text(record.title) || sourcePath.split("/").pop() || sourcePath;

      var links = [];
      var connections = normalizeList(record.connections);
      var outlinks = normalizeList(record.outlinks || (record.file && record.file.outlinks));
      for (var c = 0; c < connections.length; c++) links.push(parseWikilink(connections[c]));
      for (var o = 0; o < outlinks.length; o++) links.push(parseWikilink(outlinks[o]));

      for (var l = 0; l < links.length; l++) {
        var target = links[l];
        if (!target) continue;
        var key = target.toLowerCase();
        var knowledge = knowledgeIndex.get(key) || byBase.get(key);
        if (!knowledge) continue;
        var key = sourcePath.toLowerCase() + "\x1f" + target.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(Object.freeze({
          source_path: sourcePath,
          source_title: sourceTitle,
          source_type: sourceType,
          knowledge_path: knowledge.path,
          knowledge_title: knowledge.title,
          knowledge_domain: text(knowledge.knowledge_domain),
          knowledge_topics: Array.isArray(knowledge.knowledge_topics) ? knowledge.knowledge_topics.slice() : []
        }));
      }
    }

    results.sort(function (a, b) {
      return a.source_type.localeCompare(b.source_type, "en") ||
        a.source_path.localeCompare(b.source_path, "en") ||
        a.knowledge_path.localeCompare(b.knowledge_path, "en");
    });
    return Object.freeze(results);
  }

  function buildKnowledgeIndex(records) {
    var index = new Map();
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (!record || !isKnowledge(record)) continue;
      var path = canonicalPath(record.path || record.source_path || "");
      if (!path) continue;
      index.set(path.toLowerCase(), Object.freeze({
        path: path,
        title: text(record.title) || path.split("/").pop(),
        type: text(record.type),
        knowledge_domain: text(record.knowledge_domain),
        knowledge_topics: normalizeList(record.knowledge_topics)
      }));
    }
    return index;
  }

  function groupBySource(links) {
    var groups = new Map();
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var key = link.source_path;
      if (!groups.has(key)) groups.set(key, { source_path: link.source_path, source_title: link.source_title, source_type: link.source_type, knowledge: [] });
      groups.get(key).knowledge.push(link);
    }
    return Array.from(groups.values());
  }

  var SOURCE_TYPE_LABELS = Object.freeze({
    project: "프로젝트", auction_case: "경매 사건", reading: "독서",
    area: "영역", area_note: "영역 노트", venue: "장소",
    auction_region: "경매 지역", people: "사람", journal: "저널",
    workout: "운동", workout_program: "운동 프로그램"
  });

  function sourceTypeLabel(type) {
    return SOURCE_TYPE_LABELS[type] || text(type) || "기타";
  }

  function projectParaKnowledge(records, relationRecords) {
    var knowledgeIndex = buildKnowledgeIndex(records);
    var links = collectLinkedKnowledge(relationRecords, knowledgeIndex);
    var groups = groupBySource(links);
    return Object.freeze({
      schema_version: 1,
      total_links: links.length,
      total_sources: groups.length,
      total_knowledge: knowledgeIndex.size,
      links: links,
      groups: Object.freeze(groups),
      knowledge_index: knowledgeIndex
    });
  }

  var api = Object.freeze({
    KNOWLEDGE_TYPES: KNOWLEDGE_TYPES,
    isKnowledge: isKnowledge,
    buildKnowledgeIndex: buildKnowledgeIndex,
    collectLinkedKnowledge: collectLinkedKnowledge,
    groupBySource: groupBySource,
    projectParaKnowledge: projectParaKnowledge,
    sourceTypeLabel: sourceTypeLabel
  });
  root.KnowledgeParaProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
