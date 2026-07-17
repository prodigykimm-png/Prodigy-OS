# Project Phoenix Final Report

Generated: 2026-07-17

## 1. Legacy Cleanup Report

상세 삭제 근거와 분류는 `SYSTEM/AI/Reports/project-phoenix-legacy-cleanup.md`에 먼저 기록했다.

- Dusk 온보딩, 별도 Mobile Hub, 미사용 ObjectCards, Calendar/Timeline 데모, 구형 Auction 필터, 중복 템플릿과 로컬 백업을 제거했다.
- 총 120개 tracked 파일, 약 7.39 MiB를 제거했다.
- `__pycache__`와 `.DS_Store`를 제거했다.
- `toggle_todo.md`는 현재 Templater hotkey가 사용하므로 보존했다.
- 실제 Object, Daily, Reading/Workout Memory, 실행 결과, 개인 기록은 삭제하지 않았다.
- 기존 `project_note`, `project_family`, `contact` 등은 생성 경로만 중단하고 읽기 호환성을 유지했다.

## 2. Workspace Consistency Review

- Home: 현재 Mission Control 구현을 유지하고 Workout Program Runner 경로, 한국어 Workspace 명칭, Auction 유형 표시를 정리했다.
- Auction: 기존 Dashboard/Card/PRE 계약을 유지했다.
- Reading: 메타데이터 기반 생성, 단순화된 카드, Reading Memory와 Checklist 구현을 유지했다.
- Workout: Program Object 편집, Exercise Object 연결, Program Run 분리 구조를 유지했다.
- Project: Display Registry를 선행 로드하고 Project Card, 상태 흐름, Wizard 라벨을 중앙 한국어 표시 계층에 연결했다.
- Knowledge: 구형 Dataview 표를 간결한 반응형 목록으로 교체했다.
- Personal: People/contact 읽기 호환성과 Area 목록을 하나의 반응형 Workspace로 정리했다.
- Journal: 오늘 기록과 최근 Journal을 직접 여는 운영 화면으로 교체했다.
- 공통 목록 UI는 `SYSTEM/Views/workspace-list-view.js`가 담당한다. Dashboard는 행동, Object는 지식 보존이라는 기존 역할을 유지한다.

## 3. Repository Quality Review

- 삭제한 구현의 active reference를 모두 제거했다.
- `auction_validator.py`의 절대 Dusk 경로를 Vault 상대 경로로 바꿨다.
- README의 제품 루트 명칭을 Prodigy OS로 정리했다.
- Templater와 QuickAdd가 더 이상 `project_note`와 구형 Contact 템플릿을 생성하지 않는다.
- 별도 Mobile Homepage 설정을 비활성화하고 responsive Hub를 단일 원본으로 사용한다.
- Journals의 `journal-date`, `journal-start-date`, `journal-end-date`, `journal-section`은 플러그인 예약 키이므로 snake_case로 임의 변경하지 않았다.
- Property Contract 감사 결과는 71 errors다. 9건은 Journals 예약 키, 57건은 주로 구형 ZETA/Area 템플릿의 Display Registry 라벨 누락, 5건은 Auction 추천 Property와 공식 Schema 간 충돌이다.

## 4. Required Changes (Critical)

1. Auction의 `recommend`, `recommend_level`, `recommend_note`, `recommend_sources`, `recommendation`을 공식 Schema와 맞춰야 한다. Property를 삭제하거나 이름을 바꾸기 전에 현재 Dashboard 사용 계약을 먼저 확정해야 한다.
2. 실제 legacy Object를 새 canonical type으로 옮기는 사용자 승인형 migration이 필요하다. 완료 전에는 호환 reader를 제거하면 안 된다.
3. Property Contract 감사기에 Obsidian/Journals 소유 예약 키와 Prodigy 공식 Property를 구분하는 명시적 예외 계약이 필요하다.

## 5. Recommended Improvements

1. ZETA와 Area의 유지할 템플릿만 확정한 뒤 Display Registry 라벨을 보강한다.
2. 실제 iPhone에서 Home, Knowledge, Personal, Journal의 세로 스크롤과 버튼 터치 영역을 검증한다.
3. 기능 변경과 실제 운영 데이터 변경을 분리해 원자적으로 release한다.

## 6. Safe-to-Delete Files

이번 Sprint에서 안전성이 확인된 항목은 이미 제거했다.

- `SYSTEM/GETTING STARTED/`
- `SYSTEM/MOBILE HUB/`
- `SYSTEM/Views/ObjectCards/`
- `SYSTEM/TEMPLATE/CSS/Calendar/`
- `SYSTEM/TEMPLATE/CSS/Timeline/`
- 미사용 Auction filter 및 meeting todo helper
- `template_journal.md`, `template_project_note.md`, `template_contact.md`
- Iconic backup JSON, CSS backup, Python cache, Finder metadata

추가 삭제는 권장하지 않는다. 특히 실제 Object, Daily, Memory, provider secret alias, `toggle_todo.md`는 현재 보존 대상이다.

## 7. Future AI Preparation Notes

- Reading은 canonical Object, deterministic Memory, human-approved Knowledge 경계를 유지한다.
- Workout은 Exercise Object, Program Object, Program Run이 분리되어 향후 코칭 분석에 사용할 수 있다.
- Project는 Workflow ID와 Todoist ID를 보존해 후속 execution sync를 준비한다.
- Home은 각 Workspace의 current Object와 operational context를 읽는 단일 daily interface다.
- PRE, Evidence Package, Formatter는 이번 cleanup에서 변경하지 않았고 전체 회귀 테스트를 통과했다.
- 고급 AI 기능을 추가하기 전에 남은 Property/Schema 충돌과 legacy Object migration을 먼저 해결하는 것이 안전하다.

## Verification

- 23개 Python/Node product test entry points 통과.
- Project, Home, Knowledge, Personal, Journal을 Obsidian Desktop에서 직접 열어 Evaluation Error, 빈 화면, raw Property key, 잘못된 유형 라벨이 없음을 확인했다.
- Desktop 기본 폭은 통과했다.
- iPhone 실기기와 실제 좁은 macOS 창은 이번 세션에서 검증하지 못해 Visual QA는 `PASS WITH LIMITATION`이다.
