"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/auction-learning-core.js"));
const writer = require(path.join(ROOT, "SYSTEM/Views/auction-outcome-writer.js"));

// ─── Fake Obsidian app harness ─────────────────────────────────────────────────

function createFakeApp(initialFiles) {
  const files = new Map();
  Object.entries(initialFiles || {}).forEach(([p, fm]) => {
    files.set(p, { path: p, fm: Object.assign({}, fm), writes: 0 });
  });
  return {
    files,
    vault: {
      getAbstractFileByPath(p) {
        return files.get(p) || null;
      }
    },
    metadataCache: {
      getFileCache(tFile) {
        return tFile ? { frontmatter: Object.assign({}, tFile.fm) } : null;
      }
    },
    fileManager: {
      async processFrontMatter(tFile, fn) {
        fn(tFile.fm);
        tFile.writes += 1;
      }
    }
  };
}

describe("AuctionOutcomeWriter — tuple validation", () => {
  it("builds a won tuple with positive price", () => {
    const result = writer.buildTuple({
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      winning_bid_price: 250000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.tuple, {
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      winning_bid_price: 250000000
    });
  });

  it("builds a lost tuple", () => {
    const result = writer.buildTuple({
      auction_outcome: "lost",
      auction_result_date: "2026-04-01",
      winning_bid_price: 180000000,
      auction_datetime: "2026-04-01 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, true);
    assert.equal(result.tuple.auction_outcome, "lost");
  });

  it("builds a skipped tuple that may omit price", () => {
    const result = writer.buildTuple({
      auction_outcome: "skipped",
      auction_result_date: "2026-05-10",
      auction_datetime: "2026-05-10 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, true);
    assert.equal(result.tuple.winning_bid_price, null);
  });

  it("rejects won without price", () => {
    const result = writer.buildTuple({
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, false);
  });
});

describe("AuctionOutcomeWriter — date rules", () => {
  it("rejects future result date", () => {
    const result = writer.buildTuple({
      auction_outcome: "won",
      auction_result_date: "2026-08-01",
      winning_bid_price: 100000000,
      auction_datetime: "2026-08-01 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, false);
  });

  it("rejects result date before auction_datetime", () => {
    const result = writer.buildTuple({
      auction_outcome: "won",
      auction_result_date: "2026-03-14",
      winning_bid_price: 100000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, false);
  });

  it("accepts result date equal to auction_datetime date", () => {
    const result = writer.buildTuple({
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      winning_bid_price: 100000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, true);
  });
});

describe("AuctionOutcomeWriter — dry-run default", () => {
  it("defaults to dry-run and does not mutate", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": { id: "case-1", status: "bidding" }
    });
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/case-1.md", {
      auction_outcome: "won",
      auction_result_date: "2026-03-15",
      winning_bid_price: 250000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01" });
    assert.equal(result.ok, true);
    assert.equal(result.dry_run, true);
    const file = app.files.get("PARA/PROJECTS/Auction/case-1.md");
    assert.equal(file.writes, 0);
    assert.equal(file.fm.auction_outcome, undefined);
    assert.equal(file.fm.status, "bidding");
  });

  it("writes tuple on --execute and never touches status", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": { id: "case-1", status: "bidding" }
    });
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/case-1.md", {
      auction_outcome: "lost",
      auction_result_date: "2026-04-01",
      winning_bid_price: 180000000,
      auction_datetime: "2026-04-01 10:00"
    }, { as_of: "2026-07-01", execute: true });
    assert.equal(result.ok, true);
    assert.equal(result.dry_run, false);
    const file = app.files.get("PARA/PROJECTS/Auction/case-1.md");
    assert.equal(file.writes, 1);
    assert.equal(file.fm.auction_outcome, "lost");
    assert.equal(file.fm.auction_result_date, "2026-04-01");
    assert.equal(file.fm.winning_bid_price, 180000000);
    // status untouched — lifecycle independent from outcome
    assert.equal(file.fm.status, "bidding");
  });
});

describe("AuctionOutcomeWriter — overwrite/clear confirmation", () => {
  it("requires confirmation to overwrite existing outcome", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": {
        id: "case-1",
        status: "archived",
        auction_outcome: "won",
        auction_result_date: "2026-03-15",
        winning_bid_price: 250000000
      }
    });
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/case-1.md", {
      auction_outcome: "lost",
      auction_result_date: "2026-03-15",
      winning_bid_price: 300000000,
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01", execute: true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("Confirmation")));
    assert.equal(result.existing.auction_outcome, "won");
    const file = app.files.get("PARA/PROJECTS/Auction/case-1.md");
    assert.equal(file.writes, 0);
    assert.equal(file.fm.auction_outcome, "won");
  });

  it("overwrites whole tuple after explicit confirmation", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": {
        id: "case-1",
        status: "archived",
        auction_outcome: "won",
        auction_result_date: "2026-03-15",
        winning_bid_price: 250000000
      }
    });
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/case-1.md", {
      auction_outcome: "lost",
      auction_result_date: "2026-04-01",
      winning_bid_price: 300000000,
      auction_datetime: "2026-04-01 10:00"
    }, { as_of: "2026-07-01", execute: true, confirmed: true });
    assert.equal(result.ok, true);
    const file = app.files.get("PARA/PROJECTS/Auction/case-1.md");
    assert.equal(file.fm.auction_outcome, "lost");
    assert.equal(file.fm.auction_result_date, "2026-04-01");
    assert.equal(file.fm.winning_bid_price, 300000000);
  });

  it("requires confirmation to clear existing outcome", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": {
        id: "case-1",
        status: "archived",
        auction_outcome: "won",
        auction_result_date: "2026-03-15",
        winning_bid_price: 250000000
      }
    });
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/case-1.md", {}, {
      as_of: "2026-07-01", execute: true, action: "clear"
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes("Confirmation")));
  });

  it("clears tuple after confirmation", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": {
        id: "case-1",
        status: "archived",
        auction_outcome: "won",
        auction_result_date: "2026-03-15",
        winning_bid_price: 250000000
      }
    });
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/case-1.md", {}, {
      as_of: "2026-07-01", execute: true, action: "clear", confirmed: true
    });
    assert.equal(result.ok, true);
    const file = app.files.get("PARA/PROJECTS/Auction/case-1.md");
    assert.equal(file.fm.auction_outcome, undefined);
    assert.equal(file.fm.auction_result_date, undefined);
  });
});

