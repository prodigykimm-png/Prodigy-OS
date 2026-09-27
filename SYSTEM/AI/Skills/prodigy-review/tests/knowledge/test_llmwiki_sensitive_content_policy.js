"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-privacy-boundary.js"));
const policy = require(path.join(ROOT, "SYSTEM/Views/llmwiki-sensitive-content-policy.js"));
const discovery = require(path.join(ROOT, "SYSTEM/Views/llmwiki-inbox-discovery-queue.js"));
const migrationSource = require(path.join(ROOT, "SYSTEM/Views/llmwiki-migration-rollout.js"));
const providerApi = require(path.join(ROOT, "SYSTEM/Views/llmwiki-batch-provider.js"));
const fakeToken = "sk-test-01234567890123456789";
const fakePassword = "password=not-a-real-password-123";
const fakePem = "-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXk=\n-----END PRIVATE KEY-----";

test("safe prose passes and existing path/frontmatter/people privacy remains local", () => {
  assert.equal(policy.inspect({ source_path: "INBOX/Knowledge/http.md", source_text: "Use OAuth authorization code flow and rotate credentials." }).type, "allow");
  assert.equal(policy.inspect({ source_path: "INBOX/Private/note.md", source_text: "ordinary text" }).type, "hold");
  assert.equal(policy.inspect({ source_path: "INBOX/People/Alice.md", source_text: "ordinary text", metadata: { type: "person" } }).reason, "people_local_only");
});

test("credential, token, and PEM values produce redacted typed holds", () => {
  for (const [value, kind] of [[fakeToken, "openai_api_key"], [fakePassword, "credential"], [fakePem, "private_key"]]) {
    const result = policy.inspect({ source_path: "INBOX/Knowledge/safe-title.md", source_text: `Documentation\n${value}` });
    assert.deepEqual([result.type, result.route, result.sensitive_kind, result.redacted], ["hold", "hold", kind, true]);
    assert.equal(JSON.stringify(result).includes(value), false);
    assert.equal(result.content.includes(value), false);
  }
  assert.equal(policy.inspect({ source_path: "INBOX/Knowledge/token-title.md", source_text: "A note about tokens, no secret value." }).type, "allow");
});

test("canonical AWS and Google body patterns hold through INBOX and adapted content shapes", () => {
  const fixtures = [
    ["aws_access_key_id", ["AK", "IA", "M".repeat(16)].join("")],
    ["google_api_key", ["AI", "za", "N".repeat(35)].join("")],
  ];
  for (const [kind, marker] of fixtures) {
    for (const input of [
      { source_path: `INBOX/Knowledge/${kind}.md`, source_text: `body=${marker}` },
      { source_text: { text: JSON.stringify({ statement: marker }) } },
    ]) {
      const result = policy.inspect(input);
      assert.equal(result.type, "hold", kind);
      assert.equal(result.route, "hold", kind);
      assert.equal(result.outbound_allowed, false, kind);
      assert.equal(result.sensitive_kind, kind);
      assert.equal(result.credential.kind, kind);
      assert.equal(JSON.stringify(result).includes(marker), false, kind);
    }
  }
});

test("non-INBOX documentation placeholders allow while decorated credentials still hold", () => {
  const officialAwsExample = ["AK", "IA", "IOSFODNN7", "EXAMPLE"].join("");
  const openAiRedacted = ["sk", ["REDACTED", "REDACTED"].join("_")].join("-");
  const openAiPlaceholder = ["sk", ["PLACEHOLDER", "PLACEHOLDER"].join("_")].join("-");
  const openAiMasked = ["sk", "x".repeat(24)].join("-");
  const allowedBodies = [
    "API key rotation guidance contains no credential value.",
    "JWT anatomy is header.payload.signature, not a token.",
    "AWS access-key validation uses a prefix plus sixteen uppercase characters.",
    "aws_access_key_id=AKIA****************",
    "google_api_key=AIza[REDACTED]",
    "Base64 example: U2VjdXJpdHkgZG9jdW1lbnRhdGlvbg==",
    `AWS documentation example: ${officialAwsExample}`,
    `OpenAI documentation example: ${openAiRedacted}`,
    `Generic placeholder: ${openAiPlaceholder}`,
    `Masked placeholder: ${openAiMasked}`,
  ];
  for (const sourceText of allowedBodies) {
    const result = policy.inspect({ source_path: "ZETA/LITERATURE/credential-documentation.md", source_text: sourceText });
    assert.equal(result.type, "allow");
  }
});

