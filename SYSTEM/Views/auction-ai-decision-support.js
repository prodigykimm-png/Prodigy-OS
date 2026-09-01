(function (root) {
  "use strict";

  const STYLE_ID = "prodigy-auction-ai-decision-support-style";

  function coreApi() {
    return root.AuctionDecisionSupportCore || (typeof require === "function" ? require("./auction-decision-support-core.js") : null);
  }

  function aiCoreApi() {
    return root.AuctionAiDecisionSupportCore || (typeof require === "function" ? require("./auction-ai-decision-support-core.js") : null);
  }

  function consumerRuntimeApi() {
    return root.ProdigyAIConsumerRuntime || (typeof require === "function" ? require("./prodigy-ai-consumer-runtime.js") : null);
  }

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function formatWon(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "자료 없음";
    return `${amount.toLocaleString("ko-KR")}원`;
  }

  function formatPercent(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%` : "자료 없음";
  }

  function formatAsOf(value) {
    const raw = clean(value);
    return raw ? raw.replace("T", " ").replace(".000Z", " UTC") : "확인 불가";
  }

  function contextCases(options) {
    const opts = options || {};
    if (Array.isArray(opts.cases)) return opts.cases;
    if (opts.context && Array.isArray(opts.context.cases)) return opts.context.cases;
    if (root.AuctionDecisionMirrorDashboardContext && Array.isArray(root.AuctionDecisionMirrorDashboardContext.cases)) {
      return root.AuctionDecisionMirrorDashboardContext.cases;
    }
    return [];
  }

  function projectForAuction(auction, options) {
    const api = coreApi();
    if (!api || typeof api.buildDecisionSupportProjection !== "function") {
      return Object.freeze({
        status: "unavailable",
        analysis_as_of: null,
        current_time_only: true,
        cohort: Object.freeze({ region_sido: "", region_sigungu: "", property_type: "" }),
        cohort_count: 0,
        winning_bid_ratios: Object.freeze({ sample_count: 0, average_percent: null, median_percent: null }),
        personal_lost_bid_gaps: Object.freeze({ sample_count: 0, average_gap_won: null, average_gap_percent: null }),
        personal_won_history: Object.freeze({ sample_count: 0 }),
        competition_references: Object.freeze({ status: "unavailable", message: "판단 보조 구성요소를 불러오지 못했습니다." }),
        warnings: Object.freeze(["판단 보조 구성요소를 불러오지 못했습니다."])
      });
    }
    const opts = options || {};
    return api.buildDecisionSupportProjection({
      currentAuction: auction,
      cases: contextCases(opts),
      cohortPolicy: opts.cohortPolicy,
      resultPeriod: opts.resultPeriod,
      generationStartedAt: opts.generationStartedAt || new Date().toISOString()
    });
  }

  function ensureStyles() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const compactMax = root.ProdigyTokens && root.ProdigyTokens.RESPONSIVE_BREAKPOINTS && root.ProdigyTokens.RESPONSIVE_BREAKPOINTS.compactMax;
    if (!Number.isFinite(compactMax)) throw new Error("Auction decision support requires the shared compact breakpoint.");
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .modal .auction-ai-decision-support-modal { max-width: min(44rem, 100%); }
      .auction-ai-decision-support-modal h2 { margin-block: 0 var(--ke-space-3, 8px); }
      .auction-ai-decision-support-modal h3 { margin: 0 0 var(--ke-space-2, 4px); font-size: var(--ke-type-heading, .92rem); line-height: var(--ke-leading-body, 1.45); }
      .auction-ai-decision-support-intro, .auction-ai-decision-support-meta, .auction-ai-decision-support-empty { color: var(--ke-color-muted, var(--text-muted)); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
      .auction-ai-decision-support-section { border-top: 1px solid var(--ke-color-border, var(--background-modifier-border)); margin-top: var(--ke-space-5, 16px); padding-top: var(--ke-space-4, 12px); }
      .auction-ai-decision-support-metrics { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ke-space-2, 4px) var(--ke-space-4, 12px); margin: 0; }
      .auction-ai-decision-support-metrics dt { color: var(--ke-color-muted, var(--text-muted)); min-inline-size: 0; overflow-wrap: anywhere; }
      .auction-ai-decision-support-metrics dd { margin: 0; text-align: end; overflow-wrap: anywhere; }
      .auction-ai-decision-support-list { margin: 0; padding-inline-start: 1.2rem; line-height: var(--ke-leading-body, 1.45); }
      .auction-ai-decision-support-notice { border-inline-start: 2px solid var(--ke-color-accent, var(--text-accent)); padding-inline-start: var(--ke-space-3, 8px); }
      .auction-ai-decision-support-transfer { border-inline-start: 2px solid var(--ke-color-accent, var(--text-accent)); padding-inline-start: var(--ke-space-3, 8px); }
      .auction-ai-decision-support-controls { display: grid; gap: var(--ke-space-3, 8px); }
      .auction-ai-decision-support-opt-in { display: flex; align-items: flex-start; gap: var(--ke-space-2, 4px); min-block-size: var(--ke-touch-target, 44px); line-height: var(--ke-leading-body, 1.45); }
      .auction-ai-decision-support-opt-in input { flex: 0 0 auto; margin-block-start: var(--ke-space-1, 2px); }
      .auction-ai-decision-support-controls button { min-block-size: var(--ke-touch-target, 44px); }
      .auction-ai-decision-support-error { color: var(--ke-color-error, var(--text-error)); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
      .auction-ai-decision-support-draft { border-inline-start: 2px solid var(--ke-color-accent, var(--text-accent)); padding-inline-start: var(--ke-space-3, 8px); }
      .auction-ai-decision-support-draft-headline { margin: 0; font-size: var(--ke-type-heading, .92rem); line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; }
      .auction-ai-decision-support-draft-copy { margin: var(--ke-space-2, 4px) 0 0; line-height: var(--ke-leading-body, 1.45); overflow-wrap: anywhere; white-space: pre-wrap; }
      .auction-ai-decision-support-citation { color: var(--ke-color-muted, var(--text-muted)); font-size: var(--ke-type-label, .72rem); }
      @media (max-width: ${compactMax}px) {
        .auction-ai-decision-support-metrics { grid-template-columns: minmax(0, 1fr); gap: var(--ke-space-1, 2px); }
        .auction-ai-decision-support-metrics dd { text-align: start; margin-block-end: var(--ke-space-2, 4px); }
      }
    `;
    root.document.head.appendChild(style);
  }

  function addParagraph(parent, text, className) {
    return parent.createEl("p", { text, attr: className ? { class: className } : {} });
  }

  function addMetrics(parent, entries) {
    const list = parent.createEl("dl", { attr: { class: "auction-ai-decision-support-metrics" } });
    entries.forEach(([label, value]) => {
      list.createEl("dt", { text: label });
      list.createEl("dd", { text: value });
    });
    return list;
  }

  function addSection(parent, title) {
    const section = parent.createEl("section", { attr: { class: "auction-ai-decision-support-section" } });
    section.createEl("h3", { text: title });
    return section;
  }

  function renderProjection(container, projection) {
    if (!container || typeof container.createEl !== "function") return container;
    const view = projection || {};
    container.empty();
    if (typeof container.addClass === "function") container.addClass("auction-ai-decision-support-modal");
    container.createEl("h2", { text: "판단 보조 · 근거 미리보기" });
    addParagraph(container, "현재 사건을 자동으로 결정하지 않습니다. 같은 시·군·구와 물건 유형의 정규 결과, 그리고 내 기록을 근거로 확인할 지점을 정리합니다.", "auction-ai-decision-support-intro");

    const cohort = view.cohort || {};
    const basis = addSection(container, "분석 기준");
    addParagraph(basis, `${cohort.region_sido || "시·도 미확인"} ${cohort.region_sigungu || "시·군·구 미확인"} · ${cohort.property_type || "물건 유형 미확인"}`, "auction-ai-decision-support-meta");
    addParagraph(basis, `분석 시작: ${formatAsOf(view.analysis_as_of)} · 정확히 일치한 사건 ${Number(view.cohort_count) || 0}건`, "auction-ai-decision-support-meta");

    const market = view.winning_bid_ratios || {};
    const marketSection = addSection(container, "시장 결과");
    if (!market.sample_count) {
      addParagraph(marketSection, "정확히 일치하는 결과가 없습니다. 지역·물건 유형을 넓혀 추정하지 않습니다.", "auction-ai-decision-support-empty");
    } else {
      const percentiles = market.ratio_percentiles || {};
      addMetrics(marketSection, [
        ["분석 표본", `${market.sample_count}건 · ${market.sample_state === "established" ? "충분한 표본" : "소표본"}`],
        ["평균 낙찰가율", formatPercent(market.average_percent)],
        ["중앙 낙찰가율", formatPercent(market.median_percent)],
        ["분포(Q25–Q75)", `${formatPercent(percentiles.q25)} – ${formatPercent(percentiles.q75)}`]
      ]);
    }

    const personal = addSection(container, "내 기록");
    const lost = view.personal_lost_bid_gaps || {};
    const won = view.personal_won_history || {};
    if (!lost.sample_count && !won.sample_count) {
      addParagraph(personal, "내 입찰가가 기록된 낙찰·패찰 이력이 없습니다. 기록이 생기면 이 영역에만 표시합니다.", "auction-ai-decision-support-empty");
    } else {
      const entries = [];
      if (lost.sample_count) entries.push(["기록된 패찰", `${lost.sample_count}건 · 평균 차이 ${formatWon(lost.average_gap_won)} (${formatPercent(lost.average_gap_percent)})`]);
      if (won.sample_count) entries.push(["기록된 낙찰", `${won.sample_count}건`]);
      addMetrics(personal, entries);
    }

    const references = view.competition_references || {};
    const competition = addSection(container, "경쟁 가격 참고");
    if (references.status === "available" && references.appraisal_scaled_won) {
      addParagraph(competition, "감정가 환산으로 표시한 동일 표본의 낙찰가율 분포 참고치입니다. 입찰가 추천이 아닙니다.", "auction-ai-decision-support-meta");
      addMetrics(competition, [
        ["Q25 환산", formatWon(references.appraisal_scaled_won.q25)],
        ["중앙값 환산", formatWon(references.appraisal_scaled_won.median)],
        ["Q75 환산", formatWon(references.appraisal_scaled_won.q75)]
      ]);
    } else {
      addParagraph(competition, references.message || "표본이 부족해 경쟁 가격 참고치를 표시하지 않습니다.", "auction-ai-decision-support-empty");
    }

    const notices = addSection(container, "해석 제한");
    const list = notices.createEl("ul", { attr: { class: "auction-ai-decision-support-list auction-ai-decision-support-notice" } });
    const warnings = Array.isArray(view.warnings) && view.warnings.length ? view.warnings : ["자동 판단이나 상태 변경을 수행하지 않습니다."];
    warnings.forEach((warning) => list.createEl("li", { text: warning }));
    addParagraph(notices, "원본 사건과 개인 판단은 변경되지 않으며, 최종 결정은 경매 카드에서 직접 기록합니다.", "auction-ai-decision-support-meta");
    return container;
  }

  function renderAiDraft(parent, session) {
    const draft = session.draft;
    if (!draft) return;
    const section = addSection(parent, "AI 요약 결과");
    addParagraph(section, session.providerName ? `제공자: ${session.providerName} · 이 결과는 현재 화면의 세션에만 유지됩니다.` : "이 결과는 현재 화면의 세션에만 유지됩니다.", "auction-ai-decision-support-meta");
    const box = section.createEl("div", { attr: { class: "auction-ai-decision-support-draft" } });
    box.createEl("h4", { text: draft.headline, attr: { class: "auction-ai-decision-support-draft-headline" } });
    addParagraph(box, draft.summary, "auction-ai-decision-support-draft-copy");
    if (draft.personal_context) {
      addParagraph(box, "내 기록 맥락", "auction-ai-decision-support-meta");
      addParagraph(box, draft.personal_context, "auction-ai-decision-support-draft-copy");
    }
    if (draft.evidence.length) {
      addParagraph(box, "근거", "auction-ai-decision-support-meta");
      const evidence = box.createEl("ul", { attr: { class: "auction-ai-decision-support-list" } });
      draft.evidence.forEach((entry) => {
        const citation = session.aiInput && Array.isArray(session.aiInput.citation_refs)
          ? session.aiInput.citation_refs.find((item) => item.source_ref === entry.source_ref)
          : null;
        const row = evidence.createEl("li");
        row.createEl("span", { text: `근거 · ${citation ? citation.label : "확인된 출처"}`, attr: { class: "auction-ai-decision-support-citation" } });
        row.createEl("span", { text: ` ${entry.statement}` });
      });
    }
    if (draft.cautions.length) {
      addParagraph(box, "확인 필요", "auction-ai-decision-support-meta");
      const cautions = box.createEl("ul", { attr: { class: "auction-ai-decision-support-list" } });
      draft.cautions.forEach((item) => cautions.createEl("li", { text: item }));
    }
  }

  function renderAiControls(parent, session) {
    const section = addSection(parent, "AI 보조 요약 (선택)");
    const controls = section.createEl("div", { attr: { class: "auction-ai-decision-support-controls" } });
    addParagraph(controls, "연결된 AI에는 지역·결과 요약과 근거 식별자가 전송됩니다. 내 입찰 기록은 체크할 때만 포함되며, 결과는 Vault에 저장하지 않습니다.", "auction-ai-decision-support-meta auction-ai-decision-support-transfer");
    const label = controls.createEl("label", { attr: { class: "auction-ai-decision-support-opt-in" } });
    const checkbox = label.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = Boolean(session.includePersonalExcerpt);
    checkbox.onchange = () => {
      session.includePersonalExcerpt = Boolean(checkbox.checked);
      session.draft = null;
      session.error = "";
      renderSession(session);
    };
    label.createEl("span", { text: "내 입찰 기록을 AI 요약에 포함" });
    const button = controls.createEl("button", {
      text: session.loading ? "AI 요약 생성 중…" : "AI 요약 생성",
      attr: { type: "button", class: "auction-ai-decision-support-action" }
    });
    button.disabled = Boolean(session.loading);
    button.onclick = () => runAiSummary(session);
    if (session.error) addParagraph(controls, session.error, "auction-ai-decision-support-error");
    renderAiDraft(parent, session);
  }

  function renderSession(session) {
    ensureStyles();
    renderProjection(session.modal.contentEl, session.projection);
    renderAiControls(session.modal.contentEl, session);
  }

  function safeAiError(error) {
    const message = clean(error && error.message);
    if (message === "연결된 Codex 또는 Antigravity를 찾지 못했습니다.") return message;
    return "AI 응답을 검증하지 못했습니다. 위의 결정 보조 근거는 그대로 확인할 수 있습니다.";
  }

  async function runAiSummary(session) {
    if (session.loading) return;
    session.loading = true;
    session.error = "";
    renderSession(session);
    try {
      const core = aiCoreApi();
      const runtime = consumerRuntimeApi();
      if (!core || !runtime) throw new Error("AI 보조 구성요소가 준비되지 않았습니다.");
      const input = core.buildAiDecisionSupportInput(session.projection, { includePersonalExcerpt: session.includePersonalExcerpt });
      session.aiInput = input;
      const response = await runtime.requestStructured({
        app: session.app,
        consumerId: "auction.decision_support",
        prompt: core.buildAiDecisionSupportPrompt(input),
        schema: core.AI_DECISION_SUPPORT_SCHEMA
      });
      const payload = response.payload;
      const validation = core.validateAiDecisionSupportDraft(payload, input);
      if (!validation.ok) throw new Error("AI 응답 형식을 확인할 수 없습니다.");
      session.draft = validation.value;
      session.providerName = runtime.providerMetadata(response).provider || "AI Runtime";
    } catch (error) {
      session.draft = null;
      session.error = safeAiError(error);
    } finally {
      session.loading = false;
      renderSession(session);
    }
  }

  function openForAuction(app, auction, options) {
    const opts = options || {};
    const projection = projectForAuction(auction, opts);
    if (!root.obsidian || !root.obsidian.Modal) return projection;
    ensureStyles();
    const modal = new root.obsidian.Modal(app);
    const session = {
      app,
      auction,
      projection,
      modal,
      includePersonalExcerpt: false,
      loading: false,
      error: "",
      draft: null,
      aiInput: null,
      providerName: ""
    };
    modal.onOpen = function () {
      renderSession(session);
    };
    modal.onClose = function () {
      this.contentEl.empty();
      const returnFocus = opts.returnFocus;
      if (returnFocus && returnFocus.isConnected !== false && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
    };
    modal.open();
    return projection;
  }

  const api = Object.freeze({ projectForAuction, renderProjection, openForAuction, formatWon, formatPercent, renderAiControls, validateSessionDraft: (payload, input) => aiCoreApi()?.validateAiDecisionSupportDraft(payload, input) });
  root.AuctionAiDecisionSupport = api;
  root.AuctionAIDecisionSupport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
