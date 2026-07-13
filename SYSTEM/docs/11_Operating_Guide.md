# Prodigy OS Operating Guide v1.1

> "폴더를 고민하지 말고, '이게 무엇인가?'를 생각하라."

---

# 1. Purpose

이 문서는 Prodigy OS를 실제로 어떻게 사용하는지 설명한다.

Prodigy OS는 단순한 폴더 시스템이 아니다.
Prodigy OS는 매일 사용하는 개인 운영체제이다.

이 가이드는 다음을 돕는다:
- 매일 아침 무엇을 해야 하는지
- 정보가 들어왔을 때 어디에 두어야 하는지
- Object, Capture, Journal, Knowledge, Project의 차이
- AI를 언제, 어떻게 활용해야 하는지

> 시스템 구조: [docs/01_Architecture.md](docs/01_Architecture.md)
> 핵심 개념: [docs/02_Core_Concepts.md](docs/02_Core_Concepts.md)

---

# 2. Core Usage Rules

## 2.1 Start from Home

Home은 시작점이다.
Home을 열면 오늘 해야 할 일, 진행 중인 Object, Capture, Review가 보인다.
폴더부터 열지 않는다. Home을 먼저 연다.

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

## 2.4 Journal Records Reflection, Not All Work

Journal은 하루를 돌아보는 기록이다.
업무 로그가 아니다.
무엇을 했는지보다 무엇을 배웠는지, 어떻게 느꼈는지를 기록한다.

## 2.5 Knowledge Grows Over Time

Knowledge Object는 한 번에 완성되지 않는다.
시간이 지나며 Content가 추가되고, 연결이 확장된다.
새 Knowledge를 만들기 전에 기존 Knowledge를 업데이트할 수 있는지 확인한다.

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

---

## Scenario 5 — 개인 활동 (운동, 건강)

```text
1. Personal Object 열기 (Workout)
2. Property 업데이트: 운동 종류, 시간, 강도
3. 특별한 감정이나 깨달음이 있다면 Journal에 기록
4. 추세는 Dashboard에서 확인
```

- Personal Object는 장기적인 데이터를 저장한다.
- Journal은 운동 기록이 아니라 감정, 깨달음, 회고를 위한 공간이다.

**Personal vs Journal:**
- Personal = 장기 추적 데이터 (운동 기록, 체중, 루틴)
- Journal = 하루 회고, 감정, 깨달음

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

# Final Statement

Prodigy OS는 폴더 시스템이 아니다.
Prodigy OS는 매일 사용하는 개인 운영체제이다.

Home에서 시작한다.
Object를 중심으로 작업한다.
Capture에 정보를 보존하고, 나중에 Object로 만든다.
AI의 도움을 받되, 최종 결정은 사람이 내린다.

모든 Object는 사람의 소유이다.

---

**Version:** 1.1
**Status:** Active
**Depends on:**
- docs/00_Constitution.md
- docs/01_Architecture.md
- docs/02_Core_Concepts.md
- docs/03_Object_Model.md
- docs/04_Capture_System.md
- docs/05_Home.md