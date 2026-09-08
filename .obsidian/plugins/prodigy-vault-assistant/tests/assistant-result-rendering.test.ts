import { describe, expect, test } from "bun:test";
import { createAssistantView } from "../src/assistant-view";
import type { AssistantResult, Coverage, RuntimeRecoveryAction } from "../src/contracts";
import { type AssistantViewInput, createViewModel } from "../src/view-model";
import { runtimeReceipt } from "./fixtures/assistant-result";
import { TestDocument } from "./fixtures/test-dom";

const coverage = {
  status: "complete",
  filesConsidered: 2,
  filesRead: 2,
} as const satisfies Coverage;

function input(result: AssistantResult): AssistantViewInput {
  return {
    mode: "whole_vault",
    currentDocumentLabel: null,
    mentions: [],
    mentionSuggestions: [],
    history: [],
    provider: {
      status: "ready",
      providerLabel: "stale-readiness-provider",
      modelLabel: "stale-readiness-model",
    },
    result,
    priorBlocks: [{ kind: "paragraph", text: "보존할 이전 답변", citationIds: [] }],
  };
}

function mount(result: AssistantResult) {
  const document = new TestDocument();
  const calls: string[] = [];
  const view = createAssistantView(document, {
    onModeChange: () => undefined,
    onMentionRemove: () => undefined,
    onMentionSelect: () => undefined,
    onHistoryOpen: () => undefined,
    onSourceOpen: () => undefined,
    onSubmit: () => undefined,
    onCancel: () => calls.push("cancel"),
    onLater: () => calls.push("later"),
    onRetry: () => calls.push("retry"),
    onSettings: () => calls.push("settings"),
    onClearHistory: () => undefined,
  });
  view.render(createViewModel(input(result)));
  return { view, calls };
}

function runtimeError(action: RuntimeRecoveryAction): AssistantResult {
  return {
    state: "error",
    operationId: `operation-${action}`,
    code: "provider_error",
    message: "Provider request failed",
    recovery: { action },
  };
}

describe("Canonical Assistant result rendering", () => {
  test("uses the completed request receipt for the read-only provider display", () => {
    // Given
    const answered = {
      state: "answered",
      operationId: "operation-answered",
      blocks: [],
      sources: [],
      coverage,
      receipt: runtimeReceipt,
    } as const satisfies AssistantResult;

    // When
    const { view } = mount(answered);

    // Then
    expect(view.root.querySelector(".pva-provider")?.textContent).toBe(
      "local-runtime / configured-model-v2",
    );
    expect(view.root.textContent).not.toContain("stale-readiness-model");
  });

  test("uses the completed request receipt for a partial answer", () => {
    // Given
    const partial = {
      state: "partial",
      operationId: "operation-partial",
      blocks: [],
      sources: [],
      coverage: {
        status: "partial",
        filesConsidered: 2,
        filesRead: 1,
        issues: [{ path: "Archive/offloaded.md", reason: "unreadable" }],
      },
      receipt: runtimeReceipt,
    } as const satisfies AssistantResult;

    // When
    const { view } = mount(partial);

    // Then
    expect(view.root.querySelector(".pva-provider")?.textContent).toBe(
      "local-runtime / configured-model-v2",
    );
  });

  test("offers only the runtime recovery action and invokes that exact control", () => {
    // Given
    const actions = ["settings", "retry", "later", "cancel"] as const;

    // When
    const observed = actions.map((action) => {
      const mounted = mount(runtimeError(action));
      const actionArea = mounted.view.root.querySelector(".pva-actions");
      const controls = actionArea
        ?.querySelectorAll("[data-action]")
        .map((control) => control.getAttribute("data-action"));
      actionArea?.querySelector(`[data-action=${action}]`)?.click();
      return { controls, calls: mounted.calls };
    });

    // Then
    expect(observed).toEqual(actions.map((action) => ({ controls: [action], calls: [action] })));
  });

  test("keeps local read errors free of runtime-only metadata and settings recovery", () => {
    // Given
    const localError = {
      state: "error",
      operationId: "operation-read",
      code: "read_error",
      message: "Vault file could not be read",
    } as const satisfies AssistantResult;

    // When
    const { view } = mount(localError);

    // Then
    expect(Object.keys(localError).sort()).toEqual(["code", "message", "operationId", "state"]);
    expect(
      view.root
        .querySelector(".pva-actions")
        ?.querySelectorAll("[data-action]")
        .map((control) => control.getAttribute("data-action")),
    ).toEqual(["retry"]);
  });
  test("renders every tagged state through the same semantic surface", () => {
    // Given
    const states = [
      { state: "idle" },
      { state: "retrieving", operationId: "operation-retrieving" },
      { state: "answering", operationId: "operation-answering", coverage },
      {
        state: "answered",
        operationId: "operation-answered",
        blocks: [],
        sources: [],
        coverage,
        receipt: runtimeReceipt,
      },
      { state: "no_evidence", operationId: "operation-empty", coverage },
      {
        state: "partial",
        operationId: "operation-partial",
        blocks: [],
        sources: [],
        coverage: {
          status: "partial",
          filesConsidered: 2,
          filesRead: 1,
          issues: [{ path: "Archive/offloaded.md", reason: "unreadable" }],
        },
        receipt: runtimeReceipt,
      },
      { state: "error", operationId: "operation-read", code: "read_error", message: "Read failed" },
      { state: "cancelled", operationId: "operation-cancelled" },
    ] as const satisfies readonly AssistantResult[];

    // When
    const rendered = states.map((state) => mount(state).view.root.getAttribute("data-state"));

    // Then
    expect(rendered).toEqual(states.map(({ state }) => state));
  });
});
