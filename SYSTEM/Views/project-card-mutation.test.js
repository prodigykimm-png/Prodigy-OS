"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const mutation = require("./project-card-mutation.js");

test("Given a Project status change, When it commits, Then persistence precedes refresh and saved state survives one redraw", async () => {
  const calls = [];
  const file = { path: "PARA/PROJECTS/example.md" };
  const frontmatter = { status: "planning" };
  const project = { ...frontmatter, file };
  const coordinator = mutation.create({
    app: {
      vault: { getAbstractFileByPath: () => file },
      fileManager: {
        async processFrontMatter(_file, update) {
          calls.push("persist");
          update(frontmatter);
        },
      },
    },
    project,
    today: () => "2026-09-04",
    refresh: async () => calls.push("refresh"),
  });

  await coordinator.commit({ status: "doing" });

  assert.deepEqual(calls, ["persist", "refresh"]);
  assert.deepEqual(frontmatter, { status: "doing", updated: "2026-09-04" });
  assert.equal(project.status, "doing");
  assert.equal(mutation.consumeState(file.path).state, "saved");
  assert.equal(
    mutation.getState(file.path).state,
    "saved",
    "repeat Dataview renders must not erase the saved status",
  );
});

test("Given a failed Project write, When it commits, Then Project data stays unchanged and error state remains visible", async () => {
  const file = { path: "PARA/PROJECTS/failing.md" };
  const project = { status: "planning", file };
  const coordinator = mutation.create({
    app: {
      vault: { getAbstractFileByPath: () => file },
      fileManager: {
        async processFrontMatter() { throw new Error("write failed"); },
      },
    },
    project,
  });

  await assert.rejects(coordinator.commit({ status: "doing" }), /write failed/);

  assert.equal(project.status, "planning");
  assert.equal(mutation.getState(file.path).state, "error");
});
