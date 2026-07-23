# Prodigy OS Operating Guide v1.1

> "폴더를 고민하지 말고, '이게 무엇인가?'를 생각하라."

---

# 1. Purpose & OS Philosophy

Prodigy OS는 다음과 같은 주체와 계층 간의 철저한 역할 분리를 지향한다.

* **Home = Mission Control**: 대시보드를 총괄하는 지휘 통제 센터이자, 맥락 파악 ➡️ 의사결정 ➡️ 특정 워크스페이스 진입의 출발점.
* **Workspace Dashboard = Domain Operations**: 프로젝트, 경매, 독서 등 특정 도메인의 세부 실무가 독립적으로 이루어지는 개별 워크스페이스.
* **Todoist = Execution**: 구체적이고 액션 단위로 잘게 쪼개진 태스크의 실행 계층.
* **Objects = Knowledge**: 정보의 속성과 관계를 담아 구조화한 지식 자산 계층.
* **AI = Recommendation**: 축적된 데이터 맥락을 수집·분석하여 우선순위와 가이드를 제시하는 제안 엔진.
* **Human = Approval**: AI 제안을 편집 및 승인하고 실제 행동으로 옮기는 최종 통제 주체.

이 문서는 이러한 철학 하에 설계된 Prodigy OS를 일상 업무에서 어떻게 조작하고 활용하는지에 관한 실제적 운영 방법을 정의한다.

> 시스템 구조: [SYSTEM/docs/01_Architecture.md](SYSTEM/docs/01_Architecture.md)
> 핵심 개념: [SYSTEM/docs/02_Core_Concepts.md](SYSTEM/docs/02_Core_Concepts.md)

---

# 2. Operating Loop

Prodigy OS의 일상 운영은 독립 기능의 모음이 아니라 **연속 루프**이다.

```text
Morning Brief
  ↓
Today's Focus
  ↓
Workspace Execution
  ↓
Daily Reflection (2분 Review)
  ↓
Weekly Review (PRE)
  ↓
Morning Brief
```

- **Morning Brief**: 오늘 Focus, 기한, **어제 배움**, **오늘 실험**을 1분 안에 읽는다. 어제의 Reflection에서 유용한 정보만 회수한다.
- **Today's Focus**: 사람이 승인한다. AI는 제안만 한다.
- **Workspace**: Auction / Reading / Project / Workout에서 실제 실행한다.
- **Daily Reflection**: 사람이 작성하는 증거다. AI가 성찰을 대신 쓰지 않는다. 오늘 Focus 완료 여부를 자연스럽게 돌아본다.
- **Weekly Review (PRE)**: 증거 기반 주간 회고. 자동 Memory 승격 없음. 사람 승인 필수.
  - **사람이 읽을 파일**: `SYSTEM/AI/Skills/prodigy-review/runs/<주차>/weekly-review-<주차>-draft.md`
  - workspace view · operation report 는 내부/보조 산출물이다. Home의 **주간 복기 초안 열기**가 draft를 연다.
- **Memory**: 사용자 단계가 아니다. Morning Brief가 내부에서 검증된 맥락을 읽을 수 있으나, Home에 Memory 워크플로를 노출하지 않는다.

### 부동산 지역 분석 (Region Resource)

경매 Object는 지역 키를 가진다: `region_sido` · `region_sigungu` · `region_dong`.
지역 **Resource**는 재사용 가능한 시장 근거·시계열이다 (내부 type: `auction_region`, 표시: 부동산 지역 분석).

```text
PARA/RESOURCES/Auction Regions/{시도}-{시군구}.md
계약: SYSTEM/docs/Region_Property_Contract_v1.md
```

- Auction 카드 **지역** 버튼 → 노트 열기/생성
- **시군구 Object only** (동은 Case·권역 표)
- 계약 **Version 1.4.0 Operational**: R-ONE 공개 통계표 + 공식 CSV 어댑터 + 본문 조사 소유권. 숫자는 Freeze된 어댑터로만 쓰고 사람 확인 전 `unverified`
- **FM = 최신 canonical**, 본문 표 = 한글 표시(어댑터가 FM에서 재생성), 히스토리 = JSON 스냅샷
- 히스토리: `snapshot_id` · 중복 시 replace · raw `SYSTEM/CACHE/region-metrics/` + sha256
- `verification_status` 집계: 하나라도 unverified → unverified; 전부 verified → verified; 아니면 partial
- 숫자·산식 = 코드. AI = Evidence only
- 월간 반영: `region-metrics-refresh.js`로 cache 생성 → `region-metrics-apply.js --dry-run` 확인 → flag 제거 후 기존 Region Object에 원자 갱신
- writer는 실제 Object를 생성하지 않으며 지역키·전체 snapshot·history가 모두 유효할 때만 write
- 본문 조사: 공식 사실=`AUTO`, AI 해석·권역·체크리스트=`AI:PENDING`, 현장 경험·승인=`HUMAN:OWNED`
- **Region Experience 반영**: Daily Evidence가 먼저 저장된 뒤, 사람이 후보 하나를 명시 선택해 `human_confirmed`로 append한다. AI/provider·adapter·research/metrics writer는 append할 수 없고, 기존 Region만 정확한 시군구 identity로 대상으로 삼는다. `transport_life`/`risk`는 각 `HUMAN`, `site_visit`/`supply_observation`은 임장 포인트 `HUMAN:OWNED`에만 기록한다. 같은 Daily path+Evidence ID 재시도는 no-op이며, Region 반영 실패 뒤에도 Daily는 보존되어 retry 가능하다. 새 소유 marker 또는 template block marker는 만들지 않는다. 단, 승인된 사람이 확인한 append 항목에 바로 붙는 인라인 `REGION_EXPERIENCE_PROVENANCE` 주석은 idempotency 전용이며 marker block·writer 소유권·research/metrics writer 입력이 아니다.
- `supply_observation`은 사용자 임장 관찰이며 append prose는 저장된 `direct_observation`과 verbatim으로 정확히 같아야 한다. AI/provider는 이를 요약·해석·추론·보강할 수 없다. 공식 공급 pipeline·사업명/단지명·단위/월/수치가 아니며, 어떤 후보 category든 공식 공급 또는 planned move-in 수량은 거부한다. 이 action은 Object 생성, Knowledge 저장·승인·승격, frontmatter/metrics/history/marker/template migration을 수행하지 않는다.
- Dataview Hub가 로드하는 `SYSTEM/Views/` 코드는 모두 사용자가 신뢰한 local executable code다. Vault sync/write 접근은 사용자의 기존 Obsidian/Dataview 신뢰 경계이며 비신뢰 콘텐츠 sandbox가 아니다. 신뢰하지 않는 vault sync origin에서 온 `SYSTEM/Views/` 코드는 실행하지 않는다.
- `move_in_24m` (기간 부족 시 null). `auction_bid_rate_6m` v1 null
- 상권·학군·호재 = 본문 Evidence
- 물건 브리핑: `prodigy-auction-brief` (입찰가 확정 금지)

어제 Reflection이 비어 있으면 Home에 **가벼운 알림**만 보여 준다. 워크플로를 막지 않는다.

---

# 3. Core Usage Rules

## 3.1 Start from Home

Home은 시작점이다.
Home을 열면 오늘 해야 할 일, 진행 중인 Object, Capture, Review가 보인다.
폴더부터 열지 않는다. Home을 먼저 연다.

### Home = Mission Control

Home은 링크 모음이 아니다. **오늘 무엇을 할지 결정하는 Mission Control**이다.
화면 라벨은 **한글**이다 (`HUB/00 Home.md`).

```text
Home (오늘 · Mission Control)
  ↓ 결정 / 이동
아침 브리핑
  ↓
오늘의 집중     (승인된 항목만 · Home에서 필드 편집 안 함)
  ↓
이어하기        (최대 4 · Object Engine · 완료 제외)
  ↓
주의가 필요함   (critical · high · 이유)
  ↓
빠른 실행       (+ 새 Object · 오늘 Daily · 검색)
  ↓
Todoist         (오늘 건수 · Todoist 열기 · 목록 복제 안 함)
  ↓
Workspace 런처  (무엇이 기다리는가?)
  ↓
시스템 상태
  ↓
Workspace Dashboard  (실행 / 기록 / 복기)
  ↓
Object
```

