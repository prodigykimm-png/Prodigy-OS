"use strict";

const SCRIPT_RELATIVE_PATH = "SYSTEM/SCRIPTS/region-source-mois-collect.js";
const REGISTRIES = Object.freeze(["pilot", "expansion"]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function validatePeriod(value) {
  const period = text(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(period)) throw new Error("수집 기간은 YYYY-MM 형식이어야 합니다.");
  return period;
}

function validatePublishedAt(value) {
  const publishedAt = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(publishedAt) || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error("공식 공표 시각은 UTC ISO 형식(예: 2026-06-20T00:00:00.000Z)이어야 합니다.");
  }
  return publishedAt;
}

function shellQuote(value) {
  const safe = text(value);
  if (!safe || /[\r\n]/u.test(safe)) throw new Error("명령에 줄바꿈이 포함될 수 없습니다.");
  return `'${safe.replace(/'/gu, `'"'"'`)}'`;
}

function validateVaultRoot(value) {
  const vaultRoot = text(value);
  if (!vaultRoot) return "";
  if (!vaultRoot.startsWith("/") || /[\r\n]/u.test(vaultRoot)) throw new Error("Vault 루트는 줄바꿈이 없는 절대 경로여야 합니다.");
  return vaultRoot.replace(/\/+$/u, "");
}

function buildCommand(options = {}) {
  const period = validatePeriod(options.period);
  const publishedAt = validatePublishedAt(options.published_at ?? options.publishedAt);
  const registry = text(options.registry || "expansion");
  if (!REGISTRIES.includes(registry)) throw new Error("대상 범위는 pilot 또는 expansion이어야 합니다.");
  const vaultRoot = validateVaultRoot(options.vault_root ?? options.vaultRoot);
  const prefix = vaultRoot ? `cd ${shellQuote(vaultRoot)} && ` : "";
  const script = vaultRoot ? `${vaultRoot}/${SCRIPT_RELATIVE_PATH}` : SCRIPT_RELATIVE_PATH;
  const networkFlag = options.allow_network === false || options.allowNetwork === false ? "" : " --allow-network";
  return `${prefix}node ${shellQuote(script)} --period ${shellQuote(period)} --published-at ${shellQuote(publishedAt)} --registry ${shellQuote(registry)}${networkFlag}`;
}

module.exports = Object.freeze({
  REGISTRIES,
  SCRIPT_RELATIVE_PATH,
  buildCommand,
  shellQuote,
  validatePeriod,
  validatePublishedAt,
  validateVaultRoot
});
