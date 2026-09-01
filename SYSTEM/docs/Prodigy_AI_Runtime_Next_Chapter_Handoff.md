# Prodigy AI Runtime — Next Chapter Handoff

## Canonical continuation — GitHub publication 완료

관리자 외부 쓰기 승인 후 local v0.1 reproducible release를 private GitHub repository,
hosted CI, annotated tag, policy-immutable Release assets에 publish하고 재다운로드 검증까지
완료했다.

- Repository: `https://github.com/prodigykimm-png/prodigy-ai-runtime`
- Visibility: `PRIVATE`
- Default branch: `main`
- Published commit: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Hosted CI: `Verify release` run `33500227218`, `success`
- Tag: annotated unsigned `v0.1.0`
- Release: `https://github.com/prodigykimm-png/prodigy-ai-runtime/releases/tag/v0.1.0`
- Published asset set: ZIP, JSON receipt, SHA-256 sidecar exact 3
- Downloaded asset byte identity: pass
- Downloaded ZIP real disposable Obsidian QA: `2/2`
- Project deterministic fail-closed: pass
- Secret·prompt·response·stdout·stderr, vault write, temp·synthetic residue: `0`
- Dusk unrelated tracked modifications: untouched and unstaged

Canonical publication evidence:

- `SYSTEM/docs/Prodigy_AI_Runtime_Publication_Receipt_v1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Publication_Runbook_v1.md`
- `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_publication_audit.js`

### 다음 챕터

`Obsidian Harness Compatibility`를 다음 local chapter로 지정한다.

정확한 목표는 current Obsidian first-open trust onboarding을 test-owned disposable
vault에서 결정론적으로 통과시켜 standalone `prodigy-ai-runtime` settings surface를
다시 release gate에 포함하는 것이다.

Stop condition:

- fixed sleep이나 timing luck 없이 trust onboarding의 실제 event/state를 기다린다.
- clean disposable Obsidian에서 external plugin이 enable되고 settings tab이 열린다.
- settings DOM에서 profile, route, SecretStorage ID 경계가 관찰된다.
- prompt, response, schema, secret value, raw stdout/stderr persistence가 `0`이다.
- browser·OS network와 vault source/canonical write가 `0`이다.
- harness temp root와 synthetic fixture residue가 `0`이다.
- 기존 Project live consumer와 publication release QA가 회귀 없이 통과한다.
- 결과가 atomic Lore commit과 새 canonical handoff에 남는다.

> 아래 `이전 handoff 결론`부터 파일 끝까지는 publication 전 의사결정과 실행 계획을
> 보존한 historical snapshot이다. 현재 상태나 실행 지시가 아니며, 이 파일 최상단의
> canonical continuation과 publication receipt가 우선한다.

## 이전 handoff 결론 — publication 전 snapshot

`prodigy-ai-runtime` local v0.1 reproducible release 챕터와 종료 감사를 완료했다.

- Version·manifest·compatibility source of truth가 release gate에 결속됐다.
- Clean source export에서 `npm ci`와 deterministic build가 통과했다.
- Release ZIP, JSON receipt, SHA-256 sidecar가 생성되며 같은 source의 반복 build는 byte-identical이다.
- CI definition이 typecheck, tests, build, artifact audit를 실행한다.
- Audited ZIP을 clean disposable Obsidian에 설치하고 production installer로 upgrade → rollback → reinstall했다.
- 설치, SecretStorage, device route, consent, upgrade, rollback 문서가 작성됐다.
- Hostile 종료 감사의 실질 문제를 test-first로 수정하고 tests/build/real QA/privacy·residue audit를 반복했다.
- Runtime와 Dusk의 관련 변경은 atomic Lore commit으로 남았다.
- GitHub repository 생성, remote 추가, push, tag, Release 발행은 실행하지 않았다.

## 완료된 사용자 요구사항

