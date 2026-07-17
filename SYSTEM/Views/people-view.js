(function (root) {
  "use strict";

  /**
   * People create UX — name only, then open Object.
   * No wizard, no CRM fields, no Dashboard.
   */

  function notice(message, timeout) {
    if (typeof Notice !== "undefined") new Notice(message, timeout || 5000);
  }

  function openPath(app, path) {
    if (!app || !path) return;
    return app.workspace.openLinkText(String(path).replace(/\.md$/, ""), "", false);
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

  const api = {
    openPath,
    createAndOpen,
    openCreateFlow
  };

  root.PeopleView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
