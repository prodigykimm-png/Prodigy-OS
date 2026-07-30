#!/usr/bin/env node
"use strict";

/**
 * Plan-specific evidence audit for the Prodigy responsive workspace overhaul.
 *
 * The audit is read-only. It validates an evidence-manifest.json (or manifest.json)
 * inside --evidence and never interprets a desktop resize or grep result as device
 * proof. Physical-device success is true only after validating an F3 receipt.
 */

const fs = require("node:fs");
const path = require("node:path");

const PLAN_SLUG = "prodigy-responsive-workspace-ai-overhaul";
const MANIFEST_NAMES = Object.freeze(["evidence-manifest.json", "manifest.json"]);
const REQUIRED_CHECKS = Object.freeze([
  "overflow",
  "touch_targets",
  "theme_token_use",
  "focus",
  "reduced_motion",
  "exactly_one_home",
  "approval_boundaries",
  "evidence_completeness",
  "scoped_commits",
  "device_receipts"
]);
const PHYSICAL_DEVICE_IDS = Object.freeze([
  "iphone-15-pro-max-portrait",
  "ipad-pro-13-portrait",
  "ipad-pro-13-landscape",
  "mac-wide",
  "mac-narrow"
]);

const SECRET_PATTERNS = Object.freeze([
  { name: "openai_api_key", regex: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "google_api_key", regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "github_token", regex: /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g },
  { name: "slack_token", regex: /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g },
  { name: "aws_access_key", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "bearer_value", regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi },
  {
    name: "assigned_credential",
    regex: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key)\b\s*[:=]\s*["']?([A-Za-z0-9._~+/=-]{16,})/gi,
    capture: 1
  }
]);
const PLACEHOLDER_WORDS = /(?:example|placeholder|replace[_-]?me|redacted|your[_-]?key|not[_-]?a[_-]?secret)/i;
const TEXT_EXTENSIONS = new Set([
  ".json", ".jsonl", ".md", ".txt", ".log", ".csv", ".tsv", ".yaml", ".yml", ".html", ".xml"
]);

const HELP = `Usage:
  node SYSTEM/SCRIPTS/prodigy-plan-audit.js --plan <slug> --evidence <dir> [options]

Required:
  --plan <slug>              Bind the audit to ${PLAN_SLUG}.
  --evidence <dir>           Evidence pack containing evidence-manifest.json or manifest.json.

Options:
  --phase <name>             Require the manifest phase to equal <name>.
  --no-physical-claim        Record that automation has NOT proven physical-device behavior.
  --physical-receipt <dir>   Validate a human F3 physical-device receipt directory before claiming success.
  --all-implementation-tasks Require a complete manifest entry for every numbered plan task.
  --docs-closure             Require DESIGN.md and SYSTEM/docs/09_Obsidian_Manual.md to document shipped contracts.
  --help                     Show this help.

Manifest contract:
  plan_slug, phase, commands[{command, exit_code, artifact}], devices[{id, kind, method, artifacts}],
  scope{allowed_files, changed_files, commits[{sha, files}]}, and checks for:
  overflow, touch_targets, theme_token_use, focus, reduced_motion, exactly_one_home,
  approval_boundaries, evidence_completeness, scoped_commits, and device_receipts.

Each check needs status="pass", its binary observations, and at least one non-empty
artifact inside the evidence directory. Device method="grep" and resized Desktop
screenshot evidence are rejected. --physical-receipt expects device-manifest.json,
operator-notes.md, redaction-log.md, physical screenshots, and all canonical devices.
`;

