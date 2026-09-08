import type { App } from "obsidian";
import type {
  ConversationHistory,
  HistoryCitation,
  HistoryExchange,
  HistoryMessage,
  HistoryPort,
  HistoryState,
  SourceRevision,
} from "./contracts";

export const HISTORY_MAX_MESSAGES = 30,
  HISTORY_MAX_BYTES = 64 * 1024;

type LocalStoragePort = Pick<App, "loadLocalStorage" | "saveLocalStorage">;
function emptyState(): HistoryState {
  return { version: 1, activeConversationId: null, conversations: [] };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRevision(value: unknown): SourceRevision | null {
  if (!isRecord(value)) return null;
  const { algorithm, hash, capturedAt } = value;
  return algorithm === "sha256" && typeof hash === "string" && typeof capturedAt === "number"
    ? { algorithm, hash, capturedAt }
    : null;
}

function parseCitation(value: unknown): HistoryCitation | null {
  if (!isRecord(value)) return null;
  const { path, heading, startLine, endLine } = value;
  const revision = parseRevision(value["revision"]);
  if (
    typeof path !== "string" ||
    (heading !== undefined && typeof heading !== "string") ||
    typeof startLine !== "number" ||
    typeof endLine !== "number" ||
    revision === null
  ) {
    return null;
  }
  return { path, ...(heading === undefined ? {} : { heading }), startLine, endLine, revision };
}

function parseMessage(value: unknown): HistoryMessage | null {
  if (!isRecord(value)) return null;
  const { role, text, timestamp, mode, currentPath, providerLabel, modelLabel, citations } = value;
  if (
    (role !== "user" && role !== "assistant") ||
    typeof text !== "string" ||
    typeof timestamp !== "number" ||
    (mode !== "current_document" && mode !== "whole_vault") ||
    (currentPath !== undefined && typeof currentPath !== "string") ||
    typeof providerLabel !== "string" ||
    typeof modelLabel !== "string" ||
    !Array.isArray(citations)
  ) {
    return null;
  }
  const parsedCitations = citations.map(parseCitation);
  if (parsedCitations.some((citation) => citation === null)) return null;
  return {
    role,
    text,
    timestamp,
    mode,
    ...(currentPath === undefined ? {} : { currentPath }),
    citations: parsedCitations.filter((citation) => citation !== null),
    providerLabel,
    modelLabel,
  };
}

function parseConversation(value: unknown): ConversationHistory | null {
  if (!isRecord(value)) return null;
  const { id, createdAt, updatedAt, messages } = value;
  if (
    typeof id !== "string" ||
    typeof createdAt !== "number" ||
    typeof updatedAt !== "number" ||
    !Array.isArray(messages)
  ) {
    return null;
  }
  const parsed = messages.map(parseMessage);
  if (parsed.some((message) => message === null) || parsed.length % 2 !== 0) return null;
  const clean = parsed.filter((message) => message !== null);
  for (let index = 0; index < clean.length; index += 2) {
    if (clean[index]?.role !== "user" || clean[index + 1]?.role !== "assistant") return null;
  }
  return { id, createdAt, updatedAt, messages: clean };
}

function parseState(value: unknown): HistoryState | null {
  if (!isRecord(value) || value["version"] !== 1) return null;
  const { activeConversationId, conversations } = value;
  if (
    (activeConversationId !== null && typeof activeConversationId !== "string") ||
    !Array.isArray(conversations)
  ) {
    return null;
  }
  const parsed = conversations.map(parseConversation);
  if (parsed.some((conversation) => conversation === null)) return null;
  const clean = parsed
    .filter((conversation) => conversation !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
  if (
    activeConversationId !== null &&
    !clean.some((conversation) => conversation.id === activeConversationId)
  ) {
    return null;
  }
  return { version: 1, activeConversationId, conversations: clean };
}

function evictOldestExchange(state: HistoryState): HistoryState {
  let oldest: { readonly id: string; readonly timestamp: number } | null = null;
  for (const conversation of state.conversations) {
    const timestamp = conversation.messages[0]?.timestamp;
    if (timestamp !== undefined && (oldest === null || timestamp < oldest.timestamp)) {
      oldest = { id: conversation.id, timestamp };
    }
  }
  if (oldest === null) return state;
  const conversations = state.conversations
    .map((conversation) =>
      conversation.id === oldest.id
        ? { ...conversation, messages: conversation.messages.slice(2) }
        : conversation,
    )
    .filter((conversation) => conversation.messages.length > 0);
  const activeConversationId = conversations.some(
    (conversation) => conversation.id === state.activeConversationId,
  )
    ? state.activeConversationId
    : (conversations[0]?.id ?? null);
  return { ...state, activeConversationId, conversations };
}

function boundState(input: HistoryState): HistoryState {
  let state = input;
  const size = (value: HistoryState): number =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const count = (value: HistoryState): number =>
    value.conversations.reduce((total, item) => total + item.messages.length, 0);
  while (count(state) > HISTORY_MAX_MESSAGES || size(state) > HISTORY_MAX_BYTES) {
    const next = evictOldestExchange(state);
    if (next === state) return emptyState();
    state = next;
  }
  return state;
}

function message(exchange: HistoryExchange, role: "user" | "assistant"): HistoryMessage {
  return {
    role,
    text: role === "user" ? exchange.question : exchange.answer,
    timestamp: exchange.timestamp,
    mode: exchange.mode,
    ...(exchange.currentPath === undefined ? {} : { currentPath: exchange.currentPath }),
    citations: role === "user" ? [] : exchange.citations,
    providerLabel: exchange.providerLabel,
    modelLabel: exchange.modelLabel,
  };
}

export class HistoryStore implements HistoryPort {
  private memoryState: HistoryState | null = null;

  constructor(
    private readonly app: LocalStoragePort,
    readonly storageKey: string,
  ) {}

  createConversationId(): string {
    return crypto.randomUUID();
  }

  async load(): Promise<HistoryState> {
    if (this.memoryState !== null) return this.memoryState;
    let raw: unknown;
    try {
      raw = this.app.loadLocalStorage(this.storageKey);
    } catch {
      // no-excuse-ok: catch -- external storage failure degrades to session memory.
      return emptyState();
    }
    if (raw === null) return emptyState();
    const parsed = parseState(raw);
    if (parsed !== null) return boundState(parsed);
    await this.clear();
    return emptyState();
  }

  async appendExchange(
    exchange: HistoryExchange,
    signal: AbortSignal,
  ): Promise<HistoryState | null> {
    if (signal.aborted) return null;
    const state = await this.load();
    if (signal.aborted) return null;
    const id = exchange.conversationId ?? state.activeConversationId ?? this.createConversationId();
    const existing = state.conversations.find((conversation) => conversation.id === id);
    const conversation: ConversationHistory = {
      id,
      createdAt: existing?.createdAt ?? exchange.timestamp,
      updatedAt: exchange.timestamp,
      messages: [
        ...(existing?.messages ?? []),
        message(exchange, "user"),
        message(exchange, "assistant"),
      ],
    };
    const conversations = [
      conversation,
      ...state.conversations.filter((candidate) => candidate.id !== id),
    ].sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
    const next = boundState({ version: 1, activeConversationId: id, conversations });
    return this.persist(next, signal) ? next : null;
  }

  async clear(): Promise<void> {
    try {
      this.app.saveLocalStorage(this.storageKey, null);
      this.memoryState = null;
    } catch {
      // no-excuse-ok: catch -- tombstone prevents stale data from resurfacing this session.
      this.memoryState = emptyState();
    }
  }

  private persist(state: HistoryState, signal: AbortSignal): boolean {
    if (signal.aborted) return false;
    try {
      this.app.saveLocalStorage(this.storageKey, state);
      this.memoryState = null;
    } catch {
      // no-excuse-ok: catch -- save failure intentionally uses session memory.
      this.memoryState = state;
    }
    return true;
  }
}

export async function createHistoryStore(
  app: LocalStoragePort,
  vaultIdentity: string,
): Promise<HistoryStore> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(vaultIdentity));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return new HistoryStore(app, `prodigy.vault-assistant.history.v1:${hash}`);
}
