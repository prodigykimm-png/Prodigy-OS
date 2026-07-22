(function (root) {
  "use strict";

  var FOLDER = "DAILY/WEEKLY";

  function safeText(value) { return String(value || "").trim(); }

  function pathFor(review) {
    var week = review && review.period && safeText(review.period.week);
    if (!/^\d{4}-W\d{2}$/.test(week)) throw new Error("저장할 주차 정보가 없습니다.");
    return FOLDER + "/" + week + ".md";
  }

  function list(items, mapper) {
    var values = Array.isArray(items) ? items : [];
    return values.length ? values.map(mapper).join("\n") : "- 없음";
  }

  function section(title, body) {
    return "## " + title + "\n\n" + body + "\n";
  }

  function renderReview(review) {
    var period = review.period || {};
   var lines = [
     "---",
     "journal: weekly",
     "journal-start-date: " + safeText(period.start),
     "journal-end-date: " + safeText(period.end),
     "journal-section: week",
     "type: journal",
     "status: completed",
     "---",
      "# " + safeText(period.week),
      "",
      "> " + safeText(review.question)
    ];
    lines.push("", section("Weekly Summary", safeText(review.summary) || "기록 없음").trimEnd());
    lines.push("", section("Key Learnings", list(review.key_learnings, function (item) {
      return "- **Pattern**: " + safeText(item.pattern) + "\n  - **Learning**: " + safeText(item.learning) + "\n  - **Evidence**: " + list(item.evidence_refs, function (ref) { return ref; }).replace(/\n/g, ", ");
    })).trimEnd());
    lines.push("", section("Observed Patterns", list(review.findings, function (item) {
      return "- " + safeText(item.pattern || item.title) + "\n  - **Learning**: " + safeText(item.learning) + "\n  - **Evidence**: " + list(item.evidence_refs, function (ref) { return ref; }).replace(/\n/g, ", ");
    })).trimEnd());
    lines.push("", section("Meaningful Changes", list(review.meaningful_changes, function (item) { return "- " + safeText(item.reason || item.title); })).trimEnd());
    lines.push("", section("Experiments", list(review.experiments, function (item) { return "- " + safeText(item.description || item.title); })).trimEnd());
    lines.push("", section("Suggested Principles", list(review.suggested_principles, function (item) {
      return "- [ ] " + safeText(item.title || item.statement) + "\n  - 상태: pending\n  - Evidence: " + list(item.evidence_refs, function (ref) { return ref; }).replace(/\n/g, ", ");
    })).trimEnd());
    var direction = review.next_week_direction || {};
    lines.push("", section("Next Week Direction", [
      "### Continue\n" + list(direction.continue_items, function (item) { return "- " + safeText(item); }),
      "### Observe\n" + list(direction.observe_items, function (item) { return "- " + safeText(item); }),
      "### Increase Attention\n" + list(direction.increase_attention, function (item) { return "- " + safeText(item); }),
      "### Pending\n" + list(direction.pending_items, function (item) { return "- " + safeText(item); })
    ].join("\n\n")).trimEnd());
    lines.push("", section("Evidence References", list(review.references, function (item) { return "- " + safeText(item); })).trimEnd(), "");
    return lines.join("\n");
  }

  async function ensureFolder(app) {
    if (!app || !app.vault) throw new Error("Vault를 사용할 수 없습니다.");
    if (app.vault.getAbstractFileByPath(FOLDER)) return;
    await app.vault.createFolder(FOLDER);
  }

  async function save(app, review) {
    var path = pathFor(review);
    var body = renderReview(review);
    await ensureFolder(app);
    var file = app.vault.getAbstractFileByPath(path);
    if (file) {
      await app.vault.modify(file, body);
      return Object.freeze({ path: path, created: false });
    }
    await app.vault.create(path, body);
    return Object.freeze({ path: path, created: true });
  }

  var api = Object.freeze({ FOLDER: FOLDER, pathFor: pathFor, renderReview: renderReview, save: save });
  root.WeeklyReviewStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
