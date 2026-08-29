"use strict";

/*
 * Focused regression test for the authoring smoke runner's skip detection.
 *
 * Red history: a broad /skip|SKIP|\.skip(/ sniff false-flagged passing child
 * output containing zero-skip counters ("skipped":0, "# skipped 0") as
 * SKIP_SIGNAL_DETECTED.
 * Green contract for detectSkipSignal():
 *   - zero-count JSON/TAP/prose forms pass
 *   - positive skipped counters, TAP "# SKIP", inline "# skip",
 *     ".skip(" declarations, and uppercase "SKIP:"/"SKIP=" markers fail
 *   - matches never cross newline boundaries (line-anchored)
 *   - sensitivity: every real-skip sample must flip relative to its
 *     zero-count twin (mutation-style guard against a detector that
 *     accepts everything)
 */

const assert = require("node:assert/strict");
const { detectSkipSignal } = require("./run_knowledge_authoring_tests.js");

const ZERO_COUNT_OUTPUTS = [
  // JSON zero counters
  '{"tests":5,"pass":5,"skipped":0,"fail":0}',
  '{"counts":{"skipped": 0}}',
  // TAP zero counters
  "TAP version 13\n1..3\nok 1 - a\n# skipped 0\n",
  // prose zero counters
  "suite done\n0 skipped\n",
  "node --test summary\ntests 4 pass 4 skipped 0\n",
  "no skip detected"
];

const POSITIVE_COUNT_OUTPUTS = [
  '{"tests":6,"pass":5,"skipped":1,"fail":0}',
  "node --test summary\ntests 6 pass 5 skips 1 fail 0\n",
  "result: 2 skipped in this run",
  "summary\nskipped=3"
];

const DIRECTIVE_OUTPUTS = [
  // plan-level TAP skip
  "# SKIP: optional integration disabled",
  // inline TAP skip directives
  "not ok 1 - flaky # SKIP env not available",
  "ok 2 - remote # skip needs network",
  // source-level declaration
  'registered test.skip("needs docker", () => {})',
  ".skip('pending upstream')",
  // uppercase markers
  "SKIP=1 ./run_optional.sh",
  "// SKIP: pending upstream fix"
];

// Skip-shaped words whose digit or value sits on ANOTHER line must never
// be joined into a signal: matching is line-local.
const NEWLINE_NON_CROSSING_OUTPUTS = [
  "skipped:\n0\n",
  "SKIP\n=1 is documented in the README",
  "not ok 1 - a\nok 2 - b"
];

for (const text of ZERO_COUNT_OUTPUTS) {
  assert.equal(detectSkipSignal(text), false,
    `zero-count output must NOT be flagged:\n${text}`);
}
process.stdout.write(`zeroPass ${ZERO_COUNT_OUTPUTS.length} samples\n`);

for (const text of POSITIVE_COUNT_OUTPUTS.concat(DIRECTIVE_OUTPUTS)) {
  assert.equal(detectSkipSignal(text), true,
    `real skip output MUST be flagged:\n${text}`);
}
process.stdout.write(`realSkipRejected ${POSITIVE_COUNT_OUTPUTS.length + DIRECTIVE_OUTPUTS.length} samples\n`);

for (const text of NEWLINE_NON_CROSSING_OUTPUTS) {
  assert.equal(detectSkipSignal(text), false,
    `newline-separated fragments must NOT be joined into a skip signal:\n${text}`);
}

// Mutation-style sensitivity: each real skip paired with its zero twin
// must produce opposite verdicts. A detector mutated to always-return
// false (or always true) fails here.
const PAIRS = [
  ['{"tests":5,"skipped":0}', '{"tests":5,"skipped":2}'],
  ["# skipped 0", "# SKIP: disabled"],
  ["ok 1 - a", "ok 1 - a # skip needs network"],
  ["plain output", ".skip('x')"],
  ["note about SKIP\non next line", "SKIP:1"]
];
for (const [zero, real] of PAIRS) {
  assert.equal(detectSkipSignal(zero), false);
  assert.equal(detectSkipSignal(real), true);
  assert.notEqual(detectSkipSignal(zero), detectSkipSignal(real),
    `detector lost sensitivity on pair:\n  zero: ${zero}\n  real: ${real}`);
}
assert.equal(detectSkipSignal(""), false);
assert.equal(detectSkipSignal(null), false);

console.log("test_knowledge_authoring_skip_detector: all assertions passed");
