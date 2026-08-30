"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const tests = [
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_document_reducer.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_deterministic_page_planner.js",
  "SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_document_batch_integration.js",
];

let failed = false;
for (const relative of tests) {
  const result = spawnSync(process.execPath, [path.join(ROOT, relative)], { encoding: "utf8" });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log("LLMWiki minimal golden gate passed");
