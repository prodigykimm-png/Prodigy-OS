import type { AssistantRetrieverPort, AssistantServiceInput } from "../../src/assistant-service";
import type {
  Coverage,
  RuntimeIdentity,
  RuntimePort,
  RuntimeSubmitInput,
  RuntimeSubmitResult,
  SourceChunk,
  SourceRecord,
} from "../../src/contracts";
import type { RetrievalInput, RetrievalResult } from "../../src/vault-retriever";

export const revision = {
  algorithm: "sha256",
  hash: "b".repeat(64),
  capturedAt: 10,
} as const;

export const chunk: SourceChunk = {
  id: "Daily/2026-09-01.md:4",
  sourceId: "Daily/2026-09-01.md:revision",
  path: "Daily/2026-09-01.md",
  heading: "저녁",
  startLine: 4,
  endLine: 6,
  text: "민수와 금요일에 술을 마셨다.",
  revision,
};

export const source: SourceRecord = {
  id: chunk.sourceId,
  status: "current",
  path: chunk.path,
  ...(chunk.heading === undefined ? {} : { heading: chunk.heading }),
  startLine: chunk.startLine,
  endLine: chunk.endLine,
  revision,
};

export const completeCoverage: Coverage = {
  status: "complete",
  filesConsidered: 1,
  filesRead: 1,
};

export const partialCoverage = {
  status: "partial",
  filesConsidered: 2,
  filesRead: 1,
  issues: [{ path: "Daily/offloaded.md", reason: "unreadable" }],
} as const;

export function retrievalResult(
  chunks: readonly SourceChunk[] = [chunk],
  coverage: Coverage = completeCoverage,
): RetrievalResult {
  return {
    question: "retrieval query",
    mentions: [],
    chunks,
    sources: chunks.length === 0 ? [] : [source],
    coverage,
    envelope: JSON.stringify(chunks.map(({ id, text }) => ({ id, text }))),
  };
}

export const identity: RuntimeIdentity = {
  consumerId: { kind: "consumer_id", value: "vault.assistant" },
  sessionId: { kind: "session_id", value: "session-1" },
  operationId: { kind: "operation_id", value: "operation-1" },
  attemptId: { kind: "attempt_id", value: "attempt-1" },
};

export function success(input: RuntimeSubmitInput): RuntimeSubmitResult {
  const first = input.chunks[0];
  if (first === undefined) {
    return { ok: false, code: "invalid_response", recovery: { action: "retry" } };
  }
  return {
    ok: true,
    identity: input.identity,
    blocks: [{ kind: "paragraph", text: "민수와 마셨습니다.", citationIds: ["cite-frozen"] }],
    citations: [
      {
        id: "cite-frozen",
        status: "current",
        path: first.path,
        ...(first.heading === undefined ? {} : { heading: first.heading }),
        startLine: first.startLine,
        endLine: first.endLine,
        revision: first.revision,
        locator: "[[Daily/2026-09-01#저녁]]",
      },
    ],
    receipt: { providerLabel: "configured", modelLabel: "local", routeClass: "local" },
  };
}

export class FakeRetriever implements AssistantRetrieverPort {
  readonly calls: RetrievalInput[] = [];

  constructor(
    private readonly respond: (input: RetrievalInput) => Promise<RetrievalResult> = () =>
      Promise.resolve(retrievalResult()),
  ) {}

  retrieve(input: RetrievalInput): Promise<RetrievalResult> {
    this.calls.push(input);
    return this.respond(input);
  }
}

export class FakeRuntime implements RuntimePort {
  readonly calls: RuntimeSubmitInput[] = [];
  createIdentityCalls = 0;

  constructor(
    private readonly respond: (input: RuntimeSubmitInput) => Promise<RuntimeSubmitResult> = (
      input,
    ) => Promise.resolve(success(input)),
  ) {}

  createIdentity(): RuntimeIdentity {
    this.createIdentityCalls += 1;
    return identity;
  }

  submit(input: RuntimeSubmitInput): Promise<RuntimeSubmitResult> {
    this.calls.push(input);
    return this.respond(input);
  }
}

export function input(overrides: Partial<AssistantServiceInput> = {}): AssistantServiceInput {
  return {
    question: "그 사람과 언제 마셨지?",
    mentions: [],
    scope: { mode: "whole_vault", currentDocument: null },
    signal: new AbortController().signal,
    generation: 1,
    dialogue: [{ role: "assistant", text: "지난 대화의 사람은 민수였다." }],
    ...overrides,
  };
}

export function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
