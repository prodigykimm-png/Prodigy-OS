"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const mutationModule = require("./auction-card-mutation.js");

function harness() {
  const calls = [];
  const file = { path: "PARA/PROJECTS/Auction/case.md" };
  const frontmatter = { status: "watching", expected_bid: 100 };
  const auction = { ...frontmatter, file };
  const app = {
    vault: {
      getAbstractFileByPath: (path) => path === file.path ? file : null,
    },
    fileManager: {
      async processFrontMatter(target, mutate) {
        calls.push(["persist", target.path]);
        mutate(frontmatter);
      },
    },
  };
  const coordinator = mutationModule.create({
    app,
    auction,
    filePath: file.path,
    today: () => "2026-09-04",
    redraw: (patch) => calls.push(["redraw", patch]),
    refresh: async (target) => calls.push(["refresh", target.path]),
  });
  return { app, auction, calls, coordinator, file, frontmatter };
}

test("card mutation persists once, updates the live object, and redraws locally", async () => {
  const fx = harness();

  await fx.coordinator.commit({
    patch: { expected_bid: 200 },
    effect: "card",
  });

  assert.deepEqual(fx.frontmatter, {
    status: "watching",
    expected_bid: 200,
    updated: "2026-09-04",
  });
  assert.equal(fx.auction.expected_bid, 200);
  assert.deepEqual(fx.calls, [
    ["persist", fx.file.path],
    ["redraw", { expected_bid: 200, updated: "2026-09-04" }],
  ]);
});

test("status mutation refreshes sections only after persistence", async () => {
  const fx = harness();

  await fx.coordinator.commit({
    patch: { status: "bidding", expected_bid: 250 },
    effect: "sections",
  });

  assert.equal(fx.auction.status, "bidding");
  assert.deepEqual(fx.calls, [
    ["persist", fx.file.path],
    ["refresh", fx.file.path],
  ]);
});

test("sections commit re-runs dashboard runners so moved cards leave the old section", async () => {
  const fx = harness();
  let dashboardRefreshes = 0;
  const previous = globalThis.__prodigyRefreshAuctionDashboard;
  globalThis.__prodigyRefreshAuctionDashboard = () => { dashboardRefreshes += 1; };
  try {
    await fx.coordinator.commit({
      patch: { status: "bidding" },
      effect: "sections",
    });
    assert.equal(dashboardRefreshes, 1);

    await fx.coordinator.commit({
      patch: { expected_bid: 300 },
      effect: "card",
    });
    assert.equal(dashboardRefreshes, 1);
  } finally {
    if (previous === undefined) delete globalThis.__prodigyRefreshAuctionDashboard;
    else globalThis.__prodigyRefreshAuctionDashboard = previous;
  }
});

test("failed persistence leaves live state and render effects untouched", async () => {  const fx = harness();
  fx.app.fileManager.processFrontMatter = async () => {
    throw new Error("write failed");
  };

  await assert.rejects(
    fx.coordinator.commit({
      patch: { expected_bid: 999 },
      effect: "card",
    }),
    /write failed/,
  );

  assert.equal(fx.auction.expected_bid, 100);
  assert.deepEqual(fx.calls, []);
});

test("missing render effect handlers fail before persistence", async () => {
  let writes = 0;
  const file = { path: "PARA/PROJECTS/Auction/case.md" };
  const base = {
    app: {
      vault: { getAbstractFileByPath: () => file },
      fileManager: {
        async processFrontMatter() { writes += 1; },
      },
    },
    auction: { file },
    filePath: file.path,
  };

  const withoutRefresh = mutationModule.create({
    ...base,
    redraw() {},
  });
  await assert.rejects(
    withoutRefresh.commit({ patch: { status: "bidding" }, effect: "sections" }),
    /section refresh handler/,
  );

  const withoutRedraw = mutationModule.create({
    ...base,
    refresh() {},
  });
  await assert.rejects(
    withoutRedraw.commit({ patch: { expected_bid: 200 }, effect: "card" }),
    /card redraw handler/,
  );
  assert.equal(writes, 0);
});

test("mutation state reports saving, saved target, and failure", async () => {
  const file = { path: "PARA/PROJECTS/Auction/case.md" };
  const states = [];
  const replacement = { id: "replacement-card" };
  const app = {
    vault: { getAbstractFileByPath: () => file },
    fileManager: {
      async processFrontMatter(_file, mutate) { mutate({}); },
    },
  };
  const coordinator = mutationModule.create({
    app,
    auction: { file },
    redraw: () => replacement,
    onState: (state) => states.push(state),
  });

  await coordinator.commit({ patch: { expected_bid: 200 }, effect: "card" });
  assert.deepEqual(states.map((state) => state.state), ["saving", "saved"]);
  assert.equal(states[1].target, replacement);

  states.length = 0;
  app.fileManager.processFrontMatter = async () => {
    throw new Error("write failed");
  };
  await assert.rejects(
    coordinator.commit({ patch: { expected_bid: 300 }, effect: "card" }),
    /write failed/,
  );
  assert.deepEqual(states.map((state) => state.state), ["saving", "error"]);
  assert.match(states[1].error.message, /write failed/);
});

test("auction-card delegates frontmatter writes to the mutation coordinator", () => {
  const fs = require("node:fs");
  const card = fs.readFileSync(require.resolve("./auction-card.js"), "utf8");
  assert.doesNotMatch(card, /fileManager\.processFrontMatter/);
  assert.match(card, /window\.AuctionCardMutation/);
  assert.match(card, /mutationApi\.create/);
});
