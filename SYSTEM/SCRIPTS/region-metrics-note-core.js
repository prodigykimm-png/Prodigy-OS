"use strict";

const METRIC_KEYS = Object.freeze([
  "sale_volume_3m", "housing_stock", "sale_turnover_rate",
  "sale_price_change_yoy", "jeonse_ratio", "move_in_12m", "move_in_24m", "move_in_36m", "move_in_48m", "move_in_60m",
  "households", "household_change_yoy", "auction_bid_rate_6m"
]);
const FM_KEYS = Object.freeze([
  "sale_volume_3m", "housing_stock", "sale_turnover_rate",
  "sale_price_change_yoy", "jeonse_ratio", "move_in_12m", "move_in_24m", "move_in_36m", "move_in_48m", "move_in_60m",
  "households", "household_change_yoy", "auction_bid_rate_6m"
]);
const METRIC_CONTRACT = Object.freeze({
  sale_volume_3m: ["건", "reb_rone_public_table", "A_2024_00554", "integer"],
  housing_stock: ["호", "reb_stock", "15106861", "integer"],
  sale_turnover_rate: ["ratio", "derived", "sale_volume_3m+housing_stock", "number"],
  sale_price_change_yoy: ["%", "reb_rone_public_table", "A_2024_00045", "number"],
  jeonse_ratio: ["%", "reb_rone_public_table", "A_2024_00073", "number"],
  move_in_12m: ["세대", "reb_supply", "15111714", "integer"],
  move_in_24m: ["세대", "reb_supply", "15111714", "integer"],
  move_in_36m: ["세대", "reb_supply", "15111714", "integer"],
  move_in_48m: ["세대", "reb_supply", "15111714", "integer"],
  move_in_60m: ["세대", "reb_supply", "15111714", "integer"],
  households: ["세대", "mois_jumin_statmonth_csv", "jumin_statmonth_csv", "integer"],
  household_change_yoy: ["%", "mois_jumin_statmonth_csv", "jumin_statmonth_csv", "number"]
});
const DISPLAY_MARKER = "<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->";
const HISTORY_MARKER = "<!-- PRODIGY_REGION_METRICS_HISTORY -->";
const MARKET_START = "<!-- AUTO:REGION_MARKET:START -->";
const MARKET_END = "<!-- AUTO:REGION_MARKET:END -->";

