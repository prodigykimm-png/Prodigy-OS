# Auction AI 판단 보조 구현 계획 — 2026-08-03

## 최종 목표

경매 카드의 기존 `판단 보드` 안에서 노트를 열지 않고 다음 흐름을 끝낸다.

```text
AI 판단 보조
→ 검증된 이력·지역·조사 근거와 계산 확인
→ 외부 AI 전송 범위 확인
→ AI 의견 생성
→ 근거·반대 근거·시나리오 확인
→ 폐기 또는 기존 사람 소유 필드 직접 편집
```

AI는 명확한 의견을 제시하되 숫자를 만들거나 Object를 자동 수정하지 않는다.

## 제품 계약

AI headline은 다음 네 가지다.

- 입찰 보류 검토
- 추가 조사 후 재판단
- 보수 시나리오 검토
- 기준 시나리오 검토

시나리오를 만들 수 없거나 사용자가 확대 cohort만 선택한 경우 앞의 두 의견만 허용한다. 모든 의견에는 이유, 반대 근거, 출처 reference, `근거 수준(제한적/보통)`을 함께 표시한다.

낙찰가율은 `winning_bid_price / appraisal_price × 100`으로만 계산한다. Region Metrics의 현재 빈 `auction_bid_rate_6m`을 대신 사용하지 않는다.

기본 비교 집단은 시도·시군구·물건 유형의 정확 일치다. 물건 유형은 NFC+trim만 하고 별칭을 자동 병합하지 않는다. 다른 유형을 포함하려면 사용자가 직접 확대하고, 결과는 기본 집단과 분리한다.

표본은 다음처럼 다룬다.

| 표본 | 표시 |
|---:|---|
| 0 | 사례 없음 |
| 1–2 | 개별 사례 |
| 3–4 | 건수·최소·중앙·최대 |
| 정확 일치 5+ | Type 7 Q25·중앙·Q75 및 경쟁 가격 참고점 |

경쟁 가격 참고점은 감정가에 Q25/중앙/Q75 낙찰가율을 곱한 값이다. 적정가, 안전 입찰가, 수익성 상한, 예상 낙찰가로 부르지 않는다.

개인 이력은 세 부분으로 분리한다.

- 시장 결과: 검증된 낙찰·패찰
- 개인 패찰: 실제 내 입찰가와 공식 낙찰가의 signed gap
- 개인 낙찰: 건수·비율·가격 일치·로컬 판단 근거 reference

포기는 가격 통계에서 제외하고, 낙찰 이력을 승률이나 성공 확률로 변환하지 않는다.

MVP는 현재 시점 분석만 지원한다. 현재 사건은 항상 과거 cohort에서 제외한다. 과거 당시의 정보 상태를 복원할 관측 시각이 없으므로 backtest와 과거 추천 재현은 지원하지 않는다.

## 사용자 경험

`판단 보드 > 상세 및 기록`에 `AI 판단 보조` 버튼 하나만 추가한다. 카드에는 새 CTA를 만들지 않는다.

AI 화면은 먼저 AI 없이도 동작하는 결정론적 미리보기를 보여준다. 이후 `AI에 전달될 정보`를 펼쳐볼 수 있고, `AI 의견 생성` 클릭 한 번이 실행 동의가 된다. 별도 확인 팝업은 없다.

기본 전송은 aggregate/redacted projection만 사용한다. 실제 사건번호, 상세 주소, 노트/원문, 파일 경로, secret은 보내지 않는다. 개인 판단 문구는 기본 미전송이며 사용자가 disclosure 안에서 선택한 excerpt만 전송한다.

AI 결과는 세션에만 존재한다. 생성·조회·취소·폐기 모두 Vault write가 없다. 사용자가 반영하려면 기존 카드 편집으로 돌아가 직접 수정한다.

## 구현 단계

### 1. 판단 데이터 기반

신규 `SYSTEM/Views/auction-decision-support-core.js`에 outcome 검증, 현재 사건 제외, identity conflict 차단, exact/widened cohort, Type 7, 개인 패찰·낙찰 요약, 시나리오, 제한사항, 외부 최소 projection을 구현한다.

