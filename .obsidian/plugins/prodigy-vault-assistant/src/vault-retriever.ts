import type {
  ActiveDocumentSnapshot,
  Coverage,
  CoverageIssue,
  SourceChunk,
  SourceRecord,
  SourceRevision,
  StructuredMention,
} from "./contracts";
import {
  chunkMarkdown,
  currentSources,
  isEligiblePath,
  normalizeMentions,
  normalizeVaultPath,
  oneHopPaths,
  type RankingCandidate,
  type RankingMetadata,
  RetrievalChunkCancelledError,
  rankChunks,
  scoreCandidate,
  serializeEnvelope,
  tokenize,
} from "./retrieval-ranking";

const encoder = new TextEncoder();

export interface RetrievalFile {
  readonly path: string;
  readonly basename: string;
  readonly stat: { readonly mtime: number; readonly size: number };
}

export interface RetrievalMetadata {
  readonly aliases?: readonly string[];
  readonly tags?: readonly string[];
  readonly headings?: readonly { readonly heading: string; readonly line: number }[];
}

export interface RetrievalPort {
  readonly getMarkdownFiles: () => readonly RetrievalFile[];
  readonly cachedRead: (file: RetrievalFile) => Promise<string>;
  readonly metadata: (file: RetrievalFile) => RetrievalMetadata | null;
  readonly resolvedLinks: () => Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface RetrievalInput {
  readonly mode: "current_document" | "whole_vault";
  readonly question: string;
  readonly mentions: readonly StructuredMention[];
  readonly currentDocument: ActiveDocumentSnapshot | null;
  readonly signal: AbortSignal;
}

export interface RetrievalResult {
  readonly question: string;
  readonly mentions: readonly string[];
  readonly chunks: readonly SourceChunk[];
  readonly sources: readonly SourceRecord[];
  readonly coverage: Coverage;
  readonly envelope: string;
}

interface CachedContent {
  readonly content: string;
  readonly revision: SourceRevision;
}

interface PreparedDocument {
  readonly file: RetrievalFile;
  readonly metadata: RankingMetadata;
  readonly chunks: readonly SourceChunk[];
}

export class RetrievalCancelledError extends Error {
  constructor() {
    super("Vault retrieval cancelled");
  }
}

class VaultFileReadError extends Error {
  constructor(
    readonly path: string,
    options: ErrorOptions,
  ) {
    super(`Unable to read ${path}`, options);
  }
}

export class VaultRetriever {
  readonly #cache = new Map<string, { readonly key: string; readonly value: CachedContent }>();

  constructor(private readonly port: RetrievalPort) {}

  async retrieve(input: RetrievalInput): Promise<RetrievalResult> {
    this.checkCancelled(input.signal);
    const eligible = this.port
      .getMarkdownFiles()
      .map((file) => ({ file, path: normalizeVaultPath(file.path) }))
      .filter(
        (item): item is { readonly file: RetrievalFile; readonly path: string } =>
          item.path !== null && isEligiblePath(item.path),
      )
      .sort((left, right) => left.path.localeCompare(right.path, "en"));
    const filesByPath = new Map(eligible.map((item) => [item.path, item.file]));
    const mentions = normalizeMentions(input.mentions);
    const issues: CoverageIssue[] = mentions
      .filter((path) => !filesByPath.has(path))
      .map((path) => ({ path, reason: "missing" }));
    const requestedPaths = this.requestedPaths(
      input,
      eligible.map((item) => item.path),
      mentions,
    );
    const documents: PreparedDocument[] = [];
    let filesRead = 0;

    for (const path of requestedPaths) {
      this.checkCancelled(input.signal);
      const file = filesByPath.get(path);
      if (file === undefined) continue;
      try {
        const cached = await this.contentFor(file, input.currentDocument, input.signal);
        this.checkCancelled(input.signal);
        documents.push(await this.prepare(file, cached, input.signal));
        filesRead += 1;
      } catch (error) {
        if (
          error instanceof RetrievalCancelledError ||
          error instanceof RetrievalChunkCancelledError
        ) {
          throw new RetrievalCancelledError();
        }
        if (!(error instanceof VaultFileReadError)) throw error;
        issues.push({ path, reason: "unreadable" });
      }
    }

    const currentPath =
      input.currentDocument === null ? null : normalizeVaultPath(input.currentDocument.path);
    const forcedPaths = new Set([
      ...mentions,
      ...(input.mode === "current_document" && currentPath !== null ? [currentPath] : []),
    ]);
    const candidates = this.candidates(documents, forcedPaths, input.question);
    const chunks = rankChunks(candidates, input.question).map((item) => item.chunk);
    const sources = currentSources(chunks);
    const coverage: Coverage =
      issues.length === 0
        ? { status: "complete", filesConsidered: requestedPaths.length, filesRead }
        : { status: "partial", filesConsidered: requestedPaths.length, filesRead, issues };
    return {
      question: input.question,
      mentions,
      chunks,
      sources,
      coverage,
      envelope: serializeEnvelope(chunks),
    };
  }

