"use strict";

(function (root) {
  function dependency(name) {
    var value = root[name];
    if (!value) throw new Error(name + "을(를) 먼저 불러와야 합니다.");
    return value;
  }

  function createEl(parent, tag, options) {
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, options || {});
    var el = parent.ownerDocument.createElement(tag);
    if (options && options.text !== undefined) el.textContent = String(options.text);
    if (options && options.attr) Object.entries(options.attr).forEach(function (entry) { el.setAttribute(entry[0], entry[1]); });
    if (options && options.disabled) el.disabled = true;
    parent.appendChild(el);
    return el;
  }

  function empty(el) {
    if (!el) return;
    if (typeof el.empty === "function") return el.empty();
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function link(parent, options) {
    var control = createEl(parent, "a", {
      text: options.text,
      attr: { href: "#", role: "link", class: "knowledge-explorer-row-link", "aria-label": options.ariaLabel || options.text }
    });
    control.onclick = function (event) {
      if (event && event.preventDefault) event.preventDefault();
      if (options.onOpen) options.onOpen();
    };
    control.onkeydown = function (event) {
      if (event && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (options.onOpen) options.onOpen();
      }
    };
    return control;
  }

  function renderParaActions(container, options) {
    var opts = options || {};
    var app = opts.app;
    var onCreated = typeof opts.onCreated === "function" ? opts.onCreated : function () {};
    var service = root.ParaObjectCreatorService;
    if (!service) return;

    var bar = createEl(container, "div", { attr: { class: "knowledge-para-actions", role: "toolbar", "aria-label": "PARA Object 만들기" } });
    service.ACTIONS.forEach(function (action) {
      var btn = createEl(bar, "button", {
        text: action.icon + " " + action.label,
        attr: { type: "button", class: "knowledge-para-action-btn", "data-action": action.id, "aria-label": action.label }
      });
      btn.onclick = function () {
        if (action.writes) {
          var title = typeof root.obsidian !== "undefined" && root.obsidian.Modal
            ? prompt("제목을 입력하세요")
            : null;
          if (!title) return;
          service.executeAction(action.id, app, title).then(function (result) {
            if (result && result.ok) onCreated(result);
          }).catch(function (err) {
            if (root.obsidian && root.obsidian.Notice) new root.obsidian.Notice(err.message || "만들기에 실패했습니다.");
          });
        } else {
          service.executeAction(action.id, app, "").then(function (result) {
            if (result && result.ok) onCreated(result);
          }).catch(function (err) {
            if (root.obsidian && root.obsidian.Notice) new root.obsidian.Notice(err.message || "열기에 실패했습니다.");
          });
        }
      };
    });
  }

  function renderParaPanel(container, paraModel, options) {
    if (!container) return;
    empty(container);
    var opts = options || {};
    var onOpenBeside = typeof opts.onOpenBeside === "function" ? opts.onOpenBeside : function () {};
    var Para = dependency("KnowledgeParaProjection");

    var section = createEl(container, "section", { attr: { class: "knowledge-para-section", "aria-label": "지식 활용 · PARA" } });
    createEl(section, "h2", { text: "지식 활용 · PARA" });

    // PARA creator actions
    renderParaActions(section, opts);

    createEl(section, "p", {
      text: "프로젝트·영역·자료에서 명시적으로 연결된 승인 지식만 표시합니다. 후보나 미검증 자료는 여기에 나타나지 않습니다.",
      attr: { class: "knowledge-explorer-meta" }
    });

    if (!paraModel || !paraModel.total_links) {
      createEl(section, "p", { text: "연결된 지식 없음 — PARA Object에서 승인 지식을 명시적으로 연결하면 여기에 표시됩니다.", attr: { class: "knowledge-explorer-empty", "data-state": "empty" } });
      return;
    }

    createEl(section, "p", {
      text: "승인 지식 " + paraModel.total_knowledge + "개 중 " + paraModel.total_sources + "개 Object에서 " + paraModel.total_links + "건 연결됨",
      attr: { class: "knowledge-explorer-detail-summary" }
    });

    var groups = paraModel.groups;
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var card = createEl(section, "article", { attr: { class: "knowledge-explorer-detail-card", "data-source-type": group.source_type } });
      var header = createEl(card, "header", { attr: { class: "knowledge-explorer-pane-head" } });
      var titleWrap = createEl(header, "div", { attr: { class: "knowledge-explorer-pane-title" } });

      if (group.source_path) {
        link(titleWrap, { text: group.source_title, ariaLabel: group.source_title + " 열기", onOpen: function () { onOpenBeside(group.source_path); } });
      } else {
        createEl(titleWrap, "strong", { text: group.source_title });
      }
      createEl(titleWrap, "span", { text: Para.sourceTypeLabel(group.source_type), attr: { class: "knowledge-explorer-meta" } });

      var list = createEl(card, "ul", { attr: { class: "knowledge-para-link-list" } });
      for (var k = 0; k < group.knowledge.length; k++) {
        var item = group.knowledge[k];
        var li = createEl(list, "li", { attr: { class: "knowledge-para-link-item" } });
        link(li, { text: item.knowledge_title, ariaLabel: item.knowledge_title + " 열기", onOpen: (function (path) { return function () { onOpenBeside(path); }; })(item.knowledge_path) });
        var meta = [];
        if (item.knowledge_domain) meta.push(item.knowledge_domain);
        if (item.knowledge_topics && item.knowledge_topics.length) meta.push(item.knowledge_topics.join(", "));
        if (meta.length) createEl(li, "span", { text: meta.join(" · "), attr: { class: "knowledge-explorer-meta" } });
      }
    }
  }

  var api = Object.freeze({ renderParaPanel: renderParaPanel, renderParaActions: renderParaActions });
  root.KnowledgeParaView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
