"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reflection = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-ai.js"));
const journalView = require(path.join(ROOT, "SYSTEM/Views/journal-view.js"));

function proposal() {
  return {
    evidence_blocks: [
      {
        evidence_id: "daily-2026-07-20-e01",
        title: "촬영 거리",
        context: "work",
        experience: "85mm 촬영에서 너무 가까이 섰다.",
        interpretation: "거리 판단이 필요하다.",
        change: "",
        next_experiment: "다음 촬영에서 먼저 거리를 확인한다.",
        related_objects: ["[[최진웅]]"]
      },
      {
        evidence_id: "daily-2026-07-20-e02",
        title: "얇은 경험",
        context: "",
        experience: "운동했다.",
        interpretation: "",
        change: "",
        next_experiment: "",
        related_objects: []
      }
    ],
    knowledge_candidates: [
      {
        label: "85mm 촬영 전 거리를 먼저 확인한다.",
        source_evidence_ids: ["daily-2026-07-20-e01"],
        confidence: "explicit",
        suggested_domain: "wedding",
        suggested_topics: ["shooting"]
      },
      {
        label: "운동을 계속한다.",
        source_evidence_ids: ["daily-2026-07-20-e02"],
        confidence: "low",
        suggested_domain: "workout",
        suggested_topics: []
      }
    ]
  };
}

function savedBlocks() {
  return [
    {
      evidence_id: "daily-2026-07-20-e03",
      title: "촬영 거리",
      context: "work",
      experience: "85mm 촬영에서 너무 가까이 섰다.",
      interpretation: "거리 판단이 필요하다.",
      change: "",
      next_experiment: "다음 촬영에서 먼저 거리를 확인한다.",
      related_objects: ["[[최진웅]]"]
    }
  ];
}

function testOnlyHumanSelectedRowsBecomeCandidateDrafts() {
  // Given: two AI candidates but only the first row and its Evidence were selected by a human.
  // When: the post-Evidence handoff prepares candidate drafts after a stale ID remap.
  const result = reflection.prepareKnowledgeCandidateHandoff(proposal(), {
    selectedCandidateIndexes: [0],
    selectedEvidenceIds: ["daily-2026-07-20-e01"],
    savedBlocks: savedBlocks(),
    evidenceIdMap: { "daily-2026-07-20-e01": "daily-2026-07-20-e03" },
    dailyPath: "DAILY/DAILY/2026-07-20.md"
  });

  // Then: only the selected row is ready, keeping remapped Evidence, selected Object links, confidence, taxonomy, and Daily provenance.
  assert.equal(result.ready.length, 1);
  assert.equal(result.blocked.length, 0);
  assert.deepEqual(result.ready[0], {
    title: "85mm 촬영 전 거리를 먼저 확인한다.",
    statement: "85mm 촬영 전 거리를 먼저 확인한다.",
    reason: "촬영 거리",
    source_type: "daily_evidence",
    source_evidence_ids: ["daily-2026-07-20-e03"],
    source_objects: ["[[최진웅]]", "[[DAILY/DAILY/2026-07-20]]"],
    confidence: "explicit",
    suggested_domain: "wedding",
    suggested_topics: ["shooting"],
    approval_note: ""
  });
  assert.equal("evidence_quality" in result.ready[0], false);
}

function testThinEvidenceNeedsHumanOverrideBeforeCandidateSave() {
  // Given: a selected candidate sourced from thin but valid Evidence.
  // When: the human did not provide the separate override confirmation.
  const pending = reflection.prepareKnowledgeCandidateHandoff(proposal(), {
    selectedCandidateIndexes: [1],
    selectedEvidenceIds: ["daily-2026-07-20-e02"],
    savedBlocks: [proposal().evidence_blocks[1]],
    evidenceIdMap: {},
    dailyPath: "DAILY/DAILY/2026-07-20.md"
  });

  // Then: the save is blocked with Korean recovery guidance, without inventing a persisted quality field.
  assert.equal(pending.ready.length, 0);
  assert.equal(pending.blocked.length, 1);
  assert.match(pending.blocked[0].message, /Evidence 보완/);
  assert.deepEqual(pending.blocked[0].quality.reason_codes, [
    "missing_context",
    "missing_interpretation_or_change",
    "missing_next_experiment"
  ]);

  // Given: the human explicitly overrides the thin guidance with a reason.
  // When: the same candidate is prepared after Evidence confirmation.
  const overridden = reflection.prepareKnowledgeCandidateHandoff(proposal(), {
    selectedCandidateIndexes: [1],
    selectedEvidenceIds: ["daily-2026-07-20-e02"],
    savedBlocks: [proposal().evidence_blocks[1]],
    evidenceIdMap: {},
    dailyPath: "DAILY/DAILY/2026-07-20.md",
    thinOverrides: { "daily-2026-07-20-e02": "짧은 기록이지만 직접 확인했다." }
  });

  // Then: the explicit human note, not a quality status, is retained for the candidate workflow.
  assert.equal(overridden.ready.length, 1);
  assert.equal(overridden.ready[0].approval_note, "짧은 기록이지만 직접 확인했다.");
  assert.equal("evidence_quality" in overridden.ready[0], false);
}

