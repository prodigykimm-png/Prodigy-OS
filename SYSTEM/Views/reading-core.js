(function (root) {
  "use strict";

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
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
      reading_purpose: readingPurpose,
      purpose: clean(source.purpose),
      current_page: Number.isFinite(currentPage) ? currentPage : null,
      total_page: Number.isFinite(totalPage) ? totalPage : null,
      started_at: clean(source.started_at || source.started || source.start_read_date),
      completed_at: clean(source.completed_at || source.finished || source.finish_read_date),
      rating: source.rating == null || source.rating === "" ? null : Number(source.rating),
      key_takeaway: clean(source.key_takeaway),
      next_action: clean(source.next_action),
      cover_url: clean(source.cover_url || source.cover || source.cover_image || source.book_cover || source.image),
      path,
      updated: clean(source.updated)
    };
  }

  function validateReadingSession(input) {
    const errors = [];
    const source = input || {};
    if (!clean(source.book_id) && !clean(source.book) && !clean(source.book_path)) {
      errors.push("연결된 Book이 필요합니다.");
    }
    if (!clean(source.date)) errors.push("날짜가 필요합니다.");
    const hasRange = clean(source.reading_range) || clean(source.start_page) || clean(source.end_page);
    if (!hasRange) errors.push("읽은 범위 또는 페이지 정보가 필요합니다.");
    if (!clean(source.key_content) && !clean(source.my_thought)) {
      errors.push("핵심 내용 또는 내 생각 중 하나가 필요합니다.");
    }
    return errors;
  }

  function createReadingSession(bookInput, sessionInput) {
    const book = normalizeBook(bookInput);
    const source = sessionInput || {};
    const date = clean(source.date) || todayIsoDate();
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
      reading_range: clean(source.reading_range),
      duration: clean(source.duration),
      key_content: clean(source.key_content),
      my_thought: clean(source.my_thought),
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

  function createKnowledgeCandidate(sessionInput, candidateInput) {
    const session = sessionInput || {};
    const source = candidateInput || {};
    const title = clean(source.title) || `${clean(session.book_title) || "독서"} 후보`;
    const statement = clean(source.statement || source.my_thought || session.my_thought || session.thinking_delta);
    return {
      type: "knowledge_candidate",
      candidate_id: clean(source.candidate_id) || machineId("candidate", `${session.session_id || "session"}:${title}:${Date.now()}`),
      status: "proposed",
      title,
      statement,
      reason: clean(source.reason),
      source_type: "reading_session",
      source_session_id: clean(session.session_id),
      source_session: clean(source.source_session) || (session.path ? `[[${session.path.replace(/\.md$/, "")}]]` : ""),
      source_book: clean(source.source_book || session.book || session.book_title),
      created: clean(source.created) || new Date().toISOString(),
      updated: clean(source.updated) || new Date().toISOString()
    };
  }

  const CANDIDATE_STATUSES = Object.freeze({
    proposed: "proposed",
    saved: "saved",
    rejected: "rejected"
    // approved / knowledge are reserved for a later sprint
  });

  function setKnowledgeCandidateStatus(candidateInput, status) {
    const next = clone(candidateInput || {});
    const value = clean(status);
    if (!CANDIDATE_STATUSES[value]) {
      throw new Error(`Unsupported candidate status: ${value}`);
    }
    next.status = value;
    next.updated = new Date().toISOString();
    return next;
  }

  function rejectKnowledgeCandidate(candidateInput) {
    return setKnowledgeCandidateStatus(candidateInput, "rejected");
  }

  function saveKnowledgeCandidate(candidateInput) {
    return setKnowledgeCandidateStatus(candidateInput, "saved");
  }

  function sessionFilename(session) {
    const base = `${session.date} - ${sanitizeFilename(session.book_title || "Book")} - Session`;
    return `${base}.md`;
  }

  function candidateFilename(candidate) {
    return `Candidate - ${sanitizeFilename(candidate.title)}.md`;
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

  function buildCandidateMarkdown(candidate) {
    const body = [
      toFrontmatter(candidate),
      "",
      `# ${candidate.title}`,
      "",
      "## Statement",
      "",
      candidate.statement || "",
      "",
      "## Reason",
      "",
      candidate.reason || "",
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
    clone,
    machineId,
    todayIsoDate,
    sanitizeFilename,
    normalizeBook,
    validateReadingSession,
    createReadingSession,
    createKnowledgeCandidate,
    CANDIDATE_STATUSES,
    setKnowledgeCandidateStatus,
    rejectKnowledgeCandidate,
    saveKnowledgeCandidate,
    sessionFilename,
    candidateFilename,
    buildSessionMarkdown,
    buildCandidateMarkdown,
    parseSimpleFrontmatter
  };

  root.ReadingCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
