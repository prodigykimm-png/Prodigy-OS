(function (root) {
  "use strict";

  const COPY = Object.freeze({
    profile_missing: { copy: "LLMWiki AI 프로필이 설정되지 않았습니다.", action: "open_settings" },
    provider_mode_invalid: { copy: "LLMWiki AI 연결 모드를 확인해 주세요.", action: "open_settings" },
    provider_unavailable: { copy: "선택한 LLMWiki AI 연결을 사용할 수 없습니다.", action: "open_settings" },
    provider_quota_exhausted: { copy: "현재 AI 제공자의 사용 한도를 확인한 뒤 다시 시도해 주세요.", action: "retry" },
    provider_auth_required: { copy: "현재 AI 제공자의 인증 설정을 확인해 주세요.", action: "open_settings" },
    secret_missing: { copy: "현재 AI 제공자의 인증 정보가 없습니다.", action: "open_settings" },
    config_invalid: { copy: "LLMWiki AI 설정을 확인해 주세요.", action: "open_settings" },
    configuration_unavailable: { copy: "LLMWiki AI 설정을 불러오지 못했습니다.", action: "open_settings" },
    outcome_unknown: { copy: "이전 요청의 결과를 확인할 수 없습니다.", action: "retry_later" },
    stale: { copy: "검토 중 원본이 변경되었습니다.", action: "review_sources" },
    stale_reconfirm_required: { copy: "검토 중 원본이 변경되었습니다.", action: "review_sources" },
    repacket: { copy: "새 검토 패킷이 필요합니다.", action: "review_sources" },
    blocked: { copy: "분석이 중단되었습니다.", action: "retry_later" },
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
    consent_required: { copy: "자동 분석 정책이 변경되었습니다. 제공자와 자료 범위를 다시 확인해 주세요.", action: "review_consent" },
    source_denied: { copy: "이 자료는 자동 분석 허용 범위에 포함되지 않습니다.", action: "review_sources" },
    source_too_large: { copy: "이 자료는 자동 분석 크기 제한을 초과했습니다.", action: "review_sources" },
    dirty_worktree: { copy: "작업 중인 변경이 있어 자동 분석을 멈췄습니다. 변경 상태를 확인해 주세요.", action: "review_sources" },
    source_revision_content_mismatch: { copy: "같은 자료 revision의 내용이 달라 자동 분석을 중단했습니다. 새 revision으로 다시 등록해 주세요.", action: "review_sources" },
    serialized_source_required: { copy: "자동 분석 자료 형식을 안전하게 확인하지 못했습니다.", action: "review_sources" },
    invalid_serialized_source: { copy: "자동 분석 자료 형식이 올바르지 않습니다.", action: "review_sources" },
    query_empty: { copy: "검색어를 입력해 주세요.", action: "enter_query" },
    query_failed: { copy: "LLMWiki 검색을 완료하지 못했습니다. 다시 시도해 주세요.", action: "retry" },
    mtime_conflict: { copy: "다른 기기에서 기록이 변경되어 저장을 중단했습니다. 최신 기록을 확인한 뒤 다시 시도해 주세요.", action: "reload_and_retry" },
    atomic_write_interrupted: { copy: "파일 저장이 중단되어 기존 기록을 복원했습니다. 다시 시도해 주세요.", action: "retry" },
    sync_pending: { copy: "필수 모듈이 아직 이 기기에 동기화되지 않았습니다. 동기화 후 다시 시도해 주세요.", action: "retry" },
    approval_expired: { copy: "승인한 후보가 만료되었습니다. 최신 후보를 다시 검토해 주세요.", action: "review_sources" },
    target_revision_mismatch: { copy: "승인 후 대상 기록이 변경되어 쓰기를 중단했습니다. 최신 내용을 다시 검토해 주세요.", action: "review_sources" },
    derived_cache_missing: { copy: "검색 캐시가 없어 원본 기록에서 다시 만드는 중입니다.", action: "rebuild" },
    authorized_mutation_rolled_back: { copy: "저장 검증에 실패해 승인된 변경을 이전 상태로 되돌렸습니다.", action: "retry" },
    unknown: { copy: "LLMWiki 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", action: "retry_later" }
  });

  function text(value) { return typeof value === "string" ? value.trim() : ""; }

  const RECOVERY_ACTIONS = Object.freeze({
    config: Object.freeze([
      Object.freeze({ action: "open_ai_settings", label: "AI 설정 열기", primary: true }),
      Object.freeze({ action: "retry_analysis", label: "다시 분석" }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    auth: Object.freeze([
      Object.freeze({ action: "open_ai_settings", label: "AI 설정 열기", primary: true }),
      Object.freeze({ action: "retry_analysis", label: "다시 분석" }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    quota: Object.freeze([
      Object.freeze({ action: "retry_analysis", label: "다시 분석", primary: true }),
      Object.freeze({ action: "open_ai_settings", label: "AI 설정 열기" }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    provider: Object.freeze([
      Object.freeze({ action: "open_ai_settings", label: "AI 설정 열기", primary: true }),
      Object.freeze({ action: "retry_analysis", label: "다시 분석" }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    outcome_unknown: Object.freeze([
      Object.freeze({ action: "retry_analysis", label: "다시 분석", primary: true }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    stale: Object.freeze([
      Object.freeze({ action: "repacket", label: "새 검토 패킷 만들기", primary: true }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    repacket: Object.freeze([
      Object.freeze({ action: "repacket", label: "새 검토 패킷 만들기", primary: true }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
    blocked: Object.freeze([
      Object.freeze({ action: "retry_analysis", label: "다시 분석", primary: true }),
      Object.freeze({ action: "later", label: "나중에" }),
    ]),
  });

  function reasonFor(input) {
    const value = input && typeof input === "object" ? input : {};
    const code = text(value.code || value.reason || value.field);
    const status = Number(value.status || value.httpStatus || 0);
    if (code === "ETIMEDOUT" || code === "timeout") return "provider_timeout";
    if (code === "AbortError" || code === "aborted" || value.name === "AbortError") return "provider_aborted";
    if (status === 429 || code === "provider_rate_limited") return "provider_rate_limited";
    if (status === 503 || status === 502 || status === 504) return "provider_unavailable_route";
    if (status >= 400 && status < 500 && code === "provider_failed") return "provider_unavailable";
    return Object.prototype.hasOwnProperty.call(COPY, code) ? code : "unknown";
  }

  function recoveryVariantFor(input) {
    const code = reasonFor(input);
    if (["profile_missing", "provider_mode_invalid", "provider_missing", "config_invalid", "configuration_unavailable"].includes(code)) return "config";
    if (["provider_auth_required", "secret_missing"].includes(code)) return "auth";
    if (["provider_quota_exhausted", "provider_rate_limited"].includes(code)) return "quota";
    if (code === "outcome_unknown") return "outcome_unknown";
    if (["stale", "stale_reconfirm_required"].includes(code)) return "stale";
    if (code === "repacket") return "repacket";
    if (code === "blocked") return "blocked";
    return "provider";
  }

  function recoveryActions(variant) {
    const actions = RECOVERY_ACTIONS[text(variant)] || RECOVERY_ACTIONS.blocked;
    return Object.freeze(actions.map((item) => item));
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

  const api = Object.freeze({ RECOVERY_ACTIONS, reasonFor, recoveryVariantFor, recoveryActions, mapRecovery, toUiState });
  root.LLMWikiUIRecovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
