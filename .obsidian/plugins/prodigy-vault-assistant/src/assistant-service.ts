import type {
  ActiveDocumentSnapshot,
  AssistantResult,
  Coverage,
  RuntimeIdentity,
  RuntimePort,
  RuntimeSubmitResult,
  SourceChunk,
  SourceRecord,
  StructuredMention,
} from "./contracts";
import { abortable } from "./request-lifecycle";
import type { RetrievalInput, RetrievalResult } from "./vault-retriever";
import { RetrievalCancelledError } from "./vault-retriever";

const MAX_DIALOGUE_MESSAGES = 6;
const MAX_DIALOGUE_BYTES = 4_096;
const encoder = new TextEncoder();

type DialogueMessage = {
  readonly role: "user" | "assistant";
  readonly text: string;
};

type ActiveRequest = {
  readonly generation: number;
  readonly controller: AbortController;
};

export interface AssistantRetrieverPort {
  readonly retrieve: (input: RetrievalInput) => Promise<RetrievalResult>;
}

export interface AssistantServiceInput {
  readonly question: string;
  readonly mentions: readonly StructuredMention[];
  readonly scope: {
    readonly mode: "current_document" | "whole_vault";
    readonly currentDocument: ActiveDocumentSnapshot | null;
  };
  readonly signal: AbortSignal;
  readonly generation: number;
  readonly dialogue: readonly DialogueMessage[];
  readonly retryIdentity?: RuntimeIdentity;
  readonly onProgress?: (state: Extract<AssistantResult, { readonly state: "answering" }>) => void;
}

export interface AssistantServiceDependencies {
  readonly retriever: AssistantRetrieverPort;
  readonly runtime: RuntimePort;
}

function boundedDialogue(messages: readonly DialogueMessage[]): readonly DialogueMessage[] {
  const recent = messages.slice(-MAX_DIALOGUE_MESSAGES);
  const bounded: DialogueMessage[] = [];
  let remaining = MAX_DIALOGUE_BYTES;
  for (let messageIndex = recent.length - 1; messageIndex >= 0; messageIndex -= 1) {
    if (remaining === 0) break;
    const message = recent[messageIndex];
    if (message === undefined) continue;
    const characters = [...message.text];
    let text = "";
    for (let characterIndex = characters.length - 1; characterIndex >= 0; characterIndex -= 1) {
      const character = characters[characterIndex];
      if (character === undefined) continue;
      const bytes = encoder.encode(character).byteLength;
      if (bytes > remaining) break;
      text = `${character}${text}`;
      remaining -= bytes;
    }
    if (text.length > 0) bounded.unshift(Object.freeze({ role: message.role, text }));
  }
  return Object.freeze(bounded);
}

function frozenChunks(chunks: readonly SourceChunk[]): readonly SourceChunk[] {
  return Object.freeze(
    chunks.map((chunk) =>
      Object.freeze({
        id: chunk.id,
        sourceId: chunk.sourceId,
        path: chunk.path,
        ...(chunk.heading === undefined ? {} : { heading: chunk.heading }),
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        text: chunk.text,
        revision: Object.freeze({ ...chunk.revision }),
      }),
    ),
  );
}

function sourceRecords(
  result: Extract<RuntimeSubmitResult, { readonly ok: true }>,
): readonly SourceRecord[] {
  return Object.freeze(
    result.citations.map((citation) =>
      Object.freeze({
        id: citation.id,
        status: citation.status,
        path: citation.path,
        ...(citation.heading === undefined ? {} : { heading: citation.heading }),
        startLine: citation.startLine,
        endLine: citation.endLine,
        revision: Object.freeze({ ...citation.revision }),
      }),
    ),
  );
}

function errorResult(
  operationId: string,
  failure: Extract<RuntimeSubmitResult, { readonly ok: false }>,
): AssistantResult {
  if (failure.code === "cancelled") return { state: "cancelled", operationId };
  return {
    state: "error",
    operationId,
    code: failure.code,
    message: failure.code,
    recovery: failure.recovery,
  };
}

function answeredResult(
  operationId: string,
  coverage: Coverage,
  result: Extract<RuntimeSubmitResult, { readonly ok: true }>,
): AssistantResult {
  const answer = {
    operationId,
    blocks: Object.freeze(
      result.blocks.map((block) =>
        Object.freeze({ ...block, citationIds: Object.freeze([...block.citationIds]) }),
      ),
    ),
    sources: sourceRecords(result),
    receipt: result.receipt,
  };
  if (coverage.status === "partial") {
    return { state: "partial", ...answer, coverage };
  }
  return { state: "answered", ...answer, coverage };
}

