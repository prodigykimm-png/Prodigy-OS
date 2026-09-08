import { describe, expect, test } from "bun:test";
import { type RetrievalMetadata, VaultRetriever } from "../src/vault-retriever";
import { FakePort, file, mention } from "./fixtures/retrieval";

const input = {
  mode: "whole_vault",
  question: "alpha",
  mentions: [],
  currentDocument: null,
  signal: new AbortController().signal,
} as const;

describe("retrieval preparation reuse", () => {
  test("reuses prepared chunks and revisions across repeats and corpus reordering", async () => {
    const contents = { "a.md": "alpha\n\nalpha", "b.md": "alpha" };
    const port = new FakePort({ files: [file("b.md"), file("a.md")], contents });
    const retriever = new VaultRetriever(port);
    const first = await retriever.retrieve(input);
    port.replaceFiles([file("a.md"), file("b.md")]);
    const second = await retriever.retrieve(input);
    const fresh = await new VaultRetriever(port).retrieve(input);
    expect(second).toEqual(first);
    expect(fresh).toEqual(first);
    first.chunks.forEach((chunk, index) => {
      expect(second.chunks[index]).toBe(chunk);
      expect(second.chunks[index]?.revision).toBe(chunk.revision);
    });
    expect(port.reads).toEqual(["a.md", "b.md", "a.md", "b.md"]);
  });

  test("invalidates edited content, evicts deletions and reloads a recreated identical-stat path", async () => {
    const contents = { "a.md": "alpha old" };
    const port = new FakePort({ files: [file("a.md")], contents });
    const retriever = new VaultRetriever(port);
    const first = await retriever.retrieve(input);
    contents["a.md"] = "alpha edited";
    port.replaceFiles([file("a.md", 110, 2)]);
    const edited = await retriever.retrieve(input);
    expect(edited.chunks[0]?.text).toBe("alpha edited");
    expect(edited.chunks[0]?.revision.hash).not.toBe(first.chunks[0]?.revision.hash);
    expect(edited.chunks[0]).not.toBe(first.chunks[0]);
    port.replaceFiles([]);
    const deleted = await retriever.retrieve({ ...input, mentions: [mention("a.md")] });
    expect(deleted.chunks).toEqual([]);
    expect(deleted.coverage).toEqual({
      status: "partial",
      filesConsidered: 0,
      filesRead: 0,
      issues: [{ path: "a.md", reason: "missing" }],
      evidence: { mode: "full", selectedChunks: 0, totalChunks: 0, bytes: 2 },
    });
    contents["a.md"] = "alpha recreated";
    port.replaceFiles([file("a.md", 110, 2)]);
    const recreated = await retriever.retrieve(input);
    expect(recreated.chunks[0]?.text).toBe("alpha recreated");
    expect(port.reads).toEqual(["a.md", "a.md", "a.md"]);
  });

  test("metadata changes reprepare without disk reads and unchanged metadata reuses chunks", async () => {
    const metadata: Record<string, RetrievalMetadata> = {
      "a.md": { aliases: ["alpha"], headings: [{ heading: "old", line: 1 }] },
    };
    const port = new FakePort({
      files: [file("a.md")],
      contents: { "a.md": "body\n\nlast" },
      metadata,
    });
    const retriever = new VaultRetriever(port);
    const first = await retriever.retrieve(input);
    metadata["a.md"] = {
      aliases: ["beta"],
      tags: ["topic"],
      headings: [{ heading: "new", line: 1 }],
    };
    const second = await retriever.retrieve({ ...input, question: "beta" });
    expect(second.chunks[0]).not.toBe(first.chunks[0]);
    expect(second.chunks[0]?.heading).toBe("new");
    expect(second.chunks[0]?.revision).toBe(first.chunks[0]?.revision);
    const oldQuery = await retriever.retrieve(input);
    expect(oldQuery.chunks).toEqual([]);
    metadata["a.md"] = {
      aliases: ["beta"],
      tags: ["topic"],
      headings: [{ heading: "new", line: 1 }],
    };
    const stable = await retriever.retrieve({ ...input, question: "topic" });
    expect(stable.chunks[0]).toBe(second.chunks[0]);
    expect(port.reads).toEqual(["a.md"]);
  });

  test("unsaved snapshots reuse preparation, invalidate on edit and ignore stale disk heading lines", async () => {
    const port = new FakePort({
      files: [file("a.md")],
      contents: { "a.md": "# Disk\nalpha" },
      metadata: {
        "a.md": {
          headings: [
            { heading: "Disk", line: 1 },
            { heading: "Stale", line: 3 },
          ],
        },
      },
    });
    const retriever = new VaultRetriever(port);
    const current = {
      ...input,
      mode: "current_document",
      currentDocument: { path: "a.md", content: "# Editor\nalpha\nbody" },
    } as const;
    const first = await retriever.retrieve(current);
    const second = await retriever.retrieve(current);
    expect(second.chunks[0]).toBe(first.chunks[0]);
    expect(first.chunks).toHaveLength(1);
    expect(first.chunks[0]?.heading).toBe("Editor");
    const edited = await retriever.retrieve({
      ...current,
      currentDocument: { path: "a.md", content: "# New\nalpha changed" },
    });
    expect(edited.chunks[0]?.heading).toBe("New");
    expect(edited.chunks[0]?.revision.hash).not.toBe(first.chunks[0]?.revision.hash);
    expect(port.reads).toEqual([]);
    const disk = await retriever.retrieve(input);
    expect(disk.chunks[0]?.text).toBe("# Disk\nalpha");
    expect(port.reads).toEqual(["a.md"]);
  });
});
