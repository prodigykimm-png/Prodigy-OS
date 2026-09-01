"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.KnowledgeExplorerBriefCore = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-core.js"));
global.KnowledgeExplorerBriefPolicy = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-policy.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"));

function packet() {
  return {
    schema_version: 1,
    domain: "reading",
    domain_label: "독서",
    signals: {
      recent_additions: [{ source_id: "source-1", title: "질문 중심 독서" }],
      explicit_link_frequency: [],
      repeated_related_topics: [],
      unclassified_items: [],
    },
  };
}

test("Knowledge Explorer Brief is deterministic until the explicit AI action", async () => {
  let calls = 0;
  const consumerRuntime = {
    async requestStructured(request) {
      calls += 1;
      assert.equal(request.consumerId, "knowledge.explorer_brief");
      return {
        payload: { schema_version: 1, summary_lines: ["질문 중심 독서를 확인합니다."], source_ids: ["source-1"] },
        receipt: { provider_key: "fake", model: "fake-model" },
      };
    },
  };
  const service = global.KnowledgeExplorerBriefRuntime.createKnowledgeExplorerBriefService({ consumerRuntime });
  const deterministic = await service.generateBrief(packet(), {});
  assert.equal(deterministic.status, "deterministic");
  assert.equal(calls, 0);
  const ai = await service.generateBrief(packet(), { aiRequested: true });
  assert.equal(ai.status, "ai", ai.redacted_status);
  assert.equal(calls, 1);
  assert.deepEqual(ai.ai_summary.summary_lines, ["질문 중심 독서를 확인합니다."]);
});

test("Knowledge non-Wiki services own no provider config, retry, or deadline", () => {
  for (const name of [
    "knowledge-source-batch-service.js",
    "knowledge-explorer-brief-service.js",
    "knowledge-authoring-hub-adapter.js",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8");
    assert.doesNotMatch(source, /AIProviderService|ProjectWorkflowDraftService|loadProviderConfig|defaultProvider|fallbackProvider/u, name);
  }
  const brief = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"), "utf8");
  assert.doesNotMatch(brief, /setTimeout|Promise\.race/u);
});
