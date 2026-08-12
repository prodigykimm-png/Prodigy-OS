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

  function captureDependency(name, relativePath) {
    if (root[name]) return root[name];
    if (typeof require === "function") return require(relativePath);
    throw new Error(`${name} is unavailable.`);
  }

  async function executeVaultCapture(app, config) {
    if (!config.human) throw new Error("Object Creator requires explicit human confirmation before writing.");
    const runtime = captureDependency("CaptureActionRuntime", "./capture-action-runtime.js");
    const readRevision = async () => {
      const file = app.vault.getAbstractFileByPath(config.target_path);
      return file ? runtime.sha256(await app.vault.read(file)) : null;
    };
    const proposalInput = {
      action_id: config.action_id, target_path: config.target_path, payload: config.payload,
      source_id: "object-creator-review", locator: "ObjectCreatorView:explicit-confirm", readRevision
    };
    if (!config.review) {
      const review = await runtime.prepareHumanReview(proposalInput, config.human);
      return { ok: false, review_required: true, path: config.target_path, capture: { record: review, receipt: null } };
    }
    runtime.hashPayload(config.target_path, config.payload);
    if (config.review.target_path !== config.target_path || config.review.payload_hash !== runtime.hashPayload(config.target_path, config.payload)) throw new Error("Object Creator review binding changed.");
    const authorityWriter = captureDependency("CaptureAuthorizedWriter", "./capture-authorized-writer.js");
    let result = null;
    const capture = await runtime.confirmHumanReview(config.review, config.human, config.action_id, {
      readRevision,
      writeCanonical: async (request) => {
        const immediate = await readRevision();
        if (!config.writeConsumesAuthority) authorityWriter.assertCanonicalWriteRequest(request, immediate);
        if (request.operation === "create" && immediate != null) throw Object.assign(new Error("Object Creator target collision."), { code: "capture_conflict" });
        result = await config.write(request);
        const writtenFile = app.vault.getAbstractFileByPath(config.target_path);
        if (!writtenFile) throw new Error("Object Creator canonical target was not written.");
        const writtenBytes = await app.vault.read(writtenFile);
        if (typeof request.payload.content === "string" && writtenBytes !== request.payload.content) {
          throw Object.assign(new Error("Object Creator canonical bytes differ from the reviewed payload."), { code: "capture_conflict" });
        }
        return { revision: runtime.sha256(writtenBytes), path: config.target_path };
      },
      readCanonical: async () => {
        const file = app.vault.getAbstractFileByPath(config.target_path);
        if (!file) return null;
        const bytes = await app.vault.read(file);
        return { path: config.target_path, revision: runtime.sha256(bytes), bytes };
      }
    });
    if (!capture.receipt) throw new Error(`Object creation stopped: ${capture.record.state}`);
    return Object.assign({}, result || {}, { capture });
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
        const result = await root.PeopleView.createAndOpen(host, name, { human: opts.humanConfirmation });
        return { ok: true, path: result && result.path, message: `사람 Object: ${name}` };
      }
      if (root.PeopleStore && typeof root.PeopleStore.createPeople === "function") {
        const result = await root.PeopleStore.createPeopleWithCapture(host, title || "이름 없음", opts.humanConfirmation);
        if (result && result.path) await openPath(host, result.path);
        return { ok: true, path: result && result.path, message: "사람 Object를 만들었습니다." };
      }
      await openPath(host, "HUB/60 Personal.md");
      return { ok: true, deferred: true, path: "HUB/60 Personal.md", message: "Personal Hub를 열었습니다." };
    }

    // Reading → existing ReadingBookCreate
    if (id === "reading") {
      if (root.ReadingBookCreate) {
        // Reading creation remains deferred to its destination review surface.
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
        const captured = await executeVaultCapture(host, {
          action_id: "object-creator-knowledge", target_path: path,
          payload: { type: "fleeting_note", title: base, content: body }, human: opts.humanConfirmation, review: opts.captureReview,
          write: async () => {
            try {
              if (typeof host.vault.getAbstractFileByPath === "function"
                && !host.vault.getAbstractFileByPath(folder)
                && typeof host.vault.createFolder === "function") await host.vault.createFolder(folder);
            } catch (_error) { /* may already exist */ }
            const file = await host.vault.create(path, body);
            if (file) await openPath(host, file.path || path);
            return { ok: true, path: file && file.path ? file.path : path, message: `지식 메모: ${base}` };
          }
        });
        return captured;
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
          const captured = await executeVaultCapture(host, {
            action_id: "object-creator-journal", target_path: dailyPath,
            payload: { type: "journal", date: day, content: templateContent }, human: opts.humanConfirmation, review: opts.captureReview,
            write: async () => {
              try {
                if (!host.vault.getAbstractFileByPath("DAILY/DAILY") && host.vault.createFolder) await host.vault.createFolder("DAILY/DAILY");
              } catch (_error) { /* may already exist */ }
              return { file: await host.vault.create(dailyPath, templateContent) };
            }
          });
          if (captured.review_required) return captured;
          file = captured.file;
        }
        if (file) {
          await openPath(host, file.path || dailyPath);
          return { ok: true, path: file.path || dailyPath, message: `오늘 저널: ${day}` };
        }
      }
      await openPath(host, "HUB/70 Journal.md");
      return { ok: true, deferred: true, path: "HUB/70 Journal.md", message: "저널 Hub를 열었습니다." };
    }

    // Area → shared PARA creator service (single writer)
    if (id === "area") {
      const para = root.ParaObjectCreatorService;
      if (!para) throw new Error("PARA Creator 서비스를 불러오지 못했습니다.");
      const validation = para.validateTitle(title);
      if (!validation.ok) throw new Error(validation.error);
      const target = `${para.AREA_FOLDER}/${validation.name}/2. ${validation.name}.md`;
      const content = opts.captureReview ? opts.captureReview.payload.content : para.buildAreaContent(validation.name, opts);
      const result = await executeVaultCapture(host, {
        action_id: "object-creator-area", target_path: target,
        payload: { type: "area_family", name: validation.name, content }, human: opts.humanConfirmation, review: opts.captureReview, writeConsumesAuthority: true,
        write: (request) => para.createArea(host, title, opts, request)
      });
      if (result.review_required) return result;
      if (result && result.file && host.workspace && host.workspace.getLeaf) {
        await host.workspace.getLeaf(false).openFile(result.file);
      } else if (result && result.path) {
        await openPath(host, result.path);
      }
      return Object.assign({}, result, { ok: true, path: result.path, message: `영역: ${result.name}` });
    }

    // Documentation → shared PARA creator service (single writer)
    if (id === "documentation") {
      const para = root.ParaObjectCreatorService;
      if (!para) throw new Error("PARA Creator 서비스를 불러오지 못했습니다.");
      const validation = para.validateTitle(title);
      if (!validation.ok) throw new Error(validation.error);
      const target = `${para.DOCUMENTATION_FOLDER}/${validation.name}.md`;
      const content = opts.captureReview ? opts.captureReview.payload.content : para.buildDocumentationContent(validation.name, opts);
      const result = await executeVaultCapture(host, {
        action_id: "object-creator-documentation", target_path: target,
        payload: { type: "documentation_note", name: validation.name, content }, human: opts.humanConfirmation, review: opts.captureReview, writeConsumesAuthority: true,
        write: (request) => para.createDocumentation(host, title, opts, request)
      });
      if (result.review_required) return result;
      if (result && result.file && host.workspace && host.workspace.getLeaf) {
        await host.workspace.getLeaf(false).openFile(result.file);
      } else if (result && result.path) {
        await openPath(host, result.path);
      }
      return Object.assign({}, result, { ok: true, path: result.path, message: `문서: ${result.name}` });
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
