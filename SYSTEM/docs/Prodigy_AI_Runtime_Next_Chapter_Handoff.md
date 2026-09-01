# Prodigy AI Runtime — Canonical Next Chapter Handoff

## 현재 결론

`prodigy-ai-runtime` local v0.1 reproducible release와 private GitHub publication
챕터를 종료했다.

- Approved private repository의 `main`이 verified runtime commit을 가리킨다.
- Hosted CI가 pinned Node·npm과 strict typecheck, 35 tests, deterministic release
  audit를 통과했다.
- Annotated unsigned `v0.1.0` tag가 verified commit을 가리킨다.
- GitHub Release의 ZIP·JSON·SHA sidecar exact 3 assets가 local artifacts와
  byte-identical이다.
- Downloaded ZIP의 clean disposable Obsidian handshake, Project fail-closed,
  production-installer upgrade·rollback QA가 통과했다.
- Release는 GitHub platform상 mutable이지만 Release ID, tag object, asset name·ID,
  size·server digest를 receipt에 결속했고 replacement는 policy로 금지했다.
- Publication evidence와 종료 감사는 Dusk atomic Lore commits에 남았다.
- 다른 작업자의 Dusk 변경은 수정·stage·삭제·복원하지 않았다.

Canonical evidence:

- `SYSTEM/docs/Prodigy_AI_Runtime_Publication_Receipt_v1.json`
- `SYSTEM/docs/Prodigy_AI_Runtime_Publication_Runbook_v1.md`
- `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_publication_audit.js`
- `SYSTEM/docs/Prodigy_AI_Runtime_Local_Release_Audit_v0.1.json`

## 완료된 사용자 요구사항

1. Handoff를 맹신하지 않고 두 저장소 Git과 파일 상태를 source of truth로 재검증했다.
2. Runtime v0.1.0의 version·manifest·compatibility drift를 fail closed로 고정했다.
3. ZIP file set을 `main.js`, `manifest.json`, `versions.json` exact 3으로 고정했다.
4. ZIP, metadata-only JSON receipt, SHA-256 sidecar를 deterministic하게 생성했다.
5. Clean source export와 local release gate에서 strict TypeScript, tests, build,
   repeated artifact byte identity를 검증했다.
6. Production installer의 destination 선검증, transaction rollback, interrupted-state
   recovery를 test-first로 검증했다.
7. Private prompt를 stdin route로 강제하고 cross-provider fallback을 금지했다.
8. 관리자 승인 범위대로 private GitHub repository를 만들고 full seven-commit
   `main` history만 push했다.
9. Hosted `Verify release` workflow가 verified commit에서 성공하는 것을 관찰했다.
10. Annotated unsigned `v0.1.0` tag와 exact 3 Release assets를 publish했다.
11. Release assets를 새 temp root에 다운로드해 local artifacts와 byte-compare했다.
12. Downloaded ZIP으로 clean Obsidian handshake와 Project `capability_unavailable`을
    실제 관찰했다.
13. Production installer upgrade·rollback·reinstall에서 durable config exact 보존과
    stale grant 비활성 상태를 확인했다.
14. Secret, prompt, response, raw stdout/stderr, vault source write, temporary artifact,
    synthetic residue를 감사했다.
15. Hostile 자체피드백의 substantiated findings를 severity 순으로 해결하고 전체
    tests·build·live surface QA를 다시 실행했다.
16. Dusk publication evidence를 `f675d1a` atomic Lore commit으로 남겼다.
17. Current closure handoff는 이 파일을 포함하는 후속 atomic Lore commit으로 남긴다.

## 저장소 source of truth

### Dusk

- Path: `/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk`
- Branch: `main`
- HEAD at closure audit start:
  `f675d1a586613200c2a6a33527d954c16f0f0bb4`
- Current HEAD before closure-handoff commit:
  `62b2d06a8cb2440575289e8b4cab6b99aa227d74`
- Concurrent unrelated commit observed during closure:
  `62b2d06` (`현장방문 입력창을 부모 popup 위에 유지`)
- Publication evidence commit:
  `f675d1a586613200c2a6a33527d954c16f0f0bb4`
- Canonical handoff HEAD: 이 파일을 마지막으로 수정한 commit. 다음 명령으로 resolve한다.

  ```bash
  git log -1 --format=%H -- SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
  ```

