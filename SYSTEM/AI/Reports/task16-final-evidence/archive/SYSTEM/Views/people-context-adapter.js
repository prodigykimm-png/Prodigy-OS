(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "personal",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "최근 상호작용이 있었던 사람들의 관계를 분석해 주세요.",
    "현재 화면의 연락처 정보를 바탕으로 후속 조치를 제안해 주세요.",
    "사람 간 연결 패턴에서 발견되는 인사이트는 무엇인가요?"
  ]);

  var LABEL = "개인";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.PeopleContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
