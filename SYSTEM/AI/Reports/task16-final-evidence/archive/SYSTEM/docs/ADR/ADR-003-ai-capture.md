# ADR-003: AI Capture — 사람은 최소한만, AI가 구조화

**Status:** Accepted

**Date:** 2026-07-06

---

## Context

기존 Obsidian 방식은 사용자가 Template를 선택하고, 폴더를 지정하고, Property를 수동으로 입력해야 했다. 이는:

1. Capture 속도를 저하시킨다 (3초 안에 시작 불가능).
2. 사용자에게 구조화 부담을 전가한다.
3. 일관된 데이터 품질을 보장할 수 없다.

---

## Decision

Capture 단계에서는 사용자가 **최소한의 정보만 입력**하고, AI가 Parsing·Classification·Property Extraction을 수행한다. Public 상태는 정확히 `capture_started` → `ai_proposal` → `human_review` → `human_confirmed` → `object_committed`다. Terminal outcome은 `rejected`, `cancelled`, `no_change`, `stale`, `conflict`, `error`다. Authorization, lock, mutation request는 private metadata이며 상태가 아니다.

첫 번째 genuine trusted click 또는 Enter/Space interaction은 exact proposal을 `human_review`로 화면에 렌더하고 0회 저장한다. 사용자가 target, exact payload summary/diff, proposal ID, internally computed SHA-256, current revision을 확인한 뒤 같은 live mount/session/review에서 수행한 별도의 두 번째 Confirm interaction만 `human_confirmed` authority를 만들 수 있다. Review evidence는 review ID, human identity, timestamp, session, proposal ID, target, payload hash, current revision을 묶고 confirmation은 그 exact review와 모든 binding을 참조한다.

Payload binding은 caller-supplied hash가 아니라 contract가 canonical `{ target_path, payload }`에서 계산한다. Intent와 confirmation은 expiring, single-use, disposal-bound capability다. Writer는 process-wide target lock, preflight revision, mutation boundary의 immediate `expected_revision` 검사, 저장 후 returned path와 canonical reread SHA-256 검증을 통과한 경우에만 payload-free receipt와 `object_committed`를 발급한다. 재시도하지 않는다. Thrown/wrong-result/reread mismatch는 1 attempted canonical mutation / 0 accepted committed writes이고, pre-confirm/reject/cancel/stale/conflict는 0 / 0이다.

Home/People creation, Workout program/replacement/import, Daily missing-People, Knowledge PARA Area/Documentation은 이 경계를 사용한다. Intentional direct controls are limited to manual People memo/interaction/edit/delete, approved existing-person insight append, and manual Workout operational edits; missing-person creation and imports remain Capture proposals.

Capture에서 묻지 않는 것: Folder, Tag, Property, Workflow.

---

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| 수동 입력 (기존 Obsidian 방식) | Rejected | 느리고, 데이터 품질 불균일 |
| 자동 입력 (규칙 기반) | Rejected | 경매 PDF 등 비정형 데이터 처리 불가 |
| **AI Capture** | **Accepted** | 비정형 입력 처리, 자동 분류, Property 추출 |

---

## Consequences

### 장점
- Capture 속도 3초 이내 달성 가능
- 데이터 일관성 — AI가 일관된 Property를 생성
- 사용자가 구조화 부담에서 해방

### 단점
- AI 의존도 증가
- AI 오분류 시 사용자가 검토 단계에서 수정하거나 거절해야 함
- 검토·확인과 writer authorization을 분리하는 상태 관리 비용
- 초기 AI 파이프라인 구축 비용

---

## Related Documents
- 04_Capture_System.md
- 06_AI_System.md
- 01_Architecture.md
