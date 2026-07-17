(function (root) {
  "use strict";

  /**
   * People Object store — create only (no CRM, no migration).
   * New Objects always type: people under PARA/RESOURCES/CONTACTS.
   */

  function getCore() {
    return root.PeopleCore || (typeof require === "function" ? require("./people-core.js") : null);
  }

  async function readTemplate(app) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const path = core.PEOPLE_TEMPLATE;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) {
      // Fallback stub keeps creation working if template file is missing.
      return "";
    }
    return app.vault.read(file);
  }

  function listMarkdownPaths(app, folder) {
    if (!app || !app.vault || typeof app.vault.getFiles !== "function") return [];
    return app.vault.getFiles()
      .filter((f) => f && f.path && f.path.startsWith(`${folder}/`) && /\.md$/i.test(f.path))
      .map((f) => f.path);
  }

  async function ensureFolder(app, folderPath) {
    if (!app || !app.vault) return;
    const existing = app.vault.getAbstractFileByPath(folderPath);
    if (existing) return;
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        // createFolder may not exist on all adapters; try best-effort.
        if (typeof app.vault.createFolder === "function") {
          try {
            await app.vault.createFolder(current);
          } catch (_e) {
            /* may already exist */
          }
        }
      }
    }
  }

  /**
   * Create a new People Object.
   * @returns {{ path: string, name: string, content: string }}
   */
  async function createPeople(app, rawName) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");

    const name = core.safeName(rawName);
    const existing = listMarkdownPaths(app, core.PEOPLE_FOLDER);
    const path = core.resolveCreatePath(name, existing);
    const template = await readTemplate(app);
    const content = core.renderPeopleContent(template, name);

    if (/type:\s*contact\b/i.test(content)) {
      throw new Error("People 생성 결과에 type: contact가 포함될 수 없습니다.");
    }
    if (!/type:\s*people\b/i.test(content)) {
      throw new Error("People 생성 결과에 type: people가 필요합니다.");
    }

    await ensureFolder(app, core.PEOPLE_FOLDER);

    if (app.vault.getAbstractFileByPath(path)) {
      throw new Error(`같은 이름의 사람 Object가 이미 있습니다: ${path}`);
    }

    await app.vault.create(path, content);
    return { path, name, content };
  }

  const api = {
    readTemplate,
    listMarkdownPaths,
    ensureFolder,
    createPeople
  };

  root.PeopleStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
