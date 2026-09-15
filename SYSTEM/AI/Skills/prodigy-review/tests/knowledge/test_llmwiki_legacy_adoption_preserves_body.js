"use strict";
// 레거시 채택은 "기존 문서에 내용 추가"다: 원문 본문은 한 줄도 사라지면 안 된다.
// 라이브 볼트 상태에 의존하지 않도록 합성 픽스처만 사용한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fx = require("./fixtures/llmwiki_review_fixtures.js");
const { makeItem, openReview, store, LEGACY_PATH, LEGACY_BYTES, LEGACY_REVISION, LEGACY_TITLE, REVIEW_FIELDS } = require("./fixtures/llmwiki_review_fixtures.js");

async function prepareAdoption(item = makeItem()) {
  const harness = await openReview({ item });
  const result = await harness.flow.prepare({ item: harness.item, fields: REVIEW_FIELDS, target_path: LEGACY_PATH, target_revision: LEGACY_REVISION });
  assert.equal(result.ok, true, `prepare must succeed on a legacy target: ${JSON.stringify({ reason: result.reason, gaps: (result.promotion_gaps || []).map((gap) => gap.reason_code) })}`);
  return { after: String(result.value.after), harness };
}

test("레거시 채택은 원문 본문을 줄이지 않고 새 지식을 덧붙인다", async () => {
  const { after } = await prepareAdoption();
  const dropped = LEGACY_BYTES.split("---").pop().split("\n").map((line) => line.trimEnd()).filter((line) => line.trim()).filter((line) => !after.includes(line));
  assert.deepEqual(dropped, [], `원문에서 사라진 줄: ${JSON.stringify(dropped)}`);
  assert.ok(after.includes(`# ${LEGACY_TITLE}`), "원문 H1이 유지돼야 한다");
  assert.ok(after.includes("## 합성 절"), "새 지식이 추가돼야 한다");
  assert.ok(after.indexOf("## 기존 체크리스트") < after.indexOf("## 합성 절"), "새 절은 기존 절 뒤에 붙어야 한다");
});

test("레거시 채택은 원문 frontmatter의 저자 값을 버리지 않는다", async () => {
  const { after } = await prepareAdoption();
  const contexts = [].concat(store.parseFrontmatter(after).data.application_contexts || []);
  assert.ok(contexts.includes("합성 작업"), `원문 사용 맥락이 사라졌다: ${JSON.stringify(contexts)}`);
});

