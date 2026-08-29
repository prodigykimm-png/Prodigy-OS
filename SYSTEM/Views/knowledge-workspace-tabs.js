"use strict";

(function (root) {

  var TABS = Object.freeze([
    Object.freeze({ id: "zettelkasten", label: "지식 구축 · 제텔카스텐", compactLabel: "구축", role: "지식 구축", purpose: "작성·연결·검증·보존", description: "후보·문헌·영구 지식을 검토하고 승인합니다." }),
    Object.freeze({ id: "para", label: "지식 활용 · PARA", compactLabel: "활용", role: "승인 지식 활용", purpose: "승인된 지식을 Project·Area·Resource Objects에 적용하고 활용합니다.", description: "프로젝트·영역·자료에 연결된 승인 지식을 탐색합니다." }),
    Object.freeze({ id: "llmwiki", label: "AI 지식 검토 · LLM Wiki", compactLabel: "AI", role: "AI 지식 검토", purpose: "자료를 선택하고 AI 지식 제안을 검토합니다.", description: "자료를 선택하고 AI 지식 제안을 검토합니다." }),
    Object.freeze({ id: "llmwiki-browse", label: "LLMWiki 탐색", compactLabel: "탐색", role: "LLMWiki 탐색", purpose: "검증된 LLMWiki 스냅샷을 검색하고 읽습니다.", description: "검증된 LLMWiki 스냅샷을 검색하고 읽습니다." })
  ]);



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

  function setText(el, value) {
    if (!el) return;
    var text = value == null ? "" : String(value);
    if (typeof el.setText === "function") return el.setText(text);
    el.textContent = text;
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

  function renderFullLabel(button, label) {
    var separator = label.indexOf(" · ");
    var full = createEl(button, "span", { attr: { class: "knowledge-workspace-tab-label knowledge-workspace-tab-label--full", "aria-hidden": "true" } });
    if (separator < 0) createEl(full, "span", { text: label });
    else {
      createEl(full, "span", { text: label.slice(0, separator) });
      createEl(full, "span", {
        text: label.slice(separator + 1),
        attr: { class: "knowledge-workspace-tab-label__atomic-suffix", "data-tab-atomic-suffix": "true" }
      });
    }
    // The in-memory Obsidian fixture stores direct text separately from child
    // nodes; keep its semantic mirror without changing browser rendering.
    if (typeof full.tag === "string") full.text = label;
    return full;
  }

  function mountTabs(container, options) {
    if (!container) return null;
    if (root.KnowledgeStyles) root.KnowledgeStyles.ensureStyles();
    var opts = options || {};
    var activeTab = TABS.some(function (tab) { return tab.id === opts.activeTab; }) ? opts.activeTab : "zettelkasten";
    var onChange = typeof opts.onChange === "function" ? opts.onChange : function () {};

    var tablist = createEl(container, "div", { attr: { role: "tablist", "aria-label": "지식 워크스페이스", class: "knowledge-workspace-tabs" } });
    var panels = {};
    var buttons = {};

    TABS.forEach(function (tab) {
      var btn = createEl(tablist, "button", {
        attr: {
          type: "button",
          role: "tab",
          id: "knowledge-tab-" + tab.id,
          "aria-label": tab.label,
          title: tab.label,
          "aria-selected": tab.id === activeTab ? "true" : "false",
          "aria-controls": "knowledge-panel-" + tab.id,
          tabindex: tab.id === activeTab ? "0" : "-1",
          class: "knowledge-workspace-tab prodigy-configurator-chip"
        }
      });
      renderFullLabel(btn, tab.label);
      createEl(btn, "span", { text: tab.compactLabel, attr: { class: "knowledge-workspace-tab-label knowledge-workspace-tab-label--compact", "aria-hidden": "true" } });
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

    var descEl = createEl(container, "p", {
      attr: {
        id: "knowledge-tab-description",
        class: "knowledge-workspace-tab-desc prodigy-full-bleed",
        "aria-live": "polite"
      }
    });
    var roleCueEl = createEl(container, "p", {
      attr: {
        id: "knowledge-tab-role-cue",
        class: "knowledge-workspace-tab-role prodigy-status-line",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      }
    });

    var panelHost = createEl(container, "div", { attr: { class: "knowledge-workspace-panel-host" } });
    TABS.forEach(function (tab) {
      var panel = createEl(panelHost, "div", {
        attr: {
          role: "tabpanel",
          id: "knowledge-panel-" + tab.id,
          "aria-labelledby": "knowledge-tab-" + tab.id,
          class: "knowledge-workspace-panel"
        }
      });
      panels[tab.id] = panel;
    });

    function detach(panel) {
      if (!panel || !panel.parentNode) return;
      if (typeof panel.remove === "function") panel.remove();
      else if (typeof panel.parentNode.removeChild === "function") panel.parentNode.removeChild(panel);
    }

    function attach(panel) {
      if (!panel || panel.parentNode === panelHost) return;
      if (typeof panelHost.appendChild === "function") panelHost.appendChild(panel);
    }

    function select(tabId) {
      if (!TABS.some(function (tab) { return tab.id === tabId; })) return;
      activeTab = tabId;
      TABS.forEach(function (tab) {
        var selected = tab.id === activeTab;
        setAttr(buttons[tab.id], "aria-selected", selected ? "true" : "false");
        setAttr(buttons[tab.id], "tabindex", selected ? "0" : "-1");
        if (selected) {
          setAttr(buttons[tab.id], "aria-describedby", "knowledge-tab-role-cue knowledge-tab-description");
          attach(panels[tab.id]);
        } else {
          removeAttr(buttons[tab.id], "aria-describedby");
          detach(panels[tab.id]);
        }
      });
      var current = TABS.find(function (t) { return t.id === activeTab; });
      setText(descEl, current ? current.description : "");
      setText(roleCueEl, current ? "역할: " + current.role + " · 목적: " + current.purpose : "");
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
