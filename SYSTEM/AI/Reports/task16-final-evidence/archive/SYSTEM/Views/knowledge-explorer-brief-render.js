"use strict";

(function (root) {
  function createEl(parent, tag, options = {}) {
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const element = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) element.textContent = String(options.text);
    for (const [name, value] of Object.entries(options.attr || {})) element.setAttribute(name, value);
    if (options.disabled) element.disabled = true;
    parent.appendChild(element);
    return element;
  }

  function sourcePaths(value) {
    const values = Array.isArray(value) ? value : [];
    return [...new Set(values.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
  }

  function statusCopy(brief) {
    if (brief.phase === "loading") return "AI 요약을 불러오는 중입니다. 결정적 요약은 그대로 유지됩니다.";
    if (brief.phase === "cancelled") return "AI 요약을 취소했습니다. 결정적 요약은 그대로 유지됩니다.";
    if (brief.phase === "ai") return "AI 요약은 보조 참고입니다. 결정적 요약과 출처를 먼저 확인하세요.";
    if (brief.phase === "fallback") return "AI 요약을 사용할 수 없습니다. 결정적 요약은 그대로 유지됩니다.";
    return "결정적 요약을 표시합니다. AI 요약은 사용자의 요청 후에만 실행됩니다.";
  }

  function action(parent, text, actionName, disabled, onAction) {
    const control = createEl(parent, "button", {
      text,
      attr: { type: "button", class: "knowledge-explorer-button knowledge-explorer-brief-action", "data-action": actionName },
      disabled
    });
    if (!disabled) control.onclick = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      onAction();
    };
    return control;
  }

  function sourceLink(parent, sourcePath, disabled, onOpenBeside) {
    const link = createEl(parent, "a", {
      text: sourcePath,
      attr: {
        href: "#",
        role: "link",
        class: "knowledge-explorer-brief-source",
        "data-action": "open-beside",
        "data-asset-path": sourcePath,
        "aria-label": `출처를 옆에 열기: ${sourcePath}`
      }
    });
    if (disabled) link.setAttr ? link.setAttr("aria-disabled", "true") : link.setAttribute("aria-disabled", "true");
    link.onclick = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (!disabled) onOpenBeside(sourcePath);
    };
    return link;
  }

  function renderBrief(parent, options = {}) {
    const brief = options.brief || {};
    const panel = createEl(parent, "section", { attr: { class: "knowledge-explorer-brief-panel", "aria-label": "오늘의 브리핑" } });
    createEl(panel, "h3", { text: "오늘의 브리핑" });
    const lines = Array.isArray(brief.lines) ? brief.lines : [];
    const list = createEl(panel, "ul", { attr: { class: "knowledge-explorer-brief-lines" } });
    for (const line of lines) createEl(list, "li", { text: line });
    const sources = sourcePaths(brief.source_ids);
    const sourceList = createEl(panel, "div", { attr: { class: "knowledge-explorer-brief-sources" } });
    createEl(sourceList, "strong", { text: "출처" });
    if (!sources.length) createEl(sourceList, "p", { text: "표시할 출처가 없습니다.", attr: { class: "knowledge-explorer-meta" } });
    if (sources.length) {
      const sourceRows = createEl(sourceList, "ul", { attr: { class: "knowledge-explorer-brief-source-list" } });
      for (const sourcePath of sources) {
        const row = createEl(sourceRows, "li", { attr: { class: "knowledge-explorer-brief-source-row" } });
        sourceLink(row, sourcePath, Boolean(options.disabled), options.onOpenBeside || (() => {}));
      }
    }
    const status = createEl(panel, "p", { text: statusCopy(brief), attr: { class: "knowledge-explorer-brief-status", "data-state": brief.phase || "deterministic" } });
    const actions = createEl(panel, "div", { attr: { class: "knowledge-explorer-row-actions" } });
    if (brief.phase === "loading") action(actions, "취소", "brief-cancel", false, options.onCancel || (() => {}));
    else action(actions, brief.phase === "cancelled" || brief.phase === "fallback" ? "다시 시도" : "AI 요약 만들기", "brief-request", Boolean(options.disabled), options.onRequest || (() => {}));
    if (brief.ai_summary && Array.isArray(brief.ai_summary.summary_lines)) {
      const summary = createEl(panel, "section", { attr: { class: "knowledge-explorer-brief-ai-summary" } });
      createEl(summary, "h4", { text: "AI 보조 요약" });
      for (const line of brief.ai_summary.summary_lines) createEl(summary, "p", { text: line });
    }
    return panel;
  }

  const api = Object.freeze({ renderBrief });
  root.KnowledgeExplorerBriefRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
