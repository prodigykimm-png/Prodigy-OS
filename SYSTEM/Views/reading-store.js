(function (root) {
  "use strict";

  // Book execution records live under RESOURCES, not as Projects.
  // New writes use these paths; legacy paths remain readable without migration.
  const SESSION_DIR = "PARA/RESOURCES/Reading/Sessions";
  const SESSION_LEGACY_DIRS = Object.freeze(["PARA/PROJECTS/Reading/Sessions"]);
  const BOOK_DIR = "PARA/PROJECTS/Reading";

  function candidateStore() {
    if (!root.KnowledgeCandidateStore && typeof require === "function") require("./knowledge-candidate-store.js");
    if (!root.KnowledgeCandidateStore) throw new Error("Knowledge Candidate store를 먼저 불러와야 합니다.");
    return root.KnowledgeCandidateStore;
  }

  const CANDIDATE_DIR = "PARA/RESOURCES/Knowledge/Candidates";
  const CANDIDATE_LEGACY_DIRS = Object.freeze(["PARA/RESOURCES/Reading/Candidates", "ZETA/FLEETING/Knowledge Candidates"]);

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
    const candidates = await candidateStore().listCandidates(app, options);
    const visible = candidates.map((candidate) => {
      const sourceSession = candidate.source_session || (candidate.source_objects || []).find((value) => /^\[\[/.test(String(value))) || "";
      return { ...candidate, source_session: sourceSession };
    });
    const knownPaths = new Set(visible.map((candidate) => candidate.path));
    const request = options || {};
    const legacyStatusMatches = (status) => {
      if (!request.status || request.status === "all") return true;
      if (request.status === "active") return status === "proposed" || status === "saved";
      return status === request.status;
    };
    // A few pre-schema Reading notes have no usable provenance field. The shared
    // store correctly excludes them from canonical validation; Reading alone keeps
    // those legacy folders visible without rewriting or making them actionable.
    for (const file of await listMarkdownAcross(app, CANDIDATE_LEGACY_DIRS)) {
      if (knownPaths.has(file.path)) continue;
      const data = await readMarkdownObject(app, file);
      if (data.type && data.type !== "knowledge_candidate") continue;
      const status = data.status || "proposed";
      if (!legacyStatusMatches(status)) continue;
      visible.push({ ...data, type: "knowledge_candidate", status });
    }
    return visible.sort((left, right) => String(right.created || "").localeCompare(String(left.created || "")) || String(left.path || "").localeCompare(String(right.path || "")));
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
    const saved = await candidateStore().saveCandidate(app, candidate);

    if (session.path) {
      const sessionFile = app.vault.getAbstractFileByPath(session.path);
      if (sessionFile && app.fileManager && app.fileManager.processFrontMatter) {
        await app.fileManager.processFrontMatter(sessionFile, (fm) => {
          const ids = Array.isArray(fm.knowledge_candidate_ids) ? fm.knowledge_candidate_ids.slice() : [];
          if (!ids.includes(saved.candidate_id)) ids.push(saved.candidate_id);
          fm.knowledge_candidate_ids = ids;
          fm.updated = new Date().toISOString();
        });
      }
    }
    return { ...saved, source_session: (saved.source_objects || [])[0] || "" };
  }

  async function rejectCandidate(app, candidatePath) {
    return candidateStore().rejectCandidate(app, candidatePath);
  }

  async function approveCandidate(app, candidatePath, request, options) {
    return candidateStore().approveCandidate(app, candidatePath, request, options);
  }

  function isCanonicalCandidatePath(candidatePath) {
    return String(candidatePath || "").startsWith(`${CANDIDATE_DIR}/`);
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
    rejectCandidate,
    approveCandidate,
    isCanonicalCandidatePath
  };

  root.ReadingStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
