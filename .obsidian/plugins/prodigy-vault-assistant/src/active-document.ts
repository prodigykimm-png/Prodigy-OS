import type { ActiveDocumentSnapshot, RuntimeApiPort } from "./contracts";
import { abortable } from "./request-lifecycle";
import { normalizeVaultPath } from "./retrieval-ranking";

export type ActiveLeaf =
  | { readonly kind: "markdown"; readonly path: string; readonly editorValue: () => string | null }
  | { readonly kind: "assistant" | "other" };
export type ActiveDocumentResult =
  | { readonly ok: true; readonly document: ActiveDocumentSnapshot }
  | { readonly ok: false; readonly code: "no_current_document" };
export type RuntimeStatus =
  | { readonly status: "checking" }
  | {
      readonly status: "ready";
      readonly adapters: number;
      readonly inFlight: number;
      readonly providerLabel?: string;
      readonly modelLabel?: string;
    }
  | { readonly status: "unavailable"; readonly providerLabel?: string };
export interface RuntimeStatusSource {
  readonly subscribe: (listener: (status: RuntimeStatus) => void) => () => void;
}
export interface WiringSession {
  readonly restoreHistory: () => Promise<void>;
  readonly clearHistory: () => Promise<void>;
  readonly setRuntimeStatus: (status: RuntimeStatus) => void;
  readonly currentDocument: () => Promise<ActiveDocumentResult>;
  readonly usesCurrentDocument: () => boolean;
  readonly setBoundaryState: (state: "no_current_document") => void;
  readonly answer: (
    question: string,
    signal: AbortSignal,
    currentDocument: ActiveDocumentSnapshot | null,
  ) => Promise<void>;
  readonly captureAnswer?: (
    question: string,
  ) => (signal: AbortSignal, currentDocument: ActiveDocumentSnapshot | null) => Promise<void>;
  readonly retry?: (signal: AbortSignal) => Promise<void>;
  readonly setFailure?: (code: "read_error" | "provider_error", message?: string) => void;
  readonly incrementGeneration: () => void;
  readonly clearTransientEvidence: () => void;
  readonly refreshContext?: () => void;
}

type PinnedMarkdown = { readonly path: string; readonly editorValue: () => string | null };

export class ActiveDocumentTracker {
  #pinned: PinnedMarkdown | null = null;

  constructor(private readonly cachedRead: (path: string) => Promise<string | null>) {}

  observe(leaf: ActiveLeaf | null): void {
    if (leaf?.kind !== "markdown") return;
    const path = normalizeVaultPath(leaf.path);
    if (path === null || !path.toLocaleLowerCase("en-US").endsWith(".md")) return;
    this.#pinned = { path, editorValue: leaf.editorValue };
  }

  get pinnedPath(): string | null {
    return this.#pinned?.path ?? null;
  }

  async snapshot(): Promise<ActiveDocumentResult> {
    const pinned = this.#pinned;
    if (pinned === null) return { ok: false, code: "no_current_document" };
    const editorContent = pinned.editorValue();
    if (editorContent !== null) {
      return { ok: true, document: { path: pinned.path, content: editorContent } };
    }
    const cachedContent = await this.cachedRead(pinned.path);
    return cachedContent === null
      ? { ok: false, code: "no_current_document" }
      : { ok: true, document: { path: pinned.path, content: cachedContent } };
  }
}

export class PluginWiringDriver {
  #controller: AbortController | null = null;
  #unsubscribe: (() => void) | null = null;
  #epoch = 0;
  #pending: { readonly key: string; readonly promise: Promise<void> } | null = null;

  constructor(
    private readonly session: WiringSession,
    private readonly status: RuntimeStatusSource,
  ) {}

  async open(): Promise<void> {
    const epoch = ++this.#epoch;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    try {
      await this.session.restoreHistory();
      if (epoch !== this.#epoch) return;
      this.#unsubscribe = this.status.subscribe((value) => {
        if (epoch === this.#epoch) this.session.setRuntimeStatus(value);
      });
    } catch {
      if (epoch === this.#epoch) this.session.setFailure?.("read_error", "history_restore_error");
    }
  }

  submit(question: string): Promise<void> {
    return this.start(`submit:${question}`, async (signal) => {
      // Capture ownership and scope before awaiting an editor/cache snapshot.
      const answer =
        this.session.captureAnswer?.(question) ??
        ((signal: AbortSignal, document: ActiveDocumentSnapshot | null) =>
          this.session.answer(question, signal, document));
      const usesCurrentDocument = this.session.usesCurrentDocument();
      let currentDocument: ActiveDocumentSnapshot | null = null;
      if (usesCurrentDocument) {
        const current = await abortable(signal, () => this.session.currentDocument());
        if (signal.aborted) return;
        if (!current.ok) {
          this.session.setBoundaryState(current.code);
          return;
        }
        currentDocument = Object.freeze({ ...current.document });
      }
      if (!signal.aborted) await answer(signal, currentDocument);
    });
  }

