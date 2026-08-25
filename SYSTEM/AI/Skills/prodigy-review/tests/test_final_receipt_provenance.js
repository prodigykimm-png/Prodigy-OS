"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const test = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../..");
const verifierPath = path.join(ROOT, "SYSTEM/CI/task16-final-receipt-verifier.js");
const { gateResult, scrub } = require(path.join(ROOT, "SYSTEM/CI/task16-scrub-retained-artifacts.js"));
const { scanPersistedReceipts } = require(path.join(ROOT, "SYSTEM/CI/task16-receipt-security.js"));
const verifier = require(verifierPath);
const builder = require(path.join(ROOT, "SYSTEM/CI/task16-final-receipt-builder.js"));
const { normalizeScreenshotPaths } = builder;
const gitProbe = cp.spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
const HAS_GIT = gitProbe.status === 0;
const HEAD = HAS_GIT ? gitProbe.stdout.trim() : "f".repeat(40);
const GREEN = "Release gate: 3/3 executed commands passed\nExecuted: 3\nSkipped: 0\nNot applicable: 2\nFailures: 0\nVERDICT: GREEN\n";
function realObsidianCapability(name) {
  return name === "test_knowledge_explorer_responsive.js" || /^test_.*_real_obsidian_.*\.js$/u.test(name) || /^test_real_obsidian_.*\.js$/u.test(name)
    || ["test_real_hub_transition_lifecycle.js", "test_shared_real_obsidian_controls.js", "test_workout_real_controller_publication.js"].includes(name);
}
function countCapabilities(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const absolute = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? countCapabilities(absolute) : entry.isFile() && realObsidianCapability(entry.name) ? 1 : 0);
  }, 0);
}
const MANIFEST_TOTAL = JSON.parse(fs.readFileSync(path.join(ROOT, "SYSTEM/CI/release-gate-manifest.json"), "utf8")).total_commands;
const AUTHORITY_NOT_APPLICABLE = countCapabilities(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests"));
const AUTHORITY_TOTAL = MANIFEST_TOTAL - AUTHORITY_NOT_APPLICABLE;
const GREEN_AUTHORITY = `Release gate: ${AUTHORITY_TOTAL}/${AUTHORITY_TOTAL} executed commands passed\nExecuted: ${AUTHORITY_TOTAL}\nSkipped: 0\nNot applicable: ${AUTHORITY_NOT_APPLICABLE}\nFailures: 0\nVERDICT: GREEN\n`;
const RED_AUTHORITY = `Release gate: ${AUTHORITY_TOTAL - 1}/${AUTHORITY_TOTAL} executed commands passed\nExecuted: ${AUTHORITY_TOTAL}\nSkipped: 0\nNot applicable: ${AUTHORITY_NOT_APPLICABLE}\nFailures: 1\nVERDICT: RED\n`;
const CAPABILITY_FIXTURES = [
  "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/capability-custom-success.txt",
  "SYSTEM/AI/Skills/prodigy-review/tests/shared/fixtures/capability-node24-spec-success.txt",
];
function invoke(receiptFile, artifacts, archive) {
  const source = `const fs=require('node:fs'),v=require(${JSON.stringify(verifierPath)}),r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));v.validateRetainedArtifacts(r,process.argv[2],process.argv[3]);${HAS_GIT ? `v.validateRevision(r,${JSON.stringify(ROOT)});` : ""}`;
  return cp.spawnSync(process.execPath, ["-e", source, receiptFile, artifacts, archive], { encoding: "utf8" });
}
test("retained artifact scrub removes path-shaped and synthetic-secret test values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "task16-scrub-test-"));
  try {
    const file = path.join(root, "artifact.log");
    fs.writeFileSync(path.join(root, "path-manifest.json"), JSON.stringify({ path: "archive/SYSTEM/AI/Reports/task-10-knowledge-hub-integration-evidence.md" }));
    assert.deepEqual(scanPersistedReceipts(root).hits, [], "task path fragments are not synthetic OpenAI secrets");
    fs.writeFileSync(file, "/Users/example/x /home/runner/x /private/var/folders/x /tmp/x file:///x .senpi/worktrees sk-abcdefghijklmnopqrstuvwxyz AKIAABCDEFGHIJKLMNOP\n");
    const manifestFile = path.join(root, "redaction-manifest.json"), result = scrub(root, manifestFile);
    assert.equal(result.file_count, 2); assert.ok(result.replacement_count >= 8);
    assert.deepEqual(scanPersistedReceipts(root).hits, []);
    fs.writeFileSync(file, `${GREEN}/Users/example/private\n`); scrub(root, manifestFile);
    assert.deepEqual(gateResult(fs.readFileSync(file, "utf8")), { executed: 3, skipped: 0, not_applicable: 2, failures: 0, verdict: "GREEN" });
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("Failures: 0", "Failures: 1").replace("VERDICT: GREEN", "VERDICT: RED")); scrub(root, manifestFile);
    assert.deepEqual(gateResult(fs.readFileSync(file, "utf8")), { executed: 3, skipped: 0, not_applicable: 2, failures: 1, verdict: "RED" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("gate parser accepts one terminal GREEN summary and rejects RED, duplicate, conflicting, missing, skipped, and post-summary errors", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task16-gate-parser-"));
  try {
    const file = path.join(temp, "gate.log");
    fs.writeFileSync(file, GREEN);
    const parsed = verifier.parseGateLog(file);
    assert.deepEqual({ ...parsed, output_sha256: "bound" }, { output_sha256: "bound", commands_passed: 3, commands_total: 3, skipped: 0, not_applicable: 2, failures: 0, verdict: "GREEN" });
    for (const [label, raw] of [
      ["RED", RED_AUTHORITY],
      ["duplicate", `${GREEN}${GREEN}`],
      ["conflicting", `${RED_AUTHORITY}${GREEN}`],
      ["missing", GREEN.replace("Failures: 0\n", "")],
      ["skipped", GREEN.replace("Skipped: 0", "Skipped: 1")],
      ["post-summary error", `${GREEN}ERROR: forged late failure\n`],
    ]) { fs.writeFileSync(file, raw); assert.throws(() => verifier.parseGateLog(file), /gate_log_|gate_authority_/u, label); }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("both internally consistent RED gates reject before candidate write and independently reject a self-hashed PASS forgery", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task16-red-gate-authority-"));
  try {
    const artifacts = path.join(temp, "artifacts"); fs.mkdirSync(path.join(artifacts, "portable-working"), { recursive: true }); fs.mkdirSync(path.join(artifacts, "portable-clean"), { recursive: true });
    for (const relative of ["portable-working/gate-output.log", "portable-clean/gate-output.log"]) fs.writeFileSync(path.join(artifacts, relative), RED_AUTHORITY);
    const digest = require("node:crypto").createHash("sha256").update(RED_AUTHORITY).digest("hex");
    const redGate = { output_sha256: digest, commands_passed: AUTHORITY_TOTAL - 1, commands_total: AUTHORITY_TOTAL, skipped: 0, not_applicable: AUTHORITY_NOT_APPLICABLE, failures: 1, verdict: "RED" };
    const forged = { schema_version: "task16-final-release-receipt-v3", verdict: "PASS", canonical_gates: { working_tree: { ...redGate, artifact_path: "portable-working/gate-output.log" }, metadata_free_clean_projection: { ...redGate, artifact_path: "portable-clean/gate-output.log" } }, validation: { canonical_self_sha256: null } };
    forged.validation.canonical_self_sha256 = verifier.canonicalSelfSha256(forged);
    assert.equal(forged.validation.canonical_self_sha256, verifier.canonicalSelfSha256(forged), "forgery has a valid canonical self-hash");
    assert.throws(() => verifier.validateReleaseAuthority(forged, ROOT, artifacts), /gate_authority_|gate_log_/u, "verifier reconstructs authority from both retained raw logs");

    const candidate = path.join(temp, "candidate.json"), original = verifier.constructReceipt;
    verifier.constructReceipt = () => { verifier.validateReleaseAuthority(forged, ROOT, artifacts); return forged; };
    try { assert.throws(() => builder.build(temp, temp, artifacts, candidate), /gate_authority_|gate_log_/u); }
    finally { verifier.constructReceipt = original; }
    assert.equal(fs.existsSync(candidate), false, "builder rejects before writing candidate bytes");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("capability parser accepts the exact retained Node 24 spec summary and binds structural counts", () => {
  const raw = fs.readFileSync(path.join(ROOT, CAPABILITY_FIXTURES[1]), "utf8");
  assert.deepEqual(verifier.parseCapabilityLog(raw), { reporter: "node24-spec", total: 1, passed: 1, failed: 0, skipped: 0, cancelled: 0, todo: 0 });
});

test("capability parser rejects missing, duplicate, conflicting, failing, skipped, truncated, forged, and zero-test summaries", () => {
  const raw = fs.readFileSync(path.join(ROOT, CAPABILITY_FIXTURES[1]), "utf8");
  const replacements = [
    ["missing", raw.replace("ℹ tests 1\n", "")],
    ["duplicate", `${raw}ℹ tests 1\n`],
    ["conflicting", raw.replace("ℹ tests 1", "ℹ tests 1\nℹ tests 2")],
    ["nonzero fail", raw.replace("ℹ pass 1\nℹ fail 0", "ℹ pass 0\nℹ fail 1")],
    ["nonzero skipped", raw.replace("ℹ tests 1", "ℹ tests 2").replace("ℹ skipped 0", "ℹ skipped 1")],
    ["truncated", raw.replace(/ℹ duration_ms[^\n]+\n$/u, "")],
    ["ANSI", raw.replace("ℹ tests", "\u001b[32mℹ tests")],
    ["control", raw.replace("ℹ tests", "\u0000ℹ tests")],
    ["prefixed fake", `forged ℹ tests 1\n${raw}`],
    ["zero test", raw.replace("ℹ tests 1", "ℹ tests 0").replace("ℹ pass 1", "ℹ pass 0")],
    ["TAP unsupported", raw.replaceAll("ℹ ", "# ")],
  ];
  for (const [label, forged] of replacements) assert.throws(() => verifier.parseCapabilityLog(forged), /capability_/u, label);
});

test("custom capability summary rejects schema, count, status, duplication, and prefix forgeries", () => {
  const raw = fs.readFileSync(path.join(ROOT, CAPABILITY_FIXTURES[0]), "utf8");
  for (const [label, forged] of [
    ["unknown field", raw.replace('"todo":0}', '"todo":0,"unknown":0}')],
    ["missing field", raw.replace(',"todo":0', "")],
    ["zero test", raw.replace('"total":1,"passed":1', '"total":0,"passed":0')],
    ["failed", raw.replace('"passed":1,"failed":0', '"passed":0,"failed":1')],
    ["skipped", raw.replace('"passed":1,"failed":0,"skipped":0', '"passed":0,"failed":0,"skipped":1')],
    ["duplicate", `${raw}TASK16_CAPABILITY_SUMMARY {"schema_version":"task16-capability-command-summary-v1","total":1,"passed":1,"failed":0,"skipped":0,"cancelled":0,"todo":0}\n`],
    ["prefixed", raw.replace("TASK16_CAPABILITY_SUMMARY", "forged TASK16_CAPABILITY_SUMMARY")],
  ]) assert.throws(() => verifier.parseCapabilityLog(forged), /capability_/u, label);
});

test("capability parser covers every supported capability command format", () => {
  const summaries = CAPABILITY_FIXTURES.map((relative) => verifier.parseCapabilityLog(fs.readFileSync(path.join(ROOT, relative), "utf8")));
  assert.deepEqual(summaries.map((summary) => summary.reporter).sort(), ["node24-spec", "task16-structural"]);
  assert.equal(summaries.every((summary) => summary.total > 0 && summary.total === summary.passed && summary.failed === 0 && summary.skipped === 0), true);
});

test("capability fixture dependencies are literal-bound in the canonical projection and current clean checkout", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "SYSTEM/CI/release-gate-manifest.json"), "utf8"));
  const projected = new Map(manifest.delivery.projected_paths.map((entry) => [entry.path, entry]));
  for (const relative of CAPABILITY_FIXTURES) {
    const entry = projected.get(relative);
    assert.ok(entry, `fixture absent from canonical projection: ${relative}`);
    assert.equal(entry.hash_mode, "raw", `fixture must use literal raw hashing: ${relative}`);
    const bytes = fs.readFileSync(path.join(ROOT, relative));
    assert.equal(require("node:crypto").createHash("sha256").update(bytes).digest("hex"), entry.sha256, `fixture projection hash mismatch: ${relative}`);
    assert.equal(bytes.includes(13), false, `fixture must retain LF-only line endings: ${relative}`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, CAPABILITY_FIXTURES[1]), "utf8"), /^✔[^\n]+\nℹ tests 1\n[\s\S]+\n$/u, "Node24 Unicode reporter fixture bytes");
  assert.match(fs.readFileSync(path.join(ROOT, CAPABILITY_FIXTURES[0]), "utf8"), /\nTASK16_CAPABILITY_SUMMARY \{"schema_version":"task16-capability-command-summary-v1"[^\n]+\}\n$/u, "typed custom terminal fixture bytes");
});

test("final workflow prepares evidence before one attestable scrub and privacy scan", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/CI/run-final-release.sh"), "utf8");
  const ordered = ["--prepare-evidence", "task16-scrub-retained-artifacts.js", "task16-receipt-security.js", "--prepare-provenance-map", "task16-final-receipt-builder.js \"$EVIDENCE\"", "task16-final-receipt-verifier.js"];
  let cursor = -1;
  for (const token of ordered) { const next = source.indexOf(token, cursor + 1); assert.ok(next > cursor, `missing or misordered final step: ${token}`); cursor = next; }
  assert.ok(source.includes('"$ARTIFACTS/redaction-manifest.json"'));
  assert.ok(source.includes('"test_real_obsidian_diagnostic_gate.js"') && source.includes('unset TASK13A_SCREENSHOT_DIR'), "only the diagnostic gate may retain canonical screenshots");
  assert.match(source, /TASK13A_DIAGNOSTIC_OUTPUT="\$EVIDENCE\/real-obsidian-visual-288\.json"/, "final workflow retains the 288-row visual authority");
  const toolPreflight = source.indexOf('PRODIGY_NODE_BIN=');
  const confinement = source.indexOf('FINAL_ROOT="$(mktemp');
  const firstGate = source.indexOf('portable-working/gate-output.log');
  assert.ok(toolPreflight >= 0 && toolPreflight < confinement && confinement < firstGate, "Node 24 and uv resolve before confinement and every gate");
  assert.match(source, /ORIGINAL_PATH="\$PATH"/, "final workflow preserves the inherited executable search path");
  assert.match(source, /export PATH="\$\(dirname "\$PRODIGY_NODE_BIN"\):\$\(dirname "\$PRODIGY_UV_BIN"\):\$ORIGINAL_PATH"/, "resolved tool directories augment rather than replace PATH");
  assert.match(source, /final release preflight: node=.*uv=/, "tool identities are proven before evidence allocation");
  assert.match(source, /capability-runner-summary\.json/u, "runner count authority is retained for receipt binding");
  const candidateBuild = source.indexOf('"$CANDIDATE_RECEIPT"');
  const candidateVerify = source.indexOf('task16-final-receipt-verifier.js "$CANDIDATE_RECEIPT"');
  const receiptPromotion = source.indexOf('cp "$CANDIDATE_RECEIPT" "$RECEIPT"');
  assert.ok(candidateBuild >= 0 && candidateBuild < candidateVerify && candidateVerify < receiptPromotion, "legacy receipt changes only after candidate verification passes");
});

test("final verifier makes visual omissions and every typed receipt leaf independently rejectable", () => {
  const source = fs.readFileSync(verifierPath, "utf8");
  for (const token of [
    'visual.row_count === 288', 'normalRows.length === 256', 'modalRows.length === 32',
    'modalBindings === 32', 'modalKeyboardFailures === 0', 'mediaFailures === 0',
    'actualHashes.size === 288', 'screenshotHashes.size === 288',
    'leafPaths(expected)', 'receipt_claim_or_schema_mismatch', 'unknown_claim', 'delete value.verdict'
  ]) assert.ok(source.includes(token), `missing verifier binding: ${token}`);
});

test("task and wave provenance requires every named requirement to bind retained source and dual GREEN gate artifacts", () => {
  assert.equal(typeof verifier.buildTaskWaveProvenance, "function", "provenance builder must be explicit and machine-derived");
  assert.equal(typeof verifier.validateTaskWaveProvenance, "function", "provenance verifier must be explicit and machine-derived");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task16-task-wave-provenance-"));
  try {
    const evidence = path.join(temp, "evidence"), artifacts = path.join(temp, "artifacts");
    fs.mkdirSync(evidence); fs.mkdirSync(path.join(artifacts, "portable-working"), { recursive: true }); fs.mkdirSync(path.join(artifacts, "portable-clean"), { recursive: true });
    const tests = [];
    const walk = (directory, relative = "") => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const next = path.join(directory, entry.name), token = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) walk(next, token);
        else if (entry.isFile() && /^test_.*\.js$/u.test(entry.name)) tests.push(`SYSTEM/AI/Skills/prodigy-review/tests/${token}`);
      }
    };
    walk(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests"));
    const green = `${tests.sort().map((testFile) => `PASS: javascript-test: ${testFile}`).join("\n")}\nRelease gate: 1/1 executed commands passed\nExecuted: 1\nSkipped: 0\nNot applicable: 0\nFailures: 0\nVERDICT: GREEN\n`;
    for (const gate of ["portable-working/gate-output.log", "portable-clean/gate-output.log"]) fs.writeFileSync(path.join(artifacts, gate), green);
    const map = verifier.buildTaskWaveProvenance(evidence, ROOT, artifacts);
    assert.equal(map.requirements.length, 24, "Tasks 1-16 and Waves 1-8 are all bound");
    assert.doesNotThrow(() => verifier.validateTaskWaveProvenance(map, evidence, ROOT, artifacts));
    const incomplete = structuredClone(map); incomplete.requirements.pop();
    assert.throws(() => verifier.validateTaskWaveProvenance(incomplete, evidence, ROOT, artifacts), /provenance_(?:requirement_set|coverage)_invalid/u, "missing task/wave binding rejects");
    const forged = structuredClone(map); forged.requirements[0].artifacts[0].sha256 = "0".repeat(64);
    assert.throws(() => verifier.validateTaskWaveProvenance(forged, evidence, ROOT, artifacts), /provenance_artifact_(?:hash|binding)_invalid/u, "forged retained-artifact binding rejects");
    const unbound = structuredClone(map); unbound.requirements[0].artifacts.pop();
    assert.throws(() => verifier.validateTaskWaveProvenance(unbound, evidence, ROOT, artifacts), /provenance_artifact_(?:binding|coverage)_invalid/u, "incomplete task/artifact binding rejects");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("fresh builder cannot read, copy, or merge a poisoned legacy final receipt", () => {
  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/CI/task16-final-receipt-builder.js"), "utf8");
  assert.doesNotMatch(source, /readFileSync\(RECEIPT|JSON\.parse\(fs\.readFileSync\(RECEIPT|\.\.\.receipt\./u);
  assert.match(source, /constructReceipt\(ROOT, evidenceRoot, archiveRoot, artifactRoot\)/u);
  const poisonedLegacy = { verdict: "PASS", frozen_projection: { literal_checks_passed: 999, same_path_mutation_rejected: true, restored_exactly: true }, evidence: { focused_responsive: { working: "GREEN" } } };
  for (const obsolete of ["literal_checks_passed", "same_path_mutation_rejected", "restored_exactly", "focused_responsive"]) assert.equal(source.includes(`receipt.${obsolete}`), false, `poisoned ${obsolete} has no builder influence`);
  assert.equal(poisonedLegacy.frozen_projection.literal_checks_passed, 999, "poison fixture is intentionally authoritative-looking");
});

test("recomputed self-hash never authorizes named, gate-authority, or generic claim forgeries", () => {
  const greenGate = { output_sha256: "a".repeat(64), commands_passed: AUTHORITY_TOTAL, commands_total: AUTHORITY_TOTAL, skipped: 0, not_applicable: AUTHORITY_NOT_APPLICABLE, failures: 0, verdict: "GREEN", artifact_path: "gate.log" };
  const expected = { schema_version: "x", verdict: "PASS", canonical_gates: { working_tree: greenGate, metadata_free_clean_projection: { ...greenGate } }, frozen_projection: { literal_checks_passed: 7, same_path_mutation_rejected: true, restored_exactly: true }, evidence: { focused_responsive: { working: "GREEN" } }, count: 3, validation: { canonical_self_sha256: null } };
  expected.validation.canonical_self_sha256 = verifier.canonicalSelfSha256(expected);
  for (const claimPath of verifier.leafPaths(expected)) {
    if (claimPath.join(".") === "validation.canonical_self_sha256") continue;
    const forged = structuredClone(expected); let cursor = forged; for (const key of claimPath.slice(0, -1)) cursor = cursor[key]; const key = claimPath.at(-1), value = cursor[key]; cursor[key] = typeof value === "boolean" ? !value : typeof value === "number" ? value + 1 : `${value}__forged`;
    forged.validation.canonical_self_sha256 = verifier.canonicalSelfSha256(forged);
    assert.throws(() => verifier.validateReceipt(forged, JSON.stringify(forged), ROOT, expected), /receipt_claim_or_schema_mismatch|receipt_verdict_authority_invalid|gate_authority_/u, claimPath.join("."));
  }
});

test("visual screenshot paths retain only the verifiable persisted token", () => {
  const visual = { rows: [{ screenshot: { path: "/Users/example/private/run/row.png", sha256: "a".repeat(64) } }] };
  assert.equal(normalizeScreenshotPaths(visual).rows[0].screenshot.path, "screenshots-happy/row.png");
});

test("visual rows reject gradient and chrome-shadow mutations", () => {
  const clean = { gradients: [], offenders: { chromeShadow: [] } };
  assert.equal(verifier.validateVisualRowDiagnostics(clean), true);
  assert.throws(() => verifier.validateVisualRowDiagnostics({ ...clean, gradients: [{ selector: ".forged" }] }), /gradient/);
  assert.throws(() => verifier.validateVisualRowDiagnostics({ gradients: [], offenders: { chromeShadow: [{ selector: ".forged" }] } }), /chrome_shadow/);
});

test("retained gate/archive and live revision claims reject temporary-copy forgeries", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "task16-provenance-forgery-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const artifacts = path.join(temp, "artifacts"), archive = path.join(temp, "archive"); fs.mkdirSync(artifacts); fs.mkdirSync(archive);
  fs.writeFileSync(path.join(archive, "sentinel"), "archive bytes\n");
  for (const name of ["working.log", "clean.log"]) fs.writeFileSync(path.join(artifacts, name), GREEN_AUTHORITY);
  const redactionFile = path.join(artifacts, "redaction-manifest.json"), redaction = scrub(temp, redactionFile);
  const parsed = verifier.parseGateLog(path.join(artifacts, "working.log"));
  const receipt = { verdict: "PASS", revision: { baseline: verifier.BASELINE, detached_head: HEAD, history_modified: false }, retained_artifact_redaction: { sha256: verifier.fileSha256 ? verifier.fileSha256(redactionFile) : require("node:crypto").createHash("sha256").update(fs.readFileSync(redactionFile)).digest("hex"), file_count: redaction.file_count, replacement_count: redaction.replacement_count }, frozen_projection: { archive_sha256: verifier.archiveFingerprint(archive, redactionFile, temp) }, canonical_gates: { working_tree: { ...parsed, artifact_path: "working.log" }, metadata_free_clean_projection: { ...parsed, artifact_path: "clean.log" } } };
  const receiptFile = path.join(temp, "receipt.json"); fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  const control = invoke(receiptFile, artifacts, archive);
  assert.equal(control.status, 0, `control provenance must verify:\n${control.stdout}\n${control.stderr}`);
  const forgeries = [
    ["gate digest", (value) => { value.canonical_gates.working_tree.output_sha256 = "0".repeat(64); }],
    ["archive digest", (value) => { value.frozen_projection.archive_sha256 = "0".repeat(64); }]
  ];
  if (HAS_GIT) forgeries.push(
    ["baseline", (value) => { value.revision.baseline = "0".repeat(40); }],
    ["detached HEAD", (value) => { value.revision.detached_head = "0".repeat(40); }]
  );
  for (const [label, mutate] of forgeries) {
    const forged = JSON.parse(JSON.stringify(receipt)); mutate(forged); fs.writeFileSync(receiptFile, JSON.stringify(forged));
    assert.notEqual(invoke(receiptFile, artifacts, archive).status, 0, `${label} forgery must exit nonzero`);
  }
  fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  fs.writeFileSync(path.join(artifacts, "working.log"), GREEN_AUTHORITY.replace(`${AUTHORITY_TOTAL}/${AUTHORITY_TOTAL}`, `${AUTHORITY_TOTAL - 1}/${AUTHORITY_TOTAL}`));
  assert.notEqual(invoke(receiptFile, artifacts, archive).status, 0, "mismatched command count must exit nonzero");
  fs.writeFileSync(path.join(artifacts, "working.log"), `${RED_AUTHORITY}/Users/forged/path\n`);
  const changedRedaction = scrub(temp, redactionFile), changedReceipt = JSON.parse(JSON.stringify(receipt)), crypto = require("node:crypto");
  changedRedaction.entries = [...changedRedaction.entries.filter((entry) => !entry.path.startsWith("archive/")), ...redaction.entries.filter((entry) => entry.path.startsWith("archive/"))].sort((a, b) => a.path.localeCompare(b.path));
  changedRedaction.file_count = changedRedaction.entries.length; changedRedaction.replacement_count = changedRedaction.entries.reduce((sum, entry) => sum + entry.replacements, 0); delete changedRedaction.digest; changedRedaction.digest = crypto.createHash("sha256").update(JSON.stringify(changedRedaction)).digest("hex"); fs.writeFileSync(redactionFile, `${JSON.stringify(changedRedaction, null, 2)}\n`);
  changedReceipt.retained_artifact_redaction = { ...changedReceipt.retained_artifact_redaction, sha256: crypto.createHash("sha256").update(fs.readFileSync(redactionFile)).digest("hex"), file_count: changedRedaction.file_count, replacement_count: changedRedaction.replacement_count };
  changedReceipt.canonical_gates.working_tree.output_sha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(artifacts, "working.log"))).digest("hex");
  fs.writeFileSync(receiptFile, JSON.stringify(changedReceipt));
  assert.notEqual(invoke(receiptFile, artifacts, archive).status, 0, "redaction and rebound hashes must not conceal a changed command result");
  process.stdout.write(`PROVENANCE_FORGERIES artifact=3 history_executed=${HAS_GIT ? 2 : 0} history_not_applicable=${HAS_GIT ? 0 : 2}\n`);
});
