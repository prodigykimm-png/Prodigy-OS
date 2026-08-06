"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const resolver = require(path.join(ROOT, "SYSTEM/Views/auction-ai-provider-resolver.js"));

function provider(adapter, name) {
  return { adapter, name, authMode: adapter === "codex-exec" ? "codex-login" : "antigravity-login" };
}

function services({ defaultProvider = "gemini", providers = {}, configured = {}, errors = {} } = {}) {
  return {
    configService: {
      async load() { return { defaultProvider, providers }; }
    },
    providerService: {
      async isProviderConfigured(_app, candidate) {
        const key = Object.keys(providers).find((id) => providers[id] === candidate);
        if (errors[key]) throw new Error(errors[key]);
        return configured[key] !== false;
      }
    }
  };
}

test("Given a default Codex provider, When the Auction resolver runs, Then the configured Codex provider is selected", async () => {
  const codex = provider("codex-exec", "Codex 구독");
  const result = await resolver.resolveAuctionAiProvider({
    app: {},
    ...services({ defaultProvider: "codex", providers: { codex }, configured: { codex: true } })
  });
  assert.equal(result.status, "ready");
  assert.equal(result.provider_id, "codex");
  assert.equal(result.provider, codex);
  assert.deepEqual(result.attempts, [{ provider_id: "codex", status: "selected" }]);
});

test("Given an unsupported default and a configured Antigravity fallback, When the resolver runs, Then only the approved subscription adapters are considered", async () => {
  const gemini = { adapter: "gemini", name: "Gemini API" };
  const antigravity = provider("antigravity-exec", "Antigravity 구독");
  const result = await resolver.resolveAuctionAiProvider({
    app: {},
    ...services({ defaultProvider: "gemini", providers: { gemini, antigravity }, configured: { antigravity: true } })
  });
  assert.equal(result.status, "ready");
  assert.equal(result.provider_id, "antigravity");
  assert.deepEqual(result.attempts.map((item) => item.provider_id), ["antigravity"]);
});

test("Given the first provider is unavailable, When the resolver runs, Then it tries the next approved provider without exposing secret or error text", async () => {
  const codex = provider("codex-exec", "Codex 구독");
  const antigravity = provider("antigravity-exec", "Antigravity 구독");
  const result = await resolver.resolveAuctionAiProvider({
    app: {},
    ...services({
      defaultProvider: "codex",
      providers: { codex, antigravity },
      configured: { codex: false, antigravity: true },
      errors: { codex: "secret=do-not-show" }
    })
  });
  assert.equal(result.status, "ready");
  assert.equal(result.provider_id, "antigravity");
  assert.equal(result.attempts[0].status, "unavailable");
  assert.equal(Object.hasOwn(result.attempts[0], "error"), false);
  assert.equal(JSON.stringify(result).includes("do-not-show"), false);
});

test("Given no approved provider is configured, When the resolver runs, Then it returns a recoverable Korean failure state", async () => {
  const unsupported = { adapter: "openai-compatible", name: "외부 API" };
  const result = await resolver.resolveAuctionAiProvider({
    app: {},
    ...services({ defaultProvider: "unsupported", providers: { unsupported }, configured: { unsupported: true } })
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.provider, null);
  assert.equal(result.reason, "연결된 Codex 또는 Antigravity를 찾지 못했습니다.");
  assert.equal(result.attempts.length, 0);
});

test("Given an explicit preferred provider order, When the resolver runs, Then that order wins over the configured default", async () => {
  const codex = provider("codex-exec", "Codex 구독");
  const antigravity = provider("antigravity-exec", "Antigravity 구독");
  const result = await resolver.resolveAuctionAiProvider({
    app: {},
    preferredProviderIds: ["antigravity", "codex"],
    ...services({ defaultProvider: "codex", providers: { codex, antigravity }, configured: { codex: true, antigravity: true } })
  });
  assert.equal(result.provider_id, "antigravity");
});

console.log("Auction AI provider resolver tests loaded");
