"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const { WorkspaceStateStore } = require(path.join(ROOT, "SYSTEM/Views/prodigy-workspace-state-store.js"));
const KEYS = WorkspaceStateStore.KEYS;

class MemoryStorage {
  constructor(seed) { this.values = new Map(Object.entries(seed || {})); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

// Reload restoration on the same device uses the same localStorage.
const local = new MemoryStorage();
const firstSession = new MemoryStorage();
const first = new WorkspaceStateStore({ localStorage: local, sessionStorage: firstSession });
first.setActiveWorkspace("auction");
first.setWorkspaceState("auction", { activeTab: "review", filters: { status: "active" }, sort: "updated", density: "compact" });
const reloaded = new WorkspaceStateStore({ localStorage: local, sessionStorage: firstSession });
assert.equal(reloaded.getActiveWorkspace(), "auction");
assert.deepEqual(reloaded.getWorkspaceState("auction"), { activeTab: "review", filters: { status: "active" }, sort: "updated", density: "compact" });

// Corrupt JSON is discarded and treated as first run.
const corruptLocal = new MemoryStorage({ [KEYS.workspace]: "{broken" });
const recovered = new WorkspaceStateStore({ localStorage: corruptLocal, sessionStorage: new MemoryStorage() });
assert.deepEqual(recovered.getState(), { version: 1, activeWorkspace: "", workspaces: {} });
assert.equal(corruptLocal.getItem(KEYS.workspace), null);

// Workspace values remain isolated from one another.
reloaded.setWorkspaceState("reading", { activeTab: "queue", filters: { status: "unread" } });
assert.equal(reloaded.getWorkspaceState("auction").activeTab, "review");
assert.equal(reloaded.getWorkspaceState("reading").activeTab, "queue");

// Scroll state expires with sessionStorage and never enters the local UI key.
reloaded.setScrollPosition("auction", "main", 240);
assert.equal(reloaded.getScrollPosition("auction", "main"), 240);
const nextSession = new WorkspaceStateStore({ localStorage: local, sessionStorage: new MemoryStorage() });
assert.equal(nextSession.getScrollPosition("auction", "main"), 0);
assert.equal(JSON.parse(local.getItem(KEYS.workspace)).scroll, undefined);

// Message bodies live only in the AI session key; UI patches cannot smuggle transcript fields.
const body = "비공개 대화 본문";
reloaded.setChatSession({ messages: [{ role: "user", body }] });
reloaded.setWorkspaceState("auction", { messages: [{ body }], filters: { body, status: "active" } });
const uiRaw = local.getItem(KEYS.workspace);
assert.equal(uiRaw.includes(body), false);
assert.equal(firstSession.getItem(KEYS.scroll).includes(body), false);
assert.equal(firstSession.getItem(KEYS.chat).includes(body), true);

// sessionStorage failure keeps chat in memory without leaking it to either UI key.
const unavailable = { getItem() { throw new Error("unavailable"); }, setItem() { throw new Error("unavailable"); }, removeItem() {} };
const memoryOnly = new WorkspaceStateStore({ localStorage: new MemoryStorage(), sessionStorage: unavailable });
memoryOnly.setChatSession({ messages: [{ body }] });
assert.equal(memoryOnly.getChatSession().messages[0].body, body);

console.log("Workspace state store tests passed");
