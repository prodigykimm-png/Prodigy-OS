import fs from 'node:fs';
import path from 'node:path';

const [boundariesPath, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
const prior = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : { source: 'OpenStreetMap Overpass', fetched_at: '2026-08-30', by_admin_dong: {}, failures: [] };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const types = ['apartments', 'house', 'residential', 'commercial', 'retail', 'industrial'];

for (let index = 0; index < boundaries.features.length; index += 1) {
  const feature = boundaries.features[index];
  const key = feature.properties.key;
  if (prior.by_admin_dong[key]) continue;
  if (feature.properties.osm_type !== 'relation') {
    prior.failures.push({ key, reason: `unsupported osm_type ${feature.properties.osm_type}` });
    continue;
  }
  const areaId = Number(feature.properties.osm_id) + 3600000000;
  const result = {};
  try {
    for (const buildingType of types) {
      const query = `[out:json][timeout:60];area(${areaId})->.a;nwr(area.a)["building"="${buildingType}"];out count;`;
      const url = new URL('https://overpass-api.de/api/interpreter');
      url.searchParams.set('data', query);
      const response = await fetch(url, { headers: { 'User-Agent': 'DuskAuctionResearch/1.0 (local Obsidian research)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const count = Number(data.elements?.find((element) => element.type === 'count')?.tags?.total || 0);
      result[buildingType] = count;
      await wait(250);
    }
    prior.by_admin_dong[key] = result;
  } catch (error) {
    prior.failures.push({ key, reason: error.message });
  }
  if ((index + 1) % 10 === 0) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(prior, null, 2)}\n`);
    console.log(`BUILDING_PROGRESS ${index + 1}/${boundaries.features.length} complete=${Object.keys(prior.by_admin_dong).length} failures=${prior.failures.length}`);
  }
  await wait(750);
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(prior, null, 2)}\n`);
console.log(`BUILDING_STATS_READY complete=${Object.keys(prior.by_admin_dong).length} failures=${prior.failures.length}`);
