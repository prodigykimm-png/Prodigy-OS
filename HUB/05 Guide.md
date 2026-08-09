---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

# Prodigy OS 사용법

> 이 문서는 Prodigy OS를 처음 사용하거나 흐름이 기억나지 않을 때 여는 안내서입니다.

---

## 시작점

모든 것은 **Home**에서 시작합니다. 폴더를 직접 열지 않습니다.

Home에서 할 수 있는 것:

- 오늘 할 일 확인 (집중·이어하기·주의 대상)
- **+ 새 Object** — 유일한 Object 생성 진입점
- **+ 오늘 Daily** — 오늘 저널 열기 또는 생성
- **검색** — Vault 전체 검색
- **사용법** — 이 문서

---

## 무엇을 어디에 기록하는가

| 상황 | 이동 | 행동 |
|---|---|---|
| 오늘 한 일·배운 것·감정 | 저널 (Journal) | Daily 작성 → Evidence Block |
| 읽은 책·아티클 정리 | 독서 (Reading) | 세션 기록 → 복기 |
| 경매 물건 분석 | 경매 (Auction) | 사건 생성 → 권리·현장·입찰 |
| 반복 관리할 책임 영역 | 프로젝트 (Project) | 프로젝트 또는 영역 생성 |
| 운동 기록 | 운동 (Workout) | 세션 기록 |
| 사람·관계 맥락 | 개인 (Personal) | 사람 추가 |
| 검증된 지식·원칙 | 지식 (Knowledge) | 후보 작성 → 승인 → 영구 지식 |
| 아직 분류 못 한 빠른 메모 | Inbox | 빠른 기록 → 나중에 검토 |

---

## 핵심 흐름: 경험 → 지식 → 더 나은 판단

```text
경험 (Daily·Reading·Auction·Workout)
  ↓
성찰 (Journal Evidence Block)
  ↓
지식 후보 (Knowledge Candidate)
  ↓
사람 승인 (검증 대기 → 승인)
  ↓
영구 지식 (ZETA/PERMANENT)
  ↓
판단에 활용 (Decision Packet·PARA 연결)
```

---

## 지식 워크스페이스

지식 화면에는 두 탭이 있습니다.

### 지식 구축 · 제텔카스텐 (기본 탭)

지식을 만들고 키우는 공간입니다.

- **+ 지식 후보 작성**: 직접 공부하거나 경험한 내용을 후보로 저장
- **+ 문헌노트 작성**: 문헌·웹 자료를 출처와 함께 Literature Note로 정리
- **검증 대기**: 저장된 후보를 검토하고 승인·반려·보류
- **지식 탐색기**: 도메인 → 주제 → 영구 지식 순서로 탐색

승인된 지식만 `ZETA/PERMANENT/`에 영구 보관됩니다.

### 지식 활용 · PARA

프로젝트·영역·자료에서 실제로 쓰는 지식을 보는 공간입니다.

- 명시적으로 연결된 승인 지식만 표시
- 후보·미검증 자료는 여기에 나타나지 않음
- 연결이 없으면 "연결된 지식 없음"으로 표시

---

## 저널 (Journal)

- **Daily**: 오늘 한 일, 배운 것, 감정을 Evidence Block으로 기록
- **Weekly**: 한 주를 복기하고 패턴을 확인
- **Monthly**: 반복된 Evidence에서 원칙 후보를 검증·승인

AI는 Evidence를 정리하고 후보를 제안할 수 있지만, 저장·승인·승격은 항상 사람이 합니다.

---

## 경매 (Auction)

상태 흐름: `관찰 → 입찰 → 낙찰/유찰/포기 → 복기 → 보관`

- 사건 생성: Home의 **+ 새 Object** 또는 경매 대시보드
- 권리분석·시장분석·현장임장·입찰 준비는 각 카드에서 진행
- 복기 완료 후 보관

---

## 독서 (Reading)

- 책 추가 → 읽기 시작 → 세션 기록 → 복기 → 완독
- Reading Session의 핵심 내용은 Knowledge Candidate로 제안 가능
- Candidate 저장과 Knowledge 승격은 사람이 승인

---

## 개인 (Personal)

- 사람 추가: 이름만 입력하면 People Object 생성
- 관계 맥락·상호작용 기록은 People Object에 보관
- 원본 사건·작업은 각 Object가 소유, People은 연결만

---

## AI 경계

| AI가 하는 것 | 사람이 하는 것 |
|---|---|
| Evidence 정리·요약 | 저장 여부 결정 |
| 패턴 감지·후보 제안 | 승인·반려·보류 |
| 분류·연결 추천 | 최종 분류 확정 |
| 브리핑·요약 생성 | 실제 판단·실행 |

AI는 어떠한 경우에도 Knowledge를 자동 생성·승인·승격하지 않습니다.

---

## Object 생성은 어디서?

**Home의 + 새 Object**가 유일한 생성 진입점입니다.

Inbox는 "미분류 기록 검토함"입니다. 여기서 새 Object를 만들지 않습니다.

---

## 문제가 생기면

1. Home을 다시 엽니다
2. Obsidian을 재시작합니다
3. 필수 플러그인 확인: Dataview, Datacore, JS Engine, Meta Bind, Templater, QuickAdd, Journals, Tasks

---

*이 문서는 Prodigy OS v1.5 기준입니다. 계약 변경 시 SYSTEM/docs/11_Operating_Guide.md와 함께 갱신합니다.*
