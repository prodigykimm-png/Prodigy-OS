# Prodigy OS

> **AI Assisted Personal Operating System**
> AI와 함께 성장하는 개인 운영체제

**일상의 경험을 평생의 의사결정 자산으로 만든다.**

---

## Why Prodigy OS?

Prodigy OS는 단순한 메모 앱이나 단순 수동 폴더 구조가 아닙니다.

개인의 지식, 투자, 프로젝트, 건강, 경험을 하나의 시스템으로 연결하여 **더 나은 의사결정을 지원**하기 위해 설계된 대시보드 중심 아키텍처(Dashboard-Driven Architecture) 시스템입니다.

Obsidian은 뷰를 표현하고 작동시키는 플랫폼일 뿐, Prodigy OS의 핵심은 **정규화된 데이터 구조(SSoT), AI 연동, 그리고 철저히 제한된 워크플로우**입니다.

---

## 핵심 원칙

```text
Object stores data.
Dashboard calculates.
AI assists.
Humans decide.
```

- **Human First**: 운영체제의 주인은 항상 사람입니다. AI는 조치와 요약을 제안할 뿐 최종 승인과 결정은 인간이 내립니다.
- **Capture First**: 모든 기록은 3초 이내에 📥 Inbox에서 빠르고 심플하게 시작합니다. 폴더나 속성 분류는 AI가 사후에 처리합니다.
- **Object First**: 기본 관리 단위는 일반 텍스트 노트가 아니라 독립적인 속성을 지닌 Object(경매 사건, 프로젝트, 지식 등)입니다.
- **Data First (SSoT)**: YAML Property는 유일한 진실의 원천입니다. 계산을 통해 도출 가능한 2차 값은 중복하여 물리적으로 저장하지 않고 대시보드에서 실시간 계산합니다.
- **Decision First**: 대시보드는 정적인 분석 차트의 나열이 아니라, "오늘 당장 무엇을 행동해야 하는가"를 가이드하는 Operational Workspace입니다.

> 상세 원칙 문서: [docs/00_Constitution.md](docs/00_Constitution.md)

---

## Workflow

```text
Capture (Inbox)
    ↓
Object (Properties)
    ↓
Dashboard (Calculation & Filter)
    ↓
Decision (Human Action)
```

1. **Capture**: 📥 Inbox를 통해 날것의 아이디어나 외부 정보(URL, 텍스트)를 최소 입력으로 임시 저장합니다.
2. **Object**: AI가 템플릿 표준에 맞춰 메타데이터(Property)를 추출하여 구조화된 Object 노트를 생성합니다.
3. **Dashboard**: 각 도메인의 대시보드가 Object 속성을 읽고 실시간으로 상태를 추적 및 필터링하여 사용자에게 보여줍니다.
4. **Decision**: 사용자는 카드 내 퀵 액션 버튼 클릭만으로 워크플로우 상태를 변경하고 최적의 의사결정을 내립니다.

> 상세 구조 문서: [docs/01_Architecture.md](docs/01_Architecture.md)

---

## 시스템 폴더 구조

```text
Dusk/ (Vault Root)
├── HUB/
│   ├── 00 Home.md    ← 네비게이션 허브 (워크스페이스 런처)
│   ├── 10 Auction.md ← 경매 도메인 작업 공간 (Operational Workspace)
│   ├── 20 Reading.md ← 독서 도메인 작업 공간
│   ├── 30 Workout.md ← 운동 도메인 작업 공간
│   ├── 40 Project.md ← 프로젝트 도메인 작업 공간
│   ├── 50 Knowledge.md ← 지식 탐색 작업 공간
│   ├── 60 Personal.md ← 개인 라이프/할 일 관리 공간
│   ├── 70 Journal.md  ← 일일 일지 및 정기 회고 공간
│   └── Inbox.md      ← 임시 저장소 및 빠른 캡처 공간 (FLEETING 노트 수집)
├── PARA/
│   ├── PROJECTS/     ← 진행 중인 프로젝트 단위의 실존 Object들 (사건번호.md 등)
│   ├── AREAS/        ← 지속적 관리 영역 (건강, 자산 등)
│   ├── RESOURCES/    ← 참고용 정적 자료
│   └── ARCHIVES/     ← 완료되어 보관된 문서들
├── ZETA/             ← 영구 지식 회고 및 제텔카스텐 저장소
│   ├── FLEETING/     ← 일상적이고 빠른 임시 기록 (Fleeting Notes)
│   └── LITERATURE/   ← 독서, 논문 등에서 추출한 지식 (Literature Notes)
├── DAILY/            ← 일일 회고 및 기록 저장소
├── STICKY/           ← 상시 참조가 필요한 고정 문서
└── SYSTEM/           ← 시스템 작동을 위한 템플릿, CSS 및 코드 스크립트
```

---

## 빠른 참조

| 주제 | 문서 링크 |
|------|------|
| 헌법 (최상위 철학) | [docs/00_Constitution.md](docs/00_Constitution.md) |
| 시스템 아키텍처 | [docs/01_Architecture.md](docs/01_Architecture.md) |
| 핵심 개념 설명 | [docs/02_Core_Concepts.md](docs/02_Core_Concepts.md) |
| Object 모델 명세 | [docs/03_Object_Model.md](docs/03_Object_Model.md) |
| 캡처 시스템 설계 | [docs/04_Capture_System.md](docs/04_Capture_System.md) |
| Home 설계 규칙 | [docs/05_Home.md](docs/05_Home.md) |
| AI 어시스턴트 역할 | [docs/06_AI_System.md](docs/06_AI_System.md) |
| 구현 및 가이드라인 | [docs/07_Implementation_Guide.md](docs/07_Implementation_Guide.md) |
| 실제 작동 설명서 | [docs/09_Obsidian_Manual.md](docs/09_Obsidian_Manual.md) |

---

**Version:** 2.0 (Prodigy OS Standard)
**Status:** Active
