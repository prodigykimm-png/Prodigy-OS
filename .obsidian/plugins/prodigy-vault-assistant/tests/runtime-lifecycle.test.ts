import { expect, spyOn, test } from "bun:test";
import type { RuntimeTransportRequest, SourceChunk } from "../src/contracts";
import { createRuntimeAdapter } from "../src/runtime-adapter";
import { deferred } from "./fixtures/assistant-service";
import { adapterFor, chunks, completed, fakeRuntime } from "./fixtures/runtime-adapter";

for (const synchronous of [true, false]) {
  test(`bounds ${synchronous ? "thrown" : "rejected"} provider calls and removes listeners`, async () => {
    const requests: RuntimeTransportRequest[] = [];
    const adapter = adapterFor(
      fakeRuntime(requests, () => {
        if (synchronous) throw new Error("transport failed");
        return Promise.reject(new Error("transport failed"));
      }),
    );
    const controller = new AbortController();
    const added = spyOn(controller.signal, "addEventListener");
    const removed = spyOn(controller.signal, "removeEventListener");
    const result = await adapter.submit({
      identity: adapter.createIdentity(),
      question: "q",
      dialogue: [],
      chunks,
      signal: controller.signal,
    });
    expect(result).toEqual({ ok: false, code: "provider_error", recovery: { action: "retry" } });
    expect(requests).toHaveLength(1);
    expect(removed.mock.calls.length).toBe(added.mock.calls.length);
  });
}

test("cancellation settles locally when remote cancellation rejects", async () => {
  const started = deferred<void>();
  const cancellationObserved = deferred<void>();
  const requests: RuntimeTransportRequest[] = [];
  const adapter = adapterFor(
    fakeRuntime(
      requests,
      () => {
        started.resolve();
        return new Promise(() => undefined);
      },
      {
        cancel: () => {
          cancellationObserved.resolve();
          return Promise.reject(new Error("cancel unavailable"));
        },
      },
    ),
  );
  const controller = new AbortController();
  const pending = adapter.submit({
    identity: adapter.createIdentity(),
    question: "q",
    dialogue: [],
    chunks,
    signal: controller.signal,
  });
  await started.promise;
  controller.abort();
  expect(await pending).toEqual({ ok: false, code: "cancelled", recovery: { action: "cancel" } });
  await cancellationObserved.promise;
  expect(requests).toHaveLength(1);
});

test("timeout settles a hung provider once and disposes its deadline", async () => {
  const started = deferred<void>();
  const deadline = deferred<() => void>();
  let disposed = 0;
  const cancelled: string[] = [];
  const requests: RuntimeTransportRequest[] = [];
  const api = fakeRuntime(
    requests,
    () => {
      started.resolve();
      return new Promise(() => undefined);
    },
    {
      cancel: (id) => {
        cancelled.push(id);
        throw new Error("cancel unavailable");
      },
    },
  );
  const adapter = createRuntimeAdapter({
    getPlugin: () => ({ api }),
    scheduleTimeout: (expire, ms) => {
      expect(ms).toBe(60_000);
      deadline.resolve(expire);
      return () => {
        disposed += 1;
      };
    },
  });
  const controller = new AbortController();
  const added = spyOn(controller.signal, "addEventListener");
  const removed = spyOn(controller.signal, "removeEventListener");
  const pending = adapter.submit({
    identity: adapter.createIdentity(),
    question: "q",
    dialogue: [],
    chunks,
    signal: controller.signal,
  });
  await started.promise;
  (await deadline.promise)();
  expect(await pending).toEqual({
    ok: false,
    code: "provider_error",
    recovery: { action: "retry" },
  });
  expect(requests).toHaveLength(1);
  expect(cancelled).toEqual([requests[0]?.request_id ?? "missing"]);
  expect(disposed).toBe(1);
  expect(removed.mock.calls.length).toBe(added.mock.calls.length);
});

test("coalesces active attempt submissions and freezes evidence before hashing", async () => {
  const requests: RuntimeTransportRequest[] = [];
  const started = deferred<void>();
  const response = deferred<unknown>();
  const adapter = adapterFor(
    fakeRuntime(requests, () => {
      started.resolve();
      return response.promise;
    }),
  );
  const mutable: SourceChunk[] = [{ ...chunks[0], revision: { ...chunks[0].revision } }];
  const input = {
    identity: adapter.createIdentity(),
    question: "original",
    dialogue: [],
    chunks: mutable,
    signal: new AbortController().signal,
  };
  const first = adapter.submit(input);
  const second = adapter.submit(input);
  mutable[0] = {
    ...chunks[0],
    path: "changed.md",
    text: "changed",
    revision: { ...chunks[0].revision },
  };
  await started.promise;
  const request = requests[0];
  if (request === undefined) throw new Error("missing request");
  response.resolve(completed(request));
  const results = await Promise.all([first, second]);
  expect(requests).toHaveLength(1);
  expect(JSON.parse(request.prompt).context[1].chunks[0].text).toBe(chunks[0].text);
  expect(results[0]).toMatchObject({ ok: true, citations: [{ path: chunks[0].path }] });
  expect(results[1]).toEqual(results[0]);
});

test("projects coverage counts without leaking issue paths or byte details", async () => {
  const requests: RuntimeTransportRequest[] = [];
  const adapter = adapterFor(fakeRuntime(requests));
  await adapter.submit({
    identity: adapter.createIdentity(),
    question: "q",
    dialogue: [],
    chunks,
    signal: new AbortController().signal,
    coverage: {
      status: "partial",
      filesConsidered: 3,
      filesRead: 2,
      issues: [{ path: "secret/offloaded.md", reason: "unreadable" }],
      evidence: { mode: "selected", selectedChunks: 1, totalChunks: 5, bytes: 100 },
    },
  });
  const prompt = JSON.parse(requests[0]?.prompt ?? "{}");
  expect(prompt.coverage).toEqual({
    status: "partial",
    filesConsidered: 3,
    filesRead: 2,
    evidence: { mode: "selected", selectedChunks: 1, totalChunks: 5 },
  });
  expect(JSON.stringify(prompt)).not.toContain("secret/offloaded.md");
});
