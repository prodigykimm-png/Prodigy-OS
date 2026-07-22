(function (root) {
  "use strict";

  if (typeof require === "function") {
    if (!root.KnowledgeSourceBatchState) root.KnowledgeSourceBatchState = require("./knowledge-source-batch-state.js");
    if (!root.KnowledgeSourceBatchController) root.KnowledgeSourceBatchController = require("./knowledge-source-batch-controller.js");
    if (!root.KnowledgeSourceBatchRender) root.KnowledgeSourceBatchRender = require("./knowledge-source-batch-render.js");
  }
  const State = root.KnowledgeSourceBatchState;
  const Controller = root.KnowledgeSourceBatchController;
  const Render = root.KnowledgeSourceBatchRender;

  function requireRuntime() {
    if (!State || !Controller || !Render) throw new Error("자료 묶음 모듈을 모두 불러와야 합니다.");
  }
  function openSourceBatchModal(app, options) {
    requireRuntime();
    const config = options || {};
    const ModalBase = config.Modal || (root.obsidian && root.obsidian.Modal);
    if (!ModalBase) return null;
    class SourceBatchModal extends ModalBase {
      constructor() {
        super(app);
        this.controller = Controller.createSourceBatchController({ ...config, app });
        this.mounted = null;
      }
      onOpen() {
        this.mounted = Render.mountSourceBatchView(this.contentEl, this.controller);
        this.contentEl.onkeydown = this.mounted.onKeydown;
      }
      onClose() {
        if (this.mounted) this.mounted.unmount(); else this.controller.close();
        if (config.opener && typeof config.opener.focus === "function") config.opener.focus();
      }
    }
    const modal = new SourceBatchModal();
    modal.open();
    return modal;
  }
  function createSourceBatchController(options, onChange) { requireRuntime(); return Controller.createSourceBatchController(options, onChange); }
  function mountSourceBatchView(parent, controller) { requireRuntime(); return Render.mountSourceBatchView(parent, controller); }

  const api = Object.freeze({ SUPPORTED_KINDS: State ? State.SUPPORTED_KINDS : Object.freeze([]), createSourceBatchController, mountSourceBatchView, openSourceBatchModal });
  root.KnowledgeSourceBatchView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
