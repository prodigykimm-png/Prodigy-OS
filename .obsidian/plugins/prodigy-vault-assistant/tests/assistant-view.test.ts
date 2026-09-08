import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { createAssistantView } from "../src/assistant-view";
import type { AssistantResult, Coverage, SourceRecord } from "../src/contracts";
import { type AssistantViewInput, createViewModel } from "../src/view-model";
import { runtimeReceipt } from "./fixtures/assistant-result";
import { keydown, TestDocument } from "./fixtures/test-dom";

const complete = {
  status: "complete",
  filesConsidered: 3,
  filesRead: 3,
} as const satisfies Coverage;
const partial = {
  status: "partial",
  filesConsidered: 3,
  filesRead: 2,
  issues: [{ path: "오프라인.md", reason: "unreadable" }],
} as const satisfies Coverage;
const source = {
  id: "source-1",
  status: "current",
  path: "People/김민수.md",
  heading: "최근 만남",
  startLine: 3,
  endLine: 5,
  revision: { algorithm: "sha256", hash: "abc", capturedAt: 1 },
} as const satisfies SourceRecord;

function input(result: AssistantResult): AssistantViewInput {
  return {
    mode: "current_document",
    currentDocumentLabel: "INBOX/긴 한국어 문서.md",
    mentions: [{ kind: "vault_file", path: "People/김민수.md", label: "김민수" }],
    mentionSuggestions: [{ kind: "vault_file", path: "DAILY/2026-09-04.md", label: "2026-09-04" }],
    history: [{ id: "history-1", label: "지난 대화" }],
    provider: { status: "ready", providerLabel: "Local Runtime", modelLabel: "Inherited" },
    result,
    priorBlocks: [{ kind: "paragraph", text: "보존할 이전 답변", citationIds: [] }],
  };
}

function mount(result: AssistantResult = { state: "idle" }) {
  const document = new TestDocument();
  const calls: string[] = [];
  const view = createAssistantView(document, {
    onModeChange: (mode) => calls.push(`mode:${mode}`),
    onMentionRemove: (path) => calls.push(`remove:${path}`),
    onMentionSelect: (path) => calls.push(`mention:${path}`),
    onHistoryOpen: (id) => calls.push(`history:${id}`),
    onSourceOpen: (path, heading) => calls.push(`source:${path}#${heading ?? ""}`),
    onSubmit: (question) => calls.push(`submit:${question}`),
    onCancel: () => calls.push("cancel"),
    onLater: () => calls.push("later"),
    onRetry: () => calls.push("retry"),
    onSettings: () => calls.push("settings"),
    onClearHistory: () => calls.push("clear"),
  });
  view.render(createViewModel(input(result)));
  return { document, view, calls };
}

