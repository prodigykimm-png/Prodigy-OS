"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const noteCore = require("./region-metrics-note-core.js");

const VAULT = path.resolve(__dirname, "..", "..");
const REGION_KEY = "광주광역시-동구";
const notePath = path.join(VAULT, "PARA/RESOURCES/Auction Regions", `${REGION_KEY}.md`);
const cacheDir = path.join(VAULT, "SYSTEM/CACHE/region-metrics", REGION_KEY);
const snapshots = fs.readdirSync(cacheDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(cacheDir, name, "snapshot.json")))
  .sort();
const latest = path.join(cacheDir, snapshots.at(-1), "snapshot.json");

const note = fs.readFileSync(notePath, "utf8");
const snapshot = JSON.parse(fs.readFileSync(latest, "utf8"));
assert.equal(snapshot.region_key, REGION_KEY);

const options = { updatedDate: "2026-09-28" };
const replay = noteCore.applySnapshotToNote(note, snapshot, options);
assert.equal(replay.changed, false, "이미 반영된 스냅샷 재반영은 변경이 없어야 합니다");
assert.equal(replay.reason, "same_raw_snapshot");

const population = snapshot.metrics.total_population.value;
assert.equal(Number.isFinite(population), true, "기준 노트에 인구 값이 있어야 합니다");

const remapped = JSON.parse(JSON.stringify(snapshot));
remapped.snapshot_id = `${snapshot.metrics_as_of}_20990101T000000Z`;
remapped.metrics.total_population.value = population + 1;
const rerouted = noteCore.applySnapshotToNote(note, remapped, options);
assert.equal(rerouted.changed, true, "원본 파일이 같아도 파생값이 다르면 frontmatter를 갱신해야 합니다");
assert.equal(rerouted.reason, "inserted_snapshot");
assert.match(rerouted.content, new RegExp(`^total_population: ${population + 1}$`, "m"));
assert.match(rerouted.content, new RegExp(`^updated: ${options.updatedDate}$`, "m"));

console.log("region metrics note core tests: PASS");
