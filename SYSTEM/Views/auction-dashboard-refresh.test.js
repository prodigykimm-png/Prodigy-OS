"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const refresh = require("./auction-dashboard-refresh.js");

const calls = [];
const file = { path: "PARA/PROJECTS/Auction/case.md" };
let indexedStatus = "watching";
const app = {
  vault: {
    getAbstractFileByPath(candidate) {
      return candidate === file.path ? file : null;
    }
  },
  plugins: {
    plugins: {
      dataview: {
        api: {
          index: {
            async reload(target) {
              assert.strictEqual(target, file);
              calls.push("reload");
              indexedStatus = "bidding";
            },
            touch() {
              calls.push("touch");
            }
          }
        }
      }
    }
  }
};

(async () => {
  assert.equal(await refresh.refresh(app, file), true);
  assert.deepEqual(calls, ["reload"], "reload already publishes one Dataview revision");

  calls.length = 0;
  assert.equal(await refresh.refresh(app, file.path), true);
  assert.deepEqual(calls, ["reload"]);

  calls.length = 0;
  assert.equal(await refresh.refresh(app), true);
  assert.deepEqual(calls, ["touch"], "touch remains the fallback when no file is supplied");
  assert.equal(await refresh.refresh({}), false);

  const card = fs.readFileSync(path.join(__dirname, "auction-card.js"), "utf8");
  const mutation = fs.readFileSync(path.join(__dirname, "auction-card-mutation.js"), "utf8");
  const sectionEffects = card.match(/effect:\s*"sections"/g) || [];
  assert.equal(sectionEffects.length, 3, "every status transition must request one section refresh effect");
  assert.ok(
    mutation.indexOf("await opts.app.fileManager.processFrontMatter") < mutation.indexOf("await opts.refresh(file)"),
    "the coordinator must finish persistence before refreshing status sections",
  );
  console.log("auction dashboard refresh tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