function parseArgs(argv) {
  const options = {
    help: false,
    noPhysicalClaim: false,
    allImplementationTasks: false,
    docsClosure: false,
    errors: []
  };
  const valueFlags = new Map([
    ["--plan", "plan"],
    ["--evidence", "evidence"],
    ["--phase", "phase"],
    ["--physical-receipt", "physicalReceipt"]
  ]);
  const booleanFlags = new Map([
    ["--help", "help"],
    ["--no-physical-claim", "noPhysicalClaim"],
    ["--all-implementation-tasks", "allImplementationTasks"],
    ["--docs-closure", "docsClosure"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (booleanFlags.has(token)) {
      options[booleanFlags.get(token)] = true;
      continue;
    }
    if (valueFlags.has(token)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        options.errors.push(`${token} requires a value`);
      } else {
        options[valueFlags.get(token)] = value;
        index += 1;
      }
      continue;
    }
    options.errors.push(`unknown argument: ${token}`);
  }
  if (options.noPhysicalClaim && options.physicalReceipt) {
    options.errors.push("--no-physical-claim and --physical-receipt are mutually exclusive");
  }
  return options;
}

function addError(errors, code, message, detail = {}) {
  errors.push({ code, message, ...detail });
}

function readJson(filePath, errors, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    addError(errors, code, `cannot read JSON: ${path.basename(filePath)}`, { reason: error.message });
    return null;
  }
}

function findManifest(evidenceRoot) {
  return MANIFEST_NAMES
    .map((name) => path.join(evidenceRoot, name))
    .find((candidate) => fs.existsSync(candidate)) || null;
}

function walkFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return files;
  if (stat.isFile()) {
    files.push(root);
    return files;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    walkFiles(path.join(root, entry.name), files);
  }
  return files;
}

function isTextEvidence(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function lineAndColumn(content, index) {
  const prefix = content.slice(0, index);
  const line = prefix.split("\n").length;
  const lastNewline = prefix.lastIndexOf("\n");
  return { line, column: index - lastNewline };
}

function scanTextForSecrets(content, relativeFile = "<memory>") {
  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      const credential = pattern.capture ? match[pattern.capture] : match[0];
      if (!pattern.capture || !PLACEHOLDER_WORDS.test(credential)) {
        hits.push({
          file: relativeFile,
          detector: pattern.name,
          ...lineAndColumn(content, match.index)
        });
      }
      if (match[0].length === 0) pattern.regex.lastIndex += 1;
    }
  }
  return hits;
}

function scanEvidenceForSecrets(evidenceRoot) {
  const hits = [];
  for (const filePath of walkFiles(evidenceRoot)) {
    if (!isTextEvidence(filePath)) continue;
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (_error) {
      continue;
    }
    hits.push(...scanTextForSecrets(content, path.relative(evidenceRoot, filePath)));
  }
  return hits;
}

function resolveArtifact(evidenceRoot, artifact) {
  if (typeof artifact !== "string" || artifact.length === 0) return null;
  const resolved = path.resolve(evidenceRoot, artifact);
  const rootPrefix = `${path.resolve(evidenceRoot)}${path.sep}`;
  return resolved.startsWith(rootPrefix) ? resolved : null;
}

function validateArtifacts(evidenceRoot, owner, artifacts, errors) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    addError(errors, "MISSING_ARTIFACT", `${owner} has no artifact`);
    return false;
  }
  let ok = true;
  for (const artifact of artifacts) {
    const resolved = resolveArtifact(evidenceRoot, artifact);
    if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile() || fs.statSync(resolved).size === 0) {
      addError(errors, "INVALID_ARTIFACT", `${owner} artifact is missing, empty, or outside evidence`, { artifact });
      ok = false;
    }
  }
  return ok;
}

function validateCommands(manifest, evidenceRoot, errors) {
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) {
    addError(errors, "MISSING_COMMAND_EVIDENCE", "manifest commands are missing");
    return;
  }
  manifest.commands.forEach((entry, index) => {
    if (!entry || typeof entry.command !== "string" || entry.command.length === 0) {
      addError(errors, "INVALID_COMMAND", `commands[${index}] has no command`);
    }
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, "exit_code") || !Number.isInteger(entry.exit_code)) {
      addError(errors, "MISSING_COMMAND_EXIT_CODE", `commands[${index}] has no integer exit_code`);
    } else if (entry.expected_exit === "zero" && entry.exit_code !== 0) {
      addError(errors, "UNEXPECTED_COMMAND_EXIT", `commands[${index}] expected exit 0`, { exit_code: entry.exit_code });
    } else if (entry.expected_exit === "nonzero" && entry.exit_code === 0) {
      addError(errors, "UNEXPECTED_COMMAND_EXIT", `commands[${index}] expected a nonzero exit`, { exit_code: entry.exit_code });
    } else if (Number.isInteger(entry.expected_exit) && entry.exit_code !== entry.expected_exit) {
      addError(errors, "UNEXPECTED_COMMAND_EXIT", `commands[${index}] exit does not match expected_exit`, { exit_code: entry.exit_code });
    }
    const artifacts = Array.isArray(entry && entry.artifacts)
      ? entry.artifacts
      : (entry && typeof entry.artifact === "string" ? [entry.artifact] : []);
    validateArtifacts(evidenceRoot, `commands[${index}]`, artifacts, errors);
  });
}

