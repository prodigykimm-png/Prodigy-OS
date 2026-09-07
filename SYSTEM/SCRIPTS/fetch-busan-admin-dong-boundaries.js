import fs from 'node:fs';
import path from 'node:path';
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const features = [];
const failures = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let i = 0; i < data.profiles.length; i += 1) {
  const profile = data.profiles[i];
  const query = `${profile.admin_dong} ${profile.region_sigungu} 부산광역시 대한민국`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('polygon_geojson', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'DuskAuctionResearch/1.0 (local Obsidian research)' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    const hit = rows.find((row) => row.category === 'boundary' && row.type === 'administrative' && ['Polygon', 'MultiPolygon'].includes(row.geojson?.type));
    if (!hit) failures.push({ key: profile.key, query, reason: 'administrative polygon not found' });
    else features.push({ type: 'Feature', properties: { key: profile.key, admin_dong: profile.admin_dong, sigungu: profile.region_sigungu, osm_type: hit.osm_type, osm_id: hit.osm_id, display_name: hit.display_name, source: 'OpenStreetMap Nominatim', fetched_at: '2026-08-30' }, geometry: hit.geojson });
  } catch (error) {
    failures.push({ key: profile.key, query, reason: error.message });
  }
  if ((i + 1) % 20 === 0) console.log(`PROGRESS ${i + 1}/${data.profiles.length} features=${features.length} failures=${failures.length}`);
  if (i + 1 < data.profiles.length) await wait(1100);
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ type: 'FeatureCollection', features, failures }, null, 2)}\n`);
console.log(`GIS_BOUNDARIES_READY features=${features.length} failures=${failures.length}`);
