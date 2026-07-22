(function (root) {
  "use strict";

  const APPROVED_SECRET_ENDPOINTS = Object.freeze({
    gemini: Object.freeze({
      adapter: "gemini",
      defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/interactions",
      origin: "https://generativelanguage.googleapis.com",
      pathPrefix: "/v1beta/interactions"
    }),
    mimo: Object.freeze({
      adapter: "openai-compatible",
      origin: "https://api.xiaomimimo.com",
      pathPrefix: "/v1/chat/completions"
    }),
    "opencode-go": null,
    "openai-compatible": null
  });

  function endpointConfigurationError() {
    return new Error("AI 제공자 엔드포인트 설정을 확인해 주세요.");
  }

  function hasBuiltInSecret(provider) {
    return Boolean(String(provider && provider.apiKeySecret || "").trim()
      || String(provider && provider.legacyApiKeySecret || "").trim());
  }

  function trustedUrl(value, approved) {
    let url;
    try {
      url = new URL(value);
    } catch (_error) {
      throw endpointConfigurationError();
    }
    if (url.protocol !== "https:" || url.username || url.password
      || url.origin !== approved.origin || url.pathname !== approved.pathPrefix || url.search || url.hash) {
      throw endpointConfigurationError();
    }
    return url;
  }

  function assertTrustedProviderEndpoint(providerKey, provider) {
    if (!Object.prototype.hasOwnProperty.call(APPROVED_SECRET_ENDPOINTS, providerKey)) return;
    if (!hasBuiltInSecret(provider)) {
      if (provider && provider.authMode === "none") return;
      throw endpointConfigurationError();
    }
    const approved = APPROVED_SECRET_ENDPOINTS[providerKey];
    if (!approved || !provider || provider.adapter !== approved.adapter) throw endpointConfigurationError();
    if (providerKey === "gemini") {
      trustedUrl(provider.endpointURL || approved.defaultEndpoint, approved);
      return;
    }
    const baseURL = String(provider.baseURL || "").replace(/\/$/, "");
    const endpointPath = String(provider.endpointPath || "/chat/completions");
    trustedUrl(`${baseURL}${endpointPath}`, approved);
  }

  const api = Object.freeze({ assertTrustedProviderEndpoint });
  root.RegionExperienceProviderEndpointGuard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
