(function (root) {
  "use strict";

  const VERSION = "llmwiki_deterministic_page_planner_v7";




  const MAX_PAGES = 20;
  const MAX_CLAIMS_PER_PAGE = 12;
  const SUBTOPIC_RULES = Object.freeze({
    "건축과 시공": Object.freeze([
      ["주택 설계·공간 구성", /설계|층고|거실|현관|방 |욕실|다락|주방|책장|TV|면적/u],
      ["구조·단열 및 외장 시공", /철골|내진|단열|석고보드|지붕|골조|외벽|스타코|누수|방수/u],
      ["토목·기초 및 보강토 시공", /토목|보강토|기초|주차장|진입 계단/u],
      ["주택 개발·공정 및 사업비", /공사비|완공|공정|건축허가|착공|동시에 건축|시행|시공|판매|매도/u],
    ]),
    "토지와 인허가": Object.freeze([
      ["도로·진입로 및 맹지 해소", /도로|진입로|맹지|현황도로|가로막|확장|편입/u],
      ["토지 개발·분할 및 인허가", /개발|분할|가분할|개발행위|착공계|인허가|주차 공간/u],
      ["토지 매입가·시세 및 보상", /매입|시세|평당|감정가|낙찰|보상|분담금/u],
      ["토지 규모·입지 및 활용 계획", /평 규모|평의 토지|위치|부지|집 한 채|은행나무/u],
    ]),
  });
  const MAX_GUIDE_SECTIONS = 16;
  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("LLMWikiHash is required.");

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function topicKey(value) { return clean(value).toLocaleLowerCase("ko-KR"); }
  const TOPIC_RULES = Object.freeze([
    ["권리분석", /가등기|유치권|저당|근저당|소유권|권리순위|배당|인도명령|점유/u],
    ["세금과 비용", /취득세|증여세|재산세|양도세|세금|세무|부가세/u],
    ["대출과 자금", /대출|담보|감정평가|금리|이자|현금흐름|투자금|레버리지/u],
    ["토지와 인허가", /토지|농지|맹지|진입로|도로|형질변경|인허가|개발행위|지목/u],
    ["건축과 시공", /건축|시공|공사|설계|보강토|기초|골조|콘크리트|단열|지붕|창호|전기|배관|설비/u],
    ["인테리어와 유지보수", /인테리어|리모델링|마감|도배|타일|누수|하자|동파|열선/u],
    ["입지와 상권", /입지|상권|교통|학군|역세권|지역분석|배후수요|유동인구/u],
    ["거래와 협상", /매매|계약|중개|협상|매도|매수|임대|전세|월세/u],
    ["경매와 공매", /경매|공매|낙찰|매각불허가|강제집행|명도|보관집행/u],
  ]);
  const WEDDING_GROUPS = Object.freeze([
    ["웨딩 후보정·사진 구성", /후보정|화이트 밸런스|사진 배치|사진.*선택|앨범.*선택|앨범 작업|원본 파일|커플사진|홀연출 사진|눈을 감|시선이 분산|삭제 정리|shift 키|수직 방향|납품/u],
    ["웨딩 장비·노출 및 구도", /광각|망원|ISO|셔터스피드|삼각대|조명|플래시|스트로보|노출|수평|수직|연사|영상팀|앵글|공감각/u],
    ["본식 입퇴장·가족 촬영", /입장|퇴장|버진로드|부모님|가족사진|어머님|포옹|하객/u],
    ["웨딩 인물 포징·표정", /포즈|포징|표정|웃음|어깨|목|거북목|발 위치|팔꿈치|몸선|팔뚝|독사진|작아 보일|앞으로 배치|선호하는 얼굴 방향|얼굴 방향|촬영 선호도|하트|키스씬/u],
    ["신부대기실·베일 연출", /신부대기실|대기실|베일/u],
    ["체형·상황별 렌즈 선택", /렌즈|50mm|85mm|18mm|18-35mm/u],
  ]);
  function weddingGroup(claim) {
    const value = `${clean(claim.topic)} ${clean(claim.text)}`;
    if (/모든 식순|식순마다|신부 어머니/u.test(value)) return "본식 입퇴장·가족 촬영";
    if (/작아 보일 경우|작아 보이면|앞으로 배치/u.test(value)) return "웨딩 인물 포징·표정";
    return WEDDING_GROUPS.find(([, pattern]) => pattern.test(value))?.[0] || "";
  }
  function classifiedTopic(claim, weddingSource) {
    const wedding = weddingSource ? weddingGroup(claim) : "";
    if (wedding) return wedding;
    const declared = clean(claim.topic);
    if (claim.role === "reusable_claim" && declared) return declared;
    const text = clean(claim.text);
    const matched = TOPIC_RULES.find(([, pattern]) => pattern.test(text));
    return matched ? matched[0] : "";
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function guideSections(claims) {
    const size = Math.max(1, Math.ceil(claims.length / MAX_GUIDE_SECTIONS));
    const rows = [];
    for (let index = 0; index < claims.length; index += size) {
      const chunk = claims.slice(index, index + size);
      rows.push({
        heading: clean(chunk[0]?.topic) || `자료 구간 ${rows.length + 1}`,
        summary: `${chunk.length}개 claim의 원문 근거를 안내합니다.`,
        claim_ids: chunk.map((claim) => claim.claim_id),
      });
    }
    return rows;
  }
  function plan(input) {
    const inventory = input?.inventory;
    if (!plain(inventory) || !Array.isArray(inventory.claims) || !Array.isArray(inventory.citations)
      || typeof inventory.inventory_hash !== "string" || !plain(inventory.source)) {
      return freeze({ ok: false, reason: "invalid_deterministic_plan_input" });
    }
    const weddingSource = /웨딩|wedding/u.test(`${clean(inventory.source.source_path)} ${clean(inventory.source.title)}`);
    const citationByClaim = new Map(inventory.claims.map((claim) => [claim.claim_id, claim.citation_ids || []]));
    const orderedClaims = [...inventory.claims].sort((left, right) => left.claim_id.localeCompare(right.claim_id, "en"));
    const eligibleClaims = orderedClaims.filter((claim) => claim.role === "reusable_claim")
      .map((claim) => ({ claim, classified_topic: classifiedTopic(claim, weddingSource) }));
    const groups = new Map();
    for (const row of eligibleClaims) {
      if (!row.classified_topic) continue;
      const key = topicKey(row.classified_topic);
      if (!groups.has(key)) groups.set(key, { title: row.classified_topic, claims: [] });
      groups.get(key).claims.push(row.claim);
    }
    const semanticGroups = [...groups.values()].flatMap((group) => {
      const rules = SUBTOPIC_RULES[group.title];
      if (!rules) return [group];
      const buckets = new Map(rules.map(([title]) => [title, { title, claims: [] }]));
      for (const claim of group.claims) {
        const matched = rules.find(([, pattern]) => pattern.test(clean(claim.text)));
        if (matched) buckets.get(matched[0]).claims.push(claim);
      }
      return [...buckets.values()].filter((bucket) => bucket.claims.length > 0);
    });
    const eligible = semanticGroups.map((group) => ({
      ...group,
      evidence_count: new Set(group.claims.flatMap((claim) => citationByClaim.get(claim.claim_id) || [])).size,
    })).filter((group) => group.claims.length >= 2 && group.evidence_count >= 2)
      .sort((left, right) => right.claims.length - left.claims.length || left.title.localeCompare(right.title, "ko"));
    const bounded = eligible.flatMap((group) => {
      const chunks = [];
      for (let index = 0; index < group.claims.length; index += MAX_CLAIMS_PER_PAGE) {
        const claims = group.claims.slice(index, index + MAX_CLAIMS_PER_PAGE);
        const evidenceCount = new Set(claims.flatMap((claim) => citationByClaim.get(claim.claim_id) || [])).size;
        if (claims.length >= 2 && evidenceCount >= 2) chunks.push({ ...group, claims, evidence_count: evidenceCount });
      }
      return chunks;
    });
    const selected = bounded.slice(0, MAX_PAGES);
    const selectedIds = new Set(selected.flatMap((group) => group.claims.map((claim) => claim.claim_id)));
    const titleCounts = new Map();
    for (const group of selected) titleCounts.set(group.title, (titleCounts.get(group.title) || 0) + 1);
    const titleIndexes = new Map();
    const topicPages = selected.map((group) => {
      const index = (titleIndexes.get(group.title) || 0) + 1;
      titleIndexes.set(group.title, index);
      const title = titleCounts.get(group.title) > 1 ? `${group.title} ${index}` : group.title;
      return {
        title,
        purpose: `${group.title}에 관한 독립적인 판단과 근거를 설명합니다.`,
        claim_ids: group.claims.map((claim) => claim.claim_id),
        target_candidate_ids: [...new Set(group.claims.flatMap((claim) => claim.suggested_candidate_ids || []))].sort(),
      };
    });
    const draft = {
      source_guide: {
        overview: `${clean(inventory.source.source_path)}에서 추출한 전체 claim의 근거 지도입니다.`,
        sections: guideSections(orderedClaims),
        key_questions: selected.slice(0, 8).map((group) => `${group.title}의 핵심 판단 기준은 무엇인가?`),
      },
      topic_pages: topicPages,
      source_only_claim_ids: orderedClaims.filter((claim) => claim.role === "reusable_claim" && !selectedIds.has(claim.claim_id)).map((claim) => claim.claim_id),
    };
    return freeze({ ok: true, version: VERSION, value: draft, draft_hash: hashApi.sha256(stable(draft)), writer_count: 0 });
  }

  const api = freeze({ VERSION, MAX_PAGES, MAX_CLAIMS_PER_PAGE, MAX_GUIDE_SECTIONS, plan });
  root.LLMWikiDeterministicPagePlanner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