- Home은 Workspace를 대체하지 않는다. 실행은 Workspace에서 한다.
- 각 런처 카드는 **Primary Action 하나** (이어하기 / 시작 / 열기).
- 카드: Icon · Name · Context · Title · Detail · Action.
- Context는 가능하면 **Continue** + 대기 중인 작업 제목.
- 빈 상태는 가짜 데이터 없이 표시한다.
- **모바일/좁은 화면**: Brief · 집중 우선, 하부는 `더 보기`로 접는다.
- 상세 사용자 매뉴얼: [09_Obsidian_Manual.md](09_Obsidian_Manual.md).

### Object Engine Runtime

Objects는 Source of Truth이다. **Object Engine Runtime**은 공유 운영 레이어다.

```text
Objects
    ↓
Object Engine Runtime
    ↓
Lifecycle
    ↓
Health
    ↓
Attention
    ↓
Next Action   (canonical passthrough only — never invented)
    ↓
Continue Target
    ↓
Home · Morning Brief · Launcher · Workspace
```

- **Derived state is not stored in YAML.**
- **Next Action**: Object에 있는 값만 노출. 없으면 `null`. 생성·추론하지 않는다.
- **Continue Target**: Continue를 누르면 갈 Workspace Dashboard + 대상 Object + action label + reason.
- Launcher / Morning Brief / Auction·Reading·Workout·Project 는 동일 Runtime을 소비한다.
- Engine 실패 시 각 소비자는 기존 로컬 로직으로 폴백한다.

### Object Engine (공유 운영 지능)

Object Engine은 **분류기가 아니다.**
OS 전역의 **운영 Object 지능**을 소유한다. Workspace UI는 자체 추론을 두지 않고 Engine을 소비한다.

```text
ObjectEngine
  · classify()           입력 → 생성 후보 유형 + 이유
  · getLifecycle()       Healthy / Needs Action / Needs Review / Stale / Completed + reason
  · getAttention()       critical|high|normal|low|none + reasons
  · findDuplicates()     유사 Object 힌트 (생성 차단 없음)
  · getContinueTarget()  이어하기 대상 (Workspace + Object + reason)
  · listCreatableTypes / registerCreatableType
  · evaluateObject(s)    공통 런타임 상태 (내부·고급 소비자)
```

- Lifecycle / Attention은 **계산만** 한다. YAML에 저장하지 않는다. 새 Property를 만들지 않는다.
- 모든 결과는 **설명 가능**해야 한다 (reason / reasons).
- 하위 호환 별칭: `classifyInput` ≡ `classify`, `findSimilarObjects` ≡ `findDuplicates`.

### Morning Brief + Object Engine

Home is **Mission Control** — answers only “What should I do now?”

Morning Brief is an **adapter**. Object Engine is the **shared operational rule layer**.

```text
Objects
    ↓
Object Engine (lifecycle · attention · next_action · reasons)
    ↓
Morning Brief Context  (buildMorningBriefContext)
    ↓
Home Mission Control:
  Brief → Focus → Continue → Needs Attention
  → Quick Actions → Todoist → Launcher → System Status
```

- **Single evaluation**: Home builds `briefContext` once; Workspace Launcher reuses `engine_states` (no second vault/object scan).
- **Needs Attention** shows **critical · high** only. Each card always has **WHY** (merged reasons). Normal is hidden.
- **Continue** reuses engine `continue_by_workspace` + package candidates (max 4; no completed Objects).
- **Today's Focus** shows **approved** items only (max 3). Home does not edit Focus fields.
- Same Object appears **once**; reasons from engine + package risk are merged.
- Engine failure → package risks only; Home and Launcher still run (graceful degrade).
- Morning Brief never edits Objects. Navigation reuses existing Workspace / Object open paths.
- Attention path: **no AI** (deterministic only).
- **System Status** is tiny: Object Engine / Sync / Review Queue counts only.

### Universal Object Creator

Home / Launcher의 **+ 새 Object** (⌘/Ctrl+N on Home) 가 **모든 Object 생성 입구**다.

```text
입력
  ↓
Object Engine.classify()  (결정론 · AI 없음 · vault 스캔 없음)
  ↓
유형 제안 + 이유 + findDuplicates() 유사 Object (최대 3)
  ↓
사람 확인 — 기존 Object 열기 또는 계속 만들기
  ↓
기존 생성 흐름 (Project Wizard · People · Reading · …)
```

- Creator는 **어댑터**다. 스키마·템플릿·워크스페이스 생성 구현을 복제하지 않는다.
- 분류 실패 시 **저널** 폴백 + 이유 표시. 생성은 항상 사람이 확인한다.
- When similar Objects are detected, Universal Creator lets the user **open an existing Object** or **continue with a new creation**. Duplicate detection never blocks creation.
- When **Project** is selected, the Creator input is handed to the existing Project Wizard as the initial project name.

## 2.2 Capture Postpones Decisions

Capture는 단순한 임시 보관함이 아니다.
Capture는 **결정을 미루는 공간**이다.

사용자는 정보가 들어왔을 때 즉시 분류하지 않는다.
대신 정보를 보존한 뒤 나중에 결정한다.

- 흥미로운 글
- 떠오른 아이디어
- 스크린샷
- 이메일
- 빠른 메모
- 웹 페이지

이 모든 것은 언제든지 Capture에 남을 수 있다.
사용자가 나중에 "이게 무엇인지" 결정할 때까지 기다린다.

Capture에 있는 정보는 가능한 빨리 Object로 변환한다.
Capture가 쌓이면 정기적으로 검토한다.

## 2.3 Object is the Source of Truth

모든 정보는 Object에 저장한다.
Property는 구조화된 데이터, Content는 사람이 읽는 내용.
계산은 Dashboard가 한다. Object는 저장만 한다.

## 2.3.1 Object Lifecycle is Calculated

Object Lifecycle은 Object의 운영 상태를 규칙으로 계산한다.

- Lifecycle은 YAML에 저장하지 않는다.
- Lifecycle Property를 만들지 않는다.
- 사람이 수동으로 Lifecycle을 편집하지 않는다.
- AI가 Lifecycle을 추론하거나 수정하지 않는다.

기본 상태:

| 내부 값 | 표시 |
|---------|------|
| `healthy` | 정상 |
| `needs_action` | 다음 행동 필요 |
| `needs_review` | 복기 필요 |
| `stale` | 오래 방치됨 |
| `completed` | 완료 |

### Lifecycle Rule Registry

Lifecycle 규칙은 엔진 본문이 아니라 **Rule Registry**에 모인다.

- Global Defaults: `stale_days: 30`, `review_warning_days: 0`
- Workspace Overrides: 확장 지점만 준비되어 있다. 현재는 기본값과 동일하게 동작한다.
- Terminal Registry: 종료 상태는 `isTerminal(status)`로 판정한다.
- Review hook: Review 완료 여부는 추측하지 않는다. 알려진 필드/훅만 사용한다.

### Lifecycle Reason

모든 Lifecycle 결과는 다음 형태를 가진다.

```text
{ state, reason, warnings }
```

Reason은 결정적이며 AI가 생성하지 않는다.

예:

- Needs Action → `Missing next_action.`
- Needs Review → `Review pending.`
- Stale → `Last updated 43 days ago.`
- Completed → `Terminal status.`
- Healthy → `No lifecycle warnings.`

Home, Morning Brief, PRE, Workspace는 같은 Reason API를 소비한다.
설명 로직을 각 화면에서 복제하지 않는다.

Home의 **Object Lifecycle** 카드는 주의가 필요한 요약만 보여 준다.
각 Workspace의 Lifecycle 카운트는 동일한 계산 엔진을 재사용한다.

## 2.4 Journal Records Reflection, Not All Work

Journal은 하루를 돌아보는 기록이다.
업무 로그가 아니다.
무엇을 했는지보다 무엇을 배웠는지, 어떻게 느꼈는지를 기록한다.

## 2.5 Knowledge Grows Over Time

Knowledge Object는 한 번에 완성되지 않는다.
시간이 지나며 Content가 추가되고, 연결이 확장된다.
새 Knowledge를 만들기 전에 기존 Knowledge를 업데이트할 수 있는지 확인한다.

