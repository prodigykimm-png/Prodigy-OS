(function (root) {
  "use strict";

  function openPath(app, path) {
    return app.workspace.openLinkText(String(path || "").replace(/\.md$/, ""), "", false);
  }

  function openReviewModal(app, initial, onSave, options) {
    const opts = options || {};
    const focusHints = Array.isArray(opts.focusHints)
      ? opts.focusHints.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 3)
      : [];
    const obsidianModule = root.obsidian || window.obsidian;
    if (!obsidianModule || !obsidianModule.Modal) {
      // Minimal fallback without Modal class.
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
        this.values = {
          reflection: initial.reflection || "",
          change: initial.change || "",
          next_experiment: initial.next_experiment || ""
        };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "2분 성찰" });
        contentEl.createEl("p", {
          text: "오늘 무엇이 달라졌는지, 무엇을 배웠는지, 다음에 무엇을 시험할지 짧게 기록합니다.",
          attr: { style: "color:var(--text-muted);font-size:0.85em;margin:0 0 12px;" }
        });

        // Focus completion loop — prompts only, never invents answers
        if (focusHints.length) {
          const focusBox = contentEl.createEl("div", {
            attr: {
              style: "margin:0 0 12px;padding:8px 10px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);font-size:0.84em;line-height:1.45;"
            }
          });
          focusBox.createEl("div", {
            text: "오늘 Focus 돌아보기",
            attr: { style: "font-weight:700;margin-bottom:4px;color:var(--text-accent);" }
          });
          focusBox.createEl("div", {
            text: "· 오늘 Focus를 마쳤나요?",
            attr: { style: "color:var(--text-muted);" }
          });
          focusBox.createEl("div", {
            text: "· 무엇이 완료를 막았나요?",
            attr: { style: "color:var(--text-muted);" }
          });
          focusBox.createEl("div", {
            text: "· 내일 무엇을 바꾸면 좋을까요?",
            attr: { style: "color:var(--text-muted);margin-bottom:6px;" }
          });
          focusHints.forEach((label) => {
            focusBox.createEl("div", {
              text: `→ ${label}`,
              attr: { style: "font-weight:600;margin-top:2px;" }
            });
          });
        }

        const makeField = (label, key, rows, placeholder) => {
          contentEl.createEl("label", {
            text: label,
            attr: { style: "display:block;font-weight:600;margin:10px 0 4px;font-size:0.88em;" }
          });
          const area = contentEl.createEl("textarea", {
            attr: {
              rows: String(rows),
              style: "width:100%;min-height:72px;resize:vertical;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);"
            }
          });
          if (placeholder) area.placeholder = placeholder;
          area.value = this.values[key] || "";
          area.oninput = () => { this.values[key] = area.value; };
        };

        makeField(
          "1. 오늘의 성찰",
          "reflection",
          3,
          focusHints.length ? "Focus 완료 여부, 막힌 점, 배운 점을 짧게" : ""
        );
        makeField("2. 오늘의 변화", "change", 3, "무엇이 달라졌는가?");
        makeField("3. 다음 실험", "next_experiment", 2, "내일 모닝 브리핑으로 이어갈 한 가지");

        const actions = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
        });
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
        const cancel = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
          : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const save = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "저장", { primary: true })
          : actions.createEl("button", { text: "저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        save.onclick = async () => {
          save.disabled = true;
          try {
            await onSave(this.values);
            this.close();
          } catch (error) {
            save.disabled = false;
            if (window.Notice) new Notice(error.message || String(error));
          }
        };
      }
      onClose() {
        this.contentEl.empty();
      }
    }

    new ReviewModal(app).open();
  }

  async function renderDashboard(app, container) {
    if (!app || !container || !root.JournalCore || !root.JournalStore) return;
    container.empty();
    container.addClass("prodigy-journal-workspace");
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    const style = container.createEl("style");
    style.textContent = `
.prodigy-journal-workspace{max-width:920px;margin:0 auto;padding:8px 8px 40px}
.journal-card{border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);padding:14px;margin-bottom:12px}
.journal-card h2{margin:0 0 10px;font-size:1.05em}
.journal-meta{color:var(--text-muted);font-size:0.82em;margin-bottom:8px}
.journal-preview{font-size:0.88em;line-height:1.45;color:var(--text-normal);white-space:pre-wrap}
.journal-row{padding:10px 0;border-top:1px solid var(--background-modifier-border)}
.journal-row:first-child{border-top:0}
.journal-badge{display:inline-flex;align-items:center;min-height:22px;padding:2px 8px;border-radius:999px;font-size:0.75em;font-weight:700}
.journal-badge.complete{background:rgba(34,197,94,.12);color:#16a34a}
.journal-badge.partial{background:rgba(249,115,22,.12);color:#ea580c}
.journal-badge.empty{background:var(--background-modifier-hover);color:var(--text-muted)}
@media(max-width:600px){.prodigy-journal-workspace{padding:4px 4px 36px}}
`;

    const today = root.JournalCore.todayIsoDate();
    const todayReview = await root.JournalStore.loadReview(app, today);
    const recent = await root.JournalStore.listRecentReviews(app, { limitDays: 14 });

    const todayCard = container.createEl("div", { attr: { class: "journal-card" } });
    todayCard.createEl("h2", { text: "오늘 성찰" });
    const meta = todayCard.createEl("div", { attr: { class: "journal-meta" } });
    meta.createEl("span", { text: today });
    meta.createEl("span", {
      text: todayReview.statusLabel,
      attr: { class: `journal-badge ${todayReview.status}`, style: "margin-left:8px;" }
    });

    const preview = todayCard.createEl("div", { attr: { class: "journal-preview" } });
    if (todayReview.status === "empty") {
      preview.setText("아직 2분 성찰을 작성하지 않았습니다.");
    } else {
      preview.createEl("div", { text: `성찰: ${todayReview.fields.reflection || "—"}` });
      preview.createEl("div", { text: `변화: ${todayReview.fields.change || "—"}` });
      preview.createEl("div", { text: `다음 실험: ${todayReview.fields.next_experiment || "—"}` });
    }

    const actions = todayCard.createEl("div", { attr: { class: "journal-actions prodigy-btn-row" } });
    const writeBtn = root.ProdigyUI
      ? root.ProdigyUI.button(actions, todayReview.status === "empty" ? "오늘 성찰 작성" : "성찰 수정", { primary: true })
      : actions.createEl("button", {
        text: todayReview.status === "empty" ? "오늘 성찰 작성" : "성찰 수정",
        attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" }
      });
    writeBtn.onclick = () => {
      openReviewModal(app, todayReview.fields, async (values) => {
        await root.JournalStore.saveReview(app, today, values);
        if (window.Notice) new Notice("오늘 성찰을 저장했습니다.");
        await renderDashboard(app, container);
      });
    };
    const openBtn = root.ProdigyUI
      ? root.ProdigyUI.button(actions, "오늘 노트 열기")
      : actions.createEl("button", { text: "오늘 노트 열기", attr: { type: "button", class: "prodigy-btn" } });
    openBtn.onclick = async () => {
      await root.JournalStore.ensureDailyNote(app, today);
      openPath(app, todayReview.path);
    };

    const changeCard = container.createEl("div", { attr: { class: "journal-card" } });
    changeCard.createEl("h2", { text: "최근 변화" });
    const changes = recent.filter((item) => item.fields.change).slice(0, 7);
    if (!changes.length) {
      changeCard.createEl("div", {
        text: "최근 7일간 기록된 변화가 없습니다.",
        attr: { class: "journal-meta" }
      });
    } else {
      changes.forEach((item) => {
        const row = changeCard.createEl("div", { attr: { class: "journal-row" } });
        row.createEl("strong", { text: item.date, attr: { style: "display:block;margin-bottom:4px;" } });
        row.createEl("div", { text: item.fields.change, attr: { class: "journal-preview" } });
      });
    }

    const experimentCard = container.createEl("div", { attr: { class: "journal-card" } });
    experimentCard.createEl("h2", { text: "다음 실험" });
    const experiments = recent.filter((item) => item.fields.next_experiment).slice(0, 7);
    if (!experiments.length) {
      experimentCard.createEl("div", {
        text: "최근 작성된 다음 실험이 없습니다.",
        attr: { class: "journal-meta" }
      });
    } else {
      experiments.forEach((item) => {
        const row = experimentCard.createEl("div", { attr: { class: "journal-row" } });
        row.createEl("strong", { text: item.date, attr: { style: "display:block;margin-bottom:4px;" } });
        row.createEl("div", { text: item.fields.next_experiment, attr: { class: "journal-preview" } });
      });
    }

    const recentCard = container.createEl("div", { attr: { class: "journal-card" } });
    recentCard.createEl("h2", { text: "최근 기록" });
    recent.slice(0, 14).forEach((item) => {
      const row = recentCard.createEl("div", {
        attr: {
          class: "journal-row",
          style: "display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:pointer;"
        }
      });
      const left = row.createEl("div");
      left.createEl("strong", { text: item.date });
      left.createEl("span", {
        text: item.statusLabel,
        attr: { class: `journal-badge ${item.status}`, style: "margin-left:8px;" }
      });
      const open = root.ProdigyUI
        ? root.ProdigyUI.button(row, "열기")
        : row.createEl("button", { text: "열기", attr: { type: "button", class: "prodigy-btn" } });
      open.onclick = (event) => {
        event.stopPropagation();
        openPath(app, item.path);
      };
      row.onclick = () => openPath(app, item.path);
    });
  }

  const api = { openReviewModal, renderDashboard, openPath };
  root.JournalView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
