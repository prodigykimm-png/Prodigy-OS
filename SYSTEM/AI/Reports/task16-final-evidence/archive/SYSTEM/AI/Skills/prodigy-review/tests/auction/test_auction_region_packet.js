"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global;
require(path.join(ROOT, "SYSTEM/Views/auction-region-core.js"));
require(path.join(ROOT, "SYSTEM/Views/region-explorer-projection.js"));
require(path.join(ROOT, "SYSTEM/Views/region-decision-context-core.js"));
const packet = require(path.join(ROOT, "SYSTEM/Views/auction-region-packet.js"));

const body = `---
type: auction_region
title: 인천광역시 검단구
region_sido: 인천광역시
region_sigungu: 검단구
metrics_as_of: 2026-06-01
source_as_of: 2026-07-01
verification_status: unverified
sale_volume_3m: 120
sale_price_change_yoy: 1.2
move_in_24m: 3200
households: 110000
---

<!-- AI:PENDING:SUMMARY:START -->
공식 수치와 현장 확인을 함께 검토한다.
<!-- AI:PENDING:SUMMARY:END -->

<!-- AUTO:REGION_TRANSIT:START -->
### 인천교통공사 확인 역

- 인천1호선 · 검단호수공원역, 신검단중앙역, 아라역
<!-- AUTO:REGION_TRANSIT:END -->

<!-- AI:PENDING:RISKS:START -->
- 개편 전후 통계 비교 기준을 확인한다.
<!-- AI:PENDING:RISKS:END -->

<!-- AI:PENDING:SITE_VISIT:START -->
- 역 출구부터 물건까지 보행 동선을 확인한다.
<!-- AI:PENDING:SITE_VISIT:END -->`;

const auction = { region_sido: "인천", region_sigungu: "검단구", region_dong: "당하동", address: "인천광역시 검단구 당하동" };
const source = { path: "PARA/RESOURCES/Auction Regions/인천광역시-검단구.md", body };
const ready = packet.projectPacket(auction, source);

assert.equal(ready.status, "ready");
assert.equal(ready.decision_authority, "human_required");
assert.equal(ready.region.identity.region_key, "인천광역시-검단구");
assert.equal(ready.auction_context.dong, "당하동");
assert.equal(ready.region.metrics.sale_volume_3m.value, 120);
assert.equal(ready.region.transit.available, true);
assert.equal(ready.region.transit.lines[0].stations.length, 3);
assert.equal(ready.decision_context.questions.length, 4);
assert.equal(ready.decision_context.questions[0].id, "transactions_price");
assert.ok(ready.decision_context.questions.every((question) => question.facts.length <= 3));
assert.match(ready.region.research.summary, /공식 수치/);
assert.match(ready.region.research.risks, /통계 비교/);
assert.match(ready.region.research.site_visit, /보행 동선/);
assert.ok(ready.checks.some((check) => check.kind === "verification_pending"));
assert.equal(packet.toDisplayText("> **AI 제안 · 확인 필요:**\n- [ ] 현장 확인"), "AI 제안 · 확인 필요:\n• 현장 확인");

const foreignSource = packet.projectPacket(auction, { path: "UNTRUSTED/foreign.md", body });
assert.equal(foreignSource.status, "unavailable");
assert.match(foreignSource.message, /정확한 지역 분석 자료/);

const invalidDate = packet.projectPacket(auction, { path: source.path, body: body.replace("metrics_as_of: 2026-06-01", "metrics_as_of: 2026-13-01") });
assert.ok(invalidDate.checks.some((check) => check.kind === "invalid_metrics_as_of"));

const staleDate = packet.projectPacket(auction, { path: source.path, body: body.replace("metrics_as_of: 2026-06-01", "metrics_as_of: 2001-01-01").replace("source_as_of: 2026-07-01", "source_as_of: 2001-01-01") });
assert.ok(staleDate.checks.some((check) => check.kind === "stale_metrics_as_of"));
assert.ok(staleDate.checks.some((check) => check.kind === "stale_source_as_of"));

const missing = packet.projectPacket(auction, null);
assert.equal(missing.status, "unavailable");
assert.match(missing.message, /지역 분석 자료/);
assert.equal(missing.decision_authority, "human_required");

assert.deepEqual(packet.projectResearchAction(null), { state: "missing", label: "조사 필요", show: true });
assert.deepEqual(packet.projectResearchAction({ stale: true, pkg: { providers: {} } }), { state: "stale", label: "자료 갱신 필요", show: true });
assert.deepEqual(packet.projectResearchAction({ pkg: { providers: { court: { status: "failed" } } } }), { state: "failed", label: "조사 실패", show: true });
assert.deepEqual(packet.projectResearchAction({ pkg: { providers: { building: { status: "needs_identifier" } } } }), { state: "needs_identifier", label: "식별 정보 필요", show: true });
assert.deepEqual(packet.projectResearchAction({ pkg: { providers: { building: { status: "needs_selection" } } } }), { state: "needs_selection", label: "대상 선택 필요", show: true });
assert.deepEqual(packet.projectResearchAction({ pkg: { providers: { court: { status: "success" }, building: { status: "empty" } } } }), { state: "ready", label: "조사 자료", show: false });

async function verifyMissingRegionNeverCreatesObject() {
  const previousObsidian = global.obsidian;
  const previousNotice = global.Notice;
  delete global.obsidian;
  const writes = [];
  const forbiddenWrite = (name) => () => { writes.push(name); };
  const app = {
    vault: {
      getAbstractFileByPath: () => null,
      create: forbiddenWrite("create"),
      modify: forbiddenWrite("modify"),
      append: forbiddenWrite("append"),
      rename: forbiddenWrite("rename"),
      delete: forbiddenWrite("delete")
    },
    fileManager: { processFrontMatter: forbiddenWrite("frontmatter") }
  };
  global.Notice = class {};
  try {
    const result = await packet.openForAuction(app, auction);
    assert.equal(result.status, "unavailable");
    assert.deepEqual(writes, []);
  } finally {
    if (previousObsidian === undefined) delete global.obsidian;
    else global.obsidian = previousObsidian;
    if (previousNotice === undefined) delete global.Notice;
    else global.Notice = previousNotice;
  }
}

async function verifyExistingRegionOnlyReadsObject() {
  const previousObsidian = global.obsidian;
  const previousNotice = global.Notice;
  delete global.obsidian;
  const writes = [];
  const forbiddenWrite = (name) => () => { writes.push(name); };
  const app = {
    vault: {
      getAbstractFileByPath: (requestedPath) => requestedPath === source.path ? { path: requestedPath } : null,
      read: async () => body,
      create: forbiddenWrite("create"),
      modify: forbiddenWrite("modify"),
      append: forbiddenWrite("append"),
      rename: forbiddenWrite("rename"),
      delete: forbiddenWrite("delete")
    },
    fileManager: { processFrontMatter: forbiddenWrite("frontmatter") }
  };
  global.Notice = class {};
  try {
    const result = await packet.openForAuction(app, auction);
    assert.equal(result.status, "ready");
    assert.deepEqual(writes, []);
  } finally {
    if (previousObsidian === undefined) delete global.obsidian;
    else global.obsidian = previousObsidian;
    if (previousNotice === undefined) delete global.Notice;
    else global.Notice = previousNotice;
  }
}

Promise.all([verifyMissingRegionNeverCreatesObject(), verifyExistingRegionOnlyReadsObject()])
  .then(() => console.log("auction region packet tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
