(function (root) {
  "use strict";

  const PRIVATE_SEGMENT = /(?:^|\/)(?:private|protected|sensitive|secrets?|credentials?)(?:\/|$)/iu;
  const PEOPLE_SEGMENT = /(?:^|\/)(?:people|persons?|contacts?)(?:\/|$)/iu;
  const TRUE = new Set([true, "allow", "allowed", "yes", "true"]);
  const MAX_PATH_LENGTH = 1024;
  const MAX_DECODE_PASSES = 4;
  const ENCODED_STRUCTURAL = /%(?:2e|2f|5c)/iu;
  const UNSAFE_CHAR = /[\\\u0000-\u001f\u007f?#]/u;
  const DRIVE_OR_ABSOLUTE = /^(?:\/|[a-z]:)/iu;

  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) { return Object.freeze(value); }
  function safePath(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH) return false;
    let current = value;
    for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
      if (current.length === 0 || current.length > MAX_PATH_LENGTH || DRIVE_OR_ABSOLUTE.test(current) || UNSAFE_CHAR.test(current) || ENCODED_STRUCTURAL.test(current)) return false;
      const segments = current.split("/");
      if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
      let decoded;
      try { decoded = decodeURIComponent(current); } catch (_error) { return false; }
      if (decoded === current) return true;
      current = decoded;
    }
    try { return decodeURIComponent(current) === current; } catch (_error) { return false; }
  }
  function classifyInboxSource(input = {}) {
    const path = typeof input.source_path === "string" ? input.source_path : "";
    const metadata = plain(input.metadata) ? input.metadata : {};
    if (!safePath(path)) return freeze({ route: "hold", privacy_class: "private", provider_eligibility: [], outbound_allowed: false, reason: "malformed_inbox_path" });
    if (!path.startsWith("INBOX/") || !path.endsWith(".md")) return freeze({ route: "ignored", privacy_class: "private", provider_eligibility: [], outbound_allowed: false, reason: "outside_inbox_boundary" });
    const metadataPrivate = metadata.private === true || metadata.sensitive === true || ["private", "protected", "sensitive"].includes(trim(metadata.privacy || metadata.privacy_class).toLowerCase());
    const protectedSource = PRIVATE_SEGMENT.test(path) || metadataPrivate;
    const peopleSource = PEOPLE_SEGMENT.test(path) || trim(metadata.type).toLowerCase() === "person";
    const explicitOutbound = TRUE.has(metadata.llmwiki_outbound) || TRUE.has(trim(metadata.llmwiki_outbound).toLowerCase());
    if (protectedSource) return freeze({ route: "hold", privacy_class: "private", provider_eligibility: [], outbound_allowed: false, reason: "protected_source" });
    if (peopleSource && !explicitOutbound) return freeze({ route: "people", privacy_class: "private", provider_eligibility: [], outbound_allowed: false, reason: "people_local_only" });
    if (peopleSource) return freeze({ route: "knowledge", privacy_class: "internal", provider_eligibility: ["direct"], outbound_allowed: true, reason: "people_explicitly_permitted" });
    // Relaxed root-INBOX intake (user decision 2026-08): any remaining INBOX markdown is analysis-eligible.
    // Personal material stays local via INBOX/Private/, private/protected/sensitive segments, or privacy markers.
    if (path.startsWith("INBOX/Knowledge/")) return freeze({ route: "knowledge", privacy_class: "internal", provider_eligibility: ["direct", "omniroute"], outbound_allowed: true, reason: "knowledge_inbox" });
    return freeze({ route: "knowledge", privacy_class: "internal", provider_eligibility: ["direct"], outbound_allowed: true, reason: "knowledge_inbox" });
  }

  const api = Object.freeze({ classifyInboxSource, isSafeInboxPath: safePath });
  root.LLMWikiInboxPrivacyBoundary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
