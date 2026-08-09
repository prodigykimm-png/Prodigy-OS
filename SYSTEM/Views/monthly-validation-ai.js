(function (root) {
  "use strict";

  var MONTHLY_AI_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: {
      schema_version: { type: "string", enum: ["1.0"] },
      principle_reviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            principle_ref: { type: "string" },
            supporting_evidence_refs: { type: "array", items: { type: "string" } },
            counter_evidence_refs: { type: "array", items: { type: "string" } },
            missing_evidence: { type: "array", items: { type: "string" } },
            contradictions_or_exceptions: { type: "array", items: { type: "string" } },
            validation_questions: { type: "array", items: { type: "string" } },
            validation_rationale_draft: { type: "string" }
          },
          required: ["principle_ref", "supporting_evidence_refs", "counter_evidence_refs", "missing_evidence", "contradictions_or_exceptions", "validation_questions", "validation_rationale_draft"]
        }
      },
      next_month_direction_draft: { type: "string" }
    },
    required: ["schema_version", "principle_reviews", "next_month_direction_draft"]
  });

  var MONTHLY_QUESTION_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: {
      schema_version: { type: "string", enum: ["1.0"] },
      coverage_summary: { type: "string" },
      observed_evidence_groups: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            evidence_refs: { type: "array", items: { type: "string" } },
            observation: { type: "string" }
          },
          required: ["evidence_refs", "observation"]
        }
      },
      missing_evidence: { type: "array", items: { type: "string" } },
      uncertainties: { type: "array", items: { type: "string" } },
      review_questions: { type: "array", items: { type: "string" } },
      next_month_direction_draft: { type: "string" }
    },
    required: ["schema_version", "coverage_summary", "observed_evidence_groups", "missing_evidence", "uncertainties", "review_questions", "next_month_direction_draft"]
  });

  var REVIEW_KEYS = [
    "principle_ref", "supporting_evidence_refs", "counter_evidence_refs", "missing_evidence",
    "contradictions_or_exceptions", "validation_questions", "validation_rationale_draft"
  ];
  var QUESTION_GROUP_KEYS = ["evidence_refs", "observation"];
  var FORBIDDEN_KEYS = {
    decision: true, status: true, validated: true, rejected: true, deferred: true, pending: true,
    knowledgestatement: true, candidate: true, promotion: true, save: true, write: true, apply: true
  };

  function text(value) { return typeof value === "string" ? value.trim() : ""; }

  function invalid(message) {
    var error = new Error(message);
    error.code = "INVALID_MONTHLY_AI_RESPONSE";
    error.name = "MonthlyAIResponseError";
    return error;
  }

  function normalizeKey(key) { return String(key || "").toLowerCase().replace(/[\s_-]/g, ""); }

  function assertObjectKeys(value, allowed, location) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(location + " 객체가 필요합니다.");
    Object.keys(value).forEach(function (key) {
      if (FORBIDDEN_KEYS[normalizeKey(key)]) throw invalid(location + "에 금지된 구조화 필드가 있습니다: " + key);
      if (allowed.indexOf(key) === -1) throw invalid(location + "에 허용되지 않은 필드가 있습니다: " + key);
    });
  }

  function stringArray(value, location) {
    if (!Array.isArray(value) || value.some(function (item) { return typeof item !== "string"; })) throw invalid(location + "은 문자열 배열이어야 합니다.");
    return value.map(function (item) { return item.trim(); });
  }

  function buildMonthlyAIPrompt(context) {
    var source = context || {};
    var lines = [
      "당신은 Prodigy OS의 Monthly 검증 보조 AI다.",
      "반드시 제공된 JSON schema에 맞는 JSON만 반환한다.",
      "AI는 Principle 결정, 지식 문장, 저장, Candidate 생성을 하지 않는다.",
      "제출된 Principle과 Evidence만 사용하고, 근거가 부족하면 missing_evidence에 적는다.",
      "모든 principle_reviews는 제출된 principle_ref마다 정확히 하나씩 반환한다.",
      "모든 supporting_evidence_refs와 counter_evidence_refs는 제출된 Evidence ID만 사용한다.",
      "자유문장은 한국어로 작성한다.",
      "",
      "## Monthly",
      "기간: " + text(source.month),
      "Weekly 수: " + Number(source.readiness && source.readiness.weekly_count || 0),
      "eligible Principle 수: " + Number(source.readiness && source.readiness.eligible_principles || 0),
      "",
      "## Eligible Principles"
    ];
    (source.principles || []).forEach(function (principle) {
      lines.push("### " + text(principle.principle_ref));
      lines.push("제목: " + text(principle.title));
      lines.push("반복 주차: " + (principle.weeks || []).join(", "));
      lines.push("지원 Evidence ID: " + (principle.supporting_evidence_refs || []).join(", "));
    });
    lines.push("", "## Selected-month Evidence");
    (source.evidence || []).forEach(function (item) {
      lines.push("### " + text(item.evidence_id) + " (" + text(item.date) + ")");
      if (item.context) lines.push("Context: " + text(item.context));
      lines.push("Experience: " + text(item.experience));
      lines.push("Interpretation: " + text(item.interpretation));
      lines.push("Change: " + text(item.change));
      lines.push("Next Experiment: " + text(item.next_experiment));
    });
    lines.push("", "## Output reminders", "decision/status/knowledge_statement/save/write/apply 필드를 만들지 않는다.");
    return lines.join("\n");
  }

  function buildMonthlyQuestionPrompt(context) {
    var source = context || {};
    var lines = [
      "당신은 Prodigy OS의 Monthly 관찰 질문 보조 AI다.",
      "반드시 제공된 JSON schema에 맞는 JSON만 반환한다.",
      "이번 결과는 반복 Principle을 검증하는 결과가 아니다.",
      "Principle decision, validation rationale, knowledge statement, Candidate, Knowledge, Direction, Identity를 만들거나 선택하지 않는다.",
      "선택한 달에 제공된 구조화 Evidence만 사용하고, 근거가 부족하면 missing_evidence와 uncertainties에 적는다.",
      "observed_evidence_groups는 검증된 Principle이 아니라 함께 관찰할 Evidence 묶음이다.",
      "모든 evidence_refs는 제출된 Evidence ID만 사용한다.",
      "자유문장은 한국어로 작성한다.",
      "",
      "## Monthly",
      "기간: " + text(source.month),
      "Weekly 수: " + Number(source.readiness && source.readiness.weekly_count || 0),
      "반복 검증 가능 Principle 수: " + Number(source.readiness && source.readiness.eligible_principles || 0),
      "",
      "## Selected-month Evidence"
    ];
    (source.evidence || []).forEach(function (item) {
      lines.push("### " + text(item.evidence_id) + " (" + text(item.date) + ")");
      if (item.context) lines.push("Context: " + text(item.context));
      lines.push("Experience: " + text(item.experience));
      lines.push("Interpretation: " + text(item.interpretation));
      lines.push("Change: " + text(item.change));
      lines.push("Next Experiment: " + text(item.next_experiment));
    });
    lines.push("", "## Output reminders", "decision/status/knowledge_statement/candidate/knowledge/direction/identity/save/write/apply 필드를 만들지 않는다.");
    return lines.join("\n");
  }

  function normalizeMonthlyAIResponse(payload, context) {
    var source = context || {};
    assertObjectKeys(payload, ["schema_version", "principle_reviews", "next_month_direction_draft"], "응답 root");
    if (payload.schema_version !== "1.0") throw invalid("schema_version은 1.0이어야 합니다.");
    if (!Array.isArray(payload.principle_reviews)) throw invalid("principle_reviews 배열이 필요합니다.");
    if (typeof payload.next_month_direction_draft !== "string") throw invalid("next_month_direction_draft 문자열이 필요합니다.");
    var submitted = (source.principles || []).map(function (item) { return text(item.principle_ref); }).filter(Boolean);
    var allowedEvidence = {};
    (source.evidence || []).forEach(function (item) { if (item && text(item.evidence_id)) allowedEvidence[text(item.evidence_id)] = true; });
    var reviews = {};
    payload.principle_reviews.forEach(function (raw, index) {
      assertObjectKeys(raw, REVIEW_KEYS, "principle_reviews[" + index + "]");
      if (typeof raw.principle_ref !== "string" || !text(raw.principle_ref)) throw invalid("principle_ref가 필요합니다.");
      var ref = text(raw.principle_ref);
      if (reviews[ref]) throw invalid("중복 principle review입니다: " + ref);
      if (submitted.indexOf(ref) === -1) throw invalid("제출되지 않은 principle_ref입니다: " + ref);
      var supporting = stringArray(raw.supporting_evidence_refs, "supporting_evidence_refs");
      var counter = stringArray(raw.counter_evidence_refs, "counter_evidence_refs");
      if (typeof raw.validation_rationale_draft !== "string") throw invalid("validation_rationale_draft 문자열이 필요합니다.");
      var refs = supporting.concat(counter);
      var seenRefs = {};
      refs.forEach(function (evidenceRef) {
        if (!allowedEvidence[evidenceRef]) throw invalid("제출되지 않은 Evidence ref입니다: " + evidenceRef);
        if (seenRefs[evidenceRef]) throw invalid("중복 Evidence ref입니다: " + evidenceRef);
        seenRefs[evidenceRef] = true;
      });
      reviews[ref] = {
        principle_ref: ref,
        supporting_evidence_refs: supporting,
        counter_evidence_refs: counter,
        missing_evidence: stringArray(raw.missing_evidence, "missing_evidence"),
        contradictions_or_exceptions: stringArray(raw.contradictions_or_exceptions, "contradictions_or_exceptions"),
        validation_questions: stringArray(raw.validation_questions, "validation_questions"),
        validation_rationale_draft: raw.validation_rationale_draft.trim()
      };
    });
    if (payload.principle_reviews.length !== submitted.length || submitted.some(function (ref) { return !reviews[ref]; })) throw invalid("제출된 eligible Principle과 review 수가 일치하지 않습니다.");
    return {
      schema_version: "1.0",
      principle_reviews: submitted.map(function (ref) { return reviews[ref]; }),
      next_month_direction_draft: payload.next_month_direction_draft.trim()
    };
  }

  function normalizeMonthlyQuestionResponse(payload, context) {
    var source = context || {};
    assertObjectKeys(payload, ["schema_version", "coverage_summary", "observed_evidence_groups", "missing_evidence", "uncertainties", "review_questions", "next_month_direction_draft"], "응답 root");
    if (payload.schema_version !== "1.0") throw invalid("schema_version은 1.0이어야 합니다.");
    if (typeof payload.coverage_summary !== "string" || typeof payload.next_month_direction_draft !== "string") throw invalid("coverage_summary와 next_month_direction_draft는 문자열이어야 합니다.");
    var allowedEvidence = {};
    (source.evidence || []).forEach(function (item) { if (item && text(item.evidence_id)) allowedEvidence[text(item.evidence_id)] = true; });
    if (!Array.isArray(payload.observed_evidence_groups)) throw invalid("observed_evidence_groups 배열이 필요합니다.");
    var groups = payload.observed_evidence_groups.map(function (raw, index) {
      assertObjectKeys(raw, QUESTION_GROUP_KEYS, "observed_evidence_groups[" + index + "]");
      var refs = stringArray(raw.evidence_refs, "observed_evidence_groups[" + index + "].evidence_refs");
      var seen = {};
      refs.forEach(function (ref) {
        if (!allowedEvidence[ref]) throw invalid("제출되지 않은 Evidence ref입니다: " + ref);
        if (seen[ref]) throw invalid("중복 Evidence ref입니다: " + ref);
        seen[ref] = true;
      });
      if (typeof raw.observation !== "string") throw invalid("observation은 문자열이어야 합니다.");
      return { evidence_refs: refs, observation: raw.observation.trim() };
    });
    return {
      mode: "question_only",
      schema_version: "1.0",
      coverage_summary: payload.coverage_summary.trim(),
      observed_evidence_groups: groups,
      missing_evidence: stringArray(payload.missing_evidence, "missing_evidence"),
      uncertainties: stringArray(payload.uncertainties, "uncertainties"),
      review_questions: stringArray(payload.review_questions, "review_questions"),
      next_month_direction_draft: payload.next_month_direction_draft.trim()
    };
  }

  function providerService(options) {
    if (options && options.providerService) return options.providerService;
    if (root.AIProviderService) return root.AIProviderService;
    if (typeof require === "function") return require("./ai-provider-service.js");
    throw new Error("AI provider service가 로드되지 않았습니다.");
  }

  function projectService() {
    if (root.ProjectWorkflowDraftService) return root.ProjectWorkflowDraftService;
    if (typeof require === "function") return require("./project-workflow-draft-service.js");
    throw new Error("AI provider configuration service가 로드되지 않았습니다.");
  }

  async function generateMonthlyAI(options) {
    var opts = options || {};
    var context = opts.context || {};
    if (!Array.isArray(context.evidence) || context.evidence.length === 0) {
      var emptyError = new Error("선택한 달에 AI가 검토할 구조화 Evidence가 없습니다");
      emptyError.code = "NO_BOUNDED_EVIDENCE";
      throw emptyError;
    }
    var serviceConfig = projectService();
    var config = opts.config || await serviceConfig.loadProviderConfig(opts.app);
    var providerKey = opts.providerKey || config.defaultProvider;
    var provider = config.providers && config.providers[providerKey];
    if (!provider) throw new Error("AI provider를 찾을 수 없습니다: " + providerKey);
    var service = providerService(opts);
    var questionOnly = opts.mode === "question_only";
    var payload = await service.requestStructuredJson({
      app: opts.app,
      provider: provider,
      prompt: questionOnly ? buildMonthlyQuestionPrompt(context) : buildMonthlyAIPrompt(context),
      schema: questionOnly ? MONTHLY_QUESTION_SCHEMA : MONTHLY_AI_SCHEMA,
      signal: opts.signal
    });
    var normalized = questionOnly ? normalizeMonthlyQuestionResponse(payload, context) : normalizeMonthlyAIResponse(payload, context);
    return Object.assign(normalized, { mode: questionOnly ? "question_only" : "validation", provider: providerKey, model: provider.model || "" });
  }

  var api = Object.freeze({
    MONTHLY_AI_SCHEMA: MONTHLY_AI_SCHEMA,
    MONTHLY_QUESTION_SCHEMA: MONTHLY_QUESTION_SCHEMA,
    buildMonthlyAIPrompt: buildMonthlyAIPrompt,
    buildMonthlyQuestionPrompt: buildMonthlyQuestionPrompt,
    normalizeMonthlyAIResponse: normalizeMonthlyAIResponse,
    normalizeMonthlyQuestionResponse: normalizeMonthlyQuestionResponse,
    generateMonthlyAI: generateMonthlyAI
  });
  root.MonthlyValidationAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
