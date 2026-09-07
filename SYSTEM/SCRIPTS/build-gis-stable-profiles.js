import fs from 'node:fs';

const [profilesPath, poiPath, linesPath, buildingsPath, outputPath] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const poi = JSON.parse(fs.readFileSync(poiPath, 'utf8')).by_admin_dong;
const lines = JSON.parse(fs.readFileSync(linesPath, 'utf8')).by_admin_dong;
const buildings = JSON.parse(fs.readFileSync(buildingsPath, 'utf8')).by_admin_dong;
const axes = ['city_role', 'district_role', 'urban_form', 'transport_structure', 'daily_life_structure', 'housing_structure', 'demand_anchors', 'structural_risks'];

function named(group) { return group?.named || group?.names || []; }
function firstNames(group, limit = 4) { return named(group).filter(Boolean).slice(0, limit); }
function listText(values) { return values.length ? values.join('·') : '명명 시설 없음'; }

const boundaryCollection = JSON.parse(fs.readFileSync(process.env.BUSAN_BOUNDARIES_PATH || 'PARA/RESOURCES/Auction Regions/busan-admin-dong-boundaries.geojson', 'utf8'));
const boundaryByKey = Object.fromEntries(boundaryCollection.features.map((feature) => [feature.properties.key, feature.properties]));

