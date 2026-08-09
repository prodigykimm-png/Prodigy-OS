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
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);

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

  async function buildVenuePreviewModel(app, path) {
    const c = core();
    if (!c) throw new Error("PeopleCore를 불러오지 못했습니다.");
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const filePath = c.clean(path).replace(/\\/g, "/");
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file) throw new Error(`장소 Object를 찾을 수 없습니다: ${filePath}`);
    const content = await app.vault.read(file);
    const props = await readVenueProperties(app, filePath);
    return {
      path: filePath,
      title: props.title,
      type: props.type,
      properties: props.values,
      sections: splitSections(content)
    };
  }

  const api = Object.freeze({
    VENUE_FOLDER,
    clean,
    isVenueFile,
    normalizeConnections,
    readVenueProperties,
    updateVenueProperties,
    deleteVenue,
    buildVenuePreviewModel,
    splitSections
  });

  root.VenueStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);