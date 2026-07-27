(function (root) {
  "use strict";

  const OFFICIAL_FIELDS = Object.freeze(["reflection", "change", "next_experiment"]);
  const LEGACY_MAP = Object.freeze({
    reflection: ["reflection", "daily_reflection", "learning", "lesson", "review"],
    change: ["change", "delta"],
    next_experiment: ["next_experiment", "next_step", "experiment"]
  });

  const FIELD_ALIASES = Object.freeze({
    context: ["context", "컨텍스트", "상황"],
    related_objects: ["related objects", "related_objects", "연관", "연결 object", "연결"],
    experience: ["experience", "경험", "성찰", "reflection"],
    interpretation: ["interpretation", "해석", "의미"],
    change: ["change", "변화"],
    next_experiment: ["next experiment", "next_experiment", "다음 실험", "실험"]
  });

  const ID_COMMENT_RE = /<!--\s*evidence_id\s*:\s*(daily-\d{4}-\d{2}-\d{2}-e\d{2,})\s*-->/i;
  // Capture ## Evidence body until next ATX heading at # or ## level, or EOF
  const EVIDENCE_SECTION_RE = /^##\s+Evidence\s*\n([\s\S]*?)(?=^#{1,2}\s+(?!#)|$(?![\s\S]))/im;

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

  function isExplicitDailyCompletion(frontmatter) {
    const data = frontmatter || {};
    return clean(data.status).toLowerCase() === "completed" && Boolean(clean(data.completed_at));
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

  // ─── Evidence Blocks v1 ───────────────────────────────────────────

  function extractLinks(text) {
    const links = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(text || "")) !== null) {
      const target = m[1].split("|")[0].split("#")[0].trim();
      if (target) links.push(`[[${target}]]`);
    }
    return Array.from(new Set(links));
  }

  function resolveFieldLabel(label) {
    const key = clean(label).toLowerCase().replace(/:$/, "");
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => key === a || key.includes(a))) return field;
    }
    return null;
  }

  function parseFieldBody(body) {
    const fields = {
      context: [],
      related_objects: [],
      experience: [],
      interpretation: [],
      change: [],
      next_experiment: []
    };
    let current = null;
    const leftover = [];
    (body || "").split("\n").forEach((line) => {
      const m = line.trim().match(/^([A-Za-z가-힣 _]+)\s*:\s*(.*)$/);
      if (m) {
        const field = resolveFieldLabel(m[1]);
        if (field) {
          current = field;
          if (m[2].trim()) fields[field].push(m[2].trim());
          return;
        }
      }
      if (current) fields[current].push(line.replace(/\s+$/, ""));
      else leftover.push(line.replace(/\s+$/, ""));
    });
    const out = {};
    Object.keys(fields).forEach((k) => {
      out[k] = fields[k].join("\n").trim();
    });
    if (!out.experience && leftover.length) {
      out.experience = leftover.join("\n").trim();
    }
    return out;
  }

  function titleAndIdFromHeading(heading, day, index) {
    const h = clean(heading);
    let m = h.match(/^(?:e(\d{2,})|\[e(\d{2,})\])\s*[·\-\|:]\s*(.+)$/i);
    if (m) {
      const num = m[1] || m[2];
      return { title: clean(m[3]), evidence_id: `daily-${day}-e${String(Number(num)).padStart(2, "0")}` };
    }
    m = h.match(/^\[e(\d{2,})\]\s*(.+)$/i);
    if (m) {
      return { title: clean(m[2]), evidence_id: `daily-${day}-e${String(Number(m[1])).padStart(2, "0")}` };
    }
    return { title: h, evidence_id: `daily-${day}-e${String(index).padStart(2, "0")}` };
  }

  function parseEvidenceSection(sectionBody, day) {
    if (!clean(sectionBody)) return [];
    const blocksRaw = [];
    let currentTitle = "";
    let buf = [];
    sectionBody.split("\n").forEach((line) => {
      const m = line.match(/^###\s+(.+?)\s*$/);
      if (m) {
        if (currentTitle) blocksRaw.push([currentTitle, buf.join("\n").trim()]);
        currentTitle = m[1].trim();
        buf = [];
      } else {
        buf.push(line);
      }
    });
    if (currentTitle) blocksRaw.push([currentTitle, buf.join("\n").trim()]);

    const usedIds = new Set();
    const prelim = [];
    blocksRaw.forEach((pair, i) => {
      const heading = pair[0];
      let body = pair[1];
      const idMatch = body.match(ID_COMMENT_RE);
      const parsed = titleAndIdFromHeading(heading, day, i + 1);
      let evidenceId = idMatch ? idMatch[1] : parsed.evidence_id;
      body = body.replace(ID_COMMENT_RE, "").trim();
      const fields = parseFieldBody(body);
      let experience = clean(fields.experience);
      const title = clean(parsed.title) || experience.slice(0, 40);
      if (!experience && !title) return;
      if (!experience) experience = title;
      prelim.push({
        evidence_id: evidenceId,
        title: title.slice(0, 80),
        context: clean(fields.context).toLowerCase(),
        related_objects: extractLinks(fields.related_objects) || extractLinks(body),
        experience,
        interpretation: clean(fields.interpretation),
        change: clean(fields.change),
        next_experiment: clean(fields.next_experiment)
      });
      usedIds.add(evidenceId);
    });

    const seen = new Set();
    let nextNum = 1;
    return prelim.map((block) => {
      let eid = block.evidence_id;
      if (seen.has(eid)) {
        while (seen.has(`daily-${day}-e${String(nextNum).padStart(2, "0")}`)
          || usedIds.has(`daily-${day}-e${String(nextNum).padStart(2, "0")}`)) {
          nextNum += 1;
        }
        eid = `daily-${day}-e${String(nextNum).padStart(2, "0")}`;
        nextNum += 1;
      }
      seen.add(eid);
      return Object.assign({}, block, { evidence_id: eid });
    });
  }

  function parseLegacyAsBlock(body, day) {
    const sections = {};
    let current = "";
    (body || "").split("\n").forEach((line) => {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (m) {
        current = m[2].replace(/\s*\([^)]*\)/g, "").trim();
        if (!(current in sections)) sections[current] = [];
        return;
      }
      if (current) sections[current].push(line);
    });
    function find(...aliases) {
      for (const a of aliases) {
        if (sections[a]) return sections[a].join("\n").trim();
        for (const h of Object.keys(sections)) {
          if (h.toLowerCase().includes(String(a).toLowerCase())) {
            return sections[h].join("\n").trim();
          }
        }
      }
      return "";
    }
    function stripPrompts(text) {
      return (text || "").split("\n").filter((line) => {
        const s = line.trim();
        if (!s || s === "-") return false;
        if (s.startsWith("*") && s.endsWith("*")) return false;
        return true;
      }).join("\n").trim();
    }
    const reflection = stripPrompts(find("성찰", "Reflection"));
    const change = stripPrompts(find("변화", "Change"));
    const experiment = stripPrompts(find("다음 실험", "Next Experiment"));
    const references = stripPrompts(find("연관 참조", "References"));
    if (!reflection && !change && !experiment) return [];
    const blob = [reflection, change, experiment, references].join("\n");
    return [{
      evidence_id: `daily-${day}`,
      title: "Daily Reflection",
      context: "",
      related_objects: extractLinks(blob),
      experience: reflection,
      interpretation: "",
      change,
      next_experiment: experiment,
      legacy: true
    }];
  }

  function parseDailyEvidenceBlocks(markdown, day) {
    const parsed = parseFrontmatter(markdown || "");
    const body = parsed.body || markdown || "";
    const m = body.match(EVIDENCE_SECTION_RE);
    if (m) {
      const blocks = parseEvidenceSection(m[1], day);
      if (blocks.length) return blocks;
    }
    return parseLegacyAsBlock(body, day);
  }

  function nextEvidenceId(existing, day) {
    let max = 0;
    (existing || []).forEach((b) => {
      const m = String(b.evidence_id || "").match(/-e(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `daily-${day}-e${String(max + 1).padStart(2, "0")}`;
  }

  function renderEvidenceBlock(block) {
    const eid = String(block.evidence_id || "");
    const numMatch = eid.match(/-e(\d+)$/);
    const num = numMatch ? numMatch[1] : "01";
    const title = clean(block.title) || "경험";
    const lines = [`### e${num} · ${title}`, `<!-- evidence_id: ${eid} -->`, ""];
    if (clean(block.context)) {
      lines.push(`Context: ${clean(block.context)}`, "");
    }
    const related = Array.isArray(block.related_objects) ? block.related_objects : [];
    if (related.length) {
      lines.push("Related Objects:");
      related.forEach((link) => lines.push(`- ${link}`));
      lines.push("");
    }
    lines.push("Experience:", clean(block.experience) || "", "");
    if (clean(block.interpretation)) {
      lines.push("Interpretation:", clean(block.interpretation), "");
    }
    if (clean(block.change)) {
      lines.push("Change:", clean(block.change), "");
    }
    if (clean(block.next_experiment)) {
      lines.push("Next Experiment:", clean(block.next_experiment), "");
    }
    return `${lines.join("\n").replace(/\n+$/, "")}\n`;
  }

  function renderEvidenceSection(blocks) {
    const parts = ["## Evidence", ""];
    (blocks || []).forEach((block) => {
      parts.push(renderEvidenceBlock(block));
      parts.push("");
    });
    return `${parts.join("\n").replace(/\n+$/, "")}\n`;
  }

  function upsertEvidenceSection(markdown, blocks) {
    const text = markdown || "";
    let fm = "";
    let body = text;
    if (text.startsWith("---\n")) {
      const end = text.indexOf("\n---", 4);
      if (end !== -1) {
        fm = text.slice(0, end + 4);
        body = text.slice(end + 4).replace(/^\n+/, "");
      }
    }
    const section = renderEvidenceSection(blocks);
    if (EVIDENCE_SECTION_RE.test(body)) {
      body = body.replace(EVIDENCE_SECTION_RE, `${section.replace(/\n+$/, "")}\n\n`);
    } else {
      const titleMatch = body.match(/^(#\s+[^\n]+\n+)/);
      if (titleMatch) {
        body = body.slice(0, titleMatch[0].length) + section + "\n" + body.slice(titleMatch[0].length);
      } else {
        body = `${section}\n${body}`;
      }
    }
    if (fm) return `${fm}\n${body.replace(/^\n+/, "")}`;
    return body;
  }

  /**
   * Deterministic multi-event propose (no LLM).
   * Never writes to vault — caller must confirm.
   */
  function proposeBlocksFromFreeText(text, day) {
    const raw = clean(text);
    if (!raw) return [];
    let parts = raw.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      const bullets = raw.split(/^\s*(?:[-*]|\d+[.)])\s+/m).map((b) => b.trim()).filter(Boolean);
      if (bullets.length > 1) parts = bullets;
    }
    return parts.map((part, i) => {
      const first = part.split("\n")[0].trim();
      const title = first.length > 48 ? `${first.slice(0, 48)}…` : first;
      return {
        evidence_id: `daily-${day}-e${String(i + 1).padStart(2, "0")}`,
        title: title || `경험 ${i + 1}`,
        context: "",
        related_objects: extractLinks(part),
        experience: part,
        interpretation: "",
        change: "",
        next_experiment: ""
      };
    });
  }

  function emptyBlock(day, existing) {
    return {
      evidence_id: nextEvidenceId(existing || [], day),
      title: "",
      context: "",
      related_objects: [],
      experience: "",
      interpretation: "",
      change: "",
      next_experiment: ""
    };
  }

  function evidenceStatus(blocks) {
    const list = Array.isArray(blocks) ? blocks : [];
    const withExp = list.filter((b) => clean(b.experience));
    if (!withExp.length) return "empty";
    const complete = withExp.filter((b) => clean(b.change) || clean(b.next_experiment));
    if (complete.length === withExp.length && withExp.length > 0) return "complete";
    return "partial";
  }

  function aggregateLegacyFieldsFromBlocks(blocks) {
    const list = (blocks || []).filter((b) => clean(b.experience));
    if (!list.length) {
      return { reflection: "", change: "", next_experiment: "" };
    }
    return {
      reflection: list.map((b) => {
        const t = clean(b.title);
        const e = clean(b.experience);
        return t ? `· ${t}: ${e}` : e;
      }).join("\n"),
      change: list.map((b) => clean(b.change)).filter(Boolean).join("\n"),
      next_experiment: list.map((b) => clean(b.next_experiment)).filter(Boolean).join("\n")
    };
  }

  const api = {
    OFFICIAL_FIELDS,
    clean,
    normalizeReviewFields,
    reviewStatus,
    reviewStatusLabel,
    isExplicitDailyCompletion,
    todayIsoDate,
    dailyPath,
    parseFrontmatter,
    upsertFrontmatterKeys,
    applyReviewToDailyContent,
    extractReviewFromDaily,
    // Evidence Blocks
    extractLinks,
    parseDailyEvidenceBlocks,
    parseEvidenceSection,
    renderEvidenceBlock,
    renderEvidenceSection,
    upsertEvidenceSection,
    nextEvidenceId,
    proposeBlocksFromFreeText,
    emptyBlock,
    evidenceStatus,
    aggregateLegacyFieldsFromBlocks
  };

  root.JournalCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
