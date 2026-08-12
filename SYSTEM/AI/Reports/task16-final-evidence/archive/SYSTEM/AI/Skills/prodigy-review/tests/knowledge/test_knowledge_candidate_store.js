"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const store = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));

function candidate(overrides) {
  return {
    type: "knowledge_candidate", candidate_id: "candidate-retry-safe", status: "saved",
    title: "반복 회상", statement: "읽은 뒤 회상하면 이해가 오래 유지된다.", reason: "직접 기록한 학습 경험이다.",
    source_type: "daily_evidence", source_evidence_ids: ["daily-01"], source_objects: ["[[DAILY/2026-07-20]]"],
    confidence: "explicit", suggested_domain: "reading", suggested_topics: [], approval_note: "사람이 검토했다.",
    promotion_target: "", promoted_knowledge: "", created: "2026-07-20T10:00:00Z", updated: "2026-07-20T10:00:00Z", ...overrides
  };
}

function authoredCandidate(overrides) {
  return candidate({
    candidate_id: "candidate-authored-manual", title: "직접 학습한 회상", statement: "먼저 회상하고 근거를 확인한다.",
    reason: "개인 설계 검토에서 반복해 확인했다.", source_type: "manual_study",
    source_evidence_ids: [], source_objects: [], source_note: "설계 노트 첫 단락\n설계 노트 두 번째 단락",
    application_trigger: "다음 설계 검토", application_contexts: ["reading", "coding/typescript", "reading"],
    connections: ["[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]"],
    invalidation_conditions: ["Region 정책이 바뀌면 다시 확인한다."],
    suggested_domain: "reading", suggested_topics: [], ...overrides,
  });
}

function document(fields, body = "") {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      value.forEach((item) => lines.push(`  - ${JSON.stringify(item)}`));
    } else lines.push(`${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`);
  }
  return `${lines.join("\n")}\n---\n${body}`;
}

function replaceMarkdownBody(content, body) {
  return content.replace(/^(---\n[\s\S]*?\n---\n)[\s\S]*$/, `$1${body}`);
}

function makeVault() {
  const files = new Map();
  const writes = [];
  const failures = new Map();
  const file = (entryPath) => ({ path: entryPath, name: entryPath.split("/").pop(), basename: entryPath.split("/").pop().replace(/\.md$/, ""), extension: "md" });
  const app = {
    vault: {
      getAbstractFileByPath(entryPath) {
        if (files.has(entryPath)) return file(entryPath);
        const children = [...files.keys()].filter((value) => value.startsWith(`${entryPath}/`) && !value.slice(entryPath.length + 1).includes("/")).map(file);
        return children.length ? { path: entryPath, children } : null;
      },
      async read(entry) { return files.get(entry.path); },
      async createFolder() {},
      async create(entryPath, content) {
        const failure = failures.get(`create:${entryPath}`);
        if (failure) throw failure;
        if (files.has(entryPath)) throw new Error("already exists");
        files.set(entryPath, content); writes.push({ kind: "create", path: entryPath, content }); return file(entryPath);
      },
      async modify(entry, content) {
        const failure = failures.get(`modify:${entry.path}`);
        if (failure) throw failure;
        files.set(entry.path, content); writes.push({ kind: "modify", path: entry.path, content });
      }
    }
  };
  return { app, files, writes, failures, put(entryPath, content) { files.set(entryPath, content); }, count(prefix) { return [...files.keys()].filter((value) => value.startsWith(prefix)).length; } };
}

async function createSaved(fixture, extra) {
  return store.saveCandidate(fixture.app, candidate(extra), { now: "2026-07-20T11:00:00Z" });
}

