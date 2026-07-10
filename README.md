# Prodigy OS

> **AI Assisted Personal Operating System**
> AI와 함께 성장하는 개인 운영체제

**일상의 경험을 평생의 의사결정 자산으로 만든다.**

---

## Why Prodigy OS?

Prodigy OS는 단순한 메모 앱이 아니다.

지식, 투자, 프로젝트, 건강, 경험을 하나의 시스템으로 연결하여
**더 나은 의사결정을 지원**하기 위해 존재한다.

Obsidian는 플랫폼일 뿐이다.
Prodigy OS의 핵심은 **데이터 구조, AI, 의사결정 시스템**이다.

---

## 핵심 원칙

```
Object stores data.
Dashboard calculates.
AI assists.
Humans decide.
```

- **Human First**: 운영체제의 주인은 항상 사람이다.
- **AI Assist**: AI는 사람을 대체하지 않고 의사결정을 강화한다.
- **Capture First**: 모든 것은 Capture에서 시작한다. 3초 안에 기록 시작.
- **Object First**: 기본 단위는 Note가 아니라 Object이다.
- **Data First**: Property는 Single Source of Truth. 계산 가능한 값은 저장하지 않는다.
- **Decision First**: 모든 기능은 "더 나은 의사결정을 만드는가?"를 통과해야 한다.

> 상세 원칙: [docs/00_Constitution.md](docs/00_Constitution.md)

---

## Workflow

```text
Capture
    ↓
Object
    ↓
Dashboard
    ↓
Decision
```

1. **Capture**: 정보 입력 (최소 입력, AI가 구조화)
2. **Object**: 구조화된 데이터 저장 (Property + Content)
3. **Dashboard**: Object를 읽고 계산하여 표현 (View)
4. **Decision**: 사람이 최종 결정

> 상세 구조: [docs/01_Architecture.md](docs/01_Architecture.md)

---

## 빠른 참조

| 주제 | 문서 |
|------|------|
| 철학/원칙 | [docs/00_Constitution.md](docs/00_Constitution.md) |
| 시스템 구조 | [docs/01_Architecture.md](docs/01_Architecture.md) |
| 핵심 개념 | [docs/02_Core_Concepts.md](docs/02_Core_Concepts.md) |
| Object 모델 | [docs/03_Object_Model.md](docs/03_Object_Model.md) |
| Capture 시스템 | [docs/04_Capture_System.md](docs/04_Capture_System.md) |
| Home 설계 | [docs/05_Home.md](docs/05_Home.md) |
| AI 역할 | [docs/06_AI_System.md](docs/06_AI_System.md) |
| 구현 규칙 | [docs/07_Implementation_Guide.md](docs/07_Implementation_Guide.md) |
| Obsidian 사용법 | [docs/09_Obsidian_Manual.md](docs/09_Obsidian_Manual.md) |

---

## 개발 방식

```text
Idea
    ↓
Discussion
    ↓
Documentation
    ↓
ADR (Architecture 변경 시)
    ↓
Implementation
    ↓
Real Usage
    ↓
Reflection
    ↓
Documentation Update
```

모든 개발은 **실제 사용**을 통해 검증된다.
추측으로 기능을 만들지 않는다.

---

**Version:** 1.0
**Status:** Active
