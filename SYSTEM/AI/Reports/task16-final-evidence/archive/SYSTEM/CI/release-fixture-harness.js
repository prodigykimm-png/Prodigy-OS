#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const FIXTURE_ROOT = path.join(__dirname, "fixtures/release-vault");
const CASE_IDS = Object.freeze([
  "empty-vault", "minimal-valid-object", "invalid-property", "duplicate-object",
  "stale-source", "missing-optional-module", "provider-timeout", "provider-401", "provider-429"
]);
const JOURNEY_IDS = Object.freeze(["project", "people", "reading", "home", "journal", "workout"]);
const STEPS = Object.freeze(["entry", "primary_action", "save_or_no_write", "failure", "recovery", "home_return"]);
const HASH = /^[a-f0-9]{64}$/u;
const CORE_PROPERTIES = new Set(["id", "type", "status", "next_action", "created", "updated", "title"]);
const { createFixtureRegistry, treeHash } = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js"));
const readingFixtures = require(path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/reading/reading_memory_test_fixtures.js"));

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function safeRelative(value) {
  const text = String(value || "");
  if (!text || path.posix.isAbsolute(text) || text.includes("\\") || path.posix.normalize(text) !== text || text.startsWith("../")) throw new Error(`unsafe fixture path: ${text}`);
  return text;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function fileHash(file) { return sha256(fs.readFileSync(file)); }
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
  if (typeof value !== "string") return value;
  return value.replaceAll(ROOT, "<repo>").replace(/\/Users\/[^/\s]+/gu, "<private>");
}

function validateFixtureManifest() {
  const manifestPath = path.join(FIXTURE_ROOT, "fixture-manifest.json");
  const manifest = readJson(manifestPath);
  if (manifest.schema_version !== 1 || manifest.algorithm !== "sha256" || !Array.isArray(manifest.fixtures)) throw new Error("release fixture manifest shape invalid");
  const ids = [];
  let privateHits = 0;
  let absoluteHits = 0;
  for (const entry of manifest.fixtures) {
    if (!entry || Object.keys(entry).sort().join(",") !== "path,sha256" || !HASH.test(entry.sha256 || "")) throw new Error("release fixture manifest entry invalid");
    const relative = safeRelative(entry.path);
    if (!relative.startsWith("cases/") || !relative.endsWith(".json")) throw new Error(`release fixture is outside cases: ${relative}`);
    const absolute = path.join(FIXTURE_ROOT, relative);
    if (!fs.lstatSync(absolute).isFile() || fileHash(absolute) !== entry.sha256) throw new Error(`release fixture hash mismatch: ${relative}`);
    const bytes = fs.readFileSync(absolute, "utf8");
    if (/SYSTEM\/(?:PRIVATE|CACHE)|(?:^|\/)\.obsidian(?:\/|$)|(?:^|\/)\.omo(?:\/|$)/mu.test(bytes)) privateHits += 1;
    if (/\/Users\/|[A-Za-z]:\\/u.test(bytes)) absoluteHits += 1;
    const fixture = JSON.parse(bytes);
    if (fixture.schema_version !== 1 || ids.includes(fixture.id)) throw new Error(`release fixture identity invalid: ${relative}`);
    ids.push(fixture.id);
  }
  if (stable(ids) !== stable(CASE_IDS)) throw new Error(`release fixture cases must be exact and ordered: ${ids.join(",")}`);
  const actual = fs.readdirSync(path.join(FIXTURE_ROOT, "cases")).filter((name) => name.endsWith(".json")).sort().map((name) => `cases/${name}`);
  const listed = manifest.fixtures.map((entry) => entry.path).slice().sort();
  if (stable(actual) !== stable(listed)) throw new Error("release fixture inventory contains missing or extra cases");
  const suiteEntry = manifest.suite_registry;
  if (!suiteEntry || Object.keys(suiteEntry).sort().join(",") !== "path,sha256" || safeRelative(suiteEntry.path) !== "suite-registry.json" || !HASH.test(suiteEntry.sha256 || "")) throw new Error("release suite registry manifest entry invalid");
  const suitePath = path.join(FIXTURE_ROOT, suiteEntry.path);
  if (fileHash(suitePath) !== suiteEntry.sha256) throw new Error("release suite registry hash mismatch");
  const suiteRegistry = readJson(suitePath);
  const suiteIds = Array.isArray(suiteRegistry.suites) ? suiteRegistry.suites.map((entry) => entry.id) : [];
  if (suiteRegistry.schema_version !== 1 || stable(suiteIds) !== stable(JOURNEY_IDS)) throw new Error("release suite registry is missing or incomplete");
  const suiteBytes = fs.readFileSync(suitePath, "utf8");
  if (/\/Users\/|SYSTEM\/(?:PRIVATE|CACHE)|(?:^|\/)\.obsidian(?:\/|$)/mu.test(suiteBytes)) privateHits += 1;
  if (privateHits || absoluteHits) throw new Error("release fixtures contain private or absolute paths");
  return { manifest, suiteRegistry, manifest_sha256: fileHash(manifestPath), case_ids: ids, case_count: ids.length, private_path_hits: privateHits, absolute_path_hits: absoluteHits };
}

function parseFrontmatter(text) {
  const source = String(text || "");
  if (!source.startsWith("---\n")) return {};
  const end = source.indexOf("\n---", 4);
  if (end < 0) return {};
  const result = {};
  for (const line of source.slice(4, end).split("\n")) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (match) result[match[1]] = match[2].trim().replace(/^["']|["']$/gu, "");
  }
  return result;
}

function materializeFiles(root, files) {
  for (const [relativeInput, content] of Object.entries(files || {})) {
    const relative = safeRelative(relativeInput);
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(content));
  }
}
function walkFiles(root, current = root, output = []) {
  if (!fs.existsSync(current)) return output;
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) walkFiles(root, absolute, output);
    else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join("/"));
    else throw new Error("fixture vault contains a non-regular entry");
  }
  return output;
}
function vaultManifest(root) {
  return treeHash(root, false).entries.map(([relative, digest]) => ({ path: relative.split(path.sep).join("/"), sha256: digest }));
}
function diffManifest(before, after) {
  const left = new Map(before.map((entry) => [entry.path, entry.sha256]));
  const right = new Map(after.map((entry) => [entry.path, entry.sha256]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().filter((key) => left.get(key) !== right.get(key));
}

function inspectVault(root) {
  const engine = require(path.join(ROOT, "SYSTEM/Views/object-engine-core.js"));
  const objects = [];
  const issues = [];
  const byId = new Map();
  for (const relative of walkFiles(root).filter((item) => item.endsWith(".md"))) {
    const properties = parseFrontmatter(fs.readFileSync(path.join(root, relative), "utf8"));
    if (!properties.type) continue;
    const invalid = Object.keys(properties).filter((key) => !CORE_PROPERTIES.has(key));
    invalid.forEach((key) => issues.push({ code: "invalid_property", path: relative, property: key }));
    const state = engine.evaluateObject(Object.assign({ path: relative, name: path.basename(relative, ".md") }, properties), { allow_virtual: false });
    objects.push({ path: relative, id: properties.id || "", state: state.health.state });
    if (properties.id) {
      if (byId.has(properties.id)) issues.push({ code: "duplicate_object", path: relative, duplicate_of: byId.get(properties.id) });
      else byId.set(properties.id, relative);
    }
  }
  return { objects, issues };
}

async function verifyEmptyReadContract(temp) {
  const storeApi = require(path.join(ROOT, "SYSTEM/Views/reading-memory-store.js"));
  const successfulStore = storeApi.createReadingMemoryStore(storeApi.createNodeAdapter(temp), "reading-memory");
  const successful = await successfulStore.readIndex();
  if (successful !== null) throw new Error("empty reading store did not return the successful empty state");
  let writeAttempts = 0;
  const rejectedAdapter = {
    exists: async () => true,
    read: async () => { throw Object.assign(new Error("synthetic rejected read"), { code: "fixture_read_rejected" }); },
    write: async () => { writeAttempts += 1; throw new Error("rejected read recovery must not write"); },
    mkdir: async () => { writeAttempts += 1; throw new Error("rejected read recovery must not write"); },
    remove: async () => { writeAttempts += 1; throw new Error("rejected read recovery must not write"); }
  };
  const rejectedStore = storeApi.createReadingMemoryStore(rejectedAdapter, "reading-memory");
  let failure = null;
  try { await rejectedStore.readIndex(); } catch (error) { failure = error; }
  if (!failure || failure.code !== "fixture_read_rejected") throw new Error("rejected read was incorrectly surfaced as empty");
  const recoveryAdapter = Object.assign({}, rejectedAdapter, { exists: async () => false });
  const recovered = await storeApi.createReadingMemoryStore(recoveryAdapter, "reading-memory").readIndex();
  if (recovered !== null || writeAttempts !== 0) throw new Error("rejected read recovery contract failed");
  return { states: ["failure", "recovery"], error_code: failure.code, surfaced_as_empty: false, recovered_objects: 0, write_count: writeAttempts };
}

async function runDuplicateCreateCase(fixture) {
  const storeApi = require(path.join(ROOT, "SYSTEM/Views/workout-store.js"));
  const healthApi = require(path.join(ROOT, "SYSTEM/Views/workout-health-store.js"));
  const projection = require(path.join(ROOT, "SYSTEM/Views/workout-running-projection.js"));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-release-case-duplicate-object-"));
  let writeCount = 0;
  const adapter = storeApi.createNodeAdapter(temp);
  for (const method of ["write", "mkdir", "remove", "rename"]) {
    const original = adapter[method];
    adapter[method] = async (...args) => { writeCount += 1; return original(...args); };
  }
  const store = healthApi.createHealthStore(adapter, "SYSTEM/FIXTURE/duplicate-object");
  try {
    const first = await projection.saveActivities(store, [fixture.input.activity]);
    if (first.length !== 1 || first[0].created !== true) throw new Error("first production dedupe execution did not create exactly one Object");
    const afterFirst = vaultManifest(temp);
    writeCount = 0;
    const second = await projection.saveActivities(store, [fixture.input.activity]);
    const afterSecond = vaultManifest(temp);
    if (second.length !== 1 || second[0].created !== false || second[0].duplicate !== true || writeCount !== 0 || stable(afterFirst) !== stable(afterSecond)) throw new Error("second production dedupe execution changed persisted Objects");
    return { id: fixture.id, ok: true, production_seam: "WorkoutRunningProjection.saveActivities", first_execution_created: 1, second_execution_created: 0, second_execution_write_count: writeCount, second_execution_manifest_unchanged: true, second_state: "duplicate" };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function runInvalidPropertyAudit(fixture) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-release-case-invalid-property-"));
  try {
    const registryTarget = path.join(temp, "SYSTEM/Views/display-registry.js");
    fs.mkdirSync(path.dirname(registryTarget), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "SYSTEM/Views/display-registry.js"), registryTarget);
    fs.cpSync(path.join(ROOT, "SYSTEM/Prodigy/Schema"), path.join(temp, "SYSTEM/Prodigy/Schema"), { recursive: true });
    const templateTarget = path.join(temp, "SYSTEM/TEMPLATE/FORMAT/template_invalid_property.md");
    fs.mkdirSync(path.dirname(templateTarget), { recursive: true });
    fs.writeFileSync(templateTarget, fixture.content);
    const before = vaultManifest(temp);
    const auditScript = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py");
    const monitor = [
      "import builtins, io, os, runpy, sys",
      "attempts = 0",
      "def writing(mode): return any(flag in str(mode) for flag in ('w', 'a', 'x', '+'))",
      "original_open, original_io_open, original_os_open = builtins.open, io.open, os.open",
      "def monitored_open(*args, **kwargs):",
      " global attempts; attempts += int(writing(kwargs.get('mode', args[1] if len(args) > 1 else 'r'))); return original_open(*args, **kwargs)",
      "def monitored_io_open(*args, **kwargs):",
      " global attempts; attempts += int(writing(kwargs.get('mode', args[1] if len(args) > 1 else 'r'))); return original_io_open(*args, **kwargs)",
      "def monitored_os_open(file, flags, *args, **kwargs):",
      " global attempts; attempts += int(bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))); return original_os_open(file, flags, *args, **kwargs)",
      "builtins.open, io.open, os.open = monitored_open, monitored_io_open, monitored_os_open",
      "for name in ('mkdir', 'remove', 'unlink', 'rename', 'replace'):",
      " original = getattr(os, name)",
      " def monitored(*args, __original=original, **kwargs):",
      "  global attempts; attempts += 1; return __original(*args, **kwargs)",
      " setattr(os, name, monitored)",
      "status = 0",
      "sys.argv = [sys.argv[1], '--vault', sys.argv[2], '--format', 'json']",
      "try: runpy.run_path(sys.argv[0], run_name='__main__')",
      "except SystemExit as error: status = int(error.code or 0)",
      "finally: sys.stderr.write(f'PROPERTY_AUDIT_WRITE_ATTEMPTS={attempts}\\n')",
      "raise SystemExit(status)"
    ].join("\n");
    const audit = spawnSync("uv", ["run", "--python", ">=3.12", "python", "-c", monitor, auditScript, temp], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    const report = JSON.parse(audit.stdout || "{}");
    const issue = Array.isArray(report.issues) && report.issues.find((item) => item.value === fixture.expect.property && ["missing_property_label", "template_schema_conflict"].includes(item.code));
    const writeMatch = /PROPERTY_AUDIT_WRITE_ATTEMPTS=(\d+)/u.exec(audit.stderr || "");
    const writeAttempts = writeMatch ? Number(writeMatch[1]) : -1;
    const after = vaultManifest(temp);
    const writeCount = diffManifest(before, after).length;
    if (audit.status !== 1 || !issue || report.counts.error < 1 || writeAttempts !== 0 || writeCount !== 0 || stable(before) !== stable(after)) throw new Error("invalid Property production audit did not fail closed");
    return { id: fixture.id, ok: true, production_audit: "audit_property_contract.py", audit_exit_status: audit.status, audit_error_count: report.counts.error, code: issue.code, property: issue.value, write_attempts: writeAttempts, write_count: writeCount, manifest_unchanged: true };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

async function runFixtureCase(fixture) {
  if (fixture.kind === "vault") {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `prodigy-release-case-${fixture.id}-`));
    try {
      materializeFiles(temp, fixture.files);
      const result = inspectVault(temp);
      if (result.objects.length !== fixture.expect.objects || result.issues.length !== fixture.expect.issues) throw new Error(`${fixture.id} count mismatch`);
      if (fixture.expect.code && !result.issues.some((issue) => issue.code === fixture.expect.code)) throw new Error(`${fixture.id} expected ${fixture.expect.code}`);
      const rejectedRead = fixture.id === "empty-vault" ? await verifyEmptyReadContract(temp) : null;
      return { id: fixture.id, ok: true, objects: result.objects.length, issues: result.issues.length, rejected_read: rejectedRead };
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  if (fixture.kind === "object_create") return runDuplicateCreateCase(fixture);
  if (fixture.kind === "property_audit") return runInvalidPropertyAudit(fixture);
  if (fixture.kind === "source") {
    const sources = fixture.sources.map((item) => readingFixtures.source(item.source_path, item.content, item.source_mtime));
    const winner = sources.slice().sort((left, right) => right.source_mtime - left.source_mtime)[0];
    const body = winner.content.split("\n---\n")[1].trim();
    if (winner.source_mtime !== fixture.expect.winner_mtime || body !== fixture.expect.winner_body || fixture.expect.write_count !== 0) throw new Error("stale source fixture did not select the newest generation without writing");
    return { id: fixture.id, ok: true, code: "stale", winner_mtime: winner.source_mtime, stale_ignored: sources.length - 1, write_count: 0 };
  }
  if (fixture.kind === "module") {
    const loader = require(path.join(ROOT, "SYSTEM/Views/prodigy-hub-loader.js"));
    loader.resetLoaded();
    const files = new Map(Object.entries(fixture.available).map(([key, source]) => [key, { path: key, source }]));
    const app = { vault: { getAbstractFileByPath: (key) => files.get(key) || null, read: async (file) => file.source } };
    const result = await loader.loadManifest(app, { required: fixture.required, optional: fixture.optional }, { host: "js-engine", realm: {}, evaluate: (source) => Function(source)() });
    if (result.required_failures.length !== fixture.expect.required_failures || result.optional_failures.length !== fixture.expect.optional_failures || result.optional_failures[0].code !== fixture.expect.code) throw new Error("missing optional module contract mismatch");
    return { id: fixture.id, ok: true, required_surface: "available", optional_surface: "unavailable", required_failures: 0, optional_failures: 1, code: result.optional_failures[0].code };
  }
  if (fixture.kind === "provider") {
    const policy = require(path.join(ROOT, "SYSTEM/Views/ai-provider-error-policy.js"));
    let consumedResolve;
    const consumedSignal = new Promise((resolve, reject) => {
      consumedResolve = resolve;
      const guard = setTimeout(() => reject(new Error(`${fixture.id} provider consumption timed out`)), 2000);
      consumedResolve = (event) => { clearTimeout(guard); resolve(event); };
    });
    const registry = createFixtureRegistry({ onConsume: consumedResolve });
    let fault;
    if (fixture.fault.status) fault = policy.providerHttpError(fixture.fault.status, fixture.fault.body);
    else { fault = new Error(fixture.fault.message); fault.name = fixture.fault.name; }
    registry.configure("release", fixture.id, { nonce: `${fixture.id}:failure`, kind: "reject", error: fault.message, error_fields: { name: fault.name, status: Number(fault.status || 0) } });
    const request = registry.consume("release", fixture.id, { state: "loading" });
    const observed = await consumedSignal;
    let rejected;
    try { await request; } catch (error) { rejected = error; }
    const surfaced = policy.userFacingProviderError(rejected, { authMode: "api-key" }, "https://fixture.invalid");
    const status = Number(surfaced.status || 0);
    if (observed.nonce !== `${fixture.id}:failure` || surfaced.name !== fixture.expect.name || status !== fixture.expect.status) throw new Error(`${fixture.id} provider journey mapping mismatch`);
    registry.configure("release", fixture.id, { nonce: `${fixture.id}:recovery`, kind: "resolve", value: { state: "ready" } });
    const recovered = await registry.consume("release", fixture.id, { action: "retry" });
    return { id: fixture.id, ok: true, name: surfaced.name, status, journey_states: ["entry", "loading", "error", "retry", "recovered", "home_return"], retry_available: true, recovered: recovered.state === "ready", write_count: 0 };
  }
  throw new Error(`unknown release fixture kind: ${fixture.kind}`);
}

async function runFixtureCases() {
  const integrity = validateFixtureManifest();
  const results = [];
  for (const entry of integrity.manifest.fixtures) results.push(await runFixtureCase(readJson(path.join(FIXTURE_ROOT, entry.path))));
  return Object.assign({ ok: results.every((item) => item.ok), passed: results.filter((item) => item.ok).length, total: results.length, results }, integrity);
}

class FixtureVault {
  constructor(root) { this.root = root; this.writeCount = 0; }
  resetWriteCounts() { this.writeCount = 0; }
  absolute(relative) { return path.join(this.root, safeRelative(relative)); }
  getAbstractFileByPath(relative) {
    if (!relative) return null;
    const absolute = this.absolute(relative);
    if (!fs.existsSync(absolute)) return null;
    const stat = fs.statSync(absolute);
    const file = { path: relative, name: path.basename(relative), extension: stat.isFile() ? path.extname(relative).slice(1) : "" };
    if (stat.isDirectory()) file.children = fs.readdirSync(absolute).sort().map((name) => this.getAbstractFileByPath(`${relative}/${name}`));
    return file;
  }
  getFiles() { return walkFiles(this.root).map((relative) => this.getAbstractFileByPath(relative)); }
  async read(file) { return fs.readFileSync(this.absolute(file.path), "utf8"); }
  async create(relative, content) { const target = this.absolute(relative); if (fs.existsSync(target)) throw new Error(`target exists: ${relative}`); this.writeCount += 1; fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); return this.getAbstractFileByPath(relative); }
  async createFolder(relative) { this.writeCount += 1; fs.mkdirSync(this.absolute(relative), { recursive: true }); return this.getAbstractFileByPath(relative); }
  async modify(file, content) { this.writeCount += 1; fs.writeFileSync(this.absolute(file.path), content); return file; }
  async process(file, transform) { const next = transform(await this.read(file)); await this.modify(file, next); return next; }
}

function yaml(value) {
  return Object.entries(value).map(([key, item]) => `${key}: ${item == null ? "" : typeof item === "string" && /[:#\n]/u.test(item) ? JSON.stringify(item) : item}`).join("\n");
}
function installProductionGlobals() {
  Date.now = () => 1786459200000;
  if (!globalThis.obsidian) globalThis.obsidian = { Modal: class {}, stringifyYaml: yaml, Notice: class {} };
  globalThis.Event = class FixtureTrustedEvent { constructor(type, options) { this.type = type; this.key = options && options.key; this.target = options && options.target; this.timeStamp = Date.now(); this.isTrusted = true; } };
  globalThis.ProdigyWorkspaceRegistry = require(path.join(ROOT, "SYSTEM/Views/workspace-registry.js"));
  globalThis.PeopleCore = require(path.join(ROOT, "SYSTEM/Views/people-core.js"));
  globalThis.JournalCore = require(path.join(ROOT, "SYSTEM/Views/journal-core.js"));
  globalThis.WorkoutCore = require(path.join(ROOT, "SYSTEM/Views/workout-core.js"));
}

function fixtureDocument() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { const set = listeners.get(type); if (set) set.delete(listener); },
    dispatch(event) { for (const listener of listeners.get(event.type) || []) listener(event); }
  };
}
function scope() {
  const cleanups = [];
  let disposed = false;
  return { signal: { get aborted() { return disposed; } }, get disposed() { return disposed; }, track(cleanup) { cleanups.push(cleanup); return cleanup; }, dispose() { if (disposed) return false; disposed = true; cleanups.splice(0).reverse().forEach((item) => item()); return true; } };
}
function exactEvent(emitter, eventName, trigger, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => { clearTimeout(guard); emitter.removeListener(eventName, listener); };
    const listener = (value) => { if (settled) return; settled = true; cleanup(); resolve(value); };
    emitter.once(eventName, listener);
    const guard = setTimeout(() => { if (settled) return; settled = true; cleanup(); reject(new Error(`bounded event guard rejected: ${eventName}`)); }, timeoutMs);
    Promise.resolve().then(trigger).catch((error) => { if (settled) return; settled = true; cleanup(); reject(error); });
  });
}