async function testCanonicalWriteAndLegacyReadsStayReadOnly() {
  const fixture = makeVault();
  const saved = await createSaved(fixture, { extra_legacy_field: "must not be serialized" });
  const retry = await createSaved(fixture);
  assert.equal(retry.path, saved.path, "stable candidate IDs make a repeated save idempotent");
  assert.equal(fixture.count("PARA/RESOURCES/Knowledge/Candidates/"), 1);
  const oldReading = { candidate_id: "legacy-old", status: "proposed", title: "기존 독서 후보", statement: "기존 독서 기록", source_session: "[[Reading/old]]", source_book: "old book", created: "2026-07-19", updated: "2026-07-19" };
  const oldFleeting = { type: "knowledge_candidate", status: "saved", title: "이전 후보", statement: "이전 기록", source_session: "[[Reading/older]]", source_book: "older book", created: "2026-07-18", updated: "2026-07-18" };
  fixture.put("PARA/RESOURCES/Reading/Candidates/old.md", document({ ...oldReading, legacy_flag: "keep" }));
  fixture.put("ZETA/FLEETING/Knowledge Candidates/older.md", document({ ...oldFleeting, source_book: "old book" }));
  const before = [...fixture.writes];

  const listed = await store.listCandidates(fixture.app, { status: "all" });

  assert.equal(saved.path, "PARA/RESOURCES/Knowledge/Candidates/반복 회상.md");
  assert.equal(fixture.count("PARA/RESOURCES/Knowledge/Candidates/"), 1);
  assert.deepEqual(listed.map((value) => value.path).sort(), [saved.path, "PARA/RESOURCES/Reading/Candidates/old.md", "ZETA/FLEETING/Knowledge Candidates/older.md"].sort());
  assert.equal(listed.find((value) => value.path.endsWith("old.md")).legacy_flag, "keep");
  assert.equal(listed.find((value) => value.path.endsWith("older.md")).source_book, "old book");
  assert.deepEqual(fixture.writes, before);
  await assert.rejects(() => store.rejectCandidate(fixture.app, "PARA/RESOURCES/Reading/Candidates/old.md"), /읽기 전용/);
  assert.equal(fixture.files.get("PARA/RESOURCES/Reading/Candidates/old.md"), document({ ...oldReading, legacy_flag: "keep" }));
}

async function testPromotionIsTwoPhaseAndIdempotent() {
  const fixture = makeVault();
  const saved = await createSaved(fixture);
  const result = await store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "반복 회상은 이해를 오래 유지한다.", knowledge_domain: "coding", knowledge_topics: ["ai"], approval_note: "승인" }, { now: "2026-07-20T12:00:00Z" });
  const knowledgePath = "ZETA/PERMANENT/회상 학습.md";
  const candidateBody = store.parseFrontmatter(fixture.files.get(saved.path)).body;
  const expectedKnowledge = [
    "---", "type: knowledge", "title: \"회상 학습\"", "knowledge_domain: \"coding\"", "knowledge_topics:", "  - \"ai\"",
    "application_trigger: \"\"", "application_contexts: []", "statement: \"반복 회상은 이해를 오래 유지한다.\"", "connections:",
    "  - \"[[PARA/RESOURCES/Knowledge/Candidates/반복 회상]]\"", "invalidation_conditions: []", "summary: \"\"",
    "created: \"2026-07-20T12:00:00Z\"", "updated: \"2026-07-20T12:00:00Z\"", "---", candidateBody,
  ].join("\n");
  assert.equal(fixture.files.get(knowledgePath), expectedKnowledge);
  const approvedKnowledge = `${fixture.files.get(knowledgePath)}\n## 승격 후 메모\n\n사람이 Knowledge에서 직접 보완한 메모입니다.\n`;
  await fixture.app.vault.modify(fixture.app.vault.getAbstractFileByPath(knowledgePath), approvedKnowledge);
  const retried = await store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "반복 회상은 이해를 오래 유지한다.", knowledge_domain: "coding", knowledge_topics: ["ai"], approval_note: "승인" }, { now: "2026-07-20T12:01:00Z" });

  assert.equal(result.candidate.status, "approved");
  assert.equal(result.candidate.promotion_target, knowledgePath);
  assert.equal(result.candidate.promoted_knowledge, "[[ZETA/PERMANENT/회상 학습]]");
  assert.equal(retried.path, knowledgePath);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 1);
  assert.equal(fixture.files.get(knowledgePath), approvedKnowledge);
}

