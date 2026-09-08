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
import { AssistantService, type AssistantServiceInput } from "./assistant-service";
import { createAssistantView } from "./assistant-view";
import type {
  ActiveDocumentSnapshot,
  AssistantResult,
  HistoryExchange,
  HistoryState,
  RuntimeIdentity,
  RuntimePort,
  ScopeMode,
} from "./contracts";
import type { ObsidianSessionDependencies } from "./main";
import { MentionSelection } from "./mention-selection";
import { abortable } from "./request-lifecycle";
import { createRuntimeAdapter, nextAttempt } from "./runtime-adapter";
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

type SessionRequest = Omit<
  AssistantServiceInput,
  "signal" | "generation" | "retryIdentity" | "onProgress"
> & {
  readonly identity: RuntimeIdentity;
  readonly conversationId: string;
  readonly currentPath: string | null;
};

export class ObsidianSession implements WiringSession, RuntimeStatusSource {
  private mode: ScopeMode = "current_document";
  private provider: ProviderReadiness = { status: "checking" };
  private result: AssistantResult = { state: "idle" };
  private generation = 0;
  private history: HistoryState = { version: 1, activeConversationId: null, conversations: [] };
  private mentionQuery: string | null = null;
  private readonly mentions: MentionSelection;
  private readonly service: AssistantService;
  private readonly runtime: RuntimePort;
  private controller: AbortController | null = null;
  private lastRequest: SessionRequest | null = null;
  private historyBarrier: Promise<void> = Promise.resolve();
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
    this.runtime = createRuntimeAdapter({
      getPlugin: () =>
        this.dependencies.runtime === null ? null : { api: this.dependencies.runtime },
    });
    this.service = new AssistantService({ retriever, runtime: this.runtime });
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
    const generation = this.generation;
    try {
      const history = await this.dependencies.store.load();
      if (generation !== this.generation) return;
      this.history = history;
      await this.projectHistory();
    } catch {
      if (generation === this.generation) this.setFailure("read_error", "history_restore_error");
    }
  }
  async clearHistory(): Promise<void> {
    this.driver?.cancel();
    this.incrementGeneration();
    const generation = this.generation;
    this.lastRequest = null;
    this.history = { version: 1, activeConversationId: null, conversations: [] };
    this.clearTransientEvidence();
    this.historyBarrier = this.historyBarrier
      .then(() => this.dependencies.store.clear())
      .catch(() => {
        if (generation === this.generation) this.setFailure("read_error", "history_clear_error");
      });
    await this.historyBarrier;
  }
  setRuntimeStatus(status: RuntimeStatus): void {
    this.provider = this.dependencies.projectProvider(status);
    this.render();
  }
  refreshContext(): void {
    this.render();
  }
  setBoundaryState(): void {
    this.setFailure("read_error", "no_current_document");
  }
  setFailure(code: "read_error" | "provider_error", message: string = code): void {
    const operationId = `generation-${this.generation}`;
    this.result =
      code === "read_error"
        ? { state: "error", operationId, code, message }
        : { state: "error", operationId, code, message, recovery: { action: "retry" } };
    this.render();
  }
  incrementGeneration(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
  clearTransientEvidence(): void {
    this.result = { state: "idle" };
    this.render();
  }

  captureAnswer(
    question: string,
  ): (signal: AbortSignal, currentDocument: ActiveDocumentSnapshot | null) => Promise<void> {
    this.incrementGeneration();
    const generation = this.generation;
    const captured = Object.freeze({
      question,
      mentions: Object.freeze(
        this.mentions.selected().map((mention) => Object.freeze({ ...mention })),
      ),
      mode: this.mode,
      currentPath: this.dependencies.tracker.pinnedPath,
      dialogue: Object.freeze(
        dialogueFromHistory(this.history).map((message) => Object.freeze({ ...message })),
      ),
      conversationId:
        this.history.activeConversationId ?? this.dependencies.store.createConversationId(),
      identity: this.runtime.createIdentity(),
    });
    return (signal, currentDocument) =>
      this.execute(
        Object.freeze({
          ...captured,
          scope: Object.freeze({
            mode: captured.mode,
            currentDocument:
              currentDocument === null ? null : Object.freeze({ ...currentDocument }),
          }),
        }),
        signal,
        generation,
      );
  }

  answer(
    question: string,
    signal: AbortSignal,
    currentDocument: ActiveDocumentSnapshot | null,
  ): Promise<void> {
    return this.captureAnswer(question)(signal, currentDocument);
  }

  async retry(signal: AbortSignal): Promise<void> {
    if (this.lastRequest === null) return;
    const request = Object.freeze({
      ...this.lastRequest,
      identity: nextAttempt(this.lastRequest.identity, () => crypto.randomUUID()),
    });
    this.incrementGeneration();
    await this.execute(request, signal, this.generation);
  }

  private async execute(
    request: SessionRequest,
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation || signal.aborted) return;
    this.lastRequest = request;
    const controller = new AbortController();
    this.controller = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const operationId = request.identity.operationId.value;
    this.result = { state: "retrieving", operationId };
    this.render();
    try {
      await abortable(controller.signal, () => this.historyBarrier);
      const committed = await commitGuardedAnswer({
        capturedGeneration: generation,
        currentGeneration: () => this.generation,
        answer: () =>
          this.service.answer({
            question: request.question,
            mentions: request.mentions,
            scope: request.scope,
            dialogue: request.dialogue,
            retryIdentity: request.identity,
            signal: controller.signal,
            generation,
            onProgress: (state) => {
              if (generation !== this.generation || controller.signal.aborted) return;
              this.result = state;
              this.render();
            },
          }),
        prepare: async (result) => {
          const refreshSources = this.dependencies.refreshSources;
          const refreshed =
            (result.state === "answered" || result.state === "partial") &&
            refreshSources !== undefined
              ? {
                  ...result,
                  sources: await abortable(controller.signal, () => refreshSources(result.sources)),
                }
              : result;
          return { result: refreshed, exchange: this.exchangeFor(request, refreshed) };
        },
        persist: async ({ result, exchange }, isCurrent) => {
          if (!isCurrent()) return null;
          if (exchange === null) return { result, history: this.history };
          const history = await abortable(controller.signal, () =>
            this.dependencies.store.appendExchange(exchange, controller.signal),
          );
          return history !== null && isCurrent() ? { result, history } : null;
        },
        apply: (_result, persisted) => {
          this.result = persisted.result;
          this.history = persisted.history;
        },
      });
      if (committed) this.render();
    } catch {
      if (generation === this.generation && !controller.signal.aborted)
        this.setFailure("read_error", "history_commit_error");
    } finally {
      signal.removeEventListener("abort", abort);
      if (this.controller === controller) this.controller = null;
      if (generation === this.generation && controller.signal.aborted) {
        this.result = { state: "cancelled", operationId };
        this.render();
      }
    }
  }

  subscribe(listener: (status: RuntimeStatus) => void): () => void {
    if (this.dependencies.runtime === null) {
      listener({ status: "unavailable", providerLabel: "Prodigy AI Runtime" });
      return () => undefined;
    }
    return createRuntimeStatusSource(this.dependencies.runtime).subscribe(listener);
  }

  private exchangeFor(request: SessionRequest, result: AssistantResult): HistoryExchange | null {
    if (result.state !== "answered" && result.state !== "partial") return null;
    return {
      conversationId: request.conversationId,
      question: request.question,
      answer: result.blocks.map(({ text }) => text).join("\n"),
      timestamp: Date.now(),
      mode: request.scope.mode,
      ...(request.currentPath === null ? {} : { currentPath: request.currentPath }),
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
        if (this.mode === mode) return;
        this.driver?.cancel();
        this.incrementGeneration();
        this.mode = mode;
        this.clearTransientEvidence();
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
        this.driver?.cancel();
        this.incrementGeneration();
        this.lastRequest = null;
        this.history = { ...this.history, activeConversationId: id };
        this.clearTransientEvidence();
        void this.projectHistory();
      },
      onSourceOpen: this.dependencies.openSource,
      onSubmit: (question: string) => {
        void this.driver?.submit(question);
      },
      onCancel: () => this.driver?.cancel(),
      onLater: () => this.clearTransientEvidence(),
      onRetry: () => {
        void this.driver?.retry();
      },
      onSettings: () => {
        void Promise.resolve()
          .then(() => this.dependencies.runtime?.openSettings())
          .catch(() => this.setFailure("provider_error", "runtime_unavailable"));
      },
      onClearHistory: () => void this.driver?.clearHistory(),
    };
  }

  private async projectHistory(): Promise<void> {
    const generation = this.generation;
    const history = this.history;
    try {
      const projection = await this.dependencies.projectHistory(history);
      if (generation !== this.generation || history !== this.history) return;
      if (projection !== null) {
        this.provider = projection.provider;
        this.result = projection.result;
      }
      this.render();
    } catch {
      if (generation === this.generation && history === this.history)
        this.setFailure("read_error", "history_restore_error");
    }
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
