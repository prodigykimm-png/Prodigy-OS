"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const hash = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const sourceKinds = Object.freeze(["reading_session", "daily_evidence", "knowledge_candidate"]);

function sourceFixtures() {
  return Object.freeze([
    Object.freeze({ source_kind: "reading_session", source_path: "PARA/RESOURCES/Reading/Sessions/task21.md", record: { type: "reading_session", session_id: "session_task21", title: "승인 흐름", statement: "검토는 하나의 경로를 사용한다." } }),
    Object.freeze({ source_kind: "daily_evidence", source_path: "DAILY/2026-08-21.md", record: { evidence_id: "daily-2026-08-21-e01", title: "승인 흐름", statement: "검토는 하나의 경로를 사용한다." } }),
    Object.freeze({ source_kind: "knowledge_candidate", source_path: "PARA/RESOURCES/Knowledge/Candidates/task21.md", record: { type: "knowledge_candidate", candidate_id: "candidate_task21", title: "승인 흐름", statement: "검토는 하나의 경로를 사용한다." } }),
  ]);
}

function operation(kind, suffix = kind, overrides = {}) {
  const target = `ZETA/PERMANENT/task21-${suffix}.md`;
  const before = `# 이전 ${suffix}\n`;
  const after = kind === "noop" ? before : `# 승인된 ${suffix}\n\n정확한 패킷 바이트입니다.\n`;
  const existing = kind !== "create";
  const sourceIds = kind === "merge" ? ["ZETA/PERMANENT/task21-source-a.md", "ZETA/PERMANENT/task21-source-b.md"] : ["source_task21_a"];
  const mergeBefore = kind === "merge" ? Object.fromEntries(sourceIds.map((sourceId) => [sourceId, `# 병합 원본 ${sourceId}\n`])) : {};
  return {
    contract_version: "llmwiki_operation_contract_v1",
    operation_id: `operation_task21_${suffix}`,
    kind,
    destination_ids: [target],
    base_revisions: existing ? Object.fromEntries(Object.entries({ [target]: before, ...mergeBefore }).map(([name, bytes]) => [name, hash(bytes)])) : {},
    before_bytes: existing ? { [target]: before, ...mergeBefore } : {},
    after_bytes: { [target]: after },
    source_ids: kind === "merge" ? sourceIds : undefined,
    source_citations: sourceIds.map((source_id) => ({ source_id, content_hash: hash(source_id), source_url: null, locators: [`INBOX/task21-${source_id}.md`], source_archive_id: null, confidence: "explicit" })),
    conflicts: [], risk_tier: kind === "merge" ? "high" : kind === "update" ? "medium" : "low",
    effects: { deprecations: [], supersessions: [] },
    ...overrides,
  };
}

function memoryVault(initial = {}, failure = {}) {
  const files = new Map(Object.entries(initial));
  const directories = new Set();
  const listeners = new Map(["create", "modify", "delete", "rename"].map((name) => [name, new Set()]));
  const calls = [];
  const node = (filePath) => files.has(filePath) ? { path: filePath, extension: filePath.split(".").pop(), stat: { mode: 0o644 } } : directories.has(filePath) ? { path: filePath, children: [] } : null;
  const emit = (name, value) => { for (const listener of listeners.get(name) || []) listener(value); };
  return {
    calls, files,
    getAbstractFileByPath: node,
    getFiles: () => [...files.keys()].map(node),
    getMarkdownFiles: () => [...files.keys()].filter((name) => name.endsWith(".md")).map(node),
    on(name, listener) { listeners.get(name).add(listener); return { name, listener }; },
    offref(ref) { listeners.get(ref.name).delete(ref.listener); },
    mode: () => 0o644,
    async setMode() {},
    async read(file) { const name = typeof file === "string" ? file : file.path; if (!files.has(name)) throw new Error("missing_file"); return files.get(name); },
    async cachedRead(file) { return this.read(file); },
    async createFolder(name) { directories.add(name); },
    async create(name, bytes) { calls.push(["create", name, bytes]); if (failure.create === name) throw new Error("fixture_create_failed"); if (files.has(name)) throw new Error("file_exists"); files.set(name, bytes); emit("create", node(name)); return node(name); },
    async modify(file, bytes) { const name = typeof file === "string" ? file : file.path; calls.push(["modify", name, bytes]); if (failure.modify === name) throw new Error("fixture_modify_failed"); files.set(name, bytes); emit("modify", node(name)); return node(name); },
    async delete(file) { const name = typeof file === "string" ? file : file.path; calls.push(["delete", name]); files.delete(name); emit("delete", { path: name }); },
  };
}

function appForOperations(operations, failure) {
  const initial = {};
  for (const value of operations) if (value.kind !== "create") for (const [name, bytes] of Object.entries(value.before_bytes)) initial[name] = bytes;
  const vault = memoryVault(initial, failure);
  return { app: { vault }, vault };
}

module.exports = { ROOT, appForOperations, hash, memoryVault, operation, sourceFixtures, sourceKinds };