describe("Assistant view", () => {
  test("renders answered state with clickable source links", () => {
    // Given
    const answered = {
      state: "answered",
      operationId: "op",
      blocks: [{ kind: "paragraph", text: "어제 함께 마셨습니다.", citationIds: ["source-1"] }],
      sources: [source],
      coverage: complete,
      receipt: runtimeReceipt,
    } as const satisfies AssistantResult;
    const { view, calls } = mount(answered);

    // When
    view.root.querySelector("[data-source-path]")?.click();

    // Then
    expect(view.root.getAttribute("data-state")).toBe("answered");
    expect(view.root.textContent).toContain("어제 함께 마셨습니다.");
    expect(calls).toContain("source:People/김민수.md#최근 만남");
  });

  test("wraps keyboard mode navigation in both directions", () => {
    // Given
    const { view, calls } = mount();
    const current = view.root.querySelector('[role="tab"][data-mode="current_document"]');
    const whole = view.root.querySelector('[role="tab"][data-mode="whole_vault"]');

    // When
    current?.dispatchEvent(keydown("ArrowLeft"));
    whole?.dispatchEvent(keydown("ArrowRight"));

    // Then
    expect(calls).toEqual(["mode:whole_vault", "mode:current_document"]);
    expect(current?.getAttribute("tabindex")).toBe("0");
    expect(whole?.getAttribute("tabindex")).toBe("-1");
  });

  test("renders source status and disables only invalid local links", () => {
    // Given
    const variants = [
      source,
      { ...source, id: "source-2", status: "stale" },
      { ...source, id: "source-3", status: "missing" },
    ] as const satisfies readonly SourceRecord[];
    const answered = {
      state: "answered",
      operationId: "op",
      blocks: [],
      sources: variants,
      coverage: complete,
      receipt: runtimeReceipt,
    } as const satisfies AssistantResult;
    const { view, calls } = mount(answered);

    // When
    for (const link of view.root.querySelectorAll("[data-source-path]")) link.click();

    // Then
    expect(view.root.querySelectorAll("[data-source-status=current]")).toHaveLength(1);
    expect(view.root.querySelectorAll("[data-source-status=stale]")).toHaveLength(1);
    expect(view.root.querySelectorAll("[data-source-status=missing]")).toHaveLength(1);
    expect(view.root.querySelector("[data-source-status=stale]")?.textContent).toContain("변경됨");
    expect(view.root.querySelector("[data-source-status=missing]")?.textContent).toContain(
      "삭제됨",
    );
    expect(view.root.textContent).toContain("3-5행");
    expect(calls.filter((call) => call.startsWith("source:"))).toHaveLength(2);
  });

  test("renders mention chips, suggestions, provider status, and history controls", () => {
    // Given / When
    const { view, calls } = mount();
    view.root.querySelector("[data-mention-remove]")?.click();
    view.root.querySelector("[data-mention-suggestion]")?.click();
    view.root.querySelector("[data-history-id]")?.click();

    // Then
    expect(view.root.textContent).toContain("Local Runtime");
    expect(view.root.textContent).toContain("Inherited");
    expect(calls).toEqual([
      "remove:People/김민수.md",
      "mention:DAILY/2026-09-04.md",
      "history:history-1",
    ]);
  });

  test("keeps prior content during provider error", () => {
    // Given / When
    const { view } = mount({
      state: "error",
      operationId: "op",
      code: "provider_error",
      message: "Provider unavailable",
      recovery: { action: "retry" },
    });

    // Then
    expect(view.root.textContent).toContain("보존할 이전 답변");
    expect(view.root.querySelector("[data-action=retry]")).not.toBeNull();
    expect(view.root.querySelector("[data-action=settings]")).toBeNull();
    expect(view.root.querySelector("[role=alert]")).not.toBeNull();
  });

  test("shows no evidence without an answer", () => {
    // Given / When
    const { view } = mount({ state: "no_evidence", operationId: "op", coverage: complete });

    // Then
    expect(view.root.querySelector("[data-answer-block]")).toBeNull();
    expect(view.root.querySelector("[role=status]")?.textContent).toContain("근거");
  });

  test("renders partial and cancelled recovery states", () => {
    // Given
    const partialResult = {
      state: "partial",
      operationId: "op",
      blocks: [{ kind: "paragraph", text: "확인된 답변", citationIds: ["source-1"] }],
      sources: [source],
      coverage: partial,
      receipt: runtimeReceipt,
    } as const satisfies AssistantResult;
    const mounted = mount(partialResult);

    // When
    mounted.view.render(createViewModel(input({ state: "cancelled", operationId: "op" })));

    // Then
    expect(mounted.view.root.textContent).toContain("보존할 이전 답변");
    expect(mounted.view.root.querySelector("[data-action=retry]")).not.toBeNull();
  });

  test("restores focus after retry and source activation", () => {
    // Given
    const { document, view } = mount({
      state: "error",
      operationId: "op",
      code: "runtime_unavailable",
      message: "Unavailable",
      recovery: { action: "retry" },
    });
    const retry = view.root.querySelector("[data-action=retry]");

    // When
    retry?.focus();
    retry?.click();

    // Then
    expect(document.activeElement).toBe(view.composer);
  });

  test("exposes semantic state and every control as a real button", () => {
    // Given / When
    const { view } = mount({ state: "retrieving", operationId: "op" });

    // Then
    expect(view.root.getAttribute("aria-busy")).toBe("true");
    expect(view.root.querySelector("[data-action=cancel]")?.tagName).toBe("BUTTON");
    expect(view.root.querySelector("[aria-live=polite]")).not.toBeNull();
  });

  test("uses real computed layout and rejects target and reflow mutations", () => {
    // Given / When
    const run = Bun.spawnSync({
      cmd: ["node", "tests/fixtures/assistant-layout-browser.cjs"],
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    });
    const resultLine = run.stdout
      .toString()
      .split("\n")
      .find((line) => line.startsWith("PVA_RESULT "));

    // Then
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    expect(resultLine).toBeDefined();
    const result: unknown = JSON.parse(resultLine?.slice("PVA_RESULT ".length) ?? "");
    expect(result).toMatchObject({
      launchCount: 1,
      normal: {
        pageOverflow: false,
        scrollOwners: ["assistant-transcript"],
        headerStable: true,
        composerStable: true,
        transcriptScrolled: true,
      },
      mutations: {
        target: { exit: 1, message: expect.stringContaining("44px target") },
        reflow: { exit: 1, message: expect.stringContaining("horizontal overflow") },
      },
      cleanup: { afterExists: false, processResidue: [], portReusable: true },
      lifecycle: {
        endpointFailure: {
          exit: 1,
          message: expect.stringContaining("endpoint timed out"),
          cleanup: { afterExists: false, processResidue: [], portReusable: true },
        },
        launchFailure: {
          exit: 1,
          message: expect.stringContaining("spawn"),
          cleanup: { afterExists: false, processResidue: [], portReusable: true },
        },
      },
      roots: [
        expect.stringContaining("pva-layout-chrome-"),
        expect.stringContaining("pva-layout-chrome-"),
        expect.stringContaining("pva-layout-chrome-"),
      ],
    });
  }, 60_000);
});
