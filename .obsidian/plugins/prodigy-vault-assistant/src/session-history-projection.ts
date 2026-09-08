import type { AnswerBlock, HistoryState } from "./contracts";

function activeMessages(state: HistoryState) {
  return state.conversations.find(({ id }) => id === state.activeConversationId)?.messages ?? [];
}

export function dialogueFromHistory(
  state: HistoryState,
): readonly { readonly role: "user" | "assistant"; readonly text: string }[] {
  return activeMessages(state).map(({ role, text }) => ({ role, text }));
}

export function historySummaries(
  state: HistoryState,
): readonly { readonly id: string; readonly label: string }[] {
  return state.conversations.map(({ id, messages }) => ({
    id,
    label: messages[0]?.text ?? id,
  }));
}

export function priorBlocksFromHistory(state: HistoryState): readonly AnswerBlock[] {
  const message = [...activeMessages(state)].reverse().find(({ role }) => role === "assistant");
  return message === undefined ? [] : [{ kind: "paragraph", text: message.text, citationIds: [] }];
}
