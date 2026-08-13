(function (root) {
  "use strict";

  const RELATION_LABELS = Object.freeze({
    related_knowledge: "같은 지식과 연결됨",
    explicit_link: "직접 연결됨",
    shared_concept: "같은 개념",
    shared_topic: "같은 주제",
    claim_keyword_overlap: "유사한 주장",
    thinking_delta_relation: "이전 생각 변화와 연결됨",
    same_author: "같은 저자",
  });
  const runtime = root.__prodigyReadingMemoryRuntime || { buildPromise: null, openModals: new Map() };
  root.__prodigyReadingMemoryRuntime = runtime;
  const openModals = runtime.openModals;
  const LOAD_TIMEOUT_MS = 15000;

  function api() {
    const value = {
      core: root.ReadingMemoryCore,
      retrieval: root.ReadingMemoryRetrieval,
      store: root.ReadingMemoryStore,
    };
    if (!value.core || !value.retrieval || !value.store) throw new Error("Reading Memory modules are unavailable.");
    return value;
  }

  function notice(message) {
    const Notice = root.obsidian && root.obsidian.Notice ? root.obsidian.Notice : root.Notice;
    if (Notice) new Notice(message);
  }

  function button(parent, text, primary = false) {
    return parent.createEl("button", {
      text,
      attr: {
        type: "button",
        class: primary ? "mod-cta prodigy-memory-button" : "prodigy-memory-button",
      },
    });
  }

  function intersect(left, right) {
    const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").trim();
    const rightValues = new Set((right || []).map(normalize));
    return (left || []).filter((value) => rightValues.has(normalize(value)));
  }

  function evidenceLine(query, entry, result) {
    const choices = [
      [entry.my_thoughts, "내 기록"],
      [entry.applications, "적용 기록"],
      [entry.core_claims, "핵심 기록"],
    ];
    for (const [values, label] of choices) {
      if (Array.isArray(values) && values[0]) return `${label}: ${values[0]}`;
    }
    const topic = (result.relation_types || []).includes("shared_topic") && intersect(query.topics, entry.topics)[0];
    return topic ? `공통 주제: ${topic}` : (result.evidence || []).slice(0, 2).join(", ");
  }

  function explanationFor(query, entry, result) {
    return (result.relation_types || []).slice(0, 3).flatMap((type) => {
      const label = RELATION_LABELS[type];
      if (!label) return [];
      let values = [];
      if (type === "shared_topic") values = intersect(query.topics, entry.topics);
      else if (type === "shared_concept") values = intersect(query.key_concepts, entry.key_concepts);
      else if (type === "related_knowledge") values = intersect(query.knowledge_links, entry.knowledge_links);
      else if (type === "same_author" && entry.author) values = [entry.author];
      else if (type === "explicit_link") values = [entry.title];
      else if (type === "claim_keyword_overlap") values = (entry.core_claims || []).slice(0, 1);
      else if (type === "thinking_delta_relation" && entry.thinking_delta) values = [entry.thinking_delta];
      return [{ label, values }];
    });
  }

  async function collectSources(app, core) {
    const files = app.vault.getMarkdownFiles().filter((file) => core.isEligibleReadingPath(file.path));
    return Promise.all(files.map(async (file) => ({
      source_path: file.path,
      source_mtime: file.stat && file.stat.mtime ? file.stat.mtime : 0,
      content: await app.vault.read(file),
      frontmatter: ((app.metadataCache.getFileCache(file) || {}).frontmatter) || {},
    })));
  }

  function runBuild(app) {
    if (runtime.buildPromise) return runtime.buildPromise;
    runtime.buildPromise = (async () => {
      const modules = api();
      const adapter = modules.store.createObsidianAdapter(app);
      const memoryStore = modules.store.createReadingMemoryStore(adapter);
      const sources = await collectSources(app, modules.core);
      const build = await modules.store.buildReadingMemory({ sources, store: memoryStore });
      return { build, memoryStore };
    })().finally(() => { runtime.buildPromise = null; });
    return runtime.buildPromise;
  }

  async function withinLoadTimeout(operation) {
    let timer;
    try {
      return await Promise.race([
        operation,
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Reading Memory loading timed out.")), LOAD_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadForSource(app, sourcePath) {
    const modules = api();
    if (!modules.core.isEligibleReadingPath(sourcePath)) throw new Error("Reading source path is not eligible.");
    const { build, memoryStore } = await withinLoadTimeout(runBuild(app));
    const index = await memoryStore.readIndex();
    const summaries = Array.isArray(index && index.entries) ? index.entries : [];
    const entries = (await Promise.all(summaries.map((item) => memoryStore.readEntry(item.id)))).filter(Boolean);
    const query = entries.find((entry) => modules.core.normalizePath(entry.source_path) === modules.core.normalizePath(sourcePath));
    if (!query) throw new Error("Reading source was not indexed.");
    const byPath = new Map(entries.map((entry) => [modules.core.normalizePath(entry.source_path), entry]));
    const candidates = modules.retrieval.retrieveReadingMemoryCandidates(query, entries, 5).flatMap((result) => {
      const entry = byPath.get(modules.core.normalizePath(result.source_path));
      const relationLabels = (result.relation_types || []).map((type) => RELATION_LABELS[type]).filter(Boolean).slice(0, 3);
      if (!entry || !modules.core.isEligibleReadingPath(result.source_path) || !relationLabels.length) return [];
      return [{
        source_path: result.source_path,
        title: result.title,
        author: entry.author || "",
        knowledge_links: Array.isArray(entry.knowledge_links) ? entry.knowledge_links.slice() : [],
        relation_labels: relationLabels,
        evidence_line: evidenceLine(query, entry, result),
        explanation: explanationFor(query, entry, result),
      }];
    });
    return { build, candidates };
  }

  async function openSource(app, sourcePath) {
    const modules = api();
    const file = modules.core.isEligibleReadingPath(sourcePath) && app.vault.getAbstractFileByPath(sourcePath);
    if (!file || !String(file.path || "").endsWith(".md")) {
      notice("원본 독서 기록을 찾을 수 없습니다.");
      return false;
    }
    await app.workspace.openLinkText(file.path, "", false);
    return true;
  }

  const ModalBase = root.obsidian && root.obsidian.Modal;
  class RelatedMemoryModal extends ModalBase {
    constructor(app, sourcePath) {
      super(app);
      this.sourcePath = sourcePath;
      this.loadPromise = null;
    }

    onOpen() { this.renderLoading(); this.loadPromise = this.load(); }
    onClose() { if (openModals.get(this.sourcePath) === this) openModals.delete(this.sourcePath); }

    shell() {
      const tokens = root.ProdigyTokens || (typeof require === "function" ? require("./design-tokens.js") : null);
      const compactMax = tokens && tokens.RESPONSIVE_BREAKPOINTS && tokens.RESPONSIVE_BREAKPOINTS.compactMax;
      if (!Number.isFinite(compactMax)) throw new Error("Reading memory requires the shared compact breakpoint.");
      this.contentEl.empty();
      this.contentEl.addClass("prodigy-related-memory");
      this.contentEl.createEl("style", { text: `.prodigy-related-memory{max-width:640px}.prodigy-related-memory .prodigy-memory-body{max-height:68vh;overflow-y:auto;padding-right:2px}.prodigy-related-memory .prodigy-memory-list{display:flex;flex-direction:column;gap:8px}.prodigy-related-memory .prodigy-memory-item{border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;background:var(--background-secondary);overflow-wrap:anywhere}.prodigy-related-memory .prodigy-memory-labels,.prodigy-related-memory .prodigy-memory-actions{display:flex;gap:6px;flex-wrap:wrap}.prodigy-related-memory .prodigy-memory-label{font-size:.76em;color:var(--ke-color-accent, var(--text-accent));font-weight:700}.prodigy-related-memory .prodigy-memory-button{min-height:44px;border-radius:6px}.prodigy-related-memory .prodigy-memory-explanation[hidden]{display:none}@media(max-width:${compactMax}px){.prodigy-related-memory .prodigy-memory-actions{flex-direction:column}.prodigy-related-memory .prodigy-memory-button{width:100%}.prodigy-related-memory .prodigy-memory-body{max-height:72vh}}` });
      this.contentEl.createEl("h2", { text: "관련 기억", attr: { style: "margin:0 0 4px;font-size:1.18em;" } });
      this.contentEl.createEl("div", { text: "이 책과 연결되는 이전 독서 기록", attr: { style: "color:var(--text-muted);font-size:.86em;margin-bottom:14px;" } });
      return this.contentEl.createDiv({ attr: { class: "prodigy-memory-body" } });
    }

    renderLoading() { this.shell().createEl("div", { text: "관련 기록을 확인하고 있습니다…", attr: { style: "color:var(--text-muted);padding:18px 0;" } }); }

    async load() {
      try {
        const result = await loadForSource(this.app, this.sourcePath);
        this.renderResult(result.candidates);
      } catch (error) {
        if (root.prodigyDebugMode === true) console.error(error);
        this.renderUnavailable();
      }
    }

    renderResult(candidates) {
      const body = this.shell();
      if (!candidates.length) {
        body.createEl("p", { text: "아직 연결할 만한 이전 독서 기록이 없습니다." });
        body.createEl("p", { text: "독서 기록이 더 쌓이면 같은 주제와 개념을 기준으로 연결됩니다.", attr: { style: "color:var(--text-muted);font-size:.84em;" } });
      } else {
        const list = body.createDiv({ attr: { class: "prodigy-memory-list" } });
        candidates.slice(0, 5).forEach((candidate) => this.renderCandidate(list, candidate));
      }
      const refresh = button(body, "기억 새로고침");
      refresh.onclick = () => { this.renderLoading(); this.loadPromise = this.load(); return this.loadPromise; };
    }

    renderCandidate(parent, candidate) {
      const item = parent.createDiv({ attr: { class: "prodigy-memory-item" } });
      item.createEl("h3", { text: candidate.title, attr: { style: "margin:0;font-size:.98em;line-height:1.4;" } });
      if (candidate.author) item.createEl("div", { text: candidate.author, attr: { style: "color:var(--text-muted);font-size:.8em;margin-top:2px;" } });
      const labels = item.createDiv({ attr: { class: "prodigy-memory-labels", style: "margin-top:8px;" } });
      candidate.relation_labels.forEach((label) => labels.createEl("span", { text: label, attr: { class: "prodigy-memory-label" } }));
      if (candidate.evidence_line) item.createEl("p", { text: candidate.evidence_line, attr: { style: "margin:8px 0;line-height:1.5;font-size:.86em;" } });
      const explanation = item.createDiv({ attr: { class: "prodigy-memory-explanation" } });
      explanation.hidden = true;
      candidate.explanation.forEach((detail) => {
        explanation.createEl("strong", { text: detail.label, attr: { style: "display:block;font-size:.8em;margin-top:6px;" } });
        detail.values.forEach((value) => explanation.createEl("div", { text: `- ${value}`, attr: { style: "font-size:.8em;color:var(--text-muted);" } }));
      });
      const actions = item.createDiv({ attr: { class: "prodigy-memory-actions", style: "margin-top:10px;" } });
      button(actions, "책 열기", true).onclick = async () => {
        if (await openSource(this.app, candidate.source_path)) this.close();
      };
      const why = button(actions, "왜 표시되었나요?");
      why.setAttr("aria-expanded", "false");
      why.onclick = () => {
        explanation.hidden = !explanation.hidden;
        why.setAttr("aria-expanded", String(!explanation.hidden));
      };
    }

    renderUnavailable() {
      const body = this.shell();
      body.createEl("p", { text: "관련 기억을 불러오지 못했습니다." });
      const retry = button(body, "다시 시도", true);
      retry.onclick = () => { this.renderLoading(); this.loadPromise = this.load(); return this.loadPromise; };
    }
  }

  function createModal(app, sourcePath) { return new RelatedMemoryModal(app, sourcePath); }
  function openForSource(app, sourcePath) {
    if (openModals.has(sourcePath)) return openModals.get(sourcePath);
    const modal = createModal(app, sourcePath);
    openModals.set(sourcePath, modal);
    modal.open();
    return modal;
  }

  const publicApi = { RELATION_LABELS, createModal, loadForSource, openForSource, openSource };
  root.ReadingMemoryView = publicApi;
  if (typeof module !== "undefined" && module.exports) module.exports = publicApi;
})(typeof globalThis !== "undefined" ? globalThis : this);
