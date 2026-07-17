(function (root) {
  "use strict";

  const OFFICIAL_FIELDS = Object.freeze(["reflection", "change", "next_experiment"]);
  const LEGACY_MAP = Object.freeze({
    reflection: ["reflection", "daily_reflection", "learning", "lesson", "review"],
    change: ["change", "delta"],
    next_experiment: ["next_experiment", "next_step", "experiment"]
  });

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function firstNonEmpty(source, keys) {
    const data = source || {};
    for (const key of keys) {
      const value = clean(data[key]);
      if (value) return value;
    }
    return "";
  }

  function normalizeReviewFields(source) {
    const data = source || {};
    return {
      reflection: firstNonEmpty(data, LEGACY_MAP.reflection),
      change: firstNonEmpty(data, LEGACY_MAP.change),
      next_experiment: firstNonEmpty(data, LEGACY_MAP.next_experiment)
    };
  }

  function reviewStatus(fields) {
    const normalized = normalizeReviewFields(fields);
    const filled = OFFICIAL_FIELDS.filter((key) => clean(normalized[key])).length;
    if (filled === 0) return "empty";
    if (filled === OFFICIAL_FIELDS.length) return "complete";
    return "partial";
  }

  function reviewStatusLabel(status) {
    if (status === "complete") return "완료";
    if (status === "partial") return "작성 중";
    return "작성 전";
  }

  function todayIsoDate(now) {
    const date = now || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dailyPath(dateStr) {
    return `DAILY/DAILY/${dateStr}.md`;
  }

  function parseFrontmatter(text) {
    if (!text || !text.startsWith("---")) return { data: {}, body: text || "", hasFrontmatter: false };
    const end = text.indexOf("\n---", 3);
    if (end === -1) return { data: {}, body: text, hasFrontmatter: false };
    const raw = text.slice(3, end).replace(/^\n/, "");
    const body = text.slice(end + 4).replace(/^\n/, "");
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
    return { data, body, hasFrontmatter: true, rawFrontmatter: raw };
  }

  function escapeYaml(value) {
    const text = String(value == null ? "" : value);
    if (text === "") return "";
    if (/[:#\n"'{}[\],&*?|>!%@`]/.test(text) || text !== text.trim()) {
      return JSON.stringify(text);
    }
    return text;
  }

  function upsertFrontmatterKeys(content, updates) {
    const parsed = parseFrontmatter(content);
    const keys = Object.keys(updates);
    if (!parsed.hasFrontmatter) {
      const lines = ["---"];
      keys.forEach((key) => lines.push(`${key}: ${escapeYaml(updates[key])}`));
      lines.push("---", "", content || "");
      return lines.join("\n");
    }
    const lines = parsed.rawFrontmatter.split("\n");
    const seen = new Set();
    const nextLines = lines.map((line) => {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) return line;
      const key = match[1];
      if (!(key in updates)) return line;
      seen.add(key);
      return `${key}: ${escapeYaml(updates[key])}`;
    });
    keys.forEach((key) => {
      if (!seen.has(key)) nextLines.push(`${key}: ${escapeYaml(updates[key])}`);
    });
    return `---\n${nextLines.join("\n")}\n---\n${parsed.body}`;
  }

  function replaceSectionBody(body, titleRegex, value) {
    const pattern = new RegExp(`(##\\s*${titleRegex}[^\\n]*\\n)([\\s\\S]*?)(?=\\n##|\\n#|$)`);
    const replacementBody = value ? `${value}\n` : "\n";
    if (pattern.test(body)) {
      return body.replace(pattern, `$1${replacementBody}`);
    }
    return body;
  }

  function applyReviewToDailyContent(content, review) {
    const normalized = normalizeReviewFields(review);
    let next = upsertFrontmatterKeys(content || "", {
      reflection: normalized.reflection,
      change: normalized.change,
      next_experiment: normalized.next_experiment,
      updated: todayIsoDate()
    });
    const parsed = parseFrontmatter(next);
    let body = parsed.body || "";
    body = replaceSectionBody(body, "(?:성찰|Reflection)", normalized.reflection);
    body = replaceSectionBody(body, "(?:변화|Change)", normalized.change);
    body = replaceSectionBody(body, "(?:다음\\s*실험|Next\\s*Experiment)", normalized.next_experiment);
    if (!parsed.hasFrontmatter) return next;
    return `---\n${parsed.rawFrontmatter}\n---\n${body}`;
  }

  function extractReviewFromDaily(content, frontmatter) {
    const fromFm = normalizeReviewFields(frontmatter || {});
    const sections = root.MorningContextCore && root.MorningContextCore.parseReflectionSections
      ? root.MorningContextCore.parseReflectionSections(content || "")
      : { reflection: "", change: "", nextExperiment: "" };
    return normalizeReviewFields({
      reflection: fromFm.reflection || sections.reflection,
      change: fromFm.change || sections.change,
      next_experiment: fromFm.next_experiment || sections.nextExperiment
    });
  }

  const api = {
    OFFICIAL_FIELDS,
    clean,
    normalizeReviewFields,
    reviewStatus,
    reviewStatusLabel,
    todayIsoDate,
    dailyPath,
    parseFrontmatter,
    upsertFrontmatterKeys,
    applyReviewToDailyContent,
    extractReviewFromDaily
  };

  root.JournalCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
