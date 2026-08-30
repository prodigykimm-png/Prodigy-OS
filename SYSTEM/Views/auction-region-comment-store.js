(function (root) {
  "use strict";

  const STORE_PATH = "PARA/RESOURCES/Auction Regions/auction-region-comments.json";
  const SCHEMA_VERSION = 2;
  const SCOPES = new Set(["sigungu", "admin_dong"]);

  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function validRegionKey(value) {
    const key = clean(value);
    if (!/^\S.+-\S.+$/u.test(key) || /[\/\\[\]<>`\r\n]/u.test(key)) throw new Error("지역 식별자가 올바르지 않습니다.");
    return key;
  }
  function validComment(value) {
    const comment = clean(value);
    if (!comment) throw new Error("지역 코멘트를 입력하세요.");
    if (comment.length > 1000) throw new Error("지역 코멘트는 1,000자 이하로 입력하세요.");
    return comment;
  }
  function validPath(value) {
    const path = clean(value);
    if (!path || /[\r\n<>`]/u.test(path)) throw new Error("원본 사건 경로가 올바르지 않습니다.");
    return path;
  }
  function emptyStore() { return { schema_version: SCHEMA_VERSION, comments: [] }; }
  function migrateStore(value) {
    if (!value || !Array.isArray(value.comments)) throw new Error("지역 코멘트 저장소 형식이 올바르지 않습니다.");
    if (value.schema_version === SCHEMA_VERSION) return value;
    if (value.schema_version === 1) return {
      schema_version: SCHEMA_VERSION,
      comments: value.comments.map((item) => ({ ...item, scope: "sigungu", admin_dong: null }))
    };
    throw new Error("지역 코멘트 저장소 형식이 올바르지 않습니다.");
  }
  function validateStore(value) { return migrateStore(value); }
  function validScope(value) {
    const scope = clean(value) || "sigungu";
    if (!SCOPES.has(scope)) throw new Error("코멘트 범위가 올바르지 않습니다.");
    return scope;
  }
  function validAdminDong(value, scope) {
    const dong = clean(value);
    if (scope === "admin_dong" && !dong) throw new Error("동 코멘트에는 행정동이 필요합니다.");
    if (dong && /[\/\\[\]<>`\r\n]/u.test(dong)) throw new Error("행정동이 올바르지 않습니다.");
    return scope === "admin_dong" ? dong : null;
  }
  function normalizeComment(input) {
    const createdAt = clean(input && input.created_at) || new Date().toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T/u.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) throw new Error("작성시각이 올바르지 않습니다.");
    const regionKey = validRegionKey(input && input.region_key);
    const sourcePath = validPath(input && input.source_case_path);
    const comment = validComment(input && input.comment);
    const scope = validScope(input && input.scope);
    const adminDong = validAdminDong(input && input.admin_dong, scope);
    const id = clean(input && input.id) || `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
    return Object.freeze({ id, region_key: regionKey, scope, admin_dong: adminDong, comment, created_at: createdAt, source_case_path: sourcePath });
  }
  function appendComment(store, input) {
    const current = validateStore(store);
    const row = normalizeComment(input);
    if (current.comments.some((item) => item.id === row.id)) return current;
    return { schema_version: SCHEMA_VERSION, comments: [...current.comments, row] };
  }
  function commentsForScope(store, regionKey, scope, adminDong) {
    const key = validRegionKey(regionKey);
    const normalizedScope = validScope(scope);
    const dong = validAdminDong(adminDong, normalizedScope);
    return Object.freeze(validateStore(store).comments
      .filter((item) => item.region_key === key && (item.scope || "sigungu") === normalizedScope && (normalizedScope !== "admin_dong" || item.admin_dong === dong))
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((item) => Object.freeze({ ...item })));
  }
  function commentsForRegion(store, regionKey) { return commentsForScope(store, regionKey, "sigungu", null); }
  async function readStore(app) {
    if (!app || !app.vault) throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    const file = app.vault.getAbstractFileByPath(STORE_PATH);
    if (!file) return emptyStore();
    return migrateStore(JSON.parse(await app.vault.read(file)));
  }
  async function saveComment(app, input) {
    if (!app || !app.vault || typeof app.vault.process !== "function") throw new Error("Obsidian Vault 저장 기능을 사용할 수 없습니다.");
    const normalized = normalizeComment(input);
    let file = app.vault.getAbstractFileByPath(STORE_PATH);
    if (!file) file = await app.vault.create(STORE_PATH, `${JSON.stringify(emptyStore(), null, 2)}\n`);
    let saved;
    await app.vault.process(file, (content) => {
      const next = appendComment(migrateStore(JSON.parse(content)), normalized);
      saved = next.comments.find((item) => item.id === normalized.id);
      return `${JSON.stringify(next, null, 2)}\n`;
    });
    return saved;
  }
  async function readRegionComments(app, regionKey) { return commentsForRegion(await readStore(app), regionKey); }
  async function readScopedComments(app, regionKey, scope, adminDong) { return commentsForScope(await readStore(app), regionKey, scope, adminDong); }

  const api = Object.freeze({ STORE_PATH, SCHEMA_VERSION, emptyStore, migrateStore, validateStore, normalizeComment, appendComment, commentsForRegion, commentsForScope, readStore, saveComment, readRegionComments, readScopedComments });
  root.AuctionRegionCommentStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
