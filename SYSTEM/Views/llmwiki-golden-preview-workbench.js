(function(root){
  "use strict";
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
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
    if (text(receipt && receipt.orchestrator_version)) {
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
      preview_id: hashApi ? `golden_${hashApi.sha256(documentPath).slice(0, 24)}` : documentPath,
      document_path: documentPath,
      source_path: sourcePath,
      title: titleFromMarkdown(documentBytes, documentPath.split("/").pop().replace(/\.md$/u, "")),
      status: issues.length ? "review_required" : "publishable_preview",
      issues: freeze(issues),
      metrics: plain(receipt && receipt.metrics) ? receipt.metrics : {},
      receipt_hash: text(gateReceipt && gateReceipt.receipt_hash),
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
  function mount(options) {
    const config = plain(options) ? options : {};
    if (!config.container) throw new TypeError("container is required");
    const create = (parent, tag, value, attrs) => {
      if (typeof parent.createEl === "function") return parent.createEl(tag, { text: value, attr: attrs || {} });
      const el = parent.ownerDocument.createElement(tag); if (value) el.textContent = value; Object.entries(attrs || {}).forEach(([key, entry]) => el.setAttribute(key, entry)); parent.appendChild(el); return el;
    };
    const createDiv = (parent, attrs) => typeof parent.createDiv === "function" ? parent.createDiv({ attr: attrs || {} }) : create(parent, "div", "", attrs);
    const reviewed = config.reviewed instanceof Set ? config.reviewed : new Set();
    const section = create(config.container, "section", "", { "data-surface": "llmwiki-golden-preview-workbench" });
    create(section, "h3", "읽기용 Wiki 검토", {});
    create(section, "p", "Golden Gate를 통과한 preview를 읽고 검토합니다. 여기서 검토 완료를 표시해도 정본은 변경되지 않습니다.", { "data-preview-boundary": "human-review-only" });
    function render(rows) {
      const old = section.querySelector && section.querySelector("[data-preview-list]"); if (old && old.remove) old.remove();
      const list = createDiv(section, { "data-preview-list": "" });
      if (!rows.length) { create(list, "p", "검토할 preview가 없습니다.", {}); return; }
      rows.forEach((row) => {
        const card = create(list, "article", "", { "data-preview-id": row.preview_id, "data-gate-status": row.status });
        create(card, "h4", row.title, {});
        const passed = row.status === "publishable_preview";
        create(card, "output", passed ? "Gate 통과 · 사람 검토 대기" : `출고 차단 · ${row.issues.join(", ")}`, { "data-preview-gate": row.status });
        create(card, "p", `구조 ${Math.round(Number(row.metrics.structure_score || 0) * 100)}% · 정보 보존 ${Math.round(Number(row.metrics.critical_token_recall || 0) * 100)}% · 문체 ${Math.round(Number(row.metrics.style_score || 0) * 100)}%`, { "data-preview-metrics": "" });
        const actions = createDiv(card, { "data-preview-actions": "" });
        const openDocument = create(actions, "button", "결과 읽기", { type: "button", "data-action": "open-golden-preview" });
        openDocument.onclick = () => config.onOpen && config.onOpen(row.document_path);
        const openSource = create(actions, "button", "원문 확인", { type: "button", "data-action": "open-golden-source" });
        openSource.onclick = () => config.onOpen && config.onOpen(row.source_path);
        const mark = create(actions, "button", reviewed.has(row.preview_id) ? "검토 완료" : "검토 완료 표시", { type: "button", "data-action": "mark-golden-reviewed" });
        mark.disabled = !row.can_mark_reviewed || reviewed.has(row.preview_id);
        mark.onclick = () => { if (!row.can_mark_reviewed || reviewed.has(row.preview_id)) return; reviewed.add(row.preview_id); mark.disabled = true; mark.textContent = "검토 완료"; if (typeof config.onReviewed === "function") config.onReviewed(row); };
      });
    }
    render(Array.isArray(config.rows) ? config.rows : []);
    return freeze({ render, reviewed, snapshot: () => freeze({ reviewed_ids: freeze([...reviewed]) }) });
  }
  const api = freeze({ PREVIEW_DIR, RECEIPT_SUFFIX, inspectPreview, loadPreviews, mount });
  root.LLMWikiGoldenPreviewWorkbench = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
