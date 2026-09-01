"use strict";

const assert = require("node:assert/strict");

function element() {
  return {
    attrs: {},
    children: [],
    textContent: "",
    empty() { this.children = []; },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    addClass(value) { this.attrs.class = value; },
    createEl(_tag, options = {}) {
      const child = element();
      child.textContent = options.text || "";
      if (options.attr) Object.entries(options.attr).forEach(([key, value]) => child.setAttribute(key, value));
      this.children.push(child);
      return child;
    }
  };
}

class FakeModal {
  constructor(app) {
    this.app = app;
    this.contentEl = element();
    this.modalEl = element();
  }
  open() { this.onOpen(); return this; }
  close() { this.onClose(); }
}

globalThis.obsidian = { Modal: FakeModal };
const detail = require("./auction-key-value-detail.js");

const projection = {
  area_pyeong: 17.1,
  primary_scope: "dong",
  district_difference_ratio: 0.413,
  dong: {
    label: "우동",
    key_value_won_per_pyeong: 16720000,
    key_value_total_won: 286000000,
    case_count: 30,
    building_count: 14,
    confidence: "usable",
    period_start: "2025-09-01",
    period_end: "2026-08-31",
    q1_won_per_pyeong: 12460000,
    q3_won_per_pyeong: 23610000
  },
  district: {
    label: "해운대구",
    key_value_won_per_pyeong: 11830000,
    key_value_total_won: 202000000,
    case_count: 73,
    building_count: 34,
    confidence: "usable",
    period_start: "2025-09-01",
    period_end: "2026-08-31"
  }
};

const model = detail.buildModel(projection);
assert.equal(model.primary_scope, "dong");
assert.equal(model.area_pyeong, 17.1);
assert.equal(model.dong.total_won, 286000000);
assert.equal(model.district.total_won, 202000000);
assert.equal(model.difference_percent, 41);

let focused = 0;
const modal = detail.open({}, projection, { returnFocus: { focus() { focused += 1; } } });
assert.equal(modal.modalEl.attrs.role, "dialog");
assert.equal(modal.modalEl.attrs["aria-modal"], "true");
assert.equal(modal.contentEl.attrs["data-key-value-scope"], "dong");
modal.close();
assert.equal(focused, 1);

console.log("auction key value detail tests: PASS");
