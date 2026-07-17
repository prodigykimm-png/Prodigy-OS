(function (root) {
  "use strict";

  const TEMPLATE = "SYSTEM/TEMPLATE/FORMAT/template_daily_note.md";

  async function readText(app, path) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    return app.vault.read(file);
  }

  async function ensureDailyNote(app, dateStr) {
    const core = root.JournalCore;
    const path = core.dailyPath(dateStr);
    let file = app.vault.getAbstractFileByPath(path);
    if (file) return file;

    let template = "";
    const templateFile = app.vault.getAbstractFileByPath(TEMPLATE);
    if (templateFile) {
      template = await app.vault.read(templateFile);
      template = template
        .replace(/<%\s*tp\.file\.title\s*%>/g, dateStr)
        .replace(/\{\{date\}\}/g, dateStr)
        .replace(/\{\{title\}\}/g, dateStr);
    } else {
      template = [
        "---",
        "type: journal",
        `date: ${dateStr}`,
        "reflection: ",
        "change: ",
        "next_experiment: ",
        "---",
        "",
        `# ${dateStr}`,
        "",
        "## Daily Intention",
        "",
        "## Evidence",
        "",
        "## End of Day",
        "",
        "### Overall Change",
        "",
        "### Tomorrow",
        "",
        "# Reflection",
        "",
        "## 성찰 (Reflection)",
        "",
        "## 변화 (Change)",
        "",
        "## 다음 실험 (Next Experiment)",
        ""
      ].join("\n");
    }

    const folder = path.split("/").slice(0, -1).join("/");
    if (folder && !app.vault.getAbstractFileByPath(folder) && app.vault.createFolder) {
      try { await app.vault.createFolder(folder); } catch (_error) { /* exists */ }
    }
    return app.vault.create(path, template);
  }

  async function loadReview(app, dateStr) {
    const core = root.JournalCore;
    const path = core.dailyPath(dateStr);
    const content = await readText(app, path);
    if (!content) {
      return {
        path,
        exists: false,
        fields: core.normalizeReviewFields({}),
        blocks: [],
        blockCount: 0,
        status: "empty",
        statusLabel: core.reviewStatusLabel("empty")
      };
    }
    const parsed = core.parseFrontmatter(content);
    const fields = core.extractReviewFromDaily(content, parsed.data);
    const blocks = core.parseDailyEvidenceBlocks(content, dateStr);
    const blockStatus = core.evidenceStatus(blocks);
    // Prefer multi-block status when Evidence Blocks exist
    let status = core.reviewStatus(fields);
    if (blocks.length && !blocks[0].legacy) {
      status = blockStatus;
    } else if (blockStatus !== "empty" && status === "empty") {
      status = blockStatus;
    }
    return {
      path,
      exists: true,
      fields,
      blocks,
      blockCount: blocks.length,
      status,
      statusLabel: core.reviewStatusLabel(status),
      content
    };
  }

  async function saveReview(app, dateStr, review) {
    const core = root.JournalCore;
    const file = await ensureDailyNote(app, dateStr);
    const previous = await app.vault.read(file);
    const next = core.applyReviewToDailyContent(previous, review);
    if (next !== previous) await app.vault.modify(file, next);
    return loadReview(app, dateStr);
  }

  /**
   * Save Evidence Blocks into Daily note.
   * Human confirmation must happen before this is called.
   * Also mirrors aggregate into legacy YAML for Home compatibility.
   */
  async function saveEvidenceBlocks(app, dateStr, blocks) {
    const core = root.JournalCore;
    const file = await ensureDailyNote(app, dateStr);
    const previous = await app.vault.read(file);
    const valid = (blocks || []).filter((b) => core.clean(b.experience) || core.clean(b.title));
    // Ensure stable IDs
    const withIds = valid.map((b, i) => {
      if (b.evidence_id && String(b.evidence_id).includes(dateStr)) return b;
      return Object.assign({}, b, {
        evidence_id: b.evidence_id || `daily-${dateStr}-e${String(i + 1).padStart(2, "0")}`
      });
    });
    let next = core.upsertEvidenceSection(previous, withIds);
    const legacy = core.aggregateLegacyFieldsFromBlocks(withIds);
    next = core.applyReviewToDailyContent(next, legacy);
    if (next !== previous) await app.vault.modify(file, next);
    return loadReview(app, dateStr);
  }

  async function appendEvidenceBlock(app, dateStr, block) {
    const loaded = await loadReview(app, dateStr);
    const existing = (loaded.blocks || []).filter((b) => !b.legacy);
    const core = root.JournalCore;
    const nextBlock = Object.assign({}, core.emptyBlock(dateStr, existing), block || {});
    if (!core.clean(nextBlock.evidence_id)) {
      nextBlock.evidence_id = core.nextEvidenceId(existing, dateStr);
    }
    return saveEvidenceBlocks(app, dateStr, existing.concat([nextBlock]));
  }

  async function listRecentReviews(app, options = {}) {
    const core = root.JournalCore;
    const limitDays = options.limitDays || 7;
    const folder = app.vault.getAbstractFileByPath("DAILY/DAILY");
    if (!folder || !folder.children) return [];
    const files = folder.children
      .filter((file) => file && file.extension === "md")
      .map((file) => file.path)
      .sort()
      .reverse()
      .slice(0, Math.max(limitDays, 14));

    const items = [];
    for (const path of files) {
      const content = await readText(app, path);
      if (!content) continue;
      const parsed = core.parseFrontmatter(content);
      const fields = core.extractReviewFromDaily(content, parsed.data);
      const date = path.split("/").pop().replace(/\.md$/, "");
      const blocks = core.parseDailyEvidenceBlocks(content, date);
      items.push({
        date,
        path,
        fields,
        blocks,
        blockCount: blocks.length,
        status: core.reviewStatus(fields),
        statusLabel: core.reviewStatusLabel(core.reviewStatus(fields))
      });
    }
    return items;
  }

  const api = {
    TEMPLATE,
    ensureDailyNote,
    loadReview,
    saveReview,
    saveEvidenceBlocks,
    appendEvidenceBlock,
    listRecentReviews
  };

  root.JournalStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
