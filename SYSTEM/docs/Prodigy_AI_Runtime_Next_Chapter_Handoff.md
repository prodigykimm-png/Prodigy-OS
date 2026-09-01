# Prodigy AI Runtime — Next Chapter Handoff

## 현재 결론

- Desktop live consumer acceptance 완료.
- `project.workflow_draft`가 disposable real Obsidian의 실제 Project Wizard에서 consent → durable grant → external plugin → Codex CLI → structured result까지 통과했다.
- 취소는 provider process spawn 이후 `cancel_requested`로 관찰됐다.
- 잘못된 route는 certification과 grant를 무효화하고 provider call 0으로 실패했다.
- Vault content/source/canonical writes, prompt·response persistence, secret value 노출, isolated CLI temp residue는 모두 0이다.
- Main vault grant는 비어 있어 실제 사용자 입력은 다시 명시적 consent를 요구한다.

## 저장소 상태

### Dusk

- 경로: `/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk`
- branch: `main`
- verified evidence HEAD: `fbf49a3`
- 주요 관련 commit:
  - `b327a2d` Antigravity cold 인증 재현성 기록
  - `125e6fd` AI Runtime 분리 release evidence 고정
  - `3542f31` Provider 실행 코드를 vault에서 퇴역
  - `fbf49a3` Private Project live 경로를 Codex stdin으로 고정

### Plugin

- 경로: `/Users/prodigykim/Developer/prodigy-ai-runtime`
- branch: `main`
- HEAD: `a43f6dc`
- worktree: clean
- 주요 관련 commit:
  - `fd423ea` Provider 실행 권한을 독립 plugin 경계로 격리
  - `fbbf465` 기존 profile을 plugin 단일 설정으로 이관
  - `ac6face` 실제 CLI conformance를 release 인증으로 고정
  - `a43f6dc` Private prompt를 stdin route로 강제

## 설치 상태

- Plugin ID: `prodigy-ai-runtime`
- Main vault에 설치·활성화됨.
- Installed `main.js` SHA-256:
  - `a546f22bd4f06b205b8071e7bab91e177f6cd97323872fff04ba75e92de3874d`
- Active consumer bindings: 14
  - Codex stdin: mixed·mixed-private·private·highly-private consumer 12개
  - Antigravity argv: internal consumer 2개
- Grants: 0
- Certified profiles:
  - Codex: `786b7658a0e0a29b129dbf89af1ddb8748a09c0d94b84ed747233276ff130af4`
  - Antigravity: `31703aa13c4f83b6fccd44c493ca9cbf8140f8384fe2c041058d6260c2170442`

## 검증 Evidence

- `SYSTEM/docs/Prodigy_AI_Runtime_Desktop_Consumer_Acceptance_v1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Release_Audit_v1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Cold_Verification_v1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Migration_Receipt_v1.json`

Decisive results:

- Plugin tests: 25/25
- Strict TypeScript check: pass
- Browser/mobile-safe bundle: pass
- Project live provider receipt:
  - provider: Codex
  - completed workflow items: 8
  - cancellation: `cancel_requested`
  - declined consent provider calls: 0
  - invalid route provider calls: 0
  - vault content writes: 0
- 14-consumer cutover audit: pass
- Runtime retirement audit: pass
- Installed artifact hash audit: pass
- Protected `KNOWLEDGE`, `ZETA`, `INBOX`, `PARA` paths: unchanged

## 자체피드백에서 해결한 내용

1. Antigravity structured calls에 provider `--json-schema`와 `--disable-slash-commands`를 결속했다.
2. Antigravity print mode가 prompt를 argv에 넣는 OS metadata 노출을 발견했다.
3. Adapter profile과 certification hash에 `prompt_transport`를 포함했다.
4. `argv` transport는 `internal` manifest만 resolve하게 막았다.
5. Project와 나머지 non-internal consumer를 Codex stdin route로 이동했다.
6. Live harness가 task-owned plugin `data.json`만 runtime metadata write로 허용해 grant durability를 검증하게 했다.
7. Consent 거절, success, process-spawn 이후 cancellation, route invalidation을 한 live surface에서 검증했다.

