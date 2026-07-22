(function (root) {
  "use strict";

  function safeText(value) { return typeof value === "string" ? value.trim() : ""; }

  function parseFrontmatter(content) {
    var match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    var data = {};
    var lines = match[1].split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m = /^([a-z][a-z0-9_-]*):\s*(.*)$/.exec(lines[i]);
      if (m) data[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return data;
  }

  function parseSuggestedPrinciples(body) {
    var section = body.match(/## Suggested Principles\s*\n([\s\S]*?)(?=\n## |\n---|\n$|$)/);
    if (!section) return [];
    var lines = section[1].split("\n");
    var principles = [];
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var checkbox = /^- \[([ x])\]\s+(.+)$/.exec(line);
      if (checkbox) {
        if (current) principles.push(current);
        current = { title: checkbox[2].trim(), status: checkbox[1] === "x" ? "checked" : "pending", evidence_refs: [] };
        continue;
      }
      if (current) {
        var evMatch = /^\s+- Evidence:\s+(.+)$/.exec(line);
        if (evMatch) {
          current.evidence_refs = evMatch[1].split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        }
        var stMatch = /^\s+- 상태:\s+(.+)$/.exec(line);
        if (stMatch) current.status = stMatch[1].trim();
      }
    }
    if (current) principles.push(current);
    return principles.filter(function (p) { return p.title; });
  }

  function parseWeeklyNote(content, path) {
    var fm = parseFrontmatter(content);
    if (fm.journal !== "weekly" && fm["journal-section"] !== "week") return null;
    if (fm.status !== "completed" && fm.type !== "journal") {
      // Accept legacy weekly notes without type: journal
      if (!fm["journal-start-date"]) return null;
    }
    var body = content.replace(/^---[\s\S]*?---\n?/, "");
    var principles = parseSuggestedPrinciples(body);
    return {
      path: path,
      week: (path.match(/(\d{4}-W\d{2})/) || [])[1] || "",
      start: fm["journal-start-date"] || "",
      end: fm["journal-end-date"] || "",
      principles: principles
    };
  }

  function normalizePrincipleKey(title) {
    return safeText(title).toLowerCase().replace(/\s+/g, " ").replace(/[^\w가-힣\s]/g, "");
  }

  function collectPrinciples(weeklyNotes) {
    var groups = {};
    weeklyNotes.forEach(function (note) {
      note.principles.forEach(function (p) {
        var key = normalizePrincipleKey(p.title);
        if (!key) return;
        if (!groups[key]) groups[key] = { title: p.title, weeks: [], evidence_refs: [] };
        var group = groups[key];
        if (note.week && group.weeks.indexOf(note.week) === -1) group.weeks.push(note.week);
        p.evidence_refs.forEach(function (ref) {
          if (group.evidence_refs.indexOf(ref) === -1) group.evidence_refs.push(ref);
        });
      });
    });
    return Object.values(groups).map(function (g) {
      return {
        title: g.title,
        week_count: g.weeks.length,
        weeks: g.weeks.sort(),
        evidence_refs: g.evidence_refs,
        eligible: g.weeks.length >= 2
      };
    }).sort(function (a, b) { return b.week_count - a.week_count || a.title.localeCompare(b.title, "ko"); });
  }

  function checkReadiness(weeklyNotes) {
    var completed = weeklyNotes.filter(function (n) { return n; });
    var principles = collectPrinciples(completed);
    var eligible = principles.filter(function (p) { return p.eligible; });
    return {
      weekly_count: completed.length,
      total_principles: principles.length,
      eligible_principles: eligible.length,
      ready: completed.length >= 2 && eligible.length >= 1,
      reason: completed.length < 2
        ? "저장된 Weekly가 " + completed.length + "개입니다. 최소 2개가 필요합니다."
        : eligible.length < 1
          ? "서로 다른 주차에서 반복되는 Principle이 아직 없습니다."
          : ""
    };
  }

  function buildValidationModel(weeklyNotes, monthPrefix) {
    var completed = weeklyNotes.filter(function (n) { return n; });
    var readiness = checkReadiness(completed);
    var principles = collectPrinciples(completed);
    return {
      month: monthPrefix || "",
      readiness: readiness,
      principles: principles,
      weekly_paths: completed.map(function (n) { return n.path; })
    };
  }

  function buildMonthlyNoteContent(model, decisions) {
    var dec = decisions || {};
    var lines = [
      "---",
      "journal: monthly",
      "journal-start-date: " + safeText(model.month) + "-01",
      "journal-end-date: " + safeText(model.month) + "-28",
      "journal-section: month",
      "type: journal",
      "status: completed",
      "---",
      "# " + safeText(model.month) + " Monthly Validation",
      "",
      "> 어떤 변화가 실제로 검증되었는가?",
      "",
      "## Monthly Summary",
      "",
      safeText(dec.summary) || "기록 없음",
      "",
      "## Reviewed Weekly Learnings",
      ""
    ];
    model.weekly_paths.forEach(function (p) { lines.push("- " + p); });
    lines.push("", "## Principle Validation", "");
    model.principles.forEach(function (p, i) {
      var d = dec["p" + i] || {};
      var action = d.action || "pending";
      lines.push("### " + p.title);
      lines.push("");
      lines.push("- 반복 주차: " + p.weeks.join(", "));
      lines.push("- Evidence: " + (p.evidence_refs.length ? p.evidence_refs.join(", ") : "없음"));
      lines.push("- 결정: **" + action + "**");
      if (d.knowledge_statement) lines.push("- 지식 문장: " + d.knowledge_statement);
      if (d.validation_reason) lines.push("- 검증 사유: " + d.validation_reason);
      lines.push("");
    });
    lines.push("### Knowledge Candidate Decision", "");
    lines.push("> 검증된 원칙은 Knowledge Candidate로 보존합니다. 정식 Knowledge 승격은 기존 승인 화면에서 사람이 결정합니다.");
    lines.push("");
    lines.push("## Rejected or Deferred Principles", "");
    var hasRejected = false;
    model.principles.forEach(function (p, i) {
      var d = dec["p" + i] || {};
      if (d.action === "rejected" || d.action === "deferred") {
        hasRejected = true;
        lines.push("- **" + p.title + "** → " + d.action + (d.reason ? ": " + d.reason : ""));
      }
    });
    if (!hasRejected) lines.push("- 없음");
    lines.push("");
    lines.push("## Next Month Direction", "");
    lines.push(safeText(dec.next_direction) || "- 기록 없음");
    lines.push("");
    return lines.join("\n");
  }

  var api = Object.freeze({
    parseFrontmatter: parseFrontmatter,
    parseSuggestedPrinciples: parseSuggestedPrinciples,
    parseWeeklyNote: parseWeeklyNote,
    collectPrinciples: collectPrinciples,
    checkReadiness: checkReadiness,
    buildValidationModel: buildValidationModel,
    buildMonthlyNoteContent: buildMonthlyNoteContent
  });
  root.MonthlyValidationCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
