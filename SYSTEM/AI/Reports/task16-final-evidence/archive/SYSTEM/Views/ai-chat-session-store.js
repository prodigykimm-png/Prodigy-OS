(function (root) {
  "use strict";

  const VERSION = 1;
  const MAX_MESSAGES = 30;
  const MAX_BYTES = 64 * 1024;

  if (typeof require === "function" && !root.ProdigyWorkspaceStateStore) {
    root.ProdigyWorkspaceStateStore = require("./prodigy-workspace-state-store.js");
  }
  const workspaceStore = root.ProdigyWorkspaceStateStore && root.ProdigyWorkspaceStateStore.WorkspaceStateStore;
  if (!workspaceStore || !workspaceStore.KEYS) throw new Error("WorkspaceStateStore must load before ChatSessionStore.");
  const KEY = workspaceStore.KEYS.chat;

  function byteLength(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(value, "utf8");
    return unescape(encodeURIComponent(value)).length;
  }

  function cleanMessage(message) {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.body !== "string") {
      throw new Error("대화 메시지 형식이 올바르지 않습니다.");
    }
    const clean = { role: message.role, body: message.body };
    if (Array.isArray(message.citations)) clean.citations = message.citations.map(String);
    return clean;
  }

  class ChatSessionStore {
    constructor(options) {
      const opts = options || {};
      if (Object.prototype.hasOwnProperty.call(opts, "sessionStorage")) this.storage = opts.sessionStorage;
      else {
        try { this.storage = root.sessionStorage || null; } catch (_error) { this.storage = null; }
      }
      this.memoryRaw = null;
    }

    readRaw() {
      if (this.storage && typeof this.storage.getItem === "function") {
        try {
          const stored = this.storage.getItem(KEY);
          if (stored) return stored;
        } catch (_error) { /* memory fallback */ }
      }
      return this.memoryRaw;
    }

    getMessages() {
      const raw = this.readRaw();
      if (!raw) return [];
      try {
        const value = JSON.parse(raw);
        if (!value || value.version !== VERSION || !Array.isArray(value.messages)) throw new Error("invalid chat state");
        return value.messages.map(cleanMessage);
      } catch (_error) {
        this.clear();
        return [];
      }
    }

    persist(messages) {
      const retained = messages.map(cleanMessage);
      while (retained.length > MAX_MESSAGES) retained.shift();
      let raw = JSON.stringify({ version: VERSION, messages: retained });
      while (byteLength(raw) > MAX_BYTES && retained.length) {
        retained.shift();
        raw = JSON.stringify({ version: VERSION, messages: retained });
      }
      try {
        if (!this.storage || typeof this.storage.setItem !== "function") throw new Error("sessionStorage unavailable");
        this.storage.setItem(KEY, raw);
        this.memoryRaw = null;
      } catch (_error) {
        this.memoryRaw = raw;
      }
      return retained.map(cleanMessage);
    }

    appendMessage(message) {
      return this.persist(this.getMessages().concat(cleanMessage(message)));
    }

    clear() {
      this.memoryRaw = null;
      try {
        if (this.storage && typeof this.storage.removeItem === "function") this.storage.removeItem(KEY);
      } catch (_error) { /* memory fallback already cleared */ }
    }

    close() { this.clear(); }
  }

  ChatSessionStore.KEY = KEY;
  ChatSessionStore.VERSION = VERSION;
  ChatSessionStore.MAX_MESSAGES = MAX_MESSAGES;
  ChatSessionStore.MAX_BYTES = MAX_BYTES;
  const api = Object.freeze({ ChatSessionStore });
  root.AIChatSessionStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
