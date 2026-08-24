(function (root) {
  "use strict";

  const VERSION = "llmwiki_notification_policy_v1";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function sha256re(value) { return /^[0-9a-f]{64}$/u.test(value); }
  function sortStable(revisions) { return [...revisions].sort((a, b) => a.localeCompare(b, "en")); }
  function sameRevisions(left, right) {
    const a = sortStable(left), b = sortStable(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  // Machine identity binding a notification to one exact reason + source revision
  // set. A changed source revision therefore yields a different key, which is what
  // allows re-notification when a bound source moves forward.
  function notificationKey(reason, sourceRevisions) {
    return `${reason}\u0000${sortStable(sourceRevisions).join("\u0000")}`;
  }

  function fail(field, reason) {
    return freeze({ ok: false, status: "error", field, reason, notify: false });
  }
  function outcome(status, notify, reason, sourceRevisions, now, extra) {
    return freeze({ ok: true, status, notify, reason, source_revisions: sortStable(sourceRevisions), at: now, ...(extra || {}) });
  }

  function statePush(list, entry) { list.push(entry); return entry; }
  function stateHas(list, key) { return list.some((entry) => entry.key === key); }
  function stateFind(list, key) { return list.find((entry) => entry.key === key) || null; }
  function stateRemove(list, entry) {
    const index = list.indexOf(entry);
    if (index >= 0) list.splice(index, 1);
    return entry;
  }

  function create(options = {}) {
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const emit = typeof options.emit === "function" ? options.emit : () => {};
    // Read-only policy: canonical / approval / write hooks are never reached.
    // They exist so a hostile or curious caller can prove the boundary holds
    // (these counters stay 0 for every notification decision).
    void options.canonical; void options.approval; void options.write;

    const notified = [];
    const muted = [];
    const ignored = [];
    const snoozed = [];

    function validate(reason, revisions) {
      if (typeof reason !== "string" || reason.length === 0) return fail("reason", "nonempty_string_required");
      if (Array.isArray(revisions) === false || revisions.length === 0) return fail("source_revisions", "nonempty_array_required");
      if (revisions.every(sha256re) === false) return fail("source_revisions", "sha256_string_required");
      if (/prompt|call canonical|call writer|approve|write\b/iu.test(reason)) return fail("reason", "prompt_shaped_reason_rejected");
      return null;
    }

    function apply(proposal) {
      if (!plain(proposal)) return fail("proposal", "object_required");
      const createdFrom = proposal.created_from;
      const reason = proposal.type || proposal.reason;
      const revisions = createdFrom && Array.isArray(createdFrom.source_revisions) ? createdFrom.source_revisions : null;
      const err = validate(reason, revisions);
      if (err) return err;
      const sortedRevisions = sortStable(revisions);
      const key = notificationKey(reason, sortedRevisions);
      const time = now();

      // Actionable gate: notify only when there is a proposal a human should act on.
      if (proposal.status !== "proposed" || proposal.approval_state !== "requires_human_approval") {
        return outcome("not_actionable", false, reason, sortedRevisions, time);
      }

      // Named feedback overrides everything else.
      if (stateHas(muted, key)) return outcome("muted", false, reason, sortedRevisions, time);
      if (stateHas(ignored, key)) return outcome("ignored", false, reason, sortedRevisions, time);

      // Snooze: quiet until the injected-clock expiry, then notify exactly once.
      const pending = stateFind(snoozed, key);
      if (pending) {
        if (time < pending.until) return outcome("snoozed", false, reason, sortedRevisions, time);
        stateRemove(snoozed, pending); // expired: allow one re-notification this call
      } else if (stateHas(notified, key)) {
        // Exact same reason + source revision already surfaced and not snoozed.
        return outcome("deduplicated", false, reason, sortedRevisions, time);
      }

      // A different source revision for a reason already notified is a fresh,
      // explainable condition -> re-notify rather than a quiet dedup. A proposal
      // whose snooze just expired also surfaces once more.
      const revised = notified.some((entry) => entry.reason === reason && !sameRevisions(entry.source_revisions, sortedRevisions));
      if (!stateHas(notified, key)) statePush(notified, { key, reason, source_revisions: sortedRevisions, at: time });

      const status = revised ? "revised" : "notify";
      // Quiet emission: the only side effect of the policy. No canonical write,
      // no approval, no writer.
      emit();
      return outcome(status, true, reason, sortedRevisions, time);
    }

    function mute(reason, sourceRevisions) {
      const sorted = sortStable(sourceRevisions);
      const key = notificationKey(reason, sorted);
      if (!stateHas(muted, key)) statePush(muted, { key, reason, source_revisions: sorted });
      return freeze({ ok: true, reason, source_revisions: sorted });
    }
    function ignore(reason, sourceRevisions) {
      const sorted = sortStable(sourceRevisions);
      const key = notificationKey(reason, sorted);
      if (!stateHas(ignored, key)) statePush(ignored, { key, reason, source_revisions: sorted });
      return freeze({ ok: true, reason, source_revisions: sorted });
    }
    function snooze(reason, sourceRevisions, untilEpochMs) {
      if (typeof untilEpochMs !== "number" || Number.isFinite(untilEpochMs) === false) untilEpochMs = now() + 60000;
      const sorted = sortStable(sourceRevisions);
      const key = notificationKey(reason, sorted);
      const existing = stateFind(snoozed, key);
      if (existing) existing.until = untilEpochMs;
      else statePush(snoozed, { key, reason, source_revisions: sorted, until: untilEpochMs });
      return freeze({ ok: true, reason, source_revisions: sorted, until: untilEpochMs });
    }

    // Deterministic derived scheduling view computed from injected state; the
    // policy never installs real timers or sleeps. Consumers subscribe to this
    // state and advance a clock, so scheduling is repeatable in tests and runs.
    function schedule() {
      const rows = [
        ...notified.map((entry) => ({ kind: "notified", reason: entry.reason, source_revisions: entry.source_revisions, at: entry.at })),
        ...muted.map((entry) => ({ kind: "muted", reason: entry.reason, source_revisions: entry.source_revisions })),
        ...ignored.map((entry) => ({ kind: "ignored", reason: entry.reason, source_revisions: entry.source_revisions })),
        ...snoozed.map((entry) => ({ kind: "snoozed", reason: entry.reason, source_revisions: entry.source_revisions, until: entry.until, due: now() >= entry.until })),
      ];
      rows.sort((a, b) => `${a.kind}:${a.reason}\u0000${(a.source_revisions || []).join("\u0000")}`.localeCompare(`${b.kind}:${b.reason}\u0000${(b.source_revisions || []).join("\u0000")}`, "en"));
      return freeze(rows);
    }

    return Object.freeze({
      apply,
      mute,
      ignore,
      snooze,
      schedule,
      notificationKey,
      now,
      version: VERSION,
    });
  }

  const api = freeze({ VERSION, create, notificationKey });
  root.LLMWikiNotificationPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
