import { ItemView, MarkdownView, Platform, Plugin, type WorkspaceLeaf } from "obsidian";
import {
  ActiveDocumentTracker,
  type ActiveLeaf,
  AssistantPlacementError,
  PluginWiringDriver,
  type RuntimePublicApi,
  type RuntimeStatus,
  runtimeApi,
  sourceLinkText,
} from "./active-document";
import type { AssistantResult, HistoryState, SourceRecord } from "./contracts";
import { assistantDocument, nodeFromDocument } from "./dom-realm";
import { createHistoryStore, type HistoryStore } from "./history-store";
import { ObsidianSession } from "./mentions";
import type { RetrievalMetadata } from "./vault-retriever";
import type { AssistantDocument, AssistantElement, ProviderReadiness } from "./view-model";

export { PluginWiringDriver, sourceLinkText } from "./active-document";
export const VIEW_TYPE = "prodigy-vault-assistant";
export type ObsidianSessionDependencies = {
  readonly view: ItemView;
  readonly store: HistoryStore;
  readonly tracker: ActiveDocumentTracker;
  readonly runtime: RuntimePublicApi | null;
  readonly openSource: (path: string, heading?: string) => void;
  readonly document: AssistantDocument;
  readonly mount: (root: AssistantElement) => void;
  readonly metadata: (path: string) => RetrievalMetadata | null;
  readonly projectProvider: (status: RuntimeStatus) => ProviderReadiness;
  readonly projectHistory: (state: HistoryState) => Promise<RestoredHistoryProjection | null>;
  readonly refreshSources?: (sources: readonly SourceRecord[]) => Promise<readonly SourceRecord[]>;
};
export type DeviceClass = "phone" | "tablet" | "desktop";
export interface AssistantLeaf {
  readonly setViewState: (state: { readonly type: string; readonly active: true }) => Promise<void>;
}
export interface AssistantWorkspace<Leaf extends AssistantLeaf = AssistantLeaf> {
  readonly getLeavesOfType?: (type: string) => readonly Leaf[];
  readonly getRightLeaf: (split: false) => Leaf | null;
  readonly getLeaf: (kind: "tab") => Leaf;
  readonly revealLeaf: (leaf: Leaf) => Promise<void>;
}
type SurfaceRegistrar = {
  readonly registerView: (type: string, creator: (leaf: WorkspaceLeaf) => ItemView) => void;
  readonly addRibbonIcon: (icon: string, title: string, callback: () => void) => unknown;
  readonly addCommand: (command: {
    readonly id: string;
    readonly name: string;
    readonly callback: () => void;
  }) => unknown;
};

export async function openAssistantLeaf<Leaf extends AssistantLeaf>(
  workspace: AssistantWorkspace<Leaf>,
  device: DeviceClass,
): Promise<Leaf> {
  const existing = workspace.getLeavesOfType?.(VIEW_TYPE)[0];
  if (existing !== undefined) {
    await workspace.revealLeaf(existing);
    return existing;
  }
  const leaf = device === "phone" ? workspace.getLeaf("tab") : workspace.getRightLeaf(false);
  if (leaf === null) throw new AssistantPlacementError();
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
  return leaf;
}

export function registerAssistantSurface(
  registrar: SurfaceRegistrar,
  open: () => void = () => undefined,
  createView = (leaf: WorkspaceLeaf) =>
    new VaultAssistantItemView(leaf, new ActiveDocumentTracker(async () => null)),
): void {
  registrar.registerView(VIEW_TYPE, createView);
  registrar.addRibbonIcon("message-circle-question", "Vault Assistant", open);
  registrar.addCommand({
    id: "open-vault-assistant",
    name: "Vault Assistant 열기",
    callback: open,
  });
}

function metadataFor(view: ItemView, path: string): RetrievalMetadata | null {
  const file = view.app.vault.getFileByPath(path);
  if (file === null) return null;
  const cache = view.app.metadataCache.getFileCache(file);
  if (cache === null) return null;
  return {
    aliases: Array.isArray(cache.frontmatter?.["aliases"])
      ? cache.frontmatter["aliases"].filter((value): value is string => typeof value === "string")
      : [],
    tags: (cache.tags ?? []).map(({ tag }) => tag),
    headings: (cache.headings ?? []).map(({ heading, position }) => ({
      heading,
      line: position.start.line + 1,
    })),
  };
}

function providerReadiness(status: RuntimeStatus): ProviderReadiness {
  if (status.status === "checking") return status;
  if (status.status === "unavailable")
    return { status: "unavailable", providerLabel: status.providerLabel ?? "AI Runtime" };
  return {
    status: "ready",
    providerLabel: status.providerLabel ?? "제공자 미확인",
    modelLabel: status.modelLabel ?? "모델 미확인",
  };
}

export type RestoredHistoryProjection = {
  readonly provider: ProviderReadiness;
  readonly result: AssistantResult;
};

export async function refreshSourceRecords(
  sources: readonly SourceRecord[],
  read: (path: string) => Promise<string | null>,
): Promise<readonly SourceRecord[]> {
  const hashes = new Map<string, Promise<string | null>>();
  return Promise.all(
    sources.map(async (source): Promise<SourceRecord> => {
      let revision = hashes.get(source.path);
      if (revision === undefined) {
        revision = read(source.path).then(async (content) => {
          if (content === null) return null;
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
          return Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
        });
        hashes.set(source.path, revision);
      }
      const hash = await revision;
      return {
        ...source,
        status: hash === null ? "missing" : hash === source.revision.hash ? "current" : "stale",
      };
    }),
  );
}

