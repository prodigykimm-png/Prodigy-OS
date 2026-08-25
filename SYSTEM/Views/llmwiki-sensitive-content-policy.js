(function (root) {
  "use strict";

  const TOKEN = /\b(?:sk|rk|ghp|gho|github_pat|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/u;
  const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u;
  const ASSIGNED_SECRET = /\b(?:password|passwd|passphrase|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*['"]?[^\s'"`]{8,}/iu;
  const PEM = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u;
  const REDACTED = "[REDACTED]";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value : ""; }
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
    const boundary = root.LLMWikiInboxPrivacyBoundary;
    if (path.startsWith("INBOX/") && boundary && typeof boundary.classifyInboxSource === "function") {
      const privacy = boundary.classifyInboxSource({ source_path: path, metadata });
      if (privacy.route === "hold" || privacy.route === "people") return freeze({ ...privacy, type: "hold", redacted: true, content: "" });
    }
    const value = text(input.source_text || input.content);
    const match = PEM.test(value) ? "private_key" : JWT.test(value) ? "token" : TOKEN.test(value) ? "token" : ASSIGNED_SECRET.test(value) ? "credential" : null;
    if (!match) return freeze({ type: "allow", redacted: false, reason: "no_high_confidence_secret" });
    return freeze({ type: "hold", route: "hold", reason: "sensitive_content", sensitive_kind: match, redacted: true, content: redact(value) });
  }
  const api = Object.freeze({ inspect, redact });
  root.LLMWikiSensitiveContentPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
