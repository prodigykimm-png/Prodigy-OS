(function (root) {
  "use strict";

  const CONFIG_PATH = "SYSTEM/PRIVATE/prodigy.local.json";
  const LEGACY_CONFIG_PATH = "SYSTEM/PRIVATE/project-wizard.local.json";
  const SECRET_IDS = Object.freeze({
    todoist: "prodigy-todoist-api-token",
    reb: "prodigy-reb-openapi-key",
    dataGoKr: "prodigy-data-go-kr-service-key",
    vworld: "prodigy-vworld-api-key",
    kosis: "prodigy-kosis-api-key",
    seoulOpenapi: "prodigy-seoul-openapi-key",
    naverClientId: "prodigy-naver-client-id",
    naverClientSecret: "prodigy-naver-client-secret",
    youtube: "prodigy-youtube-api-key",
  });
  const REGION_SECRET_IDS = Object.freeze({
    reb: SECRET_IDS.reb,
    dataGoKr: SECRET_IDS.dataGoKr,
    vworld: SECRET_IDS.vworld,
    kosis: SECRET_IDS.kosis,
    seoulOpenapi: SECRET_IDS.seoulOpenapi,
    naverClientId: SECRET_IDS.naverClientId,
    naverClientSecret: SECRET_IDS.naverClientSecret,
    youtube: SECRET_IDS.youtube,
  });
  const DEFAULT_CONFIG = Object.freeze({ workflowPresets: Object.freeze({}) });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalizeWorkflowPresets(value) {
    if (!plain(value)) return {};
    const result = {};
    for (const [key, rows] of Object.entries(value)) {
      if (!Array.isArray(rows)) continue;
      const labels = rows.map((row) => typeof row === "string" ? row.trim() : String(row && row.label || "").trim()).filter(Boolean);
      if (labels.length) result[key] = labels.map((label) => ({ label }));
    }
    return result;
  }
  function mergeConfig(base, patch) {
    return Object.freeze({
      workflowPresets: Object.freeze(normalizeWorkflowPresets(
        plain(patch) && patch.workflowPresets !== undefined
          ? patch.workflowPresets
          : plain(base) ? base.workflowPresets : {},
      )),
    });
  }
  async function readJson(app, filePath) {
    const file = app && app.vault && app.vault.getAbstractFileByPath(filePath);
    if (!file) return null;
    try { return JSON.parse(await app.vault.read(file)); } catch (_error) { return null; }
  }
  async function load(app) {
    const current = await readJson(app, CONFIG_PATH);
    if (current) return mergeConfig(DEFAULT_CONFIG, current);
    const legacy = await readJson(app, LEGACY_CONFIG_PATH);
    return mergeConfig(DEFAULT_CONFIG, legacy || {});
  }
  async function writeJson(app, filePath, value) {
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    const existing = app.vault.getAbstractFileByPath(filePath);
    if (existing) await app.vault.modify(existing, bytes);
    else {
      const parent = filePath.split("/").slice(0, -1).join("/");
      if (parent && !app.vault.getAbstractFileByPath(parent)) await app.vault.createFolder(parent);
      await app.vault.create(filePath, bytes);
    }
  }
  async function getSecret(app, secretId) {
    if (!secretId || !app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    try { return String(await app.secretStorage.getSecret(secretId) || ""); } catch (_error) { return ""; }
  }
  async function setSecret(app, secretId, value) {
    if (!secretId || !app || !app.secretStorage || typeof app.secretStorage.setSecret !== "function") throw new Error("secret_storage_unavailable");
    await app.secretStorage.setSecret(secretId, String(value || ""));
  }
  async function deleteSecret(app, secretId) {
    if (!secretId || !app || !app.secretStorage) return;
    if (typeof app.secretStorage.deleteSecret === "function") await app.secretStorage.deleteSecret(secretId);
    else if (typeof app.secretStorage.setSecret === "function") await app.secretStorage.setSecret(secretId, "");
  }
  async function save(app, settings) {
    const config = mergeConfig(DEFAULT_CONFIG, settings && settings.config || {});
    await writeJson(app, CONFIG_PATH, config);
    for (const [secretId, value] of Object.entries(settings && settings.secrets || {})) {
      if (value) await setSecret(app, secretId, value);
    }
    for (const secretId of settings && settings.deleteSecretIds || []) await deleteSecret(app, secretId);
    return config;
  }

  const api = Object.freeze({
    CONFIG_PATH,
    LEGACY_CONFIG_PATH,
    SECRET_IDS,
    REGION_SECRET_IDS,
    DEFAULT_CONFIG,
    mergeConfig,
    load,
    save,
    getSecret,
    setSecret,
    deleteSecret,
  });
  root.ProdigyConfigService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
