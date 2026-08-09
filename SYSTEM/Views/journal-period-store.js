(function (root) {
  "use strict";

  function core() {
    if (!root.JournalPeriodCore) throw new Error("JournalPeriodCore를 먼저 불러와야 합니다.");
    return root.JournalPeriodCore;
  }

  function clean(value) { return typeof value === "string" ? value.trim() : ""; }

  function parseFrontmatter(content) {
    var match = String(content || "").match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    var data = {};
    match[1].split("\n").forEach(function (line) {
      var item = /^([a-z][a-z0-9_-]*):\s*(.*)$/i.exec(line);
      if (item) data[item[1].toLowerCase()] = item[2].trim().replace(/^['"]|['"]$/g, "");
    });
    return data;
  }

  function bodyWithoutFrontmatter(content) {
    return String(content || "").replace(/^---[\s\S]*?---\n?/, "");
  }

  function titleFromContent(content, fallback) {
    var match = bodyWithoutFrontmatter(content).match(/^#\s+(.+)$/m);
    return clean(match && match[1]) || fallback;
  }

  function isPeriodRecord(periodId, frontmatter) {
    var id = core().getPeriod(periodId).id;
    var journal = clean(frontmatter.journal).toLowerCase();
    var section = clean(frontmatter["journal-section"]).toLowerCase();
    var sections = { monthly: "month", quarterly: "quarter", yearly: "year" };
    return journal === id || journal.split(/\s+/).indexOf(id) >= 0 || section === sections[id];
  }

  function keyFromFile(periodId, file, frontmatter) {
    var id = core().getPeriod(periodId).id;
    var start = clean(frontmatter["journal-start-date"] || frontmatter.date || frontmatter.created);
    if (start) return core().periodKey(id, start);
    var name = clean(file && (file.name || file.path));
    var pattern = id === "monthly" ? /(\d{4}-\d{2})/ : id === "quarterly" ? /(\d{4}-Q[1-4])/i : /(?:^|\/)(\d{4})(?:\.md)?$/i;
    var match = name.match(pattern);
    return match ? core().periodKey(id, match[1]) : "";
  }

  async function read(app, file) {
    if (app.vault.cachedRead) return app.vault.cachedRead(file);
    return app.vault.read(file);
  }

  async function listRecords(app, periodId) {
    if (!app || !app.vault || typeof app.vault.getMarkdownFiles !== "function") return [];
    var id = core().getPeriod(periodId).id;
    var folder = core().periodFolder(id);
    var files = app.vault.getMarkdownFiles().filter(function (file) {
      return file.extension === "md" && file.path.indexOf(folder + "/") === 0;
    });
    var records = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var content = await read(app, files[i]);
        var frontmatter = parseFrontmatter(content);
        if (!isPeriodRecord(id, frontmatter)) continue;
        var key = keyFromFile(id, files[i], frontmatter);
        if (!key) continue;
        records.push(Object.freeze({
          id: id,
          key: key,
          display: core().periodDisplay(id, key),
          path: files[i].path,
          title: titleFromContent(content, files[i].name || files[i].path),
          content: content,
          frontmatter: frontmatter
        }));
      } catch (_error) {}
    }
    return records.sort(function (a, b) { return b.key.localeCompare(a.key) || a.path.localeCompare(b.path); });
  }

  async function findRecord(app, periodId, key, records) {
    var id = core().getPeriod(periodId).id;
    var normalized = core().periodKey(id, key);
    var list = records || await listRecords(app, id);
    return list.find(function (record) { return record.key === normalized; }) || null;
  }

  var api = Object.freeze({
    parseFrontmatter: parseFrontmatter,
    isPeriodRecord: isPeriodRecord,
    keyFromFile: keyFromFile,
    listRecords: listRecords,
    findRecord: findRecord
  });
  root.JournalPeriodStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
