# Architect Response 30 — AI 판단 보조 데이터 계약 1차 판정

- gate: `PLAN`
- decision: `APPROVE` with normative corrections
- model evidence: same authenticated ChatGPT Project `Prodigy OS Making`, UI Pro, reasoning setting `높음`
- side-effect authority: none; planning approval only

## Headline recommendation verdict

명시적 AI 판단 의견을 허용한다. 중립 요약에만 제한할 필요는 없다.

Headline은 공식 결정이 아니라 `AI 의견`으로 표시하고 다음 enum으로 제한한다.

```text
입찰 보류 검토
추가 조사 후 재판단
보수 시나리오 검토
기준 시나리오 검토
```

```js
{
  action:
    | "입찰 보류 검토"
    | "추가 조사 후 재판단"
    | "보수 시나리오 검토"
    | "기준 시나리오 검토",
  primary_reference: null | {
    low: number,
    baseline: number,
    high: number,
    basis: "exact_cohort_q25_median_q75"
  },
  reason: string,
  counterevidence: string[],
  evidence_refs: string[],
  evidence_strength: "제한적" | "보통"
}
```

`confidence`는 사용하지 않는다. 모델 출력이 확률적으로 보정되었다는 계약이 없으므로 데이터에서 계산되는 `근거 수준`만 사용한다. `높음`은 MVP에서 만들지 않는다. Headline에는 반대 근거가 필수다.

## Calculation contract verdict

Canonical winning-bid ratio:

```text
winning_bid_ratio = winning_bid_price / appraisal_price × 100
```

두 값 모두 양수일 때만 계산하고 `minimum_bid`를 분모로 대체하지 않는다. Region Metrics의 `auction_bid_rate_6m`은 계속 `null/n/a`이며 공식 지역 낙찰가율처럼 사용할 수 없다.

Outcome 의미:

- `won`: canonical `auction_outcome=won` + 실제 결과일 + 양수의 공식 낙찰가
- `lost`: canonical `auction_outcome=lost` + 실제 결과일 + 양수의 공식 낙찰가
- `skipped`: canonical `auction_outcome=skipped` + 실제 결과일
- terminal status만 있고 유효 outcome tuple이 없으면 unresolved

`lost` 자체는 `my_bid_price`를 요구하지 않는다. lost outcome은 시장 낙찰가율 cohort에 포함할 수 있지만, 개인 입찰가 차이 분석에는 positive `my_bid_price`가 있는 lost만 포함한다.

```text
bid_gap_amount = my_bid_price - winning_bid_price
bid_gap_percent = (my_bid_price - winning_bid_price) / winning_bid_price × 100
```

음수 방향을 유지한다.

표본별 계약:

| 표본 수 | 표시 |
|---:|---|
| `n=0` | 사례 없음, 비율·시나리오 미생성 |
| `n=1~2` | 개별 사례만 표시 |
| `n=3~4` | count, min, median, max만 표시; 시나리오 range 미생성 |
| `n>=5` | count, min, Q25, median, Q75, max 및 시나리오 reference 생성 |

Q25/Q75는 정렬 배열에 Hyndman–Fan Type 7 linear interpolation을 사용한다. outlier 자동 제거와 missing-to-zero는 금지한다.

정확한 기본 cohort에서 `n>=5`이고 현재 `appraisal_price`가 양수일 때만 다음을 계산한다.

```text
보수 reference = current_appraisal_price × cohort_Q25_ratio
기준 reference = current_appraisal_price × cohort_median_ratio
공격 reference = current_appraisal_price × cohort_Q75_ratio
```

이는 `경쟁 가격 참고점`이며 적정가, 가치평가, 안전 입찰가, 수익성 충족 가격, 낙찰 가능 가격으로 표현할 수 없다. Exit price, 임대, 비용, 대출은 별도 제약으로 보이고 완전한 deterministic cost/profit ceiling 계약 전에는 자동 cap하지 않는다.

## Phase-order verdict

Decision-support data foundation을 one-provider vertical slice보다 먼저 둔다.

```text
Phase 1 Decision-Support Data Foundation
Phase 2 One-Provider Reality Vertical Slice
Phase 3 AI 판단 보조 MVP
Phase 4 나머지 Provider Reality 확장
Phase 5 Dogfooding 및 오류·편향 측정
Phase 6 Cache / broader automation readiness 검토
```

AI MVP는 다섯 provider가 모두 성공할 때까지 기다리지 않되 provider coverage 부족을 독립 limitation으로 표시한다.

## Normative data-contract corrections

모든 분석은 `analysis_id`, current path/fingerprint, mode, `analysis_as_of`, cohort policy, calculator/prompt/model version, generated time을 갖는다.

- `pre_auction`: 현재 Auction은 모든 historical cohort와 outcome evidence에서 제외
- `post_auction_review`: 현재 결과는 별도 current result로만 표시하고 cohort에는 미포함
- result/package/Region 기준일이 `analysis_as_of` 이후면 제외
- path/fingerprint가 바뀐 draft는 열람만 가능하고 copy/apply 비활성화
- 동일 canonical path/id는 한 번만 집계하며 identity conflict는 fail-closed
- 기본 cohort는 exact sido + sigungu + property type + declared result-date period + verified outcome tuple
- silent widening 금지; 확대 cohort는 사용자 선택 후 별도 결과로 표시
- `region_dong`은 MVP cohort identity로 사용하지 않음

외부 AI에는 run-local opaque refs와 최소 projection만 보낸다. 사건번호, 세부 주소, note/raw body, 실제 source path, 관련 없는 과거 사건, secret, 자유 개인 메모 전체는 제외한다.

