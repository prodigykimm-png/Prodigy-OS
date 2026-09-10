(function(root){
  "use strict";
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const artifactApi = root.ProdigyWikiArtifactContract
    || (typeof require === "function" ? require("./prodigy-wiki-artifact-contract.js") : null);
  const PREVIEW_DIR = "SYSTEM/CACHE/llmwiki/";
  const RECEIPT_SUFFIX = ".receipt.json";
  const freeze = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; };
  const text = (value) => String(value == null ? "" : value).trim();
  const plain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const stable = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  };
  function orchestrationReceiptBody(receipt) {
    return {
      orchestrator_version: receipt.orchestrator_version,
      document_path: receipt.document_path,
      source_path: receipt.source_path,
      source_revision: receipt.source_revision,
      scope: receipt.scope,
      source_bytes: receipt.source_bytes,
      chunk_count: receipt.chunk_count,
      pack_count: receipt.pack_count,
      scoped_claim_ids: receipt.scoped_claim_ids,
      gate_receipt_hash: receipt.gate_receipt_hash,
    };
  }
  function titleFromMarkdown(bytes, fallback) {
    const match = String(bytes || "").match(/^#\s+(.+)$/mu);
    return text(match && match[1]) || fallback;
  }
  function inspectPreview(input) {
    const documentPath = text(input && input.document_path);
    const documentBytes = String(input && input.document_bytes || "");
    const receipt = input && input.receipt;
    const issues = [];
    if (!documentPath.startsWith(PREVIEW_DIR) || !documentPath.endsWith(".md")) issues.push("invalid_preview_path");
    const gateReceipt = plain(receipt && receipt.receipt) ? receipt.receipt : receipt;
    if (!plain(receipt) || receipt.status !== "publishable_preview") issues.push("gate_not_publishable");
    if (!plain(receipt && receipt.metrics) || receipt.metrics.structure_score !== 1 || receipt.metrics.critical_token_recall !== 1 || receipt.metrics.style_score !== 1) issues.push("quality_metrics_incomplete");
    if (!hashApi || !plain(gateReceipt) || gateReceipt.document_hash !== hashApi.sha256(documentBytes)) issues.push("document_hash_mismatch");
    const sourcePath = text(gateReceipt && gateReceipt.source_path);
    if (!sourcePath || sourcePath.includes("..") || sourcePath.startsWith("/")) issues.push("invalid_source_path");
    const artifactReceipt = receipt && receipt.artifact_version === artifactApi?.VERSION;
    if (artifactReceipt) {
      const inspected = artifactApi.inspectPreviewArtifact({
        document_path: documentPath,
        document_bytes: documentBytes,
        navigation_manifest: receipt.navigation_manifest,
        source_outline: receipt.source_outline,
        receipt,
      });
      if (!inspected.ok) issues.push("artifact_receipt_invalid");
    } else if (text(receipt && receipt.orchestrator_version)) {
      const orchestrationBody = orchestrationReceiptBody(receipt);
      if (!hashApi || !/^[0-9a-f]{64}$/u.test(text(receipt.source_revision))
        || receipt.source_path !== sourcePath || receipt.document_path !== documentPath
        || !Array.isArray(receipt.scoped_claim_ids) || receipt.scoped_claim_ids.length === 0
        || receipt.gate_receipt_hash !== gateReceipt.receipt_hash
        || receipt.orchestration_receipt_hash !== hashApi.sha256(stable(orchestrationBody))) {
        issues.push("orchestration_receipt_invalid");
      }
    }
    const result = {
      preview_id: artifactReceipt && text(receipt.artifact_id)
        ? receipt.artifact_id
        : hashApi ? `golden_${hashApi.sha256(documentPath).slice(0, 24)}` : documentPath,
      artifact_id: artifactReceipt ? text(receipt.artifact_id) : "",
      document_path: documentPath,
      receipt_path: documentPath.replace(/\.md$/u, RECEIPT_SUFFIX),
      source_path: sourcePath,
      source_revision: artifactReceipt ? text(receipt.source_revision) : "",
      scope: artifactReceipt && plain(receipt.scope) ? receipt.scope : null,
      navigation_manifest: artifactReceipt && plain(receipt.navigation_manifest)
        ? receipt.navigation_manifest : null,
      source_outline: artifactReceipt && plain(receipt.source_outline)
        ? receipt.source_outline : null,
      refresh_context: artifactReceipt && plain(receipt.refresh_context)
        ? receipt.refresh_context : null,
      title: titleFromMarkdown(documentBytes, documentPath.split("/").pop().replace(/\.md$/u, "")),
      status: issues.length ? "review_required" : "publishable_preview",
      issues: freeze(issues),
      metrics: plain(receipt && receipt.metrics) ? receipt.metrics : {},
      receipt_hash: text(gateReceipt && gateReceipt.receipt_hash),
      artifact_receipt_hash: artifactReceipt ? text(receipt.artifact_receipt_hash || receipt.receipt_hash) : "",
      document_hash: text(gateReceipt && gateReceipt.document_hash),
      can_mark_reviewed: issues.length === 0,
    };
    return freeze(result);
  }
  async function loadPreviews(vault) {
    if (!vault || typeof vault.getFiles !== "function" || typeof vault.cachedRead !== "function") throw new TypeError("vault is required");
    const receipts = vault.getFiles().filter((file) => file && file.path.startsWith(PREVIEW_DIR) && file.path.endsWith(RECEIPT_SUFFIX));
    const rows = [];
    for (const receiptFile of receipts) {
      try {
        const receipt = JSON.parse(await vault.cachedRead(receiptFile));
        const documentPath = receiptFile.path.slice(0, -RECEIPT_SUFFIX.length) + ".md";
        const documentFile = vault.getAbstractFileByPath(documentPath);
        if (!documentFile) continue;
        rows.push(inspectPreview({ document_path: documentPath, document_bytes: await vault.cachedRead(documentFile), receipt }));
      } catch (_error) {}
    }
    return freeze(rows.sort((left, right) => left.title.localeCompare(right.title, "ko")));
  }
  function createReviewState(initial = []) {
    const reviewed = new Set(initial instanceof Set ? [...initial] : Array.isArray(initial) ? initial : []);
    const subscribers = new Set();
    const snapshot = () => freeze({ reviewed_ids: freeze([...reviewed].sort()) });
    return freeze({
      has(previewId) { return reviewed.has(previewId); },
      mark(previewId) {
        if (typeof previewId !== "string" || !previewId || reviewed.has(previewId)) return false;
        reviewed.add(previewId);
        const value = snapshot();
        for (const subscriber of [...subscribers]) subscriber(value);
        return true;
      },
      subscribe(subscriber, emitCurrent = true) {
        if (typeof subscriber !== "function") throw new TypeError("subscriber_required");
        subscribers.add(subscriber);
        if (emitCurrent) subscriber(snapshot());
        return () => subscribers.delete(subscriber);
      },
      snapshot,
    });
  }
  function mount(options) {
    const config = plain(options) ? options : {};
    if (!config.container) throw new TypeError("container is required");
    const create = (parent, tag, value, attrs) => {
      if (typeof parent.createEl === "function") return parent.createEl(tag, { text: value, attr: attrs || {} });
      const el = parent.ownerDocument.createElement(tag); if (value) el.textContent = value; Object.entries(attrs || {}).forEach(([key, entry]) => el.setAttribute(key, entry)); parent.appendChild(el); return el;
    };
    const createDiv = (parent, attrs) => typeof parent.createDiv === "function" ? parent.createDiv({ attr: attrs || {} }) : create(parent, "div", "", attrs);
    const reviewState = config.reviewState && typeof config.reviewState.mark === "function"
      ? config.reviewState : createReviewState(config.reviewed instanceof Set ? config.reviewed : []);
    const section = create(config.container, "section", "", { "data-surface": "llmwiki-golden-preview-workbench", "data-product": "prodigy-wiki", "data-review-semantics": "acknowledged-not-published" });
    const ui = root.ProdigyWikiWorkspaceView || (typeof require === "function" ? require("./prodigy-wiki-workspace-view.js") : null);
    create(section, "p", "초안 · 문서 반영 전", { "data-preview-boundary": "human-review-only" });
    let selectedId = "", renderRevision = 0;
    let currentRows = Array.isArray(config.rows) ? config.rows : [];
    function render(rows) {
      currentRows = Array.isArray(rows) ? rows : [];
      const revision = ++renderRevision;
      const old = section.querySelector && section.querySelector("[data-preview-list]");
      if (old && typeof old.remove === "function") old.remove();
      else if (old && old.parentElement && typeof old.parentElement.removeChild === "function") old.parentElement.removeChild(old);
      const list = createDiv(section, { "data-preview-list": "" });
      if (!currentRows.length) { create(list, "p", "검토할 결과가 없습니다.", {}); return; }
      currentRows.forEach((row) => {
        const card = create(list, "article", "", { "data-preview-id": row.preview_id, "data-gate-status": row.status });
        const select = create(card, "button", row.title, { type: "button", "data-action": "select-preview", "data-preview-selection": row.preview_id, "aria-expanded": String(selectedId === row.preview_id) });
        select.onclick = () => { selectedId = selectedId === row.preview_id ? "" : row.preview_id; config.onSelect?.(row); render(currentRows); };
        create(card, "p", `${row.source_path.split("/").pop().replace(/\.md$/u, "")} · ${reviewState.has(row.preview_id) ? "확인한 초안" : "검토할 초안"} · 문서 반영 전`, {});
        if (selectedId !== row.preview_id) return;
        const passed = row.status === "publishable_preview";
        create(card, "output", passed ? "검토 준비됨" : "! 적용 전에 확인할 항목이 있습니다.", { "data-preview-gate": row.status });
        const document = createDiv(card, { "data-preview-document": row.document_path });
        if (typeof config.readDocument === "function") Promise.resolve(config.readDocument(row.document_path)).then(bytes => { if (revision === renderRevision) ui.markdown(document, bytes, config.renderMarkdown); }, error => { if (revision === renderRevision) create(document, "p", `! 본문 표시 실패: ${error.message}`, { role: "alert" }); });
        const diagnostics = create(card, "details", "", { "data-disclosure": "preview-details" }); create(diagnostics, "summary", "상세 정보", {}); create(diagnostics, "pre", JSON.stringify({ issues: row.issues, metrics: row.metrics, receipt_hash: row.receipt_hash }, null, 2), {});
        if (!passed) create(card, "p", row.issues.join(" · "), { role: "alert" });
        if (passed && plain(row.navigation_manifest) && Array.isArray(row.navigation_manifest.sections)) {
          const navigation = create(card, "details", "", { "data-preview-navigation": "" });
          create(navigation, "summary", "목차", {});
          row.navigation_manifest.sections.forEach((sourceSection) => {
            const sectionRow = createDiv(navigation, { "data-preview-navigation-section": sourceSection.section_id });
            create(sectionRow, "strong", sourceSection.heading, {});
            const sectionActions = createDiv(sectionRow, { "data-preview-section-sources": "" });
            (sourceSection.citations || []).forEach((citation, index) => {
              const button = create(sectionActions, "button", `원문 근거 ${index + 1}`, {
                type: "button",
                "data-action": "open-golden-section-source",
                "data-citation-id": citation.citation_id,
              });
              button.onclick = () => typeof config.onOpenCitation === "function"
                && config.onOpenCitation(citation, row);
            });
            (sourceSection.paragraphs || []).forEach((paragraph) => {
              const paragraphRow = createDiv(sectionRow, { "data-preview-navigation-paragraph": paragraph.paragraph_id });
              create(paragraphRow, "span", paragraph.text, {});
              (paragraph.citations || []).forEach((citation, index) => {
                const button = create(paragraphRow, "button", `근거 ${index + 1}`, {
                  type: "button",
                  "data-action": "open-golden-paragraph-source",
                  "data-citation-id": citation.citation_id,
                });
                button.onclick = () => typeof config.onOpenCitation === "function"
                  && config.onOpenCitation(citation, row);
              });
            });
          });
        }
        const actions = createDiv(card, { "data-preview-actions": "" });
        create(card, "p", "적용할 변경안을 준비해야 합니다.", { "data-preview-apply-boundary": "grounded-review-required" });
        const openDocument = create(actions, "button", "초안 파일 열기", { type: "button", "data-action": "open-golden-preview" });
        openDocument.onclick = () => config.onOpen && config.onOpen(row.document_path);
        const openSource = create(actions, "button", "원문 확인", { type: "button", "data-action": "open-golden-source" });
        openSource.onclick = () => config.onOpen && config.onOpen(row.source_path);
        const reviewed = reviewState.has(row.preview_id);
        const mark = create(actions, "button", reviewed ? "확인한 초안 · 문서 반영 전" : "초안 확인 표시", { type: "button", "data-action": "mark-golden-reviewed" });
        mark.disabled = !row.can_mark_reviewed || reviewed;
        mark.onclick = () => {
          if (!row.can_mark_reviewed || reviewState.has(row.preview_id)) return false;
          let outcome = true;
          try {
            if (typeof config.onReviewed === "function") outcome = config.onReviewed(row);
          } catch (error) {
            create(card, "p", `! 확인 표시 실패: ${error.message}`, { role: "alert" });
            return false;
          }
          const commit = (result) => {
            if (result === false || result && result.ok === false) {
              create(card, "p", `! 확인 표시 실패: ${result?.reason || "acknowledgement_failed"}`, { role: "alert" }); mark.disabled = false;
              return false;
            }
            return reviewState.mark(row.preview_id);
          };
          if (outcome && typeof outcome.then === "function") {
            mark.disabled = true;
            return Promise.resolve(outcome).then(commit, error => {
              create(card, "p", `! 확인 표시 실패: ${error.message}`, { role: "alert" }); mark.disabled = false;
              return false;
            });
          }
          return commit(outcome);
        };
      });
    }
    const unsubscribe = reviewState.subscribe(() => render(currentRows), false);
    render(currentRows);
    return freeze({
      render,
      reviewState,
      snapshot: reviewState.snapshot,
      destroy() { unsubscribe(); if (section.remove) section.remove(); },
    });
  }
  const api = freeze({ PREVIEW_DIR, RECEIPT_SUFFIX, inspectPreview, loadPreviews, createReviewState, mount });
  root.LLMWikiGoldenPreviewWorkbench = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