async function testFailuresRetryWithoutAdoptingForeignKnowledge() {
  const fixture = makeVault();
  const saved = await createSaved(fixture);
  const target = "ZETA/PERMANENT/회상 학습.md";
  fixture.failures.set(`create:${target}`, new Error("injected create failure"));
  await assert.rejects(() => store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] }), /injected create failure/);
  assert.equal((await store.readCandidate(fixture.app, saved.path)).status, "saved");
  assert.equal((await store.readCandidate(fixture.app, saved.path)).promotion_target, target);

  fixture.failures.delete(`create:${target}`);
  fixture.failures.set(`modify:${saved.path}`, new Error("injected finalization failure"));
  await assert.rejects(() => store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] }), /injected finalization failure/);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 1);
  fixture.failures.delete(`modify:${saved.path}`);
  await store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] });
  assert.equal(fixture.count("ZETA/PERMANENT/"), 1);

  const other = await createSaved(fixture, { candidate_id: "candidate-other", title: "다른 후보" });
  fixture.put("ZETA/PERMANENT/충돌.md", document({ type: "knowledge", title: "충돌", statement: "남의 지식", knowledge_domain: "reading", knowledge_topics: [], connections: ["[[PARA/RESOURCES/Knowledge/Candidates/반복 회상]]"], created: "x", updated: "x" }));
  fixture.files.set(other.path, fixture.files.get(other.path).replace(/^promotion_target: ""$/m, "promotion_target: \"ZETA/PERMANENT/충돌.md\""));
  await assert.rejects(() => store.approveCandidate(fixture.app, other.path, { title: "충돌", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] }), /다른 Candidate/);

  const collision = await createSaved(fixture, { candidate_id: "candidate-collision", title: "충돌 후보" });
  const collisionResult = await store.approveCandidate(fixture.app, collision.path, { title: "충돌", statement: "다른 문장", knowledge_domain: "coding", knowledge_topics: ["ai"] });
  assert.equal(collisionResult.path, "ZETA/PERMANENT/충돌 2.md");
}