function invalidDeviceMethod(method) {
  const normalized = String(method || "").toLowerCase().replace(/[ _-]+/g, " ");
  return normalized.includes("grep") ||
    (normalized.includes("desktop") && normalized.includes("resize") && normalized.includes("screenshot"));
}

function validateDevices(manifest, evidenceRoot, errors) {
  if (!Array.isArray(manifest.devices) || manifest.devices.length === 0) {
    addError(errors, "MISSING_DEVICE_ENTRY", "manifest has no device entry");
    return;
  }
  manifest.devices.forEach((device, index) => {
    const owner = `devices[${index}]`;
    if (!device || typeof device.id !== "string" || !device.id) {
      addError(errors, "INVALID_DEVICE_ENTRY", `${owner} has no id`);
    }
    if (!device || !["automated", "physical"].includes(device.kind)) {
      addError(errors, "INVALID_DEVICE_ENTRY", `${owner} kind must be automated or physical`);
    }
    if (!device || typeof device.method !== "string" || invalidDeviceMethod(device.method)) {
      addError(errors, "INVALID_DEVICE_PROOF", `${owner} uses grep, resized Desktop screenshot, or no measurement method`);
    }
    validateArtifacts(evidenceRoot, owner, device && device.artifacts, errors);
  });
}

function validateScope(manifest, errors) {
  const scope = manifest.scope;
  if (!scope || !Array.isArray(scope.allowed_files) || !Array.isArray(scope.changed_files) || !Array.isArray(scope.commits)) {
    addError(errors, "MISSING_SCOPE", "scope.allowed_files, scope.changed_files, and scope.commits are required");
    return;
  }
  const allowed = new Set(scope.allowed_files);
  const outside = scope.changed_files.filter((file) => !allowed.has(file));
  if (outside.length > 0) {
    addError(errors, "OUT_OF_SCOPE_CHANGE", "changed files exceed the declared scope", { files: outside });
  }
  scope.commits.forEach((commit, index) => {
    if (!commit || typeof commit.sha !== "string" || !Array.isArray(commit.files)) {
      addError(errors, "INVALID_SCOPED_COMMIT", `scope.commits[${index}] needs sha and files`);
      return;
    }
    const commitOutside = commit.files.filter((file) => !allowed.has(file));
    if (commitOutside.length > 0) {
      addError(errors, "OUT_OF_SCOPE_COMMIT", `scope.commits[${index}] contains out-of-scope files`, { files: commitOutside });
    }
  });
}

