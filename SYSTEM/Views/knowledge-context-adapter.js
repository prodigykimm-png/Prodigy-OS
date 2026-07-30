(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "knowledge",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "현재 탐색 중인 지식 항목 간의 관계를 설명해 주세요.",
    "이 지식 항목에서 더 깊이 탐구할 만한 주제는 무엇인가요?",
    "현재 화면의 지식 구조에서 보완할 점을 제안해 주세요."
  ]);

  var LABEL = "지식";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.KnowledgeContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
