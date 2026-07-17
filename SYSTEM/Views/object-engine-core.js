(function (root) {
  "use strict";

  /**
   * Object Engine — shared derived-state for Home / Launcher / future consumers.
   * Reads canonical Objects only. Never writes YAML or invents Properties.
   * Wraps ObjectLifecycleCore for lifecycle/health base; adds attention + primary action.
   */

  const SCHEMA = "prodigy-object-state-v1";

  const HEALTH = Object.freeze({
    healthy: "healthy",
    needs_action: "needs_action",
    needs_review: "needs_review",
    stale: "stale",
    blocked: "blocked",
    completed: "completed",
    invalid: "invalid"
  });

  const ATTENTION = Object.freeze({
    critical: "critical",
    high: "high",
    normal: "normal",
    low: "low",
    none: "none"
  });

  const WORKSPACE_PATHS = Object.freeze({
    auction: "HUB/10 Auction.md",
    reading: "HUB/20 Reading.md",
    workout: "HUB/30 Workout.md",
    project: "HUB/40 Project.md",
    personal: "HUB/70 Journal.md",
    journal: "HUB/70 Journal.md"
  });

  const WORKSPACE_VERBS = Object.freeze({
    auction: "계속",
    reading: "이어 읽기",
    workout: "시작",
    project: "계속",
    personal: "열기",
    journal: "열기"
  });

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function hasNextAction(value) {
    const text = clean(value);
    if (!text) return false;
    if (text === "정보 없음" || text === "-" || text === "설정 필요") return false;
    return true;
  }

  function workspaceKeyForType(type) {
    const t = clean(type).toLowerCase();
    if (t === "auction_case" || t === "auction") return "auction";
    if (t === "reading" || t === "reading_session") return "reading";
    if (t === "workout" || t === "workout_program") return "workout";
    if (t === "project" || t === "project_note" || t === "project_family") return "project";
    if (t === "journal") return "journal";
    return t || "";
  }

  function titleOf(source) {
    if (!source) return "";
    return clean(
      source.name
      || source.title
      || source.book_title
      || source.case_number
      || (source.file && (source.file.name || source.file.basename))
      || ""
    ).replace(/\.md$/i, "");
  }

  function pathOf(source) {
    if (!source) return "";
    return clean(source.path || (source.file && source.file.path) || source.source_path || "");
  }

  /**
   * Normalize raw page / package item into internal read-only shape.
   */
  function normalizeObject(rawPage, context) {
    const ctx = context || {};
    const source = rawPage || {};
    const type = clean(source.type).toLowerCase() || clean(ctx.object_type).toLowerCase();
    const workspace = workspaceKeyForType(type) || clean(ctx.workspace_key).toLowerCase();
    const status = clean(source.status).toLowerCase();
    const path = pathOf(source);
    const title = titleOf(source);
    const nextAction = clean(source.next_action != null ? source.next_action : source.nextAction);
    const due = clean(source.due_date || source.auction_datetime || "").slice(0, 10);
    const reviewDate = clean(source.review_date || "").slice(0, 10);
    const reviewStatus = clean(source.review_status).toLowerCase();
    const siteVisit = clean(source.site_visit_date);
    const expectedBid = source.expected_bid;
    const progress = source.progress;
    const warnings = [];

    if (!path && !ctx.allow_virtual) {
      warnings.push("원본 경로가 없습니다.");
    }
    if (!type && !workspace) {
      warnings.push("객체 유형이 없습니다.");
    }

    return Object.freeze({
      source_path: path,
      object_type: type || workspace || "unknown",
      workspace_key: workspace || "unknown",
      title: title || (path ? path.split("/").pop().replace(/\.md$/i, "") : "제목 없음"),
      canonical_status: status,
      next_action: nextAction,
      has_next_action: hasNextAction(nextAction),
      due_date: due,
      review_date: reviewDate,
      review_status: reviewStatus,
      site_visit_date: siteVisit,
      expected_bid: expectedBid,
      progress: progress,
      created: source.created || null,
      updated: source.updated || (source.file && source.file.mtime) || source.mtime || null,
      mtime: Number(source.mtime) || 0,
      raw: source,
      warnings,
      invalid: !type && !workspace
    });
  }

  function lifecycleFromCore(norm, options) {
    const lifeApi = root.ObjectLifecycleCore;
    if (lifeApi && typeof lifeApi.getLifecycle === "function") {
      try {
        const result = lifeApi.getLifecycle(norm.raw || norm, {
          workspaceKey: norm.workspace_key,
          now: options && options.now
        });
        if (result && result.state) {
          return {
            state: result.state,
            reason: result.reason || "",
            warnings: result.warnings || []
          };
        }
      } catch (_e) {
        // fall through
      }
    }
    // Minimal fallback when lifecycle core unavailable
    const status = norm.canonical_status;
    if (["completed", "archived", "finished", "dropped", "cancelled", "abandoned", "skipped", "won", "lost"].includes(status)) {
      return { state: "completed", reason: "종료 상태입니다.", warnings: [] };
    }
    if (status === "reviewing" || norm.review_status === "pending") {
      return { state: "needs_review", reason: "복기가 대기 중입니다.", warnings: [] };
    }
    if (!norm.has_next_action && ["doing", "active", "bidding", "watching", "reading", "planning"].includes(status)) {
      return { state: "needs_action", reason: "다음 행동이 없습니다.", warnings: [] };
    }
    return { state: "healthy", reason: "라이프사이클 경고 없음.", warnings: [] };
  }

  function buildHealth(norm, lifecycle, options) {
    const reasons = [];
    let state = HEALTH.healthy;
    const life = lifecycle && lifecycle.state;

    if (norm.invalid || (!norm.source_path && !(options && options.allow_virtual))) {
      return { state: HEALTH.invalid, reasons: norm.warnings.length ? norm.warnings.slice() : ["필수 식별 정보가 없습니다."] };
    }

    if (life === "completed" || ["completed", "archived", "finished", "dropped", "cancelled", "abandoned"].includes(norm.canonical_status)) {
      return { state: HEALTH.completed, reasons: ["종료 상태입니다."] };
    }

    if (norm.canonical_status === "blocked") {
      return { state: HEALTH.blocked, reasons: ["상태가 지연(blocked)입니다."] };
    }

    // Workspace-specific signals
    if (norm.workspace_key === "auction") {
      if (["watching", "bidding"].includes(norm.canonical_status) && !norm.has_next_action) {
        state = HEALTH.needs_action;
        reasons.push("활성 경매에 다음 행동이 없습니다.");
      }
      if (norm.canonical_status === "bidding" && !clean(norm.site_visit_date)) {
        if (state === HEALTH.healthy) state = HEALTH.needs_action;
        reasons.push("입찰 예정인데 현장 방문일이 비어 있습니다.");
      }
      if (norm.canonical_status === "reviewing" || life === "needs_review") {
        state = HEALTH.needs_review;
        reasons.push("경매 복기가 완료되지 않았습니다.");
      }
      if (["won", "lost", "skipped"].includes(norm.canonical_status) && norm.review_status !== "done") {
        // outcome recorded but may still need review step when status still not reviewing/archived
        if (state === HEALTH.healthy) {
          // keep completed if terminal via lifecycle; won/lost often not terminal in lifecycle core
        }
      }
    } else if (norm.workspace_key === "project") {
      if (["doing", "active", "planning"].includes(norm.canonical_status) && !norm.has_next_action) {
        state = HEALTH.needs_action;
        reasons.push("활성 프로젝트에 다음 행동이 없습니다.");
      }
      if (norm.due_date) {
        const today = options && options.now instanceof Date
          ? options.now
          : new Date();
        const due = new Date(`${norm.due_date}T00:00:00`);
        if (!Number.isNaN(due.getTime()) && due < new Date(today.getFullYear(), today.getMonth(), today.getDate())
          && !["completed", "archived", "cancelled"].includes(norm.canonical_status)) {
          state = HEALTH.needs_action;
          reasons.push("프로젝트 마감일이 지났습니다.");
        }
      }
    } else if (norm.workspace_key === "reading") {
      if (norm.canonical_status === "reading" && !norm.has_next_action && (norm.progress == null || String(norm.progress).trim() === "")) {
        // soft — still healthy if reading with progress
      }
      if (norm.canonical_status === "finished" || norm.canonical_status === "completed") {
        if (norm.review_status === "pending" || life === "needs_review") {
          state = HEALTH.needs_review;
          reasons.push("완독 후 복기가 대기 중입니다.");
        }
      }
      if (life === "stale") {
        state = HEALTH.stale;
        reasons.push(lifecycle.reason || "독서 활동이 임계 기간을 넘어 멈췄습니다.");
      }
    } else if (norm.workspace_key === "workout") {
      if (norm.canonical_status === "active" && !norm.has_next_action && !norm.title) {
        state = HEALTH.needs_action;
        reasons.push("활성 프로그램 실행에 이어하기 정보가 없습니다.");
      }
    } else if (norm.workspace_key === "journal" || norm.workspace_key === "personal") {
      if (norm.canonical_status === "empty" || norm.canonical_status === "pending") {
        state = HEALTH.needs_action;
        reasons.push("일일 성찰이 아직 없습니다.");
      } else if (norm.canonical_status === "partial") {
        state = HEALTH.needs_action;
        reasons.push("일일 성찰이 미완료입니다.");
      }
    }

    // Align with lifecycle when still healthy
    if (state === HEALTH.healthy) {
      if (life === "needs_action") {
        state = HEALTH.needs_action;
        reasons.push(lifecycle.reason || "다음 행동이 없습니다.");
      } else if (life === "needs_review") {
        state = HEALTH.needs_review;
        reasons.push(lifecycle.reason || "복기가 대기 중입니다.");
      } else if (life === "stale") {
        state = HEALTH.stale;
        reasons.push(lifecycle.reason || "오래된 객체입니다.");
      } else if (life === "completed") {
        state = HEALTH.completed;
        reasons.push(lifecycle.reason || "종료 상태입니다.");
      }
    }

    if (!reasons.length && state === HEALTH.healthy) {
      reasons.push("건강 경고 없음.");
    }

    return { state, reasons };
  }

  function buildAttention(norm, health, options) {
    const reasons = [];
    let level = ATTENTION.low;

    if (health.state === HEALTH.invalid) {
      return { level: ATTENTION.none, reasons: ["유효하지 않은 객체입니다."] };
    }
    if (health.state === HEALTH.completed) {
      return { level: ATTENTION.none, reasons: ["완료되었거나 보관된 상태입니다."] };
    }

    const overdue = health.reasons.some((r) => /overdue|마감일이 지났/i.test(r));
    if (overdue && norm.workspace_key === "project") {
      level = ATTENTION.critical;
      reasons.push("프로젝트 마감일이 지났습니다.");
    } else if (health.state === HEALTH.needs_action) {
      level = ATTENTION.high;
      reasons.push(...health.reasons.filter((r) => !reasons.includes(r)).slice(0, 3));
    } else if (health.state === HEALTH.needs_review) {
      level = ATTENTION.high;
      reasons.push(...health.reasons.slice(0, 3));
    } else if (health.state === HEALTH.stale) {
      level = ATTENTION.normal;
      reasons.push(...health.reasons.slice(0, 2));
    } else if (health.state === HEALTH.blocked) {
      level = ATTENTION.high;
      reasons.push("객체가 지연 상태입니다.");
    } else {
      level = ATTENTION.low;
      reasons.push("활성 객체가 정상입니다.");
    }

    if (!reasons.length) reasons.push("주의 신호 없음.");
    return { level, reasons };
  }

  function buildPrimaryAction(norm, health, lifecycle, options) {
    const ws = norm.workspace_key === "journal" ? "personal" : norm.workspace_key;
    const target = WORKSPACE_PATHS[ws] || WORKSPACE_PATHS[norm.workspace_key] || "";
    const verb = WORKSPACE_VERBS[ws] || WORKSPACE_VERBS[norm.workspace_key] || "열기";
    let label = "";
    let reason = "";

    if (ws === "auction") {
      if (norm.has_next_action) {
        label = norm.next_action;
        reason = "활성 경매의 현재 다음 행동입니다.";
      } else if (health.state === HEALTH.needs_review || lifecycle.state === "needs_review") {
        label = "복기 진행";
        reason = "경매 복기가 필요합니다.";
      } else if (health.state === HEALTH.needs_action) {
        label = "다음 행동 설정";
        reason = "다음 행동이 없으면 경매를 진행할 수 없습니다.";
      } else {
        label = "경매 계속하기";
        reason = "활성 파이프라인의 경매 워크스페이스를 엽니다.";
      }
    } else if (ws === "reading") {
      if (norm.has_next_action) {
        label = norm.next_action;
        reason = "현재 책의 이어 읽기 맥락입니다.";
      } else if (norm.progress != null && String(norm.progress).trim() !== "") {
        label = `진행 ${norm.progress}`;
        reason = "현재 독서 객체를 이어 읽습니다.";
      } else {
        label = "이어 읽기";
        reason = "활성 책의 독서 워크스페이스를 엽니다.";
      }
    } else if (ws === "project") {
      if (norm.has_next_action) {
        label = norm.next_action;
        reason = "활성 프로젝트의 현재 다음 행동입니다.";
      } else if (health.state === HEALTH.needs_action) {
        label = "다음 행동 설정";
        reason = "활성 프로젝트에 다음 행동이 없습니다.";
      } else {
        label = "프로젝트 계속하기";
        reason = "프로젝트 워크스페이스를 엽니다.";
      }
    } else if (ws === "workout") {
      label = norm.title || "오늘 운동";
      reason = norm.canonical_status === "active"
        ? "활성 프로그램 실행을 이어갈 수 있습니다."
        : "운동 워크스페이스를 엽니다.";
    } else if (ws === "personal" || ws === "journal") {
      if (norm.canonical_status === "partial") {
        label = "성찰 이어서 작성";
        reason = "일일 성찰이 미완료입니다.";
      } else if (norm.canonical_status === "empty" || norm.canonical_status === "pending") {
        label = "2분 성찰";
        reason = "일일 성찰이 아직 없습니다.";
      } else {
        label = "저널 열기";
        reason = "개인·저널 워크스페이스를 엽니다.";
      }
    } else {
      label = "열기";
      reason = "워크스페이스를 엽니다.";
    }

    return {
      verb,
      label,
      target_path: target,
      object_path: norm.source_path || "",
      reason
    };
  }

  /**
   * Canonical next_action passthrough only — never invent.
   * @returns {string|null}
   */
  function getNextAction(stateOrNorm) {
    if (!stateOrNorm) return null;
    if (stateOrNorm._norm) {
      return stateOrNorm._norm.has_next_action ? clean(stateOrNorm._norm.next_action) || null : null;
    }
    if (typeof stateOrNorm.has_next_action === "boolean") {
      return stateOrNorm.has_next_action ? clean(stateOrNorm.next_action) || null : null;
    }
    const raw = clean(stateOrNorm.next_action != null ? stateOrNorm.next_action : stateOrNorm.nextAction);
    return hasNextAction(raw) ? raw : null;
  }

  /**
   * Resolve raw Object or already-evaluated engine state to a full state.
   * Shared by capability accessors (lifecycle / attention / continue).
   */
  function resolveState(objectOrState, context) {
    if (!objectOrState) return null;
    if (objectOrState.error && objectOrState.schema_version) return objectOrState;
    if (objectOrState.schema_version === SCHEMA
      || (objectOrState.lifecycle && objectOrState.attention && objectOrState.workspace_key != null)) {
      return objectOrState;
    }
    // Raw page / package object → evaluate once
    return evaluateObject(objectOrState, context || {});
  }

  /**
   * Lifecycle accessor — computed only, never persisted to YAML.
   * @returns {{ state: string, reason: string, reasons: string[] }}
   */
  function getLifecycle(objectOrState, context) {
    const state = resolveState(objectOrState, context);
    if (!state) {
      return {
        state: HEALTH.invalid,
        reason: "객체가 없습니다.",
        reasons: ["객체가 없습니다."]
      };
    }
    if (state.error) {
      const msg = clean(state.error) || "평가에 실패했습니다.";
      return { state: HEALTH.invalid, reason: msg, reasons: [msg] };
    }
    // Prefer health (operational) when present; fall back to lifecycle block
    const healthState = state.health && state.health.state;
    const lifeState = state.lifecycle && state.lifecycle.state;
    const lifeReason = clean(state.lifecycle && state.lifecycle.reason);
    const healthReasons = Array.isArray(state.health && state.health.reasons)
      ? state.health.reasons.map(clean).filter(Boolean)
      : [];

    // Map to product lifecycle vocabulary used across OS
    let outState = healthState || lifeState || "healthy";
    // ObjectLifecycleCore uses needs_action / needs_review / stale / healthy / completed
    if (outState === "blocked") outState = "needs_action";

    const reasons = healthReasons.slice();
    if (lifeReason && reasons.indexOf(lifeReason) === -1) reasons.push(lifeReason);
    if (!reasons.length) {
      if (outState === "healthy") reasons.push("라이프사이클 경고 없음.");
      else if (outState === "needs_action") reasons.push("다음 행동이 필요합니다.");
      else if (outState === "needs_review") reasons.push("복기가 필요합니다.");
      else if (outState === "stale") reasons.push("오래 방치된 상태입니다.");
      else if (outState === "completed") reasons.push("종료 상태입니다.");
      else reasons.push("라이프사이클 상태를 계산했습니다.");
    }

    return {
      state: outState,
      reason: reasons[0],
      reasons,
      // raw passthrough for advanced consumers
      health: state.health || null,
      lifecycle: state.lifecycle || null
    };
  }

  /**
   * Attention accessor — consumers must not recompute attention rules.
   * @returns {{ priority: string, level: string, reason: string, reasons: string[] }}
   */
  function getAttention(objectOrState, context) {
    const state = resolveState(objectOrState, context);
    if (!state) {
      return {
        priority: ATTENTION.none,
        level: ATTENTION.none,
        reason: "객체가 없습니다.",
        reasons: ["객체가 없습니다."]
      };
    }
    if (state.error) {
      const msg = clean(state.error) || "평가에 실패했습니다.";
      return {
        priority: ATTENTION.none,
        level: ATTENTION.none,
        reason: msg,
        reasons: [msg]
      };
    }
    const level = clean(state.attention && state.attention.level).toLowerCase() || ATTENTION.none;
    const reasons = Array.isArray(state.attention && state.attention.reasons)
      ? state.attention.reasons.map(clean).filter(Boolean)
      : [];
    if (!reasons.length) {
      if (level === ATTENTION.none || level === ATTENTION.normal || level === ATTENTION.low) {
        reasons.push("주의 신호 없음.");
      } else {
        reasons.push("주의가 필요합니다.");
      }
    }
    return {
      priority: level, // product name
      level, // existing field name (backward compatible)
      reason: reasons[0],
      reasons
    };
  }

  /**
   * Continue Target: where Continue should go (Workspace Dashboard + object context).
   * Accepts evaluated state or raw Object. Deterministic. Never AI.
   * Returns null when no meaningful continue exists.
   */
  function getContinueTarget(stateOrObject, context) {
    const state = resolveState(stateOrObject, context);
    if (!state || state.error) return null;

    const wsRaw = clean(state.workspace_key).toLowerCase();
    const ws = wsRaw === "journal" ? "personal" : wsRaw;
    const dashboard = WORKSPACE_PATHS[ws] || (state.primary_action && state.primary_action.target_path) || "";
    const health = state.health && state.health.state;
    const next = getNextAction(state);

    // No continue for completed/invalid noise unless journal complete still opens workspace
    if (health === HEALTH.invalid) return null;
    if (health === HEALTH.completed && ws !== "personal") return null;
    if (state.attention && state.attention.level === ATTENTION.none && ws !== "personal" && ws !== "workout") {
      // still allow healthy active objects
      if (!["doing", "active", "bidding", "watching", "reviewing", "reading", "planning", "partial", "empty", "pending"].includes(state.canonical_status)) {
        return null;
      }
    }

    const primary = state.primary_action || {};
    const actionLabel = next || clean(primary.label) || "";
    if (!actionLabel && !dashboard) return null;

    let reason = clean(primary.reason) || "";
    if (next) {
      reason = reason || "활성 객체의 현재 다음 행동입니다.";
    } else if (!reason) {
      reason = "런타임 상태 기준 워크스페이스 이어하기 진입점입니다.";
    }

    return {
      workspace: ws,
      dashboard_path: dashboard,
      object_path: clean(state.source_path) || clean(primary.object_path) || "",
      label: clean(state.title) || actionLabel || ws,
      action: actionLabel || (WORKSPACE_VERBS[ws] || "열기"),
      verb: clean(primary.verb) || WORKSPACE_VERBS[ws] || "열기",
      reason
    };
  }

  /**
   * Evaluate a single canonical (or virtual) Object.
   * Shared runtime model for Home / Brief / Launcher / Workspaces.
   */
  function evaluateObject(rawPage, context) {
    const ctx = context || {};
    const memo = ctx.memo && typeof ctx.memo === "object" ? ctx.memo : null;
    const path = pathOf(rawPage);
    const memoKey = path || (rawPage && rawPage.__engine_key) || "";
    if (memo && memoKey && memo[memoKey]) return memo[memoKey];

    try {
      const norm = normalizeObject(rawPage, ctx);
      const lifecycle = lifecycleFromCore(norm, ctx);
      const health = buildHealth(norm, lifecycle, ctx);
      const attention = buildAttention(norm, health, ctx);
      const primary_action = buildPrimaryAction(norm, health, lifecycle, ctx);
      const next_action = norm.has_next_action ? clean(norm.next_action) : null;

      const result = {
        schema_version: SCHEMA,
        object_path: norm.source_path,
        source_path: norm.source_path,
        object_type: norm.object_type,
        title: norm.title,
        canonical_status: norm.canonical_status,
        workspace: norm.workspace_key === "journal" ? "personal" : norm.workspace_key,
        workspace_key: norm.workspace_key,
        lifecycle: {
          state: lifecycle.state,
          reason: lifecycle.reason || ""
        },
        health: {
          state: health.state,
          reasons: health.reasons.slice()
        },
        attention: {
          level: attention.level,
          reasons: attention.reasons.slice()
        },
        next_action,
        primary_action,
        continue_target: null,
        reasons: (attention.reasons || []).slice(),
        warnings: (norm.warnings || []).concat(lifecycle.warnings || []),
        _norm: norm
      };
      result.continue_target = getContinueTarget(result);

      if (memo && memoKey) memo[memoKey] = result;
      return result;
    } catch (error) {
      const failed = {
        schema_version: SCHEMA,
        object_path: pathOf(rawPage),
        source_path: pathOf(rawPage),
        object_type: clean(rawPage && rawPage.type) || "unknown",
        title: titleOf(rawPage) || "유효하지 않음",
        canonical_status: clean(rawPage && rawPage.status),
        workspace: "unknown",
        workspace_key: "unknown",
        lifecycle: { state: "completed", reason: "평가에 실패했습니다." },
        health: { state: HEALTH.invalid, reasons: [String(error && error.message ? error.message : error)] },
        attention: { level: ATTENTION.none, reasons: ["평가에 실패했습니다."] },
        next_action: null,
        primary_action: {
          verb: "열기",
          label: "열기",
          target_path: "",
          object_path: pathOf(rawPage),
          reason: "평가 오류 후 대체 동작입니다."
        },
        continue_target: null,
        reasons: ["평가에 실패했습니다."],
        warnings: ["객체 평가 실패"],
        error: true
      };
      if (memo && memoKey) memo[memoKey] = failed;
      return failed;
    }
  }

  function evaluateObjects(objects, context) {
    const ctx = context || {};
    const memo = ctx.memo || (ctx.memo = Object.create(null));
    const list = Array.isArray(objects) ? objects : [];
    return list.map((obj) => evaluateObject(obj, Object.assign({}, ctx, { memo })));
  }

  /**
   * Per-render runtime session: evaluate once, reuse across consumers.
   */
  function createRuntimeSession(context) {
    const ctx = Object.assign({}, context || {}, { memo: Object.create(null) });
    const cache = {
      byWorkspace: Object.create(null),
      all: null
    };
    return {
      context: ctx,
      evaluateObject(obj) {
        return evaluateObject(obj, ctx);
      },
      evaluateObjects(list) {
        return evaluateObjects(list, ctx);
      },
      evaluatePackage(pkg) {
        const p = pkg || {};
        const c = p.context || {};
        const raw = []
          .concat(c.projects || [])
          .concat(c.auctions || [])
          .concat(c.reading || []);
        cache.all = evaluateObjects(raw, ctx);
        return cache.all;
      },
      getContinueTargetForWorkspace(workspaceType, states, extra) {
        const summary = buildWorkspaceSummary(states || cache.all || [], workspaceType, Object.assign({}, ctx, extra || {}));
        if (!summary || summary.empty) return null;
        if (summary.state && summary.state.continue_target) return summary.state.continue_target;
        if (summary.state) return getContinueTarget(summary.state);
        return null;
      }
    };
  }

  function attentionRank(level) {
    const order = { critical: 0, high: 1, normal: 2, low: 3, none: 4 };
    return order[level] != null ? order[level] : 9;
  }

  function scoreForSelection(state, workspaceType) {
    if (!state || state.error) return -1e9;
    let score = 0;
    const att = state.attention && state.attention.level;
    score += (4 - Math.min(attentionRank(att), 4)) * 200;

    const health = state.health && state.health.state;
    if (health === HEALTH.needs_action) score += 120;
    if (health === HEALTH.needs_review) score += 110;
    if (health === HEALTH.stale) score += 60;
    if (health === HEALTH.healthy) score += 20;
    if (health === HEALTH.completed || health === HEALTH.invalid) score -= 500;

    const norm = state._norm;
    if (norm && norm.has_next_action) score += 1000; // meaningful next_action dominates bid-date
    else score += 100;

    if (workspaceType === "auction" && norm) {
      if (norm.canonical_status === "bidding") score += 40;
      else if (norm.canonical_status === "reviewing") score += 35;
      else if (norm.canonical_status === "watching") score += 30;
      if (norm.canonical_status === "bidding" && !clean(norm.site_visit_date)) score += 25;
      // soft bid-today signal only
      if (norm.due_date) {
        const today = root.MorningContextCore && root.MorningContextCore.getTodayIsoDate
          ? root.MorningContextCore.getTodayIsoDate()
          : "";
        if (today && norm.due_date === today) score += 5;
      }
    }

    if (workspaceType === "project" && norm) {
      if (norm.canonical_status === "doing") score += 50;
      if (norm.due_date) score += 20;
    }

    if (workspaceType === "reading" && norm) {
      if (norm.canonical_status === "reading") score += 80;
    }

    score += Math.min((norm && norm.mtime) || 0, 1e13) / 1e13;
    return score;
  }

  /**
   * Select the single Object that should represent a Workspace on Launcher.
   */
  function selectPrimaryObject(states, workspaceType, context) {
    const list = (Array.isArray(states) ? states : []).filter((s) => s && !s.error);
    const ws = clean(workspaceType).toLowerCase();
    const filtered = list.filter((s) => {
      const key = s.workspace_key === "journal" ? "personal" : s.workspace_key;
      return key === ws || s.workspace_key === ws;
    });
    if (!filtered.length) return null;

    // Active pipeline filters
    let candidates = filtered;
    if (ws === "auction") {
      candidates = filtered.filter((s) => ["watching", "bidding", "reviewing"].includes(s.canonical_status));
    } else if (ws === "project") {
      candidates = filtered.filter((s) => !["completed", "archived", "cancelled"].includes(s.canonical_status));
      candidates = candidates.filter((s) => ["doing", "active", "planning"].includes(s.canonical_status) || s.health.state !== HEALTH.completed);
    } else if (ws === "reading") {
      const reading = filtered.filter((s) => s.canonical_status === "reading");
      candidates = reading.length ? reading : filtered;
    }

    if (!candidates.length) return null;

    return candidates.slice().sort((a, b) => scoreForSelection(b, ws) - scoreForSelection(a, ws))[0];
  }

  /**
   * Build Launcher-facing summary for one Workspace from evaluated states + context.
   */
  function buildWorkspaceSummary(states, workspaceType, context) {
    const ctx = context || {};
    const ws = clean(workspaceType).toLowerCase();
    const verbDefault = WORKSPACE_VERBS[ws] || "열기";
    const target = WORKSPACE_PATHS[ws] || "";

    // Virtual personal / workout from context when no object list
    if (ws === "personal" || ws === "journal") {
      const status = clean(ctx.journalStatus && ctx.journalStatus.status) || "empty";
      const virtual = evaluateObject({
        type: "journal",
        status: status === "complete" ? "completed" : status,
        path: "HUB/70 Journal.md",
        title: status === "complete" ? "완료" : status === "partial" ? "작성 중" : "대기"
      }, { allow_virtual: true, workspace_key: "journal" });
      // force journal status semantics
      virtual.canonical_status = status;
      virtual.health = buildHealth(virtual._norm || normalizeObject({ type: "journal", status }, { allow_virtual: true }), virtual.lifecycle, ctx);
      if (status === "empty" || status === "partial") {
        virtual.health = {
          state: HEALTH.needs_action,
          reasons: [status === "partial" ? "오늘 성찰이 미완료입니다." : "오늘 성찰이 아직 없습니다."]
        };
        virtual.attention = { level: ATTENTION.high, reasons: virtual.health.reasons.slice() };
        virtual.primary_action = {
          verb: "열기",
          label: status === "partial" ? "성찰 이어서 작성" : "2분 성찰",
          target_path: target,
          object_path: "",
          reason: virtual.health.reasons[0]
        };
        virtual.lifecycle = { state: "needs_action", reason: virtual.health.reasons[0] };
      } else {
        virtual.health = { state: HEALTH.healthy, reasons: ["오늘 성찰이 완료되었습니다."] };
        virtual.attention = { level: ATTENTION.low, reasons: ["성찰 완료."] };
        virtual.primary_action = {
          verb: "열기",
          label: "저널 열기",
          target_path: target,
          object_path: "",
          reason: "개인·저널 워크스페이스를 엽니다."
        };
        virtual.lifecycle = { state: "healthy", reason: "성찰 완료." };
      }
      virtual.title = status === "complete" ? "완료" : status === "partial" ? "작성 중" : "대기";
      virtual.next_action = null;
      virtual.continue_target = getContinueTarget(virtual);
      return {
        workspace: "personal",
        empty: false,
        state: virtual,
        contextLabel: "오늘 성찰",
        title: virtual.title,
        detail: (virtual.continue_target && virtual.continue_target.action) || virtual.primary_action.label,
        actionVerb: "열기",
        objectPath: "",
        path: target,
        continue_target: virtual.continue_target
      };
    }

    if (ws === "workout") {
      const snap = ctx.workoutSnapshot;
      if (!snap || !snap.title) {
        return {
          workspace: "workout",
          empty: true,
          state: null,
          contextLabel: "오늘 운동 없음",
          title: "",
          detail: "활성 프로그램 실행이 없습니다.",
          actionVerb: "열기",
          objectPath: "",
          path: target,
          continue_target: null
        };
      }
      const virtual = evaluateObject({
        type: "workout",
        status: "active",
        title: snap.title,
        path: "",
        next_action: snap.detail || ""
      }, { allow_virtual: true, workspace_key: "workout", memo: ctx.memo });
      return {
        workspace: "workout",
        empty: false,
        state: virtual,
        contextLabel: snap.contextLabel || "오늘 운동",
        title: snap.title,
        detail: snap.detail || (virtual.continue_target && virtual.continue_target.action) || virtual.primary_action.label,
        actionVerb: "시작",
        objectPath: "",
        path: target,
        continue_target: virtual.continue_target
      };
    }

    const primary = selectPrimaryObject(states, ws, ctx);
    if (!primary) {
      const emptyLabels = {
        auction: { contextLabel: "활성 경매 없음", detail: "관심·입찰 예정 물건이 없습니다.", verb: "둘러보기" },
        reading: { contextLabel: "읽는 중 없음", detail: "활성 독서 세션이 없습니다.", verb: "둘러보기" },
        project: { contextLabel: "활성 프로젝트 없음", detail: "진행 중인 프로젝트가 없습니다.", verb: "열기" }
      };
      const empty = emptyLabels[ws] || { contextLabel: "비어 있음", detail: "", verb: verbDefault };
      return {
        workspace: ws,
        empty: true,
        state: null,
        contextLabel: empty.contextLabel,
        title: "",
        detail: empty.detail,
        actionVerb: empty.verb,
        objectPath: "",
        path: target,
        continue_target: null
      };
    }

    const lifeState = primary.lifecycle && primary.lifecycle.state;
    let contextLabel = "진행 중";
    if (root.ObjectLifecycleCore && root.ObjectLifecycleCore.lifecycleLabel && lifeState && lifeState !== "healthy") {
      contextLabel = root.ObjectLifecycleCore.lifecycleLabel(lifeState, root.prodigyDisplay);
    } else if (lifeState === "needs_action") contextLabel = "다음 행동 필요";
    else if (lifeState === "needs_review") contextLabel = "복기 필요";
    else if (lifeState === "stale") contextLabel = "오래 방치됨";
    else if (ws === "reading") contextLabel = "현재 책";
    else if (primary._norm && primary._norm.has_next_action) contextLabel = "진행 중";
    else if (primary.health.state === HEALTH.needs_action) contextLabel = "다음 행동 필요";

    const cont = primary.continue_target || getContinueTarget(primary);

    return {
      workspace: ws,
      empty: false,
      state: primary,
      contextLabel,
      title: primary.title || "",
      detail: (cont && cont.action) || (primary.primary_action && primary.primary_action.label) || "",
      actionVerb: (cont && cont.verb) || (primary.primary_action && primary.primary_action.verb) || verbDefault,
      objectPath: primary.source_path || primary.object_path || "",
      path: target,
      continue_target: cont,
      next_action: primary.next_action,
      reasons: (primary.attention && primary.attention.reasons) || []
    };
  }

  /**
   * Creatable type registry for Universal Object Creator (display + classify).
   * Future types: push via registerCreatableType (does not change YAML schemas).
   */
  const CREATABLE_TYPES = [
    Object.freeze({ id: "project", label: "프로젝트", type: "project", icon: "📁" }),
    Object.freeze({ id: "auction", label: "경매", type: "auction_case", icon: "🏢" }),
    Object.freeze({ id: "reading", label: "독서", type: "reading", icon: "📖" }),
    Object.freeze({ id: "workout", label: "운동", type: "workout", icon: "💪" }),
    Object.freeze({ id: "people", label: "사람", type: "people", icon: "👤" }),
    Object.freeze({ id: "knowledge", label: "지식", type: "knowledge", icon: "🧠" }),
    Object.freeze({ id: "journal", label: "저널", type: "journal", icon: "📅" })
  ];

  const _extraCreatable = [];

  function registerCreatableType(entry) {
    if (!entry || !entry.id) return false;
    const id = clean(entry.id).toLowerCase();
    if (CREATABLE_TYPES.some((t) => t.id === id) || _extraCreatable.some((t) => t.id === id)) {
      return false;
    }
    _extraCreatable.push(Object.freeze({
      id,
      label: clean(entry.label) || id,
      type: clean(entry.type) || id,
      icon: clean(entry.icon) || "📌"
    }));
    return true;
  }

  function listCreatableTypes() {
    return CREATABLE_TYPES.concat(_extraCreatable);
  }

  /**
   * Deterministic input classification for Universal Creator.
   * Capability name: classify(). Alias: classifyInput() (backward compatible).
   * No AI. No vault scan. Keyword / pattern heuristics only.
   * @returns {{ candidates: Array, selected: object, fallback: boolean, error?: string }}
   */
  function classifyInput(rawInput, options) {
    const opts = options || {};
    const text = clean(rawInput);
    const lower = text.toLowerCase();
    const types = listCreatableTypes();

    if (!text) {
      return {
        candidates: types.map((t) => ({
          id: t.id,
          label: t.label,
          type: t.type,
          icon: t.icon,
          score: 0,
          reasons: [],
          confidence: 0
        })),
        selected: null,
        fallback: false,
        empty: true
      };
    }

    try {
      const scores = Object.create(null);
      const reasons = Object.create(null);
      types.forEach((t) => {
        scores[t.id] = 0;
        reasons[t.id] = [];
      });

      const add = (id, pts, reason) => {
        if (scores[id] == null) return;
        scores[id] += pts;
        if (reason && reasons[id].indexOf(reason) === -1) reasons[id].push(reason);
      };

      // People: person-like names / honorifics / contact words
      if (/(씨|님|대표|팀장|과장|대리|교수|박사|선배|후배|동기)\b/.test(text)
        || /^(김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|홍)\S{1,3}$/.test(text)
        || /(만나|통화|연락|미팅|사람|인맥)/.test(text)) {
        add("people", 40, "사람·호칭·연락 표현이 감지되었습니다.");
      }
      if (text.length <= 6 && !/\s/.test(text) && /[가-힣]{2,4}/.test(text) && !/(책|운동|경매|프로젝트)/.test(text)) {
        add("people", 15, "짧은 이름 형태입니다.");
      }

      // Auction
      if (/(경매|입찰|낙찰|패찰|임장|감정가|최저가|타경|사건번호|법원|매각)/.test(text)
        || /\d{4}\s*타경\s*\d+/.test(text)
        || /(오피스텔|아파트|다가구|상가).{0,8}(경매|입찰)/.test(text)) {
        add("auction", 50, "경매·입찰 관련 용어가 감지되었습니다.");
      }

      // Reading
      if (/(책|독서|완독|읽기|저자|페이지|목차|서평|도서|에세이|소설)/.test(text)
        || /(habits|book|author|read)/i.test(text)) {
        add("reading", 45, "책·독서 관련 키워드가 감지되었습니다.");
      }

      // Workout
      if (/(운동|헬스|스쿼트|데드|벤치|러닝|유산소|웨이트|세트|kg|킬로|프로그램 운동|pt)/i.test(text)
        || /(workout|squat|deadlift|bench)/i.test(text)) {
        add("workout", 45, "운동·훈련 관련 키워드가 감지되었습니다.");
      }

      // Project
      if (/(프로젝트|기획|마일스톤|스프린트|납기|마감|할 일|todo|task|mvp|런칭|출시)/i.test(text)
        || /(개발|배포|리팩터|온보딩|워크플로)/.test(text)) {
        add("project", 40, "프로젝트·작업 관련 표현이 감지되었습니다.");
      }

      // Knowledge
      if (/(원칙|인사이트|개념|정의|이론|배움|깨달음|영구 노트|제텔|지식|패턴)/.test(text)
        || /(why|principle|insight)/i.test(text)) {
        add("knowledge", 35, "지식·원칙 관련 표현이 감지되었습니다.");
      }

      // Journal / reflection
      if (/(오늘|어제|성찰|회고|느낀|기분|일기|저널|실험|변화)/.test(text)
        || /^\d{4}-\d{2}-\d{2}/.test(text)) {
        add("journal", 30, "일일·성찰 관련 표현이 감지되었습니다.");
      }

      // Soft default: multi-word work phrase → project
      if (text.length >= 4 && /\s/.test(text) && scores.project < 20) {
        add("project", 10, "일반 작업 문장으로 프로젝트를 후보에 올렸습니다.");
      }

      // Build ordered candidates
      let candidates = types.map((t) => {
        const score = scores[t.id] || 0;
        const rs = (reasons[t.id] || []).slice();
        return {
          id: t.id,
          label: t.label,
          type: t.type,
          icon: t.icon,
          score,
          reasons: rs,
          reason: rs[0] || "",
          confidence: Math.min(1, score / 50)
        };
      }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "ko"));

      // Ensure every listed type appears; top without score get journal fallback reason
      const top = candidates[0];
      let fallback = false;
      if (!top || top.score <= 0) {
        fallback = true;
        candidates = candidates.map((c) => {
          if (c.id === "journal") {
            return Object.assign({}, c, {
              score: 1,
              reasons: ["더 강한 Object 유형 신호가 없어 저널을 제안합니다."],
              reason: "더 강한 Object 유형 신호가 없어 저널을 제안합니다.",
              confidence: 0.2
            });
          }
          return c;
        }).sort((a, b) => b.score - a.score);
      } else {
        // Fill empty reasons for display order (UI still needs a reason when selected)
        candidates = candidates.map((c) => {
          if (c.score > 0 && !c.reasons.length) {
            return Object.assign({}, c, {
              reasons: [`${c.label} 후보입니다.`],
              reason: `${c.label} 후보입니다.`
            });
          }
          if (c.score === 0) {
            return Object.assign({}, c, {
              reasons: [],
              reason: ""
            });
          }
          return c;
        });
      }

      const selected = candidates.find((c) => c.score > 0) || candidates.find((c) => c.id === "journal");
      return {
        candidates,
        selected: selected || null,
        fallback,
        empty: false
      };
    } catch (err) {
      const journal = types.find((t) => t.id === "journal") || types[0];
      return {
        candidates: types.map((t) => ({
          id: t.id,
          label: t.label,
          type: t.type,
          icon: t.icon,
          score: t.id === "journal" ? 1 : 0,
          reasons: t.id === "journal"
            ? ["분류를 사용할 수 없어 저널을 제안합니다."]
            : [],
          reason: t.id === "journal" ? "분류를 사용할 수 없어 저널을 제안합니다." : "",
          confidence: t.id === "journal" ? 0.1 : 0
        })),
        selected: {
          id: journal.id,
          label: journal.label,
          type: journal.type,
          icon: journal.icon,
          score: 1,
          reasons: ["분류를 사용할 수 없어 저널을 제안합니다."],
          reason: "분류를 사용할 수 없어 저널을 제안합니다.",
          confidence: 0.1
        },
        fallback: true,
        empty: false,
        error: String(err && err.message ? err.message : err)
      };
    }
  }

  /**
   * Duplicate / similar-object detection (capability: findDuplicates).
   * Alias: findSimilarObjects (backward compatible).
   * Never blocks creation. No vault scan — pass in-memory lists only.
   */
  function findSimilarObjects(rawInput, objectLists, options) {
    const opts = options || {};
    const q = clean(rawInput).toLowerCase();
    if (!q || q.length < 2) return [];
    const max = opts.max != null ? Number(opts.max) : 5;
    const lists = objectLists || {};
    const pool = []
      .concat(lists.projects || [])
      .concat(lists.auctions || [])
      .concat(lists.reading || [])
      .concat(lists.people || [])
      .concat(lists.workouts || [])
      .concat(lists.objects || []);

    const hits = [];
    pool.forEach((obj) => {
      if (!obj) return;
      const title = clean(obj.name || obj.title || obj.label || "");
      const path = clean(obj.path || obj.object_path || "");
      const type = clean(obj.type || "");
      if (!title && !path) return;
      const hay = `${title} ${path}`.toLowerCase();
      if (!hay.includes(q) && !q.split(/\s+/).some((tok) => tok.length >= 2 && hay.includes(tok))) {
        return;
      }
      const ws = workspaceKeyForType(type) || type || "object";
      hits.push({
        title: title || path.split("/").pop().replace(/\.md$/i, ""),
        path,
        type,
        workspace_key: ws,
        label: (root.prodigyDisplay && root.prodigyDisplay.type)
          ? root.prodigyDisplay.type(type === "auction" ? "auction_case" : type)
          : type
      });
    });

    // de-dupe by path
    const seen = Object.create(null);
    const out = [];
    hits.forEach((h) => {
      const k = clean(h.path).toLowerCase() || h.title.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(h);
    });
    return out.slice(0, max);
  }

  // Capability-oriented public names share the same function identity as aliases
  // (classify === classifyInput, findDuplicates === findSimilarObjects).
  const classify = classifyInput;
  const findDuplicates = findSimilarObjects;

  const api = {
    SCHEMA,
    HEALTH,
    ATTENTION,
    WORKSPACE_PATHS,
    WORKSPACE_VERBS,
    CREATABLE_TYPES,
    clean,
    // Core evaluation (shared runtime)
    normalizeObject,
    resolveState,
    evaluateObject,
    evaluateObjects,
    selectPrimaryObject,
    buildWorkspaceSummary,
    createRuntimeSession,
    scoreForSelection,
    // Capability services (preferred public API)
    classify,
    getLifecycle,
    getAttention,
    findDuplicates,
    getContinueTarget,
    getNextAction,
    listCreatableTypes,
    registerCreatableType,
    // Backward-compatible aliases (same references — Creator / tests depend on them)
    classifyInput: classify,
    findSimilarObjects: findDuplicates
  };

  root.ObjectEngine = api;
  root.ObjectEngineCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
