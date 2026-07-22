(function (root) {
  "use strict";

  const SKILL_ROOT = "SYSTEM/AI/Skills/prodigy-daily-reflection";
  const RUNTIME_CONTRACT_PATH = `${SKILL_ROOT}/references/runtime-contract.md`;
  const RESPONSE_SCHEMA_PATH = `${SKILL_ROOT}/references/response-schema.json`;

  if (typeof require === "function") {
    if (!root.EvidenceQualityCore) root.EvidenceQualityCore = require("./evidence-quality-core.js");
    if (!root.DailyReflectionProposalContract) root.DailyReflectionProposalContract = require("./daily-reflection-proposal-contract.js");
    if (!root.DailyReflectionObjectLinks) root.DailyReflectionObjectLinks = require("./daily-reflection-object-links.js");
    if (!root.DailyReflectionKnowledgeHandoff) root.DailyReflectionKnowledgeHandoff = require("./daily-reflection-knowledge-handoff.js");
    if (!root.DailyReflectionConservativePolicy) root.DailyReflectionConservativePolicy = require("./daily-reflection-conservative-policy.js");
  }

  function clean(value) { return root.DailyReflectionProposalContract.clean(value); }
  async function loadRuntimeContract(app) {
    const read = async (path) => {
      const file = app && app.vault && app.vault.getAbstractFileByPath(path);
      if (!file) throw new Error(`Reflection runtime file is missing: ${path}`);
      return app.vault.read(file);
    };
    return { contractPath: RUNTIME_CONTRACT_PATH, schemaPath: RESPONSE_SCHEMA_PATH, contract: await read(RUNTIME_CONTRACT_PATH), schema: JSON.parse(await read(RESPONSE_SCHEMA_PATH)) };
  }
  function buildPrompt(options) {
    const existing = (options.existingBlocks || []).map((block) => ({ evidence_id: block.evidence_id, title: block.title }));
    const parts = [options.contract, "", `Daily date: ${options.dateStr}`, `Existing Evidence: ${JSON.stringify(existing)}`, "Raw reflection:", options.freeText];
    if (clean(options.revisionRequest) && options.previousProposal) parts.push("", "Human revision request:", clean(options.revisionRequest), "Previous proposal:", JSON.stringify(root.DailyReflectionProposalContract.providerProposal(options.previousProposal)), "Regenerate the complete response while preserving unaffected content.");
    return parts.join("\n");
  }
  function buildProviderPrompt(prompt, provider) {
    const capabilities = provider && provider.capabilities || {};
    if (capabilities.conservativeProposal !== true) return prompt;
    return [
      prompt,
      "",
      "Final extraction gate (must follow):",
      "- Empty strings and empty arrays are correct when the raw reflection does not support a field.",
      "- Fill change and next_experiment only when the raw reflection explicitly states or clearly chooses them.",
      "- If the raw reflection says no plan was chosen, next_experiment must be an empty string.",
      "- Object linking suggestions require an explicit person name, auction case, or project title from the raw reflection.",
      "- Resource candidates require an explicit place, property, business, book, or tool name from the raw reflection.",
      "- Split the same paragraph into separate Evidence blocks when a future retrieval question, Object link, decision, or reusable context would differ.",
      "- Tentative direction is not a separate event or next experiment; keep it as a related change only when the raw reflection expresses it.",
      "- Keep outcomes attached to the correct subject or asset; never merge my result with another person's or asset's result.",
      "- Evidence titles must be factual, retrieval-sized, and 40 characters or fewer.",
      "- Concrete reusable self-directives may become Knowledge candidates; slogans or encouragement must not.",
      "- Return at most one knowledge candidate for the same Evidence source set; merge synonymous candidates."
    ].join("\n");
  }
  function applyConservativeProposalPolicy(proposal, freeText, app) {
    return root.DailyReflectionConservativePolicy.applyConservativeProposalPolicy(proposal, freeText, app);
  }
  async function generateProposal(options) {
    const runtime = await loadRuntimeContract(options.app);
    const projectService = root.ProjectWorkflowDraftService;
    if (!projectService || typeof projectService.loadProviderConfig !== "function") throw new Error("AI provider configuration service is not loaded.");
    const config = options.config || await projectService.loadProviderConfig(options.app);
    const providerKey = options.providerKey || config.defaultProvider;
    const provider = config.providers && config.providers[providerKey];
    if (!provider) throw new Error(`Unknown AI provider: ${providerKey}`);
    const service = options.providerService || root.AIProviderService;
    if (!service || typeof service.requestStructuredJson !== "function") throw new Error("AI provider service is not loaded.");
    const basePrompt = buildPrompt({ contract: runtime.contract, dateStr: options.dateStr, existingBlocks: options.existingBlocks, freeText: clean(options.freeText), revisionRequest: options.revisionRequest, previousProposal: options.previousProposal });
    const payload = await service.requestStructuredJson({ app: options.app, provider, prompt: buildProviderPrompt(basePrompt, provider), schema: runtime.schema, signal: options.signal });
    const proposal = root.DailyReflectionProposalContract.normalizeProposal(payload, { dateStr: options.dateStr, existingBlocks: options.existingBlocks || [] });
    if (provider.capabilities && provider.capabilities.conservativeProposal === true) applyConservativeProposalPolicy(proposal, options.freeText, options.app);
    await root.DailyReflectionObjectLinks.resolveObjectLinks(options.app, proposal);
    return Object.assign(proposal, { provider: providerKey, model: provider.model || "" });
  }

  const api = { SKILL_ROOT, RUNTIME_CONTRACT_PATH, RESPONSE_SCHEMA_PATH, normalizeProposal: (...args) => root.DailyReflectionProposalContract.normalizeProposal(...args), loadRuntimeContract, buildPrompt, buildProviderPrompt, applyConservativeProposalPolicy, generateProposal, selectEvidenceBlocks: (...args) => root.DailyReflectionProposalContract.selectEvidenceBlocks(...args), prepareKnowledgeCandidateHandoff: (...args) => root.DailyReflectionKnowledgeHandoff.prepareKnowledgeCandidateHandoff(...args), providerProposal: (...args) => root.DailyReflectionProposalContract.providerProposal(...args), resolveObjectLinks: (...args) => root.DailyReflectionObjectLinks.resolveObjectLinks(...args), isVenueEligibleCandidate: (...args) => root.DailyReflectionVenuePolicy.isVenueEligibleCandidate(...args) };
  root.DailyReflectionAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