Evidence는 데이터로 취급하고 strict schema, ref 검증, deterministic 숫자 일치 검증을 통과해야 한다. 숫자가 다르면 AI draft 전체를 무효화한다.

MVP draft는 session-only다. Vault/package/schema/writer write가 없으며 모달 종료 시 폐기한다. 재현 cache는 Dogfooding 이후 별도 계약으로 검토한다.

## Exact implementation slices

### Slice 1 — Historical Decision Dataset

신규 pure module: `SYSTEM/Views/auction-decision-support-core.js`

```js
buildAuctionDecisionDataset(input)
selectAuctionDecisionCohort(dataset, policy)
summarizeWinningBidRatios(cohort)
summarizePersonalBidGaps(cohort)
buildCompetitionReferences(summary, currentAuction)
buildDecisionSupportProjection(input)
```

Outcome eligibility, cutoff, current exclusion, dedupe, cohort, calculations, limitations, excluded counts, 최소 외부 projection을 담당한다. Vault I/O, AI, UI, writer, 투자 판단은 금지한다. 기존 `auction-decision-mirror-core.js`의 snapshot 의미를 재사용하고 기존 mirror 소비자를 깨지 않는다.

### Slice 2 — Deterministic Preview inside 판단 보드

`SYSTEM/Views/auction-region-packet.js`에 `AI 판단 보조` drill-down을 연결하되, AI 실행 전에도 historical count, cohort, exclusions, 낙찰가율 요약, 개인 bid gap, scenario eligibility, Region/research coverage, limitations를 보여준다. 카드 기본 정보와 의견을 중복 렌더링하지 않는다. AI provider 없이 완전 동작해야 한다.

### Slice 3 — One-provider Reality Vertical Slice

기존 collector/package/research/source writer 계약으로 current evidence coverage 한 종을 실제 검증한다. 접근 불가 시 실패를 정직하게 표시한다. AI 판단과 source acquisition은 합치지 않는다.

### Slice 4 — AI Draft Contract

신규 pure validator: `SYSTEM/Views/auction-ai-decision-support-core.js`

```js
buildDecisionSupportPromptInput(projection)
validateDecisionSupportDraft(output, projection)
resolveDecisionSupportEvidenceRefs(output, evidenceMap)
```

신규 UI/orchestration: `SYSTEM/Views/auction-ai-decision-support.js`

Strict schema, enum/ref/numeric/banned-language/counterevidence validation, redaction, transfer preview, existing configured provider, session-only draft, six-section rendering, cancel/discard, fingerprint stale, existing card edit return을 담당한다.

기존 `auction-real-estate-research.js`의 research prompt/schema는 변경하지 않는다. provider resolution/secret transport 경계만 재사용한다. Source writer, Auction Day core, Auction/Region schema, lifecycle/outcome writer는 변경하지 않는다.

### Slice 5 — Dogfooding

실행, 수정/폐기, 판단 시간, evidence 오류, sample warning 이해, widened cohort, provider coverage 영향, 사후 결과와 의견 차이를 관찰한다. 승률보다 무결성·설명성·효용을 우선 평가한다.

## Acceptance-test matrix

- valid/invalid won/lost/skipped와 status-only 종료
- `my_bid_price` 없는 lost의 market inclusion / personal-gap exclusion
- `analysis_as_of` 이후 result/package/Region 제외
- current path/id 제외와 post-review cohort 미포함
- dedupe와 identity conflict fail-closed
- exact cohort, explicit widening, no silent widening
- Region `auction_bid_rate_6m` 및 `region_dong` cohort 미사용
- n=0, 1–2, 3–4, 5+ 및 Type 7 fixture
- signed personal gap, missing, skipped exclusion
- 사건번호/address/path/note/raw body 미전송
- prompt injection, bad enum/ref, missing counterevidence
- deterministic 숫자 변경 시 whole-draft rejection
- banned score/rank/probability claims
- AI unavailable일 때 deterministic preview 유지
- run/preview/cancel/discard zero write
- fingerprint stale
- source/outcome writer 미호출

Actual Obsidian QA는 exact cohort 5+, all small sample states, skipped only, mixed outcomes, lost without personal bid, stale Region, widened cohort, future current outcome, provider unavailable, transfer cancel, draft discard, fingerprint stale, human-edited persistence를 포함한다.

## Risks and safeguards

- 표본/선택 편향: exact cohort, count/period/exclusions, explicit widening
- 감정가 한계: 기준일 표시, 경쟁 가격 참고로만 명명
- AI anchoring: counterevidence, evidence strength, three references, no single recommended bid, no write
- 개인정보: aggregate, opaque refs, transfer preview, opt-in
- hallucination: strict schema, ref/numeric local validation, invalid AI section discard
- session-only 비재현성: MVP에서 허용, cache는 dogfooding 후 별도 계약

## Rejected alternatives

- AI 중립 요약 한정
- AI 숫자 자유 생성
- source writer 재사용 또는 자동 user-field 기록
- persistent AI score/ranking
- null Region ratio를 실제 ratio로 사용
- `minimum_bid` 분모
- skipped-to-lost
- n=3 사분위 range
- silent cohort widening
- 외부 모델에 실제 사건 identity/path 전달
- MVP cache/schema

## Next packet request

`AI_DECISION_SUPPORT_IMPLEMENTATION_SPEC`: 실제 snapshot/dedupe/property normalization/provider/fingerprint/mount symbols, redacted transfer example, fixtures, session/return-focus, writer non-call proof를 확인한다. 현재 판정은 코드나 provider 실행을 승인하지 않는다.
