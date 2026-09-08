import type { SourceChunk, SourceRecord, StructuredMention } from "./contracts";

declare namespace Intl {
  class Segmenter {
    constructor(locale: string, options: { readonly granularity: "word" });
    segment(value: string): Iterable<{ readonly isWordLike?: boolean; readonly segment: string }>;
  }
}

const MAX_CHUNK_BYTES = 2048;
const EXCLUDED_SYSTEM_ROOTS = new Set(["PRIVATE", "CACHE", "Views", "SCRIPTS", "AI", "CI"]);
const MAX_BODY_MATCHES = 8;
const encoder = new TextEncoder();
const segmenter = new Intl.Segmenter("ko", { granularity: "word" });
const KOREAN_PARTICLE_PATTERN = /^([가-힣]{2,})(?:의|은|는|을|를)$/u;

export interface RankingMetadata {
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly headings: readonly string[];
}

export interface ChunkDraft {
  readonly heading?: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}

export interface RankingCandidate {
  readonly chunk: SourceChunk;
  readonly basename: string;
  readonly metadata: RankingMetadata;
  readonly forced: boolean;
  readonly graphExpanded: boolean;
}

export interface RankedChunk {
  readonly chunk: SourceChunk;
  readonly score: number;
}

export function tokenize(value: string): readonly string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const tokens = new Set<string>();
  for (const part of segmenter.segment(normalized)) {
    if (!part.isWordLike) continue;
    tokens.add(part.segment);
    const base = part.segment.match(KOREAN_PARTICLE_PATTERN)?.[1];
    if (base !== undefined) tokens.add(base);
  }
  return [...tokens];
}

function occurrences(text: string, token: string): number {
  let count = 0;
  let offset = 0;
  while (count < MAX_BODY_MATCHES) {
    const found = text.indexOf(token, offset);
    if (found < 0) return count;
    count += 1;
    offset = found + token.length;
  }
  return count;
}

function fieldMatches(value: string, tokens: readonly string[]): number {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("ko-KR");
  return tokens.reduce((total, token) => total + (normalized.includes(token) ? 1 : 0), 0);
}

export function scoreCandidate(
  candidate: RankingCandidate,
  queryTokens: readonly string[],
): number {
  if (queryTokens.length === 0) return candidate.forced ? 10_000 : 0;
  const title = fieldMatches(candidate.basename, queryTokens) * 20;
  const path = fieldMatches(candidate.chunk.path, queryTokens) * 12;
  const aliases = candidate.metadata.aliases.reduce(
    (total, alias) => total + fieldMatches(alias, queryTokens) * 16,
    0,
  );
  const tags = candidate.metadata.tags.reduce(
    (total, tag) => total + fieldMatches(tag, queryTokens) * 10,
    0,
  );
  const headings = candidate.metadata.headings.reduce(
    (total, heading) => total + fieldMatches(heading, queryTokens) * 8,
    0,
  );
  const normalizedBody = candidate.chunk.text.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const body = queryTokens.reduce((total, token) => total + occurrences(normalizedBody, token), 0);
  return (
    title +
    path +
    aliases +
    tags +
    headings +
    body +
    (candidate.forced ? 10_000 : 0) +
    (candidate.graphExpanded ? 1 : 0)
  );
}

