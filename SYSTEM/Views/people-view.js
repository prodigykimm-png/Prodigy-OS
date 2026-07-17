(function (root) {
  "use strict";

  /**
   * People UX — create + quick property edit modal.
   * Not a CRM: only whitelist fields; body narrative stays in the Object note.
   */

  function notice(message, timeout) {
    if (typeof Notice !== "undefined") new Notice(message, timeout || 5000);
  }

  function openPath(app, path) {
    if (!app || !path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
  }

  /** Open People note in a side split when list/workspace helper is available. */
  function openBeside(app, path) {
    if (root.ProdigyListWorkspace && typeof root.ProdigyListWorkspace.openBeside === "function") {
      return root.ProdigyListWorkspace.openBeside(app, path);
    }
    if (!app || !path) return null;
    const filePath = String(path);
    const link = filePath.replace(/\.md$/i, "");
    try {
      return app.workspace.openLinkText(link, filePath, "split");
    } catch (_e) {
      return openPath(app, path);
    }
  }

  async function createAndOpen(app, rawName) {
    if (!root.PeopleStore || !root.PeopleCore) {
      throw new Error("People 모듈을 불러오지 못했습니다.");
    }
    const result = await root.PeopleStore.createPeople(app, rawName);
    await openPath(app, result.path);
    notice(`사람 Object를 만들었습니다: ${result.name}`);
    return result;
  }

  function promptName() {
    const value = typeof window !== "undefined" && window.prompt
      ? window.prompt("사람 이름", "")
      : "";
    return String(value == null ? "" : value).trim();
  }

  /**
   * Fast path: prompt → create → open.
   */
  async function openCreateFlow(app) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다. Personal Hub 스크립트 로드를 확인하세요.");
      return null;
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      const name = promptName();
      if (!name) return null;
      try {
        return await createAndOpen(host, name);
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleCreateModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.name = "";
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h2", { text: "사람 추가", attr: { style: "margin:0 0 8px;font-size:1.15em;" } });
          contentEl.createEl("p", {
            text: "이름만 입력하면 People Object가 생성됩니다. 관계 맥락은 Object를 연 뒤 채웁니다.",
            attr: { style: "font-size:0.84em;color:var(--text-muted);margin:0 0 12px;line-height:1.45;" }
          });
          contentEl.createEl("label", {
            text: "이름",
            attr: { style: "display:block;font-size:0.8em;font-weight:700;margin-bottom:4px;" }
          });
          const input = contentEl.createEl("input", {
            attr: {
              type: "text",
              placeholder: "예: 홍길동",
              style: "width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);"
            }
          });
          input.value = this.name;
          input.oninput = () => { this.name = input.value; };
          input.onkeydown = (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              this.submit();
            }
          };

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;" }
          });
          const cancel = contentEl.ownerDocument
            ? footer.createEl("button", { text: "취소", attr: { type: "button" } })
            : footer.createEl("button", { text: "취소" });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.createBtn = footer.createEl("button", {
            text: "만들기",
            attr: { type: "button", class: "mod-cta" }
          });
          this.createBtn.onclick = () => this.submit();
          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:10px;font-size:0.8em;color:var(--text-muted);" }
          });
          setTimeout(() => input.focus(), 20);
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.createBtn.disabled = true;
          this.statusEl.setText("만드는 중...");
          try {
            const result = await createAndOpen(this.app, this.name);
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--text-error)";
            this.busy = false;
            this.createBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleCreateModal(host).open();
    });
  }

  function fieldLabel(key) {
    if (root.prodigyDisplay && typeof root.prodigyDisplay.property === "function") {
      return root.prodigyDisplay.property(key);
    }
    const fallback = {
      relationship: "관계",
      company: "소속",
      role: "역할",
      last_contact: "최근 연락",
      phone: "전화",
      email: "이메일"
    };
    return fallback[key] || key;
  }

  /**
   * Quick-edit modal: whitelist properties only.
   * @param {object} app
   * @param {string} path
   * @param {function} [onSaved]
   */
  async function openQuickEditFlow(app, path, onSaved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    let snapshot;
    try {
      snapshot = await root.PeopleStore.readPeopleProperties(host, path);
    } catch (error) {
      notice(error.message || String(error), 9000);
      return null;
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      notice("모달을 열 수 없습니다. 원본 노트를 엽니다.");
      await openPath(host, path);
      return null;
    }

    return new Promise((resolve) => {
      class PeopleQuickEditModal extends Modal {
        constructor(appInstance, data) {
          super(appInstance);
          this.data = data;
          this.values = Object.assign({}, data.values || {});
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          const typeNote = this.data.type === "contact"
            ? "레거시 contact — 읽기 호환 필드만 수정합니다. type은 바꾸지 않습니다."
            : "관계 맥락의 핵심 Property만 수정합니다. 긴 서사는 원본 노트에 둡니다.";

          contentEl.createEl("h2", {
            text: `빠른 수정 · ${this.data.title}`,
            attr: { style: "margin:0 0 6px;font-size:1.12em;" }
          });
          contentEl.createEl("p", {
            text: typeNote,
            attr: { style: "font-size:0.82em;color:var(--text-muted);margin:0 0 12px;line-height:1.45;" }
          });

          const fields = root.PeopleCore.QUICK_EDIT_FIELDS;
          fields.forEach((key) => {
            const wrap = contentEl.createEl("div", {
              attr: { style: "margin-bottom:10px;" }
            });
            wrap.createEl("label", {
              text: fieldLabel(key),
              attr: { style: "display:block;font-size:0.78em;font-weight:700;margin-bottom:4px;color:var(--text-muted);" }
            });
            const input = wrap.createEl("input", {
              attr: {
                type: key === "email" ? "email" : (key === "last_contact" ? "text" : "text"),
                placeholder: key === "last_contact" ? "YYYY-MM-DD" : "",
                style: "width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);"
              }
            });
            input.value = this.values[key] || "";
            input.oninput = () => { this.values[key] = input.value; };
          });

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;" }
          });

          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.saveBtn = footer.createEl("button", {
            text: "저장",
            attr: { type: "button", class: "mod-cta" }
          });
          this.saveBtn.onclick = () => this.submit();

          this.statusEl = contentEl.createEl("div", {
            text: "",
            attr: { style: "margin-top:10px;font-size:0.8em;color:var(--text-muted);" }
          });
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.saveBtn.disabled = true;
          this.statusEl.setText("저장 중...");
          this.statusEl.style.color = "var(--text-muted)";
          try {
            const result = await root.PeopleStore.updatePeopleProperties(
              this.app,
              this.data.path,
              this.values
            );
            notice(`저장했습니다: ${this.data.title}`);
            if (typeof onSaved === "function") {
              try { await onSaved(result); } catch (_e) { /* ignore refresh errors */ }
            }
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--text-error)";
            this.busy = false;
            this.saveBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleQuickEditModal(host, snapshot).open();
    });
  }

  /**
   * Add a one-line interaction/event under # 핵심 상호작용 (like handwritten memos).
   * Index only — does not create a separate event Object or copy long bodies.
   */
  async function openAddInteractionFlow(app, path, onSaved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    let title = String(path || "").split("/").pop().replace(/\.md$/i, "");
    try {
      const snap = await root.PeopleStore.readPeopleProperties(host, path);
      title = snap.title || title;
    } catch (_e) {
      /* path still usable */
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    const today = root.PeopleCore.todayIso(new Date());

    if (!Modal) {
      const insight = typeof window !== "undefined" && window.prompt
        ? window.prompt("사건 한 줄 (예: 전태현 청모)", "")
        : "";
      if (!insight) return null;
      try {
        const result = await root.PeopleStore.appendKeyInteraction(host, path, {
          date: today,
          insight
        });
        notice("사건을 추가했습니다.");
        if (typeof onSaved === "function") await onSaved(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleInteractionModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.date = today;
          this.source = `[[${today}]]`;
          this.insight = "";
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h2", {
            text: `사건 추가 · ${title}`,
            attr: { style: "margin:0 0 6px;font-size:1.12em;" }
          });
          contentEl.createEl("p", {
            text: "핵심 상호작용 인덱스에 한 줄만 남깁니다. 긴 내용은 Journal·Project 원본에 두고 링크하세요.",
            attr: { style: "font-size:0.82em;color:var(--text-muted);margin:0 0 12px;line-height:1.45;" }
          });

          const field = (label, value, onChange, placeholder) => {
            const wrap = contentEl.createEl("div", { attr: { style: "margin-bottom:10px;" } });
            wrap.createEl("label", {
              text: label,
              attr: { style: "display:block;font-size:0.78em;font-weight:700;margin-bottom:4px;color:var(--text-muted);" }
            });
            const input = wrap.createEl("input", {
              attr: {
                type: "text",
                placeholder: placeholder || "",
                style: "width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);"
              }
            });
            input.value = value || "";
            input.oninput = () => onChange(input.value);
            return input;
          };

          field("날짜", this.date, (v) => {
            this.date = v;
            if (!this.source || this.source === `[[${today}]]` || /^\[\[\d{4}-\d{2}-\d{2}\]\]$/.test(this.source)) {
              this.source = `[[${root.PeopleCore.normalizeIsoDate(v, new Date())}]]`;
              if (this.sourceInput) this.sourceInput.value = this.source;
            }
          }, "YYYY-MM-DD");

          this.sourceInput = field(
            "출처 링크 (선택)",
            this.source,
            (v) => { this.source = v; },
            "[[2026-07-16]] 또는 노트 제목"
          );

          const insightInput = field(
            "한 줄 내용",
            this.insight,
            (v) => { this.insight = v; },
            "예: 전태현 청모"
          );

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;" }
          });

          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.saveBtn = footer.createEl("button", {
            text: "추가",
            attr: { type: "button", class: "mod-cta" }
          });
          this.saveBtn.onclick = () => this.submit();

          this.statusEl = contentEl.createEl("div", {
            text: "저장 위치: # 핵심 상호작용 · last_contact 자동 갱신",
            attr: { style: "margin-top:10px;font-size:0.78em;color:var(--text-muted);" }
          });
          setTimeout(() => insightInput.focus(), 20);
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.saveBtn.disabled = true;
          this.statusEl.setText("추가 중...");
          this.statusEl.style.color = "var(--text-muted)";
          try {
            const result = await root.PeopleStore.appendKeyInteraction(this.app, path, {
              date: this.date,
              source: this.source,
              insight: this.insight
            });
            notice(`사건을 추가했습니다: ${title}`);
            if (typeof onSaved === "function") {
              try { await onSaved(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--text-error)";
            this.busy = false;
            this.saveBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleInteractionModal(host).open();
    });
  }

  /**
   * Add a factual one-line note under # 메모 (not a dated interaction event).
   */
  async function openAddMemoFlow(app, path, onSaved) {
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.PeopleStore || !root.PeopleCore) {
      notice("People 모듈을 불러오지 못했습니다.");
      return null;
    }

    let title = String(path || "").split("/").pop().replace(/\.md$/i, "");
    try {
      const snap = await root.PeopleStore.readPeopleProperties(host, path);
      title = snap.title || title;
    } catch (_e) {
      /* path still usable */
    }

    const Modal = root.obsidian && root.obsidian.Modal;

    if (!Modal) {
      const text = typeof window !== "undefined" && window.prompt
        ? window.prompt("메모 (사실·장기 맥락)", "")
        : "";
      if (!text) return null;
      try {
        const result = await root.PeopleStore.appendMemo(host, path, { text });
        notice("메모를 추가했습니다.");
        if (typeof onSaved === "function") await onSaved(result);
        return result;
      } catch (error) {
        notice(error.message || String(error), 9000);
        return null;
      }
    }

    return new Promise((resolve) => {
      class PeopleMemoModal extends Modal {
        constructor(appInstance) {
          super(appInstance);
          this.text = "";
          this.busy = false;
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h2", {
            text: `메모 추가 · ${title}`,
            attr: { style: "margin:0 0 6px;font-size:1.12em;" }
          });
          contentEl.createEl("p", {
            text: "사실 중심 장기 맥락을 # 메모에 남깁니다. 날짜 사건·상호작용 로그는 「사건 추가」를 쓰세요.",
            attr: { style: "font-size:0.82em;color:var(--text-muted);margin:0 0 12px;line-height:1.45;" }
          });

          contentEl.createEl("label", {
            text: "메모",
            attr: { style: "display:block;font-size:0.78em;font-weight:700;margin-bottom:4px;color:var(--text-muted);" }
          });
          const area = contentEl.createEl("textarea", {
            attr: {
              rows: "4",
              placeholder: "예: 청모 모임에서 처음 만남 · 주말에만 연락 가능",
              style: "width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);min-height:88px;resize:vertical;"
            }
          });
          area.value = this.text;
          area.oninput = () => { this.text = area.value; };

          const footer = contentEl.createEl("div", {
            attr: { style: "display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;" }
          });

          const cancel = footer.createEl("button", { text: "취소", attr: { type: "button" } });
          cancel.onclick = () => {
            this.close();
            resolve(null);
          };
          this.saveBtn = footer.createEl("button", {
            text: "추가",
            attr: { type: "button", class: "mod-cta" }
          });
          this.saveBtn.onclick = () => this.submit();

          this.statusEl = contentEl.createEl("div", {
            text: "저장 위치: # 메모 · last_contact는 바꾸지 않음",
            attr: { style: "margin-top:10px;font-size:0.78em;color:var(--text-muted);" }
          });
          setTimeout(() => area.focus(), 20);
        }
        async submit() {
          if (this.busy) return;
          this.busy = true;
          this.saveBtn.disabled = true;
          this.statusEl.setText("추가 중...");
          this.statusEl.style.color = "var(--text-muted)";
          try {
            const result = await root.PeopleStore.appendMemo(this.app, path, {
              text: this.text
            });
            notice(`메모를 추가했습니다: ${title}`);
            if (typeof onSaved === "function") {
              try { await onSaved(result); } catch (_e) { /* ignore */ }
            }
            this.close();
            resolve(result);
          } catch (error) {
            this.statusEl.setText(error.message || String(error));
            this.statusEl.style.color = "var(--text-error)";
            this.busy = false;
            this.saveBtn.disabled = false;
          }
        }
        onClose() {
          this.contentEl.empty();
        }
      }
      new PeopleMemoModal(host).open();
    });
  }

  const WORKSPACE_STYLE_ID = "prodigy-people-workspace-styles";

  function ensureWorkspaceStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(WORKSPACE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = WORKSPACE_STYLE_ID;
    style.textContent = `
.prodigy-people-workspace{max-width:980px;margin:0 auto;padding:8px 8px 24px}
.ppw-header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:4px 0 16px;border-bottom:1px solid var(--background-modifier-border);flex-wrap:wrap}
.ppw-header h1{margin:0;font-size:1.45em}
.ppw-header p{margin:6px 0 0;color:var(--text-muted);font-size:.84em;line-height:1.45;max-width:36em}
.ppw-toolbar{display:flex;flex-direction:column;gap:10px;padding:14px 0 8px}
.ppw-search{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-size:.95em}
.ppw-filters{display:flex;flex-wrap:wrap;gap:6px}
.ppw-filter{min-height:36px;padding:6px 12px;border-radius:999px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);font-size:.78em;font-weight:700;cursor:pointer}
.ppw-filter.is-active{background:var(--interactive-accent);color:var(--text-on-accent);border-color:var(--interactive-accent)}
.ppw-count{font-size:.78em;color:var(--text-muted)}
.ppw-list{display:flex;flex-direction:column;gap:10px;padding:8px 0 4px}
.ppw-card{border:1px solid var(--background-modifier-border);border-radius:10px;background:var(--background-secondary);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.ppw-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ppw-name{margin:0;font-size:1.05em;font-weight:800;color:var(--text-accent);cursor:pointer;border-bottom:1px solid transparent}
.ppw-name:hover{border-bottom-color:var(--text-accent)}
.ppw-badge{font-size:.7em;font-weight:700;color:var(--text-muted);border:1px solid var(--background-modifier-border);border-radius:4px;padding:2px 6px}
.ppw-meta{font-size:.84em;color:var(--text-normal);line-height:1.4;overflow-wrap:anywhere}
.ppw-sub{font-size:.78em;color:var(--text-muted);line-height:1.4}
.ppw-context{margin-top:2px;padding-top:8px;border-top:1px solid var(--background-modifier-border)}
.ppw-context-title{font-size:.72em;font-weight:700;color:var(--text-muted);margin-bottom:6px;letter-spacing:.02em}
.ppw-context-item{display:flex;flex-direction:column;gap:1px;padding:4px 0;cursor:pointer;border-radius:4px}
.ppw-context-item:hover{background:var(--background-modifier-hover)}
.ppw-context-item strong{font-size:.86em;overflow-wrap:anywhere}
.ppw-context-item span{font-size:.74em;color:var(--text-muted)}
.ppw-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.ppw-actions button{min-height:36px}
.ppw-related{margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--background-primary);border:1px solid var(--background-modifier-border)}
.ppw-related-empty,.ppw-empty{padding:18px 4px;color:var(--text-muted);font-size:.88em;line-height:1.5}
.ppw-areas{margin-top:28px;padding-top:12px;border-top:1px solid var(--background-modifier-border);opacity:.92}
.ppw-areas summary{cursor:pointer;font-weight:700;font-size:.95em;color:var(--text-muted);list-style:none}
.ppw-areas summary::-webkit-details-marker{display:none}
@media(max-width:600px){
  .prodigy-people-workspace{padding:4px 4px 32px}
  .ppw-header{flex-direction:column;align-items:stretch}
  .ppw-filter{min-height:40px}
  .ppw-actions{display:grid;grid-template-columns:1fr 1fr}
  .ppw-actions button{min-height:44px;width:100%}
  .ppw-actions button.ppw-action-primary{grid-column:1 / -1}
}
`;
    document.head.appendChild(style);
  }

  function btn(parent, label, opts) {
    const o = opts || {};
    if (root.ProdigyUI && root.ProdigyUI.button) {
      return root.ProdigyUI.button(parent, label, {
        primary: !!o.primary,
        className: o.className || ""
      });
    }
    const el = parent.createEl("button", {
      text: label,
      attr: {
        type: "button",
        class: ["prodigy-btn", o.primary ? "prodigy-btn-primary" : "", o.className || ""].filter(Boolean).join(" ")
      }
    });
    return el;
  }

  /**
   * People Workspace surface inside Personal Hub.
   * options: { app, container, model, onRefresh, onOpenPerson, onOpenRecord }
   * model from PeopleCore.buildPeopleWorkspaceModel
   */
  function renderPeopleWorkspace(options) {
    const opts = options || {};
    const app = opts.app;
    const container = opts.container;
    const core = root.PeopleCore;
    if (!container || !core) return null;
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();
    ensureWorkspaceStyles();

    const state = {
      query: (opts.model && opts.model.query) || "",
      filter: (opts.model && opts.model.filter) || "all",
      expanded: Object.create(null)
    };

    let model = opts.model || core.buildPeopleWorkspaceModel([], [], {});
    const rawPeople = opts.rawPeople || null;
    const sourcePages = opts.sourcePages || null;

    function rebuildModel() {
      if (rawPeople && core.buildPeopleWorkspaceModel) {
        model = core.buildPeopleWorkspaceModel(rawPeople, sourcePages || [], {
          query: state.query,
          filter: state.filter,
          maxPreview: 3
        });
      } else if (opts.model && rawPeople == null) {
        // filter existing enriched list client-side
        const base = opts.allPeople || opts.model.people || [];
        // if opts.allPeople not set, use model as full set only when query empty first paint
        const full = opts.allPeople || model._all || base;
        const filtered = core.filterPeopleList(full, { query: state.query, filter: state.filter });
        model = {
          people: core.sortPeopleList(filtered),
          total: full.length,
          shown: filtered.length,
          query: state.query,
          filter: state.filter,
          filters: core.WORKSPACE_FILTERS,
          empty: full.length === 0,
          no_match: full.length > 0 && filtered.length === 0,
          _all: full
        };
      }
    }

    function openPerson(path) {
      if (typeof opts.onOpenPerson === "function") return opts.onOpenPerson(path);
      return openBeside(app, path);
    }

    function openRecord(path) {
      if (typeof opts.onOpenRecord === "function") return opts.onOpenRecord(path);
      return openBeside(app, path);
    }

    function paint() {
      if (rawPeople) rebuildModel();
      else rebuildModel();

      container.empty();
      container.addClass("prodigy-people-workspace");

      const header = container.createDiv({ attr: { class: "ppw-header" } });
      const heading = header.createDiv();
      heading.createEl("h1", { text: opts.title || "사람과 관계" });
      heading.createEl("p", {
        text: opts.subtitle || "중요한 사람을 찾고, 함께한 기록과 관계의 맥락을 이어갑니다."
      });
      const headerActions = header.createDiv({ attr: { style: "display:flex;gap:8px;flex-wrap:wrap;" } });
      const addBtn = btn(headerActions, "사람 추가", { primary: true });
      addBtn.onclick = async () => {
        await openCreateFlow(app);
        if (typeof opts.onRefresh === "function") opts.onRefresh();
        else paint();
      };

      const toolbar = container.createDiv({ attr: { class: "ppw-toolbar" } });
      const search = toolbar.createEl("input", {
        attr: {
          class: "ppw-search",
          type: "search",
          placeholder: "이름 · 관계 · 회사 · 역할 검색",
          value: state.query,
          "aria-label": "사람 검색"
        }
      });
      search.value = state.query;
      search.oninput = () => {
        state.query = search.value;
        paint();
      };

      const filters = toolbar.createDiv({ attr: { class: "ppw-filters" } });
      (core.WORKSPACE_FILTERS || []).forEach((f) => {
        const chip = filters.createEl("button", {
          text: f.label,
          attr: {
            type: "button",
            class: "ppw-filter" + (state.filter === f.id ? " is-active" : "")
          }
        });
        chip.onclick = () => {
          state.filter = f.id;
          paint();
        };
      });

      const count = toolbar.createEl("div", {
        text: model.empty
          ? ""
          : (model.no_match
            ? "일치하는 사람이 없습니다."
            : `${model.shown}명 표시 · 전체 ${model.total}명`),
        attr: { class: "ppw-count" }
      });

      const list = container.createDiv({ attr: { class: "ppw-list" } });

      if (model.empty) {
        const empty = list.createEl("div", { attr: { class: "ppw-empty" } });
        empty.createEl("div", { text: "등록된 사람이 없습니다." });
        empty.createEl("div", { text: "중요한 사람부터 한 명 추가해 보세요." });
        return model;
      }

      if (model.no_match) {
        list.createEl("div", {
          text: "일치하는 사람이 없습니다.",
          attr: { class: "ppw-empty" }
        });
        return model;
      }

      (model.people || []).forEach((person) => {
        const card = list.createDiv({ attr: { class: "ppw-card" } });
        const top = card.createDiv({ attr: { class: "ppw-card-top" } });
        const left = top.createDiv();
        const nameEl = left.createEl("a", {
          text: person.name,
          attr: { class: "ppw-name", href: "#", title: "옆에 노트 열기" }
        });
        nameEl.onclick = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          openPerson(person.path);
        };
        if (person.is_legacy) {
          top.createEl("span", { text: "레거시", attr: { class: "ppw-badge" } });
        }

        if (person.meta_line) {
          card.createEl("div", { text: person.meta_line, attr: { class: "ppw-meta" } });
        }

        const subBits = [];
        if (person.last_contact) subBits.push(`최근 연락 ${person.last_contact}`);
        subBits.push(
          person.linked_count
            ? `연결된 기록 ${person.linked_count}개`
            : "연결된 기록 없음"
        );
        card.createEl("div", { text: subBits.join(" · "), attr: { class: "ppw-sub" } });

        // Recent context preview (related records — not confirmed interactions)
        const ctx = card.createDiv({ attr: { class: "ppw-context" } });
        ctx.createEl("div", { text: "최근 맥락", attr: { class: "ppw-context-title" } });
        const recent = person.recent_context || [];
        if (!recent.length) {
          ctx.createEl("div", {
            text: "아직 연결된 기록이 없습니다. Project나 Journal에서 이 사람을 링크하면 여기에 표시됩니다.",
            attr: { class: "ppw-related-empty" }
          });
        } else {
          recent.forEach((item) => {
            const row = ctx.createDiv({ attr: { class: "ppw-context-item" } });
            row.createEl("strong", { text: item.title });
            const meta = [item.type_label || "기록"];
            if (item.mtime) {
              try {
                const d = new Date(item.mtime);
                if (!Number.isNaN(d.getTime())) {
                  meta.unshift(d.toISOString().slice(0, 10));
                }
              } catch (_e) { /* ignore */ }
            }
            row.createEl("span", { text: meta.join(" · ") });
            row.onclick = () => openRecord(item.path);
          });
        }

        const actions = card.createDiv({ attr: { class: "ppw-actions" } });
        const openBtn = btn(actions, "사람 열기", { primary: true, className: "ppw-action-primary" });
        openBtn.onclick = () => openPerson(person.path);

        const relatedBtn = btn(actions, state.expanded[person.path] ? "관련 기록 접기" : "관련 기록 보기");
        relatedBtn.onclick = () => {
          state.expanded[person.path] = !state.expanded[person.path];
          paint();
        };

        const eventBtn = btn(actions, "사건 추가");
        eventBtn.onclick = () => openAddInteractionFlow(app, person.path, () => {
          if (typeof opts.onRefresh === "function") opts.onRefresh();
          else paint();
        });

        const memoBtn = btn(actions, "메모 추가");
        memoBtn.onclick = () => openAddMemoFlow(app, person.path, () => {
          if (typeof opts.onRefresh === "function") opts.onRefresh();
          else paint();
        });

        const editBtn = btn(actions, "빠른 수정");
        editBtn.onclick = () => openQuickEditFlow(app, person.path, () => {
          if (typeof opts.onRefresh === "function") opts.onRefresh();
          else paint();
        });

        if (state.expanded[person.path]) {
          const panel = card.createDiv({ attr: { class: "ppw-related" } });
          const all = person.linked_all || [];
          if (!all.length) {
            panel.createEl("div", {
              text: "아직 연결된 기록이 없습니다. Project나 Journal에서 이 사람을 링크하면 여기에 표시됩니다.",
              attr: { class: "ppw-related-empty" }
            });
          } else {
            all.slice(0, 12).forEach((item) => {
              const row = panel.createDiv({ attr: { class: "ppw-context-item" } });
              row.createEl("strong", { text: item.title });
              row.createEl("span", { text: `${item.type_label || "기록"} · 관련 기록` });
              row.onclick = () => openRecord(item.path);
            });
            if (all.length > 12) {
              panel.createEl("div", {
                text: `외 ${all.length - 12}개 — 사람 노트에서 전체 확인`,
                attr: { class: "ppw-sub" }
              });
            }
          }
        }
      });

      // silence unused
      void count;
      return model;
    }

    paint();
    return { paint, getState: () => state, getModel: () => model };
  }

  const api = {
    openPath,
    openBeside,
    createAndOpen,
    openCreateFlow,
    openQuickEditFlow,
    openAddInteractionFlow,
    openAddMemoFlow,
    renderPeopleWorkspace,
    ensureWorkspaceStyles
  };

  root.PeopleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
