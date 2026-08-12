(function (root) {
  "use strict";

  const KNOWLEDGE_PREFIX = "PARA/RESOURCES/Knowledge/";
  function moduleOrRequire(globalName, relativePath) {
    if (root[globalName]) return root[globalName];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { return null; }
    }
    return null;
  }

  function adapter() {
    return moduleOrRequire("KnowledgeExplorerHubAdapter", "./knowledge-explorer-hub-adapter.js");
  }

  function commitBuilder() {
    return moduleOrRequire("LLMWikiApprovalReviewCommit", "./llmwiki-approval-review-commit.js");
  }

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function text(value, fallback = "") { return typeof value === "string" && value.trim() ? value : fallback; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function sorted(values) { return [...new Set(list(values).filter(Boolean).map(String))].sort(); }
  function setAttr(el, name, value) {
    if (!el) return;
    if (typeof el.setAttr === "function") return el.setAttr(name, value);
    if (typeof el.setAttribute === "function") return el.setAttribute(name, value);
    el.attr = el.attr || {};
    el.attr[name] = String(value);
  }
  function createEl(parent, tag, options = {}) {
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const el = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) el.textContent = String(options.text);
    Object.entries(options.attr || {}).forEach(([name, value]) => el.setAttribute(name, value));
    parent.appendChild(el);
    return el;
  }
  function empty(el) {
    if (typeof el.empty === "function") return el.empty();
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  function ensureStyle(container) {
    const doc = container && container.ownerDocument ? container.ownerDocument : typeof document !== "undefined" ? document : null;
    if (doc && doc.getElementById && doc.getElementById("llmwiki-approval-review-styles")) return;
    const style = createEl(container, "style", { text: `.llmwiki-approval-review{display:grid;gap:17px;min-inline-size:0;color:var(--text-normal)}.llmwiki-approval-review *{box-sizing:border-box;min-inline-size:0}.llmwiki-approval-review header,.llmwiki-approval-review section,.llmwiki-approval-review article{display:grid;gap:8px;min-inline-size:0}.llmwiki-approval-review h2,.llmwiki-approval-review h3,.llmwiki-approval-review h4,.llmwiki-approval-review p{margin:0;overflow-wrap:anywhere;word-break:keep-all}.llmwiki-approval-review p,.llmwiki-approval-review dt,.llmwiki-approval-review dd,.llmwiki-approval-review li{overflow-wrap:anywhere;word-break:keep-all}.llmwiki-approval-review dl{display:grid;grid-template-columns:minmax(6rem,auto) minmax(0,1fr);gap:8px 12px;margin:0}.llmwiki-approval-review dt,.llmwiki-approval-review__muted{color:var(--text-muted)}.llmwiki-approval-review dd{margin:0}.llmwiki-approval-review__notice[data-state="error"],.llmwiki-approval-review__notice[data-state="stale"],.llmwiki-approval-review__conflict{color:var(--text-error)}.llmwiki-approval-review__actions,.llmwiki-approval-review__operation-head,.llmwiki-approval-review__source{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-inline-size:0}.llmwiki-approval-review button,.llmwiki-approval-review a{min-block-size:44px;cursor:pointer;overflow-wrap:anywhere;word-break:keep-all}.llmwiki-approval-review button[data-primary="true"]{background:var(--ke-color-interactive,var(--text-accent));color:var(--ke-color-on-interactive,var(--text-on-accent));border-color:var(--ke-color-interactive,var(--text-accent))}.llmwiki-approval-review button:focus-visible,.llmwiki-approval-review a:focus-visible,.llmwiki-approval-review input:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}.llmwiki-approval-review button:disabled{opacity:.5;cursor:not-allowed}.llmwiki-approval-review a{color:var(--ke-color-interactive,var(--text-accent));text-decoration:none}.llmwiki-approval-review a:hover{text-decoration:underline}.llmwiki-approval-review__operations{display:grid;gap:12px}.llmwiki-approval-review__diff{border-top:1px solid var(--background-modifier-border);padding-block-start:8px}.llmwiki-approval-review__diff-row{display:grid;grid-template-columns:minmax(4rem,auto) minmax(0,1fr);gap:8px}.llmwiki-approval-review__scroll-owner{min-inline-size:0}.llmwiki-approval-review__operation input{min-inline-size:18px;min-block-size:18px}@media(max-width:833px){.llmwiki-approval-review dl{grid-template-columns:1fr}.llmwiki-approval-review__actions button{flex:1 1 100%}}@media(forced-colors:active){.llmwiki-approval-review button[data-primary="true"]{border:2px solid Highlight}.llmwiki-approval-review button:focus-visible,.llmwiki-approval-review a:focus-visible,.llmwiki-approval-review input:focus-visible{outline-color:Highlight}}@media(prefers-reduced-motion:reduce){.llmwiki-approval-review *{transition:none!important;animation:none!important}}` });
    setAttr(style, "id", "llmwiki-approval-review-styles");
  }
  function button(parent, label, action, onClick, options = {}) {
    const control = createEl(parent, "button", { text: label, attr: { type: "button", "data-action": action, "data-primary": options.primary ? "true" : "false", "aria-label": options.ariaLabel || label }, disabled: options.disabled });
    if (!options.disabled) control.onclick = (event) => { if (event && event.preventDefault) event.preventDefault(); onClick(event); };
    return control;
  }
  function field(parent, label, value) {
    createEl(parent, "dt", { text: label });
    createEl(parent, "dd", { text: text(value, "없음") });
  }
  function sourcePath(locator) { return text(locator).split("#")[0]; }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function commitCopy(result, packet) {
    if (result && result.status === "committed" && result.preview === true) {
      const previewKind = packet && packet.provider && packet.provider.mode === "synthetic" ? "합성 실행" : "미리보기";
      const previewReason = previewKind === "합성 실행" ? "합성 실행이라" : "미리보기라";
      return { kind: "success", message: `결정적 커밋 검증 완료: 선택한 변경만 승인 payload로 확인했습니다. ${previewReason} 실제 지식 파일은 쓰지 않았습니다.` };
    }
    if (result && result.status === "committed") return { kind: "success", message: "결정적 커밋이 완료되었습니다. 승인한 지식 파일과 감사 기록을 저장했습니다." };
    if (result && result.status === "duplicate") return { kind: "success", message: "이미 같은 결정적 승인 결과가 확인되었습니다." };
    if (result && (result.reason === "target_revision_mismatch" || result.reason === "canonical_revision_mismatch")) return { kind: "stale", message: "실행 결과가 변경되어 기존 승인을 무효화했습니다. 새 승인 패킷을 만든 뒤 내용을 다시 확인해 주세요." };
    return { kind: "error", message: "결정적 커밋을 진행하지 못했습니다. 승인 내용은 보존되며 다시 확인할 수 있습니다." };
  }

  function createSyntheticApprovalPacket() {
    const approvalApi = moduleOrRequire("LLMWikiApprovalPacket", "./llmwiki-approval-packet.js");
    const bundleApi = moduleOrRequire("LLMWikiProposalBundle", "./llmwiki-proposal-bundle.js");
    if (!approvalApi || !bundleApi) throw new Error("합성 승인 packet 계약이 아직 로드되지 않았습니다.");
    const runId = "run_librarian_todo14_demo";
    const alpha = { source_id: "synthetic_source_alpha", content_hash: "a".repeat(64), source_url: "https://example.invalid/synthetic-alpha", locators: ["ZETA/LITERATURE/synthetic-alpha.md#claim"], confidence: "explicit" };
    const beta = { source_id: "synthetic_source_beta", content_hash: "b".repeat(64), source_url: "https://example.invalid/synthetic-beta", locators: ["ZETA/LITERATURE/synthetic-beta.md#claim"], confidence: "explicit" };
    const proposals = [
      { kind: "create", title: "새 독서 원칙", claims: [{ claim_id: "demo_create", text: "작은 실행 단위로 지식을 보존한다.", source_ids: [alpha.source_id] }], source_citations: [alpha], confidence: "explicit", affected_targets: [KNOWLEDGE_PREFIX + "synthetic-reading.md"] },
      { kind: "update", title: "기존 원칙 보강", target: KNOWLEDGE_PREFIX + "existing-reading.md", target_revision: "1".repeat(64), claims: [{ claim_id: "demo_update", text: "기존 원칙에 근거를 추가한다.", source_ids: [alpha.source_id] }], source_citations: [alpha], confidence: "explicit", diff: [{ op: "revise", path: "/statement", before: "기존 문장", after: "검토한 새 문장", source_ids: [alpha.source_id] }], affected_targets: [KNOWLEDGE_PREFIX + "existing-reading.md"] },
      { kind: "merge", title: "관련 문헌 병합", target: KNOWLEDGE_PREFIX + "merged-reading.md", target_revision: "2".repeat(64), source_input_ids: [alpha.source_id, beta.source_id], existing_target_ids: [KNOWLEDGE_PREFIX + "source-a.md", KNOWLEDGE_PREFIX + "source-b.md"], claims: [{ claim_id: "demo_merge", text: "두 자료는 같은 실행 원칙을 지지한다.", source_ids: [alpha.source_id, beta.source_id] }], source_citations: [alpha, beta], confidence: "explicit", conflicts: [{ conflict_id: "demo_overlap", status: "disputed", claims: ["표현은 다르지만 원칙은 유사함"], source_ids: [alpha.source_id, beta.source_id] }], affected_targets: [KNOWLEDGE_PREFIX + "merged-reading.md"] },
      { kind: "dispute", title: "충돌 원천 보류", target: KNOWLEDGE_PREFIX + "conflicting-reading.md", target_revision: "3".repeat(64), claims: [{ claim_id: "demo_morning", text: "아침에 읽는다.", source_ids: [alpha.source_id] }, { claim_id: "demo_night", text: "밤에 읽는다.", source_ids: [beta.source_id] }], source_citations: [alpha, beta], confidence: "low", conflicts: [{ conflict_id: "demo_time_conflict", status: "unresolved", claims: ["아침 전용", "밤 전용"], source_ids: [alpha.source_id, beta.source_id] }], dispute: { reason: "충돌하는 자료에 승자가 없음", source_ids: [alpha.source_id, beta.source_id], claim_ids: ["demo_morning", "demo_night"] }, affected_targets: [KNOWLEDGE_PREFIX + "conflicting-reading.md"] },
      { kind: "abstain", title: "근거 부족", claims: [], source_citations: [alpha], confidence: "low", abstention_reason: "unsupported_claim", affected_targets: [] },
      { kind: "no_change", title: "변경 없음", claims: [{ claim_id: "demo_preserve", text: "이미 지원되는 주장이다.", source_ids: [beta.source_id] }], source_citations: [beta], confidence: "explicit", no_change_reason: "already_supported", affected_targets: [] }
    ];
    const bundle = bundleApi.buildProposalBundle({ run_id: runId, validation_context: { context_id: "validation_context_todo14_demo", logical_scope: "run_scoped", persistence: "none" }, proposals });
    if (!bundle.ok) throw new Error("합성 승인 packet을 만들지 못했습니다.");
    const packet = approvalApi.buildApprovalPacket({ run_id: runId, provider_metadata: { mode: "synthetic" }, proposal_bundle: bundle.value });
    if (!packet.ok) throw new Error("합성 승인 packet을 검증하지 못했습니다.");
    return packet.value;
  }

  function renderOperation(parent, operation, state, callbacks) {
    const card = createEl(parent, "article", { attr: { class: "llmwiki-approval-review__operation prodigy-utility-card", "data-operation-id": operation.operation_id } });
    const head = createEl(card, "div", { attr: { class: "llmwiki-approval-review__operation-head" } });
    if (callbacks.allowlist.has(operation.operation_id)) {
      const label = createEl(head, "label", { attr: { class: "llmwiki-approval-review__source" } });
      const input = createEl(label, "input", { attr: { type: "checkbox", "data-operation-id": operation.operation_id, "aria-label": `${operation.kind_label} 변경 선택` } });
      input.checked = state.selectedIds.has(operation.operation_id);
      const updateSelection = () => { if (input.checked) state.selectedIds.add(operation.operation_id); else state.selectedIds.delete(operation.operation_id); callbacks.rerender(); };
      input.onchange = updateSelection;
      input.onclick = () => { if (!input.ownerDocument) { input.checked = !input.checked; updateSelection(); } };
      createEl(label, "span", { text: "승인 선택" });
    }
    createEl(head, "h3", { text: `${operation.kind_label} · ${operation.title}` });
    const fields = createEl(card, "dl");
    field(fields, "상태", operation.status_label);
    field(fields, "신뢰도", operation.confidence);
    field(fields, "영향 대상", operation.affected_canonical_files.join(", "));
    if (["update", "merge", "dispute"].includes(operation.proposal_kind)) field(fields, "승인 가능 여부", "후속 단계에서 지원");
    if (["abstain", "no_change"].includes(operation.proposal_kind)) field(fields, "기록 결과", "쓰기 없음");
    if (operation.non_write_reason) field(fields, "보류 이유", operation.non_write_reason === "unsupported_claim" ? "근거 부족" : "이미 지원됨");
    if (operation.conflicts.length) {
      const conflict = createEl(card, "div", { attr: { class: "llmwiki-approval-review__conflict", role: "alert" } });
      createEl(conflict, "strong", { text: "충돌" });
      operation.conflicts.forEach((item) => createEl(conflict, "p", { text: `${item.status_label}: ${item.claims.join(" · ")}` }));
    }
    const diffOpen = state.diffIds.has(operation.operation_id);
    button(card, diffOpen ? "차이 닫기" : "차이 보기", diffOpen ? "hide-diff" : "show-diff", () => { if (diffOpen) state.diffIds.delete(operation.operation_id); else state.diffIds.add(operation.operation_id); callbacks.rerender(); });
    if (state.diffIds.has(operation.operation_id)) {
      const diff = createEl(card, "div", { attr: { class: "llmwiki-approval-review__diff" } });
      operation.diff.forEach((entry) => {
        const row = createEl(diff, "div", { attr: { class: "llmwiki-approval-review__diff-row" } });
        createEl(row, "strong", { text: entry.op === "preserve" ? "보존" : entry.op === "revise" ? "수정" : "추가" });
        createEl(row, "span", { text: `변경 전: ${text(entry.before, "없음")} · 변경 후: ${text(entry.after || entry.value || entry.path, "없음")}` });
      });
    }
    const evidence = createEl(card, "section");
    createEl(evidence, "h4", { text: "근거 및 출처" });
    operation.evidence.forEach((item) => {
      const row = createEl(evidence, "div", { attr: { class: "llmwiki-approval-review__source" } });
      createEl(row, "span", { text: `${item.source_id} · ${item.locator}` });
      button(row, "출처 옆에 열기", "open-source", () => callbacks.onOpenBeside(sourcePath(item.locator)), { ariaLabel: `출처 옆에 열기 ${item.locator}` });
    });
    return card;
  }

  function mountLlmWikiApprovalReview(options = {}) {
    const container = options.container;
    const approvalApi = options.approvalApi || moduleOrRequire("LLMWikiApprovalPacket", "./llmwiki-approval-packet.js");
    const commitApi = options.commitApi || moduleOrRequire("LLMWikiDeterministicCommit", "./llmwiki-deterministic-commit.js");
    const hubAdapter = adapter();
    if (!container || !approvalApi || !hubAdapter || !plain(options.packet)) throw new Error("LLMWiki 승인 검토에 필요한 packet, 승인 계약, adapter가 없습니다.");
    let packet = clone(options.packet);
    let model = hubAdapter.buildApprovalReviewModel(packet);
    let allowlist = new Set(list(packet.selection_allowlist));
    const state = {
      open: false,
      selectedIds: new Set(),
      diffIds: new Set(),
      lastResult: null,
      staleTriggered: false,
      authorizationInvalidated: false,
      reconfirmationRequired: false,
      invalidatedPacketHashes: new Set(),
    };
    const onOpenBeside = typeof options.onOpenBeside === "function" ? options.onOpenBeside : () => {};

    function setResult(result, copy) { state.lastResult = { ...(result || {}), status: result && result.status || copy.kind, copy }; }
    function submit(kind) {
      if (state.authorizationInvalidated || state.invalidatedPacketHashes.has(packet.packet_hash)) {
        setResult({ ok: false, status: "stale_reconfirm_required", reason: "packet_authorization_invalidated", write_counters: { canonical: 0, audit: 0, refresh: 0, git: 0 } }, { kind: "stale", message: "기존 승인 패킷은 더 이상 사용할 수 없습니다. 새 승인 패킷을 만든 뒤 다시 확인해 주세요." });
        render();
        return;
      }
      const approvalIntent = { kind, selectionIds: kind === "all" ? [] : sorted([...state.selectedIds]) };
      const action = approvalIntent.kind === "all"
        ? { action: "approve_all", packet_hash: packet.packet_hash }
        : { action: "approve_selected", packet_hash: packet.packet_hash, selection_ids: approvalIntent.selectionIds };
      const approvalResult = approvalApi.applyApprovalAction(packet, action);
      if (!approvalResult.ok) { setResult(approvalResult, hubAdapter.approvalResultCopy(approvalResult)); render(); return; }
      state.reconfirmationRequired = false;
      if (!commitApi || typeof commitApi.commitApprovedCanonical !== "function") { setResult({ status: "rejected", reason: "commit_contract_missing" }, { kind: "error", message: "결정적 커밋 계약을 불러오지 못했습니다. 승인 내용은 기록하지 않았습니다." }); render(); return; }
      const builder = commitBuilder();
      const request = typeof options.buildCommitRequest === "function" ? options.buildCommitRequest({ packet, authorizationResult: approvalResult.value, commitApi }) : builder.buildPreviewCommitRequest({ packet, authorizationResult: approvalResult.value, commitApi });
      if (options.simulateStaleOnce === true && !state.staleTriggered) {
        state.staleTriggered = true;
        request.canonical_revision = { ...request.canonical_revision, current: "0".repeat(64) };
      }
      const commitResult = commitApi.commitApprovedCanonical(request, options.commitOptions || {});
      const copy = commitCopy(commitResult, packet);
      if (copy.kind === "stale") {
        state.invalidatedPacketHashes.add(packet.packet_hash);
        state.authorizationInvalidated = true;
        state.reconfirmationRequired = true;
        state.selectedIds.clear();
      }
      const surfacedResult = copy.kind === "stale"
        ? { ...commitResult, write_counters: { canonical: commitResult.write_counts && commitResult.write_counts.canonical || 0, audit: commitResult.write_counts && commitResult.write_counts.audit || 0, refresh: 0, git: commitResult.write_counts && commitResult.write_counts.git || 0 } }
        : commitResult;
      setResult(surfacedResult, copy);
      render();
    }
    function regeneratePacket() {
      let generated;
      try {
        generated = typeof options.regeneratePacket === "function"
          ? options.regeneratePacket({ invalidated_packet_hash: packet.packet_hash, packet: clone(packet) })
          : null;
      } catch (_error) {
        generated = null;
      }
      const replacement = generated && generated.ok === true ? generated.value : generated;
      if (!plain(replacement) || !text(replacement.packet_hash) || replacement.packet_hash === packet.packet_hash || state.invalidatedPacketHashes.has(replacement.packet_hash)) {
        setResult({ ok: false, status: "stale_reconfirm_required", reason: "replacement_packet_hash_required", write_counters: { canonical: 0, audit: 0, refresh: 0, git: 0 } }, { kind: "stale", message: "새 승인 패킷의 hash가 필요합니다. 기존 패킷으로는 다시 승인할 수 없습니다." });
        render();
        return;
      }
      packet = clone(replacement);
      model = hubAdapter.buildApprovalReviewModel(packet);
      allowlist = new Set(list(packet.selection_allowlist));
      state.selectedIds.clear();
      state.diffIds.clear();
      state.authorizationInvalidated = false;
      state.reconfirmationRequired = true;
      setResult({ ok: true, status: "reconfirmation_required", reason: "replacement_packet_requires_confirmation", write_counters: { canonical: 0, audit: 0, refresh: 0, git: 0 } }, { kind: "info", message: "새 승인 패킷을 만들었습니다. 변경을 다시 선택하고 명시적으로 승인해 주세요." });
      render();
    }
    function nonWrite(action) {
      const result = approvalApi.applyApprovalAction(packet, { action, packet_hash: packet.packet_hash });
      const value = result && result.ok ? result.value : result;
      setResult(value, hubAdapter.approvalResultCopy(value));
      render();
    }
    function render() {
      empty(container);
      ensureStyle(container);
      const frame = createEl(container, "section", { attr: { class: "llmwiki-approval-review prodigy-full-bleed", "data-surface": "llmwiki-approval-review", "data-scroll-owner": "knowledge-hub-body", "aria-label": "Librarian 실행 검토", tabindex: "0" } });
      frame.onkeydown = (event) => {
        if (event && event.key === "Escape" && state.open) {
          event.preventDefault();
          state.open = false;
          render();
        }
      };
      const heading = createEl(frame, "header");
      createEl(heading, "h2", { text: options.syntheticEmptyState ? "합성 빈 상태 미리보기 · Librarian 실행 검토" : "Librarian 실행 검토" });
      createEl(heading, "p", { text: "실행 단위로 제안을 확인한 뒤 마지막 승인만 수행합니다. 자동 승인은 없습니다.", attr: { class: "llmwiki-approval-review__muted" } });
      if (!state.open) {
        button(heading, "검토 열기", "open-review", () => { state.open = true; render(); }, { primary: true });
        return frame;
      }
      const meta = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__meta prodigy-utility-card" } });
      createEl(meta, "h3", { text: "실행 정보" });
      const fields = createEl(meta, "dl");
      field(fields, "실행 ID", model.run_id);
      field(fields, "제공자", model.provider_label);
      field(fields, "신뢰 상태", model.trust_label);
      field(fields, "승인 상태", model.approval_label);
      const actions = createEl(meta, "div", { attr: { class: "llmwiki-approval-review__actions" } });
      button(actions, "선택 승인", "approve-selected", () => submit("selected"), { primary: true, disabled: state.authorizationInvalidated || state.selectedIds.size === 0 });
      button(actions, "전체 승인", "approve-all", () => submit("all"), { disabled: state.authorizationInvalidated });
      button(actions, "근거 더 요청", "evidence-more", () => nonWrite("evidence_more"));
      button(actions, "충돌 거절", "reject-conflict", () => nonWrite("reject"));
      button(actions, "검토 닫기", "close-review", () => { state.open = false; render(); });
      if (state.lastResult) {
        const notice = createEl(frame, "div", { attr: { class: "llmwiki-approval-review__notice", "data-state": state.lastResult.copy.kind, role: "status" } });
        createEl(notice, "p", { text: state.lastResult.copy.message });
        if (state.lastResult.copy.kind === "stale") button(notice, "새 승인 패킷 생성", "regenerate-packet", regeneratePacket, { primary: true });
      }
      const conflicts = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__meta" } });
      createEl(conflicts, "h3", { text: `충돌 ${model.conflicts.length}` });
      if (!model.conflicts.length) createEl(conflicts, "p", { text: "확인할 충돌이 없습니다.", attr: { class: "llmwiki-approval-review__muted" } });
      model.conflicts.forEach((conflict) => createEl(conflicts, "p", { text: `${conflict.conflict_id}: ${conflict.status === "unresolved" ? "미해결" : "검토 필요"}` }));
      const operations = createEl(frame, "section", { attr: { class: "llmwiki-approval-review__operations" } });
      model.operations.forEach((operation) => renderOperation(operations, operation, state, { allowlist, rerender: render, onOpenBeside }));
      return frame;
    }
    const api = {
      container,
      get packet() { return packet; },
      get model() { return model; },
      state: () => ({
        selectedIds: sorted([...state.selectedIds]),
        lastResult: state.lastResult,
        open: state.open,
        authorizationInvalidated: state.authorizationInvalidated,
        reconfirmationRequired: state.reconfirmationRequired,
        invalidatedPacketHashes: sorted([...state.invalidatedPacketHashes]),
        currentPacketHash: packet.packet_hash,
      }),
      render,
      submit,
    };
    render();
    return api;
  }

  const api = Object.freeze({
    buildPreviewCommitRequest: (...args) => commitBuilder().buildPreviewCommitRequest(...args),
    createSyntheticApprovalPacket,
    mountLlmWikiApprovalReview
  });
  root.LLMWikiApprovalReviewView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
