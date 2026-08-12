"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const journalCore = require(path.join(ROOT, "SYSTEM/Views/journal-core.js"));
const journalStore = require(path.join(ROOT, "SYSTEM/Views/journal-store.js"));
const journalView = require(path.join(ROOT, "SYSTEM/Views/journal-view.js"));

async function testAtomicCommitKeepsLateEvidenceAndReassignsProposalCollision() {
  const date = "2026-07-20";
  const notePath = `DAILY/DAILY/${date}.md`;
  const existing = { evidence_id: `daily-${date}-e01`, title: "existing", experience: "existing edit" };
  const lateBlock = { evidence_id: `daily-${date}-e02`, title: "late", experience: "late edit" };
  const proposed = { evidence_id: `daily-${date}-e02`, title: "proposal", experience: "approved proposal" };
  const invalid = { evidence_id: `daily-${date}-e1`, title: "invalid id", experience: "also approved" };
  let content = [
    "---",
    "type: journal",
    "date: 2026-07-20",
    "custom_property: preserve me",
    "---",
    "",
    "# 2026-07-20",
    "",
    "## Daily Intention",
    "Keep this unrelated body section.",
    ""
  ].join("\n");
  content = journalCore.upsertEvidenceSection(content, [existing]);
  let processCalls = 0;
  const file = { path: notePath, extension: "md", name: `${date}.md` };
  const app = {
    vault: {
      getAbstractFileByPath: (requestedPath) => (requestedPath === notePath ? file : null),
      read: async () => { throw new Error("proposal merge must not pre-read before its transaction"); },
      process: async (requestedFile, update) => {
        assert.equal(requestedFile, file, "vault.process must receive the TFile returned by ensureDailyNote");
        processCalls += 1;
        // Simulate another writer winning the queue immediately before our commit callback.
        content = journalCore.upsertEvidenceSection(content, [existing, lateBlock]);
        content = await update(content);
      }
    }
  };

  const saved = await journalStore.mergeProposedEvidenceAtCommit(app, date, [proposed, invalid]);
  const committed = journalCore.parseDailyEvidenceBlocks(content, date).filter((block) => !block.legacy);

  assert.equal(processCalls, 1, "the merge must use one vault.process transaction");
  assert.deepEqual(
    committed.map((block) => block.evidence_id),
    [`daily-${date}-e01`, `daily-${date}-e02`, `daily-${date}-e03`, `daily-${date}-e04`],
    "late evidence remains and colliding or invalid proposal IDs are reassigned from transaction state"
  );
  assert.equal(committed[1].experience, "late edit");
  assert.equal(committed[2].experience, "approved proposal");
  assert.equal(committed[3].experience, "also approved");
  assert.equal(saved.blocks[2].evidence_id, `daily-${date}-e03`, "callers receive the committed review result");
  assert.match(content, /custom_property: preserve me/);
  assert.match(content, /## Daily Intention\nKeep this unrelated body section\./);
}

async function testAtomicManualAppendKeepsEvidenceWrittenBeforeItsCommit() {
  const date = "2026-07-21";
  const notePath = `DAILY/DAILY/${date}.md`;
  const existing = { evidence_id: `daily-${date}-e01`, title: "existing", experience: "existing edit" };
  const lateBlock = { evidence_id: `daily-${date}-e02`, title: "late", experience: "late edit" };
  const manual = { title: "manual", experience: "manual edit" };
  let content = [
    "---",
    "type: journal",
    `date: ${date}`,
    "custom_property: preserve manual append",
    "---",
    "",
    `# ${date}`,
    "",
    "## Daily Intention",
    "Keep this manual-append body section.",
    ""
  ].join("\n");
  content = journalCore.upsertEvidenceSection(content, [existing]);
  const file = { path: notePath, extension: "md", name: `${date}.md` };
  let processCalls = 0;
  const app = {
    vault: {
      getAbstractFileByPath: (requestedPath) => (requestedPath === notePath ? file : null),
      read: async () => { throw new Error("manual append must not pre-read before its transaction"); },
      process: async (requestedFile, update) => {
        assert.equal(requestedFile, file, "manual append must pass a TFile to vault.process");
        processCalls += 1;
        content = journalCore.upsertEvidenceSection(content, [existing, lateBlock]);
        content = await update(content);
      }
    }
  };

  const saved = await journalStore.appendEvidenceBlock(app, date, manual);
  const committed = journalCore.parseDailyEvidenceBlocks(content, date).filter((block) => !block.legacy);

  assert.equal(processCalls, 1, "manual append must use one vault.process transaction");
  assert.deepEqual(
    committed.map((block) => block.evidence_id),
    [`daily-${date}-e01`, `daily-${date}-e02`, `daily-${date}-e03`],
    "late Evidence remains and manual append receives the next transaction-time ID"
  );
  assert.equal(committed[1].experience, "late edit");
  assert.equal(committed[2].experience, "manual edit");
  assert.equal(saved.blocks[2].evidence_id, `daily-${date}-e03`);
  assert.match(content, /custom_property: preserve manual append/);
  assert.match(content, /## Daily Intention\nKeep this manual-append body section\./);
}

async function testAtomicCommitAppliesStagedDeletesOnlyAtConfirmation() {
  const date = "2026-07-22";
  const notePath = `DAILY/DAILY/${date}.md`;
  const first = { evidence_id: `daily-${date}-e01`, title: "keep", experience: "keep this" };
  const deleted = { evidence_id: `daily-${date}-e02`, title: "delete", experience: "remove this" };
  const proposed = { evidence_id: `daily-${date}-e03`, title: "new", experience: "new approved Evidence" };
  let content = journalCore.upsertEvidenceSection(`---\ntype: journal\ndate: ${date}\n---\n\n# ${date}\n`, [first, deleted]);
  const file = { path: notePath, extension: "md", name: `${date}.md` };
  let processCalls = 0;
  const app = {
    vault: {
      getAbstractFileByPath: (requestedPath) => (requestedPath === notePath ? file : null),
      read: async () => { throw new Error("staged delete must not pre-read before confirmation"); },
      process: async (_file, update) => { processCalls += 1; content = await update(content); }
    }
  };

  assert.match(content, /remove this/, "staging data itself does not mutate the Daily record");
  const saved = await journalStore.mergeProposedEvidenceAtCommit(app, date, [proposed], { deleteEvidenceIds: [deleted.evidence_id] });
  const committed = journalCore.parseDailyEvidenceBlocks(content, date).filter((block) => !block.legacy);

  assert.equal(processCalls, 1, "confirmation performs one atomic Daily transaction");
  assert.deepEqual(committed.map((block) => block.evidence_id), [first.evidence_id, proposed.evidence_id]);
  assert.equal(saved.blocks.some((block) => block.evidence_id === deleted.evidence_id), false, "the committed review excludes only the confirmed deletion");
}

async function testViewDelegatesProposalMergeToStoreTransaction() {
  const previousCore = global.JournalCore;
  const previousStore = global.JournalStore;
  const proposed = { evidence_id: "daily-2026-07-20-e02", title: "proposal", experience: "approved proposal" };
  const savedReview = { path: "DAILY/DAILY/2026-07-20.md", blocks: [proposed] };
  const calls = [];

  try {
    global.JournalCore = journalCore;
    global.JournalStore = {
      mergeProposedEvidenceAtCommit: async (app, date, blocks) => {
        calls.push({ app, date, blocks });
        return savedReview;
      }
    };

    const app = {};
    const result = await journalView.saveProposedEvidenceAtCommit(app, "2026-07-20", [proposed]);

    assert.deepEqual(calls, [{ app, date: "2026-07-20", blocks: [proposed] }]);
    assert.equal(result, savedReview, "the post-save handoff keeps the committed review result");
  } finally {
    if (previousCore === undefined) delete global.JournalCore;
    else global.JournalCore = previousCore;
    if (previousStore === undefined) delete global.JournalStore;
    else global.JournalStore = previousStore;
  }
}

testAtomicCommitKeepsLateEvidenceAndReassignsProposalCollision()
  .then(() => {
    return testAtomicManualAppendKeepsEvidenceWrittenBeforeItsCommit();
  })
  .then(() => {
    return testAtomicCommitAppliesStagedDeletesOnlyAtConfirmation();
  })
  .then(() => {
    return testViewDelegatesProposalMergeToStoreTransaction();
  })
  .then(() => console.log("Daily Reflection stale-save tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
