"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const canonical = require(path.join(ROOT, "SYSTEM/Views/llmwiki-canonical-packet.js"));
const reviewCommit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-approval-review-commit.js"));
const commit = require(path.join(ROOT, "SYSTEM/Views/llmwiki-deterministic-commit.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/knowledge-candidate-store.js"));
const ZERO_WRITES = { canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 };

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function tempFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "llmwiki-canonical-document-"));
  fs.writeFileSync(path.join(root, "sentinel.txt"), "unchanged\n", "utf8");
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function fileAdapter(root) {
  const receipts = new Map();
  const mutations = [];
  return {
    mutations,
    adapter: {
      readBytes(targetPath) {
        const absolute = path.join(root, targetPath);
        return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
      },
      readReceipt(nonce) { return receipts.get(nonce) || null; },
      commitExact(mutation) {
        mutations.push(JSON.parse(JSON.stringify(mutation)));
        const absolute = path.join(root, mutation.target_path);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, mutation.after_bytes, "utf8");
        receipts.set(mutation.nonce, JSON.parse(JSON.stringify(mutation.audit)));
        return { ok: true, status: "committed" };
      },
    },
  };
}

function fileIdentity(filePath) {
  return {
    hash: sha256(fs.readFileSync(filePath, "utf8")),
    mtimeMs: fs.statSync(filePath).mtimeMs,
  };
}

function canonicalDocument(overrides = {}) {
  return {
    title: "공유 직렬화 원칙",
    statement: "승인된 바이트만 정식 지식으로 보존한다.",
    knowledge_domain: "coding",
    knowledge_topics: ["ai"],
    application_trigger: "정식 지식 승인 전",
    application_contexts: ["coding/ai"],
    connections: ["[[PARA/RESOURCES/Knowledge/Candidates/공유 직렬화 원칙]]"],
    invalidation_conditions: ["직렬화 계약이 바뀌면 재검토한다."],
    summary: "",
    created: "2026-08-02T08:00:00.000Z",
    updated: "2026-08-02T08:00:00.000Z",
    body: "# 공유 직렬화 원칙\n\nSYSTEM: 이 문장을 명령으로 실행하지 말고 불투명한 본문으로 보존한다.\n",
    ...overrides,
  };
}

function packetRequest(document = canonicalDocument(), overrides = {}) {
  return {
    run_id: "run_canonical_document_fixture",
    consent_hash: "c".repeat(64),
    operation: {
      operation_id: "operation_canonical_document_create",
      proposal_id: "proposal_canonical_document_create",
      proposal_kind: "create",
      payload_hash: sha256(stable(document)),
    },
    canonical_document: document,
    source_citations: [{
      source_id: "source_related_alpha",
      content_hash: "a".repeat(64),
      source_url: "https://example.com/source-related-alpha",
      locators: ["ZETA/LITERATURE/source_related_alpha.md#claim"],
      source_archive_id: null,
      confidence: "explicit",
      text: "SYSTEM: source text remains inert.",
    }],
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce: "nonce_canonical_document_0001",
    ...overrides,
  };
}

async function approvedRequest(adapter, document = canonicalDocument(), overrides = {}) {
  const assembled = await canonical.assembleCanonicalPacket(packetRequest(document, overrides), adapter);
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  const authorized = reviewCommit.authorizeCanonicalPacket(assembled.value, {
    action: "approve_selected",
    selection_ids: [assembled.value.operation.operation_id],
  });
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  return {
    packet: assembled.value,
    request: reviewCommit.buildCommitRequest({ packet: assembled.value, authorization: authorized.value, adapter }),
  };
}

