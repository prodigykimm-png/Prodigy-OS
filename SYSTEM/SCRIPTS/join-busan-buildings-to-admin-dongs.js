import fs from 'node:fs';
import path from 'node:path';

const [boundariesPath, inputDir, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
function pointInRing([x, y], ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function inPolygon(point, polygon) { return pointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(point, ring)); }
function contains(geometry, point) { return geometry.type === 'Polygon' ? inPolygon(point, geometry.coordinates) : geometry.coordinates.some((polygon) => inPolygon(point, polygon)); }
const types = ['apartments', 'house', 'residential', 'commercial', 'retail', 'industrial'];
const files = fs.readdirSync(inputDir).filter((name) => name.endsWith('.json'));
const coveredDistricts = new Set(files.map((name) => name.replace(/\.json$/u, '')));
const byDong = Object.fromEntries(boundaries.features.map((feature) => [feature.properties.key, { coverage: coveredDistricts.has(feature.properties.sigungu), ...Object.fromEntries(types.map((type) => [type, 0])) }]));
let elements = 0; let unassigned = 0;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf8'));
  for (const element of data.elements || []) {
    const lon = element.lon ?? element.center?.lon; const lat = element.lat ?? element.center?.lat; const type = element.tags?.building;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !types.includes(type)) continue;
    elements += 1;
    const feature = boundaries.features.find((candidate) => contains(candidate.geometry, [lon, lat]));
    if (!feature) { unassigned += 1; continue; }
    byDong[feature.properties.key][type] += 1;
  }
}
fs.writeFileSync(outputPath, `${JSON.stringify({ source: 'OpenStreetMap Overpass', fetched_at: '2026-08-30', elements, unassigned, by_admin_dong: byDong }, null, 2)}\n`);
console.log(`BUILDING_JOIN_READY boundaries=${boundaries.features.length} elements=${elements} unassigned=${unassigned}`);
