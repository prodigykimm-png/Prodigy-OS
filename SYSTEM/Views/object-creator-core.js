(function (root) {
  "use strict";

  /**
   * Universal Object Creator — orchestration only.
   * Classifies via Object Engine; launches existing workspace creators.
   * Never invents Object schemas or duplicates creation logic.
   */

  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function getEngine() {
    return root.ObjectEngine || root.ObjectEngineCore || null;
  }

  function notice(message, timeout) {
    if (typeof Notice !== "undefined") new Notice(message, timeout || 5000);
    else if (root.obsidian && root.obsidian.Notice) new root.obsidian.Notice(message, timeout || 5000);
  }

  function openPath(app, path) {
    if (!app || !path || !app.workspace || !app.workspace.openLinkText) {
      return Promise.resolve();
    }
    const link = String(path).replace(/\.md$/i, "");
    const result = app.workspace.openLinkText(link, path, false);
    return result && typeof result.then === "function" ? result : Promise.resolve(result);
  }

  function todayIso() {
    if (root.MorningContextCore && typeof root.MorningContextCore.getTodayIsoDate === "function") {
      return root.MorningContextCore.getTodayIsoDate();
    }
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function safeFileName(name) {
    return clean(name)
      .replace(/[\\/:*?"<>|#[\]^]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "untitled";
  }

  /**
   * Classify free text into creatable Object types.
   * Prefers ObjectEngine.classify(); falls back to classifyInput alias.
   */
  function classify(input, options) {
    const engine = getEngine();
    if (engine && typeof engine.classify === "function") {
      return engine.classify(input, options);
    }
    if (engine && typeof engine.classifyInput === "function") {
      return engine.classifyInput(input, options);
    }
    // Absolute fallback without engine
    return {
      candidates: [{
        id: "journal",
        label: "저널",
        type: "journal",
        icon: "📅",
        score: 1,
        reasons: ["분류를 사용할 수 없어 저널을 제안합니다."],
        reason: "분류를 사용할 수 없어 저널을 제안합니다.",
        confidence: 0.1
      }],
      selected: {
        id: "journal",
        label: "저널",
        type: "journal",
        icon: "📅",
        score: 1,
        reasons: ["분류를 사용할 수 없어 저널을 제안합니다."],
        reason: "분류를 사용할 수 없어 저널을 제안합니다.",
        confidence: 0.1
      },
      fallback: true,
      empty: !clean(input)
    };
  }

  /**
   * Duplicate / similar hint via ObjectEngine.findDuplicates()
   * (alias: findSimilarObjects). Never blocks creation.
   */
  function findSimilar(input, objectLists, options) {
    const engine = getEngine();
    if (engine && typeof engine.findDuplicates === "function") {
      return engine.findDuplicates(input, objectLists, options);
    }
    if (engine && typeof engine.findSimilarObjects === "function") {
      return engine.findSimilarObjects(input, objectLists, options);
    }
    return [];
  }

  function getDisplay() {
    return root.prodigyDisplay || root.ProdigyDisplay || null;
  }

  /**
   * Convert Object Engine duplicate hits into Creator UI cards.
   * Drops candidates without title or path (cannot open).
   * Does not change classification or mutate sources.
   */
  function normalizeDuplicateResults(rawResults, options) {
    const opts = options || {};
    const max = Math.max(1, Math.min(Number(opts.maxResults != null ? opts.maxResults : 3) || 3, 10));
    const display = getDisplay();
    const out = [];
    const seen = Object.create(null);

    (Array.isArray(rawResults) ? rawResults : []).forEach((item) => {
      if (!item) return;
      const title = clean(item.title || item.name || item.label);
      const path = clean(item.path || item.object_path);
      if (!title || !path) return;
      const key = path.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;

      let type = clean(item.type);
      if (type === "auction") type = "auction_case";
      const status = clean(item.status || item.canonical_status);
      let typeLabel = clean(item.label || item.typeLabel || item.type_label);
      if (!typeLabel && display && typeof display.type === "function" && type) {
        try { typeLabel = display.type(type); } catch (_e) { typeLabel = ""; }
      }
      if (!typeLabel) typeLabel = type || "Object";

      let statusLabel = clean(item.statusLabel || item.status_label);
      if (!statusLabel && status && display && typeof display.status === "function") {
        try { statusLabel = display.status(status); } catch (_e) { statusLabel = status; }
      }

      const reason = clean(item.reason)
        || (Array.isArray(item.reasons) && item.reasons[0] ? clean(item.reasons[0]) : "")
        || "제목이 유사합니다.";

      out.push({
        title,
        path,
        type: type || "",
        typeLabel,
        status: status || "",
        statusLabel: statusLabel || "",
        reason
      });
    });

    return out.slice(0, max);
  }

  /**
   * Engine findDuplicates → normalized Creator candidates.
   * On engine failure: empty list (creation still works).
   */
  function listDuplicateCandidates(input, objectLists, options) {
    const opts = options || {};
    try {
      const raw = findSimilar(input, objectLists, {
        max: opts.max != null ? opts.max : (opts.maxResults != null ? opts.maxResults : 5)
      });
      return normalizeDuplicateResults(raw, {
        maxResults: opts.maxResults != null ? opts.maxResults : 3
      });
    } catch (_err) {
      return [];
    }
  }

  /**
   * Open an existing Object by path. Never launches a creator.
   * @returns {Promise<{ ok: boolean, path?: string, error?: string }>}
   */
  async function openExistingObject(app, item) {
    const host = app || root.app;
    const path = clean(item && (item.path || item.object_path));
    if (!path) {
      notice("기존 Object를 열 수 없습니다.");
      return { ok: false, error: "path missing" };
    }
    if (!host || !host.workspace || typeof host.workspace.openLinkText !== "function") {
      notice("기존 Object를 열 수 없습니다.");
      return { ok: false, error: "workspace unavailable" };
    }
    try {
      await openPath(host, path);
      return { ok: true, path };
    } catch (err) {
      notice("기존 Object를 열 수 없습니다.");
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  function createActionLabel(typeId) {
    const id = clean(typeId).toLowerCase();
    const map = {
      project: "프로젝트 만들기",
      people: "사람 만들기",
      reading: "독서 Object 만들기",
      workout: "운동 워크스페이스 열기",
      auction: "경매 워크스페이스 열기",
      knowledge: "지식 메모 만들기",
      journal: "저널 열기"
    };
    return map[id] || "새로 만들기";
  }

  function listTypes() {
    const engine = getEngine();
    if (engine && typeof engine.listCreatableTypes === "function") {
      return engine.listCreatableTypes();
    }
    return [
      { id: "project", label: "프로젝트", type: "project", icon: "📁" },
      { id: "journal", label: "저널", type: "journal", icon: "📅" }
    ];
  }

  /**
   * Launch existing creator for a type. Does not reimplement wizards.
   * @returns {Promise<{ ok: boolean, path?: string, deferred?: boolean, message?: string }>}
   */
  async function launchExistingCreator(app, typeId, inputTitle, options) {
    const opts = options || {};
    const host = app || root.app;
    const title = clean(inputTitle);
    const id = clean(typeId).toLowerCase();

    if (!host) {
      throw new Error("Obsidian 앱 컨텍스트가 필요합니다.");
    }

    // Project → existing wizard (hand off Creator title as initial project name)
    if (id === "project") {
      if (typeof root.openProjectWizard === "function") {
        if (title) {
          root.openProjectWizard({ initialProjectName: title });
        } else {
          root.openProjectWizard();
        }
        return {
          ok: true,
          deferred: true,
          message: "프로젝트 마법사를 열었습니다."
        };
      }
      await openPath(host, "HUB/40 Project.md");
      return { ok: true, deferred: true, path: "HUB/40 Project.md", message: "프로젝트 워크스페이스를 열었습니다." };
    }

    // People → existing PeopleStore / PeopleView
    if (id === "people") {
      if (root.PeopleView && typeof root.PeopleView.createAndOpen === "function") {
        const name = title || "이름 없음";
        const result = await root.PeopleView.createAndOpen(host, name);
        return { ok: true, path: result && result.path, message: `사람 Object: ${name}` };
      }
      if (root.PeopleStore && typeof root.PeopleStore.createPeople === "function") {
        const result = await root.PeopleStore.createPeople(host, title || "이름 없음");
        if (result && result.path) await openPath(host, result.path);
        return { ok: true, path: result && result.path, message: "사람 Object를 만들었습니다." };
      }
      await openPath(host, "HUB/60 Personal.md");
      return { ok: true, deferred: true, path: "HUB/60 Personal.md", message: "Personal Hub를 열었습니다." };
    }

    // Reading → existing ReadingBookCreate
    if (id === "reading") {
      if (root.ReadingBookCreate) {
        if (title && typeof root.ReadingBookCreate.createReadingObject === "function") {
          try {
            const result = await root.ReadingBookCreate.createReadingObject(host, title);
            if (result && result.file) {
              if (host.workspace && host.workspace.getLeaf) {
                await host.workspace.getLeaf(false).openFile(result.file);
              } else if (result.file.path) {
                await openPath(host, result.file.path);
              }
              return { ok: true, path: result.file.path, message: `독서 Object: ${result.title || title}` };
            }
          } catch (_e) {
            // fall through to modal
          }
        }
        if (typeof root.ReadingBookCreate.open === "function") {
          root.ReadingBookCreate.open(host);
          return { ok: true, deferred: true, message: "독서 생성 창을 열었습니다." };
        }
      }
      await openPath(host, "HUB/20 Reading.md");
      return { ok: true, deferred: true, path: "HUB/20 Reading.md", message: "독서 워크스페이스를 열었습니다." };
    }

    // Workout → existing Workout workspace (import/create lives there)
    if (id === "workout") {
      await openPath(host, "HUB/30 Workout.md");
      return {
        ok: true,
        deferred: true,
        path: "HUB/30 Workout.md",
        message: title
          ? `운동 워크스페이스를 열었습니다. 힌트: ${title}`
          : "운동 워크스페이스를 열었습니다."
      };
    }

    // Auction → existing Auction workspace (templates live there)
    if (id === "auction") {
      await openPath(host, "HUB/10 Auction.md");
      return {
        ok: true,
        deferred: true,
        path: "HUB/10 Auction.md",
        message: title
          ? `경매 워크스페이스를 열었습니다. 힌트: ${title}`
          : "경매 워크스페이스를 열었습니다."
      };
    }

    // Knowledge → lightweight note in ZETA/FLEETING (template-compatible path)
    if (id === "knowledge") {
      const folder = "ZETA/FLEETING";
      const base = safeFileName(title || "지식 메모");
      let path = `${folder}/${base}.md`;
      let n = 2;
      while (host.vault && host.vault.getAbstractFileByPath && host.vault.getAbstractFileByPath(path)) {
        path = `${folder}/${base} (${n++}).md`;
      }
      const body = [
        "---",
        "type: fleeting_note",
        "status: active",
        "---",
        "",
        `# ${base}`,
        "",
        ""
      ].join("\n");
      if (host.vault && typeof host.vault.create === "function") {
        // ensure folder if API allows
        try {
          if (typeof host.vault.getAbstractFileByPath === "function"
            && !host.vault.getAbstractFileByPath(folder)
            && typeof host.vault.createFolder === "function") {
            await host.vault.createFolder(folder);
          }
        } catch (_e) { /* ignore */ }
        const file = await host.vault.create(path, body);
        if (file) await openPath(host, file.path || path);
        return { ok: true, path: file && file.path ? file.path : path, message: `지식 메모: ${base}` };
      }
      await openPath(host, "HUB/50 Knowledge.md");
      return { ok: true, deferred: true, path: "HUB/50 Knowledge.md", message: "지식 Hub를 열었습니다." };
    }

    // Journal → today daily note (existing path pattern)
    if (id === "journal") {
      const day = todayIso();
      const dailyPath = `DAILY/DAILY/${day}.md`;
      if (host.vault) {
        let file = host.vault.getAbstractFileByPath
          ? host.vault.getAbstractFileByPath(dailyPath)
          : null;
        if (!file && typeof host.vault.create === "function") {
          let templateContent = "";
          try {
            const tpl = host.vault.getAbstractFileByPath("SYSTEM/TEMPLATE/FORMAT/template_daily_note.md");
            if (tpl) {
              templateContent = await host.vault.read(tpl);
              templateContent = templateContent
                .replace(/\{\{date\}\}/g, day)
                .replace(/\{\{title\}\}/g, day);
            }
          } catch (_e) {
            templateContent = `---\ntype: journal\n---\n\n# ${day}\n\n`;
          }
          if (!templateContent) templateContent = `---\ntype: journal\n---\n\n# ${day}\n\n`;
          try {
            if (!host.vault.getAbstractFileByPath("DAILY/DAILY") && host.vault.createFolder) {
              await host.vault.createFolder("DAILY/DAILY");
            }
          } catch (_e2) { /* ignore */ }
          file = await host.vault.create(dailyPath, templateContent);
        }
        if (file) {
          await openPath(host, file.path || dailyPath);
          return { ok: true, path: file.path || dailyPath, message: `오늘 저널: ${day}` };
        }
      }
      await openPath(host, "HUB/70 Journal.md");
      return { ok: true, deferred: true, path: "HUB/70 Journal.md", message: "저널 Hub를 열었습니다." };
    }

    // Registered custom types: open workspace path if provided
    if (opts.workspacePath) {
      await openPath(host, opts.workspacePath);
      return { ok: true, deferred: true, path: opts.workspacePath };
    }

    throw new Error(`알 수 없는 Object 유형: ${id}`);
  }

  /**
   * Build recent list from package context (no search engine).
   */
  function buildRecentFromPackage(pkg, options) {
    const opts = options || {};
    const max = opts.max != null ? Number(opts.max) : 5;
    const ctx = (pkg && pkg.context) || {};
    const items = []
      .concat((ctx.projects || []).map((p) => ({
        title: p.name || p.title,
        path: p.path,
        type: "project",
        label: "프로젝트"
      })))
      .concat((ctx.auctions || []).map((a) => ({
        title: a.name || a.title,
        path: a.path,
        type: "auction_case",
        label: "경매"
      })))
      .concat((ctx.reading || []).map((r) => ({
        title: r.title || r.name,
        path: r.path,
        type: "reading",
        label: "독서"
      })));
    return items.filter((i) => i && i.path && i.title).slice(0, max);
  }

  const api = {
    clean,
    classify,
    findSimilar,
    normalizeDuplicateResults,
    listDuplicateCandidates,
    openExistingObject,
    createActionLabel,
    listTypes,
    launchExistingCreator,
    buildRecentFromPackage,
    openPath,
    notice
  };

  root.ObjectCreatorCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
