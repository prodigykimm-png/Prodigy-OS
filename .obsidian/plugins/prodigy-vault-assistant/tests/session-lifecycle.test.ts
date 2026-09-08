import { expect, mock, test } from "bun:test";
import {
  ActiveDocumentTracker,
  PluginWiringDriver,
  type RuntimePublicApi,
} from "../src/active-document";
import type { HistoryState, RuntimeTransportRequest, SourceRecord } from "../src/contracts";
import { HistoryStore } from "../src/history-store";
import type { ObsidianSessionDependencies } from "../src/main";
import { ObsidianSession } from "../src/mentions";
import type { AssistantElement } from "../src/view-model";
import { deferred } from "./fixtures/assistant-service";
import { TestDocument, TestElement } from "./fixtures/test-dom";

const file = { path: "A.md", basename: "A", stat: { mtime: 1, size: 20 } };
class MockItemView {
  readonly contentEl = { ownerDocument: { hidden: false } };
  readonly app = {
    vault: {
      getMarkdownFiles: () => [file],
      getFileByPath: (path: string) => (path === file.path ? file : null),
      cachedRead: () => Promise.resolve("EVIDENCE_A"),
    },
    metadataCache: { resolvedLinks: {} },
  };
  registerDomEvent(): void {}
}
mock.module("obsidian", () => ({ ItemView: MockItemView }));

function completed(request: RuntimeTransportRequest) {
  const prompt = JSON.parse(request.prompt);
  return {
    protocol_version: "1.0.0",
    runtime_epoch: "epoch",
    request_id: request.request_id,
    status: "completed",
    payload: {
      blocks: [
        {
          kind: "paragraph",
          text: "ANSWER_SENTINEL",
          citationIds: [prompt.context[1].chunks[0].id],
        },
      ],
    },
    receipt: {
      consumer_id: "vault.assistant",
      attempt_id: request.attempt_id,
      provider_key: "local",
      model: "model",
      route_class: "local",
    },
  };
}

async function harness(
  respond: (request: RuntimeTransportRequest) => Promise<unknown> = (request) =>
    Promise.resolve(completed(request)),
  overrides: Pick<ObsidianSessionDependencies, "refreshSources" | "projectHistory"> = {
    projectHistory: async () => null,
  },
) {
  const { ItemView } = await import("obsidian");
  const viewValue: unknown = Reflect.construct(ItemView, []);
  if (!(viewValue instanceof ItemView)) throw new Error("Expected ItemView");
  const document = new TestDocument();
  const tracker = new ActiveDocumentTracker(async () => "EVIDENCE_A");
  tracker.observe({ kind: "markdown", path: "A.md", editorValue: () => "EVIDENCE_A" });
  const requests: RuntimeTransportRequest[] = [];
  let saved: unknown = null;
  const store = new HistoryStore(
    {
      loadLocalStorage: () => saved,
      saveLocalStorage: (_key, value) => {
        saved = value;
      },
    },
    "lifecycle",
  );
  const runtime: RuntimePublicApi = {
    getHandshake: () => ({
      plugin_id: "prodigy-ai-runtime",
      protocol_version: "1.0.0",
      consumer_manifest_range: ">=1 <2",
      runtime_epoch: "epoch",
      capabilities: ["structured-strict"],
    }),
    getStatus: () => ({ status: "ready", adapters: 1, in_flight: 0 }),
    requestStructured: (request) => {
      requests.push(request);
      return respond(request);
    },
    cancel: () => Promise.reject(new Error("remote cancel failed")),
    subscribeStatus: () => () => undefined,
    openSettings: () => undefined,
  };
  const roots: AssistantElement[] = [];
  const session = new ObsidianSession({
    view: viewValue,
    store,
    tracker,
    runtime,
    document,
    mount: (root) => roots.push(root),
    metadata: () => null,
    openSource: () => undefined,
    projectProvider: () => ({ status: "ready", providerLabel: "local", modelLabel: "model" }),
    ...overrides,
  });
  const driver = new PluginWiringDriver(session, session);
  session.driver = driver;
  await driver.open();
  const root = roots[0];
  if (root === undefined) throw new Error("Expected mounted root");
  return { session, driver, root, tracker, requests, store };
}

