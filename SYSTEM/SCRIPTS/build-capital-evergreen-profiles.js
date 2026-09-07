import fs from 'node:fs';

const [boundaryPath, spatialPath, outputPath] = process.argv.slice(2);
const boundaries = JSON.parse(fs.readFileSync(boundaryPath, 'utf8'));
const spatial = JSON.parse(fs.readFileSync(spatialPath, 'utf8')).by_admin_dong;
const sourceIds = ['SGIS-ADMIN-BOUNDARY-2026-07-01', 'OSM-SPATIAL-JOIN'];
function readableName(name) { return name && !/[.;]/u.test(name) && !/^\d+(?:[;,:-]\d+)*$/u.test(name) && !/(?:건널목|분기점|회차로|로터리|구역|진입로|진출로|지하차도|고가차도|고가도로|지하도로|터널|육교|\d*교|IC|JC|폭포)$/iu.test(name); }
function displayDistrict(value) { return value.replace(/^(.+시)([^시]+구)$/u, '$1 $2'); }
function names(row, key, max, predicate = () => true, sorter = () => 0) { return [...new Map((row?.[key] || []).filter(predicate).sort(sorter).map((item) => [item.name, item])).values()].map((item) => item.name).filter(readableName).slice(0, max); }
const ROAD_RANK = Object.freeze({ primary: 0, trunk: 1, secondary: 2, motorway: 3 });
function roadSort(a, b) { const rank = (ROAD_RANK[a.tags?.highway] ?? 9) - (ROAD_RANK[b.tags?.highway] ?? 9); if (rank) return rank; return Number(/(?:번길|길)$/u.test(a.name)) - Number(/(?:번길|길)$/u.test(b.name)); }
function join(values) { return values.filter(Boolean).join('·'); }
function subjectParticle(value) { const char = value.at(-1), code = char?.charCodeAt(0); return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 ? '을' : '를'; }
function nominativeParticle(value) { const char = value.at(-1), code = char?.charCodeAt(0); return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 ? '이' : '가'; }
function conjunction(value) { const char = value.at(-1), code = char?.charCodeAt(0); return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 ? '과' : '와'; }
function roadNetworkLabel(values) { const value = join(values); return `${value}${/도로$/u.test(value) ? '망' : ' 도로망'}`; }
function roadAxisLabel(values) { const value = join(values); return `${value}${/도로$/u.test(value) ? ' 구간' : ' 도로축'}`; }
function sentence(value) { return /[.!?]$/u.test(value) ? value : `${value}.`; }
function item(text) { return { text: sentence(text), sources: sourceIds, status: 'data_inference' }; }
function fit(text, max = 90) { return text.length <= max ? text : `${text.slice(0, max - 1).replace(/[·,\s]+[^·,\s]*$/u, '')}.`; }
const profiles = boundaries.features.map((feature) => {
  const p = feature.properties; const row = spatial[p.key] || {};
  const roads = names(row, 'highways', 1, (item) => ['trunk', 'primary', 'secondary'].includes(item.tags?.highway), roadSort);
  const stations = names(row, 'stations', 1, (item) => ['station', 'halt'].includes(item.tags?.railway));
  const rails = names(row, 'railways', 1, (item) => /(?:호선|선|철도)$/u.test(item.name) && !/(?:고속|화물|기지|인상|부두)/u.test(item.name)).filter((name) => !stations.includes(name));
  const waters = names(row, 'waterways', 1, (item) => !/(?:벽천|분수|수로)$/u.test(item.name)), parks = names(row, 'parks', 1, (item) => !/(?:어린이|소공원)/u.test(item.name)), markets = names(row, 'markets', 1, (item) => /(?:시장|장터)$/u.test(item.name));
  const anchors = [...waters, ...rails, ...roads].slice(0, 2);
  const districtLabel = displayDistrict(p.sigungu);
  const administrativeCharacter = /(?:읍|면)$/u.test(p.admin_dong) ? `${districtLabel}의 읍·면 생활권` : `${districtLabel} 안의 독립 행정동 생활권`;
  const identity = anchors.length ? `${p.admin_dong}은 ${join(anchors)}${subjectParticle(join(anchors))} 중심으로 읽는 ${districtLabel} 생활권이다` : `${p.admin_dong}은 ${administrativeCharacter}이다`;
  const spatialParts = [];
  if (waters.length) spatialParts.push(`${join(waters)} 수변 경계`);
  if (roads.length) spatialParts.push(roadAxisLabel(roads));
  if (rails.length) spatialParts.push(`${join(rails)} 철도축`);
  else if (stations.length) spatialParts.push(`${join(stations)}역권`);
  const spatialText = spatialParts.length ? `${p.admin_dong}의 공간 골격은 ${spatialParts.slice(0, 3).join(' · ')}에 따라 형성된다` : `${p.admin_dong}은 확인된 명명 광역축이 적어 내부 도로망을 주소별로 본다`;
  const mobilityParts = [];
  if (stations.length) mobilityParts.push(`${join(stations)}역권`);
  else if (rails.length) mobilityParts.push(`${join(rails)} 철도축`);
  if (roads.length) mobilityParts.push(roadNetworkLabel(roads));
  const mobility = mobilityParts.length ? `${p.admin_dong}의 이동 골격은 ${mobilityParts.join(' · ')}이다` : `${p.admin_dong} 안에서 확인된 명명 광역 교통축은 없다`;
  const cautions = [];
  if (rails.length) cautions.push('철도 접면과 단절');
  if (roads.length) cautions.push('간선도로 횡단과 소음');
  if (waters.length) cautions.push('하천변 배수');
  const cautionText = cautions.length ? `${districtLabel} ${p.admin_dong}의 구조적 주의 요소는 ${cautions.slice(0, 2).join(' · ')}이다` : `${districtLabel} ${p.admin_dong}은 내부 도로 폭과 경계부 접근을 확인한다`;
  const rendered = { identity: fit(identity), spatial_structure: fit(spatialText), mobility_structure: fit(mobility), structural_cautions: fit(cautionText) };
  const allRenderedText = Object.values(rendered).join(' ');
  const usedEvidence = Object.fromEntries(Object.entries({ roads, stations, rails, waters, parks, markets }).map(([key, values]) => [key, values.filter((name) => allRenderedText.includes(name))]));
  return {
    key: p.key, region_sido: p.sido, region_sigungu: p.sigungu, admin_dong: p.admin_dong, admin_code: p.admin_code,
    stable_profile: {
      schema_version: 1, status: 'complete', contract: 'SYSTEM/docs/Auction_Admin_Dong_Stable_Profile_Contract_v1.md',
      evergreen_summary: { schema_version: 1, identity: item(rendered.identity), spatial_structure: item(rendered.spatial_structure), mobility_structure: item(rendered.mobility_structure), structural_cautions: item(rendered.structural_cautions), evidence_names: usedEvidence, excluded: ['주택재고·세대수·노후도', '개별 생활시설 영업', '가격·거래·인구', '개발·교통 계획 단계'], generated_at: '2026-08-30', editorial_review: { method: 'deterministic spatial projection', status: 'pass' } },
      sources: [
        { id: sourceIds[0], grade: 'A', url: boundaries.source_url, checked_at: '2026-08-30' },
        { id: sourceIds[1], grade: 'B', url: 'https://www.openstreetmap.org/', checked_at: '2026-08-30' }
      ], unknowns: ['개별 주소의 도로 폭·경사·소음·침수']
    }
  };
});
fs.writeFileSync(outputPath, `${JSON.stringify({ schema_version: 1, generated_at: '2026-08-30', profiles }, null, 2)}\n`);
console.log(`CAPITAL_PROFILES_READY count=${profiles.length}`);
