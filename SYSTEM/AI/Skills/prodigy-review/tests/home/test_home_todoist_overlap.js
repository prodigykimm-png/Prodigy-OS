"use strict";

// Pins that the Todoist request overlaps the vault scans instead of preceding
// them. Asserts from an event log, not elapsed milliseconds, so it cannot pass
// by timing luck on a fast or slow machine.

const assert = require("node:assert/strict");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../../../../../../");
const log = [];

global.globalThis = global;
global.window = global;
global.obsidian = {};
global.Notice = class Notice { constructor(msg) { this.msg = msg; } };

// Delay must outlast the synchronous span between the two starts.
global.ProjectTodoistAdapter = {
  fetchExecutionSnapshot: async () => {
    log.push("todoist:start");
    await new Promise((resolve) => setTimeout(resolve, 60));
    log.push("todoist:end");
    return { todayCount: 0, overdueCount: 0, todayTasks: [], overdueTasks: [] };
  }
};

const dailyFile = { name: "2026-07-15.md", path: "DAILY/DAILY/2026-07-15.md" };

global.app = {
  vault: {
    getAbstractFileByPath: (p) => (String(p).startsWith("DAILY/DAILY/") ? dailyFile : null),
    read: async () => {
      log.push("vault:start");
      await new Promise((resolve) => setTimeout(resolve, 60));
      log.push("vault:end");
      return "## 성찰 (Reflection)\n테스트\n## 변화 (Change)\n테스트\n## 다음 실험 (Next Experiment)\n테스트";
    },
    getMarkdownFiles: () => [dailyFile],
    adapter: { mkdir: async () => {} }
  }
};

const page = (extra) => Object.assign({
  file: { name: "x", path: "x", mtime: { toMillis: () => 1000000000000 } }
}, extra);

global.dv = {
  pages: (query) => ({
    where: (filterFn) => {
      const pages = [];
      if (query.includes("DAILY")) pages.push(page({ type: "daily" }));
      else if (query.includes("Auction")) pages.push(page({ type: "auction_case", status: "bidding", auction_datetime: "2026-07-20" }));
      else if (query.includes("PROJECTS")) pages.push(page({ type: "project", status: "doing", next_action: "독립" }));
      return pages.filter(filterFn);
    }
  })
};

require(path.join(rootDir, "SYSTEM/Views/morning-context-core.js"));

(async () => {
  const pkg = await global.MorningContextCore.buildMorningPackage({
    app: global.app,
    dv: global.dv,
    now: new Date("2026-07-16T10:00:00"),
    todoistToken: "mock-token"
  });

  assert.strictEqual(pkg.schema_version, "morning-package-v1");

  const todoistStart = log.indexOf("todoist:start");
  const todoistEnd = log.indexOf("todoist:end");
  const vaultStart = log.indexOf("vault:start");
  const vaultEnd = log.indexOf("vault:end");

  assert.ok(todoistStart >= 0, "the Todoist request must be issued");
  assert.ok(vaultStart >= 0, "the vault scan must run (test fixture must reach section E/F)");
  assert.ok(todoistEnd > todoistStart, "the Todoist request must be awaited to completion");
  assert.ok(vaultEnd > vaultStart, "the vault scan must be awaited to completion");

  assert.ok(
    todoistStart < vaultStart,
    `Todoist must be issued before the vault scans start. log=${JSON.stringify(log)}`
  );
  assert.ok(
    todoistEnd > vaultStart,
    `Todoist must still be in flight while the vault scan runs; awaiting it first would make it end before vault:start. log=${JSON.stringify(log)}`
  );

  console.log("Home Todoist/vault overlap test passed", JSON.stringify(log));
})();