test("single line folds and tabs inside one credential still hold", () => {
  const intact = ["sk", "LIVE", "Q".repeat(16)].join("-");
  const cut = 10;
  for (const gap of ["\n", "\r\n", "\r", "\t", "\n    "]) {
    const split = `${intact.slice(0, cut)}${gap}${intact.slice(cut)}`;
    const result = policy.inspect({ source_path: "ZETA/LITERATURE/folded-credential.md", source_text: split });
    assert.equal(result.type, "hold");
    assert.equal(result.credential.kind, "openai_api_key");
    assert.equal(JSON.stringify(result).includes(split), false);
  }
  for (const gap of [" ", "\n\n", "\u00a0"]) {
    const separated = `${intact.slice(0, cut)}${gap}${intact.slice(cut)}`;
    assert.equal(policy.inspect({ source_path: "ZETA/LITERATURE/separated-prose.md", source_text: separated }).type, "allow");
  }
});

test("GitHub documented placeholder form allows outside INBOX", () => {
  const placeholder = ["ghp", "EXAMPLE", "REDACTED", "x".repeat(8)].join("_");
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/github-placeholder.md", source_text: placeholder });
  assert.deepEqual([result.type, result.reason], ["allow", "documented_credential_placeholder"]);
});

test("Slack documented placeholder form allows outside INBOX", () => {
  const placeholder = ["xoxb", "EXAMPLE", "REDACTED", "x".repeat(8)].join("-");
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/slack-placeholder.md", source_text: placeholder });
  assert.deepEqual([result.type, result.reason], ["allow", "documented_credential_placeholder"]);
});

test("OpenAI placeholder before a real OpenAI credential still holds", () => {
  const placeholder = ["sk", ["REDACTED", "REDACTED"].join("_")].join("-");
  const real = ["sk", "LIVE", "A".repeat(16)].join("-");
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/evasion-1.md", source_text: `${placeholder}\n${real}` });
  assert.equal(result.type, "hold");
  assert.equal(result.credential.kind, "openai_api_key");
  assert.equal(result.credential.placeholder, false);
  assert.equal(result.credential.match_count, 2);
  assert.equal(JSON.stringify(result).includes(real), false);
});

test("AWS documentation placeholder before a real AWS credential still holds", () => {
  const placeholder = ["AK", "IA", "IOSFODNN7", "EXAMPLE"].join("");
  const real = ["AK", "IA", "B".repeat(16)].join("");
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/evasion-2.md", source_text: `${placeholder}\n${real}` });
  assert.equal(result.type, "hold");
  assert.equal(result.credential.kind, "aws_access_key_id");
  assert.equal(result.credential.placeholder, false);
  assert.equal(result.credential.match_count, 2);
  assert.equal(JSON.stringify(result).includes(real), false);
});

test("AWS documentation identity with token suffix is not a placeholder", () => {
  const decorated = `${["AK", "IA", "IOSFODNN7", "EXAMPLE"].join("")}-REALPAYLOAD`;
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/evasion-3.md", source_text: decorated });
  assert.equal(result.type, "hold");
  assert.equal(result.credential.kind, "aws_access_key_id");
  assert.equal(result.credential.placeholder, false);
  assert.equal(JSON.stringify(result).includes(decorated), false);
});

test("alphanumeric prefix cannot hide a real OpenAI credential substring", () => {
  const real = ["sk", "LIVE", "C".repeat(16)].join("-");
  const decorated = `prefix${real}`;
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/evasion-4.md", source_text: decorated });
  assert.equal(result.type, "hold");
  assert.equal(result.credential.kind, "openai_api_key");
  assert.equal(result.credential.placeholder, false);
  assert.equal(JSON.stringify(result).includes(real), false);
});

test("alphanumeric prefix or suffix cannot hide a real AWS credential substring", () => {
  const real = ["AK", "IA", "D".repeat(16)].join("");
  for (const decorated of [`prefix${real}`, `${real}Z`]) {
    const result = policy.inspect({ source_path: "ZETA/LITERATURE/evasion-5.md", source_text: decorated });
    assert.equal(result.type, "hold");
    assert.equal(result.credential.kind, "aws_access_key_id");
    assert.equal(result.credential.placeholder, false);
    assert.equal(JSON.stringify(result).includes(real), false);
  }
});

test("a document containing any placeholder plus any real credential holds", () => {
  const placeholder = ["sk", "x".repeat(24)].join("-");
  const real = ["AI", "za", "E".repeat(35)].join("");
  const result = policy.inspect({ source_path: "ZETA/LITERATURE/evasion-general.md", source_text: `${placeholder}\n${real}` });
  assert.equal(result.type, "hold");
  assert.equal(result.credential.kind, "google_api_key");
  assert.equal(result.credential.placeholder, false);
  assert.equal(result.credential.match_count, 2);
  assert.equal(JSON.stringify(result).includes(real), false);
});

