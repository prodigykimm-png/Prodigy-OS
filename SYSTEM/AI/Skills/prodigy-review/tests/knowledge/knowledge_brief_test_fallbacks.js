"use strict";

const {
  assert,
  brief,
  delay,
  packet,
  baseResultAssertions
} = require("./knowledge_brief_test_helpers.js");

async function testStructuredAiSuccessAndAllowlist() {
  const signalPacket = packet();
  const captured = [];
  const service = brief.createKnowledgeExplorerBriefService({
    // 8be8f69 cutover: AI runs through consumerRuntime.requestStructured,
    // which resolves { payload }; prompts carry the schema and the JSON
    // payload with allowed source ids.
    consumerRuntime: {
      async requestStructured(options) {
        captured.push(options);
        assert.deepEqual(options.schema, brief.BRIEF_AI_SUMMARY_SCHEMA);
        assert.equal(options.prompt.includes("ZETA/Coding/Main.md"), true);
        return {
          payload: {
            schema_version: 1,
            summary_lines: ["Main 과 App 이 오늘 우선이다.", "typescript 토픽이 반복된다."],
            source_ids: ["ZETA/Coding/Main.md", "PARA/Projects/App.md"]
          }
        };
      }
    }
  });

  const result = await service.generateBrief(signalPacket, { aiRequested: true });

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

function fallbackCases() {
  return [
    { name: "missing-provider", deps: {}, options: {}, expectedStatus: "deterministic" },
    {
      name: "secret-like-error",
      deps: {
        consumerRuntime: {
          async requestStructured() {
            throw new Error("API key sk_live_secret_1234567890ABCDE should never leak");
          }
        }
      },
      options: { aiRequested: true },
      expectedStatus: "provider_error"
    },
    {
      // 8be8f69 cutover: the timeoutMs option no longer exists; the runtime
      // reports timeouts with a timeout-coded error, which the service maps
      // to the timeout status (brief-service.js).
      name: "timeout",
      deps: {
        consumerRuntime: {
          async requestStructured() {
            await delay(5);
            throw Object.assign(new Error("runtime timed out"), { code: "timeout" });
          }
        }
      },
      options: { aiRequested: true },
      expectedStatus: "timeout"
    },
    {
      // 8be8f69 cutover: malformed AI payloads throw inside normalizeAiSummary
      // and surface as provider_error (the invalid_response status was removed).
      name: "invalid-json",
      deps: {
        consumerRuntime: {
          async requestStructured() {
            return { payload: "Provider did not return valid JSON." };
          }
        }
      },
      options: { aiRequested: true },
      expectedStatus: "provider_error"
    },
    {
      name: "hallucinated-source",
      deps: {
        consumerRuntime: {
          async requestStructured() {
            return {
              payload: {
                schema_version: 1,
                summary_lines: ["허용되지 않은 출처"],
                source_ids: ["ZETA/Coding/Main.md", "MISSING/HALLUCINATION.md"]
              }
            };
          }
        }
      },
      options: { aiRequested: true },
      expectedStatus: "provider_error"
    },
    {
      name: "forbidden-used",
      deps: {
        consumerRuntime: {
          async requestStructured() {
            return {
              payload: {
                schema_version: 1,
                summary_lines: ["We used the source facts to validate the plan."],
                source_ids: ["ZETA/Coding/Main.md"]
              }
            };
          }
        }
      },
      options: { aiRequested: true },
      expectedStatus: "provider_error"
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
    // 8be8f69 copy: the not-requested fallback says AI summary not requested (brief-service.js).
    assert.match(result.redacted_status || "", /redacted|timeout|missing|invalid|provider|runtime|not requested/i, testCase.name);
  }

  const cancelledService = brief.createKnowledgeExplorerBriefService({
    consumerRuntime: {
      async requestStructured({ signal }) {
        if (signal && signal.aborted) throw Object.assign(new Error("request cancelled"), { code: "cancel_requested" });
        return delay(50, {
          payload: {
            schema_version: 1,
            summary_lines: ["late"],
            source_ids: ["ZETA/Coding/Main.md"]
          }
        });
      }
    }
  });
  const controller = new AbortController();
  controller.abort();
  const cancelled = await cancelledService.generateBrief(signalPacket, {
    aiRequested: true,
    signal: controller.signal
  });
  assert.deepEqual(cancelled.brief_lines, deterministic.brief_lines);
  assert.equal(cancelled.status, "cancelled");
}

module.exports = { testStructuredAiSuccessAndAllowlist, testFailureFallbacks };
