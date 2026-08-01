"use strict";

const path = require("node:path");

const tests = [
  "test_codex_exec_service.js",
  "test_antigravity_exec_service.js",
  "test_antigravity_relay_server.js",
  "test_ai_provider_service.js",
  "test_daily_reflection_contract.js",
  "test_daily_reflection_conservative_policy.js",
  "test_daily_reflection_generate_proposal.js"
];

async function main() {
  for (const file of tests) {
    const mod = require(path.join(__dirname, file));
    if (typeof mod.main !== "function") throw new Error(`${file} does not export main()`);
    await mod.main();
  }
  console.log("Daily reflection AI compatibility tests passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
