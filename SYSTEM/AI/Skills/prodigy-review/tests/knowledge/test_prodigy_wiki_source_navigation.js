"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const artifactContract = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-artifact-contract.js"));
const sourcePreview = require(path.join(ROOT, "SYSTEM/Views/llmwiki-source-preview.js"));
const workbench = require(path.join(ROOT, "SYSTEM/Views/llmwiki-golden-preview-workbench.js"));
const { mountRoot, walk } = require("./llmwiki_lifecycle_view_fixture.js");

function fixture() {
  const sourceText = [
    "# 투자 기록",
    "",
    "## 가격 판단",
    "",
    "현장 수요를 먼저 확인한다.",
    "",
    "출구 가격을 보수적으로 계산한다.",
    "",
  ].join("\n");
  const sourcePath = "INBOX/투자 기록.md";
  const sourceRevision = hash.sha256(sourceText);
  const quotes = ["현장 수요를 먼저 확인한다.", "출구 가격을 보수적으로 계산한다."];
  const citations = quotes.map((quote, index) => {
    const start = sourceText.indexOf(quote);
    return {
      citation_id: `citation_navigation_${index + 1}`,
      source_id: "source_navigation",
      source_path: sourcePath,
      content_hash: sourceRevision,
      locators: [`${sourcePath}#${start}-${start + quote.length}`],
      evidence_quote: quote,
      confidence: "explicit",
    };
  });
  const claims = quotes.map((quote, index) => ({
    claim_id: `claim_navigation_${index + 1}`,
    text: quote,
    citation_ids: [citations[index].citation_id],
  }));
  const document = {
    document_kind: "topic_article",
    title: "가격 판단 Wiki",
    purpose: "가격 판단 순서를 정리한다.",
    tags: ["real_estate", "bidding"],
    sections: [{
      heading: "가격 판단",
      paragraphs: claims.map((claim) => ({
        text: claim.text,
        claim_ids: [claim.claim_id],
      })),
    }],
    claims,
    citations,
  };
  const documentBytes = `# ${document.title}\n\n${quotes.join("\n\n")}\n`;
  const artifact = artifactContract.createPreviewArtifact({
    operation_id: "a".repeat(64),
    orchestrator_version: "llmwiki_golden_wiki_orchestrator_v2",
    gate_receipt_hash: "b".repeat(64),
    source: {
      source_id: "source_navigation",
      source_path: sourcePath,
      source_revision: sourceRevision,
      source_text: sourceText,
    },
    scope: null,
    document,
    document_bytes: documentBytes,
  });
  const receipt = {
    ok: true,
    status: "publishable_preview",
    issues: [],
    metrics: {
      structure_score: 1,
      critical_token_recall: 1,
      style_score: 1,
    },
    receipt: {
      source_path: sourcePath,
      document_hash: hash.sha256(documentBytes),
      receipt_hash: "b".repeat(64),
    },
    ...artifact.receipt,
    artifact_receipt_hash: artifact.receipt.receipt_hash,
  };
  return { sourceText, sourcePath, sourceRevision, artifact, receipt };
}

test("reviewed preview renders section and paragraph source actions from verified navigation", () => {
  const current = fixture();
  const row = workbench.inspectPreview({
    document_path: current.artifact.document_path,
    document_bytes: current.artifact.document_bytes,
    receipt: current.receipt,
  });
  assert.equal(row.status, "publishable_preview");
  assert.equal(row.navigation_manifest.sections.length, 1);
  assert.equal(row.navigation_manifest.sections[0].paragraphs.length, 2);
  assert.equal(row.navigation_manifest.sections[0].paragraphs.every(
    (paragraph) => paragraph.citations.length === 1,
  ), true);

  const mounted = mountRoot();
  const opened = [];
  workbench.mount({
    container: mounted.root,
    rows: [row],
    onOpenCitation(citation) { opened.push(citation); },
  });
  const sectionActions = walk(
    mounted.root,
    (node) => node.getAttribute("data-action") === "open-golden-section-source",
  );
  const paragraphActions = walk(
    mounted.root,
    (node) => node.getAttribute("data-action") === "open-golden-paragraph-source",
  );
  assert.equal(sectionActions.length, 2);
  assert.equal(paragraphActions.length, 2);
  paragraphActions[1].onclick();
  assert.equal(opened[0].evidence_quote, "출구 가격을 보수적으로 계산한다.");
});

test("exact source resolver distinguishes current stale ambiguous and deleted evidence", () => {
  const current = fixture();
  const citation = current.artifact.navigation_manifest.sections[0].citations[0];
  const exact = sourcePreview.resolvePreview({
    citation,
    source_text: current.sourceText,
  });
  assert.equal(exact.status, "current");
  assert.equal(exact.match_status, "unique");
  assert.ok(Number.isSafeInteger(exact.position.line));

  const stale = sourcePreview.resolvePreview({
    citation,
    source_text: `${current.sourceText}\n변경`,
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.match_status, "unique");

  const ambiguous = sourcePreview.resolvePreview({
    citation,
    source_text: `${current.sourceText}\n${citation.evidence_quote}\n`,
  });
  assert.equal(ambiguous.status, "stale");
  assert.equal(ambiguous.match_status, "ambiguous");
  assert.equal(ambiguous.position, null);

  const deleted = sourcePreview.resolvePreview({
    citation,
    source_text: "# 투자 기록\n\n근거가 삭제되었습니다.\n",
  });
  assert.equal(deleted.status, "stale");
  assert.equal(deleted.match_status, "missing");
  assert.equal(deleted.position, null);
});

test("async durable acknowledgement becomes reviewed only after persistence succeeds", async () => {
  const current = fixture();
  const row = workbench.inspectPreview({
    document_path: current.artifact.document_path,
    document_bytes: current.artifact.document_bytes,
    receipt: current.receipt,
  });
  const mounted = mountRoot();
  const reviewState = workbench.createReviewState();
  let settle;
  const persisted = new Promise((resolve) => { settle = resolve; });
  workbench.mount({
    container: mounted.root,
    rows: [row],
    reviewState,
    onReviewed: () => persisted,
  });
  const mark = walk(
    mounted.root,
    (node) => node.getAttribute("data-action") === "mark-golden-reviewed",
  )[0];

  const pending = mark.onclick();
  assert.equal(reviewState.has(row.preview_id), false);
  settle({ ok: true, status: "reviewed" });
  await pending;
  assert.equal(reviewState.has(row.preview_id), true);
});
