"use strict";

const assert = require("node:assert/strict");
const { brief } = require("./knowledge_brief_test_helpers.js");
const { testDeterministicFallbackWithoutProvider } = require("./knowledge_brief_test_deterministic.js");
const {
  testUninjectedServiceNeverUsesGlobalProvider,
  testKoreanOutcomeClaimsAreRejected,
  testFactualKoreanLinksAndMentionsRemainAllowed,
  testKoreanFormalOutcomeInflectionsAreRejected
} = require("./knowledge_brief_test_ai_policy.js");
const { testStructuredAiSuccessAndAllowlist, testFailureFallbacks } = require("./knowledge_brief_test_fallbacks.js");
const { testStaleResponseGuardAndNoMutation } = require("./knowledge_brief_test_concurrency.js");

async function main() {
  assert.equal(typeof brief.createKnowledgeExplorerBriefService, "function");
  assert.equal(typeof brief.buildDeterministicBrief, "function");
  assert.equal(typeof brief.normalizeBriefSummary, "function");
  assert.equal(typeof brief.BRIEF_AI_SUMMARY_SCHEMA, "object");

  await testDeterministicFallbackWithoutProvider();
  await testUninjectedServiceNeverUsesGlobalProvider();
  await testKoreanOutcomeClaimsAreRejected();
  await testFactualKoreanLinksAndMentionsRemainAllowed();
  testKoreanFormalOutcomeInflectionsAreRejected();
  await testStructuredAiSuccessAndAllowlist();
  await testFailureFallbacks();
  await testStaleResponseGuardAndNoMutation();

  console.log("Knowledge Explorer brief tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
