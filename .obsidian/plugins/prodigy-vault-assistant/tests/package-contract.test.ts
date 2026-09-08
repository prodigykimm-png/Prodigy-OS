import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantResult, assertNever, type Coverage } from "../src/contracts";

const root = join(import.meta.dir, "..");

type JsonRecord = {
  readonly [key: string]: unknown;
};

class InvalidContractFixtureError extends Error {
  override readonly name = "InvalidContractFixtureError";

  constructor(
    readonly file: string,
    readonly reason: string,
  ) {
    super(`${file}: ${reason}`);
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, file: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new InvalidContractFixtureError(file, "expected a JSON object");
  }
  return value;
}

function requireArray(value: unknown, file: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new InvalidContractFixtureError(file, "expected a JSON array");
  }
  return value;
}

function readJsonRecord(relativePath: string): JsonRecord {
  const source = readFileSync(join(root, relativePath), "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidContractFixtureError(relativePath, "invalid JSON");
    }
    throw error;
  }
  return requireRecord(value, relativePath);
}

const completeCoverage = {
  status: "complete",
  filesConsidered: 1,
  filesRead: 1,
} as const satisfies Coverage;
const partialCoverage = {
  status: "partial",
  filesConsidered: 2,
  filesRead: 1,
  issues: [{ path: "offloaded.md", reason: "unreadable" }],
} as const satisfies Coverage;
const receipt = {
  providerLabel: "Configured provider",
  modelLabel: "Actual model",
  routeClass: "local",
} as const;
const resultFixtures = [
  { state: "idle" },
  { state: "retrieving", operationId: "operation" },
  { state: "answering", operationId: "operation", coverage: completeCoverage },
  {
    state: "answered",
    operationId: "operation",
    blocks: [],
    sources: [],
    coverage: completeCoverage,
    receipt,
  },
  { state: "no_evidence", operationId: "operation", coverage: completeCoverage },
  {
    state: "partial",
    operationId: "operation",
    blocks: [{ kind: "paragraph", text: "Grounded answer", citationIds: ["source-1"] }],
    sources: [
      {
        status: "current",
        id: "source-1",
        path: "note.md",
        startLine: 1,
        endLine: 2,
        revision: { algorithm: "sha256", hash: "revision", capturedAt: 1 },
      },
    ],
    coverage: partialCoverage,
    receipt,
  },
  { state: "error", operationId: "operation", code: "read_error", message: "unreadable" },
  { state: "cancelled", operationId: "operation" },
] as const satisfies readonly AssistantResult[];

function describeResult(result: AssistantResult): string {
  switch (result.state) {
    case "idle":
      return "idle";
    case "retrieving":
      return `retrieving:${result.operationId}`;
    case "answering":
      return `answering:${result.coverage.status}`;
    case "answered":
      return `answered:${result.blocks.length}:${result.sources.length}:${result.receipt.modelLabel}`;
    case "no_evidence":
      return `no_evidence:${result.coverage.status}`;
    case "partial":
      return `partial:${result.blocks.length}:${result.sources.length}:${result.coverage.issues.length}:${result.receipt.modelLabel}`;
    case "error":
      return `error:${result.code}`;
    case "cancelled":
      return `cancelled:${result.operationId}`;
    default:
      return assertNever(result);
  }
}

