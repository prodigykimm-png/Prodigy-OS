---
name: prodigy-review
description: Prodigy OS의 주간 Evidence 학습 리뷰와 월간·분기·연간 근거 기반 회고를 준비한다. 기존 승인 경계를 유지하며 기간별 흐름, 예외, 사용자 코멘트와 복기를 연결한다.
---

# Prodigy Review

## 실행 경로

- 일간: 기존 Journal의 일기 작성·AI 분류·Evidence 승인 흐름을 사용한다. 이 스킬은 일간 분류기를 대체하지 않는다.
- 주간: 아래 Evidence Package → PRE → Formatter 계약과 `SYSTEM/Views/weekly-filter-ai.js`의 기존 AI 학습 분석을 유지한다. `weekly-filter-view.js`에서 날짜 이동, 지난 코멘트 복기, 선택 코멘트를 제공한다.
- 월간·분기·연간: `SYSTEM/Views/journal-narrative-view.js`의 `generate`가 기간별 구조화 초안을 생성한다. `SECTIONS`, `FOCUS`, `schema`, `validate`가 실행되는 출력 계약이다. 호출은 공통 `ProdigyAIConsumerRuntime`의 `journal.period_summary`를 사용한다.
- 기간별 저장과 하위 회고 수집은 `SYSTEM/Views/journal-period-store.js`를 사용한다. 실행 목적이 개발·검증이면 아래 실제 Vault 실행 절차 대신 합성 fixture 또는 격리 Vault를 사용한다.

## 장기 회고 지침

| 기간 | 분석 목적 | 출력 영역 |
|---|---|---|
| 월간 | 비교를 통해 배움을 구체화 | 주별 흐름, 반복, 예외, 중요한 한 번, 배울 점 |
| 분기 | 방향 판단 자료 제공 | 세 달의 변화, 주요 활동, 방향 변화, 배움 |
| 연간 | 다시 읽을 한 해 보존 | 분기별 흐름, 장면과 사람, 생각의 변화, 오래 가져갈 배움, 이야기 초안 |

- 결과는 `summary`, `source_paths`, `observations`다. 각 observation은 허용된 `kind`, `text`, 직접 근거가 된 `source_paths`를 가진다. 근거 없는 항목은 만들지 않으며 개수를 채우지 않는다.
- 하위 기간의 채택된 회고, 사람 코멘트·정정, 다음 방향, 선택한 장면, 항목별 근거를 전달한다. 같은 기간의 직전 회고에서는 코멘트·방향·선택 장면만 비교용으로 읽는다. 이전 기록을 현재 활동이나 완료 근거로 세지 않는다.
- 반복과 상충 사례를 함께 제시한다. 중요한 단발 경험은 반복 패턴과 구분해 보존한다. 주간 PRE의 반복 기준을 단발 경험이나 연간 이야기의 자격 조건으로 확대하지 않는다.
- 계획/실행/결과, 읽음/적용, 현재/과거를 구분한다. 기록 부재는 미실행이 아니다. 같은 원본의 재인용은 독립 근거가 아니다. 자료의 실제 기간과 불확실성을 드러낸다.
- 사용자 코멘트는 AI 재생성으로 변경하지 않는다. 재해석은 현재 회고의 `Retrospective Commentary`에 저장하고 과거 기록은 수정하지 않는다.
- 선택 장면은 `Selected Moments`, 채택한 항목은 `Review Observations` 본문에 한 번 저장한다. 새 Property나 별도 Knowledge 저장소를 만들지 않는다.
- 연결한 Object를 자동으로 AI에 보내지 않는다. 화면의 출처 목록과 실제 전송 자료가 일치해야 한다. 전체 Vault 검색, 첨부·연락처 자동 수집을 하지 않는다.
- 사람의 방향 판단·원칙 검증·Knowledge 승인을 대신하지 않는다. 월간 question_only는 관찰 기록이며 검증·후보 생성 자격을 부여하지 않는다. 분기·연간의 수동 방향은 현재 유지·유보·빈 응답을 허용한다.
- AI 출력은 화면에 표시할 초안이다. 명시적 저장 전에는 상위 회고가 읽지 않는다. 출처/대상 변경, 취소, 늦은 응답은 반영하지 않는다.