function click(root: AssistantElement, selector: string): void {
  const element = root.querySelector(selector);
  if (element === null) throw new Error(`Missing ${selector}`);
  element.dispatchEvent(new Event("click"));
}

test("document switches during provider work preserve captured history path", async () => {
  const started = deferred<RuntimeTransportRequest>();
  const response = deferred<unknown>();
  const h = await harness((request) => {
    started.resolve(request);
    return response.promise;
  });
  const pending = h.driver.submit("ORIGINAL_QUESTION");
  const request = await started.promise;
  expect(h.root.getAttribute("data-state")).toBe("answering");
  h.tracker.observe({ kind: "markdown", path: "B.md", editorValue: () => "EVIDENCE_B" });
  response.resolve(completed(request));
  await pending;
  const history = await h.store.load();
  expect(history.conversations[0]?.messages[0]).toMatchObject({
    text: "ORIGINAL_QUESTION",
    mode: "current_document",
    currentPath: "A.md",
  });
  expect(history.conversations[0]?.messages[1]?.citations[0]?.path).toBe("A.md");
});

test("retry uses frozen question, document, dialogue and operation with a new attempt", async () => {
  let count = 0;
  const h = await harness((request) => {
    count += 1;
    return count === 1
      ? Promise.reject(new Error("transport failed"))
      : Promise.resolve(completed(request));
  });
  await h.driver.submit("ORIGINAL_QUESTION");
  expect(h.root.getAttribute("data-state")).toBe("error");
  expect(h.root.getAttribute("aria-busy")).toBe("false");
  const composer = h.root.querySelector("textarea");
  if (!(composer instanceof TestElement)) throw new Error("Missing composer");
  composer.value = "DIFFERENT_COMPOSER";
  h.tracker.observe({ kind: "markdown", path: "B.md", editorValue: () => "EVIDENCE_B" });
  const retried = deferred<void>();
  const originalRetry = h.driver.retry.bind(h.driver);
  h.driver.retry = async () => {
    await originalRetry();
    retried.resolve();
  };
  click(h.root, '[data-action="retry"]');
  await retried.promise;
  const [first, second] = h.requests;
  if (first === undefined || second === undefined) throw new Error("Missing attempts");
  expect(second.operation_id).toBe(first.operation_id);
  expect(second.owner_session_id).toBe(first.owner_session_id);
  expect(second.attempt_id).not.toBe(first.attempt_id);
  const prompt = JSON.parse(second.prompt);
  expect(prompt.question).toBe("ORIGINAL_QUESTION");
  expect(prompt.context[0].messages).toEqual([]);
  expect(prompt.context[1].chunks[0].text).toBe("EVIDENCE_A");
  expect(h.root.getAttribute("data-state")).toBe("answered");
}, 1_000);

for (const action of ["mode", "history", "clear"] as const) {
  test(`${action} change invalidates a pending response without persisting it`, async () => {
    const started = deferred<RuntimeTransportRequest>();
    const response = deferred<unknown>();
    let calls = 0;
    const h = await harness((request) => {
      calls += 1;
      if (calls === 1) return Promise.resolve(completed(request));
      started.resolve(request);
      return response.promise;
    });
    await h.driver.submit("PRIOR_QUESTION");
    const prior = await h.store.load();
    const pending = h.driver.submit("STALE_QUESTION");
    const request = await started.promise;
    if (action === "mode") click(h.root, '[data-mode="whole_vault"]');
    if (action === "history") click(h.root, `[data-history-id="${prior.activeConversationId}"]`);
    if (action === "clear") await h.driver.clearHistory();
    response.resolve(completed(request));
    await pending;
    expect(h.root.getAttribute("aria-busy")).toBe("false");
    const stored = await h.store.load();
    expect(
      stored.conversations
        .flatMap(({ messages }) => messages)
        .some(({ text }) => text === "STALE_QUESTION"),
    ).toBe(false);
    if (action === "clear") expect(stored.conversations).toEqual([]);
  });
}

