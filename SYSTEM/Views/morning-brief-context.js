(function (root) {
  "use strict";

  /**
   * Morning Brief context adapter.
   * Aggregates Morning Package + Object Engine summaries.
   * Does not re-implement Health/Attention rules.
   */

  const WORKSPACE_LABELS = Object.freeze({
    auction: "경매",
    project: "프로젝트",
    reading: "독서",
    workout: "운동",
    personal: "개인",
    journal: "저널"
  });

  const WORKSPACE_PATHS = Object.freeze({
    auction: "HUB/10 Auction.md",
    project: "HUB/40 Project.md",
    reading: "HUB/20 Reading.md",
    workout: "HUB/30 Workout.md",
    personal: "HUB/70 Journal.md",
    journal: "HUB/70 Journal.md"
  });

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function pathKey(value) {
    return clean(value).toLowerCase();
  }

  function workspaceLabel(key) {
    const k = clean(key).toLowerCase();
    if (root.prodigyDisplay && root.prodigyDisplay.type) {
      if (k === "auction") return root.prodigyDisplay.type("auction_case");
      if (k === "project") return root.prodigyDisplay.type("project");
      if (k === "reading") return root.prodigyDisplay.type("reading");
      if (k === "workout") return root.prodigyDisplay.type("workout");
    }
    return WORKSPACE_LABELS[k] || k || "워크스페이스";
  }

  function workspacePath(key) {
    const k = clean(key).toLowerCase();
    return WORKSPACE_PATHS[k] || "";
  }

  function collectRawObjects(pkg) {
    const ctx = (pkg && pkg.context) || {};
    const out = [];
    (ctx.projects || []).forEach((p) => {
      if (!p) return;
      out.push(Object.assign({ type: p.type || "project" }, p));
    });
    (ctx.auctions || []).forEach((a) => {
      if (!a) return;
      out.push(Object.assign({ type: a.type || "auction_case" }, a));
    });
    (ctx.reading || []).forEach((r) => {
      if (!r) return;
      out.push(Object.assign({ type: r.type || "reading" }, r));
    });
    return out;
  }

  function auctionStatusFromPackage(pkg, objectPath) {
    const path = pathKey(objectPath);
    if (!path) return "";
    const list = (pkg && pkg.context && pkg.context.auctions) || [];
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (!a) continue;
      if (pathKey(a.path || a.object_path) === path) {
        const engine = root.ObjectEngine || root.ObjectEngineCore;
        if (engine && typeof engine.normalizeCanonicalStatus === "function") {
          return engine.normalizeCanonicalStatus(a.status, "auction");
        }
        return clean(a.status).toLowerCase();
      }
    }
    return "";
  }

  function isAuctionHomeAttentionStatus(status) {
    const engine = root.ObjectEngine || root.ObjectEngineCore;
    if (engine && typeof engine.isAuctionHomeAttentionStatus === "function") {
      return engine.isAuctionHomeAttentionStatus(status);
    }
    return clean(status).toLowerCase() === "bidding";
  }

  function attentionFromEngineState(state) {
    if (!state || state.error) return null;
    // Home policy: auction attention = bidding only
    const wsKey = clean(state.workspace_key).toLowerCase();
    const status = clean(state.canonical_status).toLowerCase();
    if (wsKey === "auction" && !isAuctionHomeAttentionStatus(status)) return null;

    const level = clean(state.attention && state.attention.level).toLowerCase();
    if (level !== "critical" && level !== "high") return null;

    const reasons = Array.isArray(state.attention && state.attention.reasons)
      ? state.attention.reasons.map(clean).filter(Boolean)
      : [];
    const healthReasons = Array.isArray(state.health && state.health.reasons)
      ? state.health.reasons.map(clean).filter(Boolean)
      : [];
    const merged = [];
    reasons.concat(healthReasons).forEach((r) => {
      if (r && merged.indexOf(r) === -1 && !/no health warnings|no attention signal|healthy active|건강 경고 없음|주의 신호 없음|활성 객체가 정상/i.test(r)) {
        merged.push(r);
      }
    });
    if (!merged.length && state.lifecycle && state.lifecycle.reason) {
      merged.push(clean(state.lifecycle.reason));
    }
    if (!merged.length) merged.push("주의가 필요합니다.");

    const ws = clean(state.workspace_key).toLowerCase() === "journal"
      ? "personal"
      : clean(state.workspace_key).toLowerCase();

    const cont = state.continue_target
      || (root.ObjectEngine && root.ObjectEngine.getContinueTarget
        ? root.ObjectEngine.getContinueTarget(state)
        : null);

    return {
      id: pathKey(state.source_path || state.object_path) || `engine:${state.title}`,
      title: clean(state.title) || "객체",
      level,
      reasons: merged,
      reason: merged[0],
      workspace: ws,
      workspace_label: workspaceLabel(ws),
      dashboard_path: (cont && cont.dashboard_path) || workspacePath(ws) || (state.primary_action && state.primary_action.target_path) || "",
      object_path: clean(state.source_path || state.object_path),
      primary_label: clean((cont && cont.action) || (state.primary_action && state.primary_action.label)),
      next_action: state.next_action != null ? state.next_action : null,
      continue_target: cont,
      source: "object_engine"
    };
  }

  function attentionFromPackageRisk(risk, index, pkg) {
    if (!risk) return null;
    const reasons = [];
    if (risk.reason) reasons.push(clean(risk.reason));
    if (Array.isArray(risk.evidence)) {
      risk.evidence.forEach((ev) => {
        const t = clean(ev);
        if (t && reasons.indexOf(t) === -1) reasons.push(t);
      });
    }
    if (!reasons.length) reasons.push("운영 위험이 감지되었습니다.");

    const path = clean(risk.object_path);
    // Drop package risks that point at non-bidding auctions (watching leak guard)
    const auctionStatus = auctionStatusFromPackage(pkg, path);
    if (auctionStatus && !isAuctionHomeAttentionStatus(auctionStatus)) {
      return null;
    }
    // Path under Auction folder without status match still blocked if label says 관심
    if (/watching|관심/i.test(clean(risk.label) + " " + reasons.join(" ")) && auctionStatus === "watching") {
      return null;
    }

    return {
      id: pathKey(path) || `risk:${index}:${clean(risk.label)}`,
      title: clean(risk.label) || "위험",
      level: "high",
      reasons,
      reason: reasons[0],
      workspace: auctionStatus ? "auction" : "",
      workspace_label: auctionStatus ? workspaceLabel("auction") : "오늘",
      dashboard_path: path ? (auctionStatus ? workspacePath("auction") : "") : "HUB/00 Home.md",
      object_path: path,
      primary_label: "",
      source: "package_risk",
      status: auctionStatus || ""
    };
  }

  /**
   * Merge items by object_path (or id). Prefer higher attention; union reasons.
   */
  function mergeAttentionItems(items) {
    const map = Object.create(null);
    const order = [];
    const rank = { critical: 0, high: 1, normal: 2, low: 3 };

    (items || []).forEach((item) => {
      if (!item) return;
      const key = pathKey(item.object_path) || item.id;
      if (!map[key]) {
        map[key] = Object.assign({}, item, { reasons: (item.reasons || []).slice() });
        order.push(key);
        return;
      }
      const prev = map[key];
      const prevRank = rank[prev.level] != null ? rank[prev.level] : 9;
      const nextRank = rank[item.level] != null ? rank[item.level] : 9;
      if (nextRank < prevRank) prev.level = item.level;
      (item.reasons || []).forEach((r) => {
        if (r && prev.reasons.indexOf(r) === -1) prev.reasons.push(r);
      });
      if (!prev.title && item.title) prev.title = item.title;
      if (!prev.workspace && item.workspace) {
        prev.workspace = item.workspace;
        prev.workspace_label = item.workspace_label;
        prev.dashboard_path = item.dashboard_path || prev.dashboard_path;
      }
      if (!prev.object_path && item.object_path) prev.object_path = item.object_path;
      if (!prev.primary_label && item.primary_label) prev.primary_label = item.primary_label;
      prev.reason = prev.reasons[0] || prev.reason;
      if (prev.source !== item.source) prev.source = "merged";
    });

    return order.map((k) => map[k]);
  }

  function sortAttention(items) {
    const rank = { critical: 0, high: 1 };
    return (items || []).slice().sort((a, b) => {
      const ra = rank[a.level] != null ? rank[a.level] : 9;
      const rb = rank[b.level] != null ? rank[b.level] : 9;
      if (ra !== rb) return ra - rb;
      const wa = clean(a.workspace_label);
      const wb = clean(b.workspace_label);
      if (wa !== wb) return wa.localeCompare(wb, "ko");
      return clean(a.title).localeCompare(clean(b.title), "ko");
    });
  }

  function buildTodaySection(pkg, options) {
    const opts = options || {};
    const ctx = (pkg && pkg.context) || {};
    const localDate = clean(pkg && pkg.local_date) || "";
    const risks = Array.isArray(ctx.risks) ? ctx.risks : [];
    const todoist = ctx.todoist || {};
    const journal = opts.journalStatus || null;

    return {
      local_date: localDate,
      due_today: {
        todoist_today: Number(todoist.todayCount) || 0,
        todoist_overdue: Number(todoist.overdueCount) || 0
      },
      risks,
      journal_status: journal && journal.status ? journal.status : "",
      pinned_focus: Array.isArray(opts.pinnedFocus) ? opts.pinnedFocus : []
    };
  }

  /**
   * @param {object} options
   * @param {object} options.pkg Morning package
   * @param {object} [options.pinnedFocus]
   * @param {object} [options.journalStatus]
   * @param {Array} [options.focusItems] approved or proposed focus
   * @returns {object} brief context (never throws)
   */
  function buildMorningBriefContext(options) {
    const opts = options || {};
    const pkg = opts.pkg || {};
    const today = buildTodaySection(pkg, opts);
    let engineOk = false;
    let engineError = "";
    let engineStates = [];
    const engineItems = [];

    const engine = root.ObjectEngine || root.ObjectEngineCore;
    let runtimeSession = null;
    if (engine && typeof engine.evaluateObjects === "function") {
      try {
        const raw = collectRawObjects(pkg);
        const evalCtx = {
          now: opts.now instanceof Date ? opts.now : new Date(),
          memo: Object.create(null)
        };
        if (typeof engine.createRuntimeSession === "function") {
          runtimeSession = engine.createRuntimeSession(evalCtx);
          engineStates = runtimeSession.evaluateObjects(raw);
        } else {
          engineStates = engine.evaluateObjects(raw, evalCtx);
        }
        engineStates.forEach((state) => {
          const item = attentionFromEngineState(state);
          if (item) engineItems.push(item);
        });
        engineOk = true;
      } catch (err) {
        engineOk = false;
        engineError = String(err && err.message ? err.message : err);
        engineStates = [];
      }
    } else {
      engineError = "ObjectEngine unavailable.";
    }

    const packageItems = (today.risks || [])
      .map((risk, index) => attentionFromPackageRisk(risk, index, pkg))
      .filter(Boolean);

    // Engine-first attention; package risks additive then de-duped
    let merged = sortAttention(mergeAttentionItems(engineItems.concat(packageItems)));
    // Final Home gate: auction rows only when status is bidding (resolve via package if needed)
    merged = merged.filter((item) => {
      if (!item) return false;
      const ws = clean(item.workspace).toLowerCase();
      const path = clean(item.object_path);
      const looksAuction = ws === "auction"
        || /auction/i.test(path)
        || /경매/.test(clean(item.workspace_label));
      if (!looksAuction) return true;
      let st = clean(item.status);
      if (!st) st = auctionStatusFromPackage(pkg, path);
      // Unknown auction path: keep only if engine already labeled auction+bidding
      if (!st && ws === "auction") return false;
      if (st) return isAuctionHomeAttentionStatus(st);
      return true;
    });
    const critical = merged.filter((i) => i.level === "critical");
    const high = merged.filter((i) => i.level === "high");

    const pinned = [];
    const pinSource = opts.pinnedFocus && opts.pinnedFocus.focus
      ? [opts.pinnedFocus.focus]
      : (Array.isArray(opts.pinnedFocus) ? opts.pinnedFocus : []);
    pinSource.forEach((item) => {
      if (!item) return;
      pinned.push({
        id: clean(item.id) || pathKey(item.object_path) || clean(item.label),
        title: clean(item.label) || "고정 Focus",
        reason: clean(item.reason) || "고정 Focus",
        object_path: clean(item.object_path),
        source: "pinned_focus"
      });
    });

    // Continue targets by workspace (same runtime states as Launcher)
    const continue_by_workspace = Object.create(null);
    if (engineOk && engine && typeof engine.buildWorkspaceSummary === "function") {
      ["auction", "reading", "project"].forEach((ws) => {
        try {
          const summary = engine.buildWorkspaceSummary(engineStates, ws, {
            now: opts.now,
            journalStatus: opts.journalStatus,
            workoutSnapshot: opts.workoutSnapshot
          });
          continue_by_workspace[ws] = summary && summary.continue_target
            ? summary.continue_target
            : null;
        } catch (_e) {
          continue_by_workspace[ws] = null;
        }
      });
      try {
        const wsum = engine.buildWorkspaceSummary([], "workout", {
          workoutSnapshot: opts.workoutSnapshot
        });
        continue_by_workspace.workout = wsum && wsum.continue_target ? wsum.continue_target : null;
      } catch (_e) {
        continue_by_workspace.workout = null;
      }
      try {
        const psum = engine.buildWorkspaceSummary([], "personal", {
          journalStatus: opts.journalStatus
        });
        continue_by_workspace.personal = psum && psum.continue_target ? psum.continue_target : null;
      } catch (_e) {
        continue_by_workspace.personal = null;
      }
    }

    return {
      schema_version: "morning-brief-context-v1",
      engine_ok: engineOk,
      engine_error: engineError,
      engine_state_count: engineStates.length,
      runtime_session: runtimeSession,
      engine_states: engineStates,
      continue_by_workspace,
      pinned_focus: pinned,
      today,
      attention: {
        critical,
        high,
        items: merged,
        empty: merged.length === 0
      },
      empty_attention_message: "주의가 필요한 Object가 없습니다.",
      // Home Mission Control surface order (product contract)
      display_order: [
        "morning_brief",
        "todays_focus",
        "continue",
        "needs_attention",
        "quick_actions",
        "todoist",
        "workspace_launcher",
        "system_status"
      ]
    };
  }

  /**
   * Map brief-context attention items into the shape Home risk UI already understands.
   * Keeps visual surface stable.
   */
  function toHomeRiskItems(briefContext) {
    const ctx = briefContext || {};
    const items = (ctx.attention && Array.isArray(ctx.attention.items))
      ? ctx.attention.items
      : [];
    if (!items.length) return [];

    return items.map((item) => ({
      label: item.title,
      reason: (item.reasons || []).join(" · ") || item.reason || "",
      object_path: item.object_path || "",
      evidence: (item.reasons || []).slice(),
      sources: [item.workspace_label || "객체 엔진"].filter(Boolean),
      dashboard_path: item.dashboard_path || "",
      workspace_label: item.workspace_label || "",
      attention_level: item.level || "high",
      primary_label: item.primary_label || "",
      _from_brief_context: true
    }));
  }

  const api = {
    WORKSPACE_LABELS,
    WORKSPACE_PATHS,
    clean,
    buildMorningBriefContext,
    mergeAttentionItems,
    sortAttention,
    attentionFromEngineState,
    attentionFromPackageRisk,
    toHomeRiskItems,
    collectRawObjects
  };

  root.MorningBriefContext = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
