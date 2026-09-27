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
  const RECOVERY_ACTION = "remove_or_relocate_credential_then_retry";
  const PLACEHOLDER_WORDS = new Set(["EXAMPLE", "REDACTED", "PLACEHOLDER"]);
  const PLACEHOLDER_MASK = /^x{8,}$/iu;
  const AWS_DOCUMENTATION_ACCESS_KEY_ID = ["AK", "IA", "IOSFODNN7", "EXAMPLE"].join("");
  const CREDENTIAL_TOKEN_CHAR = /[A-Za-z0-9_-]/u;
  const CREDENTIAL_LINE_FOLD = /([A-Za-z0-9_-])(?:(?:\r\n?|\n)[ \t]*|\t)(?=[A-Za-z0-9_-])/gu;
  const CREDENTIAL_PREFIX = /^(?:sk-|gh[pousr]_|github_pat_|AKIA|ASIA|AIza|xox[baprs]-)/u;
  const CREDENTIAL_PATTERNS = Object.freeze([
    Object.freeze({ kind: "openai_api_key", pattern: /sk-[A-Za-z0-9_-]{16,}/gu }),
    Object.freeze({ kind: "github_token", pattern: /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/gu }),
    Object.freeze({ kind: "aws_access_key_id", pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/gu }),
    Object.freeze({ kind: "google_api_key", pattern: /AIza[A-Za-z0-9_-]{35}/gu }),
    Object.freeze({ kind: "slack_token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/gu }),
    Object.freeze({ kind: "private_key", pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/gu }),
  ]);

  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) { return Object.freeze(value); }
  function decodeText(value) {
    if (typeof value === "string") return value;
    if (!ArrayBuffer.isView(value) || typeof TextDecoder !== "function") return "";
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      );
    } catch (_error) {
      return "";
    }
  }
  function placeholderPayload(kind, value) {
    if (kind === "openai_api_key" && value.startsWith("sk-")) return value.slice(3);
    if (kind === "github_token" && value.startsWith("github_pat_")) return value.slice("github_pat_".length);
    if (kind === "github_token" && /^gh[pousr]_/u.test(value)) return value.slice(4);
    if (kind === "slack_token" && /^xox[baprs]-/u.test(value)) return value.slice(5);
    return "";
  }
  function completeTokenContext(source, index, length) {
    const before = index > 0 ? source[index - 1] : "";
    const after = index + length < source.length ? source[index + length] : "";
    return (!before || !CREDENTIAL_TOKEN_CHAR.test(before))
      && (!after || !CREDENTIAL_TOKEN_CHAR.test(after));
  }
  function credentialPlaceholder(kind, value, source, index) {
    if (!completeTokenContext(source, index, value.length)) return false;
    if (kind === "aws_access_key_id") return value === AWS_DOCUMENTATION_ACCESS_KEY_ID;
    const payload = placeholderPayload(kind, value);
    if (!payload) return false;
    const segments = payload.split(/[-_]/u).filter(Boolean);
    return segments.length > 0 && segments.every((segment) => PLACEHOLDER_WORDS.has(segment.toUpperCase()) || PLACEHOLDER_MASK.test(segment));
  }
  function credentialMatches(value, location) {
    const candidate = decodeText(value).replace(
      CREDENTIAL_LINE_FOLD,
      (match, left, offset, source) => CREDENTIAL_PREFIX.test(source.slice(offset + match.length)) ? match : left,
    );
    if (!candidate) return [];
    const matches = [];
    for (const rule of CREDENTIAL_PATTERNS) {
      for (const match of candidate.matchAll(rule.pattern)) matches.push({
        kind: rule.kind,
        location,
        placeholder: credentialPlaceholder(rule.kind, match[0], candidate, match.index),
      });
    }
    return matches;
  }
  function credentialMatchesInMetadata(metadata) {
    const queue = [metadata];
    const seen = new WeakSet();
    const matches = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const value = queue[cursor];
      matches.push(...credentialMatches(value, "metadata"));
      if (!value || typeof value !== "object" || ArrayBuffer.isView(value) || seen.has(value)) continue;
      seen.add(value);
      let keys;
      try { keys = Object.keys(value); } catch (_error) { continue; }
      for (const key of keys) {
        matches.push(...credentialMatches(key, "metadata"));
        try { queue.push(value[key]); } catch (_error) { /* malformed metadata stays local */ }
      }
    }
    return matches;
  }
  function classifyCredentialPatterns(input = {}) {
    const matches = [
      ...credentialMatches(input.source_path, "path"),
      ...credentialMatchesInMetadata(plain(input.metadata) ? input.metadata : {}),
    ];
    for (const value of [input.source_text, input.content, input.body, input.text]) {
      matches.push(...credentialMatches(value, "body"));
    }
    const selected = matches.find((match) => match.placeholder !== true) || matches[0];
    if (selected) return freeze({
      type: "hold",
      kind: selected.kind,
      location: selected.location,
      placeholder: matches.every((match) => match.placeholder === true),
      match_count: matches.length,
      reason: `credential_quarantined_${selected.kind}_${RECOVERY_ACTION}`,
      recovery_action: RECOVERY_ACTION,
      redacted: true,
    });
    return freeze({ type: "allow", reason: "no_credential_pattern", redacted: true });
  }
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
    const credential = classifyCredentialPatterns(input);
    if (credential.type === "hold") return freeze({
      route: "hold",
      privacy_class: "private",
      provider_eligibility: [],
      outbound_allowed: false,
      reason: credential.reason,
      credential,
      resumable: true,
    });
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

  const api = Object.freeze({ classifyCredentialPatterns, classifyInboxSource, isSafeInboxPath: safePath });
  root.LLMWikiInboxPrivacyBoundary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
