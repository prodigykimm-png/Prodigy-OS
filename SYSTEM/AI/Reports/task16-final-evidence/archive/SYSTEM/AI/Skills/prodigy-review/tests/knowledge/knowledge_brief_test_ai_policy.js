"use strict";

const { assert, brief, packet, syntheticProviderConfig } = require("./knowledge_brief_test_helpers.js");

async function testUninjectedServiceNeverUsesGlobalProvider() {
  const signalPacket = packet();
  const previousProvider = globalThis.AIProviderService;
  const previousConfig = globalThis.ProjectWorkflowDraftService;
  let providerCalls = 0;
  let configCalls = 0;
  globalThis.AIProviderService = {
    async requestStructuredJson() {
      providerCalls += 1;
      return { schema_version: 1, summary_lines: ["global provider"], source_ids: ["ZETA/Coding/Main.md"] };
    }
  };
  globalThis.ProjectWorkflowDraftService = {
    async loadProviderConfig() {
      configCalls += 1;
      return syntheticProviderConfig();
    }
  };

  try {
    // Given: provider-shaped global objects but no injected dependencies.
    // When: a deterministic brief is generated.
    // Then: globals are never consulted and no AI request is made.
    const result = await brief.createKnowledgeExplorerBriefService().generateBrief(signalPacket);
    assert.equal(result.status, "deterministic");
    assert.equal(providerCalls, 0);
    assert.equal(configCalls, 0);
  } finally {
    if (previousProvider === undefined) delete globalThis.AIProviderService;
    else globalThis.AIProviderService = previousProvider;
    if (previousConfig === undefined) delete globalThis.ProjectWorkflowDraftService;
    else globalThis.ProjectWorkflowDraftService = previousConfig;
  }
}

function createPolicyService(summaryLines) {
  return brief.createKnowledgeExplorerBriefService({
    aiProviderService: {
      async requestStructuredJson() {
        return { schema_version: 1, summary_lines: summaryLines, source_ids: ["ZETA/Coding/Main.md"] };
      }
    },
    providerConfigService: { async loadProviderConfig() { return syntheticProviderConfig(); } }
  });
}

async function testKoreanOutcomeClaimsAreRejected() {
  // Given: a Korean AI summary that claims an outcome.
  // When: the summary is normalized.
  // Then: it falls back to deterministic facts instead of accepting the claim.
  const result = await createPolicyService(["제공된 지식이 활용되었고 검증되었습니다."])
    .generateBrief(packet(), { providerKey: "synthetic" });
  assert.equal(result.status, "invalid_response");
  assert.equal(result.ai_summary, null);
}

async function testFactualKoreanLinksAndMentionsRemainAllowed() {
  // Given: a Korean summary that only reports bounded link and mention facts.
  // When: the summary is normalized.
  // Then: it remains eligible as an AI assistive summary.
  const result = await createPolicyService(["이 출처는 2회 연결되었고 관련 항목에서 언급되었습니다."])
    .generateBrief(packet(), { providerKey: "synthetic" });
  assert.equal(result.status, "ai");
  assert.deepEqual(result.ai_summary.summary_lines, ["이 출처는 2회 연결되었고 관련 항목에서 언급되었습니다."]);
}

function testKoreanFormalOutcomeInflectionsAreRejected() {
  const allowlist = new Set(["ZETA/Coding/Main.md"]);
  const outcomeLines = ["사용됩니다.", "활용됩니다.", "적용됩니다.", "검증됩니다.", "확인됩니다."];

  // Given: formal Korean passive outcome claims for every prohibited action.
  // When: each claim is normalized as an AI summary.
  // Then: no inflection can bypass the semantic outcome guard.
  for (const line of outcomeLines) {
    assert.throws(() => brief.normalizeAiSummary({
      schema_version: 1,
      summary_lines: [line],
      source_ids: ["ZETA/Coding/Main.md"]
    }, allowlist), /forbidden outcome claim/, line);
  }
}

module.exports = {
  testUninjectedServiceNeverUsesGlobalProvider,
  testKoreanOutcomeClaimsAreRejected,
  testFactualKoreanLinksAndMentionsRemainAllowed,
  testKoreanFormalOutcomeInflectionsAreRejected
};
