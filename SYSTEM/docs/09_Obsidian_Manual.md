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

- 지식 Object 탐색 (도메인별).
- PRE·Memory가 자동으로 Knowledge를 만들지 않는다.

### 5.6 사람 — `HUB/60 Personal.md`

- People Workspace (연락처 · 연결 Object).
- 연락처 원본: `PARA/RESOURCES/CONTACTS/`.
- last_contact 등은 **추측하지 않음** (연결·기록 기반).

### 5.7 저널 — `HUB/70 Journal.md`

- Daily 성찰 · 2분 Review UI.
- 성찰 필드: **성찰 (Reflection) · 변화 (Change) · 다음 실험 (Next Experiment)**.
- 저녁에 “오늘 가장 의미 있는 하나”만 남겨도 충분하다.

---

## 6. Daily · Weekly 루프

### 6.1 Daily (`DAILY/DAILY/YYYY-MM-DD.md`)

**저녁 루틴 (권장 2분)**

1. Reflection — 의미 있는 사건 하나  
2. Change — 생각·행동이 어떻게 바뀌었는지  
3. Next Experiment — 내일 바로 시도할 **작은 행동 하나** (여러 개보다 하나)

Home의 아침 브리핑은 어제의 Change / Next Experiment를 짧게 회수한다.

### 6.2 Weekly PRE (주간 초안)

PRE는 **Workspace가 아니다.** 내부 Review Engine이다.

```bash
# vault 루트에서
python3 SYSTEM/AI/Skills/prodigy-review/scripts/prodigy.py weekly --week YYYY-Www
```

예: `2026-W29`

**결과 위치:** `SYSTEM/AI/Skills/prodigy-review/runs/<week>/`

| 파일 | 용도 |
|------|------|
| `weekly-review-*-draft.md` | **사람이 읽을 초안 (권장)** |
| `weekly-review-*.json` | 구조화 결과 |
| `weekly-workspace-view-*.md` | 포맷 뷰 |
| `pipeline.log` | 스캔·패턴 로그 |

**규칙**

- 내용 있는 Daily가 **3일 미만**이면 패턴/원칙을 만들지 않음 (`Not enough evidence`).
- 패턴·원칙에는 **출처 + 짧은 인용**이 붙는다.
- 원칙은 항상 **pending** — 승인·Knowledge 승격은 사람만.
- Daily / Object 원본을 수정하지 않는다.

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
- 큰 터치 영역 · 하단 접기(더 보기) 유지.
- 플러그인 데이터·workspace 상태는 기기별 (git에 올리지 않는 것을 권장).

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
