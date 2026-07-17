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

  const api = {
    CANONICAL_TYPE,
    LEGACY_TYPE,
    PEOPLE_FOLDER,
    PEOPLE_TEMPLATE,
    DISPLAY_LABEL,
    LINK_FIELD,
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
    discoverLinkedObjects
  };

  root.PeopleCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
