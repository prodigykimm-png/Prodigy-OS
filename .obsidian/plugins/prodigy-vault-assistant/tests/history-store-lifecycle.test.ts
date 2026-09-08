import { describe, expect, test } from "bun:test";
import type { HistoryExchange, HistoryPort } from "../src/contracts";
import { HistoryStore } from "../src/history-store";
import { commitGuardedAnswer } from "../src/mentions";

const exchange: HistoryExchange = {
  conversationId: "conversation-1",
  question: "Question",
  answer: "Grounded answer",
  timestamp: 1,
  mode: "whole_vault",
  citations: [],
  providerLabel: "Local Provider",
  modelLabel: "Grounded Model",
};

class LifecycleStorage {
  readonly values = new Map<string, unknown>();
  loadCount = 0;
  saveCount = 0;
  onLoad: () => void = () => undefined;

  readonly app = {
    loadLocalStorage: (key: string): unknown | null => {
      this.loadCount += 1;
      this.onLoad();
      return this.values.get(key) ?? null;
    },
    saveLocalStorage: (key: string, value: unknown | null): void => {
      this.saveCount += 1;
      if (value === null) this.values.delete(key);
      else this.values.set(key, value);
    },
  };
}

describe("history store lifecycle cancellation", () => {
  test("does not persist or apply when lifecycle aborts during the internal load await", async () => {
    // Given
    const storage = new LifecycleStorage();
    const store = new HistoryStore(storage.app, "history-key");
    const controller = new AbortController();
    let generation = 1;
    const applied: string[] = [];
    storage.onLoad = () => {
      generation += 1;
      controller.abort();
    };

    // When
    const committed = await commitGuardedAnswer({
      capturedGeneration: 1,
      currentGeneration: () => generation,
      answer: async () => "answer",
      prepare: async () => exchange,
      persist: (prepared) => store.appendExchange(prepared, controller.signal),
      apply: (value) => applied.push(value),
    });
    storage.onLoad = () => undefined;
    const state = await store.load();

    // Then
    expect({ committed, saveCount: storage.saveCount, applied, generation, state }).toEqual({
      committed: false,
      saveCount: 0,
      applied: [],
      generation: 2,
      state: { version: 1, activeConversationId: null, conversations: [] },
    });
  });

  test("does not load or save when append starts already aborted", async () => {
    // Given
    const storage = new LifecycleStorage();
    const store: HistoryPort = new HistoryStore(storage.app, "history-key");
    const controller = new AbortController();
    controller.abort();

    // When
    const state = await store.appendExchange(exchange, controller.signal);

    // Then
    expect({ state, loadCount: storage.loadCount, saveCount: storage.saveCount }).toEqual({
      state: null,
      loadCount: 0,
      saveCount: 0,
    });
  });

  test("persists and returns a normal current append", async () => {
    // Given
    const storage = new LifecycleStorage();
    const store: HistoryPort = new HistoryStore(storage.app, "history-key");
    const signal = new AbortController().signal;

    // When
    const state = await store.appendExchange(exchange, signal);

    // Then
    expect({
      saveCount: storage.saveCount,
      activeConversationId: state?.activeConversationId,
      messages: state?.conversations[0]?.messages.map(({ role, text }) => ({ role, text })),
    }).toEqual({
      saveCount: 1,
      activeConversationId: "conversation-1",
      messages: [
        { role: "user", text: "Question" },
        { role: "assistant", text: "Grounded answer" },
      ],
    });
  });
});
