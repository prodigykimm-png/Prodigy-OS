(function (root) {
  "use strict";

  function open(app, initial, onSave) {
    const seed = initial || {};
    const obsidianModule = root.obsidian || window.obsidian;
    if (!obsidianModule || !obsidianModule.Modal) {
      const title = window.prompt("제목", seed.title || "");
      if (title === null) return;
      const experience = window.prompt("경험 (필수)", seed.experience || "");
      if (experience === null || !String(experience).trim()) return;
      const interpretation = window.prompt("해석 (선택)", seed.interpretation || "") || "";
      const change = window.prompt("변화 (선택)", seed.change || "") || "";
      const nextExperiment = window.prompt("다음 실험 (선택)", seed.next_experiment || "") || "";
      onSave({ evidence_id: seed.evidence_id || "", title: title || experience.slice(0, 40), context: seed.context || "", related_objects: seed.related_objects || [], experience, interpretation, change, next_experiment: nextExperiment });
      return;
    }
    class BlockModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.values = { evidence_id: seed.evidence_id || "", title: seed.title || "", context: seed.context || "", related_objects: Array.isArray(seed.related_objects) ? seed.related_objects.join("\n") : (seed.related_objects || ""), experience: seed.experience || "", interpretation: seed.interpretation || "", change: seed.change || "", next_experiment: seed.next_experiment || "" };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "+ 경험 추가" });
        contentEl.createEl("p", { text: "하나의 의미 있는 경험만 기록합니다. 경험만 필수입니다.", attr: { style: "color:var(--text-muted);margin:0 0 12px;" } });
        const makeField = (label, key, rows, placeholder) => {
          contentEl.createEl("label", { text: label, attr: { style: "display:block;font-weight:600;margin:10px 0 4px;" } });
          const area = contentEl.createEl("textarea", { attr: { rows: String(rows), class: "prodigy-configurator-chip", style: "width:100%;min-height:88px;resize:vertical;color:var(--text-normal);" } });
          area.placeholder = placeholder || "";
          area.value = this.values[key] || "";
          area.oninput = () => { this.values[key] = area.value; };
        };
        makeField("제목", "title", 1, "말투 때문에 갈등이 생김");
        makeField("맥락 (선택)", "context", 1, "people / workout / reading / auction / personal …");
        makeField("경험 (필수)", "experience", 3, "무엇을 경험했는가?");
        makeField("해석 (선택)", "interpretation", 2, "무엇을 의미하는가?");
        makeField("변화 (선택)", "change", 2, "무엇이 달라졌는가?");
        makeField("다음 실험 (선택)", "next_experiment", 2, "다음에 무엇을 시험할까?");
        makeField("연결 문서 (줄마다 [[링크]])", "related_objects", 2, "[[여자친구]]");
        const actions = contentEl.createEl("div", { attr: { class: "prodigy-btn-row", style: "justify-content:flex-end;margin-top:14px;" } });
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        const cancel = root.ProdigyUI ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() }) : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI ? root.ProdigyUI.button(actions, "저장", { primary: true }) : actions.createEl("button", { text: "저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          const experience = String(this.values.experience || "").trim();
          if (!experience) { if (window.Notice) new Notice("경험은 필수입니다."); return; }
          save.disabled = true;
          try {
            const related = String(this.values.related_objects || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => (line.startsWith("[[") ? line : `[[${line.replace(/\[\[|\]\]/g, "")}]]`));
            await onSave({ evidence_id: this.values.evidence_id || "", title: String(this.values.title || "").trim() || experience.slice(0, 40), context: String(this.values.context || "").trim().toLowerCase(), related_objects: related, experience, interpretation: String(this.values.interpretation || "").trim(), change: String(this.values.change || "").trim(), next_experiment: String(this.values.next_experiment || "").trim() });
            this.close();
          } catch (error) { save.disabled = false; if (window.Notice) new Notice(error.message || String(error)); }
        };
      }
      onClose() { this.contentEl.empty(); }
    }
    new BlockModal(app).open();
  }

  const api = { open };
  root.JournalEvidenceBlockModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
