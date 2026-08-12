(function (root) {
  "use strict";

  function path(value) {
    return String(value == null ? "" : value)
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .trim()
      .replace(/\\/g, "/");
  }

  function values(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry == null ? "" : entry).trim()).filter(Boolean);
    }
    if (value == null || value === "") return [];
    return [String(value).trim()].filter(Boolean);
  }

  function row(item, source) {
    const raw = Object.assign({}, source || {}, item || {});
    const itemPath = path(raw.path || raw.candidate_path || raw.approved_path || raw.source_path);
    if (!itemPath) return null;
    const bucket = String(raw.context_kind || raw.bucket || raw.type || "").trim().toLowerCase();
    const candidatePath = path(raw.candidate_path || (bucket === "knowledge_candidate" || /knowledge[\\/]candidates/i.test(itemPath) ? itemPath : ""));
    const approvedPath = path(raw.approved_path || (bucket === "knowledge" || bucket === "permanent_note" || /zeta[\\/]permanent/i.test(itemPath) ? itemPath : ""));
    const status = String(raw.status || raw.knowledge_status || raw.candidate_status || "").trim();
    const qualitySource = raw.evidence_quality && typeof raw.evidence_quality === "object" ? raw.evidence_quality : null;
    const quality = String(raw.quality || (qualitySource && (qualitySource.status || qualitySource.label)) || "").trim();
    const sourceRefs = values(raw.source_objects || raw.source_refs || raw.source_paths || raw.source_evidence_ids);
    const kind = candidatePath ? "candidate" : approvedPath ? "approved" : "source";
    const candidateId = String(raw.candidate_id || raw.knowledge_candidate_id || "").trim();
    return Object.assign({}, raw, {
      path: itemPath,
      title: String(raw.title || itemPath.split("/").pop().replace(/\.md$/i, "") || "연결 기록").trim(),
      context_kind: kind,
      source_path: path(raw.source_path || (kind === "source" ? itemPath : "")),
      candidate_path: candidatePath,
      approved_path: approvedPath,
      status,
      quality,
      source_refs: sourceRefs,
      candidate_id: candidateId,
      review_target: kind === "candidate" ? candidatePath : kind === "approved" ? approvedPath : itemPath
    });
  }

  function label(item) {
    const labels = { source: "출처", candidate: "검증 대기", approved: "승인 지식" };
    const kind = labels[item && item.context_kind] || "기록";
    const meta = [kind, item && item.status, item && item.quality].filter(Boolean);
    return `${item && item.title ? item.title : "연결 기록"} · ${meta.join(" · ")}`;
  }

  function applyMetadata(element, item) {
    if (!element || !item) return;
    const attrs = {
      "data-context-kind": item.context_kind || "source",
      "data-source-path": item.source_path || "",
      "data-candidate-path": item.candidate_path || "",
      "data-approved-path": item.approved_path || "",
      "data-status": item.status || "",
      "data-quality": item.quality || "",
      "data-candidate-id": item.candidate_id || "",
      "data-review-target": item.review_target || item.path || ""
    };
    Object.keys(attrs).forEach((key) => {
      if (typeof element.setAttribute === "function" && attrs[key]) element.setAttribute(key, attrs[key]);
    });
  }

  function card(person, state, core) {
    const contextState = state || {};
    const eventLines = (person.interaction_preview && person.interaction_preview.length)
      ? person.interaction_preview
      : (person.interaction_lines || []).slice(0, 2);
    const memoLines = (person.memo_preview && person.memo_preview.length)
      ? person.memo_preview
      : (person.memo_lines || []).slice(0, 3);
    const allLinkedRaw = person.linked_all || person.recent_context || [];
    const typeFilter = contextState.contextType && contextState.contextType[person.path] || "all";
    const allLinked = core && typeof core.filterContextItems === "function"
      ? core.filterContextItems(allLinkedRaw, typeFilter)
      : allLinkedRaw;
    const preview = allLinked.slice(0, 3);
    const rest = allLinked.slice(3);
    const subBits = [];
    if (person.last_contact) subBits.push(`최근 연락 ${person.last_contact}`);
    subBits.push(person.linked_count ? `연결된 기록 ${person.linked_count}개` : "연결된 기록 없음");
    return Object.freeze({
      eventLines,
      memoLines,
      allLinkedRaw,
      allLinked,
      preview,
      rest,
      typeFilter,
      expanded: !!(contextState.expanded && contextState.expanded[person.path]),
      subText: subBits.join(" · ")
    });
  }

  const api = Object.freeze({ path, values, row, label, applyMetadata, card });
  root.PeopleContextRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
