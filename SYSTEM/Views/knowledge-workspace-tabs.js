"use strict";

(function (root) {
  var STYLE_ID = "knowledge-workspace-tabs-styles";
  var designTokens = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
  var compactMax = Number(designTokens && designTokens.BREAKPOINTS && designTokens.BREAKPOINTS.medium || 768) - 1;
  var TABS = Object.freeze([
    Object.freeze({ id: "zettelkasten", label: "지식 구축 · 제텔카스텐", description: "후보·문헌·영구 지식을 검토하고 승인합니다." }),
    Object.freeze({ id: "para", label: "지식 활용 · PARA", description: "프로젝트·영역·자료에 연결된 승인 지식을 탐색합니다." }),
    Object.freeze({ id: "llmwiki", label: "AI 지식 검토 · LLM Wiki", description: "자료를 선택하고 AI 지식 제안을 검토합니다." })
  ]);

  function validTabId(tabId) {
    return TABS.some(function (tab) { return tab.id === tabId; });
  }

  function ensureStyles(container) {
    var doc = container && container.ownerDocument ? container.ownerDocument : typeof document !== "undefined" ? document : null;
    if (!doc || (doc.getElementById && doc.getElementById(STYLE_ID))) return;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".knowledge-workspace-tabs{display:flex;gap:var(--ke-space-1);max-inline-size:100%;min-inline-size:0;margin:0 0 var(--ke-space-3);border-bottom:var(--ke-border-width) solid var(--ke-color-border);padding:0}",
      ".knowledge-workspace-tab{max-inline-size:100%;min-inline-size:0;padding:var(--ke-space-3) var(--ke-space-5);border:none;border-bottom:var(--ke-focus-ring-width) solid transparent;background:none;color:var(--ke-color-muted);font-size:var(--ke-type-label);font-weight:var(--ke-font-weight-strong);cursor:pointer;white-space:nowrap;transition:color var(--ke-motion-fast),border-color var(--ke-motion-fast)}",
      ".knowledge-workspace-tab:hover{color:var(--text-normal)}",
      ".knowledge-workspace-tab:focus-visible{outline:var(--ke-focus-ring-width) solid var(--ke-color-accent);outline-offset:calc(var(--ke-focus-ring-width) * -1)}",
      ".knowledge-workspace-tab[aria-selected=\"true\"]{color:var(--text-normal);border-bottom-color:var(--text-accent)}",
      ".knowledge-workspace-tab-desc{font-size:var(--ke-type-label);color:var(--ke-color-muted);margin:0 0 var(--ke-space-2);word-break:keep-all;overflow-wrap:anywhere}",
      ".knowledge-workspace-panel{max-inline-size:100%;min-inline-size:0;min-block-size:0}",
      `@media(max-width:${compactMax}px){.knowledge-workspace-tabs{flex-wrap:wrap}.knowledge-workspace-tab{flex:1 1 100%;min-block-size:var(--ke-touch-target);padding:var(--ke-space-3) var(--ke-space-4);font-size:var(--ke-type-body);white-space:normal;word-break:keep-all;overflow-wrap:anywhere}}`
    ].join("\n");
    doc.head.appendChild(style);
  }

  function setAttr(el, name, value) {
    if (!el) return;
    if (typeof el.setAttr === "function") return el.setAttr(name, value);
    if (typeof el.setAttribute === "function") return el.setAttribute(name, value);
    if (!el.attr) el.attr = {};
    el.attr[name] = value;
  }

  function removeAttr(el, name) {
    if (!el) return;
    if (typeof el.removeAttribute === "function") return el.removeAttribute(name);
    if (el.attr && typeof el.attr === "object") { delete el.attr[name]; return; }
  }

  function createEl(parent, tag, options) {
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, options || {});
    var el = parent.ownerDocument.createElement(tag);
    if (options && options.text !== undefined) el.textContent = String(options.text);
    if (options && options.attr) Object.entries(options.attr).forEach(function (entry) { if (entry[1] !== undefined) setAttr(el, entry[0], entry[1]); });
    parent.appendChild(el);
    return el;
  }

  function mountTabs(container, options) {
    if (!container) return null;
    ensureStyles(container);
    var opts = options || {};
    var activeTab = validTabId(opts.activeTab) ? opts.activeTab : "zettelkasten";
    var onChange = typeof opts.onChange === "function" ? opts.onChange : function () {};

    var tablist = createEl(container, "div", { attr: { role: "tablist", "aria-label": "지식 워크스페이스", class: "knowledge-workspace-tabs" } });
    var panels = {};
    var buttons = {};

    TABS.forEach(function (tab) {
      var btn = createEl(tablist, "button", {
        text: tab.label,
        attr: {
          type: "button",
          role: "tab",
          id: "knowledge-tab-" + tab.id,
          "aria-selected": tab.id === activeTab ? "true" : "false",
          "aria-controls": "knowledge-panel-" + tab.id,
          tabindex: tab.id === activeTab ? "0" : "-1",
          class: "knowledge-workspace-tab"
        }
      });
      btn.onclick = function () { select(tab.id); };
      btn.onkeydown = function (event) {
        if (!event) return;
        var idx = TABS.findIndex(function (t) { return t.id === tab.id; });
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          var next = TABS[(idx + 1) % TABS.length];
          select(next.id);
          buttons[next.id].focus();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          var prev = TABS[(idx - 1 + TABS.length) % TABS.length];
          select(prev.id);
          buttons[prev.id].focus();
        }
      };
      buttons[tab.id] = btn;
    });

    var descEl = createEl(container, "p", { attr: { class: "knowledge-workspace-tab-desc", "aria-live": "polite" } });

    TABS.forEach(function (tab) {
      var panel = createEl(container, "div", {
        attr: {
          role: "tabpanel",
          id: "knowledge-panel-" + tab.id,
          "aria-labelledby": "knowledge-tab-" + tab.id,
          class: "knowledge-workspace-panel",
          hidden: tab.id !== activeTab ? "" : undefined
        }
      });
      if (tab.id !== activeTab) setAttr(panel, "hidden", "");
      panels[tab.id] = panel;
    });

    function select(tabId) {
      if (!validTabId(tabId)) return;
      activeTab = tabId;
      TABS.forEach(function (tab) {
        var selected = tab.id === activeTab;
        setAttr(buttons[tab.id], "aria-selected", selected ? "true" : "false");
        setAttr(buttons[tab.id], "tabindex", selected ? "0" : "-1");
        if (selected) removeAttr(panels[tab.id], "hidden");
        else setAttr(panels[tab.id], "hidden", "");
      });
      var current = TABS.find(function (t) { return t.id === activeTab; });
      descEl.textContent = current ? current.description : "";
      onChange(activeTab);
    }

    select(activeTab);

    return Object.freeze({
      getActiveTab: function () { return activeTab; },
      select: select,
      getPanel: function (tabId) { return panels[tabId] || null; },
      destroy: function () { if (container && typeof container.empty === "function") container.empty(); }
    });
  }

  var api = Object.freeze({ TABS: TABS, mountTabs: mountTabs });
  root.KnowledgeWorkspaceTabs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
