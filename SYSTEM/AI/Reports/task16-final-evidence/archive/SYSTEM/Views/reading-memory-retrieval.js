(function (root) {
  "use strict";

  function normalizePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\[\[|\]\]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function unique(values) {
    const seen = new Set();
    return (values || []).filter((value) => {
      const key = normalizeText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function overlap(left, right) {
    const rightKeys = new Set((right || []).map(normalizeText));
    return unique((left || []).filter((value) => rightKeys.has(normalizeText(value))));
  }

  function tokens(values) {
    const ignored = new Set(["the", "and", "for", "with", "that", "this", "것", "수", "및"]);
    return new Set(normalizeText((values || []).join(" ")).split(/\s+/).filter((word) => word.length >= 2 && !ignored.has(word)));
  }

  function sharedTokens(left, right) {
    const rightTokens = tokens(right);
    return [...tokens(left)].filter((word) => rightTokens.has(word)).sort((a, b) => a.localeCompare(b, "ko"));
  }

  function filenameTitle(sourcePath) {
    return (normalizePath(sourcePath).split("/").pop() || "").replace(/\.md$/i, "");
  }

  function linkMatches(entry, target) {
    const normalized = normalizeText(target);
    const path = normalizePath(entry.source_path).replace(/\.md$/i, "");
    return [entry.title, path, path.split("/").pop()].some((value) => normalizeText(value) === normalized);
  }

  function relationFor(query, candidate) {
    const relationTypes = [];
    const reasons = [];
    const evidence = [];
    let weight = 0;
    const topics = overlap(query.topics, candidate.topics);
    const concepts = overlap(query.key_concepts, candidate.key_concepts);
    const knowledge = overlap(query.knowledge_links, candidate.knowledge_links);
    const linked = (query.explicit_links || []).some((target) => linkMatches(candidate, target))
      || (candidate.explicit_links || []).some((target) => linkMatches(query, target));
    const claimWords = sharedTokens(query.core_claims, candidate.core_claims);
    const deltaWords = sharedTokens([query.thinking_delta], [candidate.thinking_delta]);
    if (knowledge.length) {
      relationTypes.push("related_knowledge"); reasons.push("같은 Knowledge 링크"); evidence.push(knowledge[0]); weight += 60;
    }
    if (linked) {
      relationTypes.push("explicit_link"); reasons.push("명시적 Wikilink 연결"); evidence.push(candidate.title); weight += 50;
    }
    if (concepts.length) {
      relationTypes.push("shared_concept"); reasons.push("같은 개념"); evidence.push(concepts[0]); weight += 40;
    }
    if (topics.length) {
      relationTypes.push("shared_topic"); reasons.push("같은 주제"); evidence.push(topics[0]); weight += 30;
    }
    if (claimWords.length >= 2) {
      relationTypes.push("claim_keyword_overlap"); reasons.push("주장 키워드 중첩"); evidence.push(claimWords.slice(0, 4).join(", ")); weight += 20;
    }
    if (deltaWords.length >= 2) {
      relationTypes.push("thinking_delta_relation"); reasons.push("Thinking Delta 키워드 연결"); evidence.push(deltaWords.slice(0, 4).join(", ")); weight += 15;
    }
    if (query.author && normalizeText(query.author) === normalizeText(candidate.author)) {
      relationTypes.push("same_author"); reasons.push("같은 저자"); evidence.push(candidate.author); weight += 10;
    }
    return { relationTypes, reasons, evidence: unique(evidence), weight };
  }

  function retrieveReadingMemoryCandidates(query, entries, limit = 5) {
    const queryPath = normalizePath(query && query.source_path).toLocaleLowerCase("ko-KR");
    const deduplicated = new Map();
    for (const entry of entries || []) {
      const path = normalizePath(entry && entry.source_path);
      const key = path.toLocaleLowerCase("ko-KR");
      if (!path || key === queryPath || deduplicated.has(key)) continue;
      deduplicated.set(key, entry);
    }
    const numericLimit = Number(limit);
    const boundedLimit = Number.isFinite(numericLimit) ? Math.max(0, Math.min(5, Math.floor(numericLimit))) : 5;
    return [...deduplicated.values()]
      .map((entry) => ({ entry, relation: relationFor(query, entry) }))
      .filter((item) => item.relation.relationTypes.length > 0)
      .sort((left, right) => right.relation.weight - left.relation.weight
        || right.relation.relationTypes.length - left.relation.relationTypes.length
        || normalizePath(left.entry.source_path).localeCompare(normalizePath(right.entry.source_path), "ko"))
      .slice(0, boundedLimit)
      .map(({ entry, relation }) => ({
        source_path: normalizePath(entry.source_path),
        title: entry.title || filenameTitle(entry.source_path),
        relation_types: relation.relationTypes,
        reason: relation.reasons.join(" · "),
        evidence: relation.evidence.slice(0, 3),
        ordering_basis: {
          relation_priority: relation.relationTypes,
          source_path: normalizePath(entry.source_path),
        },
      }));
  }

  const api = { retrieveReadingMemoryCandidates };
  root.ReadingMemoryRetrieval = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
