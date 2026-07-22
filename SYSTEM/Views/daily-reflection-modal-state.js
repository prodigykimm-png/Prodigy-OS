(function (root) {
  "use strict";
  function reset(modal) {
    modal.selectedIds = new Set(modal.proposal.evidence_blocks.map((block) => block.evidence_id));
    root.DailyReflectionCandidateHandoffView.resetState(modal.candidateHandoff);
    modal.savedEvidence = null;
    modal.selectedObjectPaths = new Set(modal.proposal.object_linking_suggestions.filter((item) => item.existence === "existing" && item.resolved_path).map((item) => item.resolved_path));
    modal.selectedVenueCandidates.clear();
    modal.selectedPlaceCandidates.clear();
  }
  function merge(modal, index) {
    const first = modal.proposal.evidence_blocks[index];
    const second = modal.proposal.evidence_blocks[index + 1];
    if (!first || !second) return false;
    ["experience", "interpretation", "change", "next_experiment"].forEach((key) => {
      first[key] = Array.from(new Set([first[key], second[key]].map((value) => String(value || "").trim()).filter(Boolean))).join("\n");
    });
    if (first.context !== second.context) first.context = "";
    [modal.proposal.knowledge_candidates, modal.proposal.resource_candidates, modal.proposal.object_linking_suggestions, modal.proposal.pre_routing_suggestions].forEach((items) => items.forEach((item) => {
      item.source_evidence_ids = Array.from(new Set((item.source_evidence_ids || []).map((id) => id === second.evidence_id ? first.evidence_id : id)));
    }));
    modal.selectedIds.delete(second.evidence_id);
    modal.proposal.evidence_blocks.splice(index + 1, 1);
    return true;
  }
  function split(modal, index, dateStr) {
    const source = modal.proposal.evidence_blocks[index];
    if (!source) return false;
    const max = modal.proposal.evidence_blocks.reduce((value, block) => Math.max(value, Number((String(block.evidence_id || "").match(/-e(\d+)$/) || [0, 0])[1])), 0);
    const block = { evidence_id: `daily-${dateStr}-e${String(max + 1).padStart(2, "0")}`, title: "", context: source.context, related_objects: [], experience: "", interpretation: "", change: "", next_experiment: "" };
    modal.proposal.evidence_blocks.splice(index + 1, 0, block);
    modal.selectedIds.add(block.evidence_id);
    return true;
  }
  root.DailyReflectionModalState = Object.freeze({ reset, merge, split });
})(typeof globalThis !== "undefined" ? globalThis : this);
