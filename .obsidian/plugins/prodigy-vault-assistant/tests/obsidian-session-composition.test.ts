import { expect, mock, test } from "bun:test";
import type { RuntimePublicApi } from "../src/active-document";
import type { RuntimeTransportRequest } from "../src/contracts";
import type { AssistantElement } from "../src/view-model";
import { TestDocument } from "./fixtures/test-dom";

const markdownFile = {
  path: "Daily/evidence.md",
  basename: "evidence",
  stat: { mtime: 1, size: 23 },
};

class MockItemView {
  readonly contentEl = { ownerDocument: { hidden: false } };
  readonly app = {
    vault: {
      getMarkdownFiles: () => [markdownFile],
      getFileByPath: (path: string) => (path === markdownFile.path ? markdownFile : null),
      cachedRead: () => Promise.resolve("Persisted evidence body"),
    },
    metadataCache: { resolvedLinks: {} },
  };

  registerDomEvent(): void {}
}

mock.module("obsidian", () => ({ ItemView: MockItemView }));

class MemoryStorage {
  readonly values = new Map<string, unknown>();

  loadLocalStorage(key: string): unknown {
    return this.values.get(key) ?? null;
  }

  saveLocalStorage(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

function completed(request: RuntimeTransportRequest, text: string) {
  const citationId = request.prompt.match(/"id":"([^"]+)"/u)?.[1] ?? "missing-citation";
  return {
    protocol_version: "1.0.0",
    runtime_epoch: "session-composition-epoch",
    request_id: request.request_id,
    status: "completed",
    payload: { blocks: [{ kind: "paragraph", text, citationIds: [citationId] }] },
    receipt: {
      consumer_id: "vault.assistant",
      attempt_id: request.attempt_id,
      provider_key: "session-provider",
      model: "session-model",
      route_class: "local",
    },
  };
}

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

test("retains the persisted prior answer when a cancelled evidence request resolves late", async () => {
  // Given
  const { ItemView } = await import("obsidian");
  const { ActiveDocumentTracker, PluginWiringDriver } = await import("../src/active-document");
  const { HistoryStore } = await import("../src/history-store");
  const { ObsidianSession } = await import("../src/mentions");
  const viewValue: unknown = Reflect.construct(ItemView, []);
  if (!(viewValue instanceof ItemView)) throw new TypeError("Expected the fake ItemView realm");
  const document = new TestDocument();
  const tracker = new ActiveDocumentTracker(() => Promise.resolve("Persisted evidence body"));
  tracker.observe({
    kind: "markdown",
    path: markdownFile.path,
    editorValue: () => "Persisted evidence body",
  });
  const requests: RuntimeTransportRequest[] = [];
  const secondStarted = deferred<void>();
  const late = deferred<unknown>();
  const cancelled: string[] = [];
  const runtime: RuntimePublicApi = {
    getHandshake: () => ({
      plugin_id: "prodigy-ai-runtime",
      protocol_version: "1.0.0",
      consumer_manifest_range: ">=1 <2",
      runtime_epoch: "session-composition-epoch",
      capabilities: ["structured-strict"],
    }),
    getStatus: () => ({ status: "ready", adapters: 1, in_flight: 0 }),
    requestStructured: (request) => {
      requests.push(request);
      if (requests.length === 1)
        return Promise.resolve(completed(request, "PRIOR_PERSISTED_ANSWER"));
      secondStarted.resolve();
      return late.promise;
    },
    cancel: (requestId) => {
      cancelled.push(requestId);
      return { status: "cancel_requested" };
    },
    subscribeStatus: () => () => undefined,
    openSettings: () => undefined,
  };
  const mountedRoots: AssistantElement[] = [];
  const store = new HistoryStore(new MemoryStorage(), "session-composition");
  const session = new ObsidianSession({
    view: viewValue,
    store,
    tracker,
    runtime,
    openSource: () => undefined,
    document,
    mount: (mounted) => {
      mountedRoots.push(mounted);
    },
    metadata: () => null,
    projectProvider: (status) => {
      if (status.status === "ready") {
        return { status: "ready", providerLabel: "session-provider", modelLabel: "session-model" };
      }
      if (status.status === "unavailable") {
        return { status: "unavailable", providerLabel: status.providerLabel ?? "runtime" };
      }
      return status;
    },
    projectHistory: () => Promise.resolve(null),
  });
  const driver = new PluginWiringDriver(session, session);
  session.driver = driver;
  await driver.open();
  await driver.submit("first grounded question");

  // When
  const pending = driver.submit("second grounded question");
  await secondStarted.promise;
  const retrievingRoot = mountedRoots[0];
  if (retrievingRoot === undefined) throw new TypeError("Expected the assistant surface to mount");
  expect(retrievingRoot.getAttribute("data-state")).toBe("retrieving");
  expect(retrievingRoot.textContent).toContain("PRIOR_PERSISTED_ANSWER");
  driver.cancel();
  const secondRequest = requests[1];
  if (secondRequest === undefined) throw new TypeError("Expected a deferred second request");
  late.resolve(completed(secondRequest, "LATE_RESPONSE"));
  await pending;

  // Then
  const root = mountedRoots[0];
  if (root === undefined) throw new TypeError("Expected the assistant surface to mount");
  const history = await store.load();
  const assistant = history.conversations[0]?.messages[1];
  expect(root.getAttribute("data-state")).toBe("cancelled");
  expect(root.textContent).toContain("PRIOR_PERSISTED_ANSWER");
  expect(root.textContent).not.toContain("LATE_RESPONSE");
  expect(secondRequest.prompt).toContain('"kind":"vault_evidence"');
  expect(cancelled).toEqual([secondRequest.request_id]);
  expect(assistant).toMatchObject({
    role: "assistant",
    text: "PRIOR_PERSISTED_ANSWER",
    providerLabel: "session-provider",
    modelLabel: "session-model",
  });
  expect(assistant?.citations[0]).toMatchObject({ path: markdownFile.path, startLine: 1 });
});
