"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/shared-dashboard.js"), "utf8");

class Element {
  constructor() {
    this.children = [];
    this.classList = { contains: () => false };
  }

  createEl() {
    const child = new Element();
    this.children.push(child);
    return child;
  }

  empty() {
    this.children = [];
  }
}

function dataArray(items) {
  const values = [...items];
  values.where = (predicate) => dataArray(values.filter(predicate));
  values.sort = (key, order = "asc") => dataArray([...values].sort((left, right) => {
    const a = String(key(left));
    const b = String(key(right));
    return order === "desc" ? b.localeCompare(a) : a.localeCompare(b);
  }));
  values.array = () => [...values];
  return values;
}

function renderAuctionStatus(status, query) {
  const pages = [
    { type: "auction_case", status: "watching", case_number: "2025타경5458", file: { name: "watching", ctime: 1, mtime: 1 } },
    { type: "auction_case", status: "bidding", case_number: "2025타경9999", file: { name: "bidding", ctime: 2, mtime: 2 } },
  ];
  const container = new Element();
  const rendered = [];
  const sandbox = {
    console,
    window: { auctionSearchQuery: query },
    document: { body: { classList: { contains: () => false } } },
    app: {},
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SOURCE, sandbox, { filename: "SYSTEM/Views/shared-dashboard.js" });
  sandbox.window.renderDashboardSection({
    dv: {
      current: () => ({}),
      pages: () => dataArray(pages),
    },
    status,
    type: "auction_case",
    container,
    renderer: (page) => rendered.push(page.case_number),
    emptyMessage: "없음",
    sortField: "auction_datetime",
    sortOrder: "asc",
  });
  return rendered;
}

test("auction search only filters the bidding section that exposes its input", () => {
  assert.deepEqual(renderAuctionStatus("watching", "not-a-case"), ["2025타경5458"]);
  assert.deepEqual(renderAuctionStatus("bidding", "9999"), ["2025타경9999"]);
  assert.deepEqual(renderAuctionStatus("bidding", "not-a-case"), []);
});
