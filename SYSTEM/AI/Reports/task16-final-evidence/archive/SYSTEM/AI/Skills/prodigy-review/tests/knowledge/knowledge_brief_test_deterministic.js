"use strict";

const { assert, brief, packet, baseResultAssertions } = require("./knowledge_brief_test_helpers.js");

async function testDeterministicFallbackWithoutProvider() {
  const signalPacket = packet();
  const before = JSON.stringify(signalPacket);
  const service = brief.createKnowledgeExplorerBriefService();

  const result = await service.generateBrief(signalPacket);

  assert.equal(JSON.stringify(signalPacket), before);
  baseResultAssertions(result, signalPacket);
  assert.equal(result.status, "deterministic");
  assert.equal(result.applied, true);
  assert.equal(result.ai_summary, null);
}

module.exports = { testDeterministicFallbackWithoutProvider };
