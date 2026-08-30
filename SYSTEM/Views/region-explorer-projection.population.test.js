"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const projection = require("./region-explorer-projection.js");

const path = "PARA/RESOURCES/Auction Regions/부산광역시-북구.md";
const body = fs.readFileSync(path, "utf8");
const result = projection.projectRegionSources([{ path, body }]);

const frontmatter = Object.fromEntries(body.match(/^---\n([\s\S]*?)\n---/)[1].split("\n").map((line) => line.match(/^([^:#]+):\s*(.*?)\s*$/)).filter(Boolean).map((match) => [match[1], match[2]]));
assert.equal(result.rows.length, 1);
assert.equal(result.rows[0].metrics.total_population.value, Number(frontmatter.total_population));
assert.equal(result.rows[0].metrics.male_population.value, Number(frontmatter.male_population));
assert.equal(result.rows[0].metrics.female_population.value, Number(frontmatter.female_population));
assert.equal(result.rows[0].metrics.households.value, Number(frontmatter.households));
assert.equal(projection.METRIC_KEYS.includes("total_population"), true);

console.log("region explorer population projection tests: PASS");
