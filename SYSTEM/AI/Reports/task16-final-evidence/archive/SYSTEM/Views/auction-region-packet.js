(function (root) {
  "use strict";

  const METRICS = Object.freeze([
    { key: "sale_volume_3m", label: "최근 3개월 거래량", unit: "건" },
    { key: "sale_price_change_yoy", label: "매매가 변동 YoY", unit: "%" },
    { key: "move_in_24m", label: "24개월 입주 예정", unit: "세대" },
    { key: "households", label: "세대수", unit: "세대" },
    { key: "land_price_trend_yoy", label: "지가 추세 증감률", unit: "%" }
  ]);
  const RESEARCH_SECTIONS = Object.freeze([
    { key: "summary", label: "한 줄 요약" },
    { key: "market", label: "시장·공급" },
    { key: "supply_pipeline", label: "중장기 공급" },
    { key: "transport_life", label: "교통·생활" },
    { key: "risks", label: "리스크·주의" },
    { key: "site_visit", label: "임장 포인트" },
    { key: "sources", label: "출처·리서치" }
  ]);
  const STYLE_ID = "prodigy-auction-region-packet-style";
  const METRICS_MAX_AGE_DAYS = 183;
  const SOURCE_MAX_AGE_DAYS = 90;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const REGION_EXPERIENCE_MODULE_PATHS = Object.freeze([
    "SYSTEM/Views/region-experience-contract.js",
    "SYSTEM/Views/journal-core.js",
    "SYSTEM/Views/region-experience-store.js",
    "SYSTEM/Views/ai-provider-response.js",
    "SYSTEM/Views/ai-provider-schema.js",
    "SYSTEM/Views/ai-provider-error-policy.js",
    "SYSTEM/Views/ai-provider-fallback.js",
    "SYSTEM/Views/codex-exec-service.js",
    "SYSTEM/Views/antigravity-exec-service.js",
    "SYSTEM/Views/ai-provider-service.js",
    "SYSTEM/Views/prodigy-config-service.js",
    "SYSTEM/Views/project-workflow-draft-service.js",
    "SYSTEM/Views/region-experience-provider-endpoint-guard.js",
    "SYSTEM/Views/region-experience-ai.js",
    "SYSTEM/Views/journal-store.js",
    "SYSTEM/Views/daily-reflection-knowledge-handoff.js",
    "SYSTEM/Views/knowledge-explorer-registry.js",
    "SYSTEM/Views/knowledge-candidate-core.js",
    "SYSTEM/Views/evidence-quality-core.js",
    "SYSTEM/Views/knowledge-candidate-store.js",
    "SYSTEM/Views/region-experience-handoff.js",
    "SYSTEM/Views/region-experience-modal.js"
  ]);
  let regionExperienceLoading = null;

  function tokenApi() {
    const api = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
    if (!api || !api.BREAKPOINTS || !api.CONTROL_HEIGHTS) throw new Error("ProdigyTokens를 먼저 불러와야 합니다.");
    return api;
  }

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function decisionContextApi() {
    return root.RegionDecisionContextCore || (typeof require === "function" ? require("./region-decision-context-core.js") : null);
  }

  function researchApi() {
    return root.AuctionRealEstateResearch || null;
  }

  function researchCore() {
    return root.AuctionRealEstateResearchCore || null;
  }

  function projectResearchAction(packageInfo) {
    if (!packageInfo || !packageInfo.pkg) return Object.freeze({ state: "missing", label: "조사 필요", show: true });
    if (packageInfo.stale === true) return Object.freeze({ state: "stale", label: "자료 갱신 필요", show: true });
    const providers = packageInfo.pkg.providers && typeof packageInfo.pkg.providers === "object" ? Object.values(packageInfo.pkg.providers) : [];
    const statuses = providers.map((provider) => clean(provider && provider.status));
    if (statuses.includes("needs_selection")) return Object.freeze({ state: "needs_selection", label: "대상 선택 필요", show: true });
    if (statuses.includes("needs_identifier")) return Object.freeze({ state: "needs_identifier", label: "식별 정보 필요", show: true });
    if (statuses.includes("failed")) return Object.freeze({ state: "failed", label: "조사 실패", show: true });
    return Object.freeze({ state: "ready", label: "조사 자료", show: false });
  }

  function researchContext(packageInfo) {
    const action = projectResearchAction(packageInfo);
    const api = researchCore();
    const pkg = packageInfo && packageInfo.pkg;
    return Object.freeze({
      ...action,
      observed_at: clean(pkg && pkg.observed_at) || null,
      evidence_summary: pkg && api && typeof api.evidenceSummary === "function" ? api.evidenceSummary(pkg) : null
    });
  }

  async function researchActionForAuction(app, auction) {
    const api = researchApi();
    if (!api || typeof api.readLatestPackage !== "function") return projectResearchAction(null);
    return projectResearchAction(await api.readLatestPackage(app, auction));
  }

  function toDisplayText(value) {
    return clean(value)
      .replace(/^\s*>\s?/gmu, "")
      .replace(/\*\*([^*]+)\*\*/gu, "$1")
      .replace(/`([^`]+)`/gu, "$1")
      .replace(/^\s*-\s*\[[ xX]\]\s*/gmu, "• ")
      .replace(/^\s*-\s+/gmu, "• ");
  }

  function parseContractDate(value, requireMonthStart) {
    const raw = clean(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z)?$/u);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    if (requireMonthStart && day !== 1) return null;
    return timestamp;
  }

  function dateCheck(checks, key, label, value, maxAgeDays, requireMonthStart) {
    const parsed = parseContractDate(value, requireMonthStart);
    if (parsed === null) {
      checks.push({ kind: value ? `invalid_${key}` : `missing_${key}`, message: value ? `${label} 형식을 확인해야 합니다.` : `${label}이 없어 최신성 판단을 보류합니다.` });
      return;
    }
    if ((Date.now() - parsed) / DAY_MS > maxAgeDays) checks.push({ kind: `stale_${key}`, message: `${label}이 ${maxAgeDays}일을 넘겨 최신성 확인이 필요합니다.` });
  }

  function ensureStyles() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const tokens = tokenApi();
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .modal .auction-region-packet-modal { max-width: min(44rem, 100%); }
      .auction-region-packet-modal h2 { margin-block: 0 var(--size-4-3); }
      .auction-region-packet-modal h3 { margin-block: 0 var(--size-4-2); font-size: var(--font-ui-medium); }
      .auction-region-packet-section { border-top: 1px solid var(--background-modifier-border); margin-top: var(--size-4-4); padding-top: var(--size-4-3); }
      .auction-region-packet-section:first-of-type { margin-top: var(--size-4-3); }
      .auction-region-packet-title { font-weight: var(--font-semibold); margin-block: 0 var(--size-4-1); }
      .auction-region-packet-meta, .auction-region-packet-empty { color: var(--text-muted); margin-block: 0; }
      .auction-region-packet-content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--line-height-normal); }
      .auction-region-packet-metrics { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--size-4-2) var(--size-4-4); margin: var(--size-4-3) 0 0; }
      .auction-region-packet-metrics dt { color: var(--text-muted); }
      .auction-region-packet-metrics dd { margin-inline-start: 0; text-align: end; }
      .auction-region-packet-list { margin-block: 0; padding-inline-start: var(--size-4-6); }
      .auction-region-packet-list li { overflow-wrap: anywhere; }
      .auction-region-packet-checks { background: var(--background-secondary); border-radius: var(--radius-s); padding-inline: var(--size-4-3); padding-bottom: var(--size-4-3); }
      .auction-region-packet-authority { color: var(--text-accent); font-weight: var(--font-semibold); margin-top: 0; }
      .auction-region-packet-error { color: var(--text-error); overflow-wrap: anywhere; }
      .auction-region-packet-actions { display: flex; gap: var(--size-4-2); flex-wrap: wrap; }
      .auction-decision-board-status { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--size-4-2); }
      .auction-decision-board-status div { min-inline-size: 0; padding: var(--size-4-2); border-inline-start: 2px solid var(--background-modifier-border); background: var(--background-secondary); overflow-wrap: anywhere; }
      .auction-decision-board-status span, .auction-decision-board-fact-kind { display: block; color: var(--text-muted); font-size: var(--font-ui-smaller); }
      .auction-decision-board-questions { display: grid; gap: var(--size-4-3); }
      .auction-decision-board-question { min-inline-size: 0; padding-block: var(--size-4-2); border-bottom: 1px solid var(--background-modifier-border); }
      .auction-decision-board-question:last-child { border-bottom: 0; }
      .auction-decision-board-question h4 { margin-block: 0 var(--size-4-2); font-size: var(--font-ui-small); overflow-wrap: anywhere; }
      .auction-decision-board-facts { display: grid; gap: var(--size-4-2); margin: 0; padding: 0; list-style: none; }
      .auction-decision-board-fact { min-inline-size: 0; overflow-wrap: anywhere; }
      .auction-decision-board-action { min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; }
      .auction-region-packet-modal button.mod-cta { min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; margin-top: var(--size-4-4); }
      @media (max-width: ${tokens.RESPONSIVE_BREAKPOINTS.compactMax}px) {
        .auction-decision-board-status { grid-template-columns: minmax(0, 1fr); }
        .auction-region-packet-metrics { grid-template-columns: minmax(0, 1fr); gap: var(--size-4-1); }
        .auction-region-packet-metrics dd { text-align: start; }
        .auction-region-packet-actions { display: grid; grid-template-columns: minmax(0, 1fr); }
        .auction-region-packet-actions button { inline-size: 100%; }
      }
    `;
    root.document.head.appendChild(style);
  }

  function fallbackRequire(moduleName) {
    if (moduleName === "node:path") {
      return {
        posix: { isAbsolute: (value) => String(value || "").startsWith("/") },
        win32: { isAbsolute: (value) => /^[A-Za-z]:[\\/]/.test(String(value || "")) }
      };
    }
    throw new Error(`지원하지 않는 지역 경험 모듈 의존성: ${moduleName}`);
  }

  async function loadRegionExperienceModules(app) {
    if (typeof root.openRegionExperienceModal === "function") return;
    if (regionExperienceLoading) return regionExperienceLoading;
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function" || typeof app.vault.read !== "function") throw new Error("지역 경험 모듈을 읽을 수 없습니다.");
    regionExperienceLoading = (async () => {
      for (const modulePath of REGION_EXPERIENCE_MODULE_PATHS) {
        const file = app.vault.getAbstractFileByPath(modulePath);
        if (!file) throw new Error(`지역 경험 모듈을 찾을 수 없습니다: ${modulePath}`);
        const source = await app.vault.read(file);
        const module = { exports: {} };
        const localRequire = typeof require === "function" ? require : fallbackRequire;
        (new Function("module", "exports", "require", "window", "globalThis", source))(module, module.exports, localRequire, root, root);
      }
      if (typeof root.openRegionExperienceModal !== "function") throw new Error("지역 경험 모달을 불러오지 못했습니다.");
    })();
    try {
      await regionExperienceLoading;
    } catch (error) {
      regionExperienceLoading = null;
      throw error;
    }
  }

  function canonicalRegion(packet) {
    const identity = packet && packet.region && packet.region.identity || {};
    const key = clean(identity.region_key);
    const sido = clean(identity.sido);
    const sigungu = clean(identity.sigungu);
    const path = clean(identity.path);
    if (!key || !sido || !sigungu || !path) return null;
    return { type: "auction_region", region_key: key, region_sido: sido, region_sigungu: sigungu, path, wiki_link: `[[${path.replace(/\.md$/i, "")}]]` };
  }

  function unavailable(message, checks) {
    return Object.freeze({
      status: "unavailable",
      decision_authority: "human_required",
      message,
      auction_context: Object.freeze({ region_key: "", dong: "", address: "" }),
      region: null,
      checks: Object.freeze(checks || [{ kind: "missing_region", message }])
    });
  }

  function packetChecks(auction, region) {
    const checks = [];
    const provenance = region.provenance || {};
    if (provenance.verification_status !== "verified") checks.push({ kind: "verification_pending", message: "공식 지표는 아직 사람 검증 전입니다." });
    dateCheck(checks, "metrics_as_of", "지표 기준일", provenance.metrics_as_of, METRICS_MAX_AGE_DAYS, true);
    dateCheck(checks, "source_as_of", "수집 기준일", provenance.source_as_of, SOURCE_MAX_AGE_DAYS, false);
    if (!region.transit || !region.transit.available) checks.push({ kind: region.transit && region.transit.malformed ? "malformed_transit" : "missing_transit", message: region.transit && region.transit.malformed ? "도시철도 정보 형식을 확인해야 합니다." : "확인된 도시철도 정보가 아직 없습니다." });
    if (!region.research || !region.research.site_visit) checks.push({ kind: "missing_site_visit", message: "물건 주변 보행·소음·출입 동선은 현장 확인이 필요합니다." });
    if (!region.research || !region.research.risks) checks.push({ kind: "missing_risks", message: "등록된 지역 리스크가 없어 별도 확인이 필요합니다." });
    if (clean(auction && auction.region_dong)) checks.push({ kind: "dong_scope", message: `${clean(auction.region_dong)}의 미시 입지 차이는 시군구 자료와 별도로 확인합니다.` });
    return checks;
  }

  function projectPacket(auction, source, options) {
    const opts = options || {};
    const regionCore = root.AuctionRegionCore;
    const projectionCore = root.RegionExplorerProjection;
    const regionKey = regionCore && typeof regionCore.regionKey === "function" ? regionCore.regionKey(auction) : "";
    if (!regionKey) return unavailable("경매의 시·도와 시·군·구 정보가 없어 지역 판단 패킷을 준비할 수 없습니다.");
    const expectedPath = regionCore && typeof regionCore.regionNotePath === "function" ? regionCore.regionNotePath(auction) : "";
    if (!source || source.path !== expectedPath || typeof source.body !== "string") return unavailable("경매의 정확한 지역 분석 자료가 없습니다.");
    if (!projectionCore || typeof projectionCore.projectRegionSources !== "function") return unavailable("지역 분석 자료를 읽는 구성요소를 불러오지 못했습니다.");
    const projection = projectionCore.projectRegionSources([source]);
    const region = projection.rows.find((row) => row && row.identity && row.identity.region_key === regionKey);
    if (!region) {
      const diagnostics = Array.isArray(projection.diagnostics) ? projection.diagnostics : [];
      return unavailable("경매와 일치하는 지역 분석 자료가 없습니다.", diagnostics.map((item) => ({ kind: item.code || "invalid_region", message: item.message || "지역 자료 형식을 확인해야 합니다." })));
    }
    const contextApi = decisionContextApi();
    const decisionContext = contextApi && typeof contextApi.projectRegionDecisionContext === "function"
      ? contextApi.projectRegionDecisionContext({ region, auction, research: opts.research || null, outcome: opts.outcome || null, conflicts: opts.conflicts || [] })
      : null;
    return Object.freeze({
      status: "ready",
      decision_authority: "human_required",
      message: null,
      auction_context: Object.freeze({ region_key: regionKey, dong: clean(auction && auction.region_dong), address: clean(auction && auction.address) }),
      region,
      decision_context: decisionContext,
      research: opts.research || null,
      checks: Object.freeze(packetChecks(auction, region))
    });
  }

  function formatMetric(metric) {
    if (!metric || metric.value === null || metric.value === undefined) return metric && metric.availability ? metric.availability : "자료 없음";
    const value = Number(metric.value);
    if (!Number.isFinite(value)) return "자료 없음";
    return Number.isInteger(value) ? value.toLocaleString("ko-KR") : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }

  function addSection(parent, title, content) {
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section" } });
    section.createEl("h3", { text: title });
    const displayText = toDisplayText(content);
    if (!displayText) {
      section.createEl("p", { text: "등록된 근거가 없습니다.", attr: { class: "auction-region-packet-empty" } });
      return section;
    }
    section.createEl("div", { text: displayText, attr: { class: "auction-region-packet-content" } });
    return section;
  }

  function addMetrics(parent, packet) {
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section" } });
    section.createEl("h3", { text: "기준 수치" });
    const provenance = packet.region.provenance || {};
    section.createEl("p", { text: `기준일: ${provenance.metrics_as_of || "미확인"} · 검증 상태: ${provenance.verification_status || "미확인"}`, attr: { class: "auction-region-packet-meta" } });
    const list = section.createEl("dl", { attr: { class: "auction-region-packet-metrics" } });
    METRICS.forEach((definition) => {
      const metric = packet.region.metrics && packet.region.metrics[definition.key];
      list.createEl("dt", { text: definition.label });
      list.createEl("dd", { text: `${formatMetric(metric)}${metric && metric.value !== null && metric.value !== undefined ? ` ${definition.unit}` : ""}` });
    });
  }

  function addTransit(parent, packet) {
    const transit = packet.region.transit || {};
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section" } });
    section.createEl("h3", { text: "확인된 도시철도" });
    if (!transit.available) {
      section.createEl("p", { text: transit.malformed ? "정보 확인 불가" : "확인된 도시철도 정보 없음", attr: { class: "auction-region-packet-empty" } });
      return;
    }
    const list = section.createEl("ul", { attr: { class: "auction-region-packet-list" } });
    transit.lines.forEach((line) => list.createEl("li", { text: `${line.line} · ${line.stations.join(", ")}` }));
  }

  function addChecks(parent, packet) {
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section auction-region-packet-checks" } });
    section.createEl("h3", { text: "확인 필요" });
    section.createEl("p", { text: "이 패킷은 입찰 추천이 아닙니다. 사람이 근거와 현장을 확인해 최종 판단합니다.", attr: { class: "auction-region-packet-authority" } });
    const list = section.createEl("ul", { attr: { class: "auction-region-packet-list" } });
    packet.checks.forEach((check) => list.createEl("li", { text: check.message }));
  }

  function addBoardStatus(parent, packet) {
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section" } });
    section.createEl("h3", { text: "근거 상태" });
    const context = packet.decision_context || {};
    const trust = context.trust || {};
    const research = packet.research || {};
    const grid = section.createEl("div", { attr: { class: "auction-decision-board-status" } });
    [
      ["지역 기준일", trust.metrics_as_of || "자료 없음"],
      ["검증 상태", trust.verification_status === "verified" ? "검증 완료" : trust.verification_status ? "검증 전" : "자료 없음"],
      ["출처", trust.source_ref || "자료 없음"],
      ["부동산 조사", research.label || "조사 필요"]
    ].forEach(([label, value]) => {
      const item = grid.createEl("div");
      item.createEl("span", { text: label });
      item.createEl("strong", { text: value });
    });
  }

  function addBoardQuestions(parent, packet) {
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section" } });
    section.createEl("h3", { text: "지역 판단 맥락" });
    const questions = packet.decision_context && Array.isArray(packet.decision_context.questions) ? packet.decision_context.questions : [];
    const grid = section.createEl("div", { attr: { class: "auction-decision-board-questions" } });
    questions.forEach((question) => {
      const item = grid.createEl("article", { attr: { class: "auction-decision-board-question" } });
      item.createEl("h4", { text: question.label });
      const facts = Array.isArray(question.facts) ? question.facts.slice(0, 3) : [];
      if (!facts.length) {
        item.createEl("p", { text: "근거 부족", attr: { class: "auction-region-packet-empty" } });
        return;
      }
      const list = item.createEl("ul", { attr: { class: "auction-decision-board-facts" } });
      facts.forEach((entry) => {
        const row = list.createEl("li", { attr: { class: "auction-decision-board-fact" } });
        row.createEl("span", { text: entry.kind, attr: { class: "auction-decision-board-fact-kind" } });
        row.createEl("span", { text: entry.text });
      });
    });
  }

  function addBoardChecks(parent, packet) {
    const checks = packet.decision_context && Array.isArray(packet.decision_context.checks) ? packet.decision_context.checks : [];
    if (!checks.length) return;
    const section = parent.createEl("section", { attr: { class: "auction-region-packet-section auction-region-packet-checks" } });
    section.createEl("h3", { text: "확인할 항목" });
    const list = section.createEl("ul", { attr: { class: "auction-region-packet-list" } });
    checks.forEach((check) => list.createEl("li", { text: check.message }));
  }

  function openReferenceModal(app, auction, context, returnFocus) {
    if (!root.obsidian || !root.obsidian.Modal || !root.AuctionDecisionPacket) throw new Error("참고 근거를 불러오지 못했습니다.");
    const modal = new root.obsidian.Modal(app);
    modal.onOpen = function () {
      this.contentEl.empty();
      this.contentEl.addClass("auction-region-packet-modal");
      this.contentEl.createEl("h2", { text: "참고 근거" });
      root.AuctionDecisionPacket.renderForAuction(this.contentEl, { app, auction, context });
    };
    modal.onClose = function () {
      this.contentEl.empty();
      if (returnFocus && returnFocus.isConnected !== false && typeof returnFocus.focus === "function") returnFocus.focus({ preventScroll: true });
    };
    modal.open();
    return modal;
  }

  class RegionPacketModal extends (root.obsidian && root.obsidian.Modal ? root.obsidian.Modal : class {}) {
    constructor(app, packet, options, auction) {
      super(app);
      this.app = app;
      this.packet = packet;
      this.options = options || {};
      this.returnFocus = this.options.returnFocus || null;
      this.auction = auction || null;
    }

    onOpen() {
      ensureStyles();
      const content = this.contentEl;
      content.empty();
      content.addClass("auction-region-packet-modal");
      content.createEl("h2", { text: "판단 보드" });
      if (this.packet.status !== "ready") {
        content.createEl("p", { text: this.packet.message, attr: { class: "auction-region-packet-error", role: "alert" } });
        addChecks(content, this.packet);
        return;
      }
      const identity = this.packet.region.identity;
      const context = this.packet.auction_context;
      content.createEl("p", { text: `${identity.title}${context.dong ? ` · ${context.dong}` : ""}`, attr: { class: "auction-region-packet-title" } });
      content.createEl("p", { text: "사실과 확인 상태를 정리합니다. 최종 판단과 기록은 경매 카드에서 수행합니다.", attr: { class: "auction-region-packet-authority" } });
      addBoardStatus(content, this.packet);
      addBoardQuestions(content, this.packet);
      addBoardChecks(content, this.packet);
      const detail = content.createEl("section", { attr: { class: "auction-region-packet-section" } });
      detail.createEl("h3", { text: "상세 및 기록" });
      const actions = detail.createEl("div", { attr: { class: "auction-region-packet-actions" } });
      if (researchApi() && typeof researchApi().openForAuction === "function") {
        const researchButton = actions.createEl("button", { text: "조사 자료 보기", attr: { type: "button", class: "auction-decision-board-action" } });
        researchButton.onclick = async () => {
          try {
            await researchApi().openForAuction(this.app, this.auction, { returnFocus: researchButton, onApplied: this.options.onApplied });
          } catch (error) {
            if (root.Notice) new root.Notice(error.message || String(error));
          }
        };
      }
      if (root.AuctionAiDecisionSupport && typeof root.AuctionAiDecisionSupport.openForAuction === "function") {
        const decisionSupportButton = actions.createEl("button", { text: "AI 판단 보조", attr: { type: "button", class: "auction-decision-board-action", title: "내 기록과 지역 결과를 근거로 판단 보조를 확인합니다." } });
        decisionSupportButton.onclick = async () => {
          try {
            await root.AuctionAiDecisionSupport.openForAuction(this.app, this.auction, {
              returnFocus: decisionSupportButton,
              context: this.options.decisionSupportContext || root.AuctionDecisionMirrorDashboardContext,
              generationStartedAt: new Date().toISOString()
            });
          } catch (error) {
            if (root.Notice) new root.Notice(error.message || String(error));
          }
        };
      }
      const fullInfo = actions.createEl("button", { text: "지역 상세 보기", attr: { type: "button", class: "auction-decision-board-action" } });
      fullInfo.onclick = async () => {
        try {
          if (!root.RegionIntelligencePopupCore || !root.RegionIntelligencePopupView) throw new Error("지역 정보 팝업을 불러오지 못했습니다.");
          const result = await root.RegionIntelligencePopupCore.openPopupForApp(this.app, context.region_key, { auction: this.auction });
          if (!result || !result.ok) throw new Error(result && result.error || "지역 정보 팝업을 열지 못했습니다.");
          root.RegionIntelligencePopupView.openOverlay(result.state, { returnFocus: fullInfo });
        } catch (error) {
          if (root.Notice) new root.Notice(error.message || String(error));
        }
      };
      if (root.AuctionDecisionPacket && root.AuctionDecisionPacket.isActionable && root.AuctionDecisionPacket.isActionable(this.auction)) {
        const reference = actions.createEl("button", { text: "참고 근거 보기", attr: { type: "button", class: "auction-decision-board-action" } });
        reference.onclick = () => {
          try {
            openReferenceModal(this.app, this.auction, this.options.decisionPacketContext || root.AuctionDecisionPacketDashboardContext, reference);
          } catch (error) {
            if (root.Notice) new root.Notice(error.message || String(error));
          }
        };
      }
      const experience = actions.createEl("button", { text: "지역 경험 기록", attr: { type: "button", class: "auction-decision-board-action" } });
      experience.onclick = async () => {
        if (experience.disabled) return;
        experience.disabled = true;
        try {
          await loadRegionExperienceModules(this.app);
          const region = canonicalRegion(this.packet);
          if (!region) throw new Error("지역 경험을 기록할 지역 Object가 없습니다.");
          const modal = root.openRegionExperienceModal(this.app, { regions: [region], selectedRegions: [region], returnFocus: experience });
          if (!modal || typeof modal !== "object") throw new Error("지역 경험 모달을 열지 못했습니다.");
        } catch (error) {
          if (root.Notice) new root.Notice(error.message || String(error));
        } finally {
          experience.disabled = false;
        }
      };
    }

    onClose() {
      this.contentEl.empty();
      if (this.returnFocus && this.returnFocus.isConnected !== false && typeof this.returnFocus.focus === "function") this.returnFocus.focus({ preventScroll: true });
    }
  }

  async function openForAuction(app, auction, options) {
    const opts = options || {};
    const regionCore = root.AuctionRegionCore;
    const path = regionCore && typeof regionCore.regionNotePath === "function" ? regionCore.regionNotePath(auction) : "";
    let source = null;
    if (path && app && app.vault) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file && typeof app.vault.read === "function") source = { path, body: await app.vault.read(file), metadata_available: true };
    }
    let packageInfo = null;
    try {
      const api = researchApi();
      if (api && typeof api.readLatestPackage === "function") packageInfo = await api.readLatestPackage(app, auction);
    } catch (_error) {
      packageInfo = null;
    }
    const packet = projectPacket(auction, source, { research: researchContext(packageInfo) });
    if (!root.obsidian || !root.obsidian.Modal) {
      if (root.Notice) new root.Notice(packet.message || "지역 판단 패킷을 열 수 없습니다.");
      return packet;
    }
    new RegionPacketModal(app, packet, opts, auction).open();
    return packet;
  }

  const api = Object.freeze({ METRICS, projectPacket, projectResearchAction, researchActionForAuction, openForAuction, toDisplayText });
  root.AuctionRegionPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
