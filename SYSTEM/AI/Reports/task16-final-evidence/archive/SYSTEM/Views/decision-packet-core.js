(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const KNOWLEDGE_TYPES = new Set(["knowledge", "permanent_note"]);
  const REGION_RESOURCE_TYPE = "auction_region";
  const DECISION_TYPE = "decision";

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function token(value) {
    return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, "_") : "";
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

  function dataFor(source) {
    const frontmatter = isPlainObject(source.frontmatter) ? source.frontmatter : {};
    return { ...frontmatter, ...source };
  }

  function pathFor(source, data) {
    const filePath = isPlainObject(source.file) ? source.file.path : "";
    return canonicalPath(data.source_path || data.path || filePath || "");
  }

  function titleFor(data, path) {
    const title = typeof data.title === "string" ? data.title.normalize("NFC").trim().replace(/\s+/g, " ") : "";
    if (title) return title;
    const fileName = path.split("/").pop() || "";
    return fileName.replace(/\.md$/i, "") || "Untitled";
  }

  function timestamp(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    if (typeof value !== "string" || !value.trim()) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function recencyFor(data) {
    return Math.max(timestamp(data.updated), timestamp(data.created));
  }

  function values(value) {
    const source = Array.isArray(value) ? value : [value];
    return source.flatMap((item) => typeof item === "string" ? item.split(",") : []);
  }

  function topicValues(value) {
    return [...new Set(values(value).map(token).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
  }

  function regionValue(value) {
    return typeof value === "string" ? value.trim().normalize("NFC") : "";
  }

  function wikilinkTarget(value) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    const target = text.startsWith("[[") && text.endsWith("]]") ? text.slice(2, -2).split("|")[0] : text;
    return canonicalPath(target);
  }

  function connectionPaths(data) {
    return [...new Set([
      ...values(data.connections),
      ...values(data.outlinks),
      ...values(data.links),
      ...values(data.auction_path),
      ...values(data.property_path)
    ].map(wikilinkTarget).filter(Boolean))];
  }

  function warning(code, path, message) {
    return { code, path: path || null, message };
  }

  function normalizeContext(input, warnings) {
    const raw = isPlainObject(input.auction) ? input.auction : isPlainObject(input.property) ? input.property : null;
    if (!raw) {
      warnings.push(warning("missing_context", null, "Auction or property context is missing."));
      return { path: "", title: "", region_sido: "", region_sigungu: "", topics: [] };
    }
    const data = dataFor(raw);
    return {
      path: pathFor(raw, data),
      title: titleFor(data, pathFor(raw, data)),
      region_sido: regionValue(data.region_sido),
      region_sigungu: regionValue(data.region_sigungu),
      topics: topicValues(data.knowledge_topics || data.topics)
    };
  }

  function matchSignals(record, context) {
    const direct = Boolean(context.path) && connectionPaths(record.data).includes(context.path);
    const region = Boolean(context.region_sido && context.region_sigungu)
      && record.region_sido === context.region_sido
      && record.region_sigungu === context.region_sigungu;
    const matchedTopics = record.topics.filter((value) => context.topics.includes(value));
    const topic = matchedTopics.length > 0;
    return { direct, region, topic, topics: matchedTopics, score: (direct ? 100 : 0) + (region ? 80 : 0) + (topic ? 50 : 0) };
  }

  function compareRanked(left, right) {
    return right.score - left.score
      || right.recency - left.recency
      || left.title.localeCompare(right.title, "ko")
      || left.path.localeCompare(right.path, "en");
  }

  function publicRecord(record, matched) {
    return {
      path: record.path,
      title: record.title,
      type: record.type,
      recency: record.recency,
      score: matched.score,
      matched: { direct: matched.direct, region: matched.region, topic: matched.topic, topics: matched.topics.slice() }
    };
  }

  function projectCandidate(source, warnings) {
    if (!isPlainObject(source)) {
      warnings.push(warning("malformed_record", null, "Candidate record must be a plain object."));
      return null;
    }
    const data = dataFor(source);
    const path = pathFor(source, data);
    if (!path) {
      warnings.push(warning("missing_path", null, "Candidate record has no safe canonical path."));
      return null;
    }
    const type = token(data.type);
    if (!type) {
      warnings.push(warning("missing_type", path, "Candidate record has no supported type."));
      return null;
    }
    return {
      data,
      path,
      title: titleFor(data, path),
      type,
      region_sido: regionValue(data.region_sido),
      region_sigungu: regionValue(data.region_sigungu),
      topics: topicValues(data.knowledge_topics || data.topics),
      recency: recencyFor(data)
    };
  }

  function emptyState(context, knowledge, regionResource, decisions) {
    const hasRegion = Boolean(context.region_sido && context.region_sigungu);
    const isEmpty = !knowledge.length && !regionResource && !decisions.length;
    return {
      copy: isEmpty ? "결정 패킷에 표시할 참고 기록이 없습니다." : null,
      reason: isEmpty ? (!context.path && !context.title
        ? "유효한 경매 또는 물건 맥락과 후보 기록이 없습니다."
        : "현재 맥락에 맞는 참고 기록이 없습니다.") : null,
      knowledge: knowledge.length ? null : {
        copy: "참조할 검증 지식이 없습니다.",
        reason: "현재 경매 또는 물건 맥락과 직접 연결되거나 같은 지역·주제에 해당하는 검증 지식이 없습니다."
      },
      region_resource: regionResource ? null : {
        copy: "일치하는 지역 분석 자료가 없습니다.",
        reason: hasRegion ? "일치하는 시·군·구 지역 분석 자료가 없습니다." : "경매 또는 물건의 시·도와 시·군·구 정보가 없어 지역 자료를 선택할 수 없습니다."
      },
      prior_decisions: decisions.length ? null : {
        copy: "참조할 이전 결정이 없습니다.",
        reason: "현재 경매 또는 물건 맥락과 직접 연결되거나 같은 지역·주제에 해당하는 이전 결정이 없습니다."
      }
    };
  }

  function buildDecisionPacket(input) {
    const warnings = [];
    const source = isPlainObject(input) ? input : {};
    if (!isPlainObject(input)) warnings.push(warning("malformed_input", null, "Decision packet input must be a plain object."));
    const context = normalizeContext(source, warnings);
    const candidates = Array.isArray(source.candidates) ? source.candidates : [];
    if (!Array.isArray(source.candidates) && source.candidates !== undefined) {
      warnings.push(warning("malformed_candidates", null, "Candidates must be an array; no candidates were used."));
    }

    const normalized = [];
    let excludedCount = 0;
    for (const candidate of candidates) {
      const record = projectCandidate(candidate, warnings);
      if (!record) continue;
      if (!KNOWLEDGE_TYPES.has(record.type) && record.type !== REGION_RESOURCE_TYPE && record.type !== DECISION_TYPE) {
        excludedCount += 1;
        continue;
      }
      normalized.push(record);
    }

    const knowledge = normalized
      .filter((record) => KNOWLEDGE_TYPES.has(record.type))
      .map((record) => ({ record, matched: matchSignals(record, context) }))
      .filter((entry) => entry.matched.score > 0)
      .sort((left, right) => compareRanked({ ...left.record, ...left.matched }, { ...right.record, ...right.matched }))
      .slice(0, 3)
      .map((entry) => publicRecord(entry.record, entry.matched));

    const matchingRegions = normalized
      .filter((record) => record.type === REGION_RESOURCE_TYPE)
      .filter((record) => context.region_sido && context.region_sigungu
        && record.region_sido === context.region_sido && record.region_sigungu === context.region_sigungu)
      .map((record) => ({ record, matched: matchSignals(record, context) }))
      .sort((left, right) => compareRanked({ ...left.record, ...left.matched }, { ...right.record, ...right.matched }));
    const regionResource = matchingRegions.length ? publicRecord(matchingRegions[0].record, matchingRegions[0].matched) : null;

    const priorDecisions = normalized
      .filter((record) => record.type === DECISION_TYPE)
      .map((record) => ({ record, matched: matchSignals(record, context) }))
      .filter((entry) => entry.matched.score > 0)
      .sort((left, right) => compareRanked({ ...left.record, ...left.matched }, { ...right.record, ...right.matched }))
      .slice(0, 2)
      .map((entry) => publicRecord(entry.record, entry.matched));

    warnings.sort((left, right) => (left.path || "").localeCompare(right.path || "", "en")
      || left.code.localeCompare(right.code, "en")
      || left.message.localeCompare(right.message, "en"));

    return {
      schema_version: SCHEMA_VERSION,
      context: { ...context, topics: [...context.topics] },
      knowledge,
      region_resource: regionResource,
      prior_decisions: priorDecisions,
      empty_state: emptyState(context, knowledge, regionResource, priorDecisions),
      excluded_count: excludedCount,
      warnings
    };
  }

  const api = Object.freeze({ SCHEMA_VERSION, canonicalPath, buildDecisionPacket, rankDecisionPacket: buildDecisionPacket });
  root.DecisionPacketCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
