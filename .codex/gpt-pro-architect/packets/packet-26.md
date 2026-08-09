# Architect Packet 26

## Metadata

- repo: Prodigy OS
- packet date: 2026-08-03 Asia/Seoul
- topic: 전국 확장형 Auction·Region 판단 체계
- review gate: PLAN
- destination: ChatGPT Project `Prodigy OS Making`의 사용자 요청 새 채팅
- execution authority: 공개 자료 요약을 이용한 외부 설계 토론과 로컬 계획 기록
- excluded authority: 구현, 데이터 수집 실행, Object·Daily 쓰기, 테스트, 커밋, 푸시, 배포

## 문제

부산 중심 시장 논지와 Auction·Region 판단 보조를 전국으로 확장한다. 전국을 한 번에 같은 깊이로 구축하지 않고, 모든 Auction에 정직한 지리·결측 문맥을 제공하는 최소 coverage와 일부 지역의 심층 파일럿을 분리하려 한다.

## 제안한 계약

- canonical 지리: `전국 → 수도권·비수도권 → 시도 → 시군구`
- Region Object identity: 기존 시군구 유지
- 파생 거시 렌즈: `서울 / 서울 외 수도권(인천·경기) / 부산 / 기타 비수도권`
- 상위 지역 자료: 하위 값의 대체가 아니라 `상위 범위 참고`
- k-skill: 사건별 조사 어댑터로 유지, 전국 시계열 엔진화 금지
- 데이터 경계: Fact / Thesis / AI Draft / User Judgment 분리
- 시간 경계: append-only snapshot, valid/first-known time, revision, method version, hash
- AI: 근거·반대 근거·반증 조건을 가진 명시적 의견은 허용하되 자동 저장·자동 입찰가·점수·순위·승률·protected field 변경은 금지

## 토론 과정

첫 답변은 전국 공통 coverage와 3개 심층 범위를 동시에 추진하면 제품 효용 검증 전에 데이터 플랫폼 구축이 커진다는 이유로 `REVISE`했다. 서울+부산 2지역, 서울+서울 외 수도권+부산 3범위, 부산+서울 외 수도권 2지역을 비교하도록 반론을 제기했다.

최종 후보는 세 지역을 동시에 완성하는 방식이 아니라 다음 2+1 게이트다.

1. 서울+부산에서 동일 계약의 재사용성과 실제 Auction 효용 검증
2. Gate 1 졸업 후 서울 외 수도권을 추가해 서울 편향과 수도권 내부 차이 검증
3. 이후 실제 사용자 수요·공식 자료·상이한 시장 조건을 갖춘 기타 비수도권을 순차 승격

## Decision Needed

정본 지리, 전국 최소 coverage, 2+1 파일럿 진입·중단·졸업 조건, 초기 지표와 property-type 제한, 데이터·AI·시간 경계, 지역 승격 기준, defer 목록을 하나의 PLAN 계약으로 확정하고 `FINAL_PLAN_VERDICT`를 반환한다.

구현이나 후속 부수 효과는 승인하지 않는다.
