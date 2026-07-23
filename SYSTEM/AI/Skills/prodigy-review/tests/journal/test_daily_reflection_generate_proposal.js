"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const reflection = require(path.join(ROOT, "SYSTEM/Views/daily-reflection-ai.js"));

const CONTRACT_PATH = "SYSTEM/AI/Skills/prodigy-daily-reflection/references/runtime-contract.md";
const SCHEMA_PATH = "SYSTEM/AI/Skills/prodigy-daily-reflection/references/response-schema.json";

function providerPayload() {
  return {
    evidence_blocks: [
      {
        title: "2025타경2391 패찰과 낙찰",
        context: "auction",
        experience: "2025타경2391(1),(2)는 나는 패찰했고 타인이 낙찰받은 것 같다.",
        interpretation: "부산은 과열된 것 같다.",
        change: "인천, 경기, 서울 쪽으로 눈을 돌린다.",
        next_experiment: "",
        related_objects: []
      },
      {
        title: "보증금 반환 책임자 확인",
        context: "work",
        experience: "큰 금액의 보증금을 맡길 때 반환 절차와 책임자를 확인해야겠다고 느꼈다.",
        interpretation: "",
        change: "반환 절차와 책임자를 확인한다.",
        next_experiment: "",
        related_objects: []
      },
      {
        title: "조효진과 김나래 식사",
        context: "personal",
        experience: "조효진과 김나래가 이재모 피자를 먹었다.",
        interpretation: "관계가 강화되었다.",
        change: "",
        next_experiment: "",
        related_objects: []
      },
      {
        title: "투자 판단 보류",
        context: "decision",
        experience: "부동산 투자 결론은 아직 정하지 않았다.",
        interpretation: "",
        change: "",
        next_experiment: "",
        related_objects: []
      }
    ],
    knowledge_candidates: [
      {
        label: "보증금 반환 절차와 책임자를 확인한다.",
        source_evidence_indexes: [1],
        confidence: "explicit"
      },
      {
        label: "계약 책임 범위와 세금 리스크와 법률 자문은 합의 문장에 남긴다.",
        source_evidence_indexes: [1],
        confidence: "explicit"
      }
    ],
    resource_candidates: [{
      name: "이재모 피자",
      suggested_type: "resource",
      source_evidence_indexes: [2]
    }],
    object_linking_suggestions: [
      {
        name: "2025타경2391",
        object_kind: "auction",
        source_evidence_indexes: [0],
        existence: "unknown"
      },
      {
        name: "이재모 피자",
        object_kind: "people",
        source_evidence_indexes: [2],
        existence: "unknown"
      },
      {
        name: "김나래",
        object_kind: "people",
        source_evidence_indexes: [2],
        existence: "unknown"
      }
    ],
    pre_routing_suggestions: [{
      source_evidence_indexes: [0],
      path: ["auction", "인천", "경기", "서울"],
      confidence: "inferred"
    }],
    uncertainties: ["부산 과열 여부"]
  };
}

function fakeApp(writeLog) {
  const files = {
    [CONTRACT_PATH]: "runtime-v1",
    [SCHEMA_PATH]: JSON.stringify({ type: "object" })
  };
  const write = (name) => async () => {
    writeLog.push(name);
    throw new Error(`Unexpected vault write: ${name}`);
  };
  return {
    vault: {
      getAbstractFileByPath: (filePath) => files[filePath] ? { path: filePath } : null,
      read: async (file) => files[file.path],
      getMarkdownFiles: () => [
        { path: "PARA/PROJECTS/Auction/부산-2025타경2391_1.md", basename: "부산-2025타경2391_1" },
        { path: "PARA/PROJECTS/Auction/부산-2025타경2391_2.md", basename: "부산-2025타경2391_2" },
        { path: "PARA/RESOURCES/CONTACTS/김나래.md", basename: "김나래" },
        { path: "PARA/RESOURCES/CONTACTS/조효진.md", basename: "조효진" }
      ],
      create: write("create"),
      modify: write("modify"),
      append: write("append"),
      process: write("process"),
      delete: write("delete"),
      rename: write("rename")
    },
    metadataCache: { getFileCache: () => ({ frontmatter: {} }) }
  };
}

async function withFakeConfig(run) {
  const previous = global.ProjectWorkflowDraftService;
  global.ProjectWorkflowDraftService = {
    loadProviderConfig: async () => ({
      defaultProvider: "local",
      providers: {
        local: {
          adapter: "openai-compatible",
          model: "qwen-fixture",
          capabilities: { conservativeProposal: true }
        }
      }
    })
  };
  try {
    await run();
  } finally {
    global.ProjectWorkflowDraftService = previous;
  }
}

