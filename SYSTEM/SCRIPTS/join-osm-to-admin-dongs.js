import fs from 'node:fs';
import readline from 'node:readline';

const [boundaryPath, geojsonSeqPath, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundaryPath, 'utf8')).features;
function rings(geometry) { return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates; }
function bboxOfCoords(coords, box = [Infinity, Infinity, -Infinity, -Infinity]) { if (typeof coords[0] === 'number') { box[0] = Math.min(box[0], coords[0]); box[1] = Math.min(box[1], coords[1]); box[2] = Math.max(box[2], coords[0]); box[3] = Math.max(box[3], coords[1]); } else coords.forEach((value) => bboxOfCoords(value, box)); return box; }
function pointInRing([x, y], ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function contains(geometry, point) { return rings(geometry).some((polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole))); }
function orientation(a, b, c) { const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]); return Math.abs(value) < 1e-12 ? 0 : value > 0 ? 1 : 2; }
function onSegment(a, b, c) { return b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) && b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]); }
function segmentsIntersect(a, b, c, d) { const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b); if (o1 !== o2 && o3 !== o4) return true; return (!o1 && onSegment(a, c, b)) || (!o2 && onSegment(a, d, b)) || (!o3 && onSegment(c, a, d)) || (!o4 && onSegment(c, b, d)); }
function coordinateSequences(geometry) {
  if (geometry.type === 'Point') return [[geometry.coordinates]];
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}
function geometryIntersectsBoundary(geometry, boundary) {
  return coordinateSequences(geometry).some((points) => {
    if (points.some((point) => contains(boundary, point))) return true;
    if (points.length < 2) return false;
    for (const polygon of rings(boundary)) for (const ring of polygon) for (let i = 1; i < points.length; i += 1) for (let j = 1; j < ring.length; j += 1) if (segmentsIntersect(points[i - 1], points[i], ring[j - 1], ring[j])) return true;
    return false;
  });
}
function intersectsBox(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
const indexed = boundaries.map((feature) => ({ feature, bbox: bboxOfCoords(feature.geometry.coordinates), summary: { highways: new Map(), railways: new Map(), waterways: new Map(), stations: new Map(), schools: new Map(), markets: new Map(), hospitals: new Map(), parks: new Map() } }));
function add(map, name, tags) { const label = String(name || '').trim(); if (!label) return; map.set(label, { name: label, tags }); }
const reader = readline.createInterface({ input: fs.createReadStream(geojsonSeqPath), crlfDelay: Infinity });
let objects = 0;
for await (const line of reader) {
  const record = line.replace(/^\u001e/u, '').trim();
  if (!record) continue;
  const feature = JSON.parse(record); if (!feature.geometry) continue;
  const box = bboxOfCoords(feature.geometry.coordinates); const tags = feature.properties || {}; objects += 1;
  for (const entry of indexed) {
    if (!intersectsBox(box, entry.bbox) || !geometryIntersectsBoundary(feature.geometry, entry.feature.geometry)) continue;
    const name = tags.name || tags['name:ko'] || tags.ref;
    if (tags.highway) add(entry.summary.highways, name, { highway: tags.highway, ref: tags.ref || null });
    if (tags.railway === 'station' || tags.railway === 'halt' || tags.railway === 'subway_entrance') add(entry.summary.stations, name, { railway: tags.railway });
    else if (tags.railway) add(entry.summary.railways, name, { railway: tags.railway });
    if (tags.waterway) add(entry.summary.waterways, name, { waterway: tags.waterway });
    if (tags.amenity === 'school') add(entry.summary.schools, name, { amenity: tags.amenity });
    if (tags.amenity === 'marketplace') add(entry.summary.markets, name, { amenity: tags.amenity });
    if (tags.amenity === 'hospital') add(entry.summary.hospitals, name, { amenity: tags.amenity });
    if (tags.leisure === 'park') add(entry.summary.parks, name, { leisure: tags.leisure });
  }
}
const byAdminDong = {};
for (const entry of indexed) byAdminDong[entry.feature.properties.key] = Object.fromEntries(Object.entries(entry.summary).map(([key, value]) => [key, [...value.values()]]));
fs.writeFileSync(outputPath, `${JSON.stringify({ source: geojsonSeqPath, objects_scanned: objects, by_admin_dong: byAdminDong }, null, 2)}\n`);
console.log(`ADMIN_SPATIAL_JOIN_READY boundaries=${indexed.length} objects=${objects}`);
