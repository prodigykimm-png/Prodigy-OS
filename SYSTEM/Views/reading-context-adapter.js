(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "reading",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "현재 독서 목록에서 다음에 읽을 책을 추천해 주세요.",
    "읽고 있는 책들의 주요 주제를 연결해 주세요.",
    "현재 진행 중인 독서의 진척도를 분석해 주세요."
  ]);

  var LABEL = "독서";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.ReadingContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
