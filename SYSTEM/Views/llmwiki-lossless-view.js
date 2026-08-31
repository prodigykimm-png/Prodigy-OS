(function (root) {
  "use strict";
  function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
  function createEl(parent, tag, options) { return parent.createEl ? parent.createEl(tag, options) : null; }
  function createLosslessCorpusView(config) {
    if (!config?.app || !config.dataSource) throw new TypeError("lossless_view_config_required");
    let state = { source_path: null, page_kind: "index", page_id: null, claim_page: 0 };
    let overlay = null;
    function persist() { config.session.selectedLosslessCorpus = { ...state }; }
    async function openSource(claim, sourcePath) {
      const file = config.app.vault.getAbstractFileByPath(sourcePath);
      if (!file) return;
      const leaf = config.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      config.app.workspace.setActiveLeaf(leaf, { focus: true });
      const editor = leaf.view?.editor;
      if (!editor) return;
      const text = await config.app.vault.cachedRead(file);
      const before = text.slice(0, claim.global_span.start);
      const line = before.split("\n").length - 1;
      const ch = claim.global_span.start - (before.lastIndexOf("\n") + 1);
      editor.setCursor({ line, ch }); editor.scrollIntoView({ from: { line, ch }, to: { line, ch } }, true);
    }
    function close() { overlay?.remove(); overlay = null; }
    async function render(sourcePath, target) {
      const result = await config.dataSource.get(sourcePath);
      if (!result) throw new Error("lossless_corpus_not_found");
      state = { source_path: sourcePath, page_kind: target?.page_kind || state.page_kind || "index", page_id: target?.page_id || null,
        claim_page: Number.isSafeInteger(target?.claim_page) ? target.claim_page : target?.page_id === state.page_id ? state.claim_page || 0 : 0 }; persist();
      close(); overlay = document.body.createDiv({ cls: "modal-container", attr: { "data-surface": "llmwiki-lossless-corpus" } });
      const modal = overlay.createDiv({ cls: "modal mod-dim", attr: { role: "dialog", "aria-modal": "true" } });
      const content = modal.createDiv({ cls: "modal-content" });
      const header = content.createDiv({ cls: "modal-header" });
      createEl(header, "h2", { text: `${result.corpus_index.title} · 무손실 위키` });
      const closeButton = createEl(header, "button", { text: "닫기", attr: { type: "button", "data-action": "close-lossless-corpus" } }); closeButton.onclick = close;
      const nav = content.createDiv({ attr: { "data-lossless-nav": "" } });
      const indexButton = createEl(nav, "button", { text: "전체 색인", attr: { type: "button", "data-action": "open-lossless-index" } }); indexButton.onclick = () => render(sourcePath, { page_kind: "index" });
      const body = content.createDiv({ attr: { "data-lossless-page": state.page_kind } });
      const pilot = await config.dataSource.getSemanticPilot(sourcePath);
      if (pilot && state.page_kind === "index") {
        const pilotBox = body.createDiv({ attr: { "data-semantic-pilot-entry": "" } });
        createEl(pilotBox, "h3", { text: "편집된 위키 Pilot" });
        const pilotButton = createEl(pilotBox, "button", { text: pilot.draft.title, attr: { type: "button", "data-action": "open-semantic-pilot" } });
        pilotButton.onclick = () => render(sourcePath, { page_kind: "semantic", page_id: "house-building-pilot" });
      }
      if (state.page_kind === "semantic" && pilot) {
        createEl(body, "h3", { text: pilot.draft.title });
        createEl(body, "p", { text: `원자 정보 ${pilot.atoms.length}개 · lineage ${pilot.audit.lineage_complete ? "완전" : "불완전"} · 숫자 손실 ${pilot.audit.missing_numbers.length}건`, attr: { "data-semantic-audit": "" } });
        const atomById = new Map(pilot.atoms.map((atom) => [atom.atom_id, atom]));
        for (const section of pilot.draft.sections) {
          const sectionEl = body.createDiv({ attr: { "data-semantic-section": section.kind } }); createEl(sectionEl, "h4", { text: section.heading });
          for (const paragraph of section.paragraphs) {
            const row = sectionEl.createDiv({ attr: { "data-semantic-paragraph": "" } }); createEl(row, "p", { text: paragraph.text });
            const evidence = row.createDiv({ attr: { "data-semantic-evidence": "" } });
            for (const atomId of paragraph.atom_ids) {
              const atom = atomById.get(atomId);
              const badge = createEl(evidence, "button", { text: atom?.text?.slice(0, 70) || atomId, attr: { type: "button", "data-atom-id": atomId, "data-navigation-state": "idle" } });
              badge.onclick = async () => {
                const parent = result.claim_rows.find((claim) => claim.claim_id === atom?.parent_claim_id);
                if (!parent) return;
                badge.dataset.navigationState = "running";
                await openSource(parent, result.source_path);
                badge.dataset.navigationState = "complete";
              };
            }
          }
        }
      } else if (state.page_kind === "index") {
        createEl(body, "p", { text: `claim ${result.claims}개 · 주제 ${result.topic_pages}개 · 원문 상세 ${result.source_details}개`, attr: { "data-lossless-summary": "" } });
        const topics = body.createDiv({ attr: { "data-lossless-topics": "" } }); createEl(topics, "h3", { text: "주제별 문서" });
        for (const page of result.topics) { const b = createEl(topics, "button", { text: `${page.title} (${page.claim_ids.length})`, attr: { type: "button", "data-topic-id": page.page_id } }); b.onclick = () => render(sourcePath, { page_kind: "topic", page_id: page.page_id }); }
        const details = body.createDiv({ attr: { "data-lossless-details": "" } }); createEl(details, "h3", { text: "원문별 상세" });
        for (const page of result.details) { const b = createEl(details, "button", { text: `${page.title} (${page.claim_ids.length})`, attr: { type: "button", "data-detail-id": page.page_id } }); b.onclick = () => render(sourcePath, { page_kind: "detail", page_id: page.page_id }); }
      } else {
        const page = state.page_kind === "topic" ? result.topics.find((row) => row.page_id === state.page_id) : result.details.find((row) => row.page_id === state.page_id);
        if (!page) throw new Error("lossless_page_not_found");
        createEl(body, "h3", { text: page.title });
        const claimRows = result.claim_rows || [];
        const pageSize = 50;
        const totalPages = Math.max(1, Math.ceil(page.claim_ids.length / pageSize));
        state.claim_page = Math.min(state.claim_page, totalPages - 1); persist();
        const visibleIds = page.claim_ids.slice(state.claim_page * pageSize, (state.claim_page + 1) * pageSize);
        if (totalPages > 1) {
          const pager = body.createDiv({ attr: { "data-lossless-pager": "" } });
          const previous = createEl(pager, "button", { text: "이전", attr: { type: "button", "data-action": "lossless-previous-page" } });
          previous.disabled = state.claim_page === 0; previous.onclick = () => render(sourcePath, { page_kind: state.page_kind, page_id: state.page_id, claim_page: state.claim_page - 1 });
          createEl(pager, "span", { text: `${state.claim_page + 1} / ${totalPages}`, attr: { "data-lossless-page-number": "" } });
          const next = createEl(pager, "button", { text: "다음", attr: { type: "button", "data-action": "lossless-next-page" } });
          next.disabled = state.claim_page >= totalPages - 1; next.onclick = () => render(sourcePath, { page_kind: state.page_kind, page_id: state.page_id, claim_page: state.claim_page + 1 });
        }
        for (const id of visibleIds) {
          const claim = claimRows.find((row) => row.claim_id === id);
          const row = body.createDiv({ attr: { "data-lossless-claim": id } });
          createEl(row, "p", { text: claim?.text || id });
          if (claim) {
            const b = createEl(row, "button", { text: "원문에서 보기", attr: { type: "button", "data-action": "open-lossless-source", "data-navigation-state": "idle" } });
            b.onclick = async () => {
              b.dataset.navigationState = "running";
              await openSource(claim, result.source_path);
              b.dataset.navigationState = "complete";
            };
          }
        }
        if (state.page_kind === "topic") for (const detailId of page.source_detail_ids) { const detail = result.details.find((row) => row.page_id === detailId); const b = createEl(body, "button", { text: `원문 상세: ${detail?.title || detailId}`, attr: { type: "button", "data-detail-id": detailId } }); b.onclick = () => render(sourcePath, { page_kind: "detail", page_id: detailId }); }
      }
      return freeze({ source_path: sourcePath, page_kind: state.page_kind, page_id: state.page_id });
    }
    return freeze({ open: (sourcePath) => render(sourcePath, config.session.selectedLosslessCorpus?.source_path === sourcePath ? config.session.selectedLosslessCorpus : { page_kind: "index" }), render, close, snapshot: () => freeze({ ...state }) });
  }
  const api = freeze({ createLosslessCorpusView }); root.LLMWikiLosslessView = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
