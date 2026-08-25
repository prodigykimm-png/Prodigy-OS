"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const source = (name) => fs.readFileSync(path.join(ROOT, "SYSTEM/Views", name), "utf8");
const HASH = "a".repeat(64);

function load(sandbox, name) {
  vm.runInContext(source(name), sandbox, { filename: name });
}

function pipelineSandbox({ withCrypto }) {
  const sandbox = vm.createContext({
    console,
    TextEncoder,
    Uint8Array,
    DataView,
    ArrayBuffer,
    LLMWikiSourceLineage: Object.freeze({ validateSourceManifest: (manifest) => ({ ok: true, value: manifest }) }),
    LLMWikiQueryReadOnly: Object.freeze({ queryRead: () => ({ ok: true, value: { status: "ok", envelope_hash: HASH } }) }),
    LLMWikiProviderContract: Object.freeze({ selectProviderProfile: () => ({ ok: true, value: {} }) }),
    LLMWikiProposalBundle: Object.freeze({ captureProposalBundle: () => ({ ok: true, value: { captured: false } }) }),
    LLMWikiOperationContract: Object.freeze({
      isOperationRecord: () => false,
      isCanonicalOperationRecord: () => false,
    }),
    LLMWikiOperationClassifier: Object.freeze({ classifyOperation: () => ({ ok: false, reason: "unexpected_operation" }) }),
  });
  load(sandbox, "llmwiki-hash.js");
  if (withCrypto) {
    sandbox.crypto = Object.freeze({
      subtle: Object.freeze({
        async digest(algorithm, bytes) {
          assert.equal(algorithm, "SHA-256");
          const hex = sandbox.LLMWikiHash.sha256Bytes(new Uint8Array(bytes));
          return Uint8Array.from(hex.match(/../gu), (pair) => Number.parseInt(pair, 16)).buffer;
        },
      }),
    });
  }
  load(sandbox, "llmwiki-librarian-pipeline.js");
  sandbox.input = {
    run_id: "run_task10_browser_approval",
    sources: [{
      selected: true,
      manifest: {
        source_id: "source_task10_browser",
        content_hash: HASH,
        source_url: "https://example.com/task10",
        locators: ["ZETA/LITERATURE/task10.md#claim"],
        refresh_revision: 1,
      },
    }],
    source_scope: {},
    retrieval: {},
    provider: {},
    proposal_request: {},
  };
  sandbox.options = {
    providerInvoker: async () => ({
      ok: true,
      value: {
        proposal_envelope: { proposals: [], bundle_hash: "b".repeat(64) },
        provider_metadata: {},
        trust_state: "proposal_unverified",
        approval_state: "requires_human_approval",
      },
    }),
  };
  return sandbox;
}

function approvalSandbox() {
  const sandbox = vm.createContext({ console, URL, TextEncoder, Uint8Array, DataView, ArrayBuffer });
  sandbox.KnowledgeCandidateStore = Object.freeze({
    canonicalKnowledgeDirectory: () => "ZETA/PERMANENT",
    canonicalKnowledgePath: (title) => `ZETA/PERMANENT/${title}.md`,
    isCanonicalKnowledgeTarget: (target) => /^ZETA\/PERMANENT\/[^/]+\.md$/u.test(target),
    canonicalDocumentIssue: () => null,
    renderCanonicalDocument(document) { return `${JSON.stringify(document)}\n`; },
    parseFrontmatter(bytes) {
      const parsed = JSON.parse(bytes);
      const { body, ...data } = parsed;
      return { data, body };
    },
  });
  load(sandbox, "llmwiki-hash.js");
  load(sandbox, "llmwiki-operation-contract.js");
  load(sandbox, "llmwiki-canonical-packet.js");
  load(sandbox, "llmwiki-operation-writer-core.js");
  load(sandbox, "llmwiki-finalized-revision-bridge.js");
  load(sandbox, "llmwiki-update-authority.js");
  load(sandbox, "llmwiki-canonical-v2-authority.js");
  load(sandbox, "llmwiki-lifecycle-migration-authority.js");
  load(sandbox, "llmwiki-operation-writer.js");
  return sandbox;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function updateDocument(summary) {
  return {
    title: "task10-browser-update",
    statement: "Task10 browser approval remains revision-bound.",
    knowledge_domain: "coding",
    knowledge_topics: ["ai"],
    application_trigger: "Before approval",
    application_contexts: ["coding/trust"],
    connections: [],
    invalidation_conditions: ["The operation contract changes"],
    summary,
    created: "2026-08-14T00:00:00.000Z",
    updated: "2026-08-14T01:00:00.000Z",
    body: `# Task10 browser update\n\n${summary}\n`,
  };
}

test("Task10 approval VM keeps missing crypto typed and accepts an explicit browser-equivalent hash capability", async () => {
  const missing = pipelineSandbox({ withCrypto: false });
  const unavailable = await vm.runInContext("LLMWikiLibrarianPipeline.runLibrarian(input, options)", missing);
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, "crypto_unavailable");
  assert.deepEqual(JSON.parse(JSON.stringify(unavailable.write_counters)), {
    canonical: 0, candidate: 0, index: 0, memory: 0, feedback: 0, git: 0, validation_workspace: 0, capture: 0,
  });

  const browser = pipelineSandbox({ withCrypto: true });
  const result = await vm.runInContext("LLMWikiLibrarianPipeline.runLibrarian(input, options)", browser);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.value.envelope_hash, /^[0-9a-f]{64}$/u);
  assert.equal(vm.runInContext("typeof require === 'undefined' && typeof Buffer === 'undefined'", browser), true);
});

