(function (root) {
  "use strict";

  /**
   * Universal Object Creator UI.
   * Extremely small: input → classify → confirm → existing creator.
   */

  const STYLE_ID = "prodigy-object-creator-styles";

  const CSS = `
.prodigy-object-creator{max-width:min(440px,92vw);padding:4px 2px 0}
.poc-title{margin:0 0 4px;font-size:1.15em;font-weight:800;letter-spacing:-0.02em}
.poc-sub{margin:0 0 12px;font-size:0.82em;color:var(--text-muted);line-height:1.4}
.poc-label{display:block;font-size:0.74em;font-weight:700;color:var(--text-muted);margin:0 0 6px}
.poc-input{
  width:100%;min-height:44px;box-sizing:border-box;padding:10px 12px;border-radius:8px;
  border:1px solid var(--background-modifier-border);background:var(--background-primary);box-shadow:none;
  color:var(--text-normal);font:inherit;font-size:0.95em;line-height:1.4;
}
.poc-input:focus-visible{outline:2px solid var(--ke-color-interactive, var(--interactive-accent));outline-offset:2px;border-color:var(--ke-color-interactive, var(--interactive-accent));box-shadow:none}
.poc-section{margin-top:14px}
.poc-section-title{font-size:0.72em;font-weight:800;color:var(--text-muted);letter-spacing:0.04em;margin:0 0 8px;text-transform:uppercase}
.poc-types{display:flex;flex-direction:column;gap:4px;max-height:min(40vh,280px);overflow:auto}
.poc-type{
  display:flex;align-items:flex-start;gap:8px;min-height:44px;padding:8px 10px;border-radius:8px;
  border:1px solid var(--background-modifier-border);background:var(--background-secondary);
  cursor:pointer;text-align:left;width:100%;min-width:0;font:inherit;color:var(--text-normal);
  white-space:normal;overflow-wrap:anywhere;box-shadow:none;-webkit-appearance:none;appearance:none;
}
.poc-type:hover{background:var(--background-modifier-hover)}
.poc-type.is-active{
  border-color:var(--ke-color-interactive, var(--interactive-accent));
  background:color-mix(in srgb,var(--ke-color-interactive, var(--interactive-accent)) 14%,var(--background-secondary));
}
.poc-type-radio{flex:0 0 auto;margin-top:2px;font-size:0.9em;color:var(--text-muted)}
.poc-type.is-active .poc-type-radio{color:var(--ke-color-interactive, var(--interactive-accent));font-weight:800}
.poc-type-body{flex:1 1 auto;min-width:0}
.poc-type-name{font-weight:700;font-size:0.92em}
.poc-type-reason{font-size:0.78em;color:var(--text-muted);margin-top:2px;line-height:1.35;white-space:normal;overflow-wrap:anywhere}
.poc-reason-box{
  margin-top:10px;padding:8px 10px;border-radius:8px;
  background:var(--background-secondary);border:1px solid var(--background-modifier-border);
  font-size:0.84em;line-height:1.45;color:var(--text-normal);
}
.poc-reason-box strong{display:block;font-size:0.78em;color:var(--text-muted);margin-bottom:4px}
.poc-dup,.poc-recent{
  margin-top:10px;padding:10px;border-radius:8px;
  border:1px solid var(--background-modifier-border);font-size:0.8em;line-height:1.4;
  background:var(--background-secondary);
}
.poc-dup-title,.poc-recent-title{font-weight:800;color:var(--text-normal);margin-bottom:8px;font-size:0.84em}
.poc-dup-card{
  display:flex;flex-direction:column;gap:6px;padding:8px 0;
  border-top:1px solid var(--background-modifier-border);
}
.poc-dup-card:first-of-type{border-top:0;padding-top:0}
.poc-dup-title-line{font-weight:700;font-size:0.9em;color:var(--text-normal);overflow-wrap:anywhere}
.poc-dup-meta{font-size:0.78em;color:var(--text-muted);overflow-wrap:anywhere}
.poc-dup-reason{font-size:0.76em;color:var(--text-faint);line-height:1.35}
.poc-dup-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.poc-dup-actions button{
  min-height:44px;padding:4px 10px;font:inherit;font-size:0.8em;font-weight:650;
  border-radius:6px;cursor:pointer;border:1px solid var(--background-modifier-border);
  background:var(--background-primary);color:var(--text-normal);
}
.poc-dup-actions button:hover{background:var(--background-modifier-hover)}
.poc-recent-item{
  display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-height:44px;
  padding:4px 0;cursor:pointer;border:0;border-radius:4px;background:transparent;
  color:var(--text-normal);font:inherit;text-align:left;-webkit-appearance:none;appearance:none;
}
.poc-recent-item:hover{background:var(--background-modifier-hover)}
.poc-recent-item:focus-visible{outline:2px solid var(--ke-color-interactive, var(--interactive-accent));outline-offset:2px;box-shadow:none}
.poc-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap}
.poc-footer button{min-height:44px;padding:6px 14px;font:inherit}
.prodigy-object-creator button,.prodigy-object-creator button:hover,.prodigy-object-creator button:focus-visible{box-shadow:none}
.poc-status{margin-top:8px;font-size:0.78em;color:var(--text-muted);min-height:1.2em}
.poc-status.is-error{color:var(--text-error)}
.poc-status.is-success{color:var(--text-success,var(--text-accent))}
.poc-source{margin:0 0 10px;padding:7px 9px;border-radius:7px;background:var(--background-secondary);border:1px solid var(--background-modifier-border);font-size:.78em;color:var(--text-muted);overflow-wrap:anywhere}
.poc-source strong{color:var(--text-normal)}
@media(max-width:480px){
  .poc-dup-actions button{width:100%}
  .poc-footer{flex-direction:column}
  .poc-footer button{width:100%}
}
@media(forced-colors:active){
  .poc-input,.poc-type,.poc-dup,.poc-recent,.poc-dup-actions button{border-color:ButtonText}
  .poc-input:focus-visible,.poc-recent-item:focus-visible{outline-color:Highlight}
}
@media(prefers-reduced-motion:reduce){
  .prodigy-object-creator *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
`;

  function ensureStyles() {
    if (typeof document === "undefined") return;
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = CSS;
  }

  function notice(msg, t) {
    if (root.ObjectCreatorCore && root.ObjectCreatorCore.notice) {
      root.ObjectCreatorCore.notice(msg, t);
    } else if (typeof Notice !== "undefined") {
      new Notice(msg, t || 5000);
    }
  }
  function activeElement() {
    const browserWindow = typeof window !== "undefined" ? window : root;
    const doc = root.document || browserWindow.document;
    return doc && doc.activeElement ? doc.activeElement : null;
  }

  function restoreFocus(element) {
    if (!element || typeof element.focus !== "function") return;
    if (element.isConnected === false) return;
    try { element.focus(); } catch (_e) { /* ignore */ }
  }

  function confirmClose(options, modal) {
    if (!options || !options.confirmBeforeClose) return true;
    if (typeof options.confirmBeforeClose === "function") {
      return options.confirmBeforeClose(modal) !== false;
    }
    const browserWindow = typeof window !== "undefined" ? window : root;
    return typeof browserWindow.confirm === "function"
      ? browserWindow.confirm("Object Creator를 닫을까요? 입력한 내용은 유지되지 않습니다.")
      : true;
  }

  function sourceLabel(source) {
    if (!source) return "";
    if (typeof source === "string") return source.trim();
    return String(source.path || source.title || source.label || "").trim();
  }

  /**
   * Open the existing Object creation boundary.
   * @param {object} app
   * @param {object} [options]
   * @param {object} [options.pkg] Morning package for similar/recent
   * @param {string} [options.initialText]
   * @param {object|string} [options.source] Source metadata retained for callbacks
   * @param {HTMLElement} [options.openerEl] Element to focus after close
   * @param {boolean} [options.keepOpenOnSuccess] Keep the modal open after a delegated save
   * @param {boolean|function} [options.confirmBeforeClose] Require explicit close confirmation
   * @param {function} [options.onStateChange] Lifecycle callback: pending/success/error/closed
   * @param {function} [options.onSuccess] Called after the existing creator succeeds
   * @param {function} [options.onReview] Called when the explicit review action is chosen
   * @param {function} [options.onClose] Called after the modal closes
   */

  function open(app, options) {
    const opts = options || {};
    const host = app || root.app || (typeof window !== "undefined" ? window.app : null);
    if (!host) {
      notice("Obsidian 앱 컨텍스트가 필요합니다.");
      return null;
    }
    if (!root.ObjectCreatorCore) {
      notice("Object Creator 모듈을 불러오지 못했습니다.");
      return null;
    }

    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) {
      notice("모달을 열 수 없습니다.");
      return null;
    }

    ensureStyles();
    if (root.ProdigyUI) root.ProdigyUI.ensureStyles();

    const core = root.ObjectCreatorCore;
    const pkg = opts.pkg || {};
    const objectLists = {
      projects: (pkg.context && pkg.context.projects) || [],
      auctions: (pkg.context && pkg.context.auctions) || [],
      reading: (pkg.context && pkg.context.reading) || []
    };

    class UniversalObjectCreatorModal extends Modal {
      constructor(appInstance) {
        super(appInstance);
        this.app = appInstance;
        this.text = String(opts.initialText || "");
        this.selectedId = "";
        this.classification = core.classify(this.text);
        this.busy = false;
        this.source = opts.source || null;
        this.openerEl = opts.openerEl || activeElement();
        this.lastResult = null;
        this.lifecycleState = "idle";
        this.reviewBtn = null;
        if (this.classification.selected) {
          this.selectedId = this.classification.selected.id;
        }
      }
      notifyState(state, extra) {
        this.lifecycleState = state;
        if (typeof opts.onStateChange !== "function") return;
        try {
          opts.onStateChange(Object.assign({
            state,
            source: this.source,
            modal: this
          }, extra || {}));
        } catch (_e) { /* lifecycle observers must not break creation */ }
      }
      closeWithConfirmation() {
        if (this.busy || !confirmClose(opts, this)) return false;
        this.close();
        return true;
      }

      reclassify() {
        this.classification = core.classify(this.text);
        if (!this.selectedId || !(this.classification.candidates || []).some((c) => c.id === this.selectedId && c.score > 0)) {
          this.selectedId = this.classification.selected
            ? this.classification.selected.id
            : "";
        }
        // If user cleared, no selection
        if (!String(this.text || "").trim()) this.selectedId = "";
      }

      selectedCandidate() {
        const list = this.classification.candidates || [];
        return list.find((c) => c.id === this.selectedId) || this.classification.selected || null;
      }

      onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        if (modalEl) {
          modalEl.style.width = "min(460px, calc(100vw - 24px))";
        }
        contentEl.addClass("prodigy-object-creator");
        contentEl.setAttr("data-prodigy-modal-owner", "object-creator-view");
        contentEl.setAttr("data-prodigy-modal-source", "SYSTEM/Views/object-creator-view.js");

        contentEl.createEl("h2", { text: "새 Object", attr: { class: "poc-title" } });
        contentEl.createEl("p", {
          text: "무엇을 만드는지 적으면 유형을 제안합니다. 실행은 기존 생성 흐름을 씁니다.",
          attr: { class: "poc-sub" }
        });
        const sourcePath = sourceLabel(this.source);
        if (sourcePath) {
          contentEl.createEl("div", {
            text: `원본: ${sourcePath}`,
            attr: { class: "poc-source", "aria-label": `원본 ${sourcePath}` }
          });
        }

        contentEl.createEl("label", {
          text: "무엇을 만드시나요?",
          attr: { class: "poc-label" }
        });
        const input = contentEl.createEl("input", {
          attr: {
            type: "text",
            class: "poc-input",
            placeholder: "무슨 일이 있었나요?",
            "aria-label": "새 Object 입력"
          }
        });
        input.value = this.text;

        const suggestSection = contentEl.createDiv({ attr: { class: "poc-section" } });
        const reasonBox = contentEl.createDiv({ attr: { class: "poc-reason-box" } });
        const dupBox = contentEl.createDiv({ attr: { class: "poc-dup" } });
        const recentBox = contentEl.createDiv({ attr: { class: "poc-recent" } });
        const footer = contentEl.createDiv({ attr: { class: "poc-footer" } });
        const statusEl = contentEl.createEl("div", { text: "", attr: { class: "poc-status", role: "status", "aria-live": "polite" } });

        const cancelBtn = footer.createEl("button", {
          text: "취소",
          attr: { type: "button", "aria-label": "Object Creator 닫기" }
        });
        cancelBtn.onclick = () => this.closeWithConfirmation();

        this.createBtn = footer.createEl("button", {
          text: "새로 만들기",
          attr: { type: "button", class: "mod-cta" }
        });
        if (opts.keepOpenOnSuccess || typeof opts.onReview === "function") {
          this.reviewBtn = footer.createEl("button", {
            text: "검증 대기 열기",
            attr: { type: "button" }
          });
          this.reviewBtn.disabled = true;
        }

        const paint = () => {
          const hasText = !!String(this.text || "").trim();
          const sel = this.selectedCandidate();
          this.createBtn.disabled = !hasText || this.busy || !this.selectedId || this.lifecycleState === "success";
          this.createBtn.setText(
            this.lifecycleState === "success"
              ? "완료"
              : this.lifecycleState === "error"
                ? "다시 시도"
                : hasText && this.selectedId && core.createActionLabel
                  ? core.createActionLabel(this.selectedId)
                  : "새로 만들기"
          );
          if (this.reviewBtn) {
            this.reviewBtn.disabled = this.busy || this.lifecycleState !== "success";
          }
          suggestSection.empty();
          reasonBox.empty();
          dupBox.empty();
          recentBox.empty();

          if (!hasText) {
            suggestSection.createEl("div", {
              text: "입력하면 제안 유형이 나타납니다.",
              attr: { style: "font-size:0.84em;color:var(--text-faint);" }
            });
            reasonBox.style.display = "none";
            dupBox.style.display = "none";
          } else {
            suggestSection.createEl("div", {
              text: "제안",
              attr: { class: "poc-section-title" }
            });
            const list = suggestSection.createDiv({ attr: { class: "poc-types" } });
            const candidates = this.classification.candidates || [];
            // Show scored first, then others for manual pick
            const ordered = candidates.slice().sort((a, b) => {
              if ((b.score > 0) !== (a.score > 0)) return b.score > 0 ? 1 : -1;
              return (b.score || 0) - (a.score || 0);
            });
            ordered.forEach((c) => {
              const btn = list.createEl("button", {
                attr: {
                  type: "button",
                  class: "poc-type" + (this.selectedId === c.id ? " is-active" : "")
                }
              });
              btn.createEl("span", {
                text: this.selectedId === c.id ? "●" : "○",
                attr: { class: "poc-type-radio" }
              });
              const body = btn.createDiv({ attr: { class: "poc-type-body" } });
              body.createEl("div", {
                text: `${c.icon || ""} ${c.label}`.trim(),
                attr: { class: "poc-type-name" }
              });
              if (c.reason || (c.reasons && c.reasons[0])) {
                body.createEl("div", {
                  text: c.reason || c.reasons[0],
                  attr: { class: "poc-type-reason" }
                });
              }
              btn.onclick = () => {
                this.selectedId = c.id;
                paint();
              };
            });

            reasonBox.style.display = "";
            reasonBox.createEl("strong", { text: "이유" });
            if (sel && (sel.reasons || []).length) {
              (sel.reasons || []).forEach((r) => {
                reasonBox.createEl("div", { text: `· ${r}` });
              });
            } else if (sel) {
              reasonBox.createEl("div", { text: `· ${sel.label}을(를) 선택했습니다.` });
            } else {
              reasonBox.createEl("div", { text: "· 유형을 선택해 주세요." });
            }
            if (this.classification.fallback) {
              reasonBox.createEl("div", {
                text: "· 분류 신호가 약하거나 사용할 수 없어 폴백 제안을 포함합니다.",
                attr: { style: "margin-top:4px;color:var(--text-muted);font-size:0.92em;" }
              });
            }

            // Actionable duplicates — open exact Object or create anyway
            const similar = typeof core.listDuplicateCandidates === "function"
              ? core.listDuplicateCandidates(this.text, objectLists, { maxResults: 3 })
              : [];
            if (similar.length) {
              dupBox.style.display = "";
              dupBox.createEl("div", {
                text: "비슷한 Object가 있습니다",
                attr: { class: "poc-dup-title" }
              });
              similar.forEach((item) => {
                const card = dupBox.createDiv({ attr: { class: "poc-dup-card" } });
                card.createEl("div", {
                  text: item.title,
                  attr: { class: "poc-dup-title-line" }
                });
                const metaBits = [item.typeLabel, item.statusLabel].filter(Boolean);
                if (metaBits.length) {
                  card.createEl("div", {
                    text: metaBits.join(" · "),
                    attr: { class: "poc-dup-meta" }
                  });
                }
                if (item.reason) {
                  card.createEl("div", {
                    text: item.reason,
                    attr: { class: "poc-dup-reason" }
                  });
                }
                const actions = card.createDiv({ attr: { class: "poc-dup-actions" } });
                const openBtn = actions.createEl("button", {
                  text: "기존 Object 열기",
                  attr: { type: "button" }
                });
                openBtn.onclick = async (e) => {
                  if (e && e.preventDefault) e.preventDefault();
                  if (e && e.stopPropagation) e.stopPropagation();
                  if (this.busy) return;
                  statusEl.removeClass("is-error");
                  statusEl.setText("여는 중…");
                  try {
                    const result = typeof core.openExistingObject === "function"
                      ? await core.openExistingObject(this.app, item)
                      : (core.openPath(this.app, item.path), { ok: true });
                    if (result && result.ok) {
                      notice("기존 Object를 열었습니다.");
                      this.close();
                    } else {
                      statusEl.addClass("is-error");
                      statusEl.setText("기존 Object를 열 수 없습니다.");
                    }
                  } catch (_err) {
                    statusEl.addClass("is-error");
                    statusEl.setText("기존 Object를 열 수 없습니다.");
                    notice("기존 Object를 열 수 없습니다.");
                  }
                };
              });
            } else {
              dupBox.style.display = "none";
            }
          }

          const recent = core.buildRecentFromPackage(pkg, { max: 4 });
          if (recent.length) {
            recentBox.style.display = "";
            recentBox.createEl("div", { text: "최근", attr: { class: "poc-recent-title" } });
            recent.forEach((item) => {
              const row = recentBox.createEl("button", { attr: { type: "button", class: "poc-recent-item" } });
              row.createEl("span", { text: `${item.label} · ${item.title}` });
              row.onclick = () => {
                if (item.path) core.openPath(this.app, item.path);
              };
            });
          } else {
            recentBox.style.display = "none";
          }
        };

        input.oninput = () => {
          this.text = input.value;
          this.reclassify();
          paint();
        };

        // Create-anyway — always available; never blocked by duplicates
        this.createBtn.onclick = async () => {
          if (this.busy || !String(this.text || "").trim() || !this.selectedId || this.lifecycleState === "success") return;
          this.busy = true;
          this.lifecycleState = "pending";
          this.createBtn.disabled = true;
          statusEl.removeClass("is-error");
          statusEl.removeClass("is-success");
          statusEl.setText("만드는 중…");
          this.notifyState("pending", { typeId: this.selectedId, text: this.text });
          try {
            const captureRuntime = root.CaptureActionRuntime
              || (typeof require === "function" ? require("./capture-action-runtime.js") : null);
            if (!captureRuntime) throw new Error("Capture 승인 모듈을 불러오지 못했습니다.");
            const result = await core.launchExistingCreator(
              this.app,
              this.selectedId,
              this.text,
              {
                source: this.source,
                humanConfirmation: captureRuntime.humanConfirmation(
                  `object-creator-${this.selectedId}`,
                  new Date().toISOString()
                )
              }
            );
            if (result && result.review_required) {
              this.busy = false;
              this.lifecycleState = "human_review";
              const review = result.capture.record;
              captureRuntime.renderReview(statusEl, review, {
                confirm: async () => {
                  try {
                    const committed = await core.launchExistingCreator(this.app, this.selectedId, this.text, {
                      source: this.source, captureReview: review,
                      humanConfirmation: captureRuntime.humanConfirmation(`object-creator-${this.selectedId}`, review.approval_evidence.review.session_id)
                    });
                    this.lastResult = committed; this.lifecycleState = "success";
                    statusEl.addClass("is-success"); statusEl.setText("완료했습니다.");
                    notice(committed.message || "완료했습니다.");
                    if (!opts.keepOpenOnSuccess) this.close();
                  } catch (error) { this.lifecycleState = "error"; statusEl.setText(`오류: ${error.message || String(error)}`); }
                },
                reject: () => { this.lastResult = { capture: { record: captureRuntime.decideHumanReview(review, captureRuntime.humanConfirmation(`object-creator-${this.selectedId}`, review.approval_evidence.review.session_id), `object-creator-${this.selectedId}`, "reject") } }; this.lifecycleState = "rejected"; statusEl.setText("거절했습니다."); },
                cancel: () => { this.lastResult = { capture: { record: captureRuntime.decideHumanReview(review, captureRuntime.humanConfirmation(`object-creator-${this.selectedId}`, review.approval_evidence.review.session_id), `object-creator-${this.selectedId}`, "cancel") } }; this.lifecycleState = "cancelled"; statusEl.setText("취소했습니다."); }
              });
              this.notifyState("human_review", { result, typeId: this.selectedId, text: this.text });
              return;
            }
            this.lastResult = result || { ok: true };
            this.busy = false;
            this.lifecycleState = "success";
            statusEl.addClass("is-success");
            statusEl.setText("완료했습니다. 검증 대기를 열 수 있습니다.");
            notice(this.lastResult.message || "완료했습니다.");
            if (typeof opts.onSuccess === "function") {
              try { await opts.onSuccess({ result: this.lastResult, source: this.source, modal: this }); } catch (_e) { /* observer only */ }
            }
            this.notifyState("success", { result: this.lastResult, typeId: this.selectedId, text: this.text });
            paint();
            if (!opts.keepOpenOnSuccess) this.close();
          } catch (error) {
            this.busy = false;
            this.lifecycleState = "error";
            this.createBtn.disabled = false;
            statusEl.removeClass("is-success");
            statusEl.addClass("is-error");
            statusEl.setText(`오류: ${error.message || String(error)} — 다시 시도해 주세요.`);
            notice(error.message || String(error), 9000);
            this.notifyState("error", { error, typeId: this.selectedId, text: this.text, retry: true });
            paint();
          }
        };

        if (this.reviewBtn) {
          this.reviewBtn.onclick = async () => {
            if (this.busy || this.lifecycleState !== "success") return;
            this.busy = true;
            this.reviewBtn.disabled = true;
            statusEl.removeClass("is-error");
            statusEl.setText("검증 대기를 여는 중…");
            try {
              let result;
              if (typeof opts.onReview === "function") {
                result = await opts.onReview({ result: this.lastResult, source: this.source, modal: this });
              } else if (this.lastResult && this.lastResult.path && typeof core.openExistingObject === "function") {
                result = await core.openExistingObject(this.app, this.lastResult);
              }
              if (result && result.ok === false) throw new Error(result.error || "검증 대기를 열 수 없습니다.");
              statusEl.removeClass("is-error");
              statusEl.addClass("is-success");
              statusEl.setText("검증 대기를 열었습니다.");
              this.notifyState("review", { result: result || this.lastResult, source: this.source });
            } catch (error) {
              statusEl.addClass("is-error");
              statusEl.setText(`검증 대기를 열 수 없습니다. ${error.message || String(error)} — 다시 시도해 주세요.`);
              this.notifyState("error", { error, action: "review", retry: true });
            } finally {
              this.busy = false;
              paint();
            }
          };
        }

        input.onkeydown = (e) => {
          if (e && e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            if (!this.createBtn.disabled) this.createBtn.click();
          }
        };

        paint();
        setTimeout(() => {
          try { input.focus(); } catch (_e) { /* ignore */ }
        }, 20);
      }

      onClose() {
        this.contentEl.empty();
        this.notifyState("closed", { result: this.lastResult });
        restoreFocus(this.openerEl);
        if (typeof opts.onClose === "function") {
          try { opts.onClose({ result: this.lastResult, source: this.source, modal: this }); } catch (_e) { /* observer only */ }
        }
      }
    }

    const modal = new UniversalObjectCreatorModal(host);
    modal.open();
    return modal;
  }

  const api = {
    open,
    ensureStyles
  };

  root.ObjectCreatorView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
