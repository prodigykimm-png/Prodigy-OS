"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
class Plugin {}
class PluginSettingTab {}
class Notice {}
class Setting {}
Module._load = (request, parent, isMain) => request === "obsidian"
  ? { Plugin, PluginSettingTab, Notice, Setting }
  : originalLoad(request, parent, isMain);

const plugin = require("./main.js");
Module._load = originalLoad;

const responses = [
  { documents: [{ x: "129.035", y: "35.105", address_name: "부산 중구 중앙동" }] },
  { documents: [{ place_name: "중앙역", x: "129.036", y: "35.104" }, { place_name: "부산역", x: "129.041", y: "35.115" }] },
  { documents: [{ place_name: "봉래초등학교", x: "129.038", y: "35.106" }] },
  { documents: [{ place_name: "부산중학교", x: "129.040", y: "35.109" }] },
  { documents: [{ place_name: "부산고등학교", x: "129.043", y: "35.112" }] }
];
let calls = 0;
const fakeFetch = async (_url, options) => {
  assert.equal(options.headers.Authorization, "KakaoAK test-key");
  return { ok: true, status: 200, json: async () => responses[calls++] };
};

(async () => {
  const result = await plugin.calculateBasicLocation("부산광역시 중구 중앙동", "test-key", fakeFetch);
  assert.equal(result.aiUsed, false);
  assert.equal(result.distanceType, "straight_line");
  assert.equal(result.nearestStation.name, "중앙역");
  assert.equal(result.nearestElementarySchool.name, "봉래초등학교");
  assert.equal(result.nearestMiddleSchool.name, "부산중학교");
  assert.equal(result.nearestHighSchool.name, "부산고등학교");
  assert.equal(calls, 5);
  assert.ok(result.nearestStation.distanceM > 0);
  assert.equal((await plugin.verifyKakaoKey("", fakeFetch)).code, "missing");
  await assert.rejects(() => plugin.calculateBasicLocation("", "test-key", fakeFetch), /주소가 비어/);
  await assert.rejects(() => plugin.calculateBasicLocation("주소", "", fakeFetch), /키를 먼저 저장/);
  console.log("dusk auction location tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
