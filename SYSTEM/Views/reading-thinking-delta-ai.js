(function (root) {
  "use strict";

  if (typeof require === "function" && !root.ProdigyAIConsumerRuntime) {
    root.ProdigyAIConsumerRuntime = require("./prodigy-ai-consumer-runtime.js");
  }

  var THINKING_DELTA_SCHEMA = Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["before", "after", "reason"],
    properties: {
      before: { type: "string", maxLength: 1000 },
      after: { type: "string", maxLength: 1000 },
      reason: { type: "string", maxLength: 1000 },
      evidence_refs: { type: "array", maxItems: 5, items: { type: "string", maxLength: 160 } }
    }
  });

  function validateReadiness(options) {
    var before = String(options.before || "").trim();
    var after = String(options.after || "").trim();
    if (!before) return { ready: false, reason: "읽기 전 기록(Before)이 없습니다." };
    if (!after) return { ready: false, reason: "읽기 후 기록(After)이 없습니다." };
    return { ready: true, reason: "" };
  }

  function buildPrompt(options) {
    var parts = [];
    parts.push("당신은 Prodigy OS의 Thinking Delta 초안 생성 AI다.");
    parts.push("사용자가 읽기 전과 읽기 후에 기록한 내용을 비교하여 사고 변화를 정리한다.");
    parts.push("");
    parts.push("## 규칙");
    parts.push("1. Before와 After는 사용자 기록에서만 추출한다.");
    parts.push("2. 존재하지 않는 과거 믿음을 생성하지 않는다.");
    parts.push("3. Reason은 제공된 근거 범위 안에서만 작성한다.");
    parts.push("4. 변화가 없으면 '변화가 확인되지 않음'으로 표시한다.");
    parts.push("5. 모든 출력은 한국어로 작성한다.");
    parts.push("");
    parts.push("## 책 정보");
    parts.push("제목: " + (options.title || ""));
    parts.push("");
    parts.push("## Before (읽기 전 기록)");
    parts.push(options.before || "");
    parts.push("");
    parts.push("## After (읽기 후 기록)");
    parts.push(options.after || "");
    if (options.sessionNotes) {
      parts.push("");
      parts.push("## 세션 메모 (참고)");
      parts.push(options.sessionNotes);
    }
    parts.push("");
    parts.push("## 요청");
    parts.push("Before와 After를 비교하여 Thinking Delta 초안을 JSON으로 반환하라.");
    parts.push("before, after, reason, evidence_refs를 포함해야 한다.");
    return parts.join("\n");
  }

  function normalizePayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    var before = String(payload.before || "").trim();
    var after = String(payload.after || "").trim();
    var reason = String(payload.reason || "").trim();
    if (!before || !after) return null;
    return {
      before: before,
      after: after,
      reason: reason || "변화가 확인되지 않음",
      evidence_refs: Array.isArray(payload.evidence_refs) ? payload.evidence_refs.slice(0, 5) : []
    };
  }

  async function generateThinkingDelta(options) {
    var readiness = validateReadiness(options);
    if (!readiness.ready) {
      var error = new Error("Thinking Delta를 생성하기에 사용자 기록이 부족합니다. " + readiness.reason);
      error.code = "INSUFFICIENT_RECORDS";
      throw error;
    }
    var app = options.app;
    if (!app) throw new Error("app이 필요합니다.");
    var runtime = root.ProdigyAIConsumerRuntime;
    if (!runtime || typeof runtime.requestStructured !== "function") throw new Error("Prodigy AI Runtime client is not loaded.");
    var prompt = buildPrompt({
      title: options.title,
      before: options.before,
      after: options.after,
      sessionNotes: options.sessionNotes
    });
    var response = await runtime.requestStructured({
      app: app,
      client: options.client,
      consumerId: "reading.thinking_delta",
      prompt: prompt,
      schema: THINKING_DELTA_SCHEMA,
      signal: options.signal,
      confirmConsent: options.confirmConsent,
      ownerSessionId: options.ownerSessionId,
      operationId: options.operationId,
      attemptId: options.attemptId
    });
    var payload = response.payload;
    var normalized = normalizePayload(payload);
    if (!normalized) throw new Error("AI 응답을 해석할 수 없습니다.");
    return Object.assign(normalized, runtime.providerMetadata(response));
  }

  var api = Object.freeze({
    THINKING_DELTA_SCHEMA: THINKING_DELTA_SCHEMA,
    validateReadiness: validateReadiness,
    buildPrompt: buildPrompt,
    normalizePayload: normalizePayload,
    generateThinkingDelta: generateThinkingDelta
  });
  root.ReadingThinkingDeltaAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