- Index before closure commit: clean
- Runtime-owned paths before closure edits: clean
- Unrelated tracked modifications: 7, all unstaged
- Untracked paths at closure audit: 1,585

### Runtime

- Path: `/Users/prodigykim/Developer/prodigy-ai-runtime`
- Branch: `main`
- HEAD: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Remote: `origin`
  (`https://github.com/prodigykimm-png/prodigy-ai-runtime.git`)
- Remote sync: `origin/main...main = 0 0`
- Worktree: clean
- Tag: annotated unsigned `v0.1.0`
- Tag object: `1248461a1a2152a9a0e0ad045994337873c1dc90`
- Tag target: `d4380537a4a1766b21cc7540a57ba9ee270ef635`

### GitHub publication

- Repository: `https://github.com/prodigykimm-png/prodigy-ai-runtime`
- Visibility: `PRIVATE`
- License: none
- Default branch: `main`
- Hosted CI run:
  `https://github.com/prodigykimm-png/prodigy-ai-runtime/actions/runs/33500227218`
- Release:
  `https://github.com/prodigykimm-png/prodigy-ai-runtime/releases/tag/v0.1.0`
- Release platform immutable: false
- Replacement policy: forbidden; corrections require a new version and tag

## 검증한 테스트와 실제 QA

### Runtime gate

Command:

```bash
npm --prefix "$HOME/Developer/prodigy-ai-runtime" run verify:release
```

Results:

- Strict TypeScript: pass
- Runtime and release tests: `35/35`
- Build: pass
- Repeated ZIP·receipt·sidecar byte identity: pass
- ZIP SHA-256:
  `720c4516e67d9e7e3a98d74b6796b11afa56a11cdc4bcdb63dc7e00ad7a559f8`
- Receipt SHA-256:
  `9f2054f8392c1a6bd84ed936d2e3236ddc04bb5c59b478c9c194c22835b17827`

### Hosted CI

- Workflow: `Verify release`
- Run ID: `33500227218`
- Event/branch: `push` / `main`
- Head SHA: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Job `verify`: success
- Required successful steps:
  - checkout
  - setup Node `24.19.0`
  - install npm `11.17.0`
  - assert npm `11.17.0`
  - `npm ci`
  - `npm run verify:release`

### Publication and source-truth audits

Commands:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_audit.js \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_publication_audit.js
```

Results:

- Tests: `2/2`
- Runtime HEAD and clean worktree binding: pass
- Dusk publication evidence commit binding: pass
- GitHub repository, workflow identity, tag object and target: pass
- Release ID and exact asset set: pass
- Hosted asset size and server SHA-256 digest: pass
- Downloaded/local byte identity: pass
- Download temp root removal: pass

### Downloaded ZIP real Obsidian QA

Test:

`SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_qa.js`

Results:

- Tests: `2/2`
- Clean disposable Obsidian plugin handshake: pass
- Project deterministic `capability_unavailable`: pass
- Browser and OS network attempts: `0`
- Production installer upgrade: pass
- Production installer rollback: pass
- Candidate reinstall: pass
- Durable `data.json`: byte-exact preserved
- Stale grant became usable: false
- Complete disposable vault audit: exact
- Protected existing Obsidian/Aside processes: unchanged
- Harness and downloaded temp roots removed: true

### Deferred standalone settings RED

Command:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
```

Current result: `0/1`, expected deferred failure.

- Runtime handshake와 Project fail-closed는 settings assertion 전까지 도달한다.
- `RealObsidianHarness.start()`의 trust prompt detector는 English text만 인식한다.
- Current Korean Obsidian prompt
  `이 보관함의 작성자를 신뢰하시나요?`가 남아 settings modal 선택을 가린다.
- Harness cleanup, protected-process continuity와 temp-root removal은 failure path에서도
  통과했다.
- 이 RED가 다음 `Obsidian Harness Compatibility` 챕터의 test-first starting seam이다.

## Security, privacy, write and residue audit

- Secret value artifact hits: `0`
- Prompt/response diagnostic persistence hits: `0`
- Raw stdout/stderr sentinel hits: `0`
- Downloaded Release asset sentinel hits: `0`
- Vault source/canonical writes: `0`
- Main vault grants changed: false
- Main vault installed artifact changed: false
- Browser network attempts: `0`
- OS network attempts: `0`
- Installer transaction residue: `0`
- Task-owned temporary artifact residue: `0`
- Synthetic chapter residue: `0`

