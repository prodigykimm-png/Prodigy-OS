"use strict";

/**
 * Region Admin Boundary Core
 *
 * Point-in-polygon logic for EPSG:4326 (WGS84 lon/lat) admin boundaries.
 *
 * Assignment rules:
 * - Contains/covers exactly one polygon → auto assign that region
 * - 0 matches → unresolved_boundary
 * - Multiple matches → unresolved_boundary
 *
 * NEVER uses nearest-centroid fallback. Ambiguity is always unresolved.
 */

/**
 * Ray-casting point-in-polygon test.
 * Point is [lon, lat] in EPSG:4326.
 * Polygon is an array of rings; ring[0] is exterior, rest are holes.
 * Each ring is an array of [lon, lat] pairs.
 *
 * @param {number[]} point - [lon, lat]
 * @param {number[][][]} polygon - Array of rings
 * @returns {boolean}
 */
function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  const [px, py] = point;

  // Must be inside exterior ring
  if (!pointInRing(px, py, polygon[0])) return false;

  // Must not be inside any hole
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(px, py, polygon[i])) return false;
  }

  return true;
}

/**
 * Ray-casting algorithm for a single ring.
 * @param {number} px - point longitude
 * @param {number} py - point latitude
 * @param {number[][]} ring - array of [lon, lat] pairs
 * @returns {boolean}
 */
function pointInRing(px, py, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;

  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Assign a point to a region using boundary polygons.
 *
 * @param {number[]} point - [lon, lat] in EPSG:4326
 * @param {Array<{region_key: string, polygon: number[][][]}>} boundaries
 * @returns {{ status: string, region_key: string|null, matches: string[], reason: string }}
 */
function assignPoint(point, boundaries) {
  if (!Array.isArray(point) || point.length !== 2) {
    return {
      status: "invalid_input",
      region_key: null,
      matches: [],
      reason: "point must be [lon, lat] array in EPSG:4326",
    };
  }

  if (!Array.isArray(boundaries)) {
    return {
      status: "invalid_input",
      region_key: null,
      matches: [],
      reason: "boundaries must be an array",
    };
  }

  const matches = [];

  for (const boundary of boundaries) {
    if (!boundary || !boundary.region_key || !boundary.polygon) continue;
    if (pointInPolygon(point, boundary.polygon)) {
      matches.push(boundary.region_key);
    }
  }

  if (matches.length === 1) {
    return {
      status: "assigned",
      region_key: matches[0],
      matches,
      reason: "exactly one polygon contains the point",
    };
  }

  if (matches.length === 0) {
    return {
      status: "unresolved_boundary",
      region_key: null,
      matches,
      reason: "no polygon contains the point; nearest-centroid fallback is forbidden",
    };
  }

  // Multiple matches — ambiguous
  return {
    status: "unresolved_boundary",
    region_key: null,
    matches,
    reason: `${matches.length} polygons contain the point; nearest-centroid fallback is forbidden`,
  };
}

/**
 * Validate that a GeoJSON-like feature set uses EPSG:4326 and has
 * required sig_cd / sig_kor_nm properties.
 *
 * @param {object} featureCollection - GeoJSON FeatureCollection
 * @returns {{ valid: boolean, errors: string[], feature_count: number }}
 */
function validateFeatureCollection(featureCollection) {
  const errors = [];

  if (!featureCollection || typeof featureCollection !== "object") {
    return { valid: false, errors: ["featureCollection must be an object"], feature_count: 0 };
  }

  if (featureCollection.type !== "FeatureCollection") {
    errors.push("type must be FeatureCollection");
  }

  const features = featureCollection.features;
  if (!Array.isArray(features)) {
    errors.push("features must be an array");
    return { valid: false, errors, feature_count: 0 };
  }

  const seenCodes = new Set();

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const label = `features[${i}]`;

    if (!f || f.type !== "Feature") {
      errors.push(`${label}: type must be Feature`);
      continue;
    }

    const props = f.properties || {};

    // sig_cd required, 5-digit sigungu code
    if (!props.sig_cd || typeof props.sig_cd !== "string") {
      errors.push(`${label}: missing sig_cd`);
    } else {
      if (seenCodes.has(props.sig_cd)) {
        errors.push(`${label}: duplicate sig_cd "${props.sig_cd}"`);
      }
      seenCodes.add(props.sig_cd);
    }

    // sig_kor_nm required
    if (!props.sig_kor_nm || typeof props.sig_kor_nm !== "string") {
      errors.push(`${label}: missing sig_kor_nm`);
    }

    // geometry required
    if (!f.geometry || !f.geometry.type) {
      errors.push(`${label}: missing geometry`);
    } else if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") {
      errors.push(`${label}: geometry type must be Polygon or MultiPolygon`);
    }
  }

  return { valid: errors.length === 0, errors, feature_count: features.length };
}

module.exports = Object.freeze({
  pointInPolygon,
  pointInRing,
  assignPoint,
  validateFeatureCollection,
});
