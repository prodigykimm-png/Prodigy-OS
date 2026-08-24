(function (root) {
  "use strict";

  function clean(value) {
    if (value == null) return "";
    if (typeof value === "object") {
      if (value.path) return String(value.path).trim();
      if (value.fileName) return String(value.fileName).trim();
      if (value.link) return String(value.link).trim();
    }
    return String(value).trim();
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function machineId(prefix, seed) {
    return `${prefix}_${stableHash(seed)}`;
  }

  function todayIsoDate(now) {
    const date = now || new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function sanitizeFilename(value) {
    return clean(value)
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "untitled";
  }

  function normalizeBook(input) {
    const source = input || {};
    const title = clean(source.book_title || source.title || source.name || source.file?.name);
    const path = clean(source.path || source.file?.path || source.source_path);
    const bookId = clean(source.book_id || source.id) || machineId("book", path || title);
    const readingPurpose = clean(source.reading_purpose || source.purpose);
    const currentPage = Number(source.current_page);
    const totalPage = Number(source.total_page);
    return {
      type: "reading",
      book_id: bookId,
      book_title: title,
      title,
      author: clean(source.author),
      status: clean(source.status) || "queue",
      reading_format: projectReadingFormat(source.reading_format),
      reading_purpose: readingPurpose,
      purpose: clean(source.purpose),
      current_page: Number.isFinite(currentPage) ? currentPage : null,
      total_page: Number.isFinite(totalPage) ? totalPage : null,
      started_at: clean(source.started_at || source.started || source.start_read_date),
      completed_at: clean(source.completed_at || source.finished || source.finish_read_date),
      rating: source.rating == null || source.rating === "" ? null : Number(source.rating),
      key_takeaway: clean(source.key_takeaway),
      next_action: clean(source.next_action),
      cover_url: clean(source.cover_url || source.cover || source.cover_image || source.book_cover || source.image || source.banner || source.thumbnail || source.coverUrl || source.coverImage),
      identifier: clean(source.identifier),
      publisher: clean(source.publisher),
      source_url: clean(source.source_url),
      path,
      updated: clean(source.updated)
    };
  }

  /**
   * Project missing or unknown legacy reading_format as "미분류".
   * Preserves valid canonical values. Never rewrites files — projection only.
   */
  const READING_FORMATS = Object.freeze(["book", "ebook", "paper", "document", "audiobook", "미분류"]);

  function projectReadingFormat(value) {
    const text = clean(value);
    if (!text) return "미분류";
    if (READING_FORMATS.includes(text)) return text;
    return "미분류";
  }

  function validateReadingSession(input) {
    const errors = [];
    const source = input || {};
    if (!clean(source.book_id) && !clean(source.book) && !clean(source.book_path)) {
      errors.push("연결된 Book이 필요합니다.");
    }
    if (!clean(source.date)) errors.push("날짜가 필요합니다.");
    // Range/pages are optional — OS prefers one-note sessions over form walls.
    // At least one thought signal is required (memo / key / delta).
    if (!clean(source.key_content) && !clean(source.my_thought) && !clean(source.thinking_delta)) {
      errors.push("한 줄 메모가 필요합니다.");
    }
    return errors;
  }

  function createReadingSession(bookInput, sessionInput) {
    const book = normalizeBook(bookInput);
    const source = sessionInput || {};
    const date = clean(source.date) || todayIsoDate();
    // Minimal input: one memo can fill key_content; range defaults to "오늘 읽기".
    let keyContent = clean(source.key_content);
    let myThought = clean(source.my_thought);
    const note = clean(source.note);
    if (note && !keyContent && !myThought) {
      keyContent = note;
    }
    let readingRange = clean(source.reading_range);
    if (!readingRange && !clean(source.start_page) && !clean(source.end_page)) {
      const progressHint = clean(source.progress);
      readingRange = progressHint
        ? `진행 ${String(progressHint).replace(/%/g, "")}%`
        : "오늘 읽기";
    }
    const payload = {
      type: "reading_session",
      session_id: clean(source.session_id) || machineId("session", `${book.book_id}:${date}:${Date.now()}`),
      book_id: book.book_id,
      book: clean(source.book) || (book.path ? `[[${book.path.replace(/\.md$/, "")}]]` : `[[${book.book_title}]]`),
      book_path: book.path,
      book_title: book.book_title,
      date,
      start_page: clean(source.start_page),
      end_page: clean(source.end_page),
      reading_range: readingRange,
      duration: clean(source.duration),
      key_content: keyContent,
      my_thought: myThought,
      thinking_delta: clean(source.thinking_delta),
      next_position: clean(source.next_position),
      next_action: clean(source.next_action),
      knowledge_candidate_ids: Array.isArray(source.knowledge_candidate_ids) ? source.knowledge_candidate_ids.slice() : [],
      created: clean(source.created) || new Date().toISOString(),
      updated: clean(source.updated) || new Date().toISOString()
    };
    const errors = validateReadingSession(payload);
    if (errors.length) {
      const error = new Error(errors.join(" "));
      error.validation = errors;
      throw error;
    }
    return payload;
  }

  function candidateCore() {
    if (!root.KnowledgeCandidateCore && typeof require === "function") require("./knowledge-candidate-core.js");
    if (!root.KnowledgeCandidateCore) throw new Error("Knowledge Candidate core를 먼저 불러와야 합니다.");
    return root.KnowledgeCandidateCore;
  }

  function sourceSessionLink(session, source) {
    const explicit = clean(source.source_session || session.source_session);
    if (explicit) return /^\[\[[^\[\]|]+\]\]$/.test(explicit) ? explicit : `[[${explicit.replace(/\.md$/, "")}]]`;
    const sessionPath = clean(session.path);
    if (sessionPath) return `[[${sessionPath.replace(/\.md$/, "")}]]`;
    throw new Error("지식 후보는 저장된 독서 세션에서만 만들 수 있습니다.");
  }

  function createKnowledgeCandidate(sessionInput, candidateInput) {
    const session = sessionInput || {};
    const source = candidateInput || {};
    const title = clean(source.title) || `${clean(session.book_title) || "독서"} 후보`;
    const statement = clean(source.statement || source.my_thought || session.my_thought || session.thinking_delta);
    const now = new Date().toISOString();
    return candidateCore().createCandidate({
      type: "knowledge_candidate",
      candidate_id: clean(source.candidate_id),
      status: "saved",
      title,
      statement,
      reason: clean(source.reason) || "독서 세션의 직접 기록을 바탕으로 만든 후보입니다.",
      source_type: "reading_session",
      source_evidence_ids: [],
      source_objects: [sourceSessionLink(session, source)],
      confidence: clean(source.confidence) || "explicit",
      suggested_domain: clean(source.suggested_domain) || "reading",
      suggested_topics: Array.isArray(source.suggested_topics) ? source.suggested_topics : [],
      approval_note: clean(source.approval_note),
      promotion_target: "",
      promoted_knowledge: "",
      created: clean(source.created) || now,
      updated: clean(source.updated) || now
    });
  }

  function sessionFilename(session) {
    const base = `${session.date} - ${sanitizeFilename(session.book_title || "Book")} - Session`;
    return `${base}.md`;
  }

  function toFrontmatter(fields) {
    const lines = ["---"];
    Object.entries(fields).forEach(([key, value]) => {
      if (value == null) {
        lines.push(`${key}:`);
        return;
      }
      if (Array.isArray(value)) {
        if (!value.length) {
          lines.push(`${key}: []`);
          return;
        }
        lines.push(`${key}:`);
        value.forEach((item) => lines.push(`  - ${JSON.stringify(String(item))}`));
        return;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        lines.push(`${key}: ${value}`);
        return;
      }
      const text = String(value);
      lines.push(`${key}: ${/[:#\n"'{}[\],&*?|>!%@`]/.test(text) || text !== text.trim() ? JSON.stringify(text) : text}`);
    });
    lines.push("---");
    return lines.join("\n");
  }

  function buildSessionMarkdown(session) {
    const body = [
      toFrontmatter(session),
      "",
      `# Reading Session — ${session.book_title || "Book"}`,
      "",
      "## Key Content",
      "",
      session.key_content || "",
      "",
      "## My Thought",
      "",
      session.my_thought || "",
      "",
      "## Thinking Delta",
      "",
      session.thinking_delta || "",
      "",
      "## Next",
      "",
      `- Position: ${session.next_position || ""}`,
      `- Action: ${session.next_action || ""}`,
      ""
    ];
    return body.join("\n");
  }

  function parseSimpleFrontmatter(text) {
    if (!text || !text.startsWith("---")) return {};
    const end = text.indexOf("\n---", 3);
    if (end === -1) return {};
    const data = {};
    text.slice(3, end).replace(/^\n/, "").split("\n").forEach((line) => {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) return;
      let value = match[2].trim();
      if (value === "[]") value = [];
      else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[match[1]] = value;
    });
    return data;
  }

  const api = {
    clean,
    machineId,
    todayIsoDate,
    sanitizeFilename,
    normalizeBook,
    projectReadingFormat,
    READING_FORMATS,
    validateReadingSession,
    createReadingSession,
    createKnowledgeCandidate,
    sessionFilename,
    buildSessionMarkdown,
    parseSimpleFrontmatter
  };

  root.ReadingCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
