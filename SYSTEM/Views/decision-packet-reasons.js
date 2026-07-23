(function (root) {
  "use strict";

  // Pure presentation helper: project each consumer's internal match signal into an
  // ordered list of Korean reason labels. No ranking, no caps, no numeric scores.
  const WORKOUT_REASON = Object.freeze({
    direct: "현재 프로그램과 직접 연결",
    exercise: "같은 운동 종목",
    topic: "공통 주제",
    domain: "같은 운동 도메인"
  });

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function uniqueTrimmed(values) {
    const source = Array.isArray(values) ? values : [];
    const result = [];
    const seen = new Set();
    for (const value of source) {
      const text = trim(value);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
    return result;
  }

  function flags(matched) {
    const source = matched && typeof matched === "object" ? matched : {};
    return {
      direct: Boolean(source.direct),
      region: Boolean(source.region),
      topic: Boolean(source.topic)
    };
  }

  function auctionReasons(matched, matchedTopics) {
    const signal = flags(matched);
    const reasons = [];
    if (signal.direct) reasons.push("현재 대상과 직접 연결");
    if (signal.region) reasons.push("동일 지역");
    if (signal.topic) {
      const topics = uniqueTrimmed(matchedTopics);
      reasons.push(topics.length ? `공통 주제: ${topics.join(", ")}` : "공통 주제");
    }
    return Object.freeze(reasons);
  }

  function readingReasons(relationLabels, evidenceLine) {
    const reasons = uniqueTrimmed(relationLabels);
    const evidence = trim(evidenceLine);
    if (evidence) reasons.push(evidence);
    return Object.freeze(reasons);
  }

  function workoutReasons(code) {
    const key = trim(code);
    const label = key ? WORKOUT_REASON[key] : undefined;
    return Object.freeze(label ? [label] : []);
  }

  const api = Object.freeze({ auctionReasons, readingReasons, workoutReasons });
  root.DecisionPacketReasons = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