describe("AuctionOutcomeWriter — archived outcome survival", () => {
  it("preserves canonical outcome on archived cases (read survives)", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/case-1.md": {
        id: "case-1",
        status: "archived",
        auction_outcome: "won",
        auction_result_date: "2026-03-15",
        winning_bid_price: 250000000
      }
    });
    // Reading the outcome back through the learning core works on archived cases
    const file = app.files.get("PARA/PROJECTS/Auction/case-1.md");
    assert.equal(core.outcomeDisplayLabel(file.fm), "won");
    const validation = core.validateOutcome(file.fm, { as_of: "2026-07-01" });
    assert.equal(validation.valid, true);
  });
});

describe("AuctionOutcomeWriter — legacy pending", () => {
  it("legacy status-only result shows 결과 입력 대기", () => {
    assert.equal(core.outcomeDisplayLabel({ status: "won" }), "결과 입력 대기");
    assert.equal(core.outcomeDisplayLabel({ status: "lost" }), "결과 입력 대기");
    assert.equal(core.outcomeDisplayLabel({ status: "skipped" }), "결과 입력 대기");
  });

  it("writer does not set outcome from legacy status", async () => {
    const app = createFakeApp({
      "PARA/PROJECTS/Auction/legacy.md": { id: "legacy", status: "won" }
    });
    // No explicit outcome input → invalid, nothing written
    const result = await writer.writeOutcome(app, "PARA/PROJECTS/Auction/legacy.md", {
      auction_datetime: "2026-03-15 10:00"
    }, { as_of: "2026-07-01", execute: true });
    assert.equal(result.ok, false);
    const file = app.files.get("PARA/PROJECTS/Auction/legacy.md");
    assert.equal(file.writes, 0);
    assert.equal(file.fm.auction_outcome, undefined);
    assert.equal(file.fm.status, "won");
  });
});

describe("AuctionOutcomeWriter — closed property-type aliases", () => {
  it("accepts only the closed alias set", () => {
    const closed = ["apartment", "officetel", "multi_family", "single_family", "commercial", "land"];
    closed.forEach((t) => assert.equal(core.normalizePropertyType(t), t));
  });

  it("maps every documented alias to its canonical type", () => {
    assert.equal(core.normalizePropertyType("아파트"), "apartment");
    assert.equal(core.normalizePropertyType("오피스텔"), "officetel");
    ["다세대", "다세대주택", "연립", "연립주택", "빌라"].forEach((a) =>
      assert.equal(core.normalizePropertyType(a), "multi_family"));
    ["단독", "단독주택", "다가구", "다가구주택"].forEach((a) =>
      assert.equal(core.normalizePropertyType(a), "single_family"));
    assert.equal(core.normalizePropertyType("상가"), "commercial");
    assert.equal(core.normalizePropertyType("토지"), "land");
  });

  it("maps anything outside the closed set to unmapped", () => {
    assert.equal(core.normalizePropertyType("공장"), "unmapped");
    assert.equal(core.normalizePropertyType("factory"), "unmapped");
  });
});

