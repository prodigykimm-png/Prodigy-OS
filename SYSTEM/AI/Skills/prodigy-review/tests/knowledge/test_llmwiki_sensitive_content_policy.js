"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const policy = require(path.join(ROOT, "SYSTEM/Views/llmwiki-sensitive-content-policy.js"));
const discovery = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-discovery-queue.js"));
const migrationSource = require(path.join(ROOT, "SYSTEM/Views/llmwiki-migration-rollout.js"));
const fakeToken = "sk-test-01234567890123456789";
const fakePassword = "password=not-a-real-password-123";
const fakePem = "-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXk=\n-----END PRIVATE KEY-----";

test("safe prose passes and existing path/frontmatter/people privacy remains local", () => {
  assert.equal(policy.inspect({ source_path: "INBOX/Knowledge/http.md", source_text: "Use OAuth authorization code flow and rotate credentials." }).type, "allow");
  assert.equal(policy.inspect({ source_path: "INBOX/Private/note.md", source_text: "ordinary text" }).type, "hold");
  assert.equal(policy.inspect({ source_path: "INBOX/People/Alice.md", source_text: "ordinary text", metadata: { type: "person" } }).reason, "people_local_only");
});

test("credential, token, and PEM values produce redacted typed holds", () => {
  for (const [value, kind] of [[fakeToken, "token"], [fakePassword, "credential"], [fakePem, "private_key"]]) {
    const result = policy.inspect({ source_path: "INBOX/Knowledge/safe-title.md", source_text: `Documentation\n${value}` });
    assert.deepEqual([result.type, result.route, result.sensitive_kind, result.redacted], ["hold", "hold", kind, true]);
    assert.equal(JSON.stringify(result).includes(value), false);
    assert.equal(result.content.includes(value), false);
  }
  assert.equal(policy.inspect({ source_path: "INBOX/Knowledge/token-title.md", source_text: "A note about tokens, no secret value." }).type, "allow");
});

test("allowlisted migration sources keep content scanning without inheriting INBOX path routing", () => {
  const safe = policy.inspect({ source_path: "PARA/RESOURCES/Knowledge/Candidates/task21.md", source_text: "검토는 하나의 경로를 사용한다." });
  assert.equal(safe.type, "allow");
  const held = policy.inspect({ source_path: "ZETA/CANDIDATES/secret.md", source_text: "api_key=abcdefghijklmnop" });
  assert.equal(held.type, "hold");
  assert.equal(held.reason, "sensitive_content");
});

test("production seams load the policy consumers", () => {
  assert.equal(typeof discovery.createInboxDiscoveryQueue, "function");
  assert.equal(typeof migrationSource.createMigrationService, "function");
});