### C1–C5 Knowledge Decision Loop — Operating Contract

이 루프는 자동 지식 생성 장치가 아니라, 사람이 근거를 읽고 다음 행동을 승인할 수 있게 하는 운영 순서다. **AI는 Evidence를 정리하고 Candidate·연결·요약을 제안할 수 있지만, Candidate 저장·승인·Knowledge 승격·입찰 결정을 자동으로 실행하지 않는다.** 사람은 언제나 저장, 반려, 승인, 실제 행동의 최종 주체다.

```text
C1 Candidate lifecycle
  → C2 Evidence Quality
  → C3 Decision Packet
  → C4 Auction decision / review
  → C5 Reading learning loop
```

| Gate | 운영 계약 | 사람의 결정 |
|---|---|---|
| C1 Candidate lifecycle | `knowledge_candidate`는 `proposed → saved → approved` 또는 `rejected`만 따른다. `approved`/`rejected`는 terminal이며, `approved`에는 동일한 `promotion_target`과 `promoted_knowledge`가 있어야 한다. 후보에는 Evidence 본문을 복사하지 않고 stable Evidence ID와 명시적 source Object만 남긴다. `source_type: monthly_validation`은 Weekly 검증에서 온 Candidate를 식별한다. | 후보를 저장·반려하고, Knowledge 승격을 승인한다. |
| C2 Evidence Quality | Evidence는 `invalid` · `thin` · `usable` · `strong`으로 계산한다. `invalid`는 승격 불가, `thin`은 사람이 override와 승인 사유를 함께 남길 때만 진행 가능하며, `usable`/`strong`도 자동 승격 근거가 아니다. | 증거 보완 여부와 thin override를 판단한다. |
| C3 Decision Packet | Packet은 검증된 Knowledge, 동일 시·군·구 `auction_region`, 직접 연결·같은 지역·주제의 이전 Decision만 결정적으로 모은다. Candidate와 범용 자료는 정식 Knowledge처럼 섞지 않으며, 빈 결과와 경고도 숨기지 않는다. | Packet을 참고해 실제 판단을 내린다. |
| C4 Auction | 경매는 조사 → 분석 → Packet 참고 → 입찰/포기 → 결과 → 복기 순서다. 지역 자료와 AI 분석은 참고 근거이고, 입찰가·입찰 여부·결과 기록의 소유자는 사람이다. | 입찰·포기·최종 입찰가·복기 완료를 결정한다. |
| C5 Reading | Reading Session의 핵심 내용·생각 변화는 Candidate를 제안할 수 있으나, Candidate 저장과 정식 Knowledge 승격은 C1/C2의 사람 승인 게이트를 다시 통과한다. | 읽기 기록의 저장, Candidate 검토, Knowledge 승격을 결정한다. |

**C4 → C5 순서를 바꾸지 않는다.** Auction의 현재 의사결정은 먼저 C3 Packet과 C4의 실제 결과·복기로 닫는다. Reading의 배움은 별도 Evidence/후보로 축적되며, 경매 입찰을 자동으로 대체하거나 역으로 승인하지 않는다.

#### C6 Deferred Activation

C6는 현재 **deferred**다. C1–C5 밖의 자동 실행·자동 승격·자동 의사결정 연결은 활성화하지 않는다. C6을 열려면 사람이 별도로 목적, 입력 Evidence 범위, 쓰기 대상, 취소/실패 동작, 직접 테스트 및 승인자를 확정해야 한다. 이 조건 전에는 C6용 Dashboard, writer, schedule, smoke 제외 항목을 추가하지 않는다.

#### C1–C5 Smoke Baseline

다음 명령은 모든 C1–C5 직접 suite를 순서대로 실행한다. 누락 파일, 실행 실패, skip 신호는 실패다. 선택 실행 옵션은 제공하지 않는다.

```bash
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/run_knowledge_decision_loop_tests.js
```

- **유일한 알려진 제외**: `tests/auction/test_auction_region.js`. 현재 이 test는 `.opencode/skills/prodigy-auction-brief/SKILL.md`에 inline `region_sigungu` 계약이 있다고 가정하지만, 실제 파일은 canonical skill로 연결하는 discovery adapter라서 baseline에서 실패한다. 이는 pass로 바꾸거나 숨기지 않는다.
- 재현: `node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/run_knowledge_decision_loop_tests.js --verify-known-region-baseline`. 이 명령은 현재의 `region_sigungu` assertion failure만 알려진 baseline으로 인정한다. 통과하거나 다른 오류가 나면 smoke 계약 자체가 실패한다.
- 제외를 해소하려면 별도의 계약 변경과 직접 test 수정·검토가 필요하다. 이 운영 기준선 작업에서는 이를 수정하지 않는다.

### Knowledge Explorer 탐색과 오늘의 브리핑

### 지식 작성과 자료 정리 — 두 개의 직접 입력 경로

`HUB/50 Knowledge.md` 상단의 **+ 지식 작성**과 **+ 자료 정리**는 Daily Reflection이나 Reading 없이도 지식과 자료를 직접 입력하는 경로다.

- **+ 지식 작성**: 사람이 직접 공부하거나 경험한 내용을 `knowledge_candidate`로 저장한다. AI 없이도 저장 가능하며, `source_note`(어디서 배웠는지)이 필수다. 저장된 후보는 `검증 대기`에서 사람이 승인해야 정식 Knowledge가 된다.
- **+ 자료 정리**: 기사·칼럼·YouTube·인강·논문·공식 문서를 `literature_note` Resource로 저장한다. `단일 자료`와 `오늘의 자료 묶음` 두 탭이 있다.
  - **단일 자료**: URL(선택), 제목, 출처 주장, 내 해석, 재사용 가능한 지식을 직접 입력한다.
  - **오늘의 자료 묶음**: 1~20개 URL을 넣고 `기사 가져오기`를 누르면 공개 페이지 텍스트를 가져와 AI가 항목별 요약을 만든다. 각 항목에 사람의 한 줄 판단이 필수이며, 없으면 저장되지 않는다.
- 두 경로 모두 저장 후 `검증 대기`로 들어가며, AI가 Candidate나 Knowledge를 자동 생성·승인하지 않는다.
- `application_trigger`(언제 이 지식을 쓸지)와 `application_contexts`(어떤 도메인/주제에서 쓸지)는 후보→승인→Knowledge 전 과정에서 보존된다.
- URL 가져오기는 HTTP(S) 공개 페이지만 지원하며, 로그인·유료벽 우회·영상 다운로드를 하지 않는다. 실패 시 사용자가 직접 텍스트를 입력하는 fallback이 제공된다.
- 배경 크롤링, 사용 통계, 분석 대시보드, Knowledge 피드백 텔레메트리는 현재 구현하지 않는다.

`HUB/50 Knowledge.md`의 **지식 탐색기**는 도메인 → 주제 또는 자료 → 상세의 순서로 검증된 지식과 근거를 읽는 화면이다. 제목과 브리핑의 출처 경로는 `옆에 열기`로 현재 탐색기를 보존한 채 분할 패널에서 연다.

- `knowledge`는 사람이 검증한 재사용 가능한 정식 Knowledge다.
- `permanent_note`는 기존 파일을 읽기 위한 legacy Knowledge다. 자동으로 `knowledge`로 바꾸지 않는다.
- `literature_note`, `venue`, `auction_region`은 각각의 전용 계약을 가진 보조 자료(Resource)다. 범용 `resource` type을 만들지 않는다.
- 상세의 **오늘의 브리핑**은 도메인 안의 결정적 사실·명시적 출처를 항상 먼저 보여 준다. `AI 요약 만들기`는 사용자가 명시적으로 선택했을 때만 주입된 제공자 서비스에 보조 요약을 요청한다.
- AI 요약은 Knowledge를 생성·수정·승인하지 않으며, 사람이 이를 사용·적용·검증했다고 주장하지 않는다. 제공자 오류, 취소, 잘못된 응답에는 간단히 가린 오류 상태와 결정적 브리핑·출처·재시도 동작이 남는다.
- 이 브리핑은 Home Morning Brief, Daily Reflection, PRE와 별개의 Explorer 내부 기능이다. Hub를 열기만 해서는 네트워크 요청을 하지 않는다.