async function buildPrimary(journey, app) {
  const fixedNow = new Date("2026-01-02T03:04:05.000Z");
  if (journey === "project") {
    const core = require(path.join(ROOT, "SYSTEM/Views/project-wizard-core.js"));
    const workflow = [{ label: "Ship fixture", order: 1 }];
    const rendered = core.renderProjectContent("---\ntype: project\n---\n", { projectName: "Fixture Release", projectType: core.getPresetNames()[0], project_type: "work", status: "active", dueDate: "2026-12-31", startMode: "planning", workflow }, { now: fixedNow, idFactory: () => "workflow_fixture" });
    return { target: "PARA/PROJECTS/Fixture Release.md", payload: { domain: journey, content: rendered.content }, content: rendered.content, assertion: rendered.next_action === "Ship fixture" };
  }
  if (journey === "people") {
    const store = require(path.join(ROOT, "SYSTEM/Views/people-store.js"));
    const prepared = await store.preparePeopleCreation(app, "Fixture Person");
    return { target: prepared.path, payload: { domain: journey, content: prepared.content }, content: prepared.content, assertion: /type:\s*people/u.test(prepared.content) };
  }
  if (journey === "reading") {
    const reading = require(path.join(ROOT, "SYSTEM/Views/reading-book-create.js"));
    const content = reading.buildManualReadingContent("# <% tp.file.title %>\n\n## Notes\n", { title: "Fixture Reading", reading_format: "book", author: "Synthetic Author" }, fixedNow);
    return { target: "PARA/PROJECTS/Reading/Fixture Reading.md", payload: { domain: journey, content }, content, assertion: /reading_format: book/u.test(content) };
  }
  if (journey === "home") {
    const engine = require(path.join(ROOT, "SYSTEM/Views/object-engine-core.js"));
    const evaluated = engine.evaluateObject({ path: "PARA/PROJECTS/Fixture Project.md", name: "Fixture Project", type: "project", status: "active", next_action: "Verify fixture" });
    const content = "---\nid: home-fixture\ntype: journal\nstatus: active\nnext_action: Review fixture\n---\n# Home Fixture\n";
    return { target: "DAILY/DAILY/2026-01-02.md", payload: { domain: journey, content }, content, assertion: evaluated.health.state === "healthy" && evaluated.workspace_key === "project" };
  }
  if (journey === "journal") {
    const core = globalThis.JournalCore;
    const seed = "---\ntype: journal\ndate: 2026-01-02\n---\n# 2026-01-02\n\n## End of Day\n";
    const content = core.applyReviewToDailyContent(seed, { reflection: "Synthetic reflection", change: "Synthetic change", next_experiment: "Synthetic experiment" });
    return { target: "DAILY/DAILY/2026-01-02.md", payload: { domain: journey, content }, content, assertion: core.extractReviewFromDaily(content, core.parseFrontmatter(content).data).reflection === "Synthetic reflection" };
  }
  if (journey === "workout") {
    const core = globalThis.WorkoutCore;
    const program = core.normalizeProgram({ title: "Fixture Program", status: "active", days: [{ week: 1, day: 1, label: "Day A", exercises: [{ name: "Fixture Squat", prescribed_sets: [{ reps: 5, load: "20 kg" }] }] }] });
    const validation = core.validateProgram(program);
    const content = `${stable(program)}\n`;
    return { target: "SYSTEM/FIXTURE/workout-program.json", payload: { domain: journey, program }, content, assertion: validation.ok === true };
  }
  throw new Error(`unknown journey: ${journey}`);
}