function validateCheckObservations(name, check, manifest, errors) {
  const fail = (message) => addError(errors, "FAILED_CHECK_OBSERVATION", `${name}: ${message}`);
  if (name === "overflow") {
    if (!Array.isArray(check.observations) || check.observations.length === 0) fail("observations are required");
    else if (check.observations.some((item) => item.horizontal_overflow !== false || item.nested_scroll !== false || invalidDeviceMethod(item.method))) {
      fail("every measured profile must report no horizontal overflow, no nested scroll, and a valid method");
    }
  } else if (name === "touch_targets") {
    if (check.measured !== true || !Number.isFinite(check.minimum_css_px) || check.minimum_css_px < 44) fail("measured minimum must be at least 44 CSS px");
  } else if (name === "theme_token_use") {
    if (check.obsidian_theme_tokens !== true || check.raw_color_count !== 0) fail("Obsidian theme tokens are required and raw color count must be zero");
  } else if (name === "focus") {
    if (check.keyboard_path_exercised !== true || check.focus_visible !== true || check.focus_return !== true) fail("keyboard path, visible focus, and focus return are required");
  } else if (name === "reduced_motion") {
    if (check.preference_tested !== true || check.nonessential_motion_removed !== true) fail("reduced-motion preference must be tested with nonessential motion removed");
  } else if (name === "exactly_one_home") {
    if (check.home_count !== 1) fail("home_count must equal exactly one");
  } else if (name === "approval_boundaries") {
    if (check.automatic_writes !== 0 || check.explicit_approval_required !== true) fail("automatic writes must be zero and explicit approval must be required");
  } else if (name === "evidence_completeness") {
    if (check.manifest_complete !== true) fail("manifest_complete must be true");
  } else if (name === "scoped_commits") {
    const scope = manifest.scope || {};
    const allowed = new Set(Array.isArray(scope.allowed_files) ? scope.allowed_files : []);
    const outside = (Array.isArray(scope.changed_files) ? scope.changed_files : []).filter((file) => !allowed.has(file));
    const commits = Array.isArray(scope.commits) ? scope.commits : [];
    const commitOutside = commits.flatMap((commit) => Array.isArray(commit.files) ? commit.files.filter((file) => !allowed.has(file)) : ["<invalid-commit>"]);
    if (check.scope_verified !== true || outside.length > 0 || commitOutside.length > 0) fail("scope must be verified with no changed or committed file outside allowed_files");
    if (check.commit_required === true && commits.length === 0) fail("at least one scoped commit is required for this phase");
  } else if (name === "device_receipts") {
    if (check.desktop_resize_claimed_as_physical === true || check.grep_claimed_as_visual_proof === true) fail("grep and resized Desktop screenshots cannot be device proof");
  }
}

function validateChecks(manifest, evidenceRoot, errors) {
  const checks = manifest.checks;
  if (!checks || typeof checks !== "object") {
    addError(errors, "MISSING_CHECKS", "manifest checks are missing");
    return;
  }
  for (const name of REQUIRED_CHECKS) {
    const check = checks[name];
    if (!check || check.status !== "pass") {
      addError(errors, "MISSING_REQUIRED_CHECK", `${name} is missing or not pass`);
      continue;
    }
    validateArtifacts(evidenceRoot, `checks.${name}`, check.artifacts, errors);
    validateCheckObservations(name, check, manifest, errors);
  }
}

function parsePlanTaskIds(planContent) {
  return Array.from(planContent.matchAll(/^- \[[ x]\] (\d+)\./gm), (match) => Number(match[1]));
}

function validateAllImplementationTasks(manifest, vaultRoot, errors) {
  const planPath = path.join(vaultRoot, ".omo", "plans", `${PLAN_SLUG}.md`);
  if (!fs.existsSync(planPath)) {
    addError(errors, "PLAN_FILE_MISSING", "cannot enumerate implementation tasks");
    return;
  }
  const requiredIds = parsePlanTaskIds(fs.readFileSync(planPath, "utf8"));
  const entries = Array.isArray(manifest.implementation_tasks) ? manifest.implementation_tasks : [];
  const byId = new Map(entries.map((entry) => [Number(entry.id), entry]));
  const missing = requiredIds.filter((id) => {
    const entry = byId.get(id);
    return !entry || entry.status !== "complete" || !Array.isArray(entry.artifacts) || entry.artifacts.length === 0;
  });
  if (missing.length > 0) {
    addError(errors, "INCOMPLETE_IMPLEMENTATION_TASKS", "not every numbered plan task is complete with artifacts", { tasks: missing });
  }
}

