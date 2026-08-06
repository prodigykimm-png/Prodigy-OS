# Response 36 - 전국 확장형 Auction·Region 판단 체계

- date: 2026-08-03 Asia/Seoul
- packet: `packets/packet-26.md`
- gate: `PLAN`
- conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a701c35-f454-83ee-a0f3-25c22273ebb4`
- transport: 새로 생성한 인증된 ChatGPT Project `Prodigy OS Making` 대화
- passes: initial review → Codex challenge → final decision
- initial decision: `REVISE`
- final decision: `APPROVE`
- final marker: `FINAL_PLAN_VERDICT: APPROVE`
- implementation authority: none

## 승인된 최종 계약

### 지리

- canonical 계층은 `전국 → 수도권·비수도권 → 시도 → 시군구`다.
- Region Object identity는 시군구를 유지한다.
- `서울 / 서울 외 수도권(인천·경기) / 부산 / 기타 비수도권`은 상호배타적인 파생 거시 렌즈이며 canonical identity가 아니다.
- 상위 지역 자료는 하위 지역의 대체값이 아니며 `상위 범위 참고`로만 표시한다.

### 전국 최소 coverage

모든 Auction에 대해 `canonical 시군구 식별 → 상위 범위 연결 → 거시 렌즈 연결 → 확보 자료 표시 → 미확보 자료는 자료 없음`을 보장한다. 전국 데이터 수집 완료, 전국 Thesis 생성, 결측 추정·보간은 의미하지 않는다.

### 2+1 파일럿

Gate 1은 서울+부산이다. 동일한 Fact·Thesis·AI Draft·User Judgment 계약을 두 지역에서 schema 예외 없이 사용하고, 모든 Fact를 원출처·시간 snapshot으로 재현하며, 결측과 상위 참고가 오인되지 않고, 실제 Auction 반복 조사와 판단에 사용되는지를 검증한다.

다른 schema/Object가 필요하거나, 결측 대체가 필수이거나, Fact·Thesis가 섞이거나, AI가 근거·반증 없이 판단하거나, 부산 전용 예외가 계속 늘거나, Auction 조사 중복을 줄이지 못하면 Gate 1을 중단한다. 이 경우 서울 외 수도권, 추가 지역, 전국 Thesis, AI 범위와 초기 지표 확대를 멈춘다.

Gate 2는 Gate 1 졸업 후 서울 외 수도권을 추가한다. 목적은 서울 편향과 수도권 내부 차이를 검증하는 것으로 제한한다. 서울 값을 인천·경기의 fallback으로 쓰거나, 인천·경기의 내부 차이를 평균·단일 Thesis로 숨기거나, 별도 아키텍처가 필요하면 중단한다.

### 초기 지표

- 실거래 거래량
- 매매가격 흐름
- 전세가격 흐름
- 전세가율
- 미분양
- 인구
- 세대
- 사용자 경매 결과 `won / lost / skipped` cohort

지표는 공식 자료가 해당 공간과 property type을 실제로 지원할 때만 사용한다. 오피스텔에 아파트 미분양을 직접 적용하지 않고, 상가·업무시설·토지에 주택 전세·미분양 지표를 전용하지 않는다. 사용자 cohort는 개인 Evidence이며 공공 시장 Fact와 합산하거나 승률·지역 우열로 바꾸지 않는다.

### 데이터와 AI

- Fact는 공식 관측값과 출처·시간·방법·정정 상태를 소유한다.
- Thesis는 scope, property type, horizon, mechanism, support, counterevidence, lineage, invalidation, status와 버전을 소유한다.
- AI Draft는 명시적 사용자 요청으로 생성되는 세션 초안이며 근거·반대 근거·자료 부족·반증 조건을 표시한다.
- User Judgment는 입찰 여부, 예상입찰가, 출구가, 판단 사유와 추가 조사 결정을 소유한다.

AI 의견은 `보수적 검토 / 추가 조사 후 재판단 / 기준 시나리오 검토`로 제한한다. 자동 저장, protected field 변경, 입찰가·출구가 확정, 점수·순위·승률·확률, 결측 보간, Thesis 자동 승인, User Judgment 생성, Object 변경은 금지한다.

### 시간 snapshot

최소 필드는 source identity, geographic scope, property type, indicator definition, observed/published/fetched/valid/first-known time, revision status, method version, content hash다. 정정·해제·재공표·방법론 변경은 기존 기록을 덮어쓰지 않고 새 snapshot과 이전 snapshot 관계로 보존한다.

### 다음 지역 승격

Gate 2 졸업 후 기타 비수도권에서 선택한다. 실제 사용자 Auction 수요, property-type별 공식 자료, canonical 지리 연결, 시간 snapshot 준수, 기존 세 범위와 다른 시장 조건, 동일 계약 재사용, 지역 전용 schema·엔진 불필요를 모두 요구한다.

## 명시적 연기

전국 심층 수집·시계열 엔진, k-skill 거시 엔진화, 모든 시군구 Thesis 자동 생성, 신용·고용·입주·인허가 전체 확장, 정책·인과·예측 모델, 결측 자동 fallback, 점수·순위·승률·낙찰확률, 자동 예상입찰가·출구가, 범용 Review Engine·Knowledge Graph, AI Draft 자동 저장, Thesis 자동 승인, Object·Daily 자동 쓰기를 연기한다.

이 판정은 PLAN만 승인하며 구현, 실제 데이터 수집, 테스트, Object·Daily 쓰기, 커밋, 푸시, 배포 권한을 부여하지 않는다.
