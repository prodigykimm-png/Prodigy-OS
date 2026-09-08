import type { StructuredMention } from "../../src/contracts";
import type {
  RetrievalFile,
  RetrievalMetadata,
  RetrievalPort,
  VaultRetriever,
} from "../../src/vault-retriever";

export function file(path: string, size = 100, mtime = 1): RetrievalFile {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  return { path, basename: name.replace(/\.md$/u, ""), stat: { mtime, size } };
}

export class FakePort implements RetrievalPort {
  readonly reads: string[] = [];
  readonly readByteCounts: number[] = [];
  #files: readonly RetrievalFile[];
  readonly #contents: Readonly<Record<string, string>>;
  readonly #metadata: Readonly<Record<string, RetrievalMetadata>>;
  readonly #links: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly #failures: ReadonlySet<string>;
  readonly #afterRead: ((path: string) => void) | undefined;

  constructor(input: {
    readonly files: readonly RetrievalFile[];
    readonly contents: Readonly<Record<string, string>>;
    readonly metadata?: Readonly<Record<string, RetrievalMetadata>>;
    readonly links?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly failures?: ReadonlySet<string>;
    readonly afterRead?: (path: string) => void;
  }) {
    this.#files = input.files;
    this.#contents = input.contents;
    this.#metadata = input.metadata ?? {};
    this.#links = input.links ?? {};
    this.#failures = input.failures ?? new Set();
    this.#afterRead = input.afterRead;
  }

  replaceFiles(files: readonly RetrievalFile[]): void {
    this.#files = files;
  }

  getMarkdownFiles(): readonly RetrievalFile[] {
    return this.#files;
  }

  async cachedRead(target: RetrievalFile): Promise<string> {
    this.reads.push(target.path);
    this.#afterRead?.(target.path);
    if (this.#failures.has(target.path)) throw new FakeReadError(target.path);
    const content = this.#contents[target.path] ?? "";
    this.readByteCounts.push(new TextEncoder().encode(content).byteLength);
    return content;
  }

  metadata(target: RetrievalFile): RetrievalMetadata | null {
    return this.#metadata[target.path] ?? null;
  }

  resolvedLinks(): Readonly<Record<string, Readonly<Record<string, number>>>> {
    return this.#links;
  }
}

class FakeReadError extends Error {
  constructor(readonly path: string) {
    super(`Unreadable: ${path}`);
  }
}

export function mention(path: string): StructuredMention {
  return { kind: "vault_file", path, label: path };
}

export function paths(result: Awaited<ReturnType<VaultRetriever["retrieve"]>>): readonly string[] {
  return [...new Set(result.chunks.map((chunk) => chunk.path))];
}

export function machinePolicyFixture(): {
  readonly allowed: readonly string[];
  readonly files: readonly RetrievalFile[];
  readonly contents: Readonly<Record<string, string>>;
} {
  const allowed = ["People/A.md", "Journal/B.md", "SYSTEM/Other/C.md", "privacy.md"];
  const excluded = [
    ".trash/A.md",
    ".hidden/B.md",
    "artifacts/C.md",
    "SYSTEM/PRIVATE/D.md",
    "SYSTEM/CACHE/E.md",
    "SYSTEM/Views/F.md",
    "SYSTEM/SCRIPTS/G.md",
    "SYSTEM/AI/H.md",
    "SYSTEM/CI/I.md",
  ];
  const files = [...allowed, ...excluded].map((path) => file(path));
  return {
    allowed,
    files,
    contents: Object.fromEntries(files.map((target) => [target.path, "공통 검색어"])),
  };
}

export function largeRetrievalFixture(): {
  readonly files: readonly RetrievalFile[];
  readonly contents: Readonly<Record<string, string>>;
  readonly largePath: string;
  readonly query: string;
  readonly excludedSentinel: string;
} {
  const query = "초대형희귀검색";
  const excludedSentinel = "WHOLE_CORPUS_SENTINEL";
  const largePath = "A-large.md";
  const largeBody = `${excludedSentinel} ${"무관한 패딩 ".repeat(300_000)}\n\n${`${query} 근거 `.repeat(2_000)}`;
  const contents = {
    [largePath]: largeBody,
    "B.md": `${query} B1\n\n${query} B2`,
    "C.md": `${query} C1\n\n${query} C2`,
    "D.md": `${query} D1\n\n${query} D2`,
  };
  return {
    files: Object.entries(contents).map(([path, content]) =>
      file(path, new TextEncoder().encode(content).byteLength),
    ),
    contents,
    largePath,
    query,
    excludedSentinel,
  };
}

export function venueRetrievalFixture(): ConstructorParameters<typeof FakePort>[0] {
  return {
    files: [file("PARA/OO홀.md"), file("ZETA/촬영법.md"), file("HUB/무관.md")],
    contents: {
      "PARA/OO홀.md": "# OO홀\n무대가 어두우니 노출에 주의한다.",
      "ZETA/촬영법.md": "# 촬영법\n어두운 무대에서는 셔터 속도를 확보한다.",
      "HUB/무관.md": "# 장보기\n우유를 산다.",
    },
    links: { "PARA/OO홀.md": { "ZETA/촬영법.md": 1 } },
  };
}

export function peopleRetrievalFixture(): ConstructorParameters<typeof FakePort>[0] {
  return {
    files: [file("People/민수.md"), file("DAILY/2026-09-01.md")],
    contents: {
      "People/민수.md": "# 민수\n대학 친구이며 맥주를 좋아한다.",
      "DAILY/2026-09-01.md": "# 하루\n민수와 술을 마셨다.",
    },
    links: { "DAILY/2026-09-01.md": { "People/민수.md": 1 } },
  };
}

export function sourceBounds(
  result: Awaited<ReturnType<VaultRetriever["retrieve"]>>,
  path?: string,
): readonly string[] {
  return result.sources
    .filter((source) => path === undefined || source.path === path)
    .map((source) => `${source.status}:${source.path}:${source.startLine}-${source.endLine}`);
}
