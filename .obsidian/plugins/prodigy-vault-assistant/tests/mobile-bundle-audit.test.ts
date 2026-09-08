import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const auditScript = resolve(import.meta.dir, "../scripts/mobile-bundle-audit.mjs");
const temporaryRoots: string[] = [];

async function fixture(
  source: string,
  imports: readonly {
    readonly path: string;
    readonly external?: boolean;
    readonly original?: string;
  }[],
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pva-mobile-audit-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/main.ts"), source);
  await writeFile(join(root, "main.js"), "module.exports = {};\n");
  await writeFile(
    join(root, "build-metafile.json"),
    JSON.stringify({
      inputs: { "src/main.ts": { bytes: source.length, imports, format: "esm" } },
      outputs: {
        "main.js": {
          imports: [{ path: "obsidian", kind: "require-call", external: true }],
          entryPoint: "src/main.ts",
          inputs: { "src/main.ts": { bytesInOutput: source.length } },
          bytes: 21,
        },
      },
    }),
  );
  return root;
}

async function audit(
  root: string,
): Promise<{ readonly exitCode: number; readonly report: string }> {
  const process = Bun.spawn(["node", auditScript, join(root, "build-metafile.json")], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, report] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  return { exitCode, report };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

const mutationBypasses = [
  {
    label: "optional direct Vault mutation",
    source: 'app.vault?.append?.(file, "changed");\n',
    rule: "vault-mutation:append",
  },
  {
    label: "local Vault alias mutation",
    source: 'const localVault = app.vault;\nlocalVault.create(file, "changed");\n',
    rule: "vault-mutation:create",
  },
  {
    label: "destructured Vault alias mutation",
    source: 'const { vault: localVault } = app;\nlocalVault.rename(file, "next.md");\n',
    rule: "vault-mutation:rename",
  },
  {
    label: "destructured mutation method alias",
    source: "const { createBinary: writeBinary } = app.vault;\nwriteBinary(file, bytes);\n",
    rule: "vault-mutation:createBinary",
  },
  {
    label: "quoted computed Vault mutation",
    source: 'app.vault["delete"](file);\n',
    rule: "vault-mutation:delete",
  },
  {
    label: "static template computed alias mutation",
    source: "const localVault = app.vault;\nlocalVault?.[`trash`]?.(file);\n",
    rule: "vault-mutation:trash",
  },
] as const;

describe("mobile bundle audit", () => {
  for (const bypass of mutationBypasses) {
    test(`rejects ${bypass.label}`, async () => {
      // Given: one isolated syntactic bypass with a distinct forbidden method.
      const root = await fixture(bypass.source, []);

      // When: the production AST audit runs through its CLI boundary.
      const result = await audit(root);

      // Then: the bypass is rejected and attributed to its static mutation method.
      expect(result.exitCode).toBe(1);
      expect(result.report).toContain(bypass.rule);
    });
  }

  test("allows read-only aliases, computed reads, strings, and comments", async () => {
    // Given: Vault aliases are used only through benign read APIs and inert text.
    const root = await fixture(
      'const localVault = app.vault;\nconst { vault: otherVault } = app;\nconst { read: localRead } = app.vault;\nlocalVault.read(file);\notherVault["cachedRead"](file);\nlocalRead(file);\nconst inert = "app.vault.delete(file)";\n// app.vault.modify(file, inert);\nvoid inert;\n',
      [],
    );

    // When: the production AST audit parses the source.
    const result = await audit(root);

    // Then: read-only syntax and non-code text remain allowed.
    expect(result.exitCode).toBe(0);
    expect(result.report).not.toContain("vault-mutation:");
  });

  test("rejects Node and Vault mutation fixtures", async () => {
    // Given: isolated source and metafile mutations representing both forbidden classes.
    const nodeRoot = await fixture('import { readFile } from "node:fs";\nvoid readFile;\n', [
      { path: "node:fs", external: true, original: "node:fs" },
    ]);
    const mutationRoot = await fixture('app.vault.modify(file, "changed");\n', []);

    // When: the production audit runs through its CLI surface.
    const [nodeResult, mutationResult] = await Promise.all([audit(nodeRoot), audit(mutationRoot)]);

    // Then: each mutation is rejected and attributed to its real source rather than <runtime>.
    expect(nodeResult.exitCode).toBe(1);
    expect(nodeResult.report).toContain("node:fs");
    expect(mutationResult.exitCode).toBe(1);
    expect(mutationResult.report).toContain("vault-mutation:modify");
  });

  test("allows only generated esbuild runtime metadata and the Obsidian external", async () => {
    // Given: benign source with esbuild's metadata-only <runtime> helper attribution.
    const root = await fixture('import { Plugin } from "obsidian";\nvoid Plugin;\n', [
      { path: "obsidian", external: true, original: "obsidian" },
      { path: "<runtime>", external: true },
    ]);

    // When: the production audit evaluates source, metafile, and bundle.
    const result = await audit(root);

    // Then: generated metadata is allowed without weakening source/import checks.
    expect(result.exitCode).toBe(0);
    expect(result.report).toContain('"ok": true');
    expect(result.report).toContain('"bundleSha256"');
  });

  test("rejects source-authored runtime imports and direct network/provider APIs", async () => {
    // Given: source code attempts to disguise an import as runtime metadata and select a provider.
    const root = await fixture(
      'import "<runtime>";\nfetch("https://example.invalid");\nruntime.setProvider("remote");\n',
      [{ path: "<runtime>", external: true, original: "<runtime>" }],
    );

    // When: the production audit runs.
    const result = await audit(root);

    // Then: source authorship and both forbidden API calls remain visible.
    expect(result.exitCode).toBe(1);
    expect(result.report).toContain("source-authored-runtime-import");
    expect(result.report).toContain("direct-network:fetch");
    expect(result.report).toContain("provider-control:setProvider");
  });
});
