import { expect, test } from "bun:test";
import { createAssistantView } from "../src/assistant-view";
import { createViewModel } from "../src/view-model";
import { runtimeReceipt } from "./fixtures/assistant-result";
import { TestDocument } from "./fixtures/test-dom";

test("renders inline code and emphasis without executing provider-authored HTML", () => {
  // Given
  const view = createAssistantView(new TestDocument(), {
    onModeChange: () => undefined,
    onMentionRemove: () => undefined,
    onMentionSelect: () => undefined,
    onHistoryOpen: () => undefined,
    onSourceOpen: () => undefined,
    onSubmit: () => undefined,
    onCancel: () => undefined,
    onLater: () => undefined,
    onRetry: () => undefined,
    onSettings: () => undefined,
    onClearHistory: () => undefined,
  });
  // When
  view.render(
    createViewModel({
      mode: "current_document",
      currentDocumentLabel: "guide.md",
      mentions: [],
      mentionSuggestions: [],
      history: [],
      priorBlocks: [],
      provider: { status: "ready", providerLabel: "provider", modelLabel: "model" },
      result: {
        state: "answered",
        operationId: "operation",
        receipt: runtimeReceipt,
        coverage: { status: "complete", filesRead: 1, filesConsidered: 1 },
        sources: [],
        blocks: [
          {
            kind: "paragraph",
            text: "Use `field_key` and **required**. <img src=x onerror=alert(1)>",
            citationIds: ["source"],
          },
        ],
      },
    }),
  );
  // Then
  expect(view.root.querySelector("code")?.textContent).toBe("field_key");
  expect(view.root.querySelector("strong")?.textContent).toBe("required");
  expect(view.root.querySelector("img")).toBeNull();
  expect(view.root.querySelector(".pva-answers")?.textContent).toContain(
    "<img src=x onerror=alert(1)>",
  );
});
