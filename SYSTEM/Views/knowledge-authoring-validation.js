(function (root) {
  "use strict";

  const LITERATURE_PATH = "ZETA/LITERATURE/";
  const MAX_TITLE_TEXT = 240;
  const MAX_FIELD_TEXT = 6000;

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function freezeDeep(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const child of Array.isArray(value) ? value : Object.values(value)) freezeDeep(child);
    return Object.freeze(value);
  }

  function optionalText(value, field, limit) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string") throw new Error(`${field} must be a string.`);
    const text = value.trim();
    if (text.length > (limit || MAX_FIELD_TEXT)) throw new Error(`${field} is too long.`);
    return text;
  }

  function requiredText(value, field, limit) {
    const text = optionalText(value, field, limit);
    if (!text) throw new Error(`${field} must be a non-empty string.`);
    return text;
  }

  function hostileMarkup(value) {
    return /[\u0000-\u001f\u007f]/.test(value)
      || value.includes("[[") || value.includes("]]") || value.includes("\\")
      || value.includes("..") || value.includes("{{") || value.includes("}}");
  }

  function safeTitle(value, field) {
    const title = requiredText(value, field || "title", MAX_TITLE_TEXT).normalize("NFC");
    if (hostileMarkup(title) || title.includes("/")) throw new Error(`${field || "title"} must be safe title text.`);
    return title;
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function canonicalId(prefix, parts) {
    const normalized = parts.map((part) => typeof part === "string" ? part.trim().normalize("NFC") : "");
    return `${prefix}-${hash(normalized.join("\u001f"))}`;
  }

  function sourceId(input) {
    if (!isRecord(input)) throw new Error("source must be an object.");
    return canonicalId("source", [
      input.source_kind, input.source_url, input.source_title, input.creator,
      input.publisher, input.published_at, input.source_claim,
    ]);
  }

  function candidateId(input) {
    if (!isRecord(input)) throw new Error("candidate must be an object.");
    return canonicalId("candidate", [
      input.source_type, input.title, input.statement, input.reason, input.source_note,
      ...(Array.isArray(input.source_evidence_ids) ? input.source_evidence_ids : []),
      ...(Array.isArray(input.source_objects) ? input.source_objects : []),
    ]);
  }

  function url(value, field) {
    const text = optionalText(value, field || "source_url", MAX_TITLE_TEXT * 4);
    if (!text) return "";
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      throw new Error("유효하지 않은 출처 URL입니다. HTTP(S) URL을 입력해 주세요.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("유효하지 않은 출처 URL입니다. HTTP(S) URL을 입력해 주세요.");
    }
    return parsed.href;
  }

  function exactEnum(value, field, allowed, message) {
    const normalized = requiredText(value, field);
    if (!allowed.has(normalized)) throw new Error(message || `${field} is invalid.`);
    return normalized;
  }

  function uniqueList(value, field, normalizer) {
    if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
    const values = [];
    const seen = new Set();
    value.forEach((item, index) => {
      const normalized = normalizer(item, `${field}[${index}]`);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        values.push(normalized);
      }
    });
    return values;
  }

  function canonicalLiteratureLink(value, field) {
    const text = requiredText(value, field || "source_objects", MAX_TITLE_TEXT * 2).replace(/\\/g, "/");
    const match = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
    if (!match) throw new Error("학습 자료 출처를 하나만 선택해 주세요.");
    const target = match[1].trim().replace(/\.md$/i, "");
    if (!target.startsWith(LITERATURE_PATH) || target.slice(LITERATURE_PATH.length).length === 0
      || target.split("/").some((part) => !part || part === "." || part === "..") || target.includes("..")) {
      throw new Error("학습 자료 출처를 하나만 선택해 주세요.");
    }
    return `[[${target}]]`;
  }

  function evidenceIds(value) {
    const inputs = value === undefined ? [] : value;
    return uniqueList(inputs, "source_evidence_ids", (entry, field) => {
      const id = requiredText(entry, field, 128);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error(`${field} must be a safe stable id.`);
      return id;
    });
  }

  function wikiLink(value, field) {
    const text = requiredText(value, field || "source_objects", MAX_TITLE_TEXT * 2).replace(/\\/g, "/");
    const match = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
    if (!match) throw new Error(`${field || "source_objects"} must be a canonical wiki link.`);
    const target = match[1].trim().replace(/\.md$/i, "");
    if (!target || target.startsWith("/") || target.split("/").some((part) => !part || part === "." || part === "..") || target.includes("..")) {
      throw new Error(`${field || "source_objects"} must be a canonical wiki link.`);
    }
    return `[[${target}]]`;
  }

  function optionalLinks(value, field) {
    const inputs = value === undefined ? [] : value;
    return uniqueList(inputs, field || "source_objects", (entry, itemField) => wikiLink(entry, itemField));
  }

  function optionalMachineId(value, field) {
    const id = optionalText(value, field, 128);
    if (id && !/^[a-z][a-z0-9_-]*$/.test(id)) throw new Error(`${field} must be a safe stable id.`);
    return id;
  }

  // --- Region link validation ---
  const REGION_ROOT = "PARA/RESOURCES/Auction Regions/";

  /**
   * Validate an exact canonical Region wikilink.
   * Body text, coordinates alone, and fuzzy district names do NOT create links.
   * Only [[PARA/RESOURCES/Auction Regions/<region_key>]] is accepted.
   */
  function regionLink(value, field) {
    const text = requiredText(value, field || "connections", MAX_TITLE_TEXT * 2).replace(/\\/g, "/");
    const match = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
    if (!match) throw new Error("정확한 Region wikilink가 필요합니다.");
    const target = match[1].trim().replace(/\.md$/i, "");
    if (!target.startsWith(REGION_ROOT) || target.slice(REGION_ROOT.length).length === 0
      || target.includes("..") || target.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("정확한 Region wikilink가 필요합니다.");
    }
    return `[[${target}]]`;
  }

  /**
   * Validate a list of connections, extracting only exact Region links.
   * Non-Region wikilinks pass through unchanged; body text is never parsed for Regions.
   */
  function connectionsWithRegions(value, field) {
    const inputs = value === undefined ? [] : value;
    return uniqueList(inputs, field || "connections", (entry, itemField) => wikiLink(entry, itemField));
  }

  /**
   * Extract only exact Region links from a validated connections list.
   */
  function extractRegionLinks(connections) {
    const list = Array.isArray(connections) ? connections : [];
    const result = [];
    for (const link of list) {
      const text = typeof link === "string" ? link.trim() : "";
      const match = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
      if (!match) continue;
      const target = match[1].trim().replace(/\.md$/i, "").replace(/\\/g, "/");
      if (target.startsWith(REGION_ROOT) && target.slice(REGION_ROOT.length).length > 0) {
        result.push(`[[${target}]]`);
      }
    }
    return result;
  }

  /**
   * Validate invalidation_conditions as a YAML list of text strings.
   */
  function invalidationConditions(value, field) {
    const inputs = value === undefined ? [] : value;
    return uniqueList(inputs, field || "invalidation_conditions", (entry, itemField) => {
      const text = requiredText(entry, itemField, MAX_FIELD_TEXT);
      if (hostileMarkup(text)) throw new Error(`${itemField} must be safe text.`);
      return text;
    });
  }

  const api = freezeDeep({
    LITERATURE_PATH, MAX_TITLE_TEXT, MAX_FIELD_TEXT,
    isRecord, freezeDeep, optionalText, requiredText, hostileMarkup, safeTitle,
    canonicalId, sourceId, candidateId, url, exactEnum, uniqueList,
    canonicalLiteratureLink, evidenceIds, wikiLink, optionalLinks, optionalMachineId,
    REGION_ROOT, regionLink, connectionsWithRegions, extractRegionLinks, invalidationConditions,
  });

  root.KnowledgeAuthoringValidation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