기존 지식의 분류 누락은 먼저 `node SYSTEM/SCRIPTS/knowledge-explorer-audit.js --path <대상 경로>`로 dry-run 점검한다. 제안은 사람이 검토하고, 이 감사는 원본 Object·Daily·PRE를 수정하거나 자동 backfill하지 않는다.

## 2.6 Projects Have an End

Project Object는 끝이 있는 작업이다.
완료되면 Archive한다.
Project가 계속되면 Knowledge Object로 전환을 고려한다.

## 2.7 Investment Objects Require Human Decision

Investment Object는 사람이 최종 결정을 내린다.
AI는 분석하고 추천하지만, 입찰 여부는 사람이 결정한다.

## 2.8 AI Recommends, Humans Decide

AI는 분류, 요약, 연결, 제안을 한다.
AI는 Object 생성을 자동으로 실행하지 않는다.
AI는 최종 결정, 삭제, 중요한 데이터 변경을 하지 않는다.

**모든 Object는 사람의 소유이다.**
AI는 Object 생성을 추천할 뿐이다.
사람이 확인한 후에만 Object가 생성되거나 업데이트된다.

---

# 3. Daily Operating Flow

```text
아침
  │
  ▼
Home 열기
  │
  ▼
🔥 Today 확인 (오늘 해야 할 일)
  │
  ▼
▶ Continue 확인 (진행 중인 Object)
  │
  ▼
📥 Capture 확인 (미결정 정보 검토)
  │
  ▼
Object 작업 (읽기, 업데이트, 결정)
  │
  ▼
새 입력 발생 → Capture
  │
  ▼
저녁
  │
  ▼
🔁 Review (오늘 업데이트된 Object 검토)
  │
  ▼
Journal (하루 돌아보기)
  │
  ▼
next_action 설정
```

---

# 4. When to Create What

| 상황 | 생성 / 업데이트 |
|------|----------------|
| 새로운 정보 발견 | Capture에 저장 → 나중에 결정 |
| 공부 / 학습 | Knowledge Object 생성 또는 업데이트 |
| 새로운 프로젝트 / 아이디어 | Project Object 생성 |
| 운동 / 건강 데이터 | Personal Object 업데이트 |
| 투자 대상 발견 | Investment Object 생성 |
| 하루 돌아보기 | Journal 생성 |
| 기존 주제의 새로운 내용 | 기존 Object 업데이트 |

---

# 5. Scenario-Based Workflows

## Scenario 1 — 새로운 정보를 발견했다

```text
1. Capture: URL, PDF, 스크린샷, 메모를 Capture에 저장
2. AI가 정보를 분석하여 Object Type 추천
3. 사람이 Object Type 확인
4. AI가 Object 생성 추천
5. 사람이 확인 → Object 생성 또는 업데이트
6. Property 검토
7. 필요시 Knowledge Object 연결
```

- 새로운 정보는 무조건 Capture에 먼저 저장한다.
- 분류는 나중에 한다. 지금 당장 분류하지 않아도 된다.
- AI는 Object 생성을 추천할 뿐, 자동으로 생성하지 않는다.
- 사람이 "이게 뭐야?"를 결정한 후에야 Object가 생긴다.

**핵심:** 정보가 들어오면 먼저 Capture. 나중에 분류.

---

## Scenario 2 — 공부 / 학습

```text
1. Capture: 읽은 내용, 필기, 링크를 Capture에 저장
2. AI가 기존 Knowledge Object와의 중복 확인
3. 기존 Knowledge가 있으면 → Content에 추가 (업데이트)
4. 기존 Knowledge가 없으면 → 새 Knowledge Object 생성 추천
5. 사람이 확인 → Object 생성 또는 업데이트
6. 관련 Knowledge Object와 연결
7. 나중에 Project나 Investment에서 재사용
```

- Knowledge Object는 시간이 지나며 성장한다.
- 새로운 Knowledge를 만들기 전에 기존 Knowledge를 확인한다.
- Knowledge는 재사용 가능해야 한다.
- AI는 업데이트를 추천할 뿐, 자동으로 실행하지 않는다.

**핵심:** 기존 Knowledge가 있으면 업데이트. 없으면 새로 생성.

### 관련 기억

Reading Dashboard의 각 책 카드에서 `관련 기억`을 누르면 현재 책과 연결되는 이전 독서 기록을 최대 5개까지 확인할 수 있다. 같은 주제, 같은 개념, 같은 저자, 직접 연결, 같은 지식 링크, 유사한 주장, 이전 생각 변화처럼 기존 기록에서 확인되는 관계만 표시한다.

- `왜 표시되었나요?`에서 관계의 실제 근거를 확인한다.
- `책 열기`는 파생 Memory 파일이 아니라 원본 Reading Object를 연다.
- `기억 새로고침`은 변경된 독서 기록만 다시 반영하며 원본 Object를 수정하지 않는다.
- 결과가 없는 경우는 오류가 아니다. 충분한 결정적 관계가 없다는 뜻이다.
- 불러오기에 실패하면 `다시 시도`를 사용한다. Reading Dashboard와 기존 독서 동작은 계속 사용할 수 있다.

Reading Memory는 원본에서 만든 재구축 가능한 맥락이며 공식 Knowledge가 아니다. 외부 AI를 호출하지 않고, 결정적인 필드·본문·링크 관계만 사용한다.

### Reading Dashboard (카드 본체 + Runtime · Strategy 전력)

Reading은 독서 트래커가 아니다. **판단 품질을 높이는 사고 워크플로**다.
화면의 본체는 **기존 카드 대시보드**다. Runtime과 Strategy는 그 뒤에서 선택·질문을 공급한다.

질문 하나: **오늘 무엇을 생각해야 하는가?**

화면 라벨은 한글 표시 계약을 따른다 (Property 키·내부 id는 영어 유지).

```text
Reading Objects
    ↓
Object Engine Runtime          ← 어떤 책 (continue / review)
    ↓
Reading Strategy               ← 어떻게 읽을지 (Guide · Checklist · Reflection)
    ↓
Reading Dashboard (카드 UI)
  · 이어 읽기 스트립 (Runtime · next_action · 오늘 읽기 · 포커스)
  · 읽는 중 hero 카드  (표지 · next_action · 진행 칩 · 오늘 읽기 · 질답 진행 · 기억 미리보기 · connections 칩)
  · 최근 세션
  · 읽기 대기 (queue → 읽기 시작)
  · 오래 방치 (Runtime lifecycle stale)
  · 완독 임박 (progress ≥ 75%)
  · 복기 필요
  · 최근 완독
```

### Reading Strategy

```text
Reading Strategy
    ↓
Guide      (Before — 카드「독서 질답」모달)
    ↓
Checklist  (During — 같은 모달 체크)
    ↓
Reflection (After — 카드 성찰 힌트 · 사용자 기록)
```

