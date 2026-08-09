"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const SCHEMA_PATH = "SYSTEM/Prodigy/Schema/Venue_Schema.md";
const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_venue.md";
const DISPLAY_PATH = "SYSTEM/Views/display-registry.js";
const ALLOWED_KEYS = Object.freeze([
  "type",
  "venue_category",
  "address",
  "connections",
  "created",
  "updated",
]);
const REQUIRED_HEADINGS = Object.freeze([
  "소개",
  "방문 정보",
  "메모",
  "관련 지식",
  "관련 저널",
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function frontmatter(document) {
  const match = document.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, "Venue template must start with YAML frontmatter");
  return match[1];
}

function frontmatterKeys(document) {
  return frontmatter(document)
    .split("\n")
    .filter((line) => /^[a-z_][a-z0-9_]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
}

function assertVenueTemplate(document) {
  const yaml = frontmatter(document);
  assert.deepEqual(frontmatterKeys(document), ALLOWED_KEYS);
  assert.match(yaml, /^type:\s*venue$/m);
  for (const key of ALLOWED_KEYS) assert.match(key, /^[a-z][a-z0-9_]*$/);
  assert.equal(/^[^\n:]*[가-힣][^\n:]*:/m.test(yaml), false);
  assert.equal(/^(?:resource|resource_kind|lighting|flow|shooting_points|cautions|related_(?:knowledge|journal)):/m.test(yaml), false);

  const body = document.slice(document.indexOf("\n---", 3) + 4);
  for (const heading of REQUIRED_HEADINGS) assert.match(body, new RegExp(`^## ${heading}$`, "m"));
  assert.match(body, /type\s*=\s*"knowledge"/);
  assert.match(body, /type\s*=\s*"journal"/);
  assert.equal((body.match(/contains\(this\.connections, file\.link\)/g) || []).length, 2);
}

function testDedicatedVenueContract() {
  // Given: the canonical Venue schema and template.
  const schema = read(SCHEMA_PATH);
  const template = read(TEMPLATE_PATH);
  const display = read(DISPLAY_PATH);

  // When/Then: Venue remains dedicated, minimal, Korean-facing, and link-driven.
  assert.match(schema, /`type`\s*\|\s*`venue`/);
  for (const key of ALLOWED_KEYS) assert.equal(schema.includes(`\`${key}\``), true);
  assert.match(schema, /범용 `resource` type을 만들지 않는다/);
  assert.match(schema, /본문을 복사하지 않는다/);
  assert.match(display, /venue_category:\s*"장소 분류"/);
  assert.match(display, /venue:\s*Object\.freeze\(\{\s*label:\s*"장소"/);
  assertVenueTemplate(template);
}

function testFailureFixturesAreRejected() {
  // Given: invalid Venue fixtures crossing distinct contract boundaries.
  const valid = read(TEMPLATE_PATH);
  const missingType = valid.replace(/^type:\s*venue$/m, "");
  const koreanKey = valid.replace(/^address:/m, "주소:");
  const proseLeak = valid.replace(/^address:/m, "lighting:\naddress:");

  // When/Then: missing identity, Korean storage keys, and nullable prose leakage fail.
  assert.throws(() => assertVenueTemplate(missingType));
  assert.throws(() => assertVenueTemplate(koreanKey));
  assert.throws(() => assertVenueTemplate(proseLeak));
}

testDedicatedVenueContract();
testFailureFixturesAreRejected();
console.log("Venue contract tests passed");
