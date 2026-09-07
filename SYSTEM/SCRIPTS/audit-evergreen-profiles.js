import fs from 'node:fs';

const [indexPath, reportPath, ...spatialArgs] = process.argv.slice(2);
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const spatialBySido = {};
for (const arg of spatialArgs) {
  const [sido, file] = arg.split('=', 2);
  spatialBySido[sido] = JSON.parse(fs.readFileSync(file, 'utf8')).by_admin_dong;
}
const fields = ['identity', 'spatial_structure', 'mobility_structure', 'structural_cautions'];
const volatile = /20\d{2}년|세대수|주택 재고|준공연도|가격|거래량|공실률|재개발 단계|재건축 단계|입주 예정/u;
const grammar = /철도과|도로과|배수을|로을|을을|를를|도로 도로축|철도 철도축/u;
const issues = [];
const exact = new Map();
for (const profile of index.profiles) {
  const summary = profile.stable_profile?.evergreen_summary;
  for (const field of fields) {
    const text = summary?.[field]?.text || '';
    if (!text) issues.push({ key: profile.key, kind: 'missing', field });
    if (text && !/[.!?]$/u.test(text)) issues.push({ key: profile.key, kind: 'missing_terminal_punctuation', field, text });
    if (text.length > 90) issues.push({ key: profile.key, kind: 'too_long', field, length: text.length });
    if (volatile.test(text)) issues.push({ key: profile.key, kind: 'volatile', field, text });
    if (grammar.test(text)) issues.push({ key: profile.key, kind: 'grammar', field, text });
    const duplicateKey = `${field}\0${text}`;
    if (!exact.has(duplicateKey)) exact.set(duplicateKey, []);
    exact.get(duplicateKey).push(profile.key);
  }
  if ((profile.stable_profile?.sources || []).length < 2) issues.push({ key: profile.key, kind: 'source_shortage' });
  const spatial = spatialBySido[profile.region_sido]?.[profile.key];
  if (spatial) {
    const evidence = summary.evidence_names;
    if (!evidence) issues.push({ key: profile.key, kind: 'missing_evidence_names' });
    else {
      const mapping = { roads: 'highways', stations: 'stations', rails: 'railways', waters: 'waterways', parks: 'parks', markets: 'markets' };
      const allText = fields.map((field) => summary[field].text).join(' ');
      for (const [evidenceKey, spatialKey] of Object.entries(mapping)) {
        const available = new Set((spatial[spatialKey] || []).map((item) => item.name));
        for (const name of evidence[evidenceKey] || []) {
          if (!available.has(name)) issues.push({ key: profile.key, kind: 'untraced_evidence', evidence_key: evidenceKey, name });
          if (!allText.includes(name)) issues.push({ key: profile.key, kind: 'unused_evidence', evidence_key: evidenceKey, name });
        }
      }
    }
  }
}
for (const [[field, text], keys] of [...exact.entries()].map(([key, value]) => [key.split('\0'), value])) if (keys.length > 1) issues.push({ kind: 'duplicate', field, text, keys });
const report = { audited_at: new Date().toISOString(), profiles: index.profiles.length, issues: issues.length, by_kind: issues.reduce((out, item) => { out[item.kind] = (out[item.kind] || 0) + 1; return out; }, {}), details: issues };
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`EVERGREEN_AUDIT profiles=${report.profiles} issues=${report.issues} ${JSON.stringify(report.by_kind)}`);
