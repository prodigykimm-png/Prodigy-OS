export { createRuntimeStatusSource } from "./active-document";
export { MentionSelection } from "./mention-selection";

import {
  type ActiveDocumentResult,
  createRuntimeStatusSource,
  type PluginWiringDriver,
  type RuntimeStatus,
  type RuntimeStatusSource,
  type WiringSession,
} from "./active-document";
import { AssistantService } from "./assistant-service";
import { createAssistantView } from "./assistant-view";
import type {
  ActiveDocumentSnapshot,
  AssistantResult,
  HistoryExchange,
  HistoryState,
  ScopeMode,
} from "./contracts";
import type { ObsidianSessionDependencies } from "./main";
import { MentionSelection } from "./mention-selection";
import { createRuntimeAdapter } from "./runtime-adapter";
import {
  dialogueFromHistory,
  historySummaries,
  priorBlocksFromHistory,
} from "./session-history-projection";
import { VaultRetriever } from "./vault-retriever";
import { createViewModel, type ProviderReadiness } from "./view-model";

export async function commitGuardedAnswer<Value, Prepared, Persisted>(options: {
  readonly capturedGeneration: number;
  readonly currentGeneration: () => number;
  readonly answer: () => Promise<Value>;
  readonly prepare: (value: Value) => Promise<Prepared>;
  readonly persist: (prepared: Prepared, isCurrent: () => boolean) => Promise<Persisted | null>;
  readonly apply: (value: Value, persisted: Persisted) => void;
}): Promise<boolean> {
  const isCurrent = () => options.capturedGeneration === options.currentGeneration();
  const value = await options.answer();
  if (!isCurrent()) return false;
  const prepared = await options.prepare(value);
  if (!isCurrent()) return false;
  const persisted = await options.persist(prepared, isCurrent);
  if (persisted === null || !isCurrent()) return false;
  options.apply(value, persisted);
  return true;
}

class MissingFileError extends Error {
  constructor(readonly path: string) {
    super(`Missing Markdown file: ${path}`);
  }
}

export class ObsidianSession implements WiringSession, RuntimeStatusSource {
  private mode: ScopeMode = "current_document";
  private provider: ProviderReadiness = { status: "checking" };
  private result: AssistantResult = { state: "idle" };
  private generation = 0;
  private history: HistoryState = { version: 1, activeConversationId: null, conversations: [] };
  private mentionQuery: string | null = null;
  private readonly mentions: MentionSelection;
  private readonly service: AssistantService;
  private readonly ui;
  driver: PluginWiringDriver | null = null;

  constructor(private readonly dependencies: ObsidianSessionDependencies) {
    const { view } = dependencies;
    this.mentions = new MentionSelection(() =>
      view.app.vault.getMarkdownFiles().map(({ path }) => path),
    );
    const retriever = new VaultRetriever({
      getMarkdownFiles: () => view.app.vault.getMarkdownFiles(),
      cachedRead: async ({ path }) => {
        const file = view.app.vault.getFileByPath(path);
        if (file === null) throw new MissingFileError(path);
        return view.app.vault.cachedRead(file);
      },
      metadata: ({ path }) => this.dependencies.metadata(path),
      resolvedLinks: () => view.app.metadataCache.resolvedLinks,
    });
    this.service = new AssistantService({
      retriever,
      runtime: createRuntimeAdapter({
        getPlugin: () =>
          this.dependencies.runtime === null ? null : { api: this.dependencies.runtime },
      }),
    });
    this.ui = createAssistantView(this.dependencies.document, this.ports());
    this.dependencies.mount(this.ui.root);
    view.registerDomEvent(view.contentEl.ownerDocument, "visibilitychange", () =>
      this.driver?.visibilityChanged(view.contentEl.ownerDocument.hidden),
    );
    this.ui.composer.addEventListener("input", () => {
      this.mentionQuery = this.ui.composer.value?.match(/(?:^|\s)@([^\s@]*)$/u)?.[1] ?? null;
      this.render();
    });
  }

