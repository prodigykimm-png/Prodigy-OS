"use strict";

(function (root) {
  var STYLE_ID = "knowledge-workspace-tabs-styles";
  var TABS = Object.freeze([
    Object.freeze({ id: "zettelkasten", label: "지식 구축 · 제텔카스텐", role: "지식 구축", purpose: "작성·연결·검증·보존", description: "후보·문헌·영구 지식을 검토하고 승인합니다." }),
    Object.freeze({ id: "para", label: "지식 활용 · PARA", role: "승인 지식 활용", purpose: "승인된 지식을 Project·Area·Resource Objects에 적용하고 활용합니다.", description: "프로젝트·영역·자료에 연결된 승인 지식을 탐색합니다." }),
    Object.freeze({ id: "llmwiki", label: "AI 지식 검토 · LLM Wiki", role: "AI 지식 검토", purpose: "자료를 선택하고 AI 지식 제안을 검토합니다.", description: "자료를 선택하고 AI 지식 제안을 검토합니다." }),
    Object.freeze({ id: "llmwiki-browse", label: "LLMWiki 탐색", role: "LLMWiki 탐색", purpose: "검증된 LLMWiki 스냅샷을 검색하고 읽습니다.", description: "검증된 LLMWiki 스냅샷을 검색하고 읽습니다." })
  ]);

  function ensureStyles(container) {
    var doc = container && container.ownerDocument ? container.ownerDocument : typeof document !== "undefined" ? document : null;
    if (!doc || (doc.getElementById && doc.getElementById(STYLE_ID))) return;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".knowledge-workspace-tabs{display:flex;gap:2px;margin:0 0 var(--ke-space-3,8px);border-bottom:1px solid var(--background-modifier-border);padding:0}",
      ".knowledge-workspace-tab{padding:8px 16px;border:none;border-bottom:2px solid transparent;background:none;color:var(--text-muted);font-size:var(--ke-type-label,.72rem);font-weight:600;cursor:pointer;white-space:nowrap;transition:color .15s,border-color .15s}",
      ".knowledge-workspace-tab:hover{color:var(--text-normal)}",
      ".knowledge-workspace-tab:focus-visible{outline:2px solid var(--text-accent);outline-offset:-2px}",
      ".knowledge-workspace-tab[aria-selected=\"true\"]{color:var(--text-normal);border-bottom-color:var(--text-accent)}",
      ".knowledge-workspace-tab-desc{font-size:var(--ke-type-caption,.64rem);color:var(--text-faint);margin:0 0 var(--ke-space-2,4px)}",
      ".knowledge-workspace-tab-role{font-size:var(--ke-type-caption,.64rem);color:var(--text-muted);font-weight:600;margin:0 0 var(--ke-space-1,2px)}",
      ".knowledge-workspace-panel{min-height:0}",
      "@media(max-width:600px){.knowledge-workspace-tabs{flex-wrap:wrap;overflow:visible}.knowledge-workspace-tab{box-sizing:border-box;flex:1 1 calc(50% - 2px);min-width:0;padding:10px 8px;white-space:normal;line-height:1.25;font-size:var(--ke-type-body,.84rem)}}"
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

  function mountTabs(container, options) {
    if (!container) return null;
    ensureStyles(container);
    var opts = options || {};
    var activeTab = TABS.some(function (tab) { return tab.id === opts.activeTab; }) ? opts.activeTab : "zettelkasten";
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

    var descEl = createEl(container, "p", {
      attr: {
        id: "knowledge-tab-description",
        class: "knowledge-workspace-tab-desc",
        "aria-live": "polite"
      }
    });
    var roleCueEl = createEl(container, "p", {
      attr: {
        id: "knowledge-tab-role-cue",
        class: "knowledge-workspace-tab-role",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true"
      }
    });

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
      if (!TABS.some(function (tab) { return tab.id === tabId; })) return;
      activeTab = tabId;
      TABS.forEach(function (tab) {
        var selected = tab.id === activeTab;
        setAttr(buttons[tab.id], "aria-selected", selected ? "true" : "false");
        setAttr(buttons[tab.id], "tabindex", selected ? "0" : "-1");
        if (selected) {
          setAttr(buttons[tab.id], "aria-describedby", "knowledge-tab-role-cue knowledge-tab-description");
          removeAttr(panels[tab.id], "hidden");
        } else {
          removeAttr(buttons[tab.id], "aria-describedby");
          setAttr(panels[tab.id], "hidden", "");
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
