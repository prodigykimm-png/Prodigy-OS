(function (root) {
  "use strict";

  const ALLOWED_PROVIDERS = Object.freeze({
    codex: "codex-exec",
    antigravity: "antigravity-exec"
  });
  const UNAVAILABLE_MESSAGE = "연결된 Codex 또는 Antigravity를 찾지 못했습니다.";

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function candidateProviderIds(config, preferredProviderIds) {
    const preferred = Array.isArray(preferredProviderIds) ? preferredProviderIds : [];
    const configuredDefault = clean(config && config.defaultProvider);
    return [...new Set([...preferred, configuredDefault, "codex", "antigravity"].map(clean).filter(Boolean))];
  }

  function isApprovedProvider(providerId, provider) {
    const id = clean(providerId);
    return Boolean(provider && Object.hasOwn(ALLOWED_PROVIDERS, id) && provider.adapter === ALLOWED_PROVIDERS[id]);
  }

  async function resolveAuctionAiProvider(options) {
    const opts = options || {};
    const configService = opts.configService || root.ProdigyConfigService;
    const providerService = opts.providerService || root.AIProviderService;
    if (!configService || typeof configService.load !== "function" || !providerService || typeof providerService.isProviderConfigured !== "function") {
      return Object.freeze({ status: "unavailable", provider_id: null, provider: null, attempts: Object.freeze([]), reason: UNAVAILABLE_MESSAGE });
    }

    let config;
    try {
      config = await configService.load(opts.app);
    } catch (_error) {
      return Object.freeze({ status: "unavailable", provider_id: null, provider: null, attempts: Object.freeze([]), reason: UNAVAILABLE_MESSAGE });
    }

    const providers = config && config.providers && typeof config.providers === "object" ? config.providers : {};
    const attempts = [];
    for (const providerId of candidateProviderIds(config, opts.preferredProviderIds)) {
      const provider = providers[providerId];
      if (!isApprovedProvider(providerId, provider)) continue;
      try {
        if (await providerService.isProviderConfigured(opts.app, provider)) {
          attempts.push(Object.freeze({ provider_id: providerId, status: "selected" }));
          return Object.freeze({ status: "ready", provider_id: providerId, provider, attempts: Object.freeze(attempts), reason: "" });
        }
        attempts.push(Object.freeze({ provider_id: providerId, status: "unavailable" }));
      } catch (_error) {
        attempts.push(Object.freeze({ provider_id: providerId, status: "unavailable" }));
      }
    }
    return Object.freeze({ status: "unavailable", provider_id: null, provider: null, attempts: Object.freeze(attempts), reason: UNAVAILABLE_MESSAGE });
  }

  const api = Object.freeze({ ALLOWED_PROVIDERS, UNAVAILABLE_MESSAGE, candidateProviderIds, isApprovedProvider, resolveAuctionAiProvider, resolveProvider: resolveAuctionAiProvider });
  root.AuctionAiProviderResolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
