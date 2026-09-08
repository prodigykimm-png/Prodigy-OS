import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { findVaultMutations } from "./vault-mutation-analysis.mjs";

const forbiddenModules = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "electron",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);
const forbiddenTechnology =
  /(?:^|[/@_-])(cli|acp|mcp|qmd|sqlite|better-sqlite3|indexeddb)(?:$|[/@_.-])/iu;
const providerControls =
  /^(?:choose|pick|select|set)(?:Provider|Model|Route)|^(?:provider|model|route)(?:Picker|Fallback)$|^fallbackProvider$/u;
const directNetwork = new Set(["fetch", "requestUrl"]);
const forbiddenGlobals = new Set(["process", "indexedDB"]);

function moduleViolation(path) {
  const bare = path.replace(/^node:/u, "").split("/")[0];
  if (path.startsWith("node:") || forbiddenModules.has(bare)) return `forbidden-import:${path}`;
  return forbiddenTechnology.test(path) ? `forbidden-technology-import:${path}` : null;
}

function location(sourceFile, node) {
  const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: point.line + 1, column: point.character + 1 };
}

function stringArgument(node) {
  const argument = node.arguments?.[0];
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

function scanSource(path, text) {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];
  const add = (node, rule) => violations.push({ input: path, rule, ...location(sourceFile, node) });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const rule =
          specifier.text === "<runtime>"
            ? "source-authored-runtime-import"
            : moduleViolation(specifier.text);
        if (rule !== null) add(specifier, rule);
      }
    }
    if (ts.isCallExpression(node)) {
      const imported =
        node.expression.kind === ts.SyntaxKind.ImportKeyword ? stringArgument(node) : null;
      const required =
        ts.isIdentifier(node.expression) && node.expression.text === "require"
          ? stringArgument(node)
          : null;
      const modulePath = imported ?? required;
      if (modulePath !== null) {
        const rule =
          modulePath === "<runtime>"
            ? "source-authored-runtime-import"
            : moduleViolation(modulePath);
        if (rule !== null) add(node, rule);
      }
      const access = ts.isPropertyAccessExpression(node.expression) ? node.expression : null;
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : (access?.name.text ?? null);
      if (name !== null && directNetwork.has(name)) add(node, `direct-network:${name}`);
      if (name !== null && providerControls.test(name)) add(node, `provider-control:${name}`);
    }
    if (
      ts.isIdentifier(node) &&
      forbiddenGlobals.has(node.text) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    )
      add(node, `forbidden-global:${node.text}`);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const mutation of findVaultMutations(sourceFile)) {
    add(mutation.node, `vault-mutation:${mutation.method}`);
  }
  for (const diagnostic of sourceFile.parseDiagnostics) {
    const point = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    violations.push({
      input: path,
      rule: "source-parse-error",
      line: point.line + 1,
      column: point.character + 1,
    });
  }
  return violations;
}

function scanMetafile(metafile) {
  const violations = [];
  for (const [input, details] of Object.entries(metafile.inputs ?? {})) {
    for (const entry of details.imports ?? []) {
      if (entry.path === "<runtime>" && entry.external === true && entry.original === undefined)
        continue;
      if (entry.path === "<runtime>") {
        violations.push({ input, rule: "source-authored-runtime-import", path: entry.path });
        continue;
      }
      const rule = moduleViolation(entry.path);
      if (rule !== null) violations.push({ input, rule, path: entry.path });
      if (entry.external === true && entry.path !== "obsidian") {
        violations.push({ input, rule: `unexpected-external:${entry.path}`, path: entry.path });
      }
    }
  }
  for (const [output, details] of Object.entries(metafile.outputs ?? {})) {
    for (const entry of details.imports ?? []) {
      const rule = moduleViolation(entry.path);
      if (rule !== null) violations.push({ input: output, rule, path: entry.path });
      if (entry.external === true && entry.path !== "obsidian") {
        violations.push({
          input: output,
          rule: `unexpected-external:${entry.path}`,
          path: entry.path,
        });
      }
    }
  }
  return violations;
}

async function main() {
  const metafilePath = resolve(process.argv[2] ?? "build-metafile.json");
  const root = dirname(metafilePath);
  const metafile = JSON.parse(await readFile(metafilePath, "utf8"));
  const sourceViolations = [];
  for (const input of Object.keys(metafile.inputs ?? {}).filter((path) => path.endsWith(".ts"))) {
    const sourcePath = resolve(root, input);
    if (existsSync(sourcePath)) {
      sourceViolations.push(...scanSource(input, await readFile(sourcePath, "utf8")));
    }
  }
  const bundlePath = resolve(root, "main.js");
  const bundleSha256 = existsSync(bundlePath)
    ? createHash("sha256")
        .update(await readFile(bundlePath))
        .digest("hex")
    : null;
  const metafileViolations = scanMetafile(metafile);
  const violations = [...metafileViolations, ...sourceViolations];
  const report = {
    ok: violations.length === 0,
    metafile: metafilePath,
    bundle: bundlePath,
    bundleSha256,
    scannedSources: Object.keys(metafile.inputs ?? {})
      .filter((path) => path.endsWith(".ts") && existsSync(resolve(root, path)))
      .sort(),
    offendingImports: metafileViolations.filter(({ path }) => path !== undefined),
    violations,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

await main();
