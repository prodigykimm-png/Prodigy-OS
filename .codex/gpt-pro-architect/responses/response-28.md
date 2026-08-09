# Architect Response 28 — 다음 방향 최종 결정

- gate: `PLAN`
- decision: `APPROVE`
- model evidence: same authenticated ChatGPT Project `Prodigy OS Making`, UI Pro, reasoning setting `높음`
- side-effect authority: none; this is a plan approval only

## Final decision

The proposed order is approved. The first step is not a full five-provider audit and not UX-only work. It is one direct official provider connected end-to-end through the existing investigation surface, package contract, identity checks, Korean recovery UI, and the existing approval boundary.

## Approved order

1. **One-provider vertical slice**
   - Choose one reachable direct official provider that needs no new credential or proxy.
   - Prefer Court when equally feasible; allow Building Register when a valid PNU already exists.
   - Connect `판단 보드 → 조사 자료 → 자동 조사 실행 → provider 상태 → identity 확인/선택 → 결과·빈 결과·실패·mismatch → 재시도 → immutable package → evidence/candidate 분리 → 기존 승인 경계 → 판단 보드 복귀`.
   - Use existing neutral Region facts only to show `확인할 질문`.

2. **Provider Reality expansion**
   - Apply the same package, identity, and UI boundaries to the remaining providers.
   - Verify query identity, returned identity, exact match, status, response-shape drift, timeout/retry, direct/proxy boundary, and address/property-type limits.

3. **Full investigation-flow stabilization**
   - Explain missing identifiers, show selection evidence, support provider-specific retry, distinguish partial success from blocked candidates, separate old/new packages, and explain stale/hash/fingerprint/mismatch gates.
   - Do not introduce a second package reader, writer, or generic provider engine.

4. **Dogfooding**
   - Observe repeated research frequency, recurring provider failures, recovery comprehension, stale-package usefulness, Region-question usefulness, and time saved.

5. **Automation Readiness Gate**
   - Judge background/bulk collection using provider reliability, execution safety, identity coverage, package operations, and demonstrated product need.

6. **Bounded background/bulk automation, only if the gate passes**
   - At most collect raw packages/candidates for selected cases/providers and notify the user.
   - Never automatically select ambiguous identities, approve candidates, change judgment/lifecycle/outcome, overwrite Region Metrics, or produce recommendations/ranks/scores/bid prices.

## First-slice boundaries

Included:

- one direct official provider;
- one real live attempt when access is available;
- query and returned identity recording;
- exact-match verification;
- raw/package SHA-256 and current Auction Object fingerprint checks;
- immutable timestamped package;
- no-write execution;
- Korean states for success, empty, identifier needed, selection needed, failed, partial, mismatch, and stale;
- fixture-backed negative coverage for mismatch, partial package, stale, hash/fingerprint mismatch, provider failure, and retry success;
- Region `확인할 질문` based only on existing canonical facts, dates, verification, coverage, missing fields, connected auction cases, Region Experience, and `region_dong` micro-location warning.

Excluded:

- a second live provider;
- scheduler or bulk runner;
- new credentials or proxy default;
- Region thresholds, polarity, score, ranking, recommendation;
- Object/schema/writer/lifecycle changes;
- automatic approval or judgment.

If live access is unavailable, do not bypass the source, request secrets, or claim live success. Verify the `failed/unavailable` fallback and fixture-backed recovery UI, and label Provider Reality as unproven.

## Advancement evidence

Phase 2 requires a real endpoint attempt or a real source-level failure, recorded query identity, returned-identity exact verification when present, mismatch candidate blocking, raw/package hash and current fingerprint checks, no secret/proxy leakage, understandable Korean state/retry flow, partial evidence visibility, zero-write cancellation, and Auction/Region regression evidence.

The Automation Readiness Gate additionally requires per-provider real response/failure evidence, identity coverage for intended address/property types, safe repeated package creation, bounded retry/timeout, quota/source stop behavior, source-drift detection, stale/failure recovery, and dogfooding evidence that repeated/background collection is genuinely needed.

## Deferred risks

- provider source drift and limited identifier coverage;
- credential/access restrictions and possible Transactions proxy dependence;
- user selection mistakes;
- Region `확인할 질문` drifting into recommendation language;
- background notification fatigue and unnecessary cache growth.

Explicitly deferred: scheduled/bulk collection, freshness notifications, provider health dashboard, retry daemon, proxy-by-default, mobile live collection, automatic identity/approval/status/outcome, Region Metrics overwrite, Region polarity, similar-region selection, statistical confidence, provider success scores, recommendations, rankings, and bid prices.

Final conclusion: a one-provider vertical slice plus Region confirmation questions is the smallest balanced next direction for user value and trustworthiness.
