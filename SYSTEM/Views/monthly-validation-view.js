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
      "@media(max-width:600px){.mv-btn{min-height:var(--ke-touch-target,44px);padding-inline:var(--ke-space-4,12px)}.mv-actions{gap:var(--ke-space-3,8px)}}"
    ].join("");
  }

  function el(parent, tag, opts) {
    var o = opts || {};
    var node = parent.createEl(tag, o.attr ? { attr: o.attr } : undefined);
    if (o.text) node.textContent = o.text;
    if (o.cls) node.className = o.cls;
    return node;
  }

  function renderReadiness(container, readiness) {
    var panel = el(container, "div", { cls: "mv-readiness" });
    el(panel, "h3", { text: "Monthly Validation 준비 상태" });
    el(panel, "p", { text: readiness.ready
      ? "Weekly " + readiness.weekly_count + "개, 검증 가능 Principle " + readiness.eligible_principles + "개. 검증을 시작할 수 있습니다."
      : readiness.reason });
  }

  function renderPrinciple(container, principle, index, state, onChange) {
    var card = el(container, "div", { cls: "mv-principle" });
    el(card, "div", { cls: "mv-principle-title", text: principle.title });
    el(card, "div", { cls: "mv-principle-meta", text: "반복: " + principle.weeks.join(", ") + " | Evidence: " + (principle.evidence_refs.length || 0) + "개" });
    if (!principle.eligible) {
      el(card, "div", { cls: "mv-principle-meta", text: "서로 다른 주차 근거 부족 — 검증 불가" });
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
      var stmtInput = el(form, "input", { attr: { type: "text", placeholder: "검증된 지식 문장", value: current.knowledge_statement || "" } });
      stmtInput.oninput = function () { state["p" + index].knowledge_statement = stmtInput.value; };
      var reasonLabel = el(form, "label", { text: "검증 사유" });
      var reasonInput = el(form, "textarea", { attr: { placeholder: "왜 이 원칙을 검증하는가" } });
      reasonInput.value = current.validation_reason || "";
      reasonInput.oninput = function () { state["p" + index].validation_reason = reasonInput.value; };
    }
    if (current.action === "rejected" || current.action === "deferred") {
      var rForm = el(card, "div", { cls: "mv-form" });
      var rLabel = el(rForm, "label", { text: current.action === "rejected" ? "반려 사유" : "보류 사유" });
      var rInput = el(rForm, "input", { attr: { type: "text", placeholder: "사유 (선택)", value: current.reason || "" } });
      rInput.oninput = function () { state["p" + index].reason = rInput.value; };
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

    var state = {};
    var model = null;

    function setStatus(msg, isError) {
      statusEl.textContent = msg || "";
      statusEl.className = "mv-status" + (isError ? " mv-status-error" : "");
    }

    async function load() {
      bodyEl.empty();
      footerEl.empty();
      setStatus("Weekly 노트를 읽는 중...");
      try {
        var now = new Date();
        var month = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        var weeklyNotes = await store.listWeeklyNotes(app, month);
        model = core.buildValidationModel(weeklyNotes, month);
        state = {};
        renderReadiness(bodyEl, model.readiness);
        if (!model.readiness.ready) {
          setStatus("");
          return;
        }
        model.principles.forEach(function (p, i) {
          renderPrinciple(bodyEl, p, i, state, function () { load(); });
        });
        var saveBtn = el(footerEl, "button", { text: "월간 검증 저장", cls: "mv-btn mv-btn-primary" });
        saveBtn.onclick = async function () {
          saveBtn.disabled = true;
          setStatus("저장 중...");
          try {
            var content = core.buildMonthlyNoteContent(model, state);
            var result = await store.save(app, model.month, content);
            var candidates = await store.createCandidatesFromDecisions(app, model, state);
            setStatus("월간 검증 저장 완료: " + result.path + (candidates.length ? " | Knowledge Candidate " + candidates.length + "개 생성" : ""));
          } catch (err) {
            setStatus("저장 실패: " + (err.message || err), true);
          } finally {
            saveBtn.disabled = false;
          }
        };
        setStatus("");
      } catch (err) {
        setStatus("로드 실패: " + (err.message || err), true);
      }
    }

    load();
    return Object.freeze({ reload: load });
  }

  var api = Object.freeze({ ensureStyles: ensureStyles, mount: mount });
  root.MonthlyValidationView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
