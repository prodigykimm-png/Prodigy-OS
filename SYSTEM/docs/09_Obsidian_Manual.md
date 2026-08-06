# Prodigy OS Obsidian 사용 설명서 v2.0

> "Obsidian은 플랫폼일 뿐이다. Prodigy OS의 핵심은 Object와 Workspace 운영이다."  
> 이 문서는 **현재 vault 구현(2026-07 기준)** 을 기준으로 한 **사용자 매뉴얼**이다.

---

## 이 문서의 목적

- 개발자가 아니라 **매일 쓰는 사람** 관점
- “어디에 들어가서 무엇을 누르는가”를 설명한다
- 설계 철학의 상세는 [11_Operating_Guide.md](11_Operating_Guide.md), [05_Home.md](05_Home.md)를 본다

---

## 1. 한 줄로 쓰는 법

```text
HUB/00 Home 열기
  → 오늘 집중·이어하기·주의 확인
  → Workspace로 들어가 실행
  → 저녁 Daily 성찰 (2분)
  → 주말에 PRE 초안 검토 (사람 승인)
```

폴더를 먼저 뒤지지 않는다. **Home부터** 연다.

---

## 2. Vault 구조 (실제)

```text
Dusk/
├── HUB/                    ← 모든 Workspace 입구 (여기가 앱 화면)
│   ├── 00 Home.md
│   ├── 10 Auction.md
│   ├── 20 Reading.md
│   ├── 30 Workout.md
│   ├── 40 Project.md
│   ├── 50 Knowledge.md
│   ├── 60 Personal.md      ← People
│   ├── 70 Journal.md
│   ├── Inbox.md
│   ├── Mail Box.md
│   └── Map of Content.md
├── PARA/                   ← Object 저장 (개인 데이터 · git 추적 제외 권장)
│   ├── PROJECTS/           Auction · Reading · Workout · 일반 Project
│   ├── RESOURCES/          CONTACTS · 문서 등
│   ├── AREAS/
│   └── ARCHIVES/
├── DAILY/                  ← 일·주·월 노트 (개인 · git 추적 제외 권장)
│   └── DAILY/YYYY-MM-DD.md
├── SYSTEM/
│   ├── Views/              ← Dashboard 스크립트 (제품 코드)
│   ├── TEMPLATE/           ← 템플릿
│   ├── AI/Skills/          ← PRE 등 스킬 · 테스트
│   └── docs/               ← 이 매뉴얼 포함
└── README.md
```

**역할 분리**

| 계층 | 역할 | 예 |
|------|------|----|
| **Home** | 결정 · 탐색 | 지금 무엇에 집중할까? |
| **Workspace** | 실행 · 기록 · 복기 | 경매 / 독서 / 운동 / 프로젝트 |
| **Todoist** | 태스크 실행 | 오늘 할 일 목록 |
| **Object** | 지식·사건의 원본 | 경매 사건, 책, 사람, 프로젝트 |
| **PRE** | 주간 초안 엔진 | Daily → Weekly Draft (Workspace 아님) |

---

## 3. 핵심 개념 (짧게)

### 3.1 Object

- 기본 단위는 폴더가 아니라 **Object 노트**다.
- **Property** (YAML, 영어 키) + **Content** (본문).
- 화면 라벨은 한글 (Display Registry). 키는 영어 유지.

### 3.2 Lifecycle / Attention / next_action

- **Lifecycle · Attention** 은 Object Engine이 **계산**한다. YAML에 저장하지 않는다.
- **next_action** 은 Object에 적힌 값만 쓴다. AI가 지어내지 않는다.
- Home · Launcher · Workspace가 같은 Engine 상태를 재사용한다.

### 3.3 AI 경계

- AI / 규칙은 **제안**만 한다.
- **승인 · 실행 · 성찰 작성** 은 사람.
- PRE 원칙은 항상 `pending` — Knowledge 자동 생성 없음.

---

## 4. Home (`HUB/00 Home.md`)

Home = **Mission Control** (한글 UI).

### 4.1 화면 구성 (위 → 아래)

| 섹션 | 하는 일 |
|------|---------|
| **아침 브리핑** | 오늘 요약 · 어제 배움 · 오늘 실험 (짧게) |
| **오늘의 집중** | **승인된** Focus만 (최대 3). Home에서 문구 편집 안 함 |
| **이어하기** | 중단된 일 재개 (최대 4, 완료 Object 제외) |
| **주의가 필요함** | critical / high 만 · 이유(WHY) 표시 |
| **빠른 실행** | + 새 Object · + 오늘 Daily · 검색 |
| **Todoist** | 오늘 건수 · 지연 · Todoist 열기 (목록 복제 안 함) |
| **Workspace 런처** | “무엇이 기다리는가?” 컨텍스트 + 해당 Workspace 열기 |
| **시스템 상태** | Engine / Sync / Review Queue (아주 작게) |