function assertOne(text, value, label) {
  if (text.split(value).length - 1 !== 1) throw new Error(`${label}는 정확히 1개여야 합니다.`);
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schema_version !== 1) throw new Error("스냅샷 schema_version은 1이어야 합니다.");
  if (!/^\d{4}-\d{2}-01_\d{8}T\d{6}Z$/.test(snapshot.snapshot_id ?? "")) throw new Error("snapshot_id 형식이 올바르지 않습니다.");
  if (!/^\d{4}-\d{2}-01$/.test(snapshot.metrics_as_of ?? "")) throw new Error("metrics_as_of 형식이 올바르지 않습니다.");
  if (!snapshot.snapshot_id.startsWith(`${snapshot.metrics_as_of}_`)) throw new Error("snapshot_id와 metrics_as_of가 일치하지 않습니다.");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(snapshot.fetched_at ?? "") || !Number.isFinite(Date.parse(snapshot.fetched_at))) throw new Error("fetched_at 형식이 올바르지 않습니다.");
  if (!snapshot.region_key || snapshot.verification_status !== "unverified") throw new Error("자동 스냅샷은 region_key와 unverified 상태가 필요합니다.");
  if (!snapshot.metrics || typeof snapshot.metrics !== "object") throw new Error("스냅샷 metrics가 없습니다.");
  const coverage = snapshot.evidence?.supply_coverage;
  if (!coverage || !/^\d{4}-\d{2}$/.test(coverage.basis_month ?? "") || !/^\d{4}-\d{2}$/.test(coverage.source_month_min ?? "") || !/^\d{4}-\d{2}$/.test(coverage.source_month_max ?? "") || !Number.isInteger(coverage.matched_rows) || !Number.isInteger(coverage.observed_horizon_months) || !Array.isArray(coverage.unavailable_horizons)) {
    throw new Error("입주예정물량 coverage 근거가 올바르지 않습니다.");
  }
  const supplyHorizons = [12, 24, 36, 48, 60];
  const expectedUnavailable = supplyHorizons.filter((horizon) => coverage.observed_horizon_months < horizon);
  if (JSON.stringify(coverage.unavailable_horizons) !== JSON.stringify(expectedUnavailable)) {
    throw new Error("입주예정물량 coverage 미확보 horizon이 올바르지 않습니다.");
  }
  for (const key of METRIC_KEYS) {
    const metric = snapshot.metrics[key];
    if (!metric || typeof metric !== "object") throw new Error(`필수 지표가 없습니다: ${key}`);
    if (key === "auction_bid_rate_6m") {
      if (metric.value !== null || metric.verification !== "n/a" || metric.provider !== "court_auction" || metric.source_id !== null || metric.raw_hash !== null) {
        throw new Error("auction_bid_rate_6m은 v1에서 court_auction null/n/a여야 합니다.");
      }
      continue;
    }
    const [unit, provider, sourceId, numericType] = METRIC_CONTRACT[key];
    if (metric.unit !== unit || metric.provider !== provider || metric.source_id !== sourceId) throw new Error(`지표 출처 계약이 다릅니다: ${key}`);
    if (!/^\d{4}-\d{2}-01$/.test(metric.as_of ?? "")) throw new Error(`지표 기준월이 올바르지 않습니다: ${key}`);
    const supplyHorizon = /^move_in_(\d+)m$/.exec(key);
    if (supplyHorizon && metric.value === null) {
      if (!coverage.unavailable_horizons.includes(Number(supplyHorizon[1]))) throw new Error(`입주예정물량 null은 coverage 미확보여야 합니다: ${key}`);
    } else if (supplyHorizon && coverage.unavailable_horizons.includes(Number(supplyHorizon[1]))) {
      throw new Error(`입주예정물량 coverage 미확보 값은 null이어야 합니다: ${key}`);
    } else if (!Number.isFinite(metric.value)) {
      throw new Error(`지표 값이 숫자가 아닙니다: ${key}`);
    }
    if (metric.value !== null && numericType === "integer" && (!Number.isInteger(metric.value) || metric.value < 0)) throw new Error(`지표는 0 이상의 정수여야 합니다: ${key}`);
    if (["sale_turnover_rate", "jeonse_ratio"].includes(key) && metric.value < 0) throw new Error(`지표는 음수일 수 없습니다: ${key}`);
    if (metric.verification !== "unverified") throw new Error(`자동 지표는 unverified여야 합니다: ${key}`);
    if (!/^[0-9a-f]{64}$/.test(metric.raw_hash ?? "")) throw new Error(`raw_hash가 올바르지 않습니다: ${key}`);
  }
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error("YAML Frontmatter를 찾을 수 없습니다.");
  return { block: match[1], end: match[0].length };
}

function yamlScalar(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...block.matchAll(new RegExp(`^${escaped}:\\s*(.*?)\\s*$`, "gm"))];
  if (matches.length !== 1) throw new Error(`Frontmatter ${key}는 정확히 1개여야 합니다.`);
  return matches[0][1].replace(/^['"]|['"]$/g, "");
}

function yamlValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = String(value);
  return /^[\p{L}\p{N}_.+%-]+$/u.test(text) ? text : JSON.stringify(text);
}

