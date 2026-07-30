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

  function tokenApi() {
    const api = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
    if (!api || !api.BREAKPOINTS || !api.CONTROL_HEIGHTS) throw new Error("ProdigyTokens를 먼저 불러와야 합니다.");
    return api;
  }

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
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
      .auction-region-packet-modal button.mod-cta { min-height: ${tokens.CONTROL_HEIGHTS.touchTarget}px; margin-top: var(--size-4-4); }
      @media (max-width: ${tokens.BREAKPOINTS.medium - 1}px) {
        .auction-region-packet-metrics { grid-template-columns: minmax(0, 1fr); gap: var(--size-4-1); }
        .auction-region-packet-metrics dd { text-align: start; }
      }
    `;
    root.document.head.appendChild(style);
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

  function projectPacket(auction, source) {
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
    return Object.freeze({
      status: "ready",
      decision_authority: "human_required",
      message: null,
      auction_context: Object.freeze({ region_key: regionKey, dong: clean(auction && auction.region_dong), address: clean(auction && auction.address) }),
      region,
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

  class RegionPacketModal extends (root.obsidian && root.obsidian.Modal ? root.obsidian.Modal : class {}) {
    constructor(app, packet, returnFocus) {
      super(app);
      this.app = app;
      this.packet = packet;
      this.returnFocus = returnFocus || null;
    }

    onOpen() {
      ensureStyles();
      const content = this.contentEl;
      content.empty();
      content.addClass("auction-region-packet-modal");
      content.createEl("h2", { text: "지역 판단 패킷" });
      if (this.packet.status !== "ready") {
        content.createEl("p", { text: this.packet.message, attr: { class: "auction-region-packet-error", role: "alert" } });
        addChecks(content, this.packet);
        return;
      }
      const identity = this.packet.region.identity;
      const context = this.packet.auction_context;
      content.createEl("p", { text: `${identity.title}${context.dong ? ` · ${context.dong}` : ""}`, attr: { class: "auction-region-packet-title" } });
      if (context.address) content.createEl("p", { text: context.address, attr: { class: "auction-region-packet-meta" } });
      content.createEl("p", { text: "입찰 추천이 아닙니다. 사람이 근거와 현장을 확인해 최종 판단합니다.", attr: { class: "auction-region-packet-authority" } });
      addMetrics(content, this.packet);
      addTransit(content, this.packet);
      RESEARCH_SECTIONS.forEach((definition) => addSection(content, definition.label, this.packet.region.research && this.packet.region.research[definition.key]));
      addChecks(content, this.packet);
      const open = content.createEl("button", { text: "지역 노트 열기", attr: { type: "button", class: "mod-cta" } });
      open.onclick = () => this.app.workspace.openLinkText(identity.path.replace(/\.md$/i, ""), identity.path, false);
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
    const packet = projectPacket(auction, source);
    if (!root.obsidian || !root.obsidian.Modal) {
      if (root.Notice) new root.Notice(packet.message || "지역 판단 패킷을 열 수 없습니다.");
      return packet;
    }
    new RegionPacketModal(app, packet, opts.returnFocus).open();
    return packet;
  }

  const api = Object.freeze({ METRICS, projectPacket, openForAuction, toDisplayText });
  root.AuctionRegionPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
