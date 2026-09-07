import fs from 'node:fs';
import path from 'node:path';

const [boundariesPath, outputDir] = process.argv.slice(2);
const collection = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < collection.features.length; index += 1) {
  const feature = collection.features[index];
  const safeName = `${feature.properties.key.replaceAll('/', '_')}.json`;
  const outputPath = path.join(outputDir, safeName);
  if (fs.existsSync(outputPath)) continue;
  if (feature.properties.osm_type !== 'relation') {
    console.log(`BUILDING_DONG_SKIPPED ${feature.properties.key} osm_type=${feature.properties.osm_type}`);
    continue;
  }
  const areaId = Number(feature.properties.osm_id) + 3600000000;
  const query = `[out:json][timeout:90];area(${areaId})->.a;nwr(area.a)["building"~"^(apartments|house|residential|commercial|retail|industrial)$"];out center tags;`;
  let saved = false;
  let errorText = '';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DuskAuctionResearch/1.0 (local Obsidian research)' }, body: new URLSearchParams({ data: query }) });
      const text = await response.text();
      if (!response.ok || !text.trim().startsWith('{')) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
      const data = JSON.parse(text);
      fs.writeFileSync(outputPath, `${JSON.stringify({ key: feature.properties.key, elements: data.elements || [] }, null, 2)}\n`);
      saved = true;
      break;
    } catch (error) { errorText = error.message; }
  }
  if (!saved) console.log(`BUILDING_DONG_FAILED ${feature.properties.key} ${errorText.replace(/\s+/g, ' ').slice(0, 160)}`);
  if ((index + 1) % 10 === 0) console.log(`BUILDING_DONG_PROGRESS ${index + 1}/${collection.features.length}`);
  await wait(800);
}
console.log('BUILDING_DONGS_DONE');
