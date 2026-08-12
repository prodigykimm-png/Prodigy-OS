"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const paths = ["HUB/40 Project.md", "SYSTEM/Views/project-card.js", "SYSTEM/Views/project-wizard.js"];
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

function validateProjectPresentation(sources) {
  const joined = Object.values(sources).join("\n");
  assert.doesNotMatch(joined, /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i, "Project owns no local palette literal");
  for (const declaration of joined.matchAll(/(?:box|text)-shadow\s*:\s*([^;}]+)/gi)) {
    assert.match(declaration[1].trim(), /^none(?:\s*!important)?$/i, "Project chrome owns only explicit native-shadow resets");
  }
  assert.doesNotMatch(joined, /(?:linear|radial|conic)-gradient\s*\(/i, "Project owns no decorative gradient");
  assert.doesNotMatch(joined, /font-size\s*:\s*[0-9.]/, "Project type must use shared type roles");
  assert.doesNotMatch(joined, /border-radius\s*:\s*[0-9.]/, "Project radii must use shared radius roles");
  assert.doesNotMatch(joined, /@media\s*\([^)]*(?:width)\s*:\s*\d+px/i, "Project owns no private numeric breakpoint");
  assert.doesNotMatch(joined, /--project-(?:touch-target|action-bar-height)/, "Project owns no private control system");
  assert.doesNotMatch(joined, /\.on(?:mouse|pointer)(?:down|up|leave)\s*=/, "Project controls must execute from one click event");
  assert.doesNotMatch(joined, /transform\s*:\s*translateY/, "Project must use shared scale(.95) activation");

  assert.match(joined, /var\(--ke-color-interactive/);
  assert.match(joined, /var\(--ke-color-surface/);
  assert.match(joined, /var\(--ke-type-(?:body|title|heading|label)/);
  assert.match(joined, /var\(--ke-space-/);
  assert.match(joined, /var\(--ke-radius-/);
  assert.match(joined, /var\(--ke-touch-target/);
  assert.match(sources["SYSTEM/Views/project-wizard.js"], /min-inline-size:\s*var\(--ke-touch-target/);
  assert.match(sources["SYSTEM/Views/project-wizard.js"], /box-shadow:\s*none\s*!important/);
  assert.match(sources["HUB/40 Project.md"], /prodigy-project-today prodigy-full-bleed/);
  assert.match(sources["HUB/40 Project.md"], /prodigy-project-pipeline prodigy-utility-card/);
  assert.match(sources["SYSTEM/Views/project-card.js"], /prodigy-utility-card/);
  assert.match(sources["SYSTEM/Views/project-wizard.js"], /prodigy-utility-card/);
  assert.match(joined, /focus-visible/);
  assert.match(joined, /forced-colors:\s*active/);
  assert.match(joined, /prefers-reduced-motion:\s*reduce/);
}

test("Project consumes the shared Apple presentation contract", () => {
  validateProjectPresentation(Object.fromEntries(paths.map((relative) => [relative, read(relative)])));
});

test("Project presentation oracle turns local literal, shadow, private-control, breakpoint, and multi-event drift RED", () => {
  const clean = Object.fromEntries(paths.map((relative) => [relative, read(relative)]));
  const target = "SYSTEM/Views/project-wizard.js";
  const mutations = [
    ".mutation{color:#fff}",
    ".mutation{box-shadow:0 1px 2px black}",
    ".mutation{font-size:13px;border-radius:7px}",
    "@media (max-width:700px){.mutation{display:block}}",
    ".mutation{min-height:var(--project-touch-target)}",
    "el.onmousedown=()=>{}",
  ];
  for (const mutation of mutations) {
    assert.throws(() => validateProjectPresentation({ ...clean, [target]: `${clean[target]}\n${mutation}` }), /Project/);
  }
});