- **UI 원칙**: 회색 섹션 벽을 쌓지 않는다. **카드가 본체**, Strategy/Runtime은 칩·한 줄·모달로만 드러난다. **입력은 최소화**가 OS 원칙이다.
- **진행도**: 읽는 중 카드에서 `25 · 50 · 75 · 100%`만 선택한다. 비어 있으면 아직 안 읽음(0). 저장 필드는 `progress`. `current_page`는 폐기 필드이며 쓰지 않는다. 100%가 상태 전환을 강제하지 않는다.
- **Runtime vs Strategy**: Runtime이 **어떤 책**을 고른다. Strategy가 **어떻게 읽을지**를 정한다. Runtime 로직을 복제하지 않는다. Hub 섹션은 **한 번 평가한 Runtime 모델**을 공유한다 (`__readingWorkspaceModel`).
- **이어 읽기**: Runtime `continue_target` 한 줄 + 이유 + `next_action` + 진행. **오늘 읽기**로 최소 세션. **이 책 포커스**로 해당 hero 카드로 스크롤한다.
- **next_action**: 카드에 추정 없이 표시한다. 비어 있으면 숨긴다.
- **오늘 읽기 (최소 세션)**: 필수 입력은 **한 줄 메모 하나**다. 진행 칩·다음 행동은 선택. 페이지/시간/생각의 변화 등은 `더 보기` 뒤에만 둔다. 범위가 비면 `오늘 읽기` 또는 진행 %로 자동 채운다. 필드 벽을 기본 화면에 두지 않는다.
- **질답 진행**: 카드에 `질답 n/m` 요약을 보여 준다. 자동 완료 없음.
- **기억 미리보기**: 관련 기억이 있으면 한 줄 힌트. 상세는 `관련 기억` 모달.
- **connections 칩**: Object `connections`에 적힌 링크만 칩으로 보여 준다. 관계를 추정하지 않는다.
- **오래 방치**: Runtime lifecycle `stale`인 읽는 중 책. 날짜를 추측하지 않는다.
- **완독 임박**: `progress` ≥ 75%인 읽는 중 책. 상태 전환은 사용자가 `복기 시작` 등으로 직접 한다.
- **읽기 대기**: queue 카드의 **읽기 시작**으로 status → reading. 필요 시 `next_action`을 채운다.
- **공통 레이어 (모든 책)**: Adler식 3단계 — **읽기 전 · 구조 파악** → **읽는 중 · 내용 해석** → **읽은 후 · 비판·적용**. 유형이 없어도 항상 동작한다.
- **분야 레이어**: `book_type` / `reading_strategy` / `reading_type`이 **명시**될 때만 덧붙인다. 제목·카테고리로 조용히 추측하지 않는다. 미래 AI 분류가 타입을 채우면 같은 경로로 분야 질문이 켜진다.
- **독서 질답 모달**: 카드 `독서 질답` → 상단 **읽기 전 / 읽는 중 / 읽은 후** 버튼으로 단계를 고른 뒤, 그 단계 질문에만 **답을 바로 입력**한다. 입력은 잠시 후 임시 저장되고, **맨 아래 `노트에 저장` 한 번**으로 작성된 답을 Reading Object Key Takeaways에 반영한다. 질문마다 저장 버튼을 두지 않는다.
- **성찰**: 사용자 소유. 읽은 후 단계 질문으로 다룬다. 답 자동 생성 없음.
- **복기 필요**: Runtime health / reviewing + 카드 목록.
- **AI 경계**: Book Analysis / Thinking Delta / Knowledge Candidate 자동 승인 / PRE — 미구현. Related Memory 조회는 기존 기록 관계만 표시한다.

### 새 책 추가

Reading Dashboard의 `＋ 새 책 추가`는 Korean Book Info(Yes24)로 메타데이터를 가져온다. 제목·저자·카테고리·표지와 함께 **소개·목차**를 Object 본문 `## 도서 정보 (참고)`에 넣는다. 이 구역은 참고용이며, 판단·배움은 독서 질답과 Key Takeaways에 쓴다. 소개·목차가 없어도 생성은 성공한다. Property Registry에 긴 본문을 넣지 않는다.

### 독서 질답

`reading` 상태의 책 카드에서 `독서 질답`을 누르면 읽기 전·중·후 질문에 답을 쓸 수 있다. Reading Strategy Layer가 모달 질문을 공급한다. 유형이 없으면 공통 질문만, 명시된 분야가 있으면 분야 질문이 덧붙는다.

- **독서 질답** = 질문에 답을 쓰며 판단하는 실행 도구
- **Reading Notes** = Object에 저장된 실제 생각
- **Related Memory** = 과거 독서 기록에서 복원한 맥락
- **Thinking Delta** = 독서 전후의 사고 변화 (미래 확장)

질문별 힌트는 정해진 라이브러리에서 제공하며 외부 AI를 호출하지 않는다. 답을 바로 입력하고, 맨 아래 `노트에 저장`으로 Reading Object의 `Key Takeaways > 독서 질답`에 반영한다. 같은 질문을 다시 저장하면 기존 항목을 갱신한다.

임시 답은 `SYSTEM/AI/Memory/reading/checklists/`에 저장된다. `임시 답 초기화`는 초안만 삭제하며 이미 Reading Object에 저장한 노트는 보존한다.

---

## Scenario 3 — 새로운 프로젝트 / 아이디어

```text
1. Capture: 아이디어를 Capture에 저장
2. AI가 Project Object 생성 가능성 추천
3. 사람이 확인 → Project Object 생성
4. 관련 Knowledge Object 연결
5. next_action 설정
6. Home에서 추적
7. 완료되면 Archive
```

- 프로젝트는 끝이 있다. 완료 조건을 명확히 한다.
- 프로젝트가 지속적인 활동이라면 Knowledge Object로 전환한다.
- 프로젝트 결과물 중 재사용 가능한 지식은 Knowledge Object로 남긴다.

**핵심:** 프로젝트는 끝이 있다. Knowledge는 계속 성장한다.

---

## Scenario 4 — 투자 대상 발견

```text
1. Capture: URL 또는 PDF를 Capture에 저장
2. AI가 Investment Object 생성 추천
3. 사람이 확인 → Investment Object 생성
4. Property 검토 (감정가, 주소, 입찰일 등)
5. 권리분석: Knowledge Object 참조
6. 현장 방문 (선택)
7. 의사결정: 입찰 / 포기 ← 사람이 결정
8. 입찰 실행
9. Review: 결과 복기, 패턴 축적
```

- Investment Object는 하나의 경매 건을 관리한다.
- Knowledge Object는 권리분석, 법정지상권 등 재사용 가능한 지식이다.
- AI는 Property를 생성하고, 낙찰 가능성을 분석하지만, 입찰 여부는 사람이 결정한다.

**핵심:** Investment Object의 모든 결정은 사람의 소유이다.

### Auction Bid Calendar

Auction Workspace의 입찰 일정(Bid Calendar)은 일반 캘린더가 아니다. 경매 활동의 **시간 탐색 레이어**만 담당한다.

```text
Auction Dashboard
  ↓
Operate
  ↓
Bid Calendar
  ↓
Time Navigation
  ↓
Today Bid List
  ↓
Date Detail Popup
  ↓
Agenda View (주간 / 월간)
  ↓
Auction Object
  ↓
Preserve Knowledge
```

- **데이터 소스**: 기존 Auction Object Property만 사용한다. `auction_datetime`(입찰), `site_visit_date`(현장 방문), `review_date`(복기). 새 Property를 만들지 않는다. 캘린더에는 **status = bidding(입찰 예정)** 물건만 표시한다.
- **월간 그리드**: 날짜 셀에는 일정 개수만 표시한다. 제목은 넣지 않는다.
- **오늘 입찰 목록**: 상단 버튼은 기기 로컬 날짜 기준 오늘의 `status = bidding` + 입찰 일정만 보여 준다. 현재 보고 있는 달이나 선택 날짜와 무관하며, 현장 방문·복기 일정은 섞지 않는다.
- **Date Detail Popup**: 해당 날짜의 활동을 유형별·법원별로 보여 주고, 물건 열기로 Object로 이동한다. 캘린더는 Object를 수정하지 않는다.
- **Agenda**: 주간 / 월간 모드로 다가올 행동을 법원 기준으로 묶는다. 선택 범위 밖의 과거 완료 일정을 나열하지 않는다.
- **Display Layer**: 상태·법원·입찰 일시 등 라벨은 Display Registry를 통해 표시한다.
- **빈 상태**: 오늘 목록은 `오늘 예정된 입찰이 없습니다.`, 날짜·Agenda는 `예정된 입찰 일정이 없습니다.`만 표시한다. 예시 데이터를 만들지 않는다.

**핵심:** Calendar = 시간 탐색, Agenda = 다가올 행동, Object = 지식, Dashboard = 운영. 역할을 섞지 않는다.

### Auction Today List & Bid Sheet

오늘 입찰 목록은 당일 사건을 고르는 화면이고, 기일 입찰표는 선택한 한 사건을 실행하는 화면이다.

- **목록 → 카드**: Bid Calendar 상단의 「오늘 입찰 목록」은 오늘 입찰 예정 카드만 보여 준다.
- **카드 → 입찰표**: 카드의 「입찰표 열기」로 해당 사건의 기일 입찰표를 연다. 입찰자 주소는 `SYSTEM/PRIVATE/auction-bidder-profile.local.json`의 개인 기본값을 불러오며, 물건 주소 Property와 분리한다. 입찰표에서 주소를 수정하고 확정하면 다음 입찰표에도 재사용한다.
- **실행 → 복기**: 결과(won/lost) 기록 후 「복기 시작」 또는 대시보드 **복기 대기** 큐에서 이어간다.
- **입찰가**: 카드에서 `expected_bid` 클릭 수정, Day Runner에서 `my_bid_price` 「입찰가 확정」 (이미 지원).

