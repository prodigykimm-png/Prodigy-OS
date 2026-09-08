import { describe, expect, mock, test } from "bun:test";
import { ActiveDocumentTracker } from "../src/active-document";
import { MentionSelection } from "../src/mentions";
import { createViewModel } from "../src/view-model";
import {
  actualRuntimeStatuses,
  answerRaceEffects,
  labeledRuntimeStatuses,
  persistenceRaceEffects,
  preparationRaceEffects,
} from "./fixtures/plugin-runtime-races";
import {
  FakeSession,
  FakeWorkspace,
  markdownLeaf,
  restoredHistoryFixture,
  runtimeStatusSource,
} from "./fixtures/plugin-wiring";

class MockItemView {}
class MockMarkdownView {}
class MockPlugin {}
mock.module("obsidian", () => ({
  ItemView: MockItemView,
  MarkdownView: MockMarkdownView,
  Platform: { isPhone: false, isTablet: false },
  Plugin: MockPlugin,
}));
const { PluginWiringDriver, openAssistantLeaf, registerAssistantSurface, sourceLinkText } =
  await import("../src/main");
const { nodeFromDocument } = await import("../src/dom-realm");

describe("Todo 9 plugin wiring", () => {
  test("mounts only a node created by the content owner document realm", () => {
    class OwningRealmNode {}
    class GlobalRealmNode {}
    const ownerDocument = { defaultView: { Node: OwningRealmNode } };
    const ownedRoot = new OwningRealmNode();

    expect(nodeFromDocument(ownedRoot, ownerDocument)).toBe(ownedRoot);
    expect(nodeFromDocument(new GlobalRealmNode(), ownerDocument)).toBeNull();
  });

  test("opens right sidebar on desktop and tablet", async () => {
    for (const device of ["desktop", "tablet"] as const) {
      const workspace = new FakeWorkspace();
      const leaf = await openAssistantLeaf(workspace, device);
      expect(workspace.calls).toEqual(["getRightLeaf:false", "setViewState", "revealLeaf"]);
      expect(leaf).toBe(workspace.rightLeaf);
    }
  });

  test("opens editor leaf on phone", async () => {
    const workspace = new FakeWorkspace();
    const leaf = await openAssistantLeaf(workspace, "phone");
    expect(workspace.calls).toEqual(["getLeaf:tab", "setViewState", "revealLeaf"]);
    expect(leaf).toBe(workspace.tabLeaf);
  });

  test("registers its view before exactly one ribbon and command", () => {
    const calls: string[] = [];
    registerAssistantSurface({
      registerView: () => calls.push("view"),
      addRibbonIcon: () => calls.push("ribbon"),
      addCommand: () => calls.push("command"),
    });
    expect(calls).toEqual(["view", "ribbon", "command"]);
  });

  test("preserves the prior Markdown leaf and snapshots its unsaved editor", async () => {
    const reads: string[] = [];
    const tracker = new ActiveDocumentTracker(async (path) => {
      reads.push(path);
      return "saved body";
    });
    const leaf = markdownLeaf("People/민수.md", "unsaved body");
    tracker.observe(leaf);
    tracker.observe({ kind: "assistant" });
    const result = await tracker.snapshot();
    expect(result).toEqual({
      ok: true,
      document: { path: "People/민수.md", content: "unsaved body" },
    });
    expect(reads).toEqual([]);
  });

  test("falls back to cachedRead for the pinned Markdown file", async () => {
    const tracker = new ActiveDocumentTracker(async () => "cached body");
    const leaf = markdownLeaf("Journal/today.md", null);
    tracker.observe(leaf);
    expect(await tracker.snapshot()).toEqual({
      ok: true,
      document: { path: "Journal/today.md", content: "cached body" },
    });
  });

  test("blocks Current Document without Markdown", async () => {
    const session = new FakeSession();
    const driver = new PluginWiringDriver(session, runtimeStatusSource());
    await driver.submit("질문");
    expect(session.serviceCalls).toEqual([]);
    expect(session.states[session.states.length - 1]).toBe("no_current_document");
  });

  test("normalizes multiple mentions, deduplicates, and retains deleted selections", () => {
    const files = ["People/민수.md", "ZETA/촬영법.md"];
    const selection = new MentionSelection(() => files);
    selection.add("/People\\민수.md");
    selection.add("People/민수.md");
    selection.add("ZETA/촬영법.md");
    files.splice(0, 1);
    expect(selection.selected().map(({ path }) => path)).toEqual([
      "People/민수.md",
      "ZETA/촬영법.md",
    ]);
    expect(selection.selected()[0]?.label).toBe("삭제됨: 민수");
  });

  test("opens source link text with its heading", () => {
    expect(sourceLinkText("People/민수.md", "만남")).toBe("People/민수#만남");
    expect(sourceLinkText("root.md")).toBe("root");
  });

  test("restores and clears history using receipt labels", async () => {
    const session = new FakeSession({ history: true });
    const driver = new PluginWiringDriver(session, runtimeStatusSource());
    await driver.open();
    expect(session.restoredLabels).toEqual(["configured-provider / configured-model"]);
    await driver.clearHistory();
    expect(session.clearCount).toBe(1);
    expect(session.historyLabels).toEqual([]);
  });

  test("subscribes to runtime status and detaches callbacks on close", async () => {
    const status = runtimeStatusSource();
    const session = new FakeSession({ currentLeaf: markdownLeaf("A.md", "draft") });
    const driver = new PluginWiringDriver(session, status);
    await driver.open();
    status.emit({
      status: "ready",
      adapters: 1,
      inFlight: 0,
      providerLabel: "local",
      modelLabel: "model",
    });
    expect(session.runtimeLabels).toEqual(["local / model"]);
    driver.close();
    status.emit({ status: "unavailable", providerLabel: "runtime" });
    expect(session.runtimeLabels).toEqual(["local / model"]);
  });

  test("aborts on unload and hidden, clears evidence, and does not resume on foreground", async () => {
    const status = runtimeStatusSource();
    const session = new FakeSession({ currentLeaf: markdownLeaf("A.md", "draft") });
    const driver = new PluginWiringDriver(session, status);
    await driver.open();
    const pending = driver.submit("질문");
    await session.serviceStarted;
    driver.visibilityChanged(true);
    driver.visibilityChanged(false);
    await pending;
    expect(session.abortCount).toBe(1);
    expect(session.clearEvidenceCount).toBe(1);
    expect(session.serviceCalls).toHaveLength(1);
    expect(status.listenerCount()).toBe(0);
    driver.unload();
    expect(session.generation).toBe(2);
  });
});

