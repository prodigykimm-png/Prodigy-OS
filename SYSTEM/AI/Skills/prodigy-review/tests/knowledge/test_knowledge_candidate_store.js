"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const store = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));

function candidate(overrides = {}) {
  return {
    type: "knowledge_candidate", candidate_id: "candidate-handoff-alpha", status: "saved",
    title: "회상 검토", statement: "반복 회상은 이해를 오래 유지한다.", reason: "직접 기록한 학습 경험이다.",
    source_type: "daily_evidence", source_evidence_ids: ["daily-01"], source_objects: ["[[DAILY/2026-08-25]]"],
    confidence: "explicit", suggested_domain: "coding", suggested_topics: ["ai"], approval_note: "",
    promotion_target: "", promoted_knowledge: "", created: "2026-08-25T10:00:00.000Z", updated: "2026-08-25T10:00:00.000Z", ...overrides
  };
}

function document(fields, body = "") {
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value)}`).join("\n")}\n---\n${body}`;
}

function setFrontmatterValue(content, key, value) {
  const line = `${key}: ${JSON.stringify(value)}`;
  return new RegExp(`^${key}:.*$`, "m").test(content)
    ? content.replace(new RegExp(`^${key}:.*$`, "m"), line)
    : content.replace("\n---\n", `\n${line}\n---\n`);
}

function makeVault() {
  const files = new Map();
  const writes = [];
  const file = (entryPath) => ({ path: entryPath, name: entryPath.split("/").pop(), basename: entryPath.split("/").pop().replace(/\.md$/, ""), extension: "md" });
  const app = { vault: {
    getAbstractFileByPath(entryPath) {
      if (files.has(entryPath)) return file(entryPath);
      const children = [...files.keys()].filter((value) => value.startsWith(`${entryPath}/`) && !value.slice(entryPath.length + 1).includes("/")).map(file);
      return children.length ? { path: entryPath, children } : null;
    },
    async read(entry) { return files.get(entry.path); },
    async createFolder() {},
    async create(entryPath, content) {
      if (files.has(entryPath)) throw new Error("already exists");
      files.set(entryPath, content); writes.push({ kind: "create", path: entryPath, content }); return file(entryPath);
    },
    async modify(entry, content) { files.set(entry.path, content); writes.push({ kind: "modify", path: entry.path, content }); }
  } };
  return { app, files, writes, put(entryPath, content) { files.set(entryPath, content); }, count(prefix) { return [...files.keys()].filter((value) => value.startsWith(prefix)).length; } };
}

async function save(fixture, extra) {
  return store.saveCandidate(fixture.app, candidate(extra), { now: "2026-08-25T11:00:00.000Z" });
}

async function testNewRootIdempotencyAndLegacyReadOnly() {
  const fixture = makeVault();
  const saved = await save(fixture);
  const replay = await save(fixture);
  const legacyPath = "PARA/RESOURCES/Reading/Candidates/legacy.md";
  const legacy = {
    candidate_id: saved.candidate_id, status: "proposed", title: "기존 후보", statement: "기존 기록", reason: "기존 이유",
    source_session: "[[Reading/old]]", source_book: "old", created: "2026-08-24", updated: "2026-08-24"
  };
  fixture.put(legacyPath, document(legacy, "# 기존 후보\n"));
  const before = [...fixture.writes];

  const listed = await store.listCandidates(fixture.app, { status: "all" });

  assert.equal(saved.path, "ZETA/CANDIDATES/회상 검토.md");
  assert.equal(replay.path, saved.path, "new-root Candidate IDs remain idempotent");
  assert.equal(fixture.count("ZETA/CANDIDATES/"), 1);
  assert.deepEqual(listed.map((item) => item.path), [saved.path], "new-root Candidate wins legacy duplicate IDs");
  assert.deepEqual(fixture.writes, before, "legacy reads do not mutate bytes");
  await assert.rejects(() => store.approveCandidate(fixture.app, legacyPath), /legacy_read_only/);
  assert.equal(fixture.files.get(legacyPath), document(legacy, "# 기존 후보\n"));
}

async function testApprovalHandsOffExactlyOnceWithoutCanonicalWrites() {
  const fixture = makeVault();
  const saved = await save(fixture);
  const before = [...fixture.writes];
  const calls = [];
  const forgedRequest = { title: "위조된 정식 제목", statement: "위조된 정식 문장", knowledge_domain: "coding", knowledge_topics: ["ai"], target: "ZETA/PERMANENT/forged.md" };

  const result = await store.approveCandidate(fixture.app, saved.path, forgedRequest, {
    llmWikiHandoff: async (received, packet) => {
      calls.push({ received, packet });
      return { ok: true, status: "review" };
    }
  });

  assert.equal(calls.length, 1, "approval enters the LLM Wiki seam once");
  assert.equal(calls[0].received.candidate_id, saved.candidate_id);
  assert.equal(calls[0].received.title, "회상 검토", "caller-supplied canonical fields are not handoff authority");
  assert.equal(calls[0].packet.candidate_path, saved.path);
  assert.equal(calls[0].packet.candidate_binding.includes("위조된 정식 제목"), false);
  assert.equal(result.handoff, "llmwiki");
  assert.equal(result.reused, false);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0, "Candidate store performs zero canonical writes");
  assert.deepEqual(fixture.writes.slice(0, before.length), before);
  assert.deepEqual(fixture.writes.slice(before.length).map((write) => [write.kind, write.path]), [["modify", saved.path]], "only the Candidate handoff receipt persists");

  let replayCalls = 0;
  const replay = await store.approveCandidate(fixture.app, saved.path, {}, {
    llmWikiHandoff: async () => { replayCalls += 1; return { ok: true, status: "review" }; }
  });
  assert.equal(replay.reused, true, "exactly bound receipt makes approval replay idempotent");
  assert.equal(replayCalls, 0, "replay does not create a second LLM Wiki handoff");
  assert.equal(fixture.writes.length, before.length + 1, "replay does not mutate Candidate or canonical bytes");
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
}

