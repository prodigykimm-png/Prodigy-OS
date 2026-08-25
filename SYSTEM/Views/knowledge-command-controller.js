(function (root) {
  "use strict";

  const promotionApi = root.LLMWikiPromotionContract || (typeof require === "function" ? require("./llmwiki-promotion-contract.js") : null);
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function receipt(ok, reason, extra) { return Object.freeze({ ok, ...(reason ? { reason } : {}), writer_count: 0, provider_count: 0, ...(extra || {}) }); }
  function approvalKey(type, item) { return `${type}:${text(item && item.review_id)}:${text(item && item.review_revision) || "current"}`; }
  function lineDiff(before, after) {
    const oldLines = String(before || "").split("\n");
    const newLines = String(after || "").split("\n");
    const shared = Math.min(oldLines.length, newLines.length);
    const entries = [];
    for (let index = 0; index < shared; index += 1) {
      if (oldLines[index] === newLines[index]) continue;
      if (oldLines[index]) entries.push({ kind: "remove", line: oldLines[index] });
      if (newLines[index]) entries.push({ kind: "add", line: newLines[index] });
    }
    for (const line of oldLines.slice(shared)) if (line) entries.push({ kind: "remove", line });
    for (const line of newLines.slice(shared)) if (line) entries.push({ kind: "add", line });
    return Object.freeze(entries.map((entry) => Object.freeze(entry)));
  }
  function exactCanonicalApproval(item) {
    const approval = plain(item) ? item.canonical_approval : null;
    if (!promotionApi || typeof promotionApi.isCanonicalApprovalPacket !== "function"
      || !promotionApi.isCanonicalApprovalPacket(approval)) return receipt(false, "canonical_approval_packet_required");
    if (approval.review_id !== text(item.review_id) || approval.review_revision !== text(item.review_revision)
      || approval.operation !== text(item.operation) || approval.source_revision !== text(item.source_revision)
      || approval.source_bytes !== item.source_bytes || approval.claim_set_hash !== text(item.claim_set_hash)) {
      return receipt(false, "stale_canonical_approval");
    }
    return receipt(true, "", { value: approval });
  }
  function exactObjectHandoff(item) {
    const handoff = plain(item) && plain(item.object_handoff) ? item.object_handoff : null;
    if (!handoff || !ID.test(text(handoff.handoff_id)) || !text(handoff.target_path) || typeof handoff.before_bytes !== "string" || !text(handoff.target_revision)) return receipt(false, "object_handoff_preflight_required");
    const supplied = Array.isArray(handoff.before_diff) && handoff.before_diff.length
      ? handoff.before_diff.filter((entry) => plain(entry) && ["add", "remove"].includes(entry.kind) && text(entry.line)).map((entry) => Object.freeze({ kind: entry.kind, line: text(entry.line) }))
      : typeof handoff.after_bytes === "string" ? lineDiff(handoff.before_bytes, handoff.after_bytes) : [];
    if (!supplied.length || (Array.isArray(handoff.before_diff) && supplied.length !== handoff.before_diff.length)) return receipt(false, "object_handoff_diff_required");
    return receipt(true, "", { value: Object.freeze({
      handoff_id: handoff.handoff_id,
      target: Object.freeze({ path: handoff.target_path, revision: handoff.target_revision, before_diff: Object.freeze(supplied) }),
    }) });
  }
  function createKnowledgeCommandController(options) {
    const config = plain(options) ? options : {};
    const consumed = new Set();
    async function execute(command) {
      if (!plain(command) || !["save_thought", "complete_from_cache", "approve_canonical", "approve_object", "retry_review"].includes(command.type) || !plain(command.item)) return receipt(false, "invalid_review_command");
      const key = approvalKey(command.type, command.item);
      if (consumed.has(key)) return receipt(false, "replayed_command");
      let handler;
      let payload;
      if (command.type === "save_thought") {
        if (command.item.destination !== "fleeting" || !text(command.item.thought_text)) return receipt(false, "fleeting_thought_required");
        handler = config.onSaveThought;
        payload = Object.freeze({ review_id: command.item.review_id, text: command.item.thought_text, sources: Array.isArray(command.item.sources) ? command.item.sources : [] });
      } else if (command.type === "complete_from_cache") {
        if (command.item.analysis_state !== "cache_complete") return receipt(false, "cached_analysis_required");
        handler = config.onCompleteFromCache;
        payload = Object.freeze({ review_id: command.item.review_id, cache_key: text(command.item.cache_key) });
      } else if (command.type === "approve_canonical") {
        const exact = exactCanonicalApproval(command.item);
        if (!exact.ok) return exact;
        handler = config.onApproveCanonical;
        payload = exact.value;
      } else if (command.type === "approve_object") {
        const exact = exactObjectHandoff(command.item);
        if (!exact.ok) return exact;
        handler = config.onApproveObject;
        payload = Object.freeze({ review_id: command.item.review_id, ...exact.value });
      } else {
        if (!["stale", "recovery", "rejected"].includes(command.item.review_state)) return receipt(false, "retry_state_required");
        handler = config.onRetryReview;
        payload = Object.freeze({ review_id: command.item.review_id, review_revision: text(command.item.review_revision) || "current" });
      }
      if (typeof handler !== "function") return receipt(false, "review_action_unavailable");
      consumed.add(key);
      try {
        const outcome = await handler(payload);
        if (!outcome || outcome.ok === false) return receipt(false, text(outcome && outcome.reason) || "review_action_failed");
        return receipt(true, "", { outcome, value: payload });
      } catch (_error) {
        return receipt(false, "review_action_failed");
      }
    }
    return Object.freeze({ execute, exactCanonicalApproval, exactObjectHandoff, lineDiff });
  }

  const api = Object.freeze({ createKnowledgeCommandController, exactCanonicalApproval, exactObjectHandoff, lineDiff });
  root.KnowledgeCommandController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