모바일·좁은 화면: 상단 Brief·집중 우선, 하부는 **더 보기**로 접힌다.

### 4.2 단축키 · 생성

| 동작 | 방법 |
|------|------|
| 새 Object | Home **+ 새 Object** 또는 **⌘/Ctrl+N** |
| 오늘 Daily | **+ 오늘 Daily** |
| 검색 | **검색** (Obsidian 전역 검색) |
| 브리핑 갱신 | **브리핑 다시 생성** / **새로고침** |

### 4.3 Universal Object Creator

모든 생성의 **단일 입구**.

```text
한 줄 입력
  → 유형 제안 + 이유 (Object Engine.classify)
  → 비슷한 Object 최대 3 (있으면 「기존 Object 열기」)
  → 계속 만들기 (유형별 기존 마법사/워크스페이스로 연결)
```

- 중복 감지는 **생성을 막지 않는다**.
- Project 선택 시 입력 문구가 Project Wizard 초기 이름으로 넘어간다.
- 분류 신호가 약하면 **저널** 폴백.

---

## 5. Workspace 안내

사이드바 **HUB** 또는 Home 런처에서 연다.

### 5.1 경매 — `HUB/10 Auction.md`

**경로:** `PARA/PROJECTS/Auction/`

| 구역 | 용도 |
|------|------|
| 오늘 | 오늘 행동 · Day Runner 등 |
| 입찰 일정 | 캘린더 |
| 경매 진행 현황 | 입찰 예정 · 관심 · 복기 · 낙찰/패찰 등 카드 |

- 카드에서 물건 열기 · 임장 · 복기 흐름 진행.
- **Auction Day Runner** 로 입찰일 운영 (Workspace 안에서).

### 5.2 독서 — `HUB/20 Reading.md`

**경로:** `PARA/PROJECTS/Reading/`

| 구역 | 용도 |
|------|------|
| 이어 읽기 스트립 | 지금 읽을 책 · **오늘 읽기** (최소 세션) |
| 읽는 중 | hero 카드 |
| 읽기 대기 / 방치 / 완독 임박 / 복기 / 최근 완독 | 라이브러리·상태 |

- **오늘 읽기**: 한 줄 메모 중심 세션 (긴 폼 금지).
- **독서 질답**: 카드에서 읽기 전·중·후 질문 (전략 레이어).
- 새 책: **＋ 새 책 추가** (메타데이터 어댑터).

### 5.3 운동 — `HUB/30 Workout.md`

**경로:** `PARA/PROJECTS/Workout/` 등

- 오늘 세션 · 프로그램 · 운동 라이브러리.
- 세트 추가/삭제 · draft/stale 처리 · cue/target 표시는 제품 기능으로 유지.
- 이름 클릭 = 팝업, 노트 = 사이드 리프 (가능 시).

### 5.4 프로젝트 — `HUB/40 Project.md`

**경로:** `PARA/PROJECTS/` (도메인 폴더 외 일반 프로젝트)

- 진행 중 / 계획 / 아이디어 / 지연 / 완료 / 복기 중 카드.
- **Project Wizard** 로 생성 (Creator에서 이름 handoff 가능).
- Todoist 연동: 실행 계층. 프로젝트 Object는 지식·워크플로 원본.

### 5.5 지식 — `HUB/50 Knowledge.md`

