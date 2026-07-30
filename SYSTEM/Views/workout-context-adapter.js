(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "workout",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "현재 운동 프로그램의 진행 상황을 분석해 주세요.",
    "오늘 세션에서 주의할 점을 제안해 주세요.",
    "최근 운동 기록에서 개선이 필요한 부분은 무엇인가요?"
  ]);

  var LABEL = "운동";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.WorkoutContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