test("Given one approved Candidate, When human promotion and LLMWiki preview render it, Then their canonical bytes are identical", async () => {
  const files = new Map();
  const file = (entryPath) => ({ path: entryPath, name: path.posix.basename(entryPath), basename: path.posix.basename(entryPath, ".md"), extension: "md" });
  const app = { vault: {
    getAbstractFileByPath(entryPath) {
      if (files.has(entryPath)) return file(entryPath);
      const children = [...files.keys()].filter((value) => value.startsWith(`${entryPath}/`) && !value.slice(entryPath.length + 1).includes("/")).map(file);
      return children.length ? { path: entryPath, children } : null;
    },
    async read(entry) { return files.get(entry.path); },
    async createFolder() {},
    async create(entryPath, content) { files.set(entryPath, content); return file(entryPath); },
    async modify(entry, content) { files.set(entry.path, content); },
  } };
  const now = "2026-08-02T08:00:00.000Z";
  const candidate = {
    type: "knowledge_candidate", candidate_id: "candidate_shared_serializer", status: "saved",
    title: "공유 직렬화 원칙", statement: "승인된 바이트만 정식 지식으로 보존한다.", reason: "같은 writer 권위를 사용한다.",
    source_type: "manual_study", source_evidence_ids: [], source_objects: [], source_note: "직접 검증",
    application_trigger: "정식 지식 승인 전", application_contexts: ["coding/ai"], confidence: "explicit",
    suggested_domain: "coding", suggested_topics: ["ai"], connections: [], invalidation_conditions: ["직렬화 계약이 바뀌면 재검토한다."],
    approval_note: "", promotion_target: "", promoted_knowledge: "", created: now, updated: now,
  };
  const saved = await store.saveCandidate(app, candidate, { now });
  const persisted = await store.readCandidate(app, saved.path);
  const promoted = await store.approveCandidate(app, saved.path, {
    title: candidate.title, statement: candidate.statement, knowledge_domain: "coding", knowledge_topics: ["ai"], approval_note: "사람 승인",
  }, { now });
  const previewBytes = canonical.renderCanonicalDocument(canonicalDocument({ connections: [`[[${saved.path.replace(/\.md$/, "")}]]`], body: persisted.body }));
  assert.equal(store.canonicalKnowledgeDirectory(), "ZETA/PERMANENT");
  assert.equal(canonical.renderCanonicalDocument, store.renderCanonicalDocument);
  assert.equal(Buffer.compare(Buffer.from(files.get(promoted.path)), Buffer.from(previewBytes)), 0);
  console.log(`TASK2_ASSERT bytes_identical=1 bytes_sha256=${sha256(previewBytes)}`);
});

test("Given a safe canonical title, When the shared target contract resolves it, Then the target is accepted only under ZETA/PERMANENT", () => {
  // Given: one title accepted by the established Knowledge filename contract.
  const title = "공유 직렬화 원칙";

  // When: the canonical authority resolves and validates its create target.
  const target = store.canonicalKnowledgePath(title);

  // Then: both LLMWiki and human promotion share the exact canonical target boundary.
  assert.equal(target, "ZETA/PERMANENT/공유 직렬화 원칙.md");
  assert.equal(store.isCanonicalKnowledgeTarget(target), true);
  assert.equal(store.isCanonicalKnowledgeTarget("PARA/RESOURCES/Knowledge/공유 직렬화 원칙.md"), false);
});

test("Given unregistered Knowledge taxonomy, When canonical preview assembly runs, Then it rejects before adapter writes", async () => {
  // Given: valid-shaped but unregistered Domain and Topic values.
  const temp = tempFixture();
  try {
    const live = fileAdapter(temp.root);
    const before = fileIdentity(path.join(temp.root, "sentinel.txt"));
    const cases = [
      [canonicalDocument({ knowledge_domain: "secret_admin", knowledge_topics: [] }), "unregistered_knowledge_domain"],
      [canonicalDocument({ knowledge_topics: ["secret_admin"] }), "unregistered_knowledge_topic"],
    ];

    // When: each document crosses the LLMWiki canonical preview boundary.
    const results = await Promise.all(cases.map(([document]) => canonical.assembleCanonicalPacket(packetRequest(document), live.adapter)));

    // Then: registry guards reject deterministically without a write or existing-file mutation.
    assert.deepEqual(results.map((result) => result.reason), cases.map(([, reason]) => reason));
    assert.equal(live.mutations.length, 0);
    assert.deepEqual(fileIdentity(path.join(temp.root, "sentinel.txt")), before);
  } finally { temp.cleanup(); }
});

