import fs from 'node:fs';

const [outputPath, ...inputPaths] = process.argv.slice(2);
const profiles = [];
for (const inputPath of inputPaths) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(data.profiles)) throw new Error(`${inputPath}: profiles 배열 필요`);
  profiles.push(...data.profiles);
}
const seen = new Set();
for (const profile of profiles) {
  if (!profile.key || seen.has(profile.key)) throw new Error(`중복 또는 빈 key: ${profile.key}`);
  seen.add(profile.key);
  const summary = profile.stable_profile?.evergreen_summary;
  for (const key of ['identity', 'spatial_structure', 'mobility_structure', 'structural_cautions']) if (!summary?.[key]?.text) throw new Error(`${profile.key}: ${key} 필요`);
}
const bySido = profiles.reduce((counts, profile) => { counts[profile.region_sido] = (counts[profile.region_sido] || 0) + 1; return counts; }, {});
fs.writeFileSync(outputPath, `${JSON.stringify({ schema_version: 1, generated_at: '2026-08-30', profile_count: profiles.length, by_sido: bySido, profiles }, null, 2)}\n`);
console.log(`CAPITAL_INDEX_READY count=${profiles.length} ${JSON.stringify(bySido)}`);