for (const profile of data.profiles) {
  if (profile.stable_profile?.status === 'complete') continue;
  const key = profile.key;
  const p = poi[key] || {};
  const l = lines[key] || {};
  const b = buildings[key] || {};
  const stations = firstNames(p.station);
  const daily = [...firstNames(p.marketplace, 3), ...firstNames(p.supermarket, 3), ...firstNames(p.hospital, 3), ...firstNames(p.park, 3)];
  const schools = firstNames(p.school, 5);
  const highways = firstNames(l.highway, 5);
  const railways = firstNames(l.railway, 3);
  const waterways = firstNames(l.waterway, 3);
  const apartmentCount = (b.apartments || 0) + (b.residential || 0);
  const lowRiseCount = (b.house || 0);
  const commercialCount = (b.commercial || 0) + (b.retail || 0);
  const industrialCount = b.industrial || 0;
  const buildingObservationCount = apartmentCount + lowRiseCount + commercialCount + industrialCount;
  const buildingCoverage = b.coverage === true && buildingObservationCount > 0;
  const priorHousing = profile.stable_profile?.housing_structure || profile.deep_profile?.housing_stock;
  const priorHousingText = priorHousing?.text || '';
  const priorHousingSources = Array.isArray(priorHousing?.sources) ? priorHousing.sources : [];
  const priorHousingEnough = priorHousingSources.length > 0 && !/아직 연결되지 않았다|확인한 공식 자료가 아직/u.test(priorHousingText);
  const housingEvidence = buildingCoverage || priorHousingEnough;
  const zones = (profile.stable_profile?.micro_zones || []).filter((zone) => zone?.name && zone?.text).map((zone) => ({ name: zone.name, text: zone.text }));
  if (stations.length || railways.length) zones.push({ name: '철도·역 접면권', text: `${listText([...stations, ...railways])} 주변의 철도 접근 및 소음·보행 단절 확인 권역` });
  if (highways.length) zones.push({ name: '주요도로 접면권', text: `${listText(highways)} 접면의 차량 접근·소음·보행 조건 확인 권역` });
  if (waterways.length) zones.push({ name: '하천 접면권', text: `${listText(waterways)} 주변의 수변 접근·배수·침수 확인 권역` });
  if (daily.length || schools.length) zones.push({ name: '생활시설 배후권', text: `${listText([...daily, ...schools].slice(0, 8))}을 이용하는 주거 배후권` });
  if (buildingCoverage && (apartmentCount || lowRiseCount)) zones.push({ name: apartmentCount >= lowRiseCount ? '공동주택 우세권' : '저층주거 우세권', text: `OSM 건축물 태그상 공동주택계 ${apartmentCount}, 단독주택 ${lowRiseCount}로 관측되는 주거 조직` });
  if (buildingCoverage && (commercialCount || industrialCount)) zones.push({ name: industrialCount > commercialCount ? '산업시설 접면권' : '상업시설 접면권', text: `OSM 건축물 태그상 상업계 ${commercialCount}, 산업 ${industrialCount}로 관측되는 비주거 접면` });
  const uniqueZones = zones.filter((zone, index) => zones.findIndex((candidate) => candidate.name === zone.name) === index);
  const boundaryFallback = /fallback/u.test(boundaryByKey[key]?.source || '');
  const evidenceEnough = uniqueZones.length >= 2 && (highways.length + railways.length + stations.length + daily.length + schools.length >= 2) && housingEvidence && !boundaryFallback;
  if (!evidenceEnough) {
    profile.stable_profile ||= {};
    profile.stable_profile.gis_gap = { zones: uniqueZones.length, named_features: highways.length + railways.length + stations.length + daily.length + schools.length, building_stats: buildingCoverage, prior_housing: priorHousingEnough, boundary_fallback: boundaryFallback };
    continue;
  }
  const sourceIds = ['OSM-BOUNDARY-2026-08-30', 'OSM-POI-2026-08-30', 'OSM-LINES-2026-08-30', 'OSM-BUILDINGS-2026-08-30'];
  const item = (text) => ({ text, sources: sourceIds, status: 'data_inference' });
  const originalRole = profile.deep_profile?.district_role?.text || `${profile.admin_dong}은 ${profile.region_sigungu}의 행정동이다.`;
  const stable = {
    schema_version: 1,
    contract: 'SYSTEM/docs/Auction_Admin_Dong_Stable_Profile_Contract_v1.md',
    status: 'complete',
    city_role: item(`${profile.admin_dong}은 부산광역시 ${profile.region_sigungu}에서 철도·역 ${listText([...stations, ...railways])}, 주요도로 ${listText(highways)}, 생활거점 ${listText([...daily, ...schools].slice(0, 5))}가 결합한 행정동이다.`),
    district_role: item(`${profile.admin_dong}은 ${profile.region_sigungu} 안에서 ${listText(uniqueZones.slice(0, 3).map((zone) => zone.name))}이 결합하고, ${listText([...stations, ...highways, ...daily, ...schools].slice(0, 4))}를 주요 공간 기준으로 삼는 생활권이다.`),
    urban_form: item(`주요도로 ${listText(highways)}, 철도 ${listText(railways)}, 하천 ${listText(waterways)}와 주거·상업·산업 건축물 분포가 결합한 도시조직이다.`),
    transport_structure: item(`철도·역 ${listText([...stations, ...railways])}, 주요도로 ${listText(highways)}가 장기 교통 골격을 이룬다.`),
    daily_life_structure: item(`시장·마트·병원·공원·학교 중 ${listText([...daily, ...schools].slice(0, 10))}이 OSM에 등록된 생활시설 골격이다.`),
    housing_structure: item(buildingCoverage ? `OSM 건축물 태그 기준 공동주택계 ${apartmentCount}, 단독주택 ${lowRiseCount}, 상업계 ${commercialCount}, 산업 ${industrialCount}가 관측된다. 태그 누락 가능성이 있어 상대 비교용으로만 사용한다.` : `${profile.admin_dong}의 기존 공식·공공 연결 주택 근거는 다음과 같다: ${priorHousingText} GIS 미시권역별 실제 건물 유형은 주소에서 재확인한다.`),
    demand_anchors: item(`역·철도 ${listText([...stations, ...railways])}와 생활시설 ${listText([...daily, ...schools].slice(0, 8))}이 지속 수요를 확인할 장기 거점이다.`),
    structural_risks: item(`${listText(highways)}의 교통소음·보행 단절, ${listText(railways)}의 철도 접면, ${listText(waterways)}의 배수·침수 가능성을 주소별로 확인한다.`),
    micro_zones: uniqueZones.slice(0, 5).map((zone) => ({ ...zone, sources: sourceIds })),
    property_type_notes: { apartment: '공동주택은 역·도로·학교·공원 접근과 소음·주차·관리상태를 비교한다.', low_rise: '저층주택·빌라는 도로접면·차량·소방 접근·주차와 하천·철도 접면을 확인한다.', officetel: '오피스텔은 역·업무·생활시설 접근과 야간 소음·보행환경을 확인한다.', retail: '상가는 주요도로·역·시장 접면, 가시성·하역·시간대별 유동을 확인한다.' },
    field_checks: ['대상 주소가 어느 GIS 미시권역에 속하는가?', '차량·소방차·이삿짐 차량이 현관까지 접근 가능한가?', '도로·철도·하천·시장 소음과 배수 조건은 어떠한가?', 'OSM 태그와 실제 건축물·생활시설 분포가 일치하는가?'],
    sources: [
      { id: sourceIds[0], grade: 'B', title: 'OpenStreetMap Nominatim 행정동 경계', url: 'https://nominatim.openstreetmap.org/', checked_at: '2026-08-30' },
      { id: sourceIds[1], grade: 'B', title: 'OpenStreetMap Overpass 생활·교통 POI', url: 'https://overpass-api.de/', checked_at: '2026-08-30' },
      { id: sourceIds[2], grade: 'B', title: 'OpenStreetMap Overpass 주요도로·철도·하천', url: 'https://overpass-api.de/', checked_at: '2026-08-30' },
      { id: sourceIds[3], grade: 'B', title: 'OpenStreetMap Overpass 건축물 유형 태그 집계', url: 'https://overpass-api.de/', checked_at: '2026-08-30' }
    ],
    researched_at: '2026-08-30', review_due: '2027-08-30', unknowns: ['OSM 누락·오분류 가능성', '개별 필지 경사·도로 폭·주차·소음·침수 흔적']
  };
  profile.stable_profile = stable;
}
const counts = data.profiles.reduce((acc, profile) => { const status = profile.stable_profile?.status || 'unresearched'; acc[status] = (acc[status] || 0) + 1; return acc; }, {});
data.stable_profile_status_counts = counts;
fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`GIS_PROFILES_READY ${JSON.stringify(counts)}`);