Evidence is not derived from the publication receipt alone. The publication verifier binds
the local release audit counters, scans downloaded assets for chapter-owned forbidden
sentinels, checks task temp prefixes before/after, and the real Obsidian QA compares the
complete disposable vault while requiring harness-root removal.

## 미검증 또는 외부 조건

1. HTTPS mobile relay URL이 없어 live mobile relay network call은 미검증이다.
2. Physical iPhone/iPad QA는 미검증이다.
3. Repository는 private·no-license 상태이며 public visibility 승인은 없다.
4. Published seven-commit history에는 local-machine author email이 포함된다. Public
   전환 전에 history/privacy 결정을 새로 받아야 한다.
5. GitHub Release는 platform상 mutable하다. 현재 identity/digest는 검증했지만
   replacement를 기술적으로 차단하는 platform lock은 없다.
6. Installer는 detected I/O failure와 interrupted transaction recovery를 검증했지만
   모든 filesystem instruction 경계의 process kill·power loss는 미검증이다.
7. Standalone plugin settings surface는 Korean first-open trust onboarding을 current
   English-only detector가 닫지 못해 `0/1` RED로 deferred 상태다. 이것이 다음
   챕터의 대상이다.
8. Live GitHub publication audit는 `gh` authentication과 network availability가
   필요하다. Offline에서는 receipt와 local Git/artifact만 검증할 수 있다.

## 현재 unrelated Dusk worktree

Closure final snapshot 시 unrelated tracked modification 7개가 남아 있다:

- `SYSTEM/AI/Skills/prodigy-review/tests/home/test_home_action_queue.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_literal_git_archive.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_release_gate.js`
- `SYSTEM/CI/release-gate-manifest.json`
- `SYSTEM/CI/task16-final-receipt-verifier.js`
- `SYSTEM/TEMPLATE/FORMAT/template_auction_case.md`
- `SYSTEM/Views/home-action-queue.js`

이 파일들은 다른 작업자의 active work다. 현재 7개 모두 unstaged이며 AI Runtime
closure가 수정·삭제·restore하지 않았다. Untracked 1,585개도 다른 작업자의
reports, tests, scripts, plugins, evidence를 포함하므로 정리 대상으로 취급하지 않는다.

Future work는 매번 live `git status`를 다시 source of truth로 사용해야 한다. Count와
path는 변할 수 있으며 이 snapshot보다 Git이 우선한다. `git add -A`와 `git add .`는
금지하고 task-owned exact paths만 stage한다.

## Hostile 자체피드백에서 발견하고 해결한 내용

### Critical

1. **Publication receipt가 containing commit을 placeholder로 자기증명했다.**
   - Receipt를 실제 publication evidence commit `f675d1a`에 결속했다.
   - Verifier가 commit existence와 exact four evidence paths를 `diff-tree`로 확인한다.
   - Current closure commit을 receipt HEAD와 같게 강제하는 방식은 self-reference를
     만들므로 기각했다. Canonical handoff commit은 file history로 resolve한다.
2. **Security·residue counters가 receipt literal만으로 통과할 수 있었다.**
   - Local release audit counters와 교차검증하고 downloaded assets를 forbidden
     sentinels로 scan한다.
   - Task temp prefix before/after inventory와 real Obsidian complete-vault audit를
     최종 gate에 포함한다.

### High

3. **Active handoff가 두 저장소 HEAD, unrelated worktree, next commands와 estimates를
   빠뜨리고 historical publication plan에 의존했다.**
   - Historical snapshot을 제거하고 이 파일을 current source truth만 담는 canonical
     handoff로 재작성했다. 과거 결정은 Git history에 보존된다.
4. **Hosted CI가 top-level success와 SHA만 검증됐다.**
   - `verify` job과 pinned toolchain, `npm ci`, `verify:release` required steps의
     completed/success를 live GitHub response에서 assertion한다.

### Medium

5. **Exact three asset 검증이 duplicate name ambiguity를 명시적으로 거부하지 않았다.**
   - Hosted asset count와 unique name·ID를 assertion하고 각 size·server digest를
     receipt와 비교한다.
