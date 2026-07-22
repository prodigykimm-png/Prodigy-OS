"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const handoffApi = require(path.join(ROOT, "SYSTEM/Views/region-experience-handoff.js"));
const regionStore = require(path.join(ROOT, "SYSTEM/Views/region-experience-store.js"));

const DATE = "2026-07-22";
const DAILY_PATH = `DAILY/DAILY/${DATE}.md`;
const PLANNED_ID = "region-experience-0";
const COMMITTED_ID = `daily-${DATE}-e09`;

function input(overrides) {
  return Object.assign({
    experience_date: DATE,
    region_key: "부산광역시-부산진구",
    region: {
      type: "auction_region",
      region_key: "부산광역시-부산진구",
      region_sido: "부산광역시",
      region_sigungu: "부산진구",
      path: "PARA/RESOURCES/Auction Regions/부산광역시-부산진구.md",
      wiki_link: "[[PARA/RESOURCES/Auction Regions/부산광역시-부산진구]]"
    },
    category: "site_visit",
    epistemic_status: "direct_observation",
    direct_observation: "범천동 골목에서 저녁 차량 소음이 이어졌다.",
    subarea: "범천동",
    related_object_links: []
  }, overrides || {});
}

function proposal() {
  return {
    evidence: { title: "저녁 차량 소음", interpretation: "보행 동선을 다시 확인한다.", change: "", next_experiment: "낮과 저녁을 비교한다." },
    region_candidates: [{ category: "site_visit", text: "저녁 보행 동선과 차량 소음을 다시 확인한다.", source_evidence_indexes: [0] }],
    knowledge_candidates: [
      { title: "시간대별 현장 확인", statement: "현장 확인은 시간대를 나눠 비교한다.", reason: "소음이 시간대에 따라 달랐다.", source_evidence_indexes: [0], confidence: "explicit" },
      { title: "미선택 후보", statement: "저장하면 안 된다.", reason: "선택하지 않았다.", source_evidence_indexes: [0], confidence: "low" }
    ]
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function dailyContent(evidenceId) {
  return `---\ntype: journal\n---\n\n## Evidence\n\n<!-- evidence_id: ${evidenceId} -->\n`;
}

function regionContent() {
  return [
    "---",
    "type: auction_region",
    "region_sido: 부산광역시",
    "region_sigungu: 부산진구",
    "---",
    "",
    "## 임장 포인트",
    "<!-- AI:PENDING:SITE_VISIT:START -->",
    "<!-- AI:PENDING:SITE_VISIT:END -->",
    "<!-- HUMAN:OWNED -->"
  ].join("\n");
}

function currentVault() {
  const regionPath = input().region.path;
  const files = new Map([
    [DAILY_PATH, { path: DAILY_PATH, extension: "md" }],
    [regionPath, { path: regionPath, extension: "md" }]
  ]);
  const contents = new Map([
    [DAILY_PATH, dailyContent(COMMITTED_ID)],
    [regionPath, regionContent()]
  ]);
  let regionProcessCalls = 0;
  let dailyReadCalls = 0;
  return {
    app: {
      vault: {
        getAbstractFileByPath(filePath) { return files.get(filePath) || null; },
        async read(file) {
          if (file.path === DAILY_PATH) dailyReadCalls += 1;
          return contents.get(file.path);
        },
        async process(file, callback) {
          regionProcessCalls += 1;
          const next = await callback(contents.get(file.path));
          contents.set(file.path, next);
        }
      }
    },
    deleteCommittedEvidence() { contents.set(DAILY_PATH, dailyContent("daily-2026-07-22-e10")); },
    regionProcessCalls() { return regionProcessCalls; },
    dailyReadCalls() { return dailyReadCalls; }
  };
}

function fixture(overrides) {
  const calls = { order: [], daily: [], region: [], prepared: [], candidates: [], approvals: [] };
  const services = {
    contract: require(path.join(ROOT, "SYSTEM/Views/region-experience-contract.js")),
    journalStore: {
      mergeProposedEvidenceAtCommit: async (_app, dateStr, blocks) => {
        calls.order.push("daily");
        calls.daily.push({ dateStr, blocks: clone(blocks) });
        return {
          path: DAILY_PATH,
          blocks: blocks.map((block) => Object.assign({}, block, { evidence_id: COMMITTED_ID })),
          evidenceIdMap: { [PLANNED_ID]: COMMITTED_ID }
        };
      }
    },
    regionStore: {
      appendApprovedExperience: async (_app, request) => {
        calls.order.push("region");
        calls.region.push(clone(request));
        return { ok: true, status: "appended", path: request.region.path };
      }
    },
    knowledgeHandoff: {
      prepareKnowledgeCandidateHandoff: (normalizedProposal, options) => {
        calls.order.push("prepare");
        calls.prepared.push({ normalizedProposal, options: clone(options) });
        return {
          ready: options.selectedCandidateIndexes.map((index) => ({ title: normalizedProposal.knowledge_candidates[index].title, source_evidence_ids: [COMMITTED_ID] })),
          blocked: [], guidance: []
        };
      }
    },
    candidateStore: {
      saveCandidate: async (_app, candidate) => {
        calls.order.push("candidate");
        calls.candidates.push(clone(candidate));
        return Object.assign({ path: `PARA/RESOURCES/Knowledge/Candidates/${candidate.title}.md` }, candidate);
      },
      approveCandidate: async () => { calls.approvals.push("forbidden"); throw new Error("must not approve"); }
    }
  };
  Object.assign(services, overrides || {});
  return { calls, handoff: handoffApi.createHandoff(services) };
}

test("Given selected Evidence When Daily save fails Then Region and Knowledge seams are never called", async () => {
  const failed = fixture({ journalStore: { mergeProposedEvidenceAtCommit: async () => { throw new Error("Daily write failed"); } } });
  const result = await failed.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  assert.equal(result.ok, false);
  assert.match(result.message, /Daily Evidence 저장/);
  assert.deepEqual(failed.calls.order, []);
});

test("Given an AI proposal When only its Evidence is confirmed Then Daily stores the Region link before any optional action", async () => {
  const state = fixture();
  const result = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  assert.equal(result.ok, true);
  assert.equal(result.status, "saved");
  assert.deepEqual(state.calls.order, ["daily"]);
  assert.deepEqual(state.calls.daily[0].blocks[0].related_objects, ["[[PARA/RESOURCES/Auction Regions/부산광역시-부산진구]]"]);
  assert.equal(result.savedState.provenanceKey, `${DAILY_PATH}#${COMMITTED_ID}`);
});

test("Given committed Evidence remapped at save When Region append fails then retries Then Daily provenance is retained and the duplicate action converges", async () => {
  let attempts = 0;
  const state = fixture({ regionStore: { appendApprovedExperience: async (_app, request) => {
    state.calls.order.push("region");
    state.calls.region.push(clone(request));
    attempts += 1;
    if (attempts === 1) throw new Error("Region target unavailable");
    return { ok: true, status: "appended", path: request.region.path };
  } } });
  const saved = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  const failed = await state.handoff.approveRegion({}, { savedState: saved.savedState, selectedCandidateIndex: 0, humanConfirmed: true });
  const appended = await state.handoff.approveRegion({}, { savedState: failed.savedState, selectedCandidateIndex: 0, humanConfirmed: true });
  const unchanged = await state.handoff.approveRegion({}, { savedState: appended.savedState, selectedCandidateIndex: 0, humanConfirmed: true });
  assert.equal(failed.ok, false);
  assert.equal(appended.status, "appended");
  assert.equal(unchanged.status, "unchanged");
  assert.equal(state.calls.region.length, 2);
  assert.equal(state.calls.region[1].committed_evidence_id, COMMITTED_ID);
  assert.equal(state.calls.region[1].candidate.source_evidence_ids[0], COMMITTED_ID);
  assert.equal(saved.savedState.dailyPath, DAILY_PATH);
});

test("Given committed Evidence is deleted after savedBlocks are cached When Region approval runs Then the current Daily adapter blocks the append and all optional side effects", async () => {
  const vault = currentVault();
  const state = fixture({ regionStore });
  const saved = await state.handoff.saveEvidence(vault.app, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  vault.deleteCommittedEvidence();
  const result = await state.handoff.approveRegion(vault.app, { savedState: saved.savedState, selectedCandidateIndex: 0, humanConfirmed: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /저장된 Daily Evidence.*다시 저장/);
  assert.equal(vault.dailyReadCalls(), 1, "approval must read the current Daily through the vault adapter");
  assert.equal(vault.regionProcessCalls(), 0, "deleted Evidence must block Region vault.process");
  assert.deepEqual(state.calls.candidates, []);
  assert.deepEqual(state.calls.prepared, []);
});

test("Given separately selected Knowledge candidates When one explicit row is saved Then only that row uses the shared Candidate store and never approves a Knowledge Object", async () => {
  const state = fixture();
  const saved = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  const result = await state.handoff.saveKnowledgeCandidates({}, { savedState: saved.savedState, selectedCandidateIndexes: [0] });
  assert.equal(result.ok, true);
  assert.equal(result.saved.length, 1);
  assert.deepEqual(state.calls.candidates.map((candidate) => candidate.title), ["시간대별 현장 확인"]);
  assert.equal(state.calls.approvals.length, 0);
  assert.deepEqual(state.calls.prepared[0].options.selectedEvidenceIds, [PLANNED_ID]);
  assert.equal(state.calls.prepared[0].options.evidenceIdMap[PLANNED_ID], COMMITTED_ID);
});

test("Given two explicitly selected Knowledge candidates When candidate 0 saves and candidate 1 fails Then retry saves only candidate 1 without duplicating candidate 0", async () => {
  let candidateOneAttempts = 0;
  const state = fixture({ candidateStore: {
    saveCandidate: async (_app, candidate) => {
      state.calls.order.push("candidate");
      state.calls.candidates.push(clone(candidate));
      if (candidate.title === "미선택 후보" && candidateOneAttempts++ === 0) throw new Error("candidate 1 failed");
      return Object.assign({ path: `PARA/RESOURCES/Knowledge/Candidates/${candidate.title}.md` }, candidate);
    },
    approveCandidate: async () => { state.calls.approvals.push("forbidden"); throw new Error("must not approve"); }
  } });
  const saved = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  const failed = await state.handoff.saveKnowledgeCandidates({}, { savedState: saved.savedState, selectedCandidateIndexes: [0, 1] });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.savedState.savedKnowledgeCandidateIndexes, [0], "the returned retry state retains only the successful candidate identity");
  const retried = await state.handoff.saveKnowledgeCandidates({}, { savedState: failed.savedState, selectedCandidateIndexes: [0, 1] });
  assert.equal(retried.ok, true);
  assert.deepEqual(retried.savedState.savedKnowledgeCandidateIndexes, [0, 1]);
  assert.deepEqual(state.calls.candidates.map((candidate) => candidate.title), ["시간대별 현장 확인", "미선택 후보", "미선택 후보"]);
  assert.equal(state.calls.approvals.length, 0);
});

test("Given malformed or stale post-save candidate selections When Region or Knowledge actions are requested Then both return recovery without optional side effects", async () => {
  const state = fixture();
  const saved = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  const malformedRegion = await state.handoff.approveRegion({}, { savedState: saved.savedState, selectedCandidateIndex: "1", humanConfirmed: true });
  const missingKnowledge = await state.handoff.saveKnowledgeCandidates({}, { savedState: saved.savedState, selectedCandidateIndexes: [2] });
  const stale = clone(saved.savedState);
  stale.savedBlocks = [];
  const staleKnowledge = await state.handoff.saveKnowledgeCandidates({}, { savedState: stale, selectedCandidateIndexes: [0] });
  assert.equal(malformedRegion.ok, false);
  assert.equal(missingKnowledge.ok, false);
  assert.equal(staleKnowledge.ok, false);
  assert.equal(state.calls.region.length, 0);
  assert.equal(state.calls.prepared.length, 0);
  assert.equal(state.calls.candidates.length, 0);
});

test("Given stale or duplicate post-save selections When Region or Knowledge action is requested Then both fail closed before a store call", async () => {
  const state = fixture();
  const saved = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID] });
  const stale = clone(saved.savedState);
  stale.savedBlocks = [];
  const region = await state.handoff.approveRegion({}, { savedState: stale, selectedCandidateIndex: 0, humanConfirmed: true });
  const knowledge = await state.handoff.saveKnowledgeCandidates({}, { savedState: stale, selectedCandidateIndexes: [0] });
  const duplicate = await state.handoff.saveKnowledgeCandidates({}, { savedState: saved.savedState, selectedCandidateIndexes: [0, 0] });
  const duplicateEvidence = await state.handoff.saveEvidence({}, { input: input(), proposal: proposal(), selectedEvidenceIds: [PLANNED_ID, PLANNED_ID] });
  assert.equal(region.ok, false);
  assert.equal(knowledge.ok, false);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicateEvidence.ok, false);
  assert.match(region.message, /저장된 Evidence/);
  assert.match(knowledge.message, /저장된 Evidence/);
  assert.match(duplicate.message, /선택/);
  assert.match(duplicateEvidence.message, /중복/);
  assert.equal(state.calls.region.length, 0);
  assert.equal(state.calls.candidates.length, 0);
  assert.equal(state.calls.daily.length, 1);
});

