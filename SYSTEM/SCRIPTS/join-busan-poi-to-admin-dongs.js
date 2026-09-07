import fs from 'node:fs';

const [boundariesPath, poiPath, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
const poi = JSON.parse(fs.readFileSync(poiPath, 'utf8'));

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function contains(geometry, point) {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  return false;
}

function category(tags = {}) {
  if (tags.railway === 'station') return 'station';
  if (tags.amenity === 'school') return 'school';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'marketplace') return 'marketplace';
  if (tags.leisure === 'park') return 'park';
  if (tags.shop === 'supermarket') return 'supermarket';
  return null;
}

const points = poi.elements.flatMap((element) => {
  const lon = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;
  const kind = category(element.tags);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !kind) return [];
  return [{ osm_type: element.type, osm_id: element.id, lon, lat, kind, name: element.tags?.name || '', tags: element.tags || {} }];
});

const joined = {};
const unassigned = [];
for (const point of points) {
  const feature = boundaries.features.find((candidate) => contains(candidate.geometry, [point.lon, point.lat]));
  if (!feature) {
    unassigned.push(point);
    continue;
  }
  const key = feature.properties.key;
  joined[key] ||= { station: [], school: [], hospital: [], marketplace: [], park: [], supermarket: [] };
  joined[key][point.kind].push(point);
}

const summary = Object.fromEntries(boundaries.features.map((feature) => {
  const key = feature.properties.key;
  const groups = joined[key] || { station: [], school: [], hospital: [], marketplace: [], park: [], supermarket: [] };
  return [key, Object.fromEntries(Object.entries(groups).map(([kind, rows]) => [kind, { count: rows.length, named: rows.filter((row) => row.name).map((row) => row.name).slice(0, 30) }]))];
}));

fs.writeFileSync(outputPath, `${JSON.stringify({ source: 'OpenStreetMap Overpass', fetched_at: '2026-08-30', points: points.length, unassigned: unassigned.length, by_admin_dong: summary }, null, 2)}\n`);
console.log(`POI_JOIN_READY boundaries=${boundaries.features.length} points=${points.length} unassigned=${unassigned.length}`);
