(function (root) {
  "use strict";

  function safeText(value) { return typeof value === "string" ? value.trim() : ""; }

  function getMonthDateRange(month) {
    var value = safeText(month);
    var match = /^(\d{4})-(\d{2})$/.exec(value);
    var monthNumber = match ? parseInt(match[2], 10) : 0;
    if (!match || monthNumber < 1 || monthNumber > 12) throw new Error("유효하지 않은 월 형식입니다. YYYY-MM 형식이 필요합니다.");
    var endDate = new Date(Date.UTC(parseInt(match[1], 10), monthNumber, 0));
    return {
      start: value + "-01",
      end: match[1] + "-" + String(monthNumber).padStart(2, "0") + "-" + String(endDate.getUTCDate()).padStart(2, "0")
    };
  }

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
    var completed = String(fm.status || "").toLowerCase() === "completed";
    var legacy = !fm.status && !fm.type && Boolean(fm["journal-start-date"]);
    if (!completed && !legacy) return null;
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

  function deriveMonthlyReviewMode(options) {
    var opts = options || {};
    var completed = Array.isArray(opts.weeklyNotes) ? opts.weeklyNotes.filter(function (note) { return note; }) : [];
    var readiness = opts.readiness || checkReadiness(completed);
    var sourceErrors = Array.isArray(opts.sourceErrors) ? opts.sourceErrors.filter(function (error) { return safeText(error); }) : [];
    var weeklyCount = completed.length || Number(readiness.weekly_count) || 0;
    var mode = "validation";
    var reasons = [];
    if (sourceErrors.length) {
      mode = "blocked";
      reasons = sourceErrors.map(function (error) { return safeText(error); });
    } else if (weeklyCount < 1) {
      mode = "blocked";
      reasons = ["검토할 수 있는 완료 Weekly가 없습니다."];
    } else if (!readiness.ready) {
      mode = "question_only";
      reasons = [readiness.reason || "반복 Principle 검증 전 관찰 단계입니다."];
    }
    return {
      mode: mode,
      reasons: reasons,
      can_save_new: mode !== "blocked",
      can_validate_principles: mode === "validation"
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

  function assignMonthlyPrincipleRefs(model) {
    var month = safeText(model && model.month);
    var eligibleIndex = 0;
    return (model && model.principles || []).filter(function (p) { return p && p.eligible; }).map(function (p) {
      eligibleIndex += 1;
      return { principle: p, principle_ref: "monthly-" + month + "-p" + String(eligibleIndex).padStart(3, "0") };
    });
  }

  function evidenceProjection(item) {
    var source = item || {};
    return {
      evidence_id: safeText(source.evidence_id),
      date: safeText(source.date),
      context: safeText(source.context),
      experience: safeText(source.experience),
      interpretation: safeText(source.interpretation),
      change: safeText(source.change),
      next_experiment: safeText(source.next_experiment)
    };
  }

  function buildMonthlyAIContext(model, evidence, options) {
    var opts = options || {};
    var boundedEvidence = (Array.isArray(evidence) ? evidence : []).map(evidenceProjection);
    var allowed = {};
    boundedEvidence.forEach(function (item) { if (item.evidence_id) allowed[item.evidence_id] = true; });
    var coverage = {};
    (opts.excluded_ref_counts || []).forEach(function (item) {
      if (item && item.principle_ref) coverage[item.principle_ref] = Number(item.excluded_ref_count) || 0;
    });
    var principles = assignMonthlyPrincipleRefs(model).map(function (entry) {
      var refs = Array.isArray(entry.principle.evidence_refs) ? entry.principle.evidence_refs : [];
      var supporting = [];
      refs.forEach(function (ref) {
        var value = safeText(ref);
        if (value && allowed[value] && supporting.indexOf(value) === -1) supporting.push(value);
      });
      var excluded = refs.filter(function (ref) { return !allowed[safeText(ref)]; }).length;
      return {
        principle_ref: entry.principle_ref,
        title: safeText(entry.principle.title),
        weeks: Array.isArray(entry.principle.weeks) ? entry.principle.weeks.slice() : [],
        supporting_evidence_refs: supporting,
        excluded_ref_count: coverage[entry.principle_ref] !== undefined ? coverage[entry.principle_ref] : excluded
      };
    });
    return {
      schema_version: "1.0",
      month: safeText(model && model.month),
      readiness: {
        weekly_count: Number(model && model.readiness && model.readiness.weekly_count) || 0,
        eligible_principles: Number(model && model.readiness && model.readiness.eligible_principles) || 0
      },
      principles: principles.map(function (item) {
        return {
          principle_ref: item.principle_ref,
          title: item.title,
          weeks: item.weeks,
          supporting_evidence_refs: item.supporting_evidence_refs
        };
      }),
      evidence: boundedEvidence,
      coverage_warnings: principles.filter(function (item) { return item.excluded_ref_count > 0; }).map(function (item) {
        return { principle_ref: item.principle_ref, excluded_ref_count: item.excluded_ref_count };
      })
    };
  }

  function monthlySections(body) {
    var sections = {};
    var current = "";
    String(body || "").split("\n").forEach(function (line) {
      var heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading) {
        current = heading[1].trim();
        sections[current] = [];
      } else if (current) {
        sections[current].push(line);
      }
    });
    Object.keys(sections).forEach(function (key) { sections[key] = sections[key].join("\n").trim(); });
    return sections;
  }

  function unrecognizedMonthlyNote() {
    return { format: "legacy_or_unrecognized", summary: "", reviewed_weekly_paths: [], principles: [], next_direction: "" };
  }

  function parseMonthlyNoteContent(markdown) {
    var text = String(markdown || "");
    var fm = parseFrontmatter(text);
    var body = text.replace(/^---[\s\S]*?---\n?/, "");
    var sections = monthlySections(body);
    var required = ["Monthly Summary", "Reviewed Weekly Learnings", "Principle Validation", "Rejected or Deferred Principles", "Next Month Direction"];
    if (fm.journal !== "monthly" || fm["journal-section"] !== "month" || required.some(function (name) { return sections[name] === undefined; })) return unrecognizedMonthlyNote();

    var summary = sections["Monthly Summary"] === "기록 없음" ? "" : sections["Monthly Summary"];
    var reviewed = sections["Reviewed Weekly Learnings"].split("\n").map(function (line) {
      var match = /^-\s+(.+?)\s*$/.exec(line.trim());
      return match ? match[1].trim() : "";
    }).filter(function (path) { return path && path !== "기록 없음"; });
    var validationLines = sections["Principle Validation"].split("\n");
    var principles = [];
    var current = null;
    var candidateHeading = false;
    var invalid = false;
    function finishCurrent() {
      if (!current) return;
      if (!current.decision) invalid = true;
      principles.push(current);
      current = null;
    }
    validationLines.forEach(function (line) {
      var heading = /^###\s+(.+?)\s*$/.exec(line);
      if (heading) {
        finishCurrent();
        candidateHeading = heading[1].trim() === "Knowledge Candidate Decision";
        if (!candidateHeading) current = { title: heading[1].trim(), decision: "", evidence_refs: [], reason: "", knowledge_statement: "" };
        return;
      }
      if (!line.trim()) return;
      if (candidateHeading) return;
      if (!current) { invalid = true; return; }
      var weeks = /^-\s+반복 주차:\s*(.*)$/.exec(line.trim());
      var refs = /^-\s+Evidence:\s*(.*)$/.exec(line.trim());
      var decision = /^-\s+결정:\s*\*\*(validated|rejected|deferred|pending)\*\*\s*$/.exec(line.trim());
      var statement = /^-\s+지식 문장:\s*(.*)$/.exec(line.trim());
      var reason = /^-\s+검증 사유:\s*(.*)$/.exec(line.trim());
      if (weeks) return;
      if (refs) {
        current.evidence_refs = refs[1].trim() === "없음" ? [] : refs[1].split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        return;
      }
      if (decision) { current.decision = decision[1]; return; }
      if (statement) { current.knowledge_statement = statement[1].trim(); return; }
      if (reason) { current.reason = reason[1].trim(); return; }
      invalid = true;
    });
    finishCurrent();
    var rejectedReasons = {};
    sections["Rejected or Deferred Principles"].split("\n").forEach(function (line) {
      var item = /^-\s+\*\*(.+?)\*\*\s+→\s+(rejected|deferred)(?:\s*:\s*(.*))?$/.exec(line.trim());
      if (item) { rejectedReasons[item[1].trim()] = item[3] ? item[3].trim() : ""; return; }
      if (line.trim() && line.trim() !== "- 없음") invalid = true;
    });
    principles.forEach(function (principle) {
      if ((principle.decision === "rejected" || principle.decision === "deferred") && rejectedReasons[principle.title] !== undefined) {
        principle.reason = rejectedReasons[principle.title];
      }
      delete principle.weeks;
    });
    var direction = sections["Next Month Direction"] === "- 기록 없음" ? "" : sections["Next Month Direction"];
    if (!candidateHeading || invalid) return unrecognizedMonthlyNote();
    return { format: "canonical", status: safeText(fm.status).toLowerCase() || "completed", summary: summary, reviewed_weekly_paths: reviewed, principles: principles, next_direction: direction };
  }

  function classifyMonthlyRecord(parsedRecord) {
    var parsed = parsedRecord || {};
    if (parsed.format !== "canonical") return "unrecognized";
    return (parsed.principles || []).some(function (principle) {
      return ["validated", "rejected", "deferred"].indexOf(safeText(principle && principle.decision).toLowerCase()) !== -1;
    }) ? "completed" : "partial";
  }

  function buildMonthlyNoteContent(model, decisions) {
    var dec = decisions || {};
    var dateRange = getMonthDateRange(model.month);
    var reviewMode = safeText(dec.review_mode) || (model.readiness && model.readiness.ready ? "validation" : "question_only");
    var lines = [
      "---",
      "journal: monthly",
      "journal-start-date: " + safeText(model.month) + "-01",
      "journal-end-date: " + dateRange.end,
      "journal-section: month",
      "type: journal",
      "status: " + (reviewMode === "validation" ? "completed" : "draft"),
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
      var action = reviewMode === "validation" ? (d.action || "pending") : "pending";
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
    deriveMonthlyReviewMode: deriveMonthlyReviewMode,
    classifyMonthlyRecord: classifyMonthlyRecord,
    buildValidationModel: buildValidationModel,
    getMonthDateRange: getMonthDateRange,
    assignMonthlyPrincipleRefs: assignMonthlyPrincipleRefs,
    buildMonthlyAIContext: buildMonthlyAIContext,
    buildMonthlyNoteContent: buildMonthlyNoteContent,
    parseMonthlyNoteContent: parseMonthlyNoteContent
  });
  root.MonthlyValidationCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
