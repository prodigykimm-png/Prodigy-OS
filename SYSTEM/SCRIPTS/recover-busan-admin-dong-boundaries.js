import fs from 'node:fs';

const [profilesPath, boundariesPath] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const collection = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
const existing = new Set(collection.features.map((feature) => feature.properties.key));
const failed = data.profiles.filter((profile) => !existing.has(profile.key));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const profile of failed) {
  const queries = [
    `${profile.admin_dong} ${profile.region_sigungu} 부산광역시 대한민국`,
    `${(profile.legal_dong_aliases || [])[0] || profile.admin_dong} ${profile.region_sigungu} 부산광역시 대한민국`
  ];
  let hit = null;
  for (const query of queries) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query); url.searchParams.set('format', 'jsonv2'); url.searchParams.set('polygon_geojson', '1'); url.searchParams.set('addressdetails', '1'); url.searchParams.set('limit', '8');
    const response = await fetch(url, { headers: { 'User-Agent': 'DuskAuctionResearch/1.0 (local Obsidian research)' } });
    if (response.ok) {
      const rows = await response.json();
      hit = rows.find((row) => row.category === 'boundary' && ['Polygon', 'MultiPolygon'].includes(row.geojson?.type));
      if (hit) break;
    }
    await wait(1200);
  }
  if (hit) {
    collection.features.push({ type: 'Feature', properties: { key: profile.key, admin_dong: profile.admin_dong, sigungu: profile.region_sigungu, osm_type: hit.osm_type, osm_id: hit.osm_id, display_name: hit.display_name, source: 'OpenStreetMap Nominatim fallback', fetched_at: '2026-08-30' }, geometry: hit.geojson });
    console.log(`BOUNDARY_RECOVERED ${profile.key}`);
  } else console.log(`BOUNDARY_UNRESOLVED ${profile.key}`);
  await wait(1200);
}
collection.failures = data.profiles.filter((profile) => !collection.features.some((feature) => feature.properties.key === profile.key)).map((profile) => ({ key: profile.key, reason: 'fallback unresolved' }));
fs.writeFileSync(boundariesPath, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`BOUNDARY_RECOVERY_DONE features=${collection.features.length} failures=${collection.failures.length}`);
