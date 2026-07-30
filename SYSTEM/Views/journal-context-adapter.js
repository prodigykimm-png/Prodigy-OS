(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "journal",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "오늘의 Daily Reflection에서 주목할 만한 패턴은 무엇인가요?",
    "현재 저널 항목을 바탕으로 자기 성찰 질문을 제안해 주세요.",
    "최근 저널에서 발견되는 반복 주제는 무엇인가요?"
  ]);

  var LABEL = "저널";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.JournalContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