export function rankChunks(
  candidates: readonly RankingCandidate[],
  question: string,
): readonly RankedChunk[] {
  const queryTokens = tokenize(question);
  const ranked = candidates
    .map((candidate) => ({ chunk: candidate.chunk, score: scoreCandidate(candidate, queryTokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.chunk.path.localeCompare(right.chunk.path, "en") ||
        left.chunk.startLine - right.chunk.startLine,
    );
  const perFile = new Map<string, number>();
  const selected = new Set<RankedChunk>();
  for (const item of ranked) {
    if (perFile.has(item.chunk.path)) continue;
    selected.add(item);
    perFile.set(item.chunk.path, 1);
    if (selected.size === 6) break;
  }
  for (const item of ranked) {
    if (selected.size === 6) break;
    const count = perFile.get(item.chunk.path) ?? 0;
    if (selected.has(item) || count >= 2) continue;
    selected.add(item);
    perFile.set(item.chunk.path, count + 1);
  }
  return ranked.filter((item) => selected.has(item));
}

async function byteChunks(value: string, signal: AbortSignal): Promise<readonly string[]> {
  if (encoder.encode(value).byteLength <= MAX_CHUNK_BYTES) return [value];
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > MAX_CHUNK_BYTES && current.length > 0) {
      chunks.push(current);
      await Promise.resolve();
      if (signal.aborted) throw new RetrievalChunkCancelledError();
      current = character;
      bytes = size;
    } else {
      current += character;
      bytes += size;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function chunkMarkdown(
  content: string,
  headings: readonly { readonly heading: string; readonly line: number }[],
  signal: AbortSignal,
): Promise<readonly ChunkDraft[]> {
  const lines = content.split("\n");
  const result: ChunkDraft[] = [];
  let paragraphStart = 1;
  let paragraph: string[] = [];
  const flush = async (endLine: number): Promise<void> => {
    const text = paragraph.join("\n").trim();
    if (text.length === 0) return;
    const heading = [...headings].reverse().find((item) => item.line <= paragraphStart)?.heading;
    for (const part of await byteChunks(text, signal)) {
      if (signal.aborted) throw new RetrievalChunkCancelledError();
      result.push({
        ...(heading === undefined ? {} : { heading }),
        startLine: paragraphStart,
        endLine,
        text: part,
      });
    }
  };
  for (const [index, line] of lines.entries()) {
    if (signal.aborted) throw new RetrievalChunkCancelledError();
    if (line.trim().length === 0) {
      await flush(index);
      paragraph = [];
      paragraphStart = index + 2;
    } else {
      paragraph.push(line);
    }
  }
  await flush(lines.length);
  return result;
}

export class RetrievalChunkCancelledError extends Error {
  constructor() {
    super("Retrieval cancelled while chunking");
  }
}

export function normalizeVaultPath(value: string): string | null {
  const path = value
    .normalize("NFKC")
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/gu, "");
  if (
    path.length === 0 ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return null;
  }
  return path;
}

export function isEligiblePath(path: string): boolean {
  const [root, second] = path.split("/");
  if (root === undefined || root.startsWith(".") || root === "artifacts") return false;
  return !(root === "SYSTEM" && second !== undefined && EXCLUDED_SYSTEM_ROOTS.has(second));
}

export function normalizeMentions(mentions: readonly StructuredMention[]): readonly string[] {
  const paths = mentions.flatMap((mention) => {
    const path = normalizeVaultPath(mention.path);
    return path === null || !isEligiblePath(path) ? [] : [path];
  });
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right, "en"));
}

export function oneHopPaths(
  seeds: ReadonlySet<string>,
  links: Readonly<Record<string, Readonly<Record<string, number>>>>,
): ReadonlySet<string> {
  const result = new Set(seeds);
  for (const [rawSource, destinations] of Object.entries(links)) {
    const source = normalizeVaultPath(rawSource);
    if (source === null) continue;
    for (const rawTarget of Object.keys(destinations)) {
      const target = normalizeVaultPath(rawTarget);
      if (target === null) continue;
      if (seeds.has(source)) result.add(target);
      if (seeds.has(target)) result.add(source);
    }
  }
  return result;
}

export function serializeEnvelope(chunks: readonly SourceChunk[]): string {
  const included: SourceChunk[] = [];
  for (const chunk of chunks) {
    const candidate = JSON.stringify({ chunks: [...included, chunk] });
    if (encoder.encode(candidate).byteLength > 8192) break;
    included.push(chunk);
  }
  return JSON.stringify({ chunks: included });
}

export function currentSources(chunks: readonly SourceChunk[]): readonly SourceRecord[] {
  return chunks.map((chunk) => ({
    status: "current",
    id: chunk.id,
    path: chunk.path,
    ...(chunk.heading === undefined ? {} : { heading: chunk.heading }),
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    revision: chunk.revision,
  }));
}