- **+ 지식 작성**: 직접 공부한 내용을 AI 없이 `knowledge_candidate`로 저장. `source_note` 필수. 저장 후 `검증 대기`에서 사람 승인.
- **+ 자료 정리**: 기사·칼럼·YouTube·인강·논문·공식 문서를 `literature_note`로 저장. `단일 자료`(직접 입력)와 `오늘의 자료 묶음`(URL 1~20개 → AI 항목별 요약 + 사람 한 줄 필수) 두 탭.
- `application_trigger`·`application_contexts`는 후보→승인→Knowledge 전 과정 보존.
- URL 가져오기는 HTTP(S) 공개 페이지만. 로그인·유료벽 우회·영상 다운로드 없음. 실패 시 사용자 텍스트 fallback.
- AI가 Candidate·Knowledge를 자동 생성·승인하지 않음. 배경 크롤링·사용 통계·분석 대시보드 없음.
- **지식 탐색기**에서 도메인 → 주제 또는 자료 → 상세 순서로 좁혀 봅니다. 상세 항목과 브리핑의 출처 경로는 `옆에 열기`로 탐색기를 유지한 채 분할 패널에서 엽니다.
- `knowledge`만 사람이 검증한 재사용 가능한 **정식 Knowledge**입니다. `permanent_note`는 읽기 호환을 위한 기존 지식이며 자동 전환하지 않습니다. `literature_note`, `venue`, `auction_region`은 근거를 보존하는 보조 **자료(Resource)** 이며 일반 `resource` type으로 합치지 않습니다.
- 상세의 **오늘의 브리핑**은 현재 도메인 안의 결정적 사실과 명시적 출처를 먼저 표시합니다. `AI 요약 만들기`는 사용자가 직접 눌렀을 때만 보조 요약을 요청하며, 취소·실패·재시도 중에도 결정적 브리핑과 출처는 남습니다. 이 브리핑은 Home Morning Brief나 PRE가 아니며 Knowledge를 만들거나 승인·수정하지 않습니다.
- 기존 Knowledge 정리는 `node SYSTEM/SCRIPTS/knowledge-explorer-audit.js --path <대상 경로>`로 **dry-run**만 먼저 확인합니다. 제안은 사람이 검토하며 이 도구는 실제 노트·Daily·PRE를 수정하지 않습니다.

### 5.6 사람 — `HUB/60 Personal.md`

- People Workspace (연락처 · 연결 Object).
- 연락처 원본: `PARA/RESOURCES/CONTACTS/`.
- last_contact 등은 **추측하지 않음** (연결·기록 기반).

### 5.7 저널 — `HUB/70 Journal.md`

- Daily · Weekly · Monthly · Quarterly · Yearly 질문을 한 화면에서 탐색합니다.
- Daily: 오늘 무엇이 나를 변화시켰는지 기록합니다. Weekly: 이번 주에 무엇이 반복되었고 무엇을 배웠는지 살펴봅니다. Monthly: 이번 달의 변화가 반복된 근거로 검증되는지 확인합니다. Quarterly: 검증된 변화와 결과를 바탕으로 지금의 방향이 맞는지 점검합니다. Yearly: 분기별 방향과 변화를 돌아보며 내가 어떤 사람이 되어가는지 성찰합니다.
- Daily는 여러 Evidence Block을 남기며, 각각 Experience → Interpretation → Change → Next Experiment를 보존합니다.
- Weekly는 월요일~일요일 Evidence를 Pattern → Learning으로 읽습니다. `AI 학습 분석`은 사용자가 직접 눌렀을 때만 실행하며, 실패 시 규칙 기반 결과를 유지합니다.
- Weekly 저장 시 `type: journal`, `status: completed`를 frontmatter에 기록합니다.
- Monthly는 월을 이동하며 저장된 기록을 다시 열 수 있습니다. 완료 Weekly가 없거나 필수 입력이 깨진 경우만 새 기록을 막고, Weekly가 있지만 반복 Principle이 없으면 `question_only`로 열어 관찰 요약과 다음 달 방향을 저장합니다. 서로 다른 주차의 동일 normalized title Principle이 반복될 때만 사람의 검증 결정을 엽니다.
- Monthly의 `AI 검증 보조`는 버튼을 눌렀을 때만 실행되며, 선택한 달의 구조화 Daily Evidence를 근거·반증·누락·질문·검증 사유 초안·다음 달 방향 초안으로 제안합니다. Principle 결정, 지식 문장, 요약, 저장은 사람이 합니다.
- Monthly `question_only`의 `AI 관찰 질문 보조`는 누락·불확실성·관찰 질문·다음 달 방향만 제안하며 Principle 결정, 검증 사유 복사, Knowledge 문장, Candidate 생성은 하지 않습니다.
- AI 실행 전 입력 기록 변경을 감지하면 `입력 기록 변경됨`으로 중단하고, Evidence가 없으면 `선택한 달에 AI가 검토할 구조화 Evidence가 없습니다`를 표시하며 provider를 호출하지 않습니다.
- Monthly에서 `검증`한 Principle은 `source_type: monthly_validation` Knowledge Candidate로 저장되며, 기존 승인 화면에서 사람이 Knowledge 승격을 결정합니다.
- Quarterly·Yearly도 분기·연도를 이동하고 저장된 이전 기록을 다시 열 수 있습니다. 입력이 부족하면 확인할 질문과 draft 범위만 허용하고, 자동 리뷰 엔진·Direction·Identity 승격은 제공하지 않습니다.

