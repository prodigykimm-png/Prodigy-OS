(function (root) {
  "use strict";

  const states = new Map();

  function idleState() {
    return Object.freeze({ state: "idle", error: null });
  }

  function getState(path) {
    return states.get(String(path || "")) || idleState();
  }

  function consumeState(path) {
    return getState(path);
  }

  function create(options) {
    const opts = options || {};
    if (!opts.app?.vault || !opts.app?.fileManager?.processFrontMatter) {
      throw new TypeError("Project card mutation requires the Obsidian file manager.");
    }
    if (!opts.project || typeof opts.project !== "object") {
      throw new TypeError("Project card mutation requires a live Project object.");
    }
    const path = String(opts.filePath || opts.project.file?.path || opts.project.path || "");
    if (!path) throw new TypeError("Project card mutation requires a Project path.");

    const publish = (state, error) => {
      const snapshot = Object.freeze({ state, error: error || null });
      states.set(path, snapshot);
      if (typeof opts.onState === "function") opts.onState(snapshot);
      return snapshot;
    };

    async function commit(patch) {
      const fields = patch && typeof patch === "object" ? { ...patch } : {};
      const file = opts.app.vault.getAbstractFileByPath(path);
      if (!file) throw new Error("프로젝트 파일을 찾을 수 없습니다.");
      const updated = {
        ...fields,
        updated: typeof opts.today === "function"
          ? opts.today()
          : new Date().toISOString().split("T")[0],
      };

      publish("saving");
      try {
        await opts.app.fileManager.processFrontMatter(file, (frontmatter) => {
          Object.assign(frontmatter, updated);
        });
        Object.assign(opts.project, updated);
        publish("saved");
        if (typeof opts.refresh === "function") await opts.refresh(file);
        return Object.freeze({ file, patch: Object.freeze(updated) });
      } catch (error) {
        publish("error", error);
        throw error;
      }
    }

    return Object.freeze({ commit });
  }

  const api = Object.freeze({ create, getState, consumeState });
  root.ProjectCardMutation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