1. `package.json#version`을 canonical version authority로 확정하고 `manifest.json`, `versions.json`, runtime handshake drift를 fail closed로 검증했다.
2. Build artifact에서 source map과 host metadata를 제외하고 deterministic ZIP을 생성했다.
3. ZIP의 exact file set을 `main.js`, `manifest.json`, `versions.json`으로 고정했다.
4. ZIP SHA-256 sidecar와 metadata-only JSON receipt를 생성했다.
5. CI를 Ubuntu 24.04, Node 24.19.0, npm 11.17.0에 고정하고 활성 npm version을 assertion한다.
6. Clean export `npm ci`와 release gate가 통과했다.
7. Clean disposable Obsidian에서 ZIP install, handshake, Project deterministic fail-closed를 관찰했다.
8. Production installer를 사용한 upgrade, rollback, candidate reinstall에서 durable config exact 보존과 stale grant 비활성 상태를 확인했다.
9. SecretStorage ID와 value 경계, device-local route, consent와 grant revision, rollback 절차를 문서화했다.
10. Hostile 자체피드백의 실질 문제를 해결하고 최종 privacy/write/temp residue audit를 통과했다.
11. 다른 작업자의 Dusk 변경은 stage, 수정, 삭제, 복원하지 않았다.

## Publication 전 저장소 source of truth (historical)

### Dusk

- 경로: `/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk`
- branch: `main`
- handoff 작성 직전 HEAD: `5a5d99406a3535e5b2c1a36fdc171278a934f9db`
- AI Runtime release acceptance commit: `145d78ffed496dfd148d1f5ac46dee613323b289`
- canonical handoff commit: 이 파일을 포함하는 commit
- `5a5d994`는 병행 작업자의 Auction 변경이며 AI Runtime이 수정하지 않았다.

### Plugin

- 경로: `/Users/prodigykim/Developer/prodigy-ai-runtime`
- branch: `main`
- HEAD: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- worktree: clean
- remote: 없음
- 주요 commit:
  - `4c83dea` local v0.1 reproducible release
  - `d438053` installer transaction·ZIP-bound QA·pinned CI closure fix
  - `a43f6dc` private prompt stdin route enforcement

## Local v0.1 artifact

- Version: `0.1.0`
- Minimum Obsidian: `1.8.7`
- ZIP: `dist/prodigy-ai-runtime-0.1.0.zip`
- ZIP SHA-256: `720c4516e67d9e7e3a98d74b6796b11afa56a11cdc4bcdb63dc7e00ad7a559f8`
- Receipt SHA-256: `9f2054f8392c1a6bd84ed936d2e3236ddc04bb5c59b478c9c194c22835b17827`
- Candidate `main.js`: `06723255e93a563f8b43375fa30fa901eb7ff1e4593e873f978092d38e879bd7`
- Main vault installed `main.js`: `a546f22bd4f06b205b8071e7bab91e177f6cd97323872fff04ba75e92de3874d`
- Main vault grants: `0`

Candidate는 disposable vault에서 검증했으며 main vault artifact를 자동 upgrade하지 않았다.

## 검증 결과

### Runtime gate

- Strict TypeScript: pass
- Plugin/release tests: `35/35`
- Build: pass
- Repeated build byte identity: pass
- ZIP integrity: pass
- SHA sidecar: pass
- Archive file set: exact 3
- Clean source export `npm ci`: pass
- Clean export와 working source artifact byte identity: pass

### 실제 Obsidian QA

`SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_qa.js`

- Tests: `2/2`
- Audited ZIP SHA·size·entry set 검증 후 test-owned temp에 직접 extract
- ZIP receipt와 Dusk release audit digest 결속
- Clean install handshake: pass
- Project `capability_unavailable`: pass
- Browser and OS network attempts: `0`
- Production installer upgrade: pass
- Production installer rollback: pass
- Candidate reinstall: pass
- Durable `data.json`: byte-exact preserved
- Stale grant became usable: false
- Complete disposable vault tree audit: exact
- Protected existing Obsidian processes: unchanged
- Harness runtime root removed: true

### Audit verifier

`SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_audit.js`

- Tests: `1/1`
- Final runtime Git HEAD binding: pass
- Release/closure/acceptance commit existence: pass
- ZIP, sidecar, receipt, audit hash agreement: pass
- Privacy and residue counters: pass

