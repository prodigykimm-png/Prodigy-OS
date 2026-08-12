"use strict";

(function (root) {
  var KNOWLEDGE_TYPES = new Set(["knowledge", "permanent_note"]);

  var SOURCE_TYPE_LABELS = Object.freeze({
    project: "프로젝트", auction_case: "경매 사건", reading: "독서",
    area: "영역", area_note: "영역 노트", venue: "장소",
    auction_region: "경매 지역", people: "사람", journal: "저널",
    workout: "운동", workout_program: "운동 프로그램"
  });

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

  function sourceTypeLabel(type) {
    return SOURCE_TYPE_LABELS[text(type).toLowerCase()] || "기타";
  }

  function isObject(value) {
    return !!value && typeof value === "object";
  }

  function cloneValue(value, depth) {
    if (depth > 4 || value === null || value === undefined) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(function (item) { return cloneValue(item, depth + 1); }));
    if (!isObject(value) || value instanceof Date) return value;
    var copy = {};
    Object.keys(value).sort().forEach(function (key) {
      var item = value[key];
      if (typeof item === "function" || typeof item === "symbol") return;
      copy[key] = cloneValue(item, depth + 1);
    });
    return Object.freeze(copy);
  }

  function stableSearchText(values) {
    return values.map(function (value) {
      return text(value).replace(/\s+/g, " ").toLocaleLowerCase("en-US");
    }).filter(Boolean).join(" ");
  }
  function metadataSearchValues(metadata) {
    if (!metadata || typeof metadata !== "object") return [];
    return Object.keys(metadata).sort().reduce(function (values, key) {
      var value = metadata[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") values.push(String(value));
      else if (Array.isArray(value)) values.push(value.join(" "));
      return values;
    }, []);
  }

  function sourceMetadata(record, sourcePath, sourceType, sourceTitle) {
    var frontmatter = record && isObject(record.frontmatter) ? cloneValue(record.frontmatter, 0) : null;
    var metadata = {
      path: sourcePath,
      source_path: sourcePath,
      title: sourceTitle,
      type: sourceType,
      type_label: sourceTypeLabel(sourceType)
    };
    var fields = [
      "summary", "review_summary", "status", "updated", "created", "project_type",
      "relationship", "company", "role", "last_contact", "venue_category", "address",
      "region_sido", "region_sigungu", "region_dong", "source_mtime", "mtime"
    ];
    fields.forEach(function (field) {
      var value = record && record[field] !== undefined ? record[field] : frontmatter && frontmatter[field];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") metadata[field] = value;
    });
    if (frontmatter) metadata.frontmatter = frontmatter;
    return Object.freeze(metadata);
  }

  function collectLinkedKnowledge(relationRecords, knowledgeIndex) {
    var results = [];
    var seen = new Set();
    var sourceMetadataByPath = new Map();
    var relations = Array.isArray(relationRecords) ? relationRecords.slice() : [];
    relations.sort(function (a, b) {
      var aPath = text(a && (a.path || a.source_path)).replace(/\\/g, "/");
      var bPath = text(b && (b.path || b.source_path)).replace(/\\/g, "/");
      return aPath.localeCompare(bPath, "en") ||
        text(a && a.type).localeCompare(text(b && b.type), "en") ||
        text(a && a.title).localeCompare(text(b && b.title), "en");
    });
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

    for (var i = 0; i < relations.length; i++) {
      var record = relations[i];
      if (!record || isKnowledge(record)) continue;
      var sourcePath = text(record.path || record.source_path).replace(/\\/g, "/");
      var sourceType = text(record.type);
      var sourceTitle = text(record.title) || sourcePath.split("/").pop() || sourcePath;
      var metadataKey = sourcePath.toLowerCase() + "\x1f" + sourceType.toLowerCase();
      var sourceInfo = sourceMetadataByPath.get(metadataKey);
      if (!sourceInfo) {
        sourceInfo = sourceMetadata(record, sourcePath, sourceType, sourceTitle);
        sourceMetadataByPath.set(metadataKey, sourceInfo);
      }

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
        var seenKey = sourcePath.toLowerCase() + "\x1f" + knowledge.path.toLowerCase();
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        var knowledgeTopics = Array.isArray(knowledge.knowledge_topics) ? knowledge.knowledge_topics.slice() : [];
        results.push(Object.freeze({
          source_path: sourcePath,
          source_title: sourceTitle,
          source_type: sourceType,
          source_type_label: sourceTypeLabel(sourceType),
          source_metadata: sourceInfo,
          knowledge_path: knowledge.path,
          knowledge_title: knowledge.title,
          knowledge_domain: text(knowledge.knowledge_domain),
          knowledge_topics: Object.freeze(knowledgeTopics),
          search_text: stableSearchText([
            sourcePath, sourceTitle, sourceType, sourceTypeLabel(sourceType),
            knowledge.path, knowledge.title, knowledge.knowledge_domain, knowledgeTopics.join(" ")
          ].concat(metadataSearchValues(sourceInfo)))
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
    var candidates = [];
    var source = Array.isArray(records) ? records : [];
    for (var i = 0; i < source.length; i++) {
      var record = source[i];
      if (!record || !isKnowledge(record)) continue;
      var path = canonicalPath(record.path || record.source_path || "");
      if (!path) continue;
      candidates.push({
        path: path,
        title: text(record.title) || path.split("/").pop(),
        type: text(record.type),
        knowledge_domain: text(record.knowledge_domain),
        knowledge_topics: normalizeList(record.knowledge_topics)
      });
    }
    candidates.sort(function (a, b) {
      return a.path.toLowerCase().localeCompare(b.path.toLowerCase(), "en") ||
        a.path.localeCompare(b.path, "en") ||
        a.title.localeCompare(b.title, "en") ||
        a.type.localeCompare(b.type, "en") ||
        a.knowledge_domain.localeCompare(b.knowledge_domain, "en") ||
        a.knowledge_topics.join("\x1f").localeCompare(b.knowledge_topics.join("\x1f"), "en");
    });
    for (var j = 0; j < candidates.length; j++) {
      var item = candidates[j];
      if (index.has(item.path.toLowerCase())) continue;
      index.set(item.path.toLowerCase(), Object.freeze({
        path: item.path,
        title: item.title,
        type: item.type,
        knowledge_domain: item.knowledge_domain,
        knowledge_topics: Object.freeze(item.knowledge_topics.slice()),
        search_text: stableSearchText([item.path, item.title, item.knowledge_domain, item.knowledge_topics.join(" ")])
      }));
    }
    return index;
  }

  function groupBySource(links) {
    var groups = new Map();
    var source = Array.isArray(links) ? links.slice() : [];
    source.sort(function (a, b) {
      return text(a && a.source_path).localeCompare(text(b && b.source_path), "en") ||
        text(a && a.source_type).localeCompare(text(b && b.source_type), "en") ||
        text(a && a.source_title).localeCompare(text(b && b.source_title), "en") ||
        text(a && a.knowledge_path).localeCompare(text(b && b.knowledge_path), "en");
    });
    for (var i = 0; i < source.length; i++) {
      var link = source[i];
      if (!link || typeof link !== "object") continue;
      var key = text(link.source_path);
      if (!groups.has(key)) {
        groups.set(key, {
          source_path: key,
          source_title: text(link.source_title) || key.split("/").pop() || key,
          source_type: text(link.source_type),
          source_type_label: sourceTypeLabel(link.source_type),
          source_metadata: link.source_metadata || sourceMetadata(null, key, link.source_type, link.source_title),
          knowledge: []
        });
      }
      groups.get(key).knowledge.push(link);
    }

    var result = Array.from(groups.values()).map(function (group) {
      var knowledge = Object.freeze(group.knowledge.slice().sort(function (a, b) {
        return a.knowledge_path.localeCompare(b.knowledge_path, "en") ||
          a.knowledge_title.localeCompare(b.knowledge_title, "en");
      }));
      var searchValues = [group.source_path, group.source_title, group.source_type, group.source_type_label];
      knowledge.forEach(function (item) { searchValues.push(item.search_text); });
      return Object.freeze({
        source_path: group.source_path,
        source_title: group.source_title,
        source_type: group.source_type,
        source_type_label: group.source_type_label,
        source_metadata: group.source_metadata,
        link_count: knowledge.length,
        knowledge_count: knowledge.length,
        knowledge: knowledge,
        search_text: stableSearchText(searchValues)
      });
    });
    result.sort(function (a, b) {
      return a.source_type.localeCompare(b.source_type, "en") ||
        a.source_path.localeCompare(b.source_path, "en") ||
        a.source_title.localeCompare(b.source_title, "en");
    });
    return Object.freeze(result);
  }

  function incrementCount(counts, key, amount) {
    var name = String(key);
    if (!Object.prototype.hasOwnProperty.call(counts, name)) {
      Object.defineProperty(counts, name, { value: 0, writable: true, enumerable: true, configurable: true });
    }
    counts[name] += amount === undefined ? 1 : amount;
  }
  function frozenCountMap(counts) {
    var result = {};
    Object.keys(counts).sort().forEach(function (key) {
      Object.defineProperty(result, key, { value: counts[key], enumerable: true, configurable: false, writable: false });
    });
    return Object.freeze(result);
  }

  function buildSourceDetails(groups) {
    var details = {};
    groups.forEach(function (group) {
      var key = group.source_path.toLowerCase();
      if (!key) key = "\x1f" + group.source_type.toLowerCase() + "\x1f" + group.source_title.toLowerCase();
      if (details[key]) return;
      details[key] = Object.freeze({
        source_path: group.source_path,
        source_title: group.source_title,
        source_type: group.source_type,
        source_type_label: group.source_type_label,
        source_metadata: group.source_metadata,
        link_count: group.link_count,
        knowledge_count: group.knowledge_count,
        search_text: group.search_text,
        knowledge: group.knowledge
      });
    });
    return Object.freeze(details);
  }

  function projectParaKnowledge(records, relationRecords) {
    var knowledgeIndex = buildKnowledgeIndex(records);
    var links = collectLinkedKnowledge(relationRecords, knowledgeIndex);
    var groups = groupBySource(links);
    var sourceTypeCounts = {};
    var sourceTypeLinkCounts = {};
    var sourceLinkCounts = {};
    var knowledgeLinkCounts = {};
    groups.forEach(function (group) {
      var type = group.source_type || "";
      incrementCount(sourceTypeCounts, type);
      incrementCount(sourceTypeLinkCounts, type, group.link_count);
      incrementCount(sourceLinkCounts, group.source_path, group.link_count);
      group.knowledge.forEach(function (item) {
        incrementCount(knowledgeLinkCounts, item.knowledge_path);
      });
    });
    var sourceTypeOptions = Object.keys(sourceTypeCounts).sort().map(function (type) {
      return Object.freeze({
        value: type,
        source_type: type,
        label: sourceTypeLabel(type),
        source_count: sourceTypeCounts[type],
        link_count: sourceTypeLinkCounts[type]
      });
    });
    var sourceDetails = buildSourceDetails(groups);
    var linkCounts = Object.freeze({
      total: links.length,
      by_source: frozenCountMap(sourceLinkCounts),
      by_source_type: frozenCountMap(sourceTypeLinkCounts),
      by_knowledge: frozenCountMap(knowledgeLinkCounts)
    });
    var knowledgeList = Array.from(knowledgeIndex.values()).sort(function (a, b) {
      return a.path.localeCompare(b.path, "en");
    });
    var sourceCounts = frozenCountMap(sourceLinkCounts);
    var typeCounts = frozenCountMap(sourceTypeCounts);
    var searchText = stableSearchText(groups.map(function (group) { return group.search_text; }));

    return Object.freeze({
      schema_version: 1,
      total_links: links.length,
      total_sources: groups.length,
      total_knowledge: knowledgeIndex.size,
      links: links,
      groups: groups,
      knowledge_index: knowledgeIndex,
      knowledge: Object.freeze(knowledgeList),
      source_type_counts: frozenCountMap(sourceTypeCounts),
      source_type_link_counts: frozenCountMap(sourceTypeLinkCounts),
      source_type_options: Object.freeze(sourceTypeOptions),
      source_link_counts: frozenCountMap(sourceLinkCounts),
      knowledge_link_counts: frozenCountMap(knowledgeLinkCounts),
      link_counts: linkCounts,
      source_details_by_path: sourceDetails,
      detail_by_source_path: sourceDetails,
      selected_source_lookup: sourceDetails,
      source_detail_lookup: sourceDetails,
      search_text: searchText,
      source_counts: sourceCounts,
      type_counts: typeCounts,
      source_details: sourceDetails,
      detail_by_source: sourceDetails
    });
  }

  function getSourceDetail(model, sourcePath) {
    if (!model || !model.source_details_by_path) return null;
    var key = text(sourcePath).replace(/\\/g, "/").toLowerCase();
    return model.source_details_by_path[key] ||
      model.source_details_by_path[key + ".md"] ||
      model.source_details_by_path[key.replace(/\.md$/i, "")] || null;
  }

  var api = Object.freeze({
    metadataSearchValues: metadataSearchValues,
    KNOWLEDGE_TYPES: KNOWLEDGE_TYPES,
    SOURCE_TYPE_LABELS: SOURCE_TYPE_LABELS,
    isKnowledge: isKnowledge,
    canonicalPath: canonicalPath,
    parseWikilink: parseWikilink,
    stableSearchText: stableSearchText,
    sourceMetadata: sourceMetadata,
    buildKnowledgeIndex: buildKnowledgeIndex,
    collectLinkedKnowledge: collectLinkedKnowledge,
    groupBySource: groupBySource,
    projectParaKnowledge: projectParaKnowledge,
    getSourceDetail: getSourceDetail,
    findSourceDetail: getSourceDetail,
    sourceTypeLabel: sourceTypeLabel
  });
  root.KnowledgeParaProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
