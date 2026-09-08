import { describe, expect, test } from "bun:test";
import { freezeCitationMap, validateCitations } from "../src/citation-validation";
import type { RuntimeTransportRequest } from "../src/contracts";
import { nextAttempt } from "../src/runtime-adapter";

import {
  adapterFor,
  blocksFor,
  chunks,
  completed,
  expectedManifest,
  fakeRuntime,
  revision,
  statusChunks,
} from "./fixtures/runtime-adapter";

describe("inherited runtime adapter", () => {
  test("submits one structured request and resolves opaque citations", async () => {
    const requests: RuntimeTransportRequest[] = [];
    const adapter = adapterFor(fakeRuntime(requests));
    const identity = adapter.createIdentity();

    const result = await adapter.submit({
      identity,
      question: "누구와 술을 마셨지?",
      dialogue: [{ role: "user", text: "지난주 이야기를 이어서 묻는다." }],
      chunks,
      signal: new AbortController().signal,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.consumer_manifest).toEqual(expectedManifest);
    expect(request).not.toHaveProperty("provider");
    expect(request).not.toHaveProperty("model");
    expect(request?.prompt).toContain('"kind":"dialogue_context"');
    expect(request?.prompt).toContain('"kind":"vault_evidence"');
    expect(request?.prompt).toContain("민수와 금요일에 술을 마셨다.");
    expect(request?.prompt).not.toContain("People/민수.md");
    expect(JSON.stringify(request?.schema)).not.toContain("People/민수.md");
    const providerCitationId = request?.prompt.match(/"id":"([^"]+)"/u)?.[1] ?? "missing-citation";
    expect(providerCitationId).toMatch(/^cite-[0-9a-f]{16}$/u);
    expect(JSON.stringify(request?.schema)).toContain(providerCitationId);
    expect(result).toEqual({
      ok: true,
      identity,
      blocks: blocksFor(providerCitationId),
      citations: [
        {
          id: providerCitationId,
          status: "stale",
          path: "People/민수.md",
          heading: "만남",
          startLine: 10,
          endLine: 14,
          revision,
          locator: "[[People/민수#만남]]",
        },
      ],
      receipt: {
        providerLabel: "local-runtime",
        modelLabel: "configured-model",
        routeClass: "local",
      },
    });
  });

  test("rejects unknown citations", async () => {
    const requests: RuntimeTransportRequest[] = [];
    const api = fakeRuntime(requests, (request) =>
      Promise.resolve({
        ...completed(request),
        payload: {
          blocks: [{ kind: "paragraph", text: "근거 없는 답", citationIds: ["invented-path.md"] }],
        },
      }),
    );

    const result = await adapterFor(api).submit({
      identity: adapterFor(null).createIdentity(),
      question: "질문",
      dialogue: [],
      chunks,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      ok: false,
      code: "invalid_response",
      recovery: { action: "retry" },
    });
    expect(requests).toHaveLength(1);
  });

  test("rejects uncited, duplicate-only, and path-authored citations", () => {
    const frozen = freezeCitationMap(chunks, ["cite-test"]);
    expect(
      freezeCitationMap(statusChunks, ["cite-1", "cite-2", "cite-3"]).map(({ status }) => status),
    ).toEqual(["current", "stale", "missing"]);

    expect(
      validateCitations([{ kind: "paragraph", text: "사실", citationIds: [] }], frozen).ok,
    ).toBe(false);
    expect(
      validateCitations(
        [{ kind: "paragraph", text: "사실", citationIds: ["cite-test", "cite-test"] }],
        frozen,
      ).ok,
    ).toBe(false);
    expect(
      validateCitations(
        [{ kind: "paragraph", text: "사실", citationIds: ["People/민수.md"] }],
        frozen,
      ).ok,
    ).toBe(false);
  });

  test("blocks unavailable runtime", async () => {
    const adapter = adapterFor(null);
    const result = await adapter.submit({
      identity: adapter.createIdentity(),
      question: "질문",
      dialogue: [],
      chunks,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      ok: false,
      code: "runtime_unavailable",
      recovery: { action: "settings" },
    });
  });

  test("cancels and ignores late results", async () => {
    const requests: RuntimeTransportRequest[] = [];
    const cancelled: string[] = [];
    let finish: ((response: ReturnType<typeof completed>) => void) | undefined;
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const api = fakeRuntime(
      requests,
      () => {
        markStarted();
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      {
        cancel: (requestId) => {
          cancelled.push(requestId);
          return Promise.resolve({ status: "cancel_requested" });
        },
      },
    );
    const adapter = adapterFor(api);
    const controller = new AbortController();
    const pending = adapter.submit({
      identity: adapter.createIdentity(),
      question: "질문",
      dialogue: [],
      chunks,
      signal: controller.signal,
    });

    await started;
    controller.abort();
    const request = requests[0];
    if (request && finish) finish(completed(request));
    const result = await pending;

    expect(cancelled[0]).toBe(request?.request_id);
    expect(result).toEqual({ ok: false, code: "cancelled", recovery: { action: "cancel" } });
  });

  test("explicit retry changes only attempt id and exposes no fallback", () => {
    const adapter = adapterFor(null);
    const identity = adapter.createIdentity();
    const retried = nextAttempt(identity, () => "attempt-2");

    expect(retried.consumerId).toEqual(identity.consumerId);
    expect(retried.sessionId).toEqual(identity.sessionId);
    expect(retried.operationId).toEqual(identity.operationId);
    expect(retried.attemptId).not.toEqual(identity.attemptId);
    expect(retried.attemptId.value).toBe("attempt-2");
    expect(JSON.stringify(retried)).not.toMatch(/fallback|provider|model|route/iu);
  });

  test("validates protocol major, capability, and ready status before requesting", async () => {
    const requests: RuntimeTransportRequest[] = [];
    const handshake = {
      plugin_id: "prodigy-ai-runtime",
      consumer_manifest_range: ">=1 <2",
      runtime_epoch: "epoch-1",
    } as const;
    const apis = [
      fakeRuntime(requests, undefined, { getStatus: () => ({ status: "unavailable" }) }),
      fakeRuntime(requests, undefined, {
        getHandshake: () => ({
          ...handshake,
          protocol_version: "2.0.0",
          capabilities: ["structured-strict"],
        }),
      }),
      fakeRuntime(requests, undefined, {
        getHandshake: () => ({
          ...handshake,
          protocol_version: "1.0.0",
          capabilities: ["chat-text"],
        }),
      }),
    ];
    for (const api of apis) {
      const adapter = adapterFor(api);
      const result = await adapter.submit({
        identity: adapter.createIdentity(),
        question: "질문",
        dialogue: [],
        chunks,
        signal: new AbortController().signal,
      });
      expect(result).toEqual({
        ok: false,
        code: "runtime_unavailable",
        recovery: { action: "settings" },
      });
    }
    expect(requests).toHaveLength(0);
  });

  test("maps config, quota, and malformed failures without fallback", async () => {
    const cases = [
      ["configuration_missing", "runtime_unavailable", "settings"],
      ["quota_exhausted", "provider_error", "later"],
    ] as const;
    for (const [runtimeCode, code, action] of cases) {
      const requests: RuntimeTransportRequest[] = [];
      const api = fakeRuntime(requests, (request) =>
        Promise.resolve({ ...completed(request), status: "failed", error_code: runtimeCode }),
      );
      const adapter = adapterFor(api);
      const result = await adapter.submit({
        identity: adapter.createIdentity(),
        question: "질문",
        dialogue: [],
        chunks,
        signal: new AbortController().signal,
      });
      expect(result).toEqual({ ok: false, code, recovery: { action } });
      expect(JSON.stringify(result)).not.toMatch(/fallback|provider.setter|route.setter|network/iu);
    }
    const adapter = adapterFor(fakeRuntime([], () => Promise.resolve({ malformed: true })));
    const malformed = await adapter.submit({
      identity: adapter.createIdentity(),
      question: "질문",
      dialogue: [],
      chunks,
      signal: new AbortController().signal,
    });
    expect(malformed).toEqual({
      ok: false,
      code: "invalid_response",
      recovery: { action: "retry" },
    });
  });
});
