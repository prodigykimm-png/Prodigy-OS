(function (root) {
  "use strict";

  const SCHEMA_VERSION = "prodigy-reading-memory-v1";
  const MEMORY_ROOT = "SYSTEM/AI/Memory/";
  const READING_ROOT = "PARA/PROJECTS/Reading/";
  const PRIVATE_PREFIXES = ["SYSTEM/PRIVATE/", "SYSTEM/SECRETS/", "Trash/", ".trash/"];
  const CLAIM_HEADINGS = ["Key Takeaways", "핵심 노트", "핵심 인사이트"];
  const THOUGHT_HEADINGS = ["What I Learned", "Impression", "인사이트"];
  const APPLICATION_HEADINGS = ["Action Items", "적용"];

  function normalizePath(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\[\[|\]\]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function hashText(value) {
    let hash = 0xcbf29ce484222325n;
    for (const char of String(value || "")) {
      hash ^= BigInt(char.codePointAt(0));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, "0");
  }

  function stableSourceId(sourcePath) {
    return `reading-${hashText(normalizePath(sourcePath).toLocaleLowerCase("ko-KR"))}`;
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function isEligibleReadingPath(sourcePath) {
    const rawPath = String(sourcePath || "").replace(/\\/g, "/");
    if (rawPath.includes("\0") || rawPath.split("/").includes("..")) return false;
    const path = normalizePath(rawPath);
    if (!path.endsWith(".md") || !path.startsWith(READING_ROOT)) return false;
    if (path.startsWith(MEMORY_ROOT)) return false;
    return !PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  function scalar(value) {
    const text = String(value === undefined || value === null ? "" : value).trim();
    if (!text) return "";
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    return text;
  }

  function parseFrontmatter(content) {
    const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
    if (lines[0] !== "---") return { data: {}, bodyStart: 0 };
    const data = {};
    let index = 1;
    for (; index < lines.length; index += 1) {
      if (lines[index] === "---") return { data, bodyStart: index + 1 };
      const match = lines[index].match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (!match) continue;
      const raw = match[2].trim();
      if (raw.startsWith("[") && raw.endsWith("]")) {
        data[match[1]] = raw.slice(1, -1).split(",").map(scalar).filter(Boolean);
      } else {
        data[match[1]] = scalar(raw);
      }
    }
    return { data: {}, bodyStart: 0 };
  }

  function parseSections(content, bodyStart) {
    const lines = String(content || "").replace(/\r\n/g, "\n").split("\n").slice(bodyStart);
    const sections = new Map();
    let heading = "";
    let inFence = false;
    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const match = line.match(/^#{2,4}\s+(.+?)\s*$/) || line.match(/^\s*-\s*#{2,4}\s+(.+?)\s*$/);
      if (match) {
        heading = match[1].trim();
        if (!sections.has(heading)) sections.set(heading, []);
      } else if (heading) {
        sections.get(heading).push(line);
      }
    }
    return sections;
  }

  function unique(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const clean = String(value || "").trim();
      const key = normalizeText(clean);
      if (!clean || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(clean);
    }
    return result;
  }

  function listValue(value, splitWhitespace = false) {
    if (Array.isArray(value)) return unique(value);
    const text = scalar(value);
    if (!text) return [];
    const separator = splitWhitespace ? /[,\s]+/ : /[,;]+/;
    return unique(text.split(separator).map((item) => item.replace(/^#/, "").trim()));
  }

  function sectionItems(sections, headings, legacyUsed) {
    const values = [];
    for (const heading of headings) {
      const lines = sections.get(heading) || [];
      if (lines.length && /[가-힣]/.test(heading)) legacyUsed.push(`heading.${heading}`);
      for (const line of lines) {
        const clean = line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)/, "").trim();
        const structural = clean === "---"
          || clean.startsWith("|")
          || clean.startsWith("<!--")
          || clean.startsWith("INPUT[")
          || /^\*\*Connections:\*\*/i.test(clean);
        if (clean && !structural) values.push(clean);
      }
    }
    return unique(values);
  }

  function firstValue(data, keys, legacyUsed, label) {
    for (let index = 0; index < keys.length; index += 1) {
      const value = scalar(data[keys[index]]);
      if (!value) continue;
      if (index > 0) legacyUsed.push(`${label}.${keys[index]}`);
      return value;
    }
    return "";
  }

  function extractLinks(content) {
    const links = [];
    const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    let match;
    while ((match = pattern.exec(String(content || ""))) !== null) links.push(normalizePath(match[1].trim()));
    return unique(links);
  }

  function filenameTitle(sourcePath) {
    const name = normalizePath(sourcePath).split("/").pop() || "";
    return name.replace(/\.md$/i, "");
  }

  function projectReadingSource(source) {
    if (!source || !isEligibleReadingPath(source.source_path)) throw new Error("Reading source path is not eligible.");
    const content = String(source.content || "");
    const parsed = parseFrontmatter(content);
    const frontmatterOverride = source.frontmatter || {};
    const data = { ...parsed.data, ...frontmatterOverride };
    if (data.type && data.type !== "reading") throw new Error("Source is not a Reading Object.");
    const sections = parseSections(content, parsed.bodyStart);
    const legacyUsed = [];
    const title = firstValue(data, ["title", "book_title"], legacyUsed, "frontmatter") || filenameTitle(source.source_path);
    if (!data.title && !data.book_title) legacyUsed.push("filename");
    const started = firstValue(data, ["started", "start_date", "start_read_date"], legacyUsed, "frontmatter");
    const finished = firstValue(data, ["finished", "finish_date", "finish_read_date"], legacyUsed, "frontmatter");
    const category = scalar(data.book_type || data.category);
    const topics = unique([
      ...listValue(data.topics),
      ...listValue(data.tags, true),
      ...listValue(data.tag, true),
      category,
    ]);
    const keyConcepts = unique([
      ...listValue(data.key_concepts),
      ...sectionItems(sections, ["Key Concepts", "핵심 개념"], legacyUsed),
    ]);
    const coreClaims = unique([
      ...listValue(data.key_takeaway),
      ...sectionItems(sections, CLAIM_HEADINGS, legacyUsed),
    ]);
    const explicitLinks = extractLinks(content);
    const knowledgeLinks = unique([
      ...listValue(data.knowledge_links),
      ...explicitLinks.filter((link) => /^ZETA\//i.test(link) || /(^|\/)Knowledge(\/|$)/i.test(link)),
    ]);
    return {
      schema_version: SCHEMA_VERSION,
      source_path: normalizePath(source.source_path),
      source_mtime: Number(source.source_mtime || 0),
      source_hash: hashText(`${content}\0${stableSerialize(frontmatterOverride)}`),
      title,
      author: scalar(data.author),
      status: scalar(data.status),
      book_type: category,
      started,
      finished,
      topics,
      key_concepts: keyConcepts,
      core_claims: coreClaims,
      my_thoughts: sectionItems(sections, THOUGHT_HEADINGS, legacyUsed),
      applications: sectionItems(sections, APPLICATION_HEADINGS, legacyUsed),
      thinking_before: sectionItems(sections, ["Thinking Before", "Before", "이전 생각"], legacyUsed).join("\n"),
      thinking_after: sectionItems(sections, ["Thinking After", "After", "이후 생각"], legacyUsed).join("\n"),
      thinking_delta: sectionItems(sections, ["Thinking Delta", "생각의 변화"], legacyUsed).join("\n"),
      review_summary: scalar(data.review_summary) || sectionItems(sections, ["Review Summary", "복기 요약"], legacyUsed).join("\n"),
      explicit_links: explicitLinks,
      knowledge_links: knowledgeLinks,
      legacy_sources_used: unique(legacyUsed),
    };
  }

  const api = {
    SCHEMA_VERSION,
    hashText,
    isEligibleReadingPath,
    normalizePath,
    projectReadingSource,
    stableSourceId,
  };

  root.ReadingMemoryCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