6. **Policy immutability가 platform immutability처럼 읽힐 수 있었다.**
   - GitHub platform mutable과 policy-frozen 경계를 명시하고 Release identity,
     updated time, assets를 verifier에 결속했다.
7. **Publication verifier가 자기 download root만 삭제하고 다른 task prefix drift를
   확인하지 않았다.**
   - Known task temp prefixes를 test 전후 inventory하고 exact equality를 요구한다.

### 기각한 과잉 지적

- 관리자 승인 대화 원문이나 prompt를 evidence file에 저장하지 않는다. Receipt에는
  metadata-only `administrator_approved`만 남겨 prompt persistence를 피한다.
- Current closure HEAD를 그 commit 내부 receipt에 hash로 기록하는 것은 recursive
  self-reference다. 이전 evidence commit을 machine-bind하고 current canonical commit은
  `git log -- <handoff>`로 resolve한다.
- Unsigned tag, private no-license, local author email은 승인 packet에 명시된 known
  constraints이며 숨겨진 publication defect가 아니다.
- Hosted CI는 commit gate이고 downloaded Release verification은 Dusk live audit가
  담당한다. Tag-triggered workflow를 추가하는 것은 이번 closure 범위를 넘는다.

## 다음 챕터 — Obsidian Harness Compatibility

### 정확한 목표

Current Obsidian first-open trust onboarding을 test-owned disposable vault에서
결정론적으로 처리해 standalone `prodigy-ai-runtime` settings surface를 release gate에
복귀시킨다.

### 작업 범위

1. `test_prodigy_ai_runtime_real_obsidian.js`의 current Korean trust-onboarding
   obstruction `0/1` RED를 재확인한다.
2. Trust prompt가 이미 없거나 형태가 바뀐 경우에도 false green이 되지 않도록
   onboarding state와 plugin enablement evidence를 분리한다.
3. `real_obsidian_harness.js`의 English-text detector를 locale-agnostic trust surface
   identity와 exact DOM removal signal로 교체한다. Observer는 trigger 전에
   subscribe하고 bounded timeout으로 기다린다.
4. Fixed sleep, polling delay, process-global Obsidian mutation 없이 disposable profile
   내부에서만 trust action을 수행한다.
5. External plugin manifest load, enable persistence, API handshake를 각각 assertion한다.
6. `plugin.api.openSettings()` 후 standalone settings modal의 plugin identity,
   empty-profile state, route boundary와 password input 부재를 실제 DOM에서 관찰한다.
7. Browser·OS network, SecretStorage value, prompt/response/stdout/stderr persistence,
   vault source write와 temp/synthetic residue를 감사한다.
8. Existing Project live consumer, downloaded publication QA, local release audit를
   regression suite로 다시 실행한다.
9. Hostile 자체피드백과 fix/reverify 후 atomic Lore commit과 새 handoff를 남긴다.

### 위험 요소

- Obsidian trust onboarding DOM, locale와 wording은 app version에 따라 drift할 수
  있다. Korean·English copy를 literal allowlist로 늘리는 방식은 다시 깨질 수 있다.
- Trust modal과 plugin settings modal이 모두 `.modal-container`를 사용해 잘못된
  surface를 선택할 수 있다.
- Event subscription보다 trigger가 먼저 실행되면 timing-dependent false green이 된다.
- Disposable profile가 아닌 live Dusk vault의 trust/plugin state를 건드릴 위험이 있다.
- Existing Obsidian/Aside processes 또는 debugging ports를 잘못 종료할 위험이 있다.
- Plugin enable state만 보고 settings DOM identity를 확인하지 않으면 deferred gap이
  실제로 닫히지 않는다.
- Harness helper 변경은 여러 real-Obsidian suites에 broad regression을 만들 수 있다.

### 선행 조건

- `/Applications/Obsidian.app`가 존재하고 current executable identity를 snapshot한다.
- Runtime worktree가 clean `main@d438053`이고 local release artifacts가 verified
  hashes와 일치한다.
- Dusk의 live unrelated worktree와 staged index를 시작 전에 다시 inventory한다.
- Test-owned disposable vault/profile/home/temp만 mutation 대상으로 허용한다.
- Existing Obsidian/Aside process continuity와 listening ports를 before/after 비교한다.
- Main Dusk `.obsidian/plugins/prodigy-ai-runtime/data.json` grants `0` 상태와 installed
  artifact는 읽기 검증 외 변경하지 않는다.
