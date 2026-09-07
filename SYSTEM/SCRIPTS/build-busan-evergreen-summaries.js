import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function text(value) { return String(value && typeof value === 'object' ? value.text || '' : value || '').replace(/\s+/gu, ' ').trim(); }
function has(source, pattern) { return pattern.test(source); }
function joinKorean(items) {
  const values = [...new Set(items.filter(Boolean))];
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  const left = values.at(-2);
  const code = left.charCodeAt(left.length - 1);
  const hasBatchim = code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0;
  return `${values.slice(0, -1).join('·')}${hasBatchim ? '과' : '와'} ${values.at(-1)}`;
}
function clip(sentence, max = 90) {
  if (sentence.length <= max) return sentence;
  const clipped = sentence.slice(0, max - 1).replace(/[·,\s]+[^·,\s]*$/u, '').replace(/[·,\s]+$/u, '');
  return `${clipped}.`;
}
function item(value, sources) { return { text: clip(value), sources, status: 'data_inference' }; }

for (const profile of data.profiles) {
  const stable = profile.stable_profile || {};
  const sourceIds = [...new Set(['city_role', 'district_role', 'urban_form', 'transport_structure', 'structural_risks']
    .flatMap((key) => stable[key] && Array.isArray(stable[key].sources) ? stable[key].sources : []))];
  const corpus = ['city_role', 'district_role', 'urban_form', 'transport_structure', 'structural_risks']
    .map((key) => text(stable[key])).join(' ');
  const zoneCorpus = (stable.micro_zones || []).map((zone) => `${text(zone && zone.name)} ${text(zone && zone.text)}`).join(' ');
  const concreteCorpus = `${text(stable.district_role)} ${text(stable.transport_structure)} ${text(stable.structural_risks)} ${zoneCorpus}`;
  const zone = String(profile.zone || `${profile.region_sigungu} 생활권`).replace(/\s+/gu, ' ').trim();

  const landform = [];
  if (has(concreteCorpus, /산지|산복|고지|경사|구릉/u)) landform.push('경사지');
  if (has(concreteCorpus, /하천|강변|수영강|낙동강|서낙동강|온천천|삼락천|대리천|평강천|맥도강/u)) landform.push('하천변');
  if (has(concreteCorpus, /해안|해변|항만|항구|바다/u)) landform.push('해안');
  if (has(concreteCorpus, /평지|평탄|평야/u)) landform.push('평지');
  if (has(zoneCorpus, /산업시설 접면권|산업지|공단|산단|물류/u)) landform.push('산업지 접면');
  if (!landform.length) landform.push('도시 주거지');

  const structures = [];
  if (has(corpus, /도시철도|철도|경부선|동해선|경전철|역세권|\b역\b/u)) structures.push('철도축');
  if (has(corpus, /간선|대로|고속도로|주요도로|도로축/u)) structures.push('간선도로축');
  if (has(corpus, /하천|강변|수영강|낙동강|서낙동강|온천천|삼락천|대리천|평강천|맥도강/u)) structures.push('하천축');
  if (has(concreteCorpus, /해안|해변|항만|항구|바다/u)) structures.push('해안축');

  const mobility = [];
  if (has(corpus, /도시철도|지하철|경전철/u)) mobility.push('도시철도');
  if (has(corpus, /경부선|동해선|일반철도/u)) mobility.push('일반철도');
  if (has(corpus, /간선|대로|고속도로|주요도로|도로축/u)) mobility.push('간선도로');
  if (!mobility.length) mobility.push('내부 도로망');

  const cautions = [];
  if (has(corpus, /경사|산복|고지|구릉/u)) cautions.push('경사와 고저차');
  if (has(corpus, /철도|경부선|동해선|경전철/u)) cautions.push('철도 접면의 소음·단절');
  if (has(corpus, /간선|대로|고속도로|주요도로/u)) cautions.push('간선도로의 소음·보행 단절');
  if (has(corpus, /하천|강변|저지|침수|배수|해안|수변/u)) cautions.push('저지대 배수');
  if (has(corpus, /산업|공단|산단|물류/u)) cautions.push('산업시설 접면');
  if (!cautions.length) cautions.push('주소별 도로 접근과 지형 차이');

  const identityTail = has(zoneCorpus, /산업시설 접면권|산업지|공단|산단|물류/u) ? '산업과 생활 기능이 맞닿는 지역이다.'
    : has(text(stable.district_role), /상업|시장|도심|업무/u) ? '생활·상업 기능이 이어지는 지역이다.'
      : '주거와 일상생활 기능이 이어지는 지역이다.';
  const identity = `${profile.admin_dong}은 ${profile.region_sigungu}의 ${zone}에 속하며, ${identityTail}`;
  const spatial = `${profile.admin_dong}은 ${joinKorean(landform.slice(0, 2))}에 놓이고, ${joinKorean(structures.slice(0, 3)) || '생활도로망'}이 공간을 나눈다.`;
  const mobilityText = `${profile.admin_dong}은 ${joinKorean(mobility.slice(0, 3))}로 바깥 생활권과 연결된다.`;
  const cautionText = `${profile.admin_dong}은 ${joinKorean(cautions.slice(0, 2))}에 따라 주소별 입지 차이가 크다.`;

  stable.evergreen_summary = {
    schema_version: 1,
    identity: item(identity, sourceIds),
    spatial_structure: item(spatial, sourceIds),
    mobility_structure: item(mobilityText, sourceIds),
    structural_cautions: item(cautionText, sourceIds),
    excluded: ['주택재고·세대수·노후도', '개별 생활시설 영업', '가격·거래·인구', '개발·교통 계획 단계'],
    generated_at: '2026-08-30'
  };
}
fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`EVERGREEN_SUMMARIES_READY count=${data.profiles.length}`);
