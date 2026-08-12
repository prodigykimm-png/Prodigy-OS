---
name: prodigy-visual-qa
description: Prodigy OS의 Obsidian Dashboard, Card, Modal, Wizard, popup, split pane 또는 모바일 UI를 만들거나 수정한 뒤 사용한다. 실제 Obsidian 화면과 클릭 흐름을 검증하고 한글 잘림, 중복 숫자, 겹침, Evaluation Error, 빈 화면과 반응형 문제를 확인한다.
---

# Prodigy Visual QA

테스트 통과와 실제 UI 동작을 분리해 검증한다. 상세 시나리오는 `references/qa-matrix.md`를 따른다.

## Gate

1. 관련 정적 테스트와 JavaScript 문법 검사를 먼저 실행한다.
2. Computer Use로 실제 Obsidian에서 대상 Dashboard를 연다.
3. 사용자가 수행할 클릭 흐름을 처음부터 끝까지 실행한다.
4. 기본 Desktop 폭과 좁은 창에서 레이아웃을 확인한다.
5. 화면과 접근성 트리에서 오류, 잘림, 겹침, 빈 패널을 확인한다.

## Mobile Evidence

- 좁은 Desktop 창은 모바일 실기기 검증으로 주장하지 않는다.
- 모바일 호환 정적 테스트는 별도로 기록한다.
- 실제 iPhone 검증은 사용자가 제공한 스크린샷 또는 직접 관찰 가능한 실기기 화면이 있을 때만 인정한다.
- Capacitor stack trace만 보이면 원본 예외를 재현하고 데이터 컬렉션 호환성을 우선 확인한다.

## Verdict

`PASS`, `PASS WITH LIMITATION`, `FAIL` 중 하나로 판정한다. 실제 화면을 열지 못했으면 `PASS`를 사용하지 않는다.
