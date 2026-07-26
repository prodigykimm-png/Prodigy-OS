# Prodigy OS — Agent 규칙

## Lore Commit 규칙

비자명한 변경을 커밋할 때는 의사결정 맥락을 git trailer로 기록한다.
참고: https://arxiv.org/abs/2603.15566 | https://github.com/tmdgusya/lora

## 형식

- 명령형 요약 (무엇을 했는지가 아니라 *왜* 했는지에 초점)
- 선택적 본문
- git trailer (모두 선택 — 해당 커밋에 의미 있는 것만 포함)

## Trailer 목록

| Trailer | 용도 | 예시 |
|---------|------|------|
| `Constraint:` | 결정을 제약한 외부 조건 | `Constraint: 인증 서비스가 token introspection 미지원` |
| `Rejected:` | 고려했으나 기각한 대안과 이유 | `Rejected: TTL 24시간 연장 | 보안 정책 위반` |
| `Confidence:` | 확신 수준: `high` / `medium` / `low` | `Confidence: high` |
| `Scope-risk:` | 영향 범위: `narrow` / `moderate` / `broad` | `Scope-risk: narrow` |
| `Reversibility:` | 롤백 난이도: `clean` / `moderate` / `difficult` | `Reversibility: clean` |
| `Directive:` | 미래 수정자를 위한 경고 | `Directive: 4xx 처리 범위를 함부로 좁히지 말 것` |
| `Tested:` | 검증한 내용 | `Tested: 만료 토큰 갱신 단위 테스트` |
| `Not-tested:` | 알려진 테스트 공백 | `Not-tested: 콜드스타트 >500ms 동작` |
| `Related:` | 연결된 커밋 | `Related: a1b2c3d (초기 auth 인터셉터)` |

동일 trailer는 여러 줄 반복 가능. 사소한 변경(오타 수정, 포매팅)에는 trailer를 붙이지 않는다.

## 예시

```text
긴 작업 중 세션 드롭 방지

인증 서비스가 토큰 만료 시 일관되지 않은 상태 코드를
반환하므로, interceptor가 모든 4xx를 받아 인라인 갱신을 트리거함.

Constraint: 인증 서비스가 token introspection 미지원
Rejected: TTL 24시간 연장 | 보안 정책 위반
Rejected: 타이머 기반 백그라운드 갱신 | 경합 조건
Confidence: high
Scope-risk: narrow
Directive: 오류 처리는 의도적으로 광범위(all 4xx) — 상위 동작 확인 없이 좁히지 말 것
Tested: 만료 토큰 갱신 단위 테스트
Not-tested: 인증 서비스 콜드스타트 >500ms 동작
```

## Lore 조회

`git log --all --grep="^Constraint:"` 등으로 의사결정 기록을 검색할 수 있다.

## People Interaction Pipeline

Daily Reflection Evidence 승인 시, `context: "people"` 블록은 자동으로 해당 사람의 CONTACTS 파일에 통찰을 기록한다.

- Evidence 승인 → `runHandoffs()` → PeopleCore + PeopleStore로 `# 핵심 상호작용`에 insight line 추가
- CONTACTS 파일이 없으면 `template_people.md`에서 자동 생성 (`type: people`)
- insight line = 통찰만 (interpretation/title/experience). 날짜·링크 없음 — 최근 맥락(역링크)이 대체
- 별도 사용자 확인 불필요 (Phase 4 자동 handoff)
- Venue/Place handoff와 달리 자동 실행. 단, Evidence 승인 자체가 사용자 승인을 전제함

### 핵심 상호작용 vs 최근 맥락 (중복 아님)

- `# 핵심 상호작용`: 통찰 한 줄. 날짜·출처 없음. 사람이 직접 읽는 큐레이션된 인사이트
- `최근 맥락` (Dataview 역링크): 날짜·Object 링크 자동 계산. 시계열 컨텍스트
- 둘은 역할이 다르며 겹치지 않음
