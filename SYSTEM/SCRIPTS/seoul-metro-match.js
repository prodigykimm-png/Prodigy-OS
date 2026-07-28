#!/usr/bin/env node
/**
 * 서울교통공사 좌표 후보 → 행정구역 매칭용 보조 스크립트
 * 입력: /tmp/seoul_metro_coords.json (수집 스크립트 출력)
 * 출력: SYSTEM/CACHE/region-transit/station-district-map-seoul.json
 * 사용 중지: 기존 구현은 시군구 중심점 최근접 매칭을 사용했고,
 * 경계 근처·광역 구간 역을 잘못 배정할 수 있어 crosswalk 생성에 쓰면 안 된다.
 * 향후 공식 시군구 경계 GeoJSON을 이용한 point-in-polygon importer로 교체한다.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VAULT = path.resolve(__dirname, "../..");
const COORDS_FILE = "/tmp/seoul_metro_coords.json";
const DISTRICTS_FILE = "/tmp/district_centers.json";
const OUTPUT_FILE = path.join(VAULT, "SYSTEM/CACHE/region-transit/station-district-map-seoul.json");
const HASHES_FILE = path.join(VAULT, "SYSTEM/CACHE/region-transit/hashes.json");

// Haversine distance (km)
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchDistrict(lat, lng, districts) {
  let best = null, bestDist = Infinity;
  for (const d of districts) {
    const dist = distKm(lat, lng, d.lat, d.lng);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return { region_key: best.region_key, distance_km: Math.round(bestDist * 100) / 100 };
}

function main() {
  throw new Error("서울·경기 후보 crosswalk는 격리 상태입니다. 공식 행정경계 GeoJSON 기반 point-in-polygon importer가 준비되기 전에는 실행할 수 없습니다.");
  const coords = JSON.parse(fs.readFileSync(COORDS_FILE, "utf8"));
  const districts = JSON.parse(fs.readFileSync(DISTRICTS_FILE, "utf8"));

  console.log("입력 역:", coords.length);
  console.log("행정구역:", districts.length);

  const stations = [];
  let matched = 0, noCoord = 0, outOfScope = 0;

  for (const st of coords) {
    if (!st.lat || !st.lng) {
      noCoord++;
      continue;
    }

    const { region_key, distance_km } = matchDistrict(st.lat, st.lng, districts);

    // Filter: only Seoul/Gyeonggi
    if (!region_key.startsWith("서울특별시-") && !region_key.startsWith("경기도-")) {
      outOfScope++;
      continue;
    }

    // Verify raw file exists
    const rawFullPath = path.join(VAULT, "SYSTEM/CACHE/region-transit", st.raw_path);
    let rawSha = st.raw_sha256 || null;
    if (fs.existsSync(rawFullPath)) {
      const rawContent = fs.readFileSync(rawFullPath);
      rawSha = crypto.createHash("sha256").update(rawContent).digest("hex");
    }

    stations.push({
      station_name: st.station_name,
      station_no: st.station_no,
      line_name: st.line_name,
      operator: "서울교통공사",
      official_address: "좌표: " + st.lat.toFixed(6) + ", " + st.lng.toFixed(6),
      region_key: region_key,
      source_url: st.source_url,
      raw_sha256: rawSha,
      verified_at: st.verified_at,
      raw_path: st.raw_path,
      match_distance_km: distance_km,
    });
    matched++;
  }

  // Build crosswalk JSON
  const mapContent = JSON.stringify({
    schema_version: 1,
    provider: "seoul-metro",
    created: new Date().toISOString().slice(0, 10),
    station_count: stations.length,
    stations: stations,
  }, null, 2);

  const mapSha = crypto.createHash("sha256").update(mapContent).digest("hex");
  fs.writeFileSync(OUTPUT_FILE, mapContent);

  // Update hashes.json
  let hashes = {};
  if (fs.existsSync(HASHES_FILE)) {
    hashes = JSON.parse(fs.readFileSync(HASHES_FILE, "utf8"));
  }
  hashes["station-district-map-seoul.json"] = mapSha;
  // Add raw file hashes
  for (const st of stations) {
    if (st.raw_sha256) {
      hashes[st.raw_path] = st.raw_sha256;
    }
  }
  fs.writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2));

  // Report
  console.log("\n=== 매칭 완료 ===");
  console.log("매칭 성공:", matched);
  console.log("좌표 없음:", noCoord);
  console.log("서울·경기 외:", outOfScope);
  console.log("출력:", OUTPUT_FILE);
  console.log("Map SHA-256:", mapSha.slice(0, 16) + "...");

  // Region distribution
  const dist = {};
  stations.forEach(s => { dist[s.region_key] = (dist[s.region_key] || 0) + 1; });
  console.log("\nregion_key별 분포:");
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(" ", k, v));
}

main();
