(function (root) {
  "use strict";

  /**
   * Real-estate region Resource helpers (internal type: auction_region).
   * v1 key = region_sido + region_sigungu only (no dong on region notes).
   * Metrics contract: SYSTEM/docs/Region_Property_Contract_v1.md
   */

  const REGION_ROOT = "PARA/RESOURCES/Auction Regions";
  const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_auction_region.md";

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
      "> 시계열 = **지표 히스토리** JSON. dry-run Freeze 전 숫자 기입 금지.",
      "> 어댑터: 히스토리 → FM → 표 순으로 한 실행에 원자 갱신.",
      "",
      "## 한 줄 요약",
      "",
      "<!-- HUMAN: summary — monthly adapter must not edit -->",
      "",
      "## 시장 지표 스냅샷",
      "",
      "<!-- PRODIGY_REGION_METRICS_DISPLAY: regenerated from frontmatter; do not hand-edit values -->",
      "| 지표 | 값 | 단위 | 비고 |",
      "|------|-----|------|------|",
      "| 매매 거래량(3개월) |  |  | 15134761 |",
      "| 주택 재고(아파트·공시) |  | 호 | 15106861 |",
      "| 매매 회전율 |  | 비율 | 파생 vol×4/stock |",
      "| 매매가 변동 YoY |  | % | 15069821 원지수 |",
      "| 전세가율 |  | % | 15143751 |",
      "| 입주 예정 12개월 |  | 세대 | 15111714 |",
      "| 입주 예정 24개월 |  | 세대 | 12 포함 · 기간 부족 시 비움 |",
      "| 세대수 |  | 세대 | 15108071 |",
      "| 세대수 변동 YoY |  | % | 15108071 |",
      "| 경매 낙찰가율(6개월) |  | — | v1 비움 |",
      "",
      "## 지표 히스토리",
      "",
      "<!-- PRODIGY_REGION_METRICS_HISTORY -->",
      "```json",
      "{",
      '  "schema_version": 1,',
      `  "region_key": "${regionKeyStr}",`,
      '  "snapshots": []',
      "}",
      "```",
      "",
      "## 권역 분단 (같은 구 안)",
      "",
      "<!-- HUMAN:LOCKED -->",
      "",
      "| 권역 (동·역세권) | 성격 한 줄 | 주의 |",
      "|------------------|------------|------|",
      "|  |  |  |",
      "",
      "## 시장·공급",
      "",
      "<!-- HUMAN -->",
      "",
      "## 교통·생활",
      "",
      "<!-- HUMAN -->",
      "",
      "## 리스크·주의",
      "",
      "<!-- HUMAN -->",
      "",
      "## 임장 포인트",
      "",
      "<!-- HUMAN:OWNED -->",
      "",
      "## 출처·리서치",
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
      "<!-- Evidence only — never write metric numbers here -->",
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
    clean,
    normalizeSido,
    normalizeSigungu,
    regionKey,
    regionTitle,
    regionNotePath,
    regionWikilink,
    buildRegionNoteBody,
    openOrCreateRegionNote
  };

  root.AuctionRegionCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
