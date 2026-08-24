"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const { RealObsidianHarness } = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js"));

test("production Knowledge mount wires maintenance scheduling and surfaces a notice in #knowledge-panel-llmwiki", { timeout: 240000 }, async () => {
  let harness;
  try {
    harness = await RealObsidianHarness.start("task16-runtime-surface");

    // Deterministic clock + an actionable maintenance snapshot provider built
    // IN-BROWSER via the real branding modules (identity brand is preserved, so
    // the real maintenanceService.scanMaintenance accepts it). This drives the
    // real production render's follower through scan -> policy.apply -> surface.
    await harness.evaluate(`(() => {
      const H = window.KnowledgeExplorerHub = window.KnowledgeExplorerHub || {};
      H.maintenanceClock = () => 1000;
      H._maintenanceSchedule = { starts: 0, stops: 0, due: null };
      H.maintenanceSchedule = (onDue) => {
        H._maintenanceSchedule.starts += 1;
        H._maintenanceSchedule.due = onDue;
        onDue(0);
        return () => { H._maintenanceSchedule.stops += 1; };
      };
      H._maintenanceMode = 'initial';
      H._maintenanceDiag = { called: 0, result: null, error: null, modules: {} };
      H.maintenanceSnapshotProvider = () => {
        H._maintenanceDiag.called += 1;
        try {
          const L = window.LLMWikiKnowledgeLifecycle, R = window.LLMWikiRetrievalService, E = window.LLMWikiEvidenceContract;
          const sha = window.LLMWikiHash && window.LLMWikiHash.sha256 ? (v) => window.LLMWikiHash.sha256(String(v)) : (v) => 'a'.repeat(64);
          H._maintenanceDiag.modules = { L: Boolean(L), R: Boolean(R), E: Boolean(E), hash: Boolean(window.LLMWikiHash) };
          if (!L || !R || !E || !L.createMaintenanceSnapshot || !R.createMaintenanceRetrievalRecord || !E.createMaintenanceEvidenceRecord) { H._maintenanceDiag.result = 'missing-modules'; return null; }
          const sourceRevision = sha('source-stale-v3:' + H._maintenanceMode);
          const doc = { document_id: 'knowledge_stale', canonical_revision: sha('knowledge-stale-v1'), source_ids: ['source_stale'] };
          const trigger = {
            trigger_id: 'trigger_stale', type: 'stale', trigger_revision: sha('trigger-stale-v1'),
            canonical_ids: ['knowledge_stale'], source_ids: ['source_stale'],
            source_snapshots: [{ source_id: 'source_stale', source_revision: sourceRevision, extractor_revision: sha('extractor-stale-v2') }],
            evidence_ids: ['evidence_stale']
          };
          const snapshotRevision = sha('maintenance-snapshot-v1');
          const citation = { citation_id: 'citation_stale_0', source_id: 'source_stale', source_revision: sourceRevision, extractor_revision: sha('extractor-stale-v2'), source_span: { locator: 'ZETA/LITERATURE/source_stale.md#L1', start: 0, end: 8 }, span_digest: sha('evidence_stale:source_stale:0') };
          const lifecycle = { snapshot_revision: snapshotRevision, current_revision: snapshotRevision, canonical_documents: [doc], triggers: H._maintenanceMode === 'none' ? [] : [trigger], feedback: [] };
          const retrieval = { snapshot_revision: snapshotRevision, candidates: [{ document_id: 'knowledge_stale', canonical_revision: doc.canonical_revision }], denied_source_ids: [], hint_status: 'advisory' };
          const evidence = { snapshot_revision: snapshotRevision, records: [{ evidence_id: 'evidence_stale', evidence_revision: sha('evidence_stale:v1'), canonical_ids: ['knowledge_stale'], source_ids: ['source_stale'], citations: [citation], claims: [{ claim_id: 'claim_stale_0', citation_ids: ['citation_stale_0'] }], status: 'accepted' }] };
          const l = L.createMaintenanceSnapshot(JSON.stringify(lifecycle));
          const r = R.createMaintenanceRetrievalRecord(JSON.stringify(retrieval));
          const e = E.createMaintenanceEvidenceRecord(JSON.stringify(evidence));
          if (!(l && l.ok && r && r.ok && e && e.ok)) { H._maintenanceDiag.result = 'brand-failed:' + JSON.stringify({ l: l && l.ok, r: r && r.ok, e: e && e.ok, lr: l && l.reason, rr: r && r.reason, er: e && e.reason }); return null; }
          H._maintenanceDiag.result = 'ok';
          return { lifecycle: l.value, retrieval: r.value, evidence: e.value };
        } catch (err) { H._maintenanceDiag.error = String(err && err.message || err); return null; }
      };
      return true;
    })()`);;

    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");

    const metrics = await harness.evaluate(`(() => {
      const panel = document.getElementById('knowledge-panel-llmwiki');
      const badge = panel && panel.querySelector('[data-maintenance-notice]');
      const fol = window.KnowledgeExplorerHub && window.KnowledgeExplorerHub.maintenanceFollower;
      return {
        followerCreated: Boolean(fol),
        scanCount: fol ? fol.scanCount() : 0,
        badgeExists: Boolean(badge),
        badgeRole: badge ? badge.getAttribute('role') : null,
        badgeAriaLive: badge ? badge.getAttribute('aria-live') : null,
        badgeHasDataSelector: badge ? badge.hasAttribute('data-maintenance-notice') : false,
        badgeText: badge ? badge.textContent : '',
        appShell: document.querySelectorAll('.prodigy-app-shell[data-workspace-id="knowledge"]').length,
        lifecycle: panel ? panel.querySelectorAll('.llmwiki-lifecycle').length : 0,
        tabs: document.querySelectorAll('.knowledge-workspace-tab').length,
        schedule: window.KnowledgeExplorerHub && window.KnowledgeExplorerHub._maintenanceSchedule || null,
        diag: window.KnowledgeExplorerHub && window.KnowledgeExplorerHub._maintenanceDiag || null,
        runtimeModules: {
          follower: Boolean(window.LLMWikiMaintenanceFollower),
          maintenance: Boolean(window.LLMWikiMaintenanceService),
          policy: Boolean(window.LLMWikiNotificationPolicy),
        },
        rolloutMaintenanceEnabled: Boolean(fol && window.KnowledgeExplorerHub.llmWikiRunController.isRolloutPhaseEnabled("maintenance")),
      };
    })()`);

    // Direct diagnostic tick to surface any scan error from the real follower.
    const tickOutcome = await harness.evaluate(`(() => {
      const fol = window.KnowledgeExplorerHub && window.KnowledgeExplorerHub.maintenanceFollower;
      if (!fol || typeof fol.tick !== "function") return { error: "no-follower" };
      try { return fol.tick(777); } catch (e) { return { error: String(e && e.message || e) }; }
    })()`);
    console.log("RUNTIME_TICK_OUTCOME " + JSON.stringify(tickOutcome));

    console.log("RUNTIME_SURFACE_METRICS " + JSON.stringify(metrics));

    assert.deepEqual(metrics.runtimeModules, { follower: true, maintenance: true, policy: true }, "production manifest must expose the complete maintenance runtime before mount");
    assert.equal(metrics.rolloutMaintenanceEnabled, false, "fresh production state keeps rollout actions closed while passive maintenance observation still mounts");
    assert.equal(metrics.followerCreated, true, "production render must call LLMWikiMaintenanceFollower.create");
    assert.ok(metrics.scanCount > 0, "follower.start must reach a scan (onDue -> tick -> scan)");
    assert.equal(metrics.schedule && metrics.schedule.starts, 1, "production mount must subscribe to the injected state scheduler once");
    assert.equal(metrics.badgeExists, true, "real #knowledge-panel-llmwiki must receive the notice badge");
    assert.equal(metrics.badgeRole, "status", "badge must be role=status");
    assert.equal(metrics.badgeAriaLive, "polite", "badge must be aria-live=polite");
    assert.equal(metrics.badgeHasDataSelector, true, "badge must carry data-maintenance-notice");
    assert.match(String(metrics.badgeText), /stale/i, "badge must show the actionable reason");
    // Task 15 / knowledge surface non-regression: single AppShell, one lifecycle, four tabs.
    assert.equal(metrics.appShell, 1, "appShell must stay 1");
    assert.equal(metrics.lifecycle, 1, "lifecycle must stay 1");
    assert.equal(metrics.tabs, 4, "four Knowledge tabs must stay");

    const noticeLifecycle = await harness.evaluate(`(() => {
      const H = window.KnowledgeExplorerHub;
      const panel = document.getElementById('knowledge-panel-llmwiki');
      H._maintenanceMode = 'none';
      const clearOutcome = H._maintenanceSchedule.due(2000);
      const clearedBadge = panel.querySelector('[data-maintenance-notice]');
      const cleared = !clearedBadge
        || (clearedBadge.hasAttribute('hidden') && clearedBadge.textContent === '');
      H._maintenanceMode = 'updated';
      const updateOutcome = H._maintenanceSchedule.due(3000);
      const updated = panel.querySelector('[data-maintenance-notice]');
      return {
        cleared,
        resurfaced: Boolean(updated),
        text: updated ? updated.textContent : '',
        starts: H._maintenanceSchedule.starts,
        clearOutcome,
        updateOutcome,
      };
    })()`);
    console.log("RUNTIME_NOTICE_LIFECYCLE " + JSON.stringify(noticeLifecycle));
    assert.equal(noticeLifecycle.cleared, true, "a non-actionable state signal must clear the old notice");
    assert.equal(noticeLifecycle.resurfaced, true, "a changed actionable revision must surface a fresh notice");
    assert.match(String(noticeLifecycle.text), /stale/i, "resurfaced notice must remain explained");

    await harness.openWorkspace("home");
    await harness.openWorkspace("knowledge");
    await harness.renderedClick("#knowledge-tab-llmwiki");
    await harness.waitForSelector("#knowledge-panel-llmwiki .llmwiki-lifecycle");
    const remount = await harness.evaluate(`(() => {
      const H = window.KnowledgeExplorerHub;
      const panel = document.getElementById('knowledge-panel-llmwiki');
      return {
        starts: H._maintenanceSchedule.starts,
        stops: H._maintenanceSchedule.stops,
        followers: Boolean(H.maintenanceFollower),
        notices: panel.querySelectorAll('[data-maintenance-notice]').length,
      };
    })()`);
    assert.equal(remount.starts, 2, "each Knowledge mount must subscribe exactly once");
    assert.ok(remount.stops >= 1, "leaving Knowledge must tear down the previous scheduler subscription");
    assert.equal(remount.followers, true, "remounted Knowledge must own a live follower");
    assert.equal(remount.notices, 1, "remount must not duplicate the notice surface");
  } finally {
    if (harness) {
      const cleanup = await harness.close();
      assert.equal(cleanup.audit && cleanup.audit.equal, true, "disposable vault remains byte-identical");
      assert.equal(cleanup.protectedContinuity && cleanup.protectedContinuity.exact, true, "protected live applications remain unchanged");
      assert.equal(cleanup.removed, true, "runtime removed");
      assert.equal(cleanup.portReusable, true, "port reusable");
    }
  }
});
