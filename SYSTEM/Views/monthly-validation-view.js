(function (root) {
  "use strict";

  var STYLE_ID = "prodigy-monthly-validation-styles";

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      ".mv-shell{display:grid;gap:var(--ke-space-4,12px);min-inline-size:0}",
      ".mv-readiness{padding:var(--ke-space-4,12px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary)}",
      ".mv-readiness h3{margin:0 0 var(--ke-space-2,4px);font-size:var(--ke-type-title,1.05rem)}",
      ".mv-readiness p{margin:0;color:var(--text-muted);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45)}",
      ".mv-principle{padding:var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-primary);display:grid;gap:var(--ke-space-2,4px)}",
      ".mv-principle-title{font-weight:700;font-size:var(--ke-type-body,.84rem)}",
      ".mv-principle-meta{font-size:var(--ke-type-label,.72rem);color:var(--text-muted)}",
      ".mv-actions{display:flex;gap:var(--ke-space-2,4px);flex-wrap:wrap;margin-top:var(--ke-space-2,4px)}",
      ".mv-btn{min-height:32px;padding:0 var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-modifier-hover);color:var(--text-normal);font-size:var(--ke-type-label,.72rem);font-weight:700;cursor:pointer}",
      ".mv-btn:focus-visible{outline:2px solid var(--text-accent);outline-offset:-2px}",
      ".mv-btn-primary{background:var(--interactive-accent);color:var(--text-on-accent);border-color:var(--interactive-accent)}",
      ".mv-btn-danger{color:var(--text-error)}",
      ".mv-form{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-secondary)}",
      ".mv-form label{font-size:var(--ke-type-label,.72rem);font-weight:700;color:var(--text-muted)}",
      ".mv-form input,.mv-form textarea,.mv-form select{width:100%;box-sizing:border-box;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);padding:6px 8px;font-size:var(--ke-type-body,.84rem)}",
      ".mv-form textarea{min-height:60px;resize:vertical}",
      ".mv-status{font-size:var(--ke-type-label,.72rem);color:var(--text-muted);margin-top:var(--ke-space-2,4px)}",
      ".mv-status-error{color:var(--text-error)}",
      ".mv-ai{display:grid;gap:var(--ke-space-3,8px);padding:var(--ke-space-4,12px);border:1px solid var(--interactive-accent);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);min-inline-size:0}",
      ".mv-ai h3,.mv-ai h4{margin:0;font-size:var(--ke-type-heading,.92rem)}",
      ".mv-ai-status,.mv-ai-item{font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);overflow-wrap:anywhere;word-break:keep-all}",
      ".mv-ai-item{display:grid;gap:var(--ke-space-2,4px);padding-block:var(--ke-space-2,4px);border-top:1px solid var(--background-modifier-border)}",
      ".mv-ai-list{margin:0;padding-inline-start:1.2em}",
      ".mv-readonly{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);border:1px dashed var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-secondary);font-size:var(--ke-type-body,.84rem);line-height:var(--ke-leading-body,1.45);overflow-wrap:anywhere}",
      "@media(max-width:767px){.mv-btn{min-height:var(--ke-touch-target,44px);padding-inline:var(--ke-space-4,12px)}.mv-actions{gap:var(--ke-space-3,8px)}}"
    ].join("");
  }

  function el(parent, tag, opts) {
    var o = opts || {};
    var node = parent.createEl(tag, o.attr ? { attr: o.attr } : undefined);
    if (o.text) node.textContent = o.text;
    if (o.cls) node.className = o.cls;
    return node;
  }

  function renderReadiness(container, readiness, reviewMode) {
    var panel = el(container, "div", { cls: "mv-readiness" });
    var mode = reviewMode || (readiness.ready ? "validation" : "question_only");
    var headings = { blocked: "Monthly 기록을 준비할 수 없습니다", question_only: "Monthly 관찰 질문 모드", validation: "Monthly Principle 검증 모드" };
    var messages = {
      blocked: "검토할 수 있는 완료 Weekly 또는 필수 입력이 없습니다. 기존 기록은 읽을 수 있지만 새 기록은 저장할 수 없습니다.",
      question_only: "이번 달의 변화가 아직 서로 다른 주차에서 반복되지는 않았습니다. 그래도 확인한 사실과 다음 달 관찰 방향을 기록할 수 있습니다.",
      validation: "서로 다른 주차에서 반복된 Principle을 근거와 함께 사람이 검증합니다."
    };
    el(panel, "h3", { text: headings[mode] || headings.question_only });
    el(panel, "p", { text: "이번 달의 변화가 반복된 근거로 검증되는지 확인합니다." });
    el(panel, "p", { text: messages[mode] || messages.question_only });
    el(panel, "p", { text: "Weekly " + readiness.weekly_count + "개 · Principle " + readiness.total_principles + "개 · 검증 가능 " + readiness.eligible_principles + "개" });
    if (mode === "question_only" && readiness.reason) el(panel, "p", { text: "현재 상태: " + readiness.reason });
  }

  function renderPrinciple(container, principle, index, state, onChange) {
    var card = el(container, "div", { cls: "mv-principle" });
    el(card, "div", { cls: "mv-principle-title", text: principle.title });
    el(card, "div", { cls: "mv-principle-meta", text: "반복: " + principle.weeks.join(", ") + " | Evidence: " + (principle.evidence_refs.length || 0) + "개" });
    if (!principle.eligible || state.reviewMode !== "validation") {
      el(card, "div", { cls: "mv-principle-meta", text: state.reviewMode === "question_only" ? "관찰 목록 — 반복 검증 전이므로 결정할 수 없습니다" : "서로 다른 주차 근거 부족 — 검증 불가" });
      return;
    }
    var actions = el(card, "div", { cls: "mv-actions" });
    var current = state["p" + index] || {};
    var validatedBtn = el(actions, "button", { text: "검증", cls: "mv-btn" + (current.action === "validated" ? " mv-btn-primary" : "") });
    var deferredBtn = el(actions, "button", { text: "보류", cls: "mv-btn" + (current.action === "deferred" ? " mv-btn-primary" : "") });
    var rejectedBtn = el(actions, "button", { text: "반려", cls: "mv-btn mv-btn-danger" + (current.action === "rejected" ? " mv-btn-primary" : "") });

    validatedBtn.onclick = function () {
      state["p" + index] = Object.assign({}, state["p" + index], { action: "validated" });
      onChange();
    };
    deferredBtn.onclick = function () {
      state["p" + index] = Object.assign({}, state["p" + index], { action: "deferred" });
      onChange();
    };
    rejectedBtn.onclick = function () {
      state["p" + index] = Object.assign({}, state["p" + index], { action: "rejected" });
      onChange();
    };

    if (current.action === "validated") {
      var form = el(card, "div", { cls: "mv-form" });
      var stmtLabel = el(form, "label", { text: "지식 문장" });
      var stmtInput = el(form, "input", { attr: { type: "text", "aria-label": "지식 문장", placeholder: "검증된 지식 문장", value: current.knowledge_statement || "" } });
      stmtInput.oninput = function () { state["p" + index].knowledge_statement = stmtInput.value; state.dirty = true; };
      var reasonLabel = el(form, "label", { text: "검증 사유" });
      var reasonInput = el(form, "textarea", { attr: { "aria-label": "검증 사유", placeholder: "왜 이 원칙을 검증하는가" } });
      reasonInput.value = current.validation_reason || "";
      reasonInput.oninput = function () { state["p" + index].validation_reason = reasonInput.value; state.dirty = true; };
    }
    if (current.action === "rejected" || current.action === "deferred") {
      var rForm = el(card, "div", { cls: "mv-form" });
      var rLabel = el(rForm, "label", { text: current.action === "rejected" ? "반려 사유" : "보류 사유" });
      var rInput = el(rForm, "input", { attr: { type: "text", "aria-label": current.action === "rejected" ? "반려 사유" : "보류 사유", placeholder: "사유 (선택)", value: current.reason || "" } });
      rInput.oninput = function () { state["p" + index].reason = rInput.value; state.dirty = true; };
    }
  }

  function mount(options) {
    var opts = options || {};
    var app = opts.app;
    var container = opts.container;
    if (!app || !container) throw new Error("Monthly Validation View를 초기화할 수 없습니다.");
    var core = root.MonthlyValidationCore;
    var store = root.MonthlyValidationStore;
    if (!core || !store) throw new Error("MonthlyValidationCore 또는 Store를 먼저 불러와야 합니다.");
    ensureStyles();

    var shell = el(container, "div", { cls: "mv-shell" });
    var statusEl = el(shell, "div", { cls: "mv-status" });
    var bodyEl = el(shell, "div", { cls: "mv-shell" });
    var footerEl = el(shell, "div", { cls: "mv-actions" });

    var state = freshState();
    var model = null;
    var targetSnapshot = null;
    var sourceSnapshots = null;
    var readyPromise = null;

    function freshState() {
      return {
        summary: "",
        next_direction: "",
        reviewMode: "blocked",
        ai: { status: "idle", result: null, error: "" },
        aiDisabledReason: "",
        coverageWarnings: { coverage: [], read_errors: 0 },
        existing: null,
        existingFormat: "none",
        existingRecordClass: "none",
        unmatched: [],
        replacementRequired: false,
        replacementMode: false,
        conflict: false,
        replaceArmed: false,
        sourceChanged: false,
        dirty: false,
        saving: false,
        destroyed: false,
        aiController: null,
        runToken: 0
      };
    }

    function setStatus(msg, isError) {
      statusEl.textContent = msg || "";
      statusEl.className = "mv-status" + (isError ? " mv-status-error" : "");
    }

    function monthForOptions() {
      var now = new Date();
      return /^\d{4}-\d{2}$/.test(String(opts.initialMonth || ""))
        ? String(opts.initialMonth)
        : now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    }

    function askDestructiveReload() {
      var message = "다시 불러오면 저장하지 않은 입력과 AI 검증 결과가 사라집니다";
      return typeof root.confirm === "function" ? root.confirm(message) : true;
    }

    function hydrateSnapshot(snapshot) {
      state.existing = snapshot;
      if (!snapshot || !snapshot.exists) return;
      var parsed = core.parseMonthlyNoteContent(snapshot.content);
      if (parsed.format !== "canonical") {
        state.existingFormat = "legacy_or_unrecognized";
        state.replacementRequired = true;
        return;
      }
      state.existingFormat = "canonical";
      state.existingRecordClass = typeof core.classifyMonthlyRecord === "function" ? core.classifyMonthlyRecord(parsed) : "completed";
      state.summary = parsed.summary;
      state.next_direction = parsed.next_direction;
      parsed.principles.forEach(function (saved) {
        var found = -1;
        (model.principles || []).some(function (principle, index) {
          if (safeTitle(principle.title) === safeTitle(saved.title)) { found = index; return true; }
          return false;
        });
        if (found === -1) {
          state.unmatched.push(saved);
          return;
        }
        state["p" + found] = {
          action: saved.decision,
          knowledge_statement: saved.knowledge_statement,
          validation_reason: saved.reason,
          reason: saved.reason
        };
      });
      state.replacementRequired = state.unmatched.length > 0 || state.reviewMode === "blocked" || (state.reviewMode === "question_only" && state.existingRecordClass === "completed");
    }

    function safeTitle(value) {
      return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function renderHumanEditors(container) {
      var form = el(container, "div", { cls: "mv-form" });
      el(form, "label", { text: "월간 요약" });
      var summary = el(form, "textarea", { attr: { "aria-label": "월간 요약", placeholder: "이번 달에 실제로 검증된 변화" } });
      summary.value = state.summary;
      summary.oninput = function () { state.summary = summary.value; state.dirty = true; };
      el(form, "label", { text: "다음 달 방향" });
      var direction = el(form, "textarea", { attr: { "aria-label": "다음 달 방향", placeholder: "다음 달에 계속 관찰할 방향" } });
      direction.value = state.next_direction;
      direction.oninput = function () { state.next_direction = direction.value; state.dirty = true; };
    }

    function renderExistingRecord(container) {
      if (!state.existing || !state.existing.exists) return;
      var panel = el(container, "div", { cls: "mv-readonly" });
      if (state.existingFormat === "legacy_or_unrecognized") {
        el(panel, "strong", { text: "기존 기록 형식을 자동으로 불러올 수 없습니다" });
        el(panel, "span", { text: "기존 기록은 기록 목록에서 읽을 수 있으며, 자동 추측 없이 새 검증으로 교체할 때만 편집할 수 있습니다." });
        return;
      }
      el(panel, "strong", { text: "기존 Monthly 기록" });
      el(panel, "span", { text: "요약: " + (state.summary || "기록 없음") });
      (state.unmatched || []).forEach(function (item) {
        el(panel, "span", { text: "기존 기록에만 존재: " + item.title + " (현재 모델에서 제거됨)" });
      });
      if (model && state.reviewMode === "blocked") el(panel, "span", { text: "현재 입력은 새 기록을 만들 수 없어 읽기 전용입니다." });
      if (model && state.reviewMode === "question_only" && state.existingRecordClass === "completed") el(panel, "span", { text: "기존 검증 완료 기록은 현재 질문 모드에서 자동으로 덮어쓰지 않습니다. 명시적으로 교체할 때만 편집할 수 있습니다." });
    }

    function listLine(container, label, items) {
      el(container, "strong", { text: label });
      var list = el(container, "ul", { cls: "mv-ai-list" });
      (items || []).forEach(function (item) { el(list, "li", { text: item }); });
      if (!items || !items.length) el(list, "li", { text: "없음" });
    }

    function renderAI(container) {
      var panel = el(container, "section", { cls: "mv-ai", attr: { "aria-label": "AI 검증 보조" } });
      var questionOnly = state.reviewMode === "question_only";
      var actionLabel = questionOnly ? "AI 관찰 질문 보조" : "AI 검증 보조";
      el(panel, "h3", { text: actionLabel });
      var ai = state.ai;
      var context = state.context;
      var unavailable = !model || state.reviewMode === "blocked" || !context || !context.evidence || !context.evidence.length || state.sourceChanged;
      var controls = el(panel, "div", { cls: "mv-actions" });
      var run = el(controls, "button", { text: actionLabel, cls: "mv-btn mv-btn-primary" });
      run.disabled = unavailable || ai.status === "running";
      run.onclick = function () { return runAI(); };
      if (ai.status === "running") {
        var cancel = el(controls, "button", { text: "취소", cls: "mv-btn" });
        cancel.onclick = function () { return cancelAI(); };
      }
      if (ai.status === "error" || ai.status === "invalid_response" || ai.status === "cancelled") {
        var retry = el(controls, "button", { text: "다시 시도", cls: "mv-btn" });
        retry.disabled = unavailable;
        retry.onclick = function () { return runAI(); };
      }
      var noEvidence = Boolean(context && (!context.evidence || !context.evidence.length));
      var status = ai.status === "running" ? "AI가 Monthly Evidence를 검토 중입니다..."
        : ai.status === "ready" ? actionLabel + " 완료 (" + (ai.result.provider || "") + " / " + (ai.result.model || "") + ")"
          : ai.status === "cancelled" ? "AI 검증 보조를 취소했습니다."
            : ai.error || (unavailable ? (state.aiDisabledReason || (state.reviewMode === "blocked" ? "현재 Monthly 입력 상태에서는 AI를 사용할 수 없습니다." : noEvidence ? "선택한 달에 AI가 검토할 구조화 Evidence가 없습니다" : "현재 Monthly 입력 상태에서는 AI를 사용할 수 없습니다.")) : "AI는 사람의 요청이 있을 때만 실행됩니다.");
      el(panel, "p", { text: status, cls: "mv-ai-status" });
      var coverageCount = (state.coverageWarnings.coverage || []).reduce(function (sum, item) { return sum + (Number(item.excluded_ref_count) || 0); }, 0);
      if (coverageCount || Number(state.coverageWarnings.read_errors) > 0) {
        el(panel, "p", { text: "AI 입력에서 제외된 근거 참조 " + coverageCount + "건 · 읽기 오류 " + (Number(state.coverageWarnings.read_errors) || 0) + "건", cls: "mv-ai-status" });
      }
      if (ai.status !== "ready" || !ai.result) return;
      if (questionOnly) {
        if (ai.result.coverage_summary) el(panel, "p", { text: "확인 범위: " + ai.result.coverage_summary, cls: "mv-ai-status" });
        (ai.result.observed_evidence_groups || []).forEach(function (group) {
          var item = el(panel, "div", { cls: "mv-ai-item" });
          el(item, "h4", { text: "함께 관찰할 Evidence" });
          el(item, "p", { text: group.observation });
          listLine(item, "Evidence ID", group.evidence_refs);
        });
        listLine(panel, "누락 근거", ai.result.missing_evidence);
        listLine(panel, "불확실성", ai.result.uncertainties);
        listLine(panel, "검토 질문", ai.result.review_questions);
        var questionDirection = el(panel, "div", { cls: "mv-ai-item" });
        el(questionDirection, "h4", { text: "다음 달 관찰 방향 초안" });
        el(questionDirection, "p", { text: ai.result.next_month_direction_draft });
        var questionDirectionCopy = el(questionDirection, "button", { text: "다음 달 방향 초안 복사", cls: "mv-btn" });
        questionDirectionCopy.onclick = function () { state.next_direction = ai.result.next_month_direction_draft; state.dirty = true; render(); };
        return;
      }
      var refs = core.assignMonthlyPrincipleRefs(model);
      ai.result.principle_reviews.forEach(function (review) {
        var item = el(panel, "div", { cls: "mv-ai-item" });
        var entry = refs.find(function (candidate) { return candidate.principle_ref === review.principle_ref; });
        el(item, "h4", { text: entry ? entry.principle.title : review.principle_ref });
        listLine(item, "지지 근거", review.supporting_evidence_refs);
        listLine(item, "반대·예외 근거", review.counter_evidence_refs);
        listLine(item, "누락 근거", review.missing_evidence);
        listLine(item, "모순·예외", review.contradictions_or_exceptions);
        listLine(item, "검증 질문", review.validation_questions);
        el(item, "p", { text: "검증 사유 초안: " + review.validation_rationale_draft });
        var copy = el(item, "button", { text: "AI 초안 복사", cls: "mv-btn" });
        copy.onclick = function () {
          if (!entry) return;
          state["p" + model.principles.indexOf(entry.principle)] = Object.assign({}, state["p" + model.principles.indexOf(entry.principle)], { validation_reason: review.validation_rationale_draft });
          state.dirty = true;
          render();
        };
      });
      var directionItem = el(panel, "div", { cls: "mv-ai-item" });
      el(directionItem, "h4", { text: "다음 달 방향 초안" });
      el(directionItem, "p", { text: ai.result.next_month_direction_draft });
      var directionCopy = el(directionItem, "button", { text: "다음 달 방향 초안 복사", cls: "mv-btn" });
      directionCopy.onclick = function () { state.next_direction = ai.result.next_month_direction_draft; state.dirty = true; render(); };
    }

    function canSave() {
      return Boolean(model && state.reviewMode !== "blocked" && (!state.replacementRequired || state.replacementMode) && !state.saving && !state.conflict && !state.destroyed);
    }

    function renderFooter() {
      if (state.replacementRequired && !state.replacementMode) {
        var replaceText = state.existingFormat === "legacy_or_unrecognized" ? "새 검증으로 교체" : "기존 기록 교체";
        var replace = el(footerEl, "button", { text: replaceText, cls: "mv-btn mv-btn-danger" });
        replace.onclick = function () { state.replacementMode = true; state.dirty = true; state.summary = ""; state.next_direction = ""; state.unmatched = []; render(); };
      }
      if (canSave()) {
        var saveBtn = el(footerEl, "button", { text: state.reviewMode === "question_only" ? "월간 관찰 기록 저장" : "월간 검증 저장", cls: "mv-btn mv-btn-primary" });
        saveBtn.onclick = function () { return save(); };
      }
      if (state.conflict) {
        var reload = el(footerEl, "button", { text: "다시 불러오기", cls: "mv-btn" });
        reload.onclick = function () { return reloadEditor(); };
        var replace = el(footerEl, "button", { text: state.replaceArmed ? "현재 편집본으로 교체 확인" : "현재 편집본으로 교체", cls: "mv-btn mv-btn-danger" });
        replace.onclick = function () {
          if (!state.replaceArmed) { state.replaceArmed = true; render(); return; }
          state.conflict = false;
          return save(true);
        };
      }
      if (state.sourceChanged) {
        var sourceReload = el(footerEl, "button", { text: "다시 불러오기", cls: "mv-btn" });
        sourceReload.onclick = function () { return reloadEditor(); };
      }
    }

    function render() {
      if (state.destroyed) return;
      bodyEl.empty();
      footerEl.empty();
      if (!model) return;
      renderReadiness(bodyEl, model.readiness, state.reviewMode);
      var editable = state.reviewMode !== "blocked" && (!state.replacementRequired || state.replacementMode);
      if ((!editable && state.existing) || (state.existingFormat === "legacy_or_unrecognized" && !state.replacementMode)) renderExistingRecord(bodyEl);
      if (editable) {
        renderHumanEditors(bodyEl);
        model.principles.forEach(function (principle, index) {
          renderPrinciple(bodyEl, principle, index, state, function () { state.dirty = true; render(); });
        });
        renderAI(bodyEl);
      } else {
        renderAI(bodyEl);
      }
      if (state.unmatched.length && editable) renderExistingRecord(bodyEl);
      renderFooter();
    }

    async function readInputs(month) {
      if (typeof store.collectMonthlyAIInputs === "function") {
        var collected = await store.collectMonthlyAIInputs(app, month);
        model = collected.model;
        state.reviewMode = core.deriveMonthlyReviewMode({
          weeklyNotes: collected.weekly_notes,
          readiness: model.readiness,
          sourceErrors: collected.warnings && collected.warnings.duplicate_evidence_id ? ["Evidence ID 충돌로 입력 정합성을 확인할 수 없습니다."] : []
        }).mode;
        state.context = collected.context;
        sourceSnapshots = collected.source_snapshots;
        state.aiDisabledReason = collected.ai_disabled_reason || "";
        state.coverageWarnings = collected.warnings || state.coverageWarnings;
        return;
      }
      var weeklyNotes = await store.listWeeklyNotes(app, month);
      model = core.buildValidationModel(weeklyNotes, month);
      state.reviewMode = core.deriveMonthlyReviewMode({ weeklyNotes: weeklyNotes, readiness: model.readiness }).mode;
      var daily = typeof store.listMonthlyDailyEvidence === "function" ? await store.listMonthlyDailyEvidence(app, month) : { evidence: [], source_snapshots: [] };
      state.context = core.buildMonthlyAIContext(model, daily.evidence || []);
      sourceSnapshots = { daily: daily.source_snapshots || [], weekly: weeklyNotes.map(function (note) { return { path: note.path, mtime: note.source_mtime }; }) };
    }

    async function load() {
      if (state.destroyed) return;
      var month = monthForOptions();
      bodyEl.empty();
      footerEl.empty();
      setStatus("Weekly 노트를 읽는 중...");
      try {
        state = freshState();
        model = null;
        sourceSnapshots = null;
        targetSnapshot = null;
        await readInputs(month);
        targetSnapshot = typeof store.readMonthlySnapshot === "function" ? await store.readMonthlySnapshot(app, month) : { exists: false, path: store.pathFor(month), content: "", mtime: null };
        var initialRecordSnapshot = opts.initialRecord && opts.initialRecord.content !== undefined ? {
          exists: true,
          path: opts.initialRecord.path || targetSnapshot.path,
          content: opts.initialRecord.content,
          mtime: opts.initialRecord.mtime === undefined ? null : opts.initialRecord.mtime
        } : null;
        hydrateSnapshot(initialRecordSnapshot && !(targetSnapshot.exists && targetSnapshot.path === initialRecordSnapshot.path) ? initialRecordSnapshot : targetSnapshot);
        setStatus("");
        render();
      } catch (error) {
        setStatus("로드 실패: " + (error.message || error), true);
      }
    }

    async function reloadEditor() {
      if (state.destroyed) return false;
      if ((state.dirty || state.ai.status !== "idle") && !askDestructiveReload()) return false;
      abortAI();
      state.runToken += 1;
      readyPromise = load();
      return readyPromise;
    }

    function abortAI() {
      if (state.aiController && typeof state.aiController.abort === "function") state.aiController.abort();
      state.aiController = null;
    }

    async function checkSourceBeforeAI() {
      if (typeof store.sourceSnapshotChanged !== "function" || !sourceSnapshots) return false;
      var result = await store.sourceSnapshotChanged(app, monthForOptions(), sourceSnapshots);
      var changed = typeof result === "boolean" ? result : Boolean(result && result.changed);
      if (changed) {
        state.sourceChanged = true;
        setStatus("입력 기록 변경됨", true);
        render();
      }
      return changed;
    }

    async function runAI() {
      if (state.destroyed || !model || state.reviewMode === "blocked" || !state.context || !state.context.evidence || !state.context.evidence.length || state.ai.status === "running") return;
      abortAI();
      if (await checkSourceBeforeAI()) return;
      var ai = root.MonthlyValidationAI;
      if (!ai) { state.ai.status = "error"; state.ai.error = "MonthlyValidationAI 모듈이 로드되지 않았습니다."; render(); return; }
      var controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
      var token = ++state.runToken;
      state.aiController = controller;
      state.ai = { status: "running", result: null, error: "" };
      render();
      try {
        var result = await ai.generateMonthlyAI({ app: app, context: state.context, mode: state.reviewMode, signal: controller && controller.signal });
        if (state.destroyed || token !== state.runToken) return;
        state.ai = { status: "ready", result: result, error: "" };
      } catch (error) {
        if (state.destroyed || token !== state.runToken) return;
        var cancelled = error && (error.name === "AbortError" || error.code === "ABORT_ERR");
        state.ai = { status: cancelled ? "cancelled" : (error && error.code === "INVALID_MONTHLY_AI_RESPONSE" ? "invalid_response" : "error"), result: null, error: cancelled ? "" : (error.message || String(error)) };
      } finally {
        if (!state.destroyed && token === state.runToken) { state.aiController = null; render(); }
      }
    }

    function cancelAI() {
      if (state.ai.status !== "running") return;
      state.runToken += 1;
      abortAI();
      state.ai = { status: "cancelled", result: null, error: "" };
      render();
    }

    async function save(forceReplace) {
      if (!canSave() && !forceReplace) return;
      state.saving = true;
      setStatus("저장 중...");
      try {
        var sourceWarning = false;
        if (typeof store.sourceSnapshotChanged === "function" && sourceSnapshots) {
          var sourceState = await store.sourceSnapshotChanged(app, monthForOptions(), sourceSnapshots);
          sourceWarning = typeof sourceState === "boolean" ? sourceState : Boolean(sourceState && sourceState.changed);
        }
        var content = core.buildMonthlyNoteContent(model, state);
        var guard = typeof store.saveWithMtimeGuard === "function" ? store.saveWithMtimeGuard : function (targetApp, month, body) { return store.save(targetApp, month, body); };
        var result = await guard(app, model.month, content, { expected_mtime: targetSnapshot && targetSnapshot.mtime, allow_replace: Boolean(forceReplace || state.replaceArmed) });
        if (result && result.ok === false) {
          state.conflict = true;
          state.saving = false;
          setStatus("기존 월간 기록이 편집 중 변경되었습니다", true);
          render();
          return;
        }
        if (typeof store.readMonthlySnapshot === "function") targetSnapshot = await store.readMonthlySnapshot(app, model.month);
        var candidates = state.reviewMode === "validation" ? await store.createCandidatesFromDecisions(app, model, state) : [];
        state.dirty = false;
        state.saving = false;
        state.replaceArmed = false;
        setStatus((state.reviewMode === "question_only" ? "월간 관찰 기록 저장 완료: " : "월간 검증 저장 완료: ") + result.path + (sourceWarning ? " — 입력 기록 변경 후 현재 편집본을 저장했습니다." : "") + (candidates.length ? " | Knowledge Candidate " + candidates.length + "개 생성" : ""));
        if (typeof opts.onSaved === "function") await opts.onSaved(result);
        render();
      } catch (error) {
        state.saving = false;
        setStatus("저장 실패: " + (error.message || error), true);
        render();
      }
    }

    readyPromise = load();
    return Object.freeze({
      ready: readyPromise,
      reload: reloadEditor,
      runAI: runAI,
      cancelAI: cancelAI,
      destroy: function () {
        if (state.destroyed) return;
        state.destroyed = true;
        state.runToken += 1;
        abortAI();
      }
    });
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, mount: mount });
  root.MonthlyValidationView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
