(function (root) {
  "use strict";

  const SCHEMA_VERSION = "auction-ai-decision-support.v1";
  const DRAFT_KEYS = Object.freeze(["headline", "summary", "personal_context", "evidence", "cautions"]);
  const BANNED_LANGUAGE = /추천|권장|적정\s*입찰|입찰가를\s*(?:써|제시|결정)|사야|매수해야|낙찰\s*(?:가능성|확률)|확률|예측|전망|수익\s*보장|무조건|확실히|투자\s*결정/iu;
  const AI_DECISION_SUPPORT_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: DRAFT_KEYS,
    properties: {
      headline: Object.freeze({ type: "string", minLength: 1, maxLength: 120 }),
      summary: Object.freeze({ type: "string", minLength: 1, maxLength: 800 }),
      personal_context: Object.freeze({ type: ["string", "null"], maxLength: 600 }),
      evidence: Object.freeze({
        type: "array",
        maxItems: 6,
        items: Object.freeze({
          type: "object",
          additionalProperties: false,
          required: ["source_ref", "statement"],
          properties: {
            source_ref: Object.freeze({ type: "string", minLength: 1, maxLength: 300 }),
            statement: Object.freeze({ type: "string", minLength: 1, maxLength: 320 })
          }
        })
      }),
      cautions: Object.freeze({
        type: "array",
        maxItems: 6,
        items: Object.freeze({ type: "string", minLength: 1, maxLength: 240 })
      })
    }
  });

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim().normalize("NFC");
  }

  function freezeArray(items) {
    return Object.freeze((Array.isArray(items) ? items : []).slice());
  }

  function extractNumberTokens(value) {
    const matches = String(value || "").match(/\d[\d,]*(?:\.\d+)?/gu) || [];
    return matches.map((token) => token.replace(/,/gu, ""));
  }

  function collectAllowedNumbers(input) {
    const json = JSON.stringify({
      analysis_as_of: input && input.analysis_as_of,
      cohort: input && input.cohort,
      market: input && input.market,
      competition_references: input && input.competition_references,
      personal_excerpt: input && input.personal_excerpt
    });
    return [...new Set([...extractNumberTokens(json), "25", "50", "75"])]
      .sort((left, right) => Number(left) - Number(right));
  }

  function citationRefs(projection) {
    const refs = [...new Set([
      clean(projection && projection.current_case_ref),
      ...(Array.isArray(projection && projection.source_refs) ? projection.source_refs : [])
    ].map(clean).filter(Boolean))];
    return refs.map((sourceRef, index) => Object.freeze({
      source_ref: sourceRef,
      label: index === 0 && sourceRef === clean(projection && projection.current_case_ref) ? "현재 사건" : "정규 결과 사건"
    }));
  }

  function summarizePersonal(projection, includePersonalExcerpt) {
    if (!includePersonalExcerpt) return Object.freeze({ included: false, data: null });
    const lost = projection && projection.personal_lost_bid_gaps || {};
    const won = projection && projection.personal_won_history || {};
    return Object.freeze({
      included: true,
      data: Object.freeze({
        lost: Object.freeze({
          sample_count: Number(lost.sample_count) || 0,
          average_gap_won: lost.average_gap_won === null ? null : Number(lost.average_gap_won),
          average_gap_percent: lost.average_gap_percent === null ? null : Number(lost.average_gap_percent),
          records: freezeArray((lost.records || []).map((record) => Object.freeze({
            source_ref: clean(record.path || record.id),
            my_bid_price: record.my_bid_price,
            winning_bid_price: record.winning_bid_price,
            gap_won: record.gap_won,
            gap_percent: record.gap_percent
          })))
        }),
        won: Object.freeze({
          sample_count: Number(won.sample_count) || 0,
          records: freezeArray((won.records || []).map((record) => Object.freeze({
            source_ref: clean(record.path || record.id),
            my_bid_price: record.my_bid_price,
            winning_bid_price: record.winning_bid_price,
            bid_to_winning_ratio_percent: record.bid_to_winning_ratio_percent
          })))
        })
      })
    });
  }

  function buildAiDecisionSupportInput(projection, options) {
    const view = projection || {};
    const includePersonalExcerpt = Boolean(options && options.includePersonalExcerpt);
    const personalExcerpt = summarizePersonal(view, includePersonalExcerpt);
    const market = view.winning_bid_ratios || {};
    const competition = view.competition_references || {};
    const baseInput = {
      schema_version: SCHEMA_VERSION,
      analysis_as_of: clean(view.analysis_as_of),
      cohort: Object.freeze({
        region_sido: clean(view.cohort && view.cohort.region_sido),
        region_sigungu: clean(view.cohort && view.cohort.region_sigungu),
        property_type: clean(view.cohort && view.cohort.property_type)
      }),
      market: Object.freeze({
        sample_count: Number(market.sample_count) || 0,
        average_percent: market.average_percent === null || market.average_percent === undefined ? null : Number(market.average_percent),
        median_percent: market.median_percent === null || market.median_percent === undefined ? null : Number(market.median_percent),
        ratio_percentiles: Object.freeze({
          q25: market.ratio_percentiles && market.ratio_percentiles.q25 === null ? null : Number(market.ratio_percentiles && market.ratio_percentiles.q25),
          median: market.ratio_percentiles && market.ratio_percentiles.median === null ? null : Number(market.ratio_percentiles && market.ratio_percentiles.median),
          q75: market.ratio_percentiles && market.ratio_percentiles.q75 === null ? null : Number(market.ratio_percentiles && market.ratio_percentiles.q75)
        }),
        observations: freezeArray((market.records || []).map((record) => Object.freeze({
          source_ref: clean(record.path || record.id),
          outcome: clean(record.outcome),
          ratio_percent: record.ratio_percent
        })))
      }),
      competition_references: Object.freeze({
        status: clean(competition.status),
        sample_count: Number(competition.sample_count) || 0,
        ratio_percentiles: competition.ratio_percentiles || null,
        appraisal_scaled_won: competition.appraisal_scaled_won || null
      }),
      personal_excerpt: personalExcerpt,
      citation_refs: freezeArray(citationRefs(view)),
    };
    const numericFacts = collectAllowedNumbers(baseInput);
    return Object.freeze({ ...baseInput, numeric_facts: freezeArray(numericFacts) });
  }

  function buildAiDecisionSupportPrompt(input) {
    const payload = input || {};
    const personalLine = payload.personal_excerpt && payload.personal_excerpt.included
      ? "개인 입찰 기록이 사용자의 명시적 선택으로 포함되었다. 개인 기록은 사실 그대로 요약하고 일반화하지 말라."
      : "개인 입찰 기록은 포함되지 않았다. 개인의 패찰·낙찰 경험을 언급하지 말라.";
    return [
      "당신은 Prodigy OS의 경매 의사결정 보조 요약기다.",
      "아래 입력은 이미 계산된 현재 시점의 사실과 근거다. 입력에 없는 숫자나 사실을 만들지 말라.",
      "출력은 반드시 제공된 JSON Schema를 따르고, source_ref는 citation_refs 중 하나만 사용하라.",
      "낙찰 가능성·확률·예측·전망을 말하지 말라. 입찰가·매수 여부·투자 결정을 추천하거나 지시하지 말라.",
      "headline은 한 문장으로 짧게 작성하고, summary는 확인된 패턴과 확인할 점만 말하라.",
      personalLine,
      "cautions에는 표본 부족, 원본 확인 필요, 개인 기록의 한계를 적절히 표시하라.",
      JSON.stringify(payload)
    ].join("\n");
  }

  function error(code, message, field) {
    return Object.freeze({ code, message, ...(field ? { field } : {}) });
  }

  function validateString(value, field, maxLength, errors) {
    if (typeof value !== "string" || !value.trim()) {
      errors.push(error("invalid_string", `${field}는 비어 있지 않은 문자열이어야 합니다.`, field));
      return false;
    }
    if (value.length > maxLength || /[\r\n]/u.test(value)) errors.push(error("invalid_string", `${field} 길이 또는 줄바꿈을 확인해야 합니다.`, field));
    return true;
  }

  function validateAiDecisionSupportDraft(payload, input) {
    const errors = [];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Object.freeze({ ok: false, errors: freezeArray([error("invalid_payload", "AI 응답은 객체여야 합니다.")]) });
    Object.keys(payload).forEach((key) => { if (!DRAFT_KEYS.includes(key)) errors.push(error("unexpected_field", `허용되지 않은 응답 필드입니다: ${key}`, key)); });
    DRAFT_KEYS.forEach((key) => { if (!Object.hasOwn(payload, key)) errors.push(error("missing_field", `필수 응답 필드가 없습니다: ${key}`, key)); });
    const headlineOk = validateString(payload.headline, "headline", 120, errors);
    const summaryOk = validateString(payload.summary, "summary", 800, errors);
    if (payload.personal_context !== null && payload.personal_context !== undefined && typeof payload.personal_context !== "string") errors.push(error("invalid_string", "personal_context는 문자열 또는 null이어야 합니다.", "personal_context"));
    if (typeof payload.personal_context === "string" && payload.personal_context.length > 600) errors.push(error("invalid_string", "personal_context가 너무 깁니다.", "personal_context"));
    if (!Array.isArray(payload.evidence) || payload.evidence.length > 6) errors.push(error("invalid_array", "evidence는 최대 6개의 목록이어야 합니다.", "evidence"));
    if (!Array.isArray(payload.cautions) || payload.cautions.length > 6) errors.push(error("invalid_array", "cautions는 최대 6개의 목록이어야 합니다.", "cautions"));

    const refs = new Set((input && Array.isArray(input.citation_refs) ? input.citation_refs : []).map((item) => clean(item && item.source_ref)).filter(Boolean));
    (Array.isArray(payload.evidence) ? payload.evidence : []).forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(error("invalid_evidence", "evidence 항목은 객체여야 합니다.", `evidence[${index}]`));
        return;
      }
      Object.keys(item).forEach((key) => { if (!["source_ref", "statement"].includes(key)) errors.push(error("unexpected_field", `evidence에 허용되지 않은 필드가 있습니다: ${key}`, `evidence[${index}]`)); });
      const sourceRef = clean(item.source_ref);
      if (!refs.has(sourceRef)) errors.push(error("unknown_source_ref", "허용된 근거 출처가 아닙니다.", `evidence[${index}].source_ref`));
      validateString(item.statement, "evidence.statement", 320, errors);
    });
    (Array.isArray(payload.cautions) ? payload.cautions : []).forEach((item, index) => validateString(item, "cautions", 240, errors) || errors.push(error("invalid_caution", "cautions 항목을 확인해야 합니다.", `cautions[${index}]`)));

    const personalIncluded = Boolean(input && input.personal_excerpt && input.personal_excerpt.included);
    if (!personalIncluded && typeof payload.personal_context === "string" && payload.personal_context.trim()) errors.push(error("personal_opt_in_required", "개인 기록 요약은 명시적 선택 후에만 허용됩니다.", "personal_context"));

    const text = [headlineOk ? payload.headline : "", summaryOk ? payload.summary : "", typeof payload.personal_context === "string" ? payload.personal_context : "", ...(Array.isArray(payload.evidence) ? payload.evidence.map((item) => item && item.statement) : []), ...(Array.isArray(payload.cautions) ? payload.cautions : [])].filter(Boolean).join(" ");
    if (BANNED_LANGUAGE.test(text)) errors.push(error("banned_language", "추천·예측·확률·결정 지시 표현은 사용할 수 없습니다."));
    const allowedNumbers = new Set((input && Array.isArray(input.numeric_facts) ? input.numeric_facts : []).map(String));
    [...new Set(extractNumberTokens(text))].forEach((token) => {
      if (!allowedNumbers.has(token)) errors.push(error("unsupported_number", `입력 근거에 없는 숫자입니다: ${token}`));
    });
    if (payload.personal_context === undefined) errors.push(error("missing_field", "personal_context는 명시적으로 null이어야 합니다.", "personal_context"));
    if (errors.length) return Object.freeze({ ok: false, errors: freezeArray(errors) });
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        headline: payload.headline.trim(),
        summary: payload.summary.trim(),
        personal_context: payload.personal_context === null ? null : payload.personal_context.trim(),
        evidence: Object.freeze(payload.evidence.map((item) => Object.freeze({ source_ref: clean(item.source_ref), statement: item.statement.trim() }))),
        cautions: Object.freeze(payload.cautions.map((item) => item.trim()))
      }),
      errors: Object.freeze([])
    });
  }

  const api = Object.freeze({
    SCHEMA_VERSION,
    DRAFT_KEYS,
    AI_DECISION_SUPPORT_SCHEMA,
    buildAiDecisionSupportInput,
    buildAiDecisionSupportPrompt,
    validateAiDecisionSupportDraft,
    extractNumberTokens
  });
  root.AuctionAiDecisionSupportCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
