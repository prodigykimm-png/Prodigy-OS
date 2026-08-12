#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DATAVIEW_FILES = Object.freeze(["main.js", "manifest.json", "styles.css"]);
const SOURCE_PRIVATE_PREFIXES = Object.freeze(["DAILY/", "PARA/", "ZETA/", "SYSTEM/CACHE/"]);
const SOURCE_RUNTIME_PREFIXES = Object.freeze([".codex/", ".gjc/", "artifacts/", ".omo/"]);

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd,
    encoding: Object.prototype.hasOwnProperty.call(options, "encoding") ? options.encoding : "utf8",
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function sourceMode(repoRoot) {
  const root = fs.realpathSync(repoRoot);
  const result = childProcess.spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" });
  if (result.status === 0) {
    if (fs.realpathSync(result.stdout.trim()) !== root) throw new Error("repo root must equal git toplevel");
    return { root, mode: "git" };
  }
  if (fs.existsSync(path.join(root, ".git"))) throw new Error(`git metadata is invalid: ${result.stderr || result.stdout}`);
  for (const required of ["AGENTS.md", "SYSTEM/CI/run-release-gate.sh", "SYSTEM/Views/home-view.js"]) {
    if (!fs.existsSync(path.join(root, required))) throw new Error(`metadata-free release archive is missing ${required}`);
  }
  return { root, mode: "archive" };
}