```text
오늘 입찰 목록
  ↓
Auction Card
  ↓
기일 입찰표
  ↓
Human Confirm (입찰자 주소 · 입찰가 · 보증금)
  ↓
Auction Object
  ↓
카드에서 결과 기록 (status: won / lost / skipped)
  ↓
Preserve Evidence
  ↓
Review
  ↓
Learning
```

- **진입점**: Bid Calendar 상단의 `오늘 입찰 목록`에서 당일 카드를 고른 뒤 `입찰표 열기`로 진입한다.
- **대상**: **status = bidding(입찰 예정)** 이면서 오늘 `auction_datetime` 인 물건만 목록에 표시한다.
- **목록 카드**: 사건번호, 법원, 물건 주소, 최저가, 예상 입찰가, 보증금과 사건별 행동을 표시한다. 여러 사건의 입력 화면을 한 팝업에 중첩하지 않는다.
- **기일 입찰표**: 선택한 사건 하나의 입찰자 주소, 입찰가, 보증금과 제출 전 확인만 표시한다. 결과 기록과 Decision Packet은 넣지 않는다.
- **결과 기록**: 입찰표 밖의 Auction Card에서 기존 status enum만 사용한다 (`won` / `lost` / `skipped`). 예상 입찰가(`expected_bid`)는 덮어쓰지 않는다.
- **Lifecycle**: 새 상태를 만들지 않는다. 결과는 기존 Lifecycle 전이와 동일하다.
- **빈 상태**: `오늘 예정된 입찰이 없습니다.`

**핵심:** Calendar = 시간 탐색, 오늘 목록 = 사건 선택, 입찰표 = 단일 사건 실행, Object = 지식, Review = 학습.

---

## Scenario 5 — Workout Program Runner

```text
1. Workout Dashboard ▶ 계속 에서 오늘 운동 시작 / 이어서 기록
2. 세트: 완료 체크 · 중량/횟수 (이전 복제 원탭). RPE·메모는 더 보기
3. 운동 완료 → 선택 한 줄 메모 → 다음 Day 확인
4. 미완료 초안 / 오래 방치 Run 정리
5. 필요할 때 Program 일시정지·중단 후 다른 Program 시작
```

- **Program**: 재사용 가능한 운동 구성. 실행 진척을 저장하지 않는다.
- **Program Run**: Program을 한 번 실행한 기록. 일반적으로 하나만 `active`.
- **Program Day**: 요일이 아니라 `1주차 2일차` 순서. 제안을 따르지 않아도 된다.
- **Workout Session**: 실제 중량·횟수·RPE·메모. 같은 Day 반복도 덮어쓰지 않는다.
- **Quick Workout**: Program Run 없이 만드는 단독 Session.
- **Workout Object (`WO-*`)**: Program Runner와 **별도** 일회 계획/복기 노트. 대시보드「오늘 계획」에 노출.

### 대시보드 표면 (입력 최소화)

```text
▶ 계속 (시작 / 이어서 기록)
  · 진행 중 세션 (최소 입력)
  · 현재 프로그램 + 진행 바
  · 미완료 세션 초안
  · 오래 방치 Run
  · 오늘 계획 (WO Object)
  · 프로그램 라이브러리
  · 운동 기록 (세션 타임라인)
```

- **▶ 계속**: draft가 있으면 이어서 기록, 없으면 제안 Day로 **오늘 운동 시작**.
- **세트 입력**: 기본 표면은 완료 체크 · kg · 회. **이전** 칩 / **전부 이전과 동일**. RPE·메모는 `더`.
- **초안 버리기**: 미완료 draft 삭제 (완료 기록은 보존).
- **오래 방치**: active/paused 중 최근 완료 세션이 N일 이상 없는 실행 (저장된 날짜만 사용).
- **진행 바**: `3/12 Day · 다음 1주차 2일차`.

### Program 가져오기

`프로그램 가져오기`에서 Excel을 선택한다. 저장 전 미리보기(제목·주차·Day·운동 수·확인 행). 결정적 파서만 사용한다.

### 프로그램 라이브러리

카드: **이름 · 목표 · 주차 · 세션 · Run · 상태**.

| 동작 | 설명 |
|------|------|
| 시작 / 다시 시작 / 이어서 실행 | primary |
| 편집 | Program Editor |
| 더 보기 | 이름 변경 · 복제 · 내보내기 · 노트 · 실행 기록 · 삭제 |

### 프로그램 편집기

이름·목표·주차·일차·운동·세트 편집. 저장 전 검증.
**버전 안전성**: Run 시작 시 스냅샷. 라이브러리 편집은 미래 Run에만 영향.

### Exercise Object

`PARA/RESOURCES/Workout/Exercises/`. 없으면 사용자만 생성. 이전·최고·e1RM·이력은 기존 Session에서 계산.

**target (부위)**: 영문 표준 값으로 관리한다.

| target | 표시 |
|--------|------|
| `legs` | 하체 |
| `chest` | 가슴 |
| `back` | 등 |
| `shoulders` | 어깨 |
| `arms` | 팔 |
| `core` | 코어 |
| `full_body` | 전신 |
| `cardio` | 유산소 |
| `other` | 기타 |

프로그램 **운동 추가** / 편집기에서 부위 칩을 고르면 해당 `target` 운동(및 미분류)만 검색된다. 운동 노트 생성·상세에서 target을 저장할 수 있다.

**cue (한 줄 테크닉 큐)**: 대시보드 세션 카드에만 쓰는 짧은 힌트다.

```yaml
cue: "무릎이 발끝 밖으로 나가지 않게"
```

- 긴 테크닉 설명은 본문 `# 테크닉`에 둔다.
- **개인 기록(이전·최고·e1RM)은 property로 저장하지 않는다.** 완료 Session에서 계산해 세션 카드에 `이전 … · 최고 …`로 표시한다.
- 운동 상세 모달에서 `cue` 편집·저장.

### 실행과 파생 상태

완료 Session 기준 다음 Day 제안. 입력 중 Session은 자동 저장.
파생 JSON: `SYSTEM/AI/Memory/workout/`. 원본 Program 노트를 실행 중 덮어쓰지 않는다.
Hub는 `WorkoutView.renderDashboard` 한 경로로 로드하며 `__workoutWorkspaceModel`을 공유한다.

---

## Scenario 6 — 사진 촬영 / 창작 작업

```text
1. Capture: 촬영 계획, 영감, 참고 자료 저장
2. Project Object 생성 (이번 촬영 건)
3. AI가 Knowledge Object 생성 가능성 추천 (재사용 가능한 노하우)
4. 사람이 확인 → Knowledge Object 생성 또는 업데이트
5. Journal에 촬영 후기, 감정 기록 (회고)
```

- 유한한 촬영 작업 → Project Object
- 재사용 가능한 촬영 팁 → Knowledge Object
- 개인적인 감정, 깨달음 → Journal

---

## Scenario 6.5 — 중요한 사람을 기록하고 싶다

1. Personal Hub 또는 QuickAdd에서 **사람 추가**
2. 이름만 입력 → `PARA/RESOURCES/CONTACTS`에 People Object 생성 (`type: people`)
3. 관계·소통 방식·배운 점을 필요할 때만 작성
4. 관련 Project / Journal / Auction / Reading의 `connections`에 `[[그 사람]]` 링크
5. People Object의 **연결된 Object**에서 원본이 보이는지 확인 (내용 복제 없음)

---

## Scenario 7 — 하루를 돌아보고 싶다

```text
1. Home 열기
2. 🔁 Review: 오늘 업데이트된 Object 확인
3. 오늘의 Capture 처리
4. Journal 작성: 오늘 배운 점, 느낀 점, 내일 할 일
5. next_action 설정
6. Home에서 내일 확인
```

- Journal은 매일 쓸 필요는 없다.
- 중요한 날, 배움이 있었던 날, 결정을 내린 날에 쓴다.
- next_action을 설정하면 다음날 Home에서 바로 확인할 수 있다.

---

# 6. Folder Usage

