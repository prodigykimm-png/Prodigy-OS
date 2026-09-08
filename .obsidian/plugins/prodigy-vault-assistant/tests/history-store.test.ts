import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { App } from "obsidian";
import type { HistoryExchange, HistoryPort } from "../src/contracts";
import { createHistoryStore, HISTORY_MAX_BYTES, HISTORY_MAX_MESSAGES } from "../src/history-store";

const activeSignal = new AbortController().signal;

const forbidden = {
  evidence: "EVIDENCE_BODY_SENTINEL",
  prompt: "SYSTEM_PROMPT_SENTINEL",
  receipt: "RUNTIME_RECEIPT_SENTINEL",
  secret: "SECRET_SENTINEL",
} as const;

class FakeLocalStorage {
  readonly values = new Map<string, unknown>();
  failLoads = false;
  failSaves = false;

  readonly app = {
    loadLocalStorage: (key: string): unknown | null => {
      if (this.failLoads) {
        throw new TypeError("load unavailable");
      }
      return this.values.get(key) ?? null;
    },
    saveLocalStorage: (key: string, value: unknown | null): void => {
      if (this.failSaves) {
        throw new TypeError("save unavailable");
      }
      if (value === null) {
        this.values.delete(key);
        return;
      }
      this.values.set(key, value);
    },
  } satisfies Pick<App, "loadLocalStorage" | "saveLocalStorage">;
}

const citation = {
  path: "People/민수.md",
  heading: "만남",
  startLine: 8,
  endLine: 10,
  revision: { algorithm: "sha256", hash: "source-revision", capturedAt: 100 },
} as const;

function exchange(timestamp: number, suffix = ""): HistoryExchange {
  return {
    question: `누구와 만났지${suffix}`,
    answer: `민수와 만났습니다${suffix}`,
    timestamp,
    mode: "whole_vault",
    currentPath: "DAILY/2026-09-04.md",
    citations: [citation],
    providerLabel: "Local Provider",
    modelLabel: "Grounded Model",
  };
}

type PortExchange = Parameters<HistoryPort["appendExchange"]>[0];
type RequiredPortExchange =
  Omit<PortExchange, "providerLabel" | "modelLabel"> extends PortExchange ? never : PortExchange;

