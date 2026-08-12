"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/monthly-validation-core.js"));
const viewPath = path.join(ROOT, "SYSTEM/Views/monthly-validation-view.js");

class Element {
  constructor(tag = "div", options = {}) {
    this.tag = tag;
    this.textContent = options.text || "";
    this.attributes = options.attr || {};
    this.children = [];
    this.value = this.attributes.value || "";
    this.disabled = false;
    this.className = this.attributes.class || "";
  }
  createEl(tag, options = {}) {
    const child = new Element(tag, options);
    this.children.push(child);
    return child;
  }
  empty() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
}

function findAll(element, predicate, found = []) {
  if (predicate(element)) found.push(element);
  element.children.forEach((child) => findAll(child, predicate, found));
  return found;
}

function model() {
  return {
    month: "2026-07",
    readiness: { ready: true, weekly_count: 2, eligible_principles: 1, total_principles: 1, reason: "" },
    principles: [{ title: "먼저 확인하기", weeks: ["2026-W27", "2026-W28"], evidence_refs: ["daily-2026-07-01-e01"], eligible: true }],
    weekly_paths: ["DAILY/WEEKLY/2026-W27.md", "DAILY/WEEKLY/2026-W28.md"]
  };
}

const previous = {
  MonthlyValidationCore: global.MonthlyValidationCore,
  MonthlyValidationStore: global.MonthlyValidationStore,
  MonthlyValidationAI: global.MonthlyValidationAI,
  confirm: global.confirm
};

let weeklyReads = 0;
let saveCalls = 0;
let aiCalls = 0;
let aiSignal = null;
let pendingNext = false;
let resolvePending = null;
let sourceChanged = false;
let zeroEvidence = false;
let blocked = false;
let sparse = false;
let monthlyExists = false;
let savedMonthlyContent = "";
let monthlyMtime = null;
let candidateCalls = 0;
global.MonthlyValidationCore = core;
global.MonthlyValidationStore = {
  listWeeklyNotes: async () => {
    weeklyReads += 1;
    const first = { path: "DAILY/WEEKLY/2026-W27.md", week: "2026-W27", start: "2026-06-29", end: "2026-07-05", source_mtime: 10, principles: [{ title: "먼저 확인하기", evidence_refs: ["daily-2026-07-01-e01"] }] };
    const second = { path: "DAILY/WEEKLY/2026-W28.md", week: "2026-W28", start: "2026-07-06", end: "2026-07-12", source_mtime: 11, principles: [{ title: "먼저 확인하기", evidence_refs: ["daily-2026-07-01-e01"] }] };
    const other = { path: "DAILY/WEEKLY/2026-W28.md", week: "2026-W28", start: "2026-07-06", end: "2026-07-12", source_mtime: 11, principles: [{ title: "한 번만 나타난 원칙", evidence_refs: ["daily-2026-07-01-e01"] }] };
    if (sparse) return [first, other];
    return blocked ? [first] : [first, second];
  },
  listMonthlyDailyEvidence: async () => ({
    evidence: zeroEvidence ? [] : [{ evidence_id: "daily-2026-07-01-e01", date: "2026-07-01", context: "업무", experience: "경험", interpretation: "해석", change: "변화", next_experiment: "실험" }],
    source_snapshots: [{ path: "DAILY/DAILY/2026-07-01.md", mtime: 12 }],
    warnings: []
  }),
  readMonthlySnapshot: async () => ({ exists: monthlyExists, path: "DAILY/MONTHLY/2026-07.md", content: savedMonthlyContent, mtime: monthlyMtime }),
  saveWithMtimeGuard: async (_app, _month, content) => {
    saveCalls += 1;
    const created = !monthlyExists;
    monthlyExists = true;
    savedMonthlyContent = content;
    monthlyMtime = 20;
    return { ok: true, created, path: "DAILY/MONTHLY/2026-07.md", new_mtime: 20 };
  },
  createCandidatesFromDecisions: async () => { candidateCalls += 1; return []; },
  sourceSnapshotChanged: async () => sourceChanged
};
global.MonthlyValidationAI = {
  generateMonthlyAI: async (options) => {
    aiCalls += 1;
    aiSignal = options.signal;
    if (options.mode === "question_only") {
      return {
        mode: "question_only",
        coverage_summary: "7월 Evidence를 관찰했습니다.",
        observed_evidence_groups: [{ evidence_refs: ["daily-2026-07-01-e01"], observation: "확인 전 멈추는 장면을 관찰합니다." }],
        missing_evidence: ["반복 근거"],
        uncertainties: ["아직 단일 주차입니다."],
        review_questions: ["다음 주에도 반복되는가?"],
        next_month_direction_draft: "확인 전 멈추는 장면을 더 관찰합니다.",
        provider: "test",
        model: "test-model"
      };
    }
    const result = {
      principle_reviews: [{
        principle_ref: "monthly-2026-07-p001",
        supporting_evidence_refs: ["daily-2026-07-01-e01"],
        counter_evidence_refs: [],
        missing_evidence: [],
        contradictions_or_exceptions: [],
        validation_questions: ["다음에도 반복되는가?"],
        validation_rationale_draft: "AI가 제안한 검증 사유"
      }],
      next_month_direction_draft: "AI가 제안한 다음 달 방향",
      provider: "test",
      model: "test-model"
    };
    if (pendingNext) return new Promise((resolve) => { resolvePending = () => resolve(result); });
    return result;
  }
};
delete require.cache[require.resolve(viewPath)];
const view = require(viewPath);

