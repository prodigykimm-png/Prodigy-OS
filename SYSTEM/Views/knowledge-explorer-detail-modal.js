(function (root) {
  "use strict";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function text(value, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
  function createEl(parent, tag, options = {}) {
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const node = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) node.textContent = String(options.text);
    for (const [key, value] of Object.entries(options.attr || {})) node.setAttribute(key, String(value));
    parent.appendChild(node);
    return node;
  }
  function empty(node) { if (node && typeof node.empty === "function") node.empty(); else while (node && node.firstChild) node.removeChild(node.firstChild); }
  function addClass(node, value) { if (node && typeof node.addClass === "function") node.addClass(value); else if (node && node.classList) node.classList.add(value); else if (node && node.setAttribute) node.setAttribute("class", value); }
  function safeSources(item) { return list(item.sources).filter((source) => plain(source) && text(source.locator)); }
  function claimSet(item) { return plain(item && item.claim_set) ? item.claim_set : { claims: [], citations: [], disputes: [] }; }
  const FIELD_LABELS = Object.freeze({ summary: "요약 결과", document: "생성 문서 전체", sources: "출처 앵커", support: "근거", contradictions: "상충 근거", origins: "기원", derivation: "도출 경로", history: "검토 이력", acceptance: "수용 상태", coverage: "분석 범위", ai_labels: "수용된 AI 분석", corrections: "수정 충돌" });
  function field(parent, id, rows) {
    const section = createEl(parent, "section", { attr: { "data-review-field": id } });
    createEl(section, "h3", { text: FIELD_LABELS[id] || id });
    const listEl = createEl(section, "ul");
    for (const row of rows.length ? rows : ["-"]) createEl(listEl, "li", { text: row });
    return section;
  }
  function renderDetail(content, item, actions) {
    empty(content);
    addClass(content, "modal-content");
    addClass(content, "knowledge-review-detail-modal__content");
    const article = createEl(content, "article", { attr: { class: "knowledge-review-detail-modal", "aria-labelledby": "knowledge-review-detail-title" } });
    const header = createEl(article, "header");
    createEl(header, "h2", { text: text(item.title, "검토 항목"), attr: { id: "knowledge-review-detail-title" } });
    const scroll = createEl(article, "div", { attr: { id: "knowledge-review-detail-scroll", class: "knowledge-review-detail-modal__scroll", "data-scroll-owner": "knowledge-review-detail", tabindex: "0" } });
    const summaryPoints = list(item.summary_points).map((point) => text(point)).filter(Boolean);
    if (summaryPoints.length) field(scroll, "summary", summaryPoints);
    const documentBody = text(item.document_body);
    if (documentBody) {
      const documentSection = createEl(scroll, "section", { attr: { "data-review-field": "document" } });
      createEl(documentSection, "h3", { text: FIELD_LABELS.document });
      createEl(documentSection, "pre", { text: documentBody });
    }
    const sourceRows = safeSources(item);
    const sources = createEl(scroll, "section", { attr: { "data-review-field": "sources" } });
    createEl(sources, "h3", { text: FIELD_LABELS.sources });
    const sourceList = createEl(sources, "ul");
    if (sourceRows.length === 0) createEl(sourceList, "li", { text: "-" });
    sourceRows.forEach((source) => {
      const item = createEl(sourceList, "li");
      createEl(item, "button", { text: source.locator, attr: { type: "button", "data-action": "open-review-source", "data-source-locator": source.locator } });
    });
    const claims = list(claimSet(item).claims).filter(plain);
    const citations = list(claimSet(item).citations).filter(plain);
    const citationIds = new Set(citations.map((citation) => text(citation.citation_id)));
    field(scroll, "support", claims.filter((claim) => list(claim.citation_ids).some((id) => citationIds.has(id))).map((claim) => text(claim.text, text(claim.claim_id))));
    field(scroll, "contradictions", list(claimSet(item).disputes).filter(plain).map((dispute) => text(dispute.dispute_id)));
    field(scroll, "origins", claims.map((claim) => `${text(claim.claim_id)}:${text(claim.origin)}`));
    field(scroll, "derivation", claims.filter((claim) => list(claim.derived_from_claim_ids).length).map((claim) => `${text(claim.claim_id)}:${list(claim.derived_from_claim_ids).join(",")}`));
    field(scroll, "history", list(item.review_history).filter(plain).map((entry) => `${text(entry.state)}:${text(entry.at)}`));
    field(scroll, "acceptance", [text(item.acceptance_state, text(item.review_state, "pending"))]);
    const coverage = plain(item.coverage) ? item.coverage : {};
    field(scroll, "coverage", [text(coverage.status) || (coverage.complete === true ? "완료" : "확인 필요"), text(coverage.receipt_id)].filter(Boolean));
    field(scroll, "ai_labels", list(item.accepted_ai_labels).map(text).filter(Boolean));
    field(scroll, "corrections", list(item.correction_conflicts).map((conflict) => text(plain(conflict) ? conflict.reason || conflict.conflict_id : conflict)).filter(Boolean));
    const footer = createEl(article, "footer");
    article.onclick = (event) => {
      let control = event && event.target;
      while (control && control !== article && (!control.getAttribute || !control.getAttribute("data-action"))) control = control.parentElement;
      if (!control || control === article) return;
      const action = control.getAttribute("data-action");
      if (action === "close-review-detail") {
        if (event.preventDefault) event.preventDefault();
        actions.onClose();
        return;
      }
      if (action !== "open-review-source") return;
      if (event.preventDefault) event.preventDefault();
      const locator = text(control.getAttribute("data-source-locator"));
      const source = sourceRows.find((row) => row.locator === locator);
      if (source) actions.onOpenSource(source);
    };
    return { article, footer };
  }
  function createKnowledgeExplorerDetailModal(options) {
    const config = plain(options) ? options : {};
    const Modal = config.Modal;
    if (typeof Modal !== "function") throw new TypeError("Modal is required");
    let modal = null;
    let item = null;
    let invoker = null;
    function close() { if (modal && typeof modal.close === "function") modal.close(); }
    function render() {
      if (!modal || !modal.contentEl || !item) return;
      const nodes = renderDetail(modal.contentEl, item, {
        onOpenSource(source) { if (typeof config.onOpenSource === "function") config.onOpenSource(source); },
        onClose: close,
      });
      createEl(nodes.footer, "button", { text: "닫기", attr: { type: "button", "data-action": "close-review-detail" } });
    }
    function open(next, origin) {
      if (!plain(next) || !text(next.review_id)) throw new TypeError("review item is required");
      item = next;
      invoker = origin || invoker;
      if (modal) { render(); return true; }
      const created = new Modal(config.app);
      modal = created;
      created.onOpen = () => { if (created.modalEl) { addClass(created.modalEl, "knowledge-review-detail-modal"); addClass(created.modalEl, "knowledge-review-detail-modal__dialog"); if (created.modalEl.setAttribute) created.modalEl.setAttribute("data-surface", "knowledge-review-detail-modal"); } render(); };
      created.onClose = () => {
        if (modal !== created) return;
        modal = null;
        const returnTo = invoker;
        invoker = null;
        item = null;
        if (returnTo && typeof returnTo.focus === "function") returnTo.focus();
      };
      created.open();
      return true;
    }
    function update(next) { if (!modal || !plain(next) || text(next.review_id) !== text(item && item.review_id)) return false; item = next; render(); return true; }
    function state() { return Object.freeze({ open: Boolean(modal), review_id: text(item && item.review_id), provider_count: 0, writer_count: 0 }); }
    return Object.freeze({ open, update, close, state });
  }

  const api = Object.freeze({ createKnowledgeExplorerDetailModal, renderDetail });
  root.KnowledgeExplorerDetailModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
