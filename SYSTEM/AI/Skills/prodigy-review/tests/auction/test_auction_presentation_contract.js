"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const AUCTION_PRESENTATION = [
  "HUB/10 Auction.md",
  "SYSTEM/Views/auction-card.js",
  "SYSTEM/Views/auction-day-view.js",
  "SYSTEM/Views/bid-calendar-view.js",
  "SYSTEM/Views/auction-hub-styles.js",
  "SYSTEM/Views/auction-ai-decision-support.js",
  "SYSTEM/Views/auction-decision-packet.js",
  "SYSTEM/Views/auction-real-estate-research.js",
  "SYSTEM/Views/auction-key-value-detail.js",
  "SYSTEM/Views/auction-region-packet.js",
  "SYSTEM/Views/region-intelligence-popup-view.js"
];
const FORBIDDEN_PRIVATE_BREAKPOINT = /@media[^\n{]*(?:480|599|600|760|767)px/i;
const FORBIDDEN_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i;
const FORBIDDEN_DECORATION = /(?:linear|radial)-gradient\s*\(|(?:box|text)-shadow\s*:/i;

function assertAuctionPresentation(source, label) {
  const presentation = source.replace(/(?:box|text)-shadow\s*:\s*none(?:\s*!important)?\s*;/gi, "");
  assert.doesNotMatch(source, FORBIDDEN_COLOR, `${label}: raw color`);
  assert.doesNotMatch(presentation, FORBIDDEN_DECORATION, `${label}: decorative gradient or chrome shadow`);
  assert.doesNotMatch(source, FORBIDDEN_PRIVATE_BREAKPOINT, `${label}: private breakpoint`);
}

function mutationMustDie(base, mutation, reason) {
  assert.throws(() => assertAuctionPresentation(`${base}\n${mutation}`, "mutation"), reason);
}

test("Auction presentation contains no frozen raw color, gradient, chrome shadow, or private breakpoint", () => {
  for (const rel of AUCTION_PRESENTATION) assertAuctionPresentation(read(rel), rel);
  const card = read("SYSTEM/Views/auction-card.js");
  const day = read("SYSTEM/Views/auction-day-view.js");
  const calendar = read("SYSTEM/Views/bid-calendar-view.js");
  assert.match(day, /RESPONSIVE_BREAKPOINTS\.compactMax/);
  assert.match(calendar, /RESPONSIVE_BREAKPOINTS\.(?:compactMax|tileMax)/);
  assert.doesNotMatch(day, /statusColor\(|border-left-color/);
  assert.doesNotMatch(card, /statusInfo\(p\.status\)\.color|auction-status-color/);
  assert.match(card, /data-auction-status/);
  assert.match(`${day}\n${calendar}`, /:focus-visible/);
  assert.match(`${day}\n${calendar}`, /:active/);
  assert.match(`${day}\n${calendar}`, /forced-colors:\s*active/);
  assert.match(`${day}\n${calendar}`, /prefers-reduced-motion:\s*reduce/);
  assert.match(read("SYSTEM/Views/prodigy-app-shell.js"), /\.prodigy-app-shell\[data-workspace-id="auction"\] > \.prodigy-workspace-bar,[\s\S]*?\.prodigy-app-shell\[data-workspace-id="reading"\] > \.prodigy-workspace-bar \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;[\s\S]*?padding-inline: 4px;/, "Auction title must own the full AppShell compact row without type shrink");
  const hub = read("HUB/10 Auction.md");
  const hubStyles = read("SYSTEM/Views/auction-hub-styles.js");
  assert.doesNotMatch(hub, /auction-hub-editorial-(?:hero|kicker|title|support)/);
  assert.doesNotMatch(hub, /auction-native-pane-header/);
  assert.match(hub, /auction-native-sidebar/);
  assert.match(hubStyles, /@media \(min-width: 1069px\)[\s\S]*?\.auction-hub-section\.auction-hub-today[\s\S]*?grid-template-columns:\s*260px\s+minmax\(0,\s*1fr\)/);
  assert.match(hubStyles, /\.auction-native-sidebar[\s\S]*?background:\s*var\(--ke-color-surface-secondary/);
  assert.match(hubStyles, /@media \(min-width: 1069px\)[\s\S]*?\.auction-hub-continue[\s\S]*?border:\s*0/);
  assert.match(hubStyles, /@media \(min-width: 1069px\)[\s\S]*?\.auction-hub-continue-title[\s\S]*?font-size:\s*var\(--ke-type-heading/);
  assert.doesNotMatch(
    hubStyles,
    /\.auction-native-pane-title\s*\{[^}]*?(?:#[0-9a-f]{3,8}|rgba?\(|linear-gradient|box-shadow)/i
  );
  assert.doesNotMatch(hubStyles, /font-size:\s*var\(--ke-type-display/);
});

test("Auction integrates Calendar into the three-pane workspace and keeps the canonical renderer", () => {
  const hub = read("HUB/10 Auction.md");
  assert.match(hub, /label:\s*"달력"/);
  assert.doesNotMatch(hub, /revealAuctionCalendar|revealAfterOwnerSettles/);
  assert.match(hub, /auctionNativeSceneController\?\.focusCalendar\(\)/);
  assert.match(hub, /context:\s*\{[\s\S]*?actions:\s*\[\s*calendarAction\s*\]/);
  assert.match(hub, /ProdigyAuctionNativeScenes\.register\("calendar",\s*this\.container\)/);
  assert.match(hub, /window\.BidCalendarView\.render\(\{/);
  assert.match(hub, /label:\s*"입찰 일정 캘린더"/);
});

test("Auction card keeps the key-value total inside the price group immediately after the price pair", () => {
  const card = read("SYSTEM/Views/auction-card.js");
  const pricePair = card.indexOf("const pricePair");
  const keyValue = card.indexOf("const keyRow = priceGroup.createEl('button'");
  const terminalMetrics = card.indexOf("const isTerminalStatus");
  assert.ok(pricePair >= 0 && keyValue > pricePair && terminalMetrics > keyValue);
  assert.match(card, /priceGroup\.createEl\('button',[\s\S]*?class:\s*'auction-card-key-value'/);
});

test("Auction card projects compact, medium, and wide tiers from the shared view model", () => {
  const card = read("SYSTEM/Views/auction-card.js");
  assert.match(card, /AuctionCardViewModel\.presentation\(logicalWidth,\s*p\.status\)/);
  assert.match(card, /auction-card-tier-\$\{cardPresentation\.tier\}/);
  assert.match(card, /data-card-tier/);
  assert.match(card, /aria-haspopup['"]?:\s*['"]dialog/);
  assert.match(card, /AuctionKeyValueDetail\.open/);
});

test("Auction mutation oracle kills every frozen presentation residual class", () => {
  const clean = ".fixture{color:var(--text-normal)}";
  mutationMustDie(clean, ".x{color:#ef4444}", /raw color/);
  mutationMustDie(clean, ".x{color:rgba(0,0,0,.4)}", /raw color/);
  mutationMustDie(clean, ".x{background:linear-gradient(red,blue)}", /gradient|shadow/);
  mutationMustDie(clean, ".x{box-shadow:0 2px 6px black}", /gradient|shadow/);
  mutationMustDie(clean, "@media(max-width:480px){.x{display:block}}", /private breakpoint/);
  mutationMustDie(clean, "@media(max-width:767px){.x{display:block}}", /private breakpoint/);
});
