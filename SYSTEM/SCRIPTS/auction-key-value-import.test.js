"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const core = require("./auction-key-value-core.js");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "auction-key-value-"));
const input = path.join(temp, "sample.csv"), secondInput = path.join(temp, "second.csv"), seed = path.join(temp, "seed.json");
const output = path.join(temp, "out"), cardSnapshot = path.join(temp, "snapshot.js");
fs.writeFileSync(input, `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n오피스텔,"부산광역시 해운대구 우동 1, A빌 2층 201호",3㎡,33.05785㎡,100000000,2026.08.01\n`);
fs.writeFileSync(secondInput, `물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n아파트,"부산광역시 해운대구 좌동 1, B아파트 3층 301호",10㎡,84㎡,400000000,2026.08.31\n다가구(원룸등),부산광역시 북구 구포동 1,토지 100㎡,200㎡,300000000,2026.08.18\n`);
const [seedRecord] = core.parseAuctCsv(`물건종류,소재지,대지권,건물면적,낙찰가,매각기일\n오피스텔,"서울특별시 강서구 화곡동 1, C빌 4층 401호",3㎡,33.05785㎡,150000000,2026.08.20\n`, { sourceFile: "seed.csv" });
fs.writeFileSync(seed, JSON.stringify([seedRecord]));
const run = spawnSync(process.execPath, [
  path.join(__dirname, "auction-key-value-import.js"),
  "--seed-normalized", seed,
  "--input", input,
  "--input", secondInput,
  "--output", output,
  "--card-snapshot", cardSnapshot,
  "--generated-at", "2026-08-31T00:00:00.000Z"
], { encoding: "utf8" });
assert.equal(run.status, 0, run.stderr);
const snapshotText = fs.readFileSync(path.join(output, "snapshot.json"), "utf8");
const snapshot = JSON.parse(snapshotText);
delete require.cache[cardSnapshot];
const card = require(cardSnapshot);
assert.deepEqual(card.groups, snapshot.groups);
assert.equal(card.content_hash, snapshot.content_hash);
assert.equal(snapshot.content_hash, core.snapshotHash(snapshot));
const audit = JSON.parse(fs.readFileSync(path.join(output, "audit.json"), "utf8"));
assert.equal(audit.snapshot_hash, snapshot.content_hash);
assert.equal(audit.total_records, 4);
assert.equal(audit.duplicates, 0);
assert.deepEqual(audit.inputs, ["seed.json", "sample.csv", "second.csv"]);
assert.equal(audit.property_types.오피스텔, 2);
assert.equal(audit.property_types.아파트, 1);
assert.equal(audit.property_types.다가구, 1);
assert.ok(snapshot.groups["부산광역시|해운대구|좌동|아파트"]);
assert.ok(snapshot.groups["부산광역시|북구|구포동|다가구"]);
assert.ok(snapshot.groups["서울특별시|강서구|화곡동|오피스텔"]);

const shippedCardSnapshot = require("../Views/auction-key-value-snapshot.js");
assert.equal(shippedCardSnapshot.content_hash, core.snapshotHash(shippedCardSnapshot));
assert.match(shippedCardSnapshot.generated_at, /^\d{4}-\d{2}-\d{2}T/);
assert.ok(Object.keys(shippedCardSnapshot.groups).length >= 575, `shipped groups=${Object.keys(shippedCardSnapshot.groups).length}`);
for (const key of [
  "인천광역시|부평구|부평동|오피스텔",
  "경기도|평택시|장당동|오피스텔",
  "서울특별시|중구|황학동|오피스텔",
  "부산광역시|북구|구포동|다가구",
  "부산광역시|해운대구|좌동|아파트"
]) assert.ok(shippedCardSnapshot.groups[key], `${key} shipped group`);
console.log("auction key value importer tests: PASS");