### Privacy·write·residue

- Secret value artifact hits: `0`
- Prompt/response diagnostic persistence hits: `0`
- Raw stdout/stderr persistence hits: `0`
- Vault source/canonical writes: `0`
- Main vault grants changed: false
- Main vault installed artifact changed: false
- Installer transaction residue: `0`
- Task-owned temporary directory residue: `0`
- Synthetic `qa-release` and stale source-map residue: `0`
- Expected retained local artifacts: ZIP, JSON receipt, SHA sidecar, generated `main.js`

Canonical evidence:

- `SYSTEM/docs/Prodigy_AI_Runtime_Local_Release_Audit_v0.1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Release_Audit_v1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Desktop_Consumer_Acceptance_v1.json`

## Hostile 자체피드백에서 발견하고 해결한 내용

### Critical

1. **실제 QA가 audited ZIP이 아니라 임의 candidate directory를 신뢰했다.**
   - ZIP SHA, size, sidecar, exact central-directory entries와 receipt file hash를 검증한 뒤 test-owned temp에 직접 extract하도록 수정했다.
2. **Release audit가 final Git/artifact source truth와 기계적으로 결속되지 않았다.**
   - Runtime final HEAD, release commit, Dusk acceptance commit, ZIP·receipt·sidecar를 검증하는 audit test를 추가했다.

### High

3. **Upgrade·rollback QA가 production installer를 우회해 직접 copy했다.**
   - 실제 `scripts/install.mjs`를 호출해 lifecycle QA가 installer behavior를 검증하게 했다.
4. **Installer가 destination 전체를 선검증하지 않아 중간에 non-regular path를 만나면 partial update가 가능했다.**
   - 모든 destination release entry를 먼저 regular-file 또는 absent로 검증한다.
5. **감지된 mid-copy I/O failure가 mixed old/new file set을 남길 수 있었다.**
   - Transaction backup과 exception rollback으로 complete previous set을 복원한다.

### Medium

6. **Interrupted transaction 복구 전에 destination snapshot을 만들어 missing-file 상태가 왜곡될 수 있었다.**
   - Recovery를 destination validation과 snapshot보다 먼저 실행한다.
7. **State 기록 전 중단된 preparation residue가 다음 install을 영구 차단했다.**
   - Live file을 건드리기 전 state가 없는 transaction은 안전하게 폐기하고 새 transaction을 시작한다.
8. **CI runner·Node·npm이 drift할 수 있었다.**
   - Ubuntu 24.04, Node 24.19.0, npm 11.17.0을 pin하고 실제 npm version을 assertion한다.

### Low

9. **Installer stdout이 absolute vault target을 노출했다.**
   - Output을 plugin ID, version, file set, durable-config policy로 제한했다.
10. **실제 QA가 runtime version `0.1.0`을 hardcode했다.**
    - Audited receipt의 version을 handshake expectation으로 사용한다.
11. **Generic residue sentinel이 fixture 보안 validator source와 충돌했다.**
    - Chapter 고유 sentinel만 scan하고 request/input hash 같은 허용 metadata는 원문 residue와 구분한다.

### 기각한 과잉 지적

- Release QA에 fallback, private argv, valid-grant revision suite를 다시 복제할 필요는 없다. 최종 shipped bundle은 35-test runtime gate와 이전 live consumer acceptance에 결속된다.
- Vault-write audit가 opaque하다는 지적은 사실과 다르다. `RealObsidianHarness.close()`는 complete disposable vault tree hash를 비교하고 declared JSON 외 변경을 거부한다.
- 세 파일의 단일 portable filesystem atomic swap은 현재 Node contract에 없다. Installer는 plugin-disabled 조건에서 destination 선검증, transaction backup, 감지된 failure rollback과 next-run interrupted-state recovery를 제공한다.

## Publication 전 미검증 또는 외부 조건 (historical)

