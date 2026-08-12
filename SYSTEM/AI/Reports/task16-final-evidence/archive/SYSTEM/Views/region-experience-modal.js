(function (root) {
  "use strict";

  if (typeof require === "function") {
    if (!root.RegionExperienceContract) root.RegionExperienceContract = require("./region-experience-contract.js");
    if (!root.RegionExperienceAI) root.RegionExperienceAI = require("./region-experience-ai.js");
    if (!root.RegionExperienceHandoff) root.RegionExperienceHandoff = require("./region-experience-handoff.js");
    if (!root.JournalCore) root.JournalCore = require("./journal-core.js");
  }

  const CATEGORY_OPTIONS = Object.freeze([
    ["transport_life", "교통·생활"], ["supply_observation", "임장 포인트"], ["risk", "리스크·주의"], ["site_visit", "현장 방문"]
  ]);
  const EPISTEMIC_OPTIONS = Object.freeze([["direct_observation", "직접 관찰"], ["user_inference", "사용자 해석"]]);
  const MODAL_CSS = `
.region-experience-modal{max-width:760px;color:var(--ke-color-text);font-size:var(--ke-type-body);line-height:var(--ke-leading-body)}
.region-experience-modal *{min-inline-size:0;box-sizing:border-box}.region-experience-modal input,.region-experience-modal select,.region-experience-modal textarea{width:100%;min-height:var(--ke-touch-target);padding:var(--ke-space-3);color:var(--ke-color-text);background:var(--ke-color-surface);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);font:inherit;line-height:var(--ke-leading-body);word-break:keep-all;overflow-wrap:anywhere}.region-experience-modal textarea{resize:vertical}.region-experience-modal button{min-height:var(--ke-touch-target);padding:var(--ke-space-3) var(--ke-space-4);border-radius:var(--ke-radius-control);word-break:keep-all;overflow-wrap:anywhere}.region-experience-modal button:focus-visible,.region-experience-modal input:focus-visible,.region-experience-modal select:focus-visible,.region-experience-modal textarea:focus-visible{outline:2px solid var(--ke-color-accent);outline-offset:2px}.region-experience-modal button:not(:disabled){transition:background-color var(--ke-motion-fast),transform var(--ke-motion-fast)}
.region-experience-form{display:grid;gap:var(--ke-space-3)}.region-experience-field{display:grid;gap:var(--ke-space-2)}.region-experience-field label{font-weight:700}.region-experience-help{margin:0;color:var(--ke-color-muted);word-break:keep-all;overflow-wrap:anywhere}.region-experience-error{margin:0;color:var(--ke-color-error);font-weight:700}.region-experience-actions,.region-experience-saved-actions{display:flex;gap:var(--ke-space-3);flex-wrap:wrap;align-items:center}.region-experience-actions button:last-child,.region-experience-review-footer button:last-child{background:var(--ke-color-interactive);color:var(--ke-color-on-interactive)}
.region-experience-review-shell{display:flex;flex-direction:column;max-block-size:min(78vh,720px);min-block-size:0;overflow:hidden}.region-experience-review-body{flex:1 1 auto;min-block-size:0;overflow-y:auto;padding-inline-end:var(--ke-space-2)}.region-experience-review-card{margin-block:var(--ke-space-3);padding:var(--ke-space-3);border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-panel);background:var(--ke-color-surface-secondary);word-break:keep-all;overflow-wrap:anywhere}.region-experience-review-card h4{margin:0 0 var(--ke-space-2);font-size:var(--ke-type-body)}.region-experience-ai-notice{color:var(--ke-color-accent);font-weight:700}.region-experience-review-footer{position:sticky;bottom:0;z-index:1;flex:0 0 auto;display:flex;gap:var(--ke-space-3);flex-wrap:wrap;align-items:center;padding:var(--ke-space-3) 0;background:var(--ke-color-surface);border-top:1px solid var(--ke-color-border)}.region-experience-review-footer button:last-child{margin-inline-start:auto}.region-experience-check{display:flex;gap:var(--ke-space-2);align-items:center;min-block-size:var(--ke-touch-target);word-break:keep-all;overflow-wrap:anywhere;cursor:pointer}.region-experience-check.is-selected{padding-inline:var(--ke-space-2);color:var(--ke-color-accent);background:var(--ke-color-hover);border:1px solid var(--ke-color-accent);box-shadow:none;border-radius:var(--ke-radius-control)}.region-experience-check:focus-visible,.region-experience-check:focus-within{outline:2px solid var(--ke-color-accent);outline-offset:2px}.region-experience-check input{width:auto;min-height:auto;margin:0}.region-experience-saved-state{font-weight:700}.region-experience-modal [aria-busy=true]{opacity:.7}
@media(max-width:599px){.region-experience-modal{max-width:none}.region-experience-actions>*,.region-experience-saved-actions>*{flex:1 1 100%}.region-experience-review-footer{display:grid;grid-template-columns:minmax(0,1fr);align-items:stretch;gap:var(--ke-space-3)}.region-experience-review-footer>*{min-block-size:var(--ke-touch-target);inline-size:100%}.region-experience-review-footer button:last-child{margin-inline-start:0}.region-experience-form{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.region-experience-modal button:not(:disabled){transition:none;transform:none}}
`;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clean(value) { return typeof value === "string" ? value.trim() : ""; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function notice(message) { if (typeof root.Notice === "function") new root.Notice(message); }
  function safeRecoveryMessage(error) {
    const message = error && error.message ? error.message : String(error || "");
    if (/region\.|region_key|region_sido|region_sigungu|wiki_link|\.path|Region Experience input|canonical/i.test(message)) return "입력 내용을 확인해 주세요. 유효한 권역을 하나 선택한 뒤 다시 시도해 주세요.";
    return /[가-힣]/.test(message) ? message : "처리 중 문제가 발생했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.";
  }
  function addClass(element, className) { if (element && typeof element.addClass === "function") element.addClass(className); else if (element) element.className = `${element.className || ""} ${className}`.trim(); }
  function setText(element, value) { if (element && typeof element.setText === "function") element.setText(value); else if (element) element.textContent = value; }
  function button(parent, text, primary) { return parent.createEl("button", { text, attr: { type: "button", class: primary ? "prodigy-btn prodigy-btn-primary" : "prodigy-btn" } }); }
  function labelField(parent, label, control) { const wrap = parent.createEl("div", { attr: { class: "region-experience-field" } }); wrap.createEl("label", { text: label }); const item = wrap.createEl(control, { attr: { "aria-label": label } }); return item; }
  function validRegion(value) {
    if (!plain(value) || value.type !== "auction_region") return false;
    const key = clean(value.region_key);
    const sido = clean(value.region_sido);
    const sigungu = clean(value.region_sigungu);
    if (!key || key !== value.region_key || !sido || sido !== value.region_sido || !sigungu || sigungu !== value.region_sigungu) return false;
    if (!/^\S(?:.*\S)?-\S(?:.*\S)?$/.test(key) || /[\\/\[\]<>`\r\n]/.test(key) || key.split("-").length !== 2 || `${sido}-${sigungu}` !== key) return false;
    const path = `PARA/RESOURCES/Auction Regions/${key}.md`;
    const wikiLink = `[[PARA/RESOURCES/Auction Regions/${key}]]`;
    return value.path === path && value.wiki_link === wikiLink;
  }
  function uniqueRegions(values) { const seen = new Set(); return (Array.isArray(values) ? values : []).filter(validRegion).filter((item) => !seen.has(item.region_key) && (seen.add(item.region_key), true)); }
  function relatedLinks(value) { return Array.from(new Set(String(value || "").split(/[\n,]/).map(clean).filter(Boolean))); }
  function choiceLabel(options, value) { const found = options.find((item) => item[0] === value); return found ? found[1] : value; }

  class FallbackModal {
    constructor(app) { this.app = app; this.contentEl = fallbackElement("div"); }
    open() { if (typeof this.onOpen === "function") this.onOpen(); if (root.document && root.document.body && this.contentEl.nodeType && !this.contentEl.parentNode) root.document.body.appendChild(this.contentEl); return this; }
    close() { if (this.contentEl.parentNode) this.contentEl.parentNode.removeChild(this.contentEl); if (typeof this.onClose === "function") this.onClose(); }
  }
  function fallbackElement(tag) {
    if (root.document && typeof root.document.createElement === "function") {
      const element = root.document.createElement(tag);
      element.empty = () => element.replaceChildren();
      element.addClass = (name) => element.classList.add(name);
      element.setText = (value) => { element.textContent = String(value); };
      element.createEl = (childTag, options = {}) => {
        const child = fallbackElement(childTag);
        if (options.text) child.textContent = options.text;
        Object.entries(options.attr || {}).forEach(([name, value]) => child.setAttribute(name, String(value)));
        element.appendChild(child);
        return child;
      };
      return element;
    }
    return { tag, children: [], style: {}, attributes: {}, value: "", checked: false, disabled: false,
      empty() { this.children = []; this.textContent = ""; }, addClass() {}, setText(value) { this.textContent = String(value); }, setAttribute(name, value) { this.attributes[name] = String(value); }, focus() {},
      createEl(childTag, options) { const child = fallbackElement(childTag); child.textContent = options && options.text || ""; child.attributes = options && options.attr || {}; child.parent = this; this.children.push(child); return child; }
    };
  }
  const ModalBase = root.obsidian && root.obsidian.Modal ? root.obsidian.Modal : FallbackModal;

  class RegionExperienceModal extends ModalBase {
    constructor(app, options) {
      super(app);
      this.options = options || {};
      this.app = app || this.options.app;
      this.returnFocus = this.options.returnFocus || this.options.focusReturn || null;
      this.selectedRegions = uniqueRegions(this.options.selectedRegions || (this.options.selectedRegion ? [this.options.selectedRegion] : []));
      this.availableRegions = uniqueRegions((this.options.regions || this.options.availableRegions || []).concat(this.selectedRegions));
      this.defaultRegion = this.selectedRegions.length === 1 ? this.selectedRegions[0] : this.availableRegions[0] || null;
      this.regionByKey = new Map(this.availableRegions.concat(this.selectedRegions).map((item) => [item.region_key, item]));
      this.draft = { experience_date: this.today(), region_key: this.defaultRegion ? this.defaultRegion.region_key : "", category: "site_visit", epistemic_status: "direct_observation", direct_observation: "", subarea: "", related_links: "" };
      this.phase = "input";
      this.proposal = null;
      this.savedState = null;
      this.selectedRegionCandidateIndex = null;
      this.regionApproved = false;
      this.busy = false;
      this.error = "";
      this.closed = false;
    }
    today() { return root.JournalCore && typeof root.JournalCore.todayIsoDate === "function" ? root.JournalCore.todayIsoDate() : new Date().toISOString().slice(0, 10); }
    getState() { return { phase: this.phase, busy: this.busy, draft: clone(this.draft), returnFocus: Boolean(this.returnFocus), savedState: this.savedState ? clone(this.savedState) : null }; }
    onOpen() { this.render(); }
    onClose() { this.closed = true; if (this.returnFocus && typeof this.returnFocus.focus === "function") this.returnFocus.focus(); }
    recover(error) { this.error = safeRecoveryMessage(error); notice(this.error); }
    selectedRegion() { return this.regionByKey.get(this.draft.region_key) || null; }
    buildInput() {
      const region = this.selectedRegion();
      if (!region) throw new Error("유효한 권역을 하나 선택한 뒤 다시 시도해 주세요.");
      if (!clean(this.draft.direct_observation)) throw new Error("직접 관찰을 입력해 주세요.");
      const input = { experience_date: this.draft.experience_date, region_key: region.region_key, region, category: this.draft.category, epistemic_status: this.draft.epistemic_status, direct_observation: clean(this.draft.direct_observation), subarea: clean(this.draft.subarea), related_object_links: relatedLinks(this.draft.related_links) };
      const contract = root.RegionExperienceContract;
      try { return contract && typeof contract.normalizeInput === "function" ? contract.normalizeInput(input) : input; }
      catch (error) { throw new Error(safeRecoveryMessage(error)); }
    }
    handoff() { if (this.options.handoff) return this.options.handoff; if (!root.RegionExperienceHandoff || typeof root.RegionExperienceHandoff.createHandoff !== "function") throw new Error("지역 경험 저장 기능을 불러오지 못했습니다."); return root.RegionExperienceHandoff.createHandoff(this.options.handoffServices); }
    render() {
      this.contentEl.empty(); addClass(this.contentEl, "region-experience-modal");
      this.contentEl.createEl("style", { text: MODAL_CSS });
      if (this.phase === "input") return this.renderInput();
      if (this.phase === "review") return this.renderReview();
      return this.renderSaved();
    }
    renderInput() {
      this.contentEl.createEl("h3", { text: "지역 경험 추가" });
      this.contentEl.createEl("p", { text: "직접 관찰을 먼저 기록하고, 필요한 경우에만 AI 분석을 요청하세요. 열기와 취소는 저장하지 않습니다.", attr: { class: "region-experience-help" } });
      if (!this.availableRegions.length) {
        this.contentEl.createEl("p", { text: "유효한 권역을 하나 선택한 뒤 다시 시도해 주세요.", attr: { class: "region-experience-error", role: "alert" } });
        const actions = this.contentEl.createEl("div", { attr: { class: "region-experience-actions" } });
        const cancel = button(actions, "취소"); cancel.onclick = () => this.close();
        return;
      }
      const form = this.contentEl.createEl("div", { attr: { class: "region-experience-form", "aria-busy": String(this.busy) } });
      const regionSelect = labelField(form, "권역", "select");
      regionSelect.createEl("option", { text: "권역 선택", attr: { value: "" } });
      this.availableRegions.forEach((item) => regionSelect.createEl("option", { text: `${item.region_sido} ${item.region_sigungu}`, attr: { value: item.region_key } }));
      regionSelect.value = this.draft.region_key; regionSelect.onchange = () => { this.draft.region_key = regionSelect.value; this.error = ""; };
      const date = labelField(form, "경험일", "input"); date.attributes && (date.attributes.type = "date"); date.setAttribute && date.setAttribute("type", "date"); date.value = this.draft.experience_date; date.oninput = () => { this.draft.experience_date = date.value; };
      const subarea = labelField(form, "세부 권역·장소", "input"); subarea.value = this.draft.subarea; subarea.oninput = () => { this.draft.subarea = subarea.value; };
      const category = labelField(form, "분류", "select"); CATEGORY_OPTIONS.forEach(([value, text]) => category.createEl("option", { text, attr: { value } })); category.value = this.draft.category; category.onchange = () => { this.draft.category = category.value; };
      const observation = labelField(form, "직접 관찰", "textarea"); observation.attributes && (observation.attributes.rows = "5"); observation.value = this.draft.direct_observation; observation.oninput = () => { this.draft.direct_observation = observation.value; };
      const epistemic = labelField(form, "인식 상태", "select"); EPISTEMIC_OPTIONS.forEach(([value, text]) => epistemic.createEl("option", { text, attr: { value } })); epistemic.value = this.draft.epistemic_status; epistemic.onchange = () => { this.draft.epistemic_status = epistemic.value; };
      const links = labelField(form, "관련 Auction/Property 링크", "textarea"); links.attributes && (links.attributes.rows = "2"); links.value = this.draft.related_links; links.oninput = () => { this.draft.related_links = links.value; };
      if (this.error) form.createEl("p", { text: this.error, attr: { class: "region-experience-error", role: "alert" } });
      const actions = form.createEl("div", { attr: { class: "region-experience-actions" } });
      const cancel = button(actions, "취소"); cancel.onclick = () => this.close();
      const manual = button(actions, "Evidence만 저장"); manual.disabled = this.busy; manual.onclick = async () => this.makeManual();
      const analyze = button(actions, "AI 분석", true); analyze.disabled = this.busy; analyze.onclick = async () => this.analyze();
    }
    async analyze() {
      if (this.busy) return;
      let input;
      try { input = this.buildInput(); } catch (error) { this.recover(error.message); this.render(); return; }
      const ai = root.RegionExperienceAI;
      if (!ai || typeof ai.generateProposal !== "function") { this.recover("AI 분석 기능을 불러오지 못했습니다."); this.render(); return; }
      this.busy = true; this.error = ""; this.render();
      try { this.proposal = await ai.generateProposal({ app: this.app, input, providerKey: this.options.providerKey, signal: this.options.signal }); this.phase = "review"; }
      catch (error) { this.recover(error && error.name === "AbortError" ? "AI 분석이 취소되었습니다. 입력은 유지됩니다." : error.message || "AI 분석에 실패했습니다. 다시 시도해 주세요."); }
      finally { this.busy = false; this.render(); }
    }
    async makeManual() {
      if (this.busy) return;
      let input;
      try { input = this.buildInput(); } catch (error) { this.recover(error.message); this.render(); return; }
      try {
        if (!root.RegionExperienceHandoff || typeof root.RegionExperienceHandoff.createManualEvidenceProposal !== "function") throw new Error("Evidence 저장 기능을 불러오지 못했습니다.");
        this.proposal = root.RegionExperienceHandoff.createManualEvidenceProposal(input, { title: input.direct_observation.slice(0, 80), interpretation: "", change: "", next_experiment: "" });
        this.phase = "review"; this.error = ""; this.render();
      } catch (error) { this.recover(error.message || "Evidence 제안을 만들지 못했습니다."); this.render(); }
    }
    renderProposalBlock(body, title, value, ai) { const card = body.createEl("section", { attr: { class: "region-experience-review-card" } }); card.createEl("h4", { text: title }); if (ai) card.createEl("div", { text: "AI 제안 · 확인 필요", attr: { class: "region-experience-ai-notice" } }); card.createEl("p", { text: value || "내용 없음" }); }
    renderReview() {
      const shell = this.contentEl.createEl("div", { attr: { class: "region-experience-review-shell" } });
      const body = shell.createEl("div", { attr: { class: "region-experience-review-body", "aria-busy": String(this.busy) } });
      body.createEl("h3", { text: "지역 경험 검토" });
      this.renderProposalBlock(body, "직접 관찰 (원문)", this.proposal && this.proposal.evidence_blocks && this.proposal.evidence_blocks[0] && this.proposal.evidence_blocks[0].experience || this.draft.direct_observation, false);
      const evidence = this.proposal && this.proposal.evidence_blocks && this.proposal.evidence_blocks[0] || {};
      this.renderProposalBlock(body, "Evidence 제안", [evidence.title, evidence.interpretation, evidence.next_experiment].filter(Boolean).join(" · "), this.proposal && this.proposal.kind !== "manual_evidence_only");
      const candidates = this.proposal && this.proposal.region_candidates || [];
      candidates.forEach((candidate, index) => this.renderProposalBlock(body, `지역 후보 ${index + 1} · ${choiceLabel(CATEGORY_OPTIONS, candidate.category)}`, candidate.text, true));
      const revisionWrap = body.createEl("div", { attr: { class: "region-experience-review-card" } }); revisionWrap.createEl("h4", { text: "AI 수정 요청" });
      const revision = revisionWrap.createEl("textarea", { attr: { rows: "3", "aria-label": "AI 수정 요청" } }); revision.value = this.revisionRequest || ""; revision.oninput = () => { this.revisionRequest = revision.value; };
      const revise = button(revisionWrap, "제안 다시 만들기", true); revise.disabled = this.busy || this.proposal && this.proposal.kind === "manual_evidence_only"; revise.onclick = async () => this.revise();
      if (this.error) body.createEl("p", { text: this.error, attr: { class: "region-experience-error", role: "alert" } });
      const footer = shell.createEl("div", { attr: { class: "region-experience-review-footer" } });
      const back = button(footer, "다시 입력"); back.disabled = this.busy; back.onclick = () => { this.phase = "input"; this.render(); };
      const cancel = button(footer, "취소"); cancel.disabled = this.busy; cancel.onclick = () => this.close();
      const save = button(footer, "Evidence 승인·반영", true); save.disabled = this.busy || !this.proposal || !this.proposal.evidence_blocks || !this.proposal.evidence_blocks.length; save.onclick = async () => this.saveEvidence();
    }
    async revise() {
      if (this.busy) return;
      const request = clean(this.revisionRequest);
      if (!request) { this.recover("AI 수정 요청을 입력해 주세요."); this.render(); return; }
      let input;
      try { input = this.buildInput(); } catch (error) { this.recover(error.message); this.render(); return; }
      const ai = root.RegionExperienceAI;
      const method = ai && (ai.generateRevision || ai.generateProposal);
      if (typeof method !== "function") { this.recover("AI 수정 기능을 불러오지 못했습니다."); this.render(); return; }
      this.busy = true; this.error = ""; this.render();
      try { this.proposal = await method.call(ai, { app: this.app, input, revisionRequest: request, previousProposal: this.proposal, providerKey: this.options.providerKey, signal: this.options.signal }); this.revisionRequest = ""; }
      catch (error) { this.recover(error && error.name === "AbortError" ? "AI 수정이 취소되었습니다. 검토 내용은 유지됩니다." : error.message || "AI 수정에 실패했습니다. 다시 시도해 주세요."); }
      finally { this.busy = false; this.render(); }
    }
    async saveEvidence() {
      if (this.busy || !this.proposal) return;
      this.busy = true; this.error = ""; this.render();
      try {
        const result = await this.handoff().saveEvidence(this.app, { input: this.proposal.input || this.buildInput(), proposal: this.proposal, selectedEvidenceIds: this.proposal.evidence_blocks.map((block) => block.evidence_id) });
        if (!result || !result.ok || !result.savedState) throw new Error(result && result.message || "Evidence 저장에 실패했습니다. 다시 시도해 주세요.");
        this.savedState = result.savedState;
        const candidates = this.savedState.proposal && this.savedState.proposal.region_candidates || [];
        this.selectedRegionCandidateIndex = candidates.length === 1 ? 0 : null;
        this.regionApproved = false;
        this.phase = "saved";
      } catch (error) { this.recover(error.message || "Evidence 저장에 실패했습니다. 다시 시도해 주세요."); }
      finally { this.busy = false; this.render(); }
    }
    renderSaved() {
      this.contentEl.createEl("h3", { text: "Evidence 저장됨" });
      this.contentEl.createEl("p", { text: "저장된 Evidence는 변경하지 않습니다. 지역 반영과 지식 후보 저장은 각각 별도의 승인입니다.", attr: { class: "region-experience-saved-state" } });
      const regionCandidates = this.savedState && this.savedState.proposal && this.savedState.proposal.region_candidates || [];
      const regionWrap = this.contentEl.createEl("div", { attr: { class: "region-experience-review-card" } }); regionWrap.createEl("h4", { text: "지역 반영" });
      const regionAlreadyApproved = Boolean(this.savedState && Number.isInteger(this.savedState.regionApproval));
      if (regionCandidates.length) {
        regionWrap.createEl("p", { text: regionCandidates.length === 1 ? "지역 후보를 사람이 확인한 뒤 반영합니다." : "반영할 지역 후보 하나를 선택한 뒤 사람이 확인합니다.", attr: { class: "region-experience-help" } });
        regionCandidates.forEach((candidate, index) => {
          const selected = this.selectedRegionCandidateIndex === index;
          const line = regionWrap.createEl("label", { attr: { class: `region-experience-check${selected ? " is-selected" : ""}`, tabindex: "0" } });
          const check = line.createEl("input", { attr: { type: "radio", name: "region-experience-candidate", "aria-label": `지역 후보 ${index + 1} 선택` } });
          const toggle = () => { if (check.disabled) return; check.checked = true; check.onchange(); };
          check.checked = selected;
          check.disabled = this.busy || regionAlreadyApproved;
          check.onchange = () => { if (!check.checked || check.disabled) return; this.selectedRegionCandidateIndex = index; this.regionApproved = false; this.render(); };
          line.onclick = (event) => { if (event && event.target === check) return; if (event && typeof event.preventDefault === "function") event.preventDefault(); toggle(); };
          line.onkeydown = (event) => { if (!event || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); toggle(); };
          line.createEl("span", { text: `지역 후보 ${index + 1} · ${candidate.text}` });
        });
      }
      const regionSelected = Number.isInteger(this.selectedRegionCandidateIndex) && this.selectedRegionCandidateIndex >= 0 && this.selectedRegionCandidateIndex < regionCandidates.length;
      const regionCheck = regionWrap.createEl("input", { attr: { type: "checkbox", "aria-label": "지역 반영 승인" } }); regionCheck.checked = Boolean(this.regionApproved); regionCheck.disabled = !regionSelected || this.busy || regionAlreadyApproved; regionCheck.onchange = () => { this.regionApproved = regionCheck.checked; this.render(); };
      if (!regionCandidates.length) regionWrap.createEl("span", { text: "수동 Evidence에는 지역 후보가 없어 반영할 수 없습니다." });
      const approveRegion = button(regionWrap, "지역 반영", true); approveRegion.disabled = !regionSelected || !this.regionApproved || this.busy || regionAlreadyApproved; approveRegion.onclick = async () => this.approveRegion();
      const knowledge = this.savedState && this.savedState.proposal && this.savedState.proposal.knowledge_candidates || [];
      const knowledgeWrap = this.contentEl.createEl("div", { attr: { class: "region-experience-review-card" } }); knowledgeWrap.createEl("h4", { text: "지식 후보" });
      knowledge.forEach((candidate, index) => {
        const line = knowledgeWrap.createEl("label", { attr: { class: "region-experience-check", tabindex: "0" } });
        const check = line.createEl("input", { attr: { type: "checkbox", "aria-label": `지식 후보 ${index + 1} 선택` } });
        const toggle = () => { if (check.disabled) return; check.checked = !check.checked; check.onchange(); };
        check.checked = this.knowledgeSelected && this.knowledgeSelected.has(index);
        check.disabled = this.busy || Boolean(this.savedState && this.savedState.savedKnowledgeCandidateIndexes && this.savedState.savedKnowledgeCandidateIndexes.includes(index));
        check.onchange = () => { if (!this.knowledgeSelected) this.knowledgeSelected = new Set(); check.checked ? this.knowledgeSelected.add(index) : this.knowledgeSelected.delete(index); this.render(); };
        line.onclick = (event) => { if (event && event.target === check) return; if (event && typeof event.preventDefault === "function") event.preventDefault(); toggle(); };
        line.onkeydown = (event) => { if (!event || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); toggle(); };
        line.createEl("span", { text: candidate.title });
      });
      const saveKnowledge = button(knowledgeWrap, "지식 후보 저장", true); const selected = this.knowledgeSelected ? Array.from(this.knowledgeSelected) : []; saveKnowledge.disabled = this.busy || !selected.length; saveKnowledge.onclick = async () => this.saveKnowledge();
      const actions = this.contentEl.createEl("div", { attr: { class: "region-experience-saved-actions" } }); const finish = button(actions, "완료"); finish.onclick = () => this.close();
      if (this.error) this.contentEl.createEl("p", { text: this.error, attr: { class: "region-experience-error", role: "alert" } });
    }
    async approveRegion() { if (this.busy || !this.regionApproved || !Number.isInteger(this.selectedRegionCandidateIndex)) return; this.busy = true; this.error = ""; this.render(); try { const result = await this.handoff().approveRegion(this.app, { savedState: this.savedState, selectedCandidateIndex: this.selectedRegionCandidateIndex, humanConfirmed: true }); if (!result || !result.ok || !result.savedState) throw new Error(result && result.message || "지역 반영에 실패했습니다. 다시 시도해 주세요."); this.savedState = result.savedState; this.regionApproved = false; } catch (error) { this.recover(error.message || "지역 반영에 실패했습니다. 다시 시도해 주세요."); } finally { this.busy = false; this.render(); } }
    async saveKnowledge() {
      const indexes = this.knowledgeSelected ? Array.from(this.knowledgeSelected) : [];
      if (this.busy || !indexes.length) return;
      this.busy = true; this.error = ""; this.render();
      try {
        const result = await this.handoff().saveKnowledgeCandidates(this.app, { savedState: this.savedState, selectedCandidateIndexes: indexes });
        if (!result || !result.savedState) throw new Error(result && result.message || "지식 후보 저장에 실패했습니다. 다시 시도해 주세요.");
        this.savedState = result.savedState;
        if (!result.ok) {
          const savedIndexes = new Set(this.savedState.savedKnowledgeCandidateIndexes || []);
          this.knowledgeSelected = new Set(indexes.filter((index) => !savedIndexes.has(index)));
          throw new Error(result.message || "지식 후보 저장에 실패했습니다. 다시 시도해 주세요.");
        }
        this.knowledgeSelected = new Set();
      } catch (error) { this.recover(error.message || "지식 후보 저장에 실패했습니다. 다시 시도해 주세요."); }
      finally { this.busy = false; this.render(); }
    }
  }

  function openRegionExperienceModal(appOrOptions, options) {
    const source = options || appOrOptions || {};
    const app = options ? appOrOptions : source.app;
    const modal = new RegionExperienceModal(app, source);
    if (typeof modal.open === "function") modal.open();
    return modal;
  }
  const api = Object.freeze({ RegionExperienceModal, openRegionExperienceModal, MODAL_CSS, CATEGORY_OPTIONS, EPISTEMIC_OPTIONS });
  root.RegionExperienceModal = api;
  root.openRegionExperienceModal = openRegionExperienceModal;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
