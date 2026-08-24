(function (root) {
  "use strict";

  // allow: SIZE_OK — one product projection keeps inbox, approval, conflict, commit, and recovery actions atomic.
  const REVIEW_MODULE_PATH = "./llmwiki-risk-approval-review-view.js";
  const STATUSES = Object.freeze([
    "idle", "selecting", "consent_required", "running", "review", "review_only",
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
  const ROLLOUT_LABELS = Object.freeze({
    create: "새 지식(create)",
    update: "기존 지식 수정(update)",
    merge: "지식 병합(merge)",
    maintenance: "지식 점검(maintenance)",
    git: "Git 백업(git)",
    resurfacing: "관련 지식 다시 보기(resurfacing)",
  });
  const ACTIVE_STATUSES = new Set(["selecting", "consent_required", "running", "committing", "compensation_committing"]);
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const stylesApi = root.KnowledgeStyles || (typeof require === "function" ? require("./knowledge-styles.js") : null);
  const CSS = "";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function validSnapshot(value) { return plain(value) && STATUSES.includes(value.status); }
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
    return snapshot.provider_options.filter((provider) => plain(provider) && text(provider.provider_key) && text(provider.name));
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
    const risks = Array.isArray(snapshot.risk_packets) ? snapshot.risk_packets : [];
    const conflicts = risks.filter((packet) => Array.isArray(packet?.conflict?.blocking_conflict_ids) && packet.conflict.blocking_conflict_ids.length > 0);
    const approvals = risks.filter((packet) => !conflicts.includes(packet));
    let productState = snapshot.status;
    if (inbox && ["queued", "analyzing", "cancelled"].includes(inbox.state)) productState = `inbox_${inbox.state}`;
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
    else if (["idle", "selecting"].includes(snapshot.status) && inbox && ["empty", "queued", "analyzing", "complete", "partial", "protected", "up_to_date", "importing", "ignored", "private", "error", "cancelled"].includes(inbox.state)) productState = `inbox_${inbox.state}`;
    if (plain(snapshot.migration) && snapshot.migration.status && risks.length === 0) productState = `migration_${snapshot.migration.status}`;
    return Object.freeze({ productState, inbox, followUp, approvals, conflicts, rollout: plain(snapshot.rollout) ? snapshot.rollout : null, migration: plain(snapshot.migration) ? snapshot.migration : null });
  }

  function mountLlmWikiLifecycleView(options = {}) {
    const container = options.container;
    if (!container) throw new TypeError("container is required");
    if (!validSnapshot(options.snapshot)) throw new TypeError("valid controller snapshot is required");
    if (typeof options.onAction !== "function") throw new TypeError("onAction callback is required");

    let snapshot = options.snapshot;
    let pendingAction = null;
    let frame = null;
    if (stylesApi && typeof stylesApi.ensureStyles === "function") stylesApi.ensureStyles(container.ownerDocument);

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
          "aria-label": buttonOptions.ariaLabel || label,
        },
        disabled: buttonOptions.disabled,
      });
      if (!buttonOptions.disabled) control.onclick = (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (buttonOptions.confirmMessage
          && typeof root.confirm === "function"
          && root.confirm(buttonOptions.confirmMessage) !== true) return;
        dispatch(intent);
      };
      return control;
    }

    function dispatch(intent) {
      if (pendingAction !== null || !plain(intent) || typeof intent.action !== "string") return false;
      pendingAction = intent.action;
      for (const control of descendants(frame, (node) => attribute(node, "data-intent-action") === intent.action)) {
        control.disabled = true;
        setAttr(control, "disabled", "");
        control.onclick = null;
      }
      let result;
      try { result = options.onAction(Object.freeze({ ...intent })); }
      catch (error) { pendingAction = null; render(); throw error; }
      if (result && typeof result.then === "function") {
        Promise.resolve(result).finally(() => {
          if (pendingAction === intent.action) {
            pendingAction = null;
            render();
          }
        });
      }
      return true;
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

    function sourceContext(parent) {
      const name = sourceName(snapshot);
      if (!name) return null;
      const section = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__source prodigy-utility-card", "aria-label": "선택한 자료" } });
      createEl(section, "h3", { text: "선택한 자료" });
      createEl(section, "p", { text: name, attr: { class: "llmwiki-lifecycle__source-name" } });
      return section;
    }

    function actionRow(parent) { return createEl(parent, "div", { attr: { class: "llmwiki-lifecycle__actions" } }); }

    function providerPicker(parent) {
      const options = providerOptions(snapshot);
      if (!options.length) return null;
      const inbox = plain(snapshot.inbox) ? snapshot.inbox : {};
      const busy = ["queued", "analyzing"].includes(text(inbox.state)) || ["running", "committing", "compensation_committing"].includes(text(snapshot.status));
      const section = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__provider", "aria-label": "LLM Wiki AI 제공자" } });
      const label = createEl(section, "label", { attr: { class: "llmwiki-lifecycle__provider-label" } });
      createEl(label, "span", { text: "LLM Wiki AI" });
      const select = createEl(label, "select", { attr: { "aria-label": "LLM Wiki AI 제공자", "data-provider-selector": "llmwiki", "data-intent-action": "set_provider", "data-focus-key": "provider-selector" }, disabled: busy });
      for (const option of options) {
        const configured = option.configured === true;
        const model = text(option.model);
        const item = createEl(select, "option", {
          text: `${text(option.name)}${model ? ` · ${model}` : ""}${configured ? "" : " · 설정 필요"}`,
          attr: { value: text(option.provider_key) },
          disabled: !configured,
        });
        item.selected = text(snapshot.provider_key) === text(option.provider_key);
      }
      select.value = text(snapshot.provider_key);
      select.onchange = (event) => {
        const providerKey = text(event && event.target && event.target.value);
        if (providerKey && providerKey !== text(snapshot.provider_key)) dispatch({ action: "set_provider", provider_key: providerKey });
      };
      if (text(snapshot.provider_selection_error)) createEl(section, "p", { text: text(snapshot.provider_selection_error), attr: { class: "llmwiki-lifecycle__provider-error", role: "alert" } });
      return section;
    }

    function runSettings(parent) {
      const details = createEl(parent, "details", { attr: { class: "llmwiki-lifecycle__advanced", "data-disclosure": "run-settings" } });
      createEl(details, "summary", { text: "고급 실행 설정", attr: { "data-focus-key": "advanced-run-settings" } });
      const settings = createEl(details, "div", { attr: { class: "llmwiki-lifecycle__settings" } });
      createEl(settings, "h3", { text: "연결 방식" });
      for (const provider of [{ value: "direct", label: "직접 연결" }, { value: "omniroute", label: "OmniRoute" }]) {
        const label = createEl(settings, "label", { attr: { class: "llmwiki-lifecycle__setting" } });
        const input = createEl(label, "input", { attr: { type: "radio", name: "llmwiki-provider-mode", value: provider.value, "aria-label": provider.label } });
        input.checked = (text(snapshot.provider_mode) || "direct") === provider.value;
        input.onchange = () => {
          if (input.checked) dispatch({ action: "set_provider_mode", provider_mode: provider.value });
        };
        createEl(label, "span", { text: provider.label });
      }
      createEl(settings, "h3", { text: "제안 유형" });
      const createLabel = createEl(settings, "label", { attr: { class: "llmwiki-lifecycle__setting" } });
      const createInput = createEl(createLabel, "input", { attr: { type: "checkbox", "data-operation": "create", "aria-label": OPERATION_LABELS.create } });
      createInput.checked = true;
      createEl(createLabel, "span", { text: `${OPERATION_LABELS.create} · 1단계 지원` });
      for (const operation of ["update", "merge", "dispute"]) {
        const label = createEl(settings, "label", { attr: { class: "llmwiki-lifecycle__setting" } });
        createEl(label, "input", { attr: { type: "checkbox", "data-operation": operation, "aria-label": `${OPERATION_LABELS[operation]} · 1단계에서 지원하지 않음` }, disabled: true });
        createEl(label, "span", { text: `${OPERATION_LABELS[operation]} · 1단계에서 지원하지 않음` });
      }
      createEl(settings, "p", { text: `${OPERATION_LABELS.abstain}와 ${OPERATION_LABELS.no_change}은 저장 권한을 만들지 않습니다.`, attr: { class: "llmwiki-lifecycle__muted" } });
      return details;
    }

    function renderRollout(parent, projected) {
      if (!projected.rollout) return;
      const phases = ["create", "update", "merge", "maintenance", "git", "resurfacing"];
      const enabled = Array.isArray(projected.rollout.enabled_phases) ? projected.rollout.enabled_phases : [];
      const next = phases.find((phase) => !enabled.includes(phase));
      const section = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__rollout prodigy-utility-card", "data-surface": "llmwiki-rollout", "aria-label": "LLM Wiki 단계적 활성화" } });
      createEl(section, "h3", { text: "단계적 활성화" });
      createEl(section, "p", { text: enabled.length ? `활성화됨: ${enabled.map((phase) => ROLLOUT_LABELS[phase]).join(" → ")}` : "아직 쓰기 단계가 활성화되지 않았습니다.", attr: { class: "llmwiki-lifecycle__muted" } });
      createEl(section, "p", { text: "각 단계는 한 번씩, 표시된 순서대로 직접 활성화합니다. 활성화만으로 지식을 쓰지는 않습니다.", attr: { class: "llmwiki-lifecycle__muted" } });
      const failure = text(snapshot.rollout_activation_failure);
      if (failure) createEl(section, "p", { text: failure, attr: { class: "llmwiki-lifecycle__error", role: "alert" } });
      if (next) actionButton(section, `${ROLLOUT_LABELS[next]} 활성화`, "enable-rollout-phase", { action: "enable_rollout_phase", phase: next }, { primary: enabled.length === 0 });
    }

    function renderMigration(parent, projected) {
      const migration = projected.migration;
      if (!migration) return false;
      if (migration.status === "review") {
        statusRegion(parent, "기존 자료의 마이그레이션 분류가 준비되었습니다. 승인 전에는 지식을 쓰지 않습니다.");
        const list = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__migration", "data-state-id": "migration_review", "aria-label": "마이그레이션 검토" } });
        for (const decision of migration.decisions || []) {
          const row = createEl(list, "article", { attr: { class: "prodigy-utility-card", "data-operation-kind": decision.kind } });
          createEl(row, "h3", { text: OPERATION_LABELS[decision.kind] || decision.kind });
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

    function renderIdle(parent, copy = "자료를 선택하면 AI가 새 지식 또는 수정안을 제안합니다. 승인 전에는 저장되지 않습니다.") {
      const intro = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__intro prodigy-full-bleed" } });
      createEl(intro, "p", { text: copy });
      const actions = actionRow(intro);
      actionButton(actions, "새 검토 시작", "select-source", { action: "select_source" }, { primary: true });
    }

    function renderSelecting(parent) {
      const name = sourceName(snapshot);
      statusRegion(parent, name ? "자료가 선택되었습니다. 전송 동의를 확인하기 전에는 AI를 호출하지 않습니다." : "검토할 자료를 하나 선택해 주세요.");
      if (name) sourceContext(parent);
      const actions = actionRow(parent);
      actionButton(actions, name ? "자료 다시 선택" : "자료 선택", "select-source", { action: "select_source" });
      if (!name) {
        const options = sourceOptions(snapshot);
        if (options.length) {
          const picker = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__source", "aria-label": "Literature 자료 선택" } });
          createEl(picker, "h3", { text: "Literature 자료" });
          for (const option of options) actionButton(picker, option.title, "select-source-option", { action: "select_source", source_path: option.path }, { ariaLabel: `${option.title} 선택` });
        }
      }
      if (name) actionButton(actions, "이 자료 검토하기", "request-consent", { action: "request_consent" }, { primary: true });
      runSettings(parent);
    }

    function renderConsent(parent) {
      statusRegion(parent, "AI 제안을 만들기 전에 외부 전송 동의가 필요합니다.");
      sourceContext(parent);
      createEl(parent, "p", { text: "AI는 제안만 만듭니다. 사람이 승인하기 전에는 지식으로 저장되지 않습니다." });
      const actions = actionRow(parent);
      actionButton(actions, "동의하고 제안 만들기", "start-run", { action: "start_run", provider_mode: text(snapshot.provider_mode) || "direct" }, { primary: true });
      actionButton(actions, "취소", "cancel-run", { action: "cancel" });
      runSettings(parent);
    }

    function renderProgress(parent) {
      const committing = snapshot.status === "committing";
      statusRegion(parent, committing ? "승인한 내용을 안전하게 반영하고 있습니다." : "자료를 바탕으로 제안을 만들고 있습니다.");
      sourceContext(parent);
      createEl(parent, "progress", { attr: { "aria-label": committing ? "승인 반영 진행 중" : "AI 제안 생성 진행 중" } });
      const actions = actionRow(parent);
      actionButton(actions, committing ? "반영 중" : "제안 만드는 중", "start-run", { action: "start_run" }, { primary: true, disabled: true });
      actionButton(actions, "취소", "cancel-run", { action: "cancel" });
    }

    function readableCanonical(value) {
      const bytes = typeof value === "string" ? value : "";
      if (!bytes.startsWith("---\n")) return bytes;
      const boundary = bytes.indexOf("\n---\n", 4);
      return boundary < 0 ? "" : bytes.slice(boundary + 5).trim();
    }

    function renderCanonicalReview(host, packet) {
      const frame = createEl(host, "section", { attr: { class: "llmwiki-approval-review", "data-surface": "llmwiki-approval-review", "aria-label": "Librarian 실행 검토" } });
      createEl(frame, "h2", { text: "저장 전 최종 확인" });
      createEl(frame, "p", { text: "사람이 읽는 최종 내용입니다. 승인 전에는 지식이나 Git에 쓰지 않습니다." });
      createEl(frame, "h3", { text: "변경 전" });
      createEl(frame, "div", { text: readableCanonical(packet.before_bytes) || "새 지식이라 이전 내용이 없습니다.", attr: { class: "llmwiki-lifecycle__document-preview", "aria-label": "변경 전 지식 내용" } });
      createEl(frame, "h3", { text: "변경 후" });
      createEl(frame, "div", { text: readableCanonical(packet.after_bytes), attr: { class: "llmwiki-lifecycle__document-preview", "aria-label": "승인할 지식 내용" } });
      for (const citation of Array.isArray(packet.source_citations) ? packet.source_citations : []) {
        const locator = text(Array.isArray(citation.locators) ? citation.locators[0] : "");
        if (!locator) continue;
        actionButton(frame, `출처 옆에 열기 ${locator}`, "open-source", { action: "open_source", source_path: locator.split("#")[0] });
      }
      const actions = actionRow(frame);
      actionButton(actions, "선택 승인", "approve-selected", { action: "approve", packet_hash: text(packet.packet_hash) }, { primary: true });
      actionButton(actions, "검토 닫기", "select-source", { action: "select_source" });
    }

    function renderReview(parent) {
      statusRegion(parent, snapshot.status === "review_only" ? "제안을 검토할 수 있지만 1단계에서 승인할 수 없는 유형이 포함되어 있습니다." : "검토할 제안이 준비되었습니다.");
      const counts = inboxCounts(snapshot.inbox);
      if (counts && counts.processed > 0) createEl(parent, "p", { text: `INBOX 확인 완료 · 분석 대상 ${counts.eligible}개 · 보호 유지 ${counts.held}개 · 처리 ${counts.processed}개`, attr: { class: "llmwiki-lifecycle__muted" } });
      sourceContext(parent);
      const host = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__review", "aria-label": "제안 검토" } });
      const child = reviewModule(options.reviewView);
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
          child.mountRiskApprovalReview({
            container: queue, packets, packetApi: riskPacketApi, batchApi: root.LLMWikiSafeBatchApproval, primaryEnabled: !conflictQueue || projected.approvals.length === 0,
            onApprove(packet) { return dispatch({ action: "approve_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id }); },
            onReject(packet) { return dispatch({ action: "reject_risk", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id }); },
            onBatchApprove({ packets: selected }) { return conflictQueue ? { ok: false, status: "rejected", reason: "blocking_conflict" } : dispatch({ action: "approve_risk_batch", selection_ids: selected.map((item) => item.packet_id).sort() }); },
            onRequestRevisionPrompt({ packet, submit }) {
              if (typeof options.requestRevisionGuidance !== "function") return options.onRevisionRequestPrompt?.({ packet, submit }) || { ok: false, status: "prompt_required" };
              return Promise.resolve(options.requestRevisionGuidance(packet)).then((guidance) => submit(guidance));
            },
            onRequestRevision({ packet, guidance }) { return dispatch({ action: "request_risk_revision", run_id: packet.run_id, run_revision: packet.run_revision, packet_id: packet.packet_id, guidance }); },
          });
        };
        const eligibleActive = projected.approvals.filter((packet) => activeRiskPackets.includes(packet));
        const conflictActive = projected.conflicts.filter((packet) => activeRiskPackets.includes(packet));
        mountQueue(eligibleActive, "승인 준비", false);
        mountQueue(conflictActive, "먼저 해결할 충돌", true);
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
        const reviewOptions = plain(options.reviewOptions) ? options.reviewOptions : {};
        child.mountLlmWikiApprovalReview({
          container: host,
          packet,
          approvalApi: reviewOptions.approvalApi,
          onOpenBeside: reviewOptions.onOpenBeside,
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

    function renderCommitted(parent) {
      statusRegion(parent, "지식 반영 완료");
      sourceContext(parent);
      const links = plain(snapshot.links) ? snapshot.links : {};
      const list = createEl(parent, "ul", { attr: { class: "llmwiki-lifecycle__results", "aria-label": "반영 결과" } });
      for (const [key, label] of [["canonical", "반영된 지식"], ["audit", "감사 기록"]]) {
        const item = plain(links[key]) ? links[key] : null;
        if (!item || !text(item.path)) continue;
        const row = createEl(list, "li");
        createEl(row, "a", { text: `${label}: ${item.path}`, attr: { href: item.path, "data-display-only": "true" } });
      }
      const actions = actionRow(parent);
      const compensation = plain(snapshot.compensation) ? snapshot.compensation : null;
      if (compensation && compensation.eligible && compensation.confirmation_required) {
        createEl(parent, "p", {
          text: "이 승인된 변경만 정확히 되돌립니다. 계속하려면 다시 확인하세요.",
          attr: { class: "llmwiki-lifecycle__muted", role: "status" },
        });
        actionButton(actions, "되돌리기 확인", "confirm-compensation", { action: "confirm_compensation" }, { primary: true });
      } else if (compensation && compensation.eligible) {
        actionButton(actions, "이 변경 되돌리기", "request-compensation", { action: "request_compensation" });
      }
      actionButton(actions, "새 검토 시작", "select-source", { action: "select_source" }, { primary: true });
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
      statusRegion(parent, "검토 중인 내용이 변경되어 다시 확인해야 합니다.", "error");
      sourceContext(parent);
      const actions = actionRow(parent);
      actionButton(actions, "새 검토 패킷 만들기", "repacket-stale", { action: "repacket_stale" }, { primary: true });
      actionButton(actions, "다시 확인 후 승인", "reconfirm-stale", { action: "reconfirm_stale" }, { disabled: true });
    }

    function renderRecovery(parent, kind) {
      const audit = kind === "audit";
      statusRegion(parent, audit ? "지식은 반영되었지만 감사 기록 복구가 필요합니다." : "지식은 반영되었지만 탐색 새로고침이 필요합니다.", "error");
      sourceContext(parent);
      const actions = actionRow(parent);
      actionButton(
        actions,
        audit ? "감사 기록 복구" : "지식 탐색 새로고침 재시도",
        audit ? "repair-audit" : "retry-refresh",
        { action: audit ? "repair_audit" : "retry_refresh" },
        { primary: true },
      );
    }

    function renderInbox(parent, state) {
      const inbox = plain(snapshot.inbox) ? snapshot.inbox : {};
      const counts = inboxCounts(inbox);
      const reason = text(inbox.reason);
      const authRequired = reason === "provider_auth_required";
      const toolBlocked = reason === "provider_tool_blocked";
      const quotaExhausted = reason === "provider_quota_exhausted";
      const unavailable = ["provider_unavailable", "transport_unavailable", "analysis_provider_unavailable", "configuration_unavailable", "provider_auth_required", "provider_tool_blocked"].includes(reason);
      let copy;
      if (counts && state === "protected") copy = `AI 분석 대상이 없습니다. 분석 대상 0개 · 보호 유지 ${counts.held}개. 개인 자료는 INBOX/Private/에 넣어 주세요.`;
      else if (counts && state === "empty") copy = "AI 분석 대상이 없습니다. 분석 대상 0개 · 보호 유지 0개. INBOX에 Markdown 자료를 넣어 주면 자동으로 분석됩니다.";
      else if (counts && state === "up_to_date") copy = `지식 INBOX가 최신 상태입니다. 변경 없는 자료 ${counts.unchanged}개 · 보호 유지 ${counts.held}개 · AI 호출 0회`;
      else if (counts && state === "queued") copy = `새로 분석할 자료 ${counts.pending}개 · 변경 없음 ${counts.unchanged}개 · 보호 유지 ${counts.held}개. 0/${counts.pending} 분석 대기`;
      else if (counts && state === "analyzing") copy = `${Math.min(counts.processed + 1, counts.pending)}/${counts.pending} 분석 중 · ${text(inbox.current_title) || "선택한 자료"} · 변경 없음 ${counts.unchanged}개 · 보호 유지 ${counts.held}개`;
      else if (counts && state === "complete") copy = `${counts.processed}/${counts.pending} 분석 완료 · 성공 ${counts.succeeded}개 · 실패 ${counts.failed}개 · 변경 없음 ${counts.unchanged}개 · 보호 유지 ${counts.held}개`;
      else if (counts && state === "partial") copy = `${counts.processed}/${counts.pending} 분석 완료 · 성공 ${counts.succeeded}개 · 실패 ${counts.failed}개 · 변경 없음 ${counts.unchanged}개 · 보호 유지 ${counts.held}개`;
      else if (counts && state === "error") {
        if (authRequired) copy = "Antigravity Google 로그인이 필요합니다. 터미널에서 agy -p \"연결 확인\"을 한 번 실행해 로그인한 뒤 지식 INBOX를 다시 확인해 주세요.";
        else if (toolBlocked) copy = "Antigravity가 프로젝트 도구 실행을 시도해 안전 모드에서 차단되었습니다. 중립 실행 환경으로 전환했으니 지식 INBOX를 다시 확인해 주세요.";
        else if (quotaExhausted) copy = text(inbox.message) || "Antigravity 사용 한도를 모두 사용했습니다. 한도가 초기화된 후 지식 INBOX를 다시 확인해 주세요.";
        else copy = unavailable ? "사용할 수 있는 AI 연결이 없습니다. 연결을 확인한 뒤 지식 INBOX를 다시 확인해 주세요." : `${counts.processed}/${counts.pending} 분석 완료 · 성공 ${counts.succeeded}개 · 실패 ${counts.failed}개 · 변경 없음 ${counts.unchanged}개 · 보호 유지 ${counts.held}개`;
      }
      else if (counts && state === "cancelled") copy = `자료 분석을 취소했습니다. 처리 ${counts.processed}/${counts.pending} · 성공 ${counts.succeeded}개 · 실패 ${counts.failed}개 · 변경 없음 ${counts.unchanged}개 · 보호 유지 ${counts.held}개`;
      else {
        const copies = { importing: "새 자료를 읽고 기존 지식과 비교하고 있습니다.", ignored: "지식으로 처리하지 않는 자료입니다.", private: "보호된 자료는 기기 안에서만 읽고 외부 AI에는 보내지 않았습니다.", error: "자료 분석을 완료하지 못했습니다.", cancelled: "자료 분석을 취소했습니다.", empty: "INBOX에 분석할 자료가 없습니다." };
        copy = copies[state] || copies.error;
      }
      statusRegion(parent, copy, ["error", "partial"].includes(state) ? "error" : "info");
      if (counts && ["queued", "analyzing"].includes(state)) createEl(parent, "progress", { attr: { value: String(counts.processed), max: String(counts.pending), "aria-label": `지식 INBOX 분석 ${counts.processed}/${counts.pending}` } });
      const actions = actionRow(parent);
      if (["queued", "analyzing", "importing"].includes(state)) {
        actionButton(actions, "지식 INBOX 확인 중", "scan-inbox", { action: "scan_inbox" }, { disabled: true });
        actionButton(actions, "분석 취소", "cancel-inbox", { action: "cancel_inbox", source_id: text(inbox.source_id) }, { primary: true });
        return;
      }
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
      if (ACTIVE_STATUSES.has(snapshot.status)) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        dispatch({ action: "cancel" });
        return;
      }
      focus(first(frame, (node) => attribute(node, "data-primary") === "true"));
    }

    function render() {
      empty(container);
      const projected = projectLifecycleSnapshot(snapshot);
      frame = createEl(container, "section", {
        attr: {
          class: "llmwiki-lifecycle prodigy-full-bleed",
          "data-surface": "llmwiki-lifecycle",
          "data-state": projected.productState,
          "aria-label": "LLM Wiki 검토 흐름",
          "aria-busy": ["running", "committing", "compensation_committing"].includes(snapshot.status) || ["queued", "analyzing"].includes(projected.inbox && projected.inbox.state) ? "true" : "false",
        },
      });
      frame.onkeydown = escape;
      const header = createEl(frame, "header");
      createEl(header, "h2", { text: "LLM Wiki", attr: { tabindex: "-1", "data-lifecycle-heading": "", "data-focus-key": "heading" } });
      providerPicker(frame);
      renderRollout(frame, projected);

      if (projected.productState.startsWith("migration_") && renderMigration(frame, projected)) { /* migration owns the active lifecycle scene */ }
      else if (projected.productState.startsWith("inbox_")) renderInbox(frame, projected.productState.slice(6));
      else if (["operation_refresh_pending", "operation_refresh_failed"].includes(projected.productState)) renderOperationRefresh(frame, projected.productState.endsWith("pending"));
      else if (["git_pending", "git_failed"].includes(projected.productState)) renderGitFollowUp(frame, projected);
      else if (projected.productState === "committed") renderCommitted(frame);
      else if (snapshot.status === "idle") renderIdle(frame);
      else if (snapshot.status === "selecting") renderSelecting(frame);
      else if (snapshot.status === "consent_required") renderConsent(frame);
      else if (["running", "committing", "compensation_committing"].includes(snapshot.status)) renderProgress(frame);
      else if (["review", "review_only"].includes(snapshot.status)) renderReview(frame);
      else if (snapshot.status === "committed") renderCommitted(frame);
      else if (snapshot.status === "stale_reconfirm_required") renderStale(frame);
      else if (snapshot.status === "committed_audit_pending") renderRecovery(frame, "audit");
      else if (snapshot.status === "committed_refresh_failed") renderRecovery(frame, "refresh");
      else if (["compensated", "compensated_audit_pending"].includes(snapshot.status)) renderCompensated(frame);
      else renderTerminal(frame);
      return frame;
    }

    function update(nextSnapshot) {
      if (!validSnapshot(nextSnapshot)) return Object.freeze({ ok: false, reason: "invalid_snapshot" });
      const active = container.ownerDocument && container.ownerDocument.activeElement;
      const focusKey = active ? attribute(active, "data-focus-key") || attribute(active, "data-action") : null;
      snapshot = nextSnapshot;
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
      getSnapshot() { return snapshot; },
    });
    render();
    return api;
  }

  const api = Object.freeze({ STATUSES, OPERATION_LABELS, ROLLOUT_LABELS, CSS, projectLifecycleSnapshot, mountLlmWikiLifecycleView });
  root.LLMWikiLifecycleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
