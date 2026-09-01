(function (root) {
  "use strict";

  function required(name) {
    const value = root[name];
    if (!value) throw new Error(`${name}을(를) 먼저 불러와야 합니다.`);
    return value;
  }

  function createEl(parent, tag, options) {
    const config = options || {};
    if (parent && typeof parent.createEl === "function") return parent.createEl(tag, config);
    if (!parent || !parent.ownerDocument) throw new Error("Knowledge authoring action mount가 필요합니다.");
    const element = parent.ownerDocument.createElement(tag);
    if (config.text !== undefined) element.textContent = String(config.text);
    Object.entries(config.attr || {}).forEach(([name, value]) => { if (value !== undefined) element.setAttribute(name, value); });
    parent.appendChild(element);
    return element;
  }

  function requestUrl(app) {
    if (typeof root.requestUrl === "function") return root.requestUrl;
    if (root.obsidian && typeof root.obsidian.requestUrl === "function") return root.obsidian.requestUrl;
    return app && typeof app.requestUrl === "function" ? app.requestUrl : null;
  }

  function createAuthoringHubConfig(app) {
    const authoringCore = required("KnowledgeAuthoringCore");
    const candidateStore = required("KnowledgeCandidateStore");
    const sourceStore = required("KnowledgeSourceStore");
    const fetchRuntime = required("KnowledgeSourceFetchRuntime");
    const batchRuntime = required("KnowledgeSourceBatchRuntime");
    const fetchService = fetchRuntime.createKnowledgeSourceFetchService({ requestUrl: requestUrl(app) });
    const batchService = batchRuntime.createKnowledgeSourceBatchService({
      fetchService,
      consumerRuntime: root.ProdigyAIConsumerRuntime || null
    });
    const createCandidate = (candidate) => candidateStore.saveCandidate(app, candidate);
    return Object.freeze({ app, authoringCore, candidateStore, sourceStore, fetchService, batchService, createCandidate });
  }

  function prevent(event) { if (event && typeof event.preventDefault === "function") event.preventDefault(); }

  function reloadOnce(onReload) {
    let queued = null;
    return () => {
      if (queued) return queued;
      if (typeof onReload !== "function") return Promise.resolve();
      queued = Promise.resolve().then(onReload).catch(() => {}).finally(() => { queued = null; });
      return queued;
    };
  }

  function refreshAfterClose(modal, refresh) {
    if (!modal || typeof modal.onClose !== "function") return modal;
    const original = modal.onClose.bind(modal);
    let closed = false;
    modal.onClose = () => {
      if (closed) return;
      closed = true;
      try { original(); } finally { refresh(); }
    };
    return modal;
  }

  function directRegionOptions(app) {
    const rootPath = "PARA/RESOURCES/Auction Regions/";
    const files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
    return files.filter((file) => file && typeof file.path === "string" && file.path.startsWith(rootPath)).map((file) => {
      const cache = app.metadataCache && typeof app.metadataCache.getFileCache === "function" ? app.metadataCache.getFileCache(file) : null;
      const frontmatter = cache && cache.frontmatter ? cache.frontmatter : {};
      const fallback = String(file.basename || file.path.slice(rootPath.length).replace(/\.md$/i, "")).replace(/-/g, " ");
      return { value: `[[${file.path.replace(/\.md$/i, "")}]]`, label: [frontmatter.region_sido, frontmatter.region_sigungu].filter(Boolean).join(" ") || fallback };
    }).sort((left, right) => left.label.localeCompare(right.label, "ko"));
  }

  function modalBase() {
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) throw new Error("Obsidian Modal을 사용할 수 없습니다.");
    return Modal;
  }

  function openMaterialChooser(app, config, refresh) {
    const Modal = modalBase();
    class MaterialChooserModal extends Modal {
      onOpen() {
        this.contentEl.empty();
        this.contentEl.createEl("h2", { text: "+ 문헌노트 작성" });
        this.contentEl.createEl("p", { text: "논문·기사 등 출처가 있는 문헌을 한 건 또는 묶음으로 기록합니다. 저장은 각 화면에서 직접 확인한 뒤에만 실행됩니다." });
        const actions = this.contentEl.createEl("div", { attr: { class: "knowledge-authoring-hub-actions", style: "display:flex;gap:8px;flex-wrap:wrap;" } });
        const choose = (label, open) => {
          const control = createEl(actions, "button", { text: label, attr: { type: "button", class: "knowledge-explorer-button", "aria-label": label } });
          control.onclick = (event) => { prevent(event); this.close(); open(); };
        };
        choose("문헌노트 한 건 작성", () => openSourceAuthoring(app, config, refresh));
        choose("문헌노트 묶음 작성", () => openSourceBatch(app, config, refresh));
      }
      onClose() { this.contentEl.empty(); }
    }
    const modal = new MaterialChooserModal(app);
    refreshAfterClose(modal, refresh);
    modal.open();
    return modal;
  }

  function openDirectAuthoring(app, config, refresh, onReview) {
    let modal = null;
    modal = required("KnowledgeDirectAuthoringView").openDirectAuthoringModal(app, {
      candidateStore: config.candidateStore,
      validate: (input) => config.authoringCore.normalizeDirectStudy(input),
      regionOptions: directRegionOptions(config.app),
      onSaved: refresh,
      onReview: async () => {
        if (modal && typeof modal.close === "function") modal.close();
        await refresh();
        if (typeof onReview === "function") return onReview();
        return undefined;
      }
    });
    return refreshAfterClose(modal, refresh);
  }

  function openSourceAuthoring(app, config, refresh) {
    const modal = required("KnowledgeSourceAuthoringView").openSourceAuthoringModal(app, {
      authoringCore: config.authoringCore,
      sourceStore: config.sourceStore,
      createCandidate: config.createCandidate
    });
    return refreshAfterClose(modal, refresh);
  }

  function openSourceBatch(app, config, refresh) {
    const modal = required("KnowledgeSourceBatchView").openSourceBatchModal(app, {
      authoringCore: config.authoringCore,
      sourceStore: config.sourceStore,
      createCandidate: config.createCandidate,
      retrievalService: config.fetchService,
      batchService: config.batchService
    });
    return refreshAfterClose(modal, refresh);
  }

  function mountKnowledgeAuthoringActions(parent, options) {
    const config = createAuthoringHubConfig(options && options.app);
    const refresh = reloadOnce(options && options.onReload);
    const section = createEl(parent, "section", { attr: { class: "knowledge-authoring-hub", "aria-label": "지식 작성 작업" } });
    section.createEl("p", { text: "지식 후보는 생각·경험을, 문헌노트는 논문·기사 등 출처가 있는 자료를 기록합니다. 저장 후 검토 대기에서 따로 확인합니다.", attr: { class: "knowledge-explorer-meta" } });
    const actions = section.createEl("div", { attr: { class: "knowledge-authoring-hub-actions", style: "display:flex;gap:8px;flex-wrap:wrap;" } });
    const button = (label, open) => {
      const control = createEl(actions, "button", { text: label, attr: { type: "button", class: "knowledge-explorer-button", "aria-label": label } });
      control.onclick = (event) => { prevent(event); open(); };
      return control;
    };
    button("+ 지식 작성", () => openDirectAuthoring(config.app, config, refresh, options && options.onReview));
    button("+ 문헌노트 작성", () => openMaterialChooser(config.app, config, refresh));
    return Object.freeze({ section, config });
  }

  const api = Object.freeze({
    createAuthoringHubConfig,
    mountKnowledgeAuthoringActions,
    openDirectAuthoring,
    openSourceAuthoring,
    openSourceBatch
  });
  root.KnowledgeAuthoringHubAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
