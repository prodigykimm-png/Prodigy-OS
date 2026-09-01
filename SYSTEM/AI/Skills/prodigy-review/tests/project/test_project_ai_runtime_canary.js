"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.ProjectWizardCore = require(path.join(ROOT, "SYSTEM/Views/project-wizard-core.js"));
global.ProdigyAIConsumerManifests = require(path.join(ROOT, "SYSTEM/Views/prodigy-ai-consumer-manifests.js"));
global.ProdigyAIClient = require(path.join(ROOT, "SYSTEM/Views/prodigy-ai-client.js"));
const service = require(path.join(ROOT, "SYSTEM/Views/project-workflow-draft-service.js"));

function options(client) {
  return {
    client,
    projectContext: {
      projectName: "AI Runtime canary",
      projectType: "Company",
      startDate: "2026-09-01",
      dueDate: "2026-09-30",
      description: "provider-neutral workflow 확인",
    },
    baseWorkflow: [
      { label: "문제 정의" },
      { label: "구현" },
      { label: "검증" },
      { label: "회고" },
    ],
    schema: global.ProjectWizardCore.WORKFLOW_SCHEMA,
    ownerSessionId: "project-wizard-session",
    operationId: "project-workflow-operation",
    attemptId: "attempt-1",
  };
}

test("Project workflow canary makes exactly one ProdigyAIClient request", async () => {
  const calls = [];
  const client = {
    async requestStructured(request) {
      calls.push(request);
      return {
        ok: true,
        status: "completed",
        payload: {
          workflow: [
            { label: "문제 정의" },
            { label: "구현 범위 확정" },
            { label: "기능 구현" },
            { label: "회귀 검증" },
          ],
        },
        receipt: { provider_key: "fake", model: "fake-model" },
      };
    },
  };
  const result = await service.generateStructuredWorkflow(options(client));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].consumer_id, "project.workflow_draft");
  assert.deepEqual(Object.keys(calls[0]).sort(), [
    "attempt_id", "consumer_id", "operation_id", "owner_session_id", "prompt", "schema", "signal",
  ]);
  assert.equal(result.workflow.length, 4);
  assert.equal(result.provider, "fake");
  assert.equal(result.model, "fake-model");
});

test("runtime failure preserves the caller workflow and exposes a stable code", async () => {
  const original = options(null).baseWorkflow;
  const client = {
    async requestStructured() {
      return { ok: false, status: "failed", error_code: "runtime_unavailable", deterministic_available: true };
    },
  };
  await assert.rejects(service.generateStructuredWorkflow(options(client)), (error) =>
    error.code === "runtime_unavailable");
  assert.deepEqual(options(null).baseWorkflow, original);
});

test("Project service and manifests own no provider transport or profile selection", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/project-workflow-draft-service.js"), "utf8");
  assert.doesNotMatch(source, /AIProviderService|loadProviderConfig|defaultProvider|fallbackProvider|openai-compatible|gemini|codex-exec|antigravity-exec/u);
  const manifestSource = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-manifest.js"), "utf8");
  for (const dependency of [
    "SYSTEM/Views/prodigy-ai-consumer-manifests.js",
    "SYSTEM/Views/prodigy-ai-client.js",
  ]) assert.match(manifestSource, new RegExp(dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
});