## 알려진 공백

### Mobile

- HTTPS Tailscale relay URL이 이 기기에 없어 live mobile network call은 미검증.
- Relay protocol tests와 mobile fail-closed behavior는 통과.

### Standalone settings harness

- Current Obsidian의 first-open trust onboarding modal이 disposable standalone settings DOM을 가린다.
- 사용자는 이 챕터에서 기존 settings release evidence를 인정하는 선택 A를 승인했다.
- Production plugin load/API와 live Project consumer는 현재 bundle로 통과했다.
- Trust onboarding 자동화는 `Obsidian Harness Compatibility` 독립 챕터 후보이며 현재 release blocker가 아니다.

### Shared worktree

Dusk에는 AI Runtime과 무관한 active 변경이 남아 있다. 예:

- `SYSTEM/Views/home-action-queue.js`
- Home/release-gate 관련 tests와 CI manifest
- Auction template 및 다수 untracked Auction/LLMWiki 작업
- `.obsidian/plugins/dusk-auction-settings/`
- archived/final evidence directories

이 파일들을 stage, 수정, 삭제, 복원하지 말 것. 항상 exact path stage를 사용한다.

## 다음 챕터

### 목표

`prodigy-ai-runtime`을 reproducible하게 배포 가능한 local v0.1 release로 만든다.

포함 범위:

1. Version·manifest·compatibility source of truth 확정
2. Clean checkout에서 deterministic build artifact 생성
3. Release ZIP과 SHA-256 receipt 생성
4. CI에서 typecheck, tests, build, artifact audit 실행
5. Clean disposable vault 설치·upgrade·rollback QA
6. 설치·SecretStorage·device route·consent 문서 작성
7. Hostile 자체피드백 후 수정·재검증
8. Atomic Lore commit

외부 GitHub repository 생성, remote 추가, push, tag publish, GitHub Release 생성은 external write다. 실행 전 사용자에게 한 번의 명시적 승인을 받아야 한다. 승인이 없으면 local reproducible release artifact와 CI definition까지 완료하고 멈춘다.

### Stop condition

- Clean checkout에서 같은 source가 같은 manifest/version/file set을 생성한다.
- Release ZIP을 새 disposable vault에 설치해 handshake와 Project deterministic failure path가 작동한다.
- Upgrade와 rollback이 config secret values를 노출하거나 grants를 잘못 보존하지 않는다.
- Artifact receipt, tests, manual QA, hostile self-review가 통과한다.
- 두 저장소의 관련 변경이 atomic Lore commit으로 남는다.

### 예상 규모

- 예상 시간: 3~7시간
- 예상 토큰: 35k~80k
- GitHub publish까지 포함하면 external auth/CI 문제에 따라 20k~50k 추가 가능

## 새 대화 첫 조사

먼저 다음을 읽고 Git 상태와 대조한다:

```text
AGENTS.md
SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
SYSTEM/docs/Prodigy_AI_Runtime_Release_Audit_v1.json
SYSTEM/docs/Prodigy_AI_Runtime_Desktop_Consumer_Acceptance_v1.json
~/Developer/prodigy-ai-runtime/package.json
~/Developer/prodigy-ai-runtime/manifest.json
~/Developer/prodigy-ai-runtime/esbuild.mjs
~/Developer/prodigy-ai-runtime/scripts/install.mjs
```

첫 명령:

```bash
git status --short --branch
git -C "$HOME/Developer/prodigy-ai-runtime" status --short --branch
npm --prefix "$HOME/Developer/prodigy-ai-runtime" run verify
```

## 절대 조건

- Prompt, response, stdout, stderr, Secret 값은 artifact·log·receipt에 넣지 않는다.
- Mixed/private consumer를 argv prompt transport로 route하지 않는다.
- Main vault grants를 자동 생성하지 않는다.
- Provider fallback을 추가하지 않는다.
- Vault source/canonical files를 provider runtime이 읽거나 쓰게 하지 않는다.
- Unrelated shared-worktree 변경을 stage하거나 복원하지 않는다.
