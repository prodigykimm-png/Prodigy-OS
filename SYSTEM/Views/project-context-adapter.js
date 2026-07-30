(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "project",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "현재 프로젝트 중 가장 우선순위가 높은 것은 무엇인가요?",
    "진행 중인 프로젝트의 병목을 분석해 주세요.",
    "프로젝트 간 의존성을 고려한 다음 행동을 제안해 주세요."
  ]);

  var LABEL = "프로젝트";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.ProjectContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