  readonly usesCurrentDocument = (): boolean => this.mode === "current_document";
  readonly currentDocument = (): Promise<ActiveDocumentResult> =>
    this.dependencies.tracker.snapshot();
  async restoreHistory(): Promise<void> {
    this.history = await this.dependencies.store.load();
    await this.projectHistory();
  }
  async clearHistory(): Promise<void> {
    await this.dependencies.store.clear();
    this.history = { version: 1, activeConversationId: null, conversations: [] };
    this.render();
  }
  setRuntimeStatus(status: RuntimeStatus): void {
    this.provider = this.dependencies.projectProvider(status);
    this.render();
  }
  setBoundaryState(): void {
    this.result = {
      state: "error",
      operationId: crypto.randomUUID(),
      code: "read_error",
      message: "no_current_document",
    };
    this.render();
  }
  incrementGeneration(): void {
    this.generation += 1;
  }
  clearTransientEvidence(): void {
    this.result = { state: "idle" };
    this.render();
  }

  async answer(
    question: string,
    signal: AbortSignal,
    currentDocument: ActiveDocumentSnapshot | null,
  ): Promise<void> {
    const generation = ++this.generation;
    this.result = { state: "retrieving", operationId: `generation-${generation}` };
    this.render();
    const committed = await commitGuardedAnswer({
      capturedGeneration: generation,
      currentGeneration: () => this.generation,
      answer: () =>
        this.service.answer({
          question,
          mentions: this.mentions.selected(),
          scope: { mode: this.mode, currentDocument },
          signal,
          generation,
          dialogue: dialogueFromHistory(this.history),
        }),
      prepare: async (result) => ({ result, exchange: this.exchangeFor(question, result) }),
      persist: async ({ exchange }, isCurrent) => {
        await Promise.resolve();
        if (!isCurrent()) return null;
        if (exchange === null) return this.history;
        const history = await this.dependencies.store.appendExchange(exchange, signal);
        return isCurrent() ? history : null;
      },
      apply: (result, history) => {
        this.result = result;
        this.history = history;
      },
    });
    if (committed) this.render();
  }

  subscribe(listener: (status: RuntimeStatus) => void): () => void {
    if (this.dependencies.runtime === null) {
      listener({ status: "unavailable", providerLabel: "Prodigy AI Runtime" });
      return () => undefined;
    }
    return createRuntimeStatusSource(this.dependencies.runtime).subscribe(listener);
  }

  private exchangeFor(question: string, result: AssistantResult): HistoryExchange | null {
    if (result.state !== "answered" && result.state !== "partial") return null;
    return {
      question,
      answer: result.blocks.map(({ text }) => text).join("\n"),
      timestamp: Date.now(),
      mode: this.mode,
      ...(this.dependencies.tracker.pinnedPath === null
        ? {}
        : { currentPath: this.dependencies.tracker.pinnedPath }),
      citations: result.sources.map(({ path, heading, startLine, endLine, revision }) => ({
        path,
        ...(heading === undefined ? {} : { heading }),
        startLine,
        endLine,
        revision,
      })),
      providerLabel: result.receipt.providerLabel,
      modelLabel: result.receipt.modelLabel,
    };
  }

  private ports() {
    return {
      onModeChange: (mode: ScopeMode) => {
        this.mode = mode;
        this.render();
      },
      onMentionRemove: (path: string) => {
        this.mentions.remove(path);
        this.render();
      },
      onMentionSelect: (path: string) => {
        this.mentions.add(path);
        this.mentionQuery = null;
        this.render();
      },
      onHistoryOpen: (id: string) => {
        this.history = { ...this.history, activeConversationId: id };
        void this.projectHistory();
      },
      onSourceOpen: this.dependencies.openSource,
      onSubmit: (question: string) => {
        void this.driver?.submit(question);
      },
      onCancel: () => this.driver?.cancel(),
      onLater: () => this.clearTransientEvidence(),
      onRetry: () => {
        void this.driver?.submit(this.ui.composer.value ?? "");
      },
      onSettings: () => this.dependencies.runtime?.openSettings(),
      onClearHistory: () => void this.driver?.clearHistory(),
    };
  }

  private async projectHistory(): Promise<void> {
    const projection = await this.dependencies.projectHistory(this.history);
    if (projection !== null) {
      this.provider = projection.provider;
      this.result = projection.result;
    }
    this.render();
  }

  private render(): void {
    this.ui.render(
      createViewModel({
        mode: this.mode,
        currentDocumentLabel: this.dependencies.tracker.pinnedPath,
        mentions: this.mentions.selected(),
        mentionSuggestions:
          this.mentionQuery === null ? [] : this.mentions.suggestions(this.mentionQuery),
        history: historySummaries(this.history),
        provider: this.provider,
        result: this.result,
        priorBlocks: priorBlocksFromHistory(this.history),
      }),
    );
  }
}