export async function projectRestoredHistory(
  state: HistoryState,
  read: (path: string) => Promise<string | null>,
): Promise<RestoredHistoryProjection | null> {
  const conversation = state.conversations.find(({ id }) => id === state.activeConversationId);
  const message = [...(conversation?.messages ?? [])]
    .reverse()
    .find(({ role }) => role === "assistant");
  if (conversation === undefined || message === undefined) return null;
  const sources = await refreshSourceRecords(
    message.citations.map((item, index) => ({
      ...item,
      id: `history-${index}`,
      status: "current",
    })),
    read,
  );
  const filesConsidered = new Set(sources.map((source) => source.path)).size;
  const missing = [
    ...new Set(
      sources.filter((source) => source.status === "missing").map((source) => source.path),
    ),
  ];
  const labels = { providerLabel: message.providerLabel, modelLabel: message.modelLabel };
  const common = {
    operationId: `history:${conversation.id}`,
    blocks: [
      { kind: "paragraph" as const, text: message.text, citationIds: sources.map(({ id }) => id) },
    ],
    sources,
    receipt: { ...labels, routeClass: "history" },
  };
  return {
    provider: { status: "ready", ...labels },
    result:
      missing.length > 0
        ? {
            ...common,
            state: "partial",
            coverage: {
              status: "partial",
              filesConsidered,
              filesRead: filesConsidered - missing.length,
              issues: missing.map((path) => ({ path, reason: "missing" })),
            },
          }
        : {
            ...common,
            state: "answered",
            coverage: {
              status: "complete",
              filesConsidered,
              filesRead: filesConsidered,
            },
          },
  };
}

function activeLeaf(leaf: WorkspaceLeaf | null): ActiveLeaf | null {
  if (leaf === null || !(leaf.view instanceof MarkdownView) || leaf.view.file === null) return null;
  const view = leaf.view;
  const file = view.file;
  if (file === null) return null;
  return { kind: "markdown", path: file.path, editorValue: () => view.editor.getValue() };
}

class VaultAssistantItemView extends ItemView {
  driver: PluginWiringDriver | null = null;
  constructor(
    leaf: WorkspaceLeaf,
    readonly tracker: ActiveDocumentTracker,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Vault Assistant";
  }
  protected override async onOpen(): Promise<void> {
    const ownerDocument = this.contentEl.ownerDocument;
    const history = await createHistoryStore(this.app, this.app.vault.getName());
    const session = new ObsidianSession({
      view: this,
      store: history,
      tracker: this.tracker,
      runtime: runtimeApi(this.app),
      document: assistantDocument(ownerDocument),
      mount: (root) => {
        const node = nodeFromDocument(root, ownerDocument);
        if (node === null) throw new TypeError("Assistant root belongs to another document");
        this.contentEl.replaceChildren(node);
      },
      metadata: (path) => metadataFor(this, path),
      refreshSources: (sources) =>
        refreshSourceRecords(sources, async (path) => {
          const file = this.app.vault.getFileByPath(path);
          if (file === null) return null;
          const leaf = this.app.workspace
            .getLeavesOfType("markdown")
            .find(
              (candidate) =>
                candidate.view instanceof MarkdownView && candidate.view.file?.path === path,
            );
          if (leaf?.view instanceof MarkdownView) return leaf.view.editor.getValue();
          return this.app.vault.cachedRead(file);
        }),
      projectProvider: providerReadiness,
      projectHistory: (state) =>
        projectRestoredHistory(state, async (path) => {
          const file = this.app.vault.getFileByPath(path);
          return file === null ? null : this.app.vault.cachedRead(file);
        }),
      openSource: (path, heading) => {
        void this.app.workspace.openLinkText(sourceLinkText(path, heading), "", false);
      },
    });
    this.driver = new PluginWiringDriver(session, session);
    session.driver = this.driver;
    await this.driver.open();
  }
  protected override readonly onClose = async (): Promise<void> => this.driver?.close();
}

export default class ProdigyVaultAssistantPlugin extends Plugin {
  private tracker: ActiveDocumentTracker | null = null;
  override onload(): void {
    this.tracker = new ActiveDocumentTracker(async (path) => {
      const file = this.app.vault.getFileByPath(path);
      return file === null ? null : this.app.vault.cachedRead(file);
    });
    this.tracker.observe(activeLeaf(this.app.workspace.getMostRecentLeaf()));
    const observe = (leaf: WorkspaceLeaf | null): void => {
      const before = this.tracker?.pinnedPath;
      this.tracker?.observe(activeLeaf(leaf));
      const changed = before !== this.tracker?.pinnedPath;
      if (!changed) return;
      for (const assistant of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        if (assistant.view instanceof VaultAssistantItemView)
          assistant.view.driver?.refreshContext(changed);
      }
    };
    this.registerEvent(this.app.workspace.on("active-leaf-change", observe));
    this.registerEvent(
      this.app.workspace.on("file-open", () => observe(this.app.workspace.getMostRecentLeaf())),
    );
    const open = () => {
      observe(this.app.workspace.getMostRecentLeaf());
      const device = Platform.isPhone ? "phone" : Platform.isTablet ? "tablet" : "desktop";
      void openAssistantLeaf(this.app.workspace, device);
    };
    registerAssistantSurface(
      this,
      open,
      (leaf) =>
        new VaultAssistantItemView(
          leaf,
          this.tracker ?? new ActiveDocumentTracker(async () => null),
        ),
    );
  }
  override onunload(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof VaultAssistantItemView) leaf.view.driver?.unload();
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}