function replaceYaml(block, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}:.*$`, "gm");
  const matches = block.match(pattern) ?? [];
  if (matches.length !== 1) throw new Error(`Frontmatter ${key}는 정확히 1개여야 합니다.`);
  return block.replace(pattern, `${key}: ${yamlValue(value)}`.trimEnd());
}

function rawFingerprint(snapshot) {
  return METRIC_KEYS.map((key) => snapshot.metrics[key]?.raw_hash ?? null).join(":");
}

function historyFrom(content, regionKey) {
  assertOne(content, HISTORY_MARKER, "지표 히스토리 마커");
  const markerAt = content.indexOf(HISTORY_MARKER);
  const headingAt = content.indexOf("\n## ", markerAt + HISTORY_MARKER.length);
  const end = headingAt === -1 ? content.length : headingAt;
  const segment = content.slice(markerAt + HISTORY_MARKER.length, end);
  const matches = [...segment.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  const quotedMatches = [...segment.matchAll(/>\s*```json\s*\n((?:>.*(?:\n|$))*?)>\s*```/g)];
  if (matches.length + quotedMatches.length !== 1) throw new Error("지표 히스토리 JSON 코드펜스는 정확히 1개여야 합니다.");
  const quoted = quotedMatches[0];
  const match = matches[0] ?? quoted;
  const json = quoted ? quoted[1].replace(/^> ?/gm, "").trimEnd() : match[1];
  let history;
  try { history = JSON.parse(json); } catch (error) { throw new Error(`지표 히스토리 JSON 파싱 실패: ${error.message}`); }
  if (history.schema_version !== 1 || history.region_key !== regionKey || !Array.isArray(history.snapshots)) {
    throw new Error("지표 히스토리 계약 또는 지역키가 올바르지 않습니다.");
  }
  const jsonAt = markerAt + HISTORY_MARKER.length + match.index + match[0].indexOf(match[1]);
  return {
    history,
    jsonAt,
    jsonEnd: jsonAt + match[1].length,
    encodeJson: quoted ? (value) => `${value.split("\n").map((line) => `> ${line}`).join("\n")}\n` : (value) => value
  };
}

function formatNumber(value, digits = null) {
  if (value === null) return "—";
  if (digits !== null) return Number(value).toFixed(digits);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 8 }).format(value);
}

function renderDisplay(metrics) {
  const rows = [
    ["매매 거래량(3개월)", formatNumber(metrics.sale_volume_3m.value), "건", "R-ONE A_2024_00554"],
    ["주택 재고(아파트·공시)", formatNumber(metrics.housing_stock.value), "호", "15106861"],
    ["매매 회전율", formatNumber(metrics.sale_turnover_rate.value * 100, 2), "%", "파생 vol×4/stock · 표시 ×100"],
    ["매매가 변동 YoY", formatNumber(metrics.sale_price_change_yoy.value, 2), "%", "R-ONE A_2024_00045 원지수"],
    ["전세가율", formatNumber(metrics.jeonse_ratio.value, 2), "%", "R-ONE A_2024_00073"],
    ["입주 예정 12개월", formatNumber(metrics.move_in_12m.value), "세대", "15111714"],
    ["입주 예정 24개월", formatNumber(metrics.move_in_24m.value), "세대", "12 포함 · 기간 부족 시 비움"],
    ["입주 예정 36개월", formatNumber(metrics.move_in_36m.value), "세대", "24 포함 · 기간 부족 시 비움"],
    ["입주 예정 48개월", formatNumber(metrics.move_in_48m.value), "세대", "36 포함 · 기간 부족 시 비움"],
    ["입주 예정 60개월", formatNumber(metrics.move_in_60m.value), "세대", "48 포함 · 기간 부족 시 비움"],
    ["세대수", formatNumber(metrics.households.value), "세대", "jumin free CSV"],
    ["세대수 변동 YoY", formatNumber(metrics.household_change_yoy.value, 2), "%", "jumin free CSV · 전년동월"],
    ["경매 낙찰가율(6개월)", "—", "—", "v1 비움"]
  ];
  return ["| 지표 | 값 | 단위 | 비고 |", "|------|-----|------|------|", ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function renderMarket(snapshot) {
  const metrics = snapshot.metrics;
  return [
    `> 기준월 ${snapshot.metrics_as_of.slice(0, 7)} · 자동 생성 · 사람 검증 전`,
    "",
    `- 최근 공표 3개월 매매 거래량은 ${formatNumber(metrics.sale_volume_3m.value)}건이다.`,
    `- 공시 아파트 재고는 ${formatNumber(metrics.housing_stock.value)}호(${metrics.housing_stock.as_of.slice(0, 7)} 기준)이며, 연율 환산 매매 회전율은 ${formatNumber(metrics.sale_turnover_rate.value * 100, 2)}%다.`,
    `- 매매가격 원지수의 전년동월 대비 변화는 ${formatNumber(metrics.sale_price_change_yoy.value, 2)}%, 전세가율은 ${formatNumber(metrics.jeonse_ratio.value, 2)}%다.`,
    `- 확정 입주 예정 물량은 12개월 ${formatNumber(metrics.move_in_12m.value)}세대, 24개월 누적 ${formatNumber(metrics.move_in_24m.value)}세대다. 36개월 ${formatNumber(metrics.move_in_36m.value)}, 48개월 ${formatNumber(metrics.move_in_48m.value)}, 60개월 ${formatNumber(metrics.move_in_60m.value)}는 원본 제공 범위 기준이며, —는 미확보다(${metrics.move_in_12m.as_of.slice(0, 7)} 기준).`,
    `- 세대수는 ${formatNumber(metrics.households.value)}세대이며 전년동월 대비 ${formatNumber(metrics.household_change_yoy.value, 2)}%다.`
  ].join("\n");
}

function replaceOwnedBlock(content, startMarker, endMarker, body, label) {
  assertOne(content, startMarker, `${label} 시작 마커`);
  assertOne(content, endMarker, `${label} 종료 마커`);
  const start = content.indexOf(startMarker) + startMarker.length;
  const end = content.indexOf(endMarker, start);
  if (end < start) throw new Error(`${label} 마커 순서가 올바르지 않습니다.`);
  return `${content.slice(0, start)}\n${body}\n${content.slice(end)}`;
}

function replaceMarket(content, snapshot) {
  return replaceOwnedBlock(content, MARKET_START, MARKET_END, renderMarket(snapshot), "시장·공급 AUTO 블록");
}

function replaceDisplay(content, metrics) {
  assertOne(content, DISPLAY_MARKER, "시장 지표 표시 마커");
  const markerAt = content.indexOf(DISPLAY_MARKER);
  const start = markerAt + DISPLAY_MARKER.length;
  const end = content.indexOf("\n## ", start);
  if (end === -1) throw new Error("시장 지표 표 다음 섹션을 찾을 수 없습니다.");
  return `${content.slice(0, start)}\n${renderDisplay(metrics)}\n${content.slice(end)}`;
}

function applySnapshotToNote(original, snapshot, options = {}) {
  validateSnapshot(snapshot);
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const content = original.replace(/\r\n/g, "\n");
  const fm = frontmatter(content);
  if (yamlScalar(fm.block, "type") !== "auction_region") throw new Error("대상 Object type은 auction_region이어야 합니다.");
  const regionKey = `${yamlScalar(fm.block, "region_sido")}-${yamlScalar(fm.block, "region_sigungu")}`;
  if (regionKey !== snapshot.region_key) throw new Error(`대상과 스냅샷 지역키가 다릅니다: ${regionKey} != ${snapshot.region_key}`);
  const parsedHistory = historyFrom(content, regionKey);
  const sameRaw = parsedHistory.history.snapshots.some((item) => item.metrics_as_of === snapshot.metrics_as_of && item.metrics && rawFingerprint(item) === rawFingerprint(snapshot));
  if (sameRaw) {
    const refreshed = replaceMarket(content, snapshot);
    if (refreshed === content) return { content: original, changed: false, reason: "same_raw_snapshot" };
    return { content: eol === "\n" ? refreshed : refreshed.replace(/\n/g, eol), changed: true, reason: "refreshed_auto_sections" };
  }

  const sourceAsOf = snapshot.fetched_at.slice(0, 10);
  const storedSnapshot = JSON.parse(JSON.stringify({ ...snapshot, source_as_of: sourceAsOf }));
  const oldIndex = parsedHistory.history.snapshots.findIndex((item) => item.snapshot_id === snapshot.snapshot_id);
  if (oldIndex >= 0) parsedHistory.history.snapshots[oldIndex] = storedSnapshot;
  else parsedHistory.history.snapshots.push(storedSnapshot);
  parsedHistory.history.snapshots.sort((a, b) => b.metrics_as_of.localeCompare(a.metrics_as_of) || b.snapshot_id.localeCompare(a.snapshot_id));
  let next = `${content.slice(0, parsedHistory.jsonAt)}${parsedHistory.encodeJson(JSON.stringify(parsedHistory.history, null, 2))}${content.slice(parsedHistory.jsonEnd)}`;
  next = replaceDisplay(next, snapshot.metrics);
  next = replaceMarket(next, snapshot);

  const nextFm = frontmatter(next);
  const values = {
    updated: options.updatedDate ?? sourceAsOf,
    metrics_as_of: snapshot.metrics_as_of,
    metrics_scope: "sigungu",
    metrics_source: "region_metrics_v1_2_5",
    source_as_of: sourceAsOf,
    verification_status: "unverified",
    ...Object.fromEntries(FM_KEYS.map((key) => [key, snapshot.metrics[key].value]))
  };
  let block = nextFm.block;
  for (const [key, value] of Object.entries(values)) block = replaceYaml(block, key, value);
  next = `---\n${block}\n---\n${next.slice(nextFm.end)}`;
  return { content: eol === "\n" ? next : next.replace(/\n/g, eol), changed: true, reason: oldIndex >= 0 ? "replaced_snapshot" : "inserted_snapshot" };
}

module.exports = Object.freeze({ METRIC_KEYS, applySnapshotToNote, renderDisplay, renderMarket, validateSnapshot });
