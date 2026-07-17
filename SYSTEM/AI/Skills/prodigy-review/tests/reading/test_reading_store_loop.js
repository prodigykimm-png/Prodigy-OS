"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/reading-core.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/reading-store.js"));

function createMockApp(files) {
  const map = new Map(Object.entries(files || {}));
  const folders = new Set();
  return {
    vault: {
      getAbstractFileByPath(target) {
        if (map.has(target)) {
          const content = map.get(target);
          const name = target.split("/").pop();
          return {
            path: target,
            name,
            basename: name.replace(/\.md$/, ""),
            extension: target.endsWith(".md") ? "md" : "",
            children: [...map.keys()]
              .filter((key) => key.startsWith(`${target}/`) && !key.slice(target.length + 1).includes("/"))
              .map((key) => {
                const childName = key.split("/").pop();
                return {
                  path: key,
                  name: childName,
                  basename: childName.replace(/\.md$/, ""),
                  extension: key.endsWith(".md") ? "md" : ""
                };
              })
          };
        }
        if (folders.has(target)) {
          return {
            path: target,
            children: [...map.keys()]
              .filter((key) => key.startsWith(`${target}/`) && !key.slice(target.length + 1).includes("/"))
              .map((key) => {
                const childName = key.split("/").pop();
                return {
                  path: key,
                  name: childName,
                  basename: childName.replace(/\.md$/, ""),
                  extension: key.endsWith(".md") ? "md" : ""
                };
              })
          };
        }
        return null;
      },
      async read(file) {
        return map.get(file.path);
      },
      async create(target, content) {
        if (map.has(target)) throw new Error("exists");
        map.set(target, content);
        return { path: target, basename: target.split("/").pop().replace(/\.md$/, "") };
      },
      async modify(file, content) {
        map.set(file.path, content);
      },
      async createFolder(target) {
        folders.add(target);
      }
    },
    fileManager: {
      async processFrontMatter(file, mutator) {
        const content = map.get(file.path);
        const data = core.parseSimpleFrontmatter(content);
        mutator(data);
        // keep body
        const end = content.indexOf("\n---", 3);
        const body = end === -1 ? "" : content.slice(end + 4);
        const lines = ["---"];
        Object.entries(data).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            lines.push(`${key}:`);
            value.forEach((item) => lines.push(`  - ${JSON.stringify(String(item))}`));
          } else {
            lines.push(`${key}: ${value == null ? "" : value}`);
          }
        });
        lines.push("---");
        map.set(file.path, `${lines.join("\n")}${body}`);
      }
    },
    _map: map,
    _folders: folders
  };
}

async function main() {
  const bookPath = "PARA/PROJECTS/Reading/Test Book.md";
  const app = createMockApp({
    [bookPath]: `---
type: reading
status: reading
title: Test Book
author: Author
---
# Test Book
`
  });
  app._folders.add("PARA/PROJECTS/Reading");

  const book = core.normalizeBook({
    title: "Test Book",
    path: bookPath,
    status: "reading"
  });

  const session = await store.saveSession(app, book, {
    date: "2026-07-17",
    reading_range: "Intro",
    duration: "25m",
    key_content: "Core idea",
    my_thought: "Useful",
    thinking_delta: "I changed my mind"
  });
  assert.ok(session.path.startsWith("PARA/RESOURCES/Reading/Sessions/"));
  assert.ok(app._map.has(session.path));
  assert.match(app._map.get(session.path), /duration: 25m/);

  const again = await store.saveSession(app, book, {
    date: "2026-07-17",
    reading_range: "Intro",
    key_content: "Core idea 2",
    my_thought: "Useful 2"
  });
  assert.notEqual(again.path, session.path);

  const candidate = await store.saveCandidate(app, session, {
    title: "Candidate Title",
    statement: "Knowledge statement",
    reason: "Because"
  });
  assert.ok(candidate.path.startsWith("PARA/RESOURCES/Reading/Candidates/"));
  assert.equal(candidate.status, "proposed");

  const kept = await store.saveCandidateAsKept(app, candidate.path);
  assert.equal(kept.status, "saved");
  assert.match(app._map.get(candidate.path), /status: saved/);

  const rejected = await store.rejectCandidate(app, candidate.path);
  assert.equal(rejected.status, "rejected");
  const text = app._map.get(candidate.path);
  assert.match(text, /status: rejected/);

  // legacy path remains readable without migration
  app._folders.add("PARA/PROJECTS/Reading/Sessions");
  app._map.set("PARA/PROJECTS/Reading/Sessions/legacy.md", `---
type: reading_session
session_id: legacy
date: 2026-07-10
book_title: Legacy Book
reading_range: ch1
key_content: old
---
`);
  const listed = await store.listSessions(app, 20);
  assert.ok(listed.some((item) => item.path.includes("legacy.md")));

  console.log("Reading store loop tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