test("clear during a deferred append prevents the store commit and releases busy state", async () => {
  const h = await harness();
  const appending = deferred<void>();
  const release = deferred<void>();
  const append = h.store.appendExchange.bind(h.store);
  h.store.appendExchange = async (exchange, signal) => {
    appending.resolve();
    await release.promise;
    return append(exchange, signal);
  };
  const pending = h.driver.submit("STALE_QUESTION");
  await appending.promise;
  await h.driver.clearHistory();
  release.resolve();
  await pending;
  expect((await h.store.load()).conversations).toEqual([]);
  expect(h.root.getAttribute("aria-busy")).toBe("false");
});

test("storage append rejection is a typed non-busy state", async () => {
  const h = await harness();
  h.store.appendExchange = () => Promise.reject(new Error("storage unavailable"));
  await h.driver.submit("QUESTION");
  expect(h.root.getAttribute("data-state")).toBe("error");
  expect(h.root.getAttribute("aria-busy")).toBe("false");
});

test("a pending history restore cannot overwrite a newer request", async () => {
  const h = await harness();
  const restore = deferred<HistoryState>();
  h.store.load = () => restore.promise;
  const restoring = h.session.restoreHistory();
  h.session.incrementGeneration();
  h.session.clearTransientEvidence();
  restore.resolve({ version: 1, activeConversationId: null, conversations: [] });
  await restoring;
  expect(h.root.getAttribute("data-state")).toBe("idle");
});

for (const status of ["stale", "missing"] as const) {
  test(`refreshes ${status} source status before persisting the same validated evidence`, async () => {
    const refreshed: SourceRecord[] = [];
    const h = await harness(undefined, {
      projectHistory: async () => null,
      refreshSources: async (sources) => {
        refreshed.push(...sources);
        return sources.map((source) => ({ ...source, status }));
      },
    });
    await h.driver.submit("QUESTION");
    expect(h.requests).toHaveLength(1);
    expect(h.root.querySelector(`[data-source-status="${status}"]`)).not.toBeNull();
    const citation = (await h.store.load()).conversations[0]?.messages[1]?.citations[0];
    expect(citation?.revision).toEqual(refreshed[0]?.revision);
    expect(citation?.path).toBe("A.md");
  });
}

test("cancellation during source refresh settles without late persistence", async () => {
  const started = deferred<readonly SourceRecord[]>();
  const refreshed = deferred<readonly SourceRecord[]>();
  const h = await harness(undefined, {
    projectHistory: async () => null,
    refreshSources: (sources) => {
      started.resolve(sources);
      return refreshed.promise;
    },
  });
  const pending = h.driver.submit("QUESTION");
  const sources = await started.promise;
  h.driver.cancel();
  await pending;
  refreshed.resolve(sources);
  expect((await h.store.load()).conversations).toEqual([]);
  expect(h.root.getAttribute("data-state")).toBe("cancelled");
  expect(h.requests).toHaveLength(1);
}, 1_000);

for (const stage of ["load", "projection", "refresh"] as const) {
  test(`bounds ${stage} rejection as a typed state`, async () => {
    const h = await harness(undefined, {
      projectHistory:
        stage === "projection" ? () => Promise.reject(new Error("read failed")) : async () => null,
      ...(stage === "refresh"
        ? { refreshSources: () => Promise.reject(new Error("read failed")) }
        : {}),
    });
    if (stage === "load") {
      h.store.load = () => Promise.reject(new Error("read failed"));
      await h.session.restoreHistory();
    }
    if (stage === "refresh") await h.driver.submit("QUESTION");
    expect(h.root.getAttribute("data-state")).toBe("error");
    expect(h.root.getAttribute("aria-busy")).toBe("false");
    expect(h.root.getAttribute("data-error-code")).toBe("read_error");
  });
}