test("Given a manual Evidence-only proposal When it is saved Then it follows the same Daily-only flow without mutating caller input", async () => {
  const state = fixture();
  const form = input();
  const manual = { title: "직접 기록", interpretation: "골목 소음을 들었다.", change: "", next_experiment: "다시 걷는다." };
  const before = JSON.stringify({ form, manual });
  const manualProposal = handoffApi.createManualEvidenceProposal(form, manual, state.handoff.contract);
  const result = await state.handoff.saveEvidence({}, { proposal: manualProposal, selectedEvidenceIds: [PLANNED_ID] });
  assert.equal(result.ok, true);
  assert.equal(result.savedState.proposal.region_candidates.length, 0);
  assert.equal(result.savedState.proposal.knowledge_candidates.length, 0);
  assert.equal(state.calls.daily.length, 1);
  assert.deepEqual(state.calls.order, ["daily"]);
  assert.equal(JSON.stringify({ form, manual }), before);
});

test("Given a normalized proposal that no longer matches its input When Evidence save is requested Then it returns Korean recovery without a Daily write or caller mutation", async () => {
  const state = fixture();
  const raw = proposal();
  const normalized = state.handoff.contract.normalizeProposal(raw, input());
  const current = input({ direct_observation: "다른 날의 관찰이다." });
  const before = JSON.stringify({ raw, normalized, current });
  const result = await state.handoff.saveEvidence({}, { input: current, proposal: normalized, selectedEvidenceIds: [PLANNED_ID] });
  assert.equal(result.ok, false);
  assert.match(result.message, /현재 입력/);
  assert.equal(JSON.stringify({ raw, normalized, current }), before);
  assert.equal(state.calls.daily.length, 0);
});
