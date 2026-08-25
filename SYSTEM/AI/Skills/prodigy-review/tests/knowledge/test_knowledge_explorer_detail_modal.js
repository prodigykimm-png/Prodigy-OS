"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const path = require("node:path");
const { mountRoot, walk } = require("./llmwiki_lifecycle_view_fixture.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const modalApi = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-detail-modal.js"));

function detail() {
  return {
    review_id: "canonical_001",
    destination: "canonical_knowledge",
    review_state: "pending",
    title: "검증 가능한 주장",
    sources: [{ source_id: "source_001", locator: "ZETA/LITERATURE/source.md#anchor", url: "https://example.test/source" }],
    claim_set: {
      claims: [
        { claim_id: "claim_001", text: "근거 주장", origin: "source_extract", status: "accepted", citation_ids: ["citation_001"], derived_from_claim_ids: [] },
        { claim_id: "claim_002", text: "해석 주장", origin: "ai_interpretation", status: "accepted", citation_ids: [], derived_from_claim_ids: ["claim_001"] },
        { claim_id: "claim_003", text: "정정 주장", origin: "ai_correction", status: "unreviewed", citation_ids: [], derived_from_claim_ids: ["claim_001"], dispute_target_claim_id: "claim_001" },
      ],
      citations: [{ citation_id: "citation_001", source_id: "source_001", source_span: { start: 4, end: 10 } }],
      disputes: [{ dispute_id: "dispute_001", target_claim_id: "claim_001", correction_claim_id: "claim_003", status: "unreviewed" }],
    },
    review_history: [{ state: "pending", at: "2026-08-25T00:00:00.000Z" }],
    acceptance_state: "pending",
    coverage: { complete: true, receipt_id: "coverage_001" },
    accepted_ai_labels: ["AI 보조: 출처 추출"],
    correction_conflicts: [{ conflict_id: "conflict_001", reason: "상충 주장 검토 필요" }],
  };
}

test("renders provenance fields in a one-scroll-owner read-only modal and does not duplicate source handlers", () => {
  const { document, root } = mountRoot();
  const opened = [];
  let modal;
  class FakeModal {
    constructor() {
      this.onOpen = () => {};
      this.onClose = () => {};
      this.modalEl = document.createElement("div");
      this.contentEl = document.createElement("div");
      this.modalEl.appendChild(this.contentEl);
      modal = this;
    }
    open() { this.opened = true; this.onOpen(); }
    close() { if (!this.opened) return; this.opened = false; this.onClose(); }
  }
  const invoker = root.createEl("button", { attr: { type: "button" } });
  const detailModal = modalApi.createKnowledgeExplorerDetailModal({ app: {}, Modal: FakeModal, onOpenSource: (source) => opened.push(source.locator) });

  detailModal.open(detail(), invoker);
  detailModal.update(detail());
  const fields = walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("data-review-field") !== null).map((node) => node.getAttribute("data-review-field"));
  assert.deepEqual(fields.sort(), ["acceptance", "ai_labels", "contradictions", "corrections", "coverage", "derivation", "history", "origins", "sources", "support"].sort());
  assert.equal(walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("data-scroll-owner") === "knowledge-review-detail").length, 1);
  const title = walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("id") === "knowledge-review-detail-title")[0];
  const scroll = walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("id") === "knowledge-review-detail-scroll")[0];
  assert.equal(title.tagName, "H2");
  assert.equal(scroll.getAttribute("tabindex"), "0");
  const sourceButtons = walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("data-action") === "open-review-source");
  assert.equal(sourceButtons.length, 1);
  assert.equal(sourceButtons[0].parentElement.tagName, "LI");
  assert.equal(walk(modal.contentEl, (node) => node.textContent === "ZETA/LITERATURE/source.md#anchor").length, 1);
  assert.equal(sourceButtons[0].onclick, undefined);
  const article = modal.contentEl.querySelector("article");
  assert.equal(typeof article.onclick, "function");
  article.onclick({ target: sourceButtons[0], preventDefault() {} });
  assert.deepEqual(opened, ["ZETA/LITERATURE/source.md#anchor"]);

  const closeButton = walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("data-action") === "close-review-detail")[0];
  article.onclick({ target: closeButton, preventDefault() {} });
  assert.equal(detailModal.state().open, false);
  assert.equal(invoker.focused, true);
  detailModal.open(detail(), invoker);
  assert.equal(walk(modal.contentEl, (node) => node.getAttribute && node.getAttribute("data-action") === "open-review-source").length, 1);
  assert.equal(detailModal.state().provider_count, 0);
  assert.equal(detailModal.state().writer_count, 0);
});

test("defines one definite compact dialog shell with a shrinking middle row", () => {
  const css = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"), "utf8");

  assert.match(css, /\.knowledge-review-detail-modal__dialog\s*\{[^}]*block-size:\s*min\([^}]*100dvh[^}]*\)/u);
  assert.match(css, /\.knowledge-review-detail-modal__content\s*>\s*article\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*block-size:\s*100%;/u);
  assert.match(css, /\.knowledge-review-detail-modal__scroll\s*\{[^}]*min-block-size:\s*0;[^}]*overflow-y:\s*auto;/u);
  assert.doesNotMatch(css, /\.knowledge-review-detail-modal__content[^}]*overflow-(?:y|block):\s*(?:auto|scroll)/u);
});
