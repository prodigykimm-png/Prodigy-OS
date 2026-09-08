import type { StructuredMention } from "./contracts";
import { isEligiblePath, normalizeVaultPath } from "./retrieval-ranking";

function labelFor(path: string): string {
  const parts = path.split("/");
  return (parts[parts.length - 1] ?? path).replace(/\.md$/iu, "");
}

function normalizedFiles(paths: readonly string[]): readonly string[] {
  return paths
    .flatMap((value) => {
      const path = normalizeVaultPath(value);
      return path !== null &&
        isEligiblePath(path) &&
        path.toLocaleLowerCase("en-US").endsWith(".md")
        ? [path]
        : [];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

export class MentionSelection {
  readonly #paths = new Set<string>();
  constructor(private readonly listMarkdownPaths: () => readonly string[]) {}
  add(value: string): void {
    const [path] = normalizedFiles([value]);
    if (path !== undefined) this.#paths.add(path);
  }
  remove(value: string): void {
    const path = normalizeVaultPath(value);
    if (path !== null) this.#paths.delete(path);
  }
  selected(): readonly StructuredMention[] {
    const existing = new Set(normalizedFiles(this.listMarkdownPaths()));
    return [...this.#paths]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((path) => ({
        kind: "vault_file",
        path,
        label: `${existing.has(path) ? "" : "삭제됨: "}${labelFor(path)}`,
      }));
  }

  suggestions(query: string): readonly StructuredMention[] {
    const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase("ko-KR");
    return normalizedFiles(this.listMarkdownPaths())
      .filter((path) => !this.#paths.has(path))
      .filter((path) => path.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(normalizedQuery))
      .map((path) => ({ kind: "vault_file", path, label: labelFor(path) }));
  }
}
