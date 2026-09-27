"use strict";
// 묶음 승인은 생성 패킷만: 적격 표시, 일괄 선택, 반영 요약. 권한·검증은 그대로.
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const hash = view("llmwiki-hash.js");
const operationApi = view("llmwiki-operation-contract.js");
const packetApi = view("llmwiki-risk-approval-packet.js");
const batchApi = view("llmwiki-safe-batch-approval.js");
view("llmwiki-risk-write-set.js");
const riskView = view("llmwiki-risk-approval-review-view.js");
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");

function operation(kind, id) {
  const target = `ZETA/PERMANENT/${id}.md`;
  const before = `${id} before\n`;
  const value = {
    contract_version: operationApi.CONTRACT_VERSION, operation_id: id, kind, destination_ids: [target],
    base_revisions: kind === "create" ? {} : { [target]: hash.sha256(before) },
    before_bytes: kind === "create" ? {} : { [target]: before },
    after_bytes: { [target]: `${id} after\n` },
    source_citations: [{ source_id: `source_${id}`, content_hash: "a".repeat(64), source_url: `https://example.com/${id}`, locators: [`ZETA/LITERATURE/${id}.md#claim`], source_archive_id: null, confidence: "explicit", evidence_quote: `${id} evidence quote` }],
    conflicts: [], risk_tier: kind === "update" ? "medium" : "low", effects: { deprecations: [], supersessions: [] },
  };
  const parsed = operationApi.parseOperation(JSON.stringify(value));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.value;
}

function packet(kind, id) {
  const built = packetApi.buildRiskApprovalPacket({ run_id: `run_${id}`, run_revision: 1, packet_revision: 1,
    operation: operation(kind, id), summary: `${kind} summary`,
    provenance: { source: "librarian", source_ids: [`source_${id}`] } });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.value;
}

function actions(root) {
  const found = [];
  (function walk(node) { if (node.attr?.["data-action"]) found.push(node.attr["data-action"]); for (const child of node.children || []) walk(child); })(root);
  return found;
}
function action(root, name) {
  let found = null;
  (function walk(node) { if (!found && node.attr?.["data-action"] === name) found = node; for (const child of node.children || []) walk(child); })(root);
  return found;
}

test("적격 새 문서만 묶음으로 고른다", () => {
  const create = packet("create", "tier2_create");
  const update = packet("update", "tier2_update");
  const root = new FakeElement("section");
  const surface = riskView.mountRiskApprovalReview({ container: root, packets: [update, create], packetApi, batchApi });
  assert.ok(!actions(root).includes("select-eligible-creates"), "묶음 모드 전에는 일괄 선택이 없다");
  action(root, "toggle-batch").onclick();
  const button = action(root, "select-eligible-creates");
  assert.ok(button, "적격 일괄 선택이 있어야 한다");
  assert.match(collectText(root), /새 문서 1건/);
  assert.match(collectText(root), /묶음 적격/);
  button.onclick();
  assert.deepEqual(surface.state().selectedIds, [create.packet_id], "생성 1건만 골라야 한다");
});

test("묶음 승인 후 반영 요약이 보인다", async () => {
  const create = packet("create", "tier2_digest");
  const root = new FakeElement("section");
  riskView.mountRiskApprovalReview({ container: root, packets: [create], packetApi, batchApi,
    onBatchApprove: async () => ({ ok: true, status: "committed" }) });
  action(root, "toggle-batch").onclick();
  action(root, "select-eligible-creates").onclick();
  const ack = root.querySelectorAll("[data-review-acknowledgement]")[0];
  ack.checked = true; ack.onchange();
  await action(root, "approve-batch").onclick();
  assert.match(collectText(root), /총 1건 반영됨/);
});
