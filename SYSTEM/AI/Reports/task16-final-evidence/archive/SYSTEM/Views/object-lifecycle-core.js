(function (root) {
  "use strict";

  /**
   * Object Lifecycle is calculated, never stored.
   * Properties remain the source of truth; this service only derives state.
   *
   * v1.1: Rule Registry + Terminal Registry + Review hook + Reason API.
   * Engine evaluates registries; Workspace-specific values are extension points only.
   */

  const STATES = Object.freeze({
    healthy: "healthy",
    needs_action: "needs_action",
    needs_review: "needs_review",
    stale: "stale",
    completed: "completed"
  });

  const REASONS = Object.freeze({
    missing_next_action: "다음 행동이 없습니다.",
    review_pending: "복기가 대기 중입니다.",
    review_status_pending: "복기가 대기 중입니다.",
    status_reviewing: "복기가 대기 중입니다.",
    terminal_status: "종료 상태입니다.",
    no_warnings: "라이프사이클 경고 없음.",
    last_updated: (days) => `${days}일 동안 갱신되지 않았습니다.`,
    reflection_missing: "성찰이 작성되지 않았습니다."
  });

  // ---------------------------------------------------------------------------
  // Rule Registry (global defaults + future workspace overrides)
  // ---------------------------------------------------------------------------

  const GLOBAL_DEFAULTS = Object.freeze({
    stale_days: 30,
    review_warning_days: 0
  });

  /**
   * Future Workspace overrides live here.
   * Leave empty / same as defaults so current behavior is unchanged.
   * Example later: auction: { stale_days: 15 }
   */
  const WORKSPACE_OVERRIDES = Object.freeze({
    auction: Object.freeze({}),
    reading: Object.freeze({}),
    project: Object.freeze({}),
    workout: Object.freeze({}),
    journal: Object.freeze({})
  });

  const NON_OPERATIONAL_TYPES = Object.freeze(new Set([
    "exercise",
    "contact",
    "people",
    "fleeting_note",
    "literature_note",
    "permanent_note",
    "documentation_note",
    "meeting",
    "area_note",
    "area_family",
    "area_note_sub"
  ]));

  // ---------------------------------------------------------------------------
  // Terminal State Registry
  // ---------------------------------------------------------------------------

  const TERMINAL_STATUSES = Object.freeze(new Set([
    "completed",
    "archived",
    "finished",
    "review_completed",
    "dropped",
    "cancelled",
    "abandoned"
  ]));

  /**
   * Future: workspace-specific terminal extensions without engine changes.
   * Example later: auction: new Set(["skipped"])
   */
  const WORKSPACE_TERMINAL_STATUSES = Object.freeze({
    auction: Object.freeze(new Set()),
    reading: Object.freeze(new Set()),
    project: Object.freeze(new Set()),
    workout: Object.freeze(new Set()),
    journal: Object.freeze(new Set())
  });

  const REVIEWING_STATUSES = Object.freeze(new Set([
    "reviewing"
  ]));

  const WORKSPACE_BY_TYPE = Object.freeze({
    auction_case: Object.freeze({ key: "auction", path: "HUB/10 Auction.md", label: "경매" }),
    reading: Object.freeze({ key: "reading", path: "HUB/20 Reading.md", label: "독서" }),
    workout: Object.freeze({ key: "workout", path: "HUB/30 Workout.md", label: "운동" }),
    workout_program: Object.freeze({ key: "workout", path: "HUB/30 Workout.md", label: "운동" }),
    project: Object.freeze({ key: "project", path: "HUB/40 Project.md", label: "프로젝트" }),
    project_note: Object.freeze({ key: "project", path: "HUB/40 Project.md", label: "프로젝트" }),
    project_family: Object.freeze({ key: "project", path: "HUB/40 Project.md", label: "프로젝트" }),
    journal: Object.freeze({ key: "journal", path: "HUB/70 Journal.md", label: "저널" })
  });

  const ObjectLifecycleRules = Object.freeze({
    defaults: GLOBAL_DEFAULTS,
    workspace: WORKSPACE_OVERRIDES,
    nonOperationalTypes: NON_OPERATIONAL_TYPES,
    terminalStatuses: TERMINAL_STATUSES,
    workspaceTerminalStatuses: WORKSPACE_TERMINAL_STATUSES,
    reviewingStatuses: REVIEWING_STATUSES,
    reasons: REASONS
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function workspaceKeyForType(type) {
    const meta = WORKSPACE_BY_TYPE[clean(type).toLowerCase()];
    return meta ? meta.key : "";
  }

  /**
   * Resolve config: global defaults → workspace overrides → call overrides.
   * Workspace custom values are not set yet; fallback preserves defaults.
   */
  function getConfig(options) {
    const opts = options || {};
    const workspaceKey = clean(opts.workspaceKey || opts.workspace || "");
    const workspacePart = workspaceKey && ObjectLifecycleRules.workspace[workspaceKey]
      ? ObjectLifecycleRules.workspace[workspaceKey]
      : {};
    return Object.assign({}, ObjectLifecycleRules.defaults, workspacePart, opts.config || {});
  }

  function todayIso(now) {
    const date = now instanceof Date ? now : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "object") {
      if (typeof value.toMillis === "function") {
        try {
          const ms = value.toMillis();
          if (Number.isFinite(ms)) return new Date(ms);
        } catch (_error) { /* ignore */ }
      }
      if (typeof value.ts === "number") return new Date(value.ts);
      if (typeof value.toISODate === "function") {
        try {
          const iso = value.toISODate();
          if (iso) return parseDateValue(iso);
        } catch (_error) { /* ignore */ }
      }
    }
    const text = clean(value);
    if (!text) return null;
    const day = text.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const date = new Date(`${day}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysBetween(fromDate, toDate) {
    const from = parseDateValue(fromDate);
    const to = parseDateValue(toDate) || new Date();
    if (!from) return null;
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.floor((toDay.getTime() - fromDay.getTime()) / 86400000);
  }

  function hasNextAction(object) {
    const value = clean(object && (object.next_action != null ? object.next_action : object.nextAction));
    if (!value) return false;
    if (value === "정보 없음" || value === "-" || value === "설정 필요") return false;
    return true;
  }

  function objectStatus(object) {
    const s = clean(object && object.status).toLowerCase().replace(/^["']|["']$/g, "");
    // Align auction aliases with Object Engine Home bidding-only policy
    if (s === "관심" || s === "watch" || s === "interest") return "watching";
    if (s === "입찰" || s === "입찰예정" || s === "입찰 예정" || s === "bid") return "bidding";
    if (s === "복기" || s === "복기중" || s === "review") return "reviewing";
    return s;
  }

  function objectType(object) {
    return clean(object && object.type).toLowerCase();
  }

  function objectUpdated(object) {
    if (!object) return null;
    if (object.updated) return object.updated;
    if (object.file && object.file.mtime) return object.file.mtime;
    if (object.mtime) {
      if (typeof object.mtime === "number" && object.mtime > 1e11) {
        return new Date(object.mtime);
      }
      return object.mtime;
    }
    return null;
  }

  function workspaceForType(type) {
    return WORKSPACE_BY_TYPE[clean(type).toLowerCase()] || null;
  }

  /**
   * Terminal State Registry API.
   * Engine asks "is this terminal?" instead of checking raw lists inline.
   */
  function isTerminal(status, options) {
    const value = clean(status).toLowerCase();
    if (!value) return false;
    if (ObjectLifecycleRules.terminalStatuses.has(value)) return true;
    const workspaceKey = clean((options && (options.workspaceKey || options.workspace)) || "");
    const extra = workspaceKey && ObjectLifecycleRules.workspaceTerminalStatuses[workspaceKey];
    return !!(extra && extra.has(value));
  }

  // Backward-compatible alias used by earlier code/tests
  function isCompletedStatus(status) {
    return isTerminal(status);
  }

  /**
   * Generic review-completeness hook.
   *
   * Returns:
   *   { known: false }                         // do not guess
   *   { known: true, complete: true, reason }
   *   { known: true, complete: false, reason }
   *
   * Never inspects free-form markdown section titles.
   * Only uses explicit operational fields, or a caller-provided hook.
   */
  function defaultReviewCompleteness(object) {
    const status = objectStatus(object);
    const reviewStatus = clean(object && object.review_status).toLowerCase();

    if (ObjectLifecycleRules.reviewingStatuses.has(status)) {
      return { known: true, complete: false, reason: REASONS.status_reviewing };
    }
    if (reviewStatus === "pending") {
      return { known: true, complete: false, reason: REASONS.review_status_pending };
    }
    if (reviewStatus === "done") {
      return { known: true, complete: true, reason: "복기가 완료되었습니다." };
    }

    // Primary work complete + explicit incomplete review signal only.
    // Without an explicit field we return unknown and preserve prior behavior.
    return { known: false };
  }

  function resolveReviewCompleteness(object, options) {
    const opts = options || {};
    if (typeof opts.reviewCompleteness === "function") {
      try {
        const custom = opts.reviewCompleteness(object, opts);
        if (custom && typeof custom === "object" && typeof custom.known === "boolean") {
          return custom;
        }
      } catch (_error) {
        // Fall back to default when hook fails — never guess.
      }
    }
    return defaultReviewCompleteness(object);
  }

  function isNeedsReview(object, options) {
    const review = resolveReviewCompleteness(object, options);
    if (review.known && review.complete === false) {
      return { hit: true, reason: review.reason || REASONS.review_pending };
    }
    return { hit: false, reason: "" };
  }

  function resultPayload(state, reason, warnings, meta) {
    return {
      state,
      reason,
      warnings: warnings || [],
      object: meta
    };
  }

  function getLifecycle(object, options) {
    const opts = options || {};
    const source = object || {};
    const type = objectType(source);
    const workspaceKey = clean(opts.workspaceKey || opts.workspace || workspaceKeyForType(type));
    const config = getConfig(Object.assign({}, opts, { workspaceKey }));
    const now = opts.now instanceof Date ? opts.now : new Date();
    const warnings = [];

    const status = objectStatus(source);
    const name = clean(
      source.name
      || source.title
      || source.book_title
      || source.case_number
      || (source.file && (source.file.name || source.file.basename))
      || ""
    );
    const path = clean(source.path || (source.file && source.file.path) || "");
    const meta = { type, status, name, path, workspace: workspaceKey };

    const review = isNeedsReview(source, Object.assign({}, opts, { workspaceKey, config, now }));

    // Primary work finished but required review not complete → Needs Review.
    // Only when the review hook knows completeness; never guess section content.
    if (isTerminal(status, { workspaceKey }) && review.hit) {
      return resultPayload(STATES.needs_review, review.reason, warnings, meta);
    }

    if (isTerminal(status, { workspaceKey })) {
      return resultPayload(STATES.completed, REASONS.terminal_status, warnings, meta);
    }

    if (review.hit) {
      return resultPayload(STATES.needs_review, review.reason, warnings, meta);
    }

    if (!hasNextAction(source)) {
      if (!ObjectLifecycleRules.nonOperationalTypes.has(type)) {
        // Auction watching = interest pool; only bidding is operational for attention
        if (!(workspaceKey === "auction" && status === "watching")) {
          return resultPayload(STATES.needs_action, REASONS.missing_next_action, warnings, meta);
        }
      }
    }

    const updated = objectUpdated(source);
    const ageDays = daysBetween(updated, now);
    if (ageDays != null && ageDays > config.stale_days) {
      return resultPayload(STATES.stale, REASONS.last_updated(ageDays), warnings, meta);
    }

    if (ageDays == null) {
      warnings.push("수정 시각을 확인할 수 없습니다.");
    }

    return resultPayload(STATES.healthy, REASONS.no_warnings, warnings, meta);
  }

  function lifecycleLabel(state, display) {
    if (display && typeof display.lifecycle === "function") return display.lifecycle(state);
    const labels = {
      healthy: "정상",
      needs_action: "다음 행동 필요",
      needs_review: "복기 필요",
      stale: "오래 방치됨",
      completed: "완료"
    };
    return labels[state] || state;
  }

  function countByState(results) {
    const counts = {
      healthy: 0,
      needs_action: 0,
      needs_review: 0,
      stale: 0,
      completed: 0
    };
    (results || []).forEach((item) => {
      if (item && counts[item.state] != null) counts[item.state] += 1;
    });
    return counts;
  }

  function groupByState(results) {
    const groups = {
      healthy: [],
      needs_action: [],
      needs_review: [],
      stale: [],
      completed: []
    };
    (results || []).forEach((item) => {
      if (item && groups[item.state]) groups[item.state].push(item);
    });
    return groups;
  }

  /**
   * Home attention summary: only states that require user attention.
   * Journal reflection is optional supplemental signal.
   */
  function summarizeAttention(objects, options) {
    const opts = options || {};
    const results = (objects || []).map((object) => getLifecycle(object, opts));
    const attentionStates = [STATES.needs_action, STATES.needs_review, STATES.stale];
    const byWorkspace = {};

    results.forEach((result) => {
      if (!result || attentionStates.indexOf(result.state) === -1) return;
      const workspace = workspaceForType(result.object && result.object.type);
      if (!workspace) return;
      const key = `${workspace.key}::${result.state}`;
      if (!byWorkspace[key]) {
        byWorkspace[key] = {
          state: result.state,
          workspace: workspace.key,
          workspace_label: workspace.label,
          workspace_path: workspace.path,
          count: 0,
          reasons: [],
          reason: ""
        };
      }
      byWorkspace[key].count += 1;
      if (result.reason && byWorkspace[key].reasons.indexOf(result.reason) === -1) {
        if (byWorkspace[key].reasons.length < 3) byWorkspace[key].reasons.push(result.reason);
      }
      if (!byWorkspace[key].reason && result.reason) byWorkspace[key].reason = result.reason;
    });

    if (opts.journal && opts.journal.missingReflection) {
      byWorkspace["journal::needs_action"] = {
        state: STATES.needs_action,
        workspace: "journal",
        workspace_label: "저널",
        workspace_path: "HUB/70 Journal.md",
        count: 1,
        reasons: [opts.journal.reason || REASONS.reflection_missing],
        reason: opts.journal.reason || REASONS.reflection_missing
      };
    }

    const order = { needs_action: 0, needs_review: 1, stale: 2 };
    return Object.keys(byWorkspace)
      .map((key) => byWorkspace[key])
      .sort((a, b) => {
        const oa = order[a.state] != null ? order[a.state] : 9;
        const ob = order[b.state] != null ? order[b.state] : 9;
        if (oa !== ob) return oa - ob;
        return b.count - a.count;
      });
  }

  function evaluateCollection(objects, options) {
    const results = (objects || []).map((object) => getLifecycle(object, options));
    return {
      results,
      counts: countByState(results),
      groups: groupByState(results)
    };
  }

  // Backward-compatible export name used by earlier Sprint.
  const DEFAULT_CONFIG = GLOBAL_DEFAULTS;
  const COMPLETED_STATUSES = TERMINAL_STATUSES;

  const api = {
    STATES,
    REASONS,
    DEFAULT_CONFIG,
    COMPLETED_STATUSES,
    ObjectLifecycleRules,
    getConfig,
    todayIso,
    parseDateValue,
    daysBetween,
    hasNextAction,
    isTerminal,
    isCompletedStatus,
    defaultReviewCompleteness,
    resolveReviewCompleteness,
    getLifecycle,
    workspaceForType,
    workspaceKeyForType,
    lifecycleLabel,
    countByState,
    groupByState,
    summarizeAttention,
    evaluateCollection
  };

  root.ObjectLifecycleCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
