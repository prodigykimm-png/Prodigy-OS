(function (root) {
  "use strict";

  var FOLDER = "DAILY/WEEKLY";

  function safeText(value) { return String(value || "").trim(); }

  function pathFor(review) {
    var week = review && review.period && safeText(review.period.week);
    return pathForWeek(week);
  }

  function pathForWeek(week) {
    var value = safeText(week);
    if (!/^\d{4}-W\d{2}$/.test(value)) throw new Error("저장할 주차 정보가 없습니다.");
    return FOLDER + "/" + value + ".md";
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

  function sectionBody(content, title) {
    var escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = bodyWithoutFrontmatter(content).match(new RegExp("^##\\s+" + escaped + "\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))", "im"));
    return match ? match[1].trim() : "";
  }

  function subsectionBody(content, title) {
    var escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = String(content || "").match(new RegExp("^###\\s+" + escaped + "\\s*\\n([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))", "im"));
    return match ? match[1].trim() : "";
  }

  function listItems(body) {
    return String(body || "").split("\n").reduce(function (items, line) {
      var match = line.match(/^-\s+(.*)$/);
      if (!match) return items;
      var value = safeText(match[1]);
      if (value && value !== "없음") items.push(value);
      return items;
    }, []);
  }

  function evidenceRefs(value) {
    var text = safeText(value);
    if (!text || text === "없음") return [];
    return text.split(/\s*,\s*/).map(safeText).filter(Boolean);
  }

  function parseKeyLearnings(body) {
    var entries = [];
    var current = null;
    String(body || "").split("\n").forEach(function (line) {
      var pattern = line.match(/^-\s+\*\*Pattern\*\*:\s*(.*)$/);
      if (pattern) {
        if (current) entries.push(current);
        current = { pattern: safeText(pattern[1]), learning: "", evidence_refs: [] };
        return;
      }
      if (!current) return;
      var learning = line.match(/^\s+-\s+\*\*Learning\*\*:\s*(.*)$/);
      if (learning) current.learning = safeText(learning[1]);
      var refs = line.match(/^\s+-\s+\*\*Evidence\*\*:\s*(.*)$/);
      if (refs) current.evidence_refs = evidenceRefs(refs[1]);
    });
    if (current) entries.push(current);
    return entries;
  }

  function parseFindings(body) {
    var entries = [];
    var current = null;
    String(body || "").split("\n").forEach(function (line) {
      var title = line.match(/^-\s+(?!\*\*|\[)(.*)$/);
      if (title) {
        var value = safeText(title[1]);
        if (!value || value === "없음") return;
        if (current) entries.push(current);
        current = { title: value, pattern: value, learning: "", evidence_refs: [] };
        return;
      }
      if (!current) return;
      var learning = line.match(/^\s+-\s+\*\*Learning\*\*:\s*(.*)$/);
      if (learning) current.learning = safeText(learning[1]);
      var refs = line.match(/^\s+-\s+\*\*Evidence\*\*:\s*(.*)$/);
      if (refs) current.evidence_refs = evidenceRefs(refs[1]);
    });
    if (current) entries.push(current);
    return entries;
  }

  function parsePrinciples(body, week) {
    var entries = [];
    var current = null;
    String(body || "").split("\n").forEach(function (line) {
      var title = line.match(/^-\s+\[ \]\s+(.*)$/);
      if (title) {
        if (current) entries.push(current);
        var value = safeText(title[1]);
        current = {
          proposal_id: "principle-" + week + "-" + String(entries.length + 1).padStart(3, "0"),
          title: value,
          statement: value,
          reason: "",
          evidence_refs: [],
          evidence_strength: "limited",
          decision: "pending",
          applied: false
        };
        return;
      }
      if (!current) return;
      var refs = line.match(/^\s+-\s+Evidence:\s*(.*)$/i);
      if (refs) current.evidence_refs = evidenceRefs(refs[1]);
      var status = line.match(/^\s+-\s+상태:\s*(.*)$/);
      if (status) current.decision = safeText(status[1]).toLowerCase() || "pending";
    });
    if (current) entries.push(current);
    return entries;
  }

  function parseReviewContent(content, week) {
    var frontmatter = parseFrontmatter(content);
    if (frontmatter.journal !== "weekly" || frontmatter["journal-section"] !== "week") return null;
    var summary = sectionBody(content, "Weekly Summary");
    var directionBody = sectionBody(content, "Next Week Direction");
    if (!summary || !directionBody) return null;
    var body = bodyWithoutFrontmatter(content);
    var questionMatch = body.match(/^>\s*(.*)$/m);
    var normalizedWeek = safeText(week);
    return {
      schema_version: "2.0",
      review_id: "weekly-review-" + normalizedWeek,
      review_type: "learning",
      question: safeText(questionMatch && questionMatch[1]),
      period: {
        start: safeText(frontmatter["journal-start-date"]),
        end: safeText(frontmatter["journal-end-date"]),
        week: normalizedWeek
      },
      summary: summary,
      key_learnings: parseKeyLearnings(sectionBody(content, "Key Learnings")),
      findings: parseFindings(sectionBody(content, "Observed Patterns")),
      meaningful_changes: listItems(sectionBody(content, "Meaningful Changes")).map(function (reason) { return { reason: reason, title: reason }; }),
      experiments: listItems(sectionBody(content, "Experiments")).map(function (description) { return { description: description, title: description }; }),
      suggested_principles: parsePrinciples(sectionBody(content, "Suggested Principles"), normalizedWeek),
      next_week_direction: {
        continue_items: listItems(subsectionBody(directionBody, "Continue")),
        observe_items: listItems(subsectionBody(directionBody, "Observe")),
        increase_attention: listItems(subsectionBody(directionBody, "Increase Attention")),
        pending_items: listItems(subsectionBody(directionBody, "Pending"))
      },
      limitations: [],
      references: listItems(sectionBody(content, "Evidence References"))
    };
  }

  async function ensureFolder(app) {
    if (!app || !app.vault) throw new Error("Vault를 사용할 수 없습니다.");
    var current = "";
    var parts = FOLDER.split("/");
    for (var i = 0; i < parts.length; i++) {
      current = current ? current + "/" + parts[i] : parts[i];
      if (app.vault.getAbstractFileByPath(current)) continue;
      try {
        await app.vault.createFolder(current);
      } catch (error) {
        if (!app.vault.getAbstractFileByPath(current)) throw error;
      }
    }
  }

  async function read(app, week) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") return null;
    var path = pathForWeek(week);
    var file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    var content = app.vault.cachedRead ? await app.vault.cachedRead(file) : await app.vault.read(file);
    return parseReviewContent(content, week);
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

  var api = Object.freeze({
    FOLDER: FOLDER,
    pathFor: pathFor,
    pathForWeek: pathForWeek,
    parseReviewContent: parseReviewContent,
    read: read,
    renderReview: renderReview,
    save: save
  });
  root.WeeklyReviewStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