function testUnselectedOrStaleEvidenceCannotWriteCandidateDrafts() {
  // Given: an AI response, a cancelled/revised selection, or a selected row whose source Evidence was not saved.
  // When: no selected row is supplied, or the saved Evidence no longer matches its provenance.
  const noSelection = reflection.prepareKnowledgeCandidateHandoff(proposal(), {
    selectedCandidateIndexes: [],
    selectedEvidenceIds: [],
    savedBlocks: [],
    evidenceIdMap: {},
    dailyPath: "DAILY/DAILY/2026-07-20.md"
  });
  const stale = reflection.prepareKnowledgeCandidateHandoff(proposal(), {
    selectedCandidateIndexes: [0],
    selectedEvidenceIds: ["daily-2026-07-20-e01"],
    savedBlocks: [],
    evidenceIdMap: {},
    dailyPath: "DAILY/DAILY/2026-07-20.md"
  });

  // Then: no draft is made; callers therefore have nothing to persist.
  assert.deepEqual(noSelection.ready, []);
  assert.deepEqual(noSelection.blocked, []);
  assert.deepEqual(stale.ready, []);
  assert.equal(stale.blocked.length, 1);
  assert.match(stale.blocked[0].message, /출처 Evidence/);
}

async function testJournalViewPersistsOnlyConfirmedSelectedRowsThroughSharedStore() {
  // Given: the post-save callback payload and a shared Candidate store fake.
  const previousAi = global.DailyReflectionAI;
  const previousStore = global.KnowledgeCandidateStore;
  const writes = [];
  global.DailyReflectionAI = reflection;
  global.KnowledgeCandidateStore = {
    saveCandidate: async (_app, candidate) => {
      writes.push(candidate);
      return { ...candidate, path: `PARA/RESOURCES/Knowledge/Candidates/${candidate.title}.md` };
    }
  };

  try {
    // When: the explicit Evidence confirmation has completed with only candidate row 0 selected.
    const result = await journalView.saveSelectedKnowledgeCandidatesAfterEvidence({}, {
      evidenceConfirmed: true,
      proposal: proposal(),
      selectedCandidateIndexes: [0],
      selectedEvidenceIds: ["daily-2026-07-20-e01"],
      saveResult: {
        path: "DAILY/DAILY/2026-07-20.md",
        blocks: savedBlocks(),
        evidenceIdMap: { "daily-2026-07-20-e01": "daily-2026-07-20-e03" }
      }
    });

    // Then: JournalView writes the one selected candidate through the shared store and never persists quality.
    assert.equal(result.saved.length, 1);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].source_evidence_ids, ["daily-2026-07-20-e03"]);
    assert.deepEqual(writes[0].source_objects, ["[[최진웅]]", "[[DAILY/DAILY/2026-07-20]]"]);
    assert.equal("evidence_quality" in writes[0], false);

    // Given: a cancellation, revision, or AI response has no completed Evidence confirmation.
    // When: the handoff is invoked without confirmation.
    const skipped = await journalView.saveSelectedKnowledgeCandidatesAfterEvidence({}, {
      evidenceConfirmed: false,
      proposal: proposal(),
      selectedCandidateIndexes: [0],
      selectedEvidenceIds: ["daily-2026-07-20-e01"]
    });

    // Then: the shared store receives no additional write.
    assert.deepEqual(skipped.saved, []);
    assert.equal(writes.length, 1);

    // Given: Evidence was confirmed but no Candidate row was explicitly selected.
    // When: the post-Evidence save handler receives the empty selection.
    const noSelection = await journalView.saveSelectedKnowledgeCandidatesAfterEvidence({}, {
      evidenceConfirmed: true,
      proposal: proposal(),
      selectedCandidateIndexes: [],
      selectedEvidenceIds: ["daily-2026-07-20-e01"],
      saveResult: { path: "DAILY/DAILY/2026-07-20.md", blocks: savedBlocks(), evidenceIdMap: {} }
    });

    // Then: it writes nothing.
    assert.deepEqual(noSelection.saved, []);
    assert.equal(writes.length, 1);

    // Given: a selected Candidate whose Evidence went stale before the atomic Evidence save.
    // When: the post-Evidence save handler receives no matching committed block.
    const stale = await journalView.saveSelectedKnowledgeCandidatesAfterEvidence({}, {
      evidenceConfirmed: true,
      proposal: proposal(),
      selectedCandidateIndexes: [0],
      selectedEvidenceIds: ["daily-2026-07-20-e01"],
      saveResult: { path: "DAILY/DAILY/2026-07-20.md", blocks: [], evidenceIdMap: {} }
    });

    // Then: it reports recovery guidance and writes nothing.
    assert.equal(stale.saved.length, 0);
    assert.equal(stale.blocked.length, 1);
    assert.match(stale.blocked[0].message, /출처 Evidence/);
    assert.equal(writes.length, 1);
  } finally {
    if (previousAi === undefined) delete global.DailyReflectionAI;
    else global.DailyReflectionAI = previousAi;
    if (previousStore === undefined) delete global.KnowledgeCandidateStore;
    else global.KnowledgeCandidateStore = previousStore;
  }
}

testOnlyHumanSelectedRowsBecomeCandidateDrafts();
testThinEvidenceNeedsHumanOverrideBeforeCandidateSave();
testUnselectedOrStaleEvidenceCannotWriteCandidateDrafts();
testJournalViewPersistsOnlyConfirmedSelectedRowsThroughSharedStore()
  .then(() => console.log("Daily reflection candidate handoff tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
