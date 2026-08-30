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
    const detail = config.detail || (config.Modal ? detailsApi.createKnowledgeExplorerDetailModal({ app: config.app, Modal: config.Modal, onOpenSource: config.onOpenSource }) : null);
    let items = list(config.items);
    let filter = "pending";
    let rootEl = null;
    const mergeSelected = new Set();
    function dispatch(type, item, invoker) {
      Promise.resolve(command.execute({ type, item })).then(() => render());
      if (type === "open_detail" && detail) detail.open(item, invoker);
    }
    function render() {
      empty(config.container);
      rootEl = createEl(config.container, "section", { attr: { class: "knowledge-review-workbench prodigy-full-bleed", "data-surface": "knowledge-review-workbench", "aria-label": "지식 검토" } });
      const controls = createEl(rootEl, "div", { attr: { class: "knowledge-review-workbench__controls" } });
      const toggle = createEl(controls, "button", { text: filter === "all" ? "대기만 보기" : "전체 보기", attr: { type: "button", "data-action": "toggle-review-filter", "aria-pressed": filter === "all" ? "true" : "false" } });
      toggle.onclick = () => { filter = filter === "all" ? "pending" : "all"; render(); };
      for (const group of buildReviewGroups(items, { filter })) {
        const section = createEl(rootEl, "section", { attr: { class: "knowledge-review-workbench__group", "data-review-group": group.id, "data-total": String(group.total), "data-visible": String(group.visible) } });
        createEl(section, "h3", { text: group.label });
        createEl(section, "output", { text: String(group.visible), attr: { "data-review-counter": group.id, "data-total": String(group.total) } });
        if (group.id === "plan" && group.items.some((item) => item.plan_kind === "topic_page") && typeof config.onPlanApprove === "function") {
          const approve = createEl(section, "button", { text: "계획 승인 후 문서 생성", attr: { type: "button", "data-action": "approve-page-plan", "data-primary": "true" } });
          approve.onclick = () => Promise.resolve(config.onPlanApprove()).then(() => render());
        }
        if (group.id === "plan" && group.items.filter((item) => item.plan_kind === "topic_page").length >= 2 && typeof config.onPlanMerge === "function") {
          const merge = createEl(section, "button", { text: "선택 문서 병합", attr: { type: "button", "data-action": "merge-plan-pages" } });
          merge.disabled = mergeSelected.size !== 2;
          merge.onclick = () => {
            if (mergeSelected.size !== 2) return;
            Promise.resolve(config.onPlanMerge([...mergeSelected].sort())).then((result) => { if (result && result.ok) mergeSelected.clear(); render(); });
          };
        }
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
    const api = freeze({ update(next) { items = list(next && next.items); const validMergeIds = new Set(items.filter((item) => item.plan === true && item.plan_kind === "topic_page").map((item) => item.plan_page_id)); for (const id of [...mergeSelected]) if (!validMergeIds.has(id)) mergeSelected.delete(id); render(); return buildReviewGroups(items, { filter }); }, setFilter(next) { filter = next === "all" ? "all" : "pending"; render(); }, groups() { return buildReviewGroups(items, { filter }); }, destroy() { if (detail) detail.close(); empty(config.container); rootEl = null; } });
    render();
    return api;
  }

  const api = freeze({ GROUPS, buildReviewGroups, operationLabel, mountKnowledgeReviewWorkbench });
  root.KnowledgeExplorerController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
