(function (root) {
  "use strict";
  if (root.QuickCaptureView && root.QuickCaptureView.implementation_version === "quick_capture_v1") {
    if (typeof module !== "undefined" && module.exports) module.exports = root.QuickCaptureView;
    return;
  }

  const FLEETING_FOLDER = "ZETA/FLEETING";
  const INBOX_FOLDER = "INBOX";
  const ACTION_SAVE_THOUGHT = "quick_capture_save_thought";
  const ACTION_ADD_MATERIAL = "quick_capture_add_material";

  function runtime() { const value = root.CaptureActionRuntime; if (value) return value; if (typeof require === "function") return require("./capture-action-runtime.js"); throw new Error("CaptureActionRuntime is unavailable."); }

  // ── Pure capture core (no vault, no network) ──────────────────────────
  function pad2(value) { return String(value).padStart(2, "0"); }
  function localDateKey(now) { const d = now instanceof Date ? now : new Date(now); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function localClock(now) { const d = now instanceof Date ? now : new Date(now); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  function thoughtLine(content, now) { const single = String(content == null ? "" : content).replace(/\s+/g, " ").trim(); return `- ${localClock(now)} ${single}`; }
  function appendThoughtLine(existing, line) { const current = String(existing == null ? "" : existing); if (!current) return `${line}\n`; return current.endsWith("\n") ? `${current}${line}\n` : `${current}\n${line}\n`; }
  function sanitizeTitle(raw) {
    const title = String(raw == null ? "" : raw)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/-{3,}/g, "--")
      .replace(/\s+/g, " ")
      .replace(/[.\s]+$/g, "")
      .replace(/^[.\s]+/g, "")
      .trim() || "새 자료";
    return title.slice(0, 80);
  }
  function deriveTitle(content) {
    const first = String(content == null ? "" : content).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    return sanitizeTitle(first.slice(0, 40));
  }
  function materialMarkdown(title, content) { return `# ${title}\n\n${String(content == null ? "" : content).trim()}\n`; }
  function inboxTitleTaken(app, title) {
    const target = `${INBOX_FOLDER}/${title}.md`.toLowerCase();
    if (typeof app.vault.getMarkdownFiles === "function") {
      return app.vault.getMarkdownFiles().some((mark) => mark && typeof mark.path === "string" && mark.path.toLowerCase() === target);
    }
    return Boolean(app.vault.getAbstractFileByPath(target));
  }
  function uniqueInboxTitle(app, title) {
    if (!inboxTitleTaken(app, title)) return title;
    for (let index = 2; index <= 99; index += 1) {
      const candidate = `${title} ${index}`;
      if (!inboxTitleTaken(app, candidate)) return candidate;
    }
    throw new Error("같은 제목의 자료가 너무 많습니다.");
  }
  async function ensureVaultFolder(app, folder) {
    if (app.vault.getAbstractFileByPath(folder)) return;
    if (typeof app.vault.createFolder !== "function") throw new Error(`폴더를 만들 수 없습니다: ${folder}`);
    await app.vault.createFolder(folder);
  }

  // ── Local-only writers (Obsidian vault API only; no transport) ────────
  async function saveFleetingThought(app, options) {
    const content = String(options && options.content || "").trim();
    if (!content) throw new Error("생각 내용이 비어 있습니다.");
    const now = options && options.now instanceof Date ? options.now : new Date(options && options.now || Date.now());
    const line = thoughtLine(content, now);
    const lifecycleStore = root.KnowledgeFleetingStore;
    if (lifecycleStore && typeof lifecycleStore.saveThought === "function") {
      return lifecycleStore.saveThought(app, { date: localDateKey(now), text: line });
    }
    const filePath = `${FLEETING_FOLDER}/${localDateKey(now)}.md`;
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file) {
      const current = await app.vault.read(file);
      await app.vault.modify(file, appendThoughtLine(current, line));
    } else {
      await ensureVaultFolder(app, FLEETING_FOLDER);
      await app.vault.create(filePath, `${line}\n`);
    }
    return Object.freeze({ path: filePath, line, created: !file });
  }

  async function saveMaterial(app, options) {
    const content = String(options && options.content || "").trim();
    if (!content) throw new Error("자료 내용이 비어 있습니다.");
    const title = sanitizeTitle(options && options.title || deriveTitle(content));
    const unique = uniqueInboxTitle(app, title);
    const filePath = `${INBOX_FOLDER}/${unique}.md`;
    await ensureVaultFolder(app, INBOX_FOLDER);
    const created = await app.vault.create(filePath, materialMarkdown(unique, content));
    return Object.freeze({ path: filePath, title: unique, file: created });
  }

  // ── Presentation (tokens only; no raw color literals) ─────────────────
  function ensureQuickCaptureStyles() {
    if (typeof document === "undefined" || !document.head || typeof document.createElement !== "function") return;
    const styleId = "prodigy-quick-capture-styles";
    if (typeof document.getElementById === "function" && document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      ".quick-capture-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ke-space-2,8px);padding-block:var(--ke-space-2,8px);border-block-end:1px solid var(--ke-color-border,var(--background-modifier-border));word-break:keep-all;overflow-wrap:anywhere}",
      ".quick-capture-label{color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label,0.72rem);flex:0 0 auto}",
      ".quick-capture-row button{min-block-size:var(--ke-touch-target,44px);padding-inline:var(--ke-space-3,12px);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control,8px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));font-size:var(--ke-type-label,0.72rem)}",
      ".quick-capture-row button:focus-visible{outline:2px solid var(--ke-color-interactive,var(--text-accent));outline-offset:2px}",
      ".quick-capture-row button[disabled]{opacity:.5;cursor:not-allowed}",
      ".quick-capture-editor{display:flex;flex-direction:column;gap:var(--ke-space-2,8px);inline-size:100%;max-inline-size:100%}",
      ".quick-capture-editor[hidden]{display:none}",
      ".quick-capture-title,.quick-capture-input{inline-size:100%;max-inline-size:100%;min-block-size:var(--ke-touch-target,44px);box-sizing:border-box;padding:var(--ke-space-2,8px);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control,8px);background:var(--ke-color-surface,var(--background-primary));color:var(--ke-color-text,var(--text-normal));font-size:var(--ke-type-body,0.84rem);word-break:keep-all;overflow-wrap:anywhere}",
      ".quick-capture-input{min-block-size:calc(var(--ke-touch-target,44px) * 2)}",
      ".quick-capture-title:focus-visible,.quick-capture-input:focus-visible{outline:2px solid var(--ke-color-interactive,var(--text-accent));outline-offset:2px}",
      ".quick-capture-actions{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,8px)}",
      ".quick-capture-status{color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label,0.72rem);overflow-wrap:anywhere}",
      "@media(forced-colors:active){.quick-capture-row button:focus-visible,.quick-capture-title:focus-visible,.quick-capture-input:focus-visible{outline-color:Highlight}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function setElText(element, value) {
    if (typeof element.setText === "function") element.setText(value);
    else if (element.textContent !== undefined) element.textContent = value;
    else element.text = value;
  }
  function setElAttr(element, name, value) {
    if (typeof element.setAttr === "function") element.setAttr(name, value);
    else if (typeof element.setAttribute === "function") element.setAttribute(name, value);
    else if (element.attributes) element.attributes[name] = value;
  }

  /** Mount the compact two-action capture row under an explicit trusted-interaction scope. */
  function mountQuickCapture(options) {
    const opts = options || {};
    const app = opts.app;
    const container = opts.container;
    if (!app || !app.vault || !container || typeof container.createEl !== "function") throw new Error("Quick Capture requires app and container.");
    const sessionId = String(opts.sessionId || "quick-capture");
    const notify = typeof opts.notify === "function" ? opts.notify : null;
    ensureQuickCaptureStyles();
    if (container.__prodigyQuickCapture && typeof container.__prodigyQuickCapture.dispose === "function") container.__prodigyQuickCapture.dispose();

    const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
    const owner = runtime().mountTrustedInteractions({ root: container, document: doc, scope: opts.scope || null, session_id: sessionId });

    const row = container.createEl("div", { attr: { class: "quick-capture-row", role: "group", "aria-label": "빠른 캡처" } });
    row.createEl("div", { text: "빠른 캡처", attr: { class: "quick-capture-label" } });
    const makeTrigger = (action, label, title) => {
      const trigger = row.createEl("button", { text: label, attr: { type: "button", class: "quick-capture-trigger", "data-quick-capture-action": action, "aria-label": label, title } });
      trigger.onclick = () => openEditor(action);
      return trigger;
    };
    const thoughtTrigger = makeTrigger("thought", "생각 저장", "생각을 한 줄로 저장합니다.");
    const materialTrigger = makeTrigger("material", "자료 넣기", "자료를 붙여 넣어 INBOX로 보냅니다.");
    const editor = row.createEl("div", { attr: { class: "quick-capture-editor", role: "group", "aria-label": "빠른 캡처 입력", hidden: true } });
    const titleInput = editor.createEl("input", { attr: { type: "text", class: "quick-capture-title", "aria-label": "자료 제목 (선택)", placeholder: "제목 (선택)" } });
    const textInput = editor.createEl("textarea", { attr: { class: "quick-capture-input", "aria-label": "캡처 내용", placeholder: "캡처할 내용" } });
    const actionsRow = editor.createEl("div", { attr: { class: "quick-capture-actions" } });
    const saveButton = actionsRow.createEl("button", { text: "저장", attr: { type: "button", class: "quick-capture-save", "aria-label": "저장" } });
    const cancelButton = actionsRow.createEl("button", { text: "취소", attr: { type: "button", class: "quick-capture-cancel", "aria-label": "취소" } });
    const status = row.createEl("div", { attr: { class: "quick-capture-status", role: "status" } });

    let mode = null;
    let saving = false;
    const inputValue = () => String(textInput.value == null ? "" : textInput.value);
    const syncSave = () => { saveButton.disabled = !inputValue().trim(); };
    const setExpanded = (trigger, expanded) => setElAttr(trigger, "aria-expanded", String(expanded));
    const showStatus = (message) => setElText(status, message);
    const focusTrigger = (previous) => { const trigger = previous === "material" ? materialTrigger : thoughtTrigger; if (typeof trigger.focus === "function") trigger.focus(); };
    const closeEditor = () => {
      mode = null;
      editor.hidden = true;
      titleInput.value = "";
      textInput.value = "";
      setElText(status, "");
      syncSave();
      setExpanded(thoughtTrigger, false);
      setExpanded(materialTrigger, false);
    };
    const openEditor = (nextMode) => {
      mode = nextMode;
      titleInput.hidden = nextMode !== "material";
      setElAttr(textInput, "aria-label", nextMode === "thought" ? "생각 내용" : "자료 내용");
      editor.hidden = false;
      setExpanded(thoughtTrigger, nextMode === "thought");
      setExpanded(materialTrigger, nextMode === "material");
      setElText(status, "");
      syncSave();
      if (typeof textInput.focus === "function") textInput.focus();
    };
    const gate = () => runtime().humanConfirmation(mode === "material" ? ACTION_ADD_MATERIAL : ACTION_SAVE_THOUGHT, sessionId);
    const performSave = async () => {
      if (saving || !mode || !inputValue().trim()) return;
      try { gate(); } catch (_intentError) { showStatus("신뢰된 입력이 필요합니다."); return; }
      saving = true;
      saveButton.disabled = true;
      try {
        const savedMode = mode;
        let receipt;
        if (savedMode === "thought") receipt = await saveFleetingThought(app, { content: inputValue(), now: typeof opts.now === "function" ? opts.now() : new Date() });
        else receipt = await saveMaterial(app, { title: titleInput.value, content: inputValue() });
        closeEditor();
        showStatus(`저장됨: ${receipt.path}`);
        if (notify) notify(`저장됨: ${receipt.path}`);
        if (typeof opts.onSaved === "function") opts.onSaved(Object.freeze({ mode: savedMode, receipt }));
      } catch (error) {
        showStatus(String(error && error.message || error));
      } finally {
        saving = false;
        syncSave();
      }
    };
    textInput.onkeydown = (event) => {
      if (!event) return;
      if (event.key === "Escape") { if (typeof event.preventDefault === "function") event.preventDefault(); const previous = mode; closeEditor(); focusTrigger(previous); return; }
      if (mode === "thought" && event.key === "Enter") { if (typeof event.preventDefault === "function") event.preventDefault(); performSave(); }
    };
    titleInput.onkeydown = (event) => {
      if (event && event.key === "Escape") { if (typeof event.preventDefault === "function") event.preventDefault(); const previous = mode; closeEditor(); focusTrigger(previous); }
    };
    const onInput = () => { syncSave(); };
    textInput.oninput = onInput;
    titleInput.oninput = onInput;
    saveButton.onclick = () => performSave();
    cancelButton.onclick = () => { const previous = mode; closeEditor(); focusTrigger(previous); };

    closeEditor();
    const handle = Object.freeze({
      sessionId,
      row,
      dispose() {
        if (container.__prodigyQuickCapture === handle) delete container.__prodigyQuickCapture;
        owner.dispose();
        if (typeof row.remove === "function") row.remove();
      }
    });
    container.__prodigyQuickCapture = handle;
    return handle;
  }

  const api = Object.freeze({
    implementation_version: "quick_capture_v1",
    FLEETING_FOLDER, INBOX_FOLDER,
    localDateKey, localClock, thoughtLine, appendThoughtLine, sanitizeTitle, deriveTitle, materialMarkdown, uniqueInboxTitle,
    saveFleetingThought, saveMaterial, mountQuickCapture
  });
  root.QuickCaptureView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
