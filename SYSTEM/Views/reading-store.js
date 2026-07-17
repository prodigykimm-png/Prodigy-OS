(function (root) {
  "use strict";

  // Book execution records live under RESOURCES, not as Projects.
  // New writes use these paths; legacy paths remain readable without migration.
  const SESSION_DIR = "PARA/RESOURCES/Reading/Sessions";
  const SESSION_LEGACY_DIRS = Object.freeze(["PARA/PROJECTS/Reading/Sessions"]);
  const CANDIDATE_DIR = "PARA/RESOURCES/Reading/Candidates";
  const CANDIDATE_LEGACY_DIRS = Object.freeze(["ZETA/FLEETING/Knowledge Candidates"]);
  const BOOK_DIR = "PARA/PROJECTS/Reading";

  async function ensureFolder(app, folderPath) {
    if (!folderPath) return;
    if (app.vault.getAbstractFileByPath(folderPath)) return;
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        try { await app.vault.createFolder(current); } catch (_error) { /* exists */ }
      }
    }
  }

  async function uniquePath(app, folder, filename) {
    const base = filename.replace(/\.md$/, "");
    let attempt = `${folder}/${base}.md`;
    let index = 2;
    while (app.vault.getAbstractFileByPath(attempt)) {
      attempt = `${folder}/${base} ${index}.md`;
      index += 1;
    }
    return attempt;
  }

  async function listMarkdownInFolder(app, folder) {
    const node = app.vault.getAbstractFileByPath(folder);
    if (!node || !node.children) return [];
    return node.children.filter((file) => file && file.extension === "md");
  }

  async function readMarkdownObject(app, file) {
    const content = await app.vault.read(file);
    const data = root.ReadingCore.parseSimpleFrontmatter(content);
    data.path = file.path;
    data.name = file.basename || file.name;
    return data;
  }

  async function listBooks(app) {
    const files = await listMarkdownInFolder(app, BOOK_DIR);
    const books = [];
    for (const file of files) {
      const data = await readMarkdownObject(app, file);
      if (data.type && data.type !== "reading") continue;
      // Skip session folder files if any sit at root incorrectly.
      if (file.path.includes("/Sessions/")) continue;
      books.push(root.ReadingCore.normalizeBook({ ...data, path: file.path, file: { path: file.path, name: file.basename } }));
    }
    return books;
  }

  async function listMarkdownAcross(app, folders) {
    const files = [];
    const seen = new Set();
    for (const folder of folders) {
      const items = await listMarkdownInFolder(app, folder);
      for (const file of items) {
        if (!file || seen.has(file.path)) continue;
        seen.add(file.path);
        files.push(file);
      }
    }
    return files;
  }

  async function listSessions(app, limit = 10) {
    await ensureFolder(app, SESSION_DIR);
    const files = await listMarkdownAcross(app, [SESSION_DIR, ...SESSION_LEGACY_DIRS]);
    const sessions = [];
    for (const file of files) {
      const data = await readMarkdownObject(app, file);
      if (data.type && data.type !== "reading_session") continue;
      sessions.push(data);
    }
    sessions.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updated || "").localeCompare(String(a.updated || "")));
    return sessions.slice(0, limit);
  }

  async function listCandidates(app, options = {}) {
    await ensureFolder(app, CANDIDATE_DIR);
    const files = await listMarkdownAcross(app, [CANDIDATE_DIR, ...CANDIDATE_LEGACY_DIRS]);
    const status = options.status || "proposed";
    const candidates = [];
    for (const file of files) {
      const data = await readMarkdownObject(app, file);
      if (data.type && data.type !== "knowledge_candidate") continue;
      if (status === "active") {
        if (!["proposed", "saved"].includes(data.status || "proposed")) continue;
      } else if (status !== "all" && data.status !== status) continue;
      candidates.push(data);
    }
    candidates.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
    return candidates;
  }

  async function saveSession(app, book, formValues) {
    const session = root.ReadingCore.createReadingSession(book, formValues);
    await ensureFolder(app, SESSION_DIR);
    const filename = root.ReadingCore.sessionFilename(session);
    const path = await uniquePath(app, SESSION_DIR, filename);
    const content = root.ReadingCore.buildSessionMarkdown(session);
    const file = await app.vault.create(path, content);
    session.path = file.path;
    // Touch book next_action / updated when session provides them.
    // Prefer canonical progress if supplied; do not invent current_page.
    const shouldTouchBook = book.path && formValues && (
      formValues.next_action
      || formValues.next_position
      || formValues.progress != null
      || formValues.end_page
    );
    if (shouldTouchBook) {
      const bookFile = app.vault.getAbstractFileByPath(book.path);
      if (bookFile && app.fileManager && app.fileManager.processFrontMatter) {
        await app.fileManager.processFrontMatter(bookFile, (fm) => {
          if (formValues.progress != null && formValues.progress !== "") {
            const n = Number(String(formValues.progress).replace(/%/g, ""));
            if (Number.isFinite(n)) fm.progress = Math.min(100, Math.max(0, Math.round(n)));
          }
          // Legacy: end_page only if caller still uses page ranges (not progress-first UX).
          if (formValues.end_page && formValues.progress == null) {
            fm.current_page = formValues.end_page;
          }
          if (formValues.next_action) fm.next_action = formValues.next_action;
          fm.updated = root.ReadingCore.todayIsoDate();
        });
      }
    }
    return session;
  }

  async function saveCandidate(app, session, formValues) {
    const candidate = root.ReadingCore.createKnowledgeCandidate(session, formValues);
    await ensureFolder(app, CANDIDATE_DIR);
    const filename = root.ReadingCore.candidateFilename(candidate);
    const path = await uniquePath(app, CANDIDATE_DIR, filename);
    if (session.path) {
      candidate.source_session = `[[${session.path.replace(/\.md$/, "")}]]`;
    }
    const content = root.ReadingCore.buildCandidateMarkdown(candidate);
    const file = await app.vault.create(path, content);
    candidate.path = file.path;

    if (session.path) {
      const sessionFile = app.vault.getAbstractFileByPath(session.path);
      if (sessionFile && app.fileManager && app.fileManager.processFrontMatter) {
        await app.fileManager.processFrontMatter(sessionFile, (fm) => {
          const ids = Array.isArray(fm.knowledge_candidate_ids) ? fm.knowledge_candidate_ids.slice() : [];
          if (!ids.includes(candidate.candidate_id)) ids.push(candidate.candidate_id);
          fm.knowledge_candidate_ids = ids;
          fm.updated = new Date().toISOString();
        });
      }
    }
    return candidate;
  }

  async function setCandidateStatus(app, candidatePath, status) {
    const file = app.vault.getAbstractFileByPath(candidatePath);
    if (!file) throw new Error("Knowledge Candidate 파일을 찾을 수 없습니다.");
    const content = await app.vault.read(file);
    const data = root.ReadingCore.parseSimpleFrontmatter(content);
    const nextData = root.ReadingCore.setKnowledgeCandidateStatus(data, status);
    if (app.fileManager && app.fileManager.processFrontMatter) {
      await app.fileManager.processFrontMatter(file, (fm) => {
        fm.status = nextData.status;
        fm.updated = nextData.updated;
      });
    } else {
      const next = content
        .replace(/^status:\s*.*$/m, `status: ${nextData.status}`)
        .replace(/^updated:\s*.*$/m, `updated: ${nextData.updated}`);
      await app.vault.modify(file, next);
    }
    nextData.path = candidatePath;
    return nextData;
  }

  async function rejectCandidate(app, candidatePath) {
    return setCandidateStatus(app, candidatePath, "rejected");
  }

  async function saveCandidateAsKept(app, candidatePath) {
    return setCandidateStatus(app, candidatePath, "saved");
  }

  const api = {
    SESSION_DIR,
    SESSION_LEGACY_DIRS,
    CANDIDATE_DIR,
    CANDIDATE_LEGACY_DIRS,
    BOOK_DIR,
    ensureFolder,
    uniquePath,
    listBooks,
    listSessions,
    listCandidates,
    saveSession,
    saveCandidate,
    setCandidateStatus,
    rejectCandidate,
    saveCandidateAsKept
  };

  root.ReadingStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
