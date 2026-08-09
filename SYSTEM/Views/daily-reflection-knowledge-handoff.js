(function (root) {
  "use strict";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function candidateSourceIdMap(value) { return value instanceof Map ? value : new Map(Object.entries(value && typeof value === "object" ? value : {})); }
  function selectedCandidateIndexes(value, length) { return Array.from(new Set(Array.isArray(value) ? value : [])).filter((index) => Number.isInteger(index) && index >= 0 && index < length); }
  function canonicalWikiLinks(value) { return Array.from(new Set((Array.isArray(value) ? value : []).map(clean).filter((link) => /^\[\[[^\[\]|]+\]\]$/.test(link)))); }
  function dailyWikiLink(path) {
    const normalized = clean(path).replace(/\\/g, "/");
    return /^DAILY\/DAILY\/[^/]+\.md$/i.test(normalized) ? `[[${normalized.replace(/\.md$/i, "")}]]` : "";
  }
  function qualityForEvidence(block) {
    const quality = root.EvidenceQualityCore;
    if (!quality || typeof quality.evaluateEvidenceQuality !== "function") throw new Error("Evidence Quality Core를 먼저 불러와야 합니다.");
    return quality.evaluateEvidenceQuality(block);
  }
  function prepareKnowledgeCandidateHandoff(proposal, options) {
    const request = options || {};
    const candidates = proposal && Array.isArray(proposal.knowledge_candidates) ? proposal.knowledge_candidates : [];
    const selectedIndexes = selectedCandidateIndexes(request.selectedCandidateIndexes, candidates.length);
    if (!selectedIndexes.length) return { ready: [], blocked: [], guidance: [] };
    const selectedEvidenceIds = new Set(Array.isArray(request.selectedEvidenceIds) ? request.selectedEvidenceIds.map(clean).filter(Boolean) : []);
    const idMap = candidateSourceIdMap(request.evidenceIdMap);
    const savedById = new Map((Array.isArray(request.savedBlocks) ? request.savedBlocks : []).filter((block) => block && clean(block.evidence_id)).map((block) => [clean(block.evidence_id), block]));
    const thinOverrides = request.thinOverrides && typeof request.thinOverrides === "object" ? request.thinOverrides : {};
    const dailyLink = dailyWikiLink(request.dailyPath);
    const ready = [];
    const blocked = [];
    const guidance = [];
    selectedIndexes.forEach((candidateIndex) => {
      const candidate = candidates[candidateIndex] || {};
      const originalIds = Array.isArray(candidate.source_evidence_ids) ? candidate.source_evidence_ids.map(clean).filter(Boolean) : [];
      const sourceIds = originalIds.map((id) => clean(idMap.get(id) || id));
      const sourceBlocks = sourceIds.map((id) => savedById.get(id)).filter(Boolean);
      if (!originalIds.length || !originalIds.every((id) => selectedEvidenceIds.has(id)) || sourceBlocks.length !== sourceIds.length) {
        blocked.push({ candidate_index: candidateIndex, message: "선택한 후보의 출처 Evidence를 먼저 저장해 주세요." });
        return;
      }
      const qualities = sourceBlocks.map((block) => ({ evidence_id: clean(block.evidence_id), quality: qualityForEvidence(block) }));
      guidance.push(...qualities);
      const invalid = qualities.find((item) => item.quality.status === "invalid");
      if (invalid) {
        blocked.push({ candidate_index: candidateIndex, message: "Evidence 보완 후 후보를 저장해 주세요.", quality: invalid.quality });
        return;
      }
      const thin = qualities.find((item) => item.quality.status === "thin");
      const approvalNote = thin ? clean(thinOverrides[thin.evidence_id]) : "";
      if (thin && !approvalNote) {
        blocked.push({ candidate_index: candidateIndex, message: "Evidence 보완 후 저장하거나, 보완이 어려우면 명시적 override 사유를 입력해 주세요.", quality: thin.quality });
        return;
      }
      const title = clean(candidate.title) || clean(candidate.label);
      const statement = clean(candidate.detail) || clean(candidate.statement) || clean(candidate.label);
      if (!title || !statement) {
        blocked.push({ candidate_index: candidateIndex, message: "표제와 세부내용이 있는 후보만 저장할 수 있습니다." });
        return;
      }
      if (clean(candidate.title) && clean(candidate.detail) && title === statement) {
        blocked.push({ candidate_index: candidateIndex, message: "표제와 세부내용이 같은 후보는 저장할 수 없습니다." });
        return;
      }
      const relatedObjects = Array.from(new Set(sourceBlocks.flatMap((block) => canonicalWikiLinks(block.related_objects))));
      const sourceObjects = relatedObjects.slice();
      if (dailyLink) sourceObjects.push(dailyLink);
      ready.push({ title, statement, reason: clean(candidate.reason) || sourceBlocks.map((block) => clean(block.title)).filter(Boolean).join(" · "), source_type: "daily_evidence", source_evidence_ids: sourceIds, source_objects: Array.from(new Set(sourceObjects)), connections: relatedObjects, confidence: clean(candidate.confidence) || "low", suggested_domain: clean(candidate.suggested_domain), suggested_topics: Array.isArray(candidate.suggested_topics) ? candidate.suggested_topics.map(clean).filter(Boolean) : [], approval_note: approvalNote });
    });
    return { ready, blocked, guidance };
  }

  const api = { prepareKnowledgeCandidateHandoff };
  root.DailyReflectionKnowledgeHandoff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
