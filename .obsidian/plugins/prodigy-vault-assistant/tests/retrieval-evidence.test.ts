import { describe, expect, test } from "bun:test";
import { MAX_EVIDENCE_BYTES, wireEvidenceBytes } from "../src/evidence-budget";
import { chunkMarkdown } from "../src/retrieval-ranking";
import { VaultRetriever } from "../src/vault-retriever";
import { FakePort, file, mention } from "./fixtures/retrieval";

const encoder = new TextEncoder();
const wireBytes = (chunks: readonly { readonly text: string }[]): number =>
  encoder.encode(JSON.stringify(chunks.map(({ text }) => ({ id: "cite-0123456789abcdef", text }))))
    .byteLength;
const input = {
  mode: "current_document",
  question: "alpha beta gamma",
  mentions: [],
  currentDocument: null,
  signal: new AbortController().signal,
} as const;
const sections = (count: number): string =>
  Array.from(
    { length: count },
    (_, index) => `## Section ${index}\nfact_${index}=value_${index}`,
  ).join("\n\n");

describe("retrieval evidence completeness", () => {
  test("includes early, middle and late facts and every small current-document section", async () => {
    const content = sections(9);
    const result = await new VaultRetriever(
      new FakePort({ files: [file("current.md")], contents: {} }),
    ).retrieve({
      ...input,
      currentDocument: { path: "current.md", content },
    });
    expect(result.chunks).toHaveLength(9);
    for (let index = 0; index < 9; index += 1) {
      expect(result.chunks.some(({ text }) => text.includes(`fact_${index}=value_${index}`))).toBe(
        true,
      );
    }
    expect(result.coverage.evidence).toEqual({
      mode: "full",
      selectedChunks: 9,
      totalChunks: 9,
      bytes: wireBytes(result.chunks),
    });
    expect(JSON.parse(result.envelope).chunks).toEqual(result.chunks);
  });

  test("includes all small sections across current document and multiple mentions", async () => {
    const contents = { "a.md": sections(4), "b.md": sections(4), "c.md": sections(4) };
    const result = await new VaultRetriever(
      new FakePort({ files: Object.keys(contents).map((path) => file(path)), contents }),
    ).retrieve({
      ...input,
      mentions: [mention("c.md"), mention("b.md")],
      currentDocument: { path: "a.md", content: contents["a.md"] },
    });
    expect(result.chunks).toHaveLength(12);
    expect(result.coverage.evidence?.mode).toBe("full");
    expect(new Set(result.chunks.map(({ path }) => path))).toEqual(new Set(Object.keys(contents)));
  });

  test("oversized current documents cover distinct query subjects without repetition monopolizing the budget", async () => {
    const content = [
      ...Array.from({ length: 8 }, (_, index) => `## Repeated ${index}\n${"alpha ".repeat(300)}`),
      `## Middle\nbeta=${"b".repeat(1600)}`,
      `## Late\ngamma=${"c".repeat(1600)}`,
    ].join("\n\n");
    const result = await new VaultRetriever(
      new FakePort({ files: [file("a.md")], contents: {} }),
    ).retrieve({
      ...input,
      currentDocument: { path: "a.md", content },
    });
    expect(wireBytes(result.chunks)).toBeLessThanOrEqual(8192);
    expect(result.chunks.some(({ text }) => text.includes("beta="))).toBe(true);
    expect(result.chunks.some(({ text }) => text.includes("gamma="))).toBe(true);
    expect(result.coverage.status).toBe("complete");
    expect(result.coverage.evidence).toEqual({
      mode: "selected",
      selectedChunks: result.chunks.length,
      totalChunks: 10,
      bytes: wireBytes(result.chunks),
    });
    expect(JSON.parse(result.envelope).chunks).toEqual(result.chunks);
  });

  test("six full Whole Vault chunks yield bounded nonempty multi-file evidence", async () => {
    const contents = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`${index}.md`, `alpha ${"x".repeat(2042)}`]),
    );
    const result = await new VaultRetriever(
      new FakePort({ files: Object.keys(contents).map((path) => file(path)), contents }),
    ).retrieve({ ...input, mode: "whole_vault" });
    expect(wireBytes(result.chunks)).toBeLessThanOrEqual(8192);
    expect(result.chunks).toHaveLength(3);
    expect(new Set(result.chunks.map(({ path }) => path)).size).toBe(3);
    expect(JSON.parse(result.envelope).chunks).toEqual(result.chunks);
    expect(result.coverage.evidence?.mode).toBe("selected");
  });

  test("fills the exact provider budget, including JSON overhead, then selects when one byte over", async () => {
    const paragraphs = Array.from({ length: 5 }, (_, index) => `${index} ${"x".repeat(1548)}`);
    const padding = MAX_EVIDENCE_BYTES - wireBytes(paragraphs.map((text) => ({ text })));
    paragraphs[4] += "y".repeat(padding);
    const retriever = new VaultRetriever(new FakePort({ files: [file("a.md")], contents: {} }));
    const full = await retriever.retrieve({
      ...input,
      currentDocument: { path: "a.md", content: paragraphs.join("\n\n") },
    });
    expect(wireBytes(full.chunks)).toBe(8192);
    expect(wireEvidenceBytes(full.chunks)).toBe(wireBytes(full.chunks));
    expect(full.coverage.evidence?.mode).toBe("full");
    expect(full.chunks).toHaveLength(5);
    expect(encoder.encode(full.envelope).byteLength).toBeGreaterThan(8192);
    const selected = await retriever.retrieve({
      ...input,
      currentDocument: { path: "a.md", content: `${paragraphs.join("\n\n")}z` },
    });
    expect(wireBytes(selected.chunks)).toBeLessThanOrEqual(8192);
    expect(selected.coverage.evidence?.mode).toBe("selected");
    expect(selected.chunks).toHaveLength(4);
  });

  test("wire sizing matches escaped Unicode text and empty evidence exactly", async () => {
    const result = await new VaultRetriever(
      new FakePort({ files: [file("a.md")], contents: {} }),
    ).retrieve({
      ...input,
      currentDocument: { path: "a.md", content: `한😀\\"\t${"\\\\".repeat(1000)}\n\nend` },
    });
    expect(wireEvidenceBytes([])).toBe(2);
    expect(wireEvidenceBytes(result.chunks)).toBe(wireBytes(result.chunks));
    expect(wireBytes(result.chunks)).toBeLessThanOrEqual(8192);
    expect(result.coverage.evidence?.mode).toBe("full");
  });

  test("skips an oversized remainder candidate to retain a smaller later file", async () => {
    const contents = {
      "a.md": "alpha ".repeat(300),
      "b.md": "alpha ".repeat(300),
      "c.md": "alpha ".repeat(300),
      "d.md": "alpha ".repeat(300),
      "e.md": "alpha ".repeat(300),
      "z.md": "alpha",
    };
    const result = await new VaultRetriever(
      new FakePort({ files: Object.keys(contents).map((path) => file(path)), contents }),
    ).retrieve({ ...input, mode: "whole_vault" });
    expect(result.chunks.map(({ path }) => path)).toEqual(["a.md", "b.md", "c.md", "d.md", "z.md"]);
    expect(wireBytes(result.chunks)).toBeLessThanOrEqual(8192);
  });

  test("splits Unicode paragraphs with exact line and heading provenance", async () => {
    const content = `# 첫째\n${"가😀".repeat(400)}\n${"나😀".repeat(400)}\n# 둘째\n마지막`;
    const chunks = await chunkMarkdown(content, [], input.signal);
    const lines = content.split("\n");
    expect(chunks.map(({ text }) => text).join("")).toBe(content.replace("\n# 둘째", "# 둘째"));
    for (const chunk of chunks) {
      expect(encoder.encode(chunk.text).byteLength).toBeLessThanOrEqual(2048);
      expect(chunk.text).not.toContain("�");
      expect(lines.slice(chunk.startLine - 1, chunk.endLine).join("\n")).toContain(chunk.text);
      expect(chunk.heading).toBe(chunk.startLine < 4 ? "첫째" : "둘째");
    }
    expect(chunks[chunks.length - 1]).toEqual({
      heading: "둘째",
      startLine: 4,
      endLine: 5,
      text: "# 둘째\n마지막",
    });
  });
});
