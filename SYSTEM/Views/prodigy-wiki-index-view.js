(function (root) {
  "use strict";

  const indexApi = root.ProdigyWikiIndex
    || (typeof require === "function" ? require("./prodigy-wiki-index.js") : null);
  if (!indexApi || typeof indexApi.queryReviewedIndex !== "function") {
    throw new Error("ProdigyWikiIndex is required.");
  }

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freeze(child)]),
    ));
  }
  function empty(element) {
    if (typeof element.empty === "function") element.empty();
    else while (element.firstChild) element.removeChild(element.firstChild);
  }
  function create(parent, tag, text, attrs = {}) {
    if (typeof parent.createEl === "function") {
      return parent.createEl(tag, { text, attr: attrs });
    }
    const element = parent.ownerDocument.createElement(tag);
    if (text) element.textContent = text;
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    parent.appendChild(element);
    return element;
  }
  function createDiv(parent, attrs = {}) {
    return typeof parent.createDiv === "function"
      ? parent.createDiv({ attr: attrs }) : create(parent, "div", "", attrs);
  }
  function mount(options = {}) {
    if (!options.container) throw new TypeError("container_required");
    let index = options.index;
    let state = {
      mode: "current",
      query: "",
      term: "",
      result: indexApi.queryReviewedIndex(index, {}),
    };
    const section = create(options.container, "section", "", {
      "data-surface": "prodigy-wiki-reviewed-index",
      "data-product": "prodigy-wiki",
      "data-trust-tier": "prodigy_reviewed",
    });

    function apply(patch = {}) {
      state = {
        ...state,
        ...patch,
      };
      state.result = indexApi.queryReviewedIndex(index, {
        mode: state.mode,
        query: state.query,
        term: state.term,
      });
      render();
      return state;
    }
    function render() {
      empty(section);
      create(section, "h3", "내 Prodigy Wiki", {});
      create(section, "p", "확인 완료한 문서만 모았습니다. 정식 Knowledge와는 별도로 보존됩니다.", {
        "data-reviewed-wiki-boundary": "non-canonical",
      });
      const counts = index && index.counts || { current: 0, stale: 0, history: 0, total: 0 };
      create(section, "output", `현재 ${counts.current} · 갱신 필요 ${counts.stale} · 이전 버전 ${counts.history}`, {
        "data-reviewed-wiki-counts": "",
        role: "status",
      });
      const search = create(section, "input", "", {
        type: "search",
        placeholder: "검토한 Wiki 검색",
        "aria-label": "검토한 Prodigy Wiki 검색",
        "data-action": "search-reviewed-wiki",
      });
      search.value = state.query;
      search.oninput = () => apply({ query: String(search.value || "") });

      const modeRow = createDiv(section, { "data-reviewed-wiki-modes": "" });
      [
        ["current", "현재"],
        ["stale", "갱신 필요"],
        ["history", "이전 버전"],
      ].forEach(([mode, label]) => {
        const button = create(modeRow, "button", label, {
          type: "button",
          "data-action": "filter-reviewed-wiki-mode",
          "data-mode": mode,
          "aria-pressed": String(state.mode === mode),
        });
        button.onclick = () => apply({ mode });
      });

      const groups = createDiv(section, { "data-reviewed-wiki-groups": "" });
      const all = create(groups, "button", "전체 주제", {
        type: "button",
        "data-action": "filter-reviewed-wiki-term",
        "data-term": "",
        "aria-pressed": String(!state.term),
      });
      all.onclick = () => apply({ term: "" });
      for (const group of index && index.groups || []) {
        const button = create(groups, "button", `${group.term} ${group.artifact_ids.length}`, {
          type: "button",
          "data-action": "filter-reviewed-wiki-term",
          "data-term": group.term,
          "aria-pressed": String(state.term === group.term),
        });
        button.onclick = () => apply({ term: group.term });
      }

      const results = createDiv(section, { "data-reviewed-wiki-results": "" });
      if (!state.result || state.result.rows.length === 0) {
        create(results, "p", state.query || state.term ? "조건에 맞는 검토 문서가 없습니다." : "표시할 검토 문서가 없습니다.", {
          "data-reviewed-wiki-empty": "",
        });
        return;
      }
      for (const row of state.result.rows) {
        const article = create(results, "article", "", {
          "data-reviewed-wiki-row": row.artifact_id,
          "data-reviewed-wiki-lifecycle": row.lifecycle,
          "data-trust-tier": row.trust_tier,
        });
        create(article, "h4", row.title, {});
        create(article, "p", row.lifecycle === "stale"
          ? "원문이 변경되어 다시 확인해야 합니다."
          : row.lifecycle === "history" ? "새 검토 버전으로 대체된 이전 문서입니다."
            : `${row.source_title} · 확인 완료`, {
          "data-reviewed-wiki-status": row.lifecycle,
        });
        if (row.index_terms.length) {
          create(article, "p", row.index_terms.join(" · "), {
            "data-reviewed-wiki-terms": "",
          });
        }
        const actions = createDiv(article, { "data-reviewed-wiki-actions": "" });
        const openDocument = create(actions, "button", "Wiki 열기", {
          type: "button",
          "data-action": "open-reviewed-wiki",
          "data-primary": "true",
        });
        openDocument.onclick = () => typeof options.onOpenDocument === "function"
          && options.onOpenDocument(row.document_path, row);
        const openSource = create(actions, "button", "원문 열기", {
          type: "button",
          "data-action": "open-reviewed-source",
        });
        openSource.onclick = () => typeof options.onOpenSource === "function"
          && options.onOpenSource(row.source_path, row);
        const citations = [...new Map((row.navigation_manifest.sections || [])
          .flatMap((sourceSection) => sourceSection.citations || [])
          .map((citation) => [citation.citation_id, citation])).values()];
        citations.forEach((citation, citationIndex) => {
          const button = create(actions, "button", `근거 ${citationIndex + 1}`, {
            type: "button",
            "data-action": "open-reviewed-citation",
            "data-citation-id": citation.citation_id,
          });
          button.onclick = () => typeof options.onOpenCitation === "function"
            && options.onOpenCitation(citation, row);
        });
      }
    }

    render();
    return freeze({
      update(nextIndex) {
        index = nextIndex;
        return apply();
      },
      setQuery(query) {
        return apply({ query: String(query || "") });
      },
      setMode(mode) {
        return apply({ mode: indexApi.MODES.includes(mode) ? mode : "current" });
      },
      setTerm(term) {
        return apply({ term: String(term || "") });
      },
      getState() {
        return freeze(clone(state));
      },
      destroy() {
        if (typeof section.remove === "function") section.remove();
      },
    });
  }

  const api = freeze({ mount });
  root.ProdigyWikiIndexView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
