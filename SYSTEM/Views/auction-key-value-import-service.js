(function (root) {
  "use strict";

  const INPUT_DIR = "INBOX/Auction CSV";
  const PROCESSED_DIR = `${INPUT_DIR}/Processed`;
  const CACHE_DIR = "SYSTEM/CACHE/auction-key-value/current";
  const NORMALIZED_PATH = `${CACHE_DIR}/normalized.json`;
  const SNAPSHOT_PATH = `${CACHE_DIR}/snapshot.json`;
  const AUDIT_PATH = `${CACHE_DIR}/audit.json`;
  const LEGACY_NORMALIZED_PATH = "SYSTEM/CACHE/auction-key-value/all-regions-2025-09_2026-09/normalized.json";
  const CARD_SNAPSHOT_PATH = "SYSTEM/Views/auction-key-value-snapshot.js";
  const STARTUP_GUARD_KEY = "__auctionKeyValueImportService";

  function resolveCore(app, load) {
    const requireModule = load || (typeof require === "function" ? require : null);
    if (!requireModule) throw new Error("경매 키값 계산 모듈을 불러올 수 없습니다.");
    try {
      return requireModule("../SCRIPTS/auction-key-value-core.js");
    } catch (relativeError) {
      const basePath = app && app.vault && app.vault.adapter
        && typeof app.vault.adapter.getBasePath === "function"
        ? app.vault.adapter.getBasePath()
        : null;
      if (!basePath) throw relativeError;
      const path = requireModule("node:path");
      return requireModule(path.join(basePath, "SYSTEM/SCRIPTS/auction-key-value-core.js"));
    }
  }

  function isInputCsv(path) {
    return typeof path === "string"
      && path.startsWith(`${INPUT_DIR}/`)
      && !path.startsWith(`${PROCESSED_DIR}/`)
      && path.toLowerCase().endsWith(".csv");
  }

  async function ensureFolder(vault, folderPath) {
    const parts = folderPath.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      const current = parts.slice(0, index).join("/");
      if (!vault.getAbstractFileByPath(current)) {
        try { await vault.createFolder(current); } catch (_error) { /* already exists */ }
      }
    }
  }

  async function readJson(vault, path) {
    const file = vault.getAbstractFileByPath(path);
    if (!file) return null;
    const value = JSON.parse(await vault.read(file));
    if (!Array.isArray(value)) throw new Error(`정규 레코드 배열이 아닙니다: ${path}`);
    return value;
  }

  async function writeText(vault, path, text) {
    await ensureFolder(vault, path.split("/").slice(0, -1).join("/"));
    const file = vault.getAbstractFileByPath(path);
    if (file) await vault.modify(file, text);
    else await vault.create(path, text);
  }

  function cardSnapshotSource(snapshot) {
    return `(function(root){\n  "use strict";\n  const snapshot = Object.freeze(${JSON.stringify(snapshot)});\n  root.AuctionKeyValueSnapshot = snapshot;\n  if (typeof module !== "undefined" && module.exports) module.exports = snapshot;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
  }

  function normalizeRecord(core, importedRecord) {
    const region = core.parseRegion(importedRecord.parcel_address);
    return Object.freeze({
      ...importedRecord,
      property_type: core.canonicalPropertyType(importedRecord.property_type),
      region_sido: importedRecord.region_sido || region.sido,
      region_sigungu: importedRecord.region_sigungu || region.sigungu
    });
  }

  async function existingRecords(vault) {
    return await readJson(vault, NORMALIZED_PATH)
      || await readJson(vault, LEGACY_NORMALIZED_PATH)
      || [];
  }

  function uniqueArchivePath(vault, file, month, contentHash) {
    const initial = `${PROCESSED_DIR}/${month}/${file.name}`;
    if (!vault.getAbstractFileByPath(initial)) return initial;
    const dot = file.name.lastIndexOf(".");
    const stem = dot === -1 ? file.name : file.name.slice(0, dot);
    const extension = dot === -1 ? "" : file.name.slice(dot);
    return `${PROCESSED_DIR}/${month}/${stem}-${contentHash.slice(0, 8)}${extension}`;
  }

  async function processPending(app, options = {}) {
    if (!app || !app.vault) throw new Error("Vault access is not available.");
    const core = options.core || resolveCore(app);
    const generatedAt = (options.now || (() => new Date().toISOString()))();
    const notify = options.notify || ((message) => {
      if (typeof root.Notice === "function") new root.Notice(message);
    });
    await ensureFolder(app.vault, INPUT_DIR);
    const files = app.vault.getFiles()
      .filter((file) => isInputCsv(file.path))
      .sort((left, right) => left.path.localeCompare(right.path, "ko"));
    if (!files.length) return Object.freeze({ files: 0, imported: 0, added: 0 });

    const seed = await existingRecords(app.vault);
    const imported = [];
    const sources = [];
    const contents = new Map();
    for (const file of files) {
      const text = await app.vault.read(file);
      contents.set(file.path, text);
      const rows = core.parseAuctCsv(text, { sourceFile: file.name.normalize("NFC") });
      sources.push({ file: file.name.normalize("NFC"), records: rows.length });
      imported.push(...rows.map((record) => normalizeRecord(core, record)));
    }

    const recordsById = new Map(seed.map((record) => [record.record_id, Object.freeze(record)]));
    const before = recordsById.size;
    for (const record of imported) if (!recordsById.has(record.record_id)) recordsById.set(record.record_id, record);
    const records = [...recordsById.values()];
    const snapshot = core.buildKeyValueSnapshot(records, { asOf: generatedAt, source: "AUCT CSV" });
    const groups = Object.values(snapshot.groups);
    const audit = Object.freeze({
      schema_version: "auction-key-value-auto-import.v1",
      generated_at: generatedAt,
      inputs: sources.map((source) => source.file),
      source_counts: Object.fromEntries(sources.map((source) => [source.file, source.records])),
      seed_records: seed.length,
      imported_records: imported.length,
      added_records: records.length - before,
      duplicate_records: seed.length + imported.length - records.length,
      total_records: records.length,
      groups: groups.length,
      usable_groups: groups.filter((group) => group.confidence === "usable").length,
      snapshot_hash: snapshot.content_hash
    });

    await writeText(app.vault, NORMALIZED_PATH, `${JSON.stringify(records, null, 2)}\n`);
    await writeText(app.vault, SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    await writeText(app.vault, AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
    await writeText(app.vault, CARD_SNAPSHOT_PATH, cardSnapshotSource(snapshot));
    root.AuctionKeyValueSnapshot = snapshot;

    const month = generatedAt.slice(0, 7);
    await ensureFolder(app.vault, `${PROCESSED_DIR}/${month}`);
    for (const file of files) {
      const hash = core.sha256(contents.get(file.path));
      await app.vault.rename(file, uniqueArchivePath(app.vault, file, month, hash));
    }
    notify(`경매 키값 CSV ${files.length}개 적용 · 신규 ${audit.added_records}건 · 전체 ${records.length}건`);
    return Object.freeze({
      files: files.length,
      imported: imported.length,
      added: audit.added_records,
      totalRecords: records.length,
      snapshotHash: snapshot.content_hash
    });
  }

  function register(app, options = {}) {
    if (!app || !app.vault) throw new Error("Vault access is not available.");
    let disposed = false;
    let queue = Promise.resolve();
    const refs = [];
    const notifyError = options.notifyError || ((error) => {
      const message = `경매 키값 CSV 적용 실패: ${error.message}`;
      if (typeof root.Notice === "function") new root.Notice(message, 10000);
      else console.error(message);
    });
    const enqueue = (file) => {
      if (disposed || (file && !isInputCsv(file.path))) return queue;
      queue = queue.then(() => processPending(app, options)).catch((error) => {
        notifyError(error);
        return Object.freeze({ error: error.message });
      });
      return queue;
    };
    ["create", "modify", "rename"].forEach((event) => {
      refs.push(app.vault.on(event, (file) => { enqueue(file); }));
    });
    if (options.startup !== false) enqueue();
    return Object.freeze({
      processPending: () => enqueue(),
      idle: () => queue,
      dispose() {
        disposed = true;
        refs.forEach((ref) => app.vault.offref(ref));
      }
    });
  }

  function autoRegister() {
    if (!root.app || root[STARTUP_GUARD_KEY]) return root[STARTUP_GUARD_KEY] || null;
    const handle = register(root.app);
    root[STARTUP_GUARD_KEY] = handle;
    return handle;
  }

  const api = Object.freeze({
    INPUT_DIR,
    PROCESSED_DIR,
    NORMALIZED_PATH,
    SNAPSHOT_PATH,
    AUDIT_PATH,
    LEGACY_NORMALIZED_PATH,
    CARD_SNAPSHOT_PATH,
    STARTUP_GUARD_KEY,
    resolveCore,
    isInputCsv,
    processPending,
    register,
    autoRegister
  });
  root.AuctionKeyValueImportService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined" && root.app) autoRegister();
})(typeof globalThis !== "undefined" ? globalThis : this);
