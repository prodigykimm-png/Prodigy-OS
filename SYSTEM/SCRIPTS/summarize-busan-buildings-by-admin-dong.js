import fs from 'node:fs';
import path from 'node:path';

const [boundariesPath, inputDir, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
const types = ['apartments', 'house', 'residential', 'commercial', 'retail', 'industrial'];
const byDong = Object.fromEntries(boundaries.features.map((feature) => [feature.properties.key, { coverage: false, ...Object.fromEntries(types.map((type) => [type, 0])) }]));
let elements = 0;
for (const file of fs.readdirSync(inputDir).filter((name) => name.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf8'));
  if (!byDong[data.key]) continue;
  byDong[data.key].coverage = true;
  for (const element of data.elements || []) {
    const type = element.tags?.building;
    if (types.includes(type)) { byDong[data.key][type] += 1; elements += 1; }
  }
}
fs.writeFileSync(outputPath, `${JSON.stringify({ source: 'OpenStreetMap Overpass by administrative relation', fetched_at: '2026-08-30', elements, by_admin_dong: byDong }, null, 2)}\n`);
console.log(`BUILDING_ADMIN_SUMMARY_READY boundaries=${boundaries.features.length} covered=${Object.values(byDong).filter((row) => row.coverage).length} elements=${elements}`);
