(function (root) {
  "use strict";

  /**
   * Auction Day Runner — execution data layer only.
   * Reuses existing Auction properties; court/auction checklists are temporary day state.
   */

  const RESULT_OUTCOMES = Object.freeze(["won", "lost", "skipped"]);

  /** Court-level preparation (shared per court, not stored on Objects). */
  const COURT_PREP_ITEMS = Object.freeze([
    Object.freeze({ id: "identification", label: "신분증" }),
    Object.freeze({ id: "seal", label: "도장" }),
    Object.freeze({ id: "deposit", label: "보증금 준비" }),
    Object.freeze({ id: "bid_form", label: "입찰표 준비" }),
    Object.freeze({ id: "case_numbers", label: "사건번호 확인" }),
    Object.freeze({ id: "courtroom", label: "법정 확인" }),
    Object.freeze({ id: "start_time", label: "입찰 시작 시각 확인" })
  ]);

  /** Per-auction lightweight execution checks (temporary day state). */
  const AUCTION_EXEC_ITEMS = Object.freeze([
    Object.freeze({ id: "case_checked", label: "사건번호 확인" }),
    Object.freeze({ id: "property_checked", label: "물건번호 확인" }),
    Object.freeze({ id: "minimum_checked", label: "최저가 확인" }),
    Object.freeze({ id: "deposit_checked", label: "보증금 확인" }),
    Object.freeze({ id: "final_bid_checked", label: "최종 입찰가 확인" })
  ]);

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function hasValue(value) {
    const text = clean(value);
    return text !== "" && text !== "정보 없음";
  }

  function toIsoDate(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "object") {
      if (typeof value.toISODate === "function") {
        try {
          const iso = value.toISODate();
          if (iso) return String(iso).slice(0, 10);
        } catch (_e) { /* fall through */ }
      }
      if (typeof value.toISOString === "function") {
        try {
          return value.toISOString().slice(0, 10);
        } catch (_e) { /* fall through */ }
      }
      if (value.year && value.month && value.day) {
        return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
      }
    }
    const str = String(value).trim();
    const match = str.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
    if (!match) return "";
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function isoToday(now) {
    const d = now instanceof Date ? now : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function pagePath(page) {
    if (!page) return "";
    if (page.file && page.file.path) return String(page.file.path);
    if (page.path) return String(page.path);
    return "";
  }

  function pageTitle(page) {
    if (!page) return "제목 없음";
    if (hasValue(page.case_number)) return clean(page.case_number);
    if (page.file && page.file.name) return String(page.file.name).replace(/\.md$/i, "");
    const path = pagePath(page);
    if (path) return path.split("/").pop().replace(/\.md$/i, "");
    return "제목 없음";
  }

  function propertyName(page) {
    const addr = page && page.address;
    if (!hasValue(addr)) return "";
    const parts = String(addr).split(",");
    if (parts.length > 1) return parts[1].trim();
    const words = String(addr).trim().split(/\s+/);
    if (words.length > 3) return words.slice(-2).join(" ");
    return String(addr).trim();
  }

  function normalizeCourt(value) {
    const court = clean(value);
    return court || "법원 미지정";
  }

  function ensurePageFile(page) {
    if (!page) return null;
    if (page.file && page.file.path) return page;
    const path = pagePath(page);
    if (!path) return page;
    return Object.assign({}, page, {
      file: page.file || { path, name: path.split("/").pop() || path }
    });
  }

  /**
   * Decision display kind for execution UI (maps onto existing status only).
   * bid | skip | pending
   */
  function decisionKind(page) {
    const status = clean(page && page.status);
    if (status === "skipped") return "skip";
    if (status === "won" || status === "lost") return "bid";
    if (status === "bidding" && hasValue(page && page.my_bid_price)) return "bid";
    if (status === "bidding") return "pending";
    return "pending";
  }

  function decisionLabel(kind, display) {
    const d = display || (root.prodigyDisplay);
    if (kind === "skip") return d && d.status ? d.status("skipped") : "입찰 포기";
    if (kind === "bid") return d && d.status ? d.status("bidding") : "입찰";
    return "대기";
  }

  /**
   * Collect auctions scheduled for a calendar day (bid date = auction_datetime date).
   * Only status = bidding (입찰 예정) — same pipeline scope as Bid Calendar.
   * One pass over provided pages — no vault scan.
   */
  function collectDayAuctions(pages, dateIso) {
    const target = dateIso || isoToday();
    const list = Array.isArray(pages) ? pages : [];
    const items = [];

    list.forEach((raw) => {
      if (!raw) return;
      const type = clean(raw.type);
      if (type && type !== "auction_case") return;
      const status = clean(raw.status);
      if (status !== "bidding") return;
      const bidDate = toIsoDate(raw.auction_datetime);
      if (!bidDate || bidDate !== target) return;

      const page = ensurePageFile(raw);
      const path = pagePath(page);
      items.push({
        path,
        object_path: path,
        page,
        title: pageTitle(page),
        property_name: propertyName(page),
        court: normalizeCourt(page.court),
        status: clean(page.status),
        case_number: clean(page.case_number) || pageTitle(page),
        minimum_bid: page.minimum_bid,
        expected_bid: page.expected_bid,
        bid_deposit: page.bid_deposit,
        my_bid_price: page.my_bid_price,
        winning_bid_price: page.winning_bid_price,
        auction_datetime: page.auction_datetime,
        bid_date: bidDate,
        decision: decisionKind(page)
      });
    });

    items.sort((a, b) => {
      const c = String(a.court).localeCompare(String(b.court), "ko");
      if (c !== 0) return c;
      return String(a.case_number).localeCompare(String(b.case_number), "ko");
    });

    return items;
  }

  /** Group day auctions by court. */
  function groupByCourt(dayAuctions) {
    const buckets = Object.create(null);
    const order = [];
    (Array.isArray(dayAuctions) ? dayAuctions : []).forEach((item) => {
      const court = normalizeCourt(item.court);
      if (!buckets[court]) {
        buckets[court] = [];
        order.push(court);
      }
      buckets[court].push(item);
    });
    order.sort((a, b) => {
      if (a === "법원 미지정") return 1;
      if (b === "법원 미지정") return -1;
      return a.localeCompare(b, "ko");
    });
    return order.map((court) => ({
      court,
      count: buckets[court].length,
      auctions: buckets[court]
    }));
  }

  function emptyDayState(dateIso) {
    return {
      schema_version: "auction-day-state-v1",
      date: dateIso,
      court_prep: {},
      auction_checks: {},
      updated_at: new Date().toISOString()
    };
  }

  function dayStatePath(dateIso) {
    return `SYSTEM/CACHE/auction-day/day-${dateIso}.json`;
  }

  async function ensureFolder(app, folderPath) {
    if (!app || !app.vault || !folderPath) return;
    if (app.vault.getAbstractFileByPath(folderPath)) return;
    const parts = folderPath.split("/");
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        try {
          await app.vault.createFolder(current);
        } catch (_e) {
          try {
            if (app.vault.adapter && app.vault.adapter.mkdir) await app.vault.adapter.mkdir(current);
          } catch (_err) { /* ignore */ }
        }
      }
    }
  }

  async function loadDayState(app, dateIso) {
    const date = dateIso || isoToday();
    const fallback = emptyDayState(date);
    if (!app || !app.vault) return fallback;
    const path = dayStatePath(date);
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return fallback;
    try {
      const text = await app.vault.read(file);
      const data = JSON.parse(text);
      return {
        schema_version: data.schema_version || "auction-day-state-v1",
        date: data.date || date,
        court_prep: data.court_prep && typeof data.court_prep === "object" ? data.court_prep : {},
        auction_checks: data.auction_checks && typeof data.auction_checks === "object" ? data.auction_checks : {},
        updated_at: data.updated_at || ""
      };
    } catch (_e) {
      return fallback;
    }
  }

  async function saveDayState(app, state) {
    if (!app || !app.vault || !state) return null;
    const date = state.date || isoToday();
    const payload = {
      schema_version: "auction-day-state-v1",
      date,
      court_prep: state.court_prep || {},
      auction_checks: state.auction_checks || {},
      updated_at: new Date().toISOString()
    };
    const path = dayStatePath(date);
    const folder = path.split("/").slice(0, -1).join("/");
    await ensureFolder(app, folder);
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    const file = app.vault.getAbstractFileByPath(path);
    if (file) await app.vault.modify(file, text);
    else await app.vault.create(path, text);
    return payload;
  }

  function getCourtPrep(state, court) {
    const key = normalizeCourt(court);
    const source = (state && state.court_prep && state.court_prep[key]) || {};
    const result = {};
    COURT_PREP_ITEMS.forEach((item) => {
      result[item.id] = !!source[item.id];
    });
    return result;
  }

  function setCourtPrepItem(state, court, itemId, checked) {
    const next = state || emptyDayState(isoToday());
    const key = normalizeCourt(court);
    if (!next.court_prep) next.court_prep = {};
    if (!next.court_prep[key]) next.court_prep[key] = {};
    next.court_prep[key][itemId] = !!checked;
    return next;
  }

  function getAuctionChecks(state, path) {
    const source = (state && state.auction_checks && state.auction_checks[path]) || {};
    const result = {};
    AUCTION_EXEC_ITEMS.forEach((item) => {
      result[item.id] = !!source[item.id];
    });
    return result;
  }

  function setAuctionCheckItem(state, path, itemId, checked) {
    const next = state || emptyDayState(isoToday());
    if (!next.auction_checks) next.auction_checks = {};
    if (!next.auction_checks[path]) next.auction_checks[path] = {};
    next.auction_checks[path][itemId] = !!checked;
    return next;
  }

  function isValidOutcome(outcome) {
    return RESULT_OUTCOMES.indexOf(clean(outcome)) !== -1;
  }

  /**
   * Save final bid amount into existing my_bid_price. Never touches expected_bid.
   */
  async function saveFinalBid(app, objectPath, amount) {
    if (!app || !app.fileManager || !objectPath) throw new Error("Cannot save final bid.");
    const tFile = app.vault.getAbstractFileByPath(objectPath);
    if (!tFile) throw new Error("Auction Object not found.");
    const raw = clean(amount);
    if (!raw) throw new Error("Final bid amount is required.");
    const numeric = Number(String(raw).replace(/,/g, ""));
    const value = Number.isFinite(numeric) && numeric > 0 ? numeric : raw;
    const today = isoToday();
    await app.fileManager.processFrontMatter(tFile, (fm) => {
      fm.my_bid_price = value;
      fm.updated = today;
    });
    return value;
  }

  /**
   * Record auction day result using existing status enum only.
   * outcome: won | lost | skipped
   * Optional: finalBid → my_bid_price, winningPrice → winning_bid_price, memo → decision_reason/my_opinion
   */
  async function recordResult(app, objectPath, options) {
    const opts = options || {};
    const outcome = clean(opts.outcome);
    if (!isValidOutcome(outcome)) throw new Error("Invalid outcome. Use won, lost, or skipped.");
    if (!app || !app.fileManager || !objectPath) throw new Error("Cannot record result.");
    const tFile = app.vault.getAbstractFileByPath(objectPath);
    if (!tFile) throw new Error("Auction Object not found.");

    const today = isoToday();
    const display = root.prodigyDisplay;
    const memo = clean(opts.memo);
    const bidderCount = clean(opts.bidderCount);
    const finalBid = clean(opts.finalBid);
    const winningPrice = clean(opts.winningPrice);

    let reason = memo;
    if (bidderCount) {
      const bidderNote = `응찰 ${bidderCount}명`;
      reason = reason ? `${reason} · ${bidderNote}` : bidderNote;
    }
    if (!reason) {
      if (outcome === "won") reason = "당일 입찰 결과";
      else if (outcome === "lost") reason = "당일 입찰 결과";
      else reason = "당일 입찰 포기";
    }

    await app.fileManager.processFrontMatter(tFile, (fm) => {
      fm.status = outcome;
      fm.decision_reason = reason;
      fm.decision_date = today;
      fm.updated = today;
      if (memo) fm.my_opinion = memo;
      if (finalBid && (outcome === "won" || outcome === "lost")) {
        const n = Number(String(finalBid).replace(/,/g, ""));
        fm.my_bid_price = Number.isFinite(n) && n > 0 ? n : finalBid;
      }
      if (winningPrice && (outcome === "won" || outcome === "lost")) {
        const n = Number(String(winningPrice).replace(/,/g, ""));
        fm.winning_bid_price = Number.isFinite(n) && n > 0 ? n : winningPrice;
      }
    });

    // Lightweight decision log in body when Investment Decision section exists (same pattern as card).
    try {
      let content = await app.vault.read(tFile);
      let decisionHeader = "# Investment Decision";
      let decisionIndex = content.indexOf(decisionHeader);
      if (decisionIndex === -1) {
        decisionHeader = "# Decision";
        decisionIndex = content.indexOf(decisionHeader);
      }
      if (decisionIndex !== -1) {
        const nextH1Match = content.slice(decisionIndex + decisionHeader.length).match(/\n#[^#\n]/);
        let endIndex = content.length;
        if (nextH1Match) {
          endIndex = decisionIndex + decisionHeader.length + nextH1Match.index + 1;
        }
        const section = content.slice(decisionIndex, endIndex);
        const separator = /\n---[ \t]*\n?$/.exec(section);
        const insertAt = separator ? decisionIndex + separator.index : endIndex;
        const statusLabel = display && display.status ? display.status(outcome) : outcome;
        const reasonLabel = display && display.property ? display.property("decision_reason") : "decision_reason";
        const entry = [
          "",
          `### ${today} · ${statusLabel} · 입찰 실행`,
          "",
          `- ${reasonLabel}: ${reason}`,
          ""
        ].join("\n");
        const updatedContent = content.slice(0, insertAt).trimEnd() + "\n" + entry + content.slice(insertAt);
        await app.vault.modify(tFile, updatedContent);
      }
    } catch (_bodyErr) {
      // Frontmatter is SSoT for status; body log is best-effort.
    }

    return { path: objectPath, status: outcome };
  }

  function buildDayModel(pages, dateIso, dayState) {
    const date = dateIso || isoToday();
    const auctions = collectDayAuctions(pages, date);
    const courts = groupByCourt(auctions);
    return {
      date,
      total: auctions.length,
      courts,
      auctions,
      state: dayState || emptyDayState(date)
    };
  }

  /**
   * Post-result review queue (no new properties).
   * - won / lost → 복기 시작 전 (pending_review)
   * - reviewing → 복기 진행 중 (in_progress)
   * - skipped → 보관 전 정리 (pending_close)
   */
  function buildReviewQueue(pages) {
    const list = Array.isArray(pages) ? pages : [];
    const out = [];
    list.forEach((raw) => {
      if (!raw) return;
      const type = clean(raw.type);
      if (type && type !== "auction_case") return;
      const status = clean(raw.status);
      const path = pagePath(raw);
      if (!path) return;
      let stage = "";
      let reason = "";
      let next_status = "";
      if (status === "won" || status === "lost") {
        stage = "pending_review";
        reason = "결과 기록 후 복기가 시작되지 않았습니다.";
        next_status = "reviewing";
      } else if (status === "reviewing") {
        stage = "in_progress";
        reason = "복기 진행 중입니다.";
        next_status = "archived";
      } else if (status === "skipped") {
        stage = "pending_close";
        reason = "입찰 포기 후 보관 전입니다.";
        next_status = "archived";
      } else {
        return;
      }
      out.push({
        path,
        title: pageTitle(raw),
        case_number: hasValue(raw.case_number) ? clean(raw.case_number) : pageTitle(raw),
        status,
        stage,
        reason,
        next_status,
        auction_datetime: raw.auction_datetime || "",
        decision_reason: raw.decision_reason || "",
        page: raw
      });
    });
    const stageRank = { pending_review: 0, in_progress: 1, pending_close: 2 };
    out.sort((a, b) => {
      const ra = stageRank[a.stage] != null ? stageRank[a.stage] : 9;
      const rb = stageRank[b.stage] != null ? stageRank[b.stage] : 9;
      if (ra !== rb) return ra - rb;
      return String(b.auction_datetime || "").localeCompare(String(a.auction_datetime || ""));
    });
    return out;
  }

  /**
   * Load auction_case pages from vault metadata (for Day Runner from cards).
   * No full-file read — frontmatter cache only.
   */
  function pagesFromVault(app) {
    if (!app || !app.vault || typeof app.vault.getMarkdownFiles !== "function") return [];
    const folder = "PARA/PROJECTS/Auction/";
    const files = app.vault.getMarkdownFiles().filter((f) => {
      if (!f || !f.path) return false;
      if (!f.path.startsWith(folder)) return false;
      if (f.path.indexOf("/_") !== -1) return false;
      return true;
    });
    return files.map((f) => {
      let fm = {};
      try {
        const cache = app.metadataCache && typeof app.metadataCache.getFileCache === "function"
          ? app.metadataCache.getFileCache(f)
          : null;
        fm = (cache && cache.frontmatter) || {};
      } catch (_e) {
        fm = {};
      }
      return Object.assign({}, fm, {
        type: clean(fm.type) || "auction_case",
        path: f.path,
        file: f,
        name: clean(fm.case_number) || f.basename || f.name
      });
    });
  }

  const api = {
    RESULT_OUTCOMES,
    COURT_PREP_ITEMS,
    AUCTION_EXEC_ITEMS,
    clean,
    hasValue,
    toIsoDate,
    isoToday,
    pagePath,
    pageTitle,
    propertyName,
    normalizeCourt,
    decisionKind,
    decisionLabel,
    collectDayAuctions,
    groupByCourt,
    emptyDayState,
    dayStatePath,
    loadDayState,
    saveDayState,
    getCourtPrep,
    setCourtPrepItem,
    getAuctionChecks,
    setAuctionCheckItem,
    isValidOutcome,
    saveFinalBid,
    recordResult,
    buildDayModel,
    buildReviewQueue,
    pagesFromVault
  };

  root.AuctionDayCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
