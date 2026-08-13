(function (root) {
  "use strict";

  var RESIZE_MIN = 320;
  var RESIZE_MAX_RATIO = 0.52;
  var RESIZE_MAX_PX = 640;
  var OPEN_WIDTH_RATIO = 0.38;
  var OPEN_WIDTH_PX = 420;

  var ADAPTER_MAP = Object.freeze({
    home: "HomeContextAdapter",
    auction: "AuctionContextAdapter",
    region: "RegionContextAdapter",
    reading: "ReadingContextAdapter",
    project: "ProjectContextAdapter",
    knowledge: "KnowledgeContextAdapter",
    personal: "PeopleContextAdapter",
    journal: "JournalContextAdapter",
    workout: "WorkoutContextAdapter"
  });

  function resolveModule(globalName, relativePath) {
    if (root[globalName]) return root[globalName];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_) { return null; }
    }
    return null;
  }

  function resolveTokens() {
    return resolveModule("ProdigyTokens", "./design-tokens.js");
  }

  function resolveAdapter(workspaceId) {
    var name = ADAPTER_MAP[workspaceId];
    if (!name) return null;
    return resolveModule(name, "./" + workspaceId + "-context-adapter.js");
  }

  function isCompact() {
    if (typeof window === "undefined") return false;
    var tokens = resolveTokens();
    var medium = tokens && tokens.BREAKPOINTS ? tokens.BREAKPOINTS.medium : 768;
    return window.innerWidth < medium;
  }

  function computeOpeningWidth() {
    if (typeof window === "undefined") return OPEN_WIDTH_PX;
    return Math.min(window.innerWidth * OPEN_WIDTH_RATIO, OPEN_WIDTH_PX);
  }

  function clampWidth(width) {
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return computeOpeningWidth();
    var viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
    var minW = RESIZE_MIN;
    var maxW = Math.min(viewportWidth * RESIZE_MAX_RATIO, RESIZE_MAX_PX);
    return Math.max(minW, Math.min(width, maxW));
  }

  function loadWidth(stateStore, workspaceId) {
    if (!stateStore || !workspaceId) return computeOpeningWidth();
    var ws = stateStore.getWorkspaceState(workspaceId);
    if (ws && typeof ws.aiInspectorWidth === "number") return clampWidth(ws.aiInspectorWidth);
    return computeOpeningWidth();
  }

  function saveWidth(stateStore, workspaceId, width) {
    if (!stateStore || !workspaceId) return;
    stateStore.setWorkspaceState(workspaceId, { aiInspectorWidth: clampWidth(width) });
  }

  function setText(el, text) {
    if (!el) return;
    if (typeof el.textContent !== "undefined") el.textContent = String(text || "");
    else if (typeof el.innerText !== "undefined") el.innerText = String(text || "");
  }

  function ensureStyles() {
    if (typeof document === "undefined") return;
    var SHELL_STYLE_ID = "prodigy-ai-inspector-shell-styles";
    var style = document.getElementById(SHELL_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = SHELL_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      ".prodigy-ai-inspector{position:fixed;z-index:900;display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-inline-size:0;max-block-size:min(70vh, 560px);inset:auto 0 0;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px) var(--ke-radius-panel,8px) 0 0;background:var(--background-primary);color:var(--text-normal)}",
      ".prodigy-ai-inspector[hidden]{display:none}",
      ".prodigy-ai-inspector-resize{display:none}",
      ".prodigy-ai-inspector-header{display:flex;align-items:center;justify-content:space-between;gap:var(--ke-space-3,8px);min-block-size:44px;padding-inline:var(--ke-space-3,8px);border-bottom:1px solid var(--background-modifier-border)}",
      ".prodigy-ai-inspector-title{margin:0;font-size:var(--ke-type-title,1.05rem);word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-close{min-block-size:44px}",
      ".prodigy-ai-inspector-body{min-block-size:0;overflow:auto;padding:var(--ke-space-3,8px)}",
      ".prodigy-ai-inspector-message{margin-block-end:var(--ke-space-3,8px);word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-message-role{font-size:var(--ke-type-label,.72rem);color:var(--text-muted);margin-block-end:var(--ke-space-1,2px)}",
      ".prodigy-ai-inspector-message-body{font-size:var(--ke-type-body,.84rem);line-height:1.5}",
      ".prodigy-ai-inspector-citations{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px);margin-block-start:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-citation{display:inline-flex;align-items:center;min-block-size:32px;padding-inline:var(--ke-space-2,4px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-secondary);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);cursor:pointer}",
      ".prodigy-ai-inspector-kind{display:inline-block;font-size:var(--ke-type-label,.72rem);padding-inline:var(--ke-space-2,4px);border-radius:var(--ke-radius-control,4px);margin-inline-end:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-kind-explain{background:var(--background-modifier-hover);color:var(--text-muted)}",
      ".prodigy-ai-inspector-kind-suggest{background:var(--background-modifier-hover);color:var(--ke-color-accent, var(--text-accent))}",
      ".prodigy-ai-inspector-kind-approve{background:var(--background-modifier-hover);color:var(--text-warning)}",
      ".prodigy-ai-inspector-input-area{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);border-top:1px solid var(--background-modifier-border)}",
      ".prodigy-ai-inspector-input-row{display:flex;gap:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-input{flex:1;min-block-size:44px;min-inline-size:0;padding:var(--ke-space-2,4px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);font-size:var(--ke-type-body,.84rem);resize:none}",
      ".prodigy-ai-inspector-send{min-block-size:44px;min-inline-size:44px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}",
      ".prodigy-ai-inspector-send:disabled{opacity:0.5;cursor:not-allowed}",
      ".prodigy-ai-inspector-prompts{display:flex;flex-wrap:wrap;gap:var(--ke-space-2,4px)}",
      ".prodigy-ai-inspector-prompt{min-block-size:32px;padding-inline:var(--ke-space-2,4px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-secondary);color:var(--text-muted);font-size:var(--ke-type-label,.72rem);cursor:pointer;word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-error{display:grid;gap:var(--ke-space-2,4px);padding:var(--ke-space-3,8px);margin:var(--ke-space-3,8px);border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-panel,8px);background:var(--background-secondary);color:var(--text-normal);word-break:keep-all;overflow-wrap:anywhere}",
      ".prodigy-ai-inspector-error-title{color:var(--text-error);font-size:var(--ke-type-title,1.05rem);margin:0}",
      ".prodigy-ai-inspector-error-message{font-size:var(--ke-type-body,.84rem);margin:0}",
      ".prodigy-ai-inspector-error-dismiss{justify-self:start;min-block-size:32px;border:1px solid var(--background-modifier-border);border-radius:var(--ke-radius-control,4px);background:var(--background-primary);color:var(--text-normal);cursor:pointer}",
      ".prodigy-ai-inspector-loading{display:flex;align-items:center;justify-content:center;padding:var(--ke-space-4,12px);color:var(--text-muted);font-size:var(--ke-type-body,.84rem)}",
      ".prodigy-ai-inspector-empty{display:flex;align-items:center;justify-content:center;padding:var(--ke-space-4,12px);color:var(--text-muted);font-size:var(--ke-type-body,.84rem)}",
      "@media(min-width:768px){",
      ".prodigy-ai-inspector{inset:0 0 0 auto;inline-size:min(38%,420px);max-block-size:none;border-radius:0;border-left:1px solid var(--background-modifier-border)}",
      ".prodigy-ai-inspector-resize{display:block;position:absolute;inset:0 auto 0 -3px;inline-size:6px;cursor:col-resize;z-index:1}",
      "}",
      "@media(max-width:767px){",
      ".prodigy-ai-inspector-prompt{min-block-size:44px}",
      ".prodigy-ai-inspector-citation{min-block-size:44px}",
      "}",
      "@media(prefers-reduced-motion:reduce){",
      ".prodigy-ai-inspector *{transition:none!important;animation:none!important;transform:none!important}",
      "}"
    ].join("\n");
  }

  function classifyKind(text) {
    if (typeof text !== "string") return "explain";
    if (/승인\s*필요|승인이\s*필요|검토\s*필요|확인\s*필요|허가\s*필요/i.test(text)) return "approve";
    if (/제안|추천|권장|시도|해보세요|하는\s*것이|하는\s*게|하면\s*어떨까|제안합니다/i.test(text)) return "suggest";
    return "explain";
  }

  function AIInspector(parent, options) {
    ensureStyles();

    var opts = options || {};
    var workspaceId = String(opts.workspaceId || "");
    var app = opts.app || {};
    var stateStore = opts.stateStore || null;
    var providerFn = opts.providerAdapter || null;
    var adapter = opts.contextAdapter || resolveAdapter(workspaceId);

    var inspector = parent.createEl("aside", {
      attr: {
        class: "prodigy-ai-inspector",
        role: "complementary",
        "aria-label": "AI 인스펙터",
        hidden: ""
      }
    });
    inspector.hidden = true;

    var resizeHandle = inspector.createEl("div", {
      attr: { class: "prodigy-ai-inspector-resize" }
    });

    var header = inspector.createEl("header", {
      attr: { class: "prodigy-ai-inspector-header" }
    });
    header.createEl("h2", {
      text: "AI 인스펙터",
      attr: { class: "prodigy-ai-inspector-title" }
    });
    var closeButton = header.createEl("button", {
      text: "닫기",
      attr: { type: "button", class: "prodigy-btn prodigy-ai-inspector-close" }
    });

    var bodyEl = inspector.createEl("div", {
      attr: { class: "prodigy-ai-inspector-body" }
    });
    var transcriptEl = bodyEl.createEl("div", {
      attr: { class: "prodigy-ai-inspector-transcript" }
    });

    var inputArea = inspector.createEl("div", {
      attr: { class: "prodigy-ai-inspector-input-area" }
    });

    var promptsEl = inputArea.createEl("div", {
      attr: { class: "prodigy-ai-inspector-prompts" }
    });

    var inputRow = inputArea.createEl("div", {
      attr: { class: "prodigy-ai-inspector-input-row" }
    });
    var inputEl = inputRow.createEl("textarea", {
      attr: {
        class: "prodigy-ai-inspector-input",
        placeholder: "질문을 입력하세요...",
        rows: "2"
      }
    });
    var sendButton = inputRow.createEl("button", {
      text: "전송",
      attr: { type: "button", class: "prodigy-ai-inspector-send" }
    });

    var isOpenFlag = false;
    var chatStore = null;
    var currentWidth = computeOpeningWidth();
    var resizeStartX = 0;
    var resizeStartWidth = 0;
    var isResizing = false;
    var touchStartY = 0;
    var touchStartTime = 0;

    function initChatStore() {
      if (chatStore) return;
      var mod = resolveModule("AIChatSessionStore", "./ai-chat-session-store.js");
      if (mod && typeof mod.ChatSessionStore === "function") {
        chatStore = new mod.ChatSessionStore({});
      }
    }

    function clearTranscriptDom() {
      while (transcriptEl.firstChild) transcriptEl.removeChild(transcriptEl.firstChild);
    }

    function renderPrompts() {
      while (promptsEl.firstChild) promptsEl.removeChild(promptsEl.firstChild);
      if (!adapter || !Array.isArray(adapter.PROMPTS)) return;
      adapter.PROMPTS.forEach(function (prompt) {
        var chip = promptsEl.createEl("button", {
          text: prompt,
          attr: { type: "button", class: "prodigy-ai-inspector-prompt" }
        });
        chip.onclick = function () { sendMessage(prompt); };
      });
    }

    function renderTranscript() {
      clearTranscriptDom();
      if (!chatStore) {
        var empty = transcriptEl.createEl("div", { attr: { class: "prodigy-ai-inspector-empty" } });
        setText(empty, "대화가 아직 없습니다. 질문을 입력하거나 제안을 선택하세요.");
        return;
      }
      var messages = chatStore.getMessages();
      if (!messages.length) {
        var empty = transcriptEl.createEl("div", { attr: { class: "prodigy-ai-inspector-empty" } });
        setText(empty, "대화가 아직 없습니다. 질문을 입력하거나 제안을 선택하세요.");
        return;
      }
      messages.forEach(function (msg) {
        var msgEl = transcriptEl.createEl("div", { attr: { class: "prodigy-ai-inspector-message" } });
        var roleEl = msgEl.createEl("div", { attr: { class: "prodigy-ai-inspector-message-role" } });
        setText(roleEl, msg.role === "user" ? "사용자" : "AI");

        if (msg.role === "assistant") {
          var kind = classifyKind(msg.body);
          var kindEl = msgEl.createEl("span", {
            attr: { class: "prodigy-ai-inspector-kind prodigy-ai-inspector-kind-" + kind }
          });
          var kindLabel = kind === "explain" ? "설명" : kind === "suggest" ? "제안" : "승인 필요";
          setText(kindEl, kindLabel);
        }

        var bodyMsgEl = msgEl.createEl("div", { attr: { class: "prodigy-ai-inspector-message-body" } });
        setText(bodyMsgEl, msg.body);

        if (msg.role === "assistant" && Array.isArray(msg.citations) && msg.citations.length) {
          var citationsEl = msgEl.createEl("div", { attr: { class: "prodigy-ai-inspector-citations" } });
          msg.citations.forEach(function (citation) {
            var citeBtn = citationsEl.createEl("button", {
              attr: { type: "button", class: "prodigy-ai-inspector-citation" }
            });
            setText(citeBtn, citation);
            citeBtn.onclick = function () {
              if (app && app.workspace && typeof app.workspace.openLinkText === "function") {
                app.workspace.openLinkText(citation.replace(/\.md$/i, ""), "", false);
              }
            };
          });
        }
      });
      if (typeof transcriptEl.scrollTo === "function") {
        transcriptEl.scrollTo({ top: transcriptEl.scrollHeight, behavior: "auto" });
      }
    }

    function renderError(message) {
      clearTranscriptDom();
      var errorEl = transcriptEl.createEl("div", {
        attr: { class: "prodigy-ai-inspector-error", role: "alert" }
      });
      var titleEl = errorEl.createEl("h3", { attr: { class: "prodigy-ai-inspector-error-title" } });
      setText(titleEl, "AI 인스펙터를 사용할 수 없습니다");
      var msgEl = errorEl.createEl("p", { attr: { class: "prodigy-ai-inspector-error-message" } });
      setText(msgEl, message || "AI 제공자를 사용할 수 없습니다. 네트워크 연결과 설정을 확인해 주세요.");
      var dismissBtn = errorEl.createEl("button", {
        text: "닫기",
        attr: { type: "button", class: "prodigy-ai-inspector-error-dismiss" }
      });
      dismissBtn.onclick = function () { close(); };
    }

    function renderLoading() {
      clearTranscriptDom();
      var loadingEl = transcriptEl.createEl("div", { attr: { class: "prodigy-ai-inspector-loading" } });
      setText(loadingEl, "응답을 기다리는 중...");
    }

    function sendMessage(message) {
      if (!message || typeof message !== "string" || !message.trim()) return Promise.resolve();
      var text = message.trim();

      initChatStore();
      if (!chatStore) {
        renderError("대화 저장소를 초기화할 수 없습니다.");
        return Promise.resolve();
      }
      if (!adapter) {
        renderError("이 작업공간의 문맥 어댑터를 불러올 수 없습니다.");
        return Promise.resolve();
      }

      chatStore.appendMessage({ role: "user", body: text });
      renderTranscript();

      var contextInput = { workspace: workspaceId, tab: null, selection: null, snapshot: [], citations: [], locale: "ko" };
      if (typeof adapter.buildContext === "function") {
        try { contextInput = adapter.buildContext({}); } catch (_) {}
      }

      var contextEnvelope = null;
      var envelopeApi = resolveModule("AIContextEnvelope", "./ai-context-envelope.js");
      if (envelopeApi && typeof envelopeApi.buildContextEnvelope === "function") {
        try { contextEnvelope = envelopeApi.buildContextEnvelope(contextInput); } catch (_) {}
      }

      renderLoading();
      sendButton.disabled = true;

      var providerPromise;
      if (providerFn) {
        providerPromise = providerFn({ prompt: text, contextEnvelope: contextEnvelope, workspaceId: workspaceId });
      } else {
        var providerService = resolveModule("AIProviderService", "./ai-provider-service.js");
        if (!providerService || typeof providerService.requestChatText !== "function") {
          renderError("AI 제공자 서비스를 사용할 수 없습니다.");
          sendButton.disabled = false;
          return Promise.resolve();
        }
        providerPromise = providerService.requestChatText({
          app: app, provider: opts.provider || {}, prompt: text, contextEnvelope: contextEnvelope
        });
      }

      var chain = providerPromise.then(function (result) {
        var responseText = result && result.text ? result.text : "";
        var citations = result && Array.isArray(result.citations) ? result.citations : [];
        if (contextEnvelope && Array.isArray(contextEnvelope.citations)) {
          citations = citations.filter(function (c) { return contextEnvelope.citations.indexOf(c) >= 0; });
        }
        chatStore.appendMessage({ role: "assistant", body: responseText, citations: citations });
        renderTranscript();
        sendButton.disabled = false;
      }).catch(function (error) {
        var msg = "AI 서비스에 연결할 수 없습니다.";
        if (error && error.message) {
          var errStr = error.message;
          if (/키|key|권한|auth|unauthorized|401|403/i.test(errStr)) msg = "API 키 또는 접근 권한이 올바르지 않습니다.";
          else if (/한도|quota|429|limit|exhausted/i.test(errStr)) msg = "API 사용 한도를 초과했습니다.";
          else if (/네트워크|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(errStr)) msg = "AI 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.";
          else msg = "AI 서비스 응답 중 오류가 발생했습니다.";
        }
        renderError(msg);
        sendButton.disabled = false;
      });

      inputEl.value = "";
      return chain;
    }

    function open() {
      inspector.hidden = false;
      if (typeof inspector.removeAttribute === "function") inspector.removeAttribute("hidden");
      isOpenFlag = true;
      if (!isCompact()) {
        currentWidth = loadWidth(stateStore, workspaceId);
        inspector.style.width = currentWidth + "px";
      } else {
        inspector.style.width = "";
      }
      initChatStore();
      renderPrompts();
      renderTranscript();
      if (typeof closeButton.focus === "function") closeButton.focus();
      if (typeof opts.onOpen === "function") opts.onOpen();
    }

    function close() {
      inspector.hidden = true;
      if (typeof inspector.setAttribute === "function") inspector.setAttribute("hidden", "");
      isOpenFlag = false;
      if (typeof opts.onClose === "function") opts.onClose();
    }

    closeButton.onclick = close;
    sendButton.onclick = function () { sendMessage(inputEl.value); };
    inputEl.onkeydown = function (event) {
      if (event && event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(inputEl.value); }
    };
    inspector.addEventListener("keydown", function (event) { if (event && event.key === "Escape") close(); });

    resizeHandle.addEventListener("mousedown", function (event) {
      if (isCompact() || !event) return;
      event.preventDefault();
      isResizing = true;
      resizeStartX = event.clientX;
      resizeStartWidth = inspector.offsetWidth || currentWidth;
      if (typeof document !== "undefined") { document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }
    });

    if (typeof document !== "undefined") {
      document.addEventListener("mousemove", function (event) {
        if (!isResizing || !event) return;
        var delta = resizeStartX - event.clientX;
        currentWidth = clampWidth(resizeStartWidth + delta);
        inspector.style.width = currentWidth + "px";
      });
      document.addEventListener("mouseup", function () {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        saveWidth(stateStore, workspaceId, currentWidth);
      });
    }

    inspector.addEventListener("touchstart", function (event) {
      if (!isCompact() || !event || !event.touches || !event.touches.length) return;
      touchStartY = event.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    inspector.addEventListener("touchend", function (event) {
      if (!isCompact() || !event || !event.changedTouches || !event.changedTouches.length) return;
      var endY = event.changedTouches[0].clientY;
      var deltaY = endY - touchStartY;
      var deltaTime = Date.now() - touchStartTime;
      if (deltaY > 60 && deltaTime < 500) close();
    });

    return {
      element: inspector, body: transcriptEl, open: open, close: close,
      sendMessage: sendMessage, isOpen: function () { return isOpenFlag; },
      clearTranscript: function () { if (chatStore) chatStore.clear(); clearTranscriptDom(); }
    };
  }

  var api = Object.freeze({ AIInspector: AIInspector });
  root.ProdigyAIInspector = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
