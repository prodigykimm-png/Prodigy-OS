(function (root) {
  "use strict";

  let identityCounter = 0;

  function clientFor(options) {
    if (options.client && typeof options.client.requestStructured === "function") return options.client;
    if (!root.ProdigyAIClient || typeof root.ProdigyAIClient.createClient !== "function") {
      const error = new Error("Prodigy AI Runtime client is not loaded.");
      error.code = "runtime_unavailable";
      throw error;
    }
    return root.ProdigyAIClient.createClient({ app: options.app });
  }

  function identity(options, consumerId) {
    const suffix = `${Date.now()}-${++identityCounter}`;
    return {
      owner_session_id: String(options.ownerSessionId || `${consumerId}-session-${suffix}`),
      operation_id: String(options.operationId || `${consumerId}-operation-${suffix}`),
      attempt_id: String(options.attemptId || "attempt-1"),
    };
  }

  async function ensureConsent(client, consumerId, confirmConsent) {
    if (!client || typeof client.getConsentRequirement !== "function") return { status: "ready" };
    const requirement = client.getConsentRequirement(consumerId);
    if (!requirement || requirement.status !== "consent_required") return requirement || { status: "ready" };
    const confirm = typeof confirmConsent === "function"
      ? confirmConsent
      : typeof root.confirm === "function"
        ? (message) => root.confirm(message)
        : null;
    if (!confirm) {
      const error = new Error("AI 전송 동의가 필요합니다.");
      error.code = "consent_required";
      throw error;
    }
    const manifest = root.ProdigyAIConsumerManifests && root.ProdigyAIConsumerManifests.get
      ? root.ProdigyAIConsumerManifests.get(consumerId)
      : null;
    const accepted = await Promise.resolve(confirm([
      `AI 기능: ${consumerId}`,
      `민감도: ${manifest && manifest.sensitivity || "unknown"}`,
      `Provider profile: ${requirement.profile_id || "미설정"}`,
      `Route: ${requirement.route_class || "미설정"}`,
      "현재 입력 범위를 AI Runtime에 전송합니다.",
      "계속하시겠습니까?",
    ].join("\n")));
    if (!accepted) {
      const error = new Error("AI 전송을 취소했습니다.");
      error.code = "consent_declined";
      throw error;
    }
    const granted = await client.grantConsumer(consumerId);
    if (!granted || granted.status !== "granted") {
      const error = new Error("AI 전송 동의를 저장하지 못했습니다.");
      error.code = String(granted && granted.error_code || "consent_required");
      throw error;
    }
    return granted;
  }

  async function requestStructured(options) {
    const client = clientFor(options);
    await ensureConsent(client, options.consumerId, options.confirmConsent);
    const requestIdentity = identity(options, options.consumerId);
    const response = await client.requestStructured({
      consumer_id: options.consumerId,
      ...requestIdentity,
      prompt: options.prompt,
      schema: options.schema,
      signal: options.signal,
    });
    if (!response || response.ok !== true) {
      const error = new Error("AI Runtime request failed.");
      error.code = String(response && response.error_code || "runtime_unavailable");
      throw error;
    }
    return response;
  }

  function providerMetadata(response) {
    return {
      provider: String(response && response.receipt && response.receipt.provider_key || ""),
      model: String(response && response.receipt && response.receipt.model || ""),
      runtime_receipt: response && response.receipt || null,
    };
  }

  root.ProdigyAIConsumerRuntime = Object.freeze({
    ensureConsent,
    providerMetadata,
    requestStructured,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = root.ProdigyAIConsumerRuntime;
})(typeof globalThis !== "undefined" ? globalThis : this);
