"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "../../../../../..");
const planner = require(path.join(ROOT, "SYSTEM/Views/llmwiki-deterministic-page-planner.js"));
function claim(id, topic, citations) { return { claim_id:`claim_${String(id).padStart(24,"0")}`, role:"reusable_claim", topic, text:`claim ${id}`, citation_ids:citations, suggested_candidate_ids:[] }; }
function inventory(sourcePath="INBOX/source.md") { return { inventory_hash:"a".repeat(64), source:{source_id:"source",source_path:sourcePath,content_hash:"b".repeat(64)}, claims:[claim(1,"직영 건축",["c1"]),claim(2,"직영 건축",["c2"]),claim(3,"세무",["c3"]),claim(4,"유치권",["c4"]),claim(5,"유치권",["c5"])], citations:[1,2,3,4,5].map((n)=>({citation_id:`c${n}`})) }; }
test("wedding posing and album workflow claims consolidate instead of remaining singletons",()=>{const input=inventory("INBOX/웨딩 촬영 가이드.md");const rows=[
  [20,"촬영 전 신부 선호도 조사","촬영 전 신부가 선호하는 얼굴 방향을 미리 조사해야 한다."],
  [21,"베일을 이용한 신부 팔뚝 커버","체형 보정이 필요한 경우 베일을 이용해 신부의 팔뚝을 가려주는 연출이 효과적이다."],
  [22,"앨범 작업 시 원본 파일 정리","앨범 작업 시 각 폴더 내 보정본을 제외한 원본 파일을 먼저 삭제한다."],
  [23,"커플사진 인트로 순서 배치","커플사진을 구별할 때 홀연출 사진과 대기실 연출 사진을 분리하고 홀연출 사진을 먼저 넣는다."],
  [24,"사진 이동 시 수직 유지","사진이나 요소를 이동시킬 때 shift 키를 누르면 수직 방향을 유지하며 옮길 수 있다."],
  [25,"강한 핀 조명 대처법","핀 조명이 강하면 노출을 낮추고 플래시 광량을 높여 조명 밸런스를 맞춘다."],
  [26,"촬영 전 신부 취향 파악","촬영 전 신부에게 더 잘 나오는 얼굴 방향과 촬영 선호도를 파악해야 한다."],
  [27,"눈 감은 컷 정리","피사체가 눈을 감았거나 시선이 분산된 사진은 삭제 정리해야 한다."],
].map(([id,topic,text])=>({...claim(id,topic,[`c${id}`]),text}));const result=planner.plan({inventory:{...input,claims:rows}});assert.equal(result.ok,true);assert.deepEqual(result.value.topic_pages.map(p=>[p.title,p.claim_ids.length]).sort(),[["웨딩 인물 포징·표정",3],["웨딩 장비·노출 및 구도",1],["웨딩 후보정·사진 구성",4]].filter(([,count])=>count>=2).sort());assert.deepEqual(result.value.source_only_claim_ids.length,1);});
test("wedding principles cluster by reusable shooting purpose",()=>{const input=inventory("INBOX/웨딩 촬영 가이드.md");const rows=[
  [10,"광각 렌즈 사용 시 인물 배치 주의사항","광각 렌즈 사용 시 사진 왜곡을 방지하기 위해 양 옆 끝에 인물을 배치하지 않아야 한다."],
  [19,"체형에 따른 50mm 렌즈 선택","신부의 체형에 따라 50mm 또는 85mm 렌즈를 선택한다."],
  [28,"혼주 촬영 렌즈 선택","혼주 촬영 상황에 따라 50mm 또는 85mm 렌즈를 선택한다."],
  [11,"카메라 ISO 설정 한도","촬영 시 ISO 한도는 2000을 초과하지 않는다."],
  [18,"수평 및 수직 구도 확인","촬영 시 수평과 수직을 모두 확인해야 한다."],
  [12,"신부 서 있는 자세 발 위치","신부가 서 있을 때는 발을 X자로 교차하여 배치한다."],
  [13,"자연스러운 웃음 표정 연출","소리를 내어 웃게 해야 자연스러운 표정을 담을 수 있다."],
  [14,"신랑 입장 대기 촬영 렌즈","신랑 출발은 사이드에서 50mm 렌즈로 촬영한다."],
  [15,"부모님 인사 촬영 방법","부모님 인사 장면은 18mm 렌즈로 앉아서 촬영한다."],
  [16,"후보정 화이트 밸런스","후보정 화이트 밸런스는 신부 피부 톤을 기준으로 정한다."],
  [17,"사진 배치 순서","사진 배치 시 광각을 먼저 두고 망원을 나중에 배치한다."],
].map(([id,topic,text])=>({...claim(id,topic,[`c${id}`]),text}));const result=planner.plan({inventory:{...input,claims:rows}});assert.equal(result.ok,true);assert.deepEqual(result.value.topic_pages.map(p=>p.title).sort(),["본식 입퇴장·가족 촬영","웨딩 장비·노출 및 구도","웨딩 인물 포징·표정","웨딩 후보정·사진 구성","체형·상황별 렌즈 선택"].sort());assert.equal(result.value.source_only_claim_ids.length,0);});
test("non-wedding claims never enter wedding semantic groups",()=>{const input=inventory("INBOX/재개발재건축.md");const rows=[
  [30,"대출과 자금","투자 수익률 판단 기준은 총 금액이 아닌 초기 실투입금 대비 100% 수익을 목표로 한다."],
  [31,"대출과 자금","앞으로 투자할 때 초기 실투입금 대비 수익률을 기준으로 판단한다."],
  [32,"권리분석","권리산정기준일은 조합원 지위 양도 통제가 아닌 신축 쪼개기 방지를 목적으로 한다."],
  [33,"권리분석","권리산정기준일 이후 신축 쪼개기는 입주권 판단에 영향을 준다."],
].map(([id,topic,text])=>({...claim(id,topic,[`c${id}`]),text}));const result=planner.plan({inventory:{...input,claims:rows}});assert.equal(result.ok,true);assert.deepEqual(result.value.topic_pages.map(p=>p.title).sort(),["권리분석","대출과 자금"]);assert.equal(result.value.topic_pages.some(p=>p.title.includes("웨딩")),false);});
test("unmatched reusable singleton remains source-only",()=>{const input=inventory();const singleton={...claim(9,"외부 분류",["c9"]),text:"규제 변화는 별도 검토가 필요하다."};const result=planner.plan({inventory:{...input,claims:[...input.claims,singleton]}});assert.equal(result.ok,true);assert.equal(result.value.source_only_claim_ids.includes(singleton.claim_id),true);const used=result.value.topic_pages.flatMap((page)=>page.claim_ids).concat(result.value.source_only_claim_ids);assert.equal(used.filter((id)=>id===singleton.claim_id).length,1);});
test("deterministic fallback forms only evidence-sufficient exact-topic pages",()=>{const result=planner.plan({inventory:inventory()});assert.equal(result.ok,true);assert.deepEqual(result.value.topic_pages.map((p)=>p.title).sort(),["유치권","직영 건축"]);assert.equal(result.value.source_only_claim_ids.length,1);assert.equal(result.writer_count,0);});
test("fallback output is order invariant",()=>{const first=planner.plan({inventory:inventory()});const shuffled=inventory();shuffled.claims=[...shuffled.claims].reverse();const second=planner.plan({inventory:shuffled});assert.equal(first.draft_hash,second.draft_hash);});