describe("Todo 9 verifier regressions", () => {
  test("renders a retained deleted mention as visibly missing", () => {
    const files = ["People/민수.md"];
    const selection = new MentionSelection(() => files);
    selection.add("People/민수.md");
    files.splice(0, 1);
    expect(selection.selected()).toEqual([
      { kind: "vault_file", path: "People/민수.md", label: "삭제됨: 민수" },
    ]);
  });

  test("projects runtime readiness payloads without manufacturing ready labels", () => {
    expect(labeledRuntimeStatuses()).toEqual([
      {
        status: "ready",
        adapters: 1,
        inFlight: 0,
        providerLabel: "On-device provider",
        modelLabel: "Vault model v2",
      },
      { status: "unavailable", providerLabel: "On-device provider" },
    ]);
  });

  test("restores receipt labels and complete citation locators with current status", async () => {
    const { projectRestoredHistory } = await import("../src/main");
    const content = "# 만남\n민수와 금요일에 만났다.";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    const hash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const projection = await projectRestoredHistory(
      restoredHistoryFixture(hash),
      async () => content,
    );
    expect(projection?.provider).toEqual({
      status: "ready",
      providerLabel: "Receipt provider",
      modelLabel: "Receipt model",
    });
    expect(projection?.result).toMatchObject({
      state: "answered",
      sources: [
        {
          status: "current",
          path: "People/민수.md",
          heading: "만남",
          startLine: 1,
          endLine: 2,
          revision: { hash },
        },
      ],
    });
    if (projection === null) throw new TypeError("Expected restored history projection");
    const model = createViewModel({
      mode: "whole_vault",
      currentDocumentLabel: null,
      mentions: [],
      mentionSuggestions: [],
      history: [],
      provider: projection.provider,
      result: projection.result,
      priorBlocks: [],
    });
    expect(model.providerText).toBe("Receipt provider / Receipt model");
    expect(model.sources[0]).toMatchObject({
      status: "current",
      path: "People/민수.md",
      heading: "만남",
    });
  });

  test("rejects an awaited answer after lifecycle generation advances", async () => {
    expect(await answerRaceEffects()).toEqual([]);
  });
});

describe("Todo 9 real runtime and persistence races", () => {
  test("projects the exact unlabeled runtime getStatus and request event shapes", () => {
    expect(actualRuntimeStatuses()).toEqual([
      { status: "ready", adapters: 1, inFlight: 0 },
      { status: "ready", adapters: 1, inFlight: 0 },
    ]);
  });

  test("drops mutation and persistence when generation changes at the commit await seam", async () => {
    expect(await preparationRaceEffects()).toEqual([]);
  });
});

test("drops result and persistence effects when generation changes during deferred persistence", async () => {
  expect(await persistenceRaceEffects()).toEqual([]);
});
