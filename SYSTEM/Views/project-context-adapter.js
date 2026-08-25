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
  function appendHandoffSection(content, heading, input) {
    var source = String(content);
    var expression = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?$`, "gm");
    var matches = Array.from(source.matchAll(expression));
    if (matches.length !== 1) throw new Error("project_section_invalid");
    var marker = handoffMarker(input);
    if (source.includes(marker)) return source;
    var start = matches[0].index + matches[0][0].length;
    var rest = source.slice(start);
    var nextHeading = rest.search(/^#{1,3} [^\r\n]+\r?$/m);
    var end = nextHeading < 0 ? source.length : start + nextHeading;
    return `${source.slice(0, end).replace(/\s*$/, "")}\n- ${input.text}\n${marker}\n${source.slice(end)}`;
  }
  async function appendProjectSection(app, object, input, heading) {
    var file = app.vault.getAbstractFileByPath(object.path);
    if (!file || file.path !== object.path || file.extension !== "md") throw new Error("project_target_missing");
    var original = await app.vault.read(file);
    if (!/^type:\s*project\s*$/m.test(original)) throw new Error("project_type_mismatch");
    var next = appendHandoffSection(original, heading, input);
    if (next !== original) await app.vault.modify(file, next);
    return { path: object.path, status: next === original ? "unchanged" : "appended", content: next };
  }
  function appendProgressNote(app, object, input) {
    return appendProjectSection(app, object, input, "## ✍️ 메모 및 진행 상황");
  }
  function appendReviewLesson(app, object, input) {
    return appendProjectSection(app, object, input, "### 다음 프로젝트에서는");
  }

  var api = Object.freeze({ buildContext: buildContext, resurface: resurface, mountResurfacing: mountResurfacing, appendProgressNote: appendProgressNote, appendReviewLesson: appendReviewLesson, PROMPTS: PROMPTS, LABEL: LABEL });
  root.ProjectContextAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
