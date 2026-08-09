(function (root) {
  "use strict";

  const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_venue.md";
  const VENUE_FOLDER = "PARA/RESOURCES/Venues";

  // Single source of truth for venue schema lives in PeopleCore (shared with people).
  // Fall back to local definitions only when PeopleCore is unavailable (standalone load).
  function getCore() {
    return root.PeopleCore || (typeof require === "function" ? require("./people-core.js") : null);
  }
  const __venueCore = getCore();
  const ALLOWED_FRONTMATTER_KEYS = Object.freeze(
    __venueCore && __venueCore.VENUE_FRONTMATTER_KEYS
      ? Array.from(__venueCore.VENUE_FRONTMATTER_KEYS)
      : ["type", "venue_category", "address", "connections", "created", "updated"]
  );
  const REQUIRED_HEADINGS = Object.freeze(
    __venueCore && __venueCore.VENUE_REQUIRED_HEADINGS
      ? Array.from(__venueCore.VENUE_REQUIRED_HEADINGS)
      : ["소개", "방문 정보", "메모", "관련 지식", "관련 저널"]
  );
  const CATEGORY_PATTERN = (__venueCore && __venueCore.VENUE_CATEGORY_PATTERN)
    || /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function validateTitle(value) {
    const title = clean(value);
    if (!title) throw new Error("장소 이름을 입력해 주세요.");
    if (/[\\/:*?"<>|\r\n]/.test(title)) {
      throw new Error("장소 이름에는 파일 경로 문자나 줄바꿈을 사용할 수 없습니다.");
    }
    return title;
  }

  function validateCategory(value) {
    const category = clean(value);
    if (!category) throw new Error("장소 분류를 입력해 주세요.");
    if (!CATEGORY_PATTERN.test(category)) {
      throw new Error("장소 분류는 영어 snake_case로 입력해 주세요.");
    }
    return category;
  }

  function normalizeDailyPath(value) {
    const dailyPath = clean(value).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!dailyPath) return "";
    if (!/\.md$/i.test(dailyPath) || dailyPath.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("연결할 Daily 노트 경로가 올바르지 않습니다.");
    }
    return dailyPath;
  }

  function venuePath(title) {
    return `${VENUE_FOLDER}/${validateTitle(title)}.md`;
  }

  function yamlString(value) {
    return JSON.stringify(String(value == null ? "" : value).replace(/[\r\n]+/g, " "));
  }

  function timestamp(value) {
    const date = value instanceof Date ? value : value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) throw new Error("유효한 생성 시각이 필요합니다.");
    return date.toISOString().slice(0, 16);
  }

  function dailyWikilink(dailyPath) {
    return `[[${dailyPath.replace(/\.md$/i, "")}]]`;
  }

  function isMarkdownFile(file) {
    return Boolean(file)
      && String(file.extension || "").toLowerCase() === "md"
      && !Array.isArray(file.children);
  }

  async function readTemplate(app) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function" || typeof app.vault.read !== "function") {
      throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    }
    const file = app.vault.getAbstractFileByPath(TEMPLATE_PATH);
    if (!file) throw new Error("Venue 템플릿을 찾을 수 없습니다.");
    return app.vault.read(file);
  }

  function canonicalBody(template) {
    const match = String(template || "").match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    if (!match) throw new Error("Venue 템플릿 frontmatter가 손상되었습니다.");
    const body = match[1];
    for (const heading of REQUIRED_HEADINGS) {
      if (!new RegExp(`^## ${heading}$`, "m").test(body)) {
        throw new Error(`Venue 템플릿에 '${heading}' 섹션이 없습니다.`);
      }
    }
    return body;
  }

  function materializeVenue(template, input, options) {
    const source = input || {};
    const opts = options || {};
    const title = validateTitle(source.title);
    const category = validateCategory(source.venue_category);
    const address = clean(source.address);
    const dailyPath = normalizeDailyPath(source.dailyPath);
    const created = timestamp(opts.now);
    const body = canonicalBody(template).replace(/<%\s*tp\.file\.title\s*%>/g, title);
    // Daily(저널) 연결은 선택사양 — 없으면 빈 connections로 저장한다.
    const connectionsLine = dailyPath
      ? `connections:\n  - ${yamlString(dailyWikilink(dailyPath))}`
      : "connections: []";
    const frontmatter = [
      "---",
      "type: venue",
      `venue_category: ${yamlString(category)}`,
      `address: ${yamlString(address)}`,
      connectionsLine,
      `created: ${created}`,
      `updated: ${created}`,
      "---",
      ""
    ].join("\n");
    return `${frontmatter}${body}`;
  }

  async function ensureFolder(app, folderPath) {
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current) && typeof app.vault.createFolder === "function") {
        try {
          await app.vault.createFolder(current);
        } catch (_error) {
          if (!app.vault.getAbstractFileByPath(current)) throw _error;
        }
      }
    }
  }

  async function openPath(app, filePath) {
    const link = filePath.replace(/\.md$/i, "");
    if (app && app.workspace && typeof app.workspace.openLinkText === "function") {
      await app.workspace.openLinkText(link, "", false);
      return;
    }
    const file = app && app.vault && app.vault.getAbstractFileByPath(filePath);
    if (file && app.workspace && typeof app.workspace.getLeaf === "function") {
      await app.workspace.getLeaf(false).openFile(file);
    }
  }

  /**
   * Creates one Venue Object. Daily(저널) handoff는 선택사양 — 없으면
   * 저널 연결 없이 순수 장소로 저장한다.
   */
  async function createVenue(app, input, options) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function" || typeof app.vault.create !== "function") {
      throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    }
    const source = input || {};
    const title = validateTitle(source.title);
    const dailyPath = normalizeDailyPath(source.dailyPath);
    if (dailyPath) {
      const daily = app.vault.getAbstractFileByPath(dailyPath);
      if (!isMarkdownFile(daily)) throw new Error("연결하려는 Daily 노트는 실제 Markdown 파일이어야 합니다.");
    }

    // Validate and materialize before creating any Vault folder or Object file.
    const template = await readTemplate(app);
    const content = materializeVenue(template, Object.assign({}, source, { title, dailyPath }), options);
    const targetPath = venuePath(title);
    const existing = app.vault.getAbstractFileByPath(targetPath);
    if (existing) {
      await openPath(app, targetPath);
      return {
        ok: false,
        collision: true,
        path: targetPath,
        message: "같은 이름의 장소가 이미 있습니다. 기존 장소를 열었습니다."
      };
    }

    await ensureFolder(app, VENUE_FOLDER);
    const created = await app.vault.create(targetPath, content);
    await openPath(app, created && created.path ? created.path : targetPath);
    return {
      ok: true,
      path: created && created.path ? created.path : targetPath,
      content,
      message: "장소를 저장했습니다."
    };
  }

  function notice(message) {
    const Notice = root.Notice || (root.obsidian && root.obsidian.Notice);
    if (Notice) new Notice(message, 5000);
  }

  function outcome(kind, details) {
    return Object.freeze(Object.assign({ outcome: kind, ok: kind === "created" }, details || {}));
  }

  const ModalBase = root.obsidian && root.obsidian.Modal ? root.obsidian.Modal : class {};

  class VenueCreatorModal extends ModalBase {
    constructor(app, seed, resolveOutcome) {
      super(app);
      this.app = app;
      this.state = Object.assign({ title: "", venue_category: "", address: "", dailyPath: "", busy: false, error: "" }, seed || {});
      this.resolved = false;
      this.resolveOutcome = typeof resolveOutcome === "function" ? resolveOutcome : null;
    }

    onOpen() {
      this.render();
    }

    onClose() {
      if (this.contentEl && typeof this.contentEl.empty === "function") this.contentEl.empty();
      this.settle(outcome("cancelled", { cancelled: true, message: "장소 저장을 취소했습니다." }));
    }

    setOutcomeResolver(resolveOutcome) {
      if (typeof resolveOutcome !== "function") throw new Error("결과 처리 함수가 필요합니다.");
      if (this.resolved) return false;
      this.resolveOutcome = resolveOutcome;
      return true;
    }

    settle(result) {
      if (this.resolved) return false;
      this.resolved = true;
      const resolveOutcome = this.resolveOutcome;
      this.resolveOutcome = null;
      if (resolveOutcome) resolveOutcome(result);
      return true;
    }

    render() {
      const contentEl = this.contentEl;
      if (!contentEl) return;
      contentEl.empty();
      contentEl.addClass("prodigy-venue-creator");
      contentEl.createEl("h2", { text: "장소 추가", attr: { style: "margin:0 0 8px;font-size:1.1em;" } });
      contentEl.createEl("p", {
        text: "관리할 장소를 추가합니다. 연결 저널(Daily)은 선택사양입니다.",
        attr: { style: "margin:0 0 12px;color:var(--text-muted);font-size:0.84em;line-height:1.45;" }
      });

      const form = contentEl.createEl("div", { attr: { style: "display:grid;gap:10px;" } });
      this.renderField(form, "장소 이름", "예: 메이필드호텔", "title", true);
      this.renderField(form, "장소 분류", "예: cafe, gym, office", "venue_category", true, "영어 snake_case");
      this.renderField(form, "주소", "선택 입력", "address", false);
      this.renderField(form, "연결 저널(Daily)", "선택: DAILY/DAILY/2026-08-06", "dailyPath", false, "저널과 연동하려면 Daily 경로를 입력하세요.");
      if (this.state.error) {
        form.createEl("div", { text: this.state.error, attr: { role: "alert", style: "font-size:0.82em;color:var(--text-error);" } });
      }

      const footer = contentEl.createEl("div", {
        attr: { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:10px;border-top:1px solid var(--background-modifier-border);" }
      });
      const cancel = footer.createEl("button", { text: "취소" });
      cancel.onclick = () => this.close();
      const save = footer.createEl("button", {
        text: this.state.busy ? "저장 중..." : "장소 저장",
        cls: "mod-cta"
      });
      save.disabled = Boolean(this.state.busy);
      save.onclick = () => this.save();
    }

    renderField(parent, label, placeholder, key, required, hint) {
      const wrap = parent.createEl("label", { attr: { style: "display:grid;gap:4px;" } });
      wrap.createEl("span", { text: `${label}${required ? " (필수)" : ""}`, attr: { style: "font-size:0.8em;font-weight:700;" } });
      const input = wrap.createEl("input", {
        attr: {
          value: this.state[key] || "",
          placeholder,
          "aria-label": label,
          style: "width:100%;box-sizing:border-box;min-height:36px;padding:7px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);color:var(--text-normal);"
        }
      });
      input.oninput = () => { this.state[key] = input.value; };
      if (hint) wrap.createEl("span", { text: hint, attr: { style: "font-size:0.74em;color:var(--text-muted);" } });
    }

    async save() {
      if (this.state.busy) return;
      this.state.busy = true;
      this.state.error = "";
      this.render();
      try {
        const result = await createVenue(this.app, this.state);
        notice(result.message);
        this.settle(result.collision
          ? outcome("collision", { collision: true, path: result.path, message: result.message })
          : outcome("created", { path: result.path, message: result.message }));
        this.close();
      } catch (error) {
        this.state.error = error && error.message ? error.message : String(error);
        this.state.busy = false;
        this.render();
      }
    }
  }

  function open(app, seed) {
    return new Promise((resolve) => {
      if (!app) {
        resolve(outcome("unavailable", { unavailable: true, message: "Obsidian 앱 컨텍스트가 필요합니다." }));
        return;
      }
      let modal;
      try {
        modal = new VenueCreatorModal(app, seed, resolve);
        if (typeof modal.open !== "function") {
          modal.settle(outcome("unavailable", { unavailable: true, message: "Obsidian Modal을 사용할 수 없습니다." }));
          return;
        }
        modal.open();
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (modal) modal.settle(outcome("failed", { failed: true, message }));
        else resolve(outcome("failed", { failed: true, message }));
      }
    });
  }

  const api = Object.freeze({
    TEMPLATE_PATH,
    VENUE_FOLDER,
    ALLOWED_FRONTMATTER_KEYS,
    REQUIRED_HEADINGS,
    CATEGORY_PATTERN,
    clean,
    validateTitle,
    validateCategory,
    normalizeDailyPath,
    venuePath,
    dailyWikilink,
    isMarkdownFile,
    outcome,
    readTemplate,
    materializeVenue,
    createVenue,
    open,
    openVenueCreator: open,
    VenueCreatorModal
  });

  root.VenueCreator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