async function testUnavailableStaleAndForgedHandoffsFailBeforeMutation() {
  const fixture = makeVault();
  const unavailable = await save(fixture, { candidate_id: "candidate-unavailable-alpha", title: "연결 없음" });
  const beforeUnavailable = [...fixture.writes];
  await assert.rejects(() => store.approveCandidate(fixture.app, unavailable.path), /llmwiki_handoff_unavailable/);
  assert.deepEqual(fixture.writes, beforeUnavailable);

  const stale = await save(fixture, { candidate_id: "candidate-stale-alpha", title: "오래된 대상" });
  const beforeStale = [...fixture.writes];
  await assert.rejects(() => store.approveCandidate(fixture.app, stale.path, {}, {
    llmWikiHandoff: async () => ({ ok: false, reason: "stale_target" })
  }), /llmwiki_handoff_failed:stale_target/);
  assert.deepEqual(fixture.writes, beforeStale, "stale review start records no mutation");
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);

  const misleading = await save(fixture, { candidate_id: "candidate-misleading-alpha", title: "오도된 성공" });
  const beforeMisleading = [...fixture.writes];
  await assert.rejects(() => store.approveCandidate(fixture.app, misleading.path, {}, {
    llmWikiHandoff: async () => ({ ok: true, status: "committed" })
  }), /llmwiki_handoff_failed:review_unavailable/);
  assert.deepEqual(fixture.writes, beforeMisleading, "a non-review success cannot claim a Candidate handoff");

  const forged = await save(fixture, { candidate_id: "candidate-forged-alpha", title: "위조 영수증" });
  const forgedReceipt = {
    handoff_version: "llmwiki_candidate_review_handoff_v1", candidate_id: forged.candidate_id,
    candidate_path: forged.path, candidate_binding: "forged"
  };
  fixture.files.set(forged.path, setFrontmatterValue(fixture.files.get(forged.path), "review_handoff", forgedReceipt));
  const beforeForged = [...fixture.writes];
  await assert.rejects(() => store.approveCandidate(fixture.app, forged.path, {}, {
    llmWikiHandoff: async () => { throw new Error("must not be called"); }
  }), /invalid_llmwiki_handoff/);
  assert.deepEqual(fixture.writes, beforeForged, "forged receipt is rejected without a retry or write");
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
}

async function testDeferredRejectedAndRetiredCanonicalTargetsCannotHandoff() {
  const fixture = makeVault();
  const deferred = await save(fixture, { candidate_id: "candidate-deferred-alpha", title: "보류 후보" });
  await store.deferCandidate(fixture.app, deferred.path);
  const beforeDeferred = [...fixture.writes];
  await assert.rejects(() => store.approveCandidate(fixture.app, deferred.path, {}, { llmWikiHandoff: async () => ({ ok: true }) }), /candidate_review_unavailable/);
  assert.deepEqual(fixture.writes, beforeDeferred);

  const rejected = await save(fixture, { candidate_id: "candidate-rejected-alpha", title: "반려 후보" });
  await store.rejectCandidate(fixture.app, rejected.path);
  await assert.rejects(() => store.approveCandidate(fixture.app, rejected.path, {}, { llmWikiHandoff: async () => ({ ok: true }) }), /rejected candidates are terminal/);

  const retired = await save(fixture, { candidate_id: "candidate-retired-alpha", title: "이전 정식 대상" });
  fixture.files.set(retired.path, setFrontmatterValue(fixture.files.get(retired.path), "promotion_target", "ZETA/PERMANENT/이전 정식 대상.md"));
  const beforeRetired = [...fixture.writes];
  await assert.rejects(() => store.approveCandidate(fixture.app, retired.path, {}, { llmWikiHandoff: async () => ({ ok: true }) }), /canonical_promotion_ownership_retired/);
  assert.deepEqual(fixture.writes, beforeRetired);
  assert.equal(fixture.count("ZETA/PERMANENT/"), 0);
}

function testCandidateApprovalHasNoCanonicalWriter() {
  const source = require("node:fs").readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"), "utf8");
  const body = source.slice(source.indexOf("async function approveCandidate"), source.indexOf("async function rejectCandidate"));
  assert.doesNotMatch(body, /vault\.(?:create|modify)|ensureFolder|renderCanonicalDocument|finalizePromotion|setPromotionTarget/u);
  assert.match(body, /llmWikiHandoff|reviewPacket/u);
}

async function main() {
  await testNewRootIdempotencyAndLegacyReadOnly();
  await testApprovalHandsOffExactlyOnceWithoutCanonicalWrites();
  await testUnavailableStaleAndForgedHandoffsFailBeforeMutation();
  await testDeferredRejectedAndRetiredCanonicalTargetsCannotHandoff();
  testCandidateApprovalHasNoCanonicalWriter();
  console.log("Knowledge candidate store tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
