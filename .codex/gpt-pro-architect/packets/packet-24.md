# Architect Packet 24

## Metadata

- repo: Prodigy OS
- packet date: 2026-08-03 Asia/Seoul
- current goal: Auction·Region 판단 체계를 부산 중심에서 전국으로 확장
- review gate: PLAN
- continuous execution: false
- execution authority: 공개 자료 요약을 이용한 외부 설계 토론과 로컬 계획 기록
- excluded authority: 구현, 데이터 수집 실행, Object·Daily 쓰기, 테스트 실행, 커밋, 푸시, 배포
- stop condition: 도전 패스 후 최종 PLAN 결론 확보

## Approval Scope

- destination: ChatGPT Project `Prodigy OS Making`의 새 채팅
- transport: 인증된 ChatGPT 브라우저
- transmitted: 공개 공식·학술 자료의 요약과 익명화된 제품 경계
- excluded: 실제 경매 사건, 주소, 사용자 이력 원문, 개인 노트, API 키, 비밀값, 구현 diff

## 현재 문제

Prodigy OS는 부산 중심으로 발전시킨 시장 논지와 Auction·Region 판단 지원을 전국으로 확장하려 한다. 전국이 한 번에 어렵다면 초기 심층 범위는 서울, 서울 외 수도권, 부산으로 두되 기타 비수도권도 최소 coverage에서 제외하지 않으려 한다.

현재 Region Object의 canonical identity는 시군구다. 전국·권역 논지는 기존 Region Object를 대체하지 않고 버전형 Knowledge/Thesis로 보존해 Auction과 Region에 읽기 전용 투영하는 방향이다. k-skill은 사건별 법원경매·건축물대장·실거래·공시가격·공시지가 조사 어댑터이며 전국 시계열 엔진으로 확대하지 않는다.

## 확인된 근거

1. RTMS 실거래, 인구·세대·이동, 미분양 등은 전국 기반을 만들 수 있지만 지표별 공간 해상도와 공표 주기는 다르다.
2. 공급과 신용 자료는 시군구보다 시도·전국에서 안정적인 경우가 많다.
3. 서울·수도권·비수도권은 같은 기간에도 가격 방향과 영향 강도가 다르므로 전국 단일 규칙은 부적절하다.
4. 수도권은 서울·인천·경기이므로 `서울 / 수도권 / 부산`을 같은 비교 레벨로 두면 중복된다.
5. RTMS는 신고·정정·해제로 값이 바뀌므로 append-only raw snapshot, valid time, first known time, revision 상태, method version, hash가 필요하다.
6. 단일 지표는 충분하지 않다. 거래량·신용·입주·전세·미분양·인구·고용·정책은 서로 다른 시간 범위와 역할을 가진다.

## 제안 초안

### 정본 지리

`전국 → 수도권·비수도권 → 시도 → 시군구`

### 거시 비교 렌즈

`서울 / 서울 외 수도권(인천·경기) / 부산 / 기타 비수도권`

거시 렌즈는 비교용 파생 범위이며 canonical identity가 아니다. 결측 시 상위 지역 값은 하위 지역의 대체값이 아니라 `상위 범위 참고`로 표시한다.

### 초기 운영

- 전국: 공통 coverage
- 서울·서울 외 수도권·부산: 심층 파일럿
- 기타 비수도권: 공통 coverage 유지 후 동일 승격 기준으로 순차 심화
- 부산: 영구 특례가 아닌 첫 비수도권 파일럿

### 논지와 AI

- Fact / Thesis / AI Draft / User Judgment를 분리한다.
- Thesis는 scope, property type, horizon, mechanism, support, counterevidence, source lineage, invalidation, status, observed/published/fetched time, method version을 가진다.
- AI는 근거와 반대 근거, 사용자 won/lost/skipped cohort, 현재 판단과 반증 조건을 이용해 `보수적 검토`, `추가 조사 후 재판단`, `기준 시나리오 검토` 같은 명시적 의견을 낼 수 있다.
- 자동 저장, 자동 입찰가, 단일 지역 점수·순위·승률, protected field 변경은 금지한다.

## 첫 토론 질문

이 초안의 가장 취약한 가정을 하나 선정해 반박하라. 특히 `전국 공통 coverage + 3개 심층 파일럿` 순서가 제품 효용을 가장 빨리 증명하는지, 아니면 서로 다른 두 지역만 먼저 비교하는 더 작은 파일럿이 나은지 판단하라. 부산 편향, 지리 중첩, 결측 fallback, 시간 스냅샷, AI 판단 경계를 함께 고려하되 과설계를 경계하라.

## Required Response Format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Strongest objection:
Smallest useful pilot:
What to keep:
What to remove or defer:
Evidence needed to expand nationwide:
Question back to Codex for the challenge round:

구현을 승인하지 말고 첫 토론 답변만 제공하라.
