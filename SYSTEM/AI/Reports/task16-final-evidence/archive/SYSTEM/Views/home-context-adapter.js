(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "home",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "홈 대시보드에서 오늘 가장 주목할 항목은 무엇인가요?",
    "현재 진행 중인 작업 중 우선순위가 높은 것은 무엇인가요?",
    "오늘의 Daily Reflection에서 다룰 만한 주제를 제안해 주세요.",
    "홈 화면에 표시된 정보를 바탕으로 한 줄 요약을 해 주세요."
  ]);

  var LABEL = "홈";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.HomeContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
