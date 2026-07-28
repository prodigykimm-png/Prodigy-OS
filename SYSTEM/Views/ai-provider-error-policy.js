(function (root) {
  "use strict";

  const TRANSIENT_HTTP_STATUSES = new Set([500, 502, 503]);

  function redactError(error) {
    const text = error && error.message ? error.message : String(error || "Unknown provider error");
    return text.replace(/[A-Za-z0-9_\-]{24,}/g, "[redacted]");
  }

  function providerHttpError(status, responseText) {
    const error = new Error(`Provider HTTP ${status}`);
    error.name = "ProviderHttpError";
    error.status = Number(status || 0);
    error.responseText = String(responseText || "");
    return error;
  }

  function userFacingProviderError(error, provider, baseURL) {
    if (error && error.name === "AbortError") {
      const cancelled = new Error("AI 요청이 취소되었습니다.");
      cancelled.name = "AbortError";
      return cancelled;
    }
    const status = Number(error && error.status || 0);
    const rawMessage = error && error.message ? error.message : String(error || "");
    const isLocalConnectionFailure = provider
      && provider.authMode === "none"
      && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/i.test(String(baseURL || ""))
      && /ECONNREFUSED|fetch failed|failed to fetch|NetworkError|network request failed/i.test(rawMessage);
    let message = "";
    if (isLocalConnectionFailure) message = "LM Studio 서버에 연결할 수 없습니다. LM Studio의 Developer에서 Local Server를 시작해 주세요.";
    else if (status === 429) message = "AI 제공자 사용 한도에 도달했습니다. 공급자 사용량과 Rate limits를 확인해 주세요.";
    else if (TRANSIENT_HTTP_STATUSES.has(status)) message = "AI 제공자 사용량이 많아 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    else if (status === 401 || status === 403) message = "AI 제공자의 API 키 또는 접근 권한을 확인해 주세요.";
    else if (status) message = `AI 제공자 요청에 실패했습니다. (HTTP ${status}) 공급자 설정을 확인해 주세요.`;
    else message = "AI 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    const mapped = new Error(message);
    if (status) mapped.status = status;
    return mapped;
  }

  const api = Object.freeze({ TRANSIENT_HTTP_STATUSES, redactError, providerHttpError, userFacingProviderError });
  root.AIProviderErrorPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
