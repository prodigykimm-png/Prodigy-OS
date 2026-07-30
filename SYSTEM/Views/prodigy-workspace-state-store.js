(function (root) {
  "use strict";

  const KEYS = Object.freeze({
    workspace: "prodigy.ui.workspace-state.v1",
    scroll: "prodigy.ui.scroll-state.v1",
    chat: "prodigy.ai.chat-session.v1"
  });
  const VERSION = 1;
  const FORBIDDEN_UI_KEYS = /^(body|message|messages|prompt|transcript|citations?)$/i;
  let memoryChat = null;

  function storageFrom(options, name) {
    if (Object.prototype.hasOwnProperty.call(options, name)) return options[name];
    try { return root[name] || null; } catch (_error) { return null; }
  }

  function read(storage, key, fallback) {
    if (!storage || typeof storage.getItem !== "function") return fallback;
    try {
      const raw = storage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      if (!value || value.version !== VERSION) throw new Error("invalid schema");
      return value;
    } catch (_error) {
      try { storage.removeItem(key); } catch (_removeError) { /* unavailable storage */ }
      return fallback;
    }
  }

  function write(storage, key, value) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_error) { return false; }
  }

  function cleanValue(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.map(cleanValue).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return undefined;
    const copy = {};
    Object.keys(value).forEach((key) => {
      if (FORBIDDEN_UI_KEYS.test(key)) return;
      const cleaned = cleanValue(value[key]);
      if (cleaned !== undefined) copy[key] = cleaned;
    });
    return copy;
  }

  function cleanWorkspace(value) {
    const source = value && typeof value === "object" ? value : {};
    const clean = {};
    if (typeof source.activeTab === "string") clean.activeTab = source.activeTab;
    if (source.filters && typeof source.filters === "object") clean.filters = cleanValue(source.filters);
    if (typeof source.sort === "string" || (source.sort && typeof source.sort === "object")) clean.sort = cleanValue(source.sort);
    if (typeof source.density === "string") clean.density = source.density;
    return clean;
  }

  function cleanUiState(value) {
    const source = value && typeof value === "object" ? value : {};
    const workspaces = {};
    if (source.workspaces && typeof source.workspaces === "object") {
      Object.keys(source.workspaces).forEach((id) => { workspaces[id] = cleanWorkspace(source.workspaces[id]); });
    }
    return {
      version: VERSION,
      activeWorkspace: typeof source.activeWorkspace === "string" ? source.activeWorkspace : "",
      workspaces
    };
  }

  class WorkspaceStateStore {
    constructor(options) {
      const opts = options || {};
      this.localStorage = storageFrom(opts, "localStorage");
      this.sessionStorage = storageFrom(opts, "sessionStorage");
      this.state = cleanUiState(read(this.localStorage, KEYS.workspace, null));
    }

    getState() { return cleanUiState(this.state); }
    getActiveWorkspace() { return this.state.activeWorkspace || ""; }

    setActiveWorkspace(workspaceId) {
      this.state.activeWorkspace = String(workspaceId || "");
      this.persist();
      return this.getActiveWorkspace();
    }

    getWorkspaceState(workspaceId) {
      return cleanWorkspace(this.state.workspaces[String(workspaceId || "")] || {});
    }

    setWorkspaceState(workspaceId, patch) {
      const id = String(workspaceId || "");
      if (!id) return {};
      this.state.workspaces[id] = cleanWorkspace(Object.assign({}, this.state.workspaces[id], patch || {}));
      this.persist();
      return this.getWorkspaceState(id);
    }

    clearWorkspaceState(workspaceId) {
      delete this.state.workspaces[String(workspaceId || "")];
      this.persist();
    }

    persist() {
      this.state = cleanUiState(this.state);
      write(this.localStorage, KEYS.workspace, this.state);
    }

    setScrollPosition(workspaceId, regionId, position) {
      const state = read(this.sessionStorage, KEYS.scroll, { version: VERSION, positions: {} });
      const id = String(workspaceId || "");
      const region = String(regionId || "main");
      if (!state.positions || typeof state.positions !== "object") state.positions = {};
      if (!state.positions[id] || typeof state.positions[id] !== "object") state.positions[id] = {};
      state.positions[id][region] = Number.isFinite(Number(position)) ? Number(position) : 0;
      write(this.sessionStorage, KEYS.scroll, state);
      return state.positions[id][region];
    }

    getScrollPosition(workspaceId, regionId) {
      const state = read(this.sessionStorage, KEYS.scroll, { version: VERSION, positions: {} });
      const value = state.positions && state.positions[String(workspaceId || "")] && state.positions[String(workspaceId || "")][String(regionId || "main")];
      return Number.isFinite(value) ? value : 0;
    }

    clearScrollState() {
      try { if (this.sessionStorage) this.sessionStorage.removeItem(KEYS.scroll); } catch (_error) { /* unavailable storage */ }
    }

    setChatSession(session) {
      const value = { version: VERSION, session: session === undefined ? null : session };
      if (!write(this.sessionStorage, KEYS.chat, value)) memoryChat = value;
      return value.session;
    }

    getChatSession() {
      const stored = read(this.sessionStorage, KEYS.chat, null);
      return stored ? stored.session : (memoryChat ? memoryChat.session : null);
    }

    clearChatSession() {
      memoryChat = null;
      try { if (this.sessionStorage) this.sessionStorage.removeItem(KEYS.chat); } catch (_error) { /* unavailable storage */ }
    }
  }

  WorkspaceStateStore.KEYS = KEYS;
  WorkspaceStateStore.VERSION = VERSION;
  const api = Object.freeze({ WorkspaceStateStore });
  root.ProdigyWorkspaceStateStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
