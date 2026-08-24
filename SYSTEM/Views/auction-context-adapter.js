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

  var productionDependencies = null;
  function dependencies(options) {
    var opts = options || {};
    var readerApi = root.LLMWikiResurfacingReadAdapter || (typeof require === "function" ? require("./llmwiki-resurfacing-read-adapter.js") : null);
    var serviceApi = root.LLMWikiResurfacingService || (typeof require === "function" ? require("./llmwiki-resurfacing-service.js") : null);
    var storeApi = root.LLMWikiResurfacingFeedbackStore || (typeof require === "function" ? require("./llmwiki-resurfacing-feedback-store.js") : null);
    if (!readerApi || !serviceApi || !storeApi) throw new Error("LLMWiki resurfacing boundaries are required");
    if (opts.readAdapter) return { reader: opts.readAdapter, service: serviceApi.create({ readAdapter: opts.readAdapter, feedbackStore: opts.feedbackStore || null }) };
    if (!productionDependencies) { var reader = readerApi.create(); var store = storeApi.createDefault(root); productionDependencies = { reader: reader, service: serviceApi.create({ readAdapter: reader, feedbackStore: store }) }; }
    return productionDependencies;
  }
  function resurface(options) {
    var opts = options || {}, deps = dependencies(opts);
    return deps.service.resurface({ context: opts.context || buildContext(opts), items: opts.items || [], readAdapter: opts.readAdapter || deps.reader });
  }
  async function mountResurfacing(options) {
    var opts = options || {}, deps = dependencies(opts), signal = opts.signal;
    if (signal && signal.aborted) return { ok: false, status: "cancelled", reason: "mount_cancelled", count: 0 };
    var feed = await deps.reader.read({ app: opts.app || root.app, signal: signal });
    if (signal && signal.aborted) return { ok: false, status: "cancelled", reason: "mount_cancelled", count: 0 };
    if (!feed.ok) return feed;
    return deps.service.mount({ container: opts.container, context: opts.context || buildContext(opts), items: feed.rows, readAdapter: deps.reader });
  }

  var api = Object.freeze({ buildContext: buildContext, resurface: resurface, mountResurfacing: mountResurfacing, PROMPTS: PROMPTS, LABEL: LABEL });
  root.AuctionContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