  retry(): Promise<void> {
    return this.start("retry", async (signal) => this.session.retry?.(signal));
  }

  private start(key: string, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.#pending?.key === key && this.#controller !== null) return this.#pending.promise;
    this.cancel();
    const controller = new AbortController();
    this.#controller = controller;
    const promise = work(controller.signal)
      .catch(() => {
        if (this.#controller === controller && !controller.signal.aborted)
          this.session.setFailure?.("read_error");
      })
      .finally(() => {
        if (this.#controller === controller) this.#controller = null;
        if (this.#pending?.promise === promise) this.#pending = null;
      });
    this.#pending = { key, promise };
    return promise;
  }

  async clearHistory(): Promise<void> {
    this.cancel();
    this.session.incrementGeneration();
    try {
      await this.session.clearHistory();
    } catch {
      this.session.setFailure?.("read_error", "history_clear_error");
    }
  }

  refreshContext(changed: boolean): void {
    if (changed && this.session.usesCurrentDocument()) this.cancel();
    this.session.refreshContext?.();
  }

  visibilityChanged(hidden: boolean): void {
    if (hidden) this.stop();
  }

  cancel(): void {
    this.#controller?.abort();
    this.#controller = null;
  }

  close(): void {
    this.stop();
  }
  unload(): void {
    this.stop();
  }

  private stop(): void {
    this.#epoch += 1;
    this.cancel();
    this.session.incrementGeneration();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.session.clearTransientEvidence();
  }
}

export type RuntimePublicApi = RuntimeApiPort & {
  readonly subscribeStatus: (listener: (event: unknown) => void) => () => void;
  readonly openSettings: () => unknown;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invoke(
  record: Readonly<Record<string, unknown>>,
  name: string,
  args: readonly unknown[],
): unknown {
  const method = record[name];
  return typeof method === "function" ? Reflect.apply(method, record, args) : null;
}

export function runtimeApi(app: unknown): RuntimePublicApi | null {
  if (!isRecord(app) || !isRecord(app["plugins"])) return null;
  const plugin = invoke(app["plugins"], "getPlugin", ["prodigy-ai-runtime"]);
  if (!isRecord(plugin) || !isRecord(plugin["api"])) return null;
  const api = plugin["api"];
  const methods = [
    "getHandshake",
    "getStatus",
    "requestStructured",
    "cancel",
    "subscribeStatus",
    "openSettings",
  ] as const;
  if (methods.some((name) => typeof api[name] !== "function")) return null;
  return {
    getHandshake: () => invoke(api, "getHandshake", []),
    getStatus: () => invoke(api, "getStatus", []),
    requestStructured: (request) => Promise.resolve(invoke(api, "requestStructured", [request])),
    cancel: (requestId) => invoke(api, "cancel", [requestId]),
    subscribeStatus: (listener) => {
      const value = invoke(api, "subscribeStatus", [listener]);
      return typeof value === "function"
        ? () => {
            Reflect.apply(value, api, []);
          }
        : () => undefined;
    },
    openSettings: () => invoke(api, "openSettings", []),
  };
}

export interface RuntimeReadinessApi {
  readonly getStatus: () => unknown;
  readonly subscribeStatus: (listener: (event: unknown) => void) => () => void;
}

export function projectRuntimeStatus(value: unknown): RuntimeStatus | null {
  if (!isRecord(value)) return null;
  const provider = value["provider_label"] ?? value["provider_key"];
  const model = value["model_label"] ?? value["model"];
  const providerLabel = typeof provider === "string" && provider.length > 0 ? provider : null;
  const modelLabel = typeof model === "string" && model.length > 0 ? model : null;
  if (
    value["status"] === "ready" &&
    typeof value["adapters"] === "number" &&
    typeof value["in_flight"] === "number"
  ) {
    return {
      status: "ready",
      adapters: value["adapters"],
      inFlight: value["in_flight"],
      ...(providerLabel === null ? {} : { providerLabel }),
      ...(modelLabel === null ? {} : { modelLabel }),
    };
  }
  return value["status"] === "unavailable"
    ? { status: "unavailable", ...(providerLabel === null ? {} : { providerLabel }) }
    : null;
}

export function createRuntimeStatusSource(api: RuntimeReadinessApi): RuntimeStatusSource {
  return {
    subscribe: (listener) => {
      listener(projectRuntimeStatus(api.getStatus()) ?? { status: "checking" });
      return api.subscribeStatus((event) => {
        const status = projectRuntimeStatus(event) ?? projectRuntimeStatus(api.getStatus());
        if (status !== null) listener(status);
      });
    },
  };
}

export function sourceLinkText(path: string, heading?: string): string {
  const note = path.endsWith(".md") ? path.slice(0, -3) : path;
  return `${note}${heading === undefined ? "" : `#${heading}`}`;
}

export class AssistantPlacementError extends Error {
  constructor() {
    super("Unable to allocate the Vault Assistant leaf");
  }
}