function archiveSha(root) {
  const hash = crypto.createHash("sha1");
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) hash.update(relativePath).update("\0").update(fs.readFileSync(absolutePath)).update("\0");
    }
  };
  visit(root);
  return hash.digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFixture(vaultRoot, relativePath, content) {
  const target = path.join(vaultRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function syntheticFixtures() {
  return Object.freeze({
    "DAILY/2026-08-01.md": "---\ntype: daily\ndate: 2026-08-01\n---\n# 합성 데일리\n\n실제 개인 정보가 없는 감사 fixture입니다.\n",
    "PARA/PROJECTS/Auction/AUDIT-CASE.md": "---\ntype: auction_case\nid: AUDIT-CASE\nstatus: analysis\nregion_key: 부산광역시-중구\naddress: 부산광역시 중구 감사로 1\n---\n# 합성 경매 물건\n",
    "PARA/RESOURCES/Auction Regions/부산광역시-중구.md": "---\ntype: auction_region\nregion_sido: 부산광역시\nregion_sigungu: 중구\nverification_status: verified\n---\n# 합성 지역\n",
    "PARA/RESOURCES/Reading/AUDIT-BOOK.md": "---\ntype: reading\ntitle: 합성 독서\nstatus: reading\n---\n# 합성 독서\n",
    "PARA/AREAS/Workout/AUDIT-WORKOUT.md": "---\ntype: workout\nstatus: planned\n---\n# 합성 운동\n",
    "PARA/PROJECTS/AUDIT-PROJECT.md": "---\ntype: project\nstatus: active\n---\n# 합성 프로젝트\n",
    "PARA/RESOURCES/CONTACTS/AUDIT-PERSON.md": "---\ntype: people\nname: 감사 대상\nstatus: active\n---\n# 합성 사람\n",
    "ZETA/Knowledge/AUDIT-KNOWLEDGE.md": "---\ntype: knowledge\nstatus: validated\n---\n# 합성 지식\n",
  });
}

function prepare(options = {}) {
  const source = sourceMode(options.repoRoot || process.cwd());
  const repoRoot = source.root;
  const sourceRoot = options.sourceRoot ? fs.realpathSync(options.sourceRoot) : null;
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(options.tempParent || os.tmpdir(), "prodigy-audit-runtime-")));
  const vaultRoot = path.join(tempRoot, "vault");
  const profileRoot = path.join(tempRoot, "profile");
  fs.mkdirSync(vaultRoot, { recursive: true });
  fs.mkdirSync(profileRoot, { recursive: true });

  if (source.mode === "git") {
    const archive = run("git", ["archive", "--format=tar", "HEAD"], { cwd: repoRoot, encoding: null });
    run("tar", ["-xf", "-", "-C", vaultRoot], { input: archive });
  } else {
    fs.cpSync(repoRoot, vaultRoot, {
      recursive: true,
      filter: (candidate) => {
        const relative = path.relative(repoRoot, candidate).split(path.sep).join("/");
        return relative === "" || (![...SOURCE_PRIVATE_PREFIXES, ...SOURCE_RUNTIME_PREFIXES].some((prefix) => relative === prefix.slice(0, -1) || relative.startsWith(prefix)));
      },
    });
  }

  fs.rmSync(path.join(vaultRoot, ".obsidian"), { recursive: true, force: true });
  const dataviewRoot = path.join(vaultRoot, ".obsidian", "plugins", "dataview");
  fs.mkdirSync(dataviewRoot, { recursive: true });
  for (const file of DATAVIEW_FILES) {
    const relative = `.obsidian/plugins/dataview/${file}`;
    if (source.mode === "git") run("git", ["ls-files", "--error-unmatch", relative], { cwd: repoRoot });
    if (!fs.existsSync(path.join(repoRoot, relative))) throw new Error(`tracked Dataview fixture is missing: ${relative}`);
    fs.copyFileSync(path.join(repoRoot, relative), path.join(dataviewRoot, file));
  }

  for (const prefix of [...SOURCE_PRIVATE_PREFIXES, ...SOURCE_RUNTIME_PREFIXES]) {
    fs.rmSync(path.join(vaultRoot, prefix), { recursive: true, force: true });
  }
  const copiedRuntimePaths = [];
  for (const prefix of SOURCE_RUNTIME_PREFIXES) if (fs.existsSync(path.join(vaultRoot, prefix))) copiedRuntimePaths.push(prefix);
  if (copiedRuntimePaths.length) throw new Error(`runtime metadata copied into fixture: ${copiedRuntimePaths.join(",")}`);
  const fixtures = syntheticFixtures();
  for (const [relative, content] of Object.entries(fixtures)) writeFixture(vaultRoot, relative, content);

  writeJson(path.join(vaultRoot, ".obsidian", "app.json"), { showUnsupportedFiles: true });
  writeJson(path.join(vaultRoot, ".obsidian", "community-plugins.json"), ["dataview"]);
  writeJson(path.join(vaultRoot, ".obsidian", "plugins", "dataview", "data.json"), {
    enableDataviewJs: true,
    enableInlineDataviewJs: true,
    refreshEnabled: true,
    refreshInterval: 2500,
    warnOnEmptyResult: true,
  });
  writeJson(path.join(profileRoot, "obsidian.json"), {
    vaults: { audit: { path: vaultRoot, open: true, ts: Date.now() } },
  });

  const headSha = source.mode === "git"
    ? run("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).trim()
    : archiveSha(repoRoot);
  const receipt = {
    schema_version: 1,
    head_sha: headSha,
    repo_root: "<REPO_ROOT>",
    source_root_token: sourceRoot ? "<SOURCE_VAULT>" : null,
    temp_root: "<RUNTIME_ROOT>",
    vault_root: "<RUNTIME_VAULT>",
    profile_root: "<RUNTIME_PROFILE>",
    fixture_paths: Object.keys(fixtures).sort(),
    dataview_files: DATAVIEW_FILES.map((file) => `.obsidian/plugins/dataview/${file}`),
    private_source_paths_copied: [],
    runtime_source_paths_copied: copiedRuntimePaths,
    environment: {
      PRODIGY_AUDIT_PROFILE_ROOT: "<RUNTIME_PROFILE>",
      PRODIGY_AUDIT_VAULT_ROOT: "<RUNTIME_VAULT>",
    },
  };
  const receiptPath = options.receiptPath || path.join(tempRoot, "runtime-fixture.json");
  writeJson(receiptPath, receipt);
  return { ...receipt, repo_root: repoRoot, temp_root: tempRoot, vault_root: vaultRoot, profile_root: profileRoot, environment: { PRODIGY_AUDIT_PROFILE_ROOT: profileRoot, PRODIGY_AUDIT_VAULT_ROOT: vaultRoot }, receipt_path: receiptPath };
}

function cleanup(tempRoot) {
  const resolved = path.resolve(tempRoot);
  if (!path.basename(resolved).startsWith("prodigy-audit-runtime-")) {
    throw new Error("refusing to remove a non-runtime-fixture root");
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") options.repoRoot = argv[++i];
    else if (arg === "--source-root") options.sourceRoot = argv[++i];
    else if (arg === "--receipt") options.receiptPath = path.resolve(argv[++i]);
    else if (arg === "--cleanup") options.cleanupRoot = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.cleanupRoot) {
    cleanup(options.cleanupRoot);
    process.stdout.write(`${JSON.stringify({ cleaned: path.resolve(options.cleanupRoot) })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(prepare(options), null, 2)}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({ DATAVIEW_FILES, SOURCE_PRIVATE_PREFIXES, SOURCE_RUNTIME_PREFIXES, cleanup, prepare, syntheticFixtures });
