(function (root) {
  "use strict";

  /**
   * Auction Region knowledge helpers.
   * Reuses existing auction properties: region_sido, region_sigungu, region_dong.
   * Does not invent a new Object type Workspace — region notes are knowledge notes.
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
    const dong = clean(pageOrParts.region_dong || pageOrParts.dong);
    const title = regionKey(pageOrParts) || "지역";
    const today = opts.today || new Date().toISOString().slice(0, 10);
    return [
      "---",
      "type: auction_region",
      `title: ${title}`,
      `region_sido: ${sido}`,
      `region_sigungu: ${sigungu}`,
      `region_dong: ${dong}`,
      "status: active",
      `updated: ${today}`,
      "cssclasses:",
      "  - hide-properties_editing",
      "  - hide-properties_reading",
      "---",
      "",
      `# ${sido} ${sigungu}`.trim(),
      "",
      "> 경매 지역 지식 노트 · 딥리서치·임장 관찰을 쌓고 물건 브리핑에 연결합니다.",
      "> AI 초안은 pending으로 두고, 사람 승인 후 본문에 남깁니다.",
      "",
      "## 한 줄 요약",
      "",
      "-",
      "",
      "## 시장·공급",
      "",
      "- ",
      "",
      "## 교통·생활",
      "",
      "- ",
      "",
      "## 리스크·주의",
      "",
      "- ",
      "",
      "## 임장 포인트",
      "",
      "- ",
      "",
      "## 출처·리서치",
      "",
      "<!-- 날짜 · 출처 · 핵심만 -->",
      "-",
      "",
      "## 연결 경매",
      "",
      "```dataview",
      "TABLE status AS 상태, auction_datetime AS 기일, minimum_bid AS 최저가",
      'FROM "PARA/PROJECTS/Auction"',
      'WHERE type = "auction_case"',
      `WHERE region_sido = this.region_sido AND region_sigungu = this.region_sigungu`,
      "SORT auction_datetime ASC",
      "```",
      "",
      "## 브리핑 메모",
      "",
      "- ",
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
        const dong = clean(pageOrParts.region_dong || pageOrParts.dong);
        const title = regionKey(pageOrParts);
        const today = new Date().toISOString().slice(0, 10);
        body = body
          .replace(/<%\s*region_sido\s*%>/g, sido)
          .replace(/<%\s*region_sigungu\s*%>/g, sigungu)
          .replace(/<%\s*region_dong\s*%>/g, dong)
          .replace(/<%\s*title\s*%>/g, title)
          .replace(/<%\s*date\s*%>/g, today)
          .replace(/\{\{region_sido\}\}/g, sido)
          .replace(/\{\{region_sigungu\}\}/g, sigungu)
          .replace(/\{\{region_dong\}\}/g, dong)
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
