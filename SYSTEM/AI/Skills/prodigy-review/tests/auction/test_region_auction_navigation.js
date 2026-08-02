"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const regionHub = read("HUB/15 Region.md");
const auctionHub = read("HUB/10 Auction.md");
const dashboard = read("SYSTEM/Views/shared-dashboard.js");
const packet = read("SYSTEM/Views/auction-region-packet.js");

assert.match(regionHub, /data-action.*view-region-auctions|onViewRegionAuctions/);
assert.match(regionHub, /prodigyAuctionRegionScope/);
assert.match(regionHub, /prodigyAuctionNavigationRequest/);
assert.match(regionHub, /auction_path/);
assert.match(regionHub, /onOpenAuction:\s*\(auctionRow\)/);
assert.match(regionHub, /HUB\/10 Auction/);
assert.match(auctionHub, /regionScope.*region_sido|지역 필터/);
assert.match(auctionHub, /prodigyAuctionNavigationRequest/);
assert.match(auctionHub, /data-auction-path/);
assert.match(auctionHub, /scrollIntoView/);
assert.match(auctionHub, /focus\(/);
assert.match(auctionHub, /delete window\.prodigyAuctionNavigationRequest/);
assert.match(auctionHub, /선택한 경매 카드가 현재 필터에 보이지 않습니다/);
assert.match(dashboard, /filterSigungu/);
assert.match(dashboard, /region_sido.*includes\(filterRegion\)/);
assert.match(dashboard, /region_sigungu.*includes\(filterSigungu\)/);
assert.match(packet, /지역 상세 보기/);
assert.match(packet, /지역 경험 기록/);
assert.doesNotMatch(packet, /지역 노트 열기/);

console.log("Region to Auction navigation contracts passed");