function validateDocumentationClosure(vaultRoot, errors) {
  const checkDoc = (docPath, requiredTerms, checkName) => {
    const absPath = path.join(vaultRoot, docPath);
    if (!fs.existsSync(absPath)) {
      addError(errors, "DOC_MISSING", `${docPath} is missing`, { check: checkName });
      return;
    }
    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch (_error) {
      addError(errors, "DOC_UNREADABLE", `${docPath} cannot be read`, { check: checkName });
      return;
    }
    const missing = requiredTerms.filter((term) => !content.includes(term));
    if (missing.length > 0) {
      addError(errors, "DOC_INCOMPLETE", `${docPath} is missing required terms`, { check: checkName, missing });
    }
  };

  const checkAbsent = (docPath, forbiddenTerms, checkName) => {
    const absPath = path.join(vaultRoot, docPath);
    if (!fs.existsSync(absPath)) return;
    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch (_error) { return; }
    const found = forbiddenTerms.filter((term) => content.includes(term));
    if (found.length > 0) {
      addError(errors, "DOC_FORBIDDEN_CLAIM", `${docPath} contains forbidden terms`, { check: checkName, found });
    }
  };

  // DESIGN.md must document canonical breakpoints, control heights, and three storage keys
  checkDoc("DESIGN.md", [
    "BREAKPOINTS",
    "768",
    "1024",
    "CONTROL_HEIGHTS",
    "prodigy.ui.workspace-state.v1",
    "prodigy.ui.scroll-state.v1",
    "prodigy.ai.chat-session.v1"
  ], "design-tokens-and-storage");

  // DESIGN.md must document App Shell primitives
  checkDoc("DESIGN.md", [
    "AppShell",
    "ContextBar",
    "WorkspaceSwitcher",
    "AdaptiveTabs",
    "AdaptiveActionBar",
    "BottomSheet",
    "StatusLine",
    "InlineError"
  ], "design-app-shell");

  // DESIGN.md must document AI context envelope
  checkDoc("DESIGN.md", [
    "buildContextEnvelope",
    "8 KiB",
    "workspace",
    "snapshot",
    "truncated"
  ], "design-ai-context");

  // DESIGN.md must document cleanup audit
  checkDoc("DESIGN.md", [
    "prodigy-cleanup-audit",
    "dry-run",
    "--apply"
  ], "design-cleanup");

  // DESIGN.md must document physical-device honesty
  checkDoc("DESIGN.md", [
    "not_proven",
    "physical_device_success"
  ], "design-physical-honesty");

  // Manual must document responsive behavior
  checkDoc("SYSTEM/docs/09_Obsidian_Manual.md", [
    "768px",
    "1024px",
    "AppShell",
    "WorkspaceStateStore",
    "prodigy.ai.chat-session.v1"
  ], "manual-responsive");

  // Forbidden claims in both docs
  const forbiddenClaims = [
    "HealthKit", "background sync", "subscription API", "Antigravity bridge",
    "physical-device success", "device-verified", "iPhone verified", "iPad verified"
  ];
  checkAbsent("DESIGN.md", forbiddenClaims, "design-no-unsupported");
  checkAbsent("SYSTEM/docs/09_Obsidian_Manual.md", forbiddenClaims, "manual-no-unsupported");
}

function validatePhysicalReceipt(receiptRoot, errors) {
  const requiredFiles = ["device-manifest.json", "operator-notes.md", "redaction-log.md"];
  for (const file of requiredFiles) {
    const filePath = path.join(receiptRoot, file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || fs.statSync(filePath).size === 0) {
      addError(errors, "MISSING_PHYSICAL_RECEIPT_FILE", `F3 receipt is missing non-empty ${file}`);
    }
  }
  const manifestPath = path.join(receiptRoot, "device-manifest.json");
  if (!fs.existsSync(manifestPath)) return false;
  const deviceManifest = readJson(manifestPath, errors, "INVALID_DEVICE_MANIFEST");
  if (!deviceManifest) return false;
  if (deviceManifest.plan_slug !== PLAN_SLUG) {
    addError(errors, "WRONG_PHYSICAL_PLAN_SLUG", "F3 device manifest has the wrong plan slug");
  }
  const devices = Array.isArray(deviceManifest.devices) ? deviceManifest.devices : [];
  const byId = new Map(devices.map((device) => [device.id, device]));
  for (const id of PHYSICAL_DEVICE_IDS) {
    const device = byId.get(id);
    if (!device) {
      addError(errors, "MISSING_PHYSICAL_DEVICE", `F3 device manifest is missing ${id}`);
      continue;
    }
    if (device.proof_type !== "physical" || !device.os_version || !device.obsidian_version) {
      addError(errors, "INVALID_PHYSICAL_DEVICE", `${id} must record physical proof, OS version, and Obsidian version`);
    }
    validateArtifacts(receiptRoot, `physical device ${id}`, device.screenshots, errors);
  }
  const receiptSecretHits = scanEvidenceForSecrets(receiptRoot);
  receiptSecretHits.forEach((hit) => addError(errors, "UNREDACTED_SECRET", "F3 receipt contains a credential-shaped value", hit));
  return errors.length === 0;
}

