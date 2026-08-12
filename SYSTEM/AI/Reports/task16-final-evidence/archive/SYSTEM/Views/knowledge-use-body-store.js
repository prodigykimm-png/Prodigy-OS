(function (root) {
  "use strict";

  // Vault I/O layer for the bounded Knowledge-use experiment (Todo 10). It wraps the
  // pure body core with read/modify and verifies that every selected link resolves to
  // a verified Knowledge note (knowledge | permanent_note) through the metadata cache.
  // It never creates the target Object, never rewrites frontmatter, and never records
  // on display/open. The pure text transform stays in knowledge-use-body-core.js.
  var ALLOWED_TYPES = Object.freeze({ auction_case: true, reading: true, workout_program: true });
  var VERIFIED_KNOWLEDGE = Object.freeze({ knowledge: true, permanent_note: true });

  function clean(value) { return typeof value === "string" ? value.trim() : ""; }

  function core() {
    var c = root.KnowledgeUseBodyCore || (typeof require === "function" ? require("./knowledge-use-body-core.js") : null);
    if (!c) throw new Error("KnowledgeUseBodyCore must load before the body store.");
    return c;
  }

  function linkTarget(link) {
    var m = /^\[\[([^\[\]|]+)\]\]$/.exec(clean(link));
    return m ? m[1].trim() : "";
  }

  function typeOf(app, link, sourcePath) {
    var meta = app && app.metadataCache;
    if (!meta || typeof meta.getFirstLinkpathDest !== "function" || typeof meta.getFileCache !== "function") return null;
    var file = meta.getFirstLinkpathDest(linkTarget(link), sourcePath || "");
    if (!file) return null;
    var cache = meta.getFileCache(file) || {};
    var fm = cache.frontmatter && typeof cache.frontmatter === "object" ? cache.frontmatter : {};
    return clean(fm.type).toLowerCase();
  }

  function verifyLinks(app, links, sourcePath) {
    for (var i = 0; i < links.length; i++) {
      var t = typeOf(app, links[i], sourcePath);
      if (!VERIFIED_KNOWLEDGE[t]) throw new Error("선택한 항목 중 검증된 지식이 아닌 링크가 있습니다.");
    }
  }

  async function recordKnowledgeUse(app, objectPath, objectType, input) {
    if (!ALLOWED_TYPES[objectType]) throw new Error("지원하지 않는 Object 유형입니다.");
    var file = app && app.vault && app.vault.getAbstractFileByPath(objectPath);
    if (!file) throw new Error("기록할 대상을 찾을 수 없습니다.");
    var cache = app.metadataCache && app.metadataCache.getFileCache ? app.metadataCache.getFileCache(file) : null;
    var fm = cache && cache.frontmatter && typeof cache.frontmatter === "object" ? cache.frontmatter : {};
    if (clean(fm.type).toLowerCase() !== objectType) throw new Error("대상 Object 유형이 일치하지 않습니다.");
    var links = Array.isArray(input && input.links) ? input.links : [];
    verifyLinks(app, links, objectPath);
    var content = await app.vault.read(file);
    var result = core().recordKnowledgeUse(content, objectType, objectPath, input);
    if (result.status === "already_recorded") return result;
    await app.vault.modify(file, result.content);
    return result;
  }

  var api = Object.freeze({ recordKnowledgeUse: recordKnowledgeUse, ALLOWED_TYPES: ALLOWED_TYPES, VERIFIED_KNOWLEDGE: VERIFIED_KNOWLEDGE });
  root.KnowledgeUseBodyStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
