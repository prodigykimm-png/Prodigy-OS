import fs from 'node:fs';
import path from 'node:path';

const [profilesPath, outputDir] = process.argv.slice(2);
const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8')).profiles;
const districts = [...new Set(profiles.map((profile) => profile.region_sigungu))];
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < districts.length; index += 1) {
  const district = districts[index];
  const outputPath = path.join(outputDir, `${district}.json`);
  if (fs.existsSync(outputPath)) {
    console.log(`BUILDING_DISTRICT_CACHED ${district}`);
    continue;
  }
  const query = `[out:json][timeout:180];area["name"="부산광역시"]["boundary"="administrative"]->.busan;relation(area.busan)["name"="${district}"]["boundary"="administrative"]->.district;map_to_area.district->.a;nwr(area.a)["building"~"^(apartments|house|residential|commercial|retail|industrial)$"];out center tags;`;
  let saved = false;
  let lastError = '';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DuskAuctionResearch/1.0 (local Obsidian research)' }, body: new URLSearchParams({ data: query }) });
      const text = await response.text();
      if (!response.ok || !text.trim().startsWith('{')) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
      const parsed = JSON.parse(text);
      fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
      console.log(`BUILDING_DISTRICT_READY ${district} elements=${parsed.elements?.length || 0}`);
      saved = true;
      break;
    } catch (error) {
      lastError = error.message;
    }
  }
  if (!saved) console.log(`BUILDING_DISTRICT_FAILED ${district} ${lastError.replace(/\s+/g, ' ').slice(0, 200)}`);
  if (index + 1 < districts.length) await wait(1500);
}
console.log('BUILDING_DISTRICTS_DONE');
