(function (root) {
  "use strict";

  if (typeof require === "function") {
    if (!root.RegionExperienceContract) root.RegionExperienceContract = require("./region-experience-contract.js");
    if (!root.JournalStore) root.JournalStore = require("./journal-store.js");
    if (!root.RegionExperienceStore) root.RegionExperienceStore = require("./region-experience-store.js");
    if (!root.DailyReflectionKnowledgeHandoff) root.DailyReflectionKnowledgeHandoff = require("./daily-reflection-knowledge-handoff.js");
    if (!root.KnowledgeCandidateStore) root.KnowledgeCandidateStore = require("./knowledge-candidate-store.js");
  }

  const MANUAL_KIND = "manual_evidence_only";
  const PLANNED_EVIDENCE_ID = "region-experience-0";
  const DAILY_PATH = /^DAILY\/DAILY\/(\d{4}-\d{2}-\d{2})\.md$/;
  const EVIDENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.keys(value).forEach((key) => freeze(value[key])); return Object.freeze(value); }
  function clean(value) { return typeof value === "string" ? value.trim() : ""; }
  function required(value, message) { const text = clean(value); if (!text) throw new Error(message); return text; }
  function failure(phase, error, savedState) { return { ok: false, status: "retryable", phase, message: error && error.message ? error.message : "저장 중 오류가 발생했습니다. 다시 시도해 주세요.", savedState: savedState || null }; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function services(options) {
    const source = options || {};
    const resolved = {
      contract: source.contract || root.RegionExperienceContract,
      journalStore: source.journalStore || root.JournalStore,
      regionStore: source.regionStore || root.RegionExperienceStore,
      knowledgeHandoff: source.knowledgeHandoff || root.DailyReflectionKnowledgeHandoff,
      candidateStore: source.candidateStore || root.KnowledgeCandidateStore
    };
    if (!resolved.contract || typeof resolved.contract.normalizeInput !== "function" || typeof resolved.contract.normalizeProposal !== "function") throw new Error("지역 경험 계약을 불러오지 못했습니다.");
    if (!resolved.journalStore || typeof resolved.journalStore.mergeProposedEvidenceAtCommit !== "function") throw new Error("Daily Evidence 저장 기능을 불러오지 못했습니다.");
    if (!resolved.regionStore || typeof resolved.regionStore.appendApprovedExperience !== "function") throw new Error("Region 경험 저장 기능을 불러오지 못했습니다.");
    if (!resolved.knowledgeHandoff || typeof resolved.knowledgeHandoff.prepareKnowledgeCandidateHandoff !== "function") throw new Error("Knowledge 후보 handoff를 불러오지 못했습니다.");
    if (!resolved.candidateStore || typeof resolved.candidateStore.saveCandidate !== "function") throw new Error("Knowledge 후보 저장 기능을 불러오지 못했습니다.");
    return resolved;
  }

  function manualBlock(input, evidence, contract) {
    const source = plain(evidence) ? evidence : {};
    const title = contract.safeProse(source.title || input.direct_observation.slice(0, 80), "manual evidence.title", true).slice(0, 80);
    return {
      evidence_id: PLANNED_EVIDENCE_ID, title, context: "auction", related_objects: input.related_object_links.slice(), experience: input.direct_observation,
      interpretation: contract.safeProse(source.interpretation, "manual evidence.interpretation", false),
      change: contract.safeProse(source.change, "manual evidence.change", false), next_experiment: contract.safeProse(source.next_experiment, "manual evidence.next_experiment", false),
      epistemic_status: input.epistemic_status, review_status: input.epistemic_status === "user_inference" ? "pending" : "ready",
      inference_notice: input.epistemic_status === "user_inference" ? "사용자 해석 · 확인 필요" : ""
    };
  }

  function createManualEvidenceProposal(input, evidence, contractOverride) {
    const contract = contractOverride || root.RegionExperienceContract;
    if (!contract || typeof contract.normalizeInput !== "function" || typeof contract.safeProse !== "function") throw new Error("지역 경험 계약을 불러오지 못했습니다.");
    const normalizedInput = contract.normalizeInput(input);
    return freeze({ kind: MANUAL_KIND, input: normalizedInput, evidence_blocks: [manualBlock(normalizedInput, evidence, contract)], region_candidates: [], knowledge_candidates: [] });
  }

  function providerShape(proposal, input) {
    const blocks = proposal && proposal.evidence_blocks;
    if (!Array.isArray(blocks) || blocks.length !== 1 || !plain(blocks[0]) || clean(blocks[0].experience) !== input.direct_observation) throw new Error("저장하려는 Evidence가 현재 입력과 일치하지 않습니다. 다시 확인해 주세요.");
    const indexFor = (ids, label) => {
      if (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== blocks[0].evidence_id) throw new Error(`${label}의 출처 Evidence가 변경되었습니다. 다시 확인해 주세요.`);
      return [0];
    };
    return {
      evidence: { title: blocks[0].title, interpretation: blocks[0].interpretation, change: blocks[0].change, next_experiment: blocks[0].next_experiment },
      region_candidates: (proposal.region_candidates || []).map((candidate, index) => ({ category: candidate.category, text: candidate.text, source_evidence_indexes: indexFor(candidate.source_evidence_ids, `지역 후보 ${index + 1}`) })),
      knowledge_candidates: (proposal.knowledge_candidates || []).map((candidate, index) => ({ title: candidate.title, statement: candidate.statement, reason: candidate.reason, confidence: candidate.confidence, source_evidence_indexes: indexFor(candidate.source_evidence_ids, `지식 후보 ${index + 1}`) }))
    };
  }

  function normalizedProposal(request, contract) {
    if (!plain(request) || !plain(request.proposal)) throw new Error("저장할 Evidence 제안이 없습니다.");
    const supplied = request.input || request.proposal.input;
    const input = contract.normalizeInput(supplied);
    if (request.proposal.input && !same(contract.normalizeInput(request.proposal.input), input)) throw new Error("제안이 현재 입력과 달라졌습니다. 다시 저장해 주세요.");
    if (request.proposal.kind === MANUAL_KIND) {
      const block = request.proposal.evidence_blocks && request.proposal.evidence_blocks[0];
      if (!block || clean(block.experience) !== input.direct_observation) throw new Error("수동 Evidence가 현재 입력과 일치하지 않습니다.");
      return freeze({ kind: MANUAL_KIND, input, evidence_blocks: [manualBlock(input, block, contract)], region_candidates: [], knowledge_candidates: [] });
    }
    return contract.normalizeProposal(request.proposal.evidence_blocks ? providerShape(request.proposal, input) : request.proposal, input);
  }

  function selectedEvidence(proposal, selectedIds) {
    if (!Array.isArray(selectedIds) || !selectedIds.length || new Set(selectedIds).size !== selectedIds.length) throw new Error("중복 없이 저장할 Evidence를 선택해 주세요.");
    const byId = new Map(proposal.evidence_blocks.map((block) => [block.evidence_id, block]));
    const blocks = selectedIds.map((id) => byId.get(id));
    if (blocks.some((block) => !block)) throw new Error("선택한 Evidence가 현재 제안에 없습니다. 다시 확인해 주세요.");
    return blocks.map((block) => Object.assign({}, block, { related_objects: Array.from(new Set([...(block.related_objects || []), proposal.input.region.wiki_link])) }));
  }

  function savedState(proposal, selectedIds, saveResult) {
    const match = DAILY_PATH.exec(clean(saveResult && saveResult.path));
    if (!match || match[1] !== proposal.input.experience_date || !plain(saveResult.evidenceIdMap) || !Array.isArray(saveResult.blocks)) throw new Error("Daily Evidence 저장 결과가 안전하지 않습니다. 다시 시도해 주세요.");
    const committed = selectedIds.map((plannedId) => required(saveResult.evidenceIdMap[plannedId], "Daily Evidence ID 재매핑을 확인하지 못했습니다."));
    if (new Set(committed).size !== committed.length || committed.some((id) => !EVIDENCE_ID.test(id))) throw new Error("Daily Evidence ID 상태가 안전하지 않습니다. 다시 시도해 주세요.");
    const blocks = clone(saveResult.blocks);
    if (!committed.every((id) => blocks.some((block) => block && block.evidence_id === id))) throw new Error("저장된 Evidence를 확인하지 못했습니다. 다시 시도해 주세요.");
    return freeze({ version: 1, proposal: clone(proposal), plannedEvidenceIds: selectedIds.slice(), committedEvidenceIds: committed, evidenceIdMap: clone(saveResult.evidenceIdMap), savedBlocks: blocks, dailyPath: saveResult.path, provenanceKey: `${saveResult.path}#${committed.join(",")}`, regionApproval: null, savedKnowledgeCandidateIndexes: [] });
  }

  function validateState(value, contract) {
    if (!plain(value) || value.version !== 1 || !Array.isArray(value.plannedEvidenceIds) || !Array.isArray(value.committedEvidenceIds) || value.plannedEvidenceIds.length !== value.committedEvidenceIds.length) throw new Error("저장된 handoff 상태가 안전하지 않습니다. Evidence를 다시 저장해 주세요.");
    const proposal = normalizedProposal({ proposal: value.proposal }, contract);
    const match = DAILY_PATH.exec(clean(value.dailyPath));
    if (!match || match[1] !== proposal.input.experience_date || !plain(value.evidenceIdMap) || !Array.isArray(value.savedBlocks)) throw new Error("저장된 Daily provenance를 확인하지 못했습니다. Evidence를 다시 저장해 주세요.");
    value.plannedEvidenceIds.forEach((plannedId, index) => {
      const committedId = value.committedEvidenceIds[index];
      if (!EVIDENCE_ID.test(clean(committedId)) || value.evidenceIdMap[plannedId] !== committedId || !value.savedBlocks.some((block) => block && block.evidence_id === committedId)) throw new Error("저장된 Evidence가 변경되었거나 없습니다. Evidence를 다시 저장해 주세요.");
    });
    return { proposal, state: value };
  }

  function committedCandidate(candidate, state) {
    const source = candidate && candidate.source_evidence_ids;
    if (!Array.isArray(source) || source.length !== 1 || !state.plannedEvidenceIds.includes(source[0])) throw new Error("선택한 후보의 출처 Evidence가 저장된 선택과 다릅니다.");
    const evidenceId = state.evidenceIdMap[source[0]];
    if (!state.committedEvidenceIds.includes(evidenceId)) throw new Error("선택한 후보의 저장된 Evidence를 확인하지 못했습니다.");
    return Object.assign({}, candidate, { source_evidence_ids: [evidenceId] });
  }

  function nextState(state, changes) { return freeze(Object.assign({}, clone(state), changes)); }

  function createHandoff(options) {
    const seams = services(options);
    async function saveEvidence(app, request) {
      try {
        const proposal = normalizedProposal(request, seams.contract);
        const selectedIds = request.selectedEvidenceIds;
        const blocks = selectedEvidence(proposal, selectedIds);
        const result = await seams.journalStore.mergeProposedEvidenceAtCommit(app, proposal.input.experience_date, blocks);
        return { ok: true, status: "saved", saveResult: result, savedState: savedState(proposal, selectedIds, result) };
      } catch (error) {
        return failure("evidence", new Error(`Daily Evidence 저장에 실패했습니다. ${error.message}`));
      }
    }
    async function approveRegion(app, request) {
      const previous = request && request.savedState;
      try {
        if (!request || request.humanConfirmed !== true || !Number.isInteger(request.selectedCandidateIndex)) throw new Error("Region 반영은 후보 하나를 명시적으로 승인해야 합니다.");
        const checked = validateState(previous, seams.contract);
        const candidate = checked.proposal.region_candidates[request.selectedCandidateIndex];
        if (!candidate) throw new Error("선택한 Region 후보가 없습니다. 다시 확인해 주세요.");
        if (checked.state.regionApproval !== null) {
          if (checked.state.regionApproval !== request.selectedCandidateIndex) throw new Error("이미 다른 Region 후보가 승인되었습니다. 저장된 Evidence로 새 제안을 시작해 주세요.");
          return { ok: true, status: "unchanged", savedState: checked.state };
        }
        const result = await seams.regionStore.appendApprovedExperience(app, { human_confirmed: true, region: checked.proposal.input.region, candidate: committedCandidate(candidate, checked.state), committed_daily_path: checked.state.dailyPath, committed_evidence_id: checked.state.committedEvidenceIds[0] });
        return { ok: true, status: result.status || "appended", regionResult: result, savedState: nextState(checked.state, { regionApproval: request.selectedCandidateIndex }) };
      } catch (error) {
        return failure("region", error, previous || null);
      }
    }
    async function saveKnowledgeCandidates(app, request) {
      const previous = request && request.savedState;
      try {
        const indexes = request && request.selectedCandidateIndexes;
        if (!Array.isArray(indexes) || !indexes.length || new Set(indexes).size !== indexes.length || indexes.some((index) => !Number.isInteger(index))) throw new Error("중복 없이 저장할 Knowledge 후보를 선택해 주세요.");
        const checked = validateState(previous, seams.contract);
        const fresh = indexes.filter((index) => !checked.state.savedKnowledgeCandidateIndexes.includes(index));
        if (!fresh.length) return { ok: true, status: "unchanged", saved: [], blocked: [], guidance: [], savedState: checked.state };
        fresh.forEach((index) => committedCandidate(checked.proposal.knowledge_candidates[index], checked.state));
        const prepared = seams.knowledgeHandoff.prepareKnowledgeCandidateHandoff(checked.proposal, { selectedCandidateIndexes: fresh, selectedEvidenceIds: checked.state.plannedEvidenceIds.slice(), savedBlocks: clone(checked.state.savedBlocks), evidenceIdMap: clone(checked.state.evidenceIdMap), dailyPath: checked.state.dailyPath, thinOverrides: request.thinOverrides });
        if (!prepared || !Array.isArray(prepared.ready) || !Array.isArray(prepared.blocked) || prepared.ready.length + prepared.blocked.length !== fresh.length) throw new Error("Knowledge 후보 준비 결과가 안전하지 않습니다. 다시 시도해 주세요.");
        if (prepared.blocked && prepared.blocked.length) return { ok: false, status: "blocked", phase: "knowledge", message: prepared.blocked[0].message || "Knowledge 후보의 출처 Evidence를 다시 확인해 주세요.", saved: [], blocked: prepared.blocked, guidance: prepared.guidance || [], savedState: checked.state };
        const saved = [];
        let retryState = checked.state;
        for (let index = 0; index < prepared.ready.length; index += 1) {
          try {
            saved.push(await seams.candidateStore.saveCandidate(app, prepared.ready[index]));
            retryState = nextState(retryState, { savedKnowledgeCandidateIndexes: retryState.savedKnowledgeCandidateIndexes.concat(fresh[index]) });
          } catch (error) {
            return Object.assign(failure("knowledge", error, retryState), { saved, blocked: [], guidance: prepared.guidance || [] });
          }
        }
        return { ok: true, status: saved.length ? "saved" : "unchanged", saved, blocked: [], guidance: prepared.guidance || [], savedState: retryState };
      } catch (error) {
        return failure("knowledge", error, previous || null);
      }
    }
    return Object.freeze({ contract: seams.contract, saveEvidence, approveRegion, saveKnowledgeCandidates });
  }

  const api = Object.freeze({ createHandoff, createManualEvidenceProposal });
  root.RegionExperienceHandoff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
