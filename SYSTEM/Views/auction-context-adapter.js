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

  function handoffMarker(input) {
    return `<!-- llmwiki-object-handoff:${input.handoff_id}:${input.linked_lifecycle_ids.join(",")} -->`;
  }
  async function readAuction(app, object) {
    var file = app.vault.getAbstractFileByPath(object.path);
    if (!file || file.path !== object.path || file.extension !== "md") throw new Error("auction_target_missing");
    var content = await app.vault.read(file);
    if (!/^type:\s*auction_case\s*$/m.test(content)) throw new Error("auction_type_mismatch");
    return { file: file, content: content };
  }
  async function appendAuctionNote(app, object, input) {
    var target = await readAuction(app, object);
    var marker = handoffMarker(input);
    var next = target.content;
    if (!next.includes(marker)) next = next.replace(/^auction_note:.*$/m, `auction_note: ${input.text}\n${marker}`);
    if (next === target.content && !target.content.includes(marker)) throw new Error("auction_note_authority_missing");
    if (next !== target.content) await app.vault.modify(target.file, next);
    return { path: object.path, status: next === target.content ? "unchanged" : "appended", content: next };
  }
  async function appendReviewLesson(app, object, input) {
    var target = await readAuction(app, object);
    var source = target.content;
    var matches = Array.from(source.matchAll(/^## 핵심 교훈\r?$/gm));
    if (matches.length !== 1) throw new Error("auction_lesson_section_invalid");
    var marker = handoffMarker(input);
    var next = source;
    if (!source.includes(marker)) {
      var start = matches[0].index + matches[0][0].length;
      var rest = source.slice(start);
      var nextHeading = rest.search(/^#{1,3} [^\r\n]+\r?$/m);
      var end = nextHeading < 0 ? source.length : start + nextHeading;
      next = `${source.slice(0, end).replace(/\s*$/, "")}\n- ${input.text}\n${marker}\n${source.slice(end)}`;
    }
    if (next !== source) await app.vault.modify(target.file, next);
    return { path: object.path, status: next === source ? "unchanged" : "appended", content: next };
  }

  var api = Object.freeze({ buildContext: buildContext, resurface: resurface, mountResurfacing: mountResurfacing, appendAuctionNote: appendAuctionNote, appendReviewLesson: appendReviewLesson, PROMPTS: PROMPTS, LABEL: LABEL });
  root.AuctionContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
