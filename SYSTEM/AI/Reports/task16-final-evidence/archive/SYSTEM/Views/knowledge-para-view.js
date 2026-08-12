"use strict";

(function (root) {
  var STYLE_ID = "knowledge-para-view-styles";

  function ensureStyles(container) {
    var doc = container && container.ownerDocument ? container.ownerDocument : typeof document !== "undefined" ? document : null;
    if (!doc || (doc.getElementById && doc.getElementById(STYLE_ID))) return;
    var tokens = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
    if (!tokens || !tokens.RESPONSIVE_BREAKPOINTS) throw new Error("Knowledge PARA responsive tokens must load before the view.");
    var compactMax = tokens.RESPONSIVE_BREAKPOINTS.collapsedNavMax;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".knowledge-para-section,.knowledge-para-workspace,.knowledge-para-results,.knowledge-para-results-layout,.knowledge-para-source-list,.knowledge-para-selected-detail,.knowledge-para-detail-pane{box-sizing:border-box;min-inline-size:0;max-inline-size:100%}",
      ".knowledge-para-role-description,.knowledge-para-boundary-cue,.knowledge-para-action-status,.knowledge-para-section p,.knowledge-para-section dt,.knowledge-para-section dd,.knowledge-para-section h2,.knowledge-para-section h3,.knowledge-para-section h4{overflow-wrap:anywhere;word-break:keep-all}",
      ".knowledge-para-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-inline-size:0;max-inline-size:100%}",
      "button.knowledge-para-action-btn,button.knowledge-para-clear,button.knowledge-para-clear-no-match,button.knowledge-para-source-select{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-inline-size:44px;min-block-size:44px;max-inline-size:100%;box-shadow:none;white-space:normal;overflow-wrap:anywhere;word-break:keep-all}",
      ".knowledge-para-action-status{flex:1 1 100%;min-inline-size:0}",
      ".knowledge-para-controls{display:flex;flex-wrap:wrap;align-items:end;gap:8px;min-inline-size:0;max-inline-size:100%}",
      ".knowledge-para-control-label{display:flex;flex:1 1 12rem;flex-direction:column;gap:8px;min-inline-size:0;max-inline-size:100%;overflow-wrap:anywhere;word-break:keep-all}",
      "input.knowledge-para-search,select.knowledge-para-source-filter,select.knowledge-para-sort{box-sizing:border-box;inline-size:100%;min-inline-size:44px;min-block-size:44px;max-inline-size:100%;box-shadow:none;font:inherit;white-space:normal;overflow-wrap:anywhere;word-break:keep-all}",
      ".knowledge-para-action-btn:focus-visible,.knowledge-para-search:focus-visible,.knowledge-para-source-filter:focus-visible,.knowledge-para-sort:focus-visible,.knowledge-para-clear:focus-visible,.knowledge-para-clear-no-match:focus-visible,.knowledge-para-source-select:focus-visible,.knowledge-para-open-link:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}",
      ".knowledge-para-results-layout{display:grid;grid-template-columns:minmax(12rem,.7fr) minmax(0,1.3fr);gap:17px;inline-size:100%}",
      ".knowledge-para-source-list,.knowledge-para-selected-detail,.knowledge-para-detail-pane,.knowledge-para-source-row,.knowledge-para-source-detail,.knowledge-para-linked-knowledge,.knowledge-para-link-list,.knowledge-para-link-item{min-inline-size:0;max-inline-size:100%}",
      ".knowledge-para-source-row,.knowledge-para-link-item{display:flex;flex-wrap:wrap;align-items:center;gap:8px}",
      ".knowledge-para-source-select{flex:1 1 10rem}",
      ".knowledge-para-source-metadata{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:8px;min-inline-size:0;max-inline-size:100%}",
      ".knowledge-para-source-metadata dt,.knowledge-para-source-metadata dd{min-inline-size:0;margin:0}",
      "@media(max-width:" + compactMax + "px){.knowledge-para-action-btn,.knowledge-para-control-label,button.knowledge-para-clear{flex-basis:100%;inline-size:100%}.knowledge-para-results-layout{grid-template-columns:minmax(0,1fr)}.knowledge-para-source-metadata{grid-template-columns:minmax(0,1fr)}}",
      "@media(forced-colors:active){.knowledge-para-action-btn:focus-visible,.knowledge-para-search:focus-visible,.knowledge-para-source-filter:focus-visible,.knowledge-para-sort:focus-visible,.knowledge-para-clear:focus-visible,.knowledge-para-clear-no-match:focus-visible,.knowledge-para-source-select:focus-visible,.knowledge-para-open-link:focus-visible{outline-color:Highlight}}",
      "@media(prefers-reduced-motion:reduce){.knowledge-para-section *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}"
    ].join("\n");
    doc.head.appendChild(style);
  }

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

  function setText(el, value) {
    if (!el) return;
    if (typeof el.setText === "function") el.setText(value);
    else el.textContent = String(value == null ? "" : value);
  }

  function normalized(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  }

  function link(parent, options) {
    var control = createEl(parent, "a", {
      text: options.text,
      attr: {
        href: "#",
        role: "link",
        class: options.className || "knowledge-explorer-row-link",
        "aria-label": options.ariaLabel || options.text
      }
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

  function notice(message, options) {
    var opts = options || {};
    if (typeof opts.onError === "function") opts.onError(message);
    if (root.obsidian && root.obsidian.Notice) new root.obsidian.Notice(message);
  }

  function renderParaActions(container, options) {
    var opts = options || {};
    var app = opts.app;
    var onCreated = typeof opts.onCreated === "function" ? opts.onCreated : function () {};
    var service = root.ParaObjectCreatorService;
    if (!service || !Array.isArray(service.ACTIONS)) {
      createEl(container, "p", {
        text: "PARA Object 작업을 사용할 수 없습니다. Creator 서비스를 확인해 주세요.",
        attr: { class: "knowledge-explorer-detail-empty", "data-state": "error" }
      });
      return null;
    }

    var bar = createEl(container, "div", {
      attr: { class: "knowledge-para-actions", role: "toolbar", "aria-label": "PARA Object 만들기" }
    });
    var status = createEl(bar, "div", {
      attr: { class: "knowledge-para-action-status", role: "status", "aria-live": "polite" }
    });
    service.ACTIONS.forEach(function (action) {
      var description = action.description || action.label;
      var btn = createEl(bar, "button", {
        text: (action.icon ? action.icon + " " : "") + action.label,
        attr: {
          type: "button",
          class: "knowledge-para-action-btn prodigy-configurator-chip",
          "data-action": action.id,
          "aria-label": action.aria_label || action.label,
          title: description
        }
      });
      btn.onclick = async function () {
        var title = "";
        if (action.requires_title === true || action.writes === true) {
          if (typeof root.prompt !== "function") {
            notice(action.title_error || "제목을 입력할 수 없어 작업을 중단했습니다.", opts);
            return;
          }
          title = root.prompt(action.prompt || "제목을 입력하세요") || "";
          if (!String(title).trim()) {
            setText(status, action.title_error || "제목을 입력해 주세요.");
            return;
          }
        }
        if (btn) btn.disabled = true;
        setText(status, action.pending_message || (action.writes ? "검토 제안을 만드는 중입니다." : "작업을 여는 중입니다."));
        try {
          if (action.writes === true) {
            var creator = dependency("ObjectCreatorCore");
            var capture = dependency("CaptureActionRuntime");
            var actionId = "object-creator-" + action.id;
            var sessionId = "knowledge-para-" + action.id + "-" + new Date().toISOString();
            var result = await creator.launchExistingCreator(app, action.id, title, Object.assign({}, opts.actionOptions || {}, {
              humanConfirmation: capture.humanConfirmation(actionId, sessionId)
            }));
            if (!result || result.review_required !== true || !result.capture || result.capture.record.state !== "human_review") {
              throw new Error("PARA 변경은 human_review 화면에서 확인해야 합니다.");
            }
            var review = result.capture.record;
            capture.renderReview(status, review, {
              confirm: async function () {
                try {
                  var committed = await creator.launchExistingCreator(app, action.id, title, Object.assign({}, opts.actionOptions || {}, {
                    captureReview: review,
                    humanConfirmation: capture.humanConfirmation(actionId, review.approval_evidence.review.session_id)
                  }));
                  setText(status, committed.message || action.success_message || "작업을 완료했습니다.");
                  onCreated(committed);
                } catch (error) {
                  var message = error && error.message ? error.message : action.error_message;
                  setText(status, message); notice(message, opts);
                } finally { if (btn) btn.disabled = false; }
              },
              reject: function () {
                capture.decideHumanReview(review, capture.humanConfirmation(actionId, review.approval_evidence.review.session_id), actionId, "reject");
                setText(status, "제안을 거절했습니다."); if (btn) btn.disabled = false;
              },
              cancel: function () {
                capture.decideHumanReview(review, capture.humanConfirmation(actionId, review.approval_evidence.review.session_id), actionId, "cancel");
                setText(status, "제안을 취소했습니다."); if (btn) btn.disabled = false;
              }
            });
            if (typeof opts.onReview === "function") opts.onReview(review);
            return;
          }
          if (!service.executeAction || typeof service.executeAction !== "function") throw new Error("PARA Creator의 executeAction을 사용할 수 없습니다.");
          var delegated = await service.executeAction(action.id, app, title, opts.actionOptions || {});
          if (!delegated || delegated.ok !== true) throw new Error(delegated && (delegated.error || delegated.message) || action.error_message || "PARA 작업을 완료하지 못했습니다.");
          setText(status, delegated.message || action.success_message || "작업을 완료했습니다.");
          onCreated(delegated);
        } catch (error) {
          var message = error && error.message ? error.message : (action.error_message || "PARA 작업을 완료하지 못했습니다.");
          setText(status, message); notice(message, opts);
          if (btn) btn.disabled = false;
        }
      };
    });
    return bar;
  }

  function sourceTypeOptions(paraModel, Para) {
    if (paraModel && Array.isArray(paraModel.source_type_options)) return paraModel.source_type_options.slice();
    var seen = Object.create(null);
    (paraModel && Array.isArray(paraModel.groups) ? paraModel.groups : []).forEach(function (group) {
      var type = String(group && group.source_type || "");
      if (seen[type]) return;
      seen[type] = true;
    });
    return Object.keys(seen).sort().map(function (type) {
      return { value: type, source_type: type, label: Para.sourceTypeLabel(type) };
    });
  }

  function compareGroups(left, right, sortKey) {
    var a = left || {};
    var b = right || {};
    if (sortKey === "links") {
      return (Number(b.link_count || b.knowledge_count || 0) - Number(a.link_count || a.knowledge_count || 0)) ||
        String(a.source_title || "").localeCompare(String(b.source_title || ""), "en") ||
        String(a.source_path || "").localeCompare(String(b.source_path || ""), "en");
    }
    if (sortKey === "type") {
      return String(a.source_type_label || "").localeCompare(String(b.source_type_label || ""), "en") ||
        String(a.source_type || "").localeCompare(String(b.source_type || ""), "en") ||
        String(a.source_title || "").localeCompare(String(b.source_title || ""), "en") ||
        String(a.source_path || "").localeCompare(String(b.source_path || ""), "en");
    }
    if (sortKey === "title") {
      return String(a.source_title || "").localeCompare(String(b.source_title || ""), "en") ||
        String(a.source_path || "").localeCompare(String(b.source_path || ""), "en");
    }
    return String(a.source_path || "").localeCompare(String(b.source_path || ""), "en") ||
      String(a.source_title || "").localeCompare(String(b.source_title || ""), "en") ||
      String(a.source_type || "").localeCompare(String(b.source_type || ""), "en");
  }

  function filteredGroups(paraModel, state) {
    var groups = paraModel && Array.isArray(paraModel.groups) ? paraModel.groups.slice() : [];
    var query = normalized(state.query);
    var type = String(state.sourceType || "");
    groups = groups.filter(function (group) {
      if (type && String(group.source_type || "") !== type) return false;
      return !query || normalized(group.search_text || [
        group.source_path, group.source_title, group.source_type, group.source_type_label
      ].join(" ")).includes(query);
    });
    groups.sort(function (a, b) { return compareGroups(a, b, state.sort); });
    return groups;
  }

  function formatMetadataValue(value) {
    if (Array.isArray(value)) return value.map(function (item) { return formatMetadataValue(item); }).join(", ");
    if (value && typeof value === "object") {
      try { return JSON.stringify(value); } catch (_error) { return String(value); }
    }
    return String(value == null ? "" : value);
  }

  function renderMetadata(parent, metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var keys = Object.keys(source).filter(function (key) {
      return !["frontmatter", "path", "source_path", "title", "type", "type_label"].includes(key);
    }).sort();
    var rows = [];
    if (source.path || source.source_path) rows.push(["경로", source.path || source.source_path]);
    if (source.type_label || source.type) rows.push(["유형", source.type_label || source.type]);
    if (source.title) rows.push(["제목", source.title]);
    keys.forEach(function (key) {
      if (source[key] !== undefined && source[key] !== "") rows.push([key, formatMetadataValue(source[key])]);
    });
    var frontmatter = source.frontmatter;
    if (frontmatter && typeof frontmatter === "object") {
      Object.keys(frontmatter).sort().forEach(function (key) {
        if (rows.some(function (row) { return row[0] === key; })) return;
        var value = formatMetadataValue(frontmatter[key]);
        if (value) rows.push([key, value]);
      });
    }
    if (!rows.length) {
      createEl(parent, "p", { text: "표시할 원본 메타데이터가 없습니다.", attr: { class: "knowledge-explorer-detail-empty" } });
      return;
    }
    var list = createEl(parent, "dl", { attr: { class: "knowledge-para-source-metadata" } });
    rows.forEach(function (row) {
      createEl(list, "dt", { text: row[0], attr: { class: "knowledge-explorer-meta" } });
      createEl(list, "dd", { text: row[1], attr: { class: "knowledge-explorer-detail-item-note" } });
    });
  }

  function openAction(parent, text, path, onOpen) {
    if (path) return link(parent, {
      text: text,
      ariaLabel: text,
      className: "knowledge-para-open-link knowledge-explorer-row-link",
      onOpen: function () { onOpen(path); }
    });
    return createEl(parent, "span", {
      text: "원본 경로 없음",
      attr: { class: "knowledge-explorer-meta", "data-state": "disabled" }
    });
  }

  function renderDetail(parent, group, onOpenBeside, Para) {
    var detail = createEl(parent, "section", {
      attr: {
        class: "knowledge-para-detail-pane knowledge-explorer-detail-card",
        "aria-label": "선택한 Object 상세",
        "data-source-path": group.source_path || ""
      }
    });
    var header = createEl(detail, "header", { attr: { class: "knowledge-explorer-pane-head" } });
    var titleWrap = createEl(header, "div", { attr: { class: "knowledge-explorer-pane-title" } });
    createEl(titleWrap, "h3", { text: group.source_title || "제목 없음" });
    createEl(titleWrap, "p", {
      text: Para.sourceTypeLabel(group.source_type) + " · 연결 " + Number(group.link_count || group.knowledge_count || 0) + "건",
      attr: { class: "knowledge-explorer-meta" }
    });
    var actionWrap = createEl(header, "div", { attr: { class: "knowledge-explorer-row-actions" } });
    openAction(actionWrap, "원본 Object 열기", group.source_path, onOpenBeside);

    var metaSection = createEl(detail, "section", { attr: { class: "knowledge-para-source-detail" } });
    createEl(metaSection, "h4", { text: "Object 메타데이터" });
    renderMetadata(metaSection, group.source_metadata);

    var knowledgeSection = createEl(detail, "section", { attr: { class: "knowledge-para-linked-knowledge" } });
    createEl(knowledgeSection, "h4", { text: "연결된 승인 지식 " + Number(group.knowledge_count || (group.knowledge || []).length) + "개" });
    var knowledge = Array.isArray(group.knowledge) ? group.knowledge : [];
    if (!knowledge.length) {
      createEl(knowledgeSection, "p", { text: "연결된 승인 지식이 없습니다.", attr: { class: "knowledge-explorer-detail-empty", "data-state": "empty" } });
      return;
    }
    var list = createEl(knowledgeSection, "ul", { attr: { class: "knowledge-para-link-list" } });
    knowledge.forEach(function (item) {
      var row = createEl(list, "li", { attr: { class: "knowledge-para-link-item" } });
      openAction(row, "원본 지식 노트 열기 · " + item.knowledge_title, item.knowledge_path, onOpenBeside);
      var meta = [item.knowledge_domain].concat(item.knowledge_topics || []).filter(Boolean);
      if (meta.length) createEl(row, "span", { text: meta.join(" · "), attr: { class: "knowledge-explorer-meta" } });
    });
  }

  function renderParaPanel(container, paraModel, options) {
    if (!container) return;
    ensureStyles(container);
    empty(container);
    var opts = options || {};
    var onOpenBeside = typeof opts.onOpenBeside === "function" ? opts.onOpenBeside : function () {};
    var onOpenZettel = typeof opts.onOpenZettel === "function" ? opts.onOpenZettel : function () {};
    var Para = dependency("KnowledgeParaProjection");
    var model = paraModel && typeof paraModel === "object" ? paraModel : {};
    var state = { query: "", sourceType: "", sort: "source", selectedPath: "" };

    var section = createEl(container, "section", {
      attr: {
        class: "knowledge-para-section",
        "aria-label": "지식 활용 · PARA",
        "data-workspace-role": "knowledge-use"
      }
    });
    var roleBanner = createEl(section, "header", {
      attr: {
        class: "knowledge-workspace-role-banner knowledge-para-role-banner",
        "data-workspace-role": "knowledge-use",
        "aria-label": "PARA 실행·맥락 계층"
      }
    });
    createEl(roleBanner, "h2", { text: "지식 활용 · PARA" });
    createEl(roleBanner, "p", {
      text: "실행·맥락 계층: 프로젝트·영역·자료의 PARA Object를 관리하고 명시적으로 연결된 승인 Knowledge를 활용합니다. Zettelkasten(제텔카스텐)은 지식 검토·승인 계층입니다.",
      attr: { class: "knowledge-para-role-description" }
    });
    renderParaActions(section, opts);
    createEl(section, "aside", {
      text: "경계: Candidates(후보)·Literature(문헌) 자료·미승인 제안은 승인 Knowledge로 표시하지 않습니다.",
      attr: {
        class: "knowledge-workspace-boundary-cue knowledge-para-boundary-cue",
        role: "note",
        "aria-label": "승인 Knowledge 표시 경계"
      }
    });
    var summary = createEl(section, "p", { attr: { class: "knowledge-explorer-detail-summary" } });
    var workspace = createEl(section, "div", { attr: { class: "knowledge-para-workspace" } });
    var controls = createEl(workspace, "form", {
      attr: { class: "knowledge-para-controls", "aria-label": "PARA 검색 및 필터" }
    });
    controls.onsubmit = function (event) {
      if (event && event.preventDefault) event.preventDefault();
      return false;
    };
    var searchLabel = createEl(controls, "label", { text: "검색", attr: { class: "knowledge-para-control-label" } });
    var search = createEl(searchLabel, "input", {
      attr: { type: "search", class: "knowledge-para-search prodigy-configurator-chip", "aria-label": "PARA Object 검색", placeholder: "Object·지식·경로 검색" }
    });
    var typeLabel = createEl(controls, "label", { text: "Object 유형", attr: { class: "knowledge-para-control-label" } });
    var typeSelect = createEl(typeLabel, "select", { attr: { class: "knowledge-para-source-filter prodigy-configurator-chip", "aria-label": "Object 유형 필터" } });
    var sortLabel = createEl(controls, "label", { text: "정렬", attr: { class: "knowledge-para-control-label" } });
    var sortSelect = createEl(sortLabel, "select", { attr: { class: "knowledge-para-sort prodigy-configurator-chip", "aria-label": "PARA 정렬" } });
    var clear = createEl(controls, "button", {
      text: "필터 초기화",
      attr: { type: "button", class: "knowledge-para-clear prodigy-configurator-chip", "aria-label": "PARA 검색과 필터 초기화" }
    });
    var optionsByType = sourceTypeOptions(model, Para);
    createEl(typeSelect, "option", { text: "모든 Object 유형", attr: { value: "" } });
    optionsByType.forEach(function (option) {
      createEl(typeSelect, "option", {
        text: option.label + " (" + Number(option.source_count || 0) + ")",
        attr: { value: option.value || "" }
      });
    });
    [
      ["source", "원본 경로순"], ["title", "Object 이름순"],
      ["type", "유형순"], ["links", "연결 많은 순"]
    ].forEach(function (option) {
      createEl(sortSelect, "option", { text: option[1], attr: { value: option[0] } });
    });
    search.value = "";
    typeSelect.value = "";
    sortSelect.value = state.sort;

    var results = createEl(workspace, "div", { attr: { class: "knowledge-para-results" } });

    function clearFilters() {
      state.query = "";
      state.sourceType = "";
      state.selectedPath = "";
      if (search) search.value = "";
      if (typeSelect) typeSelect.value = "";
      state.sort = "source";
      if (sortSelect) sortSelect.value = state.sort;
      renderWorkspace();
      if (search && typeof search.focus === "function") search.focus();
    }

    clear.onclick = clearFilters;
    search.oninput = function (event) {
      state.query = event && event.target ? event.target.value : search.value;
      renderWorkspace();
    };
    typeSelect.onchange = function (event) {
      state.sourceType = event && event.target ? event.target.value : typeSelect.value;
      renderWorkspace();
    };
    sortSelect.onchange = function (event) {
      state.sort = event && event.target ? event.target.value : sortSelect.value;
      renderWorkspace();
    };

    function renderWorkspace() {
      empty(results);
      var totalLinks = Number(model.total_links || 0);
      var totalSources = Number(model.total_sources || 0);
      setText(summary, "승인 지식 " + Number(model.total_knowledge || 0) + "개 중 " + totalSources + "개 Object에서 " + totalLinks + "건 연결됨");
      if (!totalLinks) {
        var emptyState = createEl(results, "div", { attr: { class: "knowledge-explorer-empty", "data-state": "empty" } });
        createEl(emptyState, "p", {
          text: "연결된 지식 없음 — 원본 Object의 connections에 승인 Knowledge 링크를 추가한 뒤 다시 여세요."
        });
        var openZettel = createEl(emptyState, "button", {
          text: "지식 구축에서 검증 대기 열기",
          attr: { type: "button", class: "knowledge-para-clear-no-match prodigy-configurator-chip", "aria-label": "지식 구축에서 검증 대기 열기" }
        });
        openZettel.onclick = function () { onOpenZettel(); };
        return;
      }

      var groups = filteredGroups(model, state);
      if (!groups.length) {
        var noMatch = createEl(results, "div", {
          attr: { class: "knowledge-explorer-empty", "data-state": "no-match", role: "status", "aria-live": "polite" }
        });
        createEl(noMatch, "p", { text: "검색 또는 필터와 일치하는 Object가 없습니다." });
        var reset = createEl(noMatch, "button", {
          text: "검색·필터 초기화",
          attr: { type: "button", class: "knowledge-para-clear-no-match prodigy-configurator-chip" }
        });
        reset.onclick = clearFilters;
        return;
      }

      var layout = createEl(results, "div", { attr: { class: "knowledge-para-results-layout" } });
      var listPane = createEl(layout, "nav", {
        attr: { class: "knowledge-para-source-list", "aria-label": "연결된 PARA Object", role: "navigation" }
      });
      createEl(listPane, "h3", { text: "연결된 Object " + groups.length + "개" });
      var list = createEl(listPane, "div", { attr: { role: "list" } });
      var selected = groups.find(function (group) {
        return normalized(group.source_path) === normalized(state.selectedPath);
      }) || groups[0];
      state.selectedPath = selected.source_path || "";

      groups.forEach(function (group) {
        var row = createEl(list, "article", {
          attr: {
            class: "knowledge-para-source-row",
            role: "listitem",
            "data-source-path": group.source_path || "",
            "data-source-type": group.source_type || "",
            "data-selected": String(group.source_path || "") === String(state.selectedPath)
          }
        });
        var selectButton = createEl(row, "button", {
          text: group.source_title || "제목 없음",
          attr: {
            type: "button",
            class: "knowledge-para-source-select prodigy-configurator-chip",
            "aria-pressed": String(group.source_path || "") === String(state.selectedPath),
            "aria-label": (group.source_title || "Object") + " 상세 보기"
          }
        });
        selectButton.onclick = function () {
          state.selectedPath = group.source_path || "";
          renderWorkspace();
        };
        createEl(row, "span", {
          text: Para.sourceTypeLabel(group.source_type) + " · " + Number(group.link_count || group.knowledge_count || 0) + "건",
          attr: { class: "knowledge-explorer-meta" }
        });
        openAction(row, "원본 Object 열기", group.source_path, onOpenBeside);
      });

      var detailPane = createEl(layout, "div", { attr: { class: "knowledge-para-selected-detail" } });
      renderDetail(detailPane, selected, onOpenBeside, Para);
    }
    renderWorkspace();
    return section;
  }

  var api = Object.freeze({
    renderParaPanel: renderParaPanel,
    renderParaActions: renderParaActions,
    filteredGroups: filteredGroups,
    compareGroups: compareGroups
  });
  root.KnowledgeParaView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
