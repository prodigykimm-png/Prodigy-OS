(function (root) {
  "use strict";

  function buildContext(options) {
    var opts = options || {};
    return {
      workspace: "auction",
      tab: opts.tab || null,
      selection: opts.selection || null,
      snapshot: opts.snapshot || [],
      citations: opts.citations || [],
      locale: "ko"
    };
  }

  var PROMPTS = Object.freeze([
    "현재 필터 기준으로 가장 유망한 매물은 무엇인가요?",
    "이 매물들의 입찰 전략을 제안해 주세요.",
    "현재 화면의 매물 중 주의가 필요한 항목은 무엇인가요?"
  ]);

  var LABEL = "경매";

  var api = Object.freeze({ buildContext: buildContext, PROMPTS: PROMPTS, LABEL: LABEL });
  root.AuctionContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