test("body availability distinguishes clean fallback from absent null and unreadable input", () => {
  const clean = policy.inspect({ source_path: "ZETA/LITERATURE/clean.md", source_text: "Ordinary documentation." });
  assert.deepEqual([clean.type, clean.reason], ["allow", "no_high_confidence_secret"]);

  for (const input of [
    { source_path: "ZETA/LITERATURE/absent.md" },
    { source_path: "ZETA/LITERATURE/null.md", source_text: null },
    { source_path: "ZETA/LITERATURE/empty.md", source_text: "" },
  ]) {
    const unavailable = policy.inspect(input);
    assert.deepEqual(
      [unavailable.type, unavailable.status, unavailable.reason, unavailable.outbound_allowed, unavailable.recovery_action, unavailable.resumable],
      ["hold", "unavailable", "source_text_unavailable", false, "retry_source_read", true],
    );
  }

  const marker = ["AK", "IA", "S".repeat(16)].join("");
  const nullFallback = policy.inspect({
    source_path: "ZETA/LITERATURE/null-fallback.md",
    source_text: null,
    content: `credential=${marker}`,
  });
  assert.equal(nullFallback.type, "hold");
  assert.equal(nullFallback.credential.kind, "aws_access_key_id");
  assert.equal(JSON.stringify(nullFallback).includes(marker), false);

  const emptyFallback = policy.inspect({
    source_path: "ZETA/LITERATURE/empty-fallback.md",
    source_text: "",
    body: "Ordinary fallback body.",
  });
  assert.equal(emptyFallback.type, "allow");

  const unreadableContent = {};
  Object.defineProperty(unreadableContent, "text", {
    get() { throw new Error("synthetic_unreadable_content"); },
  });
  let unreadable;
  assert.doesNotThrow(() => {
    unreadable = policy.inspect({ source_path: "ZETA/LITERATURE/unreadable.md", content: unreadableContent });
  });
  assert.deepEqual(
    [unreadable.type, unreadable.status, unreadable.reason, unreadable.outbound_allowed, unreadable.recovery_action, unreadable.resumable],
    ["hold", "unavailable", "source_text_unreadable", false, "retry_source_read", true],
  );
});

test("migration dry run blocks body-only AWS and Google before classification or provider transport", async () => {
  const fixtures = [
    ["aws_access_key_id", ["AK", "IA", "P".repeat(16)].join("")],
    ["google_api_key", ["AI", "za", "R".repeat(35)].join("")],
  ];
  let activeMarker = "";
  let classificationCalls = 0;
  let providerCallCount = 0;
  let transportCalls = 0;
  let transportSawMarker = false;
  const provider = providerApi.createBatchAnalysisProvider({
    consumerRuntime: {
      async requestStructured(request) {
        transportCalls += 1;
        transportSawMarker ||= String(request.prompt).includes(activeMarker);
        const error = new Error("synthetic_capture_transport_must_not_run");
        error.code = "transport_error";
        throw error;
      },
    },
  });

  for (const [kind, marker] of fixtures) {
    activeMarker = marker;
    const service = migrationSource.createMigrationService();
    const dry = await service.dryRun({
      source_inputs: [JSON.stringify({
        source_kind: "reading_session",
        source_path: `INBOX/Knowledge/migration-${kind}.md`,
        record: {
          type: "reading_session",
          session_id: `session_${kind}`,
          title: "Synthetic migration fixture",
          statement: marker,
        },
      })],
      classify: async (snapshot) => {
        classificationCalls += 1;
        const analyzed = await provider({
          outbound_allowed: true,
          run_id: `run_migration_${kind}`,
          mode: "source_routing",
          chunks: [{
            key: "chunk_migration",
            text: snapshot.content.text,
            source_hint: snapshot.source.source_path,
          }],
          candidate_ids: [],
        });
        providerCallCount += analyzed.provider_call_count;
        return null;
      },
    });

    assert.equal(dry.ok, false, kind);
    assert.equal(dry.status, "hold", kind);
    assert.equal(dry.reason, "sensitive_content_hold", kind);
    assert.equal(dry.policy.type, "hold", kind);
    assert.equal(dry.policy.credential.kind, kind);
    assert.equal(JSON.stringify(dry).includes(marker), false, kind);
  }

  assert.equal(classificationCalls, 0);
  assert.equal(providerCallCount, 0);
  assert.equal(transportCalls, 0);
  assert.equal(transportSawMarker, false);
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
