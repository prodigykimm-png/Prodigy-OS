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

  function parseSimpleFrontmatter(text) {
    const source = String(text || "");
    if (!source.startsWith("---")) return {};
    const end = source.indexOf("\n---", 3);
    if (end === -1) return {};
    const raw = source.slice(3, end).replace(/^\n/, "");
    const data = {};
    raw.split("\n").forEach((line) => {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) return;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[match[1]] = value;
    });
    return data;
  }

  /**
   * Read quick-edit fields for a People (or legacy contact) Object.
   */
  async function readPeopleProperties(app, path) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    let fm = {};
    if (app.metadataCache && typeof app.metadataCache.getFileCache === "function") {
      const cache = app.metadataCache.getFileCache(file);
      if (cache && cache.frontmatter) fm = Object.assign({}, cache.frontmatter);
    }
    if (!Object.keys(fm).length) {
      const content = await app.vault.read(file);
      fm = parseSimpleFrontmatter(content);
    }
    return {
      path: filePath,
      title: filePath.split("/").pop().replace(/\.md$/i, ""),
      type: core.clean(fm.type),
      values: core.pickQuickEditValues(fm)
    };
  }

  /**
   * Save quick-edit whitelist fields only. Never changes type.
   * @returns {{ path: string, values: object }}
   */
  async function updatePeopleProperties(app, path, updates) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    const patch = core.sanitizeQuickEditUpdates(updates || {});
    if (!Object.keys(patch).length) {
      throw new Error("수정할 필드가 없습니다.");
    }

    if (app.fileManager && typeof app.fileManager.processFrontMatter === "function") {
      await app.fileManager.processFrontMatter(file, (fm) => {
        const originalType = fm.type;
        Object.keys(patch).forEach((key) => {
          fm[key] = patch[key];
        });
        if (originalType != null) fm.type = originalType;
      });
    } else {
      // Test / fallback path: rewrite simple scalar frontmatter lines.
      const content = await app.vault.read(file);
      if (!content.startsWith("---")) throw new Error("frontmatter가 없는 노트는 빠른 수정할 수 없습니다.");
      const end = content.indexOf("\n---", 3);
      if (end === -1) throw new Error("frontmatter가 손상되었습니다.");
      let raw = content.slice(3, end).replace(/^\n/, "");
      const body = content.slice(end + 4);
      Object.keys(patch).forEach((key) => {
        const line = `${key}: ${patch[key]}`;
        const re = new RegExp(`^${key}:\\s*.*$`, "m");
        if (re.test(raw)) raw = raw.replace(re, line);
        else raw = `${raw.replace(/\s+$/, "")}\n${line}`;
      });
      const next = `---\n${raw.replace(/^\n/, "")}\n---${body.startsWith("\n") ? body : `\n${body}`}`;
      if (typeof app.vault.modify === "function") await app.vault.modify(file, next);
      else throw new Error("Vault modify API를 사용할 수 없습니다.");
    }

    const refreshed = await readPeopleProperties(app, filePath);
    return { path: filePath, values: refreshed.values };
  }

  /**
   * Delete (trash) a People Object file.
   * Only allows files under PARA/RESOURCES/CONTACTS.
   * Prefer system trash when available.
   * @returns {{ path: string, trashed: boolean }}
   */
  async function deletePeople(app, path) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path).replace(/\\/g, "/");
    if (!core.isUnderPeopleFolder(filePath)) {
      throw new Error("Contacts 폴더의 사람 노트만 삭제할 수 있습니다.");
    }
    if (!/\.md$/i.test(filePath)) {
      throw new Error("마크다운 사람 노트만 삭제할 수 있습니다.");
    }
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    if (typeof app.vault.trash === "function") {
      // system=true uses OS trash when configured
      await app.vault.trash(file, true);
      return { path: filePath, trashed: true };
    }
    if (typeof app.vault.delete === "function") {
      await app.vault.delete(file, true);
      return { path: filePath, trashed: false };
    }
    throw new Error("Vault 삭제 API를 사용할 수 없습니다.");
  }

  /**
   * Read full People note content for preview modal.
   */
  async function readPeopleNote(app, path) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);
    const content = await app.vault.read(file);
    return core.buildPersonPreviewModel(filePath, content);
  }

  /**
   * Save relation-popup edits (properties + editable sections) back to the note.
   * @param {{ properties?: object, sections?: object }} edits
   */
  async function savePeopleNote(app, path, edits) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    const original = await app.vault.read(file);
    let next = core.applyPersonPreviewEdits(original, edits || {});
    // Never allow type flip to contact via this path
    if (/type:\s*contact\b/i.test(next) && !/type:\s*contact\b/i.test(original)) {
      next = next.replace(/^type:\s*contact\b/im, "type: people");
    }
    if (typeof app.vault.modify !== "function") {
      throw new Error("Vault modify API를 사용할 수 없습니다.");
    }
    await app.vault.modify(file, next);

    // Sync properties via processFrontMatter when available (metadata cache)
    if (app.fileManager && typeof app.fileManager.processFrontMatter === "function") {
      const props = core.sanitizeQuickEditUpdates((edits && edits.properties) || {});
      if (Object.keys(props).length) {
        try {
          await app.fileManager.processFrontMatter(file, (fm) => {
            const originalType = fm.type;
            Object.keys(props).forEach((key) => {
              fm[key] = props[key];
            });
            if (originalType != null) fm.type = originalType;
          });
        } catch (_e) {
          /* body already written */
        }
      }
    }

    return core.buildPersonPreviewModel(filePath, await app.vault.read(file));
  }

  /**
   * Append a Key Interaction (사건) index line under # 핵심 상호작용.
   * Optionally updates last_contact. Does not create a separate CRM event Object.
   * @returns {{ path: string, line: string, content: string }}
   */
  async function appendKeyInteraction(app, path, input, options) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    const opts = options || {};
    let line;
    if (opts.rawLine) {
      const raw = core.clean(opts.rawLine);
      line = raw.startsWith("-") ? raw : `- ${raw}`;
    } else {
      line = core.formatInteractionLine(input || {}, {
        now: opts.now,
        linkDaily: opts.linkDaily !== false
      });
    }
    const original = await app.vault.read(file);
    let next = core.appendInteractionToContent(original, line);
    if (opts.updateLastContact !== false && !opts.rawLine) {
      const day = core.normalizeIsoDate(input && input.date, opts.now);
      next = core.upsertLastContactInContent(next, day);
      if (app.fileManager && typeof app.fileManager.processFrontMatter === "function") {
        // Body already updated; also sync last_contact via FM API when available
        // after body write so cache stays consistent.
      }
    }
    if (typeof app.vault.modify !== "function") {
      throw new Error("Vault modify API를 사용할 수 없습니다.");
    }
    await app.vault.modify(file, next);

    if (opts.updateLastContact !== false && !opts.rawLine && app.fileManager
      && typeof app.fileManager.processFrontMatter === "function") {
      const day = core.normalizeIsoDate(input && input.date, opts.now);
      try {
        await app.fileManager.processFrontMatter(file, (fm) => {
          fm.last_contact = day;
        });
      } catch (_e) {
        /* body already has last_contact from upsert */
      }
    }

    return { path: filePath, line, content: next };
  }

  /**
   * Append a factual memo line under # 메모.
   * Does not update last_contact (not an interaction event).
   * @returns {{ path: string, line: string, content: string }}
   */
  async function appendMemo(app, path, input) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = core.clean(path);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    const line = core.formatMemoLine(input || {});
    const original = await app.vault.read(file);
    const next = core.appendMemoToContent(original, line);
    if (typeof app.vault.modify !== "function") {
      throw new Error("Vault modify API를 사용할 수 없습니다.");
    }
    await app.vault.modify(file, next);
    return { path: filePath, line, content: next };
  }

  /**
   * Remove one memo line from # 메모.
   * @param {string|number|{ text?: string, index?: number }} target
   * @returns {{ path: string, removed: string, content: string }}
   */
  async function removeMemo(app, path, target) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    if (typeof core.removeMemoLineFromContent !== "function") {
      throw new Error("PeopleCore.removeMemoLineFromContent를 사용할 수 없습니다.");
    }
    const filePath = core.clean(path);
    if (!core.isUnderPeopleFolder(filePath)) {
      throw new Error("Contacts 폴더의 사람 노트만 수정할 수 있습니다.");
    }
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    const original = await app.vault.read(file);
    const result = core.removeMemoLineFromContent(original, target);
    const next = result && result.content != null ? result.content : result;
    if (typeof app.vault.modify !== "function") {
      throw new Error("Vault modify API를 사용할 수 없습니다.");
    }
    await app.vault.modify(file, next);
    return {
      path: filePath,
      removed: result && result.removed != null ? result.removed : "",
      content: next
    };
  }

  /**
   * Remove one interaction line from # 핵심 상호작용.
   * @returns {{ path: string, removed: string, content: string }}
   */
  async function removeInteraction(app, path, target) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    if (typeof core.removeInteractionLineFromContent !== "function") {
      throw new Error("PeopleCore.removeInteractionLineFromContent를 사용할 수 없습니다.");
    }
    const filePath = core.clean(path);
    if (!core.isUnderPeopleFolder(filePath)) {
      throw new Error("Contacts 폴더의 사람 노트만 수정할 수 있습니다.");
    }
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`사람 Object를 찾을 수 없습니다: ${filePath}`);

    const original = await app.vault.read(file);
    const result = core.removeInteractionLineFromContent(original, target);
    const next = result && result.content != null ? result.content : result;
    if (typeof app.vault.modify !== "function") {
      throw new Error("Vault modify API를 사용할 수 없습니다.");
    }
    await app.vault.modify(file, next);
    return {
      path: filePath,
      removed: result && result.removed != null ? result.removed : "",
      content: next
    };
  }

  function captureDependency(name, relativePath) {
    if (root[name]) return root[name];
    if (typeof require === "function") return require(relativePath);
    throw new Error(`${name}를 불러오지 못했습니다.`);
  }

  async function preparePeopleCreation(app, rawName) {
    const core = getCore();
    if (!core) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const name = core.safeName(rawName);
    const existing = listMarkdownPaths(app, core.PEOPLE_FOLDER);
    const path = core.resolveCreatePath(name, existing);
    const template = await readTemplate(app);
    const content = core.renderPeopleContent(template, name);
    if (/type:\s*contact\b/i.test(content)) throw new Error("People 생성 결과에 type: contact가 포함될 수 없습니다.");
    if (!/type:\s*people\b/i.test(content)) throw new Error("People 생성 결과에 type: people가 필요합니다.");
    return Object.freeze({ path, name, content });
  }

  /** Canonical People mutation; callable only by CaptureAuthorizedWriter. */
  async function createPeople(app, rawName, writeRequest, preparedInput) {
    const writer = captureDependency("CaptureAuthorizedWriter", "./capture-authorized-writer.js");
    const runtime = captureDependency("CaptureActionRuntime", "./capture-action-runtime.js");
    const core = getCore();
    const prepared = preparedInput || await preparePeopleCreation(app, rawName);
    if (!writeRequest) writer.assertCanonicalWriteRequest(writeRequest, null);
    if (writeRequest.target_path !== prepared.path || writeRequest.payload_hash
      !== runtime.hashPayload(prepared.path, { name: prepared.name, content: prepared.content })) {
      throw new Error("People Capture proposal binding changed before write.");
    }
    const currentFile = app.vault.getAbstractFileByPath(prepared.path);
    const currentRevision = currentFile ? runtime.sha256(await app.vault.read(currentFile)) : null;
    writer.assertCanonicalWriteRequest(writeRequest, currentRevision);
    if (currentFile) throw Object.assign(new Error(`같은 이름의 사람 Object가 이미 있습니다: ${prepared.path}`), { code: "capture_conflict" });
    await ensureFolder(app, core.PEOPLE_FOLDER);
    await app.vault.create(prepared.path, prepared.content);
    return { path: prepared.path, name: prepared.name, content: prepared.content };
  }

  async function createPeopleWithCapture(app, rawName, human, review) {
    const runtime = captureDependency("CaptureActionRuntime", "./capture-action-runtime.js");
    const prepared = await preparePeopleCreation(app, rawName);
    const readRevision = async () => {
      const file = app.vault.getAbstractFileByPath(prepared.path);
      if (!file) return null;
      return runtime.sha256(await app.vault.read(file));
    };
    const actionId = String(human && human.action_id || "people-create");
    const proposalInput = {
      action_id: actionId, operation: "create", target_path: prepared.path,
      payload: { name: prepared.name, content: prepared.content }, source_id: "people-create-form",
      locator: "PeopleCreateModal:explicit-confirm", readRevision
    };
    if (!review) {
      const record = await runtime.prepareHumanReview(proposalInput, human);
      return { review_required: true, path: prepared.path, name: prepared.name, capture: { record, receipt: null } };
    }
    if (review.target_path !== prepared.path || review.payload_hash !== runtime.hashPayload(prepared.path, proposalInput.payload)) throw new Error("People review binding changed.");
    let created = null;
    const capture = await runtime.confirmHumanReview(review, human, actionId, {
      readRevision,
      detectConflict: async () => ({ conflict: app.vault.getAbstractFileByPath(prepared.path) != null, reason: "People target already exists." }),
      writeCanonical: async (request) => {
        created = await createPeople(app, rawName, request, prepared);
        return { revision: runtime.sha256(created.content), path: created.path };
      },
      readCanonical: async () => {
        const file = app.vault.getAbstractFileByPath(prepared.path);
        if (!file) return null;
        const bytes = await app.vault.read(file);
        return { path: prepared.path, revision: runtime.sha256(bytes), bytes };
      }
    });
    if (!capture.receipt) throw new Error(`People Capture write stopped: ${capture.record.state}`);
    return Object.assign({}, created, { capture });
  }

  const api = {
    readTemplate,
    listMarkdownPaths,
    ensureFolder,
    preparePeopleCreation,
    createPeople,
    createPeopleWithCapture,
    readPeopleProperties,
    updatePeopleProperties,
    appendKeyInteraction,
    appendMemo,
    removeMemo,
    removeInteraction,
    deletePeople,
    readPeopleNote,
    savePeopleNote,
    parseSimpleFrontmatter
  };

  root.PeopleStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