폴더는 저장 위치일 뿐, 사용자 인터페이스가 아니다.
사용자는 폴더를 고민하지 않고, "이게 무엇인가?"를 생각한다.

| 폴더 | 용도 |
|------|------|
| HUB | 시작 화면. Home, Dashboard, Mail Box |
| CAPTURE | 결정 미룸 보관함. 아직 분류되지 않은 정보 |
| OBJECTS/Investment | 실제 투자 대상과 결정 |
| OBJECTS/Knowledge | 재사용 가능한 개념과 지식 |
| OBJECTS/Projects | 끝이 있는 작업 |
| OBJECTS/Personal | 장기 개인 데이터 (운동, 건강) |
| JOURNAL | 하루 회고와 감정 기록 |
| SYSTEM | Template, View, Script. 평소에 건드리지 않음 |
| ARCHIVE | 완료된 Object. 삭제하지 않고 보관 |

---

# 7. AI Usage

## AI MAY

AI는 다음을 할 수 있다:
- 분류: 입력된 정보의 Object Type 추천
- 요약: 3~5문장 요약 생성
- Property 제안: 구조화된 데이터 생성
- 연결 제안: 관련 Object 발견
- 품질 검토: Object 완전성 확인
- next_action 추천: 다음 행동 제안
- Object 생성 추천: 새 Object 또는 업데이트 제안

## AI MUST NOT

AI는 다음을 해서는 안 된다:
- 최종 투자 결정
- Object 자동 생성 또는 삭제
- 중요한 데이터 임의 변경
- Decision 또는 Review 자동 작성
- 사람의 확인 없이 Object 업데이트 실행

**AI는 추천한다. 사람이 확인한다.**

---

# 8. Common Confusions

## People (사람)

People는 **관계 기억**이다. CRM·주소록·영업 파이프라인이 아니다.

```text
People Object     = 관계 맥락을 보존한다
Personal Hub      = 사람을 찾고 관련 맥락을 이어 준다
Project/Auction/Journal/Reading = 사건·작업의 원본 기록
connections / 링크 = 둘을 잇는 연결
```

- 내부 type: `people` · 표시 라벨: 사람
- 저장 위치: `PARA/RESOURCES/CONTACTS`
- 운영 표면: `HUB/60 Personal.md` (**사람과 관계**). 별도 People Hub 없음.
- 생성: 「사람 추가」 또는 QuickAdd 「사람 추가」 → 이름만 입력 → 항상 `type: people`
- 검색: 이름·구분·소속·역할·메모·사건 (로컬). 카드에 `검색 일치:` 힌트.
- 필터: 전체 / 구분 칩 / 미분류 / 연결 있음 / 레거시 / 연락일 없음.
- 정렬: 가나다 ↑↓ · **손볼 사람**(`last_contact` 공백 우선 → 오래된 명시일; mtime 추정 없음).
- `relationship` = 짧은 구분만. 상세는 본문 `# 관계`. 팝업에서 미분류 문구를 본문으로 옮기기 가능.
- 카드: 메타 · **사건**(상위 2줄) · **메모**(상위 3줄) · 줄 **×** 삭제(10초 실행 취소) · **최근 맥락**(3개 + 타입 칩 + 펼침).
- 링크는 `connections`/wikilink. 본문 복제 없음. `last_contact`는 명시값만.
- **이름 클릭** = 관계 팝업(구분 칩 · 사건/메모 줄 목록 · ⌘/Ctrl+S 저장). 「원본 노트」로 에디터.
- 사건/메모 추가 후 해당 카드로 스크롤. 검색창 `↓` = 첫 카드.
- **사람 삭제** = 이름 옆 🗑️. Contacts 노트만 휴지통. 다른 Object 링크 유지.
- 레거시 `type: contact` 읽기 호환(배지·필터). 신규 type 변경 없음.
- **People only:** 사람 Object의 공식 type은 `people`다. Contact로 Areas와 People를 합치지 않는다.
- 지속 영역(Areas)은 사람과 다른 축이다. 같은 Hub 하단 보조 섹션으로만 유지한다.
- 현재 `PARA/AREAS` 샘플 3종(자율주행 윤리 / 그린 데이터센터 / 우주관광)은 데모성 ARCHIVE 후보다. 자동 삭제하지 않는다.

## Personal vs Journal

| 구분 | Personal | Journal |
|------|----------|---------|
| 목적 | 장기 데이터 추적 | 하루 회고 |
| 예시 | 운동 기록, 체중, 루틴 | 오늘 느낀 점, 배운 점 |
| 업데이트 | 매일 또는 정기적 | 필요할 때만 |
| 조회 | Dashboard에서 추세 확인 | 시간순으로 읽기 |

**쉬운 규칙:** 측정 가능한 데이터는 Personal. 느낌과 생각은 Journal.

---

## Knowledge vs Project

| 구분 | Knowledge | Project |
|------|-----------|---------|
| 목적 | 재사용 가능한 지식 | 끝이 있는 작업 |
| 생명주기 | 계속 성장 | 생성 → 완료 → Archive |
| 예시 | 권리분석, 운동생리학 | 우주관광 프로젝트, 촬영 |

**쉬운 규칙:** 끝이 있고 결과물이 있다면 Project. 계속 재사용된다면 Knowledge.

---

## Investment vs Knowledge

| 구분 | Investment | Knowledge |
|------|------------|-----------|
| 목적 | 실제 투자 대상 | 의사결정 지원 |
| 예시 | 인천 아파트 경매 | 법정지상권 개념 |
| 결정 | 사람이 입찰 여부 결정 | AI가 요약, 연결 |

**쉬운 규칙:** 돈이 오가는 실제 대상이라면 Investment. 참고 개념이라면 Knowledge.

---

## Capture vs Object

| 구분 | Capture | Object |
|------|---------|--------|
| 상태 | 미결정, 보류 | 결정됨, 구조화 |
| 목적 | 정보 보존, 결정 미루기 | 작업 소스 |
| AI 역할 | 구조화 대기 | Property, 연결, 요약 |

**쉬운 규칙:** 아직 결정하지 않았다면 Capture. 결정했다면 Object.

---

# 9. Best Practices

1. **Capture를 비워두거나 작게 유지한다.**
   Capture가 쌓이면 정기적으로 검토하고 Object로 변환한다.

2. **새 Object를 만들기 전에 기존 Object를 먼저 확인한다.**
   특히 Knowledge Object는 업데이트가 우선이다.

3. **Object는 업데이트로 성장시킨다.**
   새로운 정보가 들어왔을 때 무조건 새 Object를 만들지 않는다.
   기존 Object에 Content를 추가하고, Property를 정제하고, 연결을 확장한다.
   Object 생성은 의도적인 행동이다.

4. **next_action을 일관되게 설정한다.**
   Home에서 바로 오늘 할 일을 확인할 수 있다.

5. **Home에서 시작한다.**
   폴더부터 열지 않는다. Home이 모든 시작점이다.

6. **Knowledge를 과도하게 생성하지 않는다.**
   하나의 Knowledge Object는 하나의 개념. 같은 개념은 업데이트로 처리한다.

7. **완료된 Project는 Archive한다.**
   삭제하지 않는다. Historical 상태로 보관한다.

8. **AI 제안은 검토 후 수용한다.**
   AI는 틀릴 수 있다. Property, 연결, 분류, Object 생성 제안은 사람이 최종 확인한다.

9. **Journal은 억지로 쓰지 않는다.**
   중요한 날, 배움이 있었던 날, 결정을 내린 날에만 쓴다.

10. **폴더를 고민하지 않는다.**
    "이게 무엇인가?"를 생각한다. AI가 폴더를 제안한다.

---

# 10. Operational Data Quality Rhythm

Prodigy OS의 Review 품질은 AI 기능보다 운영 데이터 품질에 더 크게 좌우된다.

## Morning

```text
Build Context Package
  ↓
Morning Brief AI (or Fallback)
  ↓
Draft Today's Focus
  ↓
Human Edit & Approval
  ↓
Approved Focus Artifact
  ↓
Execution
```

