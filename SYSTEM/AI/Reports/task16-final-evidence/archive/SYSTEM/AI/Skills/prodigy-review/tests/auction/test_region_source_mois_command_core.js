"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const command = require("../../../../../SCRIPTS/region-source-mois-command-core.js");

test("Given a valid MOIS collection request, When a command is built, Then it runs from the Vault root with explicit dates and registry", () => {
  const result = command.buildCommand({
    vault_root: "<task-temp>/prodigy-synthetic-vault",
    period: "2026-05",
    published_at: "2026-06-20T00:00:00.000Z",
    registry: "expansion"
  });
  assert.match(result, /^cd '/u);
  assert.match(result, /region-source-mois-collect\.js/u);
  assert.match(result, /--period '2026-05'/u);
  assert.match(result, /--published-at '2026-06-20T00:00:00\.000Z'/u);
  assert.match(result, /--registry 'expansion' --allow-network$/u);
  assert.doesNotMatch(result, /API_KEY|SECRET|token/iu);
});

test("Given a relative execution context, When a command is built, Then it omits an unsafe directory change but keeps the explicit CLI contract", () => {
  const result = command.buildCommand({ period: "2026-05", published_at: "2026-06-20T00:00:00Z", registry: "pilot" });
  assert.equal(result, "node 'SYSTEM/SCRIPTS/region-source-mois-collect.js' --period '2026-05' --published-at '2026-06-20T00:00:00Z' --registry 'pilot' --allow-network");
});

test("Given missing or unsafe collection identity, When a command is built, Then it fails before a command is returned", () => {
  assert.throws(() => command.buildCommand({ period: "2026-5", published_at: "2026-06-20T00:00:00Z" }), /YYYY-MM/u);
  assert.throws(() => command.buildCommand({ period: "2026-05", published_at: "2026-06-20 00:00:00" }), /UTC ISO/u);
  assert.throws(() => command.buildCommand({ period: "2026-05", published_at: "2026-06-20T00:00:00Z", registry: "nationwide" }), /pilot 또는 expansion/u);
  assert.throws(() => command.buildCommand({ vault_root: "relative/root", period: "2026-05", published_at: "2026-06-20T00:00:00Z" }), /절대 경로/u);
});

console.log("MOIS source command core tests loaded");
