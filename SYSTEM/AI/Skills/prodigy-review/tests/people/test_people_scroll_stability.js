"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Given fresh Dataview data, When Personal refreshes, Then PeopleView updates rows in place instead of forcing the hub to rebuild the DOM", () => {
  const view = source("SYSTEM/Views/people-view.js");

  assert.match(
    view,
    /setData/,
    "PeopleView must expose a data update entry point so a refresh does not require a fresh renderPeopleWorkspace call",
  );
  assert.doesNotMatch(
    view,
    /const rawPeople = opts\.rawPeople \|\| null;/,
    "rawPeople captured as const can never reflect a Dataview refresh",
  );
});

test("Given a scrolled Personal workspace, When new data arrives, Then the hub restores the scroll offset of the real scroll owner", () => {
  const hub = source("HUB/60 Personal.md");

  assert.match(hub, /scrollTop/, "the hub must read and restore the scroll offset across a repaint");
  assert.match(
    hub,
    /setData/,
    "the hub must feed new data through the in-place update path rather than rebuilding the workspace",
  );
});

test("Given Dataview refreshes views after an index revision, When Personal collects a snapshot, Then it must not touch the index and schedule itself again", () => {
  const hub = source("HUB/60 Personal.md");

  assert.doesNotMatch(
    hub,
    /(?:api\?\.)?index\?\.touch|index\.touch/,
    "Personal must be a read-only Dataview consumer; touching the index creates a 2.5-second refresh feedback loop",
  );
});
