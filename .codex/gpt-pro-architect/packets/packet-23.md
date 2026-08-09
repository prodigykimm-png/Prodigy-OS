# Architect Packet 23

## Metadata
- repo: Prodigy OS Obsidian Vault
- packet date: 2026-08-03 Asia/Seoul
- previous packet: packet-22.md
- current goal: 부산 중심 시장 논지를 전국으로 확장하되 지역 이질성과 사용자 판단 경계를 보존하는 최종 설계
- review gate: PLAN
- continuous execution: false
- terminal gate: PLAN
- execution authority: 공개 자료 조사, 익명화된 설계 검토, 로컬 보고서 작성
- excluded authority: 제품·테스트·Object 수정, 외부 provider 실행, 실제 사건·주소·개인 메모 전송, commit/push/release
- stop conditions: PLAN 최종 결론을 저장하고 사용자에게 보고; 구현하지 않음

## Approval Scope
- destination: 기존 ChatGPT Project `Prodigy OS Making`의 동일 대화
- transport: Codex in-app browser
- data categories: 공개 공식·학술 자료의 요약, 익명화된 제품 설계
- excluded: 실제 사건, 주소, 사용자 이력 원문, API 키, 비밀값, 개인 메모, 구현 diff

## Verified Findings

1. 전국 공통 데이터 기반은 가능하다. RTMS 실거래는 전국 시군구·유형별, 주민등록 인구·세대와 국내이동은 시군구 월별, 미분양은 시군구 월별, REB 가격·전세지수는 공표 대상 시군구까지 제공된다.
2. 공급 승인통계와 금융·신용은 시도 또는 전국 단위가 더 안정적이다. 모든 시군구에 같은 세분 데이터가 있는 것은 아니다.
3. 2025년 서울 매매가격은 +7.1%, 수도권 +2.9%, 비수도권 -0.7%로 같은 기간에도 방향·강도가 갈렸다.
4. 수도권은 서울+인천+경기이므로 `서울 / 수도권 / 부산`을 peer로 두면 중복된다. 상호배타 구간은 `서울 / 서울 외 수도권 / 부산 / 기타 비수도권`이다.
5. 부산은 전국 3위 주택 재고, 비수도권 최대 수준 REB 표본, 중·동·서부산 공식 생활권을 가진 적절한 심층 파일럿이다. 영구 특례가 아니라 동일 기준으로 다른 지역에 열려 있어야 한다.
6. 단일 지표 규칙은 지지되지 않았다. 거래량은 가장 반복적인 단기 예측 후보지만 구조적 원인이 아니며, 전세는 거래·신용·공급·기대와 결합된 조건부 신호다. 준공은 중기 공급, 준공 후 미분양은 신규주택/PF 스트레스, 인구·가구·고용은 장기 구조 신호다.
7. RTMS는 신고·정정·해제로 변한다. 최소 `valid_time`, `known_from`, revision/method version, hash와 append-only snapshot은 지금부터 필요하지만 전체 bitemporal DB는 백테스트까지 연기할 수 있다.

## Proposed Final Design

```text
전국 공통 국면
├─ 수도권
│  ├─ 서울
│  └─ 서울 외 수도권(인천·경기)
└─ 비수도권
   ├─ 부산 [첫 심층 파일럿]
   └─ 기타 비수도권 [전국 coverage, 순차 승격]
```

- 전국·권역 논지는 새 `auction_region` Object가 아니라 버전형 Knowledge/Thesis 자산으로 두고, 기존 시군구 Region과 Auction에 읽기 전용 투영한다.
- k-skill은 사건별 법원경매·건축물대장·실거래·공시가격·공시지가 조사 어댑터로 유지한다. 전국 지역 시계열 엔진으로 확대하지 않는다.
- Fact / Thesis / AI Draft / User Judgment를 분리한다.
- Thesis는 scope, property type, horizon, mechanism, support, counterevidence, independent source lineage, invalidation, status, observed/published/fetched time, method version을 가진다.
- AI는 전국→권역→시군구→미시시장 경로, 지지·반대 논지, 사용자 won/lost/skipped cohort, 현재 판단과 반증 조건을 제시할 수 있다. 자동 저장·자동 입찰가·canonical score는 만들지 않는다.
- 결측 fallback은 동일 지표·유형·기간을 유지해 시군구→공식 생활권→시도→수도권/비수도권→전국 순으로 넓히고 실제 표시 범위를 명시한다.

## Decision Needed

이 구조가 전국 확장과 현재 Prodigy OS 계약을 함께 만족하는 최소 설계인지 반박 검토하라. 특히 다음을 판정하라.

1. `서울 / 서울 외 수도권 / 부산 / 기타 비수도권`과 계층 경로가 타당한가?
2. 부산을 첫 심층 파일럿으로 두되 영구 특례로 만들지 않는 정책이 타당한가?
3. AI가 명시적 판단을 제시하되 자동 저장·자동 입찰가를 금지하는 경계가 과도하거나 부족한가?
4. 지금 최소 시간 스냅샷을 쌓고 전체 bitemporal 모델은 백테스트까지 미루는 순서가 타당한가?
5. 반드시 줄이거나 추가할 항목은 무엇인가?

짧고 실질적인 한국어로 응답하라. `Decision:` 한 단어만 출력하지 말고 최소 6문장으로 작성하라.

## Required Response Format

- 결정: 승인 / 수정 / 차단
- 검토 게이트: PLAN
- 가장 강한 반론
- 최종 지리·데이터·AI 경계
- 반드시 수정할 점
- 최종 권고 순서
