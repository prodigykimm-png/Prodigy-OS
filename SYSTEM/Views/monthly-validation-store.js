(function (root) {
  "use strict";

  var FOLDER = "DAILY/MONTHLY";
  var DAILY_FOLDER = "DAILY/DAILY";
  var WEEKLY_FOLDER = "DAILY/WEEKLY";

  function safeText(value) { return typeof value === "string" ? value.trim() : ""; }

  function normalizeMtime(value) {
    if (value === null || value === undefined || value === "") return null;
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function fileMtime(file) {
    if (!file) return null;
    if (file.source_mtime !== undefined) return normalizeMtime(file.source_mtime);
    if (file.stat && file.stat.mtime !== undefined) return normalizeMtime(file.stat.mtime);
    return normalizeMtime(file.mtime);
  }

  function sourceSnapshot(file) {
    return { path: file.path, mtime: fileMtime(file) };
  }

  function errorWithCode(code, message, details) {
    var error = new Error(message);
    error.code = code;
    if (details) Object.assign(error, details);
    return error;
  }

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
      return f.path.indexOf(WEEKLY_FOLDER + "/") === 0 && f.extension === "md";
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
          var range = core.getMonthDateRange ? core.getMonthDateRange(monthPrefix) : { start: monthPrefix + "-01", end: monthPrefix + "-31" };
          var mStart = range.start;
          var mEnd = range.end;
          if (weekEnd < mStart || weekStart > mEnd) continue;
        }
        note.source_mtime = fileMtime(weeklyFiles[i]);
        results.push(note);
      } catch (_e) { /* skip unreadable */ }
    }
    return results.sort(function (a, b) { return a.week.localeCompare(b.week); });
  }

  async function listMonthlyDailyEvidence(app, monthPrefix) {
    var weeklyCore = root.WeeklyFilterCore;
    if (!weeklyCore || typeof weeklyCore.parseDailyEvidenceBlocks !== "function") throw new Error("WeeklyFilterCore를 먼저 불러와야 합니다.");
    var month = safeText(monthPrefix);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("유효하지 않은 월 형식입니다. YYYY-MM 형식이 필요합니다.");
    var files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
    var dailyFiles = files.filter(function (file) {
      var name = file.name || file.path.split("/").pop();
      var date = name.replace(/\.md$/i, "");
      return file.path.indexOf(DAILY_FOLDER + "/") === 0 && file.extension === "md" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 7) === month;
    }).sort(function (a, b) { return a.path.localeCompare(b.path); });
    var evidence = [];
    var snapshots = [];
    var warnings = { read_errors: 0 };
    var seen = {};
    for (var i = 0; i < dailyFiles.length; i++) {
      var file = dailyFiles[i];
      var day = (file.name || file.path.split("/").pop()).replace(/\.md$/i, "");
      snapshots.push(sourceSnapshot(file));
      try {
        var content = await app.vault.read(file);
        var blocks = weeklyCore.parseDailyEvidenceBlocks(content, day) || [];
        blocks.forEach(function (block) {
          var id = safeText(block.evidence_id);
          if (!id) return;
          if (seen[id] && seen[id] !== file.path) throw errorWithCode("DUPLICATE_EVIDENCE_ID", "Evidence ID가 여러 Daily 파일에서 발견되었습니다: " + id, { evidence_id: id });
          seen[id] = file.path;
          evidence.push({
            evidence_id: id,
            date: day,
            context: safeText(block.context),
            experience: safeText(block.experience),
            interpretation: safeText(block.interpretation),
            change: safeText(block.change),
            next_experiment: safeText(block.next_experiment)
          });
        });
      } catch (error) {
        if (error && error.code === "DUPLICATE_EVIDENCE_ID") {
          error.source_snapshots = snapshots.slice();
          throw error;
        }
        warnings.read_errors += 1;
      }
    }
    return { evidence: evidence, source_snapshots: snapshots, warnings: warnings };
  }

  function classifyReference(ref, month, allowed) {
    var value = safeText(ref);
    if (allowed[value]) return "allowed";
    var match = /^daily-(\d{4}-\d{2}-\d{2})-e\d{2,}$/i.exec(value);
    if (match && match[1].slice(0, 7) !== month) return "adjacent_month";
    return "foreign_or_missing";
  }

  async function collectMonthlyAIInputs(app, monthPrefix) {
    var core = root.MonthlyValidationCore;
    if (!core) throw new Error("MonthlyValidationCore를 먼저 불러와야 합니다.");
    var month = safeText(monthPrefix);
    var weeklyNotes = await listWeeklyNotes(app, month);
    var model = core.buildValidationModel(weeklyNotes, month);
    var duplicateError = null;
    var dailyResult;
    try {
      dailyResult = await listMonthlyDailyEvidence(app, month);
    } catch (error) {
      if (!error || error.code !== "DUPLICATE_EVIDENCE_ID") throw error;
      duplicateError = error;
      dailyResult = { evidence: [], source_snapshots: error.source_snapshots || [], warnings: { read_errors: 0 } };
    }
    var allowed = {};
    dailyResult.evidence.forEach(function (item) { allowed[item.evidence_id] = true; });
    var excludedRefCounts = [];
    core.assignMonthlyPrincipleRefs(model).forEach(function (entry) {
      var counts = { adjacent_month: 0, foreign_or_missing: 0 };
      (entry.principle.evidence_refs || []).forEach(function (ref) {
        var classification = classifyReference(ref, month, allowed);
        if (classification !== "allowed") counts[classification] += 1;
      });
      var excluded = counts.adjacent_month + counts.foreign_or_missing;
      if (excluded) excludedRefCounts.push({ principle_ref: entry.principle_ref, excluded_ref_count: excluded, adjacent_month: counts.adjacent_month, foreign_or_missing: counts.foreign_or_missing });
    });
    var context = core.buildMonthlyAIContext(model, dailyResult.evidence, { excluded_ref_counts: excludedRefCounts });
    return {
      model: model,
      weekly_notes: weeklyNotes,
      daily_evidence: dailyResult.evidence,
      context: context,
      source_snapshots: { daily: dailyResult.source_snapshots, weekly: weeklyNotes.map(sourceSnapshot) },
      warnings: { read_errors: dailyResult.warnings.read_errors, coverage: excludedRefCounts, duplicate_evidence_id: duplicateError ? duplicateError.evidence_id : "" },
      ai_disabled_reason: duplicateError ? "Evidence ID 충돌로 AI 검증 보조를 사용할 수 없습니다." : ""
    };
  }

  async function captureMonthlySourceSnapshot(app, monthPrefix) {
    var weeklyNotes = await listWeeklyNotes(app, monthPrefix);
    var daily = await listMonthlyDailyEvidence(app, monthPrefix);
    return { daily: daily.source_snapshots, weekly: weeklyNotes.map(sourceSnapshot) };
  }

  function sameSnapshots(left, right) {
    function normalize(items) {
      return (items || []).map(function (item) { return { path: item.path, mtime: normalizeMtime(item.mtime) }; }).sort(function (a, b) { return a.path.localeCompare(b.path); });
    }
    return JSON.stringify(normalize(left && left.daily)) === JSON.stringify(normalize(right && right.daily))
      && JSON.stringify(normalize(left && left.weekly)) === JSON.stringify(normalize(right && right.weekly));
  }

  async function sourceSnapshotChanged(app, monthPrefix, expected) {
    var current = await captureMonthlySourceSnapshot(app, monthPrefix);
    return { changed: !sameSnapshots(current, expected), current: current };
  }

  async function readMonthlySnapshot(app, month) {
    var path = pathFor(month);
    var file = app && app.vault && app.vault.getAbstractFileByPath(path);
    if (!file) return { exists: false, path: path, content: "", mtime: null };
    return { exists: true, path: path, content: await app.vault.read(file), mtime: fileMtime(file) };
  }

  async function saveWithMtimeGuard(app, month, content, options) {
    var opts = options || {};
    var expectedProvided = Object.prototype.hasOwnProperty.call(opts, "expected_mtime");
    var expected = expectedProvided ? normalizeMtime(opts.expected_mtime) : null;
    var current = await readMonthlySnapshot(app, month);
    var matches = current.exists ? expectedProvided && expected !== null && current.mtime === expected : expected === null;
    if (!matches && opts.allow_replace !== true) {
      return { ok: false, conflict: true, code: "MTIME_CONFLICT", path: current.path, expected_mtime: expected, current_mtime: current.mtime, current_exists: current.exists };
    }
    var path = current.path;
    var body = safeText(content);
    if (!body) throw new Error("저장할 내용이 없습니다.");
    await ensureFolder(app);
    var file = app.vault.getAbstractFileByPath(path);
    var created = !file;
    if (file) await app.vault.modify(file, body);
    else await app.vault.create(path, body);
    var after = await readMonthlySnapshot(app, month);
    return { ok: true, conflict: false, path: path, created: created, new_mtime: after.mtime, mtime: after.mtime };
  }

  async function save(app, month, content) {
    var snapshot = await readMonthlySnapshot(app, month);
    var result = await saveWithMtimeGuard(app, month, content, { expected_mtime: snapshot.mtime });
    if (!result.ok) throw errorWithCode("MTIME_CONFLICT", "월간 기록이 다른 곳에서 변경되었습니다.", result);
    return Object.freeze(result);
  }

  async function createCandidatesFromDecisions(app, model, decisions) {
    if (decisions && decisions.reviewMode && decisions.reviewMode !== "validation") return [];
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
    listMonthlyDailyEvidence: listMonthlyDailyEvidence,
    collectMonthlyAIInputs: collectMonthlyAIInputs,
    captureMonthlySourceSnapshot: captureMonthlySourceSnapshot,
    sourceSnapshotChanged: sourceSnapshotChanged,
    readMonthlySnapshot: readMonthlySnapshot,
    saveWithMtimeGuard: saveWithMtimeGuard,
    save: save,
    createCandidatesFromDecisions: createCandidatesFromDecisions
  });
  root.MonthlyValidationStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
