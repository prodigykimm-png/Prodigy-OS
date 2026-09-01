(function (root) {
  "use strict";

  /**
   * Real-estate region Resource helpers (internal type: auction_region).
   * v1 key = region_sido + region_sigungu only (no dong on region notes).
   * Metrics contract: SYSTEM/docs/Region_Property_Contract_v1.md
   */

  const REGION_ROOT = "PARA/RESOURCES/Auction Regions";
  const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md";
  const REGION_AUCTION_QUERY = Object.freeze({
    table: 'TABLE status AS "상태", auction_datetime AS "기일", minimum_bid AS "최저가", address AS "주소", region_dong AS "동"',
    from: 'FROM "PARA/PROJECTS/Auction"',
    where: Object.freeze([
      'WHERE type = "auction_case"',
      "WHERE region_sido = this.region_sido AND region_sigungu = this.region_sigungu"
    ]),
    sort: "SORT auction_datetime ASC"
  });

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeSido(raw) {
    let s = clean(raw).replace(/\s+/g, "");
    if (!s) return "";
    // Common short forms
    const map = {
      서울: "서울특별시",
      서울시: "서울특별시",
      부산: "부산광역시",
      부산시: "부산광역시",
      대구: "대구광역시",
      인천: "인천광역시",
      인천시: "인천광역시",
      광주: "광주광역시",
      대전: "대전광역시",
      울산: "울산광역시",
      세종: "세종특별자치시",
      경기: "경기도",
      강원: "강원특별자치도",
      강원도: "강원특별자치도",
      충북: "충청북도",
      충남: "충청남도",
      전북: "전북특별자치도",
      전남: "전라남도",
      경북: "경상북도",
      경남: "경상남도",
      제주: "제주특별자치도",
      제주도: "제주특별자치도"
    };
    if (map[s]) return map[s];
    return s;
  }

  function normalizeSigungu(raw) {
    return clean(raw).replace(/\s+/g, "");
  }

  function regionKey(pageOrParts) {
    const p = pageOrParts || {};
    const sido = normalizeSido(p.region_sido || p.sido);
    const sigungu = normalizeSigungu(p.region_sigungu || p.sigungu);
    if (!sido && !sigungu) return "";
    if (!sigungu) return sido;
    if (!sido) return sigungu;
    return `${sido}-${sigungu}`;
  }

  function regionTitle(pageOrParts) {
    const p = pageOrParts || {};
    const sido = normalizeSido(p.region_sido || p.sido);
    const sigungu = normalizeSigungu(p.region_sigungu || p.sigungu);
    const dong = clean(p.region_dong || p.dong);
    if (sido && sigungu) return dong ? `${sido} ${sigungu} (${dong})` : `${sido} ${sigungu}`;
    return regionKey(p) || "지역 미정";
  }

  function regionDisplay(pageOrParts) {
    const p = pageOrParts || {};
    const sido = normalizeSido(p.region_sido || p.sido);
    const sigungu = clean(p.region_sigungu || p.sigungu).replace(/\s+/g, " ");
    const dong = clean(p.region_dong || p.dong).replace(/\s+/g, " ");
    if (!sido && !sigungu && !dong) return "지역 미정";
    return [sido || "시·도 미입력", sigungu || "시·군·구 미입력", dong || "동 미입력"].join(" ");
  }

  function regionNotePath(pageOrParts) {
    const key = regionKey(pageOrParts);
    if (!key) return "";
    // Filename-safe: keep Hangul, strip path separators
    const safe = key.replace(/[\\/:*?"<>|]/g, "-");
    return `${REGION_ROOT}/${safe}.md`;
  }

  function regionWikilink(pageOrParts) {
    const path = regionNotePath(pageOrParts);
    if (!path) return "";
    const name = path.split("/").pop().replace(/\.md$/i, "");
    return `[[${name}]]`;
  }

  function dateValue(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function snapshotFreshness(options) {
    const opts = options || {};
    const observedAt = dateValue(opts.observedAt || opts.observed_at);
    const now = dateValue(opts.now || opts.asOf || opts.as_of);
    const maxAgeDays = Number(opts.maxAgeDays ?? opts.max_age_days ?? 30);
    if (!observedAt || !now || !Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
      return Object.freeze({ status: "unknown", observed_at: clean(opts.observedAt || opts.observed_at) });
    }
    const ageDays = (now.getTime() - observedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < 0 || ageDays > maxAgeDays) {
      return Object.freeze({ status: "stale", observed_at: clean(opts.observedAt || opts.observed_at), age_days: ageDays });
    }
    return Object.freeze({ status: "fresh", observed_at: clean(opts.observedAt || opts.observed_at), age_days: ageDays });
  }

  function getRegionAuctionSnapshot(regionSido, regionSigungu, rows, options) {
    const sido = normalizeSido(regionSido);
    const sigungu = normalizeSigungu(regionSigungu);
    const sourceRows = rows && typeof rows[Symbol.iterator] === "function" ? Array.from(rows) : [];
    const matched = sourceRows.filter((row) => {
      if (!row || typeof row !== "object") return false;
      return normalizeSido(row.region_sido) === sido && normalizeSigungu(row.region_sigungu) === sigungu;
    }).map((row) => Object.freeze({
      path: clean(row.path || row.file && row.file.path),
      case_number: clean(row.case_number),
      status: clean(row.status),
      auction_datetime: clean(row.auction_datetime),
      appraisal_price: row.appraisal_price ?? null,
      minimum_bid: row.minimum_bid ?? null,
      expected_bid: row.expected_bid ?? null,
      my_bid_price: row.my_bid_price ?? null,
      winning_bid_price: row.winning_bid_price ?? null,
      market_sale_price: row.market_sale_price ?? null,
      market_jeonse_price: row.market_jeonse_price ?? null,
      expected_deposit: row.expected_deposit ?? null,
      expected_monthly_rent: row.expected_monthly_rent ?? null,
      decision_reason: clean(row.decision_reason),
      recommend_level: clean(row.recommend_level),
      property_type: clean(row.property_type),
      address: clean(row.address),
      region_dong: clean(row.region_dong)
    }));
    const freshness = snapshotFreshness(options);
    const status = matched.length === 0 ? "empty" : freshness.status === "stale" ? "stale" : "ready";
    return Object.freeze({
      status,
      source: "dataview",
      region_sido: sido,
      region_sigungu: sigungu,
      region_key: sido && sigungu ? `${sido}-${sigungu}` : "",
      count: matched.length,
      rows: Object.freeze(matched),
      freshness,
      query: REGION_AUCTION_QUERY
    });
  }

  function buildRegionNoteBody(pageOrParts, options) {
    const opts = options || {};
    const sido = normalizeSido(pageOrParts.region_sido || pageOrParts.sido);
    const sigungu = normalizeSigungu(pageOrParts.region_sigungu || pageOrParts.sigungu);
    const title = regionKey(pageOrParts) || "지역";
    const today = opts.today || new Date().toISOString().slice(0, 10);
    // Keep in sync with SYSTEM/TEMPLATE/FORMAT/template_auction_region.md (Contract §6)
    const regionKeyStr = `${sido}-${sigungu}`.replace(/^-|-$/g, "") || title;
    return [
      "---",
      "type: auction_region",
      `title: ${title}`,
      `region_sido: ${sido}`,
      `region_sigungu: ${sigungu}`,
      "status: active",
      `updated: ${today}`,
      "metrics_as_of:",
      "metrics_scope: sigungu",
      "metrics_source:",
      "source_as_of:",
      "verification_status: unverified",
      "housing_stock_basis: reb_public_price_apartment_units",
      "sale_price_change_basis: reb_apt_price_index_yoy",
      "sale_volume_3m:",
      "housing_stock:",
      "sale_turnover_rate:",
      "sale_price_change_yoy:",
      "jeonse_ratio:",
      "move_in_12m:",
      "move_in_24m:",
      "move_in_36m:",
      "move_in_48m:",
      "move_in_60m:",
      "land_price_trend_yoy:",
      "land_price_trend_as_of:",
      "land_price_trend_scope:",
      "land_price_trend_source:",
      "households:",
      "household_change_yoy:",
      "auction_bid_rate_6m:",
      "cssclasses:",
      "  - hide-properties_editing",
      "  - hide-properties_reading",
      "---",
      "",
      `# ${sido} ${sigungu}`.trim(),
      "",
      "> **부동산 지역 분석** Resource (시군구 only).",
      "> 최신 수치 = **Frontmatter만** canonical. 아래 표는 표시용(한글 라벨).",
      "> 시계열 = **지표 히스토리** JSON. 수치는 Freeze된 어댑터로만 갱신.",
      "> 어댑터: 히스토리 → FM → 표 순으로 한 실행에 원자 갱신.",
      "",
      "## 한 줄 요약",
      "",
      "<!-- AI:PENDING:SUMMARY:START -->",
      "<!-- AI:PENDING:SUMMARY:END -->",
      "<!-- HUMAN: summary — monthly adapter must not edit -->",
      "",
      "## 시장 지표 스냅샷",
      "",
      "<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->",
      "| 지표 | 값 | 단위 | 비고 |",
      "|------|-----|------|------|",
      "| 매매 거래량(3개월) |  | 건 | R-ONE A_2024_00554 |",
      "| 주택 재고(아파트·공시) |  | 호 | 15106861 |",
      "| 매매 회전율 |  | % | 파생 vol×4/stock · 표시 ×100 |",
      "| 매매가 변동 YoY |  | % | R-ONE A_2024_00045 원지수 |",
      "| 전세가율 |  | % | R-ONE A_2024_00073 |",
      "| 입주 예정 12개월 |  | 세대 | 15111714 |",
      "| 입주 예정 24개월 |  | 세대 | 12 포함 · 기간 부족 시 비움 |",
      "| 입주 예정 36개월 |  | 세대 | 24 포함 · 기간 부족 시 비움 |",
      "| 입주 예정 48개월 |  | 세대 | 36 포함 · 기간 부족 시 비움 |",
      "| 입주 예정 60개월 |  | 세대 | 48 포함 · 기간 부족 시 비움 |",
      "| 세대수 |  | 세대 | jumin free CSV |",
      "| 세대수 변동 YoY |  | % | jumin free CSV · 전년동월 |",
      "| 경매 낙찰가율(6개월) |  | — | v1 비움 |",
      "",
      "## 지표 히스토리",
      "",
      "<!-- PRODIGY_REGION_METRICS_HISTORY -->",
      "> [!abstract]- 원본 지표 이력",
      "> ```json",
      "> {",
      '>   "schema_version": 1,',
      `>   "region_key": "${regionKeyStr}",`,
      '>   "snapshots": []',
      "> }",
      "> ```",
      "",
      "## 권역 분단 (같은 구 안)",
      "",
      "<!-- AI:PENDING:ZONES:START -->",
      "<!-- AI:PENDING:ZONES:END -->",
      "<!-- HUMAN:LOCKED -->",
      "",
      "| 권역 (동·역세권) | 성격 한 줄 | 주의 |",
      "|------------------|------------|------|",
      "|  |  |  |",
      "",
      "## 시장·공급",
      "",
      "<!-- AUTO:REGION_MARKET:START -->",
      "<!-- AUTO:REGION_MARKET:END -->",
      "",
      "## 중장기 공급 파이프라인",
      "",
      "<!-- AI:PENDING:SUPPLY_PIPELINE:START -->",
      "<!-- AI:PENDING:SUPPLY_PIPELINE:END -->",
      "",
      "## 지가 기준",
      "",
      "<!-- AUTO:REGION_LAND_PRICE:START -->",
      "<!-- AUTO:REGION_LAND_PRICE:END -->",
      "",
      "## 교통·생활",
      "",
      "<!-- AUTO:REGION_TRANSIT:START -->",
      "<!-- AUTO:REGION_TRANSIT:END -->",
      "",
      "<!-- AI:PENDING:TRANSPORT_LIFE:START -->",
      "<!-- AI:PENDING:TRANSPORT_LIFE:END -->",
      "<!-- HUMAN -->",
      "",
      "## 리스크·주의",
      "",
      "<!-- AI:PENDING:RISKS:START -->",
      "<!-- AI:PENDING:RISKS:END -->",
      "<!-- HUMAN -->",
      "",
      "## 임장 포인트",
      "",
      "<!-- AI:PENDING:SITE_VISIT:START -->",
      "<!-- AI:PENDING:SITE_VISIT:END -->",
      "<!-- HUMAN:OWNED -->",
      "",
      "## 출처·리서치",
      "",
      "<!-- AUTO:REGION_RESEARCH_SOURCES:START -->",
      "<!-- AUTO:REGION_RESEARCH_SOURCES:END -->",
      "",
      "## 연결 경매",
      "",
      "```dataview",
      'TABLE status AS "상태", auction_datetime AS "기일", minimum_bid AS "최저가", address AS "주소", region_dong AS "동"',
      'FROM "PARA/PROJECTS/Auction"',
      'WHERE type = "auction_case"',
      "WHERE region_sido = this.region_sido AND region_sigungu = this.region_sigungu",
      "SORT auction_datetime ASC",
      "```",
      "",
      "## 브리핑 메모",
      "",
      "## AI 조사 로그",
      "",
      "<!-- AUTO:REGION_RESEARCH_LOG:START -->",
      "<!-- AUTO:REGION_RESEARCH_LOG:END -->",
      ""
    ].join("\n");
  }

  async function ensureFolder(app, folderPath) {
    if (!app || !app.vault || !folderPath) return;
    if (app.vault.getAbstractFileByPath(folderPath)) return;
    const parts = folderPath.split("/");
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current) && app.vault.createFolder) {
        try { await app.vault.createFolder(current); } catch (_e) { /* exists */ }
      }
    }
  }

  /**
   * Open existing region note or create from template/body.
   * Never overwrites an existing region note.
   */
  async function openOrCreateRegionNote(app, pageOrParts) {
    const path = regionNotePath(pageOrParts);
    if (!path) throw new Error("region_sido / region_sigungu 가 없어 지역 노트를 열 수 없습니다.");
    let file = app.vault.getAbstractFileByPath(path);
    if (!file) {
      await ensureFolder(app, REGION_ROOT);
      let body = "";
      const templateFile = app.vault.getAbstractFileByPath(TEMPLATE_PATH);
      if (templateFile) {
        body = await app.vault.read(templateFile);
        const sido = normalizeSido(pageOrParts.region_sido || pageOrParts.sido);
        const sigungu = normalizeSigungu(pageOrParts.region_sigungu || pageOrParts.sigungu);
        const title = regionKey(pageOrParts);
        const key = regionKey(pageOrParts);
        const today = new Date().toISOString().slice(0, 10);
        // v1: region Resource has no region_dong; fill region_key for history JSON
        body = body
          .replace(/<%\s*region_sido\s*%>/g, sido)
          .replace(/<%\s*region_sigungu\s*%>/g, sigungu)
          .replace(/<%\s*region_dong\s*%>/g, "")
          .replace(/<%\s*region_key\s*%>/g, key)
          .replace(/<%\s*title\s*%>/g, title)
          .replace(/<%\s*date\s*%>/g, today)
          .replace(/\{\{region_sido\}\}/g, sido)
          .replace(/\{\{region_sigungu\}\}/g, sigungu)
          .replace(/\{\{region_dong\}\}/g, "")
          .replace(/\{\{region_key\}\}/g, key)
          .replace(/\{\{title\}\}/g, title)
          .replace(/\{\{date\}\}/g, today);
      } else {
        body = buildRegionNoteBody(pageOrParts);
      }
      file = await app.vault.create(path, body);
    }
    await app.workspace.openLinkText(path.replace(/\.md$/, ""), "", false);
    return file;
  }

  const api = {
    REGION_ROOT,
    TEMPLATE_PATH,
    REGION_AUCTION_QUERY,
    clean,
    normalizeSido,
    normalizeSigungu,
    regionKey,
    regionTitle,
    regionDisplay,
    regionNotePath,
    regionWikilink,
    getRegionAuctionSnapshot,
    buildRegionNoteBody,
    openOrCreateRegionNote
  };

  root.AuctionRegionCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