- External GitHub writes, repository visibility 변경, tag/Release 수정은 범위 밖이다.

### Stop condition

- Current `0/1` RED가 Korean trust onboarding/settings obstruction의 정확한 이유로
  재현된다.
- Fixed sleep이나 timing luck 없이 observer/event를 trigger 전에 subscribe한다.
- Clean disposable Obsidian에서 trust onboarding이 bounded deterministic하게 종료된다.
- External `prodigy-ai-runtime` manifest가 load되고 plugin이 enable된다.
- Runtime handshake의 plugin ID, protocol hash와 version이 verified values와 일치한다.
- Standalone settings modal이 exact plugin identity로 선택된다.
- Empty profile·route state가 보이고 Secret value password input은 존재하지 않는다.
- Project `capability_unavailable`과 publication QA가 회귀 없이 통과한다.
- Secret/prompt/response/stdout/stderr, browser·OS network, vault source write,
  temp·synthetic residue가 모두 `0`이다.
- Existing Obsidian/Aside processes와 ports가 unchanged/reusable이다.
- Dusk unrelated changes가 untouched·unstaged다.
- 결과가 atomic Lore commit과 새 canonical handoff에 남는다.

### 예상 시간과 예상 토큰

- RED reproduction과 trust/settings state 조사: `1~2시간`, `12k~22k tokens`
- Event-driven harness helper와 focused test: `2~4시간`, `25k~45k tokens`
- Related suite·real surface·privacy/residue QA: `1~2시간`, `15k~25k tokens`
- Hostile audit와 remediation contingency: `1~2시간`, `10k~20k tokens`
- 총 예상: `5~10시간`, `60k~112k tokens`

## 새 대화 첫 조사

### 먼저 읽을 파일

```text
AGENTS.md
SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
SYSTEM/docs/Prodigy_AI_Runtime_Publication_Receipt_v1.json
SYSTEM/docs/Prodigy_AI_Runtime_Local_Release_Audit_v0.1.json
SYSTEM/docs/Prodigy_AI_Runtime_Release_Audit_v1.json
SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js
SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_qa.js
~/Developer/prodigy-ai-runtime/AGENTS.md
~/Developer/prodigy-ai-runtime/src/main.ts
~/Developer/prodigy-ai-runtime/src/settings.ts
~/Developer/prodigy-ai-runtime/manifest.json
```

### 첫 번째로 실행할 명령

먼저 read-only source truth와 isolation만 확인한다.

```bash
git status --short --branch
git log -5 --oneline --decorate
git diff --cached --name-only
git status --short --untracked-files=no
git -C "$HOME/Developer/prodigy-ai-runtime" status --short --branch
git -C "$HOME/Developer/prodigy-ai-runtime" log -5 --oneline --decorate
git -C "$HOME/Developer/prodigy-ai-runtime" rev-parse HEAD
```

그 다음 focused RED를 실행한다.

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
```

RED의 actual trust/settings state를 읽은 뒤에만 harness implementation을 결정한다.
Fixed sleep이나 blind click으로 통과시키지 않는다.

## 절대 건드리면 안 되는 파일과 상태

- 위 7개 unrelated tracked modifications와 현재 untracked worktree
- Main Dusk `.obsidian/plugins/prodigy-ai-runtime/data.json` grants `0`
- Main vault installed `main.js`, `manifest.json`, `versions.json`
- Existing Obsidian/Aside processes, profiles, windows, listeners와 vault trust state
- Published runtime `main@d438053`, `v0.1.0` tag와 Release assets
- GitHub repository private visibility와 no-license state
- SecretStorage values와 device-local route values
- Prompt, response, schema payload, raw stdout/stderr와 secret values
- Vault source/canonical files의 runtime read/write prohibition
- Private/mixed/highly-private consumer의 stdin-only route boundary
- Cross-provider fallback prohibition

금지:

- `git add -A`, `git add .`, destructive reset/checkout, amend, force push
- Live Dusk vault에서 trust onboarding 또는 plugin enablement를 자동 조작
- Fixed sleep, foreground polling loop, timing-luck assertions
- Main vault grants 생성 또는 installed artifact 교체
- 승인 없는 GitHub write, tag 이동, Release asset replacement, visibility 변경
