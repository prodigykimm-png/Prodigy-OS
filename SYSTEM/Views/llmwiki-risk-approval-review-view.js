(function (root) {
  "use strict";

  const KIND_LABELS = Object.freeze({ create: "새 지식 만들기", update: "기존 지식 고치기", merge: "여러 지식 합치기", noop: "변경 없음" });
  const TIER_LABELS = Object.freeze({ low: "낮음", medium: "보통", high: "높음" });
  const REASON_LABELS = Object.freeze({ operation_create: "새 문서를 만듭니다", operation_update: "기존 문서를 바꿉니다", operation_merge: "여러 문서를 합칩니다", operation_noop: "내용이 그대로입니다", derived_low_risk: "되돌리기 쉬운 변경", derived_medium_risk: "기존 지식 변경", derived_high_risk: "여러 지식에 영향", new_canonical_document: "새 지식 파일", existing_canonical_revision_change: "기존 내용 수정", multi_document_supersession: "여러 문서 관계 변경", exact_bytes_unchanged: "정확히 같은 내용", metadata_only_connection: "연결 정보만 변경", relation_side_effects: "문서 관계도 함께 변경", contradiction_resolution: "서로 다른 근거 조정", conflict_review_required: "충돌 검토 필요" });

  function createEl(parent, tag, options = {}) {
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const element = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) element.textContent = String(options.text);
    for (const [name, value] of Object.entries(options.attr || {})) element.setAttribute(name, value);
    element.disabled = Boolean(options.disabled);
    parent.appendChild(element);
    return element;
  }
  function empty(element) { if (typeof element.empty === "function") element.empty(); else while (element.firstChild) element.removeChild(element.firstChild); }
  let disabledReasonSequence = 0;
  function button(parent, label, action, onClick, options = {}) {
    const disabledReason = options.disabled ? String(options.disabledReason || "이 작업은 현재 사용할 수 없습니다.") : "";
    const reasonId = disabledReason ? `llmwiki-disabled-reason-${action}-${++disabledReasonSequence}` : "";
    const control = createEl(parent, "button", { text: label, attr: { type: "button", "data-action": action, "data-emitted-action": options.emittedAction || action, "data-primary": options.primary ? "true" : "false", ...(reasonId ? { "aria-describedby": reasonId } : {}) }, disabled: options.disabled });
    control.disabled = Boolean(options.disabled);
    if (!options.disabled) control.onclick = (event) => { event?.preventDefault?.(); onClick(); };
    if (reasonId) createEl(parent, "span", { text: disabledReason, attr: { id: reasonId, class: "llmwiki-approval-review__disabled-reason llmwiki-cjk-prose", "data-disabled-reason-for": action } });
    return control;
  }
  function field(parent, label, value, attr = {}) { createEl(parent, "dt", { text: label }); createEl(parent, "dd", { text: value, attr }); }
  function prettyField(parent, label, value, attr = {}) {
    createEl(parent, "dt", { text: label });
    const body = createEl(parent, "dd", { attr });
    const words = String(value || "").trim().split(/\s+/u).filter(Boolean);
    const splitAt = Math.max(0, words.length - 3);
    if (splitAt > 0) createEl(body, "span", { text: `${words.slice(0, splitAt).join(" ")} ` });
    createEl(body, "span", {
      text: words.slice(splitAt).join(" "),
      attr: {
        class: "llmwiki-approval-review__atomic-tail",
        "data-approval-pretty-tail": "true",
      },
    });
  }
  function readableDocument(value) {
    if (value === null) return "새 지식이라 이전 내용이 없습니다.";
    const bytes = typeof value === "string" ? value : "";
    if (!bytes.startsWith("---\n")) return bytes;
    const boundary = bytes.indexOf("\n---\n", 4);
    return boundary < 0 ? "내용을 읽을 수 없습니다." : bytes.slice(boundary + 5).trim();
  }
  function visibleDestination(value) {
    const path = typeof value === "string" ? value : "";
    const name = path.split("/").pop() || "지식 문서";
    return name.replace(/\.md$/u, "");
  }
  function sorted(values) { return [...new Set(values)].sort(); }
  function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

  function buildRiskApprovalReviewModel(packet, packetApi) {
    const verified = packetApi.verifyRiskApprovalPacket(packet);
    if (!verified.ok) throw new TypeError(verified.reason);
    return Object.freeze({
      packet,
      operation: KIND_LABELS[packet.operation.kind],
      summary: packet.summary,
      provenance: packet.source_lineage.map((item) => item.locators.map((locator) => String(locator).split("#")[0].split("/").pop()).filter(Boolean).join(" · ") || "선택한 자료"),
      sourceRows: packet.source_lineage.flatMap((item) => item.locators.map((locator) => ({ source_id: item.source_id, content_hash: item.content_hash, locator: String(locator), source_path: String(locator).split("#")[0], evidence_quote: item.evidence_quote || "" }))),
      before_after: packet.before_after.map((item) => ({ destination: visibleDestination(item.destination_id), before: readableDocument(item.before), after: readableDocument(item.after) })),
      riskItems: [TIER_LABELS[packet.risk.tier], ...packet.risk.reasons.map((reason) => REASON_LABELS[reason] || reason)],
      conflict: packet.conflict.state === "clear" ? "없음" : packet.conflict.state === "resolved" ? "해결됨" : `검토 필요 · ${packet.conflict.blocking_conflict_ids.length}건`,
      selectable: packet.batch_eligible === true,
      approvable: packet.approval_eligible === true,
    });
  }

  function mountRiskApprovalReview(options = {}) {
    const container = options.container;
    const packetApi = options.packetApi || root.LLMWikiRiskApprovalPacket;
    const batchApi = options.batchApi || root.LLMWikiSafeBatchApproval;
    if (!container || !packetApi || !batchApi || !Array.isArray(options.packets) || options.packets.length === 0) throw new TypeError("risk_approval_review_dependencies_required");
    const model = Object.freeze(options.packets.map((packet) => buildRiskApprovalReviewModel(packet, packetApi)));
    const allowedInitial = new Set(model.filter((item) => item.selectable).map((item) => item.packet.packet_id));
    const initialSelected = Array.isArray(options.initialSelectedIds) ? options.initialSelectedIds.filter((id) => allowedInitial.has(id)) : [];
    const state = { selected: new Set(initialSelected), activeIndex: 0, lastResult: null, sourcePreview: null };
    const onOpenBeside = typeof options.onOpenBeside === "function" ? options.onOpenBeside : () => {};
    const onEditSource = typeof options.onEditSource === "function" ? options.onEditSource : () => {};
    const resolveSourcePreview = typeof options.resolveSourcePreview === "function" ? options.resolveSourcePreview : (row) => ({ ok: true, status: "unknown", match_status: "unavailable", source_path: row.source_path, evidence_quote: "", context: "", locator: row.locator });
    function publishSelection() { if (typeof options.onSelectionChange === "function") options.onSelectionChange(sorted([...state.selected])); }
    function active() { return model[state.activeIndex] || model[0]; }
    function invoke(name, value) { state.lastResult = typeof options[name] === "function" ? options[name](value) : { ok: true, status: name }; return state.lastResult; }
    function requestRevision(guidance) {
      const value = typeof guidance === "string" ? guidance.trim() : "";
      if (!value) return { ok: false, status: "rejected", reason: "natural_language_guidance_required" };
      return invoke("onRequestRevision", { packet: active().packet, guidance: value });
    }
    function approveBatch() {
      const packets = model.filter((item) => state.selected.has(item.packet.packet_id)).map((item) => item.packet).sort((a, b) => compare(a.packet_id, b.packet_id));
      const authorization = batchApi.authorizeExactBatch(packets, packets.map((packet) => packet.packet_id));
      state.lastResult = authorization.ok && typeof options.onBatchApprove === "function" ? options.onBatchApprove({ packets, authorization: authorization.value }) : authorization;
      return state.lastResult;
    }
    function openSourcePreview(row) {
      const fallback = { ok: true, status: "unknown", match_status: "unavailable", source_path: row.source_path, evidence_quote: "", context: "", locator: row.locator };
      state.sourcePreview = fallback;
      render();
      try {
        const resolved = resolveSourcePreview(row);
        if (resolved && typeof resolved.then === "function") resolved.then((value) => { state.sourcePreview = value && value.ok ? value : fallback; render(); }).catch(() => { state.sourcePreview = fallback; render(); });
        else if (resolved && resolved.ok) { state.sourcePreview = resolved; render(); }
      } catch (_error) { state.sourcePreview = fallback; render(); }
    }
    function render() {
      empty(container);
      if (typeof options.ensureStyle === "function") options.ensureStyle(container);
      const frame = createEl(container, "section", { attr: { class: "llmwiki-approval-review prodigy-full-bleed", "data-surface": "llmwiki-risk-approval-review", "aria-label": "지식 변경 검토" } });
      const heading = createEl(frame, "header");
      createEl(heading, "h2", { text: "지식 변경 검토" });
      createEl(heading, "p", { text: "바뀌는 내용과 출처, 위험을 읽고 결정하세요. 승인 전에는 저장되지 않습니다.", attr: { class: "llmwiki-approval-review__muted llmwiki-cjk-prose", "data-typography-role": "intro" } });
      const actions = createEl(heading, "div", { attr: { class: "llmwiki-approval-review__actions llmwiki-approval-review__decision-strip", role: "toolbar", "aria-label": "검토 결정" } });
      button(actions, "승인", "approve", () => invoke("onApprove", active().packet), { primary: options.primaryEnabled !== false && active().approvable, disabled: !active().approvable, disabledReason: "이 제안은 현재 승인할 수 없습니다.", emittedAction: "approve_risk" });
      button(actions, "거절", "reject", () => invoke("onReject", active().packet), { emittedAction: "reject_risk" });
      button(actions, "수정 요청", "request-revision", () => invoke("onRequestRevisionPrompt", { packet: active().packet, submit: requestRevision }), { primary: options.primaryEnabled !== false && !active().approvable, emittedAction: "request_risk_revision" });
      button(actions, "안전한 묶음 승인", "approve-batch", approveBatch, { disabled: state.selected.size === 0, disabledReason: "승인할 묶음을 선택하세요." });
      if (state.sourcePreview) {
        const preview = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__source-preview prodigy-utility-card", role: "dialog", "aria-label": "출처 근거" } });
        createEl(preview, "h3", { text: "출처 근거" });
        createEl(preview, "p", { text: state.sourcePreview.source_path || "원문 경로 없음" });
        const freshness = state.sourcePreview.status === "current" ? "현재 원문과 일치" : state.sourcePreview.status === "stale" ? "원문 수정됨 — 재분석 필요" : "원문 상태 확인 전";
        createEl(preview, "p", { text: freshness, attr: { class: "llmwiki-approval-review__muted" } });
        if (state.sourcePreview.evidence_quote) createEl(preview, "blockquote", { text: state.sourcePreview.evidence_quote });
        if (state.sourcePreview.context) createEl(preview, "pre", { text: state.sourcePreview.context });
        const previewActions = createEl(preview, "div", { attr: { class: "llmwiki-approval-review__actions" } });
        button(previewActions, "원문 파일 열기", "open-source-file", () => onOpenBeside(state.sourcePreview.source_path));
        if (state.sourcePreview.position) button(previewActions, "원문 수정", "edit-source", () => onEditSource(state.sourcePreview));
        button(previewActions, "닫기", "close-source-preview", () => { state.sourcePreview = null; render(); });
      }
      const cards = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__operations" } });
      model.forEach((item, index) => {
        const card = createEl(cards, "article", { attr: { class: "llmwiki-approval-review__operation prodigy-utility-card", "data-risk-tier": item.packet.risk.tier, "data-conflict-state": item.packet.conflict.state } });
        const head = createEl(card, "div", { attr: { class: "llmwiki-approval-review__operation-head" } });
        if (item.selectable) {
          const label = createEl(head, "label", { attr: { class: "llmwiki-approval-review__source llmwiki-approval-review__selection-target" } });
          const input = createEl(label, "input", { attr: { type: "checkbox", "aria-label": `${item.operation} 묶음 선택` } });
          input.checked = state.selected.has(item.packet.packet_id);
          input.onchange = () => { if (input.checked) state.selected.add(item.packet.packet_id); else state.selected.delete(item.packet.packet_id); state.activeIndex = index; publishSelection(); render(); };
          createEl(label, "span", { text: "묶음 선택" });
        }
        createEl(head, "h3", { text: item.operation });
        const preview = createEl(card, "section", { attr: { class: "llmwiki-approval-review__diff" } }); createEl(preview, "h4", { text: "변경 미리보기" });
        item.before_after.forEach((row) => {
          createEl(preview, "p", { text: `지식: ${row.destination}` });
          createEl(preview, "h5", { text: "변경 전" });
          createEl(preview, "div", { text: row.before, attr: { class: "llmwiki-lifecycle__document-preview llmwiki-cjk-prose", "data-typography-role": "document-preview" } });
          createEl(preview, "h5", { text: "변경 후" });
          createEl(preview, "div", { text: row.after, attr: { class: "llmwiki-lifecycle__document-preview llmwiki-cjk-prose", "data-typography-role": "document-preview" } });
        });
        const fields = createEl(card, "dl");
        prettyField(fields, "요약", item.summary, { class: "llmwiki-cjk-prose", "data-typography-role": "summary" });
        createEl(fields, "dt", { text: "위험" });
        const risk = createEl(fields, "dd", { attr: { class: "llmwiki-cjk-prose", "data-typography-role": "risk" } });
        const reasons = createEl(risk, "span", { attr: { class: "llmwiki-approval-review__risk-reasons", "data-risk-reasons": "structured" } });
        item.riskItems.forEach((reason) => createEl(reasons, "span", { text: reason, attr: { "data-risk-reason": "true" } }));
        field(fields, "충돌 상태", item.conflict);
        const lineage = createEl(card, "section"); createEl(lineage, "h4", { text: "출처 흐름" });
        item.provenance.forEach((row) => createEl(lineage, "p", { text: row, attr: { class: "llmwiki-cjk-prose", "data-typography-role": "provenance" } }));
        item.sourceRows.forEach((row) => button(lineage, "출처 보기", "open-source", () => openSourcePreview(row), { emittedAction: "preview_source" }));
      });
      return frame;
    }
    render();
    return Object.freeze({ model, render, requestRevision, approveBatch, state: () => ({ selectedIds: sorted([...state.selected]), lastResult: state.lastResult }) });
  }

  const api = Object.freeze({ buildRiskApprovalReviewModel, mountRiskApprovalReview });
  root.LLMWikiRiskApprovalReviewView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
