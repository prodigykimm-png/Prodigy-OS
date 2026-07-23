(function (root) {
  "use strict";

  var QUESTION_AI_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["phase", "label", "reason"],
          properties: {
            phase: { type: "string", enum: ["before", "during", "after"] },
            base_question_id: { type: "string", maxLength: 80 },
            label: { type: "string", minLength: 1, maxLength: 200 },
            reason: { type: "string", maxLength: 300 },
            memory_refs: { type: "array", maxItems: 3, items: { type: "string", maxLength: 160 } }
          }
        }
      }
    }
  });

  function buildPrompt(options) {
    var parts = [];
    parts.push("당신은 Prodigy OS의 독서 질문 정교화 AI다.");
    parts.push("사용자가 현재 읽는 책에 대해 더 날카로운 질문을 제안한다.");
    parts.push("");
    parts.push("## 규칙");
    parts.push("1. 제공된 기본 질문을 무시하지 않는다. 정교화하거나 보완한다.");
    parts.push("2. 책의 제목, 저자, 유형, 현재 단계를 반영한다.");
    parts.push("3. 관련 기억이 있으면 그 맥락을 질문 이유에 반영한다.");
    parts.push("4. 답을 생성하지 않는다. 질문만 생성한다.");
    parts.push("5. 사용자의 생각을 추정하지 않는다.");
    parts.push("6. 결론을 질문처럼 위장하지 않는다.");
    parts.push("7. 최대 5개 질문만 반환한다.");
    parts.push("8. 모든 출력은 한국어로 작성한다.");
    parts.push("");
    parts.push("## 책 정보");
    parts.push("제목: " + (options.title || ""));
    parts.push("저자: " + (options.author || ""));
    parts.push("유형: " + (options.bookType || "미분류"));
    parts.push("현재 단계: " + (options.phase || "before"));
    parts.push("");
    parts.push("## 기본 질문 (Deterministic)");
    (options.deterministicQuestions || []).forEach(function (q) {
      parts.push("- [" + q.phase + "] " + q.label);
    });
    if (options.memoryContext && options.memoryContext.length) {
      parts.push("");
      parts.push("## 관련 기억 (최대 3개)");
      options.memoryContext.forEach(function (m) {
        parts.push("- " + m.title + " | 관계: " + (m.relation || "") + " | 근거: " + (m.evidence || ""));
      });
    }
    parts.push("");
    parts.push("## 요청");
    parts.push("위 기본 질문을 정교화하거나 보완하여 최대 5개의 질문을 JSON으로 반환하라.");
    parts.push("각 질문은 phase, label, reason, memory_refs(해당 시)를 포함해야 한다.");
    return parts.join("\n");
  }

  function normalizePayload(payload, deterministicQuestions) {
    if (!payload || !Array.isArray(payload.questions) || !payload.questions.length) return null;
    var baseIds = new Set((deterministicQuestions || []).map(function (q) { return q.id; }));
    var result = payload.questions.map(function (q, i) {
      return {
        id: q.base_question_id && baseIds.has(q.base_question_id) ? q.base_question_id : "ai_q_" + i,
        phase: q.phase || "before",
        label: String(q.label || "").trim(),
        reason: String(q.reason || "").trim(),
        memory_refs: Array.isArray(q.memory_refs) ? q.memory_refs.slice(0, 3) : [],
        source: "gemini"
      };
    }).filter(function (q) { return q.label; }).slice(0, 5);
    return result.length ? result : null;
  }

  async function refineQuestions(options) {
    var app = options.app;
    if (!app) throw new Error("app이 필요합니다.");
    var projectService = root.ProjectWorkflowDraftService;
    if (!projectService || typeof projectService.loadProviderConfig !== "function") throw new Error("AI provider configuration service is not loaded.");
    var config = options.config || await projectService.loadProviderConfig(app);
    var providerKey = options.providerKey || config.defaultProvider;
    var provider = config.providers && config.providers[providerKey];
    if (!provider) throw new Error("AI provider를 찾을 수 없습니다: " + providerKey);
    var service = options.providerService || root.AIProviderService;
    if (!service || typeof service.requestStructuredJson !== "function") throw new Error("AI provider service is not loaded.");
    var prompt = buildPrompt({
      title: options.title,
      author: options.author,
      bookType: options.bookType,
      phase: options.phase,
      deterministicQuestions: options.deterministicQuestions,
      memoryContext: options.memoryContext
    });
    var payload = await service.requestStructuredJson({
      app: app,
      provider: provider,
      prompt: prompt,
      schema: QUESTION_AI_SCHEMA,
      signal: options.signal
    });
    var normalized = normalizePayload(payload, options.deterministicQuestions);
    if (!normalized || !normalized.length) throw new Error("AI 응답을 해석할 수 없습니다.");
    return { questions: normalized, provider: providerKey, model: provider.model || "" };
  }

  var api = Object.freeze({
    QUESTION_AI_SCHEMA: QUESTION_AI_SCHEMA,
    buildPrompt: buildPrompt,
    normalizePayload: normalizePayload,
    refineQuestions: refineQuestions
  });
  root.ReadingQuestionAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
