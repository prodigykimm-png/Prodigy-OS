"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = path.resolve(__dirname, "../../../../..");

function rootFromArgs(argv) {
  const index = argv.indexOf("--root");
  if (index === -1) return DEFAULT_ROOT;
  assert.ok(argv[index + 1], "--root requires a path");
  return path.resolve(argv[index + 1]);
}

const ROOT = rootFromArgs(process.argv.slice(2));
const REQUIRED_PRIMITIVES = [
  "recoverable-hub-shell",
  "mobile-quick-stream",
  "micro-log-capture",
  "vault-assistant",
  "citation-bundle",
  "ai-telemetry-status",
];
const REQUIRED_DESIGN_GUARDRAILS = [
  "44px",
  "CJK",
  "reduced motion",
  "one scroll owner",
  "single Home",
  "no separate Mobile Home",
  "read-only Assistant",
  "no automatic approval",
  "physical iPhone",
  "user-evidence-only gate",
];
const REQUIRED_UI_STATES = [
  "rest",
  "focus-visible",
  "selected",
  "loading",
  "empty",
  "error",
  "disabled",
];

function read(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function testConstitutionalCaptureAndApprovalBaseline() {
  // Given: the current Constitution and user manual.
  const constitution = read("SYSTEM/docs/00_Constitution.md");
  const manual = read("SYSTEM/docs/09_Obsidian_Manual.md");

  // When: their Capture and AI-approval wording is inspected.
  // Then: existing contracts still make Capture quick and reserve approval for humans.
  assert.match(constitution, /3초 안에 기록을 시작/);
  assert.match(constitution, /폴더를 고르지 않는다/);
  assert.match(constitution, /Property를 입력하지 않는다/);
  assert.match(constitution, /지식의 검증, 이관 및 최종 결정의 주체는 오직 \*\*사용자\(Human\)\*\*/);
  assert.match(manual, /AI \/ 규칙은 \*\*제안\*\*만 한다/);
  assert.match(manual, /\*\*승인 · 실행 · 성찰 작성\*\* 은 사람/);
  assert.match(manual, /PRE 원칙은 항상 `pending`/);
}

function assertIncludesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label}: ${value}`);
  }
}

function assertBacktickedTerms(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(`\`${value}\``), `${label}: ${value}`);
  }
}

function testNamedReliabilityPrimitivesAndGuardrails() {
  // Given: the approved design, capture, Constitution, and user-manual sources.
  const sources = {
    design: read("DESIGN.md"),
    constitution: read("SYSTEM/docs/00_Constitution.md"),
    capture: read("SYSTEM/docs/04_Capture_System.md"),
    manual: read("SYSTEM/docs/09_Obsidian_Manual.md"),
  };
  const corpus = Object.values(sources).join("\n\n");

  // When: the reliability/capture source contract is inspected.
  // Then: every named primitive and guardrail is present in durable docs.
  assertBacktickedTerms(corpus, REQUIRED_PRIMITIVES, "missing primitive");
  assertBacktickedTerms(sources.design, REQUIRED_UI_STATES, "missing state");
  assertIncludesAll(corpus, REQUIRED_DESIGN_GUARDRAILS, "missing guardrail");
  assert.match(sources.design, /one scroll owner/);
  assert.match(sources.design, /44px/);
  assert.match(sources.design, /CJK/);
  assert.match(sources.design, /reduced motion/);
  assert.match(sources.manual, /single Home/);
  assert.match(sources.manual, /no separate Mobile Home/);
  assert.match(sources.capture, /read-only Assistant/);
  assert.match(sources.capture, /no automatic approval/);
  assert.match(sources.capture, /citation-bundle/);
  assert.match(sources.constitution, /Home[\s\S]*Article 3[\s\S]*Capture[\s\S]*Inbox[\s\S]*Workspace/);
  assert.match(sources.constitution, /physical iPhone[\s\S]*user-evidence-only gate/);
}

testConstitutionalCaptureAndApprovalBaseline();
testNamedReliabilityPrimitivesAndGuardrails();
console.log("Reliability capture source contract passed.");