test("갱신은 이전 메타데이터와 검토 범위를 덮어쓰지 않고 합친다", async () => {
  // 픽스처 원문에는 이미 knowledge_topics(\"editing\")/application_contexts(\"합성 작업\")이 있다.
  const harness = await fx.openReview({ item: fx.makeItem({ reviewId: "plan_compiled_synthetic_union" }) });
  const prepared = await harness.flow.prepare({ item: harness.item, fields: { ...fx.REVIEW_FIELDS, knowledge_topics: "lighting", application_contexts: "두 번째 작업", conditions: "새 조건 시" },
    target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const after = String(prepared.value.after);
  for (const topic of ["editing", "lighting"]) assert.ok(after.includes(`"${topic}"`), `topic 유지 실패: ${topic}`);
  for (const context of ["합성 작업", "두 번째 작업"]) assert.ok(after.includes(context), `context 유지 실패: ${context}`);
  assert.ok(after.includes("새 조건 시"), "새 검토 조건이 없다");
  assert.ok(after.includes("규격이 바뀌는 경우"), "원문의 재검토 조건이 사라졌다");
});

test("인용 locator는 Obsidian이 여는 헤딩 앵커로 렌더된다", async () => {
  const harness = await fx.openReview({ item: fx.makeItem({ reviewId: "plan_compiled_synthetic_anchor" }) });
  const prepared = await harness.flow.prepare({ item: harness.item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const after = String(prepared.value.after);
  assert.ok(after.includes("#합성%20촬영%20기준"), `헤딩 앵커가 없다: ${after.slice(0, 400)}`);
  assert.equal(after.includes("#L3"), false, "라인 범위 locator가 그대로 남았다");
});

test("바이트 locator는 줄 번호로 오해하지 않는다(잘못된 헤딩 금지)", async () => {
  // 픽스처의 metadataCache 헤딩에는 바이트 오프셋이 없다 → 확실한 위치를 알 수 없다.
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_byte" });
  item.grounded_claims = item.grounded_claims.map((claim, index) => ({
    ...claim,
    citations: claim.citations.map((citation) => ({ ...citation, locator: `${citation.source_path}#${index === 0 ? "40-80" : "4000-4100"}` })),
  }));
  const harness = await fx.openReview({ item });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const after = String(prepared.value.after);
  assert.equal(after.includes("#4000-4100"), false, "바이트 locator가 목적지에 그대로 남았다");
  assert.equal(/#L?40\b/u.test(after), false, "바이트 locator가 줄 번호로 매핑됐다");
  assert.ok(after.includes("synthetic%20fixture%20source.md"), "파일 링크는 남아야 한다");
});

test("숫자 fragment 뒤에 샌 encoded 링크 꼬리는 파일 링크로 정리한다", async () => {
  const malformedBody = fx.LEGACY_BYTES.replace(
    "- 기존 체크 항목 하나",
    "- 기존 체크 항목 하나 [원문](INBOX/synthetic%20fixture%20source.md#1)%20broken%20heading))",
  );
  const malformed = `${malformedBody}## 사용자 검토 범위
- 적용 조건: 잘린 기존 조건

## 출처
- [source_synthetic_fixture](INBOX/synthetic%20fixture%20source.md#1)%20broken%20heading))
`;
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_malformed_link" });
  const harness = await fx.openReview({ item, targetBytes: malformed });
  const prepared = await harness.flow.prepare({
    item,
    fields: fx.REVIEW_FIELDS,
    target_path: fx.LEGACY_PATH,
    target_revision: fx.hash.sha256(malformed),
  });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const after = String(prepared.value.after);
  assert.ok(after.includes("[원문](INBOX/synthetic%2520fixture%2520source.md)") || after.includes("[원문](INBOX/synthetic%20fixture%20source.md)"), "파일 링크 폴백은 남아야 한다");
  assert.equal(after.includes("%20broken%20heading"), false, "깨진 링크의 encoded 꼬리가 본문에 남았다");
  const scope = after.split("## 사용자 검토 범위")[1].split("\n## ")[0];
  assert.equal(scope.includes("source_synthetic_fixture"), false, "출처 링크가 검토 범위 안으로 섞였다");
  assert.equal(scope.includes("잘린 기존 조건"), false, "새 적용 조건이 있으면 잘린 기존 적용 조건은 보존하지 않는다");
});

test("쓰기 시점: 대상 본문에 이미 있는 주장은 다시 붙이지 않는다", async () => {
  // 레거시 대상 본문에는 "혼주 사진은 신랑측을 먼저 둔다."가 이미 있다.
  const covered = "혼주 사진은 신랑측을 먼저 둔다.";
  const fresh = "앨범 편집 순서는 촬영 순서와 다르게 조정할 수 있다.";
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_present" });
  item.document_body = `# 합성 중복 방지\n\n${covered}\n\n${fresh}\n`;
  item.compiled_sections = [{ heading: "합성 절", paragraphs: [{ text: covered, claim_ids: ["c1"] }, { text: fresh, claim_ids: ["c2"] }] }];
  item.grounded_claims = [
    { ...item.grounded_claims[0], claim_id: "c1", text: covered },
    { ...item.grounded_claims[1], claim_id: "c2", text: fresh },
  ];
  const harness = await fx.openReview({ item });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const after = String(prepared.value.after);
  const body = after.split(/^---$/mu).slice(2).join("---");
  assert.ok(body.includes(fresh), "새 주장은 추가돼야 한다");
  const occurrences = body.split(covered).length - 1;
  assert.ok(occurrences <= 1, `이미 있던 주장이 본문에 다시 붙었다(등장 ${occurrences}회)`);
});

test("쓰기 시점: statement의 중복 문장은 접힌다", async () => {
  const long = "이 문장은 전세보증보험과 무관한 장문의 대조군이며 촬영 장비의 배터리와 메모리카드, 조명 상태를 작업 시작 전에 모두 확인하는 독립적인 절차를 설명한다.";
  const a = "전세보증보험 가입을 위해 전세가는 공동주택공시가격의 126% 이내여야 한다.";
  const b = "전세보증보험 가입을 위한 전세 세팅 기준은 공동주택공시가격의 126% 이내이다.";
  const unique = "갭이 적어도 만기 재세팅 때 갭이 커질 수 있다.";
  const item = fx.makeItem({ reviewId: "plan_compiled_synthetic_stmt" });
  item.grounded_claims = [
    { ...item.grounded_claims[0], claim_id: "s0", text: long },
    { ...item.grounded_claims[0], claim_id: "s1", text: a },
    { ...item.grounded_claims[1], claim_id: "s2", text: b },
    { ...item.grounded_claims[0], claim_id: "s3", text: unique },
  ];
  const harness = await fx.openReview({ item });
  const prepared = await harness.flow.prepare({ item, fields: fx.REVIEW_FIELDS, target_path: fx.LEGACY_PATH, target_revision: fx.LEGACY_REVISION });
  assert.equal(prepared.ok, true, `prepare: ${prepared.reason || ""}`);
  const statement = /^statement:\s*"(.*)"$/mu.exec(String(prepared.value.after))?.[1] || "";
  assert.ok(statement.includes("메모리카드"), "가장 긴 독립 문장은 남아야 한다");
  assert.ok(statement.includes("126%"), "대표 문장은 남아야 한다");
  assert.ok(statement.includes("갭"), "고유 문장은 남아야 한다");
  const hasBoth = statement.includes(a) && statement.includes(b);
  assert.equal(hasBoth, false, `중복 문장이 함께 남았다: ${statement.slice(0, 120)}`);
});
