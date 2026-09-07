import fs from 'node:fs';
import readline from 'node:readline';

const [csvPath, profilesPath, outputPath] = process.argv.slice(2);
const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8')).profiles;
const rows = {};
function parseCsv(line) {
  const values = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value); return values;
}
const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });
const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
let headers = null;
for await (const line of reader) {
  if (!headers) { headers = parseCsv(line.replace(/^\uFEFF/u, '')); continue; }
  const values = parseCsv(line); const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  if (!row['주소'].startsWith('부산광역시 ')) continue;
  const parts = row['주소'].split(/\s+/u); const sigungu = parts[1]; const legalDong = parts[2];
  if (!sigungu || !legalDong) continue;
  const key = `${sigungu}|${legalDong}`;
  rows[key] ||= { records: 0, complexes: new Set(), buildings: 0, households: 0, type_counts: {}, approvals: [] };
  const group = rows[key]; group.records += 1; group.complexes.add(row['단지고유번호']); group.buildings += Number(row['동수'] || 0); group.households += Number(row['세대수'] || 0); group.type_counts[row['단지종류'] || 'unknown'] = (group.type_counts[row['단지종류'] || 'unknown'] || 0) + 1; if (row['사용승인일']) group.approvals.push(row['사용승인일']);
}
const summary = {};
for (const [key, group] of Object.entries(rows)) summary[key] = { records: group.records, complexes: group.complexes.size, buildings: group.buildings, households: group.households, type_counts: group.type_counts, earliest_approval: group.approvals.sort()[0] || null, latest_approval: group.approvals.sort().at(-1) || null };
const mapping = {};
for (const profile of profiles) mapping[profile.key] = (profile.legal_dong_aliases || []).map((legalDong) => ({ legal_dong: legalDong, summary: summary[`${profile.region_sigungu}|${legalDong}`] || null }));
fs.writeFileSync(outputPath, `${JSON.stringify({ source: 'SYSTEM/CACHE/region-metrics/_shared/housing-stock.csv', collected_at: '2026-07-28T22:08:05.204Z', limitation: '법정동 단위 공동주택 캐시이며 같은 법정동의 복수 행정동 내부 분포를 구분하지 않는다.', by_legal_dong: summary, by_admin_dong: mapping }, null, 2)}\n`);
console.log(`HOUSING_STOCK_SUMMARY_READY legal_dongs=${Object.keys(summary).length} admin_dongs=${Object.keys(mapping).length}`);
