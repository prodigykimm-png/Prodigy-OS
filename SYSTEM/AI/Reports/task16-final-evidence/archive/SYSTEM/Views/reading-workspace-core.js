(function (root) {
  "use strict";

  /**
   * Reading Workspace — Thinking Decision Workspace.
   * Runtime selects the book. Reading Strategy Layer decides how to read it.
   * Never recalculates lifecycle/health/attention/continue.
   */

  const SCHEMA = "prodigy-reading-workspace-v1";

  const EMPTY = Object.freeze({
    continue: "이어 읽을 책이 없습니다. 읽는 중인 책을 선택하세요.",
    continueOnlyHero: "이어 읽을 다른 책이 없습니다. 위 오늘의 독서에서 이어 읽으세요.",
    today: "현재 읽는 책이 없습니다. 책을 시작하면 여기에 표시됩니다.",
    review: "읽을 복기 대상이 없습니다.",
    knowledge: "지식 후보가 없습니다.",
    history: "최근 완독 기록이 없습니다.",
    guide: "진행 중인 독서가 없습니다.",
    checklist: "진행 중인 독서가 없습니다.",
    session: "최근 세션이 없습니다.",
    reflection: "진행 중인 독서가 없습니다.",
    stale: "오래 방치된 독서가 없습니다.",
    finish: "완독 임박 책이 없습니다.",
    queue: "독서 대기열이 비어 있습니다."
  });

  const REASONS = Object.freeze({
    continueActive: "현재 활성 독서 Object",
    continueNext: "Runtime next_action 기준 이어 읽기",
    reviewMissing: "완료됐지만 복기가 비어 있음",
    reviewStatus: "상태가 복기 중(reviewing)",
    todayPrimary: "Runtime이 고른 오늘의 독서 Object",
    historyCompleted: "최근 완독한 독서 Object",
    staleLifecycle: "오래 갱신되지 않은 읽는 중 책",
    finishNear: "진행도가 높아 완독·복기에 가깝습니다",
    finishHundred: "진행 100% · 상태 전환은 사용자가 결정",
    queueReady: "읽기 대기 중인 책"
  });

  const LABELS = Object.freeze({
    today: "오늘의 독서",
    continue: "이어 읽기",
    guide: "독서 질답",
    checklist: "독서 체크리스트",
    reflection: "성찰",
    review: "복기 대기",
    knowledge: "지식 후보",
    history: "기록",
    reason: "이유",
    progress: "진행",
    continueAction: "이어 읽기",
    strategy: "전략",
    strategyUnknown: "일반 독서",
    reflectionHint: "사용자 작성 · 최대 3개 질문",
    checklistHint: "읽는 중 확인 · 자동 완료 없음",
    guideHint: "읽기 전 · 주의할 점",
    untitled: "제목 없음",
    candidate: "후보",
    stale: "오래 방치",
    finish: "완독 임박",
    queue: "읽기 대기",
    nextAction: "다음 행동",
    quickSession: "빠른 기록",
    focus: "이 책 포커스"
  });

  /** Progress threshold for "finish soon" surface (canonical progress only). */
  const FINISH_PROGRESS_MIN = 75;
  const PROGRESS_STEPS = Object.freeze([25, 50, 75, 100]);

  // Backward-compatible aliases (tests / older consumers)
  const STRATEGY_LABELS = Object.freeze({
    practical: "실용 독서",
    philosophy: "철학 독서",
    history: "역사 독서",
    science: "과학 독서",
    literature: "문학 독서",
    social_science: "사회과학 독서",
    generic: "일반 독서",
    unknown: "일반 독서"
  });

  const REFLECTION_PROMPTS = Object.freeze([
    { id: "changed", label: "생각이 어떻게 바뀌었는가?" },
    { id: "surprised", label: "무엇이 놀라웠는가?" },
    { id: "apply", label: "무엇을 적용할 것인가?" }
  ]);

  const STRATEGY_GUIDE = Object.freeze({
    practical: Object.freeze(["가장 중요한 원칙에 주목하라.", "이번 주에 적용할 행동을 찾으라.", "현재 습관과 충돌하는 지점을 관찰하라."]),
    philosophy: Object.freeze(["저자가 던지는 핵심 질문을 붙잡으라.", "가장 강한 논증의 구조를 따라가라.", "동의하지 않는 지점을 표시하라."]),
    history: Object.freeze(["사건의 원인 조건을 추적하라.", "이후에 바뀐 것을 기록하라.", "오늘 반복되는 패턴을 찾아라."]),
    science: Object.freeze(["주장을 지지하는 증거를 확인하라.", "전제와 가정을 분리하라.", "한계와 적용 범위를 표시하라."]),
    literature: Object.freeze(["관점을 흔드는 장면을 붙잡으라.", "왜 그것이 남는지 묻거라.", "현실을 비추는 인물·갈등을 관찰하라."]),
    social_science: Object.freeze(["충돌하는 관점을 비교하라.", "서로 다른 가정을 드러내라."]),
    unknown: Object.freeze(["가장 눈에 띄는 아이디어는 무엇인가?", "왜 그것이 눈에 띄는가?"]),
    generic: Object.freeze(["가장 눈에 띄는 아이디어는 무엇인가?", "왜 그것이 눈에 띄는가?"])
  });

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function engineApi() {
    return root.ObjectEngine || root.ObjectEngineCore || null;
  }

  function strategyApi() {
    return root.ReadingStrategyCore || null;
  }

  function normalizeReadingPages(pages) {
    const list = Array.isArray(pages) ? pages : [];
    return list.map((p) => {
      const raw = p || {};
      const path = clean(raw.path || (raw.file && raw.file.path) || raw.source_path);
      return Object.assign({}, raw, {
        type: clean(raw.type) || "reading",
        path,
        title: clean(raw.title || raw.book_title || (raw.file && raw.file.name) || "")
      });
    });
  }

  /** Explicit fields only — delegates to Strategy Layer when available. */
  function resolveStrategyDirect(source) {
    const api = strategyApi();
    if (api && typeof api.resolveStrategy === "function") {
      const r = api.resolveStrategy(source);
      return {
        strategy: r.strategy === "generic" ? (r.known ? "generic" : "generic") : r.strategy,
        source: r.source_field || "none",
        known: !!(r.known && r.strategy !== "generic")
      };
    }
    const src = source || {};
    const map = {
      practical: "practical", practice: "practical", self_help: "practical", "실용": "practical", "자기계발": "practical",
      philosophy: "philosophy", philosophical: "philosophy", "철학": "philosophy",
      history: "history", historical: "history", "역사": "history",
      science: "science", scientific: "science", "과학": "science",
      social_science: "social_science", socialscience: "social_science", "사회과학": "social_science",
      literature: "literature", fiction: "literature", novel: "literature", "문학": "literature", "소설": "literature"
    };
    for (const field of ["reading_strategy", "book_type", "reading_type"]) {
      const key = clean(src[field]).toLocaleLowerCase("ko-KR").replace(/[\s-]+/g, "_");
      if (!key) continue;
      const mapped = map[key] || map[clean(src[field])];
      if (mapped) return { strategy: mapped, source: field, known: true };
    }
    return { strategy: "generic", source: "none", known: false };
  }

  /** Canonical progress only (0–100). Page position is discarded. */
  function progressOf(raw, state) {
    const src = raw || (state && state._norm && state._norm.raw) || {};
    if (src.progress == null || clean(src.progress) === "") return "";
    const text = clean(src.progress).replace(/%/g, "");
    const n = Number(text);
    if (Number.isFinite(n)) return `${Math.min(100, Math.max(0, Math.round(n)))}%`;
    return clean(src.progress);
  }

  /** Numeric progress 0–100, or null when empty/unread. */
  function progressNumber(raw) {
    const src = raw || {};
    if (src.progress == null || clean(src.progress) === "") return null;
    const text = clean(src.progress).replace(/%/g, "");
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    const clamped = Math.min(100, Math.max(0, Math.round(n)));
    return clamped === 0 ? null : clamped;
  }

  /** Snap to discrete chips for display highlight. */
  function normalizeProgressStep(value) {
    const n = typeof value === "number" ? value : progressNumber({ progress: value });
    if (n == null) return null;
    if (PROGRESS_STEPS.includes(n)) return n;
    return PROGRESS_STEPS.reduce((best, step) =>
      Math.abs(step - n) < Math.abs(best - n) ? step : best
    , PROGRESS_STEPS[0]);
  }

  /**
   * Parse connections / links into short chips (people or note titles).
   * Does not invent relationships — only explicit field values.
   */
  function parseConnectionChips(connections, limit) {
    const max = Math.max(1, Math.min(Number(limit) || 6, 12));
    const raw = connections;
    const parts = [];
    if (Array.isArray(raw)) {
      raw.forEach((item) => {
        if (item == null) return;
        if (typeof item === "string") parts.push(item);
        else if (typeof item === "object") {
          parts.push(item.path || item.link || item.name || item.title || String(item));
        }
      });
    } else if (typeof raw === "string" && clean(raw)) {
      // Split wikilinks and comma/semicolon lists
      const text = raw;
      const wiki = text.match(/\[\[([^\]]+)\]\]/g);
      if (wiki && wiki.length) {
        wiki.forEach((w) => parts.push(w));
      } else {
        text.split(/[,;\n]/).forEach((p) => parts.push(p));
      }
    }
    const out = [];
    const seen = new Set();
    for (const part of parts) {
      let label = clean(part);
      if (!label) continue;
      label = label.replace(/^\[\[/, "").replace(/\]\]$/, "");
      const pipe = label.indexOf("|");
      if (pipe >= 0) label = label.slice(pipe + 1).trim() || label.slice(0, pipe).trim();
      const pathPart = label.includes("/") ? label : "";
      const name = pathPart
        ? (pathPart.split("/").pop() || pathPart).replace(/\.md$/i, "")
        : label.replace(/\.md$/i, "");
      const key = name.toLocaleLowerCase("ko-KR");
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({
        label: name,
        path: pathPart ? (pathPart.endsWith(".md") ? pathPart : `${pathPart}.md`) : "",
        name
      });
      if (out.length >= max) break;
    }
    return out;
  }

  function rawForState(state, pagesByPath) {
    if (!state) return null;
    const path = clean(state.source_path || state.object_path);
    if (path && pagesByPath[path]) return pagesByPath[path];
    if (state._norm && state._norm.raw) return state._norm.raw;
    return null;
  }

  function isActiveReading(primaryState) {
    return !!(primaryState && clean(primaryState.canonical_status) === "reading");
  }

  function strategySourceFrom(primaryState, pagesByPath) {
    const raw = rawForState(primaryState, pagesByPath) || {};
    return {
      source_path: clean(primaryState && (primaryState.source_path || primaryState.object_path) || raw.path),
      id: clean(raw.id),
      title: clean(raw.title || (primaryState && primaryState.title)),
      book_title: clean(raw.book_title || (primaryState && primaryState.title)),
      reading_strategy: raw.reading_strategy,
      book_type: raw.book_type,
      reading_type: raw.reading_type
    };
  }

  /**
   * Strategy once per render — Guide / Checklist / Reflection.
   */
  function buildStrategyLayer(primaryState, pagesByPath) {
    const api = strategyApi();
    const active = isActiveReading(primaryState);
    const source = active ? strategySourceFrom(primaryState, pagesByPath) : {};

    if (api && typeof api.buildStrategyBundle === "function") {
      return api.buildStrategyBundle(source, { active });
    }

    // Minimal fallback if strategy module not loaded
    if (!active) {
      return {
        empty: true,
        message: EMPTY.guide,
        strategy: null,
        strategy_label: null,
        known: false,
        generic: true,
        guide: null,
        checklist: null,
        reflection: null
      };
    }
    const direct = resolveStrategyDirect(source);
    const key = direct.known ? direct.strategy : "generic";
    const label = STRATEGY_LABELS[key] || STRATEGY_LABELS.generic;
    const guides = (STRATEGY_GUIDE[key] || STRATEGY_GUIDE.generic || STRATEGY_GUIDE.unknown).map((labelText, i) => ({
      id: `g_${key}_${i}`,
      label: labelText
    }));
    return {
      empty: false,
      strategy: key,
      strategy_label: label,
      known: direct.known,
      generic: !direct.known || key === "generic",
      source_field: direct.source,
      guide: { phase: "before", strategy: key, strategy_label: label, prompts: guides },
      checklist: {
        phase: "during",
        strategy: key,
        strategy_label: label,
        items: guides.slice(0, 3).map((g, i) => ({ id: `c_${i}`, label: g.label, checked: false })),
        auto_complete: false
      },
      reflection: {
        phase: "after",
        strategy: key,
        strategy_label: label,
        prompts: REFLECTION_PROMPTS.map((p) => ({ ...p })),
        max: 3
      },
      explain: `전략 · ${label}`
    };
  }

  function evaluateReadingStates(pages, options) {
    const engine = engineApi();
    const opts = options || {};
    const normalized = normalizeReadingPages(pages);
    if (!engine || typeof engine.evaluateObjects !== "function") {
      return {
        ok: false,
        states: [],
        pages: normalized,
        session: null,
        error: "Object Engine Runtime unavailable"
      };
    }
    const session = opts.session
      || (typeof engine.createRuntimeSession === "function" ? engine.createRuntimeSession(opts.context || {}) : null);
    const ctx = session && session.context
      ? session.context
      : Object.assign({}, opts.context || {}, { memo: Object.create(null) });
    const states = session && typeof session.evaluateObjects === "function"
      ? session.evaluateObjects(normalized)
      : engine.evaluateObjects(normalized, ctx);
    return {
      ok: true,
      states,
      pages: normalized,
      session,
      context: ctx
    };
  }

  function buildContinueCard(summary, primaryState, pagesByPath, states) {
    /**
     * Strip of other active books — excludes the hero (today) book when others exist
     * so the same title is not repeated under 오늘의 독서 + 이어 읽기.
     */
    const heroPath = clean(
      (primaryState && (primaryState.source_path || primaryState.object_path))
      || (summary && summary.continue_target && summary.continue_target.object_path)
      || ""
    );
    const list = (Array.isArray(states) ? states : []).filter((s) => s && !s.error);
    const others = [];
    list.forEach((s) => {
      if (clean(s.canonical_status) !== "reading") return;
      const path = clean(s.source_path || s.object_path);
      if (!path || (heroPath && path === heroPath)) return;
      const raw = (path && pagesByPath && pagesByPath[path]) || {};
      others.push({
        title: clean(s.title) || clean(raw.title || raw.book_title) || LABELS.untitled,
        object_path: path,
        dashboard_path: "HUB/20 Reading.md",
        action: LABELS.continueAction,
        verb: "이어 읽기",
        next_action: s.next_action || clean(raw.next_action) || null,
        progress: progressOf(raw, s) || null,
        progress_number: progressNumber(raw),
        reason: REASONS.continueActive
      });
    });

    if (others.length) {
      const first = others[0];
      return {
        empty: false,
        continue_target: {
          object_path: first.object_path,
          label: first.title,
          action: first.action,
          dashboard_path: first.dashboard_path
        },
        title: first.title,
        action: first.action,
        verb: first.verb,
        object_path: first.object_path,
        focus_path: first.object_path,
        dashboard_path: first.dashboard_path,
        next_action: first.next_action,
        progress: first.progress,
        progress_number: first.progress_number,
        reason: first.reason,
        items: others.slice(0, 4),
        hero_excluded: true,
        message: null
      };
    }

    // Only the hero book is active — do not duplicate it in the strip
    if (heroPath) {
      return {
        empty: true,
        message: EMPTY.continueOnlyHero,
        continue_target: null,
        reason: null,
        focus_path: heroPath,
        next_action: null,
        progress: null,
        items: [],
        hero_excluded: true,
        single_hero: true
      };
    }

    return {
      empty: true,
      message: EMPTY.continue,
      continue_target: null,
      reason: null,
      focus_path: null,
      next_action: null,
      progress: null,
      items: [],
      hero_excluded: false
    };
  }

  /**
   * Reading books marked stale by Runtime lifecycle (or health reasons).
   * No invented dates — only engine lifecycle/health.
   */
  function buildStaleReading(states, pagesByPath) {
    const list = (Array.isArray(states) ? states : []).filter((s) => s && !s.error);
    const items = [];
    list.forEach((s) => {
      const status = clean(s.canonical_status);
      if (status !== "reading") return;
      const life = clean(s.lifecycle && s.lifecycle.state);
      const healthReasons = (s.health && s.health.reasons) || [];
      const lifeReason = clean(s.lifecycle && s.lifecycle.reason);
      const isStale = life === "stale"
        || healthReasons.some((r) => /오래|방치|stale|갱신/i.test(String(r || "")));
      if (!isStale) return;
      const path = clean(s.source_path || s.object_path);
      const raw = (path && pagesByPath && pagesByPath[path]) || {};
      items.push({
        title: clean(s.title) || clean(raw.title || raw.book_title) || LABELS.untitled,
        path,
        status,
        progress: progressOf(raw, s) || null,
        progress_number: progressNumber(raw),
        next_action: s.next_action || clean(raw.next_action) || null,
        reason: lifeReason || healthReasons[0] || REASONS.staleLifecycle,
        lifecycle: life,
        health: (s.health && s.health.state) || ""
      });
    });
    if (!items.length) {
      return { empty: true, message: EMPTY.stale, items: [] };
    }
    return {
      empty: false,
      message: null,
      items,
      reason: REASONS.staleLifecycle
    };
  }

  /**
   * High-progress reading books (finish soon). Status stays user-owned.
   */
  function buildFinishSoon(pages, states, pagesByPath) {
    const byPath = pagesByPath || Object.create(null);
    const stateByPath = Object.create(null);
    (Array.isArray(states) ? states : []).forEach((s) => {
      const path = clean(s && (s.source_path || s.object_path));
      if (path) stateByPath[path] = s;
    });
    const items = [];
    normalizeReadingPages(pages).forEach((p) => {
      const status = clean(p.status).toLowerCase();
      if (status !== "reading") return;
      const n = progressNumber(p);
      if (n == null || n < FINISH_PROGRESS_MIN) return;
      const path = clean(p.path || (p.file && p.file.path));
      const st = path && stateByPath[path] ? stateByPath[path] : null;
      items.push({
        title: clean(p.title || p.book_title) || LABELS.untitled,
        path,
        status: "reading",
        progress: progressOf(p, st) || `${n}%`,
        progress_number: n,
        next_action: (st && st.next_action) || clean(p.next_action) || null,
        reason: n >= 100 ? REASONS.finishHundred : REASONS.finishNear,
        ready_for_review: n >= 100
      });
    });
    items.sort((a, b) => (b.progress_number || 0) - (a.progress_number || 0));
    if (!items.length) {
      return { empty: true, message: EMPTY.finish, items: [] };
    }
    return {
      empty: false,
      message: null,
      items,
      reason: REASONS.finishNear
    };
  }

  /** Queue books ready to start (status = queue). */
  function buildQueueReady(pages) {
    const items = normalizeReadingPages(pages)
      .filter((p) => clean(p.status).toLowerCase() === "queue")
      .map((p) => ({
        title: clean(p.title || p.book_title) || LABELS.untitled,
        path: clean(p.path || (p.file && p.file.path)),
        author: clean(p.author),
        status: "queue",
        next_action: clean(p.next_action) || null,
        reason: REASONS.queueReady
      }));
    if (!items.length) {
      return { empty: true, message: EMPTY.queue, items: [] };
    }
    return { empty: false, message: null, items, reason: REASONS.queueReady };
  }

  /**
   * Checklist progress summary from stored state (optional inject).
   * items: { [id]: "unchecked"|"checked"|"not_applicable" }
   */
  function summarizeChecklistProgress(checklistState, totalQuestions) {
    const items = checklistState && checklistState.items && typeof checklistState.items === "object"
      ? checklistState.items
      : null;
    if (!items) {
      return { empty: true, checked: 0, total: Number(totalQuestions) || 0, label: "" };
    }
    const ids = Object.keys(items);
    const total = Number(totalQuestions) > 0 ? Number(totalQuestions) : ids.length;
    let checked = 0;
    ids.forEach((id) => {
      if (items[id] === "checked" || items[id] === "not_applicable") checked += 1;
    });
    return {
      empty: total === 0,
      checked,
      total,
      label: total > 0 ? `질답 ${checked}/${total}` : ""
    };
  }

  function buildTodayReading(summary, primaryState, pagesByPath) {
    if (!summary || summary.empty || !primaryState) {
      return {
        empty: true,
        message: EMPTY.today,
        object: null,
        reason: null
      };
    }
    if (clean(primaryState.canonical_status) !== "reading") {
      if (!primaryState.continue_target) {
        return {
          empty: true,
          message: EMPTY.today,
          object: null,
          reason: null
        };
      }
    }
    const raw = rawForState(primaryState, pagesByPath) || {};
    const progress = progressOf(raw, primaryState);
    return {
      empty: false,
      message: null,
      reason: REASONS.todayPrimary,
      object: {
        title: clean(primaryState.title) || clean(raw.title || raw.book_title) || "",
        author: clean(raw.author),
        progress: progress || null,
        status: clean(primaryState.canonical_status),
        path: clean(primaryState.source_path || primaryState.object_path),
        next_action: primaryState.next_action || null,
        continue_action: LABELS.continueAction
      },
      state: primaryState
    };
  }

  function buildReadingGuide(strategyBundle, primaryState, pagesByPath) {
    if (!strategyBundle || strategyBundle.empty || !strategyBundle.guide) {
      return {
        empty: true,
        message: EMPTY.guide,
        strategy: "generic",
        known: false,
        prompts: [],
        reason: null
      };
    }
    const g = strategyBundle.guide;
    const raw = rawForState(primaryState, pagesByPath) || {};
    const prompts = (g.prompts || []).slice(0, 5);
    return {
      empty: false,
      message: null,
      phase: "before",
      strategy: strategyBundle.strategy,
      known: !strategyBundle.generic,
      generic: !!strategyBundle.generic,
      strategy_source: strategyBundle.source_field,
      strategy_label: strategyBundle.strategy_label,
      prompts,
      object_path: clean(primaryState && (primaryState.source_path || primaryState.object_path)),
      title: clean(raw.book_title || raw.title || (primaryState && primaryState.title)),
      purpose: g.purpose || LABELS.guideHint,
      reason: strategyBundle.explain || `전략 · ${strategyBundle.strategy_label}`,
      common: true,
      domain: !!strategyBundle.domain,
      open_checklist: true
    };
  }

  function buildReadingChecklist(strategyBundle, primaryState) {
    if (!strategyBundle || strategyBundle.empty || !strategyBundle.checklist) {
      return {
        empty: true,
        message: EMPTY.checklist,
        strategy: "generic",
        items: [],
        reason: null
      };
    }
    const c = strategyBundle.checklist;
    return {
      empty: false,
      message: null,
      phase: "during",
      strategy: strategyBundle.strategy,
      known: !strategyBundle.generic,
      generic: !!strategyBundle.generic,
      strategy_label: strategyBundle.strategy_label,
      items: (c.items || []).map((item) => ({
        id: item.id,
        label: item.label,
        checked: false
      })),
      auto_complete: false,
      object_path: clean(primaryState && (primaryState.source_path || primaryState.object_path)),
      purpose: c.purpose || LABELS.checklistHint,
      reason: strategyBundle.explain || `전략 · ${strategyBundle.strategy_label}`
    };
  }

  function buildReflection(strategyBundle, primaryState) {
    if (!strategyBundle || strategyBundle.empty || !strategyBundle.reflection) {
      return {
        empty: true,
        message: EMPTY.reflection,
        prompts: [],
        reason: null
      };
    }
    const r = strategyBundle.reflection;
    const prompts = (r.prompts || []).slice(0, 3);
    return {
      empty: false,
      message: null,
      phase: "after",
      strategy: strategyBundle.strategy,
      known: !strategyBundle.generic,
      generic: !!strategyBundle.generic,
      strategy_label: strategyBundle.strategy_label,
      prompts,
      object_path: clean(primaryState && (primaryState.source_path || primaryState.object_path)),
      purpose: r.purpose || LABELS.reflectionHint,
      reason: strategyBundle.explain || `전략 · ${strategyBundle.strategy_label}`,
      max: 3
    };
  }

  function buildWaitingReview(states) {
    const list = (Array.isArray(states) ? states : []).filter((s) => s && !s.error);
    const waiting = list.filter((s) => {
      const status = clean(s.canonical_status);
      const health = s.health && s.health.state;
      if (status === "reviewing") return true;
      if (health === "needs_review") return true;
      if ((status === "completed" || status === "finished") && health === "needs_review") return true;
      return false;
    });

    if (!waiting.length) {
      return {
        empty: true,
        message: EMPTY.review,
        items: []
      };
    }

    const items = waiting.map((s) => {
      const healthReasons = (s.health && s.health.reasons) || [];
      const status = clean(s.canonical_status);
      let reason = healthReasons[0] || "";
      if (!reason) {
        reason = status === "reviewing" ? REASONS.reviewStatus : REASONS.reviewMissing;
      }
      return {
        title: clean(s.title),
        path: clean(s.source_path || s.object_path),
        status,
        health: (s.health && s.health.state) || "",
        attention: (s.attention && s.attention.level) || "",
        reason,
        next_action: s.next_action || null
      };
    });

    return {
      empty: false,
      message: null,
      items,
      reason: "Runtime health / attention — 복기 미완료"
    };
  }

  function candidateSourceSession(candidate) {
    const source = candidate || {};
    const direct = clean(source.source_session);
    if (direct) return direct;
    const links = Array.isArray(source.source_objects) ? source.source_objects : [];
    return clean(links.find((value) => /Reading\/Sessions/i.test(String(value)))) || clean(links[0]);
  }

  function candidateQuality(candidate) {
    const supplied = candidate && candidate.evidence_quality;
    const status = clean(supplied && supplied.status);
    const labels = { thin: "보완 필요", usable: "사용 가능", strong: "근거 충분" };
    if (labels[status]) return { available: true, status, label: labels[status] };
    const confidence = clean(candidate && candidate.confidence);
    if (confidence === "explicit") return { available: true, status: "usable", label: labels.usable };
    if (confidence === "inferred" || confidence === "low") return { available: true, status: "thin", label: labels.thin };
    return { available: false, status: "unavailable", label: "확인 불가" };
  }

  function buildKnowledgeCandidates(candidates) {
    const statusLabel = { proposed: "제안됨", saved: "저장됨", needs_more_evidence: "증거 보강" };
    const items = (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => candidate && Object.prototype.hasOwnProperty.call(statusLabel, clean(candidate.status)))
      .map((candidate) => ({
        candidate_id: clean(candidate.candidate_id),
        title: clean(candidate.title) || LABELS.untitled,
        statement: clean(candidate.statement),
        status: clean(candidate.status),
        status_label: statusLabel[clean(candidate.status)] || "검토 대기",
        source_session: candidateSourceSession(candidate),
        quality: candidateQuality(candidate),
        review_target: "HUB/50 Knowledge.md",
        counts_as_knowledge: false
      }));
    if (!items.length) {
      return {
        empty: true,
        message: EMPTY.knowledge,
        items: [],
        reserved: true,
        counts_as_knowledge: false,
        reason: "Knowledge Explorer Inbox에서 검토할 활성 후보가 없습니다."
      };
    }
    return {
      empty: false,
      message: null,
      items,
      reserved: false,
      counts_as_knowledge: false,
      reason: "후보는 Knowledge Explorer Inbox에서만 승인합니다."
    };
  }

  function buildHistory(pages, limit) {
    const max = Math.max(1, Math.min(Number(limit) || 12, 50));
    const completed = normalizeReadingPages(pages).filter((p) => {
      const s = clean(p.status).toLowerCase();
      return s === "completed" || s === "finished";
    });

    completed.sort((a, b) => {
      const da = clean(a.finished || a.completed_at || a.updated || "") || "";
      const db = clean(b.finished || b.completed_at || b.updated || "") || "";
      if (da && db && da !== db) return db.localeCompare(da);
      const ma = Number(a.mtime) || (a.file && Number(a.file.mtime)) || 0;
      const mb = Number(b.mtime) || (b.file && Number(b.file.mtime)) || 0;
      return mb - ma;
    });

    const items = completed.slice(0, max).map((p) => ({
      title: clean(p.title || p.book_title),
      author: clean(p.author),
      path: clean(p.path || (p.file && p.file.path)),
      rating: p.rating == null || p.rating === "" ? null : Number(p.rating),
      finished: clean(p.finished || p.completed_at).slice(0, 10),
      reason: REASONS.historyCompleted
    }));

    if (!items.length) {
      return { empty: true, message: EMPTY.history, items: [] };
    }
    return { empty: false, message: null, items, reason: REASONS.historyCompleted };
  }

  function buildWorkspaceModel(pages, options) {
    const opts = options || {};
    const evaluated = evaluateReadingStates(pages, opts);
    const pagesByPath = Object.create(null);
    evaluated.pages.forEach((p) => {
      const path = clean(p.path);
      if (path) pagesByPath[path] = p;
    });

    const engine = engineApi();
    let summary = null;
    let primary = null;

    if (evaluated.ok && engine && typeof engine.buildWorkspaceSummary === "function") {
      summary = engine.buildWorkspaceSummary(evaluated.states, "reading", evaluated.context || opts.context || {});
      primary = summary && summary.state ? summary.state : null;
    } else if (evaluated.ok && evaluated.states.length) {
      primary = evaluated.states.find((s) => clean(s.canonical_status) === "reading") || null;
      if (primary && primary.continue_target) {
        summary = {
          empty: false,
          state: primary,
          continue_target: primary.continue_target,
          title: primary.title
        };
      }
    }

    if (!summary) {
      summary = {
        empty: true,
        state: null,
        continue_target: null,
        title: ""
      };
    }

    const today = buildTodayReading(summary, primary, pagesByPath);
    const cont = buildContinueCard(summary, primary, pagesByPath, evaluated.states);
    if (cont.empty && !cont.message) cont.message = EMPTY.continue;

    // Strategy Layer once — powers Guide / Checklist / Reflection
    const strategy = buildStrategyLayer(primary, pagesByPath);

    return Object.freeze({
      schema_version: SCHEMA,
      runtime_ok: evaluated.ok,
      runtime_error: evaluated.error || null,
      empty_messages: EMPTY,
      today,
      continue_reading: cont,
      strategy,
      reading_guide: buildReadingGuide(strategy, primary, pagesByPath),
      reading_checklist: buildReadingChecklist(strategy, primary),
      reflection: buildReflection(strategy, primary),
      waiting_review: buildWaitingReview(evaluated.states),
      stale_reading: buildStaleReading(evaluated.states, pagesByPath),
      finish_soon: buildFinishSoon(evaluated.pages, evaluated.states, pagesByPath),
      queue_ready: buildQueueReady(evaluated.pages),
      knowledge_candidates: buildKnowledgeCandidates(opts.candidates),
      history: buildHistory(evaluated.pages, opts.historyLimit),
      primary_state: primary,
      states: evaluated.states,
      session: evaluated.session,
      summary,
      focus_path: cont.focus_path || null
    });
  }

  /**
   * Shared hub runtime model (single evaluate pass).
   * Callers pass pages + optional session; result cached by hub on window.
   */
  function shareRuntimeModel(pages, options) {
    return buildWorkspaceModel(pages, options || {});
  }

  const api = {
    SCHEMA,
    EMPTY,
    REASONS,
    LABELS,
    REFLECTION_PROMPTS,
    STRATEGY_GUIDE,
    STRATEGY_LABELS,
    FINISH_PROGRESS_MIN,
    PROGRESS_STEPS,
    clean,
    resolveStrategyDirect,
    evaluateReadingStates,
    progressOf,
    progressNumber,
    normalizeProgressStep,
    parseConnectionChips,
    summarizeChecklistProgress,
    buildContinueCard,
    buildTodayReading,
    buildStrategyLayer,
    buildReadingGuide,
    buildReadingChecklist,
    buildReflection,
    buildWaitingReview,
    buildStaleReading,
    buildFinishSoon,
    buildQueueReady,
    candidateSourceSession,
    candidateQuality,
    buildKnowledgeCandidates,
    buildHistory,
    buildWorkspaceModel,
    shareRuntimeModel,
    normalizeReadingPages
  };

  root.ReadingWorkspaceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
