(function (root) {
  "use strict";

  function tokenApi() {
    const api = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
    if (!api || !api.BREAKPOINTS || !api.CONTROL_HEIGHTS) throw new Error("ProdigyTokens를 먼저 불러와야 합니다.");
    return api;
  }

  const TOKENS = tokenApi();
  const COMPACT_MAX = TOKENS.BREAKPOINTS.medium - 1;
  const CSS = `
.region-explorer-shell{container-type:inline-size;container-name:region-explorer;display:grid;gap:var(--ke-space-3);min-inline-size:0;color:var(--ke-color-text);font-size:var(--ke-type-body);line-height:var(--ke-leading-body)}
.region-explorer-head,.region-explorer-controls,.region-explorer-summary,.region-explorer-selection,.region-explorer-group-head,.region-explorer-row-meta{display:flex;gap:var(--ke-space-2);align-items:center;flex-wrap:wrap}
.region-explorer-head{justify-content:space-between}.region-explorer-head h2,.region-explorer-group h3{font-size:var(--ke-type-title);margin:0}.region-explorer-controls{padding:var(--ke-space-3);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-panel);background:var(--ke-color-surface-secondary)}
.region-explorer-control{display:grid;gap:var(--ke-space-1);min-inline-size:min(12rem,100%)}.region-explorer-control label,.region-explorer-meta{font-size:var(--ke-type-label);color:var(--ke-color-muted)}.region-explorer-control input,.region-explorer-control select,.region-explorer-button{min-block-size:${TOKENS.CONTROL_HEIGHTS.touchTarget}px;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface);color:var(--ke-color-text);padding-inline:var(--ke-space-3)}
.region-explorer-button{cursor:pointer;min-inline-size:0;word-break:keep-all;overflow-wrap:anywhere}.region-explorer-add-action{min-inline-size:min(12rem,100%)}.region-explorer-button[data-selected="true"]{border-color:var(--ke-color-accent);color:var(--ke-color-accent);background:var(--ke-color-hover)}.region-explorer-button:focus-visible,.region-explorer-control input:focus-visible,.region-explorer-control select:focus-visible{outline:2px solid var(--ke-color-accent);outline-offset:2px}.region-explorer-button:active{transform:translateY(1px)}
.region-explorer-scroll{min-block-size:0;min-inline-size:0;display:grid;align-content:start;gap:var(--ke-space-4);padding-inline-end:var(--ke-space-1)}.region-explorer-summary,.region-explorer-selection,.region-explorer-notice{padding:var(--ke-space-3);border-inline-start:2px solid var(--ke-color-border);background:var(--ke-color-surface-secondary)}.region-explorer-notice{border-color:var(--ke-color-error);color:var(--ke-color-error)}
.region-explorer-list{display:grid;gap:var(--ke-space-2)}.region-explorer-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--ke-space-3);padding:var(--ke-space-3);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-panel);background:var(--ke-color-surface)}.region-explorer-row-title,.region-explorer-cell-title{overflow-wrap:anywhere}.region-explorer-row-title{font-weight:600}.region-explorer-diagnostics{margin:var(--ke-space-2) 0 0;color:var(--ke-color-error);overflow-wrap:anywhere}
.region-explorer-comparison{display:grid;gap:var(--ke-space-4)}.region-explorer-group{display:grid;gap:var(--ke-space-2);padding-block-start:var(--ke-space-3);border-block-start:1px solid var(--ke-color-border)}.region-explorer-metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(15rem,100%),1fr));gap:var(--ke-space-2)}.region-explorer-metric-card{display:grid;gap:var(--ke-space-2);padding:var(--ke-space-3);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface)}.region-explorer-values{display:grid;gap:var(--ke-space-2);min-inline-size:0}.region-explorer-comparison[data-comparison-layout="side-by-side"] .region-explorer-values[data-columns="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}.region-explorer-comparison[data-comparison-layout="side-by-side"] .region-explorer-values[data-columns="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}.region-explorer-comparison[data-comparison-layout="stacked"] .region-explorer-metric-grid,.region-explorer-comparison[data-comparison-layout="stacked"] .region-explorer-values{grid-template-columns:minmax(0,1fr)}.region-explorer-value{display:grid;gap:var(--ke-space-1);min-inline-size:0}.region-explorer-value strong{overflow-wrap:anywhere}.region-explorer-sparkline{inline-size:6rem;block-size:2rem;color:var(--ke-color-accent)}.region-explorer-empty{color:var(--ke-color-muted)}
.region-explorer-controls[data-control-layout="stacked"]{align-items:stretch}.region-explorer-controls[data-control-layout="stacked"] .region-explorer-control,.region-explorer-controls[data-control-layout="stacked"] .region-explorer-add-action{min-inline-size:100%;inline-size:100%}
@container region-explorer (max-width:${COMPACT_MAX}px){.region-explorer-row{grid-template-columns:minmax(0,1fr)}.region-explorer-sparkline{inline-size:100%;max-inline-size:12rem}}
@media (prefers-reduced-motion:reduce){.region-explorer-button{transform:none!important}}
`;
  const SORT_LABELS = Object.freeze({ name: "지역명", sido: "시도", metrics_as_of: "통계 기준일", verification: "검증 상태", transit_available: "확인된 도시철도", sale_volume_3m: "최근 3개월 거래량", housing_stock: "주택 재고", sale_turnover_rate: "거래 회전율", sale_price_change_yoy: "매매가격 증감률", jeonse_ratio: "전세가율", move_in_12m: "12개월 입주물량", move_in_24m: "24개월 입주물량", move_in_36m: "36개월 입주물량", move_in_48m: "48개월 입주물량", move_in_60m: "60개월 입주물량", households: "세대수", household_change_yoy: "세대수 증감률", auction_bid_rate_6m: "최근 6개월 낙찰가율" });
  const VERIFICATION_LABELS = Object.freeze({ verified: "검증 완료", partial: "일부 검증", unverified: "미검증" });

  function stateApi() {
    const api = root.RegionExplorerState || (typeof require === "function" ? require("./region-explorer-state.js") : null);
    if (!api || typeof api.buildViewModel !== "function") throw new Error("RegionExplorerState를 먼저 불러와야 합니다.");
    return api;
  }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function create(parent, tag, options = {}) {
    const doc = parent && parent.ownerDocument ? parent.ownerDocument : typeof document !== "undefined" ? document : null;
    if ((tag === "svg" || tag === "polyline") && doc && typeof doc.createElementNS === "function" && parent) {
      const element = doc.createElementNS("http://www.w3.org/2000/svg", tag);
      if (options.text) element.textContent = options.text;
      for (const [name, value] of Object.entries(options.attr || {})) element.setAttribute ? element.setAttribute(name, value) : element.setAttr(name, value);
      if (parent.appendChild) parent.appendChild(element); else if (Array.isArray(parent.children)) parent.children.push(element);
      return element;
    }
    if (parent && typeof parent.createEl === "function") return parent.createEl(tag, options);
    if (!doc || !parent) return null;
    const element = tag === "svg" || tag === "polyline" ? doc.createElementNS("http://www.w3.org/2000/svg", tag) : doc.createElement(tag);
    if (options.text) element.textContent = options.text;
    for (const [name, value] of Object.entries(options.attr || {})) element.setAttribute(name, value);
    if (options.disabled) element.disabled = true;
    parent.appendChild(element);
    return element;
  }
  function setAttr(element, name, value) { if (element && typeof element.setAttr === "function") element.setAttr(name, value); else if (element && element.setAttribute) element.setAttribute(name, value); }
  function empty(element) { if (element && typeof element.empty === "function") element.empty(); else if (element) element.textContent = ""; }
  function layoutFor(width) {
    const logicalWidth = Number(width);
    if (!Number.isFinite(logicalWidth) || logicalWidth >= TOKENS.BREAKPOINTS.wide) return "wide";
    return logicalWidth >= TOKENS.BREAKPOINTS.medium ? "medium" : "compact";
  }
  function format(value, fallback) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : text(value) || fallback || "자료 없음"; }
  function transitDisplay(row) {
    const transit = record(row && row.transit);
    if (!transit.available) return transit.malformed ? "정보 확인 불가" : "확인된 도시철도 정보 없음";
    const lines = Array.isArray(transit.lines) ? transit.lines : [];
    const summary = lines.map((l) => `${l.line} ${l.stations.length}개역`).join(" · ");
    return summary || "확인된 도시철도 정보 없음";
  }
  function metricValue(row, field) {
    if (field.source === "transit") return transitDisplay(row);
    const source = record(row && row[field.source]);
    if (field.source !== "metrics") return format(source[field.key]);
    const metric = record(source[field.key]);
    return format(metric.value, text(metric.availability) || "자료 없음");
  }
  function verification(value) { return VERIFICATION_LABELS[text(value)] || "미검증"; }
  function sparkline(parent, row) {
    const values = record(record(row).history).snapshots;
    const points = Array.isArray(values) ? values.map((item) => record(record(item).metrics).sale_price_change_yoy).map((item) => record(item).value).filter((value) => typeof value === "number" && Number.isFinite(value)) : [];
    if (points.length < 2) return;
    const low = Math.min(...points); const high = Math.max(...points); const span = high - low || 1;
    const coordinates = points.map((value, index) => `${index * 100 / (points.length - 1)},${100 - (value - low) * 100 / span}`).join(" ");
    const svg = create(parent, "svg", { attr: { class: "region-explorer-sparkline", viewBox: "0 0 100 100", role: "img", "aria-label": "매매가격 증감률 이력" } });
    create(svg, "polyline", { attr: { points: coordinates, fill: "none", stroke: "currentColor", "stroke-width": "6", "stroke-linecap": "round", "stroke-linejoin": "round" } });
  }
  function option(parent, value, label, selected) { return create(parent, "option", { text: label, attr: selected ? { value, selected: "selected" } : { value } }); }
  function control(parent, label, tag, value, onChange) {
    const wrap = create(parent, "div", { attr: { class: "region-explorer-control" } });
    create(wrap, "label", { text: label });
    const input = create(wrap, tag, { attr: { value: value || "", "aria-label": label } });
    if (input) input.onchange = (event) => onChange(event && event.target ? event.target.value : "");
    return input;
  }
  function button(parent, label, action, selected) {
    const control = create(parent, "button", { text: label, attr: { type: "button", class: `region-explorer-button${action.className ? ` ${action.className}` : ""}`, "data-action": action.type, "data-region-key": action.region_key || "", "data-selected": selected ? "true" : "false", "aria-label": label } });
    if (control) {
      const activate = (event) => { if (event && event.preventDefault) event.preventDefault(); return action.run(control); };
      control.onclick = activate;
      control.onkeydown = (event) => event && (event.key === "Enter" || event.key === " ") ? activate(event) : undefined;
    }
    return control;
  }
  function summary(parent, rows) {
    let dated = 0; let observed = 0; let missing = 0; let insufficient = 0;
    for (const row of rows) {
      if (text(record(record(record(row).provenance).freshness).availability) === "기준일 있음") dated += 1;
      for (const metric of Object.values(record(row.metrics))) {
        const item = record(metric); if (typeof item.value === "number") observed += 1; else if (text(item.availability) === "관측 범위 부족") insufficient += 1; else missing += 1;
      }
    }
    const block = create(parent, "section", { attr: { class: "region-explorer-summary", "aria-label": "커버리지와 기준일 요약" } });
    create(block, "strong", { text: `표시 지역 ${rows.length}개` });
    create(block, "span", { text: `기준일 있음 ${dated}개`, attr: { class: "region-explorer-meta" } });
    create(block, "span", { text: `관측값 ${observed}개 · 자료 없음 ${missing}개 · 관측 범위 부족 ${insufficient}개`, attr: { class: "region-explorer-meta" } });
  }
  function renderRows(parent, model, dispatch) {
    const list = create(parent, "section", { attr: { class: "region-explorer-list", "aria-label": "지역 목록" } });
    if (!model.rows.length) create(list, "p", { text: "현재 조건에 맞는 지역이 없습니다.", attr: { class: "region-explorer-empty" } });
    for (const row of model.rows) {
      const identity = record(row.identity); const provenance = record(row.provenance); const key = text(identity.region_key); const selected = model.state.selected_region_keys.includes(key);
      const item = create(list, "article", { attr: { class: "region-explorer-row", "data-region": key } });
      const copy = create(item, "div");
      create(copy, "div", { text: text(identity.title) || "지역 정보 없음", attr: { class: "region-explorer-row-title" } });
      const meta = create(copy, "div", { attr: { class: "region-explorer-row-meta" } });
      create(meta, "span", { text: `${text(identity.sido)} · ${text(identity.sigungu)}`, attr: { class: "region-explorer-meta" } });
      create(meta, "span", { text: `통계 기준일 ${text(provenance.metrics_as_of) || "자료 없음"}`, attr: { class: "region-explorer-meta" } });
      create(meta, "span", { text: verification(provenance.verification_status), attr: { class: "region-explorer-meta" } });
      sparkline(meta, row);
      const diagnostics = Array.isArray(row.diagnostics) ? row.diagnostics.map((item) => text(record(item).message)).filter(Boolean) : [];
      if (diagnostics.length) create(copy, "p", { text: diagnostics.join(" "), attr: { class: "region-explorer-diagnostics" } });
      button(item, selected ? "선택 해제" : "비교에 추가", { type: selected ? "deselect-region" : "select-region", region_key: key, run: () => dispatch({ type: selected ? "deselect_region" : "select_region", region_key: key }) }, selected);
    }
  }
  function renderComparison(parent, model, layout) {
    const comparison = model.comparison; const comparisonLayout = layout === "wide" ? "side-by-side" : "stacked"; const container = create(parent, "section", { attr: { class: "region-explorer-comparison", "data-comparison-layout": comparisonLayout, "aria-label": "선택 지역 비교" } });
    create(container, "h3", { text: "선택 지역 비교" });
    if (!comparison.rows.length) create(container, "p", { text: "비교할 지역을 최대 3개까지 선택하세요.", attr: { class: "region-explorer-empty" } });
    for (const group of comparison.groups) {
      const section = create(container, "section", { attr: { class: "region-explorer-group" } });
      create(section, "h3", { text: group.label, attr: { class: "region-explorer-group-head" } });
      const grid = create(section, "div", { attr: { class: "region-explorer-metric-grid" } });
      for (const field of group.fields) {
        const card = create(grid, "article", { attr: { class: "region-explorer-metric-card" } });
        create(card, "strong", { text: field.label, attr: { class: "region-explorer-cell-title" } });
        const values = create(card, "div", { attr: { class: "region-explorer-values", "data-columns": comparisonLayout === "side-by-side" ? String(Math.max(1, comparison.rows.length)) : "1" } });
        for (const row of comparison.rows) {
          const identity = record(row.identity); const entry = create(values, "div", { attr: { class: "region-explorer-value" } });
          create(entry, "span", { text: text(identity.title) || "지역 정보 없음", attr: { class: "region-explorer-meta" } });
          create(entry, "strong", { text: metricValue(row, field) });
        }
      }
    }
  }
  function renderRegionExplorer(container, projection, options = {}) {
    if (!container) return null;
    const State = stateApi(); const width = Number.isFinite(Number(options.logicalWidth)) ? Number(options.logicalWidth) : Number(container.clientWidth) || TOKENS.BREAKPOINTS.wide; const layout = layoutFor(width);
    const model = State.buildViewModel(projection, options.state); const dispatch = typeof options.onAction === "function" ? options.onAction : () => {};
    empty(container); setAttr(container, "data-layout", layout); setAttr(container, "data-shell", "region-explorer-shell");
    create(container, "style", { text: CSS, attr: { "data-region-explorer-style": "true" } });
    const shell = create(container, "section", { attr: { class: "region-explorer-shell", "data-layout": layout } });
    const head = create(shell, "header", { attr: { class: "region-explorer-head" } }); create(head, "h2", { text: "지역 비교" }); create(head, "span", { text: "최대 3개 지역", attr: { class: "region-explorer-meta" } });
    const controls = create(shell, "section", { attr: { class: "region-explorer-controls", "aria-label": "지역 필터와 정렬", "data-control-layout": layout === "compact" ? "stacked" : "wrapped" } });
    const sido = control(controls, "시도", "select", model.state.sido, (value) => dispatch({ type: "set_filters", filters: { sido: value } })); option(sido, "", "전체", !model.state.sido); [...new Set(model.rows.map((row) => text(record(row.identity).sido)).filter(Boolean))].forEach((value) => option(sido, value, value, model.state.sido === value));
    control(controls, "지역 검색", "input", model.state.search, (value) => dispatch({ type: "set_filters", filters: { search: value } }));
    const verified = control(controls, "검증 상태", "select", model.state.verification, (value) => dispatch({ type: "set_filters", filters: { verification: value } })); option(verified, "all", "전체", model.state.verification === "all"); State.VERIFICATION_FILTERS.filter((value) => value !== "all").forEach((value) => option(verified, value, verification(value), model.state.verification === value));
    const fresh = control(controls, "기준일", "select", model.state.freshness, (value) => dispatch({ type: "set_filters", filters: { freshness: value } })); State.FRESHNESS_FILTERS.forEach((value) => option(fresh, value, value === "all" ? "전체" : value, model.state.freshness === value));
    const sort = control(controls, "정렬", "select", model.state.sort_key, (value) => dispatch({ type: "set_sort", sort_key: value, sort_direction: model.state.sort_direction })); State.SORT_KEYS.forEach((value) => option(sort, value, SORT_LABELS[value], model.state.sort_key === value));
    const direction = control(controls, "정렬 방향", "select", model.state.sort_direction, (value) => dispatch({ type: "set_sort", sort_key: model.state.sort_key, sort_direction: value })); option(direction, "asc", "오름차순", model.state.sort_direction === "asc"); option(direction, "desc", "내림차순", model.state.sort_direction === "desc");
    if (typeof options.onAddRegionExperience === "function") {
      button(controls, "지역 경험 추가", { type: "add-region-experience", className: "region-explorer-add-action", run: (returnFocus) => options.onAddRegionExperience({ selectedRegionKeys: model.state.selected_region_keys.slice(), returnFocus }) }, false);
    }
    const scroll = create(shell, "div", { attr: { class: "region-explorer-scroll" } }); summary(scroll, model.rows);
    const tray = create(scroll, "section", { attr: { class: "region-explorer-selection", "aria-label": "비교 선택" } }); create(tray, "strong", { text: `비교 선택 ${model.state.selected_region_keys.length}/3` }); button(tray, "선택 지우기", { type: "clear-selection", run: () => dispatch({ type: "clear_selection" }) }, false);
    if (options.notice) create(scroll, "p", { text: options.notice, attr: { class: "region-explorer-notice", role: "status" } });
    renderRows(scroll, model, dispatch); renderComparison(scroll, model, layout); return container;
  }
  function mountRegionExplorer(options = {}) {
    const State = stateApi(); let projection = options.projection || { rows: [] }; let state = State.createState(options.state); let notice = null; let width = options.logicalWidth;
    const render = () => renderRegionExplorer(options.container, projection, { state, notice, logicalWidth: width, onAddRegionExperience: options.onAddRegionExperience, onAction: (action) => { const result = State.transition(state, action); state = result.state; notice = result.message; if (typeof options.onStateChange === "function") options.onStateChange(state, notice); render(); } });
    render(); return Object.freeze({ state: () => state, setLogicalWidth: (value) => { width = value; render(); }, setProjection: (value) => { projection = value || { rows: [] }; render(); }, setNotice: (value) => { notice = text(value) || null; render(); } });
  }

  const api = Object.freeze({ CSS, layoutFor, mountRegionExplorer, renderRegionExplorer });
  root.RegionExplorerView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
