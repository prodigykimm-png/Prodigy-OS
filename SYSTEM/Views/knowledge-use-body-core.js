(function (root) {
  "use strict";
  var TARGET_SECTIONS = Object.freeze({
    auction_case: "# 판단 기록",
    reading: "## Review",
    workout_program: "# 리뷰"
  });
  var HEADING_RE = /^(#{1,6})(?:\s|$)/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function headingLevel(line) { var m = HEADING_RE.exec(line || ""); return m ? m[1].length : 0; }
  function canonicalLink(value) {
    if (typeof value !== "string") throw new Error("지식 링크 형식이 올바르지 않습니다.");
    var text = value.trim();
    if (/^https?:\/\//i.test(text)) throw new Error("지식 링크는 내부 경로여야 합니다.");
    var m = /^\[\[([^\[\]|]+)\]\]$/.exec(text);
    if (!m) throw new Error("지식 링크 형식이 올바르지 않습니다.");
    var t = m[1].trim();
    if (!t) throw new Error("지식 링크 형식이 올바르지 않습니다.");
    t = t.replace(/\.md$/i, "");
    if (t.startsWith("/") || t.split("/").some(function (p) { return !p || p === "." || p === ".."; })) throw new Error("지식 링크 경로가 안전하지 않습니다.");
    return "[[" + t + "]]";
  }
  function normalizeLinks(links) {
    if (!Array.isArray(links)) throw new Error("기록할 지식을 선택해 주세요.");
    var result = [], seen = {};
    for (var i = 0; i < links.length; i++) { var c = canonicalLink(links[i]); if (!seen[c]) { seen[c] = true; result.push(c); } }
    if (!result.length) throw new Error("기록할 지식을 선택해 주세요.");
    return Object.freeze(result);
  }
  function fhash(value) { var r = 2166136261; for (var i = 0; i < value.length; i++) { r ^= value.charCodeAt(i); r = Math.imul(r, 16777619); } return (r >>> 0).toString(36); }
  function markerFor(objectPath, context, links) {
    var sorted = links.slice().sort();
    return "<!-- PRODIGY:KNOWLEDGE_USE:" + fhash([objectPath || "", context].concat(sorted).join("\x1f")) + " -->";
  }
  function splitFrontmatter(content) {
    var m = /^---\n[\s\S]*?\n---\n?/.exec(content || "");
    if (!m) return { fm: "", body: content || "" };
    return { fm: m[0], body: content.slice(m[0].length) };
  }
  function findSectionRange(body, target) {
    var meta = { level: (target.match(/^#+/) || [""])[0].length, text: target.replace(/^#+\s*/, "").trim() };
    var lines = body.split("\n");
    var start = -1, end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      var lv = headingLevel(lines[i]);
      if (lv === 0) continue;
      var txt = lines[i].replace(/^#+\s*/, "").trim();
      if (start === -1 && lv === meta.level && txt === meta.text) { start = i; continue; }
      if (start !== -1 && lv <= meta.level) { end = i; break; }
    }
    if (start === -1) return null;
    var count = 0;
    for (var j = 0; j < lines.length; j++) { var l2 = headingLevel(lines[j]); if (l2 === meta.level && lines[j].replace(/^#+\s*/, "").trim() === meta.text) count++; }
    if (count > 1) return "duplicate";
    return { start: start, end: end };
  }
  function buildBlock(date, context, links, marker) {
    var lines = ["", marker, "### " + date + " · 판단 근거", "- 판단: " + context, "- 사용한 Knowledge:"];
    for (var i = 0; i < links.length; i++) lines.push("  - " + links[i]);
    lines.push("");
    return lines.join("\n");
  }
  function recordKnowledgeUse(content, objectType, objectPath, input) {
    if (!TARGET_SECTIONS[objectType]) throw new Error("지원하지 않는 Object 유형입니다.");
    if (!input || typeof input !== "object") throw new Error("입력이 올바르지 않습니다.");
    var date = typeof input.date === "string" ? input.date.trim() : "";
    if (!DATE_RE.test(date)) throw new Error("날짜 형식이 올바르지 않습니다.");
    var context = typeof input.context === "string" ? input.context.trim() : "";
    if (!context) throw new Error("판단 맥락을 입력해 주세요.");
    var links = normalizeLinks(input.links);
    var marker = markerFor(objectPath, context, links);
    var parts = splitFrontmatter(content);
    if (parts.body.indexOf(marker) !== -1) return Object.freeze({ status: "already_recorded", content: content });
    var range = findSectionRange(parts.body, TARGET_SECTIONS[objectType]);
    if (range === null) throw new Error("대상 섹션을 찾을 수 없습니다. 파일을 수정하지 않았습니다.");
    if (range === "duplicate") throw new Error("대상 섹션이 중복됩니다. 파일을 수정하지 않았습니다.");
    var lines = parts.body.split("\n");
    var block = buildBlock(date, context, links, marker);
    var insertAt = range.end;
    while (insertAt > range.start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
    lines.splice(insertAt, 0, block);
    var newBody = lines.join("\n");
    return Object.freeze({ status: "recorded", content: parts.fm + newBody });
  }
  var api = Object.freeze({ recordKnowledgeUse: recordKnowledgeUse, TARGET_SECTIONS: TARGET_SECTIONS });
  root.KnowledgeUseBodyCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
