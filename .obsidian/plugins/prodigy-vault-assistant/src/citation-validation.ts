import type { AnswerBlock, ResolvedCitation, SourceChunk, SourceRecord } from "./contracts";

export function answerSchema(citationIds: readonly string[]): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "text", "citationIds"],
          properties: {
            kind: { enum: ["paragraph", "list_item"] },
            text: { type: "string", minLength: 1 },
            citationIds: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              uniqueItems: true,
              items: { enum: citationIds },
            },
          },
        },
      },
    },
  });
}

export type CitationMap = readonly ResolvedCitation[];
export type CitationValidation =
  | {
      readonly ok: true;
      readonly blocks: readonly AnswerBlock[];
      readonly citations: readonly ResolvedCitation[];
    }
  | { readonly ok: false; readonly reason: "malformed" | "unknown" | "duplicate" };
type UnknownRecord = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}
function locator(path: string, heading?: string): string {
  const note = path.endsWith(".md") ? path.slice(0, -3) : path;
  return `[[${note}${heading ? `#${heading}` : ""}]]`;
}

export function freezeCitationMap(
  chunks: readonly (SourceChunk & { readonly status?: SourceRecord["status"] })[],
  opaqueIds: readonly string[],
): CitationMap {
  const citations: ResolvedCitation[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const id = opaqueIds[index];
    if (id === undefined) return Object.freeze([]);
    const common = {
      id,
      status: chunk.status ?? "current",
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      revision: Object.freeze({ ...chunk.revision }),
      locator: locator(chunk.path, chunk.heading),
    };
    citations.push(
      Object.freeze(chunk.heading === undefined ? common : { ...common, heading: chunk.heading }),
    );
  }
  return Object.freeze(citations);
}

export function validateCitations(value: unknown, map: CitationMap): CitationValidation {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, reason: "malformed" };
  const blocks: AnswerBlock[] = [];
  const usedIds: string[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["kind", "text", "citationIds"])) {
      return { ok: false, reason: "malformed" };
    }
    if (
      (candidate["kind"] !== "paragraph" && candidate["kind"] !== "list_item") ||
      typeof candidate["text"] !== "string" ||
      candidate["text"].trim().length === 0 ||
      !Array.isArray(candidate["citationIds"]) ||
      candidate["citationIds"].length < 1 ||
      candidate["citationIds"].length > 4 ||
      candidate["citationIds"].some((id) => typeof id !== "string" || id.length === 0)
    ) {
      return { ok: false, reason: "malformed" };
    }
    const citationIds = candidate["citationIds"].filter(
      (id): id is string => typeof id === "string",
    );
    if (new Set(citationIds).size !== citationIds.length) {
      return { ok: false, reason: "duplicate" };
    }
    if (citationIds.some((id) => map.filter((citation) => citation.id === id).length !== 1)) {
      return { ok: false, reason: "unknown" };
    }
    usedIds.push(...citationIds);
    blocks.push(
      Object.freeze({
        kind: candidate["kind"],
        text: candidate["text"],
        citationIds: Object.freeze(citationIds),
      }),
    );
  }
  const citations = [...new Set(usedIds)].flatMap((id) => {
    const match = map.find((citation) => citation.id === id);
    return match ? [match] : [];
  });
  return {
    ok: true,
    blocks: Object.freeze(blocks),
    citations: Object.freeze(citations),
  };
}