  private requestedPaths(
    input: RetrievalInput,
    eligiblePaths: readonly string[],
    mentions: readonly string[],
  ): readonly string[] {
    if (input.mode === "whole_vault") return eligiblePaths;
    const currentPath =
      input.currentDocument === null ? null : normalizeVaultPath(input.currentDocument.path);
    return [...new Set([...(currentPath === null ? [] : [currentPath]), ...mentions])].sort(
      (a, b) => a.localeCompare(b, "en"),
    );
  }

  private async contentFor(
    file: RetrievalFile,
    current: ActiveDocumentSnapshot | null,
    signal: AbortSignal,
  ): Promise<CachedContent> {
    const currentPath = current === null ? null : normalizeVaultPath(current.path);
    if (currentPath === normalizeVaultPath(file.path) && current !== null) {
      return {
        content: current.content,
        revision: await revisionFor(current.content, file.stat.mtime),
      };
    }
    const key = `${normalizeVaultPath(file.path)}\u0000${file.stat.mtime}\u0000${file.stat.size}`;
    const cached = this.#cache.get(file.path);
    if (cached?.key === key) return cached.value;
    this.checkCancelled(signal);
    let content: string;
    try {
      content = await this.port.cachedRead(file);
    } catch (error) {
      if (error instanceof Error) throw new VaultFileReadError(file.path, { cause: error });
      throw error;
    }
    this.checkCancelled(signal);
    const value = { content, revision: await revisionFor(content, Date.now()) };
    this.#cache.set(file.path, { key, value });
    return value;
  }

  private async prepare(
    file: RetrievalFile,
    cached: CachedContent,
    signal: AbortSignal,
  ): Promise<PreparedDocument> {
    const metadata = this.port.metadata(file);
    const headings = metadata?.headings ?? [];
    const path = normalizeVaultPath(file.path) ?? file.path;
    const chunks = (await chunkMarkdown(cached.content, headings, signal)).map((draft, index) => ({
      id: `${path}:${draft.startLine}:${index}:${cached.revision.hash.slice(0, 12)}`,
      sourceId: `${path}:${cached.revision.hash}`,
      path,
      ...(draft.heading === undefined ? {} : { heading: draft.heading }),
      startLine: draft.startLine,
      endLine: draft.endLine,
      text: draft.text,
      revision: cached.revision,
    }));
    return {
      file,
      metadata: {
        aliases: metadata?.aliases ?? [],
        tags: metadata?.tags ?? [],
        headings: headings.map((heading) => heading.heading),
      },
      chunks,
    };
  }

  private candidates(
    documents: readonly PreparedDocument[],
    forcedPaths: ReadonlySet<string>,
    question: string,
  ): readonly RankingCandidate[] {
    const base = documents.flatMap((document) =>
      document.chunks.map((chunk) => ({
        chunk,
        basename: document.file.basename,
        metadata: document.metadata,
        forced: forcedPaths.has(chunk.path),
        graphExpanded: false,
      })),
    );
    const tokens = tokenize(question);
    const seedPaths = new Set(
      base
        .filter((candidate) => scoreCandidate(candidate, tokens) > 0)
        .map((candidate) => candidate.chunk.path),
    );
    const expanded = oneHopPaths(seedPaths, this.port.resolvedLinks());
    return base.map((candidate) => ({
      ...candidate,
      graphExpanded: !seedPaths.has(candidate.chunk.path) && expanded.has(candidate.chunk.path),
    }));
  }

  private checkCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new RetrievalCancelledError();
  }
}

async function revisionFor(content: string, capturedAt: number): Promise<SourceRevision> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(content));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { algorithm: "sha256", hash, capturedAt };
}
