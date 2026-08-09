# Architect Response 22

- date: 2026-08-02 Asia/Seoul
- source: existing ChatGPT Project Prodigy OS Making conversation
- gate: QA_REMEDIATION_SPEC
- decision: APPROVE
- final verdict: FINAL_PLAN_VERDICT: APPROVE

## Core decision

부분 성공은 보존한다. 다만 검증되지 않은 candidate는 승인하지 않는다. 모든 Provider가 성공해야만 전체 승인을 허용하는 절대 규칙은 이번 범위에 추가하지 않는다. 대신 `canApplyCandidatePatch()`를 UI, package validator, existing writer에서 동일하게 적용해 각 candidate가 자기 Provider의 exact returned identity를 통과했을 때만 반영한다.

## Required implementation defects

- Candidate 승인 게이트를 writer에서 강제
- 모든 Provider의 returned identity exact match를 fail-closed로 처리
- PNU·법원·동·호 식별자를 Number가 아닌 문자열로 보존
- Fixture도 live와 동일한 identity verification 경로 사용
- 승인 직전 현재 Auction Object와 package fingerprint 재검증
- `1905호`를 parcel로 해석하지 않도록 차단
- `match_resolution` 필수화 및 identity 없는 package 승인 차단

## Included hardening

- child environment allowlist
- `PRODIGY_NODE_BIN` 제한
- shell escaping
- observed_at/path containment
- raw error redaction
- package validation 강화

## Evidence and scope

- Provider별 실제 후보 스키마, transactions `lawd_cd` UX, timeout/retry 임계값은 fixture와 테스트로 검증하는 evidence gap이다.
- 이번 범위에서 새 Auction/Region schema, generic matching engine, 자동 판단·추천·승인, 전체 npm 공급망 재설계, 광범위한 Provider allowlist 플랫폼은 구현하지 않는다.
- 자동 테스트로 SHA, fingerprint, schema, immutable package, env allowlist, shell escaping, path containment, fixture consistency를 검증한다.
- 실제 Obsidian QA는 identity 선택, retry, approval 차단, partial success 표시를 검증한다.

## Required next conformance evidence

- `canApplyCandidatePatch()`가 UI·validator·writer에 동일하게 적용됨
- `match_resolution`이 승인 candidate에 존재함
- fingerprint mismatch가 승인 직전에 차단됨
- PNU·court·dong/ho Number→String 회귀 방지
- `1905호`와 Provider별 negative fixture
- partial success 보존과 미검증 candidate 승인 차단
- Obsidian `needs_identifier → needs_selection → retry → success → approval` 흐름
