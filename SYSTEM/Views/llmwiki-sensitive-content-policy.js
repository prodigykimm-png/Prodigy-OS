(function (root) {
  "use strict";

  const TOKEN = /\b(?:sk|rk|ghp|gho|github_pat|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/u;
  const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u;
  const ASSIGNED_SECRET = /\b(?:password|passwd|passphrase|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*['"]?[^\s'"`]{8,}/iu;
  const PEM = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u;
  const REDACTED = "[REDACTED]";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value : ""; }
  function sourceText(input) {
    let unreadable = false;
    for (const key of ["source_text", "content", "body", "text"]) {
      let value;
      try { value = input[key]; } catch (_error) { unreadable = true; continue; }
      if (typeof value === "string" && value.length > 0) return { ok: true, value };
      if (!plain(value)) continue;
      let nested;
      try { nested = value.text; } catch (_error) { unreadable = true; continue; }
      if (typeof nested === "string" && nested.length > 0) return { ok: true, value: nested };
    }
    return { ok: false, reason: unreadable ? "source_text_unreadable" : "source_text_unavailable" };
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function redact(value) {
    return text(value).replace(PEM, REDACTED).replace(TOKEN, REDACTED).replace(JWT, REDACTED).replace(ASSIGNED_SECRET, (match) => match.replace(/(['"]?[:=]\s*['"]?)[^\s'"`]+$/u, "$1" + REDACTED));
  }
  function inspect(input = {}) {
    const metadata = plain(input.metadata) ? input.metadata : {};
    const path = text(input.source_path);
    const body = sourceText(input);
    const value = body.ok ? body.value : "";
    const boundary = root.LLMWikiInboxPrivacyBoundary;
    if (path.startsWith("INBOX/") && boundary && typeof boundary.classifyInboxSource === "function") {
      const privacy = boundary.classifyInboxSource({ source_path: path, source_text: value, metadata });
      if (privacy.route === "hold" || privacy.route === "people") return freeze({
        ...privacy,
        type: "hold",
        ...(privacy.credential?.kind ? { sensitive_kind: privacy.credential.kind } : {}),
        redacted: true,
        content: "",
      });
    }
    if (boundary && typeof boundary.classifyCredentialPatterns === "function") {
      const credential = boundary.classifyCredentialPatterns({ source_path: path, source_text: value, metadata });
      if (credential.type === "hold" && credential.placeholder === true) {
        return freeze({ type: "allow", redacted: false, reason: "documented_credential_placeholder" });
      }
      if (credential.type === "hold") return freeze({
        type: "hold",
        route: "hold",
        privacy_class: "private",
        provider_eligibility: [],
        outbound_allowed: false,
        reason: credential.reason,
        sensitive_kind: credential.kind,
        credential,
        recovery_action: credential.recovery_action,
        resumable: true,
        redacted: true,
        content: "",
      });
    }
    if (!body.ok) return freeze({
      type: "hold",
      route: "hold",
      status: "unavailable",
      privacy_class: "private",
      provider_eligibility: [],
      outbound_allowed: false,
      reason: body.reason,
      recovery_action: "retry_source_read",
      resumable: true,
      redacted: true,
      content: "",
    });
    const match = PEM.test(value) ? "private_key" : JWT.test(value) ? "token" : TOKEN.test(value) ? "token" : ASSIGNED_SECRET.test(value) ? "credential" : null;
    if (!match) return freeze({ type: "allow", redacted: false, reason: "no_high_confidence_secret" });
    return freeze({ type: "hold", route: "hold", reason: "sensitive_content", sensitive_kind: match, redacted: true, content: redact(value) });
  }
  const api = Object.freeze({ inspect, redact });
  root.LLMWikiSensitiveContentPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
