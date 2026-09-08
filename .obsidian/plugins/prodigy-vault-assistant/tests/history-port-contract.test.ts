import { expect, test } from "bun:test";
import type { HistoryMessage, HistoryPort } from "../src/contracts";
import { HistoryStore } from "../src/history-store";

type HistoryMessageWithRequiredLabels =
  Omit<HistoryMessage, "providerLabel" | "modelLabel"> extends HistoryMessage
    ? never
    : HistoryMessage;

const activeSignal = new AbortController().signal;

const persistedMessage: HistoryMessageWithRequiredLabels = {
  role: "assistant",
  text: "Grounded answer",
  timestamp: 1,
  mode: "whole_vault",
  citations: [],
  providerLabel: "Local Provider",
  modelLabel: "Grounded Model",
};

test("requires persisted labels through the concrete history port", async () => {
  const app = {
    loadLocalStorage: (_key: string): unknown => null,
    saveLocalStorage: (_key: string, _value: unknown): void => {},
  };
  const store = new HistoryStore(app, "history-key");
  const port: HistoryPort = store;

  const state = await port.appendExchange(
    {
      conversationId: "conversation-1",
      question: "Question",
      answer: persistedMessage.text,
      timestamp: persistedMessage.timestamp,
      mode: persistedMessage.mode,
      citations: persistedMessage.citations,
      providerLabel: persistedMessage.providerLabel,
      modelLabel: persistedMessage.modelLabel,
    },
    activeSignal,
  );
  if (state === null) throw new TypeError("expected committed history");

  expect(port.storageKey).toBe("history-key");
  expect(state.conversations[0]?.messages[1]?.providerLabel).toBe("Local Provider");
  expect(state.conversations[0]?.messages[1]?.modelLabel).toBe("Grounded Model");
});
