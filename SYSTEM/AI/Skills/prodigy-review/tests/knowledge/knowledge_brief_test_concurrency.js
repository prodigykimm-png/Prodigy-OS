"use strict";

const { assert, brief, delay, packet } = require("./knowledge_brief_test_helpers.js");

async function testStaleResponseGuardAndNoMutation() {
  const signalPacket = packet();
  const events = [];
  const service = brief.createKnowledgeExplorerBriefService({
    // 8be8f69 cutover: AI runs through consumerRuntime.requestStructured,
    // which resolves { payload }; requestTag still flows through options.
    consumerRuntime: {
      async requestStructured({ requestTag }) {
        if (requestTag === "B") {
          events.push("fast");
          return { payload: { schema_version: 1, summary_lines: ["fast"], source_ids: ["ZETA/Coding/Second.md"] } };
        }
        events.push("slow");
        await delay(30);
        return { payload: { schema_version: 1, summary_lines: ["slow"], source_ids: ["ZETA/Coding/Main.md"] } };
      }
    }
  });

  const first = service.generateBrief(signalPacket, { aiRequested: true, requestTag: "A" });
  const second = service.generateBrief(signalPacket, { aiRequested: true, requestTag: "B" });
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
