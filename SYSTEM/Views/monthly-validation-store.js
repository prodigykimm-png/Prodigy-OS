(function (root) {
  "use strict";

  var FOLDER = "DAILY/MONTHLY";

  function safeText(value) { return typeof value === "string" ? value.trim() : ""; }

  function pathFor(month) {
    var m = safeText(month);
    if (!/^\d{4}-\d{2}$/.test(m)) throw new Error("유효하지 않은 월 형식입니다. YYYY-MM 형식이 필요합니다.");
    return FOLDER + "/" + m + ".md";
  }

  async function ensureFolder(app) {
    if (!app || !app.vault) throw new Error("Vault를 사용할 수 없습니다.");
    if (app.vault.getAbstractFileByPath(FOLDER)) return;
    await app.vault.createFolder(FOLDER);
  }

  async function listWeeklyNotes(app, monthPrefix) {
    var core = root.MonthlyValidationCore;
    if (!core) throw new Error("MonthlyValidationCore를 먼저 불러와야 합니다.");
    var files = app && app.vault && typeof app.vault.getMarkdownFiles === "function"
      ? app.vault.getMarkdownFiles() : [];
    var weeklyFiles = files.filter(function (f) {
      return f.path.indexOf("DAILY/WEEKLY/") === 0 && f.extension === "md";
    });
    var results = [];
    for (var i = 0; i < weeklyFiles.length; i++) {
      try {
        var content = await app.vault.read(weeklyFiles[i]);
        var note = core.parseWeeklyNote(content, weeklyFiles[i].path);
        if (!note) continue;
        if (monthPrefix && note.start && note.start.indexOf(monthPrefix) !== 0
          && note.end && note.end.indexOf(monthPrefix) !== 0) {
          // Include if any day in the week falls in the month
          var weekStart = note.start;
          var weekEnd = note.end;
          var mStart = monthPrefix + "-01";
          var mEnd = monthPrefix + "-31";
          if (weekEnd < mStart || weekStart > mEnd) continue;
        }
        results.push(note);
      } catch (_e) { /* skip unreadable */ }
    }
    return results.sort(function (a, b) { return a.week.localeCompare(b.week); });
  }

  async function save(app, month, content) {
    var path = pathFor(month);
    var body = safeText(content);
    if (!body) throw new Error("저장할 내용이 없습니다.");
    await ensureFolder(app);
    var file = app.vault.getAbstractFileByPath(path);
    if (file) {
      await app.vault.modify(file, body);
      return Object.freeze({ path: path, created: false });
    }
    await app.vault.create(path, body);
    return Object.freeze({ path: path, created: true });
  }

  async function createCandidatesFromDecisions(app, model, decisions) {
    var candidateCore = root.KnowledgeCandidateCore;
    var candidateStore = root.KnowledgeCandidateStore;
    if (!candidateCore || !candidateStore) return [];
    var created = [];
    var principles = model.principles || [];
    for (var i = 0; i < principles.length; i++) {
      var p = principles[i];
      var d = (decisions || {})["p" + i] || {};
      if (d.action !== "validated") continue;
      var statement = safeText(d.knowledge_statement) || safeText(p.title);
      var reason = safeText(d.validation_reason) || "Monthly Validation에서 검증됨";
      var domain = safeText(d.domain) || "personal_growth";
      var topics = Array.isArray(d.topics) ? d.topics : [];
      var monthlyPath = pathFor(model.month);
      var input = {
        type: "knowledge_candidate",
        candidate_id: "",
        status: "saved",
        title: safeText(p.title),
        statement: statement,
        reason: reason,
        source_type: "monthly_validation",
        source_evidence_ids: p.evidence_refs || [],
        source_objects: ["[[" + monthlyPath.replace(/\.md$/i, "") + "]]"],
        source_note: "",
        application_trigger: safeText(d.application_trigger),
        application_contexts: Array.isArray(d.application_contexts) ? d.application_contexts : [],
        confidence: "inferred",
        suggested_domain: domain,
        suggested_topics: topics
      };
      try {
        var result = await candidateStore.saveCandidate(app, input);
        created.push(result);
      } catch (_e) { /* skip duplicate or invalid */ }
    }
    return created;
  }

  var api = Object.freeze({
    FOLDER: FOLDER,
    pathFor: pathFor,
    listWeeklyNotes: listWeeklyNotes,
    save: save,
    createCandidatesFromDecisions: createCandidatesFromDecisions
  });
  root.MonthlyValidationStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
