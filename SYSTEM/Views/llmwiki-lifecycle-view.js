(function (root) {
  "use strict";

  // allow: SIZE_OK — one product projection keeps inbox, approval, conflict, commit, and recovery actions atomic.
  const REVIEW_MODULE_PATH = "./llmwiki-risk-approval-review-view.js";
  const STATUSES = Object.freeze([
    "idle", "selecting", "consent_required", "running", "processed", "complete", "review", "review_only",
    "committing", "committed", "stale_reconfirm_required", "committed_audit_pending",
    "committed_refresh_failed", "compensation_committing", "compensated",
    "compensated_audit_pending", "cancelled", "abstained", "failed",
  ]);
  const OPERATION_LABELS = Object.freeze({
    create: "새 지식",
    update: "기존 지식 수정",
    merge: "지식 병합",
    dispute: "충돌 보류",
    abstain: "제안 보류",
    no_change: "변경 없음",
  });
  const ACTIVE_STATUSES = new Set(["selecting", "consent_required", "running", "committing", "compensation_committing"]);
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const RECOVERY_ATOMIC_TAILS = Object.freeze(["대기 자료는 그대로 유지됩니다.", "그대로 유지됩니다."].sort((left, right) => right.length - left.length));
  const stylesApi = root.KnowledgeStyles || (typeof require === "function" ? require("./knowledge-styles.js") : null);
  const recoveryApi = root.LLMWikiUIRecovery || (typeof require === "function" ? require("./llmwiki-ui-recovery.js") : null);
  const prodigyWikiApi = root.ProdigyWikiController || (typeof require === "function" ? require("./prodigy-wiki-controller.js") : null);
  const CSS = "";
  let wikiUI = root.ProdigyWikiWorkspaceView || (typeof require === "function" ? require("./prodigy-wiki-workspace-view.js") : null);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function modelSegments(value) {
    const stringified = String(value);
    const parts = stringified.split("-");
    if (parts.length < 2 || stringified.length <= 14) return [stringified];
    let boundary = 1;
    let bestDistance = Infinity;
    for (let i = 1; i < parts.length; i += 1) {
      const left = parts.slice(0, i).join("-") + "-";
      const right = parts.slice(i).join("-");
      const distance = Math.abs(left.length - right.length);
      if (distance < bestDistance) {
        bestDistance = distance;
        boundary = i;
      }
    }
    return [parts.slice(0, boundary).join("-") + "-", parts.slice(boundary).join("-")];
  }
  function validSnapshot(value) { return plain(value) && STATUSES.includes(value.status); }
  function durableSuccess(snapshot) {
    const inbox = snapshot && snapshot.inbox;
    const outcomes = snapshot && snapshot.durable_operation_outcomes;
    return Array.isArray(outcomes) && outcomes.length > 0
      && outcomes.every((outcome) => plain(outcome) && outcome.status === "committed")
      && plain(inbox) && inbox.state === "complete" && inbox.succeeded > 0 && inbox.failed === 0;
  }
  function reviewModule(explicit) {
    if (explicit) return explicit;
    if (root.LLMWikiRiskApprovalReviewView) return root.LLMWikiRiskApprovalReviewView;
    if (typeof require === "function") {
      try { return require(REVIEW_MODULE_PATH); } catch (_error) { return null; }
    }
    return null;
  }
  function setAttr(element, name, value) {
    if (!element) return;
    if (typeof element.setAttr === "function") return element.setAttr(name, value);
    if (typeof element.setAttribute === "function") return element.setAttribute(name, value);
    element.attr = element.attr || {};
    element.attr[name] = String(value);
  }
  function removeAttr(element, name) {
    if (element && typeof element.removeAttribute === "function") element.removeAttribute(name);
    else if (element && element.attr) delete element.attr[name];
  }
  function createEl(parent, tag, options = {}) {
    let element;
    if (typeof parent.createEl === "function") element = parent.createEl(tag, options);
    else {
      element = parent.ownerDocument.createElement(tag);
      if (options.text !== undefined) element.textContent = String(options.text);
      for (const [name, value] of Object.entries(options.attr || {})) element.setAttribute(name, value);
      parent.appendChild(element);
    }
    if (options.disabled) {
      element.disabled = true;
      setAttr(element, "disabled", "");
    }
    return element;
  }
  function empty(element) {
    if (typeof element.empty === "function") return element.empty();
    while (element.firstChild) element.removeChild(element.firstChild);
  }
  function descendants(element, predicate, hits = []) {
    if (!element) return hits;
    if (predicate(element)) hits.push(element);
    for (const child of element.children || []) descendants(child, predicate, hits);
    return hits;
  }
  function attribute(element, name) {
    if (!element) return null;
    if (typeof element.getAttribute === "function") return element.getAttribute(name);
    return element.attr && Object.prototype.hasOwnProperty.call(element.attr, name) ? String(element.attr[name]) : null;
  }
  function tagName(element) {
    if (!element) return "";
    if (typeof element.tag === "string") return element.tag.toLowerCase();
    return typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  }
  function first(element, predicate) { return descendants(element, predicate)[0] || null; }
  function focus(element) { if (element && typeof element.focus === "function") element.focus(); }
  function sourceName(snapshot) {
    const source = plain(snapshot.source_selection) ? snapshot.source_selection : null;
    return source && source.selected === true ? text(source.display_name) || "선택한 자료" : "";
  }
  function sourceOptions(snapshot) {
    if (!Array.isArray(snapshot.source_options)) return [];
    return snapshot.source_options.filter((source) => plain(source) && text(source.path) && text(source.title));
  }
  function providerOptions(snapshot) {
    if (!Array.isArray(snapshot.provider_options)) return [];
    return snapshot.provider_options
      .filter((provider) => plain(provider) && text(provider.profile_id || provider.provider_key))
      .map((provider) => ({
        ...provider,
        provider_key: text(provider.profile_id || provider.provider_key),
        name: text(provider.name || provider.provider_key || provider.profile_id),
        configured: snapshot.provider_readiness
          ? snapshot.provider_readiness.ready === true
          : provider.configured === true,
      }));
  }
  function inboxCounts(inbox) {
    if (!plain(inbox)) return null;
    const keys = ["scanned_total", "eligible", "held", "processed", "succeeded", "failed"];
    if (keys.some((key) => !Number.isSafeInteger(inbox[key]) || inbox[key] < 0)) return null;
    if (inbox.eligible + inbox.held !== inbox.scanned_total || inbox.processed > inbox.eligible || inbox.succeeded + inbox.failed > inbox.processed) return null;
    const pending = Number.isSafeInteger(inbox.pending) && inbox.pending >= 0 ? inbox.pending : inbox.eligible;
    const unchanged = Number.isSafeInteger(inbox.unchanged) && inbox.unchanged >= 0 ? inbox.unchanged : 0;
    if (pending + unchanged !== inbox.eligible || inbox.processed > pending) return null;
    return Object.freeze({
      ...Object.fromEntries(keys.map((key) => [key, inbox[key]])),
      pending,
      unchanged,
    });
  }
  function projectLifecycleSnapshot(snapshot) {
    const operation = plain(snapshot.operation_run) ? snapshot.operation_run : {};
    const followUp = plain(operation.follow_up) ? operation.follow_up : plain(operation.durable_outcome && operation.durable_outcome.follow_up) ? operation.durable_outcome.follow_up : null;
    const inbox = plain(snapshot.inbox) ? snapshot.inbox : null;
    const fleeting = plain(snapshot.fleeting) ? snapshot.fleeting : null;
    const risks = Array.isArray(snapshot.risk_packets) ? snapshot.risk_packets : [];
    const conflicts = risks.filter((packet) => Array.isArray(packet?.conflict?.blocking_conflict_ids) && packet.conflict.blocking_conflict_ids.length > 0);
    const approvals = risks.filter((packet) => !conflicts.includes(packet));
    let productState = snapshot.status;
    const goldenWiki = plain(snapshot.golden_wiki) ? snapshot.golden_wiki : null;
    const goldenPriority = goldenWiki && ["consent_required", "running", "complete", "scope_required", "failed"].includes(text(goldenWiki.status));
    const explicitSourceSelection = snapshot.status === "selecting" && plain(snapshot.source_selection) && snapshot.source_selection.selected === true;
    const explicitSourcePicker = snapshot.status === "selecting" && Array.isArray(snapshot.source_options) && snapshot.source_options.length > 0;
    if (operation.status === "committed") productState = followUp?.refresh?.status === "failed" ? "operation_refresh_failed"
      : ["pending", "running"].includes(followUp?.refresh?.status) ? "operation_refresh_pending"
        : followUp?.git?.status === "failed" ? "git_failed" : ["pending", "running"].includes(followUp?.git?.status) ? "git_pending" : "committed";
    else if (goldenPriority) productState = snapshot.status;
    else if (risks.length && ["review", "review_only"].includes(snapshot.status)) productState = "review";
    else if (explicitSourceSelection || explicitSourcePicker) productState = "selecting";
    else if (inbox && ["blocked", "outcome_unknown"].includes(inbox.state)) productState = `inbox_${inbox.state}`;
    else if (inbox && ["queued", "analyzing", "cancelled"].includes(inbox.state)) productState = `inbox_${inbox.state}`;
    else if (operation.status === "committed" && followUp?.refresh?.status === "failed") productState = "operation_refresh_failed";
    else if (operation.status === "committed" && ["pending", "running"].includes(followUp?.refresh?.status)) productState = "operation_refresh_pending";
    else if (operation.status === "committed" && followUp?.git?.status === "failed") productState = "git_failed";
    else if (operation.status === "committed" && ["pending", "running"].includes(followUp?.git?.status)) productState = "git_pending";
    else if (operation.status === "committed" && followUp?.status === "complete") productState = "committed";
    else if (snapshot.recovery_outcome) productState = "recovery";
    else if (["idle", "selecting"].includes(snapshot.status) && operation.status === "provider_pending") productState = "inbox_importing";
    else if (["idle", "selecting"].includes(snapshot.status) && operation.status === "failed") productState = "inbox_error";
    else if (["idle", "selecting"].includes(snapshot.status) && operation.status === "cancelled") productState = "inbox_cancelled";
    else if (["idle", "selecting"].includes(snapshot.status) && operation.status === "no_change") productState = "inbox_ignored";
    else if (["idle", "selecting"].includes(snapshot.status) && inbox && ["empty", "queued", "analyzing", "complete", "partial", "protected", "up_to_date", "importing", "ignored", "private", "error", "cancelled", "blocked", "outcome_unknown"].includes(inbox.state)) productState = `inbox_${inbox.state}`;
    if (plain(snapshot.migration) && snapshot.migration.status && risks.length === 0) productState = `migration_${snapshot.migration.status}`;
    return Object.freeze({ productState, inbox, fleeting, followUp, approvals, conflicts, migration: plain(snapshot.migration) ? snapshot.migration : null });
  }

  function prodigyWikiSnapshot(snapshot) {
    if (plain(snapshot.prodigy_wiki)) return snapshot.prodigy_wiki;
    const source = plain(snapshot.source_selection) && snapshot.source_selection.selected === true ? {
      path: text(snapshot.source_selection.source_path),
      title: text(snapshot.source_selection.display_name),
      source_kind: text(snapshot.source_selection.source_kind),
      content_hash: text(snapshot.source_selection.content_hash),
    } : null;
    const golden = plain(snapshot.golden_wiki) ? snapshot.golden_wiki : {};
    const state = golden.status === "ready" ? "source_selected"
      : golden.status === "scope_required" ? "range_required"
        : golden.status === "consent_required" ? "consent_required"
          : golden.status === "running" ? "running"
            : golden.status === "complete" ? "review_ready"
              : golden.status === "failed" ? "interrupted"
                : source ? "source_selected" : "idle";
    return {
      status: state,
      picker_open: snapshot.status === "selecting" && !source,
      source,
      range: golden.scope || null,
      result: golden.result || null,
      stage: text(golden.stage),
      reason: text(golden.reason),
      resumable: false,
    };
  }

  function mountLlmWikiLifecycleView(options = {}) {
    wikiUI ||= root.ProdigyWikiWorkspaceView;
    const container = options.container;
    if (!container) throw new TypeError("container is required");
    if (!validSnapshot(options.snapshot)) throw new TypeError("valid controller snapshot is required");
    if (typeof options.onAction !== "function") throw new TypeError("onAction callback is required");

    let snapshot = options.snapshot;
    let pendingAction = null;
    let frame = null, decision = null, pickerOpen = false, tentativeSource = "", tentativeRange = "";
    let stateDetails = null, retainedRisk = null, appliedRisk = false;
    const detailHost = parent => {
      if (!stateDetails) { stateDetails = createEl(parent, "details", { attr: { "data-disclosure": "state-details" } }); createEl(stateDetails, "summary", { text: "상세 정보" }); }
      return stateDetails;
    };
    if (stylesApi && typeof stylesApi.ensureStyles === "function") stylesApi.ensureStyles(container.ownerDocument);
    function currentProdigyWikiModel() {
      return prodigyWikiApi && typeof prodigyWikiApi.deriveViewModel === "function"
        ? prodigyWikiApi.deriveViewModel(prodigyWikiSnapshot(snapshot))
        : { product_id: "prodigy-wiki", state: "idle", primary_action: null, title: "Prodigy Wiki", description: "", primary_label: "" };
    }

    function actionButton(parent, label, action, intent, buttonOptions = {}) {
      const control = createEl(parent, "button", {
        text: label,
        attr: {
          type: "button",
          class: "prodigy-btn" + (buttonOptions.primary ? " prodigy-btn-primary" : ""),
          "data-action": action,
          "data-intent-action": intent.action,
          "data-emitted-action": intent.action,
          "data-focus-key": action,
          "data-primary": buttonOptions.primary ? "true" : "false",
          ...(buttonOptions.recoveryAction ? { "data-recovery-action": buttonOptions.recoveryAction } : {}),
          "aria-label": buttonOptions.ariaLabel || label,
        },
        disabled: buttonOptions.disabled,
      });
      if (!buttonOptions.disabled) control.onclick = (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (buttonOptions.confirmMessage
          && typeof root.confirm === "function"
          && root.confirm(buttonOptions.confirmMessage) !== true) return;
        if (intent.action === "select_source" && !intent.source_path) { appliedRisk = false; retainedRisk = null; pickerOpen = true; tentativeSource = ""; render(); return; }
        return dispatch(intent);
      };
      return control;
    }

    function dispatch(intent) {
      if (pendingAction !== null || !plain(intent) || typeof intent.action !== "string") return false;
      pendingAction = intent.action;
      if (intent.action === "approve_risk") retainedRisk = snapshot.risk_packets?.find(packet => packet.packet_id === intent.packet_id) || null;
      for (const control of descendants(frame, (node) => attribute(node, "data-intent-action") === intent.action)) {
        control.disabled = true;
        setAttr(control, "disabled", "");
        control.onclick = null;
      }
      let result;
      try { result = options.onAction(Object.freeze({ ...intent })); }
      catch (error) { pendingAction = null; render(); throw error; }
      const settled = response => {
        const sourceConfirmed = intent.action === "select_source" && intent.source_path;
        if (sourceConfirmed) pickerOpen = response?.ok !== true;
        if (intent.action === "approve_risk" && retainedRisk && response?.ok === true && ["committed", "completed", "processed"].includes(response.status)) appliedRisk = true;
        if (pendingAction === intent.action || appliedRisk || sourceConfirmed) { pendingAction = null; render(); }
        if (response?.ok === false && !["failed", "stale_reconfirm_required", "committed_audit_pending", "committed_refresh_failed"].includes(snapshot.status)) {
          statusRegion(frame, recoveryApi?.mapRecovery?.(response)?.copy || `확인할 항목: ${response.reason}`, "error");
        }
        return response;
      };
      if (result?.then) return Promise.resolve(result).then(settled, error => { pendingAction = null; render(); statusRegion(frame, `작업 실패: ${error.message}`, "error"); throw error; });
      // Synchronous controllers acknowledge through update(); do not fabricate a transition.
      return result === undefined ? true : result;
    }

    function statusRegion(parent, copy, state = "info") {
      return createEl(parent, "div", {
        text: copy,
        attr: {
          class: "llmwiki-lifecycle__status prodigy-status-line",
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true",
          "aria-busy": ["running", "committing"].includes(snapshot.status) || ["queued", "analyzing"].includes(snapshot.inbox && snapshot.inbox.state) ? "true" : "false",
          "data-state": state,
        },
      });
    }

    function splitRecoveryTail(value) {
      const sentence = text(value);
      const tail = RECOVERY_ATOMIC_TAILS.find((candidate) => sentence.endsWith(candidate)) || "";
      return { lead: tail ? sentence.slice(0, -tail.length).trimEnd() : sentence, tail };
    }

    function recoveryStatusRegion(parent, lead) {
      const parts = splitRecoveryTail(`${lead} ${RECOVERY_ATOMIC_TAILS[0]}`);
      const status = statusRegion(parent, parts.lead ? `${parts.lead} ` : "", "error");
      setAttr(status, "data-atomic-recovery-copy", "true");
      if (parts.tail) createEl(status, "span", { text: parts.tail, attr: { "data-recovery-atomic-tail": "pending-material-retained" } });
      return status;
    }

    function sourceContext(parent) {
      const name = sourceName(snapshot);
      const source = plain(snapshot.source_selection) ? snapshot.source_selection : {};
      if (!name) return null;
      const section = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__source", "aria-label": "자료와 범위", "data-source-selected-card": "" } });
      createEl(section, "h2", { text: name, attr: { class: "llmwiki-lifecycle__source-name", "data-selected-source-title": "" } });
      const selectedRange = plain(snapshot.prodigy_wiki?.range)
        ? snapshot.prodigy_wiki.range : plain(snapshot.golden_wiki?.scope) ? snapshot.golden_wiki.scope : null;
      createEl(section, "p", { text: `정리 범위: ${selectedRange ? text(selectedRange.title) : "전체 자료"}`, attr: { "data-selected-range": text(selectedRange?.scope_id || selectedRange?.range_id) } });
      const excerpt = selectedRange?.preview || snapshot.prodigy_wiki?.source?.preview || source.preview;
      if (excerpt) createEl(section, "p", { text: excerpt, attr: { class: "wiki-source-excerpt", "data-selected-range-preview": "" } });
      const details = detailHost(parent);
      if (text(source.source_path)) createEl(details, "code", { text: text(source.source_path), attr: { "data-selected-source-path": "" } });
      if (text(source.content_hash)) createEl(details, "p", { text: `선택 당시 원문 · ${text(source.content_hash).slice(0, 12)}`, attr: { "data-selected-source-revision": text(source.content_hash) } });
      createEl(details, "p", { text: `${source.source_kind === "inbox" ? "내 자료" : "문헌"} · AI Runtime 연결`, attr: { "data-selected-source-technical-boundary": "" } });
      return section;
    }

    function actionRow(parent) { return createEl(parent, "div", { attr: { class: "llmwiki-lifecycle__actions" } }); }

    function providerPicker(parent) {
      const options = providerOptions(snapshot);
      const selected = options.find((option) => text(option.profile_id || option.provider_key) === text(snapshot.provider_key));
      if (!selected) return null;
      const section = createEl(parent, "details", { attr: { class: "llmwiki-lifecycle__provider", "aria-label": "Prodigy Wiki AI 연결", "data-disclosure": "provider-details" } });
      createEl(section, "summary", { text: "AI Runtime", attr: { class: "llmwiki-lifecycle__provider-label" } });
      const model = text(selected.model || selected.route_class);
      const current = createEl(section, "div", {
        attr: {
          class: "llmwiki-lifecycle__provider-current",
          "data-provider-inheritance": "runtime",
          "data-provider-key": text(selected.profile_id || selected.provider_key),
          "data-provider-model": model,
          "data-provider-ready": String(snapshot.provider_readiness?.ready === true),
          "data-provider-readiness-code": text(snapshot.provider_readiness?.code) || (selected.configured === true ? "ready" : "configuration_required"),
        },
      });
      createEl(current, "span", { text: text(selected.name || selected.profile_id), attr: { class: "llmwiki-lifecycle__provider-name" } });
      if (model || selected.configured !== true) {
        const detail = createEl(current, "div", { attr: { class: "llmwiki-lifecycle__provider-detail" } });
        createEl(detail, "span", { text: " · ", attr: { class: "llmwiki-lifecycle__provider-separator", "aria-hidden": "true" } });
        if (model) {
          const modelEl = createEl(detail, "div", { attr: { class: "llmwiki-lifecycle__provider-model" } });
          modelSegments(model).forEach((segment) => {
            createEl(modelEl, "div", { text: segment, attr: { class: "llmwiki-lifecycle__provider-model-line" } });
          });
        }
        if (selected.configured !== true) createEl(detail, "span", { text: "설정 필요", attr: { class: "llmwiki-lifecycle__provider-readiness" } });
      }
      if (text(snapshot.provider_selection_error)) createEl(section, "p", { text: text(snapshot.provider_selection_error), attr: { class: "llmwiki-lifecycle__provider-error", role: "alert" } });
      return section;
    }

    function renderMigration(parent, projected) {
      const migration = projected.migration;
      if (!migration) return false;
      if (migration.status === "review") {
        statusRegion(parent, "기존 자료의 마이그레이션 분류가 준비되었습니다. 승인 전에는 지식을 쓰지 않습니다.");
        const list = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__migration", "data-state-id": "migration_review", "aria-label": "마이그레이션 검토" } });
        for (const decision of migration.decisions || []) {
          const row = createEl(list, "article", { attr: { class: "prodigy-utility-card", "data-operation-kind": decision.kind, "data-decision-id": decision.decision_id } });
          createEl(row, "h3", { text: decision.title || decision.path || OPERATION_LABELS[decision.kind] || decision.kind });
          const descriptor = [OPERATION_LABELS[decision.kind] || decision.kind, decision.path || ""].filter(Boolean).join(" · ");
          createEl(row, "p", { text: descriptor, attr: { class: "llmwiki-lifecycle__migration-path" } });
          createEl(row, "p", { text: decision.kind === "conflict" ? "충돌을 먼저 해결해야 합니다." : "변경 전후 내용을 확인할 준비가 되었습니다." });
          actionButton(row, decision.kind === "conflict" ? "충돌로 차단됨" : "변경안 검토", "review-migration", { action: "review_migration", decision_id: decision.decision_id }, { disabled: decision.kind === "conflict", primary: decision.kind !== "conflict" });
          if (decision.kind === "conflict") actionButton(row, "새 분류 검사", "migration-conflict-repacket", { action: "scan_migration" }, { primary: true });
        }
        return true;
      }
      if (migration.status === "packet_ready" && migration.packet) {
        statusRegion(parent, "마이그레이션 변경안을 최종 확인해 주세요.");
        const operation = migration.packet.operation;
        const target = operation.destination_ids[0];
        const frame = createEl(parent, "section", { attr: { class: "llmwiki-approval-review", "data-state-id": "migration_packet_ready" } });
        createEl(frame, "h3", { text: OPERATION_LABELS[operation.kind] || operation.kind });
        createEl(frame, "h4", { text: "변경 전" });
        createEl(frame, "div", { text: readableCanonical(operation.before_bytes[target]) || "새 지식", attr: { class: "llmwiki-lifecycle__document-preview" } });
        createEl(frame, "h4", { text: "변경 후" });
        createEl(frame, "div", { text: readableCanonical(operation.after_bytes[target]), attr: { class: "llmwiki-lifecycle__document-preview" } });
        actionButton(frame, "마이그레이션 승인", "approve-migration", { action: "approve_migration", packet_hash: migration.packet.packet_hash }, { primary: true });
        return true;
      }
      if (["committed", "no_change"].includes(migration.status)) {
        statusRegion(parent, migration.status === "no_change" ? "이미 반영된 지식이라 변경하지 않았습니다." : "마이그레이션을 안전하게 반영했습니다.");
        const resurfacing = createEl(parent, "section", { attr: { class: "prodigy-utility-card", "data-state-id": "resurfacing_feedback", "aria-label": "관련 지식 피드백" } });
        createEl(resurfacing, "h3", { text: "왜 표시됐나요?" });
        createEl(resurfacing, "p", { text: "방금 승인한 자료와 같은 근거·관계가 있어 표시했습니다." });
        actionButton(resurfacing, "관련 없음", "resurfacing-feedback", { action: "resurfacing_feedback", feedback: "irrelevant" });
        return true;
      }
      if (migration.status === "stale") {
        statusRegion(parent, "검토 중 원본이 바뀌어 마이그레이션을 중단했습니다.", "error");
        actionButton(actionRow(parent), "새 검토 패킷 만들기", "migration-repacket", { action: "scan_migration" }, { primary: true });
        return true;
      }
      if (migration.status === "refresh_failed") {
        statusRegion(parent, "지식은 반영됐지만 파생 데이터 새로고침에 실패했습니다.", "error");
        createEl(parent, "p", { text: "마지막으로 정상 확인된 탐색 결과를 유지합니다.", attr: { class: "llmwiki-lifecycle__muted" } });
        actionButton(actionRow(parent), "파생 데이터 다시 만들기", "retry-migration-refresh", { action: "retry_migration_refresh" }, { primary: true });
        return true;
      }
      if (migration.status === "git_backup_pending") {
        statusRegion(parent, "지식 반영 완료 · Git 백업 보류");
        actionButton(actionRow(parent), "백업 다시 시도", "retry-migration-git", { action: "retry_migration_git" }, { primary: true });
        return true;
      }
      if (migration.status === "recovery_presented") {
        statusRegion(parent, "복구 상태를 확인했습니다. 원본 바이트와 감사 기록을 유지합니다.");
        return true;
      }
      if (["commit_failed_restored", "compensation_required"].includes(migration.status)) {
        statusRegion(parent, migration.status === "commit_failed_restored" ? "반영에 실패해 원래 바이트로 복구했습니다." : "일부 변경의 수동 복구가 필요합니다.", "error");
        const actions = actionRow(parent);
        actionButton(actions, "복구 상태 확인", "migration-recovery", { action: "migration_recovery" }, { primary: true });
        return true;
      }
      return false;
    }

    function renderIdle(parent, copy = "") {
      const intro = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__intro prodigy-full-bleed" } });
      createEl(intro, "h2", { text: options.getIntendedTarget?.() ? "추가할 자료를 선택하세요" : "정리할 자료를 선택하세요" });
      createEl(intro, "p", { text: copy || "AI가 변경안을 준비하고, 승인한 내용만 문서에 적용합니다." });
      actionButton(decision, "자료 선택", "select-source", { action: "select_source" }, { primary: true });
    }

    function renderPicker(parent) {
      const optionsList = sourceOptions(snapshot).filter(row => row.eligible !== false && row.blocked !== true);
      createEl(parent, "h2", { text: options.getIntendedTarget?.() ? "추가할 자료를 선택하세요" : "정리할 자료를 선택하세요" });
      if (options.getIntendedTarget?.()) createEl(parent, "p", { text: `대상: ${wikiUI.title(options.getIntendedTarget())}` });
      const search = createEl(parent, "input", { attr: { type: "search", placeholder: "제목 또는 경로 검색", "aria-label": "제목 또는 경로 검색" } });
      const choices = createEl(parent, "div", { attr: { "data-source-choices": "", role: "radiogroup", "aria-label": "자료 선택" } });
      const rows = optionsList.map(option => {
        const row = createEl(choices, "button", { attr: { type: "button", role: "radio", "aria-checked": String(option.path === tentativeSource), "data-source-option": option.path } });
        createEl(row, "span", { text: option.title }); createEl(row, "small", { text: option.source_kind === "inbox" ? "내 자료" : "문헌" });
        const check = createEl(row, "span", { text: "✓", attr: { "aria-hidden": "true" } }); check.hidden = option.path !== tentativeSource;
        row.onclick = () => { tentativeSource = option.path; rows.forEach(entry => { setAttr(entry.row, "aria-checked", String(entry.option.path === tentativeSource)); entry.check.hidden = entry.option.path !== tentativeSource; }); confirm.disabled = false; };
        return { row, option, check };
      });
      search.oninput = () => { const query = text(search.value).toLocaleLowerCase("ko"); rows.forEach(({ row, option }) => row.hidden = !`${option.title} ${option.path}`.toLocaleLowerCase("ko").includes(query)); };
      const cancel = createEl(decision, "button", { text: "취소", attr: { type: "button", "data-action": "cancel-source-picker" } });
      cancel.onclick = () => { pickerOpen = false; tentativeSource = ""; if (snapshot.prodigy_wiki?.picker_open) dispatch({ action: "cancel_picker" }); else render(); options.onPickerCancel?.(); };
      const confirm = createEl(decision, "button", { text: optionsList.length ? "선택 완료" : "자료 추가", attr: { type: "button", "data-action": "confirm-source-selection", "data-primary": "true" } });
      confirm.disabled = optionsList.length > 0 && !tentativeSource;
      confirm.onclick = () => { if (!optionsList.length) return options.workspace?.onCapture?.(); if (!tentativeSource) return; return dispatch({ action: "select_source", source_path: tentativeSource }); };
      if (!optionsList.length) createEl(parent, "p", { text: "선택할 자료가 없습니다." });
      if (snapshot.source_selection?.blocked_reason) createEl(parent, "p", { text: `! ${snapshot.source_selection.blocked_reason}`, attr: { role: "alert" } });
    }

    function renderWorkspaceSelecting(parent) {
      if (!sourceName(snapshot)) return renderPicker(parent);
      const golden = snapshot.golden_wiki || {};
      if (golden.status === "scope_required") {
        createEl(parent, "h2", { text: sourceName(snapshot) });
        createEl(parent, "p", { text: "자료가 큽니다. 먼저 정리할 부분을 선택하세요." });
        const search = createEl(parent, "input", { attr: { type: "search", placeholder: "제목 검색", "aria-label": "정리할 범위 검색", "data-range-search": "true" } });
        const rows = [];
        const mountRange = (range, host) => {
          const row = createEl(host, "label", { attr: { "data-range-id": range.range_id || range.scope_id } });
          const input = createEl(row, "input", { attr: { type: "radio", name: "source-range", value: range.scope_id, "data-select-range-id": range.range_id || range.scope_id } });
          input.checked = tentativeRange === range.scope_id;
          input.onchange = () => { tentativeRange = range.scope_id; rows.forEach(entry => entry.input.checked = entry.range.scope_id === tentativeRange); confirm.disabled = false; };
          createEl(row, "strong", { text: range.title });
          createEl(row, "small", { text: ({ short: "짧음", medium: "보통", large: "큼" })[range.size] || "보통" });
          createEl(row, "p", { text: range.preview || "", attr: { class: "wiki-source-excerpt", "data-range-preview": range.range_id || range.scope_id } });
          rows.push({ row, range, input });
          for (const child of range.children || []) mountRange(child, host);
        };
        const tree = createEl(parent, "section", { attr: { "data-range-tree": "" } });
        for (const range of golden.result?.range_tree || golden.result?.scopes || []) mountRange(range, tree);
        search.oninput = () => { const query = text(search.value).toLocaleLowerCase("ko"); rows.forEach(({ row, range }) => row.hidden = !text(range.title).toLocaleLowerCase("ko").includes(query)); };
        actionButton(decision, "자료 변경", "select-source", { action: "select_source" });
        const confirm = actionButton(decision, "이 범위 선택", "confirm-range", { action: "select_golden_scope" }, { primary: true }); confirm.disabled = !tentativeRange;
        confirm.onclick = () => tentativeRange && dispatch({ action: "select_golden_scope", scope_id: tentativeRange });
        createEl(detailHost(parent), "pre", { text: JSON.stringify(golden.result?.limits || { chunks: golden.result?.chunks, packs: golden.result?.packs }, null, 2) });
        return;
      }
      sourceContext(parent);
      const actions = actionRow(parent);
      actionButton(actions, "자료 변경", "select-source", { action: "select_source" });
      actionButton(actions, "범위 변경", "change-range", { action: "change_golden_range" });
      actionButton(actions, "원문 열기", "open-selected-source", { action: "open_selected_source" });
      createEl(decision, "p", { text: "다음 화면에서 외부 AI 전송 범위를 확인합니다.", attr: { "data-decision-status": "" } });
      actionButton(decision, "정리하기", "request-consent", { action: "request_consent" }, { primary: true });
      if (snapshot.provider_selection_error) {
        statusRegion(parent, "AI 연결 설정을 확인해야 합니다.", "error");
        createEl(detailHost(parent), "p", { text: snapshot.provider_selection_error });
        actionButton(parent, "AI 설정 열기", "open-ai-settings", { action: "open_ai_settings" });
      }
    }

    function renderConsent(parent) {
      createEl(parent, "h2", { text: "외부 AI로 보낼 내용을 확인하세요" });
      sourceContext(parent);
      const provider = providerPicker(parent); if (provider) provider.open = true;
      createEl(parent, "p", { text: "선택한 범위를 외부 AI로 보냅니다. 정식 문서는 승인 전까지 변경하지 않습니다." });
      const scope = actionButton(parent, "전송 내용 보기", "inspect-outbound-scope", { action: "inspect_outbound_scope" });
      if (options.onInspectScope) scope.onclick = () => options.onInspectScope(snapshot, scope);
      actionButton(parent, "AI 설정", "open-ai-settings", { action: "open_ai_settings" });
      actionButton(decision, "취소", "cancel-run", { action: "cancel" });
      actionButton(decision, "동의하고 정리하기", "start-run", { action: "start_run" }, { primary: true });
    }

    function renderProgress(parent) {
      const committing = snapshot.status === "committing";
      const golden = plain(snapshot.golden_wiki) && snapshot.golden_wiki.status === "running";
      const model = currentProdigyWikiModel();
      const stageLabels = { preflight: "정리 범위를 확인하고 있습니다.", planning: "문서 구성을 준비하고 있습니다.", compiling: "문서를 정리하고 있습니다.", gating: "내용과 출처를 확인하고 있습니다.", saving: "검토용 초안을 저장하고 있습니다." };
      statusRegion(parent, golden ? stageLabels[text(snapshot.golden_wiki.stage)] || model.title : committing ? "승인한 내용을 안전하게 반영하고 있습니다." : "자료를 바탕으로 제안을 만들고 있습니다.");
      sourceContext(parent);
      if (committing && retainedRisk) for (const row of retainedRisk.before_after) wikiUI.exactPreview(createEl(parent, "section"), { before: row.before, after: row.after, target_path: row.destination_id, packet_hash: retainedRisk.packet_id }, options);
      createEl(parent, "progress", { attr: { "aria-label": golden ? "Prodigy Wiki 생성 진행 중" : committing ? "승인 반영 진행 중" : "AI 제안 생성 진행 중" } });
      createEl(decision, "p", { text: committing ? "승인한 변경을 적용하고 있습니다." : "정식 문서는 아직 변경하지 않았습니다.", attr: { "data-decision-status": "" } });
      if (!committing) actionButton(decision, "문서 보관함", "open-library", { action: "open_library" });
      if (!golden && !committing && snapshot.status !== "compensation_committing") actionButton(decision, "취소", "cancel-run", { action: "cancel" });
    }

    function renderGoldenComplete(parent) {
      const result = snapshot.golden_wiki && snapshot.golden_wiki.result;
      const previews = Array.isArray(result && result.previews) ? result.previews : [];
      sourceContext(parent);
      statusRegion(parent, "적용할 변경안을 준비해야 합니다.");
      const execution = detailHost(parent);
      createEl(execution, "p", { text: `자동 검사 통과 · 원문 ${Number(result && result.source_bytes || 0).toLocaleString()} bytes · 외부 AI 연결 ${Number(result && result.provider_calls || 0)}회`, attr: { "data-golden-complete-summary": "" } });
      const list = createEl(parent, "ul", { attr: { "data-golden-complete-list": "" } });
      for (const preview of previews) createEl(list, "li", { text: text(preview.title) });
      actionButton(decision, "변경안 준비", "open-golden-review", { action: "open_golden_review" }, { primary: true });
      actionButton(decision, "다른 자료 선택", "select-source", { action: "select_source" });
    }

    function readableCanonical(value) {
      const bytes = typeof value === "string" ? value : "";
      if (!bytes.startsWith("---\n")) return bytes;
      const boundary = bytes.indexOf("\n---\n", 4);
      return boundary < 0 ? "" : bytes.slice(boundary + 5).trim();
    }

    function renderCanonicalReview(host, packet) {
      const frame = createEl(host, "section", { attr: { class: "llmwiki-approval-review", "data-surface": "llmwiki-approval-review", "aria-label": "변경안 확인" } });
      createEl(frame, "h2", { text: wikiUI.title(packet.target_path) });
      const storage = createEl(frame, "fieldset", { attr: { class: "wiki-storage-choices", "data-storage-choices": "" } });
      createEl(storage, "legend", { text: "저장 방식" });
      for (const [kind, label] of [["create", "새 문서로 저장"], ["update", "기존 문서에 내용 추가"]]) {
        const row = createEl(storage, "label"); const input = createEl(row, "input", { attr: { type: "radio" } }); input.checked = kind === packet.operation?.proposal_kind; input.disabled = true; createEl(row, "span", { text: label });
      }
      const exact = createEl(frame, "section"); wikiUI.exactPreview(exact, { before: packet.before_bytes, after: packet.after_bytes, target_path: packet.target_path, packet_hash: packet.packet_hash }, options);
      for (const citation of Array.isArray(packet.source_citations) ? packet.source_citations : []) {
        const locator = text(Array.isArray(citation.locators) ? citation.locators[0] : "");
        if (!locator) continue;
        const source = actionButton(frame, wikiUI.title(locator.split("#")[0]), "open-source", { action: "open_source", source_path: locator });
        source.onclick = () => options.reviewOptions?.onOpenBeside?.(locator);
      }
      const label = createEl(decision, "label"); const acknowledgement = createEl(label, "input", { attr: { type: "checkbox", "data-review-acknowledgement": "" } }); acknowledgement.checked = false;
      createEl(label, "span", { text: "변경 내용과 출처를 확인했습니다." });
      const reason = createEl(decision, "p", { text: "변경 내용과 출처를 확인하고 체크하세요.", attr: { "data-decision-status": "" } });
      const actions = createEl(decision, "div", { attr: { "data-decision-actions": "" } });
      actionButton(actions, "나중에", "later", { action: "later" });
      const approve = actionButton(actions, "승인 및 적용", "approve-selected", { action: "approve", packet_hash: text(packet.packet_hash) }, { primary: true }); approve.disabled = true;
      acknowledgement.onchange = () => { approve.disabled = !acknowledgement.checked; reason.hidden = acknowledgement.checked; };
      approve.onclick = () => acknowledgement.checked && dispatch({ action: "approve", packet_hash: text(packet.packet_hash) });
    }

    function renderReview(parent) {
      if (snapshot.status === "review_only") statusRegion(parent, "적용 전에 확인할 항목이 있습니다.");
      if (snapshot.question_review_note) createEl(parent, "p", { text: snapshot.question_review_note, attr: { role: "note" } });
      const counts = inboxCounts(snapshot.inbox);
      if (counts) renderInboxMetadata(detailHost(parent), snapshot.inbox, counts);
      const host = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__review", "aria-label": "제안 검토", tabindex: "-1" } });
      const child = reviewModule(options.reviewView);
      const reviewOptions = plain(options.reviewOptions) ? options.reviewOptions : {};
      const projected = projectLifecycleSnapshot(snapshot);
      const riskPackets = [...projected.approvals, ...projected.conflicts];
      const riskPacketApi = root.LLMWikiRiskApprovalPacket;
      const activeRiskPackets = riskPacketApi && typeof riskPacketApi.verifyRiskApprovalPacket === "function"
        ? riskPackets.filter((item) => riskPacketApi.verifyRiskApprovalPacket(item).ok === true) : riskPackets;
      if (riskPackets.length && activeRiskPackets.length === 0) {
        createEl(host, "p", { text: "검토 결정을 안전하게 마무리하고 있습니다.", attr: { class: "llmwiki-lifecycle__muted", role: "status" } });
        return;
      }
      if (activeRiskPackets.length && riskPacketApi && activeRiskPackets.every((item) => riskPacketApi.isRiskApprovalPacket(item)) && child && typeof child.mountRiskApprovalReview === "function") {
        const mountQueue = (packets, label, conflictQueue) => {
          if (!packets.length) return;
          const queue = createEl(host, "section", { attr: { class: "llmwiki-lifecycle__queue", "data-queue": conflictQueue ? "conflicts" : "approval-ready", "aria-label": label } });
          createEl(queue, "h3", { text: label });
          if (conflictQueue) createEl(queue, "p", { text: "충돌은 묶음 승인할 수 없습니다. 내용을 고치거나 거절해 주세요.", attr: { class: "llmwiki-lifecycle__error" } });
          const selectedOperations = new Set(Array.isArray(snapshot.durable_review_selection) ? snapshot.durable_review_selection : []);
          child.mountRiskApprovalReview({
            container: queue, packets, packetApi: riskPacketApi, batchApi: root.LLMWikiSafeBatchApproval, primaryEnabled: true,
            decisionContainer: decision, workspace: options.workspace, renderMarkdown: options.renderMarkdown,
            comparison_status: snapshot.comparison_status,
            initialSelectedIds: packets.filter((packet) => selectedOperations.has(packet.operation.operation_id)).map((packet) => packet.packet_id),
            onSelectionChange(selectedIds) { return dispatch({ action: "persist_review_selection", operation_ids: packets.filter((packet) => selectedIds.includes(packet.packet_id)).map((packet) => packet.operation.operation_id).sort() }); },
            onApprove(packet) { return dispatch({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id }); },
            onReject(packet) { return dispatch({ action: "reject_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id }); },
            onBatchApprove({ packets: selected }) { return conflictQueue ? { ok: false, status: "rejected", reason: "blocking_conflict" } : dispatch({ action: "approve_risk_batch", selection_ids: selected.map((item) => item.packet_id).sort() }); },
            onRequestRevisionPrompt({ packet, submit }) {
              if (typeof options.requestRevisionGuidance !== "function") return options.onRevisionRequestPrompt?.({ packet, submit }) || { ok: false, status: "prompt_required" };
              return Promise.resolve(options.requestRevisionGuidance(packet)).then((guidance) => submit(guidance));
            },
            onRequestRevision({ packet, guidance }) { return dispatch({ action: "request_risk_revision", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id, guidance }); },
            onOpenBeside: reviewOptions.onOpenBeside,
            onEditSource: reviewOptions.onEditSource,
            resolveSourcePreview: reviewOptions.resolveSourcePreview,
          });
        };
        const eligibleActive = projected.approvals.filter((packet) => activeRiskPackets.includes(packet));
        const conflictActive = projected.conflicts.filter((packet) => activeRiskPackets.includes(packet));
        mountQueue([...eligibleActive, ...conflictActive], "변경안", false);
        return;
      }
      const packet = plain(snapshot.approval_packet) ? snapshot.approval_packet : null;
      if (packet && packet.packet_version === "llmwiki_canonical_packet_v1") {
        renderCanonicalReview(host, packet);
        return;
      }
      if (!packet || !child || typeof child.mountLlmWikiApprovalReview !== "function") {
        createEl(host, "p", { text: "승인 검토 화면을 불러오지 못했습니다. 저장 작업은 시작되지 않았습니다.", attr: { class: "llmwiki-lifecycle__error", role: "alert" } });
      } else {
        child.mountLlmWikiApprovalReview({
          container: host,
          packet,
          approvalApi: reviewOptions.approvalApi,
          onOpenBeside: reviewOptions.onOpenBeside,
          onEditSource: reviewOptions.onEditSource,
          resolveSourcePreview: reviewOptions.resolveSourcePreview,
          buildCommitRequest({ authorizationResult }) {
            return { authorization: authorizationResult && authorizationResult.value ? authorizationResult.value : authorizationResult };
          },
          commitApi: {
            commitApprovedCanonical() {
              dispatch({ action: "approve", packet_hash: text(packet.packet_hash) });
              return { ok: false, status: "controller_pending", reason: "controller_action_dispatched", write_counts: { ...ZERO_WRITES } };
            },
          },
        });
      }
    }

    function renderRetainedRisk(parent) {
      options.workspace?.setJourney({ status: "applied" });
      createEl(parent, "h2", { text: retainedRisk.summary });
      for (const row of retainedRisk.before_after) {
        const target = createEl(parent, "section"); wikiUI.exactPreview(target, { before: row.before, after: row.after, target_path: row.destination_id, packet_hash: retainedRisk.packet_id }, options);
        const link = createEl(parent, "a", { text: wikiUI.title(row.destination_id), attr: { href: row.destination_id, "data-applied-document": row.destination_id } });
        link.onclick = event => { event?.preventDefault?.(); options.reviewOptions?.onOpenBeside?.(row.destination_id); };
      }
      statusRegion(decision, "문서에 적용했습니다.");
      const remaining = snapshot.risk_packets?.filter(packet => packet.packet_id !== retainedRisk.packet_id) || [];
      if (remaining.length) {
        const next = createEl(decision, "button", { text: "다음 제안 확인", attr: { type: "button", "data-action": "next-proposal" } }); next.onclick = () => { appliedRisk = false; retainedRisk = null; render(); };
      } else actionButton(decision, "다른 자료 선택", "select-source", { action: "select_source" });
      actionButton(decision, "문서 열기", "open-applied-document", { action: "open_document", path: retainedRisk.operation.destination_ids[0] }, { primary: true });
    }

    function renderCommitted(parent) {
      statusRegion(parent, "문서에 적용했습니다.");
      sourceContext(parent);
      const links = plain(snapshot.links) ? snapshot.links : {};
      const list = createEl(parent, "ul", { attr: { class: "llmwiki-lifecycle__results", "aria-label": "반영 결과" } });
      for (const [key, label] of [["canonical", "반영된 지식"], ["audit", "감사 기록"]]) {
        const item = plain(links[key]) ? links[key] : null;
        if (!item || !text(item.path)) continue;
        const row = createEl(list, "li");
        createEl(row, "a", { text: `${label}: ${item.path}`, attr: { href: item.path, "data-display-only": "true" } });
      }
      const actions = decision;
      const compensation = plain(snapshot.compensation) ? snapshot.compensation : null;
      if (compensation && compensation.eligible && compensation.confirmation_required) {
        createEl(parent, "p", {
          text: "이 승인된 변경만 정확히 되돌립니다. 계속하려면 다시 확인하세요.",
          attr: { class: "llmwiki-lifecycle__muted", role: "status" },
        });
        actionButton(actions, "되돌리기 확인", "confirm-compensation", { action: "confirm_compensation" }, { primary: true });
      } else if (compensation && compensation.eligible) {
        actionButton(options.workspace?.more || actions, "이 변경 되돌리기", "request-compensation", { action: "request_compensation" });
      }
      if (links.canonical?.path) actionButton(actions, "문서 열기", "open-applied-document", { action: "open_document", path: links.canonical.path }, { primary: true });
      actionButton(actions, "다른 자료 선택", "select-source", { action: "select_source" }, { primary: !links.canonical?.path });
    }

    function renderCompensated(parent) {
      const pendingAudit = snapshot.status === "compensated_audit_pending";
      statusRegion(
        parent,
        pendingAudit ? "변경은 되돌렸지만 감사 후속 기록을 확인해야 합니다." : "승인된 변경을 원래 바이트 상태로 되돌렸습니다.",
        pendingAudit ? "error" : "info",
      );
      createEl(parent, "p", {
        text: pendingAudit ? "다른 변경은 건드리지 않았습니다." : "되돌리기 기록과 후속 새로고침을 완료했습니다.",
        attr: { class: "llmwiki-lifecycle__muted" },
      });
      const actions = actionRow(parent);
      actionButton(actions, "새 검토 시작", "select-source", { action: "select_source" }, { primary: true });
    }

    function renderStale(parent) {
      statusRegion(parent, "검토 이후 내용이 바뀌었습니다. 변경안을 다시 확인해야 합니다.", "error");
      sourceContext(parent);
      const actions = decision;
      actionButton(actions, "변경안 다시 준비", "repacket-stale", { action: "repacket_stale" }, { primary: true });
      actionButton(actions, "다시 확인 후 승인", "reconfirm-stale", { action: "reconfirm_stale" }, { disabled: true });
    }

    function renderRecovery(parent, kind) {
      const audit = kind === "audit";
      statusRegion(parent, audit ? "문서는 저장됐지만 확인이 끝나지 않았습니다." : "문서는 저장됐지만 목록 갱신에 실패했습니다.", "error");
      sourceContext(parent);
      const actions = decision;
      actionButton(
        actions,
        audit ? "저장 상태 다시 확인" : "목록 새로고침",
        audit ? "repair-audit" : "retry-refresh",
        { action: audit ? "repair_audit" : "retry_refresh" },
        { primary: true },
      );
    }

    function renderFleeting(parent, fleeting) {
      if (!plain(fleeting)) return;
      const count = Number.isSafeInteger(fleeting.pending_count) && fleeting.pending_count >= 0 ? fleeting.pending_count : 0;
      const state = text(fleeting.status) || "idle";
      if (count === 0 && ["idle", "complete"].includes(state) && (!Array.isArray(fleeting.reviews) || fleeting.reviews.length === 0)) return;
      const section = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__fleeting", "data-fleeting-status": state, "data-fleeting-pending-count": String(count), "aria-label": "미정리 생각" } });
      const copy = state === "blocked"
        ? "미정리 생각 상태를 읽지 못했습니다. 로컬 상태를 복구한 뒤 다시 확인해 주세요."
        : state === "analyzing" ? `미정리 생각 ${count}개를 검토하고 있습니다.`
          : state === "cancelled" ? `생각 정리를 취소했습니다. 미정리 생각 ${count}개가 그대로 남아 있습니다.`
            : state === "partial" || state === "error" ? `일부 생각을 정리하지 못했습니다. 미정리 생각 ${count}개를 다시 확인해 주세요.`
              : `미정리 생각 ${count}개`;
      statusRegion(section, copy, ["blocked", "partial", "error"].includes(state) ? "error" : "info");
      const actions = actionRow(section);
      if (state === "blocked") actionButton(actions, "로컬 상태 복구", "repair-fleeting-state", { action: "repair_fleeting_state" }, { primary: true });
      else if (state === "analyzing") {
        actionButton(actions, "생각 정리 중", "review-fleeting", { action: "review_fleeting" }, { disabled: true, primary: true });
        actionButton(actions, "정리 취소", "cancel-fleeting", { action: "cancel_fleeting" });
      } else if (count > 0) actionButton(actions, "생각 정리", "review-fleeting", { action: "review_fleeting" }, { primary: true });
    }

    function pendingPriority(count) {
      if (count >= 10) return "backlog";
      if (count >= 3) return "emphasized";
      if (count >= 1) return "subtle";
      return "none";
    }

    function protectedReasonLabel(reason) {
      return ({
        protected_source: "보호 폴더라 기기 안에 유지",
        people_local_only: "사람 자료라 기기 안에 유지",
        sensitive_content: "민감 정보가 감지되어 제외",
        mixed_ambiguous_classification: "보호 신호가 충돌하여 제외",
        malformed_inbox_path: "안전한 INBOX 경로가 아니라 제외",
        outside_inbox_boundary: "INBOX 범위 밖이라 제외",
      })[text(reason)] || "로컬 보호 정책에 따라 제외";
    }

    function renderProgressTrack(parent, kind, completed, total, label, attrs = {}) {
      if (!Number.isSafeInteger(total) || total <= 0) return null;
      const safeCompleted = Number.isSafeInteger(completed) ? Math.max(0, Math.min(completed, total)) : 0;
      const track = createEl(parent, "div", {
        attr: { class: "llmwiki-lifecycle__progress-track", "data-progress-kind": kind, ...attrs },
      });
      createEl(track, "span", {
        text: `${label} ${safeCompleted}/${total}`,
        attr: { class: "llmwiki-lifecycle__progress-label", "data-progress-label": "true" },
      });
      createEl(track, "progress", { attr: { value: String(safeCompleted), max: String(total), "aria-label": `${label} ${safeCompleted}/${total}` } });
      return track;
    }

    function renderInboxMetadata(parent, inbox, counts) {
      if (!counts) return;
      const summary = createEl(parent, "section", {
        attr: {
          class: "llmwiki-lifecycle__batch-summary",
          "data-eligible-count": String(counts.eligible),
          "data-protected-count": String(counts.held),
          "aria-label": "배치 범위",
        },
      });
      if (pendingPriority(counts.pending) === "backlog") createEl(summary, "strong", { text: `많이 쌓임 · ${counts.pending}개`, attr: { "data-backlog-label": "true" } });
      const metrics = createEl(summary, "div", { attr: { class: "llmwiki-lifecycle__metrics", "aria-label": "배치 수치" } });
      for (const value of [`분석 가능 ${counts.eligible}개`, `변경 없는 자료 ${counts.unchanged}개`, `보호 유지 ${counts.held}개`]) {
        createEl(metrics, "span", { text: value, attr: { class: "llmwiki-lifecycle__metric" } });
      }

      const protectedItems = Array.isArray(inbox.protected_items)
        ? inbox.protected_items.filter((item) => plain(item) && text(item.filename) && text(item.reason)) : [];
      if (protectedItems.length) {
        const details = createEl(parent, "details", {
          attr: {
            class: "llmwiki-lifecycle__protected",
            "data-disclosure": "protected-sources",
            "data-protected-count": String(protectedItems.length),
          },
        });
        createEl(details, "summary", { text: `보호된 자료 ${protectedItems.length}개`, attr: { "data-focus-key": "protected-sources" } });
        const list = createEl(details, "ul", { attr: { class: "llmwiki-lifecycle__protected-list" } });
        for (const item of protectedItems) {
          const row = createEl(list, "li", { attr: { "data-protected-reason": text(item.reason) } });
          createEl(row, "strong", { text: text(item.filename) });
          createEl(row, "span", { text: protectedReasonLabel(item.reason), attr: { class: "llmwiki-lifecycle__muted" } });
        }
      }

      const pack = plain(inbox.pack_progress) ? inbox.pack_progress : {};
      const total = Number.isSafeInteger(pack.total) && pack.total >= 0 ? pack.total : 0;
      const completed = Number.isSafeInteger(pack.completed) && pack.completed >= 0 ? Math.min(pack.completed, total) : 0;
      renderProgressTrack(parent, "pack", completed, total, "분석 묶음", {
        "data-pack-completed": String(completed),
        "data-pack-total": String(total),
        "data-pack-current": String(Number.isSafeInteger(pack.current) ? pack.current : completed),
      });
      const reviewCount = Number.isSafeInteger(inbox.proposal_pending) && inbox.proposal_pending >= 0
        ? inbox.proposal_pending : Array.isArray(snapshot.risk_packets) ? snapshot.risk_packets.length : 0;
      createEl(parent, "output", {
        text: reviewCount > 0 ? `검토 준비 ${reviewCount}개` : "검토 대기 없음",
        attr: {
          class: "llmwiki-lifecycle__review-state llmwiki-lifecycle__muted",
          "data-review-state": reviewCount > 0 ? "review_ready" : "pending",
          "data-review-count": String(reviewCount),
          "aria-live": "off",
        },
      });
    }

    function recoveryVariant(inbox, state) {
      const supplied = text(inbox.recovery_variant);
      return supplied || (state === "outcome_unknown" ? "outcome_unknown" : recoveryApi?.recoveryVariantFor?.({ code: text(inbox.reason) }) || "blocked");
    }

    function renderTypedRecovery(parent, inbox, state) {
      const variant = recoveryVariant(inbox, state);
      const actions = recoveryApi?.recoveryActions?.(variant) || [];
      const row = actionRow(parent);
      const intentFor = {
        open_ai_settings: { action: "open_ai_settings" },
        retry_analysis: { action: "retry_analysis" },
        repacket: { action: "repacket" },
        later: { action: "later" },
      };
      for (const item of actions) {
        const intent = intentFor[item.action];
        if (!intent) continue;
        actionButton(row, item.label, `recovery-${item.action}`, intent, {
          primary: item.primary === true,
          recoveryAction: item.action,
        });
      }
      setAttr(row, "data-recovery-variant", variant);
    }

    function renderInbox(parent, state) {
      const inbox = plain(snapshot.inbox) ? snapshot.inbox : {};
      const counts = inboxCounts(inbox);
      const reason = text(inbox.reason);
      const authRequired = reason === "provider_auth_required";
      const toolBlocked = reason === "provider_tool_blocked";
      const quotaExhausted = reason === "provider_quota_exhausted";
      const selectedProvider = providerOptions(snapshot).find((option) => text(option.provider_key) === text(snapshot.provider_key));
      const providerName = text(selectedProvider && selectedProvider.name) || "선택한 AI 제공자";
      const antigravitySelected = text(snapshot.provider_key) === "antigravity";
      const unavailable = ["provider_unavailable", "transport_unavailable", "analysis_provider_unavailable", "configuration_unavailable", "provider_auth_required", "provider_tool_blocked"].includes(reason);
      let copy;
      if (counts && state === "protected") copy = "AI 분석 대상이 없습니다. 보호 정책에 따라 자료를 기기 안에 유지합니다.";
      else if (counts && state === "empty") copy = "AI 분석 대상이 없습니다. INBOX에 Markdown 자료를 넣어 주세요.";
      else if (counts && state === "up_to_date") copy = "지식 INBOX가 최신 상태입니다. AI 호출 0회";
      else if (counts && state === "queued") copy = `새로 분석할 자료 ${counts.pending}개 · 0/${counts.pending} 분석 대기`;
      else if (counts && state === "analyzing") copy = `${Math.min(counts.processed + 1, counts.pending)}/${counts.pending} 분석 중 · ${text(inbox.current_title) || "선택한 자료"}`;
      else if (counts && state === "complete") copy = `${counts.processed}/${counts.pending} 분석 완료 · 성공 ${counts.succeeded}개 · 실패 ${counts.failed}개`;
      else if (counts && state === "partial") copy = `${counts.processed}/${counts.pending} 분석 완료 · 성공 ${counts.succeeded}개 · 실패 ${counts.failed}개`;
      else if (counts && state === "error") {
        if (authRequired) copy = antigravitySelected
          ? "Antigravity Google 로그인이 필요합니다. 터미널에서 agy -p \"연결 확인\"을 한 번 실행해 로그인한 뒤 지식 INBOX를 다시 확인해 주세요."
          : `${providerName} 인증이 필요합니다. 설정 → AI에서 인증 정보를 확인한 뒤 지식 INBOX를 다시 확인해 주세요.`;
        else if (toolBlocked) copy = antigravitySelected
          ? "Antigravity가 프로젝트 도구 실행을 시도해 안전 모드에서 차단되었습니다. 중립 실행 환경으로 전환했으니 지식 INBOX를 다시 확인해 주세요."
          : `${providerName} 연결이 안전 모드에서 차단되었습니다. 연결 설정을 확인한 뒤 지식 INBOX를 다시 확인해 주세요.`;
        else if (quotaExhausted) copy = text(inbox.message) || `${providerName} 사용 한도에 도달했습니다. 한도가 초기화되거나 다른 모델을 선택한 뒤 지식 INBOX를 다시 확인해 주세요.`;
        else copy = unavailable ? "사용할 수 있는 AI 연결이 없습니다. 연결을 확인해 주세요." : `${counts.processed}/${counts.pending} 분석을 완료하지 못했습니다.`;
      }
      else if (counts && state === "cancelled") copy = `자료 분석을 취소했습니다. 처리 ${counts.processed}/${counts.pending}`;
      else if (counts && state === "outcome_unknown") copy = "이전 요청의 결과를 확인할 수 없습니다.";
      else if (counts && state === "blocked") copy = ({
        auth: `${providerName} 인증을 확인해야 합니다.`,
        quota: `${providerName} 사용 한도에 도달했습니다.`,
        config: "기본 AI 설정을 확인해야 합니다.",
        provider: `${providerName} 연결을 사용할 수 없습니다.`,
        blocked: "분석이 중단되었습니다.",
      })[recoveryVariant(inbox, state)] || "분석이 중단되었습니다.";
      else {
        const copies = { importing: "새 자료를 읽고 기존 지식과 비교하고 있습니다.", ignored: "지식으로 처리하지 않는 자료입니다.", private: "보호된 자료는 기기 안에서만 읽고 외부 AI에는 보내지 않았습니다.", error: "자료 분석을 완료하지 못했습니다.", cancelled: "자료 분석을 취소했습니다.", empty: "INBOX에 분석할 자료가 없습니다." };
        copy = copies[state] || copies.error;
      }
      const recovering = ["blocked", "outcome_unknown"].includes(state);
      if (recovering) renderTypedRecovery(parent, inbox, state);
      else {
        const actions = actionRow(parent);
        if (["queued", "analyzing", "importing"].includes(state)) {
          // Task 11 cutover: analysis is an explicit user action on the retained
          // lifecycle surface; mount and scan never dispatch the provider.
          if (state === "queued") {
            actionButton(actions, "AI 분석 시작", "analyze-inbox", { action: "analyze_inbox" }, { primary: true });
            actionButton(actions, "자료 직접 선택", "select-source", { action: "select_source" });
          }
          else actionButton(actions, "분석 취소", "cancel-inbox", { action: "cancel_inbox", source_id: text(inbox.source_id) }, { primary: true });
          actionButton(actions, "지식 INBOX 확인 중", "scan-inbox", { action: "scan_inbox" }, { disabled: true });
        } else {
          if (!counts && ["error", "cancelled"].includes(state)) actionButton(actions, "다시 분석", "retry-inbox", { action: "retry_inbox", source_id: text(inbox.source_id) }, { primary: true });
          else actionButton(actions, "새/변경 자료 확인", "scan-inbox", { action: "scan_inbox" }, { primary: true });
          if (counts && counts.eligible > 0) {
            actionButton(
              actions,
              "전체 재분석",
              "force-reanalyze-inbox",
              { action: "force_reanalyze_inbox" },
              { confirmMessage: "변경 없는 자료까지 모두 다시 AI로 분석해 토큰을 사용합니다. 계속할까요?" },
            );
          }
          actionButton(actions, "기존 지식 마이그레이션 검사", "scan-migration", { action: "scan_migration" });
          actionButton(actions, "Literature 자료 검토", "select-source", { action: "select_source" });
        }
      }
      const status = recovering
        ? recoveryStatusRegion(parent, copy)
        : statusRegion(parent, copy, ["error", "partial"].includes(state) ? "error" : "info");
      if (recovering) setAttr(status, "data-recovery-variant", recoveryVariant(inbox, state));
      renderInboxMetadata(parent, inbox, counts);
      if (counts && ["queued", "analyzing"].includes(state)) renderProgressTrack(parent, "source", counts.processed, counts.pending, "자료 분석");
    }

    function renderOperationRefresh(parent, pending) {
      statusRegion(parent, pending ? "지식은 반영됐고 탐색 목록을 새로 만드는 중입니다." : "지식은 안전하게 반영됐지만 탐색 목록 새로고침에 실패했습니다.", pending ? "info" : "error");
      createEl(parent, "p", { text: "반영된 지식은 바뀌지 않습니다. 탐색 목록만 다시 만듭니다.", attr: { class: "llmwiki-lifecycle__muted" } });
      if (!pending) {
        const actions = actionRow(parent);
        actionButton(actions, "파생 데이터 다시 만들기", "retry-operation-refresh", { action: "retry_follow_up", follow_up: "refresh" }, { primary: true });
      }
    }

    function renderGitFollowUp(parent, projected) {
      const failed = projected.productState === "git_failed";
      const gitFollowUp = projected.followUp && projected.followUp.git;
      const unavailable = gitFollowUp && gitFollowUp.reason === "GitUnavailable";
      statusRegion(
        parent,
        unavailable ? "지식 반영 완료 · Git 백업 보류" : failed ? "지식은 안전하게 반영됐지만 Git 백업이 보류되었습니다." : "지식 반영 완료 · Git 백업 보류",
        unavailable ? "info" : failed ? "error" : "info",
      );
      createEl(parent, "p", { text: "반영된 지식은 바뀌지 않습니다. Git 후속 작업만 다시 진행합니다.", attr: { class: "llmwiki-lifecycle__muted" } });
      const actions = actionRow(parent);
      if (failed) actionButton(actions, "백업 다시 시도", "retry-git", { action: "retry_follow_up", follow_up: "git" }, { primary: true });
    }

    function renderTerminal(parent) {
      const prodigyWiki = plain(snapshot.prodigy_wiki) ? snapshot.prodigy_wiki : null;
      if (prodigyWiki && ["interrupted", "source_changed"].includes(prodigyWiki.status)) {
        const setup = /provider|auth|configuration|runtime/u.test(prodigyWiki.reason || "");
        statusRegion(parent, setup ? "AI 연결 설정을 확인해야 합니다." : prodigyWiki.status === "source_changed" ? "원문이 변경되었습니다. 최신 내용으로 다시 확인하세요." : prodigyWiki.resumable ? "정리가 중단되었습니다. 저장된 단계부터 다시 시도할 수 있습니다." : "정리를 완료하지 못했습니다. 정식 문서는 변경하지 않았습니다.", "error");
        sourceContext(parent);
        createEl(detailHost(parent), "p", { text: prodigyWiki.reason || "" });
        const actions = decision;
        if (setup) { actionButton(actions, "AI 설정 열기", "open-ai-settings", { action: "open_ai_settings" }, { primary: true }); actionButton(actions, "나중에", "later", { action: "later" }); return; }
        if (prodigyWiki.status === "source_changed") {
          actionButton(actions, "변경된 원문 확인", "reset-prodigy-source", { action: "reset_prodigy_source" }, { primary: true });
        } else {
          const resumable = prodigyWiki.resumable === true;
          actionButton(
            actions,
            resumable ? "다시 시도" : "다시 정리하기",
            resumable ? "resume-prodigy-wiki" : "retry-prodigy-wiki",
            { action: resumable ? "resume_prodigy_wiki" : "retry_prodigy_wiki", explicit_retry: true },
            { primary: true },
          );
          actionButton(actions, "다른 원문 선택", "reset-prodigy-source", { action: "reset_prodigy_source" });
        }
        return;
      }
      const copy = snapshot.status === "cancelled"
        ? "검토가 취소되었습니다. 저장된 변경은 없습니다."
        : snapshot.status === "abstained"
          ? "AI가 안전하게 제안을 보류했습니다. 저장된 변경은 없습니다."
          : text(snapshot.reason) || "제안을 만들지 못했습니다. 저장된 변경은 없습니다.";
      statusRegion(parent, copy, snapshot.status === "failed" ? "error" : "info");
      sourceContext(parent);
      const actions = actionRow(parent);
      actionButton(actions, "새 검토 시작", "select-source", { action: "select_source" }, { primary: true });
    }

    function escape(event) {
      if (!event || event.key !== "Escape") return;
      const openDetails = first(frame, (node) => tagName(node) === "details" && (node.open === true || attribute(node, "open") !== null));
      if (openDetails) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        openDetails.open = false;
        removeAttr(openDetails, "open");
        focus(first(openDetails, (node) => tagName(node) === "summary"));
        return;
      }
      if (snapshot.status === "review" || snapshot.status === "review_only") {
        const reviewFrame = first(frame, (node) => attribute(node, "data-surface") === "llmwiki-approval-review");
        if (reviewFrame && typeof reviewFrame.onkeydown === "function") reviewFrame.onkeydown(event);
        const opener = first(frame, (node) => attribute(node, "data-action") === "open-review");
        focus(opener || first(frame, (node) => attribute(node, "data-lifecycle-heading") !== null));
        return;
      }
      if (["selecting", "consent_required"].includes(snapshot.status)) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        dispatch({ action: "cancel" });
        return;
      }
      focus(first(frame, (node) => tagName(node) === "h2"));
    }

    function render() {
      if (options.preserveSurface?.()) return frame;
      empty(container);
      const projected = projectLifecycleSnapshot(snapshot);
      const prodigyWikiModel = currentProdigyWikiModel();
      const projectedCounts = inboxCounts(projected.inbox);
      const pendingCount = projectedCounts ? projectedCounts.pending : 0;
      const displayVariant = ["local", "mobile_remote"].includes(text(snapshot.display_variant)) ? text(snapshot.display_variant) : "local";
      frame = createEl(container, "section", {
        attr: {
          class: "llmwiki-lifecycle prodigy-full-bleed",
          "data-surface": "llmwiki-lifecycle",
          "data-product": prodigyWikiModel.product_id,
          "data-primary-action": prodigyWikiModel.primary_action || "",
          "data-state": projected.productState,
          "data-display-variant": displayVariant,
          "data-pending-count": String(pendingCount),
          "data-pending-priority": pendingPriority(pendingCount),
          "aria-label": "Prodigy Wiki 흐름",
          "aria-busy": ["running", "committing", "compensation_committing"].includes(snapshot.status) || ["queued", "analyzing"].includes(projected.inbox && projected.inbox.state) || projected.fleeting && projected.fleeting.status === "analyzing" ? "true" : "false",
        },
      });
      frame.onkeydown = escape;
      stateDetails = null;
      const workspace = options.workspace;
      decision = workspace?.decision || createEl(container, "footer", { attr: { class: "wiki-decision-bar", "data-wiki-decision": "" } });
      empty(decision);
      if (workspace) workspace.setJourney(pickerOpen ? { status: "idle" } : snapshot);
      else { const row = createEl(container, "div", { attr: { class: "wiki-journey-row" } }); wikiUI.journey(row, pickerOpen ? { status: "idle" } : snapshot); }
      if (pickerOpen || snapshot.prodigy_wiki?.picker_open) { renderPicker(frame); return frame; }
      if (appliedRisk && retainedRisk) { renderRetainedRisk(frame); return frame; }
      // An explicit migration request (더 보기 -> 기존 자료 검사) must not be preempted by an open
      // document review; the review returns when its scene is selected again.
      if (options.auxiliaryScene?.() !== "migration" && options.renderWorkspaceReview?.(frame, snapshot) === true) return frame;
      const inboxScene = projected.productState.startsWith("inbox_");
      const explicitStatePriority = ACTIVE_STATUSES.has(snapshot.status)
        || ["review", "review_only", "stale_reconfirm_required", "committed_audit_pending", "committed_refresh_failed", "compensated", "compensated_audit_pending"].includes(snapshot.status);
      if (options.workspace?.more) {
        const more = options.workspace.more;
        const old = more.querySelector?.('[data-execution-info]'); old?.remove();
        const info = createEl(more, "details", { attr: { "data-execution-info": "" } }); createEl(info, "summary", { text: "실행 정보" }); providerPicker(info);
      }

      if (options.auxiliaryScene?.() === "fleeting") renderFleeting(frame, projected.fleeting);
      else if (projected.productState.startsWith("migration_") && (!options.workspace || options.auxiliaryScene?.() === "migration") && renderMigration(frame, projected)) { /* migration owns the active lifecycle scene */ }
      else if (snapshot.operation_run?.status !== "committed" && snapshot.status === "complete" && snapshot.golden_wiki?.status === "complete") renderGoldenComplete(frame);
      else if (durableSuccess(snapshot) && !explicitStatePriority) renderCommitted(frame);
      else if (inboxScene && options.workspace && !options.auxiliaryScene?.() && !["analyzing", "blocked", "outcome_unknown", "error", "partial"].includes(projected.inbox?.state)) renderIdle(frame);
      else if (inboxScene) renderInbox(frame, projected.productState.slice(6));
      else if (["operation_refresh_pending", "operation_refresh_failed"].includes(projected.productState)) renderOperationRefresh(frame, projected.productState.endsWith("pending"));
      else if (["git_pending", "git_failed"].includes(projected.productState)) renderGitFollowUp(frame, projected);
      else if (projected.productState === "committed") renderCommitted(frame);
      else if (snapshot.status === "idle") renderIdle(frame);
      else if (snapshot.status === "selecting") renderWorkspaceSelecting(frame);
      else if (snapshot.status === "consent_required") renderConsent(frame);
      else if (["running", "committing", "compensation_committing"].includes(snapshot.status)) renderProgress(frame);
      else if (["review", "review_only"].includes(snapshot.status)) renderReview(frame);
      else if (["committed", "processed", "complete"].includes(snapshot.status)) renderCommitted(frame);
      else if (snapshot.status === "stale_reconfirm_required") renderStale(frame);
      else if (snapshot.status === "committed_audit_pending") renderRecovery(frame, "audit");
      else if (snapshot.status === "committed_refresh_failed") renderRecovery(frame, "refresh");
      else if (["compensated", "compensated_audit_pending"].includes(snapshot.status)) renderCompensated(frame);
      else renderTerminal(frame);
      if (options.workspace) {
        for (const row of descendants(frame, node => attribute(node, "class") === "llmwiki-lifecycle__actions" && descendants(node, child => attribute(child, "data-primary") === "true").length)) decision.appendChild(row);
      }
      return frame;
    }

    function update(nextSnapshot) {
      if (!validSnapshot(nextSnapshot)) return Object.freeze({ ok: false, reason: "invalid_snapshot" });
      const active = container.ownerDocument && container.ownerDocument.activeElement;
      const focusKey = active ? attribute(active, "data-focus-key") || attribute(active, "data-action") : null;
      const sourceChanged = nextSnapshot.prodigy_wiki?.source?.path !== snapshot.prodigy_wiki?.source?.path
        || nextSnapshot.prodigy_wiki?.source?.content_hash !== snapshot.prodigy_wiki?.source?.content_hash;
      snapshot = nextSnapshot;
      if (sourceChanged && nextSnapshot.prodigy_wiki?.status === "source_selected") pickerOpen = false;
      pendingAction = null;
      render();
      if (focusKey) {
        const target = first(frame, (node) => attribute(node, "data-focus-key") === focusKey || attribute(node, "data-action") === focusKey);
        focus(target || first(frame, (node) => attribute(node, "data-lifecycle-heading") !== null));
      }
      return Object.freeze({ ok: true, status: snapshot.status });
    }

    const api = Object.freeze({
      update,
      render,
      openPicker() { pickerOpen = true; tentativeSource = ""; render(); },
      isPickerOpen() { return pickerOpen || snapshot.prodigy_wiki?.picker_open === true; },
      getSnapshot() { return snapshot; },
    });
    render();
    return api;
  }

  const api = Object.freeze({ STATUSES, OPERATION_LABELS, CSS, modelSegments, durableSuccess, projectLifecycleSnapshot, mountLlmWikiLifecycleView });
  root.LLMWikiLifecycleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
