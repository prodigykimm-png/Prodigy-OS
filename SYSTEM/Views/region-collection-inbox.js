"use strict";

/**
 * region-collection-inbox.js
 * Approval inbox View — lists pending/expired/applied envelopes and shows
 * the exact CLI command for human execution. Never executes commands.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md §Approval and writers
 */

const fs = require("node:fs");
const path = require("node:path");
const pkgCore = require("../SCRIPTS/region-approval-package-core.js");
const claimCore = require("../SCRIPTS/region-approval-claim-core.js");

const WRITER_LABELS = Object.freeze({
  metrics: "지표 스냅샷",
  research: "정성 조사",
  transit: "도시철도",
  land_price: "지가"
});

/**
 * List all envelopes with their status.
 * @param {string} vaultRoot
 * @returns {Array<{nonce, writer_id, writer_label, target_path, created_at, ttl_remaining_min, status, command}>}
 */
function listEnvelopes(vaultRoot) {
  const approvalRoot = path.join(vaultRoot, "SYSTEM/CACHE/region-approvals");
  const envelopeDir = path.join(approvalRoot, "envelopes");
  if (!fs.existsSync(envelopeDir)) return [];

  const files = fs.readdirSync(envelopeDir).filter((f) => f.endsWith(".json")).sort();
  const now = new Date();
  const results = [];

  for (const file of files) {
    const nonce = file.replace(/\.json$/, "");
    let envelope;
    try {
      envelope = JSON.parse(fs.readFileSync(path.join(envelopeDir, file), "utf8"));
    } catch (_e) {
      results.push({ nonce, status: "손상됨", writer_id: null, writer_label: "알 수 없음", target_path: null, created_at: null, ttl_remaining_min: 0, command: null });
      continue;
    }

    const receipt = claimCore.readReceipt(approvalRoot, nonce);
    const expired = pkgCore.isExpired(envelope, now);
    const created = new Date(envelope.created_at);
    const expiryMs = created.getTime() + (envelope.ttl_minutes || 30) * 60 * 1000;
    const ttlRemainingMin = Math.max(0, Math.round((expiryMs - now.getTime()) / 60000));

    let status;
    if (receipt) {
      status = receipt.status === "applied" || receipt.status === "applied_reconciled" ? "적용 완료" : `종료 (${receipt.status})`;
    } else if (expired) {
      status = "만료됨";
    } else {
      status = "승인 대기";
    }

    const envelopeRelPath = `SYSTEM/CACHE/region-approvals/envelopes/${nonce}.json`;
    const command = status === "승인 대기"
      ? `node SYSTEM/SCRIPTS/region-approved-apply.js --envelope ${envelopeRelPath} --nonce ${nonce} --execute`
      : null;

    results.push({
      nonce,
      writer_id: envelope.writer_id,
      writer_label: WRITER_LABELS[envelope.writer_id] || envelope.writer_id,
      target_path: envelope.target_path,
      created_at: envelope.created_at,
      ttl_remaining_min: ttlRemainingMin,
      status,
      command
    });
  }

  return results;
}

/**
 * Render the inbox as an HTML section for Obsidian View.
 * @param {string} vaultRoot
 * @returns {string} HTML
 */
function renderInboxHtml(vaultRoot) {
  const envelopes = listEnvelopes(vaultRoot);
  if (envelopes.length === 0) {
    return `<div class="region-inbox-empty">승인 대기 중인 수집 결과가 없습니다.</div>`;
  }

  const rows = envelopes.map((env) => {
    const statusClass = env.status === "승인 대기" ? "pending" : env.status === "만료됨" ? "expired" : "done";
    const commandBlock = env.command
      ? `<code class="region-inbox-command">${env.command}</code>`
      : "";
    const regionName = env.target_path ? path.basename(env.target_path, ".md") : "—";
    return `<div class="region-inbox-item region-inbox-${statusClass}">
  <div class="region-inbox-header">
    <span class="region-inbox-region">${regionName}</span>
    <span class="region-inbox-writer">${env.writer_label}</span>
    <span class="region-inbox-status">${env.status}</span>
  </div>
  ${env.status === "승인 대기" ? `<div class="region-inbox-ttl">남은 시간: ${env.ttl_remaining_min}분</div>` : ""}
  ${commandBlock}
</div>`;
  });

  return `<div class="region-collection-inbox">${rows.join("\n")}</div>`;
}

module.exports = Object.freeze({ listEnvelopes, renderInboxHtml, WRITER_LABELS });
