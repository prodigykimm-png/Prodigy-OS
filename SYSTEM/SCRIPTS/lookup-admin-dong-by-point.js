import fs from 'node:fs';

const [boundaryPath, lonArg, latArg] = process.argv.slice(2);
const point = [Number(lonArg), Number(latArg)];
const data = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
function pointInRing([x, y], ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function contains(geometry) { const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates; return polygons.some((polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole))); }
const matches = data.features.filter((feature) => contains(feature.geometry)).map((feature) => feature.properties);
process.stdout.write(`${JSON.stringify(matches)}\n`);
