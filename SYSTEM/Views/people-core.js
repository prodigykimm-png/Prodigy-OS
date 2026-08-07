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
   * relationship = short category only (지인/회사/…). Detail stays in body `# 관계`.
   */
  const QUICK_EDIT_FIELDS = Object.freeze([
    "relationship",
    "company",
    "role",
    "last_contact",
    "phone",
    "email"
  ]);

  /**
   * Fixed short labels for frontmatter `relationship`.
   * Free-form narrative (동기, 어떻게 만났는지 등) belongs in the body section, not here.
   */
  const RELATIONSHIP_TYPES = Object.freeze([
    "가족",
    "친구",
    "지인",
    "회사",
    "학교",
    "업무",
    "커뮤니티",
    "기타"
  ]);

/**
 * Venue(장소) — shared schema constants.
 * Venue is a first-class Object just like people. These constants are the single
 * source of truth for venue frontmatter keys and required headings; venue-creator.js
 * imports them so the two never drift.
 */
const VENUE_TYPE = "venue";
const VENUE_FOLDER = "PARA/RESOURCES/Venues";
const VENUE_TEMPLATE = "SYSTEM/TEMPLATE/FORMAT/template_venue.md";
const VENUE_FRONTMATTER_KEYS = Object.freeze([
  "type",
  "venue_category",
  "address",
  "connections",
  "created",
  "updated"
]);
const VENUE_REQUIRED_HEADINGS = Object.freeze([
  "소개",
  "방문 정보",
  "메모",
  "관련 지식",
  "관련 저널"
]);
const VENUE_CATEGORY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function isKnownVenueCategory(value) {
  return VENUE_CATEGORY_PATTERN.test(clean(value));
}

  function isKnownRelationshipType(value) {
    return RELATIONSHIP_TYPES.indexOf(clean(value)) !== -1;
  }

  /**
   * Keep known categories as-is. Leave legacy free-text readable (do not auto-rewrite notes).
   */
  function normalizeRelationshipType(value) {
    return clean(value);
  }

  const LINKED_OBJECT_TYPES = Object.freeze({
    project: Object.freeze({ type: "project", label: "프로젝트" }),
    auction_case: Object.freeze({ type: "auction_case", label: "경매" }),
    journal: Object.freeze({ type: "journal", label: "저널" }),
    reading: Object.freeze({ type: "reading", label: "독서" })
  });

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  const HANGUL_COMPAT_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const HANGUL_COMPAT_MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const HANGUL_COMPAT_FINALS = [
    "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ",
    "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
  ];

  /**
   * Compose a raw two-beolsik compatibility-jamo run (ㄱㅏㅇ) for matching.
   * Obsidian/Electron can surface this form during Korean input even before
   * the IME exposes a completed syllable (강).
   */
  function composeHangulCompatJamo(value) {
    const text = String(value == null ? "" : value);
    let output = "";
    let index = 0;
    while (index < text.length) {
      const lead = HANGUL_COMPAT_INITIALS.indexOf(text[index]);
      const medial = HANGUL_COMPAT_MEDIALS.indexOf(text[index + 1]);
      if (lead < 0 || medial < 0) {
        output += text[index];
        index += 1;
        continue;
      }

      index += 2;
      let final = 0;
      const possibleFinal = HANGUL_COMPAT_FINALS.indexOf(text[index]);
      const nextIsMedial = HANGUL_COMPAT_MEDIALS.indexOf(text[index + 1]) >= 0;
      if (possibleFinal > 0 && !nextIsMedial) {
        final = possibleFinal;
        index += 1;
      }
      output += String.fromCharCode(0xAC00 + ((lead * 21 + medial) * 28) + final);
    }
    return output;
  }

  /**
   * Search must treat macOS/iCloud NFD filenames, Korean IME NFC input, and
   * raw compatibility jamo alike. Keep this scoped to matching: paths and
   * note content stay byte-for-byte untouched.
   */
  function normalizeSearchText(value) {
    return composeHangulCompatJamo(clean(value)).normalize("NFC").toLowerCase();
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

  /**
   * Honorifics / role titles must never be part of a People Object name.
   * Role belongs in frontmatter `role` (or body), not the filename / [[wikilink]].
   * Longer tokens first so "대표님" wins over "대표" / "님".
   */
  const PERSON_HONORIFIC_TOKENS = Object.freeze([
    "선생님", "대표님", "사장님", "부장님", "과장님", "대리님", "팀장님",
    "실장님", "이사님", "상무님", "전무님", "회장님", "원장님", "소장님",
    "교수님", "박사님", "매니저님",
    "대표", "사장", "부장", "과장", "대리", "팀장", "실장", "이사", "상무",
    "전무", "회장", "원장", "소장", "교수", "박사", "선생", "매니저",
    "님", "씨", "군", "양",
    "CEO", "CTO", "CFO", "COO", "CMO", "PM"
  ].slice().sort((a, b) => b.length - a.length));

  /**
   * Strip role/honorific tokens so only the personal name remains.
   * - "최진웅 대표" → "최진웅"
   * - "정호성님" → "정호성"
   * - "김대리" (no separable full name) stays "김대리" — remaining must be ≥ 2 chars when attached
   */
  function stripPersonHonorifics(value) {
    let s = clean(value);
    if (!s) return s;

    s = s.replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, "");

    let changed = true;
    let guard = 0;
    while (changed && guard < 8) {
      changed = false;
      guard += 1;
      for (let i = 0; i < PERSON_HONORIFIC_TOKENS.length; i++) {
        const tok = PERSON_HONORIFIC_TOKENS[i];
        const reSpace = new RegExp("\\s+" + escapeRegExp(tok) + "$", "i");
        if (reSpace.test(s)) {
          const next = s.replace(reSpace, "").trim();
          if (next) {
            s = next;
            changed = true;
            break;
          }
        }
        const reAttach = new RegExp(escapeRegExp(tok) + "$", "i");
        if (reAttach.test(s) && s.length > tok.length) {
          const next = s.slice(0, s.length - tok.length).replace(/\s+$/g, "").trim();
          // Keep nicknames like "김대리": do not leave a 1-character stump.
          if (next.length >= 2) {
            s = next;
            changed = true;
            break;
          }
        }
      }
    }
    return s;
  }

  function safeName(value) {
    let name = clean(value)
      .replace(/[\\/:*?"<>|#[\]^]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    name = stripPersonHonorifics(name)
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
      if (key === "relationship") {
        out[key] = normalizeRelationshipType(updates[key]);
        return;
      }
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

  /**
   * Format one 사람 insight line for # 핵심 상호작용.
   * Only the insight (통찰) — no date, no link.
   * 최근 맥락 (역링크) already shows date and source, so roles do not overlap.
   */
  function formatPeopleInsightLine(input) {
    const raw = clean(input && (input.insight || input.note || input.summary || input.text));
    if (!raw) throw new Error("사람 통찰 내용을 입력해 주세요.");
    return raw.startsWith("-") ? raw : `- ${raw}`;
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
   * Insert a people insight line under # 핵심 상호작용.
   * 통찰만 기록 — 날짜/Object 링크 없음 (최근 맥락이 대체).
   */
  function appendPeopleInteractionToContent(content, line) {
    return appendLineToSection(content, {
      line,
      aliases: INTERACTION_SECTION_ALIASES,
      sectionTitle: INTERACTION_SECTION,
      intro: "*통찰만 기록합니다. 날짜와 출처는 최근 맥락(역링크)이 대체합니다.*",
      emptyError: "추가할 사람 통찰 줄이 비어 있습니다."
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

  function normalizeMemoLineKey(line) {
    return clean(line).replace(/^[-*•]\s+/, "").replace(/^[-*•]$/, "");
  }

  function isGuidanceItalicLine(key) {
    return /^\*[^*].*\*$/.test(key)
      && /둡니다|사실 중심|장기 맥락|인덱스|형식:|원본 노트|금지|Store only|Capture|never/i.test(key);
  }

  /**
   * Remove one bullet from an H1 section range.
   * target: string | number | { text|line|index }
   */
  function removeBulletFromSection(content, aliases, target, options) {
    const opts = options || {};
    const label = opts.label || "항목";
    const range = findSectionRange(content, aliases);
    if (range.start < 0) {
      throw new Error(`${label} 섹션을 찾을 수 없습니다.`);
    }

    let targetIndex = -1;
    let targetKey = "";
    if (typeof target === "number" && Number.isFinite(target)) {
      targetIndex = Math.max(0, Math.floor(target));
    } else if (target && typeof target === "object") {
      if (target.index != null && target.index !== "") {
        targetIndex = Math.max(0, Math.floor(Number(target.index)));
      }
      targetKey = normalizeMemoLineKey(target.text || target.line || target.memo || target.insight || "");
    } else {
      targetKey = normalizeMemoLineKey(target);
    }
    if (targetIndex < 0 && !targetKey) {
      throw new Error(`삭제할 ${label}을(를) 지정해 주세요.`);
    }

    const { start, end, lines } = range;
    let ordinal = -1;
    let removeAt = -1;
    for (let i = start + 1; i < end; i += 1) {
      const raw = lines[i];
      if (isTemplatePlaceholderBullet(raw)) continue;
      const key = normalizeMemoLineKey(raw);
      if (!key) continue;
      if (isGuidanceItalicLine(key)) continue;
      ordinal += 1;
      if (targetIndex >= 0) {
        if (ordinal === targetIndex) {
          removeAt = i;
          break;
        }
      } else if (key === targetKey) {
        removeAt = i;
        break;
      }
    }
    if (removeAt < 0) {
      throw new Error(`삭제할 ${label}을(를) 찾지 못했습니다.`);
    }

    const removedKey = normalizeMemoLineKey(lines[removeAt]);
    const nextLines = lines.slice(0, removeAt).concat(lines.slice(removeAt + 1));
    const next = nextLines.join("\n").replace(/\n{3,}/g, "\n\n");
    return { content: next, removed: removedKey, index: ordinal };
  }

  function removeMemoLineFromContent(content, target) {
    return removeBulletFromSection(content, NOTES_SECTION_ALIASES, target, { label: "메모" });
  }

  function removeInteractionLineFromContent(content, target) {
    return removeBulletFromSection(content, INTERACTION_SECTION_ALIASES, target, { label: "사건" });
  }

  /**
   * Extract bullet lines from a named section (memo / interaction).
   */
  function extractSectionBulletLines(contentOrBody, aliases, options) {
    const opts = options || {};
    const max = opts.max != null ? Math.max(0, Number(opts.max) || 0) : 0;
    const text = String(contentOrBody || "").replace(/\r\n/g, "\n");
    if (!text.trim()) return [];

    let sectionBody = "";
    const range = findSectionRange(text, aliases);
    if (range.start >= 0) {
      sectionBody = range.lines.slice(range.start + 1, range.end).join("\n");
    } else {
      const body = text.startsWith("---") ? splitFrontmatter(text).body : text;
      const range2 = findSectionRange(body, aliases);
      if (range2.start >= 0) {
        sectionBody = range2.lines.slice(range2.start + 1, range2.end).join("\n");
      } else {
        const parsed = parsePeopleBodySections(body);
        const hit = parsed.find((s) => {
          const t = clean(s.title).toLowerCase();
          return (aliases || []).some((a) => a.toLowerCase() === t);
        });
        sectionBody = hit ? String(hit.body || hit.displayBody || "") : "";
      }
    }

    const cleaned = cleanPreviewBodyText(stripDataviewBlocks(sectionBody));
    const lines = cleaned
      .split("\n")
      .map((line) => clean(line).replace(/^[-*•]\s+/, "").replace(/^[-*•]$/, ""))
      .filter((line) => {
        if (!line) return false;
        if (isTemplatePlaceholderBullet(`- ${line}`) || isTemplatePlaceholderBullet(line)) return false;
        if (isGuidanceItalicLine(line) || (/^\*[^*].*\*$/.test(line) && /둡니다|사실 중심|장기 맥락|인덱스/i.test(line))) {
          return false;
        }
        return true;
      });

    if (max > 0) return lines.slice(0, max);
    return lines;
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

  /** Filters aligned with relationship short categories (+ 미분류 / 연결 / 레거시). */
  const WORKSPACE_FILTERS = Object.freeze(
    [
      Object.freeze({ id: "all", label: "전체" })
    ].concat(
      RELATIONSHIP_TYPES.map((t) => Object.freeze({ id: t, label: t })),
      [
        Object.freeze({ id: "unset", label: "미분류" }),
        Object.freeze({ id: "recent_link", label: "연결 있음" }),
        Object.freeze({ id: "legacy", label: "레거시" }),
        Object.freeze({ id: "no_contact", label: "연락일 없음" })
      ]
    )
  );

  /**
   * Sorts: 가나다, 손볼 사람 (last_contact empty first then oldest — never invents dates).
   */
  const WORKSPACE_SORTS = Object.freeze([
    Object.freeze({ id: "name_asc", label: "가나다 ↑" }),
    Object.freeze({ id: "name_desc", label: "가나다 ↓" }),
    Object.freeze({ id: "attention", label: "손볼 사람" })
  ]);

  const CONTEXT_TYPE_FILTERS = Object.freeze([
    Object.freeze({ id: "all", label: "전체" }),
    Object.freeze({ id: "project", label: "프로젝트" }),
    Object.freeze({ id: "journal", label: "저널" }),
    Object.freeze({ id: "auction_case", label: "경매" }),
    Object.freeze({ id: "reading", label: "독서" }),
    Object.freeze({ id: "other", label: "기타" })
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

  function extractMemoLines(contentOrBody, options) {
    return extractSectionBulletLines(contentOrBody, NOTES_SECTION_ALIASES, options);
  }

  function extractInteractionLines(contentOrBody, options) {
    return extractSectionBulletLines(contentOrBody, INTERACTION_SECTION_ALIASES, options);
  }

  /**
   * Why a person matched search (for dashboard hints). Deterministic field scan only.
   */
  function getSearchMatchHints(person, query) {
    const q = normalizeSearchText(query);
    if (!q) return [];
    const p = person && person.search_text ? person : normalizePersonRecord(person);
    const hints = [];
    if (normalizeSearchText(p.name).includes(q)) hints.push("이름");
    if (normalizeSearchText(p.relationship).includes(q)) hints.push("구분");
    if (normalizeSearchText(p.company).includes(q)) hints.push("소속");
    if (normalizeSearchText(p.role).includes(q)) hints.push("역할");
    if ((p.memo_lines || []).some((l) => normalizeSearchText(l).includes(q))) hints.push("메모");
    if ((p.interaction_lines || []).some((l) => normalizeSearchText(l).includes(q))) hints.push("사건");
    if (!hints.length && String(p.search_text || "").includes(q)) hints.push("본문");
    return hints;
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
    const body = String(source.body || source.content || "");
    const isLegacy = type === LEGACY_TYPE;

    // Prefer pre-extracted lines; else parse from body/content
    const memoLines = Array.isArray(source.memo_lines)
      ? source.memo_lines.map(clean).filter(Boolean)
      : extractMemoLines(body);
    const interactionLines = Array.isArray(source.interaction_lines)
      ? source.interaction_lines.map(clean).filter(Boolean)
      : extractInteractionLines(body);
    const memoPreviewMax = source.memo_preview_max != null ? Number(source.memo_preview_max) : 3;
    const interactionPreviewMax = source.interaction_preview_max != null
      ? Number(source.interaction_preview_max)
      : 2;
    const memoPreview = memoLines.slice(0, Math.max(1, memoPreviewMax || 3));
    const interactionPreview = interactionLines.slice(0, Math.max(1, interactionPreviewMax || 2));
    const relationshipNeedsClassify = !!(relationship && !isKnownRelationshipType(relationship));

    return {
      path,
      name,
      type: isLegacy ? LEGACY_TYPE : (type || CANONICAL_TYPE),
      is_legacy: isLegacy,
      relationship,
      company,
      role,
      last_contact: lastContactExplicit,
      body: clean(body),
      memo_lines: memoLines,
      memo_preview: memoPreview,
      memo_count: memoLines.length,
      interaction_lines: interactionLines,
      interaction_preview: interactionPreview,
      interaction_count: interactionLines.length,
      relationship_needs_classify: relationshipNeedsClassify,
      // search blob (not displayed as contact time)
      search_text: [
        name,
        relationship,
        company,
        role,
        lastContactExplicit,
        memoLines.join("\n"),
        interactionLines.join("\n"),
        clean(body)
      ].join("\n").normalize("NFC").toLowerCase()
    };
  }

  function matchPeopleSearch(person, query) {
    const q = normalizeSearchText(query);
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
   * filterId: all | 가족|친구|지인|회사|학교|업무|커뮤니티|기타 | unset | recent_link
   * (legacy: relationship = any set, company = has company)
   */
  function filterPeopleList(people, options) {
    const opts = options || {};
    const query = clean(opts.query);
    const filterId = clean(opts.filter || opts.filterId || "all") || "all";
    let list = (people || []).slice();

    if (query) {
      list = list.filter((p) => matchPeopleSearch(p, query));
    }

    if (filterId === "all" || !filterId) {
      return list;
    }
    if (filterId === "unset" || filterId === "미분류") {
      // Empty or free-text not in category chips
      list = list.filter((p) => {
        const rel = clean(p.relationship);
        return !rel || !isKnownRelationshipType(rel);
      });
      return list;
    }
    if (filterId === "recent_link" || filterId === "연결") {
      list = list.filter((p) => (p.linked_count || (p.linked_all && p.linked_all.length) || 0) > 0);
      return list;
    }
    if (filterId === "legacy" || filterId === "레거시") {
      list = list.filter((p) => p.is_legacy || p.type === LEGACY_TYPE);
      return list;
    }
    if (filterId === "no_contact" || filterId === "연락일 없음") {
      // Explicit empty only — never invent last_contact from mtime
      list = list.filter((p) => !clean(p.last_contact));
      return list;
    }
    // Legacy filters
    if (filterId === "relationship") {
      list = list.filter((p) => clean(p.relationship));
      return list;
    }
    if (filterId === "company") {
      list = list.filter((p) => clean(p.company));
      return list;
    }
    // Relationship category chip (가족, 회사, …)
    if (isKnownRelationshipType(filterId)) {
      list = list.filter((p) => clean(p.relationship) === filterId);
      return list;
    }

    return list;
  }

  function emptyFilterHint(filterId, query) {
    const f = clean(filterId || "all") || "all";
    const q = clean(query);
    if (q) return `「${q}」와 일치하는 사람이 없습니다. 검색어를 줄이거나 구분 필터를 전체로 바꿔 보세요.`;
    if (f === "unset") return "미분류가 없습니다. 구분 칩이 비어 있거나 예전 자유 입력 값만 여기에 모입니다.";
    if (f === "legacy") return "레거시 type: contact 노트가 없습니다.";
    if (f === "no_contact") return "최근 연락일이 비어 있는 사람이 없습니다.";
    if (f === "recent_link") return "연결된 원본 기록이 있는 사람이 없습니다.";
    if (isKnownRelationshipType(f)) return `구분「${f}」인 사람이 없습니다. 팝업에서 구분을 지정해 보세요.`;
    return "일치하는 사람이 없습니다.";
  }

  /**
   * Sort people list.
   * sort: name_asc | name_desc | attention | recent
   */
  function sortPeopleList(people, options) {
    const sortId = clean((options && (options.sort || options.sortId)) || "name_asc") || "name_asc";
    const list = (people || []).slice();

    if (sortId === "name_desc" || sortId === "desc") {
      return list.sort((a, b) => clean(b.name).localeCompare(clean(a.name), "ko"));
    }
    if (sortId === "name_asc" || sortId === "asc" || sortId === "가나다") {
      return list.sort((a, b) => clean(a.name).localeCompare(clean(b.name), "ko"));
    }
    if (sortId === "attention" || sortId === "손볼") {
      // Empty last_contact first, then oldest explicit date, then name. Never invent dates.
      return list.sort((a, b) => {
        const lcA = clean(a.last_contact);
        const lcB = clean(b.last_contact);
        const emptyA = lcA ? 1 : 0;
        const emptyB = lcB ? 1 : 0;
        if (emptyA !== emptyB) return emptyA - emptyB; // empty (0) first
        if (lcA && lcB && lcA !== lcB) return lcA.localeCompare(lcB); // oldest first
        return clean(a.name).localeCompare(clean(b.name), "ko");
      });
    }

    // recent / default legacy ordering
    return list.sort((a, b) => {
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

  function filterContextItems(items, typeFilter) {
    const id = clean(typeFilter || "all") || "all";
    if (id === "all") return items || [];
    return (items || []).filter((item) => {
      const bucket = clean(item && (item.bucket || item.type)).toLowerCase();
      if (id === "project") return bucket === "project" || /^project/.test(bucket);
      if (id === "journal") return bucket === "journal";
      if (id === "auction_case") return bucket === "auction_case" || bucket === "auction";
      if (id === "reading") return bucket === "reading" || bucket === "reading_session";
      if (id === "other") {
        return ["project", "journal", "auction_case", "auction", "reading", "reading_session"]
          .indexOf(bucket) === -1;
      }
      return bucket === id;
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
   * Strip template instruction lines so preview shows only human content.
   */
  function cleanPreviewBodyText(bodyText) {
    return String(bodyText || "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (!t) return true;
        // Italic template guidance: *...둡니다.*
        if (/^\*[^*].*\*$/.test(t) && /둡니다|않습니다|금지|인덱스|형식:|Store only|Capture|never/i.test(t)) {
          return false;
        }
        if (/^- YYYY-MM-DD/.test(t) || /^- \*\*YYYY-MM-DD\*\*/.test(t)) return false;
        if (t === "-" || t === "*" || t === "·") return false;
        // Hide live dataview query blocks in preview (unreadable raw code)
        return true;
      })
      .join("\n")
      // collapse excess blank lines
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+|\n+$/g, "");
  }

  function stripDataviewBlocks(text) {
    return String(text || "").replace(/```dataview[\s\S]*?```/gi, "").replace(/```dataviewjs[\s\S]*?```/gi, "");
  }

  function isInstructionOnlyBody(bodyText) {
    const stripped = cleanPreviewBodyText(stripDataviewBlocks(bodyText));
    const plain = stripped
      .replace(/\*[^*]+\*/g, "")
      .replace(/^[-*•]\s*/gm, "")
      .replace(/\[\[|\]\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return plain.length < 2;
  }

  /**
   * Parse People body into H1 sections for readable preview.
   * Returns [{ title, body, displayBody, isEmpty }]
   */
  function parsePeopleBodySections(body, options) {
    const opts = options || {};
    const personName = clean(opts.personName).toLowerCase();
    const text = String(body || "").replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    const sections = [];
    let current = null;

    function pushCurrent() {
      if (!current) return;
      const bodyText = current.lines.join("\n").replace(/^\n+|\n+$/g, "");
      const withoutDv = stripDataviewBlocks(bodyText);
      const displayBody = cleanPreviewBodyText(withoutDv);
      const isEmpty = isInstructionOnlyBody(bodyText);
      sections.push({
        title: current.title,
        body: bodyText,
        displayBody,
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
        if (clean(line)) current = { title: "", lines: [line] };
        return;
      }
      current.lines.push(line);
    });
    pushCurrent();

    return sections.filter((s) => {
      if (!s.title && !clean(s.displayBody || s.body)) return false;
      // Skip H1 that is just the person name
      if (personName && clean(s.title).toLowerCase() === personName && isInstructionOnlyBody(s.body)) {
        return false;
      }
      // Dataview-heavy linked objects block — hide in preview (card already shows links)
      if (/^연결된 Object$/i.test(clean(s.title)) || /^Linked Objects$/i.test(clean(s.title))) {
        return false;
      }
      return true;
    });
  }

  /** Sections always offered as editable fields in the relation popup. */
  const EDITABLE_SECTIONS = Object.freeze([
    "관계",
    "핵심 상호작용",
    "메모",
    "배운 점",
    "소통 방식",
    "나의 성찰"
  ]);

  function upsertFrontmatterKey(content, key, value) {
    const text = String(content || "");
    if (!text.startsWith("---")) {
      return `---\n${key}: ${clean(value)}\n---\n${text}`;
    }
    const end = text.indexOf("\n---", 3);
    if (end === -1) return text;
    let raw = text.slice(3, end).replace(/^\n/, "");
    const body = text.slice(end + 4);
    const line = `${key}: ${clean(value)}`;
    const re = new RegExp(`^${key}:\\s*.*$`, "m");
    if (re.test(raw)) raw = raw.replace(re, line);
    else raw = `${raw.replace(/\s+$/, "")}\n${line}`;
    return `---\n${raw.replace(/^\n/, "")}\n---${body.startsWith("\n") ? body : `\n${body}`}`;
  }

  /**
   * Replace (or create) an H1 section body. Preserves following sections.
   */
  function replaceSectionBody(content, sectionTitle, newBody) {
    const title = clean(sectionTitle);
    if (!title) return content;
    const bodyText = String(newBody == null ? "" : newBody).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
    const { start, end, lines } = findSectionRange(content, [title]);
    if (start >= 0) {
      const head = lines.slice(0, start + 1);
      const mid = bodyText ? bodyText.split("\n").concat([""]) : [""];
      return head.concat(mid).concat(lines.slice(end)).join("\n");
    }
    // Create section before 연결된 Object / 나의 성찰 / end
    const full = String(content || "").replace(/\r\n/g, "\n");
    const block = ["", `# ${title}`, bodyText, ""].filter((line, i, arr) => {
      // keep structure
      return true;
    }).join("\n");
    const anchors = [
      /^#\s+연결된 Object\s*$/m,
      /^#\s+Linked Objects\s*$/m,
      /^#\s+첨부\s*$/m,
      /^#\s+Attachments\s*$/m
    ];
    for (let i = 0; i < anchors.length; i += 1) {
      const at = full.search(anchors[i]);
      if (at >= 0) {
        return `${full.slice(0, at).replace(/\s+$/, "")}\n${block}\n${full.slice(at)}`;
      }
    }
    return `${full.replace(/\s+$/, "")}\n${block}\n`;
  }

  /**
   * Apply popup edits (properties + section bodies) onto full note content.
   * Does not change type. Does not remove unlisted sections.
   */
  function applyPersonPreviewEdits(content, edits) {
    let next = String(content || "");
    const props = sanitizeQuickEditUpdates((edits && edits.properties) || {});
    Object.keys(props).forEach((key) => {
      next = upsertFrontmatterKey(next, key, props[key]);
    });
    const sections = (edits && edits.sections) || {};
    Object.keys(sections).forEach((title) => {
      if (EDITABLE_SECTIONS.indexOf(title) === -1) return;
      next = replaceSectionBody(next, title, sections[title]);
    });
    return next;
  }

  /**
   * Build a read-model for person preview modal (also used for editable form).
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
    const parsed = parsePeopleBodySections(split.body, { personName: person.name || name });
    const byTitle = Object.create(null);
    parsed.forEach((s) => {
      if (s.title) byTitle[s.title] = s;
    });

    // Always expose editable section slots (empty if missing)
    const sections = EDITABLE_SECTIONS.map((title) => {
      const found = byTitle[title];
      const displayBody = found ? clean(found.displayBody) : "";
      return {
        title,
        body: found ? found.body : "",
        displayBody,
        isEmpty: !displayBody
      };
    });

    return {
      path: filePath,
      name: person.name || name,
      person,
      properties: pickQuickEditValues(split.data),
      meta_line: [person.relationship, person.company, person.role].filter(Boolean).join(" · "),
      last_contact: person.last_contact,
      is_legacy: person.is_legacy,
      sections,
      editable_sections: EDITABLE_SECTIONS.slice(),
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
    const sortId = clean(opts.sort || "name_asc") || "name_asc";
    const filtered = filterPeopleList(enriched, {
      query: opts.query,
      filter: opts.filter
    });
    const sorted = sortPeopleList(filtered, { sort: sortId });
    const filterId = clean(opts.filter || "all") || "all";
    const query = clean(opts.query);
    const peopleWithHints = sorted.map((p) => {
      if (!query) return p;
      const hints = getSearchMatchHints(p, query);
      return hints.length ? Object.assign({}, p, { search_match_hints: hints }) : p;
    });
    return {
      people: peopleWithHints,
      total: people.length,
      shown: peopleWithHints.length,
      query,
      filter: filterId,
      sort: sortId,
      linkIndex,
      filters: WORKSPACE_FILTERS,
      sorts: WORKSPACE_SORTS,
      context_type_filters: CONTEXT_TYPE_FILTERS,
      empty: people.length === 0,
      no_match: people.length > 0 && peopleWithHints.length === 0,
      empty_hint: people.length > 0 && peopleWithHints.length === 0
        ? emptyFilterHint(filterId, query)
        : ""
    };
  }

  const WORKSPACE_STATE_KEY = "prodigy.people.workspace-state.v1";

  function peopleFingerprint(rawPeople) {
    if (!Array.isArray(rawPeople) || !rawPeople.length) return "0:";
    const rows = rawPeople.map((person) => {
      if (!person || typeof person !== "object") return "";
      const bodyLength = typeof person.body === "string" ? person.body.length : 0;
      const fields = [
        person.path || "",
        person.name || "",
        person.relationship || "",
        person.company || "",
        person.role || "",
        person.last_contact || "",
        String(bodyLength)
      ];
      return fields.join("\u001f");
    });
    rows.sort();
    return rows.length + ":" + rows.join("\u001e");
  }

  const WORKSPACE_STATE_DEFAULTS = Object.freeze({
    query: "",
    filter: "all",
    sort: "name_asc",
    selectedPath: ""
  });

  function readWorkspaceState(storage) {
    const fallback = Object.assign({}, WORKSPACE_STATE_DEFAULTS);
    if (!storage || typeof storage.getItem !== "function") return fallback;
    let raw = null;
    try {
      raw = storage.getItem(WORKSPACE_STATE_KEY);
    } catch (_readError) {
      return fallback;
    }
    if (!raw) return fallback;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_parseError) {
      return fallback;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const restored = Object.assign({}, WORKSPACE_STATE_DEFAULTS);
    Object.keys(WORKSPACE_STATE_DEFAULTS).forEach((key) => {
      const value = parsed[key];
      if (typeof value === "string") restored[key] = value;
    });
    return restored;
  }

  function writeWorkspaceState(storage, state) {
    if (!storage || typeof storage.setItem !== "function") return false;
    const payload = {};
    Object.keys(WORKSPACE_STATE_DEFAULTS).forEach((key) => {
      const value = state && state[key];
      payload[key] = typeof value === "string" ? value : WORKSPACE_STATE_DEFAULTS[key];
    });
    try {
      storage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(payload));
      return true;
    } catch (_writeError) {
      return false;
    }
  }

  const api = {
    CANONICAL_TYPE,
    LEGACY_TYPE,
    PEOPLE_FOLDER,
    PEOPLE_TEMPLATE,
    DISPLAY_LABEL,
    LINK_FIELD,
    QUICK_EDIT_FIELDS,
    RELATIONSHIP_TYPES,
    VENUE_TYPE,
    VENUE_FOLDER,
    VENUE_TEMPLATE,
    VENUE_FRONTMATTER_KEYS,
    VENUE_REQUIRED_HEADINGS,
    VENUE_CATEGORY_PATTERN,
    isKnownVenueCategory,
    isKnownRelationshipType,
    normalizeRelationshipType,
    INTERACTION_SECTION,
    INTERACTION_SECTION_ALIASES,
    WORKSPACE_STATE_KEY,
    readWorkspaceState,
    writeWorkspaceState,
    peopleFingerprint,
    NOTES_SECTION,
    NOTES_SECTION_ALIASES,
    LINKED_OBJECT_TYPES,
    clean,
    isPeopleType,
    isLegacyContactType,
    isPeopleOrLegacy,
    stripPersonHonorifics,
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
    formatPeopleInsightLine,
    formatMemoLine,
    extractMemoLines,
    extractInteractionLines,
    extractSectionBulletLines,
    getSearchMatchHints,
    normalizeMemoLineKey,
    removeBulletFromSection,
    removeMemoLineFromContent,
    removeInteractionLineFromContent,
    appendInteractionToContent,
    appendPeopleInteractionToContent,
    appendMemoToContent,
    emptyFilterHint,
    filterContextItems,
    CONTEXT_TYPE_FILTERS,
    appendLineToSection,
    findSectionRange,
    findInteractionSectionRange,
    findNotesSectionRange,
    upsertLastContactInContent,
    WORKSPACE_FILTERS,
    WORKSPACE_SORTS,
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
    cleanPreviewBodyText,
    buildPersonPreviewModel,
    EDITABLE_SECTIONS,
    upsertFrontmatterKey,
    replaceSectionBody,
    applyPersonPreviewEdits
  };

  root.PeopleCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
