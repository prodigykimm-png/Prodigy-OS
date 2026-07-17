(function (root) {
  "use strict";

  /**
   * Workspace Launcher — navigation only.
   * Builds equal primary-action cards from existing package / lifecycle signals.
   * Does not edit Objects or invent work.
   */

  const WORKSPACES = Object.freeze([
    Object.freeze({
      id: "auction",
      icon: "🏛",
      name: "경매",
      path: "HUB/10 Auction.md",
      actionVerb: "계속",
      emptyActionVerb: "둘러보기"
    }),
    Object.freeze({
      id: "workout",
      icon: "🏋",
      name: "운동",
      path: "HUB/30 Workout.md",
      actionVerb: "시작",
      emptyActionVerb: "열기"
    }),
    Object.freeze({
      id: "reading",
      icon: "📚",
      name: "독서",
      path: "HUB/20 Reading.md",
      actionVerb: "이어 읽기",
      emptyActionVerb: "둘러보기"
    }),
    Object.freeze({
      id: "project",
      icon: "📁",
      name: "프로젝트",
      path: "HUB/40 Project.md",
      actionVerb: "계속",
      emptyActionVerb: "열기"
    }),
    Object.freeze({
      id: "personal",
      icon: "👤",
      name: "개인",
      path: "HUB/70 Journal.md",
      actionVerb: "열기",
      emptyActionVerb: "열기"
    })
  ]);

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function hasValue(value) {
    const text = clean(value);
    return text !== "" && text !== "정보 없음";
  }

  function displayApi() {
    return root.prodigyDisplay || null;
  }

  function lifecycleLabel(state) {
    const d = displayApi();
    if (d && typeof d.lifecycle === "function") return d.lifecycle(state);
    if (root.ObjectLifecycleCore && root.ObjectLifecycleCore.lifecycleLabel) {
      return root.ObjectLifecycleCore.lifecycleLabel(state, d);
    }
    const map = {
      needs_action: "다음 행동 필요",
      needs_review: "복기 필요",
      stale: "오래 방치됨",
      healthy: "정상",
      completed: "완료"
    };
    return map[state] || state || "";
  }

  function objectName(item) {
    if (!item) return "";
    return clean(
      item.name
      || item.title
      || item.book_title
      || item.case_number
      || (item.file && (item.file.name || item.file.basename))
      || ""
    ).replace(/\.md$/i, "");
  }

  function scoreAuction(item, lifecycleResult) {
    let score = 0;
    const status = clean(item.status);
    const life = lifecycleResult && lifecycleResult.state;
    const hasNext = hasValue(item.next_action);

    // Primary: clear next_action beats bare "today bid" and bare missing-action noise
    if (hasNext) score += 1000;
    else score += 200;

    // Lifecycle is second-order (needs_review can outrank healthy + action text weakly)
    if (life === "needs_review") score += 180;
    else if (life === "needs_action") score += 120;
    else if (life === "stale") score += 80;
    else if (life === "healthy") score += 20;

    if (status === "bidding") score += 40;
    else if (status === "reviewing") score += 35;
    else if (status === "watching") score += 30;

    if (status === "bidding" && !hasValue(item.site_visit_date)) score += 25;
    if (status === "bidding" && !hasValue(item.expected_bid)) score += 15;

    // Soft signal only — must never dominate next_action
    if (item.auction_datetime) {
      const due = String(item.auction_datetime).slice(0, 10);
      const today = root.MorningContextCore && root.MorningContextCore.getTodayIsoDate
        ? root.MorningContextCore.getTodayIsoDate()
        : "";
      if (due && today && due === today) score += 5;
    }

    const mtime = Number(item.mtime) || 0;
    score += Math.min(mtime / 1e13, 5);
    return score;
  }

  function pickAuction(pkg) {
    const list = ((pkg && pkg.context && pkg.context.auctions) || []).filter((a) => {
      const s = clean(a.status);
      return ["watching", "bidding", "reviewing"].includes(s);
    });
    if (!list.length) {
      return {
        empty: true,
        contextLabel: "활성 경매 없음",
        detail: "관심·입찰 예정 물건이 없습니다.",
        actionVerb: "둘러보기"
      };
    }

    const ranked = list.map((item) => {
      let life = null;
      if (root.ObjectLifecycleCore && root.ObjectLifecycleCore.getLifecycle) {
        try {
          life = root.ObjectLifecycleCore.getLifecycle(item, { workspaceKey: "auction" });
        } catch (_e) {
          life = null;
        }
      }
      return { item, life, score: scoreAuction(item, life) };
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const item = best.item;
    const lifeState = best.life && best.life.state ? best.life.state : "";
    const contextLabel = lifeState && lifeState !== "healthy"
      ? lifecycleLabel(lifeState)
      : (hasValue(item.next_action) ? "진행 중" : "다음 행동 필요");
    const detail = hasValue(item.next_action)
      ? clean(item.next_action)
      : (best.life && best.life.reason ? clean(best.life.reason) : "다음 행동을 정하세요");

    return {
      empty: false,
      contextLabel,
      title: objectName(item) || "경매 물건",
      detail,
      objectPath: item.path || "",
      actionVerb: "계속"
    };
  }

  function pickReading(pkg) {
    const list = (pkg && pkg.context && pkg.context.reading) || [];
    const active = list.find((r) => clean(r.status) === "reading") || list[0];
    if (!active) {
      return {
        empty: true,
        contextLabel: "읽는 중 없음",
        detail: "활성 독서 세션이 없습니다.",
        actionVerb: "둘러보기"
      };
    }
    const title = objectName(active) || "현재 책";
    let detail = hasValue(active.next_action) ? clean(active.next_action) : "이어 읽기";
    if (active.progress != null && String(active.progress).trim() !== "") {
      detail = `진행 ${active.progress}${hasValue(active.next_action) ? ` · ${clean(active.next_action)}` : ""}`;
    }
    return {
      empty: false,
      contextLabel: "현재 책",
      title,
      detail,
      objectPath: active.path || "",
      actionVerb: "이어 읽기"
    };
  }

  function pickProject(pkg) {
    const list = ((pkg && pkg.context && pkg.context.projects) || []).filter((p) => {
      const s = clean(p.status);
      return s === "doing" || s === "active" || s === "planning";
    });
    if (!list.length) {
      return {
        empty: true,
        contextLabel: "활성 프로젝트 없음",
        detail: "진행 중인 프로젝트가 없습니다.",
        actionVerb: "열기"
      };
    }
    const ranked = list.slice().sort((a, b) => {
      const score = (p) => {
        let s = 0;
        if (clean(p.status) === "doing") s += 50;
        if (hasValue(p.next_action)) s += 40;
        if (p.due_date) s += 20;
        s += (Number(p.mtime) || 0) / 1e13;
        return s;
      };
      return score(b) - score(a);
    });
    const item = ranked[0];
    return {
      empty: false,
      contextLabel: clean(item.status) === "doing" ? "진행 중" : "현재 프로젝트",
      title: objectName(item) || "프로젝트",
      detail: hasValue(item.next_action) ? clean(item.next_action) : (item.due_date ? `마감 ${String(item.due_date).slice(0, 10)}` : "다음 작업 확인"),
      objectPath: item.path || "",
      actionVerb: "계속"
    };
  }

  function pickPersonal(journalStatus) {
    const status = clean(journalStatus && journalStatus.status) || "empty";
    if (status === "complete") {
      return {
        empty: false,
        contextLabel: "오늘 성찰",
        title: "완료",
        detail: "저널·주간 회고를 열 수 있습니다.",
        actionVerb: "열기"
      };
    }
    if (status === "partial") {
      return {
        empty: false,
        contextLabel: "오늘 성찰",
        title: "작성 중",
        detail: "2분 성찰을 이어서 마무리하세요.",
        actionVerb: "열기"
      };
    }
    return {
      empty: false,
      contextLabel: "오늘 성찰",
      title: "대기",
      detail: "오늘 성찰이 아직 비어 있습니다.",
      actionVerb: "열기"
    };
  }

  function pickWorkout(workoutSnapshot) {
    const snap = workoutSnapshot || null;
    if (!snap || !snap.title) {
      return {
        empty: true,
        contextLabel: "오늘 운동 없음",
        detail: "활성 프로그램 실행이 없습니다.",
        actionVerb: "열기"
      };
    }
    return {
      empty: false,
      contextLabel: snap.contextLabel || "오늘 운동",
      title: snap.title,
      detail: snap.detail || "운동 시작",
      actionVerb: "시작"
    };
  }

  /**
   * Optional lightweight workout signal from Memory index (no store dependency required).
   */
  async function loadWorkoutSnapshot(app) {
    if (!app || !app.vault) return null;
    try {
      const indexPath = "SYSTEM/AI/Memory/workout/index.json";
      const file = app.vault.getAbstractFileByPath(indexPath);
      if (!file) return null;
      const raw = await app.vault.read(file);
      const index = JSON.parse(raw);
      const runs = Array.isArray(index.runs) ? index.runs : [];
      const activeMeta = runs.find((r) => clean(r.status) === "active") || null;
      if (!activeMeta || !activeMeta.id) return null;

      let run = null;
      const runPath = `SYSTEM/AI/Memory/workout/program-runs/${activeMeta.id}.json`;
      const runFile = app.vault.getAbstractFileByPath(runPath);
      if (runFile) {
        run = JSON.parse(await app.vault.read(runFile));
      }
      const title = clean((run && (run.title || run.program_title)) || activeMeta.title || "프로그램 실행");
      const dayLabel = clean(
        (run && (run.next_day_label || run.suggested_day_label || run.current_day_label))
        || activeMeta.next_day
        || ""
      );
      return {
        title: dayLabel || title,
        contextLabel: "오늘 운동",
        detail: dayLabel ? title : "오늘 순서 수행"
      };
    } catch (_e) {
      return null;
    }
  }

  function filterStatesForWorkspace(states, workspaceId) {
    const ws = clean(workspaceId).toLowerCase();
    return (Array.isArray(states) ? states : []).filter((s) => {
      if (!s || s.error) return false;
      const key = clean(s.workspace_key).toLowerCase();
      if (ws === "personal") return key === "personal" || key === "journal";
      return key === ws;
    });
  }

  /**
   * Prefer Object Engine summaries; fall back to legacy pick* if engine fails.
   * When options.engine_states is provided (from Morning Brief Context), reuse them —
   * do not re-evaluate Objects (single operational truth).
   */
  function pickViaEngine(workspaceId, pkg, options) {
    const engine = root.ObjectEngine || root.ObjectEngineCore;
    if (!engine || typeof engine.buildWorkspaceSummary !== "function") {
      return null;
    }
    const opts = options || {};
    const ctx = {
      journalStatus: opts.journalStatus,
      workoutSnapshot: opts.workoutSnapshot,
      now: opts.now
    };
    const precomputed = Array.isArray(opts.engine_states) ? opts.engine_states : null;
    const canEvaluate = typeof engine.evaluateObjects === "function";

    try {
      if (workspaceId === "auction") {
        const states = precomputed
          ? filterStatesForWorkspace(precomputed, "auction")
          : (canEvaluate ? engine.evaluateObjects((pkg.context && pkg.context.auctions) || [], ctx) : []);
        return engine.buildWorkspaceSummary(states, "auction", ctx);
      }
      if (workspaceId === "reading") {
        const states = precomputed
          ? filterStatesForWorkspace(precomputed, "reading")
          : (canEvaluate ? engine.evaluateObjects((pkg.context && pkg.context.reading) || [], ctx) : []);
        return engine.buildWorkspaceSummary(states, "reading", ctx);
      }
      if (workspaceId === "project") {
        const states = precomputed
          ? filterStatesForWorkspace(precomputed, "project")
          : (canEvaluate ? engine.evaluateObjects((pkg.context && pkg.context.projects) || [], ctx) : []);
        return engine.buildWorkspaceSummary(states, "project", ctx);
      }
      if (workspaceId === "workout") {
        return engine.buildWorkspaceSummary([], "workout", ctx);
      }
      if (workspaceId === "personal") {
        return engine.buildWorkspaceSummary([], "personal", ctx);
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  /**
   * @param {object} options
   * @param {object} options.pkg Morning package
   * @param {object} [options.journalStatus] { status: empty|partial|complete }
   * @param {object} [options.workoutSnapshot]
   * @param {Array} [options.engine_states] shared Object Engine states (from Morning Brief Context)
   * @param {object} [options.briefContext] optional full brief context (engine_states extracted if present)
   * @returns {Array<object>} launcher cards in fixed workspace order
   */
  function buildLauncherCards(options) {
    const opts = options || {};
    const pkg = opts.pkg || {};
    if (!opts.engine_states && opts.briefContext && Array.isArray(opts.briefContext.engine_states)) {
      opts.engine_states = opts.briefContext.engine_states;
    }

    const legacyPicks = {
      auction: () => pickAuction(pkg),
      workout: () => pickWorkout(opts.workoutSnapshot),
      reading: () => pickReading(pkg),
      project: () => pickProject(pkg),
      personal: () => pickPersonal(opts.journalStatus)
    };

    return WORKSPACES.map((ws) => {
      let pick = null;
      try {
        pick = pickViaEngine(ws.id, pkg, opts);
      } catch (_e) {
        pick = null;
      }
      if (!pick) {
        pick = legacyPicks[ws.id] ? legacyPicks[ws.id]() : {
          empty: true,
          contextLabel: "비어 있음",
          detail: "",
          actionVerb: ws.emptyActionVerb
        };
      }
      // Prefer explicit continue from summary; else ObjectEngine.getContinueTarget capability
      let cont = pick.continue_target || (pick.state && pick.state.continue_target) || null;
      const eng = root.ObjectEngine || root.ObjectEngineCore;
      if (!cont && pick.state && eng && typeof eng.getContinueTarget === "function") {
        try {
          cont = eng.getContinueTarget(pick.state, {
            journalStatus: opts.journalStatus,
            workoutSnapshot: opts.workoutSnapshot,
            now: opts.now
          });
        } catch (_e) {
          cont = null;
        }
      }
      // Presentation: prefer "Continue" context when something is waiting
      const empty = !!pick.empty;
      let contextLabel = pick.contextLabel || "";
      if (!empty && cont) {
        contextLabel = "Continue";
      } else if (!empty && !contextLabel) {
        contextLabel = ws.actionVerb || "Open";
      }
      const title = pick.title || (cont && cont.label) || "";
      const detail = pick.detail
        || (cont && cont.action)
        || (pick.next_action != null ? pick.next_action : null)
        || (pick.state && pick.state.next_action)
        || "";
      return {
        id: ws.id,
        icon: ws.icon,
        name: ws.name,
        path: ws.path,
        empty,
        contextLabel,
        title,
        detail: detail || "",
        objectPath: pick.objectPath || (cont && cont.object_path) || "",
        actionVerb: pick.actionVerb || (cont && cont.verb) || (empty ? ws.emptyActionVerb : ws.actionVerb),
        continue_target: cont,
        continue_reason: cont && cont.reason ? cont.reason : "",
        next_action: pick.next_action != null ? pick.next_action : (pick.state && pick.state.next_action) || null,
        engine: pick.state || null
      };
    });
  }

  const api = {
    WORKSPACES,
    clean,
    buildLauncherCards,
    loadWorkoutSnapshot,
    pickAuction,
    pickReading,
    pickProject,
    pickPersonal,
    pickWorkout,
    pickViaEngine
  };

  root.WorkspaceLauncherCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
