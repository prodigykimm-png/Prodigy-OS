(function (root) {
  "use strict";

  const COPY = Object.freeze({
    profile_missing: { copy: "LLMWiki AI 프로필이 설정되지 않았습니다.", action: "open_settings" },
    provider_mode_invalid: { copy: "LLMWiki AI 연결 모드를 확인해 주세요.", action: "open_settings" },
    provider_unavailable: { copy: "선택한 LLMWiki AI 연결을 사용할 수 없습니다.", action: "open_settings" },
    provider_missing: { copy: "LLMWiki에 연결할 AI 제공자 설정을 찾을 수 없습니다.", action: "open_settings" },
    provider_identity_mismatch: { copy: "LLMWiki AI 제공자 확인이 만료되었습니다. 다시 시도해 주세요.", action: "retry" },
    transport_unavailable: { copy: "LLMWiki AI 연결을 준비하지 못했습니다. 설정을 확인해 주세요.", action: "open_settings" },
    provider_rate_limited: { copy: "AI 제공자 사용량이 많아 LLMWiki 제안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", action: "retry_later" },
    provider_timeout: { copy: "LLMWiki AI 요청 시간이 초과되었습니다. 네트워크와 제공자 설정을 확인해 주세요.", action: "retry" },
    provider_aborted: { copy: "LLMWiki AI 요청을 취소했습니다.", action: "retry" },
    provider_unavailable_route: { copy: "LLMWiki AI 제공자에 연결하지 못했습니다. 설정을 확인해 주세요.", action: "open_settings" },
    response_malformed: { copy: "LLMWiki 응답을 해석하지 못했습니다. 다시 시도해 주세요.", action: "retry" },
    response_unknown_field: { copy: "LLMWiki 응답 계약을 확인하지 못했습니다. 다시 시도해 주세요.", action: "retry" },
    response_invalid: { copy: "LLMWiki가 유효한 제안 묶음을 반환하지 않았습니다. 다시 시도해 주세요.", action: "retry" },
    proposal_bundle_invalid: { copy: "LLMWiki 제안 묶음 검증에 실패했습니다. 선택한 자료를 확인해 주세요.", action: "review_sources" },
    write_intent_forbidden: { copy: "LLMWiki 제안에는 저장 작업을 포함할 수 없습니다.", action: "review_sources" },
    source_selection_required: { copy: "제안에 사용할 자료를 먼저 선택해 주세요.", action: "select_sources" },
    source_unavailable: { copy: "선택한 자료를 확인하지 못했습니다. 자료를 다시 선택해 주세요.", action: "select_sources" },
    query_empty: { copy: "검색어를 입력해 주세요.", action: "enter_query" },
    query_failed: { copy: "LLMWiki 검색을 완료하지 못했습니다. 다시 시도해 주세요.", action: "retry" },
    unknown: { copy: "LLMWiki 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", action: "retry_later" }
  });

  function text(value) { return typeof value === "string" ? value.trim() : ""; }

  function reasonFor(input) {
    const value = input && typeof input === "object" ? input : {};
    const code = text(value.code || value.reason || value.field);
    const status = Number(value.status || value.httpStatus || 0);
    if (code === "ETIMEDOUT" || code === "timeout" || /timeout|timed out/i.test(text(value.message))) return "provider_timeout";
    if (code === "AbortError" || code === "aborted" || value.name === "AbortError") return "provider_aborted";
    if (status === 429 || code === "provider_rate_limited") return "provider_rate_limited";
    if (status === 503 || status === 502 || status === 504) return "provider_unavailable_route";
    if (status >= 400 && status < 500 && code === "provider_failed") return "provider_unavailable";
    return Object.prototype.hasOwnProperty.call(COPY, code) ? code : "unknown";
  }

  function mapRecovery(input) {
    const reason = reasonFor(input);
    const mapped = COPY[reason] || COPY.unknown;
    return Object.freeze({ code: reason, copy: mapped.copy, action: mapped.action });
  }

  function toUiState(result) {
    const value = result && typeof result === "object" ? result : {};
    const mapped = mapRecovery(value);
    return Object.freeze({ ok: value.ok === true, status: value.ok === true ? "ready" : "recovery", copy: mapped.copy, action: mapped.action, code: mapped.code });
  }

  const api = Object.freeze({ mapRecovery, toUiState });
  root.LLMWikiUIRecovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
