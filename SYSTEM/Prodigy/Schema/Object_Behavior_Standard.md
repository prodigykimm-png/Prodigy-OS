# Prodigy OS — Object Behavior Standard

> Object가 어떤 행동(Behavior)을 가져야 하는지 정의한다.
> 구현이 아닌 명세다. QuickAdd·AI·Automation이 이 명세를 참조한다.
> Version: 0.1 (Sprint 5)

---

## Behavior Layer의 위치

```
Object
  ↓
Property (Core_Property_Schema.md)
  ↓
Behavior (이 문서)
  ↓
View (view.js)
  ↓
Automation (QuickAdd, Meta Bind)
  ↓
AI (Object 분석, 연결 추천)
```

Template은 Behavior를 담는 형식일 뿐, Architecture의 중심이 아니다.
Prodigy OS는 Template 중심이 아니라 **Property → Behavior → View → Automation → AI** 계층 구조를 따른다.

---

## Behavior 정의 원칙

1. Behavior는 코드가 아니다. 이 문서는 명세(Specification)다.
2. 구현은 QuickAdd/AI/Automation이 각자 이 명세를 참조하여 수행한다.
3. Behavior가 변경되면 모든 구현체(View, QuickAdd, AI)가 함께 업데이트되어야 한다.
4. Status 전이는 Behavior의 핵심이며, State Engine 원칙을 따른다.

---

## Status Transition Matrix

### Auction Case

| 현재 Status | 권장 next_action | 다음 Status | 전이 조건 |
|---|---|---|---|
| `watching` | 권리분석 시작 | `rights_analysis` | 사용자 확인 |
| `rights_analysis` | 시세 조사 | `market_analysis` | 권리분석 완료 |
| `market_analysis` | 수익성 계산 | `profitability` | 시세 파악 완료 |
| `profitability` | 임장 예약 | `site_visit` | 수익성 기준 충족 |
| `profitability` | 입찰 준비 | `ready_to_bid` | 임장 불필요 시 |
| `site_visit` | 입찰 준비 | `ready_to_bid` | 현장 확인 완료 |
| `ready_to_bid` | 입찰 제출 | `bid_submitted` | due_date 도래 |
| `bid_submitted` | 결과 확인 | `won` 또는 `lost` | 경매 결과 발표 |
| `won` | 복기 시작 | `review_completed` | review_status → pending |
| `lost` | 실패 원인 분석 | `review_completed` | review_status → pending |
| `review_completed` | — | `archived` | review_status → done |

### Project

| 현재 Status | 권장 next_action | 다음 Status | 전이 조건 |
|---|---|---|---|
| `idea` | 계획 수립 | `planning` | 아이디어 구체화 |
| `planning` | 실행 시작 | `doing` | 계획 완료 |
| `doing` | 복기 준비 | `reviewing` | 모든 작업 완료 |
| `reviewing` | — | `completed` | review_status → done |
| `completed` | — | `archived` | 보관 결정 |

### Study

| 현재 Status | 권장 next_action | 다음 Status | 전이 조건 |
|---|---|---|---|
| `capture` | 학습 시작 | `learning` | 자료 확보 |
| `learning` | 복기 | `reviewing` | 학습 완료 |
| `reviewing` | — | `completed` | review_status → done |
| `completed` | — | `archived` | 보관 결정 |

### Workout

| 현재 Status | 권장 next_action | 다음 Status | 전이 조건 |
|---|---|---|---|
| `planned` | 운동 실행 | `doing` | 시간 확보 |
| `doing` | 복기 | `reviewing` | 운동 완료 |
| `reviewing` | — | `completed` | review_status → done |
| `completed` | — | `archived` | 보관 결정 |

### Reading

| 현재 Status | 권장 next_action | 다음 Status | 전이 조건 |
|---|---|---|---|
| `to_read` | 읽기 시작 | `reading` | 책 확보 |
| `reading` | 복기 | `reviewing` | 독서 완료 |
| `reviewing` | — | `finished` | review_status → done |
| `finished` | — | `archived` | 보관 결정 |

### Meeting

| 현재 Status | 권장 next_action | 다음 Status | 전이 조건 |
|---|---|---|---|
| `scheduled` | 회의 참석 | `in_meeting` | 회의 시작 |
| `in_meeting` | 결과 정리 | `completed` | 회의 종료 |
| `completed` | 복기 | `reviewing` | review_status → pending |
| `reviewing` | — | `completed` | review_status → done |
| `completed` | — | `archived` | 보관 결정 |

---

## 공통 Behavior 규칙

### Review 자동화

| 조건 | 동작 |
|---|---|
| status가 `won`, `lost`, `finished`로 전이 | `review_status` → `pending` |
| status가 `review_completed`로 전이 | `review_status` → `done` |
| `review_status: done` + status 종료 | Homepage에서 제외 |

### Homepage 표시 조건

| Workflow 단계 | Homepage 표시 |
|---|---|
| Capture | ❌ (`next_action`이 아직 없음) |
| Analysis | ✅ Today/Continue |
| Decision | ✅ Today/Continue |
| Execution | ✅ Today/Continue |
| Review | ✅ Needs Review 섹션 |
| Done | ❌ |

### `next_action` 자동 제안

Status 전이 시 권장 `next_action`이 자동으로 채워질 수 있다 (QuickAdd 구현 시).
사용자는 언제든 직접 수정할 수 있다. 자동 제안은 기본값일 뿐.

### `due_date` 자동 설정 제안

| 전이 | 권장 due_date |
|---|---|
| `watching` → `rights_analysis` | 7일 후 |
| `ready_to_bid` → `bid_submitted` | `auction_date` 당일 |
| `bid_submitted` → `won`/`lost` | `auction_date` + 1일 |

---

## Behavior 확장을 위한 인터페이스

향후 AI와 Automation이 Behavior를 활용할 수 있도록, 이 문서는 다음 인터페이스를 명세한다 (구현은 아님).

```yaml
behavior:
  transition:
    from: watching
    to: rights_analysis
    suggested_next_action: "권리분석 시작"
    auto_set:
      review_status: null
    requires_confirmation: true

  homepage_condition:
    include:
      - status NOT IN [completed, review_completed, archived]
      - next_action IS NOT null
    sections:
      today:
        - due_date <= TODAY + 7d
      continue:
        - due_date IS null OR due_date > TODAY + 7d
      needs_review:
        - review_status = "pending" OR status IN [won, lost]

  review_condition:
    trigger_when: status IN [won, lost, finished]
    action: SET review_status = "pending"
    complete_when: status = "review_completed"
    final_action: SET review_status = "done"
```

---

## Template vs Behavior

| Template | Behavior |
|---|---|
| Property 목록 | Property가 어떻게 바뀌는지 |
| 정적 구조 | 동적 전이 규칙 |
| "무엇이 들어가는가" | "어떻게 변하는가" |
| Templater가 처리 | QuickAdd·AI·Automation이 참조 |

Template는 Behavior를 담는 그릇.
Behavior는 Template이 아니라 이 문서가 정의한다.
