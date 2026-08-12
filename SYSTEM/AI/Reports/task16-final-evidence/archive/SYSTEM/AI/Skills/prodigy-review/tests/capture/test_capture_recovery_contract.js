"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const state = require(path.join(ROOT, "SYSTEM/Views/capture-state-contract.js"));

assert.deepEqual(Object.keys(state.TRANSITIONS), [
  "capture_started", "ai_proposal", "human_review", "human_confirmed", "object_committed",
  "rejected", "cancelled", "no_change", "stale", "conflict", "error"
]);
assert.deepEqual(state.TRANSITIONS.capture_started, { propose: "ai_proposal", cancel: "cancelled", mark_stale: "stale", fail: "error" });
assert.equal(state.TRANSITIONS.ai_proposal.begin_review, "human_review");
assert.equal(state.TRANSITIONS.human_review.confirm, "human_confirmed");
assert.equal(state.TRANSITIONS.human_confirmed.commit, "object_committed");

const paraView = read("SYSTEM/Views/knowledge-para-view.js");
assert.match(paraView, /ObjectCreatorCore/, "rendered PARA writes route through the canonical review creator");
assert.match(paraView, /renderReview/, "rendered PARA exposes the exact human_review record");
assert.match(paraView, /humanConfirmation/, "each rendered PARA action consumes a trusted interaction");
assert.match(paraView, /if \(action\.writes === true\)[\s\S]*creator\.launchExistingCreator/, "write actions select the rendered Capture branch before delegated actions");

const service = read("SYSTEM/Views/para-object-creator-service.js");
assert.match(service, /executeAction\(actionId, app, title, options, writeRequest\)/, "dispatcher requires a canonical request at its mutation boundary");
assert.match(service, /createArea\(app, title, opts, writeRequest\)/);
assert.match(service, /createDocumentation\(app, title, opts, writeRequest\)/);

const canonicalTokens = ["capture_started", "ai_proposal", "human_review", "human_confirmed", "object_committed", "rejected", "cancelled", "no_change", "stale", "conflict", "error"];
for (const rel of [
  "SYSTEM/docs/00_Constitution.md",
  "SYSTEM/docs/04_Capture_System.md",
  "SYSTEM/docs/ADR/ADR-003-ai-capture.md",
  "SYSTEM/docs/06_AI_System.md",
  "SYSTEM/docs/07_Implementation_Guide.md",
  "SYSTEM/docs/09_Obsidian_Manual.md",
  "SYSTEM/docs/11_Operating_Guide.md"
]) {
  const text = read(rel);
  for (const token of canonicalTokens) assert.ok(text.includes(`\`${token}\``), `${rel} documents ${token}`);
}
for (const obsolete of ["`in_review`", "`authorized`", "`writing`", "`written`"]) {
  assert.ok(!read("SYSTEM/docs/04_Capture_System.md").includes(obsolete), `Capture contract omits obsolete public state ${obsolete}`);
}
const captureDoc = read("SYSTEM/docs/04_Capture_System.md");
assert.match(captureDoc, /1 attempted canonical mutation[^\n]*0 accepted committed writes/i);
assert.match(captureDoc, /People[^\n]*(memo|메모)[^\n]*(interaction|상호작용)[^\n]*(edit|수정)[^\n]*(delete|삭제)/i);
assert.match(captureDoc, /existing-person[^\n]*insight append|기존 사람[^\n]*통찰/i);
assert.match(captureDoc, /Workout[^\n]*(manual|수동)[^\n]*(edit|수정)/i);

console.log("Capture recovery contract passed: canonical states, secured rendered PARA route, docs vocabulary and operational carve-outs.");
