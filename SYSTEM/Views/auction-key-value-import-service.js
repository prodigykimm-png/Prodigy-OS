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
  const CARD_DIR = "PARA/PROJECTS/Auction";
  const CARD_STATE_PATH = `${CACHE_DIR}/card-scan-state.json`;
  const CARD_PATTERN = /^PARA\/PROJECTS\/Auction\/[^/]+\.md$/;
  const STARTUP_GUARD_KEY = "__auctionKeyValueImportService";

  function freshRequire(requireModule, request) {
    try {
      if (requireModule.cache) {
        for (const cached of Object.keys(requireModule.cache)) {
          if (cached.endsWith("/SYSTEM/SCRIPTS/auction-key-value-core.js")) delete requireModule.cache[cached];
        }
      }
    } catch (_error) { /* cache not accessible */ }
    return requireModule(request);
  }

  function resolveCore(app, load) {
    const requireModule = load || (typeof require === "function" ? require : null);
    if (!requireModule) throw new Error("경매 키값 계산 모듈을 불러올 수 없습니다.");
    try {
      return freshRequire(requireModule, "../SCRIPTS/auction-key-value-core.js");
    } catch (relativeError) {
      const basePath = app && app.vault && app.vault.adapter
        && typeof app.vault.adapter.getBasePath === "function"
        ? app.vault.adapter.getBasePath()
        : null;
      if (!basePath) throw relativeError;
      const path = requireModule("node:path");
      return freshRequire(requireModule, path.join(basePath, "SYSTEM/SCRIPTS/auction-key-value-core.js"));
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

  function isCardNote(path) {
    return typeof path === "string" && CARD_PATTERN.test(path);
  }

  function readCardFrontmatter(text) {
    const match = String(text).match(/^---\n([\s\S]*?)\n---/);
    const fm = {};
    if (!match) return fm;
    for (const line of match[1].split("\n")) {
      if (/^\s/.test(line)) continue;
      const index = line.indexOf(":");
      if (index === -1) continue;
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      fm[line.slice(0, index).trim()] = value;
    }
    return fm;
  }

  function areaNumber(areaText) {
    const match = String(areaText ?? "").replaceAll(",", "").match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function compositeKeys(core, record) {
    const parsed = core.parseRegion(record.parcel_address);
    const tail = [record.property_type, record.area_sqm, record.price_won, record.auction_date];
    return [
      [core.canonicalSido(record.region_sido || parsed.sido), record.region_sigungu || parsed.sigungu, record.legal_dong, ...tail].join("|"),
      [core.canonicalSido(parsed.sido), parsed.sigungu, record.legal_dong, ...tail].join("|")
    ];
  }

  async function readScanState(vault) {
    const file = vault.getAbstractFileByPath(CARD_STATE_PATH);
    if (!file) return {};
    try { return JSON.parse(await vault.read(file)) || {}; } catch (_error) { return {}; }
  }

  async function scanCardNotes(app, core, today) {
    const files = app.vault.getFiles()
      .filter((file) => isCardNote(file.path))
      .sort((left, right) => left.path.localeCompare(right.path, "ko"));
    const records = [];
    const excluded = { noPrice: 0, unsupported: 0, noArea: 0, badDate: 0, futureDate: 0, noDong: 0 };
    const hashParts = [];
    for (const file of files) {
      const fm = readCardFrontmatter(await app.vault.read(file));
      if (fm.type !== "auction_case") continue;
      const price = /^\d+$/.test(String(fm.winning_bid_price ?? "").trim()) ? Number(fm.winning_bid_price) : null;
      const propertyType = core.canonicalPropertyType(fm.property_type);
      const areaText = core.isLandPropertyType(propertyType) ? (fm.land_rights_area_sqm ?? "") : (fm.exclusive_area ?? fm.supply_area ?? "");
      const date = String(fm.auction_datetime ?? fm.auction_result_date ?? "").slice(0, 10);
      hashParts.push([file.path, fm.property_type, fm.address, areaText, price, date].join("|"));
      if (!(price > 0)) { excluded.noPrice += 1; continue; }
      if (!core.SUPPORTED_PROPERTY_TYPES.includes(propertyType)) { excluded.unsupported += 1; continue; }
      const area = areaNumber(areaText);
      if (!(area > 0)) { excluded.noArea += 1; continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { excluded.badDate += 1; continue; }
      if (date > today) { excluded.futureDate += 1; continue; }
      const record = core.buildCardRecord({
        property_type: fm.property_type, address: fm.address, areaText, priceWon: price, dateText: date,
        sourceFile: file.name, regionDong: fm.region_dong ?? "",
        regionSido: fm.region_sido ?? "", regionSigungu: fm.region_sigungu ?? ""
      });
      if (!record.legal_dong) { excluded.noDong += 1; continue; }
      records.push(record);
    }
    return Object.freeze({ records, excluded, hash: core.sha256(hashParts.join("\n")) });
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
    const today = generatedAt.slice(0, 10);
    const cardScan = await scanCardNotes(app, core, today);
    const scanState = await readScanState(app.vault);
    if (!files.length && cardScan.hash === scanState.cards_hash) {
      return Object.freeze({ files: 0, imported: 0, added: 0, cardAdded: 0, skipped: true });
    }

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
    const csvKeys = new Set();
    for (const record of recordsById.values()) csvKeys.add(compositeKeys(core, record)[0]);
    const cardKeys = new Set();
    let cardAdded = 0;
    let cardDuplicates = 0;
    for (const record of cardScan.records) {
      const keys = compositeKeys(core, record);
      if (recordsById.has(record.record_id) || keys.some((key) => csvKeys.has(key) || cardKeys.has(key))) {
        cardDuplicates += 1;
        continue;
      }
      keys.forEach((key) => cardKeys.add(key));
      recordsById.set(record.record_id, record);
      cardAdded += 1;
    }
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
      added_records: records.length - cardAdded - before,
      duplicate_records: seed.length + imported.length - (records.length - cardAdded),
      total_records: records.length,
      card_records: cardScan.records.length,
      card_added: cardAdded,
      card_duplicates: cardDuplicates,
      card_excluded: cardScan.excluded,
      groups: groups.length,
      usable_groups: groups.filter((group) => group.confidence === "usable").length,
      snapshot_hash: snapshot.content_hash
    });

    await writeText(app.vault, NORMALIZED_PATH, `${JSON.stringify(records, null, 2)}\n`);
    await writeText(app.vault, SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    await writeText(app.vault, AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
    await writeText(app.vault, CARD_SNAPSHOT_PATH, cardSnapshotSource(snapshot));
    await writeText(app.vault, CARD_STATE_PATH, `${JSON.stringify({ cards_hash: cardScan.hash, generated_at: generatedAt }, null, 2)}\n`);
    root.AuctionKeyValueSnapshot = snapshot;

    const month = generatedAt.slice(0, 7);
    await ensureFolder(app.vault, `${PROCESSED_DIR}/${month}`);
    for (const file of files) {
      const hash = core.sha256(contents.get(file.path));
      await app.vault.rename(file, uniqueArchivePath(app.vault, file, month, hash));
    }
    if (files.length) {
      notify(`경매 키값 CSV ${files.length}개 적용 · 신규 ${audit.added_records}건${cardAdded ? ` · 카드 신규 ${cardAdded}건` : ""} · 전체 ${records.length}건`);
    } else if (cardAdded > 0) {
      notify(`카드 낙찰가 반영 · 신규 ${cardAdded}건 · 전체 ${records.length}건`);
    }
    return Object.freeze({
      files: files.length,
      imported: imported.length,
      added: audit.added_records,
      cardRecords: cardScan.records.length,
      cardAdded,
      cardDuplicates,
      cardExcluded: cardScan.excluded,
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
    const runStep = () => processPending(app, options).catch((error) => {
      notifyError(error);
      return Object.freeze({ error: error.message });
    });
    const enqueue = (file) => {
      if (disposed) return queue;
      const isCard = file && isCardNote(file.path);
      if (file && !isInputCsv(file.path) && !isCard) return queue;
      queue = isCard
        ? queue.then(() => new Promise((resolveDelay) => setTimeout(resolveDelay, 1500))).then(runStep)
        : queue.then(runStep);
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
    CARD_DIR,
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
