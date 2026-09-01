"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const artifactContract = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-artifact-contract.js"));
const reviewedApi = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-reviewed-store.js"));

function memoryStorage(seed = {}) {
  const files = new Map(Object.entries(seed));
  let writes = 0;
  return {
    files,
    get writes() { return writes; },
    async list(prefix) {
      return [...files.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
    async read(filePath) {
      if (!files.has(filePath)) throw new Error("missing");
      return files.get(filePath);
    },
    async writeImmutable(filePath, bytes) {
      if (files.has(filePath)) {
        if (files.get(filePath) !== bytes) throw new Error("immutable_conflict");
        return false;
      }
      files.set(filePath, bytes);
      writes += 1;
      return true;
    },
  };
}

function previewFixture(revisionSuffix = "", sourceId = "source_reading") {
  const sourceText = `# 독서 기록\n\n## 핵심 개념\n\n질문을 먼저 적고 읽는다.${revisionSuffix}\n`;
  const sourcePath = "INBOX/독서 기록.md";
  const sourceRevision = hash.sha256(sourceText);
  const quote = "질문을 먼저 적고 읽는다.";
  const start = sourceText.indexOf(quote);
  const citation = {
    citation_id: `citation_reviewed_${hash.sha256(revisionSuffix || "base").slice(0, 8)}`,
    source_id: sourceId,
    source_path: sourcePath,
    content_hash: sourceRevision,
    locators: [`${sourcePath}#${start}-${start + quote.length}`],
    evidence_quote: quote,
    confidence: "explicit",
  };
  const claim = {
    claim_id: `claim_reviewed_${hash.sha256(revisionSuffix || "base").slice(0, 8)}`,
    text: quote,
    citation_ids: [citation.citation_id],
  };
  const document = {
    document_kind: "topic_article",
    title: "질문 중심 독서",
    purpose: "읽기 전에 질문을 세우는 방법을 정리한다.",
    tags: ["reading", "personal_growth"],
    sections: [{
      heading: "질문 먼저 쓰기",
      paragraphs: [{ text: quote, claim_ids: [claim.claim_id] }],
    }],
    claims: [claim],
    citations: [citation],
  };
  const documentBytes = [
    "---",
    "type: wiki-preview",
    "status: review",
    "---",
    "",
    "# 질문 중심 독서",
    "",
    quote,
    "",
  ].join("\n");
  const artifact = artifactContract.createPreviewArtifact({
    operation_id: hash.sha256(`operation${revisionSuffix}`),
    orchestrator_version: "llmwiki_golden_wiki_orchestrator_v2",
    gate_receipt_hash: hash.sha256(`gate${revisionSuffix}`),
    source: {
      source_id: sourceId,
      source_path: sourcePath,
      source_revision: sourceRevision,
      source_text: sourceText,
    },
    scope: null,
    document,
    document_bytes: documentBytes,
  });
  const previewReceipt = {
    ok: true,
    status: "publishable_preview",
    issues: [],
    metrics: { structure_score: 1, critical_token_recall: 1, style_score: 1 },
    receipt: {
      source_path: sourcePath,
      document_hash: hash.sha256(documentBytes),
      receipt_hash: artifact.receipt.gate_receipt_hash,
    },
    ...artifact.receipt,
    artifact_receipt_hash: artifact.receipt.receipt_hash,
  };
  return { sourceText, sourcePath, sourceRevision, artifact, previewReceipt };
}

function seededPreview(value) {
  return {
    [value.artifact.document_path]: value.artifact.document_bytes,
    [value.artifact.receipt_path]: `${JSON.stringify(value.previewReceipt, null, 2)}\n`,
  };
}

test("acknowledgement stores an immutable reviewed document and receipt outside canonical Knowledge", async () => {
  const fixture = previewFixture();
  const storage = memoryStorage(seededPreview(fixture));
  const store = reviewedApi.createReviewedStore({ storage, hash });
  await store.load();

  const first = await store.acknowledge({
    preview_document_path: fixture.artifact.document_path,
    preview_receipt_path: fixture.artifact.receipt_path,
    source_text: fixture.sourceText,
    reviewed_at: "2026-09-01T01:00:00.000Z",
  });
  const replay = await store.acknowledge({
    preview_document_path: fixture.artifact.document_path,
    preview_receipt_path: fixture.artifact.receipt_path,
    source_text: fixture.sourceText,
    reviewed_at: "2026-09-01T01:00:00.000Z",
  });

  assert.equal(first.ok, true);
  assert.equal(first.status, "reviewed");
  assert.deepEqual(first.write_counts, { reviewed: 2, canonical: 0, source: 0, provider: 0 });
  assert.equal(replay.status, "replay");
  assert.deepEqual(replay.write_counts, { reviewed: 0, canonical: 0, source: 0, provider: 0 });
  assert.equal(storage.writes, 2);
  assert.match(first.entry.document_path, /^PARA\/RESOURCES\/Prodigy Wiki\//u);
  assert.equal(first.entry.document_path.startsWith("PARA/RESOURCES/Knowledge/"), false);
  assert.match(storage.files.get(first.entry.document_path), /type: prodigy_wiki[\s\S]*status: reviewed/u);
  assert.equal(first.entry.trust_tier, "prodigy_reviewed");
  assert.equal(store.has(fixture.artifact.artifact_id), true);
});

test("reviewed ledger survives reload and ignores partial or tampered entries", async () => {
  const fixture = previewFixture();
  const storage = memoryStorage(seededPreview(fixture));
  const store = reviewedApi.createReviewedStore({ storage, hash });
  await store.load();
  const accepted = await store.acknowledge({
    preview_document_path: fixture.artifact.document_path,
    preview_receipt_path: fixture.artifact.receipt_path,
    source_text: fixture.sourceText,
    reviewed_at: "2026-09-01T01:00:00.000Z",
  });
  storage.files.set(
    `${artifactContract.REVIEWED_RECEIPT_ROOT}/prodigy_artifact_${"f".repeat(24)}.json`,
    JSON.stringify({ receipt_version: reviewedApi.RECEIPT_VERSION }),
  );

  const reopened = reviewedApi.createReviewedStore({ storage, hash });
  const snapshot = await reopened.load();
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].artifact_id, fixture.artifact.artifact_id);
  assert.equal(snapshot.entries[0].document_path, accepted.entry.document_path);
  assert.equal(snapshot.issues.length, 1);
  assert.equal(reopened.has(fixture.artifact.artifact_id), true);
});

test("stale source and tampered preview fail closed with zero durable writes", async () => {
  const fixture = previewFixture();
  for (const mutation of ["source", "document", "receipt"]) {
    const storage = memoryStorage(seededPreview(fixture));
    if (mutation === "document") {
      storage.files.set(fixture.artifact.document_path, `${fixture.artifact.document_bytes}변조`);
    }
    if (mutation === "receipt") {
      const forged = { ...fixture.previewReceipt, source_revision: "f".repeat(64) };
      storage.files.set(fixture.artifact.receipt_path, `${JSON.stringify(forged, null, 2)}\n`);
    }
    const store = reviewedApi.createReviewedStore({ storage, hash });
    await store.load();
    const before = storage.writes;
    const result = await store.acknowledge({
      preview_document_path: fixture.artifact.document_path,
      preview_receipt_path: fixture.artifact.receipt_path,
      source_text: mutation === "source" ? `${fixture.sourceText}변경` : fixture.sourceText,
      reviewed_at: "2026-09-01T01:00:00.000Z",
    });
    assert.equal(result.ok, false, mutation);
    assert.equal(storage.writes, before, mutation);
    assert.deepEqual(result.write_counts, { reviewed: 0, canonical: 0, source: 0, provider: 0 });
  }
});

test("a reviewed replacement supersedes only explicitly bound prior artifacts", async () => {
  const first = previewFixture();
  const second = previewFixture("\n새 질문을 추가한다.", "source_reading_changed_scope");
  const storage = memoryStorage({ ...seededPreview(first), ...seededPreview(second) });
  const store = reviewedApi.createReviewedStore({ storage, hash });
  await store.load();
  const acceptedFirst = await store.acknowledge({
    preview_document_path: first.artifact.document_path,
    preview_receipt_path: first.artifact.receipt_path,
    source_text: first.sourceText,
    reviewed_at: "2026-09-01T01:00:00.000Z",
  });
  await store.acknowledge({
    preview_document_path: second.artifact.document_path,
    preview_receipt_path: second.artifact.receipt_path,
    source_text: second.sourceText,
    reviewed_at: "2026-09-01T02:00:00.000Z",
    supersedes: [acceptedFirst.entry.artifact_id],
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.entries.length, 2);
  assert.deepEqual(snapshot.current_entries.map((entry) => entry.artifact_id), [second.artifact.artifact_id]);
  assert.equal(snapshot.entries.find((entry) => entry.artifact_id === first.artifact.artifact_id).status, "superseded");
  assert.equal(snapshot.entries.find((entry) => entry.artifact_id === second.artifact.artifact_id).status, "current");
});
