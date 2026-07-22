"use strict";

(function (root) {
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizedKey(value) {
    return normalizeString(value).toLowerCase();
  }

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) freeze(item);
    return value;
  }

  function wrapIndex(index, length) {
    if (!length) return -1;
    const normalized = index % length;
    return normalized < 0 ? normalized + length : normalized;
  }

  function listDomains(model) {
    return asArray(model && model.domains);
  }

  function domainByKey(model, key) {
    const domains = listDomains(model);
    const normalized = normalizedKey(key);
    return domains.find((domain) => normalizedKey(domain && domain.key) === normalized) || domains[0] || null;
  }

  function middleSections(domain) {
    if (!isObject(domain)) return [];
    const toSection = (section, kind) => ({
      kind,
      key: normalizeString(section && section.key),
      type: normalizeString(section && section.type),
      label: normalizeString(section && section.label) || normalizeString(section && section.key),
      count: Number(section && section.count) || 0,
      recency: Number(section && section.recency) || 0,
      assets: asArray(section && section.assets),
      section
    });
    return [
      ...asArray(domain.topic_sections).map((section) => toSection(section, "topic")),
      ...asArray(domain.resource_sections).map((section) => toSection(section, "resource"))
    ];
  }

  function sectionAssets(section) {
    return asArray(section && section.assets);
  }

  function selectDefaultSection(sections) {
    return sections.find((section) => section.count > 0) || sections[0] || null;
  }

  function selectDefaultAsset(section) {
    return sectionAssets(section)[0] || null;
  }

  function matchingSection(sections, kind, key) {
    return sections.find((section) => normalizedKey(section.kind) === normalizedKey(kind) && normalizedKey(section.key) === normalizedKey(key)) || null;
  }

  function matchingAsset(section, path) {
    return sectionAssets(section).find((asset) => normalizedKey(asset && asset.path) === normalizedKey(path)) || null;
  }

  function createSelectionState(model, seed = {}) {
    const modelSelection = model && model.selection ? model.selection : {};
    const domain = domainByKey(model, seed.domainKey || seed.domain || modelSelection.domain);
    const sections = middleSections(domain);
    const section = matchingSection(sections, seed.middleKind || modelSelection.section_kind, seed.middleKey || modelSelection.section_key) || selectDefaultSection(sections);
    const asset = section ? matchingAsset(section, seed.assetPath || modelSelection.asset_path) || selectDefaultAsset(section) : null;
    return freeze({
      domainKey: domain ? domain.key : null,
      middleKind: section ? section.kind : null,
      middleKey: section ? section.key : null,
      assetPath: asset ? asset.path : null,
      focusPane: normalizeString(seed.focusPane) || "domain"
    });
  }

  function reduceSelectionState(model, state, action) {
    const current = createSelectionState(model, state || {});
    const type = normalizeString(action && action.type);
    const domains = listDomains(model);
    const domain = domainByKey(model, current.domainKey);
    const sections = middleSections(domain);
    const section = matchingSection(sections, current.middleKind, current.middleKey) || selectDefaultSection(sections);
    const assets = sectionAssets(section);
    const domainIndex = Math.max(0, domains.findIndex((item) => normalizedKey(item && item.key) === normalizedKey(current.domainKey)));
    const sectionIndex = Math.max(0, sections.findIndex((item) => normalizedKey(item.kind) === normalizedKey(current.middleKind) && normalizedKey(item.key) === normalizedKey(current.middleKey)));
    const assetIndex = Math.max(0, assets.findIndex((item) => normalizedKey(item && item.path) === normalizedKey(current.assetPath)));
    const delta = Number(action && action.delta) || 0;
    if (!type) return current;
    if (type === "set-domain" || type === "move-domain") {
      const next = type === "set-domain" ? domainByKey(model, action.domainKey) : domains[wrapIndex(domainIndex + delta, domains.length)] || domain;
      return createSelectionState(model, { ...current, domainKey: next && next.key, middleKind: null, middleKey: null, assetPath: null, focusPane: "domain" });
    }
    if (type === "set-middle" || type === "move-middle") {
      const next = type === "set-middle" ? matchingSection(sections, action.middleKind, action.middleKey) : sections[wrapIndex(sectionIndex + delta, sections.length)] || section;
      return createSelectionState(model, { ...current, middleKind: next && next.kind, middleKey: next && next.key, assetPath: null, focusPane: "middle" });
    }
    if (type === "set-asset" || type === "move-asset") {
      const next = type === "set-asset" ? matchingAsset(section, action.assetPath) : assets[wrapIndex(assetIndex + delta, assets.length)] || null;
      return createSelectionState(model, { ...current, assetPath: next && next.path, focusPane: "detail" });
    }
    if (type === "activate") return createSelectionState(model, { ...current, focusPane: current.focusPane === "domain" ? "middle" : current.focusPane === "middle" ? "detail" : "detail" });
    if (type === "back") return createSelectionState(model, { ...current, focusPane: current.focusPane === "detail" ? "middle" : current.focusPane === "middle" ? "domain" : "domain" });
    if (type === "focus-pane") return createSelectionState(model, { ...current, focusPane: action.focusPane });
    return current;
  }

  function findCurrentDomain(model, state) {
    return domainByKey(model, state && state.domainKey);
  }

  function findCurrentSection(model, state) {
    return matchingSection(middleSections(findCurrentDomain(model, state)), state && state.middleKind, state && state.middleKey) || selectDefaultSection(middleSections(findCurrentDomain(model, state)));
  }

  function findCurrentAsset(model, state) {
    const section = findCurrentSection(model, state);
    return matchingAsset(section, state && state.assetPath) || selectDefaultAsset(section);
  }

  function domainLabel(model, key) {
    const domain = domainByKey(model, key);
    return domain ? domain.label || domain.key : normalizeString(key);
  }

  function sectionLabel(section) {
    return section ? section.label || section.key : "";
  }

  function assetLabel(asset) {
    return asset ? asset.title || asset.path : "";
  }

  function detailSectionsFor(model, state) {
    const asset = findCurrentAsset(model, state);
    const byPath = model && isObject(model.detail_sections_by_asset_path) ? model.detail_sections_by_asset_path : null;
    const key = normalizedKey(asset && asset.path);
    if (byPath && key && Array.isArray(byPath[key])) return byPath[key];
    if (asset && Array.isArray(asset.detail_sections)) return asset.detail_sections;
    return asArray(model && model.detail_sections);
  }

  function surfaceCopy(surfaceState, model) {
    const state = normalizeString(surfaceState) || "rest";
    const totalAssets = Number(model && model.totals && (model.totals.knowledge + model.totals.resources)) || 0;
    const copies = {
      loading: "로딩 중인 탐색기 상태입니다.",
      empty: totalAssets ? "현재 선택은 비어 있지만 탐색 구조는 유지됩니다." : "탐색할 지식이 아직 없습니다.",
      error: "복구 가능한 오류 상태입니다. 선택과 기본 구조는 유지됩니다.",
      disabled: "현재 컨트롤은 비활성화되어 있습니다.",
      "focus-visible": "포커스가 보이는 상태입니다.",
      selected: "선택 상태가 유지됩니다.",
      rest: "기본 탐색 상태입니다."
    };
    return { state: Object.prototype.hasOwnProperty.call(copies, state) ? state : "rest", text: state, detail: copies[state] || copies.rest };
  }

  const api = Object.freeze({ asArray, normalizeString, normalizedKey, createSelectionState, reduceSelectionState, listDomains, middleSections, sectionAssets, findCurrentDomain, findCurrentSection, findCurrentAsset, domainLabel, sectionLabel, assetLabel, detailSectionsFor, surfaceCopy });
  root.KnowledgeExplorerState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
