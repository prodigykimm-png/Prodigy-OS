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
import type { AssistantResult, HistoryCitation, HistoryState, SourceRecord } from "./contracts";
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
};
export type DeviceClass = "phone" | "tablet" | "desktop";
export interface AssistantLeaf {
  readonly setViewState: (state: { readonly type: string; readonly active: true }) => Promise<void>;
}
export interface AssistantWorkspace<Leaf extends AssistantLeaf = AssistantLeaf> {
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

async function restoredSource(
  citation: HistoryCitation,
  index: number,
  read: (path: string) => Promise<string | null>,
): Promise<SourceRecord> {
  const content = await read(citation.path);
  if (content === null) return { id: `history-${index}`, status: "missing", ...citation };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    id: `history-${index}`,
    status: hash === citation.revision.hash ? "current" : "stale",
    ...citation,
  };
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
  const sources = await Promise.all(
    message.citations.map((item, index) => restoredSource(item, index, read)),
  );
  const labels = { providerLabel: message.providerLabel, modelLabel: message.modelLabel };
  return {
    provider: { status: "ready", ...labels },
    result: {
      state: "answered",
      operationId: `history:${conversation.id}`,
      blocks: [{ kind: "paragraph", text: message.text, citationIds: sources.map(({ id }) => id) }],
      sources,
      coverage: {
        status: "complete",
        filesConsidered: sources.length,
        filesRead: sources.filter(({ status }) => status !== "missing").length,
      },
      receipt: { ...labels, routeClass: "history" },
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
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) =>
        this.tracker?.observe(activeLeaf(leaf)),
      ),
    );
    const open = () => {
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
