#!/usr/bin/env node
/**
 * 서울교통공사 역별 좌표 수집 스크립트
 * getStationInfo.do에서 LatLng 좌표를 추출하고 raw HTML을 저장한다.
 * 사용법: node SYSTEM/SCRIPTS/seoul-metro-collect.js [--limit N]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const VAULT = path.resolve(__dirname, "../..");
const RAW_DIR = path.join(VAULT, "SYSTEM/CACHE/region-transit/raw/seoul-metro");
const STATIONS_FILE = "/tmp/seoul_stations.json";
const OUTPUT_FILE = "/tmp/seoul_metro_coords.json";
const PROGRESS_FILE = "/tmp/seoul_metro_progress.json";

const DELAY_MS = 1200;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { rejectUnauthorized: false, headers: { "User-Agent": "Mozilla/5.0 (ProdigyOS crosswalk builder)" }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function extractLatLng(html) {
  const m = html.match(/LatLng\(Number\("([^"]+)"\),\s*Number\("([^"]+)"\)\)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

async function main() {
  const stations = JSON.parse(fs.readFileSync(STATIONS_FILE, "utf8"));
  console.log("총 역:", stations.length, "| 제한:", LIMIT === Infinity ? "없음" : LIMIT);

  // Load progress if exists
  let done = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    done = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    console.log("이전 진행:", Object.keys(done).length, "개 완료");
  }

  const results = [];
  let collected = 0, failed = 0, skipped = 0;

  for (let i = 0; i < Math.min(stations.length, LIMIT); i++) {
    const st = stations[i];
    const key = st.cd;

    if (done[key]) {
      results.push(done[key]);
      skipped++;
      continue;
    }

    const url = "https://www.seoulmetro.co.kr/kr/getStationInfo.do?action=info&stationId=" + st.cd;
    try {
      const html = await fetch(url);
      const coord = extractLatLng(html);

      // Save raw HTML
      const dir = path.join(RAW_DIR, st.lineId);
      fs.mkdirSync(dir, { recursive: true });
      const rawPath = path.join(dir, st.cd + ".html");
      fs.writeFileSync(rawPath, html);
      const sha = crypto.createHash("sha256").update(html).digest("hex");

      const entry = {
        station_name: st.name + (st.name.endsWith("역") ? "" : "역"),
        station_no: st.cd,
        line_name: st.lineLabel,
        operator: "서울교통공사",
        lat: coord ? coord.lat : null,
        lng: coord ? coord.lng : null,
        source_url: url,
        raw_sha256: sha,
        raw_path: "raw/seoul-metro/" + st.lineId + "/" + st.cd + ".html",
        verified_at: new Date().toISOString().slice(0, 10),
      };
      results.push(entry);
      done[key] = entry;
      collected++;

      if (collected % 10 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(done, null, 2));
        console.log("진행:", collected + skipped, "/", stations.length, "| 실패:", failed);
      }
    } catch (err) {
      failed++;
      console.error("실패:", st.cd, st.name, err.message);
      done[key] = { station_name: st.name, station_no: st.cd, line_name: st.lineLabel, operator: "서울교통공사", lat: null, lng: null, error: err.message };
      results.push(done[key]);
    }

    await sleep(DELAY_MS);
  }

  // Final save
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(done, null, 2));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log("\n=== 완료 ===");
  console.log("수집:", collected, "| 스킵:", skipped, "| 실패:", failed);
  console.log("출력:", OUTPUT_FILE);
}

main().catch((e) => { console.error(e); process.exit(1); });
