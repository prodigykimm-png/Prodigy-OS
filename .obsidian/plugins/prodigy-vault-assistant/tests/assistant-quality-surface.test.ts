import { describe, expect, test } from "bun:test";
import { createAssistantView } from "../src/assistant-view";
import type { AssistantResult, EvidenceCoverage } from "../src/contracts";
import { createViewModel } from "../src/view-model";
import { runtimeReceipt } from "./fixtures/assistant-result";
import { TestDocument } from "./fixtures/test-dom";

function model(result: AssistantResult) {
  return createViewModel({
    mode: "current_document",
    currentDocumentLabel: "guide.md",
    mentions: [],
    mentionSuggestions: [],
    history: [],
    provider: { status: "ready", providerLabel: "runtime", modelLabel: "model" },
    result,
    priorBlocks: [],
  });
}

function answer(evidence: EvidenceCoverage): AssistantResult {
  return {
    state: "answered",
    operationId: "operation",
    blocks: [{ kind: "paragraph", text: "Answer", citationIds: ["source"] }],
    sources: [],
    receipt: runtimeReceipt,
    coverage: { status: "complete", filesConsidered: 1, filesRead: 1, evidence },
  };
}

describe("answer evidence coverage surface", () => {
  test("marks a selected subset as a warning even when every file was readable", () => {
    // Given
    const result = answer({ mode: "selected", selectedChunks: 3, totalChunks: 12, bytes: 7100 });
    // When
    const viewModel = model(result);
    // Then
    expect(viewModel.statusKind).toBe("warning");
    expect(viewModel.coverageText).not.toBe(
      model(
        answer({
          mode: "full",
          selectedChunks: 12,
          totalChunks: 12,
          bytes: 7100,
        }),
      ).coverageText,
    );
  });

  test("exposes machine-readable evidence mode on the real view boundary", () => {
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
      model(answer({ mode: "selected", selectedChunks: 2, totalChunks: 15, bytes: 1700 })),
    );
    // Then
    expect(view.root.getAttribute("data-evidence-mode")).toBe("selected");
    expect(view.root.querySelector(".pva-status")?.getAttribute("data-selected-chunks")).toBe("2");
    expect(view.root.querySelector(".pva-status")?.getAttribute("data-total-chunks")).toBe("15");
  });

  test("warns when a restored answer has a changed source", () => {
    // Given
    const result = answer({ mode: "full", selectedChunks: 1, totalChunks: 1, bytes: 100 });
    if (result.state !== "answered") throw new TypeError("Expected answer fixture");
    // When
    const viewModel = model({
      ...result,
      sources: [
        {
          id: "source",
          status: "stale",
          path: "guide.md",
          startLine: 1,
          endLine: 2,
          revision: { algorithm: "sha256", hash: "old", capturedAt: 1 },
        },
      ],
    });
    // Then
    expect(viewModel.statusKind).toBe("warning");
    expect(viewModel.sources[0]?.status).toBe("stale");
  });
});