function runAudit(options, vaultRoot = process.cwd()) {
  const errors = [];
  options.errors.forEach((message) => addError(errors, "ARGUMENT_ERROR", message));
  if (!options.plan) addError(errors, "MISSING_PLAN_SLUG", "--plan is required");
  if (options.plan && options.plan !== PLAN_SLUG) {
    addError(errors, "WRONG_PLAN_SLUG", `--plan must equal ${PLAN_SLUG}`);
    return { ok: false, plan_slug: options.plan, physical_device_success: false, errors };
  }
  if (!options.evidence) addError(errors, "MISSING_EVIDENCE_DIRECTORY", "--evidence is required");
  if (errors.length > 0) return { ok: false, plan_slug: options.plan || null, physical_device_success: false, errors };

  const evidenceRoot = path.resolve(vaultRoot, options.evidence);
  if (!fs.existsSync(evidenceRoot) || !fs.statSync(evidenceRoot).isDirectory()) {
    addError(errors, "MISSING_EVIDENCE_DIRECTORY", "evidence directory does not exist");
    return { ok: false, plan_slug: options.plan, physical_device_success: false, errors };
  }

  const manifestPath = findManifest(evidenceRoot);
  if (!manifestPath) {
    addError(errors, "MISSING_EVIDENCE_MANIFEST", "evidence-manifest.json or manifest.json is required");
  }
  const manifest = manifestPath ? readJson(manifestPath, errors, "INVALID_EVIDENCE_MANIFEST") : null;
  if (!manifest) {
    addError(errors, "MISSING_COMMAND_EVIDENCE", "manifest commands are unavailable");
    addError(errors, "MISSING_DEVICE_ENTRY", "manifest device entries are unavailable");
  } else {
    if (manifest.plan_slug !== options.plan) addError(errors, "WRONG_PLAN_SLUG", "manifest plan_slug does not match --plan");
    if (options.phase && manifest.phase !== options.phase) addError(errors, "WRONG_PHASE", "manifest phase does not match --phase");
    validateCommands(manifest, evidenceRoot, errors);
    validateDevices(manifest, evidenceRoot, errors);
    validateScope(manifest, errors);
    validateChecks(manifest, evidenceRoot, errors);
    if (options.allImplementationTasks) validateAllImplementationTasks(manifest, vaultRoot, errors);
    if (options.allImplementationTasks || options.docsClosure) validateDocumentationClosure(vaultRoot, errors);
    if (manifest.physical_device_success === true && !options.physicalReceipt) {
      addError(errors, "UNVERIFIED_PHYSICAL_CLAIM", "physical success requires --physical-receipt with a valid F3 directory");
    }
    if (options.noPhysicalClaim && manifest.physical_device_success === true) {
      addError(errors, "CONTRADICTORY_PHYSICAL_CLAIM", "--no-physical-claim forbids a physical success claim");
    }
  }

  const secretHits = scanEvidenceForSecrets(evidenceRoot);
  secretHits.forEach((hit) => addError(errors, "UNREDACTED_SECRET", "evidence contains a credential-shaped value", hit));

  let physicalDeviceSuccess = false;
  if (options.physicalReceipt) {
    const receiptRoot = path.resolve(vaultRoot, options.physicalReceipt);
    if (!fs.existsSync(receiptRoot) || !fs.statSync(receiptRoot).isDirectory()) {
      addError(errors, "MISSING_PHYSICAL_RECEIPT", "physical receipt directory does not exist");
    } else {
      const before = errors.length;
      validatePhysicalReceipt(receiptRoot, errors);
      physicalDeviceSuccess = errors.length === before;
    }
  }

  return {
    ok: errors.length === 0,
    plan_slug: options.plan,
    phase: options.phase || (manifest && manifest.phase) || null,
    evidence_manifest: manifestPath ? path.relative(vaultRoot, manifestPath) : null,
    physical_device_success: physicalDeviceSuccess,
    physical_claim_status: physicalDeviceSuccess ? "verified_f3" : "not_proven",
    required_checks: REQUIRED_CHECKS,
    errors
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const result = runAudit(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  HELP,
  PLAN_SLUG,
  REQUIRED_CHECKS,
  parseArgs,
  runAudit,
  scanTextForSecrets
});
