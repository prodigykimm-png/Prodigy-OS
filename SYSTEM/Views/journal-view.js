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

  /**
   * Mode 1 — add/edit one Evidence Block. Experience required.
   */
  function openEvidenceBlockModal(app, initial, onSave) {
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
      onSave({
        evidence_id: seed.evidence_id || "",
        title: title || experience.slice(0, 40),
        context: seed.context || "",
        related_objects: seed.related_objects || [],
        experience,
        interpretation,
        change,
        next_experiment: nextExperiment
      });
      return;
    }

    class BlockModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.values = {
          evidence_id: seed.evidence_id || "",
          title: seed.title || "",
          context: seed.context || "",
          related_objects: Array.isArray(seed.related_objects)
            ? seed.related_objects.join("\n")
            : (seed.related_objects || ""),
          experience: seed.experience || "",
          interpretation: seed.interpretation || "",
          change: seed.change || "",
          next_experiment: seed.next_experiment || ""
        };
      }
      onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "+ 경험 추가" });
        contentEl.createEl("p", {
          text: "하나의 의미 있는 경험만 기록합니다. Experience만 필수입니다.",
          attr: { style: "color:var(--text-muted);font-size:0.85em;margin:0 0 12px;" }
        });

        const makeField = (label, key, rows, placeholder) => {
          contentEl.createEl("label", {
            text: label,
            attr: { style: "display:block;font-weight:600;margin:10px 0 4px;font-size:0.88em;" }
          });
          const area = contentEl.createEl("textarea", {
            attr: {
              rows: String(rows),
              style: "width:100%;min-height:48px;resize:vertical;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);"
            }
          });
          if (placeholder) area.placeholder = placeholder;
          area.value = this.values[key] || "";
          area.oninput = () => { this.values[key] = area.value; };
          return area;
        };

        makeField("제목", "title", 1, "말투 때문에 갈등이 생김");
        makeField("Context (선택)", "context", 1, "people / workout / reading / auction / personal …");
        makeField("Experience (필수)", "experience", 3, "무엇을 경험했는가?");
        makeField("Interpretation (선택)", "interpretation", 2, "무엇을 의미하는가?");
        makeField("Change (선택)", "change", 2, "무엇이 달라졌는가?");
        makeField("Next Experiment (선택)", "next_experiment", 2, "다음에 무엇을 시험할까?");
        makeField("Related Objects (줄마다 [[링크]])", "related_objects", 2, "[[여자친구]]");

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
          const exp = String(this.values.experience || "").trim();
          if (!exp) {
            if (window.Notice) new Notice("Experience는 필수입니다.");
            return;
          }
          save.disabled = true;
          try {
            const related = String(this.values.related_objects || "")
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => (l.startsWith("[[") ? l : `[[${l.replace(/\[\[|\]\]/g, "")}]]`));
            await onSave({
              evidence_id: this.values.evidence_id || "",
              title: String(this.values.title || "").trim() || exp.slice(0, 40),
              context: String(this.values.context || "").trim().toLowerCase(),
              related_objects: related,
              experience: exp,
              interpretation: String(this.values.interpretation || "").trim(),
              change: String(this.values.change || "").trim(),
              next_experiment: String(this.values.next_experiment || "").trim()
            });
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

    new BlockModal(app).open();
  }

  /**
   * Mode 2 — free-text propose → confirm before write.
   * Uses deterministic split (no LLM required). Never auto-writes.
   */
  function openProposeEvidenceModal(app, dateStr, onConfirm) {
    const core = root.JournalCore;
    const obsidianModule = root.obsidian || window.obsidian;
    if (!obsidianModule || !obsidianModule.Modal) {
      const free = window.prompt("오늘 경험을 자유롭게 적어 주세요 (줄바꿈으로 여러 경험 구분)");
      if (free === null || !String(free).trim()) return;
      const proposed = core.proposeBlocksFromFreeText(free, dateStr);
      const ok = window.confirm(
        `제안된 경험 ${proposed.length}개:\n${proposed.map((b, i) => `${i + 1}. ${b.title}`).join("\n")}\n\n저장할까요?`
      );
      if (ok) onConfirm(proposed);
      return;
    }

    class ProposeModal extends obsidianModule.Modal {
      constructor(appInstance) {
        super(appInstance);
        this.freeText = "";
        this.proposed = [];
        this.phase = "input";
      }
      onOpen() {
        this.render();
      }
      render() {
        const { contentEl } = this;
        contentEl.empty();
        if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

        if (this.phase === "input") {
          contentEl.createEl("h3", { text: "AI 경험 분리 (제안)" });
          contentEl.createEl("p", {
            text: "하루를 자유롭게 적으면 여러 Evidence Block 초안을 만듭니다. 저장은 확인 후에만 됩니다. (AI 없이도 동작)",
            attr: { style: "color:var(--text-muted);font-size:0.85em;margin:0 0 12px;" }
          });
          const area = contentEl.createEl("textarea", {
            attr: {
              rows: "8",
              style: "width:100%;min-height:140px;resize:vertical;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);"
            }
          });
          area.placeholder = "오늘 운동했고 경매도 분석했다.\n여자친구랑 말투 때문에 다퉜고,\n유튜브를 오래 봐서 책은 못 읽었다.";
          area.value = this.freeText;
          area.oninput = () => { this.freeText = area.value; };

          const actions = contentEl.createEl("div", {
            attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
          });
          const cancel = root.ProdigyUI
            ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
            : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
          if (!root.ProdigyUI) cancel.onclick = () => this.close();
          const propose = root.ProdigyUI
            ? root.ProdigyUI.button(actions, "분리 제안", { primary: true })
            : actions.createEl("button", { text: "분리 제안", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
          propose.onclick = () => {
            this.proposed = core.proposeBlocksFromFreeText(this.freeText, dateStr);
            if (!this.proposed.length) {
              if (window.Notice) new Notice("분리할 텍스트가 없습니다.");
              return;
            }
            this.phase = "confirm";
            this.render();
          };
          return;
        }

        // confirm phase — editable list
        contentEl.createEl("h3", { text: "제안된 경험 확인" });
        contentEl.createEl("p", {
          text: "편집·삭제 후 확인해야 Daily에 저장됩니다. AI는 자동 저장하지 않습니다.",
          attr: { style: "color:var(--text-muted);font-size:0.85em;margin:0 0 12px;" }
        });

        this.proposed.forEach((block, idx) => {
          const card = contentEl.createEl("div", {
            attr: {
              style: "border:1px solid var(--background-modifier-border);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--background-secondary);"
            }
          });
          card.createEl("div", {
            text: `${idx + 1}. ${block.evidence_id}`,
            attr: { style: "font-size:0.75em;color:var(--text-muted);margin-bottom:4px;" }
          });
          const title = card.createEl("input", {
            attr: {
              type: "text",
              style: "width:100%;margin-bottom:6px;padding:6px;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);"
            }
          });
          title.value = block.title || "";
          title.oninput = () => { block.title = title.value; };
          const exp = card.createEl("textarea", {
            attr: {
              rows: "3",
              style: "width:100%;padding:6px;border-radius:4px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);"
            }
          });
          exp.value = block.experience || "";
          exp.oninput = () => { block.experience = exp.value; };
          const del = root.ProdigyUI
            ? root.ProdigyUI.button(card, "삭제")
            : card.createEl("button", { text: "삭제", attr: { type: "button", class: "prodigy-btn", style: "margin-top:6px;" } });
          del.onclick = () => {
            this.proposed.splice(idx, 1);
            this.render();
          };
        });

        const actions = contentEl.createEl("div", {
          attr: { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }
        });
        const back = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "다시 입력", { onClick: () => { this.phase = "input"; this.render(); } })
          : actions.createEl("button", { text: "다시 입력", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) back.onclick = () => { this.phase = "input"; this.render(); };
        const cancel = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "취소", { onClick: () => this.close() })
          : actions.createEl("button", { text: "취소", attr: { type: "button", class: "prodigy-btn" } });
        if (!root.ProdigyUI) cancel.onclick = () => this.close();
        const confirm = root.ProdigyUI
          ? root.ProdigyUI.button(actions, "확인 후 저장", { primary: true })
          : actions.createEl("button", { text: "확인 후 저장", attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" } });
        confirm.onclick = async () => {
          const valid = this.proposed.filter((b) => String(b.experience || "").trim());
          if (!valid.length) {
            if (window.Notice) new Notice("저장할 경험이 없습니다.");
            return;
          }
          confirm.disabled = true;
          try {
            await onConfirm(valid);
            this.close();
          } catch (error) {
            confirm.disabled = false;
            if (window.Notice) new Notice(error.message || String(error));
          }
        };
      }
      onClose() {
        this.contentEl.empty();
      }
    }

    new ProposeModal(app).open();
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
.journal-block{border:1px solid var(--background-modifier-border);border-radius:6px;padding:8px 10px;margin:6px 0;background:var(--background-primary);font-size:0.86em}
.journal-block .bid{font-size:0.72em;color:var(--text-muted)}
@media(max-width:600px){.prodigy-journal-workspace{padding:4px 4px 36px}}
`;

    const today = root.JournalCore.todayIsoDate();
    const todayReview = await root.JournalStore.loadReview(app, today);
    const recent = await root.JournalStore.listRecentReviews(app, { limitDays: 14 });
    const blocks = (todayReview.blocks || []).filter((b) => !b.legacy);

    const todayCard = container.createEl("div", { attr: { class: "journal-card" } });
    todayCard.createEl("h2", { text: "오늘 경험 · Evidence" });
    const meta = todayCard.createEl("div", { attr: { class: "journal-meta" } });
    meta.createEl("span", { text: today });
    meta.createEl("span", {
      text: todayReview.statusLabel,
      attr: { class: `journal-badge ${todayReview.status}`, style: "margin-left:8px;" }
    });
    meta.createEl("span", {
      text: ` · 블록 ${blocks.length}개`,
      attr: { style: "margin-left:4px;" }
    });

    const preview = todayCard.createEl("div", { attr: { class: "journal-preview" } });
    if (!blocks.length && todayReview.status === "empty") {
      preview.setText("아직 기록된 경험이 없습니다. 「+ 경험 추가」로 가볍게 남기세요.");
    } else if (blocks.length) {
      blocks.forEach((b) => {
        const el = preview.createEl("div", { attr: { class: "journal-block" } });
        el.createEl("div", { text: b.evidence_id, attr: { class: "bid" } });
        el.createEl("div", { text: b.title || "(제목 없음)", attr: { style: "font-weight:600;" } });
        el.createEl("div", { text: b.experience || "", attr: { style: "color:var(--text-muted);margin-top:2px;" } });
      });
    } else {
      preview.createEl("div", { text: `성찰: ${todayReview.fields.reflection || "—"}` });
      preview.createEl("div", { text: `변화: ${todayReview.fields.change || "—"}` });
      preview.createEl("div", { text: `다음 실험: ${todayReview.fields.next_experiment || "—"}` });
    }

    const actions = todayCard.createEl("div", { attr: { class: "journal-actions prodigy-btn-row" } });
    const addBtn = root.ProdigyUI
      ? root.ProdigyUI.button(actions, "+ 경험 추가", { primary: true })
      : actions.createEl("button", {
        text: "+ 경험 추가",
        attr: { type: "button", class: "prodigy-btn prodigy-btn-primary" }
      });
    addBtn.onclick = () => {
      openEvidenceBlockModal(app, root.JournalCore.emptyBlock(today, blocks), async (block) => {
        await root.JournalStore.appendEvidenceBlock(app, today, block);
        if (window.Notice) new Notice("경험을 저장했습니다.");
        await renderDashboard(app, container);
      });
    };

    const proposeBtn = root.ProdigyUI
      ? root.ProdigyUI.button(actions, "하루 분리 제안")
      : actions.createEl("button", {
        text: "하루 분리 제안",
        attr: { type: "button", class: "prodigy-btn" }
      });
    proposeBtn.onclick = () => {
      openProposeEvidenceModal(app, today, async (proposed) => {
        // Merge with existing non-legacy blocks; re-id new ones after existing max
        const existing = blocks.slice();
        let next = existing.slice();
        proposed.forEach((p) => {
          const id = root.JournalCore.nextEvidenceId(next, today);
          next.push(Object.assign({}, p, { evidence_id: id }));
        });
        await root.JournalStore.saveEvidenceBlocks(app, today, next);
        if (window.Notice) new Notice(`${proposed.length}개 경험을 확인 후 저장했습니다.`);
        await renderDashboard(app, container);
      });
    };

    const legacyBtn = root.ProdigyUI
      ? root.ProdigyUI.button(actions, "단일 성찰")
      : actions.createEl("button", {
        text: "단일 성찰",
        attr: { type: "button", class: "prodigy-btn" }
      });
    legacyBtn.onclick = () => {
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
      if (item.blockCount) {
        left.createEl("span", {
          text: ` · ${item.blockCount}블록`,
          attr: { style: "color:var(--text-muted);font-size:0.82em;margin-left:4px;" }
        });
      }
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

  const api = {
    openReviewModal,
    openEvidenceBlockModal,
    openProposeEvidenceModal,
    renderDashboard,
    openPath
  };
  root.JournalView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
