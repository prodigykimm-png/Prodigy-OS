"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const lifecycle = require("../../../../../Views/llmwiki-lifecycle-view.js");
const review = require("../../../../../Views/llmwiki-approval-review-view.js");
const { collectText, FakeElement } = require("./knowledge_explorer_view_fakes.js");
const { harness, runInput } = require("./llmwiki_run_controller_fixtures.js");

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function action(root, name) {
  return walk(root, (node) => node.attr && node.attr["data-action"] === name)[0] || null;
}

function click(control) {
  assert.ok(control && typeof control.onclick === "function", "expected an actionable review control");
  control.onclick({ preventDefault() {} });
}

function correctedResponse(request) {
  const source = request.outbound_payload.sources[0];
  return {
    status: "ok",
    proposal_bundle: {
      run_id: request.outbound_payload.proposal_request.run_id,
      validation_context: request.outbound_payload.proposal_request.validation_context,
      proposals: [{
        kind: "create",
        title: "합성 근거 원칙",
        claims: [{
          claim_id: "claim_t16_repair11_surface",
          text: "선택한 근거만 사용한다.",
          source_ids: [source.source_id],
        }],
        source_citations: [{
          source_id: source.source_id,
          content_hash: source.content_hash,
          source_url: source.source_url,
          locators: [source.locator],
          confidence: "explicit",
        }],
        confidence: "explicit",
        affected_targets: [],
      }],
    },
    response_metadata: { provider_status: "ok" },
  };
}

test("Given the corrected provider response, When the controller packet reaches the real review view, Then a claim, source locator, and explicit approval control are visible", async () => {
  const subject = harness(correctedResponse);
  const result = await subject.controller.startRun(runInput("run_t16_repair11_surface"));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "review", JSON.stringify(result));
  assert.equal(result.review_packets.length, 1);

  const controllerSnapshot = subject.controller.getSnapshot();
  const root = new FakeElement("section");
  lifecycle.mountLlmWikiLifecycleView({
    container: root,
    snapshot: {
      ...controllerSnapshot,
      source_options: [],
      approval_packet: controllerSnapshot.review_packets[0],
    },
    onAction() {},
    reviewView: review,
  });

  const opener = action(root, "open-review");
  if (opener) click(opener);

  const packet = controllerSnapshot.review_packets[0];
  const preview = walk(root, (node) => node.tag === "div" && node.attr && node.attr["aria-label"] === "승인할 지식 내용")[0];
  assert.ok(preview, "canonical packet lifecycle review must expose a human-readable final preview");
  assert.match(preview.text, /선택한 근거만 사용한다\./);
  assert.doesNotMatch(preview.text, /^---|knowledge_domain:|provider:|after_bytes/i, "default review must quarantine raw frontmatter and internal fields");
  assert.equal(packet.after_bytes.startsWith("---\n"), true, "controller packet retains exact canonical authority outside the default UI");

  const rendered = collectText(root);
  assert.match(rendered, /선택한 근거만 사용한다\./, "provider claim must reach the mounted review body");
  assert.ok(action(root, "open-source"), "review body must expose the source locator action");
  assert.ok(action(root, "approve-selected"), "review body must expose an explicit approval control");
  assert.deepEqual(subject.controller.getSnapshot().counters, {
    provider: 1,
    network: 1,
    canonical: 0,
    audit: 0,
    refresh: 0,
    git: 0,
    authorization: 0,
  });
});
