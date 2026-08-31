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
  function ensureResultReaderStyle(content) {
    return createEl(content, "style", {
      text: `.knowledge-review-detail-modal__content .knowledge-review-detail-modal{display:grid;grid-template-rows:auto minmax(0,1fr) auto;max-block-size:min(86vh,860px);min-inline-size:min(92vw,720px)}
.knowledge-review-detail-modal__scroll{display:grid;align-content:start;gap:20px;padding:20px;overflow:auto}
.knowledge-review-detail-modal__scroll section,.knowledge-review-detail-modal__scroll article{display:grid;gap:10px}
.knowledge-review-detail-modal__scroll h3,.knowledge-review-detail-modal__scroll p{margin:0;overflow-wrap:anywhere;word-break:keep-all}
[data-review-field="compiled-document"]>section,[data-review-field="compiled-guide"]>section{padding-block-end:16px;border-block-end:1px solid var(--background-modifier-border)}
[data-compiled-paragraph],[data-guide-section] p{line-height:1.75}
.knowledge-review-detail-modal__citations{display:inline-flex!important;flex-wrap:wrap;gap:3px!important;margin-inline-start:5px;vertical-align:baseline}
.knowledge-review-detail-modal__content [data-action="open-grounded-citation"]{display:inline-flex!important;align-items:center;justify-content:center;inline-size:auto!important;min-inline-size:30px!important;min-block-size:30px!important;padding:2px 7px!important;border-radius:999px!important;font-size:.85em;vertical-align:baseline}
[data-citation-warning]{display:inline-block;margin-inline-start:6px;color:var(--text-error);font-size:.9em}
[data-review-field="related-knowledge"]{padding-block-start:12px;border-block-start:1px solid var(--background-modifier-border)}
[data-review-field="related-knowledge"] button,[data-review-field="sources"] button{inline-size:auto;max-inline-size:100%;text-align:start;overflow-wrap:anywhere}
.llmwiki-source-preview{display:grid;gap:14px;max-inline-size:720px}
.llmwiki-source-preview h2,.llmwiki-source-preview h3,.llmwiki-source-preview p,.llmwiki-source-preview blockquote,.llmwiki-source-preview pre{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.llmwiki-source-preview footer{display:flex;flex-wrap:wrap;gap:8px}
.knowledge-review-detail-modal__content button:focus-visible,.knowledge-review-detail-modal__content [tabindex]:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}
@media(max-width:640px){.knowledge-review-detail-modal__content .knowledge-review-detail-modal{min-inline-size:calc(100vw - 24px);max-block-size:92vh}.knowledge-review-detail-modal__scroll{gap:16px;padding:14px}.llmwiki-source-preview footer button{flex:1 1 100%}}
@media(forced-colors:active){[data-action="open-grounded-citation"]{border:1px solid ButtonText}}
@media(prefers-reduced-motion:reduce){.knowledge-review-detail-modal__content *{transition:none!important}}`,
      attr: { id: "llmwiki-result-reader-styles" },
    });
  }
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
  function previewStatus(preview) {
    if (preview && preview.status === "current" && preview.match_status === "unique") return "현재 원문과 일치";
    if (preview && preview.match_status === "ambiguous") return "같은 근거가 여러 곳에 있음";
    if (preview && preview.match_status === "missing") return "원문에서 근거를 찾을 수 없음";
    if (preview && preview.status === "stale") return "원문이 변경됨";
    return "원문 상태 확인 필요";
  }
  function renderSourcePreview(content, preview, actions = {}) {
    empty(content);
    ensureResultReaderStyle(content);
    const article = createEl(content, "article", { attr: { class: "llmwiki-source-preview", "data-surface": "llmwiki-source-preview" } });
    createEl(article, "h2", { text: "출처 근거" });
    createEl(article, "p", { text: previewStatus(preview), attr: { "data-source-freshness": preview && preview.status || "unknown" } });
    if (text(preview && preview.evidence_quote)) {
      createEl(article, "h3", { text: "정확한 근거" });
      createEl(article, "blockquote", { text: text(preview.evidence_quote), attr: { "data-source-evidence": "" } });
    }
    if (text(preview && preview.context)) {
      createEl(article, "h3", { text: "주변 문맥" });
      createEl(article, "pre", { text: text(preview.context), attr: { "data-source-context": "" } });
    }
    const controls = createEl(article, "footer");
    if (text(preview && preview.source_path)) {
      const open = createEl(controls, "button", { text: "원문 파일 열기", attr: { type: "button", "data-action": "open-source-file" } });
      open.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onOpenSource === "function") actions.onOpenSource(preview); };
    }
    const position = preview && preview.position;
    if (position && Number.isSafeInteger(position.line) && Number.isSafeInteger(position.ch)) {
      const edit = createEl(controls, "button", { text: "원문 수정", attr: { type: "button", "data-action": "edit-source-file" } });
      edit.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onEditSource === "function") actions.onEditSource(preview); };
    }
    const close = createEl(controls, "button", { text: "닫기", attr: { type: "button", "data-action": "close-source-preview" } });
    close.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onClose === "function") actions.onClose(); };
    return article;
  }
  function renderDetail(content, item, actions) {
    empty(content);
    ensureResultReaderStyle(content);
    addClass(content, "modal-content");
    addClass(content, "knowledge-review-detail-modal__content");
    const article = createEl(content, "article", { attr: { class: "knowledge-review-detail-modal", "aria-labelledby": "knowledge-review-detail-title" } });
    const header = createEl(article, "header");
    createEl(header, "h2", { text: text(item.title, "검토 항목"), attr: { id: "knowledge-review-detail-title" } });
    const scroll = createEl(article, "div", { attr: { id: "knowledge-review-detail-scroll", class: "knowledge-review-detail-modal__scroll", "data-scroll-owner": "knowledge-review-detail", tabindex: "0" } });
    const groundedClaims = list(item.grounded_claims).filter((claim) => plain(claim) && text(claim.text));
    const compiledSections = item.compiled_kind === "topic_article"
      ? list(item.compiled_sections).filter((section) => plain(section) && text(section.heading) && list(section.paragraphs).length)
      : [];
    const compiledGuideSections = item.compiled_kind === "source_guide"
      ? list(item.compiled_sections).filter((section) => plain(section) && text(section.heading) && text(section.summary))
      : [];
    const claimById = new Map(groundedClaims.map((claim) => [text(claim.claim_id), claim]));
    const citationsFor = (claimIds) => [...new Map(list(claimIds).flatMap((claimId) => list(claimById.get(text(claimId))?.citations))
      .filter(plain).map((citation) => [text(citation.citation_id, String(citation.number)), citation])).values()]
      .sort((left, right) => Number(left.number) - Number(right.number));
    if (compiledGuideSections.length) {
      const overview = createEl(scroll, "section", { attr: { "data-review-field": "guide-overview" } });
      createEl(overview, "h3", { text: "자료 개요" });
      createEl(overview, "p", { text: text(item.wiki_result?.overview, "자료의 전체 구조와 근거를 안내합니다.") });
      const guide = createEl(scroll, "article", { attr: { "data-review-field": "compiled-guide" } });
      compiledGuideSections.forEach((section, sectionIndex) => {
        const sectionEl = createEl(guide, "section", { attr: { "data-guide-section": String(sectionIndex + 1) } });
        createEl(sectionEl, "h3", { text: text(section.heading) });
        const summary = createEl(sectionEl, "p");
        createEl(summary, "span", { text: text(section.summary) });
        const citations = citationsFor(section.claim_ids);
        if (citations.length) {
          const citationList = createEl(summary, "span", { attr: { class: "knowledge-review-detail-modal__citations" } });
          citations.forEach((citation) => {
            const cite = createEl(citationList, "button", { text: `[${Number(citation.number)}]`, attr: { type: "button", "data-action": "open-grounded-citation", "data-citation-number": String(Number(citation.number)) } });
            cite.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onOpenCitation === "function") actions.onOpenCitation(citation); };
          });
        }
      });
    } else if (compiledSections.length) {
      if (text(item.plan_purpose)) {
        const purpose = createEl(scroll, "section", { attr: { "data-review-field": "purpose" } });
        createEl(purpose, "h3", { text: "이 문서가 다루는 것" });
        createEl(purpose, "p", { text: text(item.plan_purpose) });
      }
      const compiled = createEl(scroll, "article", { attr: { "data-review-field": "compiled-document" } });
      let paragraphIndex = 0;
      compiledSections.forEach((section) => {
        const sectionEl = createEl(compiled, "section");
        createEl(sectionEl, "h3", { text: text(section.heading) });
        list(section.paragraphs).filter(plain).forEach((paragraph) => {
          paragraphIndex += 1;
          const row = createEl(sectionEl, "p", { attr: { "data-compiled-paragraph": String(paragraphIndex) } });
          createEl(row, "span", { text: text(paragraph.text) });
          const citations = citationsFor(paragraph.claim_ids);
          if (citations.length) {
            const citationList = createEl(row, "span", { attr: { class: "knowledge-review-detail-modal__citations" } });
            citations.forEach((citation) => {
              const cite = createEl(citationList, "button", { text: `[${Number(citation.number)}]`, attr: { type: "button", "data-action": "open-grounded-citation", "data-citation-number": String(Number(citation.number)) } });
              cite.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onOpenCitation === "function") actions.onOpenCitation(citation); };
            });
          } else {
            createEl(row, "span", { text: "근거 연결 확인 필요", attr: { "data-citation-warning": "" } });
          }
        });
      });
      const related = list(item.related_knowledge).filter((entry) => plain(entry) && text(entry.title) && text(entry.path) && Number(entry.covered_claim_count || 0) > 0).slice(0, 2);
      if (related.length) {
        const relatedPanel = createEl(scroll, "section", { attr: { "data-review-field": "related-knowledge", "data-related-knowledge": "" } });
        createEl(relatedPanel, "h3", { text: "관련 지식" });
        related.forEach((entry) => {
          const row = createEl(relatedPanel, "div");
          const link = createEl(row, "button", { text: text(entry.title), attr: { type: "button", "data-action": "open-related-knowledge", "data-related-path": text(entry.path) } });
          link.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onOpenRelated === "function") actions.onOpenRelated(text(entry.path)); };
          createEl(row, "p", { text: `${entry.relation === "duplicate" ? "기존 문서 보강 후보" : "관련 주제"} · 관련 근거 ${Number(entry.covered_claim_count || 0)}개` });
        });
      }
    } else if (groundedClaims.length) {
      if (text(item.plan_purpose)) {
        const purpose = createEl(scroll, "section", { attr: { "data-review-field": "purpose" } });
        createEl(purpose, "h3", { text: "이 문서가 다루는 것" });
        createEl(purpose, "p", { text: text(item.plan_purpose) });
      }
      const grounded = createEl(scroll, "section", { attr: { "data-review-field": "grounded-document" } });
      createEl(grounded, "h3", { text: "핵심 내용" });
      const claimList = createEl(grounded, "ul");
      groundedClaims.forEach((claim) => {
        const row = createEl(claimList, "li", { attr: { "data-grounded-claim": text(claim.claim_id) } });
        createEl(row, "span", { text: text(claim.text) });
        const citationList = createEl(row, "span", { attr: { class: "knowledge-review-detail-modal__citations" } });
        list(claim.citations).filter(plain).forEach((citation) => {
          const cite = createEl(citationList, "button", { text: `[근거 ${Number(citation.number)}]`, attr: { type: "button", "data-action": "open-grounded-citation", "data-citation-number": String(Number(citation.number)) } });
          cite.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onOpenCitation === "function") actions.onOpenCitation(citation); };
        });
      });
      const related = list(item.related_knowledge).filter((entry) => plain(entry) && text(entry.title) && text(entry.path) && Number(entry.covered_claim_count || 0) > 0).slice(0, 2);
      if (related.length) {
        const relatedPanel = createEl(scroll, "section", { attr: { "data-review-field": "related-knowledge", "data-related-knowledge": "" } });
        createEl(relatedPanel, "h3", { text: "관련 Knowledge" });
        related.forEach((entry) => {
          const row = createEl(relatedPanel, "div");
          const link = createEl(row, "button", { text: text(entry.title), attr: { type: "button", "data-action": "open-related-knowledge", "data-related-path": text(entry.path) } });
          link.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof actions.onOpenRelated === "function") actions.onOpenRelated(text(entry.path)); };
          createEl(row, "p", { text: `${entry.relation === "duplicate" ? "기존 문서 보강 후보" : "관련 주제"} · 관련 근거 ${Number(entry.covered_claim_count || 0)}개` });
        });
      }
    } else {
      const summaryPoints = list(item.summary_points).map((point) => text(point)).filter(Boolean);
      if (summaryPoints.length) field(scroll, "summary", summaryPoints);
      const documentBody = text(item.document_body);
      if (documentBody) {
        const documentSection = createEl(scroll, "section", { attr: { "data-review-field": "document" } });
        createEl(documentSection, "h3", { text: FIELD_LABELS.document });
        createEl(documentSection, "pre", { text: documentBody });
      }
    }
    const rawSourceRows = safeSources(item);
    const sourceRows = groundedClaims.length || compiledSections.length || compiledGuideSections.length
      ? [...new Map(rawSourceRows.map((source) => {
        const path = text(source.locator).split("#")[0];
        return [path, { ...source, locator: path, label: path.split("/").pop() || path }];
      })).values()]
      : rawSourceRows;
    const sources = createEl(scroll, "section", { attr: { "data-review-field": "sources" } });
    createEl(sources, "h3", { text: FIELD_LABELS.sources });
    const sourceList = createEl(sources, "ul");
    if (sourceRows.length === 0) createEl(sourceList, "li", { text: "-" });
    sourceRows.forEach((source) => {
      const item = createEl(sourceList, "li");
      createEl(item, "button", { text: text(source.label, source.locator), attr: { type: "button", "data-action": "open-review-source", "data-source-locator": source.locator } });
    });
    const coverage = plain(item.coverage) ? item.coverage : {};
    if (groundedClaims.length || compiledSections.length || compiledGuideSections.length) {
      field(scroll, "coverage", [text(coverage.status) || (coverage.complete === true ? "완료" : "확인 필요")]);
    } else {
      const claims = list(claimSet(item).claims).filter(plain);
      const citations = list(claimSet(item).citations).filter(plain);
      const citationIds = new Set(citations.map((citation) => text(citation.citation_id)));
      field(scroll, "support", claims.filter((claim) => list(claim.citation_ids).some((id) => citationIds.has(id))).map((claim) => text(claim.text, text(claim.claim_id))));
      field(scroll, "contradictions", list(claimSet(item).disputes).filter(plain).map((dispute) => text(dispute.dispute_id)));
      field(scroll, "origins", claims.map((claim) => `${text(claim.claim_id)}:${text(claim.origin)}`));
      field(scroll, "derivation", claims.filter((claim) => list(claim.derived_from_claim_ids).length).map((claim) => `${text(claim.claim_id)}:${list(claim.derived_from_claim_ids).join(",")}`));
      field(scroll, "history", list(item.review_history).filter(plain).map((entry) => `${text(entry.state)}:${text(entry.at)}`));
      field(scroll, "acceptance", [text(item.acceptance_state, text(item.review_state, "pending"))]);
      field(scroll, "coverage", [text(coverage.status) || (coverage.complete === true ? "완료" : "확인 필요"), text(coverage.receipt_id)].filter(Boolean));
      field(scroll, "ai_labels", list(item.accepted_ai_labels).map(text).filter(Boolean));
      field(scroll, "corrections", list(item.correction_conflicts).map((conflict) => text(plain(conflict) ? conflict.reason || conflict.conflict_id : conflict)).filter(Boolean));
    }
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
    let sourceModal = null;
    let item = null;
    let invoker = null;
    function close() { if (sourceModal && typeof sourceModal.close === "function") sourceModal.close(); if (modal && typeof modal.close === "function") modal.close(); }
    function openCitation(citation) {
      const created = new Modal(config.app);
      sourceModal = created;
      const fallback = {
        ok: Boolean(text(citation && (citation.source_path || citation.locator))),
        status: "unknown",
        match_status: "unavailable",
        source_path: text(citation && citation.source_path) || text(citation && citation.locator).split("#")[0],
        evidence_quote: text(citation && citation.evidence_quote),
        context: "",
        position: null,
      };
      const draw = (preview) => renderSourcePreview(created.contentEl, preview, {
        onOpenSource(value) { if (typeof config.onOpenSource === "function") config.onOpenSource({ ...citation, ...value }); },
        onEditSource(value) { if (typeof config.onEditSource === "function") config.onEditSource(value); },
        onClose() { created.close(); },
      });
      created.onOpen = () => {
        draw(fallback);
        try {
          const resolved = typeof config.resolveSourcePreview === "function" ? config.resolveSourcePreview(citation) : fallback;
          Promise.resolve(resolved).then((value) => draw(value && value.ok ? value : fallback)).catch(() => draw(fallback));
        } catch (_error) {
          draw(fallback);
        }
      };
      created.onClose = () => { if (sourceModal === created) sourceModal = null; };
      created.open();
    }
    function render() {
      if (!modal || !modal.contentEl || !item) return;
      const nodes = renderDetail(modal.contentEl, item, {
        onOpenSource(source) { if (typeof config.onOpenSource === "function") config.onOpenSource(source); },
        onOpenCitation: openCitation,
        onOpenRelated(target) { if (typeof config.onOpenRelated === "function") config.onOpenRelated(target); },
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

  const api = Object.freeze({ createKnowledgeExplorerDetailModal, renderDetail, renderSourcePreview });
  root.KnowledgeExplorerDetailModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
