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
  root.JournalContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
