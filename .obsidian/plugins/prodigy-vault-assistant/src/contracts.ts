export type ScopeMode = "current_document" | "whole_vault";

export interface StructuredMention {
  readonly kind: "vault_file";
  readonly path: string;
  readonly label: string;
}

export interface SourceRevision {
  readonly algorithm: "sha256";
  readonly hash: string;
  readonly capturedAt: number;
}

interface SourceRecordFields {
  readonly id: string;
  readonly path: string;
  readonly heading?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly revision: SourceRevision;
}

export type SourceRecord =
  | (SourceRecordFields & { readonly status: "current" })
  | (SourceRecordFields & { readonly status: "stale" })
  | (SourceRecordFields & { readonly status: "missing" });

export interface SourceChunk {
  readonly id: string;
  readonly sourceId: string;
  readonly path: string;
  readonly heading?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
  readonly revision: SourceRevision;
}

export interface CoverageIssue {
  readonly path: string;
  readonly reason: "unreadable" | "missing" | "cancelled";
}

export type Coverage =
  | {
      readonly status: "complete";
      readonly filesConsidered: number;
      readonly filesRead: number;
    }
  | {
      readonly status: "partial";
      readonly filesConsidered: number;
      readonly filesRead: number;
      readonly issues: readonly CoverageIssue[];
    };

export type PartialCoverage = Extract<Coverage, { readonly status: "partial" }>;

export interface AnswerBlock {
  readonly kind: "paragraph" | "list_item";
  readonly text: string;
  readonly citationIds: readonly string[];
}

export type AssistantResult =
  | { readonly state: "idle" }
  | { readonly state: "retrieving"; readonly operationId: string }
  | {
      readonly state: "answering";
      readonly operationId: string;
      readonly coverage: Coverage;
    }
  | {
      readonly state: "answered";
      readonly operationId: string;
      readonly blocks: readonly AnswerBlock[];
      readonly sources: readonly SourceRecord[];
      readonly coverage: Coverage;
      readonly receipt: RuntimeReceipt;
    }
  | {
      readonly state: "no_evidence";
      readonly operationId: string;
      readonly coverage: Coverage;
    }
  | {
      readonly state: "partial";
      readonly operationId: string;
      readonly blocks: readonly AnswerBlock[];
      readonly sources: readonly SourceRecord[];
      readonly coverage: PartialCoverage;
      readonly receipt: RuntimeReceipt;
    }
  | {
      readonly state: "error";
      readonly operationId: string;
      readonly code: "runtime_unavailable" | "provider_error" | "invalid_response";
      readonly message: string;
      readonly recovery: { readonly action: RuntimeRecoveryAction };
    }
  | {
      readonly state: "error";
      readonly operationId: string;
      readonly code: "read_error";
      readonly message: string;
    }
  | { readonly state: "cancelled"; readonly operationId: string };

export interface RuntimeConsumerManifest {
  readonly schema_version: 1;
  readonly consumer_id: "vault.assistant";
  readonly contract_version: 1;
  readonly capability: "structured-strict";
  readonly sensitivity: "highly-private";
  readonly route_policy: "local-preferred";
  readonly consent_cadence: "standing-grant-with-explicit-action";
  readonly background_allowed: false;
  readonly max_input_bytes: number;
  readonly max_output_bytes: number;
  readonly max_schema_bytes: number;
  readonly timeout_ms: 60_000;
}

export interface RuntimeIdentity {
  readonly consumerId: { readonly kind: "consumer_id"; readonly value: "vault.assistant" };
  readonly sessionId: { readonly kind: "session_id"; readonly value: string };
  readonly operationId: { readonly kind: "operation_id"; readonly value: string };
  readonly attemptId: { readonly kind: "attempt_id"; readonly value: string };
}

export interface RuntimeTransportRequest {
  readonly protocol_version: "1.0.0";
  readonly consumer_id: "vault.assistant";
  readonly owner_session_id: string;
  readonly operation_id: string;
  readonly attempt_id: string;
  readonly request_id: string;
  readonly consumer_manifest: RuntimeConsumerManifest;
  readonly prompt: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface RuntimeApiPort {
  readonly getHandshake: () => unknown;
  readonly getStatus: () => unknown;
  readonly requestStructured: (request: RuntimeTransportRequest) => Promise<unknown>;
  readonly cancel: (requestId: string) => unknown;
}

export interface RuntimeSubmitInput {
  readonly identity: RuntimeIdentity;
  readonly question: string;
  readonly dialogue: readonly { readonly role: "user" | "assistant"; readonly text: string }[];
  readonly chunks: readonly SourceChunk[];
  readonly signal: AbortSignal;
}

export interface RuntimeReceipt {
  readonly providerLabel: string;
  readonly modelLabel: string;
  readonly routeClass: string;
}

export interface ResolvedCitation {
  readonly status: SourceRecord["status"];
  readonly id: string;
  readonly path: string;
  readonly heading?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly revision: SourceRevision;
  readonly locator: string;
}

export type RuntimeRecoveryAction = "settings" | "retry" | "later" | "cancel";

export type RuntimeSubmitResult =
  | {
      readonly ok: true;
      readonly identity: RuntimeIdentity;
      readonly blocks: readonly AnswerBlock[];
      readonly citations: readonly ResolvedCitation[];
      readonly receipt: RuntimeReceipt;
    }
  | {
      readonly ok: false;
      readonly code: "runtime_unavailable" | "invalid_response" | "provider_error" | "cancelled";
      readonly recovery: { readonly action: RuntimeRecoveryAction };
    };

export interface RuntimePort {
  readonly createIdentity: () => RuntimeIdentity;
  readonly submit: (input: RuntimeSubmitInput) => Promise<RuntimeSubmitResult>;
}

export interface MarkdownFileRef {
  readonly path: string;
  readonly basename: string;
}

export interface ActiveDocumentSnapshot {
  readonly path: string;
  readonly content: string;
}

export interface VaultReadPort {
  readonly listMarkdownFiles: () => readonly MarkdownFileRef[];
  readonly read: (path: string) => Promise<string>;
  readonly activeDocument: () => ActiveDocumentSnapshot | null;
}

export interface HistoryCitation {
  readonly path: string;
  readonly heading?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly revision: SourceRevision;
}

export interface HistoryMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly timestamp: number;
  readonly mode: ScopeMode;
  readonly currentPath?: string;
  readonly citations: readonly HistoryCitation[];
  readonly providerLabel: string;
  readonly modelLabel: string;
}

export interface HistoryExchange {
  readonly conversationId?: string;
  readonly question: string;
  readonly answer: string;
  readonly timestamp: number;
  readonly mode: ScopeMode;
  readonly currentPath?: string;
  readonly citations: readonly HistoryCitation[];
  readonly providerLabel: string;
  readonly modelLabel: string;
}

export interface ConversationHistory {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly HistoryMessage[];
}

export interface HistoryState {
  readonly version: 1;
  readonly activeConversationId: string | null;
  readonly conversations: readonly ConversationHistory[];
}

export interface HistoryPort {
  readonly storageKey: string;
  readonly createConversationId: () => string;
  readonly load: () => Promise<HistoryState>;
  readonly appendExchange: (
    exchange: HistoryExchange,
    signal: AbortSignal,
  ) => Promise<HistoryState | null>;
  readonly clear: () => Promise<void>;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled contract variant: ${JSON.stringify(value)}`);
}
