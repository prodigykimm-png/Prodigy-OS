"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const boundaryCore = require(path.join(ROOT, "SYSTEM/SCRIPTS/region-admin-boundary-core.js"));
const vworldBoundary = require(path.join(ROOT, "SYSTEM/SCRIPTS/collectors/vworld-boundary.js"));

// --- WFS Contract Completeness ---

test("vworld-boundary: WFS query has all frozen parameters", () => {
  const q = vworldBoundary.WFS_QUERY;
  assert.equal(q.SERVICE, "WFS");
  assert.equal(q.VERSION, "1.1.0");
  assert.equal(q.REQUEST, "GetFeature");
  assert.equal(q.TYPENAME, "lt_c_adsigg_info");
  assert.equal(q.OUTPUT, "application/json");
  assert.equal(q.SRSNAME, "EPSG:4326");
  assert.equal(q.MAXFEATURES, "1000");
});

test("vworld-boundary: EPSG:4326 is the only allowed CRS", () => {
  assert.equal(vworldBoundary.REQUIRED_CRS, "EPSG:4326");
  assert.equal(vworldBoundary.WFS_QUERY.SRSNAME, "EPSG:4326");
});

test("vworld-boundary: PAGE and BBOX are forbidden", () => {
  assert.ok(vworldBoundary.FORBIDDEN_PARAMS.includes("PAGE"));
  assert.ok(vworldBoundary.FORBIDDEN_PARAMS.includes("BBOX"));
});

test("vworld-boundary: validateQuery rejects PAGE parameter", () => {
  const query = { ...vworldBoundary.WFS_QUERY, PAGE: "2" };
  const errors = vworldBoundary.validateQuery(query);
  assert.ok(errors.some((e) => e.includes("PAGE")));
});

test("vworld-boundary: validateQuery rejects BBOX parameter", () => {
  const query = { ...vworldBoundary.WFS_QUERY, BBOX: "126,37,127,38" };
  const errors = vworldBoundary.validateQuery(query);
  assert.ok(errors.some((e) => e.includes("BBOX")));
});

test("vworld-boundary: validateQuery rejects wrong SRSNAME", () => {
  const query = { ...vworldBoundary.WFS_QUERY, SRSNAME: "EPSG:3857" };
  const errors = vworldBoundary.validateQuery(query);
  assert.ok(errors.some((e) => e.includes("SRSNAME")));
});

test("vworld-boundary: validateQuery accepts valid query with KEY and DOMAIN", () => {
  const query = { ...vworldBoundary.WFS_QUERY, KEY: "test-key", DOMAIN: "test-domain" };
  const errors = vworldBoundary.validateQuery(query);
  assert.equal(errors.length, 0);
});

test("vworld-boundary: validateQuery accepts exact frozen query", () => {
  const errors = vworldBoundary.validateQuery(vworldBoundary.WFS_QUERY);
  assert.equal(errors.length, 0);
});

test("vworld-boundary: adapter reports blocked_fixture with zero network", () => {
  const state = vworldBoundary.adapterState();
  assert.equal(state.provider, "admin_boundary_vworld");
  assert.equal(state.status, "blocked_fixture");
  assert.equal(state.network_allowed, false);
  assert.equal(state.network_dispatched, false);
  assert.equal(state.request_count, 0);
  assert.ok(state.missing_gate.includes("complete-code fixture"));
  assert.ok(state.missing_gate.includes("PAGE/BBOX absent"));
});

test("vworld-boundary: collect returns blocked with zero network", () => {
  const result = vworldBoundary.collect();
  assert.equal(result.status, "blocked_fixture");
  assert.equal(result.network_dispatched, false);
  assert.equal(result.collected_at, null);
});

// --- Point-in-Polygon ---

test("boundary-core: point inside simple square polygon", () => {
  const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
  assert.equal(boundaryCore.pointInPolygon([5, 5], square), true);
});

test("boundary-core: point outside simple square polygon", () => {
  const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
  assert.equal(boundaryCore.pointInPolygon([15, 5], square), false);
});

test("boundary-core: point in hole is excluded", () => {
  const withHole = [
    [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]],
    [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]],
  ];
  assert.equal(boundaryCore.pointInPolygon([10, 10], withHole), false);
  assert.equal(boundaryCore.pointInPolygon([2, 2], withHole), true);
});

// --- Boundary Assignment ---

test("boundary-core: exactly one match → auto assign", () => {
  const boundaries = [
    { region_key: "서울특별시-종로구", polygon: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    { region_key: "서울특별시-중구", polygon: [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]] },
  ];

  const result = boundaryCore.assignPoint([5, 5], boundaries);
  assert.equal(result.status, "assigned");
  assert.equal(result.region_key, "서울특별시-종로구");
  assert.equal(result.matches.length, 1);
});

test("boundary-core: zero matches → unresolved_boundary (no nearest-centroid)", () => {
  const boundaries = [
    { region_key: "서울특별시-종로구", polygon: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
  ];

  const result = boundaryCore.assignPoint([50, 50], boundaries);
  assert.equal(result.status, "unresolved_boundary");
  assert.equal(result.region_key, null);
  assert.ok(result.reason.includes("nearest-centroid"));
  assert.ok(result.reason.includes("forbidden"));
});

test("boundary-core: multiple matches → unresolved_boundary (no nearest-centroid)", () => {
  // Two overlapping polygons both containing the point
  const boundaries = [
    { region_key: "서울특별시-종로구", polygon: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    { region_key: "서울특별시-중구", polygon: [[[3, 3], [13, 3], [13, 13], [3, 13], [3, 3]]] },
  ];

  const result = boundaryCore.assignPoint([5, 5], boundaries);
  assert.equal(result.status, "unresolved_boundary");
  assert.equal(result.region_key, null);
  assert.equal(result.matches.length, 2);
  assert.ok(result.reason.includes("nearest-centroid"));
  assert.ok(result.reason.includes("forbidden"));
});

test("boundary-core: NEVER uses nearest-centroid fallback", () => {
  // Point is far from all polygons — must NOT assign to nearest
  const boundaries = [
    { region_key: "A", polygon: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    { region_key: "B", polygon: [[[100, 100], [101, 100], [101, 101], [100, 101], [100, 100]]] },
  ];

  const result = boundaryCore.assignPoint([50, 50], boundaries);
  assert.equal(result.status, "unresolved_boundary");
  assert.equal(result.region_key, null);
});

// --- Feature Collection Validation ---

test("boundary-core: validateFeatureCollection checks sig_cd and sig_kor_nm", () => {
  const valid = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { sig_cd: "11110", sig_kor_nm: "종로구" },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      },
    ],
  };

  const result = boundaryCore.validateFeatureCollection(valid);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.feature_count, 1);
});

test("boundary-core: validateFeatureCollection rejects missing sig_cd", () => {
  const invalid = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { sig_kor_nm: "종로구" },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      },
    ],
  };

  const result = boundaryCore.validateFeatureCollection(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("sig_cd")));
});

test("boundary-core: validateFeatureCollection rejects duplicate sig_cd", () => {
  const dup = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { sig_cd: "11110", sig_kor_nm: "종로구" },
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      },
      {
        type: "Feature",
        properties: { sig_cd: "11110", sig_kor_nm: "종로구2" },
        geometry: { type: "Polygon", coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
      },
    ],
  };

  const result = boundaryCore.validateFeatureCollection(dup);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate sig_cd")));
});
