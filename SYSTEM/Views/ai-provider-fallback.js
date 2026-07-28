(function (root) {
  "use strict";

  const FALLBACK_HTTP_STATUSES = new Set([429, 500, 502, 503]);
  const RESPONSE_FORMAT_ERRORS = /Provider returned an empty response|Provider did not return valid JSON/i;
  const NETWORK_ERRORS = /ECONNREFUSED|fetch failed|NetworkError|network request failed/i;

  function statusOf(error) { return Number(error && error.status || 0); }

  function canRetryWithFallback(error) {
    if (!error || error.name === "AbortError") return false;
    const status = statusOf(error);
    if (status) return FALLBACK_HTTP_STATUSES.has(status);
    return RESPONSE_FORMAT_ERRORS.test(String(error.message || "")) || NETWORK_ERRORS.test(String(error.message || ""));
  }

  async function requestWithFallback(options) {
    const primary = options && options.provider;
    if (!primary || typeof options.request !== "function") throw new Error("AI provider request is not configured.");
    try {
      return { payload: await options.request(primary), provider: primary, usedFallback: false };
    } catch (primaryError) {
      const fallback = primary.fallbackProvider;
      if (!fallback || !canRetryWithFallback(primaryError)) throw primaryError;
      if (typeof options.isConfigured === "function" && !await options.isConfigured(fallback)) throw primaryError;
      try {
        return { payload: await options.request(fallback), provider: fallback, usedFallback: true };
      } catch (fallbackError) {
        fallbackError.prodigyFallback = { primary, fallback };
        throw fallbackError;
      }
    }
  }

  const api = Object.freeze({ canRetryWithFallback, requestWithFallback });
  root.AIProviderFallback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
