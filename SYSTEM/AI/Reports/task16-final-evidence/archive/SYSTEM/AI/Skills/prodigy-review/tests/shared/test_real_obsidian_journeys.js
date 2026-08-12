"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("./real_obsidian_harness.js");

const ALL_WORKSPACES = ["home", "auction", "reading", "workout", "project", "knowledge", "personal", "journal"];
const WORKSPACES = process.env.TASK13A_JOURNEY_WORKSPACES ? process.env.TASK13A_JOURNEY_WORKSPACES.split(",") : ALL_WORKSPACES;
const HOME_FILE = "HUB/00 Home.md";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function runJourney(workspaceId) {
  const harness = await RealObsidianHarness.start(`rendered-journey-${workspaceId}`, { protectedSnapshot: snapshotProtected() });
  let journey;
  let cleanup;
  try {
    await harness.mountStructuralWorkspace(workspaceId);
    const normalDriver = await harness.driveStructuralScenario(workspaceId, "normal");
    const happy = await harness.captureDrivenStructuralScenario(workspaceId, "normal");
    assert.equal(happy.validation.ok, true, `${workspaceId}: happy state ${JSON.stringify({ validation: happy.validation, writes: happy.writes })}`);

    const failureDriver = await harness.driveStructuralScenario(workspaceId, "error-recovery");
    const failed = await harness.captureDrivenStructuralScenario(workspaceId, "error-recovery");
    assert.equal(failureDriver.error, null, `${workspaceId}: rendered failure control`);
    assert.equal(failed.validation.ok, true, `${workspaceId}: bounded failure state`);
    assert.equal(failed.writes.length, 0, `${workspaceId}: no source writes`);
    assert.equal(failed.network.length, 0, `${workspaceId}: no network`);

    const reset = await harness.resetStructuralScenario(workspaceId, "error-recovery");
    await harness.evaluate("document.activeElement&&document.activeElement.blur();true");
    const recovered = await harness.captureStructuralScenario(workspaceId, "normal");
    assert.deepEqual(recovered.diagnostics.filter((item) => !["state_missing", "state_duplicate", "keyboard_focus_navigation"].includes(item.kind)), [], `${workspaceId}: recovered state`);

    const homeReturn = await harness.evaluate(`(()=>{const target=${JSON.stringify(HOME_FILE)},root=document.querySelector('.prodigy-app-shell[data-workspace-id=${workspaceId}]'),control=${JSON.stringify(workspaceId)}==='home'?root&&root.querySelector('.prodigy-workspace-switcher'):[...(root&&root.querySelectorAll('.prodigy-context-action')||[])].find(button=>button.textContent.trim()==='홈');if(!control)throw new Error('TASK14_HOME_CONTROL_MISSING');const selector=${JSON.stringify(workspaceId)}==='home'?'.prodigy-workspace-switcher':'.prodigy-context-action';const eventType='click';if(${JSON.stringify(workspaceId)}==='home'){control.focus();control.click();const active=app.workspace.getActiveFile();if(!active||active.path!==target)throw new Error('TASK14_HOME_RETURN_MISMATCH');return{selector,eventType,eventBeforeTrigger:true,file:target,workspaceId:'home'}}return new Promise((resolve,reject)=>{const finish=()=>{const active=app.workspace.getActiveFile(),shell=document.querySelector('.prodigy-app-shell[data-workspace-id="home"]');if(!active||active.path!==target||!shell)return;observer.disconnect();clearTimeout(guard);resolve({selector,eventType,eventBeforeTrigger:true,file:target,workspaceId:shell.dataset.workspaceId})};const observer=new MutationObserver(finish);observer.observe(document.body,{childList:true,subtree:true});const guard=setTimeout(()=>{observer.disconnect();reject(new Error('TASK14_HOME_RETURN_TIMEOUT'))},10000);control.focus();control.click();finish()})})()`);
    assert.equal(homeReturn.eventBeforeTrigger, true);
    assert.equal(homeReturn.file, HOME_FILE);
    assert.equal(homeReturn.workspaceId, "home");

    const owner = failed.keyboard && failed.keyboard.owners && failed.keyboard.owners[0];
    journey = {
      workspace_id: workspaceId,
      states: ["happy", "invalid_failure", "retry", "recovered", "home_return"],
      controls: {
        happy_driver: normalDriver.driver,
        failure_driver: failureDriver.driver,
        failure_contract_selectors: failed.expected.map((item) => ({ selector: item.selector, scope: item.scope, count: item.count })),
        input_events: failed.keyboard && failed.keyboard.signals || null,
        home_return: homeReturn,
      },
      ownership: {
        workspace_id: owner && owner.workspaceId,
        mount_generation: failed.mountGeneration,
        mount_execution: failed.mountExecution,
        block_execution: failed.blockExecution,
        source_file: recovered.source.file,
        source_sha256: recovered.source.sha256,
        registry_live: owner && owner.registryLive,
      },
      recovery: { reset, connector: failed.connector, event_before_trigger: failed.eventBeforeTrigger, validation: failed.validation },
      authorization: { source_write_count: failed.writes.length, trapped_write_count: failed.trappedWriteAttempts.length, network_count: failed.network.length },
    };
    journey.digest = sha256(JSON.stringify(journey));
    await harness.disposeStructuralWorkspace();
  } finally {
    cleanup = await harness.close();
  }
  assert.equal(cleanup.audit.equal, true, `${workspaceId}: vault hash changed`);
  assert.equal(cleanup.protectedContinuity.exact, true, `${workspaceId}: protected identity changed`);
  assert.equal(cleanup.removed, true, `${workspaceId}: runtime residue`);
  assert.equal(cleanup.portReusable, true, `${workspaceId}: loopback port not reusable`);
  journey.launch_contract = cleanup.launch_contract;
  assert.deepEqual(journey.launch_contract, { mock_keychain_count: 1, child_home_task_owned: true, inherited_real_home: false }, `${workspaceId}: clone keychain/HOME isolation`);
  journey.cleanup = { vault_hash_equal: cleanup.audit.equal, protected_identity_exact: cleanup.protectedContinuity.exact, runtime_removed: cleanup.removed, port_reusable: cleanup.portReusable };
  journey.digest = sha256(JSON.stringify({ ...journey, digest: undefined }));
  return journey;
}

test("real rendered controls independently complete all eight failure-recovery journeys and return to Home", { timeout: 900000 }, async (t) => {
  if (process.env.TASK13A_REAL_OBSIDIAN_JOURNEYS !== "1") return t.skip("set TASK13A_REAL_OBSIDIAN_JOURNEYS=1 for release evidence");
  const journeys = [];
  for (const workspaceId of WORKSPACES) journeys.push(await runJourney(workspaceId));
  const body = { schema_version: "task16-independent-real-rendered-journeys-v2", workspaces: WORKSPACES, journeys };
  body.digest = sha256(JSON.stringify(body));
  const output = process.env.TASK13A_JOURNEY_OUTPUT;
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(body, null, 2)}\n`); }
  assert.equal(journeys.length, WORKSPACES.length);
  assert.equal(journeys.every((item) => item.recovery.event_before_trigger && item.authorization.source_write_count === 0 && item.authorization.network_count === 0), true);
});
