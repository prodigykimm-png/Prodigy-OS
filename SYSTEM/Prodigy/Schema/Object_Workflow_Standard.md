# Prodigy OS — Object Workflow Standard

> Object Lifecycle에서 Object Workflow로 명칭 변경.
> Object의 생애가 아닌 진행 흐름(Workflow)을 관리한다.
> Version: 0.2 (Sprint 5 — Lifecycle → Workflow, 5단계 → 6단계)

---

## 왜 Workflow인가

"Lifecycle"은 태어나고 죽는 생애 주기를 의미한다.
Prodigy OS가 관리하는 것은 Object의 생애가 아니라 **Object의 진행 흐름(Workflow)**이다.
Object는 Capture로 시작해 Done으로 끝나지만, 그 사이의 흐름은 Workflow가 제어한다.

---

## 상태의 본질: State Engine

`status`는 UI를 위한 표시값이 아니다.

`status`는 Prodigy OS 전체가 공유하는 **State Engine**이다.
Homepage, QuickAdd, Dashboard, AI — 모든 모듈이 이 상태를 참조한다.

**State Engine 원칙:**
1. Status는 OS 전체가 공유하는 State Engine이다.
2. Status는 UI를 위해 변경하지 않는다.
3. Display Layer에서만 번역(translate)한다.
4. Status Enum의 추가/변경은 Workflow Pattern을 따른다.

---

## 공통 Workflow Pattern (6단계)

```
┌───────────────────────────────────────────────────────┐
│  1. Capture     → 발견·등록. 아직 분석 전.             │
│  2. Analysis    → 조사·계획. 의사결정 전.              │
│  3. Decision    → 의사결정. Go/No-Go 확정.             │
│  4. Execution   → 실행·집행. 실제 작업.                │
│  5. Review      → 복기·학습. 결과 분석.               │
│  6. Done        → 종료. Homepage에서 제거.            │
└───────────────────────────────────────────────────────┘
```

### 단계별 정의

| 단계 | 의미 | Homepage 표시 | 특징 |
|---|---|---|---|
| **Capture** | Object를 시스템에 등록 | ❌ (아직 next_action 불명확) | 등록 직후 상태 |
| **Analysis** | 정보 수집, 분석, 계획 | ✅ 핵심 표시 대상 | `next_action`은 구체적 조사 |
| **Decision** | 의사결정 | ✅ 핵심 표시 대상 | Go/No-Go 확정 |
| **Execution** | 실제 실행·집행 | ✅ 진행 상황 추적 | 실행 중인 작업 |
| **Review** | 복기·학습 | ✅ Needs Review 섹션 | `review_status: pending` |
| **Done** | 종료·보관 | ❌ | Homepage에서 완전 제거 |

### 전이 규칙

- **Capture → Analysis:** `next_action`이 구체화되면 전이.
- **Decision → Execution:** Go 결정 시 전이.
- **Execution → Review:** 결과 확정 시 전이 (won/lost/completed).
- **Review → Done:** 복기 완료 시 `review_status: done` + status → `review_completed` 또는 `archived`.
- **모든 Done 상태:** Homepage에서 제외.

---

## Type별 Status Enum 매핑 (Workflow Pattern 기반)

공통 Pattern은 하나. Status Enum만 Object마다 다르다.

### Auction Case

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `watching` | Capture | 관심 물건 |
| `rights_analysis` | **Analysis** | 권리 분석 |
| `market_analysis` | **Analysis** | 시장 조사 |
| `profitability` | **Analysis** | 수익성 분석 |
| `site_visit` | **Analysis** | 임장 |
| `ready_to_bid` | Decision | 입찰 준비 |
| `bid_submitted` | **Execution** | 입찰 완료 |
| `won` | Review | 낙찰 |
| `lost` | Review | 패찰 |
| `review_completed` | Done | 복기 완료 |
| `archived` | Done | 보관 |

### Project

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `idea` | Capture | 아이디어 |
| `planning` | **Analysis** | 계획 중 |
| `doing` | **Execution** | 실행 중 |
| `reviewing` | Review | 복기 중 |
| `completed` | Done | 완료 |
| `archived` | Done | 보관 |

<details><summary>Project sub-status 예시 (Execution 하위)</summary>

선택적으로 추가:
- `editing` — 편집 중
- `filming` — 촬영 중
- `delivery` — 납품 중

이들은 `doing` → `editing` → `filming` → `delivery` 순으로 전이.
모두 Workflow 단계 `Execution`에 속함.

</details>

### Study

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `capture` | Capture | 등록 |
| `learning` | **Execution** | 학습 중 |
| `reviewing` | Review | 복기 중 |
| `completed` | Done | 완료 |
| `archived` | Done | 보관 |

### Workout

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `planned` | Capture | 계획 |
| `doing` | **Execution** | 진행 중 |
| `completed` | Review | 완료 |
| `reviewing` | Review | 복기 중 |
| `archived` | Done | 보관 |

### Reading

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `to_read` | Capture | 읽을 예정 |
| `reading` | **Execution** | 읽는 중 |
| `finished` | Review | 다 읽음 |
| `reviewing` | Review | 복기 중 |
| `archived` | Done | 보관 |

### Meeting

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `scheduled` | Capture | 예정 |
| `in_meeting` | **Execution** | 진행 중 |
| `completed` | Review | 완료 |
| `reviewing` | Review | 복기 중 |
| `archived` | Done | 보관 |

### Contact

| Status Enum | Workflow 단계 | Display |
|---|---|---|
| `identified` | Capture | 등록 |
| `engaging` | **Execution** | 접촉 중 |
| `connected` | Review | 연결 완료 |
| `archived` | Done | 보관 |

---

## Workflow 원칙

1. **Pattern은 하나, Enum은 자유** — 모든 Object는 6단계 Workflow Pattern을 따른다. 세부 Status는 Type마다 자유롭게 정의한다.
2. **Status는 State Engine** — UI 변경이 아닌 Workflow 변경 시에만 Status를 수정한다.
3. **Homepage 표시 = Analysis + Decision + Execution** — 이 세 단계가 "지금 관리해야 할 Object"다.
4. **Review 진입 시 복기 대상** — `review_status: pending` 자동 전이.
5. **Done = 시스템 종료** — Homepage에서 완전히 사라진다.

---

## 향후 자동화를 위한 인터페이스

Workflow Pattern이 정의되었으므로, QuickAdd·AI·Automation이 참조할 수 있는 인터페이스를 설계할 수 있다 (구현은 아님).

```yaml
workflow:
  capture:
    default_next_action: "조사 시작"
    auto_due_date: false
  analysis:
    homepage_visible: true
    default_next_action: "분석 계속"
  decision:
    homepage_visible: true
    transition_requires: "사용자 명시적 확인"
  execution:
    homepage_visible: true
    default_next_action: "진행 중"
  review:
    auto_review_status: "pending"
    homepage_section: "Needs Review"
  done:
    homepage_visible: false
```

이 인터페이스는 `Object_Behavior_Standard.md`에서 구체화한다.
