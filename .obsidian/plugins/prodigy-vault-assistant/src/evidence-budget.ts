import type { SourceChunk } from "./contracts";

export const MAX_EVIDENCE_BYTES = 8192;
const encoder = new TextEncoder();
const sizes = new WeakMap<SourceChunk, number>();

// Runtime citations are "cite-" plus sixteen hexadecimal characters. Their value
// changes per request, but their JSON byte length does not.
export function wireEvidenceBytes(chunks: readonly SourceChunk[]): number {
  let bytes = 2;
  for (const chunk of chunks) {
    let size = sizes.get(chunk);
    if (size === undefined) {
      size = encoder.encode(
        JSON.stringify({ id: "cite-0000000000000000", text: chunk.text }),
      ).byteLength;
      sizes.set(chunk, size);
    }
    bytes += size;
  }
  return bytes + Math.max(0, chunks.length - 1);
}