1. GitHub-hosted workflow는 remote와 push가 없어 실행되지 않았다.
2. GitHub repository 생성, remote 추가, push, tag, Release publish는 external write 승인 전 미실행이다.
3. 현재 `gh`는 `prodigykimm-png` account로 인증되어 있으나 이 사실은 쓰기 승인이 아니다.
4. HTTPS mobile relay URL이 없어 live mobile network call은 미검증이다.
5. 실제 iPhone/iPad physical-device QA는 미검증이다.
6. Installer는 감지된 I/O failure와 interrupted state를 검증했지만 모든 filesystem instruction 경계의 process kill·power loss는 미검증이다.

## Publication 전 Dusk unrelated worktree (historical)

Handoff 작성 시 AI Runtime과 무관한 tracked modification 7개가 남아 있다:

- `SYSTEM/AI/Skills/prodigy-review/tests/home/test_home_action_queue.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_literal_git_archive.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_release_gate.js`
- `SYSTEM/CI/release-gate-manifest.json`
- `SYSTEM/CI/task16-final-receipt-verifier.js`
- `SYSTEM/TEMPLATE/FORMAT/template_auction_case.md`
- `SYSTEM/Views/home-action-queue.js`

Untracked path는 `1,586`개다. 주요 범주:

- `SYSTEM/AI/Reports/**`: `1,403`
- `SYSTEM/AI/Skills/prodigy-review/**`: `34`
- `SYSTEM/SCRIPTS/**`: `36`
- `SYSTEM/Views/**`: `20`
- `SYSTEM/docs/**`: `21`
- 나머지 CI, plugin, Auction, LLMWiki, evidence 파일

이 경로들은 다른 작업자의 active work다. 절대 stage, 수정, 삭제, rename, restore하지 말고 AI Runtime owned path만 exact-path stage한다.

## 완료된 GitHub publication 계획 (historical)

### 정확한 목표

명시적 외부 쓰기 승인 후 `prodigy-ai-runtime` v0.1.0을 GitHub repository와 hosted CI에 reproducible하게 publish하고, release assets를 다시 다운로드해 local source artifact와 byte identity 및 clean disposable Obsidian install을 검증한다.

### 작업 범위

1. Repository owner, name, visibility, license, commit-history 공개 범위를 확정한다.
2. 실행할 외부 쓰기 목록을 한 번 제시하고 명시적 승인을 받는다.
3. 승인된 GitHub repository를 생성하거나 기존 repository를 확인한다.
4. `origin` remote를 추가하고 approved branch/history만 push한다.
5. Hosted CI에서 pinned release gate 통과를 관찰한다.
6. Verified commit에 annotated `v0.1.0` tag를 만들고 push한다.
7. ZIP, JSON receipt, SHA sidecar를 GitHub Release asset으로 publish한다.
8. Release asset을 새 temp root에 download하고 local artifact와 byte-compare한다.
9. Downloaded ZIP으로 disposable Obsidian handshake·Project fail-closed를 반복한다.
10. Publication receipt와 rollback/revocation 절차를 Dusk에 기록하고 atomic Lore commit한다.

### 선행 조건

- GitHub repository 생성·remote·push·tag·Release에 대한 한 번의 명시적 external-write 승인
- Owner/account: 현재 인증된 `prodigykimm-png` 사용 여부 확인
- Repository visibility: private/public 결정
- License와 README 공개 범위 결정
- Existing full Git history 공개 여부 결정
- Tag signing 요구 여부 결정
- Runtime worktree clean과 HEAD `d438053` 재확인
- Dusk unrelated worktree exact-path isolation

승인이 없거나 거절되면 external write를 하나도 실행하지 않고 chapter를 blocked로 기록한다.

### 위험 요소

- Public visibility 선택 시 Git history와 author metadata가 영구 공개될 수 있음
- `v0.1.0` tag와 published asset은 소비자가 참조하므로 사후 교체가 supply-chain 혼동을 만듦
- GitHub runner/npm/toolchain drift 또는 Actions 권한 문제
- Initial push history와 local-only path·secret-like data의 pre-publish audit 누락
- Release asset과 tag commit 불일치
- Concurrent Dusk worktree를 accidental stage할 위험
- GitHub auth scope는 충분해 보여도 organization policy가 repository creation을 차단할 수 있음

