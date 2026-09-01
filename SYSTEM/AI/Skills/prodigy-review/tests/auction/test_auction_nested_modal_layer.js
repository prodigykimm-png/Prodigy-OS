"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SHARED_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/shared-dashboard.js"), "utf8");
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/auction-card.js"), "utf8");

test("Auction edit modal rises above the highest active parent popup", () => {
  const calendar = { zIndex: "1000" };
  const auctionDay = { zIndex: "1100" };
  const document = {
    querySelectorAll() {
      return [calendar, auctionDay];
    }
  };
  const sandbox = { window: {}, console };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = document;
  vm.createContext(sandbox);
  new vm.Script(SHARED_SOURCE, { filename: "shared-dashboard.js" }).runInContext(sandbox);

  assert.equal(typeof sandbox.window.ensureProdigyModalForeground, "function");
  const applied = {};
  const container = {
    ownerDocument: {
      defaultView: {
        getComputedStyle(node) {
          return { zIndex: node.zIndex || "50" };
        }
      }
    },
    classList: { add(name) { applied.className = name; } },
    style: {
      setProperty(name, value, priority) {
        applied[name] = value;
        applied.priority = priority;
      }
    }
  };

  assert.equal(sandbox.window.ensureProdigyModalForeground(container), 1101);
  assert.equal(applied["z-index"], "1101");
  assert.equal(applied.priority, "important");
  assert.equal(applied.className, "prodigy-modal-foreground");
});

test("monthly profit editor applies the shared foreground contract on open", () => {
  assert.match(
    CARD_SOURCE,
    /onOpen\(\)\s*\{[\s\S]*?ensureProdigyModalForeground\(this\.containerEl\)[\s\S]*?expected_monthly_rent/,
  );
});
