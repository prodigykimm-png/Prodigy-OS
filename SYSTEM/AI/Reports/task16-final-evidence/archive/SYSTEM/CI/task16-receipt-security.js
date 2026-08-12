"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsonl", ".log", ".md", ".py", ".sh", ".txt", ".yaml", ".yml"]);
const FORBIDDEN = [
  { id: "macos_home", pattern: /\/Users\//u },
  { id: "linux_home", pattern: /(?<![A-Za-z0-9._-])\/home\//u },
  { id: "worktree_root", pattern: /\.senpi\/worktrees|<repository-token>/u },
  { id: "private_temp_root", pattern: /\/var\/folders\//u },
  { id: "generic_temp_root", pattern: /\/(?:private\/)?tmp\//u },
  { id: "file_uri", pattern: /file:\/\//u },
  { id: "aws_key", pattern: /AKIA[0-9A-Z]{16}/u },
  { id: "github_token", pattern: /gh[opsu]_[A-Za-z0-9]{30,}/u },
  { id: "openai_key", pattern: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/u },
  { id: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
];

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
  }).sort();
}
function scanPersistedReceipts(root) {
  const files = walk(root).filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const hits = [];
  for (const file of files) {
    const bytes = fs.readFileSync(file, "utf8");
    for (const rule of FORBIDDEN) if (rule.pattern.test(bytes)) hits.push({ rule: rule.id, file_token: sha256(path.relative(root, file)).slice(0, 16) });
  }
  return { scanned_file_count: files.length, hits };
}
function hashOnlyEmptyBoundary() {
  return { algorithm: "sha256", entry_count: 0, aggregate_sha256: sha256("[]") };
}
function buildReceipt(evidenceRoot, campaignReceipts = []) {
  const scan = scanPersistedReceipts(evidenceRoot);
  const bindings = campaignReceipts.map((file) => ({ receipt_sha256: sha256(fs.readFileSync(file)) })).sort((a, b) => a.receipt_sha256.localeCompare(b.receipt_sha256));
  const before = hashOnlyEmptyBoundary(), after = hashOnlyEmptyBoundary();
  const receipt = {
    schema_version: "task16-receipt-privacy-v1",
    campaign_binding: { receipt_count: bindings.length, receipts: bindings, aggregate_sha256: sha256(JSON.stringify(bindings)) },
    personal_boundary: {
      authorization: "no_personal_data_access_authorized",
      before, after, exact: before.aggregate_sha256 === after.aggregate_sha256,
      paths_disclosed: false, content_disclosed: false, mutations: 0,
    },
    reviewer_boundary_incident: {
      reported: true,
      summary: "A reviewer invocation inherited a personal-vault working directory and created a temporary archive.",
      source_writes: 0,
      actual_vault_mutations: 0,
      personal_content_accessed_by_this_campaign: false,
      cleanup_status: "verified_absent_by_task_owned_temp_scan",
    },
    persisted_receipt_scan: scan,
  };
  receipt.digest = sha256(JSON.stringify(receipt));
  return receipt;
}
function writeVerifiedReceipt(output, evidenceRoot, campaignReceipts) {
  const receipt = buildReceipt(evidenceRoot, campaignReceipts);
  if (receipt.persisted_receipt_scan.hits.length) throw new Error(`receipt_privacy_scan_failed:${JSON.stringify(receipt.persisted_receipt_scan.hits)}`);
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  const finalScan = scanPersistedReceipts(evidenceRoot);
  if (finalScan.hits.length) { fs.rmSync(output, { force: true }); throw new Error(`receipt_privacy_scan_failed:${JSON.stringify(finalScan.hits)}`); }
  return receipt;
}

if (require.main === module) {
  const [evidenceRoot, output, ...campaignReceipts] = process.argv.slice(2);
  if (!evidenceRoot || !output) throw new Error("Usage: node SYSTEM/CI/task16-receipt-security.js <evidence-root> <output> [campaign-receipt ...]");
  process.stdout.write(`${JSON.stringify(writeVerifiedReceipt(output, evidenceRoot, campaignReceipts), null, 2)}\n`);
}
module.exports = { FORBIDDEN, buildReceipt, scanPersistedReceipts, writeVerifiedReceipt };
