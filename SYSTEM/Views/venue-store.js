(function (root) {
  "use strict";

  /**
   * Venue Object store — read / quick-edit / delete / preview model.
   * Venue is a first-class Object (like people). Schema constants live in
   * PeopleCore (VENUE_FRONTMATTER_KEYS / VENUE_REQUIRED_HEADINGS) so people and
   * venue never drift; this store only reads/writes the whitelist.
   *
   * connections is a shared array contract ([wikilink, ...]) across people & venue.
   */

  const VENUE_FOLDER = "PARA/RESOURCES/Venues";

  function getCore() {
    return root.PeopleCore || (typeof require === "function" ? require("./people-core.js") : null);
  }
  const core = () => getCore();

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function isVenueFile(path) {
    const p = String(path || "").replace(/\\/g, "/");
    return p.indexOf(`${VENUE_FOLDER}/`) === 0 && /\.md$/i.test(p);
  }

  function normalizeConnections(value) {
    // Shared array contract. Accept array | string | wikilink string.
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    const s = clean(value);
    if (!s) return [];
    if ((s.startsWith("[") && s.endsWith("]"))) {
      try { return JSON.parse(s).map(clean).filter(Boolean); } catch (_e) { /* fall through */ }
    }
    const re = /\[\[([^\]|#]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(s))) out.push(clean(m[1]));
    return out.filter(Boolean);
  }

  function readFrontmatterText(app, file) {
    // Prefer metadataCache frontmatter; fall back to simple parse.
    if (app.metadataCache && typeof app.metadataCache.getFileCache === "function") {
      const cache = app.metadataCache.getFileCache(file);
      if (cache && cache.frontmatter) return cache.frontmatter;
    }
    return null;
  }

  function parseSimpleFrontmatter(text) {
    const source = String(text || "");
    if (!source.startsWith("---")) return {};
    const end = source.indexOf("\n---", 3);
    if (end === -1) return {};
    const raw = source.slice(3, end).replace(/^\n/, "");
    const data = {};
    const lines = raw.split("\n");
    let blockKey = null;
    lines.forEach((line) => {
      const listMatch = line.match(/^(\s*)-[\s]*(.*)$/);
      if (listMatch && blockKey != null) {
        let value = listMatch[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!Array.isArray(data[blockKey])) data[blockKey] = [];
        data[blockKey].push(value);
        return;
      }
      blockKey = null;
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) return;
      if (match[2].trim() === "") {
        blockKey = match[1];
        data[match[1]] = [];
        return;
      }
      let value = match[2].trim();
      if (value.startsWith("[")) {
        try { value = JSON.parse(value); } catch (_e2) { /* keep string */ }
      }
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[match[1]] = value;
    });
    return data;
  }

  async function readVenueProperties(app, path) {
    const c = core();
    if (!c) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = c.clean(path).replace(/\\/g, "/");
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);

    let fm = readFrontmatterText(app, file) || {};
    if (!Object.keys(fm).length) {
      const content = await app.vault.read(file);
      fm = parseSimpleFrontmatter(content);
    }
    return {
      path: filePath,
      title: filePath.split("/").pop().replace(/\.md$/i, ""),
      type: clean(fm.type),
      values: {
        venue_category: clean(fm.venue_category),
        address: clean(fm.address),
        connections: normalizeConnections(fm.connections),
        created: clean(fm.created),
        updated: clean(fm.updated)
      }
    };
  }

  async function updateVenueProperties(app, path, updates) {
    const c = core();
    if (!c) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = c.clean(path).replace(/\\/g, "/");
    if (!isVenueFile(filePath)) throw new Error("Venues 폴더의 장소 노트만 수정할 수 있습니다.");
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);
    const current = await readVenueProperties(app, filePath);
    if (current.type && current.type !== "venue") throw new Error("type: venue 장소 노트만 수정할 수 있습니다.");
    if (!current.type) throw new Error("type: venue가 없는 노트는 수정할 수 없습니다.");

    const allowed = (c.VENUE_FRONTMATTER_KEYS || ["type", "venue_category", "address", "connections", "created", "updated"]);
    const patch = {};
    Object.keys(updates || {}).forEach((key) => {
      if (allowed.indexOf(key) === -1) return;
      patch[key] = updates[key];
    });
    if (!Object.keys(patch).length) throw new Error("수정할 필드가 없습니다.");

    if (app.fileManager && typeof app.fileManager.processFrontMatter === "function") {
      await app.fileManager.processFrontMatter(file, (fm) => {
        const originalType = fm.type;
        Object.keys(patch).forEach((key) => {
          if (key === "connections") {
            fm[key] = normalizeConnections(patch[key]);
          } else {
            fm[key] = patch[key];
          }
        });
        if (originalType != null) fm.type = originalType;
        fm.updated = new Date().toISOString().slice(0, 16);
      });
    } else {
      // Fallback: rewrite simple scalar frontmatter lines.
      const content = await app.vault.read(file);
      if (!content.startsWith("---")) throw new Error("frontmatter가 없는 노트는 빠른 수정할 수 없습니다.");
      const end = content.indexOf("\n---", 3);
      if (end === -1) throw new Error("frontmatter가 손상되었습니다.");
      let raw = content.slice(3, end).replace(/^\n/, "");
      const body = content.slice(end + 4);
      const setLine = (key, value) => {
        const line = `${key}: ${value}`;
        const re = new RegExp(`^${key}:\\s*.*$`, "m");
        if (re.test(raw)) raw = raw.replace(re, line);
        else raw = `${raw.replace(/\s+$/, "")}\n${line}`;
      };
      Object.keys(patch).forEach((key) => {
        if (key === "connections") setLine(key, JSON.stringify(normalizeConnections(patch[key])));
        else setLine(key, patch[key]);
      });
      setLine("updated", new Date().toISOString().slice(0, 16));
      const next = `---\n${raw.replace(/^\n/, "")}\n---${body.startsWith("\n") ? body : `\n${body}`}`;
      if (typeof app.vault.modify === "function") await app.vault.modify(file, next);
      else throw new Error("Vault modify API를 사용할 수 없습니다.");
    }

    const refreshed = await readVenueProperties(app, filePath);
    return { path: filePath, values: refreshed.values };
  }

  async function deleteVenue(app, path) {
    const c = core();
    if (!c) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = c.clean(path).replace(/\\/g, "/");
    if (!isVenueFile(filePath)) throw new Error("Venues 폴더의 장소 노트만 삭제할 수 있습니다.");
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);
    const current = await readVenueProperties(app, filePath);
    if (current.type !== "venue") throw new Error("type: venue 장소 노트만 삭제할 수 있습니다.");
    if (typeof app.vault.trash === "function") {
      await app.vault.trash(file, true);
      return { path: filePath, trashed: true };
    }
    if (typeof app.vault.delete === "function") {
      await app.vault.delete(file, true);
      return { path: filePath, trashed: false };
    }
    throw new Error("Vault 삭제 API를 사용할 수 없습니다.");
  }

  async function appendHandoffMemo(app, object, input) {
    const filePath = clean(object && object.path).replace(/\\/g, "/");
    if (!isVenueFile(filePath)) throw new Error("Venues 폴더의 장소 노트만 수정할 수 있습니다.");
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || file.extension !== "md") throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);
    const original = await app.vault.read(file);
    if (!/^type:\s*venue\s*$/m.test(original)) throw new Error("type: venue 장소 노트만 수정할 수 있습니다.");
    const matches = Array.from(original.matchAll(/^## 메모\r?$/gm));
    if (matches.length !== 1) throw new Error("venue_memo_section_invalid");
    const marker = `<!-- llmwiki-object-handoff:${input.handoff_id}:${input.linked_lifecycle_ids.join(",")} -->`;
    let next = original;
    if (!original.includes(marker)) {
      const start = matches[0].index + matches[0][0].length;
      const rest = original.slice(start);
      const nextHeading = rest.search(/^#{1,3} [^\r\n]+\r?$/m);
      const end = nextHeading < 0 ? original.length : start + nextHeading;
      next = `${original.slice(0, end).replace(/\s*$/, "")}\n- ${input.text}\n${marker}\n${original.slice(end)}`;
    }
    if (next !== original) await app.vault.modify(file, next);
    return { path: filePath, status: next === original ? "unchanged" : "appended", content: next };
  }

  function splitSections(content) {
    // Split body into sections by `## ` headings.
    const source = String(content || "");
    const fmEnd = source.startsWith("---") ? source.indexOf("\n---", 3) : -1;
    const body = fmEnd === -1 ? source : source.slice(fmEnd + 4);
    const sections = [];
    const lines = body.split("\n");
    let current = null;
    lines.forEach((line) => {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) {
        current = { title: m[1].trim(), body: [] };
        sections.push(current);
      } else if (current) {
        current.body.push(line);
      }
    });
    return sections.map((s) => ({ title: s.title, bodyText: s.body.join("\n").trim() }));
  }
  /**
   * Pure Venue workspace helpers. The workspace accepts the existing Venue
   * frontmatter fields plus a read-only body/journal projection from the Hub;
   * it never writes or invents schema fields.
   */
  function normalizeVenueSearchText(value) {
    return clean(value).normalize("NFC").toLowerCase();
  }

  function venueTimestamp(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
    if (typeof value === "object" && typeof value.toMillis === "function") {
      try {
        const ms = value.toMillis();
        if (Number.isFinite(ms)) return ms;
      } catch (_e) { /* ignore */ }
    }
    const text = clean(value);
    if (!text) return 0;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function venueDateText(value) {
    if (value == null || value === "") return "";
    if (typeof value === "object") {
      try {
        if (typeof value.toISO === "function") return clean(value.toISO());
        if (typeof value.toISOString === "function") return clean(value.toISOString());
      } catch (_e) { /* ignore */ }
    }
    return clean(value);
  }

  function normalizeVenueRecord(raw) {
    const source = raw || {};
    const file = source.file || {};
    const path = clean(source.path || file.path || "").replace(/\\/g, "/");
    const title = clean(
      source.title
      || source.name
      || file.name
      || file.basename
      || path.split("/").pop().replace(/\.md$/i, "")
    ).replace(/\.md$/i, "");
    const venueCategory = clean(
      source.venue_category
      || source.category
      || (Array.isArray(source.meta) ? source.meta[0] : "")
    );
    const address = clean(source.address || source.detail);
    const rawConnections = source.connections != null ? source.connections : source.connection_text;
    const connections = normalizeConnections(rawConnections);
    const connectionSourceText = typeof rawConnections === "string"
      && !(rawConnections.trim().startsWith("[") && rawConnections.trim().endsWith("]"))
      ? clean(rawConnections)
      : "";
    const body = String(source.body != null ? source.body : (source.content || ""));
    const sections = Array.isArray(source.sections)
      ? source.sections.map((section) => ({
        title: clean(section && section.title),
        bodyText: String(section && section.bodyText != null
          ? section.bodyText
          : (section && section.body != null ? section.body : ""))
      })).filter((section) => section.title)
      : splitSections(body);
    const journalLinks = (Array.isArray(source.journalLinks)
      ? source.journalLinks
      : (Array.isArray(source.relatedJournals) ? source.relatedJournals : []))
      .map((link) => {
        if (link && typeof link === "object") return clean(link.path || link.file || link.link);
        return clean(link);
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"));
    const updatedCandidate = source.updated;
    const modifiedCandidate = source.modified;
    const updatedSource = venueDateText(updatedCandidate)
      ? updatedCandidate
      : (venueDateText(modifiedCandidate) ? modifiedCandidate : (source.mtime || file.mtime));
    const updated = venueDateText(updatedSource);
    const updatedTs = venueTimestamp(updatedSource || source.mtime || file.mtime);
    const connectionText = [connections.join("\n"), connectionSourceText].filter(Boolean).join("\n");
    const bodyText = sections.map((section) => `${section.title}\n${section.bodyText}`).join("\n");
    const hasBody = !!clean(bodyText);
    const hasConnections = !!clean(connectionText);
    const attentionScore = (venueCategory ? 0 : 4)
      + (address ? 0 : 2)
      + (hasConnections ? 0 : 1)
      + (journalLinks.length ? 0 : 1)
      + (hasBody ? 0 : 2);

    return {
      path,
      title,
      name: title,
      type: clean(source.type || "venue"),
      venue_category: venueCategory,
      category: venueCategory,
      address,
      connections,
      connection_text: connectionText,
      body,
      sections,
      updated,
      updated_ts: updatedTs,
      journalLinks,
      journal_count: journalLinks.length,
      has_connections: hasConnections,
      has_journals: journalLinks.length > 0,
      has_body: hasBody,
      attention_score: attentionScore,
      search_text: [
        title,
        venueCategory,
        address,
        connectionText,
        bodyText,
        body
      ].join("\n").normalize("NFC").toLowerCase()
    };
  }

  function matchVenueSearch(venue, query) {
    const q = normalizeVenueSearchText(query);
    if (!q) return true;
    const item = venue && venue.search_text ? venue : normalizeVenueRecord(venue);
    return String(item.search_text || "").includes(q);
  }

  function filterVenueList(venues, options) {
    const opts = options || {};
    const query = clean(opts.query);
    const category = clean(opts.category || opts.categoryFilter || "");
    const filter = clean(opts.filter || opts.filterId || "all") || "all";
    const connection = clean(opts.connection || opts.connectionFilter || "");
    const journal = clean(opts.journal || opts.journalFilter || "");
    let list = (venues || []).slice();

    if (query) list = list.filter((venue) => matchVenueSearch(venue, query));

    // `filter` is retained as a convenient single category/status control for
    // callers that predate the richer independent controls.
    const categoryId = category && category !== "all"
      ? category
      : (["all", "connected", "unconnected", "with_journal", "without_journal"].indexOf(filter) === -1
        ? filter
        : "all");
    if (categoryId && categoryId !== "all") {
      if (categoryId === "unset" || categoryId === "미분류") {
        list = list.filter((venue) => !clean(venue.venue_category));
      } else {
        list = list.filter((venue) => clean(venue.venue_category) === categoryId);
      }
    }

    const connectionId = connection || (
      filter === "connected" || filter === "with_connection" ? "connected"
        : (filter === "unconnected" || filter === "without_connection" ? "unconnected" : "all")
    );
    if (connectionId === "connected" || connectionId === "with_connection") {
      list = list.filter((venue) => !!venue.has_connections || (venue.connections || []).length > 0);
    } else if (connectionId === "unconnected" || connectionId === "without_connection") {
      list = list.filter((venue) => !venue.has_connections && !(venue.connections || []).length);
    }

    const journalId = journal || (
      filter === "with_journal" || filter === "journal" ? "with_journal"
        : (filter === "without_journal" || filter === "no_journal" ? "without_journal" : "all")
    );
    if (journalId === "with_journal" || journalId === "journal") {
      list = list.filter((venue) => !!venue.has_journals || (venue.journalLinks || []).length > 0);
    } else if (journalId === "without_journal" || journalId === "no_journal") {
      list = list.filter((venue) => !venue.has_journals && !(venue.journalLinks || []).length);
    }
    return list;
  }

  function sortVenueList(venues, options) {
    const sortId = clean((options && (options.sort || options.sortId)) || "name_asc") || "name_asc";
    const list = (venues || []).map((venue) => (
      venue && venue.search_text && Array.isArray(venue.connections) && Array.isArray(venue.journalLinks)
        ? venue
        : normalizeVenueRecord(venue)
    ));
    const byName = (a, b) => {
      const name = clean(a.title || a.name).localeCompare(clean(b.title || b.name), "ko");
      return name || clean(a.path).localeCompare(clean(b.path), "ko");
    };
    if (sortId === "name_desc" || sortId === "desc") {
      return list.sort((a, b) => byName(b, a));
    }
    if (sortId === "recent" || sortId === "recent_update" || sortId === "updated") {
      return list.sort((a, b) => {
        const recent = (Number(b.updated_ts) || venueTimestamp(b.updated))
          - (Number(a.updated_ts) || venueTimestamp(a.updated));
        return recent || byName(a, b);
      });
    }
    if (sortId === "attention" || sortId === "손볼") {
      return list.sort((a, b) => {
        const attention = (Number(b.attention_score) || 0) - (Number(a.attention_score) || 0);
        if (attention) return attention;
        const older = (Number(a.updated_ts) || venueTimestamp(a.updated))
          - (Number(b.updated_ts) || venueTimestamp(b.updated));
        return older || byName(a, b);
      });
    }
    return list.sort(byName);
  }

  function venueEmptyFilterHint(options) {
    const opts = options || {};
    const query = clean(opts.query);
    if (query) return `「${query}」와 일치하는 장소가 없습니다. 검색어와 필터를 바꿔 보세요.`;
    if (opts.category === "unset" || opts.category === "미분류") return "미분류인 장소가 없습니다.";
    if (opts.category && opts.category !== "all") return `분류「${opts.category}」인 장소가 없습니다.`;
    if (opts.connection === "connected" || opts.filter === "connected") return "연결된 Object가 있는 장소가 없습니다.";
    if (opts.connection === "unconnected" || opts.filter === "unconnected") return "연결된 Object가 없는 장소가 없습니다.";
    if (opts.journal === "with_journal" || opts.filter === "with_journal") return "관련 저널이 있는 장소가 없습니다.";
    if (opts.journal === "without_journal" || opts.filter === "without_journal") return "관련 저널이 없는 장소가 없습니다.";
    return "일치하는 장소가 없습니다.";
  }

  function buildVenueWorkspaceModel(rawVenues, options) {
    const opts = options || {};
    const venues = (rawVenues || [])
      .map(normalizeVenueRecord)
      .filter((venue) => venue.path && clean(venue.type).toLowerCase() === "venue");
    const query = clean(opts.query);
    const category = clean(opts.category || opts.categoryFilter || "");
    const filter = clean(opts.filter || opts.filterId || "all") || "all";
    const explicitConnection = clean(opts.connection || opts.connectionFilter || "");
    const explicitJournal = clean(opts.journal || opts.journalFilter || "");
    const connection = explicitConnection || (
      filter === "connected" || filter === "with_connection" ? "connected"
        : (filter === "unconnected" || filter === "without_connection" ? "unconnected" : "all")
    );
    const journal = explicitJournal || (
      filter === "with_journal" || filter === "journal" ? "with_journal"
        : (filter === "without_journal" || filter === "no_journal" ? "without_journal" : "all")
    );
    const filtered = filterVenueList(venues, { query, category, connection, journal, filter });
    const sort = clean(opts.sort || "name_asc") || "name_asc";
    const sorted = sortVenueList(filtered, { sort });
    const categoryValues = Array.from(new Set(venues.map((venue) => clean(venue.venue_category)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "ko"));
    const categoryFilters = [{ id: "all", label: "전체" }]
      .concat(categoryValues.map((value) => ({ id: value, label: value })))
      .concat([{ id: "unset", label: "미분류" }]);
    const connectionFilters = [
      { id: "all", label: "전체" },
      { id: "connected", label: "연결 있음" },
      { id: "unconnected", label: "연결 없음" }
    ];
    const journalFilters = [
      { id: "all", label: "전체" },
      { id: "with_journal", label: "저널 있음" },
      { id: "without_journal", label: "저널 없음" }
    ];
    const categoryCounts = { all: venues.length, unset: 0 };
    categoryValues.forEach((value) => { categoryCounts[value] = 0; });
    const connectionCounts = { all: venues.length, connected: 0, unconnected: 0 };
    const journalCounts = { all: venues.length, with_journal: 0, without_journal: 0 };
    venues.forEach((venue) => {
      const key = clean(venue.venue_category) || "unset";
      categoryCounts[key] = (categoryCounts[key] || 0) + 1;
      if (venue.has_connections || venue.connections.length) connectionCounts.connected += 1;
      else connectionCounts.unconnected += 1;
      if (venue.has_journals || venue.journalLinks.length) journalCounts.with_journal += 1;
      else journalCounts.without_journal += 1;
    });
    const counts = {
      total: venues.length,
      shown: sorted.length,
      attention: venues.filter((venue) => venue.attention_score > 0).length,
      categories: categoryCounts,
      category: categoryCounts,
      connections: connectionCounts,
      connection: connectionCounts,
      journals: journalCounts,
      journal: journalCounts
    };
    return {
      venues: sorted,
      places: sorted,
      items: sorted,
      total: venues.length,
      shown: sorted.length,
      query,
      filter,
      category: category || (categoryValues.indexOf(filter) >= 0 ? filter : "all"),
      connection,
      journal,
      sort,
      counts,
      category_filters: categoryFilters,
      connection_filters: connectionFilters,
      journal_filters: journalFilters,
      filters: {
        category: categoryFilters,
        connection: connectionFilters,
        journal: journalFilters
      },
      categoryFilters,
      connectionFilters,
      journalFilters,
      sorts: [
        { id: "name_asc", label: "가나다 ↑" },
        { id: "name_desc", label: "가나다 ↓" },
        { id: "recent", label: "최근 수정" },
        { id: "attention", label: "손볼 장소" }
      ],
      empty: venues.length === 0,
      no_match: venues.length > 0 && sorted.length === 0,
      noMatch: venues.length > 0 && sorted.length === 0,
      emptyHint: venues.length > 0 && sorted.length === 0
        ? venueEmptyFilterHint({ query, category, connection, journal, filter })
        : "",
      empty_hint: venues.length > 0 && sorted.length === 0
        ? venueEmptyFilterHint({ query, category, connection, journal, filter })
        : ""
    };
  }

  function venueFingerprint(rawVenues) {
    const rows = (rawVenues || []).map((venue) => {
      const item = venue && venue.search_text
        && Array.isArray(venue.connections)
        && Array.isArray(venue.journalLinks)
        ? venue
        : normalizeVenueRecord(venue);
      return [
        item.path,
        item.title,
        item.venue_category,
        item.address,
        item.connection_text,
        item.journalLinks.join("\u001c"),
        item.updated,
        item.body
      ].join("\u001f");
    }).sort();
    return `${rows.length}:${rows.join("\u001e")}`;
  }


  async function buildVenuePreviewModel(app, path, options) {
    const c = core();
    if (!c) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = c.clean(path).replace(/\\/g, "/");
    if (!isVenueFile(filePath)) throw new Error("Venues 폴더의 장소 노트만 미리볼 수 있습니다.");
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);
    const content = await app.vault.read(file);
    const props = await readVenueProperties(app, filePath);
    if (props.type !== "venue") throw new Error("type: venue 장소 노트만 미리볼 수 있습니다.");
    const relatedJournals = options && Array.isArray(options.relatedJournals)
      ? options.relatedJournals.map((link) => {
        if (link && typeof link === "object") return clean(link.path || link.file || link.link);
        return clean(link);
      }).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"))
      : null;
    return {
      path: filePath,
      title: props.title,
      type: props.type,
      properties: props.values,
      body: content,
      sections: splitSections(content),
      relatedJournals
    };
  }

  const api = Object.freeze({
    VENUE_FOLDER,
    clean,
    isVenueFile,
    normalizeConnections,
    normalizeVenueSearchText,
    venueTimestamp,
    venueDateText,
    normalizeVenueRecord,
    matchVenueSearch,
    filterVenueList,
    sortVenueList,
    venueEmptyFilterHint,
    buildVenueWorkspaceModel,
    venueFingerprint,
    readVenueProperties,
    updateVenueProperties,
    appendHandoffMemo,
    deleteVenue,
    buildVenuePreviewModel,
    splitSections
  });

  root.VenueStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);