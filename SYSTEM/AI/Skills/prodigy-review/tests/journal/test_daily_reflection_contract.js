"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reflection = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-ai.js"));

function validPayload() {
  return {
    evidence_blocks: [
      {
        title: "85mm 촬영 거리가 너무 가까웠음",
        context: "work",
        experience: "85mm 가로 촬영 때 너무 앞에서 촬영해 초보스러운 컷이 나왔다.",
        interpretation: "",
        change: "",
        next_experiment: "",
        related_objects: []
      },
      {
        title: "부케 진행 전 의상 정리를 확인하지 못함",
        context: "work",
        experience: "헬퍼가 신부 옷을 정리 중인데 부케를 던지게 할 뻔했다.",
        interpretation: "",
        change: "주위를 살피고 진행한다.",
        next_experiment: "원판 진행 전 헬퍼의 정리 상태를 확인한다.",
        related_objects: []
      }
    ],
    knowledge_candidates: [{
      label: "원판 촬영 전 헬퍼의 의상 정리 완료 여부를 확인한다.",
      source_evidence_indexes: [1],
      confidence: "explicit"
    }],
    resource_candidates: [{
      name: "국민연금 컨벤션홀",
      suggested_type: "resource",
      source_evidence_indexes: [0]
    }],
    object_linking_suggestions: [{
      name: "최진웅",
      object_kind: "people",
      source_evidence_indexes: [0, 1],
      existence: "unknown"
    }],
    pre_routing_suggestions: [{
      source_evidence_indexes: [0, 1],
      path: ["work", "wedding", "shooting"],
      confidence: "explicit"
    }],
    uncertainties: []
  };
}

function testReflectionValidation() {
  const normalized = reflection.normalizeProposal(validPayload(), {
    dateStr: "2026-07-19",
    existingBlocks: [{ evidence_id: "daily-2026-07-19-e02" }]
  });
  assert.equal(normalized.evidence_blocks[0].evidence_id, "daily-2026-07-19-e03");
  assert.equal(normalized.evidence_blocks[1].evidence_id, "daily-2026-07-19-e04");
  assert.equal(normalized.knowledge_candidates[0].source_evidence_ids[0], "daily-2026-07-19-e04");
  assert.deepEqual(normalized.pre_routing_suggestions[0].path, ["work", "wedding", "shooting"]);

  const unknown = validPayload();
  unknown.extra = true;
  assert.throws(() => reflection.normalizeProposal(unknown, { dateStr: "2026-07-19" }), /unknown/i);

  const badReference = validPayload();
  badReference.knowledge_candidates[0].source_evidence_indexes = [9];
  assert.throws(() => reflection.normalizeProposal(badReference, { dateStr: "2026-07-19" }), /source/i);

  const inventedLink = validPayload();
  inventedLink.evidence_blocks[0].related_objects = ["[[최진웅]]"];
  assert.throws(() => reflection.normalizeProposal(inventedLink, { dateStr: "2026-07-19" }), /related_objects/i);
}

