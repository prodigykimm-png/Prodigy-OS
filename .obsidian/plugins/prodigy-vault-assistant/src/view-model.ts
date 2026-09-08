import type {
  AnswerBlock,
  AssistantResult,
  ScopeMode,
  SourceRecord,
  StructuredMention,
} from "./contracts";
import { assertNever } from "./contracts";

export interface AssistantElement {
  readonly value?: string;
  readonly tagName: string;
  textContent: string;
  className: string;
  append: (...nodes: readonly AssistantElement[]) => void;
  replaceChildren: (...nodes: readonly AssistantElement[]) => void;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  querySelector: (selector: string) => AssistantElement | null;
  querySelectorAll: (selector: string) => readonly AssistantElement[];
  dispatchEvent: (event: Event) => boolean;
  click: () => void;
  focus: () => void;
}

export interface AssistantDocument {
  readonly activeElement: AssistantElement | null;
  readonly createElement: (tagName: string) => AssistantElement;
}

export interface AssistantViewPorts {
  readonly onModeChange: (mode: ScopeMode) => void;
  readonly onMentionRemove: (path: string) => void;
  readonly onMentionSelect: (path: string) => void;
  readonly onHistoryOpen: (id: string) => void;
  readonly onSourceOpen: (path: string, heading?: string) => void;
  readonly onSubmit: (question: string) => void;
  readonly onCancel: () => void;
  readonly onLater: () => void;
  readonly onRetry: () => void;
  readonly onSettings: () => void;
  readonly onClearHistory: () => void;
}

export interface AssistantView {
  readonly root: AssistantElement;
  readonly composer: AssistantElement;
  readonly render: (model: AssistantViewModel) => void;
}

export type ProviderReadiness =
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly providerLabel: string; readonly modelLabel: string }
  | { readonly status: "unavailable"; readonly providerLabel: string };

export interface HistorySummary {
  readonly id: string;
  readonly label: string;
}

export interface AssistantViewInput {
  readonly mode: ScopeMode;
  readonly currentDocumentLabel: string | null;
  readonly mentions: readonly StructuredMention[];
  readonly mentionSuggestions: readonly StructuredMention[];
  readonly history: readonly HistorySummary[];
  readonly provider: ProviderReadiness;
  readonly result: AssistantResult;
  readonly priorBlocks: readonly AnswerBlock[];
}

export interface AssistantSourceView {
  readonly status: SourceRecord["status"];
  readonly label: string;
  readonly path: string;
  readonly heading?: string;
  readonly enabled: boolean;
}

export interface AssistantViewModel extends Omit<AssistantViewInput, "result" | "provider"> {
  readonly state: AssistantResult["state"];
  readonly providerText: string;
  readonly busy: boolean;
  readonly statusKind: "quiet" | "progress" | "warning" | "error";
  readonly statusText: string;
  readonly blocks: readonly AnswerBlock[];
  readonly sources: readonly AssistantSourceView[];
  readonly coverageText: string | null;
  readonly actions: readonly ("submit" | "cancel" | "later" | "retry" | "settings")[];
}

export function keyboardMode(mode: ScopeMode, key: string): ScopeMode | null {
  if (key === "Home") return "current_document";
  if (key === "End") return "whole_vault";
  if (key === "ArrowRight" || key === "ArrowLeft") {
    return mode === "current_document" ? "whole_vault" : "current_document";
  }
  return null;
}

function sourceView(source: SourceRecord): AssistantSourceView {
  const locator = `${source.path}${source.heading === undefined ? "" : ` > ${source.heading}`} ${source.startLine}-${source.endLine}행`;
  switch (source.status) {
    case "current":
      return { ...source, label: locator, enabled: true };
    case "stale":
      return { ...source, label: `변경됨: ${locator}`, enabled: true };
    case "missing":
      return { ...source, label: `삭제됨: ${locator}`, enabled: false };
    default:
      return assertNever(source);
  }
}