describe("plugin package contract", () => {
  test("publishes versioned mobile-compatible manifest metadata", () => {
    const manifest = readJsonRecord("manifest.json");
    const versions = readJsonRecord("versions.json");

    expect(manifest["id"]).toBe("prodigy-vault-assistant");
    expect(manifest["version"]).toBe("0.2.0");
    expect(manifest["minAppVersion"]).toBe("1.13.0");
    expect(manifest["isDesktopOnly"]).toBe(false);
    expect(versions["0.2.0"]).toBe("1.13.0");
    expect(existsSync(join(root, "styles.css"))).toBe(true);
  });

  test("uses Bun gates without runtime package dependencies", () => {
    const packageJson = readJsonRecord("package.json");
    const scripts = requireRecord(packageJson["scripts"], "package.json scripts");

    expect(scripts).toEqual({
      typecheck: "tsc --noEmit",
      lint: "biome check .",
      test: "bun test",
      build: "node esbuild.config.mjs production",
      "audit:mobile": "node scripts/mobile-bundle-audit.mjs build-metafile.json",
    });
    expect(packageJson["dependencies"]).toBeUndefined();
    expect(existsSync(join(root, "bun.lock"))).toBe(true);
  });

  test("enforces the strict compiler and linter contract", () => {
    const tsconfig = readJsonRecord("tsconfig.json");
    const compilerOptions = requireRecord(
      tsconfig["compilerOptions"],
      "tsconfig.json compilerOptions",
    );
    const biome = readJsonRecord("biome.json");
    const linter = requireRecord(biome["linter"], "biome.json linter");
    const rules = requireRecord(linter["rules"], "biome.json rules");
    const suspicious = requireRecord(rules["suspicious"], "biome.json suspicious rules");
    const style = requireRecord(rules["style"], "biome.json style rules");

    for (const flag of [
      "strict",
      "noImplicitReturns",
      "noFallthroughCasesInSwitch",
      "noUncheckedIndexedAccess",
      "exactOptionalPropertyTypes",
      "verbatimModuleSyntax",
      "noPropertyAccessFromIndexSignature",
      "noUnusedLocals",
      "noUnusedParameters",
    ]) {
      expect(compilerOptions[flag]).toBe(true);
    }
    expect(suspicious["noExplicitAny"]).toBe("error");
    expect(style["noNonNullAssertion"]).toBe("error");
    expect(style["useImportType"]).toBe("error");
    expect(style["noParameterAssign"]).toBe("error");
    expect(style["noDefaultExport"]).toBe("error");
  });

  test("builds the entrypoint as a CommonJS bundle with only Obsidian external", () => {
    const build = Bun.spawnSync({
      cmd: ["node", "esbuild.config.mjs", "production"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(build.exitCode).toBe(0);

    const metafile = readJsonRecord("build-metafile.json");
    const outputs = requireRecord(metafile["outputs"], "build-metafile.json outputs");
    const output = requireRecord(outputs["main.js"], "main.js output");
    const imports = requireArray(output["imports"], "main.js imports");
    const externalImport = requireRecord(imports[0], "main.js import 0");
    const bundle = readFileSync(join(root, "main.js"), "utf8");

    expect(output["entryPoint"]).toBe("src/main.ts");
    expect(imports).toHaveLength(1);
    expect(externalImport["path"]).toBe("obsidian");
    expect(externalImport["external"]).toBe(true);
    expect(bundle).toContain("module.exports=");
    expect(bundle).toContain('require("obsidian")');
    const surfaceRegistrations = bundle.match(/\.(registerView|addRibbonIcon|addCommand)\(/gu);
    expect(surfaceRegistrations).toEqual([".registerView(", ".addRibbonIcon(", ".addCommand("]);
    expect(existsSync(join(root, "data.json"))).toBe(false);
  });

  test("handles every required result-state variant exhaustively", () => {
    expect(resultFixtures.map(describeResult)).toEqual([
      "idle",
      "retrieving:operation",
      "answering:complete",
      "answered:0:0:Actual model",
      "no_evidence:complete",
      "partial:1:1:1:Actual model",
      "error:read_error",
      "cancelled:operation",
    ]);
  });

  test("rejects a Node builtin recorded in an isolated metafile", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "pva-mobile-audit-"));
    const fixture = join(fixtureDirectory, "metafile.json");
    writeFileSync(
      fixture,
      JSON.stringify({
        inputs: {
          "fixture.ts": {
            imports: [
              {
                path: "node:fs",
                kind: "import-statement",
                external: true,
              },
            ],
          },
        },
        outputs: {},
      }),
    );

    try {
      const audit = Bun.spawnSync({
        cmd: ["node", "scripts/mobile-bundle-audit.mjs", fixture],
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const report = requireRecord(JSON.parse(audit.stdout.toString()), "mobile audit output");
      const offendingImports = requireArray(
        report["offendingImports"],
        "mobile audit offendingImports",
      );
      const offendingImport = requireRecord(offendingImports[0], "mobile audit offending import 0");

      expect(audit.exitCode).toBe(1);
      expect(report["ok"]).toBe(false);
      expect(offendingImport["path"]).toBe("node:fs");
    } finally {
      rmSync(fixtureDirectory, { recursive: true });
    }
  });
});
