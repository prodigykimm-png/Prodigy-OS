(function (root) {
  "use strict";

  const boundaryPolicy = root.LLMWikiWriteBoundaryPolicy
    || (typeof require === "function" ? require("./llmwiki-write-boundary-policy.js") : null);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function pending(reason) { return freeze({ ok: false, status: "git_pending", reason, receipt: null }); }
  function recorded(receipt) { return freeze({ ok: true, status: "git_recorded", reason: null, receipt: freeze(receipt) }); }
  function uniquePathSet(paths) {
    if (!Array.isArray(paths) || !paths.length || paths.some((path) => boundaryPolicy?.parseGitStagedPath?.(path).ok !== true)) return null;
    const values = new Set(paths);
    return values.size === paths.length ? values : null;
  }
  function samePathSet(left, right) {
    const leftSet = uniquePathSet(left);
    const rightSet = uniquePathSet(right);
    return Boolean(leftSet && rightSet && left.length === right.length && [...leftSet].every((path) => rightSet.has(path)));
  }
  function trustedReceipt(authority, receipt) {
    if (!authority || typeof authority.verify !== "function" || authority.verify(receipt) !== true) return null;
    if (!plain(receipt) || typeof receipt.identity !== "string" || !receipt.identity
      || typeof receipt.operation_id !== "string" || !receipt.operation_id
      || !uniquePathSet(receipt.paths)) return null;
    return receipt;
  }

  function create(options = {}) {
    const gateway = options.gateway;
    const receiptAuthority = options.receiptAuthority;
    async function recordEligibleReceipt(input = {}) {
      const receipt = trustedReceipt(receiptAuthority, input.receipt);
      if (!receipt) return pending("untrusted_git_receipt");
      if (!gateway || typeof gateway.capability !== "function" || typeof gateway.verifySafeSync !== "function"
        || typeof gateway.snapshot !== "function" || typeof gateway.lookup !== "function") return pending("GitUnavailable");
      if (input.guarded_entry && typeof input.guarded_entry.assert_current === "function") {
        try { input.guarded_entry.assert_current(); } catch (_error) { return pending("stale_operation_run"); }
      }
      let capability;
      try { capability = await gateway.capability(); } catch (_error) { return pending("GitUnavailable"); }
      if (!capability || capability.ok !== true) return pending(capability && capability.reason || "GitUnavailable");
      let sync;
      try { sync = await gateway.verifySafeSync(); } catch (_error) { return pending("git_sync_unverified"); }
      if (!sync || sync.ok !== true) return pending(sync && sync.reason || "git_sync_unverified");
      let existing;
      try { existing = await gateway.lookup(receipt.identity); } catch (_error) { return pending("git_lookup_failed"); }
      if (existing && existing.commit_id && existing.pushed === false && samePathSet(existing.paths, receipt.paths)) return recorded(existing);
      let snapshot;
      try {
        snapshot = await gateway.snapshot({
          identity: receipt.identity,
          run_id: receipt.run_id,
          run_revision: receipt.run_revision,
          operation_id: receipt.operation_id,
          paths: receipt.paths,
          expected_hashes: receipt.expected_hashes,
          immutable_audit_hash: receipt.immutable_audit_hash,
          message: `LLM Wiki 승인 기록: ${receipt.operation_id}`,
          push: false,
          signal: input.signal,
        });
      } catch (_error) { return pending("git_snapshot_failed"); }
      if (!snapshot || snapshot.ok !== true || !snapshot.receipt || snapshot.receipt.pushed !== false
        || !samePathSet(snapshot.receipt.paths, receipt.paths)) return pending(snapshot && snapshot.reason || "git_snapshot_failed");
      return recorded(snapshot.receipt);
    }
    function recordOutcome() { return pending("untrusted_git_receipt"); }
    return Object.freeze({ recordEligibleReceipt, recordOutcome });
  }

  const api = Object.freeze({ create });
  root.LLMWikiGitAutomationAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
