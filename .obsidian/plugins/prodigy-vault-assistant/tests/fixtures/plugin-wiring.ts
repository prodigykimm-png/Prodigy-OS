import type {
  ActiveLeaf,
  RuntimeStatus,
  RuntimeStatusSource,
  WiringSession,
} from "../../src/active-document";
import type { AssistantLeaf, AssistantWorkspace } from "../../src/main";

export class FakeLeaf implements AssistantLeaf {
  constructor(private readonly calls: string[]) {}
  async setViewState(): Promise<void> {
    this.calls.push("setViewState");
  }
}

export class FakeWorkspace implements AssistantWorkspace {
  readonly calls: string[] = [];
  readonly rightLeaf = new FakeLeaf(this.calls);
  readonly tabLeaf = new FakeLeaf(this.calls);

  getRightLeaf(split: false): AssistantLeaf {
    this.calls.push(`getRightLeaf:${split}`);
    return this.rightLeaf;
  }

  getLeaf(kind: "tab"): AssistantLeaf {
    this.calls.push(`getLeaf:${kind}`);
    return this.tabLeaf;
  }

  async revealLeaf(): Promise<void> {
    this.calls.push("revealLeaf");
  }
}

export function markdownLeaf(path: string, editorValue: string | null): ActiveLeaf {
  return { kind: "markdown", path, editorValue: () => editorValue };
}

type FakeSessionOptions = {
  readonly currentLeaf?: ActiveLeaf;
  readonly history?: boolean;
};

export class FakeSession implements WiringSession {
  readonly states: string[] = [];
  readonly serviceCalls: { readonly question: string; readonly signal: AbortSignal }[] = [];
  readonly runtimeLabels: string[] = [];
  readonly restoredLabels: string[] = [];
  historyLabels: string[] = [];
  clearCount = 0;
  abortCount = 0;
  clearEvidenceCount = 0;
  generation = 0;
  readonly #leaf: ActiveLeaf;
  readonly #history: boolean;
  readonly serviceStarted: Promise<void>;
  readonly #markServiceStarted: () => void;

  constructor(options: FakeSessionOptions = {}) {
    this.#leaf = options.currentLeaf ?? { kind: "other" };
    this.#history = options.history ?? false;
    let markServiceStarted: () => void = () => undefined;
    this.serviceStarted = new Promise<void>((resolve) => {
      markServiceStarted = resolve;
    });
    this.#markServiceStarted = markServiceStarted;
  }

  usesCurrentDocument(): boolean {
    return true;
  }

  async currentDocument() {
    if (this.#leaf.kind !== "markdown")
      return { ok: false as const, code: "no_current_document" as const };
    const content = this.#leaf.editorValue();
    return content === null
      ? { ok: false as const, code: "no_current_document" as const }
      : { ok: true as const, document: { path: this.#leaf.path, content } };
  }

  async restoreHistory(): Promise<void> {
    if (this.#history) {
      this.restoredLabels.push("configured-provider / configured-model");
      this.historyLabels = ["configured-provider / configured-model"];
    }
  }

  async clearHistory(): Promise<void> {
    this.clearCount += 1;
    this.historyLabels = [];
  }

  setRuntimeStatus(status: RuntimeStatus): void {
    if (status.status === "ready") {
      this.runtimeLabels.push(`${status.providerLabel} / ${status.modelLabel}`);
    }
  }

  setBoundaryState(state: "no_current_document"): void {
    this.states.push(state);
  }

  async answer(question: string, signal: AbortSignal): Promise<void> {
    this.serviceCalls.push({ question, signal });
    this.#markServiceStarted();
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        this.abortCount += 1;
        resolve();
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          this.abortCount += 1;
          resolve();
        },
        { once: true },
      );
    });
  }

  incrementGeneration(): void {
    this.generation += 1;
  }

  clearTransientEvidence(): void {
    this.clearEvidenceCount += 1;
  }
}

export function runtimeStatusSource(): RuntimeStatusSource & {
  readonly emit: (status: RuntimeStatus) => void;
  readonly listenerCount: () => number;
} {
  const listeners = new Set<(status: RuntimeStatus) => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (status) => {
      for (const listener of listeners) listener(status);
    },
    listenerCount: () => listeners.size,
  };
}

import type { HistoryState } from "../../src/contracts";

export function restoredHistoryFixture(hash: string): HistoryState {
  const labels = { providerLabel: "Receipt provider", modelLabel: "Receipt model" };
  return {
    version: 1,
    activeConversationId: "conversation-1",
    conversations: [
      {
        id: "conversation-1",
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            role: "user",
            text: "언제?",
            timestamp: 1,
            mode: "whole_vault",
            citations: [],
            ...labels,
          },
          {
            role: "assistant",
            text: "금요일입니다.",
            timestamp: 2,
            mode: "whole_vault",
            citations: [
              {
                path: "People/민수.md",
                heading: "만남",
                startLine: 1,
                endLine: 2,
                revision: { algorithm: "sha256", hash, capturedAt: 1 },
              },
            ],
            ...labels,
          },
        ],
      },
    ],
  };
}