## 개발 검증

`tests/journal/test_journal_narrative_journey.js`, `test_journal_narrative_ui.js`, `test_journal_review_expansion.js`에서 합성 자료의 AI 출력 검증, 저장·복원, 상위 전달, 이전 코멘트와 원본 보존을 확인한다. 실제 Provider와 Mock Provider, 실제 Obsidian과 모의 DOM의 검증 결과는 구분한다. 실제 AI 확인에도 합성 자료만 전송하고 개인 원문은 로그나 테스트에 포함하지 않는다.

## When to Run

Run this skill when preparing a Weekly Review evidence package for:

> 이번 주의 경험에서 무엇이 반복되었고, 무엇을 배웠는가?

The weekly Evidence Package MVP only supports `review_type: learning` and `workspace: journal`.

## Sources

The builder may read:

- Daily notes for the requested ISO week under the current Daily journal path.
- Objects explicitly linked from the Daily Reflection sections.
- Current Object files needed only for short projections.

It must not scan the vault for vaguely related content or perform semantic search.

## Write Target

The builder may write the requested generated JSON package path and a sibling Markdown preview.
It must never rewrite Daily notes, Object notes, templates, dashboards, or source Markdown.

## Projection Rules

Daily evidence includes only:

- 성찰 / Reflection
- 변화 / Change
- 다음 실험 / Next Experiment
- 연관 참조 / References

Linked Object evidence includes only a short projection from existing summary, objective, decision, review, or key learning sections. If a safe projection cannot be identified, include a bounded excerpt and the source path.

## Limits

- Maximum Daily files: 7
- Maximum linked Objects: 10
- Maximum extracted characters per Daily section: 3,000
- Maximum extracted characters per linked Object section: 2,000
- Maximum total estimated characters: 30,000

When a limit is reached, the package must record a warning and keep source references.

## Validation

Before reporting success:

1. Run the weekly fixture test.
2. 사용자 자신의 주간 회고 실행인 경우에만 허용된 주차의 Vault에서 builder를 실행한다. 개발·테스트는 합성 fixture에서 실행한다.
3. Confirm source files were not modified by the builder.
4. Report package path, preview path, counts, warnings, and known limitations.

## PRE v1 (MVP)

Run PRE only after an Evidence Package exists.

One-command weekly pipeline (from vault root):

```bash
python3 SYSTEM/AI/Skills/prodigy-review/scripts/prodigy.py weekly --week YYYY-Www
```

Pipeline:

```text
Daily (ISO week, max 7)
  → Evidence Package JSON
  → PRE Review Result (patterns + pending principles)
  → Formatter Weekly View
  → MVP Draft Markdown (Weekly Summary / Patterns / Principles / Evidence)
```

Outputs under `SYSTEM/AI/Skills/prodigy-review/runs/<week>/` (not a PRE Workspace/Object):

- `weekly-learning-*.json` — Evidence Package
- `weekly-review-*.json` — Review Result
- `weekly-review-*-draft.md` — human-facing draft
- `weekly-workspace-view-*.md` — formatted view
- `pipeline.log` — scan / extract / pattern / principle counts

PRE rules:

- Reads Evidence Package only (no vault scan in PRE step).
- Pattern generation requires **≥3 Daily notes with content**; otherwise: `Not enough evidence.`
- Every pattern/principle includes evidence refs (provenance).
- Principles are always `status: pending` — never auto-approved, never applied.
- Must not create Knowledge, approve Principles, modify Objects, or rewrite Weekly journal notes.

## Formatter v1

Run Formatter only after a Review Result exists.

Formatter reads one Review Result JSON and writes one Weekly Review Markdown view.

Formatter must not read the Vault, inspect Evidence Packages, rerun PRE, modify the Review Result, generate insights, approve Principles, or update Weekly Notes.

The Weekly Review Markdown view is presentation only. Review Result JSON remains canonical.
