"use strict";

const path = require("node:path");
const { createFixtureCaseSet } = require("./knowledge_explorer_fixture_cases.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SCOPED_DIR = path.join(ROOT, "SYSTEM/AI/Skills/prodigy-review/tests/knowledge");
const SYNTHETIC_ROOT = "SYNTHETIC/knowledge-explorer";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    deepFreeze(item);
  }
  return value;
}

function toYamlValue(value, indent = "") {
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `\n${value.map((item) => `${indent}- ${toYamlValue(item, `${indent}  `).replace(/^\n/, "")}`).join("\n")}`;
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.includes(":") || value.includes("#") ? JSON.stringify(value) : value;
  return String(value);
}

function frontmatter(frontmatterValues) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatterValues)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${toYamlValue(item)}`);
      continue;
    }
    lines.push(`${key}: ${toYamlValue(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function doc(relativePath, frontmatterValues, body = "") {
  const content = `${frontmatter(frontmatterValues)}\n\n${body}\n`;
  return deepFreeze({
    source_path: `${SYNTHETIC_ROOT}/${relativePath}`,
    content,
    source_mtime: 1,
    type: frontmatterValues.type || "",
    title: frontmatterValues.title || "",
    frontmatter: { ...frontmatterValues }
  });
}

function buildCatalog() {
  const sets = createFixtureCaseSet(doc, deepFreeze);
  return deepFreeze({
    ...sets,
    legacyPermanentNotes: [
      doc("knowledge/legacy-permanent-note.md", {
        type: "permanent_note",
        title: "기존 영구 노트",
        knowledge_domain: "",
        knowledge_topics: "coding, business",
        connections: ["[[SYNTHETIC/knowledge-explorer/literature/책-1.md]]"]
      }, "# 기존 영구 노트\n\n레거시 호환용 노트다.\n")
    ]
  });
}

function flattenCatalog(catalog) {
  return Object.values(catalog).flat();
}

function assertKnowledgeFixtureCoverage(catalog) {
  const required = [
    ["validatedKnowledge", "validatedKnowledge"],
    ["legacyPermanentNotes", "legacyPermanentNotes"],
    ["literatureResources", "literatureResources"],
    ["venues", "venues"],
    ["auctionRegions", "auctionRegions"],
    ["people", "people"],
    ["projects", "projects"],
    ["journals", "journals"],
    ["dailyNotes", "dailyNotes"],
    ["malformed", "malformed"],
    ["brokenLinks", "brokenLinks"],
    ["duplicateLinks", "duplicateLinks"],
    ["emptyDomains", "emptyDomains"],
    ["longKoreanLabels", "longKoreanLabels"],
    ["unbrokenUrls", "unbrokenUrls"],
    ["providerSuccess", "providerSuccess"],
    ["providerFailure", "providerFailure"],
    ["containers", "containers"]
  ];
  for (const [key] of required) {
    if (!Array.isArray(catalog[key]) || catalog[key].length === 0) {
      throw new Error(`Missing required knowledge fixture case: ${key}`);
    }
  }
  if (!catalog.containers.some((item) => item.id === "desktop")) {
    throw new Error("Missing required knowledge fixture case: desktop");
  }
  if (!catalog.containers.some((item) => item.id === "narrow")) {
    throw new Error("Missing required knowledge fixture case: narrow");
  }
  return true;
}

function cloneCatalog(catalog) {
  return JSON.parse(JSON.stringify(catalog));
}

const catalog = buildCatalog();

module.exports = {
  ROOT,
  SCOPED_DIR,
  SYNTHETIC_ROOT,
  assertKnowledgeFixtureCoverage,
  buildCatalog,
  cloneCatalog,
  deepFreeze,
  doc,
  flattenCatalog,
  frontmatter,
  catalog
};
