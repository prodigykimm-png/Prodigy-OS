(function (root) {
  "use strict";

  function contextPath(value) {
    return String(value == null ? "" : value)
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .trim()
      .replace(/\\/g, "/");
  }

  function create(options) {
    const opts = options || {};
    const core = opts.core;
    if (!core || typeof core.buildPeopleWorkspaceModel !== "function") {
      throw new Error("People 작업면 모델에는 PeopleCore가 필요합니다.");
    }

    let model = opts.model || core.buildPeopleWorkspaceModel([], [], {});
    let rawPeople = Array.isArray(opts.rawPeople) ? opts.rawPeople : null;
    let sourcePages = Array.isArray(opts.sourcePages) ? opts.sourcePages : null;
    let bodiesHydrated = false;
    const readState = Object.create(null);
    const onReadStateChange = typeof opts.onReadStateChange === "function" ? opts.onReadStateChange : null;

    function notifyReadState(phase, path) {
      if (onReadStateChange) onReadStateChange({ phase, path: contextPath(path), state: readState[contextPath(path)] || null });
    }

    function sourceByPath() {
      const map = Object.create(null);
      (sourcePages || []).forEach((page) => {
        const path = contextPath(page && page.path);
        if (path) map[path] = page;
      });
      return map;
    }

    function enrich(nextModel) {
      const sources = sourceByPath();
      const enrichPerson = (person) => {
        const linked = (person.linked_all || person.recent_context || [])
          .map((item) => opts.typedKnowledgeRow(item, sources[contextPath(item && item.path)]) || item);
        return Object.assign({}, person, {
          linked_all: linked,
          recent_context: linked.slice(0, 3),
          read_state: readState[contextPath(person.path)] || null
        });
      };
      const people = (nextModel.people || []).map(enrichPerson);
      const all = Array.isArray(nextModel._all) ? nextModel._all.map(enrichPerson) : nextModel._all;
      return Object.assign({}, nextModel, { people, _all: all });
    }

    function rebuild(state) {
      if (rawPeople) {
        model = enrich(core.buildPeopleWorkspaceModel(rawPeople, sourcePages || [], {
          query: state.query,
          filter: state.filter,
          sort: state.sort,
          maxPreview: 3
        }));
      } else if (opts.model) {
        const base = opts.allPeople || opts.model.people || [];
        const full = opts.allPeople || model._all || base;
        const filtered = core.filterPeopleList(full, { query: state.query, filter: state.filter });
        const sorted = core.sortPeopleList(filtered, { sort: state.sort });
        model = enrich({
          people: sorted,
          total: full.length,
          shown: sorted.length,
          query: state.query,
          filter: state.filter,
          sort: state.sort,
          filters: core.WORKSPACE_FILTERS,
          sorts: core.WORKSPACE_SORTS,
          empty: full.length === 0,
          no_match: full.length > 0 && sorted.length === 0,
          _all: full
        });
      }
      return model;
    }

    async function readPersonBody(row, options) {
      const path = contextPath(row && row.path);
      const app = opts.app;
      if (!path || !app || !app.vault) return false;
      if (!options || options.announceLoading !== false) {
        readState[path] = { status: "loading", error: "" };
        notifyReadState("loading", path);
      }
      try {
        const file = typeof app.vault.getAbstractFileByPath === "function"
          ? app.vault.getAbstractFileByPath(path)
          : null;
        if (!file) throw new Error("사람 노트를 찾을 수 없습니다.");
        const text = typeof app.vault.cachedRead === "function"
          ? await app.vault.cachedRead(file)
          : await app.vault.read(file);
        row.body = String(text == null ? "" : text);
        readState[path] = { status: row.body.length ? "success" : "empty", error: "" };
        if (!options || options.announceSettled !== false) notifyReadState(readState[path].status, path);
        return true;
      } catch (error) {
        readState[path] = {
          status: "error",
          error: String(error && (error.message || error) || "본문을 읽지 못했습니다.")
        };
        if (!options || options.announceSettled !== false) notifyReadState("error", path);
        return false;
      }
    }

    async function hydrate() {
      const app = opts.app;
      if (bodiesHydrated || !rawPeople || !app || !app.vault) return false;
      if (typeof core.extractMemoLines !== "function") return false;
      let changed = false;
      const pending = [];
      for (const row of rawPeople) {
        if (!row || !row.path) continue;
        const path = contextPath(row.path);
        if (String(row.body || "").length > 0 && !readState[path]) {
          readState[path] = { status: "success", error: "" };
          continue;
        }
        pending.push(row);
        readState[path] = { status: "loading", error: "" };
      }
      if (pending.length) notifyReadState("loading", "");
      for (const row of pending) {
        const path = contextPath(row.path);
        const before = readState[path] && readState[path].status;
        await readPersonBody(row, { announceLoading: false, announceSettled: false });
        const after = readState[path] && readState[path].status;
        if (before !== after || after === "success") changed = true;
      }
      bodiesHydrated = true;
      if (pending.length) notifyReadState("settled", "");
      return changed;
    }

    async function retry(path) {
      const target = (rawPeople || []).find((row) => contextPath(row && row.path) === contextPath(path));
      if (!target) return false;
      bodiesHydrated = false;
      const result = await readPersonBody(target);
      bodiesHydrated = true;
      return result;
    }

    function setData(nextRawPeople, nextSourcePages) {
      if (Array.isArray(nextRawPeople)) rawPeople = nextRawPeople;
      if (Array.isArray(nextSourcePages)) sourcePages = nextSourcePages;
      bodiesHydrated = false;
    }

    return Object.freeze({
      rebuild,
      hydrate,
      retry,
      setData,
      getModel: () => model,
      getRawPeople: () => rawPeople,
      getSourcePages: () => sourcePages,
      getReadState: (path) => readState[contextPath(path)] || null
    });
  }

  const api = Object.freeze({ create });
  root.PeopleWorkspaceModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
