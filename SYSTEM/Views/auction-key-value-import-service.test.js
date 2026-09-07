"use strict";

const assert = require("node:assert/strict");
const core = require("../SCRIPTS/auction-key-value-core.js");
const service = require("./auction-key-value-import-service.js");
const jsEngineConfig = require("../../.obsidian/plugins/js-engine/data.json");

assert.ok(
  jsEngineConfig.startupScripts.includes("SYSTEM/Views/auction-key-value-import-service.js"),
  "JS Engine must load the CSV watcher at Obsidian startup"
);

class MemoryVault {
  constructor(files = {}) {
    this.files = new Map(Object.entries(files));
    this.listeners = new Map();
  }

  getFiles() {
    return [...this.files.keys()]
      .filter((path) => !path.endsWith("/"))
      .map((path) => ({ path, name: path.split("/").at(-1) }));
  }

  getAbstractFileByPath(path) {
    return this.files.has(path) ? { path, name: path.split("/").at(-1) } : null;
  }

  async read(file) {
    return this.files.get(file.path);
  }

  async create(path, text) {
    this.files.set(path, text);
    return { path, name: path.split("/").at(-1) };
  }

  async modify(file, text) {
    this.files.set(file.path, text);
  }

  async createFolder(path) {
    this.files.set(`${path}/`, "");
  }

  async rename(file, nextPath) {
    const text = this.files.get(file.path);
    this.files.delete(file.path);
    this.files.set(nextPath, text);
  }

  on(event, callback) {
    this.listeners.set(event, callback);
    return { event, callback };
  }

  offref(ref) {
    if (this.listeners.get(ref.event) === ref.callback) this.listeners.delete(ref.event);
  }
}

function csv(rows) {
  return [
    "물건종류,소재지,대지권,건물면적,낙찰가,매각기일",
    ...rows
  ].join("\n");
}

const [seed] = core.parseAuctCsv(csv([
  '오피스텔,"부산광역시 해운대구 우동 1, A빌 2층 201호",3㎡,33.05785㎡,100000000,2026.08.01'
]), { sourceFile: "legacy.csv" });

async function testPendingCsvIsMergedAndArchived() {
  delete globalThis.AuctionKeyValueSnapshot;
  const inputPath = `${service.INPUT_DIR}/nationwide.csv`;
  const vault = new MemoryVault({
    [service.LEGACY_NORMALIZED_PATH]: JSON.stringify([seed]),
    [inputPath]: csv([
      '오피스텔,"부산광역시 해운대구 우동 1, A빌 2층 201호",3㎡,33.05785㎡,100000000,2026.08.01',
      '아파트,"서울특별시 강서구 화곡동 1, B아파트 3층 301호",10㎡,84㎡,400000000,2026.08.31'
    ])
  });
  const notices = [];
  const result = await service.processPending({ vault }, {
    now: () => "2026-09-04T09:00:00.000Z",
    notify: (message) => notices.push(message)
  });

  assert.equal(result.files, 1);
  assert.equal(result.imported, 2);
  assert.equal(result.added, 1);
  assert.equal(result.totalRecords, 2);
  assert.ok(vault.files.has(`${service.PROCESSED_DIR}/2026-09/nationwide.csv`));
  assert.ok(!vault.files.has(inputPath));

  const normalized = JSON.parse(vault.files.get(service.NORMALIZED_PATH));
  const snapshot = JSON.parse(vault.files.get(service.SNAPSHOT_PATH));
  const audit = JSON.parse(vault.files.get(service.AUDIT_PATH));
  assert.equal(normalized.length, 2);
  assert.ok(snapshot.groups["부산광역시|해운대구|우동|오피스텔"]);
  assert.ok(snapshot.groups["서울특별시|강서구|화곡동|아파트"]);
  assert.equal(audit.added_records, 1);
  assert.equal(audit.duplicate_records, 1);
  assert.match(vault.files.get(service.CARD_SNAPSHOT_PATH), /AuctionKeyValueSnapshot/);
  assert.equal(globalThis.AuctionKeyValueSnapshot.content_hash, snapshot.content_hash);
  assert.match(notices.at(-1), /CSV 1개.*신규 1건/);
}

async function testInvalidCsvIsLeftForCorrection() {
  const inputPath = `${service.INPUT_DIR}/invalid.csv`;
  const vault = new MemoryVault({ [inputPath]: "물건종류,소재지\n아파트,서울특별시 강서구" });

  await assert.rejects(
    service.processPending({ vault }, { now: () => "2026-09-04T09:00:00.000Z" }),
    /필수 열/
  );
  assert.ok(vault.files.has(inputPath));
  assert.ok(!vault.files.has(service.CARD_SNAPSHOT_PATH));
}

