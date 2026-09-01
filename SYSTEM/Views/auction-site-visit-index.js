(function (root) {
  "use strict";

  const STORE_PATH = "PARA/RESOURCES/Auction Regions/auction-site-visits.json";
  const SCHEMA_VERSION = 2;
  const PHONE_PATTERN = /(?:^|[^\d])(?:01[016789][ -]?\d{3,4}[ -]?\d{4}|0\d{1,2}[ -]?\d{3,4}[ -]?\d{4})(?:[^\d]|$)/u;
  const PHONE_CAPTURE_PATTERN = /(?:01[016789][ -]?\d{3,4}[ -]?\d{4}|0\d{1,2}[ -]?\d{3,4}[ -]?\d{4})/u;
  const MANAGEMENT_PATTERN = /관리(?:사무소|소장|인)|생활지원센터(?:장)?|센터장/u;
  const CONTACT_IDENTITY_PATTERN = /^(?:관리소장|관리인|담당자)\s+\S+$/u;
  const STATE_PATTERN = /<!-- PRODIGY_SITE_VISIT_STATE\n([\s\S]*?)\n-->/u;
  const ITEM_LABELS = Object.freeze({
    Environment: "주변 환경", "Building Condition": "건물 상태", "Common Areas": "공용부", Accessibility: "접근성",
    Parking: "주차", Noise: "소음", Odor: "냄새", Photos: "사진", "Management Office": "관리사무소",
    "Broker Interview": "중개사 인터뷰", "Unexpected Findings": "예상 밖 발견", Occupancy: "점유 상태",
    "General Atmosphere": "전체 분위기", "Unit Layout": "호실 구조", Sunlight: "채광", View: "조망",
    Security: "보안", Elevator: "엘리베이터"
  });

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function emptyIndex() {
    return { schema_version: SCHEMA_VERSION, updated_at: null, records: {} };
  }

  function migrateIndex(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("임장 인덱스 형식이 올바르지 않습니다.");
    if (!value.records || typeof value.records !== "object" || Array.isArray(value.records)) {
      throw new Error("임장 인덱스 형식이 올바르지 않습니다.");
    }
    if (value.schema_version === SCHEMA_VERSION) return value;
    if (value.schema_version === 1) return {
      schema_version: SCHEMA_VERSION,
      updated_at: value.updated_at || null,
      records: Object.fromEntries(Object.entries(value.records).map(([path, record]) => [
        path,
        { ...record, management_contact: record && record.management_contact || null }
      ]))
    };
    throw new Error("임장 인덱스 형식이 올바르지 않습니다.");
  }

  function normalizePhone(value) {
    const text = clean(value);
    const digits = text.replace(/\D/gu, "");
    if (/^01[016789]\d{7,8}$/u.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`;
    if (/^02\d{7,8}$/u.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2, -4)}-${digits.slice(-4)}`;
    if (/^0\d{9,10}$/u.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, -4)}-${digits.slice(-4)}`;
    return text;
  }

  function normalizeManagementContact(value) {
    return {
      name: clean(value && value.name),
      phone: normalizePhone(value && value.phone),
      note: clean(value && value.note)
    };
  }

  function managementContactFromState(state) {
    const explicit = normalizeManagementContact(state && state.managementContact);
    if (explicit.name || explicit.phone || explicit.note) return explicit;
    const notes = Array.isArray(state && state.notes) ? state.notes.map(clean) : [];
    for (let index = 0; index < notes.length; index += 1) {
      const match = PHONE_CAPTURE_PATTERN.exec(notes[index]);
      if (!match) continue;
      const sameLineName = notes[index].replace(match[0], "").trim();
      const adjacent = [index - 1, index + 1].find((candidate) => candidate >= 0 && candidate < notes.length && MANAGEMENT_PATTERN.test(notes[candidate]));
      const name = MANAGEMENT_PATTERN.test(sameLineName) ? sameLineName : adjacent === undefined ? "" : notes[adjacent];
      if (name) return normalizeManagementContact({ name, phone: match[0], note: "" });
    }
    return explicit;
  }

  function meaningful(state) {
    if (!state || typeof state !== "object") return false;
    const rated = Object.values(state.checklist || {}).some((value) => !["", "unset", "unchecked", "미평가", "미확인"].includes(clean(value).toLowerCase()));
    const itemNote = Object.values(state.checklistNotes || {}).some((value) => clean(value));
    const contact = Object.values(managementContactFromState(state)).some((value) => clean(value));
    const listValue = ["notes", "unexpected", "photos"].some((key) => Array.isArray(state[key]) && state[key].some((value) => clean(value)));
    return rated || itemNote || contact || listValue;
  }

  function regionKey(page) {
    const sido = clean(page && page.region_sido);
    const sigungu = clean(page && page.region_sigungu);
    return sido && sigungu ? `${sido}-${sigungu}` : "";
  }

  function buildingName(page) {
    const explicit = clean(page && (page.apartment_name || page.property_name || page.building_name));
    if (explicit) return explicit;
    const address = clean(page && page.address);
    const detail = address.includes(",") ? address.split(",").slice(1).join(",").trim() : "";
    const withoutUnit = detail
      .replace(/\s+\d+\s*층[\s\S]*$/u, "")
      .replace(/\s+\d+\s*호[\s\S]*$/u, "")
      .trim();
    return withoutUnit || clean(page && page.file && page.file.name) || "건물명 미상";
  }

  function hasPhone(value) {
    return PHONE_PATTERN.test(clean(value));
  }

  function safeLine(value) {
    const line = clean(value).replace(/[\r\n]+/gu, " ");
    if (!line || hasPhone(line) || CONTACT_IDENTITY_PATTERN.test(line)) return "";
    return line.length > 120 ? `${line.slice(0, 117)}...` : line;
  }

  function visitDate(state) {
    const value = clean(state && (state.finishedAt || state.startedAt));
    return /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) : "";
  }

  function recordFromPage(page, state, sourceMeta) {
    if (!page || !page.file || !clean(page.file.path)) throw new Error("임장 원본 경로가 필요합니다.");
    if (!meaningful(state)) return null;
    const checklistNotes = state.checklistNotes || {};
    const rawNotes = [
      ...(Array.isArray(state.notes) ? state.notes : []),
      ...Object.entries(checklistNotes).filter(([, note]) => clean(note)).map(([key, note]) => `${ITEM_LABELS[key] || key}: ${note}`),
      ...(Array.isArray(state.unexpected) ? state.unexpected : [])
    ];
    const summaryLines = rawNotes.map(safeLine).filter(Boolean).slice(0, 3);
    const managementContact = managementContactFromState(state);
    const hasManagementContact = Object.values(managementContact).some((value) => clean(value));
    const ratings = Object.entries(state.checklist || {})
      .filter(([, rating]) => !["", "unset", "unchecked", "미평가", "미확인"].includes(clean(rating).toLowerCase()))
      .map(([key, rating]) => ({
        key,
        rating: clean(rating),
        note: safeLine(checklistNotes[key])
      }));
    const hasContact = hasManagementContact || rawNotes.some(hasPhone) || clean(checklistNotes["Management Office"]) !== "";
    return Object.freeze({
      source_path: clean(page.file.path),
      case_number: clean(page.case_number || page.file.name),
      property_type: clean(page.property_type),
      status: clean(state.finishedAt) ? "recorded" : "draft",
      visited_at: visitDate(state),
      region_key: regionKey(page),
      region_sido: clean(page.region_sido),
      region_sigungu: clean(page.region_sigungu),
      region_dong: clean(page.region_dong),
      region_admin_dong: clean(page.region_admin_dong),
      address: clean(page.address),
      building_name: buildingName(page),
      summary_lines: Object.freeze(summaryLines),
      ratings: Object.freeze(ratings.map((item) => Object.freeze(item))),
      checked_count: ratings.length,
      photo_count: Array.isArray(state.photos) ? state.photos.filter((value) => clean(value)).length : 0,
      has_contact: hasContact,
      management_contact: hasManagementContact ? Object.freeze({ ...managementContact }) : null,
      source_mtime: Number(sourceMeta && sourceMeta.mtime) || 0
    });
  }

  function parseFrontmatter(content) {
    const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(String(content || ""));
    const result = {};
    if (!match) return result;
    match[1].split("\n").forEach((line) => {
      const pair = /^([A-Za-z0-9_]+):\s*(.*?)\s*$/u.exec(line);
      if (!pair) return;
      result[pair[1]] = pair[2].replace(/^["']|["']$/gu, "");
    });
    return result;
  }

  function parseState(content) {
    const match = STATE_PATTERN.exec(String(content || ""));
    if (!match) return null;
    const payload = match[1].trim();
    try {
      return JSON.parse(payload.startsWith("v1:") ? decodeURIComponent(payload.slice(3)) : payload);
    } catch (_error) {
      throw new Error("임장 state를 읽을 수 없습니다.");
    }
  }

  function recordFromContent(sourcePath, content, sourceMeta) {
    const state = parseState(content);
    if (!state) return null;
    const page = parseFrontmatter(content);
    page.file = {
      path: clean(sourcePath),
      name: clean(sourcePath).split("/").pop().replace(/\.md$/iu, "")
    };
    return recordFromPage(page, state, sourceMeta);
  }

  function upsert(index, sourcePath, record, updatedAt) {
    const current = migrateIndex(index);
    const path = clean(sourcePath);
    if (!path) throw new Error("임장 원본 경로가 필요합니다.");
    const records = { ...current.records };
    if (record) records[path] = record;
    else delete records[path];
    return {
      schema_version: SCHEMA_VERSION,
      updated_at: clean(updatedAt) || new Date().toISOString(),
      records
    };
  }

  function visitsForRegion(index, key, dong) {
    const region = clean(key);
    const targetDong = clean(dong);
    return Object.values(migrateIndex(index).records)
      .filter((record) => record && record.region_key === region && (!targetDong || record.region_admin_dong === targetDong || record.region_dong === targetDong))
      .slice()
      .sort((a, b) => (b.visited_at || "").localeCompare(a.visited_at || "") || a.source_path.localeCompare(b.source_path))
      .map((record) => Object.freeze({ ...record }));
  }

  async function ensureStore(app) {
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    let file = app.vault.getAbstractFileByPath(STORE_PATH);
    if (file) return file;
    const folder = STORE_PATH.split("/").slice(0, -1).join("/");
    if (!app.vault.getAbstractFileByPath(folder) && typeof app.vault.createFolder === "function") {
      try { await app.vault.createFolder(folder); } catch (_error) { /* another writer may have created it */ }
    }
    file = await app.vault.create(STORE_PATH, `${JSON.stringify(emptyIndex(), null, 2)}\n`);
    return file;
  }

  async function readIndex(app) {
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const file = app.vault.getAbstractFileByPath(STORE_PATH);
    if (!file) return emptyIndex();
    return migrateIndex(JSON.parse(await app.vault.read(file)));
  }

  async function syncRecord(app, page, state, sourceMeta) {
    const file = await ensureStore(app);
    const record = recordFromPage(page, state, sourceMeta);
    await app.vault.process(file, (content) => {
      const current = migrateIndex(JSON.parse(content));
      return `${JSON.stringify(upsert(current, page.file.path, record), null, 2)}\n`;
    });
    return record;
  }

  async function readRegionVisits(app, key, dong) {
    return visitsForRegion(await readIndex(app), key, dong);
  }

  function buildIndex(documents, updatedAt) {
    let index = emptyIndex();
    (documents || []).forEach((document) => {
      const record = recordFromContent(document.path, document.content, { mtime: document.mtime });
      index = upsert(index, document.path, record, updatedAt);
    });
    return index;
  }

  const api = Object.freeze({
    STORE_PATH,
    SCHEMA_VERSION,
    emptyIndex,
    migrateIndex,
    normalizePhone,
    normalizeManagementContact,
    managementContactFromState,
    meaningful,
    regionKey,
    buildingName,
    parseState,
    recordFromPage,
    recordFromContent,
    upsert,
    visitsForRegion,
    readIndex,
    syncRecord,
    readRegionVisits,
    buildIndex
  });
  root.AuctionSiteVisitIndex = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