- **아침 판단 최소화**: 아침에는 판단력을 낭비하지 않도록 AI 브리핑을 통해 핵심 실행 우선순위를 확인한다.
- **Morning Context Package**: 오늘 날짜/시간, Todoist 할 일 수, 활성 상태의 프로젝트/경매/독서 메타데이터, 최근 3일의 데일리 성찰 정보, 최근 주간 회고(PRE) 결과 등을 정합성 있게 취합하여 `morning-package-YYYY-MM-DD.json` 캐시 패키지를 자동 빌드한다.
- **Morning Brief AI 및 Fallback**: 설정된 LLM API를 호출하여 한국어로 요약된 브리핑과 최대 3개의 오늘의 Focus를 제안받는다. 네트워크 또는 API 장애 발생 시, 로컬 D-Day 기반 휴리스틱 룰에 기초한 `Deterministic Fallback` 브리핑으로 자동 복구된다.
- **Explainable Morning Brief & Focus**: AI 요약문은 전문적이고 간결한 4~5문장의 비서 스타일로 작성된다. 또한, 각 Focus 카드 하단의 **[왜 추천되었나요?]**를 클릭하면 추가 LLM 호출 없이 로컬 Morning Package로부터 추출된 **결정론적 근거(Evidence)** 및 수집 출처(**Trust Panel**)를 투명하게 조회할 수 있다.
- **Today's Risk (금일의 위험)**: 오늘의 Focus 하단에 최대 2개의 위험 항목이 노출된다. 입찰 예정 경매의 임장 보고 누락 여부나 임박한 프로젝트 마감 등 철저히 데이터에 근거한 실행 리스크를 알려주며, 투기적 분석이나 주관적 추천은 완벽히 배제된다.
- **Focus History (실행 이력 영속화)**: 승인된 Focus 데이터(`approved-focus-YYYY-MM-DD.json`)는 단순 임시 캐시가 아니라 사용자의 실행 의사결정을 담은 장기적 이력 데이터로 영구 보존된다. 향후 주간 회고(PRE) 단계에서 반복 패턴 분석의 중요한 실증 근거로 활용된다.
- **Human Approval (인간 승인 권약)**: AI는 Focus를 제안할 뿐이며, 사용자는 Home 화면에서 직접 텍스트를 수정하거나 불필요한 대상을 제외하고 [승인] 버튼을 눌러 승인 조치한다. 승인된 정보는 다음 경로에 안전한 JSON 아티팩트로 영속화된다.
  `SYSTEM/AI/Skills/prodigy-review/runs/morning/YYYY-MM-DD/approved-focus-YYYY-MM-DD.json`
- **캐싱 및 새로고침**: 오늘 날짜 기준 캐시를 우선 활용하여 불필요한 LLM 호출과 비용을 아끼되, 데이터 변경(Todoist 개수 변동, 상태값 변화 등)이 감지되면 Stale 상태를 표시하여 사용자가 원할 때 수동으로 브리핑을 재생성할 수 있게 지원한다.
- **Focus에서 Todoist Task 자동 생성 금지**: 승인된 Focus는 지향점일 뿐이며, Todoist 태스크를 자동으로 개설하여 사용자 환경을 오염시키지 않는다.
- **Calendar의 읽기 전용 한계**: 캘린더 연동은 API가 준비될 때까지 `Unavailable` 상태 및 패키지 경고와 함께 안전한 기본 뼈대로만 가동된다.

## Evening

```text
Reflection
  ↓
Change
  ↓
Next Experiment
```

- 저녁에는 하루 전체를 기록하지 않는다.
- 가장 의미 있는 하나의 경험을 Reflection에 남긴다.
- 그 경험이 판단이나 행동을 어떻게 바꿨는지 Change에 남긴다.
- 다음 날 바로 시도할 작은 행동을 Next Experiment에 남긴다.

## Weekly Learning Review

Journal Workspace의 Weekly는 ISO 월요일~일요일 Daily Evidence를 읽는 사용자용 Review surface입니다.

```text
Daily Evidence
  → deterministic Pattern Filter
  → explicit AI Learning proposal (optional)
  → Human Review
  → Suggested Principle (pending only)
```

- AI는 명시적으로 실행할 때만 Pattern → Learning, Next Week Direction, Suggested Principle을 제안합니다.
- 서로 다른 날짜에서 반복된 행동 변화만 Pattern으로 인정합니다. 같은 날의 Object·Context 중복은 집계하지 않습니다.
- AI 실패 시 규칙 기반 결과를 보존합니다.
- **Never** auto-creates Knowledge, approves principles, or rewrites Daily / Object notes.
- Monthly·Quarterly·Yearly는 Workspace readiness 화면을 제공하지만, 실행 엔진과 자동화는 아직 열지 않습니다.

---

# 11. Project Launch Workflow

Project Wizard는 프로젝트를 시작하기 위한 사용자용 실행 흐름이다.

```text
Project Dashboard
  ↓
Launch Project
  ↓
Workflow Library preset
  ↓
Optional AI refinement
  ↓
Human approval
  ↓
Project Object
  ↓
Todoist execution artifacts, only when Start Now is selected
```

## Ownership Contract

Project Object:

- Purpose, completion condition, due date, full Workflow
- Decisions, notes, result, review
- Todoist linkage IDs

Todoist:

- Execution interface for approved Workflow items
- Task completion interaction
- Reminders and scheduling

Dashboard:

- Read-only operational visibility
- Project launch point

Daily:

- Meaningful experience and reflection

PRE:

- Evidence Package → patterns → pending principles → Weekly draft
- No PRE Workspace / PRE Object / auto Knowledge

## Workflow Drafting

- Workflow Library provides the starting structure.
- AI may refine the draft, but only from the current Project context and selected preset.
- The user approves the final Workflow.
- Only after approval are Object and Todoist artifacts created.
- Provider fallback is explicit. Project context is not silently sent to another provider.

## Prodigy OS 통합 설정

Home의 설정 아이콘 또는 AI 기능 안의 `통합 설정 열기`에서 공통 설정을 연다.

- **AI 제공자**: 데일리 성찰, 선택적 위클리 AI, 모닝 브리프, 프로젝트 Workflow, Knowledge AI가 같은 기본 제공자와 모델을 사용한다.
- **외부 서비스**: Todoist 토큰과 REB OpenAPI 키를 같은 화면에서 관리한다. REB 키의 실제 지역 지표 수집은 승인된 Region adapter 흐름에서만 사용한다.
- **보안**: API 키와 토큰은 Obsidian SecretStorage에만 저장된다. `SYSTEM/PRIVATE/prodigy.local.json`에는 provider·model·endpoint 같은 비밀이 아닌 설정만 남는다.
- **호환성**: 기존 `project-wizard.local.json`과 기존 SecretStorage 키는 계속 읽을 수 있다. 설정을 저장하면 새 공통 파일이 우선 사용되며 이전 파일은 자동 삭제하지 않는다.
- **기기별 확인**: SecretStorage의 기기 간 동기화 여부를 가정하지 않는다. Desktop과 iPhone에서 각자의 저장 상태를 확인한다.

---

# 12. Git Stability Workflow

운영 Vault는 장기 미커밋 상태로 두지 않는다.

```text
Implement
  ↓
Commit
  ↓
Use
  ↓
Observe
  ↓
Improve
```

- 구현 후에는 가능한 작게 Commit한다.
- Commit 이후 실제 Vault에서 사용한다.
- 사용 중 발견한 문제를 관찰한다.
- 관찰 결과를 다음 작은 개선으로 반영한다.
- Evidence, PRE, Formatter, Dashboard, Template 변경을 한꺼번에 오래 들고 가지 않는다.
- Source Object와 운영 데이터는 항상 복구 가능한 상태로 유지한다.

---

# Final Statement

Prodigy OS는 폴더 시스템이 아니다.
Prodigy OS는 매일 사용하는 개인 운영체제이다.

Home에서 시작한다.
Object를 중심으로 작업한다.
Capture에 정보를 보존하고, 나중에 Object로 만든다.
AI의 도움을 받되, 최종 결정은 사람이 내린다.

모든 Object는 사람의 소유이다.

---

**Version:** 1.2
**Status:** Active
**Depends on:**
- SYSTEM/docs/00_Constitution.md
- SYSTEM/docs/01_Architecture.md
- SYSTEM/docs/02_Core_Concepts.md
- SYSTEM/docs/03_Object_Model.md
- SYSTEM/docs/04_Capture_System.md
- SYSTEM/docs/05_Home.md
