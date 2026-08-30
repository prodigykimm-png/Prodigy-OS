(function (root) {
  "use strict";

  const METRIC_KEYS = Object.freeze([
    "total_population", "male_population", "female_population",
    "population_change_count", "population_change_yoy", "household_change_count", "demographic_signal",
    "sale_volume_3m", "housing_stock", "sale_turnover_rate", "sale_price_change_yoy", "jeonse_ratio",
    "move_in_12m", "move_in_24m", "move_in_36m", "move_in_48m", "move_in_60m", "households", "household_change_yoy", "auction_bid_rate_6m"
  ]);
  const RESEARCH_BLOCKS = Object.freeze({
    summary: "AI:PENDING:SUMMARY", zones: "AI:PENDING:ZONES", supply_pipeline: "AI:PENDING:SUPPLY_PIPELINE",
    transport_life: "AI:PENDING:TRANSPORT_LIFE", risks: "AI:PENDING:RISKS", site_visit: "AI:PENDING:SITE_VISIT",
    sources: "AUTO:REGION_RESEARCH_SOURCES", log: "AUTO:REGION_RESEARCH_LOG"
  });
  const HISTORY_MARKER = "<!-- PRODIGY_REGION_METRICS_HISTORY -->";
  const TRANSIT_START = "<!-- AUTO:REGION_TRANSIT:START -->";
  const TRANSIT_END = "<!-- AUTO:REGION_TRANSIT:END -->";

  function text(value) { return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim(); }
  function normalized(value) { return text(value).normalize("NFC"); }
  function pathOf(value) { return normalized(value).replace(/\\/g, "/"); }
  function message(code, path, detail) { return { code, path: path || null, message: detail }; }
  function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function markerCount(body, marker) { return body.split(marker).length - 1; }
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
    return value;
  }

  function frontmatter(body, path) {
    const matched = text(body).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!matched) return { values: {}, diagnostics: [message("missing_frontmatter", path, "YAML Frontmatter가 없어 지역 정보를 읽을 수 없습니다.")], duplicates: new Set(), conflicts: new Set() };
    const values = {};
    const duplicates = new Set();
    const conflicts = new Set();
    const diagnostics = [];
    for (const line of matched[1].split(/\r?\n/)) {
      const scalar = /^([A-Za-z0-9_]+):\s*(.*?)\s*$/.exec(line);
      if (!scalar) continue;
      const raw = scalar[2].replace(/^['"]|['"]$/g, "");
      const value = raw === "" ? null : /^-?(?:\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : raw;
      if (!Object.hasOwn(values, scalar[1])) {
        values[scalar[1]] = value;
        continue;
      }
      duplicates.add(scalar[1]);
      if (Object.is(values[scalar[1]], value)) diagnostics.push(message("duplicate_frontmatter", path, `${scalar[1]} Frontmatter가 중복되어 첫 값을 사용합니다.`));
      else {
        conflicts.add(scalar[1]);
        values[scalar[1]] = null;
        diagnostics.push(message("invalid_frontmatter", path, `${scalar[1]} Frontmatter 값이 서로 다릅니다. 해당 필드는 표시하지 않습니다.`));
      }
    }
    return { values, diagnostics, duplicates, conflicts };
  }

  function parseHistory(body, path, regionKey) {
    if (markerCount(body, HISTORY_MARKER) !== 1) return { snapshots: [], diagnostics: [message("missing_marker", path, "지표 히스토리 마커가 없어 이력은 표시하지 않습니다.")] };
    const after = body.slice(body.indexOf(HISTORY_MARKER) + HISTORY_MARKER.length);
    const quoted = after.match(/>\s*```json\s*\r?\n((?:>.*(?:\r?\n|$))*?)>\s*```/);
    const plain = after.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
    const json = quoted ? quoted[1].replace(/^> ?/gm, "").trim() : plain ? plain[1] : "";
    if (!json) return { snapshots: [], diagnostics: [message("missing_history", path, "지표 히스토리 JSON이 없어 이력은 표시하지 않습니다.")] };
    let history;
    try { history = JSON.parse(json); } catch (_) { return { snapshots: [], diagnostics: [message("malformed_history", path, "지표 히스토리 JSON이 올바르지 않아 이력은 표시하지 않습니다.")] }; }
    if (!isRecord(history) || history.schema_version !== 1 || history.region_key !== regionKey || !Array.isArray(history.snapshots)) {
      return { snapshots: [], diagnostics: [message("malformed_history", path, "지표 히스토리 계약 또는 지역키가 올바르지 않아 이력은 표시하지 않습니다.")] };
    }
    const snapshots = history.snapshots.filter((snapshot) => isRecord(snapshot) && snapshot.schema_version === 1 && snapshot.region_key === regionKey && isRecord(snapshot.metrics));
    const diagnostics = snapshots.length === history.snapshots.length ? [] : [message("invalid_history_snapshot", path, "유효하지 않은 히스토리 스냅샷은 표시하지 않습니다.")];
    return { snapshots, diagnostics };
  }

  function research(body, path) {
    const blocks = {};
    const diagnostics = [];
    for (const [key, marker] of Object.entries(RESEARCH_BLOCKS)) {
      const start = `<!-- ${marker}:START -->`;
      const end = `<!-- ${marker}:END -->`;
      if (markerCount(body, start) !== 1 || markerCount(body, end) !== 1 || body.indexOf(end) < body.indexOf(start)) {
        blocks[key] = null;
        diagnostics.push(message("missing_marker", path, `${key} 리서치 마커가 없어 해당 근거는 표시하지 않습니다.`));
      } else blocks[key] = body.slice(body.indexOf(start) + start.length, body.indexOf(end)).trim() || null;
    }
    return { blocks, diagnostics };
  }

  function transitBlock(body) {
    const startCount = markerCount(body, TRANSIT_START);
    const endCount = markerCount(body, TRANSIT_END);
    if (startCount !== 1 || endCount !== 1) return { available: false, malformed: true, lines: null };
    const startIdx = body.indexOf(TRANSIT_START) + TRANSIT_START.length;
    const endIdx = body.indexOf(TRANSIT_END);
    if (endIdx < startIdx) return { available: false, malformed: true, lines: null };
    const inner = body.slice(startIdx, endIdx).trim();
    if (!inner) return { available: false, malformed: false, lines: null };
    // Extract line names and station counts — must parse as valid transit lines
    const lines = [];
    const lineRe = /^- ([^-]+) · (.+)$/gm;
    let match;
    while ((match = lineRe.exec(inner)) !== null) {
      lines.push({ line: match[1].trim(), stations: match[2].split(",").map(s => s.trim()).filter(Boolean) });
    }
    // If inner has content but no valid line matches, it's malformed
    if (lines.length === 0) return { available: false, malformed: true, lines: null };
    const totalStations = lines.reduce((sum, l) => sum + l.stations.length, 0);
    return { available: true, malformed: false, lines, totalStations };
  }

  function newest(snapshots, metricsAsOf) {
    return [...snapshots].sort((left, right) => text(right.metrics_as_of).localeCompare(text(left.metrics_as_of), "en"))
      .find((snapshot) => !metricsAsOf || snapshot.metrics_as_of === metricsAsOf) || null;
  }

  function metric(value, key, snapshot) {
    if (key === "demographic_signal") {
      const signal = typeof value === "string" && value.trim() ? value.trim() : null;
      return { value: signal, availability: signal ? "관측값" : "자료 없음" };
    }
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
    const horizon = /^move_in_(\d+)m$/.exec(key);
    const coverage = snapshot && snapshot.evidence && snapshot.evidence.supply_coverage;
    const insufficient = Boolean(horizon && numeric === null && coverage && Array.isArray(coverage.unavailable_horizons) && coverage.unavailable_horizons.includes(Number(horizon[1])));
    return { value: numeric, availability: numeric === null ? insufficient ? "관측 범위 부족" : "자료 없음" : "관측값" };
  }

  function projectRegionSource(source) {
    const path = pathOf(source && source.path);
    const body = typeof (source && source.body) === "string" ? source.body : "";
    const parsed = frontmatter(body, path);
    const data = parsed.values;
    const diagnostics = [...parsed.diagnostics];
    if (parsed.duplicates.has("type")) {
      if (!parsed.conflicts.has("type")) diagnostics.push(message("invalid_frontmatter", path, "type Frontmatter가 중복되어 지역 Object로 읽지 않습니다."));
      return { excluded: true, diagnostics };
    }
    const type = normalized(data.type).toLowerCase();
    const sido = normalized(data.region_sido);
    const sigungu = normalized(data.region_sigungu);
    const regionKey = sido && sigungu ? `${sido}-${sigungu}` : null;
    if (type !== "auction_region") {
      diagnostics.push(message("invalid_frontmatter", path, type ? "type Frontmatter가 auction_region이 아니어서 지역 Object로 읽지 않습니다." : "type, region_sido, region_sigungu Frontmatter가 필요합니다."));
      return { excluded: true, region_key: regionKey, diagnostics };
    }
    if (!sido || !sigungu) diagnostics.push(message("invalid_frontmatter", path, "type, region_sido, region_sigungu Frontmatter가 필요합니다."));
    if (source && source.metadata_available === false) diagnostics.push(message("dataview_metadata_unavailable", path, "Dataview 메타데이터를 사용할 수 없어 노트 Frontmatter로 읽었습니다."));
    const history = regionKey ? parseHistory(body, path, regionKey) : { snapshots: [], diagnostics: [] };
    const researchBlocks = research(body, path);
    diagnostics.push(...history.diagnostics, ...researchBlocks.diagnostics);
    const current = newest(history.snapshots, data.metrics_as_of);
    const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, metric(data[key], key, current)]));
    return {
      identity: { path, region_key: regionKey, sido: sido || null, sigungu: sigungu || null, title: normalized(data.title) || [sido, sigungu].filter(Boolean).join(" ") || "지역 정보 없음" },
      metrics,
      history: { snapshots: history.snapshots },
      research: researchBlocks.blocks,
      transit: transitBlock(body),
      provenance: {
        metrics_as_of: text(data.metrics_as_of) || null, metrics_source: text(data.metrics_source) || null,
        source_as_of: text(data.source_as_of) || null, updated: text(data.updated) || null,
        verification_status: text(data.verification_status) || null,
        freshness: {
          metrics_as_of: text(data.metrics_as_of) || null, source_as_of: text(data.source_as_of) || null,
          updated: text(data.updated) || null, availability: text(data.metrics_as_of) && text(data.source_as_of) ? "기준일 있음" : "기준일 없음"
        }
      },
      land_price: { trend_yoy: metric(data.land_price_trend_yoy, "land_price_trend_yoy", null).value, as_of: text(data.land_price_trend_as_of) || null, scope: text(data.land_price_trend_scope) || null, source: text(data.land_price_trend_source) || null },
      diagnostics
    };
  }

  function projectRegionSources(sources) {
    if (!Array.isArray(sources)) return deepFreeze({ schema_version: 1, rows: [], diagnostics: [message("malformed_input", null, "지역 노트 목록이 올바르지 않아 빈 목록을 표시합니다.")] });
    const projected = sources.map(projectRegionSource).filter(Boolean);
    const rows = projected.filter((item) => item.identity);
    const excluded = projected.filter((item) => item.excluded);
    const excludedDiagnostics = excluded.flatMap((item) => item.diagnostics);
    const excludedRegionKeys = [...new Set(excluded.map((item) => item.region_key).filter(Boolean))];
    const byKey = new Map();
    for (const row of rows) if (row.identity.region_key) byKey.set(row.identity.region_key, [...(byKey.get(row.identity.region_key) || []), row]);
    for (const [key, duplicates] of byKey) if (duplicates.length > 1) for (const row of duplicates) row.diagnostics.push(message("duplicate_region_key", row.identity.path, `region_key ${key}가 중복되어 비교에서 구분이 필요합니다.`));
    rows.sort((left, right) => text(left.identity.sido).localeCompare(text(right.identity.sido), "ko") || text(left.identity.sigungu).localeCompare(text(right.identity.sigungu), "ko") || left.identity.path.localeCompare(right.identity.path, "en"));
    return deepFreeze({ schema_version: 1, rows, diagnostics: [...rows.flatMap((row) => row.diagnostics), ...excludedDiagnostics], excluded_region_keys: excludedRegionKeys });
  }

  const api = Object.freeze({ METRIC_KEYS, RESEARCH_BLOCKS, projectRegionSources });
  root.RegionExplorerProjection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