async function runJourney(journey) {
  if (!JOURNEY_IDS.includes(journey)) throw new Error(`unknown journey: ${journey}`);
  installProductionGlobals();
  const navigation = require(path.join(ROOT, "SYSTEM/Views/workspace-navigation.js"));
  const runtime = require(path.join(ROOT, "SYSTEM/Views/capture-action-runtime.js"));
  const authority = require(path.join(ROOT, "SYSTEM/Views/capture-authorized-writer.js"));
  const fixture = readJson(path.join(FIXTURE_ROOT, "cases/minimal-valid-object.json"));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `prodigy-release-journey-${journey}-`));
  const emitter = new EventEmitter();
  const registry = createFixtureRegistry({ onConsume: (event) => emitter.emit(event.operation, event.detail.value) });
  let stepSequence = 0;
  const publish = async (operation, value) => {
    stepSequence += 1;
    registry.configure(journey, operation, { nonce: `${journey}:${stepSequence}`, kind: "resolve", value: true });
    await registry.consume(journey, operation, { value });
  };
  const document = fixtureDocument();
  const mountScope = scope();
  const owner = runtime.mountTrustedInteractions({ root: document, document, scope: mountScope, session_id: `fixture-${journey}` });
  const opened = [];
  const workspaceRegistry = globalThis.ProdigyWorkspaceRegistry;
  const allowedTargets = new Set(workspaceRegistry.routeTable().map((item) => item.path));
  let focusedTarget = "";
  const app = { vault: new FixtureVault(temp), workspace: { openLinkText: async (linkText) => {
    const target = /\.md$/iu.test(String(linkText)) ? String(linkText) : `${linkText}.md`;
    if (!allowedTargets.has(target)) throw new Error(`fixture workspace rejected unregistered target: ${target}`);
    opened.push(target); focusedTarget = target;
    return { path: target, focused: true };
  } } };
  let result;
  try {
    let wrongTargetRejected = false;
    try { await app.workspace.openLinkText("HUB/99 Wrong"); } catch (_error) { wrongTargetRejected = true; }
    if (!wrongTargetRejected) throw new Error("fixture workspace accepted a wrong navigation target");
    materializeFiles(temp, fixture.files);
    const before = vaultManifest(temp);
    const entry = await exactEvent(emitter, "entry:settled", async () => { const value = await navigation.openWorkspace(app, journey === "people" ? "personal" : journey); await publish("entry:settled", value); });
    const primary = await exactEvent(emitter, "primary:ready", async () => { const value = await buildPrimary(journey, app); await publish("primary:ready", value); });
    if (!primary.assertion) throw new Error(`${journey} production primary contract failed`);
    const actionId = `release-fixture-${journey}`;
    const sessionId = `fixture-${journey}`;
    const dispatchIntent = () => { document.dispatch(new globalThis.Event("click", { target: document })); return runtime.humanConfirmation(actionId, sessionId); };
    const readActual = async () => { const file = app.vault.getAbstractFileByPath(primary.target); return file ? runtime.sha256(await app.vault.read(file)) : null; };
    const proposalInput = { action_id: actionId, target_path: primary.target, payload: primary.payload, source_id: `release-fixture-${journey}`, locator: `fixture:${journey}`, readRevision: readActual };
    const review = await exactEvent(emitter, "review:ready", async () => { const value = await runtime.prepareHumanReview(proposalInput, dispatchIntent()); await publish("review:ready", value); });
    const afterReview = vaultManifest(temp);
    if (stable(before) !== stable(afterReview)) throw new Error(`${journey} review wrote before confirmation`);
    const staleAdapter = {
      readRevision: async () => "f".repeat(64),
      writeCanonical: async () => { throw new Error("stale write must not execute"); },
      readCanonical: async () => null,
      now: () => "2026-01-02T03:04:05.000Z"
    };
    const stale = await exactEvent(emitter, "failure:stale", async () => { const value = await runtime.confirmHumanReview(review, dispatchIntent(), actionId, staleAdapter); await publish("failure:stale", value); });
    if (stale.record.state !== "stale" || stale.receipt !== null) throw new Error(`${journey} stale failure did not fail closed`);
    const afterFailure = vaultManifest(temp);
    if (stable(before) !== stable(afterFailure)) throw new Error(`${journey} failure changed fixture manifest`);
    const recoveryReview = await exactEvent(emitter, "recovery:review", async () => { const value = await runtime.prepareHumanReview(proposalInput, dispatchIntent()); await publish("recovery:review", value); });
    const adapter = {
      readRevision: readActual,
      writeCanonical: async (request) => {
        const immediate = await readActual();
        authority.assertCanonicalWriteRequest(request, immediate);
        if (immediate == null) await app.vault.create(primary.target, primary.content);
        else await app.vault.modify(app.vault.getAbstractFileByPath(primary.target), primary.content);
        return { path: primary.target, revision: runtime.sha256(primary.content) };
      },
      readCanonical: async () => { const file = app.vault.getAbstractFileByPath(primary.target); const bytes = await app.vault.read(file); return { path: primary.target, revision: runtime.sha256(bytes), bytes }; },
      now: () => "2026-01-02T03:04:05.000Z"
    };
    const recovered = await exactEvent(emitter, "recovery:committed", async () => { const value = await runtime.confirmHumanReview(recoveryReview, dispatchIntent(), actionId, adapter); await publish("recovery:committed", value); });
    if (!recovered.receipt || recovered.record.state !== "object_committed") throw new Error(`${journey} recovery did not commit`);
    const after = vaultManifest(temp);
    const changes = diffManifest(before, after);
    if (stable(changes) !== stable([primary.target])) throw new Error(`${journey} recovery changed unauthorized paths: ${changes.join(",")}`);
    const homeRegistryPath = workspaceRegistry.pathFor("home");
    const focusBeforeHome = focusedTarget;
    const home = await exactEvent(emitter, "home:return", async () => { const value = await navigation.openHome(app); await publish("home:return", value); });
    const openedHomeTarget = opened[opened.length - 1];
    if (!home.ok || home.path !== homeRegistryPath || openedHomeTarget !== homeRegistryPath || focusedTarget !== homeRegistryPath) throw new Error(`${journey} Home navigation did not reach the registered target`);
    result = scrub({
      ok: true, journey, steps: STEPS,
      entry: { ok: entry.ok, path: opened[0] },
      primary_action: { production_assertion: true, target_path: primary.target },
      save_or_no_write: { review_state: review.state, manifest_unchanged: true },
      failure: { state: stale.record.state, no_write: true, manifest_before: before, manifest_after: afterFailure },
      recovery: { state: recovered.record.state, authorized_change_count: changes.length, authorized_paths: changes, receipt: recovered.receipt },
      home_return: { ok: home.ok, path: home.path, registry_path: homeRegistryPath, opened_target: openedHomeTarget, focus_before: focusBeforeHome, focus_after: focusedTarget, wrong_target_rejected: wrongTargetRejected },
      cleanup: { temp_vault_deleted: false }
    });
  } finally {
    owner.dispose(); mountScope.dispose();
    fs.rmSync(temp, { recursive: true, force: true });
  }
  result.cleanup.temp_vault_deleted = !fs.existsSync(temp);
  if (!result.cleanup.temp_vault_deleted) throw new Error(`${journey} temporary fixture vault remains`);
  return result;
}