---

## 6. Daily · Weekly 루프

### 6.1 Daily (`DAILY/DAILY/YYYY-MM-DD.md`)

**저녁 루틴 (권장 2분)**

1. Reflection — 의미 있는 사건 하나  
2. Change — 생각·행동이 어떻게 바뀌었는지  
3. Next Experiment — 내일 바로 시도할 **작은 행동 하나** (여러 개보다 하나)

Home의 아침 브리핑은 어제의 Change / Next Experiment를 짧게 회수한다.

### 6.2 Weekly Learning Review

Weekly는 월요일~일요일의 Daily Evidence를 읽는 Filter입니다. 먼저 규칙 기반 결과를 만들고, 사용자가 **AI 학습 분석**을 누르면 AI가 Pattern의 의미와 Learning, 다음 주 방향을 제안합니다.

- AI는 저장·승인·Knowledge 승격을 실행하지 않습니다.
- 같은 날의 Object·Context 반복은 Pattern이 아닙니다. Pattern은 서로 다른 날짜의 반복 행동 변화여야 합니다.
- Suggested Principle은 항상 `pending`이며 사람 검토가 필요합니다.
- Daily·Object 원본은 Weekly 분석으로 수정하지 않습니다.
- 기존 터미널 PRE는 내부 점검·재현용으로 유지되며, 일상 사용 진입점은 Journal Workspace입니다.

### 6.3 AI 제공자와 로컬 Gemma

- Home의 `Prodigy OS 설정` 또는 Daily의 `AI 성찰 분석 → AI 설정 → 통합 설정 열기`에서 기본 제공자와 모델을 관리합니다. Project Wizard와 다른 AI 기능도 같은 설정을 공유합니다.
- `LM Studio`는 `http://127.0.0.1:1234/v1`의 Local Server를 사용하며 API 키가 필요하지 않습니다. 기본 모델은 `qwen/qwen3.5-9b` Q4_K_M이고, `google/gemma-4-12b-qat`도 비교 모델로 선택할 수 있습니다.
- Local Server만 켜 두어도 됩니다. 모델은 요청할 때 적재되고 요청에 포함된 `ttl: 120`에 따라 마지막 호출 2분 뒤 자동으로 메모리에서 내려갑니다.
- LM Studio가 꺼져 있으면 원시 네트워크 오류 대신 Local Server 시작 안내를 표시합니다. 모델 목록에서는 임베딩 모델을 제외합니다.
- 외부 제공자는 API 키를 Obsidian SecretStorage에만 저장합니다. 다른 제공자로 자동 전송하는 묵시적 fallback은 없습니다.

---

## 7. Object 생성 경로 (요약)

| 만들고 싶은 것 | 권장 경로 |
|----------------|-----------|
| 아무거나 | Home → **+ 새 Object** |
| 프로젝트 | Creator → Project 또는 Project Workspace Wizard |
| 경매 | Auction Workspace / Creator → 경매 |
| 책 | Reading **＋ 새 책 추가** |
| 사람 | Personal Workspace / Creator → 사람 |
| Daily | Home **+ 오늘 Daily** 또는 Journal |

---

## 8. Property · 표시 규칙 (실무)

| 규칙 | 내용 |
|------|------|
| 키 | 영어 `snake_case` |
| 화면 라벨 | 한글 (Display Registry) |
| 가격 등 숫자 | 원 단위 숫자 (문자열 `"1억"` 금지) |
| status | 도메인별 영어 값 (`watching`, `reading`, `doing` …) |
| 새 Property | 함부로 추가하지 않음 (Registry 계약) |

경매 등 도메인 상세 필드 목록은 Object Model / Property 계약 문서를 본다.  
일상 사용에서는 **status · next_action · 핵심 날짜** 만 정확히 유지해도 대시보드가 동작한다.

---

## 9. 모바일

- **별도 Mobile Home 없음.** 같은 Home · Workspace를 압축 레이아웃으로 씀.
- compact는 `768px` 미만, medium은 `768px`부터 `1023px`, wide는 `1024px` 이상이다. Workspace bar는 48px, Action Bar는 52px, 최소 터치 대상은 44px이다.
- 운영 계약은 `single Home` / `no separate Mobile Home`이다. 모바일에서도 별도 Home 파일이나 별도 승인 흐름을 만들지 않는다.
- 큰 터치 영역 · 하단 접기(더 보기) 유지.
- Workspace UI 상태는 `AppShell`과 `WorkspaceStateStore`(sessionStorage)가 관리한다. AI 채팅 세션은 `prodigy.ai.chat-session.v1` 키로 존재하며 vault에 저장되지 않는다.
- 플러그인 데이터·workspace 상태는 기기별 (git에 올리지 않는 것을 권장).

