"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_PATH = path.join(ROOT, "SYSTEM/Prodigy/Schema/Knowledge_Explorer_Schema.md");
const DISPLAY_PATH = path.join(ROOT, "SYSTEM/Views/display-registry.js");
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js");

function loadDisplayRegistry() {
  const sandbox = { window: {} };
  const source = fs.readFileSync(DISPLAY_PATH, "utf8");
  vm.runInNewContext(source, sandbox, { filename: "display-registry.js" });
  return sandbox.window.prodigyDisplay || null;
}

function loadKnowledgeRegistry() {
  delete require.cache[require.resolve(KNOWLEDGE_REGISTRY_PATH)];
  return require(KNOWLEDGE_REGISTRY_PATH);
}

function readSchemaRegistry() {
  const source = fs.readFileSync(SCHEMA_PATH, "utf8");
  const block = source.match(/## Approved Registry[\s\S]*?```yaml\s*([\s\S]*?)```/);
  const domains = new Map();
  if (!block) return domains;
  for (const line of block[1].split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z][a-z0-9_]*)\s*:\s*\[(.*?)\]\s*$/);
    if (!match) continue;
    const domain = match[1];
    const topics = match[2].trim()
      ? match[2].split(",").map((topic) => topic.trim()).filter(Boolean)
      : [];
    domains.set(domain, topics);
  }
  return domains;
}

function parseScalar(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseFrontmatter(text) {
  if (typeof text !== "string" || !text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end < 0) return {};
  const result = {};
  let currentKey = null;
  for (const rawLine of text.slice(4, end).split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line) continue;
    const listMatch = currentKey && line.match(/^\s*-\s*(.*)$/);
    if (listMatch) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }
    currentKey = null;
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const key = match[1];
    const value = (match[2] || "").trim();
    if (!value) {
      result[key] = "";
      currentKey = key;
    } else if (value === "[]") {
      result[key] = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      result[key] = inner ? inner.split(",").map((item) => parseScalar(item)) : [];
    } else {
      result[key] = parseScalar(value);
    }
  }
  return result;
}

function normalizeDomain(value, approvedDomains) {
  const text = parseScalar(value).toLowerCase();
  return { value: text, valid: Boolean(text) && approvedDomains.has(text) };
}

function normalizeTopics(value, approvedTopics, options = {}) {
  const allowScalar = options.allowScalar !== false;
  const source = Array.isArray(value)
    ? value.slice()
    : typeof value === "string" && allowScalar
      ? value.split(",")
      : typeof value === "string" && !allowScalar
        ? [value]
        : [];
  const normalized = [];
  let valid = true;
  for (const item of source) {
    const text = parseScalar(item).toLowerCase();
    if (!text || !approvedTopics.has(text)) {
      valid = false;
      continue;
    }
    if (!normalized.includes(text)) normalized.push(text);
  }
  return { value: normalized, valid };
}

function buildRegistry() {
  const knowledgeRegistry = loadKnowledgeRegistry();
  const domainTopics = new Map(
    knowledgeRegistry.DOMAIN_ORDER.map((domain) => [
      domain,
      [...(knowledgeRegistry.TOPICS_BY_DOMAIN[domain] || [])]
    ])
  );
  const approvedTopics = new Set();
  for (const topics of domainTopics.values()) {
    for (const topic of topics) approvedTopics.add(topic);
  }
  return Object.freeze({
    display: loadDisplayRegistry(),
    domains: new Set(knowledgeRegistry.DOMAIN_ORDER),
    topics: approvedTopics,
    domainTopics,
  });
}

function auditMetadata(frontmatter, registry, currentType) {
  const issues = [];
  const suggestions = {};
  const domainRaw = frontmatter.knowledge_domain;
  const topicsRaw = frontmatter.knowledge_topics;
  const hasDomain = domainRaw !== undefined && parseScalar(domainRaw) !== "";
  const hasTopics = topicsRaw !== undefined && (Array.isArray(topicsRaw) ? topicsRaw.length > 0 : parseScalar(topicsRaw) !== "");
  const canonical = currentType === "knowledge";
  const legacy = currentType === "permanent_note";

  if (canonical || hasDomain) {
    const domain = normalizeDomain(domainRaw, registry.domains);
    if (canonical && !hasDomain) issues.push({ field: "knowledge_domain", code: "missing" });
    else if (hasDomain && !domain.valid) issues.push({ field: "knowledge_domain", code: "invalid" });
    else if (domain.valid) suggestions.knowledge_domain = domain.value;
  }

  if (canonical || hasTopics) {
    const topics = normalizeTopics(topicsRaw, registry.topics, { allowScalar: legacy });
    if (canonical && !hasTopics) issues.push({ field: "knowledge_topics", code: "missing" });
    else if (hasTopics && !topics.valid) issues.push({ field: "knowledge_topics", code: "invalid" });
    else if (topics.valid && topics.value.length > 0) suggestions.knowledge_topics = topics.value;
  }
  return { issues, suggestion: Object.keys(suggestions).length ? suggestions : null };
}

function auditRecord(record, registry = buildRegistry()) {
  const frontmatter = record.frontmatter || parseFrontmatter(record.content || record.text || "");
  const currentType = String(frontmatter.type || record.type || "").trim();
  const eligibleType = currentType === "knowledge" || currentType === "permanent_note";
  const pathName = record.source_path || record.path || "";
  if (!eligibleType) {
    return {
      path: pathName,
      current_type: currentType || "untyped",
      missing_invalid_metadata: [{ field: "type", code: "unsupported" }],
      suggestion: null,
      manual_review: true,
      skipped: false,
    };
  }
  const { issues, suggestion } = auditMetadata(frontmatter, registry, currentType);
  return {
    path: pathName,
    current_type: currentType,
    missing_invalid_metadata: issues,
    suggestion,
    manual_review: issues.length > 0,
    skipped: false,
  };
}

module.exports = Object.freeze({
  buildRegistry,
  auditRecord,
  normalizeDomain,
  normalizeTopics,
  parseFrontmatter,
  readSchemaRegistry,
});
