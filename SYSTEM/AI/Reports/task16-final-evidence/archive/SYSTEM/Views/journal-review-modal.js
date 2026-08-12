(function (root) {
  "use strict";

  function open(app, initial, onSave, options) {
    const focusHints = Array.isArray((options || {}).focusHints) ? options.focusHints.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3) : [];
    const obsidianModule = root.obsidian || window.obsidian;
    if (!obsidianModule || !obsidianModule.Modal) {
      const reflection = window.prompt("오늘의 성찰", initial.reflection || "");
      if (reflection === null) return;
      const change = window.prompt("오늘의 변화", initial.change || "");
      if (change === null) return;
      const nextExperiment = window.prompt("다음 실험", initial.next_experiment || "");
      if (nextExperiment === null) return;
      onSave({ reflection, change, next_experiment: nextExperiment });
      return;
    }
    class ReviewModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.values = { reflection: initial.reflection || "", change: initial.change || "", next_experiment: initial.next_experiment || "" };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "2분 성찰" });
        contentEl.createEl("p", { text: "오늘 무엇이 달라졌는지, 무엇을 배웠는지, 다음에 무엇을 시험할지 짧게 기록합니다.", attr: { style: "color:var(--text-muted);margin:0 0 12px;" } });
        if (focusHints.length) {
          const focusBox = contentEl.createEl("div", { attr: { class: "prodigy-full-bleed is-parchment", style: "margin:0 0 12px;" } });
          focusBox.createEl("div", { text: "오늘 Focus 돌아보기", attr: { style: "font-weight:700;margin-bottom:4px;color:var(--text-accent);" } });
          ["오늘 Focus를 마쳤나요?", "무엇이 완료를 막았나요?", "내일 무엇을 바꾸면 좋을까요?"].forEach((text) => focusBox.createEl("div", { text: `· ${text}`, attr: { style: "color:var(--text-muted);" } }));
          focusHints.forEach((label) => focusBox.createEl("div", { text: `→ ${label}`, attr: { style: "font-weight:600;margin-top:2px;" } }));
        }
        const makeField = (label, key, rows, placeholder) => {
          contentEl.createEl("label", { text: label, attr: { style: "display:block;font-weight:600;margin:10px 0 4px;" } });
          const area = contentEl.createEl("textarea", { attr: { rows: String(rows), class: "prodigy-configurator-chip", style: "width:100%;min-height:88px;resize:vertical;color:var(--text-normal);" } });
          area.placeholder = placeholder || "";
          area.value = this.values[key] || "";
          area.oninput = () => { this.values[key] = area.value; };
        };
        makeField("1. 오늘의 성찰", "reflection", 3, focusHints.length ? "Focus 완료 여부, 막힌 점, 배운 점을 짧게" : "");
        makeField("2. 오늘의 변화", "change", 3, "무엇이 달라졌는가?");
        makeField("3. 다음 실험", "next_experiment", 2, "내일 모닝 브리핑으로 이어갈 한 가지");
        const actions = contentEl.createEl("div", { attr: { class: "prodigy-btn-row", style: "justify-content:flex-end;margin-top:14px;" } });
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        const cancel = root.ProdigyUI ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() }) : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI ? root.ProdigyUI.button(actions, "저장", { primary: true }) : actions.createEl("button", { text: "저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          save.disabled = true;
          try { await onSave(this.values); this.close(); }
          catch (error) { save.disabled = false; if (window.Notice) new Notice(error.message || String(error)); }
        };
      }
      onClose() { this.contentEl.empty(); }
    }
    new ReviewModal(app).open();
  }

  const api = { open };
  root.JournalReviewModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
