(function (root) {
  "use strict";

  /**
   * Auction Outcome Writer — one atomic result tuple writer.
   * Default dry-run; --execute for mutation.
   * Does NOT set lifecycle status from result.
   * Does NOT scrape court outcomes.
   * Does NOT migrate legacy cases.
   * Does NOT infer missing prices or recommend bids.
   *
   * Contract: .omo/plans/prodigy-region-workspace-consolidation.md § Auction learning
   */

  const LearningCore = (typeof require === "function")
    ? require("./auction-learning-core.js")
    : root.AuctionLearningCore;

  // ─── Tuple Construction ──────────────────────────────────────────────────────

  /**
   * Build a validated outcome tuple from input.
   * Returns { ok: true, tuple } or { ok: false, errors }.
   */
  function buildTuple(input, options) {
    const validation = LearningCore.validateOutcome(input, options);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }
    return {
      ok: true,
      tuple: Object.freeze({
        auction_outcome: validation.outcome,
        auction_result_date: validation.result_date,
        winning_bid_price: validation.winning_bid_price
      })
    };
  }

  // ─── Dry-run / Execute Logic ─────────────────────────────────────────────────

  /**
   * Apply outcome tuple to a frontmatter object (pure function).
   * Returns the new frontmatter fields to set.
   * Never touches `status`.
   */
  function tupleToFields(tuple) {
    const fields = {
      auction_outcome: tuple.auction_outcome,
      auction_result_date: tuple.auction_result_date
    };
    if (tuple.winning_bid_price !== null && tuple.winning_bid_price !== undefined) {
      fields.winning_bid_price = tuple.winning_bid_price;
    }
    return fields;
  }

  /**
   * Clear outcome tuple fields (for explicit clear with confirmation).
   */
  function clearFields() {
    return {
      auction_outcome: null,
      auction_result_date: null,
      winning_bid_price: null
    };
  }

  /**
   * Determine if an overwrite requires confirmation.
   * Returns { needsConfirmation: bool, existing: {...}|null }.
   */
  function checkOverwrite(existingFm) {
    const fm = existingFm || {};
    const existingOutcome = LearningCore.clean(fm.auction_outcome).toLowerCase();
    if (LearningCore.OUTCOMES.indexOf(existingOutcome) !== -1) {
      return {
        needsConfirmation: true,
        existing: {
          auction_outcome: existingOutcome,
          auction_result_date: LearningCore.extractDate(fm.auction_result_date),
          winning_bid_price: LearningCore.toPositiveFinite(fm.winning_bid_price)
        }
      };
    }
    return { needsConfirmation: false, existing: null };
  }

  /**
   * Execute the outcome write (Obsidian fileManager.processFrontMatter).
   * options:
   *   - execute: boolean (default false = dry-run)
   *   - confirmed: boolean (required for overwrite/clear)
   *   - as_of: YYYY-MM-DD (required)
   *   - action: "set" | "clear" (default "set")
   */
  async function writeOutcome(app, objectPath, input, options) {
    const opts = options || {};
    const execute = opts.execute === true;
    const confirmed = opts.confirmed === true;
    const action = opts.action === "clear" ? "clear" : "set";
    const asOf = LearningCore.clean(opts.as_of);

    if (!asOf || !LearningCore.parseIsoDate(asOf)) {
      return { ok: false, errors: ["as_of is required as YYYY-MM-DD"], dry_run: !execute };
    }

    if (!app || !app.fileManager || !app.vault) {
      return { ok: false, errors: ["app with fileManager and vault required"], dry_run: !execute };
    }

    const tFile = app.vault.getAbstractFileByPath(objectPath);
    if (!tFile) {
      return { ok: false, errors: ["Auction Object not found at path: " + objectPath], dry_run: !execute };
    }

    // Read existing frontmatter for overwrite check
    let existingFm = {};
    try {
      const cache = app.metadataCache && app.metadataCache.getFileCache
        ? app.metadataCache.getFileCache(tFile)
        : null;
      existingFm = (cache && cache.frontmatter) || {};
    } catch (_e) { /* empty */ }

    if (action === "clear") {
      const overwrite = checkOverwrite(existingFm);
      if (overwrite.needsConfirmation && !confirmed) {
        return {
          ok: false,
          errors: ["Confirmation required to clear existing outcome"],
          existing: overwrite.existing,
          dry_run: !execute
        };
      }

      if (!execute) {
        return {
          ok: true,
          dry_run: true,
          action: "clear",
          fields: clearFields(),
          message: "Dry-run: would clear outcome tuple"
        };
      }

      await app.fileManager.processFrontMatter(tFile, (fm) => {
        delete fm.auction_outcome;
        delete fm.auction_result_date;
        // Do NOT delete winning_bid_price if it was set by other means
        // Only clear if it was part of the outcome tuple
        if (fm.auction_outcome !== undefined) delete fm.auction_outcome;
      });

      return { ok: true, dry_run: false, action: "clear", message: "Outcome tuple cleared" };
    }

    // action === "set"
    const result = buildTuple(input, { as_of: asOf });
    if (!result.ok) {
      return { ok: false, errors: result.errors, dry_run: !execute };
    }

    const overwrite = checkOverwrite(existingFm);
    if (overwrite.needsConfirmation && !confirmed) {
      return {
        ok: false,
        errors: ["Confirmation required to overwrite existing outcome"],
        existing: overwrite.existing,
        new_tuple: result.tuple,
        dry_run: !execute
      };
    }

    const fields = tupleToFields(result.tuple);

    if (!execute) {
      return {
        ok: true,
        dry_run: true,
        action: "set",
        fields,
        overwrite: overwrite.needsConfirmation,
        message: "Dry-run: would write outcome tuple"
      };
    }

    await app.fileManager.processFrontMatter(tFile, (fm) => {
      fm.auction_outcome = fields.auction_outcome;
      fm.auction_result_date = fields.auction_result_date;
      if (fields.winning_bid_price !== undefined) {
        fm.winning_bid_price = fields.winning_bid_price;
      }
      // NEVER set status from outcome
    });

    return {
      ok: true,
      dry_run: false,
      action: "set",
      fields,
      message: "Outcome tuple written"
    };
  }

  // ─── CLI Entry Point ─────────────────────────────────────────────────────────

  /**
   * CLI: node auction-outcome-writer.js [--execute] --path <object-path> --outcome <won|lost|skipped> --date <YYYY-MM-DD> [--price <number>] [--as-of <YYYY-MM-DD>] [--confirmed]
   * Default is dry-run.
   */
  function parseCliArgs(argv) {
    const args = Array.isArray(argv) ? argv : [];
    const opts = {
      execute: false,
      confirmed: false,
      path: "",
      outcome: "",
      date: "",
      price: "",
      as_of: "",
      action: "set"
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--execute") opts.execute = true;
      else if (arg === "--confirmed") opts.confirmed = true;
      else if (arg === "--clear") opts.action = "clear";
      else if (arg === "--path" && args[i + 1]) opts.path = args[++i];
      else if (arg === "--outcome" && args[i + 1]) opts.outcome = args[++i];
      else if (arg === "--date" && args[i + 1]) opts.date = args[++i];
      else if (arg === "--price" && args[i + 1]) opts.price = args[++i];
      else if (arg === "--as-of" && args[i + 1]) opts.as_of = args[++i];
    }

    return opts;
  }

  // ─── API ─────────────────────────────────────────────────────────────────────

  const api = Object.freeze({
    buildTuple,
    tupleToFields,
    clearFields,
    checkOverwrite,
    writeOutcome,
    parseCliArgs
  });

  root.AuctionOutcomeWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
