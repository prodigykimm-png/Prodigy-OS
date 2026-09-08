import { expect, test } from "bun:test";
import { assertNever, type SourceRecord } from "../src/contracts";

const revision = { algorithm: "sha256", hash: "captured-revision", capturedAt: 1 } as const;
const sources = [
  {
    status: "current",
    id: "current-source",
    path: "People/current.md",
    heading: "Current",
    startLine: 3,
    endLine: 5,
    revision,
  },
  {
    status: "stale",
    id: "stale-source",
    path: "People/stale.md",
    startLine: 8,
    endLine: 13,
    revision,
  },
  {
    status: "missing",
    id: "missing-source",
    path: "People/missing.md",
    startLine: 21,
    endLine: 34,
    revision,
  },
] as const satisfies readonly SourceRecord[];

function describeSource(source: SourceRecord): string {
  const range = `${source.startLine}-${source.endLine}`;
  switch (source.status) {
    case "current":
      return `current:${source.path}#${source.heading}:${range}:${source.revision.hash}`;
    case "stale":
      return `stale:${source.path}:${range}:${source.revision.hash}`;
    case "missing":
      return `missing:${source.path}:${range}:${source.revision.hash}`;
    default:
      return assertNever(source);
  }
}

test("represents every answer-source status with an exact captured line range", () => {
  expect(sources.map(describeSource)).toEqual([
    "current:People/current.md#Current:3-5:captured-revision",
    "stale:People/stale.md:8-13:captured-revision",
    "missing:People/missing.md:21-34:captured-revision",
  ]);
});
