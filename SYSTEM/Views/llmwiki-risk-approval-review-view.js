(function (root) {
  "use strict";

  let ui = root.ProdigyWikiWorkspaceView || (typeof require === "function" ? require("./prodigy-wiki-workspace-view.js") : null);
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
    control.onclick = (event) => { event?.preventDefault?.(); if (!control.disabled) return onClick(); };
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

  function buildRiskApprovalReviewModel(packet, packetApi, options = {}) {
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
      conflict: packet.conflict.state === "clear" ? (options.comparison_status === "not_checked" ? "자동 비교 미실시 · 등록된 충돌 없음" : "없음") : packet.conflict.state === "resolved" ? "해결됨" : `검토 필요 · ${packet.conflict.blocking_conflict_ids.length}건`,
      selectable: packet.batch_eligible === true,
      approvable: packet.approval_eligible === true,
    });
  }

  function mountRiskApprovalReview(options = {}) {
    ui ||= root.ProdigyWikiWorkspaceView;
    const container = options.container;
    const packetApi = options.packetApi || root.LLMWikiRiskApprovalPacket;
    const batchApi = options.batchApi || root.LLMWikiSafeBatchApproval;
    if (!container || !packetApi || !batchApi || !Array.isArray(options.packets) || options.packets.length === 0) throw new TypeError("risk_approval_review_dependencies_required");
    const model = Object.freeze(options.packets.map((packet) => buildRiskApprovalReviewModel(packet, packetApi, options)));
    const allowedInitial = new Set(model.filter((item) => item.selectable).map((item) => item.packet.packet_id));
    const initialSelected = Array.isArray(options.initialSelectedIds) ? options.initialSelectedIds.filter((id) => allowedInitial.has(id)) : [];
    const state = { selected: new Set(initialSelected), activeIndex: 0, lastResult: null, sourcePreview: null, acknowledged: false, batch: false, busy: false, blocked: false, sourceInvoker: null, completed: new Set(), blockedIds: new Set() };
    const onOpenBeside = typeof options.onOpenBeside === "function" ? options.onOpenBeside : () => {};
    const onEditSource = typeof options.onEditSource === "function" ? options.onEditSource : () => {};
    const resolveSourcePreview = typeof options.resolveSourcePreview === "function" ? options.resolveSourcePreview : (row) => ({ ok: true, status: "unknown", match_status: "unavailable", source_path: row.source_path, evidence_quote: "", context: "", locator: row.locator });
    function publishSelection() { if (typeof options.onSelectionChange === "function") options.onSelectionChange(sorted([...state.selected])); }
    function active() { return model[state.activeIndex] || model[0]; }
    function invoke(name, value) {
      if (state.busy) return { ok: false, reason: "action_in_progress" };
      state.lastResult = typeof options[name] === "function" ? options[name](value) : { ok: false, reason: "action_unavailable" };
      return state.lastResult;
    }
    async function applyDecision(batch) {
      if (state.busy || state.blocked || !state.acknowledged || (!batch && !active().approvable)) return { ok: false, reason: "explicit_exact_approval_required" };
      const result = batch ? approveBatch() : invoke("onApprove", active().packet);
      state.busy = true; state.acknowledged = false; options.workspace?.setLocked(true); options.workspace?.setJourney({ status: "applying" }); render();
      try {
        state.lastResult = await result;
        if (state.lastResult?.ok === false) { state.blocked = true; state.blockedIds.add(active().packet.packet_id); }
        if (state.lastResult?.ok === true && ["committed", "completed", "processed"].includes(state.lastResult.status)) {
          (batch ? [...state.selected] : [active().packet.packet_id]).forEach(id => state.completed.add(id));
        }
        return state.lastResult;
      } finally { state.busy = false; options.workspace?.setLocked(false); render(); }
    }
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
      state.sourceInvoker = row.locator;
      const fallback = { ok: true, status: "unknown", match_status: "unavailable", source_path: row.source_path, evidence_quote: "", context: "", locator: row.locator };
      state.sourcePreview = fallback;
      render();
      const displayedPacket = active().packet.packet_id;
      const show = value => {
        if (active().packet.packet_id !== displayedPacket || state.sourceInvoker !== row.locator || !state.sourcePreview) return;
        state.sourcePreview = value?.ok ? value : { ...fallback, reason: value?.reason || "source_preview_unavailable" };
        if (value?.status === "stale") { state.blocked = true; state.blockedIds.add(displayedPacket); state.selected.delete(displayedPacket); state.acknowledged = false; }
        render();
      };
      try {
        const resolved = resolveSourcePreview(row);
        if (resolved?.then) return resolved.then(show, error => show({ ok: false, reason: error.message }));
        show(resolved);
      } catch (error) { show({ ok: false, reason: error.message }); }
    }
    function render() {
      empty(container);
      if (typeof options.ensureStyle === "function") options.ensureStyle(container);
      const frame = createEl(container, "section", { attr: { class: "llmwiki-approval-review prodigy-full-bleed", "data-surface": "llmwiki-risk-approval-review", "aria-label": "지식 변경 검토" } });
      const current = active(), packet = current.packet, completed = state.completed.has(current.packet.packet_id);
      const selectItem = id => { if (state.busy) return; state.activeIndex = model.findIndex(item => item.packet.packet_id === id); state.acknowledged = false; state.sourcePreview = null; state.blocked = state.blockedIds.has(id); state.lastResult = null; render(); };
      const proposalRows = model.map(item => ({ id: item.packet.packet_id, title: item.summary, status: !item.approvable ? "충돌 확인 필요" : item.packet.operation.kind === "create" ? "새 문서" : "수정" }));
      if (options.workspace) options.workspace.setProposals(proposalRows, packet.packet_id, selectItem);
      else {
        const selector = createEl(frame, "select", { attr: { "aria-label": "제안 선택", "data-proposal-select": "" } });
        proposalRows.forEach(row => createEl(selector, "option", { text: row.title, attr: { value: row.id } })); selector.value = packet.packet_id; selector.disabled = state.busy; selector.onchange = () => selectItem(selector.value);
      }
      createEl(frame, "h2", { text: current.summary });
      const storage = createEl(frame, "fieldset", { attr: { "data-storage-choices": "", class: "wiki-storage-choices" } }); createEl(storage, "legend", { text: "저장 방식" });
      for (const [mode, label] of [["create", "새 문서로 저장"], ["update", "기존 문서에 내용 추가"]]) {
        const row = createEl(storage, "label"); const control = createEl(row, "input", { attr: { type: "radio", "data-storage-mode": mode } }); control.checked = mode === (packet.operation.kind === "create" ? "create" : "update"); control.disabled = true; createEl(row, "span", { text: label });
      }
      createEl(storage, "p", { text: "이 변경안의 저장 방식과 대상은 정해져 있습니다." });
      const decision = options.decisionContainer || createEl(frame, "footer", { attr: { class: "wiki-decision-bar" } }); empty(decision);
      const label = createEl(decision, "label");
      const ack = createEl(label, "input", { attr: { type: "checkbox", "data-review-acknowledgement": "" } }); ack.checked = state.acknowledged; ack.disabled = state.busy || state.blocked;
      createEl(label, "span", { text: "변경 내용과 출처를 확인했습니다." });
      const reason = completed ? "문서에 적용했습니다." : state.busy ? "승인한 변경을 적용하고 있습니다." : state.blocked ? "검토 이후 내용이 바뀌었습니다. 변경안을 다시 확인해야 합니다." : !current.approvable ? "적용 전에 확인할 항목이 있습니다." : "변경 내용과 출처를 확인하고 체크하세요.";
      createEl(decision, "p", { text: reason, attr: { "data-decision-status": "", role: "status" } });
      const actions = createEl(decision, "div", { attr: { "data-decision-actions": "" } });
      button(actions, "나중에", "later", () => options.onLater?.());
      const approve = button(actions, state.batch ? `선택한 ${state.selected.size}건 승인 및 적용` : "승인 및 적용", state.batch ? "approve-batch" : "approve", () => applyDecision(state.batch), { primary: true, disabled: state.busy || state.blocked || !state.acknowledged || (state.batch ? !state.selected.size : !current.approvable), disabledReason: reason, emittedAction: state.batch ? "approve_risk_batch" : "approve_risk" });
      ack.onchange = () => { state.acknowledged = ack.checked; approve.disabled = state.busy || state.blocked || !ack.checked || (state.batch ? !state.selected.size : !current.approvable); };
      if (completed) {
        ack.disabled = true; label.hidden = true; approve.hidden = true;
        options.workspace?.setJourney({ status: "applied" });
        button(actions, "문서 열기", "open-applied-document", () => onOpenBeside(packet.operation.destination_ids[0]), { primary: true });
      }
      if (state.busy) createEl(decision, "progress", { attr: { "aria-label": "문서 적용 중" } });
      const secondary = createEl(frame, "div", { attr: { class: "llmwiki-approval-review__actions" } });
      button(secondary, "거절", "reject", () => invoke("onReject", packet), { disabled: state.busy, emittedAction: "reject_risk" });
      button(secondary, "수정 요청", "request-revision", () => invoke("onRequestRevisionPrompt", { packet, submit: guidance => {
        const value = typeof guidance === "string" ? guidance.trim() : "";
        return value ? invoke("onRequestRevision", { packet, guidance: value }) : { ok: false, reason: "natural_language_guidance_required" };
      } }), { disabled: state.busy, emittedAction: "request_risk_revision" });
      button(secondary, state.batch ? "한 변경씩 확인" : "여러 변경 선택", "toggle-batch", () => { state.batch = !state.batch; state.acknowledged = false; render(); }, { disabled: state.busy });
      if (state.batch) {
        const batch = createEl(frame, "section", { attr: { "data-batch-targets": "" } });
        model.filter(item => item.selectable && !state.blockedIds.has(item.packet.packet_id)).forEach(item => {
          const row = createEl(batch, "label"); const input = createEl(row, "input", { attr: { type: "checkbox", "data-batch-packet": item.packet.packet_id } }); input.checked = state.selected.has(item.packet.packet_id); input.disabled = state.busy;
          createEl(row, "span", { text: `${item.summary} · ${item.packet.operation.destination_ids.join(" · ")}` });
          input.onchange = () => { if (input.checked) state.selected.add(item.packet.packet_id); else state.selected.delete(item.packet.packet_id); state.acknowledged = false; publishSelection(); render(); };
        });
      }
      if (state.sourcePreview) {
        const preview = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__source-preview prodigy-utility-card", role: "dialog", "aria-label": "출처 근거" } });
        createEl(preview, "h3", { text: "출처 근거" });
        createEl(preview, "p", { text: state.sourcePreview.source_path || "원문 경로 없음" });
        const freshness = state.sourcePreview.status === "current" ? "현재 원문과 일치" : state.sourcePreview.status === "stale" ? "원문 수정됨 — 재분석 필요" : "원문 상태 확인 전";
        createEl(preview, "p", { text: freshness, attr: { class: "llmwiki-approval-review__muted" } });
        if (state.sourcePreview.evidence_quote) createEl(preview, "blockquote", { text: state.sourcePreview.evidence_quote });
        if (state.sourcePreview.context) createEl(preview, "pre", { text: state.sourcePreview.context });
        const previewActions = createEl(preview, "div", { attr: { class: "llmwiki-approval-review__actions" } });
        button(previewActions, "원문 파일 열기", "open-source-file", () => onOpenBeside(state.sourcePreview.locator || state.sourceInvoker || state.sourcePreview.source_path));
        if (state.sourcePreview.position) button(previewActions, "원문 수정", "edit-source", () => onEditSource(state.sourcePreview));
        button(previewActions, "닫기", "close-source-preview", () => { state.sourcePreview = null; render(); const invoker = container.querySelector?.(`[data-source-locator="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(state.sourceInvoker) : state.sourceInvoker}"]`); invoker?.focus(); });
      }
      const cards = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__operations" } });
      [current].forEach((item) => {
        const card = createEl(cards, "article", { attr: { class: "llmwiki-approval-review__operation prodigy-utility-card", "data-risk-tier": item.packet.risk.tier, "data-conflict-state": item.packet.conflict.state } });
        const head = createEl(card, "div", { attr: { class: "llmwiki-approval-review__operation-head" } });
        ui.attr(card, "data-active-packet", item.packet.packet_id);
        ui.attr(card, "data-run-revision", item.packet.run_revision);
        createEl(head, "p", { text: item.operation });
        const preview = createEl(card, "section", { attr: { class: "llmwiki-approval-review__diff" } }); createEl(preview, "h4", { text: "변경 미리보기" });
        item.packet.before_after.forEach(row => {
          const destination = createEl(preview, "section");
          ui.exactPreview(destination, { before: row.before, after: row.after, target_path: row.destination_id, packet_hash: item.packet.packet_id }, options);
        });
        if (!item.approvable || item.packet.conflict.state !== "clear" || options.comparison_status === "not_checked") createEl(card, "p", { text: `! ${item.conflict}`, attr: { role: "alert", "data-blocking-conflict": item.packet.conflict.state } });
        const diagnostics = createEl(card, "details"); createEl(diagnostics, "summary", { text: "상세 정보" });
        const fields = createEl(diagnostics, "dl");
        prettyField(fields, "요약", item.summary, { class: "llmwiki-cjk-prose", "data-typography-role": "summary" });
        createEl(fields, "dt", { text: "위험" });
        const risk = createEl(fields, "dd", { attr: { class: "llmwiki-cjk-prose", "data-typography-role": "risk" } });
        const reasons = createEl(risk, "span", { attr: { class: "llmwiki-approval-review__risk-reasons", "data-risk-reasons": "structured" } });
        item.riskItems.forEach((reason) => createEl(reasons, "span", { text: reason, attr: { "data-risk-reason": "true" } }));
        field(fields, "충돌 상태", item.conflict);
        const lineage = createEl(card, "section"); createEl(lineage, "p", { text: `출처: ${item.provenance.join(" · ")}` });
        item.sourceRows.forEach((row, index) => { const control = button(lineage, `근거 ${index + 1}`, "open-source", () => openSourcePreview(row), { emittedAction: "preview_source" }); ui.attr(control, "data-source-locator", row.locator); });
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
