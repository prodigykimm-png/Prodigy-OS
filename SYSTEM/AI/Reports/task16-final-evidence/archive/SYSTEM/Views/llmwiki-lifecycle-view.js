(function (root) {
  "use strict";

  const REVIEW_MODULE_PATH = "./llmwiki-approval-review-view.js";
  const STATUSES = Object.freeze([
    "idle", "selecting", "consent_required", "running", "review", "review_only",
    "committing", "committed", "stale_reconfirm_required", "committed_audit_pending",
    "committed_refresh_failed", "cancelled", "abstained", "failed",
  ]);
  const OPERATION_LABELS = Object.freeze({
    create: "새 지식",
    update: "기존 지식 수정",
    merge: "지식 병합",
    dispute: "충돌 보류",
    abstain: "제안 보류",
    no_change: "변경 없음",
  });
  const ACTIVE_STATUSES = new Set(["selecting", "consent_required", "running", "committing"]);
  const ZERO_WRITES = Object.freeze({ canonical: 0, audit: 0, derived: 0, provider: 0, network: 0, git: 0 });
  const designTokens = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
  const compactMax = Number(designTokens.RESPONSIVE_BREAKPOINTS.collapsedNavMax);

  const CSS = `.llmwiki-lifecycle{display:grid;gap:17px;max-inline-size:100%;min-inline-size:0;min-block-size:0;color:var(--text-normal)}.llmwiki-lifecycle,.llmwiki-lifecycle *{box-sizing:border-box}.llmwiki-lifecycle>*{max-inline-size:100%;min-inline-size:0}.llmwiki-lifecycle header,.llmwiki-lifecycle section,.llmwiki-lifecycle article,.llmwiki-lifecycle details{display:grid;gap:8px;min-inline-size:0}.llmwiki-lifecycle h2,.llmwiki-lifecycle h3,.llmwiki-lifecycle p,.llmwiki-lifecycle dl{margin:0;word-break:keep-all;overflow-wrap:anywhere}.llmwiki-lifecycle__source-name{font-weight:600}.llmwiki-lifecycle__muted{color:var(--text-muted)}.llmwiki-lifecycle__error{color:var(--text-error)}.llmwiki-lifecycle__actions{display:flex;flex-wrap:wrap;gap:8px;min-inline-size:0}.llmwiki-lifecycle button,.llmwiki-lifecycle summary,.llmwiki-lifecycle input{font:inherit}.llmwiki-lifecycle button,.llmwiki-lifecycle summary{min-block-size:44px;max-inline-size:100%;word-break:keep-all;overflow-wrap:anywhere}.llmwiki-lifecycle summary{display:flex;align-items:center;cursor:pointer}.llmwiki-lifecycle button{cursor:pointer}.llmwiki-lifecycle button[data-primary="true"]{background:var(--ke-color-interactive,var(--text-accent));border-color:var(--ke-color-interactive,var(--text-accent));color:var(--ke-color-on-interactive,var(--text-on-accent))}.llmwiki-lifecycle button:disabled,.llmwiki-lifecycle input:disabled{cursor:not-allowed;opacity:.5}.llmwiki-lifecycle button:focus-visible,.llmwiki-lifecycle summary:focus-visible,.llmwiki-lifecycle a:focus-visible,.llmwiki-lifecycle input:focus-visible{outline:2px solid var(--ke-color-accent,var(--text-accent));outline-offset:2px}.llmwiki-lifecycle__status{min-block-size:44px;padding:12px;border-inline-start:2px solid var(--ke-color-interactive,var(--text-accent));word-break:keep-all;overflow-wrap:anywhere}.llmwiki-lifecycle__status[data-state="error"]{border-inline-start-color:var(--text-error);color:var(--text-error)}.llmwiki-lifecycle__settings{display:grid;gap:12px}.llmwiki-lifecycle__setting{display:flex;align-items:flex-start;gap:8px;min-block-size:44px;min-inline-size:0}.llmwiki-lifecycle__setting span{word-break:keep-all;overflow-wrap:anywhere}.llmwiki-lifecycle dl{display:grid;grid-template-columns:minmax(7rem,auto) minmax(0,1fr);gap:8px 12px}.llmwiki-lifecycle dt{color:var(--text-muted)}.llmwiki-lifecycle dd{margin:0;word-break:break-all;overflow-wrap:anywhere}.llmwiki-lifecycle__results{display:grid;gap:8px;list-style:none;margin:0;padding:0}.llmwiki-lifecycle__results a{display:block;max-inline-size:100%;color:var(--ke-color-interactive,var(--text-accent));word-break:break-all;overflow-wrap:anywhere}.llmwiki-lifecycle progress{inline-size:100%;max-inline-size:100%;accent-color:var(--ke-color-interactive,var(--text-accent))}@media(max-width:${compactMax}px){.llmwiki-lifecycle__actions button{flex:1 1 100%}.llmwiki-lifecycle dl{grid-template-columns:minmax(0,1fr)}}@media(forced-colors:active){.llmwiki-lifecycle button[data-primary="true"]{border:2px solid Highlight}.llmwiki-lifecycle button:focus-visible,.llmwiki-lifecycle summary:focus-visible,.llmwiki-lifecycle a:focus-visible,.llmwiki-lifecycle input:focus-visible{outline-color:Highlight}}@media(prefers-reduced-motion:reduce){.llmwiki-lifecycle *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function validSnapshot(value) { return plain(value) && STATUSES.includes(value.status); }
  function reviewModule(explicit) {
    if (explicit) return explicit;
    if (root.LLMWikiApprovalReviewView) return root.LLMWikiApprovalReviewView;
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

  function mountLlmWikiLifecycleView(options = {}) {
    const container = options.container;
    if (!container) throw new TypeError("container is required");
    if (!validSnapshot(options.snapshot)) throw new TypeError("valid controller snapshot is required");
    if (typeof options.onAction !== "function") throw new TypeError("onAction callback is required");

    let snapshot = options.snapshot;
    let pendingAction = null;
    let frame = null;

    function actionButton(parent, label, action, intent, buttonOptions = {}) {
      const control = createEl(parent, "button", {
        text: label,
        attr: {
          type: "button",
          class: "prodigy-btn" + (buttonOptions.primary ? " prodigy-btn-primary" : ""),
          "data-action": action,
          "data-intent-action": intent.action,
          "data-focus-key": action,
          "data-primary": buttonOptions.primary ? "true" : "false",
          "aria-label": buttonOptions.ariaLabel || label,
        },
        disabled: buttonOptions.disabled,
      });
      if (!buttonOptions.disabled) control.onclick = (event) => {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
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
          "aria-busy": ["running", "committing"].includes(snapshot.status) ? "true" : "false",
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

    function advancedInfo(parent) {
      const values = [
        ["패킷 해시", text(snapshot.packet_hash) || text(snapshot.approval_packet && snapshot.approval_packet.packet_hash)],
        ["리비전", text(snapshot.revision)],
        ["제공자 ID", text(snapshot.provider_id)],
      ].filter((entry) => entry[1]);
      if (!values.length) return null;
      const details = createEl(parent, "details", { attr: { class: "llmwiki-lifecycle__advanced", "data-disclosure": "advanced-info" } });
      createEl(details, "summary", { text: "고급 정보", attr: { "data-focus-key": "advanced-info" } });
      const fields = createEl(details, "dl");
      for (const [label, value] of values) {
        createEl(fields, "dt", { text: label });
        createEl(fields, "dd", { text: value });
      }
      return details;
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

    function renderCanonicalReview(host, packet) {
      const frame = createEl(host, "section", { attr: { class: "llmwiki-approval-review", "data-surface": "llmwiki-approval-review", "aria-label": "Librarian 실행 검토" } });
      createEl(frame, "h2", { text: "Librarian 실행 검토" });
      createEl(frame, "p", { text: "저장될 지식과 근거를 확인한 뒤 승인합니다. 자동 승인은 없습니다." });
      createEl(frame, "pre", { text: typeof packet.after_bytes === "string" ? packet.after_bytes : "", attr: { "aria-label": "승인할 지식 내용" } });
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
      sourceContext(parent);
      const host = createEl(parent, "section", { attr: { class: "llmwiki-lifecycle__review", "aria-label": "제안 검토" } });
      const packet = plain(snapshot.approval_packet) ? snapshot.approval_packet : null;
      if (packet && packet.packet_version === "llmwiki_canonical_packet_v1") {
        renderCanonicalReview(host, packet);
        return;
      }
      const child = reviewModule(options.reviewView);
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
      advancedInfo(parent);
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
      actionButton(actions, "새 검토 시작", "select-source", { action: "select_source" }, { primary: true });
      advancedInfo(parent);
    }

    function renderStale(parent) {
      statusRegion(parent, "검토 중인 내용이 변경되어 다시 확인해야 합니다.", "error");
      sourceContext(parent);
      const actions = actionRow(parent);
      actionButton(actions, "새 검토 패킷 만들기", "repacket-stale", { action: "repacket_stale" }, { primary: true });
      actionButton(actions, "다시 확인 후 승인", "reconfirm-stale", { action: "reconfirm_stale" }, { disabled: true });
      advancedInfo(parent);
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
      advancedInfo(parent);
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
      createEl(container, "style", { text: CSS, attr: { "data-style": "llmwiki-lifecycle" } });
      frame = createEl(container, "section", {
        attr: {
          class: "llmwiki-lifecycle prodigy-full-bleed",
          "data-surface": "llmwiki-lifecycle",
          "data-state": snapshot.status,
          "aria-label": "LLM Wiki 검토 흐름",
          "aria-busy": ["running", "committing"].includes(snapshot.status) ? "true" : "false",
        },
      });
      frame.onkeydown = escape;
      const header = createEl(frame, "header");
      createEl(header, "h2", { text: "LLM Wiki", attr: { tabindex: "-1", "data-lifecycle-heading": "", "data-focus-key": "heading" } });

      if (snapshot.status === "idle") renderIdle(frame);
      else if (snapshot.status === "selecting") renderSelecting(frame);
      else if (snapshot.status === "consent_required") renderConsent(frame);
      else if (["running", "committing"].includes(snapshot.status)) renderProgress(frame);
      else if (["review", "review_only"].includes(snapshot.status)) renderReview(frame);
      else if (snapshot.status === "committed") renderCommitted(frame);
      else if (snapshot.status === "stale_reconfirm_required") renderStale(frame);
      else if (snapshot.status === "committed_audit_pending") renderRecovery(frame, "audit");
      else if (snapshot.status === "committed_refresh_failed") renderRecovery(frame, "refresh");
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

  const api = Object.freeze({ STATUSES, OPERATION_LABELS, CSS, mountLlmWikiLifecycleView });
  root.LLMWikiLifecycleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
