(function (root) {
  "use strict";

  const BRIEF_SCHEMA_VERSION = 1;
  const ALLOWED_PACKET_KEYS = new Set(["schema_version", "domain", "domain_label", "signals"]);
  const ALLOWED_SIGNAL_KEYS = new Set([
    "recent_additions",
    "explicit_link_frequency",
    "repeated_related_topics",
    "unclassified_items"
  ]);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
    return value;
  }

  function canonicalSourceId(value) {
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

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function uniqueStable(values) {
    const seen = new Set();
    return values.filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function normalizeSignalItems(items, mapper) {
    return Array.isArray(items) ? items.flatMap((item) => {
      const normalized = mapper(item);
      return normalized ? [normalized] : [];
    }) : [];
  }

  function normalizeSignalBundle(packet) {
    const rootPacket = isPlainObject(packet) ? packet : {};
    const signals = isPlainObject(rootPacket.signals) ? rootPacket.signals : rootPacket;
    const normalized = {
      schema_version: normalizeNumber(rootPacket.schema_version || BRIEF_SCHEMA_VERSION) || BRIEF_SCHEMA_VERSION,
      domain: canonicalSourceId(normalizeText(rootPacket.domain)) || "unclassified",
      domain_label: normalizeText(rootPacket.domain_label),
      recent_additions: [], explicit_link_frequency: [], repeated_related_topics: [], unclassified_items: [], warnings: []
    };
    for (const key of Object.keys(rootPacket)) if (!ALLOWED_PACKET_KEYS.has(key)) normalized.warnings.push(`unexpected_packet_key:${key}`);
    for (const key of Object.keys(signals)) if (!ALLOWED_SIGNAL_KEYS.has(key)) normalized.warnings.push(`unexpected_signal_key:${key}`);

    normalized.recent_additions = normalizeSignalItems(signals.recent_additions, (item) => {
      if (!isPlainObject(item)) return null;
      const source_id = canonicalSourceId(item.source_id || item.source_path);
      return source_id ? { source_id, title: normalizeText(item.title) || source_id.split("/").pop() || source_id, recency: normalizeNumber(item.recency) } : null;
    }).sort((left, right) => right.recency - left.recency || left.title.localeCompare(right.title, "ko") || left.source_id.localeCompare(right.source_id, "en"));
    normalized.explicit_link_frequency = normalizeSignalItems(signals.explicit_link_frequency, (item) => {
      if (!isPlainObject(item)) return null;
      const source_id = canonicalSourceId(item.source_id || item.target_path || item.target_id);
      return source_id ? { source_id, title: normalizeText(item.title) || source_id.split("/").pop() || source_id, mentions: Math.max(0, Math.floor(normalizeNumber(item.mentions))) } : null;
    }).sort((left, right) => right.mentions - left.mentions || left.title.localeCompare(right.title, "ko") || left.source_id.localeCompare(right.source_id, "en"));
    normalized.repeated_related_topics = normalizeSignalItems(signals.repeated_related_topics, (item) => {
      const topic = isPlainObject(item) ? normalizeText(item.topic) : "";
      return topic ? { topic, mentions: Math.max(0, Math.floor(normalizeNumber(item.mentions))) } : null;
    }).sort((left, right) => right.mentions - left.mentions || left.topic.localeCompare(right.topic, "ko"));
    normalized.unclassified_items = normalizeSignalItems(signals.unclassified_items, (item) => {
      if (!isPlainObject(item)) return null;
      const source_id = canonicalSourceId(item.source_id || item.source_path);
      return source_id ? { source_id, title: normalizeText(item.title) || source_id.split("/").pop() || source_id, reason: normalizeText(item.reason) || "unclassified" } : null;
    }).sort((left, right) => left.title.localeCompare(right.title, "ko") || left.source_id.localeCompare(right.source_id, "en"));
    normalized.source_ids = uniqueStable([
      ...normalized.recent_additions.map((item) => item.source_id),
      ...normalized.explicit_link_frequency.map((item) => item.source_id),
      ...normalized.unclassified_items.map((item) => item.source_id)
    ]);
    return deepFreeze(normalized);
  }

  function buildDeterministicBrief(packet) {
    const normalized = normalizeSignalBundle(packet);
    const recent = normalized.recent_additions.slice(0, 2).map((item) => item.title);
    const topLink = normalized.explicit_link_frequency[0];
    const topic = normalized.repeated_related_topics[0];
    const unclassified = normalized.unclassified_items.slice(0, 2).map((item) => item.title);
    const lines = [
      recent.length ? `최근 추가: ${recent.join(", ")}` : "최근 추가: 없음",
      topLink ? `가장 많이 연결된 항목: ${topLink.title} (${topLink.mentions}회)` : "가장 많이 연결된 항목: 없음",
      topic ? `반복 토픽: ${topic.topic} (${topic.mentions}회)` : "반복 토픽: 없음",
      unclassified.length ? `미분류: ${unclassified.join(", ")}` : "미분류: 없음"
    ];
    return deepFreeze({ schema_version: BRIEF_SCHEMA_VERSION, domain: normalized.domain, domain_label: normalized.domain_label, lines, source_ids: normalized.source_ids, packet: normalized });
  }

  const api = Object.freeze({
    BRIEF_SCHEMA_VERSION, isPlainObject, deepFreeze, canonicalSourceId, normalizeText, normalizeNumber,
    uniqueStable, normalizeSignalBundle, buildDeterministicBrief
  });
  root.KnowledgeExplorerBriefCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