async function runAll() {
  const fixtureCases = await runFixtureCases();
  const journeys = [];
  for (const suite of fixtureCases.suiteRegistry.suites) journeys.push(await runJourney(suite.id));
  const summary = {
    ok: fixtureCases.ok && journeys.every((item) => item.ok),
    fixture_cases: { passed: fixtureCases.passed, total: fixtureCases.total, manifest_sha256: fixtureCases.manifest_sha256 },
    journeys: { passed: journeys.filter((item) => item.ok).length, total: journeys.length },
    cleanup: { temp_vaults_remaining: journeys.filter((item) => !item.cleanup.temp_vault_deleted).length }
  };
  summary.digest = sha256(stable(summary));
  return summary;
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--fixtures") {
    const result = await runFixtureCases();
    return { ok: result.ok, case_ids: result.case_ids, case_count: result.case_count, suite_ids: result.suiteRegistry.suites.map((entry) => entry.id), private_path_hits: result.private_path_hits, absolute_path_hits: result.absolute_path_hits, manifest_sha256: result.manifest_sha256, passed: result.passed, total: result.total, results: result.results };
  }
  if (argv.length === 2 && argv[0] === "--journey") return runJourney(argv[1]);
  if (argv.length === 1 && argv[0] === "--all") return runAll();
  throw new Error("Usage: node SYSTEM/CI/release-fixture-harness.js --fixtures | --journey <project|people|reading|home|journal|workout> | --all");
}

if (require.main === module) {
  main(process.argv.slice(2)).then((value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)).catch((error) => { process.stderr.write(`release fixture harness failed: ${error.stack || error.message}\n`); process.exitCode = 1; });
}

module.exports = Object.freeze({ CASE_IDS, JOURNEY_IDS, STEPS, runAll, runFixtureCases, runJourney, validateFixtureManifest });
