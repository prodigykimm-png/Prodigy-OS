import fs from 'node:fs';

const [inputPath, outputDir] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const targets = new Map([
  ['서울특별시', 'seoul'], ['인천광역시', 'incheon'], ['경기도', 'gyeonggi']
]);
fs.mkdirSync(outputDir, { recursive: true });
for (const [sido, slug] of targets) {
  const features = data.features.filter((feature) => feature.properties?.sidonm === sido).map((feature) => ({
    type: 'Feature',
    properties: {
      key: `${sido}-${feature.properties.sggnm}-${feature.properties.adm_nm.split(' ').at(-1)}`,
      sido,
      sigungu: feature.properties.sggnm,
      admin_dong: feature.properties.adm_nm.split(' ').at(-1),
      admin_code: feature.properties.adm_cd2,
      source: 'SGIS 행정동 경계 가공본 (admdongkor ver20260701, CC BY 4.0)',
      source_commit: '7d94ff928e43c035396c0a58350869eea0ba63c3'
    },
    geometry: feature.geometry
  }));
  const output = {
    type: 'FeatureCollection',
    name: `${sido} 행정동 경계 2026-07-01`,
    source_url: 'https://github.com/vuski/admdongkor',
    source_sha256: 'c01ef44a0eb00978662ba7a6240ccb1da287fb52abd85104a1758969d391132f',
    license: 'CC BY 4.0; original source SGIS 공공누리 제1유형',
    features
  };
  fs.writeFileSync(`${outputDir}/${slug}-admin-dong-boundaries.geojson`, `${JSON.stringify(output)}\n`);
  console.log(`${slug.toUpperCase()}_BOUNDARIES_READY count=${features.length}`);
}
