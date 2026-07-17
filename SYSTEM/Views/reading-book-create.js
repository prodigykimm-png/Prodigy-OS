(function (root) {
  "use strict";

  const ModalBase = root.obsidian && root.obsidian.Modal;
  const FOLDER = "PARA/PROJECTS/Reading";
  const TEMPLATE = "SYSTEM/TEMPLATE/FORMAT/template_reading.md";
  const PLUGIN_ID = "kr-book-info-plugin";

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeName(value) {
    const name = clean(value).replace(/[\\/:*?"<>|#[\]^]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("책 제목을 입력해 주세요.");
    return name.slice(0, 120);
  }

  function templateBody(template, title) {
    return template
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      .replaceAll("<% tp.file.title %>", title)
      .trimStart();
  }

  /**
   * Pull a markdown section body under ## heading from plugin main text.
   */
  function extractMarkdownSection(main, heading) {
    const source = String(main || "").replace(/\r\n/g, "\n");
    if (!source || !heading) return "";
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\n)##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
    const match = source.match(re);
    if (!match) return "";
    return match[1].replace(/\s+$/g, "").trim();
  }

  /**
   * Normalize intro/toc from getBookInfo payload.
   * Plugin puts them in book.main only when toggleIntroduction / toggleIndex are on.
   */
  function extractBookReference(book) {
    const metadata = (book && book.metadata) || {};
    const main = book && book.main;
    let introduction = clean(
      metadata.introduction
      || metadata.description
      || metadata.intro
      || extractMarkdownSection(main, "책소개")
      || extractMarkdownSection(main, "소개")
    );
    let toc = clean(
      metadata.index
      || metadata.toc
      || metadata.table_of_contents
      || extractMarkdownSection(main, "목차")
    );
    // Soft length cap — reference only, not a dump
    if (introduction.length > 4000) introduction = `${introduction.slice(0, 4000).trim()}\n…`;
    if (toc.length > 6000) toc = `${toc.slice(0, 6000).trim()}\n…`;
    return { introduction, toc };
  }

  function formatTocLines(toc) {
    const lines = String(toc || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "";
    // Keep as plain lines; prefix dash only when not already list-like
    return lines.map((line) => (/^([-*•]|\d+[.)])\s/.test(line) ? line : `- ${line}`)).join("\n");
  }

  function buildReferenceSection(book, now = new Date()) {
    const { introduction, toc } = extractBookReference(book);
    if (!introduction && !toc) return "";
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const parts = [
      "",
      "---",
      "",
      "## 도서 정보 (참고)",
      "",
      "> 예스24 등에서 가져온 **참고용** 정보다. 판단·배움은 독서 질답과 Key Takeaways에 쓴다.",
      "",
      `- 출처: Korean Book Info (Yes24)`,
      `- 가져온 날: ${date}`,
      "",
    ];
    if (introduction) {
      parts.push("### 소개", "", introduction, "");
    }
    if (toc) {
      parts.push("### 목차", "", formatTocLines(toc), "");
    }
    return parts.join("\n");
  }

  function buildReadingContent(template, book, now = new Date()) {
    const metadata = (book && book.metadata) || {};
    const title = clean(metadata.title) || clean(book && book.title);
    if (!title) throw new Error("도서 정보에 제목이 없습니다.");
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const frontmatter = {
      id: title,
      type: "reading",
      status: "queue",
      next_action: "읽기 시작",
      due_date: null,
      priority: null,
      review_status: null,
      connections: null,
      created: timestamp,
      updated: timestamp,
      title,
      author: clean(metadata.author),
      category: clean(metadata.category),
      language: "",
      publish_date: clean(metadata.publish_date),
      cover_url: clean(metadata.cover_url),
      progress: null,
      started: null,
      finished: null,
      rating: null,
      key_takeaway: "",
      review_summary: "",
    };
    const yaml = root.obsidian.stringifyYaml(frontmatter).trimEnd();
    const body = templateBody(template, title).replace(/\s+$/, "");
    const reference = buildReferenceSection(book, now);
    return `---\n${yaml}\n---\n${body}${reference ? `\n${reference}` : "\n"}`;
  }

  /**
   * Force intro/toc into plugin main for this call, then restore settings.
   * Plugin scrapes them always but only embeds when toggles are true.
   */
  async function fetchBookWithReference(plugin, query) {
    const settings = plugin.settings || {};
    const prevIntro = settings.toggleIntroduction;
    const prevIndex = settings.toggleIndex;
    settings.toggleIntroduction = true;
    settings.toggleIndex = true;
    try {
      return await plugin.getBookInfo(clean(query));
    } finally {
      if (prevIntro !== undefined) settings.toggleIntroduction = prevIntro;
      else delete settings.toggleIntroduction;
      if (prevIndex !== undefined) settings.toggleIndex = prevIndex;
      else delete settings.toggleIndex;
    }
  }

  async function createReadingObject(app, query) {
    const plugin = app.plugins && app.plugins.getPlugin && app.plugins.getPlugin(PLUGIN_ID);
    if (!plugin || typeof plugin.getBookInfo !== "function") {
      throw new Error("Korean Book Info 플러그인을 최신 상태로 활성화해 주세요.");
    }
    const result = await fetchBookWithReference(plugin, query);
    if (!result || !result.ok || !result.book) {
      throw new Error((result && result.error) || "도서 정보를 찾지 못했습니다.");
    }
    const templateFile = app.vault.getAbstractFileByPath(TEMPLATE);
    if (!templateFile) throw new Error("Reading 템플릿을 찾지 못했습니다.");
    const content = buildReadingContent(await app.vault.read(templateFile), result.book);
    const base = safeName(result.book.title || (result.book.metadata && result.book.metadata.title));
    let path = `${FOLDER}/${base}.md`;
    let number = 2;
    while (app.vault.getAbstractFileByPath(path)) {
      path = `${FOLDER}/${base} (${number++}).md`;
    }
    const file = await app.vault.create(path, content);
    return { file, title: base };
  }

  class NewReadingModal extends ModalBase {
    onOpen() {
      this.contentEl.addClass("reading-create-modal");
      this.contentEl.createEl("h2", { text: "새 책 추가" });
      this.contentEl.createEl("p", {
        text: "제목을 입력하면 도서 정보(소개·목차 포함)를 가져와 독서 기록을 만듭니다.",
      });
      const input = this.contentEl.createEl("input", {
        attr: { type: "text", placeholder: "책 제목", "aria-label": "책 제목" },
      });
      const status = this.contentEl.createEl("p", { attr: { class: "reading-create-status" } });
      const actions = this.contentEl.createDiv({ attr: { class: "reading-create-actions" } });
      const cancel = actions.createEl("button", { text: "취소" });
      const create = actions.createEl("button", {
        text: "도서 정보로 만들기",
        attr: { class: "mod-cta" },
      });
      cancel.onclick = () => this.close();
      create.onclick = async () => {
        if (!clean(input.value)) {
          return root.obsidian.Notice && new root.obsidian.Notice("책 제목을 입력해 주세요.");
        }
        create.disabled = true;
        input.disabled = true;
        status.setText("도서 정보·소개·목차를 가져오는 중…");
        try {
          const result = await createReadingObject(this.app, input.value);
          this.close();
          if (root.obsidian.Notice) new root.obsidian.Notice(`${result.title} 독서 기록을 만들었습니다.`);
          await this.app.workspace.getLeaf(false).openFile(result.file);
        } catch (error) {
          status.setText(error.message || "독서 기록을 만들지 못했습니다.");
          create.disabled = false;
          input.disabled = false;
        }
      };
      input.onkeydown = (event) => {
        if (event.key === "Enter") create.click();
      };
      if (input.focus) input.focus();
    }
  }

  const api = {
    FOLDER,
    NewReadingModal,
    TEMPLATE,
    PLUGIN_ID,
    buildReadingContent,
    buildReferenceSection,
    createReadingObject,
    extractBookReference,
    extractMarkdownSection,
    open: (app) => new NewReadingModal(app).open(),
    safeName,
    templateBody,
  };
  root.ReadingBookCreate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
