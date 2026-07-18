(function (root) {
  "use strict";

  function getTodayIsoDate(now) {
    const date = now || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getYesterdayIsoDate(now) {
    const base = now ? new Date(now.getTime()) : new Date();
    base.setDate(base.getDate() - 1);
    return getTodayIsoDate(base);
  }

  function truncateText(value, maxLen) {
    const text = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
    if (!text) return "";
    const limit = maxLen || 100;
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  }

  function extractFrontmatterScalar(text, key) {
    if (!text || !text.startsWith("---")) return "";
    const end = text.indexOf("\n---", 3);
    if (end === -1) return "";
    const raw = text.slice(3, end);
    const match = raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    if (!match) return "";
    let value = String(match[1] || "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }

  /** Prefer frontmatter (Journal UI) then body sections. */
  function extractDailyReviewFields(text) {
    const sections = parseReflectionSections(text || "");
    const reflection = extractFrontmatterScalar(text, "reflection") || sections.reflection || "";
    const change = extractFrontmatterScalar(text, "change") || sections.change || "";
    const nextExperiment =
      extractFrontmatterScalar(text, "next_experiment") || sections.nextExperiment || "";
    return {
      reflection: reflection.trim(),
      change: change.trim(),
      next_experiment: nextExperiment.trim()
    };
  }

  function getDaypart(hours) {
    if (hours >= 5 && hours < 12) return "morning";
    if (hours >= 12 && hours < 18) return "afternoon";
    return "evening";
  }

  function getWeekId(dateObj) {
    if (typeof window !== "undefined" && window.moment) {
      return window.moment(dateObj).format("YYYY-[W]WW");
    }
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  async function readVaultFile(app, path) {
    if (!app || !app.vault || !app.vault.getAbstractFileByPath) return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    return await app.vault.read(file);
  }

  async function readVaultJson(app, path) {
    try {
      const text = await readVaultFile(app, path);
      return text ? JSON.parse(text) : null;
    } catch (_e) {
      return null;
    }
  }

  function getMtimeMillis(fileObj) {
    if (!fileObj || !fileObj.mtime) return 0;
    if (typeof fileObj.mtime.toMillis === "function") {
      try {
        return fileObj.mtime.toMillis();
      } catch (_e) {}
    }
    if (typeof fileObj.mtime.toMillis === "number") {
      return fileObj.mtime.toMillis;
    }
    if (typeof fileObj.mtime === "number") {
      return fileObj.mtime;
    }
    try {
      if (fileObj.mtime.ts) return fileObj.mtime.ts;
      return new Date(fileObj.mtime).getTime() || 0;
    } catch (_e) {
      return 0;
    }
  }

  function formatDateToString(dt) {
    if (!dt) return "";
    if (typeof dt === "string") return dt;
    if (typeof dt.toISODate === "function") {
      try {
        return dt.toISODate();
      } catch (_e) {}
    }
    if (typeof dt.toISOString === "function") {
      try {
        return dt.toISOString().slice(0, 10);
      } catch (_e) {}
    }
    if (dt.year && dt.month && dt.day) {
      return `${dt.year}-${String(dt.month).padStart(2, "0")}-${String(dt.day).padStart(2, "0")}`;
    }
    return String(dt);
  }

  function parseReflectionSections(text) {
    if (!text) return { reflection: "", change: "", nextExperiment: "" };
    const cleanText = text.replace(/\r\n/g, "\n");
    const getSection = (titleRegex) => {
      const match = cleanText.match(new RegExp(`##\\s*${titleRegex}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|\\n#|$)`));
      if (!match) return "";
      return match[1].replace(/^\*.*?\*\s*\n?/g, "").trim(); // strip helper instruction lines
    };
    return {
      reflection: getSection("(?:성찰|Reflection)"),
      change: getSection("(?:변화|Change)"),
      nextExperiment: getSection("(?:다음\\s*실험|Next\\s*Experiment)")
    };
  }

  function buildTodayRisks(pkg) {
    const risks = [];
    const localDate = pkg.local_date;

    // 1. Auction without site visit date
    const auctions = pkg.context.auctions || [];
    const biddingAuctions = auctions.filter(a => a.status === "bidding" && !a.site_visit_date);
    if (biddingAuctions.length > 0) {
      const days = biddingAuctions[0].auction_datetime ? Math.round((new Date(biddingAuctions[0].auction_datetime) - new Date(localDate)) / 86400000) : 0;
      risks.push({
        label: "입찰 전 임장 근거 부족",
        reason: `${biddingAuctions[0].name}의 현장 방문일이 비어 있습니다.`,
        object_path: biddingAuctions[0].path,
        evidence: [
          "현장 임장(방문일) 미지정 상태",
          biddingAuctions[0].auction_datetime ? `${days}일 뒤 입찰 기일 예정 (${biddingAuctions[0].auction_datetime})` : "입찰 기일 지정됨"
        ],
        sources: ["Auction Object"]
      });
    }

    // 2. Project due soon
    const projects = pkg.context.projects || [];
    const dueProjects = projects.filter(p => p.due_date && p.status === "doing");
    dueProjects.sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (dueProjects.length > 0 && risks.length < 2) {
      const pDate = new Date(dueProjects[0].due_date);
      const tDate = new Date(localDate);
      const days = Math.round((pDate - tDate) / 86400000);
      if (days >= 0 && days <= 3) {
        risks.push({
          label: "프로젝트 마감 임박",
          reason: `${dueProjects[0].name} 마감이 ${days}일 남았습니다.`,
          object_path: dueProjects[0].path,
          evidence: [
            `${days}일 뒤 마감 기한 도래 (${dueProjects[0].due_date})`,
            `워크플로우 진행 상황: ${dueProjects[0].workflow_summary || "0/0"}`
          ],
          sources: ["Project Object"]
        });
      }
    }

    // 3. Overdue todoist tasks
    const todoist = pkg.context.todoist || {};
    if (todoist.overdueCount > 0 && risks.length < 2) {
      risks.push({
        label: "태스크 지연 상태",
        reason: `현재 미완료된 지연 업무가 ${todoist.overdueCount}건 존재합니다.`,
        evidence: [
          `기한이 만료된 할 일이 ${todoist.overdueCount}건 쌓여 있음`,
          "신속한 처리 및 정기 수거 권장"
        ],
        sources: ["Todoist"]
      });
    }

    return risks.slice(0, 2);
  }

  async function buildMorningPackage(options) {
    const { app, dv, now = new Date(), todoistToken = "" } = options;
    if (!app || !dv) throw new Error("App and Dataview instances are required to build context.");
    
    const localDate = getTodayIsoDate(now);
    const weekId = getWeekId(now);
    const hours = now.getHours();
    const daypart = getDaypart(hours);
    const dayOfWeek = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][now.getDay()];

    const warnings = [];

    // A. Todoist
    let todoistData = { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] };
    if (todoistToken && root.ProjectTodoistAdapter) {
      try {
        todoistData = await root.ProjectTodoistAdapter.fetchExecutionSnapshot(app, todoistToken);
      } catch (err) {
        warnings.push(`Todoist fetch failed: ${err.message}`);
      }
    } else {
      warnings.push("Todoist token is missing or adapter not loaded.");
    }

    // B. Projects
    const projects = [];
    const isProjectTerminal = (status) => {
      const value = String(status == null ? "" : status).trim().toLowerCase();
      if (!value) return false;
      if (value === "completed" || value === "archived" || value === "finished" || value === "dropped") return true;
      // Legacy Dusk-style statuses, e.g. "4 Completed"
      if (/\bcompleted\b/.test(value) || /\barchived\b/.test(value)) return true;
      return false;
    };
    const activeProjects = dv.pages('"PARA/PROJECTS"')
      .where(p => {
        if (!(p.type === "project" || p.type === "project_note" || p.type === "project_family")) return false;
        if (!p.file || !p.file.path) return false;
        // Never include trashed / missing files
        if (String(p.file.path).includes("/.trash/") || String(p.file.path).startsWith(".trash/")) return false;
        return !isProjectTerminal(p.status);
      });
    
    activeProjects.forEach(p => {
      let wfCount = 0;
      let wfChecked = 0;
      if (p.workflow && Array.isArray(p.workflow)) {
        wfCount = p.workflow.length;
        wfChecked = p.workflow.filter(w => w && w.todoist_task_id && w.status === "completed").length;
      }
      const projectTypeRaw = String(p.project_type || "").trim().toLowerCase();
      const projectType = (projectTypeRaw === "business" || projectTypeRaw === "work" || projectTypeRaw === "personal")
        ? projectTypeRaw
        : "uncategorized";
      projects.push({
        path: p.file.path,
        name: p.file.name,
        type: p.type || "project",
        status: p.status || "planning",
        priority: p.priority || "medium",
        project_type: projectType,
        start_date: formatDateToString(p.start_date || p.startDate),
        due_date: formatDateToString(p.due_date || p.dueDate),
        next_action: p.next_action || "",
        review_status: p.review_status || "",
        updated: formatDateToString(p.updated) || null,
        mtime: getMtimeMillis(p.file),
        todoist_project_id: p.todoist_project_id || "",
        todoist_sync_status: p.todoist_sync_status || "",
        workflow_summary: `${wfChecked}/${wfCount}`
      });
    });

    // C. Auctions
    const auctions = [];
    const activeAuctions = dv.pages('"PARA/PROJECTS/Auction"')
      .where(p => p.type === "auction_case" && p.status !== "completed" && p.status !== "archived");
    
    activeAuctions.forEach(p => {
      auctions.push({
        path: p.file.path,
        name: p.file.name,
        type: "auction_case",
        status: p.status,
        next_action: p.next_action || "",
        review_status: p.review_status || "",
        updated: formatDateToString(p.updated) || null,
        auction_datetime: formatDateToString(p.auction_datetime),
        appraisal_price: p.appraisal_price || "",
        minimum_bid: p.minimum_bid || "",
        expected_bid: p.expected_bid || "",
        exit_price: p.exit_price || "",
        site_visit_date: formatDateToString(p.site_visit_date),
        todoist_project_id: p.todoist_project_id || "",
        mtime: getMtimeMillis(p.file)
      });
    });

    // D. Reading
    const reading = [];
    const activeReading = dv.pages('"PARA/PROJECTS/Reading"')
      .where(p => p.type === "reading" && p.status === "reading");
    
    activeReading.forEach(p => {
      reading.push({
        path: p.file.path,
        name: p.file.name,
        type: "reading",
        title: p.title || p.book_title || p.file.name,
        status: p.status,
        next_action: p.next_action || "",
        review_status: p.review_status || "",
        updated: formatDateToString(p.updated) || null,
        progress: p.progress != null ? p.progress : "",
        mtime: getMtimeMillis(p.file)
      });
    });

    // E. Review Inbox Issues
    const reviewInbox = [];
    const inboxPath = `SYSTEM/AI/Skills/prodigy-review/runs/${weekId}/review-inbox.md`;
    const inboxText = await readVaultFile(app, inboxPath);
    if (inboxText) {
      const lines = inboxText.split("\n");
      for (const line of lines) {
        const match = line.match(/^[-*]\s+(.*)$/);
        if (match) {
          reviewInbox.push(match[1].trim());
          if (reviewInbox.length >= 5) break;
        }
      }
    } else {
      warnings.push(`Review inbox file not found: ${inboxPath}`);
    }

    // F. Recent Reflections (Projected only)
    const recentReflections = [];
    const dailyFiles = app.vault.getMarkdownFiles()
      .filter(f => f && f.path && f.path.startsWith("DAILY/DAILY/"))
      .sort((a, b) => b.name.localeCompare(a.name));
    
    let processedDailies = 0;
    for (const f of dailyFiles) {
      if (processedDailies >= 3) break;
      try {
        const text = await app.vault.read(f);
        if (text.includes("status: completed") || text.includes("journal: personal daily")) {
          const fields = extractDailyReviewFields(text);
          recentReflections.push({
            date: f.name.replace(".md", ""),
            path: f.path,
            reflection: fields.reflection,
            change: fields.change,
            nextExperiment: fields.next_experiment,
            next_experiment: fields.next_experiment
          });
          processedDailies++;
        }
      } catch (_err) {
        // Safe skip on read failures
      }
    }

    // F2. Yesterday review — Daily Reflection → Morning Brief (most useful fields only)
    const yesterdayDate = getYesterdayIsoDate(now);
    const yesterdayPath = `DAILY/DAILY/${yesterdayDate}.md`;
    let yesterdayReview = {
      date: yesterdayDate,
      path: yesterdayPath,
      reflection: "",
      change: "",
      next_experiment: "",
      found: false,
      meaningful: false,
      missing: true
    };
    const fromRecent = recentReflections.find((r) => r.date === yesterdayDate);
    if (fromRecent) {
      yesterdayReview = selectUsefulYesterdayReview({
        date: yesterdayDate,
        path: fromRecent.path || yesterdayPath,
        reflection: fromRecent.reflection || "",
        change: fromRecent.change || "",
        next_experiment: fromRecent.next_experiment || fromRecent.nextExperiment || ""
      });
    } else {
      try {
        const yFile = app.vault.getAbstractFileByPath(yesterdayPath);
        if (yFile) {
          const yText = await app.vault.read(yFile);
          const fields = extractDailyReviewFields(yText);
          yesterdayReview = selectUsefulYesterdayReview({
            date: yesterdayDate,
            path: yesterdayPath,
            reflection: fields.reflection,
            change: fields.change,
            next_experiment: fields.next_experiment
          });
        }
      } catch (_yErr) {
        // Safe skip — missing stays true
      }
    }

    // G. PRE Review Context
    let latestReview = {};
    const reviewPath = `SYSTEM/AI/Skills/prodigy-review/runs/${weekId}/weekly-review-${weekId}.json`;
    const reviewJson = await readVaultJson(app, reviewPath);
    if (reviewJson) {
      latestReview = {
        review_id: reviewJson.review_id || "",
        summary: reviewJson.summary || "",
        meaningful_changes: reviewJson.meaningful_changes || [],
        experiments: reviewJson.experiments || [],
        suggested_principles: reviewJson.suggested_principles || [],
        next_week_direction: reviewJson.next_week_direction || [],
        limitations: reviewJson.limitations || []
      };
    } else {
      warnings.push(`PRE Weekly review file not found: ${reviewPath}`);
    }

    // G2. Internal verified context (PRE evidence only — not a user-facing Memory stage)
    let internalContextLine = "";
    if (Array.isArray(latestReview.meaningful_changes) && latestReview.meaningful_changes.length) {
      const first = latestReview.meaningful_changes[0];
      const text = typeof first === "string" ? first : (first && (first.summary || first.label || first.text)) || "";
      if (String(text).trim()) internalContextLine = truncateText(String(text).trim(), 100);
    } else if (Array.isArray(latestReview.next_week_direction) && latestReview.next_week_direction.length) {
      const first = latestReview.next_week_direction[0];
      const text = typeof first === "string" ? first : (first && (first.summary || first.label || first.text)) || "";
      if (String(text).trim()) internalContextLine = truncateText(String(text).trim(), 100);
    }

    // H. Calendar (Unavailable)
    const calendar = [];
    warnings.push("Calendar integration is currently unavailable.");

    // I. Deterministic Continue Candidates (Doing -> Has Next Action -> Recent Active -> Due Soon)
    const scoreCandidate = (c) => {
      let score = 0;
      if (c.status === "doing" || c.status === "reading" || c.status === "bidding") score += 10000;
      if (c.next_action) score += 5000;
      
      const targetDue = c.due_date || c.auction_datetime;
      if (targetDue) {
        const days = Math.round((new Date(targetDue) - new Date(localDate)) / 86400000);
        if (days >= 0 && days <= 7) {
          score += (8 - days) * 250;
        }
      }
      return score;
    };

    const candidatesList = [];
    projects.forEach(p => candidatesList.push({ ...p, type: "project" }));
    // Home Continue: auction watching is interest pool — do not crowd Mission Control
    auctions.forEach((a) => {
      const st = String((a && a.status) || "").toLowerCase();
      if (st === "watching" || st === "관심" || st === "watch" || st === "interest") return;
      candidatesList.push({ ...a, type: "auction" });
    });
    reading.forEach(r => candidatesList.push({ ...r, type: "reading" }));

    const continueCandidates = candidatesList
      .sort((a, b) => {
        const sA = scoreCandidate(a);
        const sB = scoreCandidate(b);
        if (sA !== sB) return sB - sA;
        return b.mtime - a.mtime;
      })
      .slice(0, 4)
      .map(c => ({
        path: c.path,
        name: c.name,
        type: c.type,
        status: c.status,
        project_type: c.project_type || "",
        next_action: c.next_action || "",
        due_date: c.due_date || c.auction_datetime || ""
      }));

    const pkg = {
      schema_version: "morning-package-v1",
      package_id: `morning-${localDate}-${Date.now()}`,
      generated_at: new Date().toISOString(),
      local_date: localDate,
      daypart: daypart,
      day_of_week: dayOfWeek,
      context: {
        todoist: {
          todayCount: todoistData.todayCount,
          overdueCount: todoistData.overdueCount,
          todayTasks: todoistData.todayTasks.slice(0, 10),
          overdueTasks: todoistData.overdueTasks.slice(0, 10)
        },
        projects,
        auctions,
        reading,
        review_inbox: reviewInbox,
        recent_reflections: recentReflections,
        yesterday_review: yesterdayReview,
        latest_review: latestReview,
        /** Internal only — never render as a separate Memory stage on Home */
        internal_context_line: internalContextLine,
        calendar,
        continue_candidates: continueCandidates
      },
      coverage: {
        projects_count: projects.length,
        auctions_count: auctions.length,
        reading_count: reading.length,
        reflections_count: recentReflections.length,
        yesterday_review_found: !!(yesterdayReview && yesterdayReview.found),
        yesterday_review_meaningful: !!(yesterdayReview && yesterdayReview.meaningful),
        yesterday_review_missing: !!(yesterdayReview && yesterdayReview.missing)
      },
      warnings
    };

    pkg.context.risks = buildTodayRisks(pkg);

    return pkg;
  }

  /**
   * Prefer change + next_experiment for loop continuity.
   * Fall back to a short reflection only when change is empty.
   * Never invent content.
   */
  function selectUsefulYesterdayReview(source) {
    const src = source || {};
    const reflection = String(src.reflection || "").trim();
    const change = String(src.change || "").trim();
    const next = String(src.next_experiment || "").trim();
    // Learning line: change first, else short reflection
    const learning = change || (reflection ? truncateText(reflection, 140) : "");
    const meaningful = !!(learning || next);
    return {
      date: src.date || "",
      path: src.path || "",
      reflection,
      change,
      next_experiment: next,
      learning,
      found: true,
      meaningful,
      missing: !meaningful
    };
  }

  function generateDeterministicFallback(pkg) {
    const localDate = (pkg && pkg.local_date) || getTodayIsoDate();
    const context = (pkg && pkg.context) || {};

    const yesterday = context.yesterday_review || {};
    const yLearning = String(yesterday.learning || yesterday.change || "").trim();
    const yNext = String(yesterday.next_experiment || "").trim();
    // Keep rule brief short; structured recovery is shown on Home (avoid duplicate walls of text)
    const briefLines = [
      "규칙 기반 오늘의 브리핑입니다. 기한·입찰일·다음 행동을 기준으로 우선순위를 정리했습니다."
    ];
    if (yLearning && !yNext) briefLines.push(`어제 배움: ${truncateText(yLearning, 100)}`);
    else if (yNext && !yLearning) briefLines.push(`오늘 실험: ${truncateText(yNext, 100)}`);
    else if (yLearning && yNext) {
      briefLines.push(`어제 배움 → 오늘 실험으로 이어갑니다.`);
    }
    const internalLine = String(context.internal_context_line || "").trim();
    if (internalLine && !yLearning && !yNext) {
      briefLines.push(`주간 근거: ${truncateText(internalLine, 100)}`);
    }
    const brief = briefLines.join("\n");

    const focus = [];
    const attention = [];

    const todoist = context.todoist || {};
    if (todoist.overdueCount > 0) {
      focus.push({
        id: "rule_overdue",
        label: "기한 만료 업무 처리",
        reason: `지연된 Todoist 업무가 현재 ${todoist.overdueCount}건 존재합니다.`,
        source_type: "health",
        urgency: "high"
      });
    }

    const auctions = context.auctions || [];
    const biddingAuctions = auctions.filter((a) => a.status === "bidding" && a.auction_datetime);
    biddingAuctions.sort((a, b) => String(a.auction_datetime).localeCompare(String(b.auction_datetime)));
    if (biddingAuctions.length > 0) {
      focus.push({
        id: "rule_auction",
        label: `${biddingAuctions[0].name} 입찰 검토`,
        reason: `입찰 기일(${biddingAuctions[0].auction_datetime})이 지정되어 있습니다.`,
        object_path: biddingAuctions[0].path,
        source_type: "auction",
        urgency: "high",
        next_action: biddingAuctions[0].next_action || ""
      });
    }

    const projects = context.projects || [];
    const dueProjects = projects.filter((p) => p.due_date && p.status === "doing");
    dueProjects.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    if (dueProjects.length > 0 && focus.length < 3) {
      focus.push({
        id: "rule_project",
        label: `${dueProjects[0].name} 마감 관리`,
        reason: `프로젝트 마감일(${dueProjects[0].due_date})이 가장 근접해 있습니다.`,
        object_path: dueProjects[0].path,
        source_type: "project",
        urgency: "medium",
        next_action: dueProjects[0].next_action || ""
      });
    }

    const readings = context.reading || [];
    const activeReading = readings.find((item) => item.status === "reading");
    if (activeReading && focus.length < 3) {
      focus.push({
        id: "rule_reading",
        label: `${activeReading.name || activeReading.title || "읽는 중"} 이어 읽기`,
        reason: "현재 읽는 중인 책이 있습니다.",
        object_path: activeReading.path,
        source_type: "reading",
        urgency: "low",
        next_action: activeReading.next_action || "오늘 읽기"
      });
    }

    // Carry yesterday's next_experiment into today's focus when there is room.
    if (yNext && focus.length < 3) {
      focus.push({
        id: "rule_yesterday_experiment",
        label: truncateText(yNext, 48) || "어제 정한 실험 실행",
        reason: yLearning
          ? `어제 기록한 다음 실험입니다. (어제 배움: ${truncateText(yLearning, 60)})`
          : "어제 일일 성찰에 남긴 다음 실험입니다.",
        source_type: "health",
        urgency: "medium",
        next_action: yNext
      });
    }

    if (focus.length === 0) {
      focus.push({
        id: "rule_default",
        label: "오늘의 주요 루틴 확인",
        reason: "기본 우선순위 기준으로 정리했습니다. 일과 루틴부터 확인하세요.",
        source_type: "health",
        urgency: "low"
      });
    }

    const finalFocus = focus.slice(0, 3);

    const inbox = context.review_inbox || [];
    inbox.forEach((issue) => {
      attention.push({
        label: "보완 필요",
        reason: issue
      });
    });

    const warnings = (pkg && pkg.warnings) || [];
    warnings.forEach((warn) => {
      const text = String(warn || "");
      if (/todoist/i.test(text)) {
        attention.push({
          label: "실행 연동 제한",
          reason: "Todoist 실행 정보를 불러오지 못했습니다. 프로젝트 실행 현황만 제한 표시합니다."
        });
        return;
      }
      attention.push({
        label: "참고",
        reason: text
      });
    });

    return {
      schema_version: "morning-result-v1",
      result_id: `rule-based-result-${localDate}-${Date.now()}`,
      generated_at: new Date().toISOString(),
      brief,
      brief_mode: "rule_based",
      principle: {
        label: "가장 중요한 일부터 끝낸다.",
        source: "rule_based",
        reason: "규칙 기반 브리핑의 기본 원칙입니다."
      },
      focus: finalFocus,
      attention: attention.slice(0, 5),
      limitations: ["Used rule-based priority when AI briefing was unavailable."]
    };
  }

  function resolveRecommendLevel(props) {
    const source = props || {};
    const level = String(source.recommend_level == null ? "" : source.recommend_level).trim();
    if (level) return level;
    return String(source.recommendation == null ? "" : source.recommendation).trim();
  }

  function priorityRank(value) {
    const raw = String(value == null ? "" : value).trim().toLowerCase();
    if (raw === "1" || raw === "critical" || raw === "매우 높음") return 1;
    if (raw === "2" || raw === "high" || raw === "높음") return 2;
    if (raw === "3" || raw === "medium" || raw === "보통") return 3;
    if (raw === "4" || raw === "low" || raw === "낮음") return 4;
    if (raw === "5" || raw === "매우 낮음") return 5;
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 1 && num <= 5) return num;
    return 9;
  }

  function isDueToday(item, localDate) {
    const due = String(item.due_date || item.auction_datetime || "").slice(0, 10);
    return !!due && due === localDate;
  }

  /**
   * Focus selection order:
   * Pinned Focus → Due Today → Priority → Rule/AI order
   * Pinned always wins and is limited to one item at the top.
   */
  function selectFocusItems(options) {
    const opts = options || {};
    const localDate = opts.localDate || getTodayIsoDate();
    const pinned = opts.pinnedFocus && opts.pinnedFocus.focus ? opts.pinnedFocus.focus : null;
    const ruleItems = Array.isArray(opts.focusItems) ? opts.focusItems.slice() : [];
    const pkg = opts.pkg || {};
    const context = pkg.context || {};

    const ranked = ruleItems.map((item, index) => {
      const path = item.object_path || "";
      const projects = context.projects || [];
      const auctions = context.auctions || [];
      const match = projects.find((p) => p.path === path) || auctions.find((a) => a.path === path) || {};
      const due = isDueToday(item, localDate) || isDueToday(match, localDate);
      const priority = priorityRank(match.priority || item.priority);
      return {
        item,
        index,
        dueScore: due ? 0 : 1,
        priorityScore: priority,
        ruleScore: index
      };
    }).sort((a, b) => {
      if (a.dueScore !== b.dueScore) return a.dueScore - b.dueScore;
      if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
      return a.ruleScore - b.ruleScore;
    }).map((entry) => entry.item);

    const selected = [];
    const seen = new Set();
    if (pinned && pinned.id) {
      selected.push(Object.assign({}, pinned, { pinned: true }));
      seen.add(pinned.id);
    }
    ranked.forEach((item) => {
      if (!item || !item.id || seen.has(item.id)) return;
      if (selected.length >= 3) return;
      selected.push(item);
      seen.add(item.id);
    });
    return selected;
  }

  const api = {
    getTodayIsoDate,
    getYesterdayIsoDate,
    getDaypart,
    getWeekId,
    parseReflectionSections,
    extractDailyReviewFields,
    selectUsefulYesterdayReview,
    buildTodayRisks,
    buildMorningPackage,
    generateDeterministicFallback,
    resolveRecommendLevel,
    priorityRank,
    isDueToday,
    selectFocusItems
  };

  root.MorningContextCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
