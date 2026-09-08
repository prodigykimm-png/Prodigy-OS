"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const hash = require("../../../../../Views/llmwiki-hash.js");
const privacy = require("../../../../../Views/llmwiki-inbox-privacy-boundary.js");
const sensitive = require("../../../../../Views/llmwiki-sensitive-content-policy.js");
const selector = require("../../../../../Views/llmwiki-user-source-selector.js");
const { runHub } = require("./knowledge_hub_integration_harness.js");

// Deliberately nonworking synthetic values; never load user credential bodies here.
const credentials = [
  "sk-test-NOTREAL01234567890123456789",
  "api_key=not-a-real-provider-credential",
  "password=not-a-real-password",
  "-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXk=\n-----END PRIVATE KEY-----",
];
const prose = "# API\nUse OAuth authorization code flow and rotate credentials.\nRevenue 2026: 1234567890; occupancy 92%; area 84 m2.\n";
function fixture(body, metadata = {}) {
  const file = { path: "INBOX/API.md", basename: "API" };
  return {
    file,
    vault: {
      getMarkdownFiles: () => [file],
      getAbstractFileByPath: (value) => value === file.path ? file : null,
      cachedRead: async () => body,
    },
    metadataCache: { getFileCache: () => ({ frontmatter: metadata, headings: [{ level: 1, heading: "API" }] }) },
  };
}

for (const cached of [false, true]) test(`discovery scans full content with metadata cache ${cached}`, async () => {
  for (const credential of credentials) {
    const { vault, metadataCache } = fixture(`${prose}\n${credential}`, { llmwiki_outbound: true });
    const rows = await selector.listInboxSources({ vault, hash, privacy, ...(cached ? { metadataCache } : {}) });
    assert.equal(rows.length, 0, "mixed credential content must not enter picker options");
  }
  const { vault, metadataCache } = fixture(prose);
  const rows = await selector.listInboxSources({ vault, hash, privacy, ...(cached ? { metadataCache } : {}) });
  assert.deepEqual(rows.map((row) => row.path), ["INBOX/API.md"], "filename and ordinary numerics do not imply credentials");
});

test("pin and verification reject credential bytes even with a matching source hash and outbound override", async () => {
  for (const credential of credentials) {
    const body = `---\nllmwiki_outbound: true\n---\n${prose}\n${credential}`;
    const { file, vault } = fixture(body);
    const option = { path: file.path, title: "API", source_kind: "inbox", content_hash: hash.sha256(body), llmwiki_outbound: true };
    assert.equal((await selector.pinSelection(option, vault, hash)).ok, false);
    assert.equal(selector.verifySelection(option, body, hash).ok, false);
    assert.equal(selector.eligibleInboxPath(file.path, body), false);
  }
  const { file, vault } = fixture(prose);
  const pinned = await selector.pinSelection({ path: file.path, title: "API", source_kind: "inbox" }, vault, hash);
  assert.equal(pinned.ok, true);
  assert.equal(selector.verifySelection(pinned.option, prose, hash).ok, true);
});

test("protected and People sources cannot use outbound consent to bypass the Wiki boundary", async () => {
  for (const sourcePath of ["INBOX/Private/API.md", "INBOX/People/API.md", "INBOX/notes/credentials/API.md"]) {
    assert.equal(selector.eligibleInboxPath(sourcePath, `---\nllmwiki_outbound: true\n---\n${prose}`), false);
  }
  for (const marker of ["privacy: private", 'privacy: "private"', "type: person", "private: true"]) {
    const body = `---\r\n${marker}\r\nllmwiki_outbound: true\r\n---\r\n${prose}`;
    assert.equal(selector.eligibleInboxPath("INBOX/API.md", body), false);
  }
  for (const metadata of [{ type: "person", llmwiki_outbound: true }, { privacy: "private", llmwiki_outbound: true }]) {
    const { vault, metadataCache } = fixture(prose, metadata);
    assert.equal((await selector.listInboxSources({ vault, metadataCache, hash, privacy })).length, 0);
  }
});

test("missing privacy or sensitive policy fails closed instead of silently allowing content", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../../../../Views/llmwiki-user-source-selector.js"), "utf8");
  for (const dependencies of [{}, { LLMWikiInboxPrivacyBoundary: privacy }, { LLMWikiSensitiveContentPolicy: sensitive }]) {
    const context = { ...dependencies };
    vm.runInNewContext(source, context);
    assert.equal(context.LLMWikiUserSourceSelector.eligibleInboxPath("INBOX/API.md", prose), false);
  }
});

test("actual Hub picker excludes synthetic credentials and direct selection cannot dispatch a provider", { timeout: 10000 }, async () => {
  let providerCalls = 0;
  const result = await runHub({
    pages: [],
    extraFiles: { "INBOX/API.md": `${prose}\n${credentials[0]}`, "INBOX/ordinary.md": prose },
    llmWikiControllerOptions: {
      loadDynamicGoldenModules: true,
      batchProvider: async () => { providerCalls += 1; return { ok: false, reason: "unexpected_provider_call" }; },
    },
  });
  const hub = result.window.KnowledgeExplorerHub;
  await hub.whenKnowledgeInboxSettled();
  const writesBeforeSelection = result.app.vault.touched.map((row) => [...row]);
  await hub.dispatchLlmWikiAction({ action: "select_source" });
  assert.deepEqual(Array.from(hub.prodigyWikiSnapshot().options, (row) => row.path), ["INBOX/ordinary.md"]);
  const rejected = await hub.dispatchLlmWikiAction({ action: "select_source", source_path: "INBOX/API.md" });
  assert.equal(rejected.ok, false);
  assert.equal(providerCalls, 0);
  assert.deepEqual(result.app.vault.touched, writesBeforeSelection);
});
