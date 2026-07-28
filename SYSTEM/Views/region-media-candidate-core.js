(function (root) {
  "use strict";

  /**
   * Region Media Candidate Core
   * Manual Instagram URL capture (save only after explicit user action, no crawler/parser).
   * Disabled Naver/YouTube candidate adapters (zero network without keys).
   * Media candidates are never canonical metrics.
   */

  const PROVIDER_STATUS = Object.freeze({
    instagram_manual: "manual",
    naver_candidate: "disabled",
    youtube_candidate: "disabled"
  });

  const MEDIA_KINDS = Object.freeze(["instagram", "naver", "youtube"]);

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
    return value.trim();
  }

  function optionalText(value, field) {
    if (value === undefined || value === null || value === "") return "";
    return requiredText(value, field);
  }

  function validateHttpUrl(value, field) {
    const text = requiredText(value, field);
    let parsed;
    try {
      parsed = new URL(text);
    } catch (_e) {
      throw new Error("유효하지 않은 URL입니다. HTTP(S) URL을 입력해 주세요.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("유효하지 않은 URL입니다. HTTP(S) URL을 입력해 주세요.");
    }
    return parsed.href;
  }

  function regionLink(value, field) {
    const text = requiredText(value, field || "region_link");
    const match = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
    if (!match || !match[1].trim()) {
      throw new Error("정확한 Region wikilink가 필요합니다.");
    }
    const target = match[1].trim().replace(/\.md$/i, "");
    const REGION_ROOT = "PARA/RESOURCES/Auction Regions/";
    if (!target.startsWith(REGION_ROOT) || target.slice(REGION_ROOT.length).length === 0
      || target.startsWith("/") || target.includes("..") || target.split("/").some((p) => !p || p === "." || p === "..")) {
      throw new Error("정확한 Region wikilink가 필요합니다.");
    }
    return `[[${target}]]`;
  }

  // --- Manual Instagram capture ---

  function createInstagramCandidate(input) {
    if (!isRecord(input)) throw new Error("input must be an object.");
    const url = validateHttpUrl(input.url, "url");
    const region = regionLink(input.region_link, "region_link");
    const title = optionalText(input.title, "title");
    const note = optionalText(input.note, "note");
    const createdAt = requiredText(input.created, "created");
    return Object.freeze({
      type: "media_candidate",
      provider: "instagram_manual",
      provider_status: "manual",
      media_kind: "instagram",
      url,
      region_link: region,
      title,
      note,
      fetched: false,
      network_dispatched: false,
      created: createdAt
    });
  }

  function duplicateInstagramUrl(existing, candidateUrl) {
    const normalized = candidateUrl.replace(/\/+$/, "").toLowerCase();
    return (Array.isArray(existing) ? existing : []).some((item) => {
      if (!isRecord(item) || typeof item.url !== "string") return false;
      return item.url.replace(/\/+$/, "").toLowerCase() === normalized;
    });
  }

  // --- Disabled Naver adapter ---

  function naverAdapterState(apiKey) {
    const hasKey = typeof apiKey === "string" && apiKey.trim().length > 0;
    if (!hasKey) {
      return Object.freeze({
        provider: "naver_candidate",
        status: "blocked_auth",
        reason: "X-Naver-Client-Id and X-Naver-Client-Secret are required.",
        network_allowed: false,
        network_dispatched: false,
        canonical_metric: false,
        candidates: []
      });
    }
    // Even with a key, the adapter is disabled by registry policy.
    return Object.freeze({
      provider: "naver_candidate",
      status: "disabled",
      reason: "Provider is disabled in the source registry. Candidate-only gate.",
      network_allowed: false,
      network_dispatched: false,
      canonical_metric: false,
      candidates: []
    });
  }

  // --- Disabled YouTube adapter ---

  function youtubeAdapterState(apiKey) {
    const hasKey = typeof apiKey === "string" && apiKey.trim().length > 0;
    if (!hasKey) {
      return Object.freeze({
        provider: "youtube_candidate",
        status: "blocked_auth",
        reason: "YouTube Data API key is required.",
        network_allowed: false,
        network_dispatched: false,
        canonical_metric: false,
        candidates: []
      });
    }
    return Object.freeze({
      provider: "youtube_candidate",
      status: "disabled",
      reason: "Provider is disabled in the source registry. Candidate-only gate.",
      network_allowed: false,
      network_dispatched: false,
      canonical_metric: false,
      candidates: []
    });
  }

  // --- Stale candidate detection ---

  function isStaleCandidate(candidate, asOf) {
    if (!isRecord(candidate)) return true;
    const created = typeof candidate.created === "string" ? candidate.created : "";
    const asOfDate = typeof asOf === "string" ? asOf : "";
    if (!created || !asOfDate) return true;
    const createdMs = Date.parse(created);
    const asOfMs = Date.parse(asOfDate);
    if (!Number.isFinite(createdMs) || !Number.isFinite(asOfMs)) return true;
    const STALE_DAYS = 90;
    return (asOfMs - createdMs) > STALE_DAYS * 24 * 60 * 60 * 1000;
  }

  const api = Object.freeze({
    PROVIDER_STATUS,
    MEDIA_KINDS,
    createInstagramCandidate,
    duplicateInstagramUrl,
    naverAdapterState,
    youtubeAdapterState,
    isStaleCandidate,
    validateHttpUrl,
    regionLink
  });

  root.RegionMediaCandidateCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
