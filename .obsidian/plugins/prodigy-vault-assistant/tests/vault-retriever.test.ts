import { describe, expect, test } from "bun:test";
import { wireEvidenceBytes } from "../src/evidence-budget";
import { chunkMarkdown, RetrievalChunkCancelledError } from "../src/retrieval-ranking";
import { RetrievalCancelledError, VaultRetriever } from "../src/vault-retriever";
import {
  FakePort,
  file,
  largeRetrievalFixture,
  machinePolicyFixture,
  mention,
  paths,
  peopleRetrievalFixture,
  sourceBounds,
  venueRetrievalFixture,
} from "./fixtures/retrieval";

const encoder = new TextEncoder();

describe("VaultRetriever", () => {
  test("combines venue and shooting guidance", async () => {
    const port = new FakePort(venueRetrievalFixture());

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "OO홀 주의할 점",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(sourceBounds(result)).toEqual([
      "current:PARA/OO홀.md:1-2",
      "current:ZETA/촬영법.md:1-2",
    ]);
  });

  test("combines people and dated interaction records", async () => {
    const port = new FakePort(peopleRetrievalFixture());

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "누구와 술을 마셨지",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(new Set(paths(result))).toEqual(new Set(["People/민수.md", "DAILY/2026-09-01.md"]));
  });

  test("prefers an unsaved current document without reading disk", async () => {
    const target = file("INBOX/초안.md");
    const port = new FakePort({ files: [target], contents: { "INBOX/초안.md": "저장된 내용" } });

    const result = await new VaultRetriever(port).retrieve({
      mode: "current_document",
      question: "무슨 내용",
      mentions: [],
      currentDocument: { path: "INBOX/초안.md", content: "# 변경\n저장하지 않은 변경 내용" },
      signal: new AbortController().signal,
    });

    expect(result.chunks[0]?.text).toContain("저장하지 않은 변경");
    expect(port.reads).toEqual([]);
  });

  test("normalizes and deduplicates multiple mentions while preserving raw question text", async () => {
    const target = file("People/민수.md");
    const port = new FakePort({ files: [target], contents: { "People/민수.md": "# 민수\n친구" } });
    const question = "@알수없음 근황";

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question,
      mentions: [mention("People\\민수.md"), mention("People/민수.md")],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(result.mentions).toEqual(["People/민수.md"]);
    expect(result.question).toBe(question);
    expect(paths(result)).toEqual(["People/민수.md"]);
  });

  test("excludes only machine roots", async () => {
    const { allowed, files, contents } = machinePolicyFixture();
    const port = new FakePort({ files, contents });

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "공통 검색어",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(port.reads).toEqual([...allowed].sort((left, right) => left.localeCompare(right, "en")));
    expect(paths(result).every((path) => allowed.includes(path))).toBe(true);
  });

  test("retrieves bounded evidence from a multi-megabyte note", async () => {
    const fixture = largeRetrievalFixture();
    const port = new FakePort({ files: fixture.files, contents: fixture.contents });
    const retriever = new VaultRetriever(port);
    const input = {
      mode: "whole_vault",
      question: fixture.query,
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    } as const;

    const result = await retriever.retrieve(input);
    await retriever.retrieve(input);
    const largeChunks = result.chunks.filter((chunk) => chunk.path === fixture.largePath);
    const perFileCounts = paths(result).map(
      (path) => result.chunks.filter((chunk) => chunk.path === path).length,
    );

    expect(
      fixture.files.find((target) => target.path === fixture.largePath)?.stat.size,
    ).toBeGreaterThan(3.1 * 1024 * 1024);
    expect(sourceBounds(result, fixture.largePath)).toEqual([
      "current:A-large.md:3-3",
      "current:A-large.md:3-3",
    ]);
    expect(
      largeChunks.every(
        (chunk) =>
          chunk.text.includes(fixture.query) && !chunk.text.includes(fixture.excludedSentinel),
      ),
    ).toBe(true);
    expect(result.chunks).toHaveLength(6);
    expect(Math.max(...perFileCounts)).toBe(2);
    expect(result.chunks.every((chunk) => encoder.encode(chunk.text).byteLength <= 2048)).toBe(
      true,
    );
    expect(wireEvidenceBytes(result.chunks)).toBeLessThanOrEqual(8192);
    expect(JSON.parse(result.envelope).chunks).toEqual(result.chunks);
    expect(result.envelope).not.toContain(fixture.excludedSentinel);
    expect(port.reads).toEqual(["A-large.md", "B.md", "C.md", "D.md"]);
    expect(port.readByteCounts).toHaveLength(4);
  });

  test("uses path then line for deterministic same-score ties", async () => {
    const files = [file("ZETA/b.md"), file("ZETA/a.md")];
    const port = new FakePort({
      files,
      contents: { "ZETA/a.md": "검색어\n\n검색어", "ZETA/b.md": "검색어" },
    });
    const retriever = new VaultRetriever(port);
    const input = {
      mode: "whole_vault",
      question: "검색어",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    } as const;

    const first = await retriever.retrieve(input);
    expect(first.chunks.map((chunk) => `${chunk.path}:${chunk.startLine}`)).toEqual([
      "ZETA/a.md:1",
      "ZETA/a.md:3",
      "ZETA/b.md:1",
    ]);
    expect(port.reads).toEqual(["ZETA/a.md", "ZETA/b.md"]);
  });

  test("cancels before remaining reads", async () => {
    const controller = new AbortController();
    const files = [file("a.md"), file("b.md")];
    const port = new FakePort({
      files,
      contents: { "a.md": "검색어\n\n검색어", "b.md": "검색어" },
      afterRead: () => controller.abort(),
    });

    const action = new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "검색어",
      mentions: [],
      currentDocument: null,
      signal: controller.signal,
    });

    await expect(action).rejects.toBeInstanceOf(RetrievalCancelledError);
    expect(port.reads).toEqual(["a.md"]);
  });

  test("reports unreadable iCloud files as partial coverage", async () => {
    const files = [file("a.md"), file("offloaded.md")];
    const port = new FakePort({
      files,
      contents: { "a.md": "검색어" },
      failures: new Set(["offloaded.md"]),
    });

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "검색어",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(result.coverage).toEqual({
      status: "partial",
      filesConsidered: 2,
      filesRead: 1,
      issues: [{ path: "offloaded.md", reason: "unreadable" }],
      evidence: {
        mode: "full",
        selectedChunks: 1,
        totalChunks: 1,
        bytes: wireEvidenceBytes(result.chunks),
      },
    });
  });

  test("returns zero chunks when there is no evidence and reports missing mentions", async () => {
    const target = file("a.md");
    const port = new FakePort({ files: [target], contents: { "a.md": "완전히 무관한 본문" } });

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "검색되지않음",
      mentions: [mention("deleted.md")],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(result.chunks).toEqual([]);
    expect(result.coverage.status).toBe("partial");
    expect(result.coverage.status === "partial" ? result.coverage.issues : []).toContainEqual({
      path: "deleted.md",
      reason: "missing",
    });
  });

  test("weights NFKC Korean metadata and performs only one graph hop", async () => {
    const files = [file("A.md"), file("B.md"), file("C.md")];
    const port = new FakePort({
      files,
      contents: { "A.md": "본문", "B.md": "연결 문서", "C.md": "두 단계 문서" },
      metadata: {
        "A.md": {
          aliases: ["ＯＯ홀"],
          tags: ["#촬영"],
          headings: [{ heading: "주의점", line: 1 }],
        },
      },
      links: { "A.md": { "B.md": 1 }, "B.md": { "C.md": 1 } },
    });

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question: "OO홀 촬영 주의점",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(paths(result)).toEqual(["A.md", "B.md"]);
  });
  test("cancels between chunks", async () => {
    const controller = new AbortController();
    const action = chunkMarkdown("검색어 ".repeat(2_000), [], controller.signal);
    queueMicrotask(() => controller.abort());

    await expect(action).rejects.toBeInstanceOf(RetrievalChunkCancelledError);
  });

  test("invalidates the memory cache when mtime or size changes", async () => {
    const port = new FakePort({ files: [file("a.md")], contents: { "a.md": "검색어" } });
    const retriever = new VaultRetriever(port);
    const input = {
      mode: "whole_vault",
      question: "검색어",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    } as const;

    await retriever.retrieve(input);
    port.replaceFiles([file("a.md", 100, 2)]);
    await retriever.retrieve(input);
    port.replaceFiles([file("a.md", 101, 2)]);
    await retriever.retrieve(input);

    expect(port.reads).toEqual(["a.md", "a.md", "a.md"]);
  });
});
