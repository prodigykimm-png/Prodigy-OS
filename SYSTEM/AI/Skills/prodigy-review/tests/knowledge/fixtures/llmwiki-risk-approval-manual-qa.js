"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ROOT = path.resolve(__dirname, "../../../../../../..");
const view = (name) => require(path.join(ROOT, "SYSTEM/Views", name));
const hash = view("llmwiki-hash.js");
const operationApi = view("llmwiki-operation-contract.js");
const packetApi = view("llmwiki-risk-approval-packet.js");
const repacketApi = view("llmwiki-approval-repacket-service.js");

function parsed(kind, id, conflict = false) {
  const target = `ZETA/PERMANENT/${id}.md`;
  const before = "정확한 기존 지식 문장입니다.\n";
  const sourceId = `source_${id}`;
  return operationApi.parseOperation(JSON.stringify({
    contract_version: operationApi.CONTRACT_VERSION, operation_id: id, kind, destination_ids: [target],
    base_revisions: kind === "create" ? {} : { [target]: hash.sha256(before) }, before_bytes: kind === "create" ? {} : { [target]: before }, after_bytes: { [target]: kind === "noop" ? before : "출처를 반영한 정확한 새 지식 문장입니다.\n" },
    source_citations: [{ source_id: sourceId, content_hash: "a".repeat(64), source_url: "https://example.com/manual", locators: ["ZETA/LITERATURE/manual.md#검증된-문장"], source_archive_id: null, confidence: "explicit" }],
    conflicts: conflict ? [{ conflict_id: `conflict_${id}`, status: "unresolved", source_ids: [sourceId], summary: "두 출처의 결론이 다릅니다" }] : [],
    risk_tier: kind === "update" ? "high" : "low", effects: { deprecations: [], supersessions: [] },
  })).value;
}
function packet(operation, revision = 1, repacket = null) {
  return packetApi.buildRiskApprovalPacket({ run_id: `run_${operation.operation_id}`, run_revision: revision, packet_revision: revision, operation, summary: "초보자도 읽을 수 있는 변경 요약", provenance: { source: "manual_qa", source_ids: operation.source_citations.map((row) => row.source_id) }, repacket }).value;
}
function screen(width, state) {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const fixture = path.join(__dirname, "llmwiki-risk-production-lifecycle-qa.html");
  const url = `${pathToFileURL(fixture).href}?state=${encodeURIComponent(state)}&width=${width}`;
  const output = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files", `--window-size=${Math.max(width, 500)},1000`, "--dump-dom", url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const match = /<pre id="qa-result">([^<]+)<\/pre>/u.exec(output);
  assert.ok(match, "geometry result must be present in Chrome DOM");
  return JSON.parse(match[1].replaceAll("&quot;", "\"").replaceAll("&amp;", "&"));
}

async function main() {
  const low = packet(parsed("create", "operation_manual_low"));
  let invalidated = null;
  const service = repacketApi.create({ packetApi, operationApi, transform: async ({ operation }) => operation, invalidateRun: (identity) => { invalidated = identity; } });
  const revised = await service.requestRevision(low, "문장은 유지하되 출처 설명을 더 쉽게 바꿔줘");
  assert.equal(revised.ok, true, JSON.stringify(revised));
  const screens = [];
  for (const width of [390, 820, 1440]) {
    screens.push(screen(width, "low-risk"));
    screens.push(screen(width, "high-risk-conflict"));
    screens.push(screen(width, "repacket"));
  }
  for (const item of screens) {
    assert.deepEqual(item.controls, ["approve", "approve-batch", "reject", "request-revision"]);
    assert.equal(item.surface_client_width, item.viewport_width);
    assert.equal(item.horizontal_overflow, false);
    assert.deepEqual(item.clipped_elements, []);
    assert.equal(item.cjk_present, true);
    assert.equal(item.risk_surface_mounted, true);
    assert.equal(item.production_gateway, "HUB/50 Knowledge.md");
    assert.equal(item.hub_tabs.length, 4);
  }
  assert.equal(screens.find((item) => item.state === "low-risk").checkboxes, 1);
  assert.equal(screens.find((item) => item.state === "high-risk-conflict").checkboxes, 0);
  process.stdout.write(`${JSON.stringify({ fixture_version: "llmwiki_risk_approval_manual_qa_v2", surface: "production lifecycle in headless Chrome with measured geometry", screens, repacket: { old_packet_invalidated: packetApi.verifyRiskApprovalPacket(low).reason === "packet_invalidated", old_run_identity_invalidated: invalidated, new_packet_id: revised.value.packet_id, new_run_revision: revised.value.run_revision, new_packet_revision: revised.value.packet_revision }, cleanup: { temporary_files: 0, processes: 0 } }, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