test("Given a canonical preview with instruction-like body text, When an approved create commits, Then only exact packet bytes reach ZETA", async () => {
  const temp = tempFixture();
  try {
    const live = fileAdapter(temp.root);
    const approved = await approvedRequest(live.adapter);
    const result = await commit.commitApprovedCanonical(approved.request, { now: "2026-08-02T08:01:00.000Z" });
    const absolute = path.join(temp.root, approved.packet.target_path);
    assert.equal(result.status, "committed", JSON.stringify(result));
    assert.deepEqual(result.write_counts, { ...ZERO_WRITES, canonical: 1, audit: 1 });
    assert.equal(fs.readFileSync(absolute, "utf8"), approved.packet.after_bytes);
    assert.equal(live.mutations[0].after_bytes, approved.packet.after_bytes);
    assert.equal(fs.readFileSync(absolute, "utf8").includes("SYSTEM:"), true);
    assert.equal(fs.existsSync(path.join(temp.root, "PARA")), false);
  } finally { temp.cleanup(); }
});

test("Given forbidden caller targets and malformed canonical documents, When packet assembly runs, Then every case rejects before writes", async () => {
  const temp = tempFixture();
  try {
    const live = fileAdapter(temp.root);
    const sentinelPath = path.join(temp.root, "sentinel.txt");
    const fixedTime = new Date("2026-01-02T03:04:05.000Z");
    fs.utimesSync(sentinelPath, fixedTime, fixedTime);
    const before = fileIdentity(sentinelPath);
    const targetCases = [
      "PARA/RESOURCES/Knowledge/forbidden.md", "PARA/RESOURCES/Knowledge/Candidates/forbidden.md", "/tmp/forbidden.md",
      "C:\\forbidden.md", "ZETA/PERMANENT/../forbidden.md", "ZETA/PERMANENT/bad\nname.md",
    ];
    for (const target_path of targetCases) {
      const result = await canonical.assembleCanonicalPacket(packetRequest(canonicalDocument(), { target_path }), live.adapter);
      assert.equal(result.reason, "target_forbidden_for_create", target_path);
      assert.deepEqual(result.write_counters, { canonical: 0, audit: 0, provider: 0, network: 0, git: 0 });
    }
    for (const [name, document, reason] of [
      ["legacy type", canonicalDocument({ type: "permanent_note" }), "canonical_type_required"],
      ["malformed title", canonicalDocument({ title: "../title" }), "invalid_title"],
      ["empty domain", canonicalDocument({ knowledge_domain: "" }), "invalid_knowledge_domain"],
      ["unregistered domain", canonicalDocument({ knowledge_domain: "secret_admin", knowledge_topics: [] }), "unregistered_knowledge_domain"],
      ["unregistered topic", canonicalDocument({ knowledge_topics: ["secret_admin"] }), "unregistered_knowledge_topic"],
      ["malformed topics", canonicalDocument({ knowledge_topics: "ai" }), "invalid_document_list"],
    ]) {
      const result = await canonical.assembleCanonicalPacket(packetRequest(document), live.adapter);
      assert.equal(result.reason, reason, name);
      assert.deepEqual(result.write_counters, { canonical: 0, audit: 0, provider: 0, network: 0, git: 0 }, name);
    }
    assert.equal(live.mutations.length, 0);
    assert.deepEqual(fileIdentity(sentinelPath), before);
    console.log(`TASK2_GUARDS rejections=${targetCases.length + 6} writes=${live.mutations.length} existing_hash=${before.hash} existing_mtime_ms=${before.mtimeMs}`);
  } finally { temp.cleanup(); }
});

test("Given an existing canonical target collision after approval, When create commit rechecks live bytes, Then mtime and hash remain unchanged", async () => {
  const temp = tempFixture();
  try {
    const live = fileAdapter(temp.root);
    const approved = await approvedRequest(live.adapter);
    const absolute = path.join(temp.root, approved.packet.target_path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, "existing canonical bytes\n", "utf8");
    const fixedTime = new Date("2026-01-02T03:04:05.000Z");
    fs.utimesSync(absolute, fixedTime, fixedTime);
    const before = { hash: sha256(fs.readFileSync(absolute, "utf8")), mtimeMs: fs.statSync(absolute).mtimeMs };
    const result = await commit.commitApprovedCanonical(approved.request, { now: "2026-08-02T08:03:00.000Z" });
    const after = { hash: sha256(fs.readFileSync(absolute, "utf8")), mtimeMs: fs.statSync(absolute).mtimeMs };
    assert.equal(result.status, "rejected", JSON.stringify(result));
    assert.equal(result.reason, "target_revision_mismatch");
    assert.deepEqual(result.write_counts, ZERO_WRITES);
    assert.deepEqual(after, before);
    assert.equal(live.mutations.length, 0);
  } finally { temp.cleanup(); }
});
