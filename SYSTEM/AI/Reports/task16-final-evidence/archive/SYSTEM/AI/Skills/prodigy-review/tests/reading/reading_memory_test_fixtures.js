"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/reading-memory-core.js"));
const retrieval = require(path.join(ROOT, "SYSTEM/Views/reading-memory-retrieval.js"));
const storeApi = require(path.join(ROOT, "SYSTEM/Views/reading-memory-store.js"));

function source(sourcePath, content, mtime = 1) {
  return { source_path: sourcePath, content, source_mtime: mtime };
}

function reading(frontmatter, body, sourcePath = "PARA/PROJECTS/Reading/book.md") {
  const yaml = Object.entries({ type: "reading", status: "reading", ...frontmatter })
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return source(sourcePath, `---\n${yaml}\n---\n${body}\n`);
}

module.exports = { ROOT, core, fs, path, reading, retrieval, source, storeApi };
