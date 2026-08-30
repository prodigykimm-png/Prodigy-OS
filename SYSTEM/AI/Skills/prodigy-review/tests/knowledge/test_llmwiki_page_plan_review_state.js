"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reviewApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-page-plan-review-state.js"));
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function plan() {
  const body = {
    plan_version: "llmwiki_page_plan_v1",
    inventory_hash: "a".repeat(64),
    source: { source_id: "source_investment", source_path: "INBOX/투자일기.md", content_hash: "b".repeat(64) },
    source_guide: {
      title: "투자일기 자료 안내",
      overview: "투자 기록",
      sections: [{ heading: "전체", summary: "전체 내용", claim_ids: [`claim_${"1".repeat(24)}`, `claim_${"2".repeat(24)}`, `claim_${"3".repeat(24)}`, `claim_${"4".repeat(24)}`] }],
      key_questions: [],
    },
    pages: [
      {
        page_id: `page_${"1".repeat(24)}`,
        title: "건축 비용",
        purpose: "건축 비용을 설명한다.",
        claim_ids: [`claim_${"1".repeat(24)}`, `claim_${"2".repeat(24)}`],
        target_candidate_ids: [],
        operation_hint: "create",
        evidence_count: 2,
        selected: true,
      },
      {
        page_id: `page_${"2".repeat(24)}`,
        title: "투자 위험",
        purpose: "투자 위험을 설명한다.",
        claim_ids: [`claim_${"3".repeat(24)}`, `claim_${"4".repeat(24)}`],
        target_candidate_ids: [],
        operation_hint: "create",
        evidence_count: 2,
        selected: true,
      },
    ],
    source_only_claim_ids: [],
    status: "pending_review",
    plan_revision: 1,
  };
  return { ...body, plan_hash: hash.sha256(stable(body)) };
}

test("excluding a page retains its claims as source-only before approval", () => {
  const state = reviewApi.createPagePlanReviewState({ plan: plan() });
  const initial = state.getSnapshot();
  const toggled = state.dispatch({
    action: "toggle_page",
    page_id: `page_${"2".repeat(24)}`,
    expected_plan_hash: initial.plan_hash,
  });
  assert.equal(toggled.ok, true, toggled.reason);
  assert.equal(toggled.snapshot.pages[1].selected, false);
  assert.deepEqual([...toggled.snapshot.source_only_claim_ids].sort(), [`claim_${"3".repeat(24)}`, `claim_${"4".repeat(24)}`].sort());

  const approved = state.dispatch({ action: "approve_plan", expected_plan_hash: toggled.snapshot.plan_hash });
  assert.equal(approved.ok, true, approved.reason);
  assert.equal(approved.snapshot.status, "approved");
  assert.equal(approved.snapshot.pages.filter((page) => page.selected).length, 1);
});

test("merging page cards preserves exact claim coverage and creates a new plan revision", () => {
  const state = reviewApi.createPagePlanReviewState({ plan: plan() });
  const initial = state.getSnapshot();
  const merged = state.dispatch({
    action: "merge_pages",
    page_ids: [`page_${"1".repeat(24)}`, `page_${"2".repeat(24)}`],
    title: "건축 투자 비용과 위험",
    purpose: "비용 절감과 현금흐름 위험을 함께 설명한다.",
    expected_plan_hash: initial.plan_hash,
  });
  assert.equal(merged.ok, true, merged.reason);
  assert.equal(merged.snapshot.pages.length, 1);
  assert.equal(merged.snapshot.pages[0].claim_ids.length, 4);
  assert.equal(new Set(merged.snapshot.pages[0].claim_ids).size, 4);
  assert.equal(merged.snapshot.plan_revision, 2);
  assert.notEqual(merged.snapshot.plan_hash, initial.plan_hash);
});

test("stale page-plan actions are inert", () => {
  const state = reviewApi.createPagePlanReviewState({ plan: plan() });
  const result = state.dispatch({
    action: "approve_plan",
    expected_plan_hash: "f".repeat(64),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "stale_page_plan_action");
  assert.equal(state.getSnapshot().status, "pending_review");
});

test("approved page can reopen and split without dropping or duplicating claims", () => {
  const state = reviewApi.createPagePlanReviewState({ plan: plan() });
  let snapshot = state.getSnapshot();
  const merged = state.dispatch({
    action: "merge_pages",
    page_ids: [`page_${"1".repeat(24)}`, `page_${"2".repeat(24)}`],
    title: "넓은 투자 문서",
    purpose: "분할 전 문서",
    expected_plan_hash: snapshot.plan_hash,
  });
  assert.equal(merged.ok, true, merged.reason);
  const approved = state.dispatch({ action: "approve_plan", expected_plan_hash: merged.snapshot.plan_hash });
  assert.equal(approved.ok, true, approved.reason);
  const reopened = state.dispatch({ action: "reopen_plan", expected_plan_hash: approved.snapshot.plan_hash });
  assert.equal(reopened.ok, true, reopened.reason);
  assert.equal(reopened.snapshot.status, "pending_review");
  snapshot = reopened.snapshot;
  const broad = snapshot.pages[0];
  const split = state.dispatch({
    action: "split_page",
    page_id: broad.page_id,
    parts: [
      {
        title: "건축 비용",
        purpose: "건축 비용만 설명한다.",
        claim_ids: broad.claim_ids.slice(0, 2),
        evidence_count: 2,
      },
    ],
    source_only_claim_ids: broad.claim_ids.slice(2),
    expected_plan_hash: snapshot.plan_hash,
  });
  assert.equal(split.ok, true, split.reason);
  assert.equal(split.snapshot.pages.length, 1);
  assert.equal(split.snapshot.pages[0].claim_ids.length, 2);
  assert.deepEqual([...split.snapshot.source_only_claim_ids].sort(), broad.claim_ids.slice(2).sort());
  const coverage = [...split.snapshot.pages.flatMap((page) => page.claim_ids), ...split.snapshot.source_only_claim_ids];
  assert.equal(coverage.length, 4);
  assert.equal(new Set(coverage).size, 4);
});

test("page split rejects omitted and duplicated original claims", () => {
  const state = reviewApi.createPagePlanReviewState({ plan: plan() });
  const snapshot = state.getSnapshot();
  const broad = snapshot.pages[0];
  const result = state.dispatch({
    action: "split_page",
    page_id: broad.page_id,
    parts: [{
      title: "잘못된 분할",
      purpose: "하나의 claim만 중복한다.",
      claim_ids: [broad.claim_ids[0], broad.claim_ids[0]],
      evidence_count: 1,
    }],
    source_only_claim_ids: [],
    expected_plan_hash: snapshot.plan_hash,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_page_split_coverage");
  assert.equal(state.getSnapshot().plan_hash, snapshot.plan_hash);
});

test("source guide verification questions revise the plan without changing claim coverage", () => {
  const state = reviewApi.createPagePlanReviewState({ plan: plan() });
  const snapshot = state.getSnapshot();
  const result = state.dispatch({
    action: "update_source_guide_questions",
    key_questions: ["대출·세무·인허가 조건은 현재 기준으로 유효한가?"],
    expected_plan_hash: snapshot.plan_hash,
  });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.snapshot.source_guide.key_questions, ["대출·세무·인허가 조건은 현재 기준으로 유효한가?"]);
  assert.deepEqual(
    result.snapshot.source_guide.sections.flatMap((section) => section.claim_ids),
    snapshot.source_guide.sections.flatMap((section) => section.claim_ids),
  );
});
