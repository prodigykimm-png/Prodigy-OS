"use strict";

// Pins that Home reads its sections from the folder tree plus the metadata
// cache, and that Dataview is not consulted when that source is available.
// A mapping-only test would still pass if the plugin index were used.

const assert = require("node:assert/strict");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../../../../../../");

global.globalThis = global;
global.window = global;
global.obsidian = {};
global.Notice = class Notice { constructor(msg) { this.msg = msg; } };

const file = (p, frontmatter, mtime) => ({
  path: p,
  name: p.split("/").pop().replace(/\.md$/, ""),
  stat: { mtime: mtime || 1700000000000 },
  frontmatter
});
const folder = (p, children) => ({ path: p, children });

const projectFile = file("PARA/PROJECTS/Test Project.md", {
  type: "project",
  status: "doing",
  next_action: "독서 요약 작성",
  due_date: "2026-07-18",
  workflow: [{ label: "Step 1", todoist_task_id: "t1", status: "completed" }]
}, 1700000001000);
const auctionFile = file("PARA/PROJECTS/Auction/Test Auction.md", {
  type: "auction_case",
  status: "bidding",
  auction_datetime: "2026-07-20",
  appraisal_price: 200000000,
  minimum_bid: 160000000
});
const readingFile = file("PARA/PROJECTS/Reading/Test Book.md", {
  type: "reading",
  status: "reading",
  title: "테스트 책"
});
const dailyFile = file("DAILY/DAILY/2026-07-15.md", { journal: "personal daily", status: "completed" });

const tree = {
  "PARA/PROJECTS": folder("PARA/PROJECTS", [
    projectFile,
    folder("PARA/PROJECTS/Auction", [auctionFile]),
    folder("PARA/PROJECTS/Reading", [readingFile])
  ]),
  "PARA/PROJECTS/Auction": folder("PARA/PROJECTS/Auction", [auctionFile]),
  "PARA/PROJECTS/Reading": folder("PARA/PROJECTS/Reading", [readingFile]),
  "DAILY/DAILY": folder("DAILY/DAILY", [dailyFile])
};

const dailyText = "## 성찰 (Reflection)\n오늘의 유혹을 물리쳤다.\n## 변화 (Change)\n목표 달성에 더 신중해졌다.\n## 다음 실험 (Next Experiment)\n내일 아침 6시 기상";

global.app = {
  vault: {
    getAbstractFileByPath: (p) => tree[p] || (p === dailyFile.path ? dailyFile : null),
    read: async (f) => (f && f.path === dailyFile.path ? dailyText : ""),
    getMarkdownFiles: () => [projectFile, auctionFile, readingFile, dailyFile],
    adapter: { mkdir: async () => {} }
  },
  metadataCache: {
    getFileCache: (f) => (f && f.frontmatter ? { frontmatter: f.frontmatter } : null)
  }
};

const dvCalls = [];
global.dv = {
  pages: (query) => {
    dvCalls.push(query);
    return { where: () => [] };
  }
};

require(path.join(rootDir, "SYSTEM/Views/morning-context-core.js"));

(async () => {
  const pkg = await global.MorningContextCore.buildMorningPackage({
    app: global.app,
    dv: global.dv,
    now: new Date("2026-07-16T10:00:00"),
    todoistToken: ""
  });

  assert.strictEqual(pkg.context.projects.length, 1, "project must come from the metadata cache");
  assert.strictEqual(pkg.context.projects[0].name, "Test Project");
  assert.strictEqual(pkg.context.projects[0].next_action, "독서 요약 작성");
  assert.strictEqual(pkg.context.projects[0].mtime, 1700000001000, "mtime must survive the mapping");
  assert.strictEqual(pkg.context.projects[0].workflow_summary, "1/1");

  assert.strictEqual(pkg.context.auctions.length, 1);
  assert.strictEqual(pkg.context.auctions[0].name, "Test Auction");
  assert.strictEqual(pkg.context.auctions[0].auction_datetime, "2026-07-20");

  assert.strictEqual(pkg.context.reading.length, 1);
  assert.strictEqual(pkg.context.reading[0].title, "테스트 책");

  assert.strictEqual(pkg.context.yesterday_review.found, true);
  assert.strictEqual(pkg.context.yesterday_review.reflection, "오늘의 유혹을 물리쳤다.");

  assert.deepStrictEqual(
    dvCalls,
    [],
    `Dataview must not be consulted when the metadata cache is available. called=${JSON.stringify(dvCalls)}`
  );

  console.log("Home metadata-cache source test passed");
})();
