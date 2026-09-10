(function (root) {
  "use strict";

  function core() {
    if (!root.JournalPeriodCore) throw new Error("JournalPeriodCore를 먼저 불러와야 합니다.");
    return root.JournalPeriodCore;
  }

  function clean(value) { return typeof value === "string" ? value.trim() : ""; }

  function parseFrontmatter(content) {
    var match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    var data = {};
    match[1].split("\n").forEach(function (line) {
      var item = /^([a-z][a-z0-9_-]*):\s*(.*)$/i.exec(line);
      if (item) data[item[1].toLowerCase()] = item[2].trim().replace(/^['"]|['"]$/g, "");
    });
    return data;
  }

  function bodyWithoutFrontmatter(content) {
    return String(content || "").replace(/^---[\s\S]*?---\n?/, "");
  }

  function titleFromContent(content, fallback) {
    var match = bodyWithoutFrontmatter(content).match(/^#\s+(.+)$/m);
    return clean(match && match[1]) || fallback;
  }

  function isPeriodRecord(periodId, frontmatter) {
    var id = core().getPeriod(periodId).id;
    var journal = clean(frontmatter.journal).toLowerCase();
    var section = clean(frontmatter["journal-section"]).toLowerCase();
    var sections = { weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" };
    return journal === id || journal.split(/\s+/).indexOf(id) >= 0 || section === sections[id];
  }

  function keyFromFile(periodId, file, frontmatter) {
    var id = core().getPeriod(periodId).id;
    var start = clean(frontmatter["journal-start-date"] || frontmatter.date || frontmatter.created);
    if (start) return core().periodKey(id, start);
    var name = clean(file && (file.name || file.path));
    var pattern = id === "monthly" ? /(\d{4}-\d{2})/ : id === "quarterly" ? /(\d{4}-Q[1-4])/i : /(?:^|\/)(\d{4})(?:\.md)?$/i;
    var match = name.match(pattern);
    return match ? core().periodKey(id, match[1]) : "";
  }

  async function read(app, file) {
    if (app.vault.cachedRead) return app.vault.cachedRead(file);
    return app.vault.read(file);
  }

  async function listRecords(app, periodId, options) {
    if (!app || !app.vault || typeof app.vault.getMarkdownFiles !== "function") return [];
    var id = core().getPeriod(periodId).id;
    var folder = core().periodFolder(id);
    var files = app.vault.getMarkdownFiles().filter(function (file) {
      return file.extension === "md" && file.path.indexOf(folder + "/") === 0;
    });
    var records = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var cache = app.metadataCache && app.metadataCache.getFileCache(files[i]);
        var cachedFm = cache && cache.frontmatter;
        if (options && options.selectedKey && cachedFm && isPeriodRecord(id, cachedFm)) {
          var cachedKey = keyFromFile(id, files[i], cachedFm);
          if (cachedKey && cachedKey !== options.selectedKey) {
            records.push({ id: id, key: cachedKey, display: core().periodDisplay(id, cachedKey), path: files[i].path, title: files[i].basename || files[i].name, frontmatter: cachedFm });
            continue;
          }
        }
        var content = await read(app, files[i]);
        var frontmatter = parseFrontmatter(content);
        if (!isPeriodRecord(id, frontmatter)) continue;
        var key = keyFromFile(id, files[i], frontmatter);
        if (!key) continue;
        records.push(Object.freeze({
          id: id,
          key: key,
          display: core().periodDisplay(id, key),
          path: files[i].path,
          title: titleFromContent(content, files[i].name || files[i].path),
          content: content,
          frontmatter: frontmatter
        }));
      } catch (error) { throw new Error("기록 읽기 실패: " + files[i].path + ": " + error.message); }
    }
    var keys = new Set();
    records.forEach(function (record) { if (keys.has(record.key)) throw new Error("같은 기간의 기록이 여러 개입니다: " + record.key); keys.add(record.key); });
    return records.sort(function (a, b) { return b.key.localeCompare(a.key) || a.path.localeCompare(b.path); });
  }

  async function findRecord(app, periodId, key, records) {
    var id = core().getPeriod(periodId).id;
    var normalized = core().periodKey(id, key);
    var list = records || await listRecords(app, id);
    return list.find(function (record) { return record.key === normalized; }) || null;
  }

  // Narrative review is not Evidence validation. Canonical summaries stay in the
  // existing headings; human corrections and source coverage have one body copy.
  var SUMMARY = { weekly: "Weekly Summary", monthly: "Monthly Summary", quarterly: "Strategic Summary", yearly: "Identity Reflection" };
  var DIRECTION = { weekly: "Next Week Direction", monthly: "Next Month Direction", quarterly: "Next Quarter Focus", yearly: "Next Year Intent" };
  function section(content, title) {
    var escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = String(content || "").match(new RegExp("^## " + escaped + "\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))", "m"));
    return match ? match[1].trim().replace(/^\\(#+ )/gm, "$1") : "";
  }
  function putSection(content, title, value) {
    var escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("^## " + escaped + "\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))", "m");
    var body = "## " + title + "\n\n" + String(value || "").trim().replace(/^(#+ )/gm, "\\$1") + "\n\n";
    return re.test(content) ? content.replace(re, function () { return body; }) : content.trimEnd() + "\n\n" + body;
  }
  function parseObservations(text) {
    if (!text) return [];
    try { var items = JSON.parse(text); if (!Array.isArray(items) || items.some(function (item) { return !item || typeof item.kind !== "string" || typeof item.text !== "string" || !Array.isArray(item.source_paths) || item.source_paths.some(function (path) { return typeof path !== "string"; }); })) throw new Error(); return items; }
    catch (_) { throw new Error("저장된 회고 항목을 읽을 수 없습니다. 원본을 확인해 주세요."); }
  }
  function previousKey(id, key) {
    if (id !== "weekly") return core().shiftPeriod(id, key, -1);
    var start = boundsFor(id, key).start;
    return root.WeeklyFilterCore.isoWeekForDate(root.WeeklyFilterCore.shiftISODate(start, -7));
  }
  async function loadPrevious(app, id, key) {
    var previous = previousKey(id, key);
    var record = await loadNarrative(app, id, previous);
    return { key: previous, path: record.path, exists: record.exists, fields: record.fields, snapshot: record.content };
  }
  function narrative(content, id) {
    return { observations: parseObservations(section(content, "Review Observations")), revisit: section(content, "Retrospective Commentary"), moments: section(content, "Selected Moments"), watch: section(content, "What to Observe"), continue_text: section(content, "What to Continue"), stop_text: section(content, "What to Stop"), rebalance_text: section(content, "What to Rebalance"), enduring: section(content, "Enduring Principles"), direction_changes: section(content, "Direction That Changed Me"), summary: section(content, SUMMARY[id]), comment: section(content, "User Commentary"), direction: section(content, DIRECTION[id]), sources: section(content, "Review Sources"), related: section(content, "Related Records"), reviewed: section(content, "Review Acknowledgement") === "사용자가 요약과 코멘트를 검토하고 저장했습니다." };
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    var date = new Date(value + "T12:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function boundsFor(id, key) {
    if (id !== "weekly") return core().periodBounds(id, key);
    var p = root.WeeklyFilterCore.parseISOWeek(key);
    if (!p || root.WeeklyFilterCore.isoWeekForDate(root.WeeklyFilterCore.formatDate(p.start)) !== key) throw new Error("유효하지 않은 ISO 주차입니다.");
    return { start: root.WeeklyFilterCore.formatDate(p.start), end: root.WeeklyFilterCore.formatDate(p.end) };
  }
  function reviewPath(id, key) {
    if (!SUMMARY[id]) throw new Error("지원하지 않는 회고 기간입니다.");
    if (!({ weekly: /^\d{4}-W\d{2}$/, monthly: /^\d{4}-(0[1-9]|1[0-2])$/, quarterly: /^\d{4}-Q[1-4]$/, yearly: /^\d{4}$/ })[id].test(key)) throw new Error("유효하지 않은 기간입니다.");
    boundsFor(id, key);
    return id === "weekly" ? root.WeeklyReviewStore.pathForWeek(key) : core().periodPath(id, key);
  }
  async function loadNarrative(app, id, key, existingPath) {
    var path = existingPath || reviewPath(id, key), file = app.vault.getAbstractFileByPath(path);
    var content = file ? await app.vault.read(file) : "";
    var fm = parseFrontmatter(content);
    if (existingPath && existingPath !== reviewPath(id, key) && (!file || path.indexOf(core().periodFolder(id) + "/") !== 0 || keyFromFile(id, file, fm) !== core().periodKey(id, key))) throw new Error("대상 기록의 기간과 경로가 일치하지 않습니다.");
    if (file && (!isPeriodRecord(id, fm) || !new RegExp("^## " + SUMMARY[id] + "$", "m").test(content))) {
      throw new Error("기존 형식을 안전하게 편집할 수 없습니다. 원본 보기에서 확인해 주세요.");
    }
    return { path: path, content: content, exists: !!file, fields: narrative(content, id) };
  }
  async function collectReviewSources(app, id, key) {
    var bounds = boundsFor(id, key);
    var lower = { weekly: "daily", monthly: "weekly", quarterly: "monthly", yearly: "quarterly" }[id];
    var folder = "DAILY/" + lower.toUpperCase() + "/";
    var sources = [], errors = [], weeks = [], seenPaths = new Set(), seenPeriods = new Set();
    var files = app.vault.getMarkdownFiles().filter(function (f) { return f.path.indexOf(folder) === 0; });
    for (var file of files) {
      if (seenPaths.has(file.path)) continue; seenPaths.add(file.path);
      var stem = file.path.slice(folder.length).replace(/\.md$/, "");
      var range;
      try {
        if (lower === "daily") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(stem)) continue;
          range = { start: stem, end: stem };
        } else {
          var pattern = { weekly: /^\d{4}-W\d{2}$/, monthly: /^\d{4}-\d{2}$/, quarterly: /^\d{4}-Q[1-4]$/ }[lower];
          if (!pattern.test(stem)) {
            var metadata = app.metadataCache && app.metadataCache.getFileCache(file);
            var cached = metadata && metadata.frontmatter;
            if (!cached || !isPeriodRecord(lower, cached)) continue;
            if (lower === "weekly") {
              if (!cached["journal-start-date"] || !cached["journal-end-date"]) continue;
              range = { start: String(cached["journal-start-date"]), end: String(cached["journal-end-date"]) };
            } else range = boundsFor(lower, keyFromFile(lower, file, cached));
          } else range = boundsFor(lower, stem);
        }
        if (range.end < bounds.start || range.start > bounds.end) continue;
        var periodIdentity = range.start + ":" + range.end;
        if (seenPeriods.has(periodIdentity)) throw new Error("같은 기간의 참고 기록이 중복됩니다.");
        seenPeriods.add(periodIdentity);
        var content = await app.vault.read(file);
        var fm = parseFrontmatter(content), fields = lower === "daily" ? {} : narrative(content, lower);
        if (lower !== "daily") {
          var declaredStart = fm["journal-start-date"], declaredEnd = fm["journal-end-date"];
          if (!validDate(declaredStart) || !validDate(declaredEnd) || declaredStart > declaredEnd || declaredStart < range.start || declaredEnd > range.end) throw new Error("기록의 날짜 범위와 기간이 일치하지 않습니다.");
          range = { start: declaredStart, end: declaredEnd };
        }
        if (lower !== "daily" && !isPeriodRecord(lower, fm)) throw new Error("참고 기록의 기간 유형이 일치하지 않습니다.");
        var complete = fm.status === "completed";
        if (complete && lower === "monthly") complete = root.MonthlyValidationCore.classifyMonthlyRecord(root.MonthlyValidationCore.parseMonthlyNoteContent(content)) === "completed";
        var note = lower === "weekly" ? root.MonthlyValidationCore.parseWeeklyNote(content, file.path) : null;
        if (note && complete) weeks.push(note);
        var text;
        if (lower === "daily") {
          var review = root.JournalCore.extractReviewFromDaily(content, root.JournalCore.parseFrontmatter(content).data);
          text = JSON.stringify({ experience: review.reflection, change: review.change, next_experiment: review.next_experiment });
          if (!review.reflection && !review.change && !review.next_experiment) continue;
        } else {
          // A saved question-only review is useful context, never validation evidence.
          if (!complete && !fields.reviewed && !(fields.summary && (!fm.status || fm.status === "completed") && isPeriodRecord(lower, fm))) continue;
          text = JSON.stringify({ weekly_learning: lower === "weekly" ? section(content, "Key Learnings") : "", weekly_patterns: lower === "weekly" ? section(content, "Observed Patterns") : "", principle_proposals: lower === "weekly" ? section(content, "Suggested Principles") : "", evidence_references: lower === "weekly" ? section(content, "Evidence References") : "", adopted_summary: fields.summary, user_correction: fields.comment, human_direction: fields.direction, human_selections: [fields.continue_text, fields.stop_text, fields.rebalance_text, fields.watch, fields.enduring, fields.direction_changes].filter(Boolean).join("\n"), retrospective_commentary: fields.revisit, selected_moments: fields.moments, observations: fields.observations, original_coverage: fields.sources });
        }
        sources.push({ path: file.path, start: range.start, end: range.end, complete: complete, text: text, snapshot: content });
      } catch (error) { errors.push(file.path + ": " + error.message); }
    }
    var previous = null;
    try { previous = await loadPrevious(app, id, key); } catch (error) { errors.push("이전 회고 읽기 실패: " + error.message); }
    sources.sort(function (a, b) { return a.start.localeCompare(b.start); });
    var gate = id === "monthly" ? root.MonthlyValidationCore.deriveMonthlyReviewMode({ weeklyNotes: weeks, sourceErrors: errors }) : null;
    return { id: id, key: key, bounds: bounds, previous: previous, sources: sources, errors: errors, model: id === "monthly" ? root.MonthlyValidationCore.buildValidationModel(weeks, key) : null,
      mode: errors.length ? "blocked" : gate ? gate.mode : !sources.length ? "empty" : sources.some(function (s) { return !s.complete; }) && lower !== "daily" ? "partial" : "ready",
      canSave: !errors.length && (!gate || gate.can_save_new), completeCount: sources.filter(function (s) { return s.complete; }).length };
  }
  function sourceIdentity(input) {
    return JSON.stringify([input.previous ? [input.previous.path, input.previous.snapshot] : null, input.sources.map(function (s) { return [s.path, s.snapshot]; }).sort(function (a, b) { return a[0].localeCompare(b[0]); })]);
  }
  var writes = new WeakMap();
  async function saveNarrative(app, id, key, fields, expected, input) {
    var path = expected.path || reviewPath(id, key);
    await loadNarrative(app, id, key, path);
    var locks = writes.get(app); if (!locks) { locks = new Set(); writes.set(app, locks); }
    if (locks.has(path)) throw new Error("저장 중입니다.");
    locks.add(path);
    try {
      var fresh = await collectReviewSources(app, id, key);
      if (!fresh.canSave) throw new Error("참고 기록이 부족하거나 읽기 오류가 있어 저장할 수 없습니다.");
      if (sourceIdentity(fresh) !== sourceIdentity(input)) throw new Error("참고 기록이 변경되었습니다. 입력을 보존한 채 다시 읽어 주세요.");
      if (!clean(fields.summary) && !clean(fields.comment) && !clean(fields.direction) && !clean(fields.revisit) && !clean(fields.moments) && !(fields.observations || []).length) throw new Error("남길 내용을 입력해 주세요.");
      var file = app.vault.getAbstractFileByPath(path);
      var base = expected.content;
      if (!base) {
        if (id === "monthly") base = root.MonthlyValidationCore.buildMonthlyNoteContent(fresh.model, { review_mode: "question_only" });
        else if (id === "weekly") base = root.WeeklyReviewStore.renderReview({ period: { week: key, start: fresh.bounds.start, end: fresh.bounds.end } });
        else base = "---\njournal: " + id + "\njournal-section: " + (id === "quarterly" ? "quarter" : "year") + "\njournal-start-date: " + fresh.bounds.start + "\njournal-end-date: " + fresh.bounds.end + "\ntype: journal\nstatus: draft\n---\n# " + key + "\n";
        if (id !== "monthly") base = base.replace(/^status: .*$/m, "status: " + (fresh.mode === "ready" ? "completed" : "draft"));
      }
      if (id !== "monthly" && fresh.mode === "ready" && /^status: draft$/m.test(base)) base = base.replace(/^status: draft$/m, "status: completed");
      var next = putSection(base, SUMMARY[id], fields.summary);
      if (fields.observations !== undefined) {
        var observations = parseObservations(JSON.stringify(fields.observations));
        next = putSection(next, "Review Observations", JSON.stringify(observations));
      }
      [ ["revisit", "Retrospective Commentary"], ["moments", "Selected Moments"], ["watch", "What to Observe"] ].forEach(function (entry) {
        if (fields[entry[0]] !== undefined) next = putSection(next, entry[1], fields[entry[0]]);
      });
      next = putSection(next, "User Commentary", fields.comment);
      var extra = id === "quarterly" ? { continue_text: "What to Continue", stop_text: "What to Stop", rebalance_text: "What to Rebalance" } : id === "yearly" ? { enduring: "Enduring Principles", direction_changes: "Direction That Changed Me" } : {};
      Object.keys(extra).forEach(function (field) { if (fields[field] !== undefined) next = putSection(next, extra[field], fields[field]); });
      next = putSection(next, DIRECTION[id], fields.direction);
      next = putSection(next, "Review Sources", fresh.sources.map(function (s) { return "- [[" + s.path.replace(/\.md$/, "") + "]] · " + s.start + " ~ " + s.end + (s.complete ? " · 완료 기록" : " · 참고 기록 (검증 근거 아님)"); }).join("\n"));
      next = putSection(next, "Related Records", fields.related || "");
      next = putSection(next, "Review Acknowledgement", "사용자가 요약과 코멘트를 검토하고 저장했습니다.");
      if (file) {
        if (!app.vault.process) throw new Error("안전한 원자 저장을 사용할 수 없습니다.");
        await app.vault.process(file, function (current) {
          if (current !== expected.content) throw new Error("대상 기록이 변경되었습니다. 원본을 확인해 주세요.");
          return next;
        });
      } else {
        if (expected.exists) throw new Error("대상 기록이 삭제되었습니다.");
        var folder = path.slice(0, path.lastIndexOf("/"));
        if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
        await app.vault.create(path, next);
      }
      return { path: path, content: next, exists: true, fields: narrative(next, id) };
    } finally { locks.delete(path); }
  }

  var api = Object.freeze({
    section, putSection, narrative, loadPrevious, previousKey, boundsFor, reviewPath, loadNarrative, collectReviewSources, sourceIdentity, saveNarrative,
    parseFrontmatter: parseFrontmatter,
    isPeriodRecord: isPeriodRecord,
    keyFromFile: keyFromFile,
    listRecords: listRecords,
    findRecord: findRecord
  });
  root.JournalPeriodStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
