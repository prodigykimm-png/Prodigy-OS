"use strict";

const path = require("node:path");

const registry = require("./knowledge-explorer-audit-registry.js");
const scanner = require("./knowledge-explorer-audit-scanner.js");
const formatter = require("./knowledge-explorer-audit-format.js");

const ROOT = path.resolve(__dirname, "../..");

function resolveVaultPath(target, vaultRoot) {
  return path.isAbsolute(target) ? target : path.join(vaultRoot, target);
}

function parseArgs(argv) {
  const options = { paths: [], includeDaily: false, includePre: false, format: "text", vaultRoot: ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--format" && argv[i + 1]) options.format = argv[++i];
    else if (arg === "--include-daily") options.includeDaily = true;
    else if (arg === "--include-pre") options.includePre = true;
    else if (arg === "--path" && argv[i + 1]) options.paths.push(argv[++i]);
    else if (arg === "--vault" && argv[i + 1]) options.vaultRoot = path.resolve(argv[++i]);
    else options.paths.push(arg);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const targets = args.paths.length
    ? args.paths.map((item) => resolveVaultPath(item, args.vaultRoot))
    : [
        path.join(args.vaultRoot, "SYSTEM/TEMPLATE/FORMAT/template_knowledge.md"),
        path.join(args.vaultRoot, "SYSTEM/TEMPLATE/FORMAT/template_permanent_note.md"),
      ];
  const report = scanner.auditPaths(targets, args);
  const output = args.format === "json" ? formatter.renderJson(report) : formatter.renderText(report);
  process.stdout.write(`${output}\n`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = Object.freeze({
  ...registry,
  ...scanner,
  ...formatter,
  parseArgs,
  main,
});
