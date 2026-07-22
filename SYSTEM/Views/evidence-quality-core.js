(function (root) {
  "use strict";

  const STATUS_LABELS = Object.freeze({
    invalid: "유효하지 않음",
    thin: "보완 필요",
    usable: "사용 가능",
    strong: "근거 충분"
  });

  const REASON_LABELS = Object.freeze({
    missing_experience: "경험을 입력해 주세요.",
    missing_context: "맥락을 보완해 주세요.",
    missing_interpretation_or_change: "해석 또는 변화를 보완해 주세요.",
    missing_next_experiment: "다음 실험을 보완해 주세요.",
    invalid_evidence: "경험이 없는 근거는 승격할 수 없습니다.",
    thin_requires_override: "보완이 필요한 근거는 명시적 승인 override가 필요합니다.",
    missing_approval_note: "승인 사유를 입력해 주세요."
  });

  const STATUSES = new Set(Object.keys(STATUS_LABELS));

  function plainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeEvidence(value) {
    const source = plainObject(value) ? value : {};
    return Object.freeze({
      context: cleanText(source.context),
      experience: cleanText(source.experience),
      interpretation: cleanText(source.interpretation),
      change: cleanText(source.change),
      next_experiment: cleanText(source.next_experiment)
    });
  }

  function frozenResult(status, reasonCodes, signals) {
    const codes = Object.freeze([...reasonCodes]);
    return Object.freeze({
      status,
      label: STATUS_LABELS[status],
      reason_codes: codes,
      reasons: Object.freeze(codes.map((code) => REASON_LABELS[code])),
      signal_count: Object.values(signals).filter(Boolean).length,
      signals: Object.freeze({ ...signals })
    });
  }

  function evaluateEvidenceQuality(value) {
    const evidence = normalizeEvidence(value);
    if (!evidence.experience) {
      return frozenResult("invalid", ["missing_experience"], {
        context: false,
        interpretation_or_change: false,
        next_experiment: false
      });
    }

    const signals = {
      context: Boolean(evidence.context),
      interpretation_or_change: Boolean(evidence.interpretation || evidence.change),
      next_experiment: Boolean(evidence.next_experiment)
    };
    const missing = [];
    if (!signals.context) missing.push("missing_context");
    if (!signals.interpretation_or_change) missing.push("missing_interpretation_or_change");
    if (!signals.next_experiment) missing.push("missing_next_experiment");

    const signalCount = Object.values(signals).filter(Boolean).length;
    const status = signalCount === 3 ? "strong" : signalCount === 2 ? "usable" : "thin";
    return frozenResult(status, missing, signals);
  }

  function qualityStatus(value) {
    const status = typeof value === "string" ? value : value && value.status;
    return typeof status === "string" && STATUSES.has(status) ? status : "invalid";
  }

  function promotionResult(allowed, status, reasonCodes) {
    const codes = Object.freeze([...reasonCodes]);
    return Object.freeze({
      allowed,
      status,
      requires_override: status === "thin",
      reason_codes: codes,
      reasons: Object.freeze(codes.map((code) => REASON_LABELS[code]))
    });
  }

  function checkPromotionEligibility(quality, options) {
    const status = qualityStatus(quality);
    if (status === "invalid") return promotionResult(false, status, ["invalid_evidence"]);
    if (status === "usable" || status === "strong") return promotionResult(true, status, []);

    const request = plainObject(options) ? options : {};
    if (request.override !== true) return promotionResult(false, status, ["thin_requires_override"]);
    if (!cleanText(request.approval_note)) return promotionResult(false, status, ["missing_approval_note"]);
    return promotionResult(true, status, []);
  }

  const api = Object.freeze({
    STATUS_LABELS,
    REASON_LABELS,
    normalizeEvidence,
    evaluateEvidenceQuality,
    checkPromotionEligibility
  });

  root.EvidenceQualityCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