async function testGenerateProposalFakeProviderNoWrite() {
  const calls = [];
  const writeLog = [];
  await withFakeConfig(async () => {
    const proposal = await reflection.generateProposal({
      app: fakeApp(writeLog),
      dateStr: "2026-07-22",
      freeText: [
        "2025타경2391(1),(2)는 나는 두 물건 모두 패찰했고, 타인이 둘 다 탈출구 1.5억을 넘는 가격에 낙찰받은 것 같다.",
        "부산은 과열된 것 같다. 인천, 경기, 서울 쪽으로 눈을 돌리던가 방안을 찾아봐야겠다.",
        "큰 금액의 보증금을 맡길 때 반환 절차와 책임자를 확인해야겠다고 느꼈다.",
        "조효진과 김나래가 이재모 피자를 먹었다.",
        "부동산 투자 결론은 아직 정하지 않았다."
      ].join("\n"),
      providerService: { requestStructuredJson: async (options) => { calls.push(options); return providerPayload(); } }
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider.model, "qwen-fixture");
    assert.match(calls[0].prompt, /self-evaluation or tentative judgment/i);
    assert.match(calls[0].prompt, /incidental meal\/food-only block/i);
    assert.equal(proposal.provider, "local");
    assert.equal(proposal.model, "qwen-fixture");
    assert.deepEqual(proposal.evidence_blocks.map((item) => item.title), ["2025타경2391 패찰과 낙찰", "보증금 반환 책임자 확인", "조효진과 김나래 식사", "투자 판단 보류"]);
    assert.equal(proposal.evidence_blocks[0].experience, "2025타경2391(1),(2)는 나는 패찰했고 타인이 낙찰받은 것 같다.");
    assert.equal(proposal.evidence_blocks[0].interpretation, "부산은 과열된 것 같다.");
    assert.equal(proposal.evidence_blocks[0].change, "인천, 경기, 서울 쪽으로 눈을 돌린다.");
    assert.equal(proposal.evidence_blocks[0].next_experiment, "");
    assert.deepEqual(proposal.knowledge_candidates.map((item) => item.label), [
      "보증금 반환 절차와 책임자를 확인한다.",
      "계약 책임 범위와 세금 리스크와 법률 자문은 합의 문장에 남긴다."
    ]);
    assert.deepEqual(proposal.knowledge_candidates.map((item) => item.confidence), ["explicit", "low"]);
    assert.deepEqual(proposal.pre_routing_suggestions.map((item) => item.path), [["auction"]]);
    assert.deepEqual(proposal.resource_candidates.map((item) => item.name), ["이재모 피자"]);
    assert.equal(proposal.object_linking_suggestions.some((item) => item.name === "이재모 피자" && item.object_kind === "people"), false);
    assert.deepEqual(proposal.object_linking_suggestions.filter((item) => item.object_kind === "people").map((item) => item.name).sort(), ["김나래", "조효진"]);
    assert.deepEqual(proposal.object_linking_suggestions.filter((item) => item.object_kind === "auction").map((item) => item.resolved_path).sort(), [
      "PARA/PROJECTS/Auction/부산-2025타경2391_1.md",
      "PARA/PROJECTS/Auction/부산-2025타경2391_2.md"
    ]);
    assert.deepEqual(writeLog, []);
  });
  return "normal";
}

async function testBadProviderDoesNotWrite() {
  const writeLog = [];
  let providerCalls = 0;
  await withFakeConfig(async () => {
    await assert.rejects(
      reflection.generateProposal({
        app: fakeApp(writeLog),
        dateStr: "2026-07-22",
        freeText: "조효진과 김나래가 이재모 피자를 먹었다.",
        providerService: { requestStructuredJson: async () => { providerCalls += 1; return { bad: true }; } }
      }),
      /unknown keys|evidence_blocks/i
    );
  });
  assert.equal(providerCalls, 1);
  assert.deepEqual(writeLog, []);
  return "bad-provider";
}

async function main(mode) {
  if (mode === "bad-provider") {
    assert.equal(await testBadProviderDoesNotWrite(), "bad-provider");
    console.log("Daily reflection generateProposal bad-provider test passed");
    return;
  }
  const executed = [];
  executed.push(await testGenerateProposalFakeProviderNoWrite());
  executed.push(await testBadProviderDoesNotWrite());
  assert.deepEqual(executed, ["normal", "bad-provider"]);
  console.log("Daily reflection generateProposal tests passed");
}

if (require.main === module) {
  main(process.argv[2]).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
