(function (root) {
  "use strict";

  if (typeof require === "function" && !root.ProdigyAIConsumerRuntime) {
    root.ProdigyAIConsumerRuntime = require("./prodigy-ai-consumer-runtime.js");
  }

  function required(name) {
    var v = root[name];
    if (!v) throw new Error(name + "을(를) 먼저 불러와야 합니다.");
    return v;
  }

  var WEEKLY_AI_SCHEMA = Object.freeze({
    type: "object",
    properties: {
      key_learnings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            learning: { type: "string" },
            evidence_refs: { type: "array", items: { type: "string" } }
          },
          required: ["pattern", "learning"]
        }
      },
      interpreted_patterns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            interpretation: { type: "string" },
            learning: { type: "string" },
            evidence_refs: { type: "array", items: { type: "string" } }
          },
          required: ["pattern", "interpretation", "learning"]
        }
      },
      next_week_direction: {
        type: "object",
        properties: {
          continue_items: { type: "array", items: { type: "string" } },
          observe_items: { type: "array", items: { type: "string" } },
          increase_attention: { type: "array", items: { type: "string" } },
          pending_items: { type: "array", items: { type: "string" } }
        }
      },
      suggested_principles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            reason: { type: "string" },
            evidence_refs: { type: "array", items: { type: "string" } },
            evidence_strength: { type: "string" }
          },
          required: ["title", "reason"]
        }
      }
    },
    required: ["key_learnings", "interpreted_patterns", "next_week_direction"]
  });

  function buildWeeklyAIPrompt(review, evidenceItems) {
    var parts = [];
    parts.push("당신은 Prodigy OS의 주간 학습 리뷰 AI다.");
    parts.push("사용자의 일일 성찰(Evidence)에서 패턴을 해석하고 배움을 추출한다.");
    parts.push("AI는 해석만 제안하며, 승인·저장·Knowledge 승격은 사람이 한다.");
    parts.push("");
    parts.push("## 규칙");
    parts.push("1. Evidence에 없는 내용을 발명하지 않는다.");
    parts.push("2. 패턴은 '무엇이 반복되었는가'가 아니라 '왜 의미 있는가'를 설명한다.");
    parts.push("3. Learning은 패턴의 해석이며, 다음 행동에 대한 시사점을 포함한다.");
    parts.push("4. Suggested Principle은 2개 이상의 서로 다른 날에서 반복된 행동 변화가 있을 때만 제안한다.");
    parts.push("5. Next Week Direction은 Continue(유지할 행동), Observe(관찰할 실험), Increase Attention(주의가 필요한 영역), Pending(보류)으로 나눈다.");
    parts.push("6. 모든 출력은 한국어로 작성한다.");
    parts.push("");
    parts.push("## 주간 정보");
    parts.push("기간: " + (review.period ? review.period.week + " (" + review.period.start + " ~ " + review.period.end + ")" : ""));
    parts.push("Evidence 블록 수: " + evidenceItems.length);
    parts.push("Daily 수: " + (review.references ? review.references.length : 0));
    parts.push("");
    parts.push("## Evidence 목록");
    for (var i = 0; i < evidenceItems.length; i++) {
      var item = evidenceItems[i];
      parts.push("### " + item.evidence_id);
      if (item.context) parts.push("Context: " + item.context);
      parts.push("Experience: " + (item.experience || ""));
      if (item.interpretation) parts.push("Interpretation: " + item.interpretation);
      if (item.change) parts.push("Change: " + item.change);
      if (item.next_experiment) parts.push("Next Experiment: " + item.next_experiment);
      parts.push("");
    }
    parts.push("## Deterministic 분석 결과 (참고용)");
    parts.push("감지된 패턴 수: " + (review.findings ? review.findings.length : 0));
    if (review.findings && review.findings.length) {
      for (var j = 0; j < review.findings.length; j++) {
        parts.push("- " + review.findings[j].pattern);
      }
    }
    parts.push("변화 수: " + (review.meaningful_changes ? review.meaningful_changes.length : 0));
    parts.push("실험 수: " + (review.experiments ? review.experiments.length : 0));
    parts.push("");
    parts.push("## 요청");
    parts.push("위 Evidence를 분석하여 다음을 JSON으로 반환하라:");
    parts.push("1. key_learnings: 이번 주의 핵심 배움 (Pattern → Learning 구조)");
    parts.push("2. interpreted_patterns: 감지된 패턴의 해석 (왜 의미 있는가 + Learning)");
    parts.push("3. next_week_direction: 다음 주 방향 (continue/observe/increase_attention/pending)");
    parts.push("4. suggested_principles: 2일 이상 반복된 행동에서 추출한 원칙 후보 (없으면 빈 배열)");
    return parts.join("\n");
  }

  function normalizeAIResponse(payload, review) {
    if (!payload || typeof payload !== "object") return null;
    var learnings = Array.isArray(payload.key_learnings) ? payload.key_learnings.map(function (l) {
      return {
        pattern: String(l.pattern || "").trim(),
        learning: String(l.learning || "").trim(),
        evidence_refs: Array.isArray(l.evidence_refs) ? l.evidence_refs : []
      };
    }).filter(function (l) { return l.pattern && l.learning; }) : [];

    var patterns = Array.isArray(payload.interpreted_patterns) ? payload.interpreted_patterns.map(function (p) {
      return {
        title: String(p.pattern || "").trim().slice(0, 80),
        pattern: String(p.pattern || "").trim(),
        interpretation: String(p.interpretation || "").trim(),
        learning: String(p.learning || "").trim(),
        evidence_refs: Array.isArray(p.evidence_refs) ? p.evidence_refs : []
      };
    }).filter(function (p) { return p.pattern; }) : [];

    var dir = payload.next_week_direction || {};
    var nextDirection = {
      continue_items: Array.isArray(dir.continue_items) ? dir.continue_items.map(String).filter(Boolean) : [],
      observe_items: Array.isArray(dir.observe_items) ? dir.observe_items.map(String).filter(Boolean) : [],
      increase_attention: Array.isArray(dir.increase_attention) ? dir.increase_attention.map(String).filter(Boolean) : [],
      pending_items: Array.isArray(dir.pending_items) ? dir.pending_items.map(String).filter(Boolean) : []
    };

    var principles = Array.isArray(payload.suggested_principles) ? payload.suggested_principles.map(function (p, idx) {
      return {
        proposal_id: "principle-ai-" + (review.period ? review.period.week : "unknown") + "-" + String(idx + 1).padStart(3, "0"),
        title: String(p.title || "").trim().slice(0, 80),
        statement: String(p.title || "").trim(),
        reason: String(p.reason || "").trim(),
        evidence_refs: Array.isArray(p.evidence_refs) ? p.evidence_refs : [],
        evidence_strength: String(p.evidence_strength || "limited"),
        decision: "pending",
        applied: false
      };
    }).filter(function (p) { return p.title; }) : [];

    return { key_learnings: learnings, findings: patterns, next_week_direction: nextDirection, suggested_principles: principles };
  }

  async function generateWeeklyAI(options) {
    var app = options.app;
    var review = options.review;
    var evidenceItems = options.evidenceItems;
    if (!app) throw new Error("app이 필요합니다.");
    var runtime = root.ProdigyAIConsumerRuntime;
    if (!runtime || typeof runtime.requestStructured !== "function") throw new Error("Prodigy AI Runtime client is not loaded.");
    var prompt = buildWeeklyAIPrompt(review, evidenceItems);
    var response = await runtime.requestStructured({
      app: app,
      client: options.client,
      consumerId: "journal.weekly_filter",
      prompt: prompt,
      schema: WEEKLY_AI_SCHEMA,
      signal: options.signal,
      confirmConsent: options.confirmConsent,
      ownerSessionId: options.ownerSessionId,
      operationId: options.operationId,
      attemptId: options.attemptId
    });
    var payload = response.payload;
    var normalized = normalizeAIResponse(payload, review);
    if (!normalized) throw new Error("AI 응답을 해석할 수 없습니다.");
    return Object.assign(normalized, runtime.providerMetadata(response));
  }

  function mergeAIIntoReview(review, aiResult) {
    var merged = JSON.parse(JSON.stringify(review));
    if (aiResult.key_learnings && aiResult.key_learnings.length) merged.key_learnings = aiResult.key_learnings;
    if (aiResult.findings && aiResult.findings.length) merged.findings = aiResult.findings;
    if (aiResult.next_week_direction) merged.next_week_direction = aiResult.next_week_direction;
    if (aiResult.suggested_principles && aiResult.suggested_principles.length) merged.suggested_principles = aiResult.suggested_principles;
    merged.ai_enhanced = true;
    merged.ai_provider = aiResult.provider || "";
    merged.ai_model = aiResult.model || "";
    return merged;
  }

  var api = Object.freeze({
    WEEKLY_AI_SCHEMA: WEEKLY_AI_SCHEMA,
    buildWeeklyAIPrompt: buildWeeklyAIPrompt,
    normalizeAIResponse: normalizeAIResponse,
    generateWeeklyAI: generateWeeklyAI,
    mergeAIIntoReview: mergeAIIntoReview
  });
  root.WeeklyFilterAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