기존 `AuctionDecisionMirrorCore.snapshotAuctionCases()`와 `normalizeAuctionIdentity(...).query_fingerprint`를 재사용한다. I/O, AI, UI, writer는 넣지 않는다.

### 2. 결정론적 판단 보드

`SYSTEM/Views/auction-region-packet.js`의 `RegionPacketModal.onOpen()`에 `AI 판단 보조` drill-down 하나를 연결한다. `HUB/10 Auction.md`에는 새 모듈 로더 순서만 추가한다.

AI가 없어도 cohort, 제외 사유, 낙찰가율, 개인 패찰 차이, 개인 낙찰 경험, 시나리오 가능 여부, Region/조사 coverage, 한계를 모두 보여준다.

### 3. Auction 전용 AI provider 선택

신규 `SYSTEM/Views/auction-ai-provider-resolver.js`에서 `resolveAuctionAiProvider()`를 제공한다. 기존 `ProdigyConfigService`와 `AIProviderService`의 공개 API만 사용한다.

현재 `auction-real-estate-research.js`의 private provider 선택도 이 resolver를 사용하게 하되 기존 조사 요약 prompt/schema는 바꾸지 않는다.

### 4. Provider reality 1종 검증

기존 collector/package/identity/hash/fingerprint/approval 계약으로 direct official provider 한 종을 실제 검증한다. 접근할 수 없으면 unavailable/failure를 그대로 보고하며 fixture 통과를 live 성공이라고 하지 않는다.

### 5. AI strict contract와 session UI

신규 `SYSTEM/Views/auction-ai-decision-support-core.js`에 prompt projection, strict schema, evidence ref, 숫자 동일성, headline eligibility, 금지 표현, redaction 검증을 구현한다.

신규 `SYSTEM/Views/auction-ai-decision-support.js`에 disclosure, 개인 excerpt 선택, 한 번의 structured request, 분리된 결과 UI, stale fingerprint, 취소·폐기·return focus를 구현한다.

Source/outcome writer, Auction Day, Auction/Region schema, lifecycle은 변경하지 않는다.

### 6. 회귀·실화면 QA·수동 실사용

전체 Auction/Region 테스트와 Property contract audit를 수행한다. 실제 Obsidian에서 데스크톱과 compact 폭, 모든 표본 단계, 유형 분절, 낙찰/패찰/포기 조합, AI 불가, disclosure, excerpt 선택, invalid response, stale, 폐기, 사람 편집 복귀를 검증한다.

실사용 평가는 수동 체크리스트로만 한다. telemetry와 cache는 만들지 않는다.

## 필수 테스트

- current-only 및 current-case exclusion
- valid/invalid outcome과 포기 분리
- path/id 중복과 conflict fail-closed
- 정확 물건 유형, 다른 유형 제외 수, 명시적 확대
- 0, 1–2, 3–4, 5+ 표본과 Type 7 fixture
- signed personal lost gap 및 separate won summary
- Region null metric 미사용
- AI 전송 redaction과 개인 excerpt opt-in
- generation 전 zero request, 클릭당 one request
- unknown ref/changed number/banned headline whole-draft rejection
- AI unavailable에도 deterministic preview 유지
- run/preview/generate/cancel/discard zero write
- source/outcome writer 미호출
- 단일 판단 보드 action과 return focus

## 보류 범위

과거 backtesting, bitemporal outcome 관측, AI cache, telemetry, property alias taxonomy, 범용 AI framework, AI writer, 자동 입찰가/의견/status/outcome 반영, 자동 provider 실행, background 판단·수집, 자동 cohort 확대, 점수·순위·확률·단일 추천가는 이번 범위에서 제외한다.

## 완료 기준

AI가 없어도 계산 화면이 유용하고, AI 숫자·출처가 로컬 검증되며, 모든 결과가 session-only이고, provider 상태가 정직하게 표시되고, 보호된 schema/writer/lifecycle이 그대로이며, 실제 Obsidian 흐름이 검증되어야 완료다.
