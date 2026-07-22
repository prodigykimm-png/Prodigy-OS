"use strict";

const {
  assert,
  brief,
  delay,
  packet,
  baseResultAssertions,
  syntheticProviderConfig
} = require("./knowledge_brief_test_helpers.js");

async function testStructuredAiSuccessAndAllowlist() {
  const signalPacket = packet();
  const captured = [];
  const service = brief.createKnowledgeExplorerBriefService({
    aiProviderService: {
      async requestStructuredJson(options) {
        captured.push(options);
        assert.deepEqual(options.schema, brief.BRIEF_AI_SUMMARY_SCHEMA);
        assert.equal(options.prompt.includes("ZETA/Coding/Main.md"), true);
        return {
          schema_version: 1,
          summary_lines: ["Main 과 App 이 오늘 우선이다.", "typescript 토픽이 반복된다."],
          source_ids: ["ZETA/Coding/Main.md", "PARA/Projects/App.md"]
        };
      }
    },
    providerConfigService: { async loadProviderConfig() { return syntheticProviderConfig(); } }
  });

  const result = await service.generateBrief(signalPacket, { providerKey: "synthetic" });

  baseResultAssertions(result, signalPacket);
  assert.equal(result.status, "ai");
  assert.equal(captured.length, 1);
  assert.equal(result.ai_summary.status, "success");
  assert.deepEqual(result.ai_summary.summary_lines, [
    "Main 과 App 이 오늘 우선이다.",
    "typescript 토픽이 반복된다."
  ]);
  assert.deepEqual(result.ai_summary.source_ids, ["ZETA/Coding/Main.md", "PARA/Projects/App.md"]);
}

function providerConfigService() {
  return {
    async loadProviderConfig() {
      return syntheticProviderConfig();
    }
  };
}

function fallbackCases() {
  return [
    { name: "missing-provider", deps: {}, options: {}, expectedStatus: "deterministic" },
    {
      name: "secret-like-error",
      deps: {
        aiProviderService: {
          async requestStructuredJson() {
            throw new Error("API key sk_live_secret_1234567890ABCDE should never leak");
          }
        },
        providerConfigService: providerConfigService()
      },
      options: { providerKey: "synthetic" },
      expectedStatus: "provider_error"
    },
    {
      name: "timeout",
      deps: {
        aiProviderService: {
          async requestStructuredJson({ signal }) {
            return delay(50, {
              schema_version: 1,
              summary_lines: ["late"],
              source_ids: ["ZETA/Coding/Main.md"]
            }).then((value) => {
              if (signal && signal.aborted) throw new Error("aborted");
              return value;
            });
          }
        },
        providerConfigService: providerConfigService()
      },
      options: { providerKey: "synthetic", timeoutMs: 5 },
      expectedStatus: "timeout"
    },
    {
      name: "invalid-json",
      deps: {
        aiProviderService: {
          async requestStructuredJson() {
            throw new Error("Provider did not return valid JSON.");
          }
        },
        providerConfigService: providerConfigService()
      },
      options: { providerKey: "synthetic" },
      expectedStatus: "invalid_response"
    },
    {
      name: "hallucinated-source",
      deps: {
        aiProviderService: {
          async requestStructuredJson() {
            return {
              schema_version: 1,
              summary_lines: ["허용되지 않은 출처"],
              source_ids: ["ZETA/Coding/Main.md", "MISSING/HALLUCINATION.md"]
            };
          }
        },
        providerConfigService: providerConfigService()
      },
      options: { providerKey: "synthetic" },
      expectedStatus: "invalid_response"
    },
    {
      name: "forbidden-used",
      deps: {
        aiProviderService: {
          async requestStructuredJson() {
            return {
              schema_version: 1,
              summary_lines: ["We used the source facts to validate the plan."],
              source_ids: ["ZETA/Coding/Main.md"]
            };
          }
        },
        providerConfigService: providerConfigService()
      },
      options: { providerKey: "synthetic" },
      expectedStatus: "invalid_response"
    }
  ];
}

async function testFailureFallbacks() {
  const signalPacket = packet();
  const deterministic = await brief.createKnowledgeExplorerBriefService().generateBrief(signalPacket);

  for (const testCase of fallbackCases()) {
    const service = brief.createKnowledgeExplorerBriefService(testCase.deps);
    const result = await service.generateBrief(signalPacket, testCase.options);
    assert.deepEqual(result.brief_lines, deterministic.brief_lines, testCase.name);
    assert.equal(result.status, testCase.expectedStatus, testCase.name);
    assert.equal(result.applied, true, testCase.name);
    assert.equal(result.ai_summary, null, testCase.name);
    assert.match(result.redacted_status || "", /redacted|timeout|missing|invalid|provider/i, testCase.name);
  }

  const cancelledService = brief.createKnowledgeExplorerBriefService({
    aiProviderService: {
      async requestStructuredJson() {
        return delay(50, {
          schema_version: 1,
          summary_lines: ["late"],
          source_ids: ["ZETA/Coding/Main.md"]
        });
      }
    },
    providerConfigService: providerConfigService()
  });
  const controller = new AbortController();
  controller.abort();
  const cancelled = await cancelledService.generateBrief(signalPacket, {
    providerKey: "synthetic",
    signal: controller.signal
  });
  assert.deepEqual(cancelled.brief_lines, deterministic.brief_lines);
  assert.equal(cancelled.status, "cancelled");
}

module.exports = { testStructuredAiSuccessAndAllowlist, testFailureFallbacks };
