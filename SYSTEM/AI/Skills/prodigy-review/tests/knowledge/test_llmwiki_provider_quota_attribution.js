"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { collectText, mountRoot, snapshot, walk } = require("./llmwiki_lifecycle_view_fixture.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const lifecycle = require(path.join(ROOT, "SYSTEM/Views/llmwiki-lifecycle-view.js"));

test("attributes quota failures to the inherited global provider", () => {
  const dom = mountRoot();
  lifecycle.mountLlmWikiLifecycleView({
    container: dom.root,
    snapshot: snapshot("idle", {
      provider_key: "openrouter",
      provider_options: [
        { provider_key: "openrouter", name: "OpenRouter", model: "stealth/ox-alpha", configured: true },
        { provider_key: "antigravity", name: "Antigravity 구독", model: "gemini-3.6-flash-medium", configured: true },
      ],
      inbox: {
        state: "error",
        reason: "provider_quota_exhausted",
        scanned_total: 1,
        eligible: 1,
        held: 0,
        pending: 1,
        unchanged: 0,
        processed: 1,
        succeeded: 0,
        failed: 1,
      },
    }),
    onAction() {},
  });

  const status = walk(dom.root, (node) => node.getAttribute && node.getAttribute("data-state") === "error").at(-1);
  const copy = collectText(status);
  assert.match(copy, /OpenRouter/u);
  assert.doesNotMatch(copy, /Antigravity/u);
});
