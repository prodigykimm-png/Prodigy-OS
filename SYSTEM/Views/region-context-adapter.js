(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "region",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "현재 선택한 지역들의 주요 차이점은 무엇인가요?",
    "비교 지표에서 가장 두드러진 항목은 무엇인가요?",
    "이 지역 데이터를 바탕으로 의사결정에 도움이 될 인사이트를 제공해 주세요."
  ]);

  var LABEL = "지역";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.RegionContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
