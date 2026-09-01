"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = require(path.join(ROOT, "SYSTEM/Views/llmwiki-hash.js"));
const contract = require(path.join(ROOT, "SYSTEM/Views/prodigy-wiki-artifact-contract.js"));

function fixture(overrides = {}) {
  const sourceText = [
    "# 투자 기록",
    "",
    "## 입찰 기준",
    "",
    "감정가보다 현장 수요와 출구 가격을 함께 확인한다.",
    "",
    "## 세금",
    "",
    "취득 시점의 세율을 다시 확인한다.",
    "",
  ].join("\n");
  const sourcePath = "INBOX/투자 기록.md";
  const sourceRevision = hash.sha256(sourceText);
  const quote = "감정가보다 현장 수요와 출구 가격을 함께 확인한다.";
  const start = sourceText.indexOf(quote);
  const citation = {
    citation_id: `citation_${"1".repeat(24)}`,
    source_id: "source_investment",
    source_path: sourcePath,
    content_hash: sourceRevision,
    locators: [`${sourcePath}#${start}-${start + quote.length}`],
    evidence_quote: quote,
    confidence: "explicit",
  };
  const claim = {
    claim_id: `claim_${"2".repeat(24)}`,
    text: "입찰 판단은 현장 수요와 출구 가격을 함께 본다.",
    citation_ids: [citation.citation_id],
  };
  const document = {
    document_kind: "topic_article",
    title: "입찰 판단 기준",
    purpose: "입찰 전 확인할 근거를 정리한다.",
    tags: ["real_estate", "bidding"],
    sections: [{
      heading: "가격과 수요",
      paragraphs: [{
        text: "현장 수요와 출구 가격을 함께 확인한다.",
        claim_ids: [claim.claim_id],
      }],
    }],
    claims: [claim],
    citations: [citation],
  };
  return {
    operation_id: "a".repeat(64),
    orchestrator_version: "llmwiki_golden_wiki_orchestrator_v3",
    gate_receipt_hash: "b".repeat(64),
    source: {
      source_id: "source_investment",
      source_path: sourcePath,
      source_revision: sourceRevision,
      source_text: sourceText,
    },
    scope: {
      scope_id: "heading_002",
      range_key: "range_investment_bid",
      title: "입찰 기준",
      start: sourceText.indexOf("## 입찰 기준"),
      end: sourceText.indexOf("## 세금"),
    },
    document,
    document_bytes: `# ${document.title}\n\n현장 수요와 출구 가격을 함께 확인한다.\n`,
    ...overrides,
  };
}

test("artifact identity and immutable preview paths bind source revision range document and navigation", () => {
  const first = contract.createPreviewArtifact(fixture());
  const replay = contract.createPreviewArtifact(fixture());
  const changedText = `${fixture().source.source_text}\n변경`;
  const changedSource = fixture({
    source: {
      ...fixture().source,
      source_revision: hash.sha256(changedText),
      source_text: changedText,
    },
  });
  const changed = contract.createPreviewArtifact(changedSource);

  assert.deepEqual(replay, first);
  assert.match(first.artifact_id, /^prodigy_artifact_[0-9a-f]{24}$/u);
  assert.match(first.document_path, /^SYSTEM\/CACHE\/llmwiki\/previews\/[0-9a-f]{16}\/[0-9a-f]{12}\/.+--[0-9a-f]{8}\.md$/u);
  assert.equal(first.receipt_path, first.document_path.replace(/\.md$/u, ".receipt.json"));
  assert.notEqual(changed.artifact_id, first.artifact_id);
  assert.notEqual(changed.document_path, first.document_path);
  assert.equal(first.navigation_manifest.sections.length, 1);
  assert.deepEqual(first.navigation_manifest.sections[0].claim_ids, [`claim_${"2".repeat(24)}`]);
  assert.equal(first.navigation_manifest.sections[0].citations[0].evidence_quote, "감정가보다 현장 수요와 출구 가격을 함께 확인한다.");
  assert.equal(first.source_outline.rows.map((row) => row.heading).join(" > "), "투자 기록 > 입찰 기준 > 세금");
});

test("self-verifying artifact receipt rejects document navigation outline source and scope drift", () => {
  const artifact = contract.createPreviewArtifact(fixture());
  assert.deepEqual(contract.inspectPreviewArtifact(artifact), {
    ok: true,
    status: "verified",
    artifact_id: artifact.artifact_id,
  });

  const cases = [
    { ...artifact, document_bytes: `${artifact.document_bytes}변조` },
    {
      ...artifact,
      navigation_manifest: {
        ...artifact.navigation_manifest,
        sections: [],
      },
    },
    {
      ...artifact,
      source_outline: {
        ...artifact.source_outline,
        rows: [],
      },
    },
    {
      ...artifact,
      receipt: {
        ...artifact.receipt,
        source_revision: "d".repeat(64),
      },
    },
    {
      ...artifact,
      receipt: {
        ...artifact.receipt,
        scope: { ...artifact.receipt.scope, start: artifact.receipt.scope.start + 1 },
      },
    },
  ];

  for (const value of cases) {
    const inspected = contract.inspectPreviewArtifact(value);
    assert.equal(inspected.ok, false);
    assert.equal(inspected.status, "invalid");
  }
});

test("artifact contract keeps reviewed Wiki distinct from canonical Knowledge", () => {
  assert.equal(contract.PREVIEW_ROOT, "SYSTEM/CACHE/llmwiki/previews");
  assert.equal(contract.REVIEWED_ROOT, "PARA/RESOURCES/Prodigy Wiki");
  assert.equal(contract.REVIEWED_RECEIPT_ROOT, "PARA/RESOURCES/Prodigy Wiki/.receipts");
  const artifact = contract.createPreviewArtifact(fixture());
  assert.equal(artifact.document_path.startsWith("PARA/RESOURCES/Knowledge/"), false);
  assert.deepEqual(artifact.write_counts, {
    preview: 0,
    reviewed: 0,
    canonical: 0,
    source: 0,
    provider: 0,
  });
});
