"use strict";

const assert = require("node:assert/strict");
const scale = require("./region-scale-extract.js");

const page = (fragment) => `<html><body><nav>주메뉴 정책자료QnA</nav>${fragment}<footer>개인정보처리방침</footer></body></html>`;

const real = scale.extractScale(page(`<td>1 망원동438재건축 망원동438-46 고현봉 계획 : 2개동, 149세대 시공: 제이앤비종합건설</td>`));
assert.equal(real.units, 149);
assert.equal(real.confidence, "unique");

const dobong = scale.extractScale(page(`<p>공급규모: 299세대(임대 60세대 포함) 추진경위 '07.02월: 정비구역 지정</p><p>사업명 창동상아1차아파트 재건축 정비사업</p>`));
assert.equal(dobong.units, 299);

const gangnam = scale.extractScale(page(`<title>개포시영아파트 2296세대 재건축 관리처분계획 인가 | 강남구청</title>`));
assert.equal(gangnam.units, 2296);

const ordinance = scale.extractScale(page(`<p>16층 이상의 건축물로서 300세대 이상인 공동주택과 오피스텔은 건축위원회 심의대상이다.</p>`));
assert.equal( ordinance.units, null, "조례 문구('세대 이상')를 규모로 읽으면 안 된다");
assert.equal(ordinance.reason, "rejected_near_negative");

const noProject = scale.extractScale(page(`<p>공동주택 세대수는 850세대이다.</p>`));
assert.equal(noProject.units, null, "사업 문맥이 없으면 채택하지 않는다");
assert.equal(noProject.reason, "rejected_no_project_context");

const density = scale.extractScale(page(`<p>아파트 재개발 사업 개요, 세대당 2.5 명</p><p>망원동 재개발 총 1,200세대</p><p>추진 현황 표</p>`));
assert.equal(density.units, 1200, "세대당 옆 숫자는 버리고 실제 총 세대수를 쓴다");

const outOfRange = scale.extractScale(page(`<p>재개발 아파트 12세대 소규모</p>`));
assert.equal(outOfRange.units, null);
assert.equal(outOfRange.reason, "rejected_range");

const tooSmall = scale.extractScale(page(`<p>재개발 아파트 5세대 소규모</p>`));
assert.equal(tooSmall.reason, "no_units_pattern", "한 자리 수는 규모 패턴이 아니다");

const multiple = scale.extractScale(page(`<p>망원동438재건축 계획 149세대</p><p>망원동498재건축 계획 450세대</p>`));
assert.equal(multiple.units, 149);
assert.equal(multiple.confidence, "ambiguous_multiple_projects");
assert.deepEqual(multiple.candidates, [149, 450]);

const areas = scale.extractArea(page(`<p>창동상아1차아파트 재건축 대지면적 18,500㎡ 연면적 62,300㎡</p>`));
assert.equal(areas.site, 18500);
assert.equal(areas.gross, 62300);

const noAreaContext = scale.extractArea(page(`<p>서울시 전체 연면적 1,000,000㎡</p>`));
assert.equal(noAreaContext.gross, undefined, "사업 문맥 없는 면적은 버린다");

assert.equal(scale.extractScale("").reason, "body_too_short");

console.log("region scale extract tests: PASS");
