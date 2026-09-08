import { describe, expect, test } from "bun:test";
import { AssistantService } from "../src/assistant-service";
import type { RuntimeSubmitResult } from "../src/contracts";
import { RetrievalCancelledError } from "../src/vault-retriever";
import {
  deferred,
  FakeRetriever,
  FakeRuntime,
  identity,
  input,
  retrievalResult,
  success,
} from "./fixtures/assistant-service";

describe("assistant orchestration", () => {
  test.each([
    ["invalid_response", "retry"],
    ["provider_error", "later"],
    ["runtime_unavailable", "settings"],
  ] as const)("preserves %s runtime recovery action %s", async (code, action) => {
    const recovery = Object.freeze({ action });
    const runtime = new FakeRuntime(() => Promise.resolve({ ok: false, code, recovery }));
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });

    const result = await service.answer(input());

    expect(result).toMatchObject({ state: "error", code, recovery: { action } });
    if (result.state === "error" && result.code !== "read_error") {
      expect(result.recovery).toBe(recovery);
    }
    expect(runtime.calls).toHaveLength(1);
  });

  test("returns cancelled when retrieval observes cancellation", async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const retriever = new FakeRetriever(async ({ signal }) => {
      started.resolve();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      throw new RetrievalCancelledError();
    });
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever, runtime });
    const pending = service.answer(input({ signal: controller.signal }));

    await started.promise;
    controller.abort();
    const result = await pending;

    expect(result).toEqual({ state: "cancelled", operationId: identity.operationId.value });
    expect(runtime.calls).toHaveLength(0);
  });

  test("superseding submission cancels the prior generation", async () => {
    const firstStarted = deferred<void>();
    const firstCancelled = deferred<void>();
    const retriever = new FakeRetriever(async ({ question, signal }) => {
      if (question.includes("첫 질문")) {
        firstStarted.resolve();
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        firstCancelled.resolve();
        throw new RetrievalCancelledError();
      }
      return retrievalResult();
    });
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever, runtime });
    const first = service.answer(input({ question: "첫 질문", dialogue: [], generation: 1 }));
    await firstStarted.promise;

    const second = await service.answer(
      input({ question: "둘째 질문", dialogue: [], generation: 2 }),
    );
    await firstCancelled.promise;
    const stale = await first;

    expect(second.state).toBe("answered");
    expect(stale.state).toBe("cancelled");
    expect(runtime.calls).toHaveLength(1);
  });

  test("drops a late superseded response", async () => {
    const runtimeStarted = deferred<void>();
    const late = deferred<RuntimeSubmitResult>();
    const runtime = new FakeRuntime((request) => {
      if (request.identity.operationId.value === "operation-1") {
        runtimeStarted.resolve();
        return late.promise;
      }
      return Promise.resolve(success(request));
    });
    let identityCount = 0;
    runtime.createIdentity = () => {
      identityCount += 1;
      return {
        ...identity,
        operationId: { kind: "operation_id", value: `operation-${identityCount}` },
      };
    };
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });
    const first = service.answer(input({ generation: 1 }));
    await runtimeStarted.promise;

    const second = await service.answer(input({ generation: 2 }));
    const firstCall = runtime.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall !== undefined) late.resolve(success(firstCall));
    const stale = await first;

    expect(second.state).toBe("answered");
    expect(stale).toEqual({ state: "cancelled", operationId: "operation-1" });
  });

  test("drops a late cancelled response", async () => {
    const started = deferred<void>();
    const late = deferred<RuntimeSubmitResult>();
    const runtime = new FakeRuntime(() => {
      started.resolve();
      return late.promise;
    });
    const controller = new AbortController();
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });
    const pending = service.answer(input({ signal: controller.signal }));
    await started.promise;

    controller.abort();
    const runtimeCall = runtime.calls[0];
    expect(runtimeCall).toBeDefined();
    if (runtimeCall !== undefined) late.resolve(success(runtimeCall));
    const result = await pending;

    expect(result).toEqual({ state: "cancelled", operationId: "operation-1" });
  });

  test("maps malformed runtime response to an error without retrying", async () => {
    const runtime = new FakeRuntime(() =>
      Promise.resolve({ ok: false, code: "invalid_response", recovery: { action: "retry" } }),
    );
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });

    const result = await service.answer(input());

    expect(result).toMatchObject({ state: "error", code: "invalid_response" });
    expect(runtime.calls).toHaveLength(1);
  });

  test("uses only the caller-supplied identity for an explicit retry", async () => {
    const retryIdentity = {
      ...identity,
      attemptId: { kind: "attempt_id", value: "attempt-2" },
    } as const;
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });

    const result = await service.answer(input({ retryIdentity }));

    expect(runtime.createIdentityCalls).toBe(0);
    expect(runtime.calls[0]?.identity).toEqual(retryIdentity);
    expect(result).toMatchObject({ state: "answered", operationId: "operation-1" });
  });
});
