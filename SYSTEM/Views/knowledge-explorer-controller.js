(function (root) {
  "use strict";

  const GROUPS = Object.freeze([
    Object.freeze({ id: "plan", label: "문서 계획", destinations: [] }),
    Object.freeze({ id: "pilot", label: "파일럿 문서", destinations: [] }),
    Object.freeze({ id: "queue", label: "대기열", destinations: ["none"], analysis: ["queued", "running", "cache_complete"] }),
    Object.freeze({ id: "literature", label: "문헌", destinations: ["literature"] }),
    Object.freeze({ id: "fleeting", label: "생각", destinations: ["fleeting"] }),
    Object.freeze({ id: "candidate", label: "후보", destinations: ["knowledge_candidate"] }),
    Object.freeze({ id: "canonical_review", label: "정본 검토", destinations: ["canonical_knowledge"] }),
    Object.freeze({ id: "para_handoff", label: "PARA 전달", destinations: ["para_object"] }),
    Object.freeze({ id: "holds", label: "보류", destinations: ["none"], review: ["hold", "stale", "recovery", "rejected"] }),
  ]);
  const DESTINATIONS = new Set(["none", "literature", "fleeting", "knowledge_candidate", "canonical_knowledge", "para_object"]);
  const REVIEW_STATES = new Set(["pending", "approved", "rejected", "hold", "stale", "recovery"]);
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value : []; }
  function freeze(value) { return Object.freeze(value); }
  function createEl(parent, tag, options = {}) {
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const node = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) node.textContent = String(options.text);
    Object.entries(options.attr || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent.appendChild(node);
    return node;
  }
  function empty(node) { if (typeof node.empty === "function") node.empty(); else while (node.firstChild) node.removeChild(node.firstChild); }
  function ensureWikiResultStyle(container) {
    const style = createEl(container, "style", {
      text: `.knowledge-review-workbench [data-surface="llmwiki-wiki-result"]{display:grid!important;gap:24px!important;padding:20px!important;border:1px solid var(--background-modifier-border);border-radius:14px;background:var(--background-primary);min-inline-size:0;overflow:clip}
[data-surface="llmwiki-wiki-result"] *{box-sizing:border-box;min-inline-size:0}
[data-surface="llmwiki-wiki-result"] button{max-inline-size:100%;white-space:normal;overflow-wrap:anywhere;word-break:keep-all}
.knowledge-review-workbench .llmwiki-wiki-result__header{display:grid!important;gap:10px!important}
.llmwiki-wiki-result__header h2,.llmwiki-wiki-result__header p{margin:0}
.knowledge-review-workbench .llmwiki-wiki-result__header>button{inline-size:auto!important;justify-self:start}
[data-wiki-summary]{color:var(--text-muted);overflow-wrap:anywhere}
[data-wiki-reading-order]{display:grid;gap:8px}
[data-wiki-reading-order]{overflow:hidden}
[data-wiki-reading-order] ol{display:flex;flex-wrap:wrap;gap:8px;max-inline-size:100%;margin:0;padding:0;list-style:none}
[data-wiki-reading-order] button{min-block-size:36px;padding:6px 10px;border-radius:999px}
[data-wiki-document-map],[data-wiki-compiled-documents]{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px!important}
.knowledge-review-workbench [data-wiki-topic],.knowledge-review-workbench [data-compiled-document]{display:grid!important;align-content:start;gap:10px!important;padding:16px!important;border:1px solid var(--background-modifier-border);border-radius:12px;background:var(--background-secondary);overflow:hidden}
[data-wiki-topic] h4,[data-compiled-document] h4,[data-wiki-topic] p,[data-compiled-document] p{margin:0;overflow-wrap:anywhere;word-break:keep-all}
[data-related-knowledge]{display:grid;gap:6px;padding-block-start:8px;border-block-start:1px solid var(--background-modifier-border)}
[data-related-knowledge] h5,[data-related-knowledge] p{margin:0}
[data-related-knowledge] button{inline-size:auto;max-inline-size:100%;text-align:start;overflow-wrap:anywhere}
.llmwiki-wiki-result__actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-block-start:auto}
.llmwiki-wiki-result__actions details{inline-size:100%}
.llmwiki-wiki-result__actions details>div{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-block-start:8px}
[data-wiki-actions] summary{cursor:pointer;color:var(--text-muted)}
[data-surface="llmwiki-wiki-result"] button:focus-visible,[data-surface="llmwiki-wiki-result"] summary:focus-visible,[data-wiki-topic]:focus-visible,[data-compiled-document]:focus-visible{outline:2px solid var(--text-accent);outline-offset:2px}
@media(max-width:833px){.knowledge-review-workbench [data-surface="llmwiki-wiki-result"]{gap:14px!important;padding:14px!important}.llmwiki-wiki-result__header h2{font-size:clamp(1.5rem,6vw,2rem);line-height:1.2}[data-wiki-overview]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}[data-wiki-document-map],[data-wiki-compiled-documents]{grid-template-columns:minmax(0,1fr)}[data-wiki-reading-order] ol{flex-wrap:nowrap;overflow-x:auto;padding-block-end:4px}[data-wiki-reading-order] li{flex:0 0 min(78%,260px)}[data-wiki-reading-order] button{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;inline-size:100%;overflow:hidden}}
@media(max-width:320px){.knowledge-review-workbench [data-surface="llmwiki-wiki-result"]{gap:10px!important;padding:6px!important}.knowledge-review-workbench [data-wiki-topic],.knowledge-review-workbench [data-compiled-document]{padding:6px!important}.llmwiki-wiki-result__header h2{font-size:1.25rem}}
@media(forced-colors:active){[data-wiki-topic],[data-compiled-document]{border:1px solid CanvasText}}
@media(prefers-reduced-motion:reduce){[data-surface="llmwiki-wiki-result"] *{scroll-behavior:auto!important;transition:none!important}}`,
      attr: { id: "llmwiki-wiki-result-styles" },
    });
    return style;
  }
  function normalizeItem(value) {
    if (!plain(value) || !ID.test(text(value.review_id)) || !DESTINATIONS.has(text(value.destination)) || !REVIEW_STATES.has(text(value.review_state))) throw new TypeError("invalid_review_item");
    return freeze({ ...value, review_id: text(value.review_id), destination: text(value.destination), review_state: text(value.review_state), analysis_state: text(value.analysis_state) || "complete", promotion_gaps: list(value.promotion_gaps).filter(plain) });
  }
  function groupFor(item) {
    if (item.plan === true) return "plan";
    if (item.pilot === true) return "pilot";
    if (["hold", "stale", "recovery", "rejected"].includes(item.review_state)) return "holds";
    if (["queued", "running", "cache_complete"].includes(item.analysis_state)) return "queue";
    return GROUPS.find((group) => group.destinations.includes(item.destination) && group.id !== "holds")?.id || "queue";
  }
  function buildReviewGroups(items, options = {}) {
    if (!Array.isArray(items)) throw new TypeError("review_items_required");
    const filter = options.filter === "all" ? "all" : "pending";
    const seen = new Set();
    const buckets = new Map(GROUPS.map((group) => [group.id, []]));
    for (const raw of items) {
      const item = normalizeItem(raw);
      if (seen.has(item.review_id)) throw new TypeError("duplicate_review_id");
      seen.add(item.review_id);
      buckets.get(groupFor(item)).push(item);
    }
    return GROUPS.map((group) => {
      const rows = buckets.get(group.id).sort((left, right) => left.review_id.localeCompare(right.review_id, "en"));
      const visible = rows.filter((row) => filter === "all" || row.review_state === "pending");
      return freeze({ id: group.id, label: group.label, total: rows.length, pending: rows.filter((row) => row.review_state === "pending").length, visible: visible.length, items: freeze(visible) });
    });
  }
  function moduleApi(name, relative) { return root[name] || (typeof require === "function" ? require(relative) : null); }
  function operationLabel(item) {
    const labels = { create: "새 항목", update: "업데이트", merge: "병합", noop: "변경 없음", hold: "보류", stale: "오래된 검토", recovery: "복구 필요", rejected: "반려됨" };
    return labels[text(item.review_state)] || labels[text(item.operation)] || "검토 대기";
  }
  function mountKnowledgeReviewWorkbench(options) {
    const config = plain(options) ? options : {};
    if (!config.container) throw new TypeError("container is required");
    const commands = config.commands || moduleApi("KnowledgeCommandController", "./knowledge-command-controller.js");
    const detailsApi = config.detailsApi || moduleApi("KnowledgeExplorerDetailModal", "./knowledge-explorer-detail-modal.js");
    if (!commands || !detailsApi) throw new TypeError("review workbench modules are required");
    const command = config.command || commands.createKnowledgeCommandController(config.actions || {});
    const detail = config.detail || (config.Modal ? detailsApi.createKnowledgeExplorerDetailModal({
      app: config.app,
      Modal: config.Modal,
      onOpenSource: config.onOpenSource,
      onEditSource: config.onEditSource,
      resolveSourcePreview: config.resolveSourcePreview,
      onOpenRelated: config.onOpenRelated,
    }) : null);
    let items = list(config.items);
    let filter = "pending";
    let rootEl = null;
    const mergeSelected = new Set();
    function dispatch(type, item, invoker) {
      Promise.resolve(command.execute({ type, item })).then(() => render());
      if (type === "open_detail" && detail) detail.open(item, invoker);
    }
    function renderWikiResult(section, group) {
      const compiled = group.items.filter((item) => item.plan_kind === "compiled_document");
      if (compiled.length) {
        const guide = compiled.find((item) => item.compiled_kind === "source_guide");
        if (!guide) return false;
        const documents = compiled.filter((item) => item.compiled_kind === "topic_article")
          .sort((left, right) => Number(left.compiled_order || 0) - Number(right.compiled_order || 0)
            || text(left.title).localeCompare(text(right.title), "ko"));
        const meta = plain(guide.wiki_result) ? guide.wiki_result : {};
        const result = createEl(section, "article", { attr: { class: "llmwiki-wiki-result", "data-surface": "llmwiki-wiki-result", "data-result-stage": "compiled" } });
        const header = createEl(result, "header", { attr: { class: "llmwiki-wiki-result__header" } });
        const baseTitle = text(guide.title).replace(/\s*자료 안내$/u, "").trim() || "자료";
        createEl(header, "h2", { text: `${baseTitle} Wiki 결과 미리보기` });
        if (text(meta.overview)) createEl(header, "p", { text: text(meta.overview), attr: { "data-wiki-overview": "" } });
        createEl(header, "output", {
          text: `근거 문장 ${Number(meta.total_claims || 0)}개 · 결과 문서 ${documents.length}개 · 원문 전용 ${Number(meta.source_only_count || 0)}건`,
          attr: { "data-wiki-summary": "" },
        });
        if (meta.quality_status === "publishable") {
          createEl(header, "output", {
            text: `출고 가능 · 문장 품질 검증 완료${Number(meta.quality_rewrite_count || 0) > 0 ? ` · 자동 정제 ${Number(meta.quality_rewrite_count)}회` : ""}`,
            attr: { "data-wiki-quality-status": "publishable" },
          });
        }
        const guideOpen = createEl(header, "button", { text: "자료 안내 읽기", attr: { type: "button", "data-action": "open-review-detail" } });
        guideOpen.onclick = () => { if (detail) detail.open(guide, guideOpen); };
        if (documents.length) {
          const cardById = new Map();
          const order = createEl(result, "section", { attr: { "data-wiki-reading-order": "" } });
          createEl(order, "h3", { text: "결과 문서" });
          const ordered = createEl(order, "ol");
          documents.forEach((item, index) => {
            const row = createEl(ordered, "li");
            const jump = createEl(row, "button", { text: `${index + 1}. ${text(item.title) || item.review_id}`, attr: { type: "button", "data-action": "jump-wiki-document", "data-target-review-id": item.review_id } });
            jump.onclick = (event) => {
              if (event && event.preventDefault) event.preventDefault();
              const target = cardById.get(item.review_id);
              if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start", behavior: "smooth" });
              if (target && typeof target.focus === "function") target.focus();
            };
          });
          const reader = createEl(result, "section", { attr: { "data-wiki-compiled-documents": "" } });
          documents.forEach((item) => {
            const card = createEl(reader, "article", { attr: { "data-review-id": item.review_id, "data-review-plan": "true", "data-compiled-document": item.review_id, tabindex: "-1" } });
            cardById.set(item.review_id, card);
            createEl(card, "h4", { text: text(item.title) || item.review_id });
            if (text(item.plan_purpose)) createEl(card, "p", { text: text(item.plan_purpose), attr: { "data-wiki-purpose": "" } });
            createEl(card, "output", { text: `근거 ${Number(item.plan_claim_count || 0)}개`, attr: { "data-wiki-evidence-count": "" } });
            const related = list(item.related_knowledge).filter((entry) => plain(entry) && text(entry.title) && text(entry.path) && Number(entry.covered_claim_count || 0) > 0).slice(0, 2);
            if (related.length) {
              const relatedPanel = createEl(card, "section", { attr: { "data-related-knowledge": "" } });
              createEl(relatedPanel, "h5", { text: "관련 지식" });
              related.forEach((entry) => {
                const row = createEl(relatedPanel, "div");
                const link = createEl(row, "button", { text: text(entry.title), attr: { type: "button", "data-action": "open-related-knowledge", "data-related-path": text(entry.path) } });
                link.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof config.onOpenRelated === "function") config.onOpenRelated(text(entry.path)); };
                createEl(row, "p", { text: `${entry.relation === "duplicate" ? "기존 문서 보강 후보" : "관련 주제"} · 관련 근거 ${Number(entry.covered_claim_count || 0)}개` });
              });
            }
            const actions = createEl(card, "div", { attr: { class: "llmwiki-wiki-result__actions" } });
            const open = createEl(actions, "button", { text: "결과 읽기", attr: { type: "button", "data-action": "open-review-detail" } });
            open.onclick = () => { if (detail) detail.open(item, open); };
          });
        }
        return true;
      }
      const guide = group.items.find((item) => item.plan_kind === "source_guide");
      if (!guide) return false;
      const meta = plain(guide.wiki_result) ? guide.wiki_result : {};
      const topics = group.items.filter((item) => item.plan_kind === "topic_page")
        .sort((left, right) => Number(left.plan_order || 0) - Number(right.plan_order || 0)
          || text(left.title).localeCompare(text(right.title), "ko"));
      const activeTopics = topics.filter((item) => item.plan_selected !== false);
      const heldTopics = topics.filter((item) => item.plan_selected === false);
      const result = createEl(section, "article", { attr: { class: "llmwiki-wiki-result", "data-surface": "llmwiki-wiki-result", "data-result-stage": "plan" } });
      const header = createEl(result, "header", { attr: { class: "llmwiki-wiki-result__header" } });
      const baseTitle = text(guide.title).replace(/\s*자료 Wiki$/u, "").trim() || "자료";
      createEl(header, "h2", { text: `${baseTitle} 문서 계획 미리보기` });
      if (text(meta.overview)) createEl(header, "p", { text: text(meta.overview), attr: { "data-wiki-overview": "" } });
      createEl(header, "output", {
        text: `근거 문장 ${Number(meta.total_claims || 0)}개 · 예정 문서 ${activeTopics.length}개 · 원문 전용 ${Number(meta.source_only_count || 0)}건 · 누락 검토 ${Number(meta.possible_gap_count || 0)}건 · 보류 ${Number(meta.hold_count || 0)}건`,
        attr: { "data-wiki-summary": "" },
      });
      const guideOpen = createEl(header, "button", { text: "자료 안내 보기", attr: { type: "button", "data-action": "open-review-detail" } });
      guideOpen.onclick = () => { if (detail) detail.open(guide, guideOpen); };
      if (activeTopics.length) {
        const cardById = new Map();
        const order = createEl(result, "section", { attr: { "data-wiki-reading-order": "" } });
        createEl(order, "h3", { text: "추천 읽기 순서" });
        const ordered = createEl(order, "ol");
        activeTopics.forEach((item, index) => {
          const row = createEl(ordered, "li");
          const jump = createEl(row, "button", { text: `${index + 1}. ${text(item.title) || item.review_id}`, attr: { type: "button", "data-action": "jump-wiki-document", "data-target-review-id": item.review_id } });
          jump.onclick = (event) => {
            if (event && event.preventDefault) event.preventDefault();
            const target = cardById.get(item.review_id);
            if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start", behavior: "smooth" });
            if (target && typeof target.focus === "function") target.focus();
          };
        });
        const map = createEl(result, "section", { attr: { "data-wiki-document-map": "" } });
        createEl(map, "h3", { text: "문서 지도" });
        for (const item of activeTopics) {
          const card = createEl(map, "article", { attr: { "data-review-id": item.review_id, "data-review-plan": "true", "data-wiki-topic": item.plan_page_id, "data-plan-selected": item.plan_selected === false ? "false" : "true", tabindex: "-1" } });
          cardById.set(item.review_id, card);
          createEl(card, "h4", { text: text(item.title) || item.review_id });
          if (text(item.plan_purpose)) createEl(card, "p", { text: text(item.plan_purpose), attr: { "data-wiki-purpose": "" } });
          createEl(card, "output", { text: `근거 ${Number(item.plan_claim_count || 0)}개`, attr: { "data-wiki-evidence-count": "" } });
          const lintProposal = plain(item.plan_lint_proposal) ? item.plan_lint_proposal : null;
          if (lintProposal && lintProposal.reason === "title_claim_boundary_mismatch") {
            const lint = createEl(card, "aside", { attr: { "data-plan-lint": lintProposal.reason, role: "alert" } });
            createEl(lint, "p", { text: `제목과 근거 묶음을 확인해 주세요. 추천 제목: ${text(lintProposal.suggested_title)}` });
            if (typeof config.onPlanRename === "function") {
              const apply = createEl(lint, "button", { text: "추천 제목 적용", attr: { type: "button", "data-action": "apply-plan-title-suggestion" } });
              apply.onclick = () => Promise.resolve(config.onPlanRename(item, lintProposal)).then(() => render());
            }
          }
          const related = list(item.related_knowledge).filter((entry) => plain(entry) && text(entry.title) && text(entry.path) && Number(entry.covered_claim_count || 0) > 0).slice(0, 2);
          if (related.length) {
            const relatedPanel = createEl(card, "section", { attr: { "data-related-knowledge": "" } });
            createEl(relatedPanel, "h5", { text: "관련 Knowledge" });
            for (const entry of related) {
              const row = createEl(relatedPanel, "div");
              const link = createEl(row, "button", { text: text(entry.title), attr: { type: "button", "data-action": "open-related-knowledge", "data-related-path": text(entry.path) } });
              link.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); if (typeof config.onOpenRelated === "function") config.onOpenRelated(text(entry.path)); };
              createEl(row, "p", { text: `${entry.relation === "duplicate" ? "기존 문서 보강 후보" : "관련 주제"} · 관련 근거 ${Number(entry.covered_claim_count || 0)}개` });
            }
          }
          const actions = createEl(card, "div", { attr: { class: "llmwiki-wiki-result__actions" } });
          const open = createEl(actions, "button", { text: "문서 보기", attr: { type: "button", "data-action": "open-review-detail" } });
          open.onclick = () => { if (detail) detail.open(item, open); };
          if (typeof config.onPlanMerge === "function" || typeof config.onPlanToggle === "function") {
            const extra = createEl(actions, "details", { attr: { "data-wiki-actions": item.plan_page_id } });
            createEl(extra, "summary", { text: "추가 작업" });
            const extraBody = createEl(extra, "div");
            if (typeof config.onPlanMerge === "function") {
              const mergeLabel = createEl(extraBody, "label", { attr: { class: "knowledge-review-workbench__merge-select" } });
              const mergeInput = createEl(mergeLabel, "input", { attr: { type: "checkbox", "data-action": "select-plan-merge", "data-plan-page-id": item.plan_page_id, "aria-label": `${text(item.title)} 병합 선택` } });
              mergeInput.checked = mergeSelected.has(item.plan_page_id);
              mergeInput.onchange = () => { if (mergeInput.checked) { if (mergeSelected.size < 2) mergeSelected.add(item.plan_page_id); else mergeInput.checked = false; } else mergeSelected.delete(item.plan_page_id); render(); };
              createEl(mergeLabel, "span", { text: "병합 선택" });
            }
            if (typeof config.onPlanToggle === "function") {
              const togglePlan = createEl(extraBody, "button", { text: item.plan_selected === false ? "계획 포함" : "계획 제외", attr: { type: "button", "data-action": "toggle-plan-page", "aria-pressed": item.plan_selected === false ? "false" : "true" } });
              togglePlan.onclick = () => Promise.resolve(config.onPlanToggle(item)).then(() => render());
            }
          }
        }
      }
      if (heldTopics.length) {
        const held = createEl(result, "section", { attr: { "data-wiki-held-topics": "" } });
        createEl(held, "h3", { text: "계획에서 제외한 문서" });
        for (const item of heldTopics) {
          const row = createEl(held, "article", { attr: { "data-review-id": item.review_id, "data-review-plan": "true", "data-wiki-topic": item.plan_page_id, "data-plan-selected": "false" } });
          createEl(row, "h4", { text: text(item.title) || item.review_id });
          const open = createEl(row, "button", { text: "문서 보기", attr: { type: "button", "data-action": "open-review-detail" } });
          open.onclick = () => { if (detail) detail.open(item, open); };
          if (typeof config.onPlanToggle === "function") {
            const include = createEl(row, "button", { text: "계획 포함", attr: { type: "button", "data-action": "toggle-plan-page", "aria-pressed": "false" } });
            include.onclick = () => Promise.resolve(config.onPlanToggle(item)).then(() => render());
          }
        }
      }
      if (Number(meta.source_only_count || 0) > 0) {
        const sourceOnly = createEl(result, "section", { attr: { "data-wiki-source-only": "" } });
        createEl(sourceOnly, "h3", { text: "원문에만 남긴 내용" });
        createEl(sourceOnly, "p", { text: `${Number(meta.source_only_count)}건 · 원문 전용` });
      }
      return true;
    }
    function render() {
      empty(config.container);
      ensureWikiResultStyle(config.container);
      rootEl = createEl(config.container, "section", { attr: { class: "knowledge-review-workbench prodigy-full-bleed", "data-surface": "knowledge-review-workbench", "aria-label": "지식 검토" } });
      const controls = createEl(rootEl, "div", { attr: { class: "knowledge-review-workbench__controls" } });
      const toggle = createEl(controls, "button", { text: filter === "all" ? "대기만 보기" : "전체 보기", attr: { type: "button", "data-action": "toggle-review-filter", "aria-pressed": filter === "all" ? "true" : "false" } });
      toggle.onclick = () => { filter = filter === "all" ? "pending" : "all"; render(); };
      for (const group of buildReviewGroups(items, { filter })) {
        const section = createEl(rootEl, "section", { attr: { class: "knowledge-review-workbench__group", "data-review-group": group.id, "data-total": String(group.total), "data-visible": String(group.visible) } });
        createEl(section, "h3", { text: group.label });
        createEl(section, "output", { text: String(group.visible), attr: { "data-review-counter": group.id, "data-total": String(group.total) } });
        if (group.id === "plan" && group.items.some((item) => item.plan_kind === "topic_page") && typeof config.onPlanApprove === "function") {
          const hasTitleMismatch = group.items.some((item) => item.plan_lint_proposal?.reason === "title_claim_boundary_mismatch");
          const approve = createEl(section, "button", {
            text: hasTitleMismatch ? "추천 제목 확인 후 문서 생성" : "계획 승인 후 문서 생성",
            attr: {
              type: "button",
              "data-action": "approve-page-plan",
              "data-primary": "true",
              "aria-label": hasTitleMismatch ? "추천 제목을 먼저 확인해 주세요" : "계획 승인 후 문서 생성",
            },
          });
          approve.disabled = hasTitleMismatch;
          approve.onclick = () => Promise.resolve(config.onPlanApprove()).then(() => render());
        }
        if (group.id === "plan" && group.items.filter((item) => item.plan_kind === "topic_page" && item.plan_selected !== false).length >= 2 && typeof config.onPlanMerge === "function") {
          const merge = createEl(section, "button", { text: "선택 문서 병합", attr: { type: "button", "data-action": "merge-plan-pages" } });
          merge.disabled = mergeSelected.size !== 2;
          merge.onclick = () => {
            if (mergeSelected.size !== 2) return;
            Promise.resolve(config.onPlanMerge([...mergeSelected].sort())).then((result) => { if (result && result.ok) mergeSelected.clear(); render(); });
          };
        }
        if (group.id === "plan" && renderWikiResult(section, group)) continue;
        for (const item of group.items) {
          const row = createEl(section, "article", { attr: { "data-review-id": item.review_id, ...(item.pilot === true ? { "data-review-pilot": "true" } : {}), ...(item.plan === true ? { "data-review-plan": "true", "data-plan-selected": item.plan_selected === false ? "false" : "true" } : {}) } });
          createEl(row, "strong", { text: text(item.title) || item.review_id });
          if (item.pilot === true) createEl(row, "output", { text: "격리 파일럿", attr: { "data-pilot-status": "isolated" } });
          if (item.plan === true) createEl(row, "output", { text: item.plan_kind === "source_guide" ? "Source Guide" : text(item.operation) || "create", attr: { "data-plan-operation": text(item.operation) || item.plan_kind } });
          const summaryPoints = list(item.summary_points).map(text).filter(Boolean);
          if (summaryPoints.length) {
            const summary = createEl(row, "div", { attr: { class: "knowledge-review-workbench__summary" } });
            createEl(summary, "span", { text: "요약 결과", attr: { class: "knowledge-review-workbench__summary-label" } });
            const remaining = summaryPoints.length > 2 ? ` · 외 ${summaryPoints.length - 2}개` : "";
            createEl(summary, "p", { text: summaryPoints.slice(0, 2).join(" · ") + remaining, attr: { "data-review-summary-preview": "" } });
          }
          createEl(row, "output", { text: operationLabel(item), attr: { "data-review-status": text(item.review_state) } });
          if (item.destination === "knowledge_candidate" && item.promotion_gaps.length) {
            const gaps = createEl(row, "details", { text: "", attr: { "data-candidate-gaps": item.review_id } });
            createEl(gaps, "summary", { text: String(item.promotion_gaps.length) });
            const gapList = createEl(gaps, "ul");
            item.promotion_gaps.forEach((gap) => createEl(gapList, "li", { text: text(gap.reason_code) || text(gap.gate_id) }));
          }
          const open = createEl(row, "button", { text: "열기", attr: { type: "button", "data-action": "open-review-detail" } });
          open.onclick = () => { if (detail) detail.open(item, open); };
          if (item.plan === true && item.plan_kind === "topic_page" && typeof config.onPlanMerge === "function") {
            const mergeLabel = createEl(row, "label", { attr: { class: "knowledge-review-workbench__merge-select" } });
            const mergeInput = createEl(mergeLabel, "input", { attr: { type: "checkbox", "data-action": "select-plan-merge", "data-plan-page-id": item.plan_page_id, "aria-label": `${text(item.title)} 병합 선택` } });
            mergeInput.checked = mergeSelected.has(item.plan_page_id);
            mergeInput.onchange = () => { if (mergeInput.checked) { if (mergeSelected.size < 2) mergeSelected.add(item.plan_page_id); else mergeInput.checked = false; } else mergeSelected.delete(item.plan_page_id); render(); };
            createEl(mergeLabel, "span", { text: "병합 선택" });
          }
          if (item.plan === true && item.plan_kind === "topic_page" && typeof config.onPlanToggle === "function") {
            const togglePlan = createEl(row, "button", { text: item.plan_selected === false ? "계획 포함" : "계획 제외", attr: { type: "button", "data-action": "toggle-plan-page", "aria-pressed": item.plan_selected === false ? "false" : "true" } });
            togglePlan.onclick = () => Promise.resolve(config.onPlanToggle(item)).then(() => render());
          }
          if (item.destination === "fleeting" && text(item.thought_text)) { const button = createEl(row, "button", { text: "생각 저장", attr: { type: "button", "data-action": "save-thought" } }); button.onclick = () => dispatch("save_thought", item, button); }
          if (item.analysis_state === "cache_complete") { const button = createEl(row, "button", { text: "캐시 분석 완료", attr: { type: "button", "data-action": "complete-from-cache" } }); button.onclick = () => dispatch("complete_from_cache", item, button); }
          if (item.destination === "canonical_knowledge") { const button = createEl(row, "button", { text: "정본 승인", attr: { type: "button", "data-action": "approve-canonical" } }); button.onclick = () => dispatch("approve_canonical", item, button); }
          if (["stale", "recovery", "rejected"].includes(item.review_state)) { const button = createEl(row, "button", { text: "다시 시도", attr: { type: "button", "data-action": "retry-review" } }); button.onclick = () => dispatch("retry_review", item, button); }
          if (item.destination === "para_object" && plain(item.object_handoff)) {
            createEl(row, "code", { text: text(item.object_handoff.target_path), attr: { "data-object-target": "" } });
            const preflight = commands.exactObjectHandoff(item);
            if (preflight.ok) createEl(row, "output", { text: preflight.value.target.before_diff.map((entry) => `${entry.kind}:${entry.line}`).join("\n") || "변경 없음", attr: { "data-object-before-diff": "" } });
            const button = createEl(row, "button", { text: "대상 반영", attr: { type: "button", "data-action": "approve-object" } });
            button.onclick = () => dispatch("approve_object", item, button);
          }
        }
      }
    }
    const api = freeze({ update(next) { items = list(next && next.items); const validMergeIds = new Set(items.filter((item) => item.plan === true && item.plan_kind === "topic_page" && item.plan_selected !== false).map((item) => item.plan_page_id)); for (const id of [...mergeSelected]) if (!validMergeIds.has(id)) mergeSelected.delete(id); render(); return buildReviewGroups(items, { filter }); }, setFilter(next) { filter = next === "all" ? "all" : "pending"; render(); }, groups() { return buildReviewGroups(items, { filter }); }, destroy() { if (detail) detail.close(); empty(config.container); rootEl = null; } });
    render();
    return api;
  }

  const api = freeze({ GROUPS, buildReviewGroups, operationLabel, mountKnowledgeReviewWorkbench });
  root.KnowledgeExplorerController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
