"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.ProdigyAIConsumerRuntime = require(path.join(ROOT, "SYSTEM/Views/prodigy-ai-consumer-runtime.js"));
const weekly = require(path.join(ROOT, "SYSTEM/Views/weekly-filter-ai.js"));

test("Weekly Filter sends one bounded request through its declared consumer", async () => {
  const calls = [];
  const client = {
    async requestStructured(request) {
      calls.push(request);
      return {
        ok: true,
        payload: {
          key_learnings: [{ pattern: "반복", learning: "관찰", evidence_refs: ["e1"] }],
          interpreted_patterns: [],
          next_week_direction: {
            continue_items: [],
            observe_items: ["관찰"],
            increase_attention: [],
            pending_items: [],
          },
          suggested_principles: [],
        },
        receipt: { provider_key: "fake", model: "fake-model" },
      };
    },
  };
  const result = await weekly.generateWeeklyAI({
    app: {},
    client,
    review: { period: { week: "2026-W36", start: "2026-08-31", end: "2026-09-06" }, references: [], findings: [] },
    evidenceItems: [{ evidence_id: "e1", experience: "반복 관찰" }],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].consumer_id, "journal.weekly_filter");
  assert.equal(result.provider, "fake");
  assert.equal(result.model, "fake-model");
});

test("Journal AI production modules contain no provider transport or profile selection", () => {
  for (const name of ["daily-reflection-ai.js", "weekly-filter-ai.js", "monthly-validation-ai.js"]) {
    const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8");
    assert.doesNotMatch(source, /AIProviderService|ProjectWorkflowDraftService|loadProviderConfig|defaultProvider|fallbackProvider/u, name);
  }
});