### Stop condition

- Approved GitHub repository의 default branch가 verified runtime commit을 가리킨다.
- Hosted CI가 strict typecheck, 35+ tests, build, deterministic artifact audit를 통과한다.
- `v0.1.0` tag가 verified commit을 가리킨다.
- GitHub Release의 ZIP·JSON·SHA assets가 local artifact와 byte-identical이다.
- Downloaded ZIP이 clean disposable Obsidian handshake와 Project fail-closed를 통과한다.
- Secret/prompt/response/stdout/stderr, vault write, temp/synthetic residue가 0이다.
- Publication evidence가 Dusk atomic Lore commit으로 남는다.
- Unrelated Dusk changes는 untouched·unstaged다.

## 완료된 publication chapter 첫 조사 (historical)

### 먼저 읽을 파일

```text
AGENTS.md
SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
SYSTEM/docs/Prodigy_AI_Runtime_Local_Release_Audit_v0.1.json
SYSTEM/docs/Prodigy_AI_Runtime_Release_Audit_v1.json
SYSTEM/docs/Prodigy_AI_Runtime_Desktop_Consumer_Acceptance_v1.json
~/Developer/prodigy-ai-runtime/AGENTS.md
~/Developer/prodigy-ai-runtime/package.json
~/Developer/prodigy-ai-runtime/manifest.json
~/Developer/prodigy-ai-runtime/versions.json
~/Developer/prodigy-ai-runtime/.github/workflows/verify-release.yml
~/Developer/prodigy-ai-runtime/docs/RELEASE.md
~/Developer/prodigy-ai-runtime/docs/INSTALLATION.md
~/Developer/prodigy-ai-runtime/scripts/release.ts
~/Developer/prodigy-ai-runtime/scripts/install.mjs
```

### 첫 번째로 실행할 명령

```bash
git status --short --branch
git log -5 --oneline --decorate
git -C "$HOME/Developer/prodigy-ai-runtime" status --short --branch
git -C "$HOME/Developer/prodigy-ai-runtime" log -5 --oneline --decorate
git -C "$HOME/Developer/prodigy-ai-runtime" remote -v
gh auth status
npm --prefix "$HOME/Developer/prodigy-ai-runtime" run verify:release
shasum -a 256 "$HOME/Developer/prodigy-ai-runtime/dist/prodigy-ai-runtime-0.1.0.zip"
```

그 다음 repository owner·visibility·license·history·tag policy와 정확한 외부 쓰기 목록을 제시하고 승인 질문 하나에서 멈춘다.

## 완료된 publication chapter 예상치 (historical)

- Pre-publish history/privacy audit와 승인 packet: `1~2시간`, `15k~30k tokens`
- Repository/remote/push/hosted CI/tag/Release: `1~3시간`, `20k~45k tokens`
- Downloaded asset byte audit와 real Obsidian QA: `1~2시간`, `15k~30k tokens`
- Auth·Actions·runner remediation 발생 시 추가: `1~3시간`, `15k~40k tokens`
- 총 예상: `3~7시간`, `45k~105k tokens`

## Historical publication guardrails

- Dusk unrelated tracked modification 7개와 untracked 1,586개
- Main vault `.obsidian/plugins/prodigy-ai-runtime/data.json`의 grants `0` 상태
- Main vault installed plugin artifact는 별도 install 승인 없이 변경 금지
- Mixed/private/highly-private consumer를 argv prompt transport로 route 금지
- Main vault grant 자동 생성 금지
- Provider fallback 추가 금지
- Vault source/canonical files를 runtime이 읽거나 쓰게 하는 변경 금지
- Prompt, response, schema payload, raw stdout/stderr, Secret value를 artifact·receipt·diagnostics·log에 추가 금지
- Runtime `dist/`의 verified ZIP·JSON·SHA file set을 hash 검증 없이 교체 금지
- GitHub repository·remote·push·tag·Release를 explicit approval 전에 실행 금지
- `git add -A`, `git add .`, destructive reset/checkout, force push 금지
