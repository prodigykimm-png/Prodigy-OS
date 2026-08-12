"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SELF_FIELD = "canonical_self_sha256";
const RECEIPT_RELATIVE = "SYSTEM/AI/Reports/task16-final-release-receipt.json";
const MANIFEST_RELATIVE = "SYSTEM/CI/release-gate-manifest.json";
const VISUAL_TOKEN = "real-obsidian-visual-288.json";
const IMAGE_TOKEN = "visual-image-validation.json";
const JOURNEY_TOKEN = "real-rendered-journeys.json";
const PROVENANCE_TOKEN = "task-wave-provenance-map.json";
const BASELINE = "e82aebecee1ac0d3b12c288d147216ec6ec939d7";
const TASK_WAVE_REQUIREMENTS = [
  ["task-01", "SYSTEM/AI/Skills/prodigy-review/tests/test_prodigy_contract_audit.js"],
  ["task-02", "SYSTEM/AI/Skills/prodigy-review/tests/workspace/test_workspace_consistency.js"],
  ["task-03", "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_day.js"],
  ["task-04", "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_explorer_view.js"],
  ["task-05", "SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_dashboard.js"],
  ["task-06", "SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_workspace.js"],
  ["task-07", "SYSTEM/AI/Skills/prodigy-review/tests/people/test_people_workspace.js"],
  ["task-08", "SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_responsive.js"],
  ["task-09", "SYSTEM/AI/Skills/prodigy-review/tests/workout/test_workout_workspace.js"],
  ["task-10", "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_hub_integration.js"],
  ["task-11", "SYSTEM/AI/Skills/prodigy-review/tests/test_stability_ci_contract.js"],
  ["task-12", "SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_strategy.js"],
  ["task-13", "SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_ai_decision_support.js"],
  ["task-14", "SYSTEM/AI/Skills/prodigy-review/tests/test_release_fixture_journeys.js"],
  ["task-15", "SYSTEM/AI/Skills/prodigy-review/tests/test_task15_recovery_proof.js"],
  ["task-16", "SYSTEM/AI/Skills/prodigy-review/tests/test_final_receipt_provenance.js"],
  ["wave-01", "SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_workspace_manifest.js"],
  ["wave-02", "SYSTEM/AI/Skills/prodigy-review/tests/shared/test_design_theme_contract.js"],
  ["wave-03", "SYSTEM/AI/Skills/prodigy-review/tests/test_design_color_contract.js"],
  ["wave-04", "SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_release_fixtures.js"],
  ["wave-05", "SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_audit_adversarial.js"],
  ["wave-06", "SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_literal_git_archive.js"],
  ["wave-07", "SYSTEM/AI/Skills/prodigy-review/tests/test_release_gate.js"],
  ["wave-08", "SYSTEM/AI/Skills/prodigy-review/tests/test_stability_ci_contract.js"],
];
const HUBS = new Map([
  ["home", "HUB/00 Home.md"], ["auction", "HUB/10 Auction.md"],
  ["reading", "HUB/20 Reading.md"], ["workout", "HUB/30 Workout.md"],
  ["project", "HUB/40 Project.md"], ["knowledge", "HUB/50 Knowledge.md"],
  ["personal", "HUB/60 Personal.md"], ["journal", "HUB/70 Journal.md"],
]);
const FORBIDDEN = [
  /\/Users\//u, /\/home\//u, /\/var\/folders\//u, /\/(?:private\/)?tmp\//u,
  /\.senpi\/worktrees/u, /<vault-token>/u, /file:\/\//u,
  /AKIA[0-9A-Z]{16}/u, /gh[opsu]_[A-Za-z0-9]{30,}/u, /sk-[A-Za-z0-9_-]{20,}/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function gitBlobSha1(value) { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); return crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"); }
function fileSha256(file) { return sha256(fs.readFileSync(file)); }
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}
function canonicalReceipt(receipt) {
  const normalized = JSON.parse(JSON.stringify(receipt));
  if (!normalized.validation || !(SELF_FIELD in normalized.validation)) throw new Error("receipt_self_hash_field_missing");
  normalized.validation[SELF_FIELD] = null;
  return JSON.stringify(sorted(normalized));
}
function canonicalSelfSha256(receipt) { return sha256(canonicalReceipt(receipt)); }
function assertValue(condition, message) { if (!condition) throw new Error(message); }
function hashEntries(entries) { return sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join("")); }
function safeRelative(relative) {
  assertValue(typeof relative === "string" && relative.length > 0 && !path.isAbsolute(relative) && !relative.includes("\\") && !relative.split("/").includes(".."), "artifact_path_invalid");
  return relative;
}
function redactionBindings(file, retainedRoot) {
  if (!file || !fs.existsSync(file)) return { manifest: null, byPath: new Map() };
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")), digest = manifest.digest; delete manifest.digest;
  assertValue(digest === sha256(JSON.stringify(manifest)) && manifest.file_count === manifest.entries.length, "redaction_manifest_invalid");
  manifest.digest = digest; const byPath = new Map();
  for (const entry of manifest.entries) {
    const relative = safeRelative(entry.path), absolute = path.join(retainedRoot, relative), bytes = fs.readFileSync(absolute);
    assertValue(bytes.length === entry.persisted_bytes && sha256(bytes) === entry.persisted_sha256 && Number.isInteger(entry.raw_bytes) && entry.raw_bytes >= 0 && /^[a-f0-9]{64}$/u.test(entry.raw_sha256) && /^[a-f0-9]{40}$/u.test(entry.raw_git_blob_sha1), `redaction_binding_invalid:${relative}`);
    byPath.set(relative, entry);
  }
  return { manifest, byPath };
}
function archiveRawEntries(root, redactionManifestFile, retainedRoot = path.dirname(root)) {
  const bindings = redactionBindings(redactionManifestFile, retainedRoot).byPath, entries = [];
  const walk = (directory, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name, absolute = path.join(directory, entry.name);
      assertValue(!entry.isSymbolicLink(), `archive_symlink_invalid:${relative}`);
      if (entry.isDirectory()) walk(absolute, relative);
      else { assertValue(entry.isFile(), `archive_entry_invalid:${relative}`); const binding = bindings.get(`archive/${relative}`), bytes = binding ? null : fs.readFileSync(absolute); entries.push({ path: relative, sha256: binding ? binding.raw_sha256 : sha256(bytes), git_blob_sha1: binding ? binding.raw_git_blob_sha1 : gitBlobSha1(bytes) }); }
    }
  };
  walk(root); return entries;
}
function archiveFingerprint(root, redactionManifestFile, retainedRoot = path.dirname(root)) { return hashEntries(archiveRawEntries(root, redactionManifestFile, retainedRoot)); }
function parseGateLog(file) {
  const raw = fs.readFileSync(file, "utf8");
  const labels = [["Release gate", /^Release gate:/gmu], ["Executed", /^Executed:/gmu], ["Skipped", /^Skipped:/gmu], ["Not applicable", /^Not applicable:/gmu], ["Failures", /^Failures:/gmu], ["VERDICT", /^VERDICT:/gmu]];
  for (const [label, pattern] of labels) assertValue([...raw.matchAll(pattern)].length === 1, `gate_log_summary_cardinality_invalid:${label}`);
  const summary = raw.match(/(?:^|\n)Release gate: (\d+)\/(\d+) executed commands passed\nExecuted: (\d+)\nSkipped: (\d+)\nNot applicable: (\d+)\nFailures: (\d+)\n(?:============================================\n)?VERDICT: (GREEN|RED)\n?$/u);
  assertValue(summary, "gate_log_summary_missing_or_nonterminal");
  const result = { output_sha256: sha256(raw), commands_passed: +summary[1], commands_total: +summary[3], skipped: +summary[4], not_applicable: +summary[5], failures: +summary[6], verdict: summary[7] };
  assertValue(+summary[2] === result.commands_total && result.commands_passed + result.failures === result.commands_total, "gate_log_command_count_mismatch");
  assertValue(result.verdict === "GREEN" && result.failures === 0 && result.skipped === 0 && result.commands_total > 0 && result.commands_passed === result.commands_total, "gate_authority_not_green");
  return result;
}
function countFiles(directory, predicate) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) count += countFiles(absolute, predicate);
    else if (entry.isFile() && predicate(entry.name, absolute)) count += 1;
  }
  return count;
}
function isRealObsidianCapability(name) {
  return name === "test_knowledge_explorer_responsive.js" || /^test_.*_real_obsidian_.*\.js$/u.test(name) || /^test_real_obsidian_.*\.js$/u.test(name) || ["test_real_hub_transition_lifecycle.js", "test_shared_real_obsidian_controls.js", "test_workout_real_controller_publication.js"].includes(name);
}
function expectedGateAuthority(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_RELATIVE), "utf8"));
  const testsRoot = path.join(root, "SYSTEM/AI/Skills/prodigy-review/tests");
  const discovery = {
    view_syntax_files: countFiles(path.join(root, "SYSTEM/Views"), (name) => name.endsWith(".js")),
    javascript_suite_files: countFiles(testsRoot, (name) => name.startsWith("test_") && name.endsWith(".js")),
    python_suite_files: countFiles(testsRoot, (name) => name.startsWith("test_") && name.endsWith(".py")),
  };
  assertValue(JSON.stringify(manifest.discovery) === JSON.stringify(discovery), "gate_manifest_discovery_mismatch");
  assertValue(Object.values(manifest.fixed_commands).every((value) => Number.isInteger(value) && value >= 0), "gate_manifest_fixed_commands_invalid");
  const discoveredTotal = Object.values(discovery).reduce((sum, value) => sum + value, 0);
  const fixedTotal = Object.values(manifest.fixed_commands).reduce((sum, value) => sum + value, 0);
  assertValue(Number.isInteger(manifest.total_commands) && manifest.total_commands > 0 && manifest.total_commands === discoveredTotal + fixedTotal, "gate_manifest_total_arithmetic_invalid");
  const notApplicable = countFiles(testsRoot, (name) => name.startsWith("test_") && name.endsWith(".js") && isRealObsidianCapability(name));
  const commands = manifest.total_commands - notApplicable;
  assertValue(commands > 0 && commands + notApplicable === manifest.total_commands, "gate_manifest_authority_arithmetic_invalid");
  return { commands, not_applicable: notApplicable, discovered_total: discoveredTotal, fixed_total: fixedTotal, manifest_total: manifest.total_commands };
}
function validateGateFacts(gate, expected, name) {
  assertValue(gate && gate.verdict === "GREEN", `gate_authority_verdict_invalid:${name}`);
  assertValue(gate.failures === 0 && gate.skipped === 0, `gate_authority_failure_accounting_invalid:${name}`);
  assertValue(gate.commands_total === expected.commands && gate.commands_total > 0 && gate.commands_passed === gate.commands_total, `gate_authority_command_count_invalid:${name}`);
  assertValue(gate.not_applicable === expected.not_applicable && gate.commands_total + gate.not_applicable === expected.manifest_total, `gate_authority_total_arithmetic_invalid:${name}`);
  return true;
}
function deriveReleaseVerdict(canonicalGates, root) {
  const expected = expectedGateAuthority(root);
  assertValue(canonicalGates && JSON.stringify(Object.keys(canonicalGates).sort()) === JSON.stringify(["metadata_free_clean_projection", "working_tree"]), "gate_authority_set_invalid");
  for (const [name, gate] of Object.entries(canonicalGates)) validateGateFacts(gate, expected, name);
  return "PASS";
}
function validateReleaseAuthority(receipt, root, artifactRoot) {
  const expected = expectedGateAuthority(root);
  assertValue(receipt && receipt.verdict === deriveReleaseVerdict(receipt.canonical_gates, root), "receipt_verdict_authority_invalid");
  for (const [name, gate] of Object.entries(receipt.canonical_gates)) {
    const retained = parseGateLog(path.join(artifactRoot, safeRelative(gate.artifact_path)));
    validateGateFacts(retained, expected, name);
    for (const field of ["output_sha256", "commands_passed", "commands_total", "skipped", "not_applicable", "failures", "verdict"]) assertValue(gate[field] === retained[field], `gate_artifact_mismatch:${name}:${field}`);
  }
  return true;
}
function git(root, args) {
  const result = require("node:child_process").spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assertValue(result.status === 0, `git_state_unavailable:${args.join(":")}`); return result.stdout.trim();
}
function taskWaveRequirementIds() { return TASK_WAVE_REQUIREMENTS.map(([id]) => id); }
function retainedArtifactPath(relative, archiveRoot, artifactRoot) {
  safeRelative(relative);
  if (relative.startsWith("archive/")) return path.join(archiveRoot, relative.slice("archive/".length));
  if (relative.startsWith("artifacts/")) return path.join(artifactRoot, relative.slice("artifacts/".length));
  throw new Error("provenance_artifact_path_invalid");
}
function buildTaskWaveProvenance(evidenceRoot, archiveRoot, artifactRoot) {
  assertValue(evidenceRoot && archiveRoot && artifactRoot, "provenance_roots_required");
  const gates = ["portable-working/gate-output.log", "portable-clean/gate-output.log"];
  const requirements = TASK_WAVE_REQUIREMENTS.map(([id, source]) => {
    const sourceArtifact = `archive/${source}`;
    const artifacts = [{ artifact_path: sourceArtifact, sha256: fileSha256(retainedArtifactPath(sourceArtifact, archiveRoot, artifactRoot)) }];
    for (const gate of gates) {
      const artifactPath = `artifacts/${gate}`;
      artifacts.push({ artifact_path: artifactPath, sha256: fileSha256(retainedArtifactPath(artifactPath, archiveRoot, artifactRoot)), required_pass_token: `PASS: javascript-test: ${source}` });
    }
    return { id, artifacts };
  });
  return { schema_version: "task16-task-wave-provenance-v1", task_count: 16, wave_count: 8, requirement_count: requirements.length, artifact_binding_count: requirements.reduce((count, requirement) => count + requirement.artifacts.length, 0), requirements };
}
function validateTaskWaveProvenance(map, evidenceRoot, archiveRoot, artifactRoot) {
  assertValue(map && map.schema_version === "task16-task-wave-provenance-v1" && map.task_count === 16 && map.wave_count === 8 && map.requirement_count === 24 && map.artifact_binding_count === 72 && Array.isArray(map.requirements), "provenance_coverage_invalid");
  assertValue(JSON.stringify(map.requirements.map((requirement) => requirement.id)) === JSON.stringify(taskWaveRequirementIds()), "provenance_requirement_set_invalid");
  for (const requirement of map.requirements) {
    assertValue(requirement && Array.isArray(requirement.artifacts) && requirement.artifacts.length === 3, "provenance_artifact_coverage_invalid");
    for (const artifact of requirement.artifacts) {
      assertValue(artifact && typeof artifact.artifact_path === "string" && /^[a-f0-9]{64}$/u.test(artifact.sha256 || ""), "provenance_artifact_binding_invalid");
      const file = retainedArtifactPath(artifact.artifact_path, archiveRoot, artifactRoot);
      assertValue(fs.existsSync(file) && fileSha256(file) === artifact.sha256, "provenance_artifact_hash_invalid");
      if (artifact.artifact_path.startsWith("artifacts/")) assertValue(artifact.required_pass_token === `PASS: javascript-test: ${TASK_WAVE_REQUIREMENTS.find(([id]) => id === requirement.id)[1]}` && fs.readFileSync(file, "utf8").includes(artifact.required_pass_token), "provenance_artifact_binding_invalid");
      else assertValue(!("required_pass_token" in artifact), "provenance_artifact_binding_invalid");
    }
  }
  const expected = buildTaskWaveProvenance(evidenceRoot, archiveRoot, artifactRoot);
  assertValue(JSON.stringify(sorted(map)) === JSON.stringify(sorted(expected)), "provenance_map_mismatch");
  return { task_count: map.task_count, wave_count: map.wave_count, requirement_count: map.requirement_count, artifact_binding_count: map.artifact_binding_count };
}
function validateTaskWaveProvenanceFile(receipt, evidenceRoot, archiveRoot, artifactRoot) {
  const file = path.join(evidenceRoot, PROVENANCE_TOKEN), claim = receipt.evidence.task_wave_provenance;
  assertValue(claim && claim.receipt_token === PROVENANCE_TOKEN && fileSha256(file) === claim.sha256, "provenance_receipt_hash_mismatch");
  const summary = validateTaskWaveProvenance(JSON.parse(fs.readFileSync(file, "utf8")), evidenceRoot, archiveRoot, artifactRoot);
  assertValue(summary.requirement_count === claim.requirement_count && summary.task_count === claim.task_count && summary.wave_count === claim.wave_count && summary.artifact_binding_count === claim.artifact_binding_count, "provenance_receipt_binding_mismatch");
  return summary;
}
function validateRetainedArtifacts(receipt, artifactRoot, archiveRoot, root = path.resolve(__dirname, "../.."), evidenceRoot) {
  validateReleaseAuthority(receipt, root, artifactRoot);
  const redactionFile = path.join(artifactRoot, "redaction-manifest.json");
  const redaction = redactionBindings(redactionFile, path.dirname(artifactRoot));
  assertValue(fileSha256(redactionFile) === receipt.retained_artifact_redaction.sha256 && redaction.manifest.file_count === receipt.retained_artifact_redaction.file_count && redaction.manifest.replacement_count === receipt.retained_artifact_redaction.replacement_count, "redaction_receipt_mismatch");
  assertValue(archiveFingerprint(archiveRoot, redactionFile, path.dirname(artifactRoot)) === receipt.frozen_projection.archive_sha256, "archive_digest_mismatch");
  if (evidenceRoot) validateTaskWaveProvenanceFile(receipt, evidenceRoot, archiveRoot, artifactRoot);
  return true;
}
function validateRevision(receipt, root) {
  assertValue(path.resolve(git(root, ["rev-parse", "--show-toplevel"])) === path.resolve(root), "repository_root_mismatch");
  assertValue(git(root, ["rev-parse", `${BASELINE}^{commit}`]) === BASELINE, "baseline_revision_mismatch");
  assertValue(receipt.revision.baseline === BASELINE, "receipt_baseline_mismatch");
  assertValue(receipt.revision.detached_head === git(root, ["rev-parse", "HEAD"]), "receipt_head_mismatch");
  assertValue(receipt.revision.history_modified === false, "history_claim_invalid");
  return true;
}
function validateProvenance(receipt, root, artifactRoot, archiveRoot, evidenceRoot) {
  validateRevision(receipt, root);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_RELATIVE), "utf8")), projected = new Map(manifest.delivery.projected_paths.map((entry) => [entry.path, entry]));
  const excluded = (relative) => [".omo/", ".gjc/", ".codex/", "DAILY/", "PARA/", "ZETA/", "SYSTEM/PRIVATE/", "SYSTEM/CACHE/"].some((prefix) => relative.startsWith(prefix)) || ["SYSTEM/docs/Prodigy_Knowledge_Inbox_Execution_Scope_v1.json", "SYSTEM/docs/Prodigy_Knowledge_Inbox_Proposal_v1.md", RECEIPT_RELATIVE].includes(relative);
  const tree = require("node:child_process").execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
  const expected = new Map(tree.map((line) => { const match = line.match(/^\d+ blob ([a-f0-9]{40})\t(.+)$/u); assertValue(match, "git_tree_entry_invalid"); return [match[2], match[1]]; }).filter(([relative]) => !excluded(relative)));
  for (const relative of projected.keys()) expected.set(relative, null);
  const actualArchive = archiveRawEntries(archiveRoot, path.join(artifactRoot, "redaction-manifest.json"), path.dirname(artifactRoot));
  const mismatch = actualArchive.find((entry) => !expected.has(entry.path) || (projected.has(entry.path) ? (projected.get(entry.path).hash_mode === "raw" ? entry.sha256 !== projected.get(entry.path).sha256 : entry.git_blob_sha1 !== gitBlobSha1(fs.readFileSync(path.join(root, entry.path)))) : entry.git_blob_sha1 !== expected.get(entry.path)));
  const missing = [...expected.keys()].find((relative) => !actualArchive.some((entry) => entry.path === relative));
  assertValue(actualArchive.length === expected.size && !mismatch && !missing, `archive_projection_binding_mismatch:${JSON.stringify({ actual_count: actualArchive.length, expected_count: expected.size, mismatch: mismatch && mismatch.path, missing })}`);
  return validateRetainedArtifacts(receipt, artifactRoot, archiveRoot, root, evidenceRoot);
}
function campaignSourcePaths(root) {
  const views = fs.readdirSync(path.join(root, "SYSTEM/Views")).filter((name) => name.endsWith(".js")).map((name) => `SYSTEM/Views/${name}`);
  return [...HUBS.values(), ...views].sort();
}
function sourceBindings(root) {
  const files = campaignSourcePaths(root).map((relative) => ({ path: relative, sha256: fileSha256(path.join(root, relative)) }));
  return { count: files.length, aggregate_sha256: hashEntries(files), files };
}
function extractHubBlockHashes(root, relative) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const blocks = [...source.matchAll(/```(?:dataviewjs|js-engine)\n([\s\S]*?)\n```/gu)];
  assertValue(blocks.length >= 1, `hub_block_count_invalid:${relative}`);
  return blocks.map((block) => sha256(block[1]));
}
function pngHeader(file) {
  const bytes = fs.readFileSync(file);
  return { signature: bytes.subarray(0, 8).toString("hex"), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length, sha256: sha256(bytes) };
}
function validateVisualRowDiagnostics(row) {
  assertValue(row && Array.isArray(row.gradients) && row.gradients.length === 0, "visual_gradient_failure");
  assertValue(row.offenders && Array.isArray(row.offenders.chromeShadow) && row.offenders.chromeShadow.length === 0, "visual_chrome_shadow_failure");
  return true;
}
function validateVisualArtifacts(root, evidenceRoot, receipt) {
  const visualFile = path.join(evidenceRoot, VISUAL_TOKEN);
  const imageFile = path.join(evidenceRoot, IMAGE_TOKEN);
  const visual = JSON.parse(fs.readFileSync(visualFile, "utf8"));
  const images = JSON.parse(fs.readFileSync(imageFile, "utf8"));
  assertValue(fileSha256(visualFile) === receipt.evidence.visual_matrix.sha256, "visual_receipt_hash_mismatch");
  assertValue(fileSha256(imageFile) === receipt.evidence.images.sha256, "image_receipt_hash_mismatch");
  const visualDigest = visual.digest; delete visual.digest;
  assertValue(visualDigest === sha256(Buffer.from(JSON.stringify(visual))) && visual.aggregate_sha256 === sha256(Buffer.from(JSON.stringify(visual.rows.slice().sort((a, b) => JSON.stringify(a.matrix).localeCompare(JSON.stringify(b.matrix)))))), "visual_internal_digest_mismatch");
  visual.digest = visualDigest;
  assertValue(visual.schema_version === "task16-frozen-real-obsidian-visual-v3" && visual.row_count === 288 && visual.rows.length === 288, "visual_rows_invalid");
  assertValue(JSON.stringify(visual.dimensions) === JSON.stringify({ workspaces: [...HUBS.keys()], widths: [390, 834, 1068, 1440], themes: ["light", "dark"], zooms: [1, 2], forced_colors: [false, true], states: { normal: { workspaces: [...HUBS.keys()], rows: 256 }, object_creator_modal: { workspaces: ["home"], rows: 32 } } }), "visual_dimensions_invalid");
  assertValue(Object.values(visual.cleanup).every(Boolean), "visual_cleanup_invalid");
  const matrixKeys = new Set();
  const screenshotHashes = new Set();
  const imageByToken = new Map(images.rows.map((row) => [row.file_token, row]));
  let ownerBindings = 0, modalBindings = 0, modalKeyboardFailures = 0, mediaFailures = 0, keyboardFailures = 0, overflowFailures = 0, targetFailures = 0, zeroFailures = 0, cjkFailures = 0, gradientFailures = 0, chromeShadowFailures = 0;
  const objectCreatorSourceHash = fileSha256(path.join(root, "SYSTEM/Views/object-creator-view.js"));
  for (const row of visual.rows) {
    validateVisualRowDiagnostics(row);
    const matrix = row.matrix;
    const matrixKey = JSON.stringify([matrix.workspaceId, matrix.width, matrix.theme, matrix.zoom, matrix.forcedColors, matrix.state]);
    assertValue(!matrixKeys.has(matrixKey), "visual_matrix_duplicate"); matrixKeys.add(matrixKey);
    const expectedHub = HUBS.get(matrix.workspaceId);
    const hubBlockHashes = extractHubBlockHashes(root, expectedHub);
    const expectedBlockHash = hubBlockHashes[0];
    const settlement = row.layoutSettlement;
    const owners = row.keyboard && row.keyboard.owners || [];
    const ownerValid = row.navigation && row.navigation.matches && row.navigation.expectedFile === expectedHub && row.navigation.activeFile === expectedHub &&
      row.execution && row.execution.status === "rendered" && hubBlockHashes.includes(row.execution.sha256) && settlement && settlement.status === "SETTLED" && settlement.registryLive === true && settlement.ownerConnected === true && settlement.ownerSame === true && settlement.sourceFile === expectedHub && settlement.sourceHash === expectedBlockHash && settlement.workspaceId === matrix.workspaceId &&
      owners.length > 0 && owners.every((owner) => owner.workspaceId === matrix.workspaceId && owner.sourceFile === expectedHub && owner.sourceHash === expectedBlockHash && owner.registryLive === true);
    if (ownerValid) ownerBindings += 1;
    if (!row.mediaAuthority || !row.mediaAuthority.ack || row.mediaAuthority.ack.theme !== matrix.theme || row.mediaAuthority.ack.forcedColors !== matrix.forcedColors || row.mediaAuthority.ack.reducedMotion !== true) mediaFailures += 1;
    if (matrix.state === "object-creator-modal") {
      const owner = row.modalOwner;
      if (matrix.workspaceId === "home" && owner && owner.live === true && owner.owner === "object-creator-view" && owner.sourceFile === "SYSTEM/Views/object-creator-view.js" && owner.expectedSourceFile === owner.sourceFile && owner.sourceHash === objectCreatorSourceHash && owner.repositorySourceHash === objectCreatorSourceHash && owner.sourceExact === true && owner.apiIdentity === true && owner.homeEntryExercised === true && owner.fixtureRecent === true && owner.modalCount === 1) modalBindings += 1;
      modalKeyboardFailures += row.modalKeyboard && Array.isArray(row.modalKeyboard.failures) ? row.modalKeyboard.failures.length : 1;
      if (!row.modalKeyboard || row.modalKeyboard.traversal.inside !== true || row.modalKeyboard.traversal.advanced !== true || row.modalKeyboard.typeActivated.trusted !== true || row.modalKeyboard.recent.trusted !== true || row.modalKeyboard.recent.tag !== "BUTTON" || row.modalKeyboard.recent.buttonType !== "button") modalKeyboardFailures += 1;
    }
    keyboardFailures += row.keyboard && row.keyboard.failures ? row.keyboard.failures.length : 1;
    if (!row.keyboard || row.keyboard.subscribedBeforeDispatch !== true || row.keyboard.expectedInputObserved !== true) keyboardFailures += 1;
    overflowFailures += row.offenders && row.offenders.overflow ? row.offenders.overflow.length : 1;
    targetFailures += row.offenders && row.offenders.targetSize ? row.offenders.targetSize.length : 1;
    zeroFailures += row.offenders && row.offenders.zeroInteractive ? row.offenders.zeroInteractive.length : 1;
    cjkFailures += row.readability && row.readability.oneGlyphColumns ? row.readability.oneGlyphColumns.length : 1;
    gradientFailures += Array.isArray(row.gradients) ? row.gradients.length : 1;
    chromeShadowFailures += row.offenders && Array.isArray(row.offenders.chromeShadow) ? row.offenders.chromeShadow.length : 1;
    assertValue(row.resourceRecovery && row.resourceRecovery.present === false, "visual_resource_recovery_invalid");
    const token = path.basename(row.screenshot.path || "");
    const image = imageByToken.get(token);
    assertValue(image && image.sha256 === row.screenshot.sha256 && image.width === matrix.width && image.height === 900, "visual_image_binding_invalid");
    screenshotHashes.add(row.screenshot.sha256);
  }
  const normalRows = visual.rows.filter((row) => row.matrix.state === "normal");
  const modalRows = visual.rows.filter((row) => row.matrix.state === "object-creator-modal");
  assertValue(normalRows.length === 256 && modalRows.length === 32 && modalRows.every((row) => row.matrix.workspaceId === "home"), "visual_state_coverage_invalid");
  assertValue(matrixKeys.size === 288 && ownerBindings === 288 && modalBindings === 32, "visual_owner_binding_invalid");
  assertValue(mediaFailures === 0 && modalKeyboardFailures === 0 && keyboardFailures === 0 && overflowFailures === 0 && targetFailures === 0 && zeroFailures === 0 && cjkFailures === 0 && gradientFailures === 0 && chromeShadowFailures === 0, "visual_diagnostic_failure");
  assertValue(images.schema_version === "task16-image-validation-v2" && images.image_count === 288 && images.rows.length === 288 && images.signature_valid_count === 288 && images.dimension_valid_count === 288 && images.nonblank_count === 288 && images.unique_sha256_count === 288, "image_validation_counts_invalid");
  const actualHashes = new Set();
  for (const image of images.rows) {
    const file = path.join(evidenceRoot, "screenshots-happy", image.file_token);
    const actual = pngHeader(file);
    assertValue(actual.signature === "89504e470d0a1a0a" && actual.width === image.width && actual.height === image.height && actual.width === Number(image.file_token.match(/-(390|834|1068|1440)-/u)[1]) && actual.height === 900, "image_dimensions_invalid");
    assertValue(actual.sha256 === image.sha256 && actual.bytes === image.bytes && image.nonblank === true && actual.bytes > 1000, "image_bytes_invalid");
    actualHashes.add(actual.sha256);
  }
  assertValue(actualHashes.size === 288 && screenshotHashes.size === 288, "image_uniqueness_invalid");
  return { rows: 288, normal_rows: 256, object_creator_modal_rows: 32, images_valid: 288, owner_bindings: ownerBindings, modal_bindings: modalBindings, cjk_failures: cjkFailures, gradient_failures: gradientFailures, chrome_shadow_failures: chromeShadowFailures };
}
function validateFocusedSeams(evidenceRoot, receipt) {
  const file = path.join(evidenceRoot, "focused-fixed-seams.json"), body = JSON.parse(fs.readFileSync(file, "utf8")), claim = receipt.evidence.focused_fixed_seams;
  const seam = body.seams.find((entry) => entry.id === "knowledge_para_compact_activation");
  assertValue(fileSha256(file) === claim.sha256 && claim.receipt_token === "focused-fixed-seams.json" && seam && seam.status === "fixed_focused_pass" && seam.proof.rows === 32 && seam.proof.viewport_settlement === "ResizeObserver_before_metrics_trigger" && seam.proof.state_assertion === "exact_data_focus_pane_after_activation" && seam.closure_authority === "full_authoritative_workflow_only", "focused_seam_evidence_invalid");
  return true;
}
function validatePrivacyArtifact(evidenceRoot, receipt) {
  const file = path.join(evidenceRoot, "privacy-boundary.json");
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  assertValue(fileSha256(file) === receipt.privacy.sha256 && receipt.privacy.receipt_token === "privacy-boundary.json", "privacy_receipt_hash_mismatch");
  assertValue(body.personal_boundary.before.entry_count === 0 && body.personal_boundary.after.entry_count === 0 && body.personal_boundary.mutations === 0 && body.reviewer_boundary_incident.source_writes === 0 && body.reviewer_boundary_incident.actual_vault_mutations === 0 && body.reviewer_boundary_incident.cleanup_status === "verified_absent_by_task_owned_temp_scan" && body.persisted_receipt_scan.hits.length === 0, "privacy_artifact_invalid");
  return true;
}
function validateJourneyArtifact(evidenceRoot, receipt) {
  const file = path.join(evidenceRoot, JOURNEY_TOKEN);
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  assertValue(fileSha256(file) === receipt.evidence.journeys.sha256, "journey_receipt_hash_mismatch");
  const bodyDigest = body.digest; delete body.digest;
  assertValue(bodyDigest === sha256(Buffer.from(JSON.stringify(body))), "journey_internal_digest_mismatch");
  body.digest = bodyDigest;
  for (const row of body.journeys) { const digest = row.digest; delete row.digest; assertValue(digest === sha256(Buffer.from(JSON.stringify(row))), "journey_row_digest_mismatch"); row.digest = digest; }
  assertValue(body.schema_version === "task16-independent-real-rendered-journeys-v2" && body.journeys.length === 8 && JSON.stringify(body.workspaces) === JSON.stringify([...HUBS.keys()]), "journey_artifact_invalid");
  for (const journey of body.journeys) {
    assertValue(journey.states.length === 5 && journey.recovery.event_before_trigger === true && journey.authorization.source_write_count === 0 && journey.authorization.network_count === 0 && Object.values(journey.cleanup).every(Boolean), "journey_row_invalid");
  }
  return { journeys: 8 };
}
function parseCapabilityLog(raw) {
  assertValue(typeof raw === "string" && raw.length > 0 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(raw), "capability_control_bytes_invalid");
  const fields = ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"];
  const lines = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n");
  const specMarker = /ℹ (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)/u;
  const specLines = lines.filter((line) => specMarker.test(line));
  const customLines = lines.filter((line) => line.includes("TASK16_CAPABILITY_SUMMARY"));
  assertValue((specLines.length > 0 ? 1 : 0) + (customLines.length > 0 ? 1 : 0) === 1, "capability_reporter_cardinality_invalid");
  if (customLines.length > 0) {
    assertValue(customLines.length === 1 && customLines[0] === lines.at(-1), "capability_custom_summary_not_terminal");
    const match = customLines[0].match(/^TASK16_CAPABILITY_SUMMARY (\{.+\})$/u);
    assertValue(match, "capability_custom_summary_invalid");
    let body; try { body = JSON.parse(match[1]); } catch (_) { throw new Error("capability_custom_summary_invalid"); }
    assertValue(JSON.stringify(Object.keys(body)) === JSON.stringify(["schema_version", "total", "passed", "failed", "skipped", "cancelled", "todo"]), "capability_custom_schema_invalid");
    assertValue(body.schema_version === "task16-capability-command-summary-v1" && ["total", "passed", "failed", "skipped", "cancelled", "todo"].every((key) => Number.isInteger(body[key]) && body[key] >= 0), "capability_custom_values_invalid");
    assertValue(body.total > 0 && body.total === body.passed + body.failed + body.skipped + body.cancelled + body.todo, "capability_test_count_mismatch");
    assertValue(body.passed === body.total && body.failed === 0 && body.skipped === 0 && body.cancelled === 0 && body.todo === 0, "capability_log_not_green");
    return { reporter: "task16-structural", total: body.total, passed: body.passed, failed: body.failed, skipped: body.skipped, cancelled: body.cancelled, todo: body.todo };
  }
  assertValue(specLines.length === 8, "capability_summary_cardinality_invalid");
  const terminal = lines.slice(-8);
  assertValue(JSON.stringify(specLines) === JSON.stringify(terminal), "capability_summary_not_terminal");
  const counts = {};
  for (let index = 0; index < fields.length; index += 1) {
    const match = terminal[index].match(new RegExp(`^ℹ ${fields[index]} (0|[1-9]\\d*)$`, "u"));
    assertValue(match, `capability_summary_field_invalid:${fields[index]}`); counts[fields[index]] = +match[1];
  }
  assertValue(/^ℹ duration_ms (?:0|[1-9]\d*)(?:\.\d+)?$/u.test(terminal[7]), "capability_duration_invalid");
  assertValue(counts.tests > 0 && counts.tests === counts.pass + counts.fail + counts.cancelled + counts.skipped + counts.todo, "capability_test_count_mismatch");
  assertValue(counts.pass === counts.tests && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0, "capability_log_not_green");
  return { reporter: "node24-spec", total: counts.tests, passed: counts.pass, failed: counts.fail, skipped: counts.skipped, cancelled: counts.cancelled, todo: counts.todo };
}
function capabilityClaims(artifactRoot, redactionFile) {
  const directory = path.join(artifactRoot, "capabilities");
  const files = fs.readdirSync(directory).filter((name) => name.endsWith(".log")).sort();
  const summaryFile = path.join(artifactRoot, "capability-runner-summary.json"), runner = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  assertValue(runner.schema_version === "task16-capability-runner-summary-v1" && Number.isInteger(runner.executed) && Number.isInteger(runner.skipped), "capability_runner_summary_invalid");
  assertValue(files.length === 18 && files.length === runner.executed, "capability_runner_executed_mismatch");
  const bindings = redactionBindings(redactionFile, path.dirname(artifactRoot)).byPath;
  let sessions = 0, total = 0, passed = 0, skippedSuites = 0;
  const logs = files.map((name) => {
    const raw = fs.readFileSync(path.join(directory, name), "utf8"), parsed = parseCapabilityLog(raw);
    total += parsed.total; passed += parsed.passed; if (parsed.skipped > 0) skippedSuites += 1;
    for (const match of raw.matchAll(/^TASK13A_LAUNCH_CONTRACT (\{[^\n]+\})$/gmu)) {
      const contract = JSON.parse(match[1]);
      assertValue(JSON.stringify(contract) === JSON.stringify({ mock_keychain_count: 1, child_home_task_owned: true, inherited_real_home: false }), `capability_launch_contract_invalid:${name}`);
      sessions += 1;
    }
    const binding = bindings.get(`artifacts/capabilities/${name}`);
    assertValue(binding && binding.persisted_sha256 === sha256(raw), `capability_raw_binding_missing:${name}`);
    return { receipt_token: name, reporter: parsed.reporter, total: parsed.total, passed: parsed.passed, failed: parsed.failed, skipped: parsed.skipped, persisted_sha256: binding.persisted_sha256, raw_sha256: binding.raw_sha256 };
  });
  assertValue(runner.skipped === skippedSuites && skippedSuites === 0 && sessions > 0, "capability_runner_skipped_mismatch");
  const summaryBinding = bindings.get("artifacts/capability-runner-summary.json");
  assertValue(summaryBinding && summaryBinding.persisted_sha256 === fileSha256(summaryFile), "capability_runner_raw_binding_missing");
  return { executed: runner.executed, skipped: runner.skipped, total_tests: total, passed_tests: passed, real_obsidian_sessions: sessions, mock_keychain_count: sessions, task_owned_home_count: sessions, runner_summary_sha256: summaryBinding.persisted_sha256, runner_summary_raw_sha256: summaryBinding.raw_sha256, logs };
}
function constructReceipt(root, evidenceRoot, archiveRoot, artifactRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_RELATIVE), "utf8"));
  const visualFile = path.join(evidenceRoot, VISUAL_TOKEN), imageFile = path.join(evidenceRoot, IMAGE_TOKEN), journeyFile = path.join(evidenceRoot, JOURNEY_TOKEN), focusedFile = path.join(evidenceRoot, "focused-fixed-seams.json"), privacyFile = path.join(evidenceRoot, "privacy-boundary.json"), provenanceFile = path.join(evidenceRoot, PROVENANCE_TOKEN), redactionFile = path.join(artifactRoot, "redaction-manifest.json");
  const visual = JSON.parse(fs.readFileSync(visualFile, "utf8")), images = JSON.parse(fs.readFileSync(imageFile, "utf8")), journeys = JSON.parse(fs.readFileSync(journeyFile, "utf8")), focused = JSON.parse(fs.readFileSync(focusedFile, "utf8")), privacy = JSON.parse(fs.readFileSync(privacyFile, "utf8")), provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8")), redaction = JSON.parse(fs.readFileSync(redactionFile, "utf8"));
  const launchPolicy = { mock_keychain_count: 1, child_home_task_owned: true, inherited_real_home: false };
  assertValue(JSON.stringify(visual.launch_contract) === JSON.stringify(launchPolicy), "visual_launch_contract_invalid");
  assertValue(journeys.journeys.every((row) => JSON.stringify(row.launch_contract) === JSON.stringify(launchPolicy)), "journey_launch_contract_invalid");
  const bindings = sourceBindings(root), branchProbe = require("node:child_process").spawnSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], { cwd: root, encoding: "utf8" });
  const gate = (relative) => ({ ...parseGateLog(path.join(artifactRoot, relative)), artifact_path: relative });
  const canonicalGates = { working_tree: gate("portable-working/gate-output.log"), metadata_free_clean_projection: gate("portable-clean/gate-output.log") };
  const gateAuthority = expectedGateAuthority(root);
  for (const [name, facts] of Object.entries(canonicalGates)) validateGateFacts(facts, gateAuthority, name);
  const visualSummary = validateVisualArtifacts(root, evidenceRoot, { evidence: { visual_matrix: { sha256: fileSha256(visualFile) }, images: { sha256: fileSha256(imageFile) } } });
  const journeySummary = validateJourneyArtifact(evidenceRoot, { evidence: { journeys: { sha256: fileSha256(journeyFile) } } });
  const seam = focused.seams.find((entry) => entry.id === "knowledge_para_compact_activation");
  assertValue(seam && seam.status === "fixed_focused_pass" && seam.closure_authority === "full_authoritative_workflow_only", "focused_seam_evidence_invalid");
  validatePrivacyArtifact(evidenceRoot, { privacy: { sha256: fileSha256(privacyFile), receipt_token: "privacy-boundary.json" } });
  const provenanceSummary = validateTaskWaveProvenance(provenance, evidenceRoot, archiveRoot, artifactRoot);
  const capabilities = capabilityClaims(artifactRoot, redactionFile);
  const archiveSha256 = archiveFingerprint(archiveRoot, redactionFile, path.dirname(artifactRoot));
  const releaseVerdict = deriveReleaseVerdict(canonicalGates, root);
  const receipt = {
    schema_version: "task16-final-release-receipt-v3",
    verdict: releaseVerdict,
    revision: { baseline: BASELINE, detached_head: git(root, ["rev-parse", "HEAD"]), branch: branchProbe.status === 0 ? branchProbe.stdout.trim() : null, history_modified: false },
    frozen_projection: {
      path_count: manifest.delivery.projected_paths.length,
      aggregate_sha256: manifest.delivery.projected_path_manifest_sha256,
      archive_sha256: archiveSha256,
      campaign_source_count: bindings.count,
      campaign_source_aggregate_sha256: bindings.aggregate_sha256,
      derived_evidence_exclusions: manifest.delivery.derived_delivery_evidence_exclusions,
    },
    canonical_gates: canonicalGates,
    capabilities,
    evidence: {
      visual_matrix: { receipt_token: VISUAL_TOKEN, sha256: fileSha256(visualFile), rows: visualSummary.rows, normal_rows: visualSummary.normal_rows, object_creator_modal_rows: visualSummary.object_creator_modal_rows, images_valid: visualSummary.images_valid, owner_bindings: visualSummary.owner_bindings, modal_bindings: visualSummary.modal_bindings, cjk_failures: visualSummary.cjk_failures, gradient_failures: visualSummary.gradient_failures, chrome_shadow_failures: visualSummary.chrome_shadow_failures, launch_contract: launchPolicy, cleanup: visual.cleanup },
      journeys: { receipt_token: JOURNEY_TOKEN, sha256: fileSha256(journeyFile), journey_count: journeySummary.journeys, source_writes: journeys.journeys.reduce((n, row) => n + row.authorization.source_write_count, 0), network_attempts: journeys.journeys.reduce((n, row) => n + row.authorization.network_count, 0), cleanup_passed: journeys.journeys.filter((row) => Object.values(row.cleanup).every(Boolean)).length, mock_keychain_count: journeys.journeys.filter((row) => row.launch_contract.mock_keychain_count === 1).length, task_owned_home_count: journeys.journeys.filter((row) => row.launch_contract.child_home_task_owned && !row.launch_contract.inherited_real_home).length },
      images: { receipt_token: IMAGE_TOKEN, sha256: fileSha256(imageFile), count: images.image_count, valid_png_signatures: images.signature_valid_count, valid_dimensions: images.dimension_valid_count, nonblank: images.nonblank_count, unique_sha256: images.unique_sha256_count },
      focused_fixed_seams: { receipt_token: "focused-fixed-seams.json", sha256: fileSha256(focusedFile), knowledge_para_compact_activation: seam.status, closure_authority: seam.closure_authority },
      task_wave_provenance: { receipt_token: PROVENANCE_TOKEN, sha256: fileSha256(provenanceFile), ...provenanceSummary },
    },
    privacy: { receipt_token: "privacy-boundary.json", sha256: fileSha256(privacyFile), personal_before_count: privacy.personal_boundary.before.entry_count, personal_after_count: privacy.personal_boundary.after.entry_count, personal_mutations: privacy.personal_boundary.mutations, source_writes: privacy.reviewer_boundary_incident.source_writes, vault_mutations: privacy.reviewer_boundary_incident.actual_vault_mutations, persisted_scan_hits: privacy.persisted_receipt_scan.hits.length, cleanup_status: privacy.reviewer_boundary_incident.cleanup_status },
    physical_iPhone: { test_status: "not_tested", proof_status: "not_proven" },
    retained_artifact_redaction: { receipt_token: "redaction-manifest.json", sha256: fileSha256(redactionFile), file_count: redaction.file_count, replacement_count: redaction.replacement_count, raw_byte_binding: true, command_results_preserved: true },
    validation: { canonical_self_sha256: null },
  };
  receipt.validation.canonical_self_sha256 = canonicalSelfSha256(receipt);
  return receipt;
}
function validateReceipt(receipt, rawText, root, expectedReceipt) {
  assertValue(expectedReceipt, "authoritative_expected_receipt_required");
  assertValue(receipt && receipt.verdict === deriveReleaseVerdict(receipt.canonical_gates, root), "receipt_verdict_authority_invalid");
  assertValue(JSON.stringify(sorted(receipt)) === JSON.stringify(sorted(expectedReceipt)), "receipt_claim_or_schema_mismatch");
  const expected = receipt.validation[SELF_FIELD];
  assertValue(/^[a-f0-9]{64}$/u.test(expected || "") && expected === canonicalSelfSha256(receipt), "receipt_self_hash_mismatch");
  const hits = FORBIDDEN.filter((pattern) => pattern.test(rawText)).map(String);
  assertValue(hits.length === 0, `receipt_path_secret_scan_failed:${JSON.stringify(hits)}`);
  return { canonical_self_sha256: expected, raw_sha256: sha256(rawText), path_secret_hits: 0 };
}
function leafPaths(value, prefix = []) {
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => leafPaths(child, [...prefix, key]));
  return [prefix];
}
function mutatedLeaf(value) {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return `${value}__forged`;
  if (value === null) return "forged";
  throw new Error("unsupported_leaf_type");
}
function setPath(value, claimPath, replacement) { let cursor = value; for (const key of claimPath.slice(0, -1)) cursor = cursor[key]; cursor[claimPath.at(-1)] = replacement; }
function verifyFile(file, evidenceRoot, archiveRoot, artifactRoot) {
  const root = path.resolve(__dirname, "../..");
  assertValue(evidenceRoot && archiveRoot && artifactRoot, "explicit_evidence_archive_and_artifact_paths_required");
  const raw = fs.readFileSync(file, "utf8"), receipt = JSON.parse(raw);
  const expected = constructReceipt(root, evidenceRoot, archiveRoot, artifactRoot);
  const result = validateReceipt(receipt, raw, root, expected);
  validateProvenance(receipt, root, artifactRoot, archiveRoot, evidenceRoot);
  const claims = leafPaths(expected);
  for (const claimPath of claims) {
    const mutation = JSON.parse(JSON.stringify(expected));
    let cursor = mutation; for (const key of claimPath) cursor = cursor[key];
    setPath(mutation, claimPath, mutatedLeaf(cursor));
    if (claimPath.join(".") !== "validation.canonical_self_sha256") mutation.validation.canonical_self_sha256 = canonicalSelfSha256(mutation);
    let rejected = false; try { validateReceipt(mutation, JSON.stringify(mutation), root, expected); } catch (_) { rejected = true; }
    assertValue(rejected, `leaf_mutation_not_rejected:${claimPath.join(".")}`);
  }
  for (const mutation of [
    (() => { const value = JSON.parse(JSON.stringify(expected)); value.unknown_claim = true; return value; })(),
    (() => { const value = JSON.parse(JSON.stringify(expected)); delete value.verdict; return value; })(),
  ]) { let rejected = false; try { validateReceipt(mutation, JSON.stringify(mutation), root, expected); } catch (_) { rejected = true; } assertValue(rejected, "schema_exactness_mutation_not_rejected"); }
  return { ...result, rows: receipt.evidence.visual_matrix.rows, journeys: receipt.evidence.journeys.journey_count, mutation_rejected: true, exhaustive_leaf_claims: claims.length, unknown_and_missing_rejected: true };
}

