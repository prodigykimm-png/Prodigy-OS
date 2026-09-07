import fs from 'node:fs';

const [boundariesPath, linesPath, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8'));

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(point, polygon) { return pointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(point, ring)); }
function contains(geometry, point) { return geometry.type === 'Polygon' ? inPolygon(point, geometry.coordinates) : geometry.coordinates.some((polygon) => inPolygon(point, polygon)); }
function kind(tags = {}) { return tags.highway ? 'highway' : tags.railway ? 'railway' : tags.waterway ? 'waterway' : null; }

const joined = Object.fromEntries(boundaries.features.map((feature) => [feature.properties.key, { highway: [], railway: [], waterway: [] }]));
for (const line of lines.elements) {
  const lineKind = kind(line.tags); if (!lineKind || !Array.isArray(line.geometry)) continue;
  const sample = line.geometry.filter((_, index) => index % Math.max(1, Math.floor(line.geometry.length / 10)) === 0).map((point) => [point.lon, point.lat]);
  for (const feature of boundaries.features) {
    if (!sample.some((point) => contains(feature.geometry, point))) continue;
    const row = { osm_id: line.id, name: line.tags?.name || '', ref: line.tags?.ref || '', subtype: line.tags?.[lineKind] || '' };
    const rows = joined[feature.properties.key][lineKind];
    if (!rows.some((item) => item.osm_id === row.osm_id)) rows.push(row);
  }
}
const summary = Object.fromEntries(Object.entries(joined).map(([key, groups]) => [key, Object.fromEntries(Object.entries(groups).map(([lineKind, rows]) => [lineKind, { count: rows.length, names: [...new Set(rows.flatMap((row) => [row.name, row.ref]).filter(Boolean))].slice(0, 50), subtypes: [...new Set(rows.map((row) => row.subtype))] }]))]));
fs.writeFileSync(outputPath, `${JSON.stringify({ source: 'OpenStreetMap Overpass', fetched_at: '2026-08-30', by_admin_dong: summary }, null, 2)}\n`);
console.log(`STRUCTURAL_JOIN_READY boundaries=${boundaries.features.length} lines=${lines.elements.length}`);