describe("AuctionOutcomeWriter — positive m² validation", () => {
  const baseTarget = {
    id: "t",
    path: "PARA/PROJECTS/Auction/t.md",
    region_key: "A",
    property_type: "apartment",
    exclusive_area: 84.5
  };

  it("rejects zero exclusive_area on target", () => {
    const results = core.internalComparables({ ...baseTarget, exclusive_area: 0 }, [], { as_of: "2026-07-01" });
    assert.deepEqual(results, []);
  });

  it("rejects negative exclusive_area on target", () => {
    const results = core.internalComparables({ ...baseTarget, exclusive_area: -10 }, [], { as_of: "2026-07-01" });
    assert.deepEqual(results, []);
  });

  it("rejects non-finite exclusive_area on target", () => {
    const results = core.internalComparables({ ...baseTarget, exclusive_area: NaN }, [], { as_of: "2026-07-01" });
    assert.deepEqual(results, []);
  });

  it("rejects candidates with non-positive area", () => {
    const candidates = [
      {
        id: "c1", path: "PARA/PROJECTS/Auction/c1.md", region_key: "A", property_type: "apartment",
        exclusive_area: 0, auction_outcome: "won", auction_result_date: "2026-05-01", winning_bid_price: 100000000
      }
    ];
    const results = core.internalComparables(baseTarget, candidates, { as_of: "2026-07-01" });
    assert.equal(results.length, 0);
  });
});

describe("AuctionOutcomeWriter — NFC collision", () => {
  it("treats NFC-equivalent ids as duplicates and excludes both", () => {
    // "가" composed (NFC) vs decomposed (NFD) — same grapheme, different bytes
    const nfc = "\uAC00"; // 가 (composed)
    const nfd = "\u1100\u1161"; // 가 (decomposed)
    assert.notEqual(nfc, nfd);
    assert.equal(nfc.normalize("NFC"), nfd.normalize("NFC"));

    const records = [
      { id: nfc, path: `PARA/PROJECTS/Auction/${nfc}.md`, auction_outcome: "lost", auction_result_date: "2026-05-01", winning_bid_price: 100000000, region_key: "A" },
      { id: nfd, path: `PARA/PROJECTS/Auction/${nfd}.md`, auction_outcome: "lost", auction_result_date: "2026-04-01", winning_bid_price: 200000000, region_key: "A" }
    ];
    const { eligible, excluded } = core.uniqueEligibleCases(records);
    // Both normalize to the same NFC id → duplicate group → both excluded
    assert.equal(eligible.length, 0);
    assert.equal(excluded.length, 2);
  });

  it("NFC-normalizes id and filename stem before identity check", () => {
    const nfd = "\u1100\u1161";
    const identity = core.caseIdentity({ id: nfd, path: `PARA/PROJECTS/Auction/${nfd}.md` });
    assert.equal(identity.valid, true);
    assert.equal(identity.id, nfd.normalize("NFC"));
  });
});

describe("AuctionOutcomeWriter — CLI arg parsing", () => {
  it("parses --execute and tuple args", () => {
    const opts = writer.parseCliArgs([
      "--execute", "--path", "PARA/PROJECTS/Auction/x.md",
      "--outcome", "won", "--date", "2026-03-15",
      "--price", "250000000", "--as-of", "2026-07-01", "--confirmed"
    ]);
    assert.equal(opts.execute, true);
    assert.equal(opts.confirmed, true);
    assert.equal(opts.path, "PARA/PROJECTS/Auction/x.md");
    assert.equal(opts.outcome, "won");
    assert.equal(opts.date, "2026-03-15");
    assert.equal(opts.price, "250000000");
    assert.equal(opts.as_of, "2026-07-01");
  });

  it("defaults to dry-run (no --execute)", () => {
    const opts = writer.parseCliArgs(["--path", "x.md", "--outcome", "lost"]);
    assert.equal(opts.execute, false);
    assert.equal(opts.confirmed, false);
  });
});