. **Workspace별 반응형 동작**: Home(한 줄, 48px, nowrap), Auction(compact overflow menu), Region(compact 단일 열 읽기 전용), Reading(두 패널/한 패널), Project(두 열/한 열, 사람 승인 보존), Knowledge(정본 폭 분류), Personal(정본 토큰), Journal(AdaptiveTabs), Workout(normalizeSessionKind, 운동 교체, 러닝 투영, 식단·러닝 탭, Apple Health 수동·일회성·러닝만), Excel 가져오기(실시간 검색 필터).

. **AI 제공자 보안**: Provider 바인드는 localhost·private tailnet만 허용. `antigravity`·`agy`·OAuth 재사용·공용 bind·LAN bind는 네트워크 호출 전 차단.

. **물리 기기 한계**: 모든 반응형 검증은 headless logical-width harness. 실제 iPhone·iPad·Mac 검증은 미수행. `.omo/evidence/evidence-manifest.json`의 `physical_device_success: false`와 일관됨. 이 문서는 물리 기기 동작을 주장하지 않음.

---

## 10. Git · 개인 데이터 (중요)

현재 정책 의도:

- **제품 코드** (`SYSTEM/Views`, 테스트, 문서, HUB 셸) → git
- **개인 vault 내용** (`DAILY/`, `PARA/`, `ZETA/`, Obsidian runtime 설정) → **gitignore**

실사용 노트는 iCloud vault에 두고, GitHub에는 OS 기능만 올리는 것을 권장한다.

---

## 11. 자주 하는 일 체크리스트

### 아침 (1–3분)
- [ ] `HUB/00 Home` 열기  
- [ ] 브리핑 읽기  
- [ ] 오늘의 집중 확인 (미승인이면 제안 승인)  
- [ ] 이어하기 또는 런처로 Workspace 진입  

### 실행 중
- [ ] Workspace에서 next_action 갱신  
- [ ] 새 일은 **+ 새 Object** 로만 생성 (중복 카드 확인)  

### 저녁 (2분)
- [ ] Daily Reflection / Change / Next Experiment  

### 주말
- [ ] `prodigy.py weekly --week …` 실행  
- [ ] `*-draft.md` 읽고 원칙 pending 검토 (승인/보류는 사람)  

---

## 12. 문제 해결

| 증상 | 조치 |
|------|------|
| Home 스크립트 로드 실패 | Obsidian 재시작 · `SYSTEM/Views` 경로 확인 |
| 브리핑이 비정상 | Home **브리핑 다시 생성** |
| Todoist 0건 | 토큰/플러그인 · Home 경고 확인 (실행은 계속 가능) |
| PRE 패턴 없음 | 해당 주 contentful Daily 3일 이상인지 확인 |
| 카드 안 보임 | Object `type` · `status` · 폴더 경로 확인 |

디버그가 필요하면 (개발 모드) `window.prodigyDebugMode` 등 기존 훅을 쓰되, 일상 사용에서는 끄고 쓴다.

---

## 13. 관련 문서

| 문서 | 내용 |
|------|------|
| [11_Operating_Guide.md](11_Operating_Guide.md) | 운영 루프 · Engine · PRE · Creator 상세 |
| [05_Home.md](05_Home.md) | Home Mission Control 계약 |
| [00_Constitution.md](00_Constitution.md) | 철학 · Homepage = Mission Control |
| [03_Object_Model.md](03_Object_Model.md) | Object 모델 |
| `SYSTEM/AI/Skills/prodigy-review/SKILL.md` | PRE 실행 스킬 |

---

## 14. 변경 이력 (매뉴얼)

| 버전 | 내용 |
|------|------|
| v1.0 | 초기 Obsidian 사용 설명 (Home/Auction 중심, 구 레이아웃) |
| **v2.0** | 실제 HUB·Views·Creator·People·Workout·PRE·git 개인 데이터 정책 반영. Home 한글 Mission Control, Reading 카드 우선, PRE draft 경로 명시. |

---

**끝.**  
시스템이 생각하게 만들지 말고, **일이 생각나게** 쓰는 것이 목표다.