async function testRejectedAndThinGuardDoNotWriteKnowledge() {
  const fixture = makeVault();
  const missingTopic = await createSaved(fixture, { candidate_id: "candidate-missing-topic", title: "토픽 필수 후보" });
  await assert.rejects(() => store.approveCandidate(fixture.app, missingTopic.path, { title: "토픽 필수 지식", statement: "문장", knowledge_domain: "coding", knowledge_topics: [] }), /Topics/);
  assert.equal((await store.readCandidate(fixture.app, missingTopic.path)).promotion_target, "");
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);

  const saved = await createSaved(fixture);
  await store.rejectCandidate(fixture.app, saved.path, { now: "2026-07-20T13:00:00Z" });
  await assert.rejects(() => store.approveCandidate(fixture.app, saved.path, { title: "불가", statement: "문장", knowledge_domain: "reading", knowledge_topics: [] }), /rejected.*terminal/i);
  const thin = await createSaved(fixture, { candidate_id: "candidate-thin", title: "얇은 후보" });
  const quality = { status: "thin" };
  await assert.rejects(() => store.approveCandidate(fixture.app, thin.path, { title: "얇은 지식", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"], evidence_quality: quality, thin_override: false, approval_note: "" }), /override|approval note/i);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
}

async function testAuthoredCandidateRoundTripsAndHumanApprovalPromotesOnce() {
  // Given: a direct-study Candidate with rich authored text, valid application metadata, and no Object/Evidence link.
  const fixture = makeVault();
  const saved = await store.saveCandidate(fixture.app, authoredCandidate(), { now: "2026-07-21T11:00:00Z" });
  const beforeApproval = fixture.files.get(saved.path);

  // When: it is saved, before any explicit human approval call.
  const read = await store.readCandidate(fixture.app, saved.path);

  // Then: it remains saved, its fields round-trip, and rich text lives in Markdown sections rather than multiline YAML.
  assert.equal(read.status, "saved");
  assert.deepEqual(read.source_evidence_ids, []);
  assert.deepEqual(read.source_objects, []);
  assert.equal(read.source_note, "설계 노트 첫 단락\n설계 노트 두 번째 단락");
  assert.equal(read.application_trigger, "다음 설계 검토");
  assert.deepEqual(read.application_contexts, ["reading", "coding/typescript"]);
  assert.deepEqual(read.connections, ["[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]"]);
  assert.deepEqual(read.invalidation_conditions, ["Region 정책이 바뀌면 다시 확인한다."]);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
  assert.match(beforeApproval, /## 지식 문장\n\n먼저 회상하고 근거를 확인한다\./);
  assert.match(beforeApproval, /## 제안 이유\n\n개인 설계 검토에서 반복해 확인했다\./);
  assert.match(beforeApproval, /## 출처 메모\n\n설계 노트 첫 단락\n설계 노트 두 번째 단락/);
  assert.match(beforeApproval, /## 적용 조건\n\n다음 설계 검토/);
  assert.doesNotMatch(beforeApproval, /^source_note: \|/m);

  // When: a human explicitly approves the topicless Domain Candidate, then retries after finalization is interrupted.
  const request = {
    title: "직접 학습한 회상", statement: "먼저 회상하고 근거를 확인한다.", knowledge_domain: "reading", knowledge_topics: [],
    approval_note: "사람이 검토했다.", application_trigger: "승인 요청으로 덮어쓰기", application_contexts: ["coding/typescript"],
  };
  const knowledgePath = "ZETA/PERMANENT/직접 학습한 회상.md";
  fixture.failures.set(`modify:${saved.path}`, new Error("injected finalization failure"));
  await assert.rejects(() => store.approveCandidate(fixture.app, saved.path, request, { now: "2026-07-21T12:00:00Z" }), /injected finalization failure/);
  fixture.failures.delete(`modify:${saved.path}`);
  const retried = await store.approveCandidate(fixture.app, saved.path, request, { now: "2026-07-21T12:01:00Z" });

  // Then: exactly one canonical Knowledge exists and it keeps the authored body and application metadata unchanged.
  const knowledge = fixture.files.get(knowledgePath);
  assert.equal(retried.candidate.status, "approved");
  assert.equal(fixture.count("ZETA/PERMANENT/"), 1);
  assert.match(knowledge, /^application_trigger: "다음 설계 검토"$/m);
  assert.match(knowledge, /^application_contexts:\n  - "reading"\n  - "coding\/typescript"$/m);
  assert.deepEqual(store.parseFrontmatter(knowledge).data.connections, [
    "[[PARA/RESOURCES/Knowledge/Candidates/직접 학습한 회상]]",
    "[[PARA/RESOURCES/Auction Regions/서울특별시-중구]]",
  ]);
  assert.deepEqual(store.parseFrontmatter(knowledge).data.invalidation_conditions, ["Region 정책이 바뀌면 다시 확인한다."]);
  assert.match(knowledge, /## 출처 메모\n\n설계 노트 첫 단락\n설계 노트 두 번째 단락/);
  assert.match(knowledge, /## 적용 조건\n\n다음 설계 검토/);
}

async function testPromotionUsesCurrentPersistedCandidateBodyAcrossRetry() {
  // Given: a saved Candidate whose user-authored Markdown has been edited through the Vault.
  const fixture = makeVault();
  const saved = await store.saveCandidate(fixture.app, authoredCandidate(), { now: "2026-07-21T13:00:00Z" });
  const knowledgePath = "ZETA/PERMANENT/직접 학습한 회상.md";
  const firstEditedBody = "# 직접 학습한 회상\n\n## 지식 문장\n\n인박스에서 처음 고친 지식 문장입니다.\n\n## 제안 이유\n\n첫 번째 편집 이유입니다.\n\n## 출처 메모\n\n첫 번째 출처 메모입니다.\n\n## 적용 조건\n\n첫 번째 적용 조건입니다.\n\n- reading\n\n## 승인 메모\n\n첫 번째 승인 메모입니다.\n";
  await fixture.app.vault.modify(fixture.app.vault.getAbstractFileByPath(saved.path), replaceMarkdownBody(fixture.files.get(saved.path), firstEditedBody).replace(/^promotion_target: ""$/m, `promotion_target: "${knowledgePath}"`));
  assert.equal((await store.readCandidate(fixture.app, saved.path)).body, firstEditedBody);

  const request = {
    title: "직접 학습한 회상", statement: "먼저 회상하고 근거를 확인한다.", knowledge_domain: "reading", knowledge_topics: [], approval_note: "사람이 검토했다."
  };
  fixture.failures.set(`modify:${saved.path}`, new Error("injected finalization failure"));

  // When: the first explicit approval is interrupted after Knowledge creation, then the Candidate body is edited and approval retries.
  await assert.rejects(() => store.approveCandidate(fixture.app, saved.path, request, { now: "2026-07-21T13:01:00Z" }), /injected finalization failure/);
  assert.equal(store.parseFrontmatter(fixture.files.get(knowledgePath)).body, firstEditedBody);
  const retryEditedBody = "# 직접 학습한 회상\n\n## 지식 문장\n\n인박스에서 재시도 전에 고친 최종 지식 문장입니다.\n\n## 제안 이유\n\n최종 편집 이유입니다.\n\n## 출처 메모\n\n최종 출처 메모입니다.\n\n---\ntype: injected\napplication_trigger: injected\n---\n\n## 적용 조건\n\n최종 적용 조건입니다.\n\n- reading\n- coding/typescript\n\n## 승인 메모\n\n최종 승인 메모입니다.\n";
  fixture.failures.delete(`modify:${saved.path}`);
  await fixture.app.vault.modify(fixture.app.vault.getAbstractFileByPath(saved.path), replaceMarkdownBody(fixture.files.get(saved.path), retryEditedBody));
  await store.approveCandidate(fixture.app, saved.path, request, { now: "2026-07-21T13:02:00Z" });

  // Then: the one actual Knowledge file contains the exact current Markdown body once, with source/application metadata intact and no YAML injection or stale body.
  const knowledge = fixture.files.get(knowledgePath);
  const parsed = store.parseFrontmatter(knowledge);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 1);
  assert.equal(parsed.body, retryEditedBody);
  assert.equal(parsed.data.type, "knowledge");
  assert.equal(parsed.data.application_trigger, "다음 설계 검토");
  assert.deepEqual(parsed.data.application_contexts, ["reading", "coding/typescript"]);
  assert.equal(parsed.data.injected, undefined);
  assert.equal((knowledge.match(/## 출처 메모/g) || []).length, 1);
  assert.equal((knowledge.match(/## 적용 조건/g) || []).length, 1);
  assert.equal((knowledge.match(/## 승인 메모/g) || []).length, 1);
  assert.match(knowledge, /인박스에서 재시도 전에 고친 최종 지식 문장입니다\./);
  assert.doesNotMatch(knowledge, /인박스에서 처음 고친 지식 문장입니다\./);
}

async function testAuthoredSourceBoundariesRejectWithoutWrites() {
  // Given: invalid authored source and application context inputs.
  const fixture = makeVault();
  const before = [...fixture.writes];

  // When/Then: they reject before Candidate or Knowledge writes, while a canonical study source persists exactly.
  await assert.rejects(() => store.saveCandidate(fixture.app, authoredCandidate({ source_type: "study_material", source_objects: ["[[PARA/RESOURCES/not-literature]]"] })), /학습 자료 출처를 하나만 선택/);
  await assert.rejects(() => store.saveCandidate(fixture.app, authoredCandidate({ application_contexts: ["reading/not_registered"] })), /유효하지 않은 적용 맥락/);
  assert.deepEqual(fixture.writes, before);
  const material = await store.saveCandidate(fixture.app, authoredCandidate({ source_type: "study_material", source_objects: ["[[ZETA/LITERATURE/공식 문서]]"] }));
  assert.deepEqual((await store.readCandidate(fixture.app, material.path)).source_objects, ["[[ZETA/LITERATURE/공식 문서]]"]);
}

async function testDeferAndResumePersistRemediationStatus() {
  // Given: a saved canonical candidate.
  const fixture = makeVault();
  const saved = await createSaved(fixture);

  // When: a reviewer defers it for more evidence.
  const deferred = await store.deferCandidate(fixture.app, saved.path, { now: "2026-07-20T14:00:00Z" });

  // Then: the persisted status flips and the candidate stays in the active inbox.
  assert.equal(deferred.status, "needs_more_evidence");
  assert.equal((await store.readCandidate(fixture.app, saved.path)).status, "needs_more_evidence");
  const active = await store.listCandidates(fixture.app, { status: "active" });
  assert.ok(active.some((item) => item.path === saved.path), "deferred candidate remains active/readable");

  // When: the reviewer resumes review.
  const resumed = await store.resumeCandidate(fixture.app, saved.path, { now: "2026-07-20T14:30:00Z" });

  // Then: it returns to saved and the persisted file follows.
  assert.equal(resumed.status, "saved");
  assert.equal((await store.readCandidate(fixture.app, saved.path)).status, "saved");

  // And: approval is blocked while deferred, writing no Knowledge.
  await store.deferCandidate(fixture.app, saved.path, { now: "2026-07-20T15:00:00Z" });
  await assert.rejects(
    () => store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] }),
    /needs_more_evidence/
  );
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
}

async function testMalformedCandidateFrontmatterRejectsBeforePromotionWrites() {
  // Given: an otherwise saved Candidate whose persisted frontmatter has become malformed.
  const fixture = makeVault();
  const saved = await createSaved(fixture);
  await fixture.app.vault.modify(fixture.app.vault.getAbstractFileByPath(saved.path), "# malformed Candidate without frontmatter\n");
  const before = [...fixture.writes];

  // When/Then: approval rejects at the parsing boundary and creates no Knowledge or retry state.
  await assert.rejects(() => store.approveCandidate(fixture.app, saved.path, { title: "회상 학습", statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"] }), /frontmatter/);
  assert.deepEqual(fixture.writes, before);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
}

async function testForgedPromotionTargetsRejectBeforeWrites() {
  // Given: persisted Candidates whose promotion target was forged outside the canonical direct-child boundary.
  const targets = [
    "PARA/RESOURCES/Knowledge/forbidden.md",
    "PARA/RESOURCES/Knowledge/Candidates/forbidden.md",
    "<task-temp>/forbidden.md",
    "ZETA/PERMANENT/../forbidden.md",
    "ZETA/PERMANENT/nested/forbidden.md",
  ];

  for (const [index, target] of targets.entries()) {
    const fixture = makeVault();
    const saved = await createSaved(fixture, { candidate_id: `candidate-forged-target-${index}`, title: `위조 대상 ${index}` });
    fixture.files.set(saved.path, fixture.files.get(saved.path).replace(/^promotion_target: ""$/m, `promotion_target: ${JSON.stringify(target)}`));
    const before = [...fixture.writes];

    // When: human promotion reads the forged persisted target.
    const action = () => store.approveCandidate(fixture.app, saved.path, {
      title: `위조 대상 ${index}`, statement: "문장", knowledge_domain: "coding", knowledge_topics: ["ai"],
    });

    // Then: the canonical target guard rejects before Candidate or Knowledge writes.
    await assert.rejects(action, /canonical_target_required|canonical Knowledge path/, target);
    assert.deepEqual(fixture.writes, before, target);
    assert.equal(fixture.files.has(target), false, target);
  }
}

async function main() {
  await testCanonicalWriteAndLegacyReadsStayReadOnly();
  await testPromotionIsTwoPhaseAndIdempotent();
  await testFailuresRetryWithoutAdoptingForeignKnowledge();
  await testRejectedAndThinGuardDoNotWriteKnowledge();
  await testAuthoredCandidateRoundTripsAndHumanApprovalPromotesOnce();
  await testPromotionUsesCurrentPersistedCandidateBodyAcrossRetry();
  await testAuthoredSourceBoundariesRejectWithoutWrites();
  await testMalformedCandidateFrontmatterRejectsBeforePromotionWrites();
  await testForgedPromotionTargetsRejectBeforeWrites();
  await testDeferAndResumePersistRemediationStatus();
  console.log("Knowledge candidate store tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