(async () => {
  const root = new Element();
  const controller = view.mount({ app: { vault: {} }, container: root, initialMonth: "2026-07" });
  await controller.ready;
  assert.equal(weeklyReads, 1);

  const summary = findAll(root, (item) => item.attributes["aria-label"] === "월간 요약")[0];
  summary.value = "사람이 쓴 요약";
  summary.oninput();
  const decision = findAll(root, (item) => item.tag === "button" && item.textContent === "검증")[0];
  await decision.onclick();
  assert.equal(weeklyReads, 1, "decision rerender does not reload the Vault");
  assert.equal(findAll(root, (item) => item.attributes["aria-label"] === "월간 요약")[0].value, "사람이 쓴 요약");

  const aiButton = findAll(root, (item) => item.tag === "button" && item.textContent === "AI 검증 보조")[0];
  await aiButton.onclick();
  assert.equal(aiCalls, 1);
  const rationaleCopy = findAll(root, (item) => item.tag === "button" && item.textContent === "AI 초안 복사")[0];
  await rationaleCopy.onclick();
  const reason = findAll(root, (item) => item.attributes["aria-label"] === "검증 사유")[0];
  assert.equal(reason.value, "AI가 제안한 검증 사유");
  const directionCopy = findAll(root, (item) => item.tag === "button" && item.textContent === "다음 달 방향 초안 복사")[0];
  await directionCopy.onclick();
  assert.equal(findAll(root, (item) => item.attributes["aria-label"] === "다음 달 방향")[0].value, "AI가 제안한 다음 달 방향");
  assert.equal(saveCalls, 0, "AI and copy actions do not save");
  const saveButton = findAll(root, (item) => item.tag === "button" && item.textContent === "월간 검증 저장")[0];
  await saveButton.onclick();
  assert.equal(saveCalls, 1);
  assert.match(savedMonthlyContent, /# 2026-07 Monthly Validation/);
  await controller.reload();
  assert.equal(findAll(root, (item) => item.attributes["aria-label"] === "월간 요약")[0].value, "사람이 쓴 요약", "saved Monthly summary is restored after reload");
  assert.equal(findAll(root, (item) => item.attributes["aria-label"] === "다음 달 방향")[0].value, "AI가 제안한 다음 달 방향", "saved Monthly direction is restored after reload");
  assert.match(findAll(root, (item) => item.tag === "button" && item.textContent === "검증")[0].className, /mv-btn-primary/, "saved Monthly decision is restored after reload");
  monthlyExists = false;
  savedMonthlyContent = "";
  monthlyMtime = null;
  sourceChanged = true;
  const callsBeforeSourceChange = aiCalls;
  await controller.runAI();
  assert.equal(aiCalls, callsBeforeSourceChange, "source change blocks provider call");
  assert.equal(findAll(root, (item) => item.textContent === "입력 기록 변경됨").length, 1);
  sourceChanged = false;
  pendingNext = true;
  const pendingRun = controller.runAI();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.destroy();
  assert.equal(aiSignal.aborted, true, "destroy aborts the active controller signal");
  resolvePending();
  await pendingRun;
  const legacyRoot = new Element();
  const legacyController = view.mount({
    app: { vault: {} },
    container: legacyRoot,
    initialMonth: "2024-11",
    initialRecord: { path: "DAILY/MONTHLY/2024-November.md", content: "---\njournal: personal monthly\n---\n# Monthly Notes" }
  });
  await legacyController.ready;
  assert.equal(findAll(legacyRoot, (item) => item.textContent === "기존 기록 형식을 자동으로 불러올 수 없습니다").length, 1);
  assert.equal(findAll(legacyRoot, (item) => item.tag === "button" && item.textContent === "새 검증으로 교체").length, 1);
  legacyController.destroy();
  zeroEvidence = true;
  const emptyRoot = new Element();
  const emptyController = view.mount({ app: { vault: {} }, container: emptyRoot, initialMonth: "2026-07" });
  await emptyController.ready;
  assert.equal(findAll(emptyRoot, (item) => item.textContent === "선택한 달에 AI가 검토할 구조화 Evidence가 없습니다").length, 1);
  const emptyAICalls = aiCalls;
  const emptyAIButton = findAll(emptyRoot, (item) => item.tag === "button" && item.textContent === "AI 검증 보조")[0];
  assert.equal(emptyAIButton.disabled, true);
  await emptyController.runAI();
  assert.equal(aiCalls, emptyAICalls, "zero Evidence keeps provider calls at zero");
  emptyController.destroy();
  zeroEvidence = false;
  sparse = true;
  monthlyExists = false;
  savedMonthlyContent = "";
  monthlyMtime = null;
  const sparseRoot = new Element();
  const sparseController = view.mount({ app: { vault: {} }, container: sparseRoot, initialMonth: "2026-07" });
  await sparseController.ready;
  const candidatesBeforeSparse = candidateCalls;
  assert.equal(findAll(sparseRoot, (item) => item.textContent === "Monthly 관찰 질문 모드").length, 1);
  assert.equal(findAll(sparseRoot, (item) => item.tag === "button" && item.textContent === "검증").length, 0, "question-only hides Principle decisions");
  const sparseAI = findAll(sparseRoot, (item) => item.tag === "button" && item.textContent === "AI 관찰 질문 보조")[0];
  await sparseAI.onclick();
  assert.equal(aiCalls > 0, true);
  assert.equal(findAll(sparseRoot, (item) => item.textContent === "검토 질문").length, 1);
  const sparseDirectionCopy = findAll(sparseRoot, (item) => item.tag === "button" && item.textContent === "다음 달 방향 초안 복사")[0];
  await sparseDirectionCopy.onclick();
  assert.equal(findAll(sparseRoot, (item) => item.attributes["aria-label"] === "다음 달 방향")[0].value, "확인 전 멈추는 장면을 더 관찰합니다.");
  const sparseSave = findAll(sparseRoot, (item) => item.tag === "button" && item.textContent === "월간 관찰 기록 저장")[0];
  await sparseSave.onclick();
  assert.match(savedMonthlyContent, /^status: draft$/m);
  assert.equal(candidateCalls, candidatesBeforeSparse, "question-only save never creates Candidates");
  await sparseController.reload();
  assert.equal(findAll(sparseRoot, (item) => item.attributes["aria-label"] === "월간 요약")[0].value, "");
  sparseController.destroy();
  sparse = false;
  monthlyExists = false;
  savedMonthlyContent = "";
  monthlyMtime = null;
  blocked = true;
  const blockedRoot = new Element();
  const canonicalContent = core.buildMonthlyNoteContent(model(), {
    summary: "기존 요약",
    p0: { action: "validated", validation_reason: "기존 사유" },
    next_direction: "기존 방향"
  });
  const blockedController = view.mount({
    app: { vault: {} },
    container: blockedRoot,
    initialMonth: "2026-07",
    initialRecord: { path: "DAILY/MONTHLY/2026-07.md", content: canonicalContent }
  });
  await blockedController.ready;
  assert.equal(findAll(blockedRoot, (item) => item.textContent === "기존 Monthly 기록").length, 1);
  assert.equal(findAll(blockedRoot, (item) => item.tag === "button" && item.textContent === "월간 검증 저장").length, 0);
  assert.equal(findAll(blockedRoot, (item) => item.tag === "button" && item.textContent === "기존 기록 교체").length, 1);
  blockedController.destroy();
  blocked = false;
  const reloadRoot = new Element();
  const reloadController = view.mount({ app: { vault: {} }, container: reloadRoot, initialMonth: "2026-07" });
  await reloadController.ready;
  const reloadSummary = findAll(reloadRoot, (item) => item.attributes["aria-label"] === "월간 요약")[0];
  reloadSummary.value = "편집 중";
  reloadSummary.oninput();
  let confirmMessage = "";
  global.confirm = (message) => { confirmMessage = message; return false; };
  const readsBeforeCancelledReload = weeklyReads;
  await reloadController.reload();
  assert.equal(weeklyReads, readsBeforeCancelledReload, "cancelled reload keeps the current editor");
  assert.equal(confirmMessage, "다시 불러오면 저장하지 않은 입력과 AI 검증 결과가 사라집니다");
  global.confirm = () => true;
  await reloadController.reload();
  assert.equal(weeklyReads, readsBeforeCancelledReload + 1, "confirmed reload rereads the sources");
  reloadController.destroy();
  console.log("Monthly validation view tests passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
}).finally(() => {
  Object.entries(previous).forEach(([key, value]) => {
    if (value === undefined) delete global[key];
    else global[key] = value;
  });
});
