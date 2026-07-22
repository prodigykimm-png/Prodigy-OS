"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const core = require(path.join(ROOT, "SYSTEM/Views/reading-core.js"));
const store = require(path.join(ROOT, "SYSTEM/Views/reading-store.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/reading-view.js"));

function createMockApp(files) {
  const map = new Map(Object.entries(files || {}));
  const folders = new Set();
  const writes = [];
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
        writes.push({ kind: "create", path: target });
        return { path: target, basename: target.split("/").pop().replace(/\.md$/, "") };
      },
      async modify(file, content) {
        map.set(file.path, content);
        writes.push({ kind: "modify", path: file.path });
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
    _folders: folders,
    _writes: writes
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
  assert.ok(candidate.path.startsWith("PARA/RESOURCES/Knowledge/Candidates/"));
  assert.equal(candidate.status, "saved");
  assert.match(app._map.get(candidate.path), /source_objects:\n  - "\[\[PARA\/RESOURCES\/Reading\/Sessions\//);
  assert.match(app._map.get(session.path), /knowledge_candidate_ids:/);

  const canonicalBeforeDuplicate = app._map.get(candidate.path);
  const duplicate = await store.saveCandidate(app, session, {
    title: "Candidate Title",
    statement: "Knowledge statement",
    reason: "Because"
  });
  assert.notEqual(duplicate.path, candidate.path);
  assert.equal(duplicate.candidate_id, candidate.candidate_id);
  assert.equal(app._map.get(candidate.path), canonicalBeforeDuplicate);

  const rejected = await store.rejectCandidate(app, candidate.path);
  assert.equal(rejected.status, "rejected");
  const text = app._map.get(candidate.path);
  assert.match(text, /status: "rejected"/);

  const approved = await store.approveCandidate(app, duplicate.path, {
    title: "Approved Reading Knowledge",
    statement: "Knowledge statement",
    knowledge_domain: "coding",
    knowledge_topics: ["ai"],
    approval_note: "사람이 승인했습니다."
  });
  assert.equal(approved.candidate.status, "approved");
  assert.ok(app._map.has(approved.path));
  assert.match(app._map.get(approved.path), /^knowledge_domain: "coding"$/m);
  assert.match(app._map.get(approved.path), /^knowledge_topics:\n  - "ai"$/m);

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

  // Shared reader keeps all old Reading/ZETA statuses visible, read-only, and untouched.
  app._folders.add("PARA/RESOURCES/Reading/Candidates");
  app._folders.add("ZETA/FLEETING/Knowledge Candidates");
  app._map.set("PARA/RESOURCES/Reading/Candidates/proposed.md", `---
type: knowledge_candidate
candidate_id: legacy-proposed
status: proposed
title: Legacy proposed
statement: Old proposal
reason: Old reason
source_session: "[[${session.path.replace(/\.md$/, "")}]]"
created: 2026-07-10
updated: 2026-07-10
---
`);
  app._map.set("ZETA/FLEETING/Knowledge Candidates/saved.md", `---
type: knowledge_candidate
candidate_id: legacy-saved
status: saved
title: Legacy saved
statement: Old saved
reason: Old reason
source_session: "[[${session.path.replace(/\.md$/, "")}]]"
created: 2026-07-11
updated: 2026-07-11
---
`);
  app._map.set("ZETA/FLEETING/Knowledge Candidates/rejected.md", `---
type: knowledge_candidate
candidate_id: legacy-rejected
status: rejected
title: Legacy rejected
statement: Old rejected
reason: Old reason
source_session: "[[${session.path.replace(/\.md$/, "")}]]"
created: 2026-07-12
updated: 2026-07-12
---
`);
  const malformedPath = "PARA/RESOURCES/Knowledge/Candidates/malformed.md";
  const malformed = "---\ntype: knowledge_candidate\ntitle: Broken\n---\n";
  app._map.set(malformedPath, malformed);
  const writesBeforeRead = app._writes.slice();
  const allCandidates = await store.listCandidates(app, { status: "all" });
  const activeCandidates = await store.listCandidates(app, { status: "active" });
  assert.ok(allCandidates.some((entry) => entry.path.endsWith("proposed.md") && entry.status === "proposed"));
  assert.ok(allCandidates.some((entry) => entry.path.endsWith("saved.md") && entry.status === "saved"));
  assert.ok(allCandidates.some((entry) => entry.path.endsWith("rejected.md") && entry.status === "rejected"));
  assert.ok(activeCandidates.some((entry) => entry.path.endsWith("proposed.md")));
  assert.ok(activeCandidates.some((entry) => entry.path.endsWith("saved.md")));
  assert.equal(activeCandidates.some((entry) => entry.path.endsWith("rejected.md")), false);
  assert.equal(app._map.get(malformedPath), malformed);
  assert.deepEqual(app._writes, writesBeforeRead);

  // Cancelling the fallback Korean prompt path must leave both Candidate and session untouched.
  const previousWindow = global.window;
  const filesBeforeCancel = new Map(app._map);
  global.window = { prompt: () => null };
  try {
    assert.equal(await view.openCandidateModal(app, session), null);
  } finally {
    global.window = previousWindow;
  }
  assert.deepEqual([...app._map.entries()], [...filesBeforeCancel.entries()]);

  console.log("Reading store loop tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
