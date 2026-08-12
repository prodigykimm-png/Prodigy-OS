(function (root) {
  "use strict";

  var isPlainObject = function (value) { return !!value && typeof value === "object" && !Array.isArray(value); };
  var text = function (value) { return typeof value === "string" ? value.trim() : ""; };
  var toCanonicalPath = function (value) { return text(value).replace(/\\/g, "/"); };

  var normalizeList = function (value) {
    var values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    return values.flatMap(function (item) {
      if (!item) return [];
      if (typeof item === "string") return [item.trim()].filter(Boolean);
      if (typeof item === "object") {
        var raw = text(item.path || item.file || item.link || item.target || "");
        return raw ? [raw] : [];
      }
      return [String(item).trim()].filter(Boolean);
    });
  };

  var SUPPORTED_TYPES = new Set([
    "knowledge", "permanent_note", "literature_note", "venue", "auction_region",
    "people", "project", "journal", "reading", "daily_note", "fleeting_note", "auction_case"
  ]);

  var isHubCandidate = function (page) {
    var type = text(page && page.type);
    var path = toCanonicalPath(page && (page.source_path || page.path || (page.file && page.file.path) || ""));
    if (/^SYSTEM\/TEMPLATE\//i.test(path)) return false;
    if (SUPPORTED_TYPES.has(type)) return true;
    return /^ZETA\//i.test(path) || /^PARA\//i.test(path) || /^DAILY\//i.test(path) || /^SYNTHETIC\/knowledge-explorer\//i.test(path);
  };

  var toPlainFrontmatter = function (page) {
    var frontmatter = isPlainObject(page && page.frontmatter) ? page.frontmatter : page;
    var record = {};
    var keys = [
      "type", "title", "summary", "review_summary", "knowledge_domain", "knowledge_topics", "connections",
      "updated", "created", "venue_category", "address", "region_sido", "region_sigungu", "region_dong",
      "project_type", "status", "relationship", "company", "role", "last_contact", "source_type"
    ];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (frontmatter && frontmatter[key] !== undefined) record[key] = frontmatter[key];
    }
    return record;
  };

  var fileMtime = function (value) {
    if (!value) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toJSDate === "function") {
      var date = value.toJSDate();
      return date instanceof Date && Number.isFinite(date.valueOf()) ? date.valueOf() : 0;
    }
    var parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  var readSelectedNote = async function (appRef, dvRef, filePath) {
    var path = text(filePath);
    if (!path) throw new Error("선택한 노트 경로가 없습니다.");
    try {
      if (dvRef && dvRef.io && typeof dvRef.io.load === "function") {
        var loaded = await dvRef.io.load(path);
        if (typeof loaded === "string") return loaded;
      }
    } catch (_error) { /* fall through */ }
    var abstract = appRef && appRef.vault && typeof appRef.vault.getAbstractFileByPath === "function"
      ? appRef.vault.getAbstractFileByPath(path) : null;
    if (abstract && typeof appRef.vault.cachedRead === "function") return appRef.vault.cachedRead(abstract);
    if (abstract && typeof appRef.vault.read === "function") return appRef.vault.read(abstract);
    throw new Error("선택한 노트를 찾을 수 없습니다.");
  };

  var collectRecords = function (dataSource, dvRef) {
    if (!dataSource || typeof dataSource.index !== "function") throw new Error("Knowledge Explorer data source is unavailable.");
    if (!dvRef || typeof dvRef.pages !== "function") throw new Error("Dataview pages are unavailable.");
    var sourcePages = dvRef.pages();
    var pages = typeof sourcePages.array === "function" ? sourcePages.array() : Array.isArray(sourcePages) ? sourcePages : [];
    return dataSource.index(pages.filter(isHubCandidate)).assets;
  };

  var relationRecord = function (page) {
    if (!page || typeof page !== "object" || Array.isArray(page)) return null;
    var file = isPlainObject(page.file) ? page.file : {};
    var path = toCanonicalPath(page.source_path || page.path || file.path || "");
    if (!path || /^SYSTEM\/TEMPLATE\//i.test(path)) return null;
    var frontmatter = toPlainFrontmatter(page);
    return {
      source_path: path, path: path,
      type: text(page.type || frontmatter.type),
      title: text(page.title || file.name || frontmatter.title || path.split("/").pop()),
      source_mtime: fileMtime(page.source_mtime || page.mtime || file.mtime),
      mtime: fileMtime(file.mtime || page.mtime),
      frontmatter: frontmatter,
      file: { path: path, mtime: fileMtime(file.mtime || page.mtime), outlinks: normalizeList(file.outlinks || page.outlinks), inlinks: normalizeList(file.inlinks || page.inlinks) },
      connections: normalizeList(page.connections || frontmatter.connections),
      outlinks: normalizeList(page.outlinks),
      backlinks: normalizeList(page.backlinks || page.inlinks || file.inlinks)
    };
  };

  var collectRelationRecords = function (dvRef) {
    if (!dvRef || typeof dvRef.pages !== "function") throw new Error("Dataview pages are unavailable.");
    var sourcePages = dvRef.pages();
    var pages = typeof sourcePages.array === "function" ? sourcePages.array() : Array.isArray(sourcePages) ? sourcePages : [];
    return pages.filter(isHubCandidate).map(relationRecord).filter(Boolean);
  };

  var openBeside = async function (appRef, targetPath) {
    var path = text(targetPath);
    if (!path) return null;
    var file = appRef.vault && typeof appRef.vault.getAbstractFileByPath === "function"
      ? appRef.vault.getAbstractFileByPath(path) : null;
    if (file && appRef.workspace && typeof appRef.workspace.getLeaf === "function") {
      var leaf = null;
      try { leaf = appRef.workspace.getLeaf("split"); } catch (_e) { leaf = null; }
      if (!leaf) { try { leaf = appRef.workspace.getLeaf(true); } catch (_e2) { leaf = null; } }
      if (leaf && typeof leaf.openFile === "function") { await leaf.openFile(file); return leaf; }
    }
    if (appRef.workspace && typeof appRef.workspace.openLinkText === "function") {
      try { return await appRef.workspace.openLinkText(path.replace(/\.md$/i, ""), path, "split"); }
      catch (_e3) { return appRef.workspace.openLinkText(path.replace(/\.md$/i, ""), path, true); }
    }
    return null;
  };

  var renderError = function (container, message, detail, onRetry) {
    container.empty();
    var status = container.createEl("section", { attr: { class: "knowledge-explorer-pane knowledge-explorer-detail-pane", "aria-label": "지식 탐색기 오류" } });
    var body = status.createDiv({ attr: { class: "knowledge-explorer-detail-error" } });
    body.createEl("strong", { text: message });
    if (detail) body.createEl("p", { text: detail, attr: { class: "knowledge-explorer-meta" } });
    var actions = body.createDiv({ attr: { class: "knowledge-explorer-row-actions" } });
    var retry = actions.createEl("button", { text: "다시 시도", attr: { type: "button" } });
    retry.onclick = async function () { if (typeof onRetry === "function") await onRetry(); };
    return status;
  };

  var api = Object.freeze({
    isPlainObject: isPlainObject, text: text, toCanonicalPath: toCanonicalPath, normalizeList: normalizeList,
    SUPPORTED_TYPES: SUPPORTED_TYPES, isHubCandidate: isHubCandidate, toPlainFrontmatter: toPlainFrontmatter,
    fileMtime: fileMtime, readSelectedNote: readSelectedNote, collectRecords: collectRecords,
    relationRecord: relationRecord, collectRelationRecords: collectRelationRecords,
    openBeside: openBeside, renderError: renderError
  });
  root.KnowledgeExplorerHubProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