function requiredPortExchange(): RequiredPortExchange {
  return exchange(100);
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

describe("history store", () => {
  test("preserves required labels through the canonical port after restore", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const first: HistoryPort = await createHistoryStore(localStorage.app, "Dusk-port");
    await first.appendExchange(requiredPortExchange(), activeSignal);

    // When
    const reopened: HistoryPort = await createHistoryStore(localStorage.app, "Dusk-port");
    const restored = await reopened.load();

    // Then
    expect(
      restored.conversations[0]?.messages.map((message) => [
        message.providerLabel,
        message.modelLabel,
      ]),
    ).toEqual([
      ["Local Provider", "Grounded Model"],
      ["Local Provider", "Grounded Model"],
    ]);
  });

  test("reopens recent conversations on the same device", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const first = await createHistoryStore(localStorage.app, "Dusk");

    // When
    const saved = await first.appendExchange(exchange(100), activeSignal);
    if (saved === null) throw new TypeError("expected committed history");
    const reopened = await createHistoryStore(localStorage.app, "Dusk");
    const restored = await reopened.load();

    // Then
    expect(restored).toEqual(saved);
    expect(restored.conversations[0]?.messages[1]?.citations).toEqual([citation]);
    expect(localStorage.values.has(first.storageKey)).toBe(true);
    expect(first.storageKey).toBe(
      `prodigy.vault-assistant.history.v1:${createHash("sha256").update("Dusk").digest("hex")}`,
    );
  });

  test("orders conversations by most recent update", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const store = await createHistoryStore(localStorage.app, "Dusk");
    const first = await store.appendExchange(exchange(100, "-first"), activeSignal);
    if (first === null) throw new TypeError("expected committed history");
    const firstId = first.activeConversationId;
    if (firstId === null) throw new TypeError("missing active conversation");
    const secondId = store.createConversationId();
    await store.appendExchange(
      { ...exchange(200, "-second"), conversationId: secondId },
      activeSignal,
    );

    // When
    const updated = await store.appendExchange(
      {
        ...exchange(300, "-updated"),
        conversationId: firstId,
      },
      activeSignal,
    );
    if (updated === null) throw new TypeError("expected committed history");

    // Then
    expect(updated.conversations.map((conversation) => conversation.id)).toEqual([
      firstId,
      secondId,
    ]);
  });

  test("evicts whole oldest exchanges at the thirty-message limit", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const store = await createHistoryStore(localStorage.app, "Dusk");

    // When
    for (let index = 0; index < HISTORY_MAX_MESSAGES / 2 + 1; index += 1) {
      await store.appendExchange(exchange(index, `-${index}`), activeSignal);
    }
    const state = await store.load();
    const messages = state.conversations.flatMap((conversation) => conversation.messages);

    // Then
    expect(messages).toHaveLength(HISTORY_MAX_MESSAGES);
    expect(messages[0]?.text).toBe("누구와 만났지-1");
    expect(messages[1]?.role).toBe("assistant");
  });

  test("evicts whole oldest exchanges at the sixty-four-kibibyte limit", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const store = await createHistoryStore(localStorage.app, "Dusk");
    const large = "가".repeat(5_000);

    // When
    for (let index = 0; index < 5; index += 1) {
      await store.appendExchange(exchange(index, `${index}-${large}`), activeSignal);
    }
    const state = await store.load();

    // Then
    expect(serializedBytes(state)).toBeLessThanOrEqual(HISTORY_MAX_BYTES);
    const retained = state.conversations[0];
    if (retained === undefined) throw new TypeError("expected a retained exchange");
    expect(retained.messages.length % 2).toBe(0);
    expect(state.conversations[0]?.messages[0]?.text.startsWith("누구와 만났지0-")).toBe(false);
  });

  test("discards corrupt state and unknown versions", async () => {
    // Given
    const corruptStorage = new FakeLocalStorage();
    const corruptStore = await createHistoryStore(corruptStorage.app, "Dusk-corrupt");
    corruptStorage.values.set(corruptStore.storageKey, { version: 1, conversations: "bad" });
    const versionStorage = new FakeLocalStorage();
    const versionStore = await createHistoryStore(versionStorage.app, "Dusk-version");
    versionStorage.values.set(versionStore.storageKey, {
      version: 2,
      activeConversationId: null,
      conversations: [],
    });

    // When
    const corrupt = await corruptStore.load();
    const mismatched = await versionStore.load();

    // Then
    expect(corrupt.conversations).toEqual([]);
    expect(mismatched.conversations).toEqual([]);
    expect(corruptStorage.values.has(corruptStore.storageKey)).toBe(false);
    expect(versionStorage.values.has(versionStore.storageKey)).toBe(false);
  });

  test("falls back when local storage fails", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const store = await createHistoryStore(localStorage.app, "Dusk");
    localStorage.failSaves = true;

    // When
    const saved = await store.appendExchange(exchange(100), activeSignal);
    if (saved === null) throw new TypeError("expected committed history");
    localStorage.failLoads = true;
    const restored = await store.load();

    // Then
    expect(restored).toEqual(saved);
    expect(restored.conversations[0]?.messages[1]?.text).toBe("민수와 만났습니다");
  });

  test("clears persisted and fallback history", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const store = await createHistoryStore(localStorage.app, "Dusk");
    await store.appendExchange(exchange(100), activeSignal);

    // When
    await store.clear();
    const cleared = await store.load();

    // Then
    expect(cleared.activeConversationId).toBeNull();
    expect(cleared.conversations).toEqual([]);
    expect(localStorage.values.has(store.storageKey)).toBe(false);
  });

  test("never persists evidence bodies, prompts, receipts, errors, or secrets", async () => {
    // Given
    const localStorage = new FakeLocalStorage();
    const store = await createHistoryStore(localStorage.app, "Dusk");
    const untrusted = {
      ...exchange(100),
      evidenceBody: forbidden.evidence,
      systemPrompt: forbidden.prompt,
      runtimeReceipt: forbidden.receipt,
      error: "ERROR_SENTINEL",
      secret: forbidden.secret,
    };

    // When
    await store.appendExchange(untrusted, activeSignal);
    const serialized = JSON.stringify(localStorage.values.get(store.storageKey));

    // Then
    for (const sentinel of Object.values(forbidden)) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(serialized).not.toContain("ERROR_SENTINEL");
    expect(serialized).not.toContain("evidenceBody");
    expect(serialized).not.toContain("systemPrompt");
    expect(serialized).not.toContain("runtimeReceipt");
    expect(serialized).not.toContain("secret");
  });
});