test("Task10 browser update approval requires serialized private brands and the authorization transform", async () => {
  const browser = approvalSandbox();
  const contract = browser.LLMWikiOperationContract;
  const canonical = browser.LLMWikiCanonicalPacket;
  const writer = browser.LLMWikiOperationWriter;
  const beforeDocument = updateDocument("Before bytes");
  const afterDocument = updateDocument("Reviewed after bytes");
  const targetPath = "ZETA/PERMANENT/task10-browser-update.md";
  const beforeBytes = browser.KnowledgeCandidateStore.renderCanonicalDocument(beforeDocument);
  const typedText = JSON.stringify({
    contract_version: contract.CONTRACT_VERSION,
    operation_id: "operation_task10_browser_update",
    kind: "update",
    destination_ids: [targetPath],
    base_revisions: { [targetPath]: canonical.sha256(beforeBytes) },
    before_bytes: { [targetPath]: beforeBytes },
    after_bytes: { [targetPath]: "inert fixture bytes; canonical payload is separately hash-bound" },
    source_citations: [{
      source_id: "source_task10_browser",
      content_hash: HASH,
      source_url: "https://example.com/task10",
      locators: ["ZETA/LITERATURE/task10.md#claim"],
      source_archive_id: null,
      confidence: "explicit",
    }],
    conflicts: [],
    risk_tier: "medium",
    effects: { deprecations: [], supersessions: [] },
  });
  const typed = contract.parseOperation(typedText);
  assert.equal(typed.ok, true, JSON.stringify(typed));
  assert.equal(contract.isOperationRecord(typed.value), true);
  const canonicalText = JSON.stringify({
    operation_id: typed.value.operation_id,
    proposal_id: "proposal_task10_browser_update",
    proposal_kind: typed.value.kind,
    payload_hash: canonical.sha256(stable(afterDocument)),
  });
  const parsedCanonical = contract.parseCanonicalOperation(canonicalText);
  assert.equal(parsedCanonical.ok, true, JSON.stringify(parsedCanonical));
  assert.equal(contract.isCanonicalOperationRecord(parsedCanonical.value), true);

  const baseRequest = {
    run_id: "run_task10_browser_update",
    consent_hash: HASH,
    target_path: targetPath,
    canonical_document: afterDocument,
    source_citations: [{
      source_id: "source_task10_browser",
      content_hash: HASH,
      locators: ["ZETA/LITERATURE/task10.md#claim"],
      source_url: "https://example.com/task10",
      source_archive_id: null,
      confidence: "explicit",
    }],
    expires_at: "2099-01-01T00:00:00.000Z",
    nonce: "nonce_task10_browser_update_0001",
  };
  const raw = await canonical.assembleCanonicalPacket({ ...baseRequest, operation: JSON.parse(canonicalText) }, { readBytes: () => beforeBytes });
  assert.equal(raw.ok, false);
  assert.equal(raw.reason, "serialized_operation_required");

  browser.baseRequestText = JSON.stringify(baseRequest);
  browser.canonicalOperation = parsedCanonical.value;
  browser.beforeBytes = beforeBytes;
  const assembled = await vm.runInContext(`(() => {
    const request = JSON.parse(baseRequestText);
    request.operation = canonicalOperation;
    return LLMWikiCanonicalPacket.assembleCanonicalPacket(request, { readBytes: () => beforeBytes });
  })()`, browser);
  assert.equal(assembled.ok, true, JSON.stringify(assembled));
  browser.approvalPacket = assembled.value;
  const authorized = vm.runInContext(`LLMWikiOperationWriter.authorizeCanonicalUpdate({
    packet: approvalPacket,
    canonical_id: "knowledge_task10_browser_update",
    evidence: {
      contract_version: "llmwiki_evidence_contract_v1",
      operation_id: "operation_task10_browser_update",
      approval_eligible: true,
      stale: false,
      claim_lineage: [{ claim_id: "claim_task10_browser", citation_ids: ["citation_task10_browser"] }],
    },
    compensation_plan: {
      strategy: "restore_exact_before_bytes",
      target_path: "ZETA/PERMANENT/task10-browser-update.md",
      before_sha256: approvalPacket.before_sha256,
    },
  })`, browser);
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  assert.equal(writer.isUpdateApproval(authorized.value), true);
  assert.equal(vm.runInContext("typeof require === 'undefined' && typeof Buffer === 'undefined'", browser), true);
});
