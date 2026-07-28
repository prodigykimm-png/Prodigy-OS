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

  function reviewFromContent(path, dateStr, content) {
    const core = root.JournalCore;
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
    const manuallyCompleted = core.isExplicitDailyCompletion(parsed.data);
    // Prefer multi-block status when Evidence Blocks exist
    let status = core.reviewStatus(fields);
    if (blocks.length && !blocks[0].legacy) {
      status = blockStatus;
    } else if (blockStatus !== "empty" && status === "empty") {
      status = blockStatus;
    }
    if (manuallyCompleted) status = "complete";
    return {
      path,
      exists: true,
      fields,
      blocks,
      blockCount: blocks.length,
      status,
      statusLabel: core.reviewStatusLabel(status),
      manuallyCompleted,
      content
    };
  }

  async function loadReview(app, dateStr) {
    const core = root.JournalCore;
    const path = core.dailyPath(dateStr);
    return reviewFromContent(path, dateStr, await readText(app, path));
  }

  async function saveReview(app, dateStr, review) {
    const core = root.JournalCore;
    const file = await ensureDailyNote(app, dateStr);
    const previous = await app.vault.read(file);
    const next = core.applyReviewToDailyContent(previous, review);
    if (next !== previous) await app.vault.modify(file, next);
    return loadReview(app, dateStr);
  }

  async function saveReflection(app, dateStr, reflection) {
    const core = root.JournalCore;
    const file = await ensureDailyNote(app, dateStr);
    const path = file.path || core.dailyPath(dateStr);
    let committedReview;
    const update = (content) => {
      const parsed = core.parseFrontmatter(content || "");
      const current = core.extractReviewFromDaily(content || "", parsed.data);
      const next = core.applyReviewToDailyContent(content || "", Object.assign({}, current, { reflection: core.clean(reflection) }));
      committedReview = reviewFromContent(path, dateStr, next);
      return next;
    };
    if (typeof app.vault.process === "function") await app.vault.process(file, update);
    else {
      const previous = await app.vault.read(file);
      const next = update(previous);
      if (next !== previous) await app.vault.modify(file, next);
    }
    return committedReview;
  }

  async function markDailyComplete(app, dateStr) {
    const core = root.JournalCore;
    const file = await ensureDailyNote(app, dateStr);
    const previous = await app.vault.read(file);
    const next = core.upsertFrontmatterKeys(previous, {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated: core.todayIsoDate()
    });
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
    const parsed = core.parseFrontmatter(previous);
    const currentReview = core.extractReviewFromDaily(previous, parsed.data);
    let next = core.upsertEvidenceSection(previous, withIds);
    const legacy = core.aggregateLegacyFieldsFromBlocks(withIds);
    next = core.applyReviewToDailyContent(next, {
      reflection: currentReview.reflection || legacy.reflection,
      change: currentReview.change || legacy.change,
      next_experiment: currentReview.next_experiment || legacy.next_experiment
    });
    if (next !== previous) await app.vault.modify(file, next);
    return loadReview(app, dateStr);
  }

  function mergeProposedEvidenceBlocks(dateStr, currentBlocks, proposedBlocks) {
    const core = root.JournalCore;
    const current = (currentBlocks || []).filter((block) => block && !block.legacy);
    const merged = current.slice();
    const usedIds = new Set(current.map((block) => String(block.evidence_id || "")).filter(Boolean));
    const expectedId = new RegExp(`^daily-${String(dateStr).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-e\\d{2,}$`);

    (proposedBlocks || []).forEach((block) => {
      if (!block || (!core.clean(block.experience) && !core.clean(block.title))) return;
      const proposed = Object.assign({}, block);
      const evidenceId = String(proposed.evidence_id || "");
      if (!expectedId.test(evidenceId) || usedIds.has(evidenceId)) {
        proposed.evidence_id = core.nextEvidenceId(merged, dateStr);
      }
      usedIds.add(proposed.evidence_id);
      merged.push(proposed);
    });
    return merged;
  }

  /**
   * Merge confirmed Evidence proposals against the latest note content in one
   * vault transaction so concurrent Evidence writes cannot be overwritten.
   */
  async function mergeProposedEvidenceAtCommit(app, dateStr, proposedBlocks, options) {
    const core = root.JournalCore;
    const file = await ensureDailyNote(app, dateStr);
    const path = file.path || core.dailyPath(dateStr);
    const deleteEvidenceIds = new Set((options && options.deleteEvidenceIds || []).map((value) => String(value || "").trim()).filter(Boolean));
    let committedReview;

    await app.vault.process(file, (currentContent) => {
      const parsed = core.parseFrontmatter(currentContent || "");
      const currentReview = core.extractReviewFromDaily(currentContent || "", parsed.data);
      const current = core.parseDailyEvidenceBlocks(currentContent || "", dateStr)
        .filter((block) => !block.legacy && !deleteEvidenceIds.has(block.evidence_id));
      const merged = mergeProposedEvidenceBlocks(dateStr, current, proposedBlocks);
      const evidenceIdMap = {};
      const committedProposals = merged.slice(current.length);
      let committedIndex = 0;
      (proposedBlocks || []).forEach((block) => {
        if (!block || (!core.clean(block.experience) && !core.clean(block.title))) return;
        const originalId = String(block.evidence_id || "").trim();
        const committed = committedProposals[committedIndex];
        committedIndex += 1;
        if (originalId && committed && committed.evidence_id) evidenceIdMap[originalId] = committed.evidence_id;
      });
      let next = core.upsertEvidenceSection(currentContent || "", merged);
      const legacy = core.aggregateLegacyFieldsFromBlocks(merged);
      next = core.applyReviewToDailyContent(next, {
        reflection: currentReview.reflection || legacy.reflection,
        change: currentReview.change || legacy.change,
        next_experiment: currentReview.next_experiment || legacy.next_experiment
      });
      committedReview = reviewFromContent(path, dateStr, next);
      committedReview.evidenceIdMap = evidenceIdMap;
      return next;
    });
    return committedReview;
  }

  async function appendEvidenceBlock(app, dateStr, block) {
    return mergeProposedEvidenceAtCommit(app, dateStr, [block || {}]);
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
      const date = path.split("/").pop().replace(/\.md$/, "");
      const review = reviewFromContent(path, date, content);
      items.push({
        date,
        path,
        fields: review.fields,
        blocks: review.blocks,
        blockCount: review.blockCount,
        status: review.status,
        statusLabel: review.statusLabel
      });
    }
    return items;
  }

  const api = {
    TEMPLATE,
    ensureDailyNote,
    loadReview,
    saveReview,
    saveReflection,
    markDailyComplete,
    saveEvidenceBlocks,
    mergeProposedEvidenceAtCommit,
    appendEvidenceBlock,
    listRecentReviews
  };

  root.JournalStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