if (require.main === module) {
  const root = path.resolve(__dirname, "../..");
  const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, RECEIPT_RELATIVE);
  const evidence = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
  const archive = process.argv[4] ? path.resolve(process.argv[4]) : undefined;
  const artifacts = process.argv[5] ? path.resolve(process.argv[5]) : undefined;
  try { process.stdout.write(`${JSON.stringify(verifyFile(file, evidence, archive, artifacts))}\n`); }
  catch (error) { process.stderr.write(`final receipt verification failed: ${error.message}\n`); process.exitCode = 1; }
}
module.exports = { RECEIPT_RELATIVE, BASELINE, PROVENANCE_TOKEN, campaignSourcePaths, sourceBindings, canonicalReceipt, canonicalSelfSha256, archiveFingerprint, archiveRawEntries, redactionBindings, parseGateLog, expectedGateAuthority, validateGateFacts, deriveReleaseVerdict, validateReleaseAuthority, validateRetainedArtifacts, validateRevision, validateProvenance, validateReceipt, validateVisualRowDiagnostics, validateVisualArtifacts, validateFocusedSeams, validatePrivacyArtifact, buildTaskWaveProvenance, validateTaskWaveProvenance, validateTaskWaveProvenanceFile, constructReceipt, leafPaths, parseCapabilityLog, verifyFile };
