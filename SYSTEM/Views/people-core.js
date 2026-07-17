(function (root) {
  "use strict";

  /**
   * People Object foundation — pure helpers only.
   * People = relationship context (not CRM, not Dashboard, not AI).
   * Canonical type: people. Legacy type: contact (read-only compatibility).
   */

  const CANONICAL_TYPE = "people";
  const LEGACY_TYPE = "contact";
  const PEOPLE_FOLDER = "PARA/RESOURCES/CONTACTS";
  const PEOPLE_TEMPLATE = "SYSTEM/TEMPLATE/FORMAT/template_people.md";
  const DISPLAY_LABEL = "사람";

  /** Shared link field across Project / Auction / Journal / Reading. */
  const LINK_FIELD = "connections";

  /**
   * Dashboard "빠른 수정" whitelist only.
   * Long relationship narrative stays in body sections, not here.
   */
  const QUICK_EDIT_FIELDS = Object.freeze([
    "relationship",
    "company",
    "role",
    "last_contact",
    "phone",
    "email"
  ]);

  const LINKED_OBJECT_TYPES = Object.freeze({
    project: Object.freeze({ type: "project", label: "프로젝트" }),
    auction_case: Object.freeze({ type: "auction_case", label: "경매" }),
    journal: Object.freeze({ type: "journal", label: "저널" }),
    reading: Object.freeze({ type: "reading", label: "독서" })
  });

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function isPeopleType(type) {
    return clean(type).toLowerCase() === CANONICAL_TYPE;
  }

  function isLegacyContactType(type) {
    return clean(type).toLowerCase() === LEGACY_TYPE;
  }

  function isPeopleOrLegacy(type) {
    return isPeopleType(type) || isLegacyContactType(type);
  }

  function safeName(value) {
    const name = clean(value)
      .replace(/[\\/:*?"<>|#[\]^]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) throw new Error("사람 이름을 입력해 주세요.");
    return name.slice(0, 120);
  }

  function peoplePath(name) {
    return `${PEOPLE_FOLDER}/${safeName(name)}.md`;
  }

  function isUnderPeopleFolder(path) {
    return clean(path).replace(/\\/g, "/").startsWith(`${PEOPLE_FOLDER}/`);
  }

  /**
   * Apply template text for a new person. Never emits type: contact.
   */
  function renderPeopleContent(templateSource, name) {
    const personName = safeName(name);
    let text = String(templateSource == null ? "" : templateSource);
    if (!text.trim()) {
      text = defaultTemplateStub(personName);
    }

    // Force canonical type even if a stale template slipped in.
    if (/^type:\s*/m.test(text)) {
      text = text.replace(/^type:\s*.*$/m, `type: ${CANONICAL_TYPE}`);
    } else if (text.startsWith("---")) {
      text = text.replace(/^---\n/, `---\ntype: ${CANONICAL_TYPE}\n`);
    }

    // First ATX H1 that is empty or placeholder becomes the person name.
    if (/^#\s*$/m.test(text)) {
      text = text.replace(/^#\s*$/m, `# ${personName}`);
    } else if (!new RegExp(`^#\\s*${escapeRegExp(personName)}\\s*$`, "m").test(text)) {
      // Insert title after frontmatter when missing.
      if (text.startsWith("---")) {
        const end = text.indexOf("\n---", 3);
        if (end !== -1) {
          const insertAt = end + 4;
          text = `${text.slice(0, insertAt)}\n\n# ${personName}${text.slice(insertAt)}`;
        } else {
          text = `# ${personName}\n\n${text}`;
        }
      } else {
        text = `# ${personName}\n\n${text}`;
      }
    }

    if (/type:\s*contact\b/i.test(text)) {
      throw new Error("People 생성은 type: contact를 사용할 수 없습니다. type: people만 허용됩니다.");
    }

    return text;
  }

  function defaultTemplateStub(name) {
    return [
      "---",
      `type: ${CANONICAL_TYPE}`,
      "status: active",
      "relationship: ",
      "company: ",
      "role: ",
      "birthday: ",
      "first_met: ",
      "last_contact: ",
      "phone: ",
      "email: ",
      "connections: ",
      "tags: ",
      "---",
      "",
      `# ${name}`,
      "",
      "# 관계",
      "- ",
      "",
      "# 핵심 상호작용",
      "- ",
      "",
      "# 연결된 Object",
      ""
    ].join("\n");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Resolve unique path; throws if exact file already exists.
   * Does not overwrite.
   */
  function resolveCreatePath(name, existingPaths) {
    const path = peoplePath(name);
    const set = new Set((existingPaths || []).map((p) => clean(p).replace(/\\/g, "/")));
    if (set.has(path)) {
      throw new Error(`같은 이름의 사람 Object가 이미 있습니다: ${path}`);
    }
    return path;
  }

  /**
   * Classify a frontmatter type for People surfaces.
   * @returns {"people"|"legacy_contact"|"other"}
   */
  function classifyPeopleType(type) {
    if (isPeopleType(type)) return "people";
    if (isLegacyContactType(type)) return "legacy_contact";
    return "other";
  }

  /**
   * Pure discovery: group source pages that link to a people path/name.
   * pages: [{ path, type, title, connections?, outlinks? }]
   * people: { path, name }
   */
  function discoverLinkedObjects(pages, people) {
    const peoplePathNorm = clean(people && people.path).replace(/\\/g, "/").toLowerCase();
    const peopleName = clean(people && (people.name || people.title)).toLowerCase();
    const peopleLinkHints = [
      peoplePathNorm,
      peopleName,
      peopleName ? `[[${peopleName}]]` : "",
      peoplePathNorm ? peoplePathNorm.replace(/\.md$/i, "") : ""
    ].filter(Boolean);

    const groups = {
      project: [],
      auction_case: [],
      journal: [],
      reading: [],
      other: []
    };

    (pages || []).forEach((page) => {
      if (!page) return;
      const pagePath = clean(page.path).replace(/\\/g, "/");
      if (pagePath.toLowerCase() === peoplePathNorm) return;

      const type = clean(page.type).toLowerCase();
      const connections = page.connections;
      const connectionText = Array.isArray(connections)
        ? connections.map(clean).join("\n")
        : clean(connections);
      const outlinks = Array.isArray(page.outlinks) ? page.outlinks.map(clean) : [];
      const body = clean(page.body);
      const haystack = [connectionText, outlinks.join("\n"), body, clean(page.title)].join("\n").toLowerCase();

      const linked = peopleLinkHints.some((hint) => {
        if (!hint) return false;
        if (haystack.includes(hint)) return true;
        return outlinks.some((link) => clean(link).toLowerCase().includes(hint.replace(/^\[\[|\]\]$/g, "")));
      });
      if (!linked) return;

      const item = {
        path: pagePath,
        type: type || "unknown",
        title: clean(page.title) || pagePath.split("/").pop().replace(/\.md$/i, "")
      };

      if (type === "project" || type === "project_note" || type === "project_family") {
        groups.project.push(item);
      } else if (type === "auction_case" || type === "auction") {
        groups.auction_case.push(item);
      } else if (type === "journal" || pagePath.includes("DAILY/DAILY/")) {
        groups.journal.push(item);
      } else if (type === "reading" || type === "reading_session") {
        groups.reading.push(item);
      } else {
        groups.other.push(item);
      }
    });

    return groups;
  }

  /**
   * Pick only quick-edit whitelist fields from a frontmatter-like object.
   * Never includes type/status/body.
   */
  function pickQuickEditValues(source) {
    const data = source || {};
    const out = {};
    QUICK_EDIT_FIELDS.forEach((key) => {
      // Legacy contact notes used `title` for role-like data.
      if (key === "role" && (data.role == null || clean(data.role) === "") && data.title != null) {
        out.role = clean(data.title);
        return;
      }
      out[key] = clean(data[key]);
    });
    return out;
  }

  /**
   * Merge quick-edit updates into a frontmatter object (returns a copy).
   * Does not touch type or non-whitelisted keys.
   */
  function applyQuickEditValues(frontmatter, updates) {
    const next = Object.assign({}, frontmatter || {});
    const originalType = next.type;
    Object.keys(updates || {}).forEach((key) => {
      if (QUICK_EDIT_FIELDS.indexOf(key) === -1) return;
      next[key] = clean(updates[key]);
    });
    // Never rewrite type via quick edit.
    if (originalType != null) next.type = originalType;
    return next;
  }

  /**
   * Filter an updates object to whitelist only (for store layer).
   */
  function sanitizeQuickEditUpdates(updates) {
    const out = {};
    Object.keys(updates || {}).forEach((key) => {
      if (QUICK_EDIT_FIELDS.indexOf(key) === -1) return;
      out[key] = clean(updates[key]);
    });
    return out;
  }

  const INTERACTION_SECTION = "핵심 상호작용";
  const INTERACTION_SECTION_ALIASES = Object.freeze([
    "핵심 상호작용",
    "Key Interactions",
    "사건",
    "상호작용"
  ]);

  const NOTES_SECTION = "메모";
  const NOTES_SECTION_ALIASES = Object.freeze([
    "메모",
    "Notes",
    "장기 맥락"
  ]);

  function todayIso(now) {
    const date = now instanceof Date ? now : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalizeIsoDate(value, fallbackNow) {
    const text = clean(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return todayIso(fallbackNow);
  }

  /**
   * Format one Key Interaction index line.
   * Prefer template form: Date | optional source link | insight
   * Compact form when only daily date + insight (matches handwritten style).
   */
  function formatInteractionLine(input, options) {
    const opts = options || {};
    const date = normalizeIsoDate(input && input.date, opts.now);
    const insight = clean(input && (input.insight || input.note || input.summary));
    if (!insight) throw new Error("사건 한 줄 내용을 입력해 주세요.");

    let source = clean(input && (input.source || input.source_link || input.link));
    // Bare date → daily-style wikilink
    if (!source && opts.linkDaily !== false) {
      source = `[[${date}]]`;
    } else if (source && !/^\[\[.*\]\]$/.test(source) && !source.startsWith("http")) {
      // Path or bare title → wikilink without .md
      source = `[[${source.replace(/\.md$/i, "").split("/").pop()}]]`;
    }

    // Handwritten style: - [[2026-07-16]] 전태현 청모
    if (source === `[[${date}]]`) {
      return `- [[${date}]] ${insight}`;
    }
    // Full index form
    if (source) return `- ${date} | ${source} | ${insight}`;
    return `- ${date} | ${insight}`;
  }

  function findSectionRange(content, aliases) {
    const text = String(content || "").replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    const names = (aliases || []).map((a) => String(a).toLowerCase());
    let start = -1;
    let end = lines.length;
    for (let i = 0; i < lines.length; i += 1) {
      const heading = lines[i].match(/^#\s+(.+?)\s*$/);
      if (!heading) continue;
      const title = heading[1].trim();
      if (start < 0 && names.indexOf(title.toLowerCase()) !== -1) {
        start = i;
        continue;
      }
      if (start >= 0 && i > start) {
        end = i;
        break;
      }
    }
    return { start, end, lines, text };
  }

  function findInteractionSectionRange(content) {
    return findSectionRange(content, INTERACTION_SECTION_ALIASES);
  }

  function findNotesSectionRange(content) {
    return findSectionRange(content, NOTES_SECTION_ALIASES);
  }

  function isTemplatePlaceholderBullet(line) {
    const t = clean(line);
    if (/^- YYYY-MM-DD/.test(t) || /^- \*\*YYYY-MM-DD\*\*/.test(t)) return true;
    // Empty bullet left by template under 메모 / 관계 etc.
    if (t === "-") return true;
    return false;
  }

  /**
   * Append a bullet under a named H1 section. Creates section if missing.
   */
  function appendLineToSection(content, options) {
    const opts = options || {};
    const entry = clean(opts.line);
    if (!entry) throw new Error(opts.emptyError || "추가할 줄이 비어 있습니다.");
    const bullet = entry.startsWith("-") ? entry : `- ${entry}`;
    const aliases = opts.aliases || [];
    const sectionTitle = opts.sectionTitle || aliases[0] || "메모";
    const intro = opts.intro || "";
    const { start, end, lines } = findSectionRange(content, aliases);

    if (start >= 0) {
      const head = lines.slice(0, start + 1);
      const kept = [];
      for (let i = start + 1; i < end; i += 1) {
        if (isTemplatePlaceholderBullet(lines[i])) continue;
        kept.push(lines[i]);
      }
      while (kept.length && clean(kept[kept.length - 1]) === "") kept.pop();
      kept.push(bullet);
      kept.push("");
      return head.concat(kept).concat(lines.slice(end)).join("\n");
    }

    const full = String(content || "").replace(/\r\n/g, "\n");
    const blockLines = ["", `# ${sectionTitle}`];
    if (intro) blockLines.push(intro);
    blockLines.push(bullet, "");
    const block = blockLines.join("\n");
    const anchor = full.search(/^#\s+연결된 Object\s*$/m);
    if (anchor >= 0) {
      return `${full.slice(0, anchor).replace(/\s+$/, "")}\n${block}\n${full.slice(anchor)}`;
    }
    // Prefer insert before 나의 성찰 / 첨부 when creating 메모
    const softAnchors = [/^#\s+나의 성찰\s*$/m, /^#\s+My Reflection\s*$/m, /^#\s+첨부\s*$/m];
    for (let i = 0; i < softAnchors.length; i += 1) {
      const m = full.search(softAnchors[i]);
      if (m >= 0) {
        return `${full.slice(0, m).replace(/\s+$/, "")}\n${block}\n${full.slice(m)}`;
      }
    }
    return `${full.replace(/\s+$/, "")}\n${block}\n`;
  }

  /**
   * Insert a formatted interaction line under # 핵심 상호작용.
   */
  function appendInteractionToContent(content, line) {
    return appendLineToSection(content, {
      line,
      aliases: INTERACTION_SECTION_ALIASES,
      sectionTitle: INTERACTION_SECTION,
      intro: "*인덱스만 남깁니다. 원본 노트 본문을 복사하지 않습니다.*",
      emptyError: "추가할 사건 줄이 비어 있습니다."
    });
  }

  /**
   * Format a factual note line under # 메모 (not a dated event index).
   */
  function formatMemoLine(input) {
    const text = clean(input && (input.text || input.note || input.memo || input.insight));
    if (!text) throw new Error("메모 내용을 입력해 주세요.");
    return text.startsWith("-") ? text : `- ${text}`;
  }

  /**
   * Insert under # 메모 — long-term factual context, not interaction timeline.
   */
  function appendMemoToContent(content, line) {
    return appendLineToSection(content, {
      line,
      aliases: NOTES_SECTION_ALIASES,
      sectionTitle: NOTES_SECTION,
      intro: "*사실 중심의 장기 맥락.*",
      emptyError: "추가할 메모 줄이 비어 있습니다."
    });
  }

  /**
   * Optionally set last_contact in frontmatter text when appending an interaction.
   */
  function upsertLastContactInContent(content, dateIso) {
    const day = normalizeIsoDate(dateIso);
    if (!String(content || "").startsWith("---")) return content;
    const end = content.indexOf("\n---", 3);
    if (end === -1) return content;
    let raw = content.slice(3, end).replace(/^\n/, "");
    const body = content.slice(end + 4);
    if (/^last_contact:\s*/m.test(raw)) {
      raw = raw.replace(/^last_contact:\s*.*$/m, `last_contact: ${day}`);
    } else {
      raw = `${raw.replace(/\s+$/, "")}\nlast_contact: ${day}`;
    }
    return `---\n${raw.replace(/^\n/, "")}\n---${body.startsWith("\n") ? body : `\n${body}`}`;
  }

  // ---------------------------------------------------------------------------
  // People Workspace (Personal Hub) — pure list/search/context helpers
  // ---------------------------------------------------------------------------

  const WORKSPACE_FILTERS = Object.freeze([
    Object.freeze({ id: "all", label: "전체" }),
    Object.freeze({ id: "relationship", label: "관계" }),
    Object.freeze({ id: "company", label: "회사" }),
    Object.freeze({ id: "recent_link", label: "최근 연결" })
  ]);

  const TYPE_LABELS = Object.freeze({
    project: "프로젝트",
    project_note: "프로젝트",
    project_family: "프로젝트",
    auction_case: "경매",
    auction: "경매",
    journal: "저널",
    reading: "독서",
    reading_session: "독서",
    other: "기타",
    unknown: "기록"
  });

  function typeLabel(type) {
    const t = clean(type).toLowerCase();
    return TYPE_LABELS[t] || TYPE_LABELS.unknown;
  }

  function normalizeKey(value) {
    let text = clean(value);
    // Strip wikilink wrappers: [[Name|Alias]] → Name
    const wiki = text.match(/^\[\[([^\]|#]+)/);
    if (wiki) text = clean(wiki[1]);
    text = text.replace(/\.md$/i, "").replace(/\\/g, "/");
    // Prefer basename for vault paths so "folder/Name" matches "Name"
    if (text.includes("/")) {
      const base = text.split("/").pop();
      // Keep both full path and basename registered by callers; here return full path form.
      // Callers matching names use basename keys separately.
      return text.toLowerCase();
    }
    return text.toLowerCase();
  }

  function mtimeMs(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
    if (typeof value === "object") {
      if (typeof value.toMillis === "function") {
        try {
          const ms = value.toMillis();
          if (Number.isFinite(ms)) return ms;
        } catch (_e) { /* ignore */ }
      }
      if (typeof value.ts === "number") return value.ts;
    }
    const text = clean(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const d = new Date(text.slice(0, 10) + "T00:00:00");
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  /**
   * Normalize a People/contact page for workspace rendering.
   * Does NOT treat file mtime as contact time.
   */
  function normalizePersonRecord(raw) {
    const source = raw || {};
    const path = clean(source.path || (source.file && source.file.path) || "");
    const name = clean(
      source.name
      || source.title
      || (source.file && (source.file.name || source.file.basename))
      || path.split("/").pop()
    ).replace(/\.md$/i, "");
    const type = clean(source.type).toLowerCase();
    const relationship = clean(source.relationship);
    const company = clean(source.company);
    const role = clean(source.role) || (type === "contact" ? clean(source.title) : "");
    const lastContact = clean(source.last_contact);
    // Explicit only — never invent from mtime
    const lastContactExplicit = /^\d{4}-\d{2}-\d{2}/.test(lastContact)
      ? lastContact.slice(0, 10)
      : (lastContact || "");
    const body = clean(source.body || source.content || "");
    const isLegacy = type === LEGACY_TYPE;

    return {
      path,
      name,
      type: isLegacy ? LEGACY_TYPE : (type || CANONICAL_TYPE),
      is_legacy: isLegacy,
      relationship,
      company,
      role,
      last_contact: lastContactExplicit,
      body,
      // search blob (not displayed as contact time)
      search_text: [name, relationship, company, role, lastContactExplicit, body].join("\n").toLowerCase()
    };
  }

  function matchPeopleSearch(person, query) {
    const q = clean(query).toLowerCase();
    if (!q) return true;
    const p = person && person.search_text
      ? person
      : normalizePersonRecord(person);
    return String(p.search_text || "").includes(q);
  }

  /**
   * Extract path/name hints from a source page for link matching.
   */
  function extractPageRefs(page) {
    const refs = [];
    const source = page || {};
    const connections = source.connections;
    if (Array.isArray(connections)) {
      connections.forEach((c) => {
        const t = clean(c);
        if (t) refs.push(t);
      });
    } else if (connections != null) {
      const t = clean(connections);
      if (t) refs.push(t);
    }
    const outlinks = source.outlinks;
    if (Array.isArray(outlinks)) {
      outlinks.forEach((o) => {
        if (o == null) return;
        if (typeof o === "object") {
          refs.push(clean(o.path || o.file || o.link || o));
        } else {
          refs.push(clean(o));
        }
      });
    }
    const body = clean(source.body || source.content);
    const re = /\[\[([^\]|#]+)/g;
    let m;
    while ((m = re.exec(body))) {
      refs.push(clean(m[1]));
    }
    // also scan string form of connections for [[wikilinks]]
    if (typeof connections === "string") {
      let m2;
      const re2 = /\[\[([^\]|#]+)/g;
      while ((m2 = re2.exec(connections))) refs.push(clean(m2[1]));
    }
    return refs.map(normalizeKey).filter(Boolean);
  }

  function linkedItemFromPage(page) {
    const path = clean(page && page.path).replace(/\\/g, "/");
    const type = clean(page && page.type).toLowerCase() || "unknown";
    const title = clean(page && page.title)
      || path.split("/").pop().replace(/\.md$/i, "");
    const mtime = mtimeMs(page && (page.mtime || page.updated || (page.file && page.file.mtime)));
    let bucket = "other";
    if (type === "project" || type === "project_note" || type === "project_family") bucket = "project";
    else if (type === "auction_case" || type === "auction") bucket = "auction_case";
    else if (type === "journal" || path.includes("DAILY/DAILY/")) bucket = "journal";
    else if (type === "reading" || type === "reading_session") bucket = "reading";
    return {
      path,
      type: type || "unknown",
      bucket,
      title,
      type_label: typeLabel(type === "journal" || path.includes("DAILY/DAILY/") ? "journal" : type),
      mtime,
      // Safer label: related context, not confirmed interaction
      relation_label: "관련 기록"
    };
  }

  /**
   * One-pass index: person path → linked Objects.
   * O(people + pages + refs), not O(people × pages).
   */
  function buildPeopleLinkIndex(people, pages) {
    const list = (people || []).map((p) => (p.search_text ? p : normalizePersonRecord(p)));
    const byPath = Object.create(null);
    const nameToPaths = Object.create(null);

    list.forEach((person) => {
      const path = clean(person.path).replace(/\\/g, "/");
      if (!path) return;
      byPath[path] = [];
      const keys = [
        normalizeKey(path),
        normalizeKey(person.name),
        normalizeKey(path.split("/").pop())
      ];
      keys.forEach((k) => {
        if (!k) return;
        if (!nameToPaths[k]) nameToPaths[k] = [];
        if (nameToPaths[k].indexOf(path) === -1) nameToPaths[k].push(path);
      });
    });

    (pages || []).forEach((page) => {
      if (!page) return;
      const pagePath = clean(page.path).replace(/\\/g, "/");
      if (!pagePath || byPath[pagePath]) return; // skip people notes themselves
      const item = linkedItemFromPage(Object.assign({}, page, { path: pagePath }));
      const refs = extractPageRefs(page);
      const hitPaths = Object.create(null);
      refs.forEach((ref) => {
        const key = normalizeKey(ref);
        if (!key) return;
        // Match full path key or basename key
        const candidates = [key];
        if (key.includes("/")) candidates.push(key.split("/").pop());
        candidates.forEach((k) => {
          const paths = nameToPaths[k];
          if (!paths) return;
          paths.forEach((pp) => { hitPaths[pp] = true; });
        });
      });
      Object.keys(hitPaths).forEach((pp) => {
        if (!byPath[pp]) return;
        // de-dupe by linked path
        if (byPath[pp].some((x) => x.path === item.path)) return;
        byPath[pp].push(item);
      });
    });

    // Sort each list by mtime desc
    Object.keys(byPath).forEach((pp) => {
      byPath[pp].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    });

    return byPath;
  }

  function recentContextForPerson(personPath, linkIndex, limit) {
    const max = Math.max(1, Math.min(Number(limit) || 3, 5));
    const list = (linkIndex && linkIndex[clean(personPath).replace(/\\/g, "/")]) || [];
    return list.slice(0, max);
  }

  function enrichPersonWithContext(person, linkIndex, options) {
    const p = person && person.search_text ? person : normalizePersonRecord(person);
    const opts = options || {};
    const max = opts.maxPreview != null ? opts.maxPreview : 3;
    const linked = (linkIndex && linkIndex[p.path]) || [];
    const recent = linked.slice(0, max);
    const latestMtime = linked.length ? (linked[0].mtime || 0) : 0;
    return Object.assign({}, p, {
      linked_count: linked.length,
      linked_all: linked,
      recent_context: recent,
      latest_link_mtime: latestMtime,
      meta_line: [p.relationship, p.company, p.role].filter(Boolean).join(" · ")
    });
  }

  /**
   * Filter + search people for workspace.
   * filterId: all | relationship | company | recent_link
   */
  function filterPeopleList(people, options) {
    const opts = options || {};
    const query = clean(opts.query);
    const filterId = clean(opts.filter || opts.filterId || "all") || "all";
    let list = (people || []).slice();

    if (query) {
      list = list.filter((p) => matchPeopleSearch(p, query));
    }

    if (filterId === "relationship") {
      list = list.filter((p) => clean(p.relationship));
    } else if (filterId === "company") {
      list = list.filter((p) => clean(p.company));
    } else if (filterId === "recent_link") {
      list = list.filter((p) => (p.linked_count || (p.linked_all && p.linked_all.length) || 0) > 0);
    }

    return list;
  }

  /**
   * Sort: canonical people before legacy; then last_contact date desc if present;
   * then latest linked mtime; then name. Never treats file mtime as contact.
   */
  function sortPeopleList(people) {
    return (people || []).slice().sort((a, b) => {
      const legA = a.is_legacy || a.type === LEGACY_TYPE ? 1 : 0;
      const legB = b.is_legacy || b.type === LEGACY_TYPE ? 1 : 0;
      if (legA !== legB) return legA - legB;
      const lcA = clean(a.last_contact);
      const lcB = clean(b.last_contact);
      if (lcA && lcB && lcA !== lcB) return lcB.localeCompare(lcA);
      if (lcA && !lcB) return -1;
      if (!lcA && lcB) return 1;
      const lmA = a.latest_link_mtime || 0;
      const lmB = b.latest_link_mtime || 0;
      if (lmA !== lmB) return lmB - lmA;
      return clean(a.name).localeCompare(clean(b.name), "ko");
    });
  }

  /**
   * Split note into frontmatter + body.
   */
  function splitFrontmatter(content) {
    const text = String(content || "").replace(/\r\n/g, "\n");
    if (!text.startsWith("---")) {
      return { frontmatterRaw: "", body: text, data: {} };
    }
    const end = text.indexOf("\n---", 3);
    if (end === -1) {
      return { frontmatterRaw: "", body: text, data: {} };
    }
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
    return { frontmatterRaw: raw, body, data };
  }

  /**
   * Parse People body into H1 sections for readable preview.
   * Returns [{ title, body, isEmpty }]
   */
  function parsePeopleBodySections(body) {
    const text = String(body || "").replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    const sections = [];
    let current = null;

    function pushCurrent() {
      if (!current) return;
      const bodyText = current.lines.join("\n").replace(/^\n+|\n+$/g, "");
      const plain = bodyText
        .replace(/\*[^*]+\*/g, "")
        .replace(/^[-*]\s*$/gm, "")
        .replace(/YYYY-MM-DD/g, "")
        .replace(/\[\[원본 Object\]\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      // dataview blocks count as content
      const hasCode = /```/.test(bodyText);
      const isEmpty = !hasCode && plain.length < 2;
      sections.push({
        title: current.title,
        body: bodyText,
        isEmpty
      });
    }

    lines.forEach((line) => {
      const h1 = line.match(/^#\s+(.+?)\s*$/);
      if (h1) {
        pushCurrent();
        current = { title: h1[1].trim(), lines: [] };
        return;
      }
      if (!current) {
        // preamble before first H1 (e.g. leftover title)
        if (clean(line)) {
          current = { title: "", lines: [line] };
        }
        return;
      }
      current.lines.push(line);
    });
    pushCurrent();

    // Skip pure technical dataview "연결된 Object" bulk in preview? Keep but mark.
    return sections.filter((s) => s.title || clean(s.body));
  }

  /**
   * Build a read-model for person preview modal.
   */
  function buildPersonPreviewModel(path, content) {
    const filePath = clean(path);
    const name = filePath.split("/").pop().replace(/\.md$/i, "");
    const split = splitFrontmatter(content);
    const person = normalizePersonRecord(Object.assign({
      path: filePath,
      name,
      body: split.body
    }, split.data));
    const sections = parsePeopleBodySections(split.body);
    // Prefer human narrative sections first in display order
    const preferred = [
      "관계", "Relationship",
      "소통 방식", "Communication Style",
      "배운 점", "Things I Learned",
      "핵심 상호작용", "Key Interactions",
      "메모", "Notes",
      "나의 성찰", "My Reflection",
      "AI 요약", "AI Summary",
      "첨부", "Attachments",
      "연결된 Object"
    ];
    const rank = (title) => {
      const i = preferred.findIndex((t) => t.toLowerCase() === clean(title).toLowerCase());
      return i === -1 ? 100 + clean(title).charCodeAt(0) : i;
    };
    sections.sort((a, b) => rank(a.title) - rank(b.title));

    return {
      path: filePath,
      name: person.name || name,
      person,
      properties: pickQuickEditValues(split.data),
      meta_line: [person.relationship, person.company, person.role].filter(Boolean).join(" · "),
      last_contact: person.last_contact,
      is_legacy: person.is_legacy,
      sections,
      body: split.body,
      content: String(content || "")
    };
  }

  /**
   * Build full workspace model from raw people pages + source pages.
   */
  function buildPeopleWorkspaceModel(rawPeople, sourcePages, options) {
    const opts = options || {};
    const people = (rawPeople || []).map(normalizePersonRecord).filter((p) => p.path);
    const linkIndex = buildPeopleLinkIndex(people, sourcePages || []);
    const enriched = people.map((p) => enrichPersonWithContext(p, linkIndex, {
      maxPreview: opts.maxPreview != null ? opts.maxPreview : 3
    }));
    const filtered = filterPeopleList(enriched, {
      query: opts.query,
      filter: opts.filter
    });
    const sorted = sortPeopleList(filtered);
    return {
      people: sorted,
      total: people.length,
      shown: sorted.length,
      query: clean(opts.query),
      filter: clean(opts.filter || "all") || "all",
      linkIndex,
      filters: WORKSPACE_FILTERS,
      empty: people.length === 0,
      no_match: people.length > 0 && sorted.length === 0
    };
  }

  const api = {
    CANONICAL_TYPE,
    LEGACY_TYPE,
    PEOPLE_FOLDER,
    PEOPLE_TEMPLATE,
    DISPLAY_LABEL,
    LINK_FIELD,
    QUICK_EDIT_FIELDS,
    INTERACTION_SECTION,
    INTERACTION_SECTION_ALIASES,
    NOTES_SECTION,
    NOTES_SECTION_ALIASES,
    LINKED_OBJECT_TYPES,
    clean,
    isPeopleType,
    isLegacyContactType,
    isPeopleOrLegacy,
    safeName,
    peoplePath,
    isUnderPeopleFolder,
    renderPeopleContent,
    resolveCreatePath,
    classifyPeopleType,
    discoverLinkedObjects,
    pickQuickEditValues,
    applyQuickEditValues,
    sanitizeQuickEditUpdates,
    todayIso,
    normalizeIsoDate,
    formatInteractionLine,
    formatMemoLine,
    appendInteractionToContent,
    appendMemoToContent,
    appendLineToSection,
    findSectionRange,
    findInteractionSectionRange,
    findNotesSectionRange,
    upsertLastContactInContent,
    WORKSPACE_FILTERS,
    TYPE_LABELS,
    typeLabel,
    normalizeKey,
    mtimeMs,
    normalizePersonRecord,
    matchPeopleSearch,
    extractPageRefs,
    buildPeopleLinkIndex,
    recentContextForPerson,
    enrichPersonWithContext,
    filterPeopleList,
    sortPeopleList,
    buildPeopleWorkspaceModel,
    splitFrontmatter,
    parsePeopleBodySections,
    buildPersonPreviewModel
  };

  root.PeopleCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
