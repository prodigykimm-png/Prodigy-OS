"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
const postSavePath = path.join(ROOT, "SYSTEM/Views/daily-reflection-post-save.js");

async function main() {
  const previous = { core: global.PeopleCore, store: global.PeopleStore, postSave: global.DailyReflectionPostSave };
  const personPath = "PARA/RESOURCES/CONTACTS/테스트 사람.md";
  const secondPersonPath = "PARA/RESOURCES/CONTACTS/두번째 사람.md";
  const dailyPath = "DAILY/DAILY/2026-07-20.md";
  const files = new Map([
    [dailyPath, { path: dailyPath, extension: "md" }],
    [personPath, { path: personPath, extension: "md" }],
    [secondPersonPath, { path: secondPersonPath, extension: "md" }]
  ]);
  const contents = new Map([
    [personPath, "---\ntype: people\n---\n\n# 핵심 상호작용\n\n"],
    [secondPersonPath, "---\ntype: people\n---\n\n# 핵심 상호작용\n\n"]
  ]);
  let modifyCount = 0;
  const notices = [];
  const app = { vault: {
    getAbstractFileByPath(filePath) { return files.get(filePath) || null; },
    async read(file) { return contents.get(file.path); },
    async modify(file, next) { modifyCount += 1; contents.set(file.path, next); }
  } };
  const proposal = {
    evidence_blocks: [
      { evidence_id: "e01", context: "people", interpretation: "약속 전에 핵심 안건을 먼저 공유하면 대화가 편해진다." },
      { evidence_id: "e02", context: "people", interpretation: "두 번째 사람에게만 남길 통찰" },
      { evidence_id: "e03", context: "work", interpretation: "업무 통찰" }
    ],
    object_linking_suggestions: [
      { object_kind: "people", object_name: "테스트 사람", resolved_path: personPath, source_evidence_ids: ["e01"] },
      { object_kind: "people", object_name: "두번째 사람", resolved_path: secondPersonPath, source_evidence_ids: ["e02"] }
    ]
  };
  const modal = {
    proposal,
    savedEvidence: { selectedEvidenceIds: ["e01", "e02", "e03"] },
    selectedVenueCandidates: new Set(),
    selectedPlaceCandidates: new Set()
  };

  try {
    global.PeopleCore = core;
    global.PeopleStore = { async createPeople() { throw new Error("existing fixture must not be created"); } };
    delete global.DailyReflectionPostSave;
    delete require.cache[require.resolve(postSavePath)];
    require(postSavePath);
    const postSave = global.DailyReflectionPostSave;

    await postSave.runHandoffs(modal, app, dailyPath, (message) => notices.push(message));
    assert.equal(modifyCount, 2);
    assert.equal((contents.get(personPath).match(/약속 전에 핵심 안건을 먼저 공유하면 대화가 편해진다\./g) || []).length, 1);
    assert.doesNotMatch(contents.get(personPath), /두 번째 사람에게만 남길 통찰|업무 통찰/);
    assert.match(contents.get(secondPersonPath), /두 번째 사람에게만 남길 통찰/);
    assert.doesNotMatch(contents.get(secondPersonPath), /약속 전에 핵심 안건|업무 통찰/);

    await postSave.runHandoffs(modal, app, dailyPath, (message) => notices.push(message));
    assert.equal(modifyCount, 2, "같은 승인을 다시 실행해도 불변 파일을 다시 쓰지 않는다");
    assert.equal((contents.get(personPath).match(/약속 전에 핵심 안건을 먼저 공유하면 대화가 편해진다\./g) || []).length, 1);

    const failureNotices = [];
    app.vault.modify = async () => { throw new Error("fixture write failure"); };
    modal.proposal.evidence_blocks[0].interpretation = "새 통찰";
    await postSave.runHandoffs(modal, app, dailyPath, (message) => failureNotices.push(message));
    assert.ok(failureNotices.some((message) => /Evidence는 저장되었습니다/.test(message)));
  } finally {
    delete require.cache[require.resolve(postSavePath)];
    if (previous.core === undefined) delete global.PeopleCore; else global.PeopleCore = previous.core;
    if (previous.store === undefined) delete global.PeopleStore; else global.PeopleStore = previous.store;
    if (previous.postSave === undefined) delete global.DailyReflectionPostSave; else global.DailyReflectionPostSave = previous.postSave;
  }
  console.log("Daily Reflection people handoff tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
