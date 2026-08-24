(function (root) {
  "use strict";

  // Active maintenance scheduling seam. Drives the read-only maintenance scan on
  // a deterministic cadence (or explicit tick), feeds every actionable proposal
  // through the quiet notification policy, and dispatches each successful emit
  // to a real Knowledge surface. It never writes canonical knowledge, never
  // touches approval, and never holds real timers when a clock/scheduler is
  // injected.

  const VERSION = "llmwiki_maintenance_follower_v1";
  const NOTICE_SELECTOR = "[data-maintenance-notice]";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function trusted(relative, globalName, host) {
    if (typeof require === "function") {
      try { return require(relative); } catch (_) { /* optional browser path */ }
    }
    try { return host[globalName] || null; } catch (_) { return null; }
  }

  function create(options = {}) {
    const maintenance = options.maintenance || trusted("./llmwiki-maintenance-service.js", "LLMWikiMaintenanceService", root);
    const policyModule = options.policyModule || trusted("./llmwiki-notification-policy.js", "LLMWikiNotificationPolicy", root);
    if (!maintenance || typeof maintenance.scanMaintenance !== "function") {
      throw new Error("maintenance service with scanMaintenance is required");
    }
    if (!policyModule || typeof policyModule.create !== "function") {
      throw new Error("notification policy module with create is required");
    }

    const clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    const snapshots = typeof options.snapshots === "function" ? options.snapshots : () => null;
    const surface = typeof options.surface === "function" ? options.surface : () => {};
    // Read-only integrity hooks: the follower must never reach them.
    const canonical = typeof options.canonical === "function" ? options.canonical : () => {};
    const approval = typeof options.approval === "function" ? options.approval : () => {};
    const write = typeof options.write === "function" ? options.write : () => {};

    // The follower owns a policy instance so feedback (mute/ignore/snooze) and
    // the injected clock are shared across every tick.
    const policyApi = policyModule.create({
      now: clock,
      emit: () => {},
      canonical,
      approval,
      write,
    });

    let unsubscribe = null;
    let noticeCount = 0;
    let lastNotice = null;
    let scanCount = 0;
    // True once a notice has been surfaced and not yet cleared by an empty tick.
    let surfaceActive = false;

    function dispatchDispatches(dispatches) {
      return Object.freeze(dispatches.map(freeze));
    }

    // Run one deterministic scan cycle against an injected snapshot set. Returns
    // a typed outcome; never throws for malformed snapshot shape.
    function tick(epoch) {
      let snapshot;
      try { snapshot = snapshots(epoch); } catch (_) { return freeze({ ok: false, status: "error", field: "snapshots", reason: "snapshot_provider_failed", scanned: false, notices: 0 }); }
      if (!snapshot) return freeze({ ok: true, status: "no_snapshot", scanned: false, proposals: 0, notices: 0, cleared: false });
      if (!plain(snapshot.lifecycle) || !plain(snapshot.retrieval) || !plain(snapshot.evidence)) {
        return freeze({ ok: false, status: "error", field: "snapshot", reason: "full_lifecycle_retrieval_evidence_required", scanned: false, notices: 0 });
      }
      const scan = maintenance.scanMaintenance(snapshot.lifecycle, snapshot.retrieval, snapshot.evidence);
      if (scan.ok !== true) {
        return freeze({ ok: false, status: "error", field: "scan", reason: scan.reason || "scan_failed", scanned: false, notices: 0 });
      }
      scanCount += 1;
      const dispatches = [];
      let noticesNow = 0;
      for (const proposal of scan.proposals || []) {
        const decision = policyApi.apply(proposal);
        if (decision.ok === true && decision.notify === true) {
          const notice = {
            notice_id: `maintenance_notice_${proposal.proposal_id}_${(decision.source_revisions || []).join("_")}`,
            reason: decision.reason,
            source_revisions: decision.source_revisions,
            at: clock(),
            proposal_id: proposal.proposal_id,
            status: decision.status,
            explanation: proposal.explanation || null,
            risk_tier: proposal.risk_tier || null,
          };
          // Dispatch to the real Knowledge surface. The only side effect.
          surface(freeze(notice));
          noticesNow += 1;
          noticeCount += 1;
          lastNotice = freeze(notice);
          surfaceActive = true;
          dispatches.push(Object.freeze({ proposal_id: proposal.proposal_id, notify: true, status: decision.status }));
        } else {
          dispatches.push(Object.freeze({ proposal_id: proposal.proposal_id, notify: false, status: decision.status || "error" }));
        }
      }
      // Keep the surfaced notice visible while any actionable proposal remains;
      // clear it only when the scan no longer yields actionable proposals (the
      // maintenance condition was resolved). A still-actionable but already-
      // notified (deduplicated) proposal keeps the existing notice visible.
      let cleared = false;
      const proposalsNow = (scan.proposals || []).length;
      if (proposalsNow === 0) {
        // No actionable proposals left: the maintenance condition was resolved.
        if (surfaceActive && surface && typeof surface.clear === "function") { surface.clear(); surfaceActive = false; cleared = true; }
      } else if (noticesNow === 0 && lastNotice && surface && typeof surface.assert === "function") {
        // Actionable work remains but was already notified (deduplicated). The
        // host panel may have been emptied by a lifecycle re-render, so
        // re-assert the badge idempotently WITHOUT counting a new notification.
        surface.assert(lastNotice);
        surfaceActive = true;
      }
      return freeze({
        ok: true,
        status: "scanned",
        scanned: true,
        epoch,
        proposal_count: (scan.proposals || []).length,
        notices: noticesNow,
        cleared,
        dispatches: dispatchDispatches(dispatches),
      });
    }

    function start() {
      if (unsubscribe) return;
      const due = typeof options.schedule === "function" ? options.schedule : null;
      if (!due) return freeze({ ok: false, status: "error", reason: "schedule_provider_required" });
      let cancelled = false;
      const onDue = (epoch) => { if (!cancelled) return tick(epoch); return freeze({ ok: true, status: "disposed", notices: 0 }); };
      unsubscribe = due(onDue) || null;
      return freeze({ ok: true, status: "started" });
    }

    function dispose() {
      if (typeof unsubscribe === "function") { try { unsubscribe(); } catch (_) { /* ignore */ } }
      unsubscribe = null;
      // Tear down the surfaced badge element.
      if (surface && typeof surface.remove === "function") { try { surface.remove(); } catch (_) { /* ignore */ } }
      surfaceActive = false;
      return freeze({ ok: true, status: "disposed" });
    }

    return Object.freeze({
      tick,
      start,
      dispose,
      policy: () => policyApi,
      notifications: () => noticeCount,
      lastNotice: () => lastNotice,
      scanCount: () => scanCount,
      version: VERSION,
    });
  }

  // A real, reusable notice surface bound to a DOM host. Reads/renders a single
  // in-flow [data-maintenance-notice] status-line badge (mount once, update in
  // place, clear when no actionable notice, remove on dispose). Read-only: only
  // renders text, never writes canonical knowledge.
  function defaultNoticeSurface(host) {
    let badge = null;
    function ensureBadge() {
      if (!host) return null;
      if (badge && badge.isConnected !== false && host.contains(badge)) return badge;
      badge = null;
      if (typeof host.querySelector === "function") badge = host.querySelector(NOTICE_SELECTOR);
      if (badge) return badge;
      const doc = (host && host.ownerDocument) || (typeof document !== "undefined" ? document : null);
      const label = "";
      if (typeof host.createEl === "function") {
        badge = host.createEl("div", {
          text: label,
          attr: {
            "data-maintenance-notice": "",
            role: "status",
            "aria-live": "polite",
            "aria-atomic": "true",
            class: "prodigy-status-line maintenance-notice",
          },
        });
      } else if (doc && typeof doc.createElement === "function") {
        badge = doc.createElement("div");
        badge.setAttribute("data-maintenance-notice", "");
        badge.setAttribute("role", "status");
        badge.setAttribute("aria-live", "polite");
        badge.setAttribute("aria-atomic", "true");
        badge.className = "prodigy-status-line maintenance-notice";
      }
      if (!badge) return null;
      // Insert above the lifecycle content (in-flow, top of the panel).
      if (typeof host.prepend === "function") host.prepend(badge);
      else if (host && host.firstChild && typeof host.insertBefore === "function") host.insertBefore(badge, host.firstChild);
      else if (host && typeof host.appendChild === "function") host.appendChild(badge);
      return badge;
    }

    function renderNotice(notice) {
      if (!notice) return;
      const node = ensureBadge();
      if (!node) return;
      let label = String(notice.reason || "maintenance");
      if (notice.explanation) label += " · " + notice.explanation;
      node.textContent = label;
      if (notice.notice_id && typeof node.setAttribute === "function") node.setAttribute("data-notice-id", String(notice.notice_id));
      if (typeof node.removeAttribute === "function") {
        node.removeAttribute("hidden");
        node.removeAttribute("data-state");
      } else if (node.removeAttr) node.removeAttr("hidden");
    }

    function clearNotice() {
      const node = ensureBadge();
      if (!node) return;
      if (typeof node.textContent === "string") node.textContent = "";
      if (typeof node.setAttribute === "function") node.setAttribute("data-state", "clear");
      if (typeof node.setAttribute === "function") node.setAttribute("hidden", "");
    }

    function removeNotice() {
      const node = badge || (host && typeof host.querySelector === "function" ? host.querySelector(NOTICE_SELECTOR) : null);
      if (node && typeof node.remove === "function") node.remove();
      else if (node && node.parentElement && typeof node.parentNode.removeChild === "function") node.parentNode.removeChild(node);
      badge = null;
    }

    renderNotice.clear = clearNotice;
    renderNotice.remove = removeNotice;
    renderNotice.assert = renderNotice;
    return renderNotice;
  }

  const api = freeze({ VERSION, create, defaultNoticeSurface });
  root.LLMWikiMaintenanceFollower = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
