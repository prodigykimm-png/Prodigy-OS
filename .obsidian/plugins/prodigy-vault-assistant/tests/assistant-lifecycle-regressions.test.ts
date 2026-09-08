import { expect, spyOn, test } from "bun:test";
import { AssistantService } from "../src/assistant-service";
import type { AssistantResult, Coverage } from "../src/contracts";
import {
  deferred,
  FakeRetriever,
  FakeRuntime,
  input,
  retrievalResult,
} from "./fixtures/assistant-service";

for (const synchronous of [true, false]) {
  test(`service bounds ${synchronous ? "thrown" : "rejected"} runtime errors and is reusable`, async () => {
    const controller = new AbortController();
    const added = spyOn(controller.signal, "addEventListener");
    const removed = spyOn(controller.signal, "removeEventListener");
    const runtime = new FakeRuntime(() => {
      if (synchronous) throw new Error("failed");
      return Promise.reject(new Error("failed"));
    });
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });
    expect(await service.answer(input({ signal: controller.signal }))).toMatchObject({
      state: "error",
      code: "provider_error",
    });
    expect(removed.mock.calls.length).toBe(added.mock.calls.length);
    expect(await service.answer(input({ generation: 2 }))).toMatchObject({
      state: "error",
      code: "provider_error",
    });
    expect(runtime.calls).toHaveLength(2);
  });
}

test("same active generation performs one retrieval and one provider call", async () => {
  const started = deferred<void>();
  const retrieved = deferred<ReturnType<typeof retrievalResult>>();
  const retriever = new FakeRetriever(() => {
    started.resolve();
    return retrieved.promise;
  });
  const runtime = new FakeRuntime();
  const service = new AssistantService({ retriever, runtime });
  const request = input();
  const first = service.answer(request);
  await started.promise;
  const duplicate = service.answer(request);
  retrieved.resolve(retrievalResult());
  const results = await Promise.all([first, duplicate]);
  expect(retriever.calls).toHaveLength(1);
  expect(runtime.calls).toHaveLength(1);
  expect(results[0]?.state).toBe("answered");
  expect(results[1]).toEqual(results[0]);
});

for (const stage of ["retrieval", "runtime"] as const) {
  test(`cancellation settles even if ${stage} ignores its abort signal`, async () => {
    const started = deferred<void>();
    const never = () => {
      started.resolve();
      return new Promise<never>(() => undefined);
    };
    const service = new AssistantService({
      retriever: new FakeRetriever(stage === "retrieval" ? never : undefined),
      runtime: new FakeRuntime(stage === "runtime" ? never : undefined),
    });
    const controller = new AbortController();
    const pending = service.answer(input({ signal: controller.signal }));
    await started.promise;
    controller.abort();
    expect(await pending).toMatchObject({ state: "cancelled" });
  }, 1_000);
}

test("emits answering coverage only after fresh evidence and before provider submission", async () => {
  const coverage: Coverage = {
    status: "complete",
    filesConsidered: 1,
    filesRead: 1,
    evidence: { mode: "selected", selectedChunks: 1, totalChunks: 3, bytes: 50 },
  };
  const events: string[] = [];
  const progress: AssistantResult[] = [];
  const runtime = new FakeRuntime(() => {
    events.push("runtime");
    return Promise.resolve({ ok: false, code: "provider_error", recovery: { action: "retry" } });
  });
  const service = new AssistantService({
    retriever: new FakeRetriever(() => {
      events.push("retrieval");
      return Promise.resolve(retrievalResult(undefined, coverage));
    }),
    runtime,
  });
  await service.answer(
    input({
      onProgress: (state) => {
        events.push("progress");
        progress.push(state);
      },
    }),
  );
  expect(events).toEqual(["retrieval", "progress", "runtime"]);
  expect(progress).toEqual([{ state: "answering", operationId: "operation-1", coverage }]);
  expect(runtime.calls[0]?.coverage).toEqual(coverage);
});

test("question and dialogue remain owned while retrieval is pending; repeats retrieve again", async () => {
  const retrieved = deferred<ReturnType<typeof retrievalResult>>();
  const retriever = new FakeRetriever(() => retrieved.promise);
  const runtime = new FakeRuntime();
  const service = new AssistantService({ retriever, runtime });
  const mutable = {
    ...input(),
    question: "original",
    dialogue: [{ role: "user" as const, text: "original dialogue" }],
  };
  const pending = service.answer(mutable);
  mutable.question = "changed";
  mutable.dialogue[0] = { role: "user", text: "changed dialogue" };
  retrieved.resolve(retrievalResult());
  await pending;
  expect(runtime.calls[0]?.question).toBe("original");
  expect(runtime.calls[0]?.dialogue).toEqual([{ role: "user", text: "original dialogue" }]);
  await service.answer(input({ generation: 2, question: "original" }));
  expect(retriever.calls).toHaveLength(2);
});
