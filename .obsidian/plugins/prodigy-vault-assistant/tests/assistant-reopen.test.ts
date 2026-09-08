import { expect, mock, test } from "bun:test";

mock.module("obsidian", () => ({
  ItemView: class {},
  MarkdownView: class {},
  Plugin: class {},
  Platform: { isPhone: false, isTablet: false },
}));
const { openAssistantLeaf, projectRestoredHistory } = await import("../src/main");

test("reopening the assistant reveals its existing leaf without reinitializing the session", async () => {
  // Given
  const calls: string[] = [];
  const existing = {
    setViewState: async () => {
      calls.push("reinitialize");
    },
  };
  const workspace = {
    getLeavesOfType: () => [existing],
    getLeaf: () => {
      calls.push("allocate-tab");
      return existing;
    },
    getRightLeaf: () => {
      calls.push("allocate-sidebar");
      return existing;
    },
    revealLeaf: async () => {
      calls.push("reveal");
    },
  };
  // When
  const phone = await openAssistantLeaf(workspace, "phone");
  const desktop = await openAssistantLeaf(workspace, "desktop");
  // Then
  expect(phone).toBe(existing);
  expect(desktop).toBe(existing);
  expect(calls).toEqual(["reveal", "reveal"]);
});

test("restoring citations reads each document once and reports missing documents as partial", async () => {
  // Given
  const reads: string[] = [];
  const revision = { algorithm: "sha256", hash: "old", capturedAt: 1 } as const;
  const citations = [
    { path: "guide.md", startLine: 1, endLine: 2, revision },
    { path: "guide.md", startLine: 8, endLine: 9, revision },
    { path: "deleted.md", startLine: 1, endLine: 1, revision },
  ];
  // When
  const projection = await projectRestoredHistory(
    {
      version: 1,
      activeConversationId: "conversation",
      conversations: [
        {
          id: "conversation",
          createdAt: 1,
          updatedAt: 2,
          messages: [
            {
              role: "assistant",
              text: "Stored answer",
              timestamp: 2,
              mode: "whole_vault",
              citations,
              providerLabel: "provider",
              modelLabel: "model",
            },
          ],
        },
      ],
    },
    async (path) => {
      reads.push(path);
      return path === "deleted.md" ? null : "Updated content";
    },
  );
  // Then
  expect(reads.sort()).toEqual(["deleted.md", "guide.md"]);
  expect(projection?.result.state).toBe("partial");
  if (projection?.result.state !== "partial") return;
  expect(projection.result.coverage.filesConsidered).toBe(2);
  expect(projection.result.coverage.filesRead).toBe(1);
  expect(projection.result.sources.map((source) => source.status)).toEqual([
    "stale",
    "stale",
    "missing",
  ]);
});