async function testWatcherProcessesCreatedCsv() {
  const vault = new MemoryVault();
  const handle = service.register({ vault }, {
    startup: false,
    now: () => "2026-09-04T09:00:00.000Z"
  });
  const inputPath = `${service.INPUT_DIR}/new.csv`;
  vault.files.set(inputPath, csv([
    '아파트,"경기도 수원시 영통구 원천동 1, C아파트 5층 501호",10㎡,84㎡,500000000,2026.09.01'
  ]));

  vault.listeners.get("create")({ path: inputPath });
  await handle.idle();

  assert.ok(vault.files.has(`${service.PROCESSED_DIR}/2026-09/new.csv`));
  handle.dispose();
  assert.equal(vault.listeners.size, 0);
}

async function testStartupQueueSettles() {
  const vault = new MemoryVault();
  const handle = service.register({ vault }, {
    now: () => "2026-09-04T09:00:00.000Z"
  });
  const result = await Promise.race([
    handle.idle(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("startup queue timeout")), 200))
  ]);

  assert.equal(result.files, 0);
  assert.ok(vault.files.has(`${service.INPUT_DIR}/`));
  handle.dispose();
}

async function testCardWinningBidsMergeWithDedupe() {
  delete globalThis.AuctionKeyValueSnapshot;
  const [seed] = core.parseAuctCsv(
    "물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n오피스텔,\"경기도 부천시 원미구 원미동 100, 테스트빌 3층 301호\",3.2㎡,63.93㎡,180000000,2026.09.01\n"
  );
  const card = (over) => [
    "---",
    "id: test",
    "type: auction_case",
    "status: watching",
    "property_type: 오피스텔",
    "region_sido: 경기도",
    "region_sigungu: 부천시 원미구",
    "region_dong: " + (over.dong ?? "원미동"),
    "address: " + (over.address ?? "경기도 부천시 원미구 원미로 50, 테스트빌 3층 301호"),
    "exclusive_area: " + (over.area ?? "63.93㎡"),
    "winning_bid_price: " + (over.price ?? "180000000"),
    "auction_datetime: " + (over.date ?? "2026-09-01T10:00"),
    "---",
    ""
  ].join("\n");
  const vault = new MemoryVault({
    [service.LEGACY_NORMALIZED_PATH]: JSON.stringify([seed]),
    [service.CARD_DIR + "/dupe.md"]: card({}),
    [service.CARD_DIR + "/new-sale.md"]: card({ price: "190000000", address: "경기도 부천시 원미구 원미동 100, 테스트빌 3층 302호" }),
    [service.CARD_DIR + "/no-dong.md"]: card({ dong: "정보 없음", price: "200000000", address: "경기도 부천시 원미구 원미로 70" })
  });
  const notices = [];
  const result = await service.processPending({ vault }, {
    now: () => "2026-09-07T09:00:00.000Z",
    notify: (m) => notices.push(m)
  });
  assert.equal(result.cardRecords, 2);
  assert.equal(result.cardAdded, 1);
  assert.equal(result.cardDuplicates, 1);
  assert.equal(result.cardExcluded.noDong, 1);
  const snapshot = JSON.parse(vault.files.get(service.SNAPSHOT_PATH));
  const group = snapshot.groups["경기도|부천시 원미구|원미동|오피스텔"];
  assert.equal(group.case_count, 2);
  assert.equal(group.building_count, 1);
  assert.match(notices.at(-1), /카드 낙찰가 반영 · 신규 1건/);
  const second = await service.processPending({ vault }, {
    now: () => "2026-09-07T09:05:00.000Z",
    notify: (m) => notices.push(m)
  });
  assert.equal(second.skipped, true);
}

function testElectronCoreResolutionUsesVaultPath() {
  const requests = [];
  const vaultRoot = "/tmp/Dusk";
  const fakeRequire = (request) => {
    requests.push(request);
    if (request === "../SCRIPTS/auction-key-value-core.js") {
      throw new Error("Cannot find module from electron/js2c/renderer_init");
    }
    if (request === "node:path") return require("node:path");
    if (request === `${vaultRoot}/SYSTEM/SCRIPTS/auction-key-value-core.js`) return core;
    throw new Error(`Unexpected require: ${request}`);
  };
  const resolved = service.resolveCore({
    vault: { adapter: { getBasePath: () => vaultRoot } }
  }, fakeRequire);

  assert.equal(resolved, core);
  assert.deepEqual(requests, [
    "../SCRIPTS/auction-key-value-core.js",
    "node:path",
    `${vaultRoot}/SYSTEM/SCRIPTS/auction-key-value-core.js`
  ]);
}

Promise.resolve()
  .then(testElectronCoreResolutionUsesVaultPath)
  .then(testCardWinningBidsMergeWithDedupe)
  .then(testPendingCsvIsMergedAndArchived)
  .then(testInvalidCsvIsLeftForCorrection)
  .then(testWatcherProcessesCreatedCsv)
  .then(testStartupQueueSettles)
  .then(() => console.log("auction key value import service tests: PASS"));
