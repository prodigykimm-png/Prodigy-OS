(function (root) {
  "use strict";

  function buildPrompt(projectContext, baseWorkflow) {
    const workflowText = (baseWorkflow || []).map((item, index) => `${index + 1}. ${item.label || item}`).join("\n");
    return [
      "You refine a Prodigy OS Project workflow draft.",
      "Return only JSON matching the provided schema.",
      "Do not create files, Todoist tasks, approvals, deadlines, or people assignments.",
      "Preserve the base workflow unless a step is irrelevant.",
      "Return 4 to 10 short action-oriented Korean labels.",
      "",
      `Project name: ${projectContext.projectName}`,
      `Project type: ${projectContext.projectType}`,
      `Start date: ${projectContext.startDate || "(not provided)"}`,
      `Due date: ${projectContext.dueDate}`,
      `Completion condition: ${projectContext.description || "(not provided)"}`,
      "",
      "Base workflow:",
      workflowText || "(blank)",
    ].join("\n");
  }

  function normalizeProviderPayload(payload) {
    const core = root.ProjectWizardCore;
    if (!core) throw new Error("ProjectWizardCore is not loaded.");
    const result = core.validateProviderWorkflow(payload);
    if (!result.ok) throw new Error(result.errors.join(" "));
    return { workflow: result.workflow.map((item) => ({ label: item.label })) };
  }

  function clientFor(options) {
    if (options.client && typeof options.client.requestStructured === "function") return options.client;
    if (!root.ProdigyAIClient || typeof root.ProdigyAIClient.createClient !== "function") {
      const error = new Error("Prodigy AI Runtime client is not loaded.");
      error.code = "runtime_unavailable";
      throw error;
    }
    return root.ProdigyAIClient.createClient({ app: options.app });
  }

  function requiredIdentity(options, key, code) {
    const value = String(options[key] || "").trim();
    if (value) return value;
    const error = new Error(`Project AI request identity is missing: ${key}`);
    error.code = code;
    throw error;
  }

  async function generateStructuredWorkflow(options) {
    const client = clientFor(options);
    const response = await client.requestStructured({
      consumer_id: "project.workflow_draft",
      owner_session_id: requiredIdentity(options, "ownerSessionId", "invalid_owner_session"),
      operation_id: requiredIdentity(options, "operationId", "invalid_operation_id"),
      attempt_id: requiredIdentity(options, "attemptId", "invalid_attempt_id"),
      prompt: buildPrompt(options.projectContext, options.baseWorkflow),
      schema: options.schema || (root.ProjectWizardCore && root.ProjectWizardCore.WORKFLOW_SCHEMA),
      signal: options.signal,
    });
    if (!response || response.ok !== true) {
      const error = new Error("AI workflow refinement is unavailable.");
      error.code = String(response && response.error_code || "runtime_unavailable");
      throw error;
    }
    const normalized = normalizeProviderPayload(response.payload);
    return {
      workflow: normalized.workflow,
      provider: String(response.receipt && response.receipt.provider_key || ""),
      model: String(response.receipt && response.receipt.model || ""),
      receipt: response.receipt,
    };
  }

  function redactError(error) {
    const code = String(error && error.code || "");
    const messages = {
      runtime_unavailable: "AI Runtime 플러그인을 사용할 수 없습니다.",
      protocol_mismatch: "AI Runtime 버전이 맞지 않습니다.",
      protocol_hash_mismatch: "AI Runtime 계약이 맞지 않습니다.",
      capability_unavailable: "사용 가능한 AI provider가 없습니다.",
      consent_required: "AI 전송 동의가 필요합니다.",
      timeout: "AI 요청 시간이 초과되었습니다.",
      cancel_requested: "AI 요청 취소를 요청했습니다.",
    };
    return messages[code] || "AI workflow refinement failed.";
  }

  const api = Object.freeze({
    buildPrompt,
    generateStructuredWorkflow,
    normalizeProviderPayload,
    redactError,
  });
  root.ProjectWorkflowDraftService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
