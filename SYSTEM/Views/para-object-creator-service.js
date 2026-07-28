"use strict";

(function (root) {
  /**
   * PARA Object Creator Service — single shared writer for Area and Documentation.
   * Both Knowledge PARA view and Universal Object Creator use this service.
   * Literature delegates to existing knowledge authoring.
   * Project delegates to existing Project Wizard.
   * Reading handoff opens a prefilled manual modal via ReadingBookCreate.
   *
   * Zero duplicate persistence: Area and Documentation are written ONLY here.
   * No generic `resource` type. No fuzzy routing. No auto-search.
   */

  var AREA_FOLDER = "PARA/AREAS";
  var DOCUMENTATION_FOLDER = "PARA/RESOURCES/DOCUMENTATIONS";

  var ACTIONS = Object.freeze([
    Object.freeze({ id: "area", label: "영역 만들기", type: "area_family", icon: "📂", writes: true }),
    Object.freeze({ id: "documentation", label: "문서 만들기", type: "documentation_note", icon: "📄", writes: true }),
    Object.freeze({ id: "literature", label: "문헌 노트 만들기", type: "literature_note", icon: "📚", writes: false }),
    Object.freeze({ id: "project", label: "프로젝트 만들기", type: "project", icon: "📁", writes: false })
  ]);

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeName(value) {
    var name = clean(value).replace(/[\\/:*?"<>|#[\]^]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return "";
    return name.slice(0, 120);
  }

  function todayTimestamp(now) {
    var d = now || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return y + "-" + m + "-" + day + " " + h + ":" + min;
  }

  /**
   * Validate a title for Area or Documentation creation.
   * Returns { ok: true, name } or { ok: false, error }.
   */
  function validateTitle(input) {
    var name = safeName(input);
    if (!name) return { ok: false, error: "제목을 입력해 주세요." };
    if (name.length < 2) return { ok: false, error: "제목은 2자 이상이어야 합니다." };
    return { ok: true, name: name };
  }

  /**
   * Check collision at exact path. Returns true if file exists.
   */
  function hasCollision(app, filePath) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") return false;
    return !!app.vault.getAbstractFileByPath(filePath);
  }

  /**
   * Build Area content with proper frontmatter.
   */
  function buildAreaContent(name, options) {
    var opts = options || {};
    var now = opts.now || new Date();
    var category = clean(opts.category);
    var summary = clean(opts.summary);
    var tag = "area/" + name.toLowerCase().replace(/\s+/g, "_");
    var lines = [
      "---",
      "area: " + name,
      "area_category: " + (category || ""),
      "summary: " + (summary || ""),
      "tags:",
      "  - " + tag,
      "type: area_family",
      "created: " + todayTimestamp(now),
      "cssclasses:",
      "  - hide-properties_editing",
      "  - hide-properties_reading",
      "---",
      "<!-- PARA · 실행 계층: 이 영역에서 승인 지식을 활용하려면 본문에 [[지식 제목]] 링크를 추가하세요. -->",
      "# " + name,
      "",
      "## Overview",
      "",
      ""
    ];
    return lines.join("\n");
  }

  /**
   * Build Documentation content with proper frontmatter.
   */
  function buildDocumentationContent(name, options) {
    var opts = options || {};
    var now = opts.now || new Date();
    var connections = opts.connections;
    var connYaml = "connections: []";
    if (Array.isArray(connections) && connections.length) {
      connYaml = "connections:\n" + connections.map(function (c) {
        return '  - "[[' + clean(c) + ']]"';
      }).join("\n");
    }
    var lines = [
      "---",
      connYaml,
      "reference: ",
      "tags:",
      "  - documentation_note",
      "type: documentation_note",
      "created: " + todayTimestamp(now),
      "---",
      "# " + name,
      "",
      ""
    ];
    return lines.join("\n");
  }

  /**
   * Create an Area Object. Single writer — no other code creates Areas.
   * Path: PARA/AREAS/<Name>/2. <Name>.md
   * Returns { ok, path, file } or throws on collision/invalid.
   */
  async function createArea(app, input, options) {
    var validation = validateTitle(input);
    if (!validation.ok) throw new Error(validation.error);
    var name = validation.name;
    var folder = AREA_FOLDER + "/" + name;
    var filePath = folder + "/2. " + name + ".md";

    if (hasCollision(app, filePath)) {
      throw new Error("이미 존재하는 영역입니다: " + name);
    }
    if (hasCollision(app, folder)) {
      throw new Error("이미 존재하는 영역입니다: " + name);
    }

    var content = buildAreaContent(name, options);

    if (app.vault.createFolder && !app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
    var file = await app.vault.create(filePath, content);
    return { ok: true, path: filePath, file: file, name: name, type: "area_family" };
  }

  /**
   * Create a Documentation Object. Single writer — no other code creates Documentation.
   * Path: PARA/RESOURCES/DOCUMENTATIONS/<Name>.md
   * Returns { ok, path, file } or throws on collision/invalid.
   */
  async function createDocumentation(app, input, options) {
    var validation = validateTitle(input);
    if (!validation.ok) throw new Error(validation.error);
    var name = validation.name;
    var filePath = DOCUMENTATION_FOLDER + "/" + name + ".md";

    if (hasCollision(app, filePath)) {
      throw new Error("이미 존재하는 문서입니다: " + name);
    }

    var content = buildDocumentationContent(name, options);
    var file = await app.vault.create(filePath, content);
    return { ok: true, path: filePath, file: file, name: name, type: "documentation_note" };
  }

  /**
   * Delegate Literature creation to existing knowledge authoring.
   * Does NOT write directly — opens the source authoring form.
   */
  function openLiteratureAuthoring(app, options) {
    var opts = options || {};
    if (root.KnowledgeAuthoringHubAdapter && typeof root.KnowledgeAuthoringHubAdapter.openSourceAuthoring === "function") {
      root.KnowledgeAuthoringHubAdapter.openSourceAuthoring(app, opts);
      return { ok: true, deferred: true, message: "문헌 노트 작성 창을 열었습니다." };
    }
    if (root.KnowledgeSourceAuthoringView && typeof root.KnowledgeSourceAuthoringView.open === "function") {
      root.KnowledgeSourceAuthoringView.open(app, opts);
      return { ok: true, deferred: true, message: "문헌 노트 작성 창을 열었습니다." };
    }
    // Fallback: open Knowledge hub
    if (app && app.workspace && app.workspace.openLinkText) {
      app.workspace.openLinkText("HUB/50 Knowledge", "HUB/50 Knowledge.md", false);
    }
    return { ok: true, deferred: true, path: "HUB/50 Knowledge.md", message: "지식 워크스페이스를 열었습니다." };
  }

  /**
   * Delegate Project creation to existing Project Wizard.
   * Does NOT write directly — opens the wizard.
   */
  function openProjectWizard(app, options) {
    var opts = options || {};
    if (typeof root.openProjectWizard === "function") {
      if (opts.initialProjectName) {
        root.openProjectWizard({ initialProjectName: opts.initialProjectName });
      } else {
        root.openProjectWizard();
      }
      return { ok: true, deferred: true, message: "프로젝트 마법사를 열었습니다." };
    }
    if (app && app.workspace && app.workspace.openLinkText) {
      app.workspace.openLinkText("HUB/40 Project", "HUB/40 Project.md", false);
    }
    return { ok: true, deferred: true, path: "HUB/40 Project.md", message: "프로젝트 워크스페이스를 열었습니다." };
  }

  /**
   * Reading handoff — opens a prefilled manual modal via ReadingBookCreate.
   * Does NOT auto-search. Zero network calls.
   */
  function openReadingHandoff(app, options) {
    var opts = options || {};
    if (root.ReadingBookCreate && typeof root.ReadingBookCreate.open === "function") {
      root.ReadingBookCreate.open(app);
      return { ok: true, deferred: true, message: "독서 등록 창을 열었습니다." };
    }
    if (app && app.workspace && app.workspace.openLinkText) {
      app.workspace.openLinkText("HUB/20 Reading", "HUB/20 Reading.md", false);
    }
    return { ok: true, deferred: true, path: "HUB/20 Reading.md", message: "독서 워크스페이스를 열었습니다." };
  }

  /**
   * Unified action dispatcher. Both entry points call this.
   * @param {string} actionId - One of: area, documentation, literature, project, reading
   * @param {object} app - Obsidian app instance
   * @param {string} title - Object title
   * @param {object} [options] - Additional options
   * @returns {Promise<object>} Result with ok, path, deferred, message
   */
  async function executeAction(actionId, app, title, options) {
    var id = clean(actionId).toLowerCase();
    var opts = options || {};

    if (id === "area") {
      return createArea(app, title, opts);
    }
    if (id === "documentation") {
      return createDocumentation(app, title, opts);
    }
    if (id === "literature") {
      return openLiteratureAuthoring(app, Object.assign({}, opts, { initialTitle: clean(title) }));
    }
    if (id === "project") {
      return openProjectWizard(app, Object.assign({}, opts, { initialProjectName: clean(title) }));
    }
    if (id === "reading") {
      return openReadingHandoff(app, Object.assign({}, opts, { initialTitle: clean(title) }));
    }

    throw new Error("알 수 없는 PARA 액션입니다: " + id);
  }

  var api = Object.freeze({
    AREA_FOLDER: AREA_FOLDER,
    DOCUMENTATION_FOLDER: DOCUMENTATION_FOLDER,
    ACTIONS: ACTIONS,
    clean: clean,
    safeName: safeName,
    validateTitle: validateTitle,
    hasCollision: hasCollision,
    buildAreaContent: buildAreaContent,
    buildDocumentationContent: buildDocumentationContent,
    createArea: createArea,
    createDocumentation: createDocumentation,
    openLiteratureAuthoring: openLiteratureAuthoring,
    openProjectWizard: openProjectWizard,
    openReadingHandoff: openReadingHandoff,
    executeAction: executeAction
  });

  root.ParaObjectCreatorService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
