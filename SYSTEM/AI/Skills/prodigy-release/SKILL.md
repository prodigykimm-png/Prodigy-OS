---
name: prodigy-release
description: 사용자가 Prodigy OS Vault 변경의 commit, push, release 또는 Git 반영을 명시적으로 요청했을 때만 사용한다. 매우 더러운 Vault worktree에서 기능 파일과 직접 테스트만 원자적으로 커밋하고 Daily, 실제 Object, 개인 Obsidian 설정, cache와 삭제 파일의 우발적 포함을 차단한다.
---

# Prodigy Release

명시적 Git 요청에만 실행한다. 상세 분류 기준은 `references/release-policy.md`를 따른다.

## Workflow

1. 아래 audit를 먼저 실행한다.

```bash
uv run SYSTEM/AI/Skills/prodigy-release/scripts/release_audit.py --repo . --format text
```

2. branch, upstream, ahead/behind와 전체 dirty state를 확인한다.
3. 요청한 기능과 직접 테스트만 path 또는 hunk 단위로 stage한다.
4. staged diff 전체와 `git diff --cached --check`를 검토한다.
5. 관련 테스트를 실행한 뒤 저장소의 최근 message style로 commit한다.
6. 사용자가 push를 요청한 경우에만 upstream을 갱신하고 push한다.
7. commit hash와 남은 uncommitted 범주를 보고한다.

## Hard Stops

- 실제 `DAILY/`, `PARA/` 데이터와 삭제 파일은 사용자가 정확히 포함을 요청하지 않으면 stage하지 않는다.
- `.obsidian/workspace*.json`, plugin data, `.gjc/`, `SYSTEM/CACHE/`는 기능 필수임이 입증되지 않으면 제외한다.
- secret 후보가 있으면 commit 전에 중단한다.
- 스크립트는 audit만 수행한다. stage, commit, push를 자동 실행하지 않는다.