async function testCanonicalContractLoading() {
  const files = {
    "SYSTEM/AI/Skills/prodigy-daily-reflection/references/runtime-contract.md": "runtime-v1",
    "SYSTEM/AI/Skills/prodigy-daily-reflection/references/response-schema.json": JSON.stringify({ type: "object" })
  };
  const app = { vault: { getAbstractFileByPath: (filePath) => files[filePath] ? { path: filePath } : null, read: async (file) => files[file.path] } };
  const loaded = await reflection.loadRuntimeContract(app);
  assert.equal(loaded.contract, "runtime-v1");
  assert.deepEqual(loaded.schema, { type: "object" });
  assert.match(loaded.contractPath, /^SYSTEM\/AI\/Skills\/prodigy-daily-reflection\//);
}

function testSelectedEvidenceOnly() {
  const proposal = reflection.normalizeProposal(validPayload(), { dateStr: "2026-07-19" });
  proposal.object_linking_suggestions[0] = Object.assign(proposal.object_linking_suggestions[0], {
    existence: "existing",
    resolved_path: "PARA/RESOURCES/CONTACTS/최진웅.md",
    wiki_link: "[[최진웅]]"
  });
  const selected = reflection.selectEvidenceBlocks(proposal, [proposal.evidence_blocks[1].evidence_id]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].title, "부케 진행 전 의상 정리를 확인하지 못함");
  assert.equal("knowledge_candidates" in selected[0], false);
  assert.deepEqual(selected[0].related_objects, []);

  const linked = reflection.selectEvidenceBlocks(proposal, [proposal.evidence_blocks[1].evidence_id], ["PARA/RESOURCES/CONTACTS/최진웅.md"]);
  assert.deepEqual(linked[0].related_objects, ["[[최진웅]]"]);

  proposal.evidence_blocks[1].context = "freeform";
  assert.throws(() => reflection.selectEvidenceBlocks(proposal, [proposal.evidence_blocks[1].evidence_id]), /context/i);
}

async function testLocalObjectResolution() {
  const files = [
    { path: "PARA/RESOURCES/CONTACTS/최진웅.md", basename: "최진웅" },
    { path: "PARA/RESOURCES/CONTACTS/윤채연.md", basename: "윤채연" },
    { path: "PARA/PROJECTS/Other/윤채연.md", basename: "윤채연" }
  ];
  const app = {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: (file) => file.basename === "최진웅" ? { frontmatter: { aliases: ["최 대표"] } } : { frontmatter: {} } }
  };
  const proposal = reflection.normalizeProposal(validPayload(), { dateStr: "2026-07-19" });
  proposal.object_linking_suggestions.push({
    name: "윤채연",
    object_kind: "people",
    source_evidence_ids: [proposal.evidence_blocks[1].evidence_id],
    existence: "unknown"
  });
  proposal.object_linking_suggestions.push({
    name: "없는 사람",
    object_kind: "people",
    source_evidence_ids: [proposal.evidence_blocks[1].evidence_id],
    existence: "unknown"
  });
  await reflection.resolveObjectLinks(app, proposal);
  assert.equal(proposal.object_linking_suggestions[0].existence, "existing");
  assert.equal(proposal.object_linking_suggestions[0].resolved_path, "PARA/RESOURCES/CONTACTS/최진웅.md");
  assert.equal(proposal.object_linking_suggestions[0].wiki_link, "[[최진웅]]");
  assert.equal(proposal.object_linking_suggestions[1].existence, "existing");
  assert.equal(proposal.object_linking_suggestions[2].existence, "missing");
}

function testProviderProposalExcludesLocalLinkState() {
  const proposal = reflection.normalizeProposal(validPayload(), { dateStr: "2026-07-19" });
  proposal.object_linking_suggestions[0] = Object.assign(proposal.object_linking_suggestions[0], {
    existence: "existing",
    resolved_path: "PARA/RESOURCES/CONTACTS/최진웅.md",
    wiki_link: "[[최진웅]]"
  });
  const providerProposal = reflection.providerProposal(proposal);
  assert.deepEqual(providerProposal.object_linking_suggestions[0], {
    name: "최진웅",
    object_kind: "people",
    source_evidence_indexes: [0, 1],
    existence: "unknown"
  });
  assert.deepEqual(providerProposal.evidence_blocks.map((block) => block.related_objects), [[], []]);
  const serialized = JSON.stringify(providerProposal);
  assert.doesNotMatch(serialized, /PARA\/RESOURCES\/CONTACTS/);
  assert.doesNotMatch(serialized, /\[\[최진웅\]\]/);
  assert.doesNotMatch(serialized, /resolved_path|wiki_link/);
}

async function main() {
  testReflectionValidation();
  await testCanonicalContractLoading();
  testSelectedEvidenceOnly();
  await testLocalObjectResolution();
  testProviderProposalExcludesLocalLinkState();
  console.log("Daily reflection contract tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
