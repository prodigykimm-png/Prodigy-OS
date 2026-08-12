#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("../shared/real_obsidian_harness.js");

const ACTIVE_JOURNAL = ".prodigy-app-shell[data-workspace-id=\"journal\"]";
const SELECTED_PERIOD = ".journal-period-tabs [role=\"tab\"][aria-selected=\"true\"]";

async function activeJournalFocus(harness) {
  return harness.evaluate(`(()=>{
    const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();
    const host=leafObject&&leafObject.containerEl;
    const roots=host?[...host.querySelectorAll(${JSON.stringify(ACTIVE_JOURNAL)})].filter(root=>{
      const box=root.getBoundingClientRect(),style=getComputedStyle(root);
      return root.isConnected&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden';
    }):[];
    if(roots.length!==1)throw new Error('JOURNAL_ACTIVE_ROOT_CARDINALITY:'+roots.length);
    const tabs=[...roots[0].querySelectorAll(${JSON.stringify(SELECTED_PERIOD)})].filter(tab=>tab.isConnected);
    if(tabs.length!==1)throw new Error('JOURNAL_SELECTED_TAB_CARDINALITY:'+tabs.length);
    const panels=[...roots[0].querySelectorAll('.journal-period-content > .journal-period-panel')];
    if(panels.length!==1||panels[0].hidden)throw new Error('JOURNAL_ACTIVE_PANEL_CARDINALITY:'+panels.length);
    return{root:roots[0],tab:tabs[0],panel:panels[0]};
  })()`);
}

test("real Obsidian Journal reacquires the connected selected tab after remount and restores it after modal cancellation", { timeout: 240000 }, async () => {
  const protectedSnapshot = snapshotProtected();
  const harness = await RealObsidianHarness.start("journal-focus-adapter", { protectedSnapshot });
  let cleanup;
  try {
    await harness.openWorkspace("journal");
    await activeJournalFocus(harness);
    await harness.evaluate(`(()=>{
      const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();
      const root=leafObject.containerEl.querySelector(${JSON.stringify(ACTIVE_JOURNAL)});
      window.__journalCachedFocus={root,tab:root.querySelector(${JSON.stringify(SELECTED_PERIOD)})};
      return true;
    })()`);

    // openWorkspace subscribes to task13a-rendered before triggering the real remount.
    await harness.openWorkspace("journal");
    await activeJournalFocus(harness);
    const remount = await harness.evaluate(`(()=>{
      const cached=window.__journalCachedFocus;
      const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();
      const root=leafObject.containerEl.querySelector(${JSON.stringify(ACTIVE_JOURNAL)});
      const tab=root.querySelector(${JSON.stringify(SELECTED_PERIOD)});
      tab.focus();
      return{
        cachedRootConnected:cached.root.isConnected,
        cachedTabConnected:cached.tab.isConnected,
        rootReacquired:root!==cached.root,
        tabReacquired:tab!==cached.tab,
        selected:tab.textContent.trim(),
        focused:document.activeElement===tab,
        mountedPanels:root.querySelectorAll('.journal-period-content > .journal-period-panel').length
      };
    })()`);
    assert.deepEqual(remount, {
      cachedRootConnected: false,
      cachedTabConnected: false,
      rootReacquired: true,
      tabReacquired: true,
      selected: "Daily",
      focused: true,
      mountedPanels: 1
    }, "a cached document-level selector is stale after remount; the active-leaf adapter must reacquire focus ownership");

    const opened = await harness.evaluate(`(()=>{
      const leafObject=app.workspace.activeLeaf||app.workspace.getMostRecentLeaf();
      const root=leafObject.containerEl.querySelector(${JSON.stringify(ACTIVE_JOURNAL)});
      const opener=root.querySelector(${JSON.stringify(SELECTED_PERIOD)});
      opener.focus();
      const modal=DailyReflectionModal.openProposeEvidenceModal(app,'2026-08-11',async()=>{throw new Error('JOURNAL_APPROVAL_FORBIDDEN')},{initialReflection:'',startClassification:false,existingBlocks:[],openerEl:opener});
      if(!modal)throw new Error('JOURNAL_MODAL_MISSING');
      window.__journalFocusProbe={root,opener,modal};
      return{opener:opener.textContent.trim(),modalConnected:Boolean(document.querySelector('.prodigy-reflection-modal'))};
    })()`);
    assert.deepEqual(opened, { opener: "Daily", modalConnected: true });

    const closed = await harness.evaluate(`new Promise((resolve,reject)=>{
      const probe=window.__journalFocusProbe,modalEl=document.querySelector('.prodigy-reflection-modal');
      if(!modalEl)return reject(new Error('JOURNAL_MODAL_ELEMENT_MISSING'));
      const finish=()=>{
        if(modalEl.isConnected)return;
        observer.disconnect();clearTimeout(timer);
        resolve({
          modalConnected:false,
          openerConnected:probe.opener.isConnected,
          selected:probe.opener.getAttribute('aria-selected'),
          focused:document.activeElement===probe.opener,
          mountedPanels:probe.root.querySelectorAll('.journal-period-content > .journal-period-panel').length
        });
      };
      const observer=new MutationObserver(finish);
      observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error('JOURNAL_MODAL_CLOSE_TIMEOUT'))},5000);
      probe.modal.close();
      finish();
    })`);
    assert.deepEqual(closed, {
      modalConnected: false,
      openerConnected: true,
      selected: "true",
      focused: true,
      mountedPanels: 1
    });
    assert.deepEqual(harness.osNetworkAttempts, [], "Journal focus verification dispatches no network request");
  } finally {
    cleanup = await harness.close();
  }
  assert.equal(cleanup.audit.equal, true, "disposable Journal vault remains byte-read-only");
  assert.equal(cleanup.protectedContinuity.exact, true, cleanup.protectedContinuity.error || "protected Obsidian continuity changed");
  assert.equal(cleanup.removed, true, "Journal focus runtime root residue");
  assert.equal(cleanup.portReusable, true, "Journal focus CDP port residue");
});
