#!/usr/bin/env node
/**
 * 리서치 패키지 transport_life 재구축
 * crosswalk 데이터에서 직접 인용하는 transport_life를 생성한다.
 * 사용법: node SYSTEM/SCRIPTS/research-transport-rebuild.js [--dry-run]
 */
"use strict";
const fs = require("fs");
const path = require("path");

const VAULT = process.cwd();
const RESEARCH_DIR = path.join(VAULT, "SYSTEM/CACHE/region-research-packages");
const TRANSIT_PKG_DIR = path.join(VAULT, "SYSTEM/CACHE/region-transit-packages");
const DRY_RUN = process.argv.includes("--dry-run");

// Load seoul crosswalk for source_url lookup
const seoulMap = JSON.parse(fs.readFileSync(path.join(VAULT, "SYSTEM/CACHE/region-transit/station-district-map-seoul.json"), "utf8"));
const stationByUrl = new Map();
for (const st of seoulMap.stations) {
  stationByUrl.set(st.station_no, st);
}

function buildTransportLife(transitPkg, transitSourceId) {
  // Group stations by line_name
  const byLine = {};
  for (const st of transitPkg.stations) {
    if (!byLine[st.line_name]) byLine[st.line_name] = [];
    byLine[st.line_name].push(st);
  }

  const facts = [];
  for (const [lineName, stations] of Object.entries(byLine)) {
    const names = stations.map(s => s.station_name).join("·");
    facts.push({
      fact: lineName + " " + stations.length + "개역: " + names,
      source_ids: [transitSourceId],
    });
  }
  return facts;
}

function nextSourceId(sources) {
  let max = 0;
  for (const s of sources) {
    const m = s.source_id.match(/^S(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return "S" + (max + 1);
}

function main() {
  const dirs = fs.readdirSync(RESEARCH_DIR).filter(d => d.startsWith("서울") || d.startsWith("경기"));
  let updated = 0, skipped = 0, failed = 0;
  const failures = [];

  for (const regionKey of dirs) {
    // Find transit package
    const transitDir = path.join(TRANSIT_PKG_DIR, regionKey);
    if (!fs.existsSync(transitDir)) { skipped++; continue; }
    const transitFiles = fs.readdirSync(transitDir).filter(f => f.startsWith("seoul-metro"));
    if (!transitFiles.length) { skipped++; continue; }
    const transitPkg = JSON.parse(fs.readFileSync(path.join(transitDir, transitFiles[0]), "utf8"));

    // Find research package
    const researchDir = path.join(RESEARCH_DIR, regionKey);
    const researchFiles = fs.readdirSync(researchDir).filter(f => f.endsWith(".json"));
    if (!researchFiles.length) { skipped++; continue; }
    const researchPath = path.join(researchDir, researchFiles[0]);
    const pkg = JSON.parse(fs.readFileSync(researchPath, "utf8"));

    try {
      // Build new transport_life from crosswalk
      const transitSourceId = nextSourceId(pkg.sources);
      const newTransport = buildTransportLife(transitPkg, transitSourceId);

      // Add transit source if not present
      const hasTransitSource = pkg.sources.some(s => s.institution && s.institution.includes("서울교통공사") && s.title.includes("crosswalk"));

      if (!hasTransitSource) {
        pkg.sources.push({
          source_id: transitSourceId,
          institution: "서울교통공사",
          title: "역별 정보 crosswalk — getStationInfo.do",
          url: "https://www.seoulmetro.co.kr/kr/getLineData.do",
          accessed_at: new Date().toISOString().slice(0, 10),
          source_type: "official_primary",
        });
      }

      // Replace transport_life
      pkg.transport_life = newTransport;

      // Update research_log
      if (!pkg.research_log) pkg.research_log = [];
      if (!Array.isArray(pkg.research_log)) pkg.research_log = [pkg.research_log];
      pkg.research_log.push({
        date: new Date().toISOString().slice(0, 10),
        action: "transport_life 재구축: crosswalk " + transitPkg.stations.length + "개역 직접 인용",
      });

      if (!DRY_RUN) {
        fs.writeFileSync(researchPath, JSON.stringify(pkg, null, 2));
      }
      updated++;
    } catch (e) {
      failed++;
      failures.push(regionKey + ": " + e.message.slice(0, 80));
    }
  }

  console.log(DRY_RUN ? "[DRY-RUN] " : "");
  console.log("업데이트:", updated, "| 스킵:", skipped, "| 실패:", failed);
  if (failures.length) {
    console.log("실패:");
    failures.slice(0, 10).forEach(f => console.log(" ", f));
  }
}

main();
