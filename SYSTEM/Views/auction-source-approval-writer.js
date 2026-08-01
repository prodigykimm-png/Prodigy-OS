(function (root) {
  "use strict";

  const FACT_KEYS = Object.freeze([
    "case_number", "court", "auction_datetime", "region_sido", "region_sigungu", "region_dong",
    "address", "property_type", "appraisal_price", "minimum_bid"
  ]);
  const OUTCOME_KEYS = Object.freeze(["auction_outcome", "auction_result_date", "winning_bid_price"]);
  const PROTECTED_KEYS = Object.freeze(["status", "expected_bid", "my_bid_price", "decision_reason", "my_opinion"]);

  function outcomeWriter() {
    return root.AuctionOutcomeWriter || (typeof require === "function" ? require("./auction-outcome-writer.js") : null);
  }
  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function selectedKeys(value) {
    if (!Array.isArray(value)) throw new Error("반영할 필드 목록이 배열이 아닙니다.");
    const unique = [...new Set(value)];
    unique.forEach((key) => { if (![...FACT_KEYS, ...OUTCOME_KEYS].includes(key)) throw new Error(`반영할 수 없는 필드입니다: ${key}`); });
    return unique;
  }
  function buildApplyPlan(pkg, keys, existingFm, options) {
    const selected = selectedKeys(keys);
    const patch = pkg && pkg.candidate_patch && typeof pkg.candidate_patch === "object" ? pkg.candidate_patch : {};
    selected.forEach((key) => { if (patch[key] === undefined || patch[key] === null || patch[key] === "") throw new Error(`선택한 후보 값이 없습니다: ${key}`); });
    const fields = {};
    selected.filter((key) => FACT_KEYS.includes(key)).forEach((key) => { fields[key] = patch[key]; });
    const includesOutcome = selected.some((key) => OUTCOME_KEYS.includes(key));
    if (includesOutcome) {
      if (!selected.includes("auction_outcome") || !selected.includes("auction_result_date")) throw new Error("outcome 반영에는 결과와 결과일을 함께 선택해야 합니다.");
      const writer = outcomeWriter();
      if (!writer) throw new Error("AuctionOutcomeWriter를 불러오지 못했습니다.");
      const validation = writer.buildTuple(patch, { as_of: clean(options && options.as_of) });
      if (!validation.ok) throw new Error(validation.errors.join(" "));
      Object.assign(fields, writer.tupleToFields(validation.tuple));
      const overwrite = writer.checkOverwrite(existingFm || {});
      if (overwrite.needsConfirmation && !(options && options.confirmed === true)) return { ok: false, confirmation_required: true, existing: overwrite.existing, fields, selected };
    }
    return { ok: true, fields, selected, existing: Object.assign({}, existingFm || {}) };
  }
  async function writeApproved(app, objectPath, pkg, keys, options) {
    const opts = options || {};
    if (!app || !app.vault || !app.fileManager || typeof app.fileManager.processFrontMatter !== "function") return { ok: false, errors: ["Obsidian fileManager를 사용할 수 없습니다."], dry_run: !opts.execute };
    const file = app.vault.getAbstractFileByPath(objectPath);
    if (!file) return { ok: false, errors: ["Auction Object를 찾을 수 없습니다."], dry_run: !opts.execute };
    const existing = app.metadataCache && app.metadataCache.getFileCache ? (app.metadataCache.getFileCache(file) || {}).frontmatter || {} : {};
    let plan;
    try { plan = buildApplyPlan(pkg, keys, existing, opts); } catch (error) { return { ok: false, errors: [error.message], dry_run: !opts.execute }; }
    if (!plan.ok) return Object.assign(plan, { dry_run: !opts.execute, errors: ["기존 outcome을 덮어쓰려면 추가 확인이 필요합니다."] });
    if (opts.execute !== true) return Object.assign(plan, { dry_run: true, message: "Dry-run: 승인된 후보 필드를 반영할 수 있습니다." });
    await app.fileManager.processFrontMatter(file, (fm) => {
      plan.selected.forEach((key) => {
        if (FACT_KEYS.includes(key)) fm[key] = plan.fields[key];
      });
      if (plan.fields.auction_outcome) fm.auction_outcome = plan.fields.auction_outcome;
      if (plan.fields.auction_result_date) fm.auction_result_date = plan.fields.auction_result_date;
      if (plan.fields.winning_bid_price !== undefined) fm.winning_bid_price = plan.fields.winning_bid_price;
    });
    return Object.assign(plan, { dry_run: false, message: "승인된 부동산 조사 후보를 반영했습니다." });
  }
  const api = Object.freeze({ FACT_KEYS, OUTCOME_KEYS, PROTECTED_KEYS, buildApplyPlan, selectedKeys, writeApproved });
  root.AuctionSourceApprovalWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
