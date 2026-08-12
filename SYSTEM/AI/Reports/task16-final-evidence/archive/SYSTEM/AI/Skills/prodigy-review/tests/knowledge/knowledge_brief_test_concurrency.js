"use strict";

const { assert, brief, delay, packet, syntheticProviderConfig } = require("./knowledge_brief_test_helpers.js");

async function testStaleResponseGuardAndNoMutation() {
  const signalPacket = packet();
  const events = [];
  const service = brief.createKnowledgeExplorerBriefService({
    aiProviderService: {
      async requestStructuredJson({ signal, requestTag }) {
        if (requestTag === "B") {
          events.push("fast");
          return { schema_version: 1, summary_lines: ["fast"], source_ids: ["ZETA/Coding/Second.md"] };
        }
        events.push("slow");
        await delay(30);
        if (signal && signal.aborted) throw new Error("aborted");
        return { schema_version: 1, summary_lines: ["slow"], source_ids: ["ZETA/Coding/Main.md"] };
      }
    },
    providerConfigService: { async loadProviderConfig() { return syntheticProviderConfig(); } }
  });

  const first = service.generateBrief(signalPacket, { providerKey: "synthetic", requestTag: "A" });
  const second = service.generateBrief(signalPacket, { providerKey: "synthetic", requestTag: "B" });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(secondResult.brief_lines, [
    "최근 추가: Main, Second",
    "가장 많이 연결된 항목: App (2회)",
    "반복 토픽: typescript (2회)",
    "미분류: Unknown"
  ]);
  assert.equal(secondResult.status, "ai");
  assert.equal(secondResult.applied, true);
  assert.equal(firstResult.applied, false);
  assert.equal(firstResult.status, "stale");
  assert.equal(service.getLatestBrief().request_id, secondResult.request_id);
  assert.equal(events.length >= 2, true);
}

module.exports = { testStaleResponseGuardAndNoMutation };
