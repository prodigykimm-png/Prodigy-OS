"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CONTRACT = Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, "runtime-contract.json"), "utf8")));
const MUTATION_PATTERN = /\b(write|append|create|update|approve|commit|stage|push|git|provider|omniroute|people|venue|candidate|knowledge|markdown)\b/i;

function evaluateInteraction(input) {
  assertRecord(input, "input");
  const operation = parseChoice(input.operation, ["query/read", "propose", "approve"], "operation");
  const providerMode = parseChoice(input.provider_mode, CONTRACT.provider_modes, "provider mode");
  const runId = parseId(input.run_id, "run_id");
  const sources = parseSources(input.sources);
  const refusals = refusalCodes(input, sources);
  const proposal = buildProposal({ operation, runId, sources, refusals });

  return deepFreeze({
    skill_path: "SYSTEM/AI/Skills/llmwiki-librarian/SKILL.md",
    operation,
    provider: {
      mode: providerMode,
      allowed_modes: CONTRACT.provider_modes.slice(),
      omniroute_scope: CONTRACT.omniroute_scope,
      fallback: "none"
    },
    proposals: [proposal],
    graph: graphFor(proposal),
    lint: lintFor(proposal),
    contradictions: contradictionsFor(sources),
    approval: {
      required: true,
      approver: "human",
      model_output_can_approve: false,
      canonical_promotion: CONTRACT.canonical_promotion
    },
    persistence: {
      canonical_write_allowed: false,
      persistent_write_allowed: false,
      writes_performed: [],
      draft_preservation: CONTRACT.draft_preservation
    },
    refusals,
    source_text_authority: CONTRACT.source_text_authority
  });
}

function parseSources(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("sources must be a non-empty array");
  }
  return value.map((source) => {
    assertRecord(source, "source");
    return Object.freeze({
      source_id: parseId(source.source_id, "source_id"),
      locator: parseLocator(source.locator),
      confidence: parseChoice(source.confidence, CONTRACT.confidence_labels, "confidence"),
      text: String(source.text || "")
    });
  });
}

function buildProposal(context) {
  const citations = context.sources.map((source) => ({
    source_id: source.source_id,
    locator: source.locator,
    confidence: source.confidence
  }));
  const payload = {
    operation: context.operation,
    citations,
    summary: "run-scoped knowledge proposal"
  };

  return {
    run_id: context.runId,
    proposal_id: stableId("proposal", JSON.stringify(payload)),
    kind: "create",
    status: "proposed",
    confidence: citations[0].confidence,
    payload_hash: sha256(JSON.stringify(payload)),
    citations,
    locators: citations.map((citation) => citation.locator),
    entity_links: [],
    theme_links: [],
    material_links: citations.map((citation) => citation.source_id),
    graph: { nodes: [], edges: [] },
    lint: { findings: [] },
    contradictions: [],
    approval_required: true,
    refusals: context.refusals.slice()
  };
}

function graphFor(proposal) {
  return {
    nodes: [
      { id: proposal.proposal_id, type: "proposal", confidence: proposal.confidence },
      ...proposal.material_links.map((id) => ({ id, type: "material", confidence: "explicit" }))
    ],
    edges: proposal.material_links.map((id) => ({ from: proposal.proposal_id, to: id, relation: "cites" }))
  };
}

function lintFor(proposal) {
  return {
    status: "pass",
    findings: proposal.refusals.map((code) => ({ code, severity: "blocked" }))
  };
}

function contradictionsFor(sources) {
  const contradictory = sources.filter((source) => /\b(contradict|dispute|conflict)\b/i.test(source.text));
  return contradictory.map((source) => ({
    source_id: source.source_id,
    locator: source.locator,
    status: "reported",
    resolution: "human_review_required"
  }));
}

function refusalCodes(input, sources) {
  const text = `${String(input.conversation || "")}\n${sources.map((source) => source.text).join("\n")}`;
  const refusals = [];
  if (/markdown|knowledge/i.test(text) && /write|append|create|update/i.test(text)) refusals.push("canonical_markdown_write");
  if (MUTATION_PATTERN.test(text)) refusals.push("source_text_authority");
  if (/provider|omniroute/i.test(text) && /switch|hop|fallback|global/i.test(text)) refusals.push("provider_hop");
  if (/approve/i.test(text)) refusals.push("model_output_approval");
  if (/git|commit|stage|push/i.test(text)) refusals.push("git_write");
  return [...new Set(refusals)];
}

function parseChoice(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`unknown ${label}: ${String(value)}`);
  }
  return value;
}

function parseId(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{2,127}$/.test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function parseLocator(value) {
  if (typeof value !== "string" || value.length === 0) throw new Error("missing locator");
  if (path.isAbsolute(value) || value.includes("..") || /[\0\r\n\\]/.test(value) || !/[#:][^#:]+$/.test(value)) {
    throw new Error(`unsafe locator: ${value}`);
  }
  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, value) {
  return `${prefix}_${sha256(value).slice(0, 24)}`;
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

module.exports = Object.freeze({ CONTRACT, evaluateInteraction });
