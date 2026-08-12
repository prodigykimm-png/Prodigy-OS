ADR-006

Title
ADR-006-adr-governance-redefine

Status
Accepted

Date
2026-07-08

Context
Prodigy OS는 여러 Agent(Claude, Codex, GPT 등)가 구현을 담당하고 있다.

기존 ADR Workflow는 "문제 발견 → ADR → 문서 수정 → 구현" 순서를 가정했지만, 실제 개발은 "Issue 발견 → Agent 구현 → 실사용 → 검토 → 문서 수정" 순서로 진행된다.

ADR가 구현 이전에 위치하면서 불필요한 병목이 발생했다.

Agent가 Dataview 수정, Dashboard 개선, Template 수정, 버그 수정 등 구현을 할 때마다 ADR 작성이 필요하다고 오해되어 실제 개발 속도가 저하되었다.

Decision
ADR의 역할을 재정의한다.

1. ADR은 Architecture 변경이 필요한 경우에만 작성한다.
2. 구현은 ADR 없이 진행할 수 있다.
3. 실사용이 Architecture를 결정한다.
4. 구현 전 ADR 작성 원칙을 폐기한다.
5. ADR 작성 기준을 명확히 분리한다.

Alternatives Considered
1. 기존 방식 유지

모든 변경을 ADR로 기록
Rejected
Agent가 대시보드 한 줄 수정할 때도 ADR을 작성해야 하는 오해 발생
실제로는 ADR이 작성되지 않아 문서와 현실이 분리됨

2. ADR 폐기

모든 변경을 Git Commit과 CHANGELOG로 관리
Rejected
Architecture 변경 기록이 사라짐
5년 후 "왜 이렇게 설계했는지" 알 수 없음

Consequences
Positive
- 구현 속도 향상
- Agent가 Architecture 변경 우려 없이 구현 가능
- ADR가 실제로 필요한 변경에만 집중됨
- 문서와 현실의 괴리 감소
- Issue 기록이 자유로워짐

Negative
- Architecture 변경이 ADR 없이 이루어질 위험 존재
- CTO의 Architecture Review 역할이 더 중요해짐
- Agent가 Architecture 변경을 판단하지 못할 수 있음

Related Documents
00_Constitution.md
07_Implementation_Guide.md
docs/ADR/ADR.md