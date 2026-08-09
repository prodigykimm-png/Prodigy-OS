"use strict";

(function (root) {
  function dependencies() {
    const globalRoot = typeof globalThis !== "undefined" ? globalThis : root;
    const Candidate = root.KnowledgeCandidateCore || globalRoot.KnowledgeCandidateCore;
    const Quality = root.EvidenceQualityCore || globalRoot.EvidenceQualityCore;
    if (!Candidate || !Quality) {
      throw new Error("Knowledge Candidate core and Evidence Quality core must load before the Candidate Inbox view.");
    }
    return { Candidate, Quality };
  }

  function createEl(parent, tag, options = {}) {
    if (!parent) return null;
    if (typeof parent.createEl === "function") return parent.createEl(tag, options);
    const element = parent.ownerDocument.createElement(tag);
    if (options.text !== undefined) element.textContent = String(options.text);
    Object.entries(options.attr || {}).forEach(([name, value]) => element.setAttribute(name, value));
    if (options.disabled) element.disabled = true;
    parent.appendChild(element);
    return element;
  }

  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function list(value) { return Array.isArray(value) ? value.filter((item) => text(item)) : []; }
  function label(value, labels, fallback) { return labels[value] || fallback || text(value) || "확인 필요"; }
  function reasonSections(value) {
    const source = String(value == null ? "" : value).trim();
    if (!source) return [];
    const sections = [];
    let current = { title: "제안 이유", lines: [] };
    const flush = () => {
      const body = current.lines.join("\n").trim();
      if (body) sections.push(Object.freeze({ title: current.title, body }));
    };
    source.split(/\r?\n/).forEach((line) => {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        flush();
        current = { title: text(heading[1]) || "세부 기록", lines: [] };
      } else {
        current.lines.push(line);
      }
    });
    flush();
    return sections;
  }

  function renderReason(parent, reason) {
    const sections = reasonSections(reason);
    if (sections.length <= 1 && (!sections.length || sections[0].title === "제안 이유")) {
      createEl(parent, "p", { text: `제안 이유: ${text(reason)}`, attr: { class: "knowledge-explorer-detail-item-note" } });
      return;
    }
    const wrapper = createEl(parent, "section", {
      attr: { class: "knowledge-candidate-reason-sections", "aria-label": "제안 이유와 학습 기록" }
    });
    createEl(wrapper, "h5", { text: "제안 이유와 학습 기록", attr: { class: "knowledge-explorer-detail-item-meta" } });
    sections.forEach((section) => {
      const block = createEl(wrapper, "div", { attr: { class: "knowledge-candidate-reason-section" } });
      createEl(block, "h6", { text: section.title, attr: { class: "knowledge-explorer-detail-item-meta" } });
      createEl(block, "p", { text: section.body, attr: { class: "knowledge-explorer-detail-item-note" } });
    });
  }

  function activeCandidates(candidates) {
    const { Candidate } = dependencies();
    return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
      try { return Candidate.isActive(candidate); } catch (_error) { return false; }
    });
  }

  function qualityFor(candidate) {
    const { Quality } = dependencies();
    const supplied = candidate && candidate.evidence_quality;
    if (supplied && typeof supplied === "object" && typeof supplied.status === "string") return supplied;
    return { status: candidate && candidate.confidence === "explicit" ? "usable" : "thin" };
  }

  function normalizedDraft(candidate, draft) {
    const { Candidate } = dependencies();
    const source = draft && typeof draft === "object" ? draft : {};
    const domain = text(source.knowledge_domain || candidate.suggested_domain);
    const topics = Array.isArray(source.knowledge_topics) ? list(source.knowledge_topics) : list(candidate.suggested_topics);
    return {
      title: text(source.title || candidate.title),
      statement: text(source.statement || candidate.statement),
      knowledge_domain: Candidate.DOMAINS.includes(domain) ? domain : "",
      knowledge_topics: topics,
      topics_confirmed: source.topics_confirmed === true,
      approval_note: text(source.approval_note || candidate.approval_note),
      thin_override: source.thin_override === true
    };
  }

  function button(parent, options) {
    const control = createEl(parent, "button", {
      text: options.text,
      attr: {
        type: "button", class: "knowledge-candidate-button knowledge-explorer-button", "data-group": "candidate", "data-key": options.candidateId || "", "data-action": options.action || "", "aria-label": options.ariaLabel || options.text
      },
      disabled: options.disabled
    });
    if (options.disabled) return control;
    const activate = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (typeof options.onAction === "function") options.onAction(event);
    };
    control.onclick = activate;
    control.onkeydown = (event) => {
      if (!event || !["Enter", " "].includes(event.key)) return;
      activate(event);
    };
    return control;
  }

  function input(parent, options) {
    const control = createEl(parent, options.tag || "input", {
      attr: { name: options.name, type: options.type || "text", value: options.value || "", class: "knowledge-candidate-input", "aria-label": options.label }
    });
    control.value = options.value || "";
    control.oninput = (event) => options.onChange(event && event.target ? event.target.value : control.value);
    return control;
  }

  function sourceObjectTarget(value) {
    let target = text(value).replace(/^\[\[/, "").replace(/\]\]$/, "");
    const pipe = target.indexOf("|");
    if (pipe >= 0) target = target.slice(0, pipe);
    const hash = target.indexOf("#");
    if (hash >= 0) target = target.slice(0, hash);
    return target.trim();
  }

  function sourceObjectLabel(value, target) {
    const raw = text(value).replace(/^\[\[/, "").replace(/\]\]$/, "");
    const pipe = raw.indexOf("|");
    return pipe >= 0 ? text(raw.slice(pipe + 1)) || target : target;
  }

  function provenance(parent, candidate, options) {
    const confidence = label(candidate.confidence, { explicit: "명시적", inferred: "추론", low: "낮음" });
    const sourceObjects = list(candidate.source_objects);
    const route = [label(candidate.suggested_domain, { real_estate: "부동산", wedding: "웨딩", coding: "코딩", workout: "운동", reading: "독서", business: "비즈니스", personal_growth: "개인 성장" }, "미분류"), list(candidate.suggested_topics).join(", ")].filter(Boolean).join(" · ");
    const details = [
      `Daily Evidence: ${list(candidate.source_evidence_ids).join(", ") || "연결된 Evidence ID 없음"}`,
      `출처 Object: ${sourceObjects.join(", ") || "연결된 Object 없음"}`,
      `연결 Region: ${list(candidate.connections).filter((link) => typeof link === "string" && link.includes("Auction Regions")).join(", ") || "연결된 Region 없음"}`,
      `무효화 조건: ${list(candidate.invalidation_conditions).join("; ") || "없음"}`,
      `신뢰도: ${confidence}`,
      `제안 경로: ${route || "미분류"}`
    ];
    details.forEach((value) => createEl(parent, "p", { text: value, attr: { class: "knowledge-explorer-detail-item-meta" } }));
    if (sourceObjects.length && typeof options.onOpenSource === "function") {
      const sourceActions = createEl(parent, "div", { attr: { class: "knowledge-explorer-row-actions", "aria-label": "후보 출처 원본" } });
      sourceObjects.forEach((sourceObject) => {
        const target = sourceObjectTarget(sourceObject);
        if (!target) return;
        button(sourceActions, {
          text: `원본 열기: ${sourceObjectLabel(sourceObject, target)}`,
          action: "open-source",
          candidateId: candidate.candidate_id,
          disabled: options.disabled,
          onAction: () => options.onOpenSource(target, candidate)
        });
      });
    }
  }

  function draftFields(parent, candidate, draft, onDraftChange, disabled) {
    const { Candidate } = dependencies();
    const fieldset = createEl(parent, "fieldset", { attr: { class: "knowledge-candidate-fields", "aria-label": `${candidate.title} 승인 확인` } });
    const update = (patch) => onDraftChange({ ...draft, ...patch });
    createEl(fieldset, "label", { text: "제목", attr: { for: `candidate-title-${candidate.candidate_id}` } });
    input(fieldset, { name: "title", value: draft.title, label: "사람이 확인한 제목", onChange: (value) => update({ title: value }) }).disabled = disabled;
    createEl(fieldset, "label", { text: "지식 문장", attr: { for: `candidate-statement-${candidate.candidate_id}` } });
    input(fieldset, { tag: "textarea", name: "statement", value: draft.statement, label: "사람이 확인한 지식 문장", onChange: (value) => update({ statement: value }) }).disabled = disabled;
    createEl(fieldset, "label", { text: "도메인", attr: { for: `candidate-domain-${candidate.candidate_id}` } });
    const domain = createEl(fieldset, "select", { attr: { name: "knowledge_domain", class: "knowledge-candidate-input", "aria-label": "사람이 확인한 지식 도메인" }, disabled });
    createEl(domain, "option", { text: "분류 선택 — 승인 전에 확인", attr: { value: "", selected: draft.knowledge_domain ? undefined : "selected" } });
    Candidate.DOMAINS.forEach((key) => createEl(domain, "option", { text: label(key, { real_estate: "부동산", wedding: "웨딩", coding: "코딩", workout: "운동", reading: "독서", business: "비즈니스", personal_growth: "개인 성장" }), attr: { value: key, selected: key === draft.knowledge_domain ? "selected" : undefined } }));
    domain.value = draft.knowledge_domain;
    domain.onchange = (event) => update({ knowledge_domain: event && event.target ? event.target.value : domain.value, knowledge_topics: [] });
    const topics = Candidate.TOPICS[draft.knowledge_domain] || [];
    createEl(fieldset, "p", { text: topics.length ? "주제(사람이 확인)" : "이 도메인에는 확인할 주제가 없습니다.", attr: { class: "knowledge-explorer-meta" } });
    topics.forEach((topic) => {
      const checked = draft.knowledge_topics.includes(topic);
      const topicInput = createEl(fieldset, "input", { attr: { type: "checkbox", name: "knowledge_topics", value: topic, "aria-label": `주제 ${topic}` }, disabled });
      topicInput.checked = checked;
      topicInput.onchange = (event) => {
        const next = event && event.target && event.target.checked ? [...draft.knowledge_topics, topic] : draft.knowledge_topics.filter((item) => item !== topic);
        update({ knowledge_topics: [...new Set(next)] });
      };
      createEl(fieldset, "span", { text: topic, attr: { class: "knowledge-explorer-meta" } });
    });
    const topicsConfirmed = createEl(fieldset, "input", { attr: { type: "checkbox", name: "topics_confirmed", "aria-label": "주제를 사람이 확인함" }, disabled });
    topicsConfirmed.checked = draft.topics_confirmed;
    topicsConfirmed.onchange = (event) => update({ topics_confirmed: Boolean(event && event.target && event.target.checked) });
    createEl(fieldset, "span", { text: "주제를 사람이 확인했습니다.", attr: { class: "knowledge-explorer-meta" } });
    createEl(fieldset, "label", { text: "승인 사유", attr: { for: `candidate-note-${candidate.candidate_id}` } });
    input(fieldset, { tag: "textarea", name: "approval_note", value: draft.approval_note, label: "승인 또는 override 사유", onChange: (value) => update({ approval_note: value }) }).disabled = disabled;
  }

  function candidateCard(parent, candidate, options) {
    const { Quality } = dependencies();
    const suppliedDraft = typeof options.draftFor === "function" ? options.draftFor(candidate.candidate_id) : options.drafts && options.drafts[candidate.candidate_id];
    const draft = normalizedDraft(candidate, suppliedDraft);
    const quality = qualityFor(candidate);
    const eligibility = Quality.checkPromotionEligibility(quality, { override: draft.thin_override, approval_note: draft.approval_note });
    const card = createEl(parent, "article", { attr: { class: "knowledge-candidate-card knowledge-explorer-detail-card", "data-candidate-id": candidate.candidate_id } });
    createEl(card, "h4", { text: candidate.title, attr: { class: "knowledge-explorer-detail-title" } });
    createEl(card, "p", { text: candidate.statement, attr: { class: "knowledge-explorer-detail-item-note" } });
    renderReason(card, candidate.reason);
    provenance(card, candidate, options);
    createEl(card, "p", { text: `근거 품질: ${Quality.STATUS_LABELS[eligibility.status] || "확인 필요"}`, attr: { class: "knowledge-explorer-detail-item-meta" } });
    if (eligibility.requires_override) {
      const override = createEl(card, "input", { attr: { type: "checkbox", name: "thin_override", "aria-label": "보완 필요 근거를 명시적으로 승인" }, disabled: options.disabled });
      override.checked = draft.thin_override;
      override.onchange = (event) => options.onDraftChange(candidate.candidate_id, { ...draft, thin_override: Boolean(event && event.target && event.target.checked) });
      createEl(card, "span", { text: "명시적 override와 승인 사유가 필요합니다.", attr: { class: "knowledge-explorer-meta" } });
    }
    draftFields(card, candidate, draft, (next) => options.onDraftChange(candidate.candidate_id, next), options.disabled);
    const actions = createEl(card, "div", { attr: { class: "knowledge-explorer-row-actions" } });
    const deferred = candidate.status === "needs_more_evidence";
    if (deferred) createEl(card, "p", { text: "증거 보강 대기 — 검토를 재개한 뒤에만 승인할 수 있습니다.", attr: { class: "knowledge-explorer-meta" } });
    button(actions, { text: "승인", action: "approve", candidateId: candidate.candidate_id, disabled: options.disabled || deferred, onAction: () => options.onAction({ type: "approve", candidateId: candidate.candidate_id, draft }) });
    if (deferred) {
      button(actions, { text: "검토 재개", action: "resume", candidateId: candidate.candidate_id, disabled: options.disabled, onAction: () => options.onAction({ type: "resume", candidateId: candidate.candidate_id }) });
    } else {
      button(actions, { text: "보류", action: "defer", candidateId: candidate.candidate_id, disabled: options.disabled, onAction: () => options.onAction({ type: "defer", candidateId: candidate.candidate_id }) });
    }
    button(actions, { text: "반려", action: "reject", candidateId: candidate.candidate_id, disabled: options.disabled, onAction: () => options.onAction({ type: "reject", candidateId: candidate.candidate_id }) });
  }

  function renderCandidateInbox(parent, options = {}) {
    const candidates = activeCandidates(options.candidates);
    const section = createEl(parent, "section", { attr: { class: "knowledge-candidate-inbox knowledge-explorer-asset-section", "data-section-key": "candidate-inbox", "aria-label": "검증 대기" } });
    createEl(section, "h3", { text: `검증 대기 ${candidates.length}` });
    createEl(section, "p", { text: "검증된 지식과 분리된 사람이 검토할 후보입니다.", attr: { class: "knowledge-explorer-detail-summary" } });
    if (options.phase === "loading") createEl(section, "p", { text: "검증 대기 후보를 불러오는 중입니다.", attr: { class: "knowledge-explorer-empty" } });
    if (options.error) {
      createEl(section, "p", { text: "후보를 불러오지 못했습니다. 입력 내용은 유지됩니다.", attr: { class: "knowledge-explorer-detail-empty", "data-state": "warning" } });
      button(section, { text: "다시 시도", action: "retry", disabled: options.disabled, onAction: () => {
        if (typeof options.onRetry === "function") options.onRetry();
        else if (typeof options.onAction === "function") options.onAction({ type: "retry" });
      } });
    }
    if (!candidates.length && options.phase !== "loading") createEl(section, "p", { text: "검토할 활성 후보가 없습니다.", attr: { class: "knowledge-explorer-detail-empty" } });
    candidates.forEach((candidate) => candidateCard(section, candidate, options));
    return section;
  }

  function createCandidateInboxController(options = {}, onChange = () => {}) {
    const initial = options.candidateInbox && typeof options.candidateInbox === "object" ? options.candidateInbox : {};
    let candidates = activeCandidates(initial.candidates);
    let phase = initial.phase === "loading" ? "loading" : "ready";
    let error = Boolean(initial.error);
    let pending = false;
    let retryAction = null;
    const drafts = new Map();

    function draftFor(candidateId) {
      const candidate = candidates.find((item) => item.candidate_id === candidateId); return candidate ? normalizedDraft(candidate, drafts.get(candidateId)) : {};
    }

    function updateDraft(candidateId, draft) {
      drafts.set(candidateId, draft);
      onChange();
    }

    function requestFor(candidate, draft) {
      const { Quality } = dependencies();
      if (!draft.topics_confirmed) throw new Error("Topics를 사람이 확인해 주세요.");
      const evidenceQuality = qualityFor(candidate);
      const eligibility = Quality.checkPromotionEligibility(evidenceQuality, { override: draft.thin_override, approval_note: draft.approval_note });
      if (!eligibility.allowed) throw new Error(eligibility.reasons.join(" "));
      return { ...draft, evidence_quality: evidenceQuality };
    }

    async function perform(action) {
      if (pending || !action) return;
      const candidate = candidates.find((item) => item.candidate_id === action.candidateId);
      if (!candidate) return;
      if (action.type === "retry") return perform(retryAction);
      pending = true;
      error = false;
      retryAction = action;
      onChange();
      try {
        const store = options.candidateStore;
        if (!store || !options.app) throw new Error("Knowledge Candidate 저장소를 사용할 수 없습니다.");
        if (action.type === "approve") {
          const result = await store.approveCandidate(options.app, candidate.path, requestFor(candidate, action.draft || draftFor(candidate.candidate_id)));
          candidates = candidates.filter((item) => item.candidate_id !== candidate.candidate_id);
          if (result && result.path && typeof options.onOpenBeside === "function") await options.onOpenBeside(result.path);
        } else if (action.type === "reject") {
          await store.rejectCandidate(options.app, candidate.path);
          candidates = candidates.filter((item) => item.candidate_id !== candidate.candidate_id);
        } else if (action.type === "defer") {
          await store.deferCandidate(options.app, candidate.path);
          candidates = candidates.map((item) => item.candidate_id === candidate.candidate_id ? { ...item, status: "needs_more_evidence" } : item);
        } else if (action.type === "resume") {
          await store.resumeCandidate(options.app, candidate.path);
          candidates = candidates.map((item) => item.candidate_id === candidate.candidate_id ? { ...item, status: "saved" } : item);
        }
        retryAction = null;
      } catch (_error) {
        error = true;
      } finally {
        pending = false;
        onChange();
      }
    }

    async function reload() {
      if (pending || typeof options.loadCandidates !== "function") return;
      pending = true;
      error = false;
      onChange();
      try {
        candidates = activeCandidates(await options.loadCandidates());
      } catch (_error) {
        error = true;
      } finally {
        pending = false;
        onChange();
      }
    }

    return Object.freeze({
      renderOptions(disabled, beforeAction) {
        return {
          candidates, phase, error, disabled: Boolean(disabled || pending), draftFor,
          onOpenSource: options.onOpenSource,
          onDraftChange: updateDraft,
          onAction(action) { if (typeof beforeAction === "function") beforeAction(action); void perform(action); },
          onRetry() { if (typeof beforeAction === "function") beforeAction(retryAction || { type: "retry" }); if (retryAction) void perform(retryAction); else void reload(); }
        };
      },
      replace(next) { candidates = activeCandidates(next); phase = "ready"; error = false; onChange(); },
      state() { return { candidates: candidates.slice(), phase, error, pending }; }
    });
  }

  const api = Object.freeze({ activeCandidates, normalizedDraft, qualityFor, reasonSections, renderCandidateInbox, createCandidateInboxController });
  root.KnowledgeCandidateView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