function coverageText(result: Extract<AssistantResult, { readonly coverage: unknown }>): string {
  const coverage = result.coverage;
  switch (coverage.status) {
    case "complete":
      return `${coverage.filesRead}개 문서 확인`;
    case "partial":
      return `${coverage.filesRead}/${coverage.filesConsidered}개 문서 확인, ${coverage.issues.length}개 누락`;
    default:
      return assertNever(coverage);
  }
}

export function createViewModel(input: AssistantViewInput): AssistantViewModel {
  const providerText = (() => {
    switch (input.provider.status) {
      case "checking":
        return "AI Runtime 확인 중";
      case "ready":
        return `${input.provider.providerLabel} / ${input.provider.modelLabel}`;
      case "unavailable":
        return `${input.provider.providerLabel} / 사용 불가`;
      default:
        return assertNever(input.provider);
    }
  })();
  const shared = {
    mode: input.mode,
    currentDocumentLabel: input.currentDocumentLabel,
    mentions: input.mentions,
    mentionSuggestions: input.mentionSuggestions,
    history: input.history,
    providerText,
    priorBlocks: input.priorBlocks,
  };
  const result = input.result;
  switch (result.state) {
    case "idle":
      return {
        ...shared,
        state: result.state,
        busy: false,
        statusKind: "quiet",
        statusText: "질문할 문서 범위를 선택하세요.",
        blocks: input.priorBlocks,
        sources: [],
        coverageText: null,
        actions: ["submit", "settings"],
      };
    case "retrieving":
      return {
        ...shared,
        state: result.state,
        busy: true,
        statusKind: "progress",
        statusText: "Vault에서 근거를 찾고 있습니다.",
        blocks: input.priorBlocks,
        sources: [],
        coverageText: null,
        actions: ["cancel"],
      };
    case "answering":
      return {
        ...shared,
        state: result.state,
        busy: true,
        statusKind: "progress",
        statusText: "확인된 근거로 답변을 작성하고 있습니다.",
        blocks: input.priorBlocks,
        sources: [],
        coverageText: coverageText(result),
        actions: ["cancel"],
      };
    case "answered":
      return {
        ...shared,
        providerText: `${result.receipt.providerLabel} / ${result.receipt.modelLabel}`,
        state: result.state,
        busy: false,
        statusKind: "quiet",
        statusText: "답변이 준비되었습니다.",
        blocks: result.blocks,
        sources: result.sources.map(sourceView),
        coverageText: coverageText(result),
        actions: ["submit", "settings"],
      };
    case "no_evidence":
      return {
        ...shared,
        state: result.state,
        busy: false,
        statusKind: "warning",
        statusText: "현재 범위에서 답변할 근거를 찾지 못했습니다.",
        blocks: [],
        sources: [],
        coverageText: coverageText(result),
        actions: ["submit", "settings"],
      };
    case "partial":
      return {
        ...shared,
        providerText: `${result.receipt.providerLabel} / ${result.receipt.modelLabel}`,
        state: result.state,
        busy: false,
        statusKind: "warning",
        statusText: "일부 문서를 읽지 못해 확인된 범위에서만 답했습니다.",
        blocks: result.blocks,
        sources: result.sources.map(sourceView),
        coverageText: coverageText(result),
        actions: ["submit", "settings"],
      };
    case "error": {
      const errorModel = {
        ...shared,
        state: result.state,
        busy: false,
        statusKind: "error" as const,
        statusText: result.message,
        blocks: input.priorBlocks,
        sources: [],
        coverageText: null,
      };
      switch (result.code) {
        case "read_error":
          return { ...errorModel, actions: ["retry"] };
        case "runtime_unavailable":
        case "provider_error":
        case "invalid_response":
          return { ...errorModel, actions: [result.recovery.action] };
        default:
          return assertNever(result);
      }
    }
    case "cancelled":
      return {
        ...shared,
        state: result.state,
        busy: false,
        statusKind: "warning",
        statusText: "요청을 취소했습니다. 이전 내용은 그대로 유지됩니다.",
        blocks: input.priorBlocks,
        sources: [],
        coverageText: null,
        actions: ["retry", "settings"],
      };
    default:
      return assertNever(result);
  }
}