export class AssistantService {
  #latestGeneration = Number.NEGATIVE_INFINITY;
  #active: ActiveRequest | null = null;
  #pending: { readonly generation: number; readonly result: Promise<AssistantResult> } | null =
    null;

  constructor(private readonly dependencies: AssistantServiceDependencies) {}

  answer(input: AssistantServiceInput): Promise<AssistantResult> {
    if (this.#pending?.generation === input.generation) return this.#pending.result;
    const frozen = Object.freeze({
      ...input,
      mentions: Object.freeze(input.mentions.map((mention) => Object.freeze({ ...mention }))),
      scope: Object.freeze({
        mode: input.scope.mode,
        currentDocument:
          input.scope.currentDocument === null
            ? null
            : Object.freeze({ ...input.scope.currentDocument }),
      }),
      dialogue: boundedDialogue(input.dialogue),
    });
    const result = this.answerOnce(frozen).finally(() => {
      if (this.#pending?.result === result) this.#pending = null;
    });
    this.#pending = { generation: input.generation, result };
    return result;
  }

  private async answerOnce(input: AssistantServiceInput): Promise<AssistantResult> {
    let identity: RuntimeIdentity;
    try {
      identity = input.retryIdentity ?? this.dependencies.runtime.createIdentity();
    } catch {
      return errorResult(`generation-${input.generation}`, {
        ok: false,
        code: "runtime_unavailable",
        recovery: { action: "settings" },
      });
    }
    const operationId = identity.operationId.value;
    if (input.generation < this.#latestGeneration) return { state: "cancelled", operationId };

    this.#active?.controller.abort();
    const controller = new AbortController();
    const active = { generation: input.generation, controller };
    this.#active = active;
    this.#latestGeneration = input.generation;
    const abort = () => controller.abort();
    input.signal.addEventListener("abort", abort, { once: true });

    try {
      if (input.signal.aborted) controller.abort();
      const dialogue = boundedDialogue(input.dialogue);
      const retrievalQuery =
        /(?:그\s*(?:사람|일정|내용|문서|장소)|그때|거기|이어서|계속(?:해서)?)/u.test(input.question)
          ? [...dialogue.map(({ text }) => text), input.question].join("\n")
          : input.question;
      let retrieval: RetrievalResult;
      try {
        retrieval = await abortable(controller.signal, () =>
          this.dependencies.retriever.retrieve({
            mode: input.scope.mode,
            question: retrievalQuery,
            mentions: Object.freeze(input.mentions.map((mention) => Object.freeze({ ...mention }))),
            currentDocument:
              input.scope.currentDocument === null
                ? null
                : Object.freeze({ ...input.scope.currentDocument }),
            signal: controller.signal,
          }),
        );
      } catch (error) {
        if (error instanceof RetrievalCancelledError || controller.signal.aborted) {
          return { state: "cancelled", operationId };
        }
        return { state: "error", operationId, code: "read_error", message: "read_error" };
      }
      if (!this.isCurrent(active) || controller.signal.aborted) {
        return { state: "cancelled", operationId };
      }
      if (retrieval.chunks.length === 0) {
        return { state: "no_evidence", operationId, coverage: retrieval.coverage };
      }

      const chunks = frozenChunks(retrieval.chunks);
      const coverage = structuredClone(retrieval.coverage);
      input.onProgress?.({ state: "answering", operationId, coverage });
      const result = await abortable(controller.signal, () =>
        this.dependencies.runtime.submit({
          identity,
          question: input.question,
          dialogue,
          chunks,
          coverage,
          signal: controller.signal,
        }),
      );
      if (!this.isCurrent(active) || controller.signal.aborted) {
        return { state: "cancelled", operationId };
      }
      return result.ok
        ? answeredResult(operationId, coverage, result)
        : errorResult(operationId, result);
    } catch {
      if (!this.isCurrent(active) || controller.signal.aborted)
        return { state: "cancelled", operationId };
      return errorResult(operationId, {
        ok: false,
        code: "provider_error",
        recovery: { action: "retry" },
      });
    } finally {
      input.signal.removeEventListener("abort", abort);
      if (this.#active === active) this.#active = null;
    }
  }

  private isCurrent(active: ActiveRequest): boolean {
    return this.#active === active && this.#latestGeneration === active.generation;
  }
}
