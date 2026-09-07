import fs from 'node:fs';

const [profilesPath, outputPath] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
const requiredAxes = ['city_role', 'district_role', 'urban_form', 'transport_structure', 'daily_life_structure', 'housing_structure', 'demand_anchors', 'structural_risks'];
const volatile = /20\d{2}년|조합설립|사업시행|관리처분|입주 예정|매매가|전세가|월세|거래량|공실률/u;
const generic = /추가 공식 자료|아직 연결되지 않았다|확인이 필요하다|미식별권|미확인권/u;
const issues = [];
const exact = new Map();
for (const profile of data.profiles) {
  const stable = profile.stable_profile || {};
  if (stable.status !== 'complete') {
    issues.push({ key: profile.key, kind: 'status', detail: stable.status || 'missing' });
    continue;
  }
  for (const axis of requiredAxes) {
    const text = stable[axis]?.text || '';
    if (!text) issues.push({ key: profile.key, kind: 'missing_axis', detail: axis });
    if (volatile.test(text)) issues.push({ key: profile.key, kind: 'volatile', detail: axis });
    if (generic.test(text)) issues.push({ key: profile.key, kind: 'generic', detail: axis });
    const signature = `${axis}:${text}`;
    if (text) {
      const rows = exact.get(signature) || [];
      rows.push(profile.key); exact.set(signature, rows);
    }
  }
  if (!Array.isArray(stable.micro_zones) || stable.micro_zones.length < 2) issues.push({ key: profile.key, kind: 'micro_zones', detail: stable.micro_zones?.length || 0 });
  const urls = new Set((stable.sources || []).filter((source) => ['A', 'B'].includes(source.grade) && /^https?:\/\//u.test(source.url || '')).map((source) => source.url));
  if (urls.size < 2) issues.push({ key: profile.key, kind: 'sources', detail: urls.size });
}
for (const [signature, keys] of exact.entries()) if (keys.length > 1) issues.push({ keys, kind: 'exact_duplicate', detail: signature.slice(0, 240) });
const byKind = issues.reduce((acc, issue) => { acc[issue.kind] = (acc[issue.kind] || 0) + 1; return acc; }, {});
const report = { audited_at: '2026-08-30', total: data.profiles.length, complete: data.profiles.filter((profile) => profile.stable_profile?.status === 'complete').length, issues: issues.length, by_kind: byKind, details: issues, self_feedback_questions: ['GIS 출처가 실제 행정동 경계와 일치하는가?', 'OSM 태그 누락을 사실 부재로 오인하지 않았는가?', '미시권역이 실제 주소 판별에 사용 가능한가?', '생활자 체감과 객관적 GIS 사실이 분리되어 있는가?', '완료 수를 높이기 위해 일반론을 재도입하지 않았는가?'] };
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`GIS_AUDIT_READY complete=${report.complete}/${report.total} issues=${report.issues} ${JSON.stringify(byKind)}`);
