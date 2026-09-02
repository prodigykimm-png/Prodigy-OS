# Prodigy AI Runtime — Canonical Next Chapter Handoff

## 현재 결론

`Obsidian Harness Compatibility` 챕터와 hostile closure remediation을 종료했다.

- Obsidian `1.13.7` Korean first-open trust onboarding은 AI Runtime real surfaces에서
  explicit `trustOnboarding: "required"`일 때만 처리한다.
- Shared harness의 기본 startup semantics는 유지해 Project와 다른 consumer에 trust
  mutation을 강제하지 않는다.
- Trust surface는 exact Obsidian bundle ID, version, executable SHA-256과
  `.modal.mod-trust-folder` structural fingerprint에 결속한다.
- Appearance/removal observer와 click listener를 native CDP trigger 전에 구독한다.
- Trust click, cancel 부재, modal removal, plugin lifecycle settlement와 cleanup을
  순서 receipt로 검증한다.
- Browser HTTP(S) interception은 page-target CDP attach 직후, onboarding과 plugin
  activation 전에 시작한다.
- External runtime manifest/load/enable persistence와 standalone settings route를
  trust action과 분리해 검증한다.
- Live Project Codex acceptance는 explicit child-only auth HOME relay와 per-call CDP
  ceiling으로 다시 green이다.
- Runtime repository와 published `v0.1.0` artifacts는 변경하지 않았다.
- 다른 작업자의 Dusk 변경은 수정·stage·삭제·restore하지 않았다.

Verified at UTC: `2026-09-02T08:56:52Z`

## 완료된 사용자 요구사항

1. Canonical handoff를 맹신하지 않고 두 저장소 Git log/status와 파일을 source of
   truth로 재검증했다.
2. Current Korean trust obstruction을 focused test `0/1` RED로 재현했다.
3. Trust copy allowlist 대신 locale-agnostic, version-bound DOM fingerprint를
   test-first로 구현했다.
4. Prompt appearance, removal, native click과 cancellation exclusion을 event ordering
   receipt에 결속했다.
5. Prompt 부재, wrong vault, wrong action order/class, duplicate prompt와 cleanup
   failure가 fail closed가 되도록 했다.
6. Trust automation을 AI Runtime acceptance/release QA에 opt-in으로 한정해 shared
   harness consumer regression을 제거했다.
7. External plugin manifest, global enable state, persisted enable state와 plugin
   instance를 pre/actions/post evidence로 분리했다.
8. Runtime handshake의 plugin ID, runtime/protocol version과 protocol hash를
   verified values에 결속했다.
9. Standalone settings의 exact active tab ID, connected container, manifest heading,
   empty profile structure와 password input 부재를 실제 DOM에서 확인했다.
10. Project `capability_unavailable`, release ZIP install, upgrade/rollback/reinstall을
    실제 Obsidian에서 재검증했다.
11. Live Project Codex consent decline, completion, cancellation, route invalidation과
    vault write `0`을 재검증했다.
12. Runtime strict TypeScript, tests, build와 deterministic release artifacts를
    재검증했다.
13. Local release와 GitHub publication source truth를 live audit했다.
14. Secret, prompt, response, raw stdout/stderr, vault write, temp와 synthetic residue를
    감사했다.
15. Hostile 자체피드백 findings를 severity 순으로 해결하고 전체 관련 gate와 manual
    surface QA를 다시 실행했다.
16. Initial chapter commit `48ff37d`, hostile remediation `93ffa72`, live auth
    remediation `2e98b41`을 각각 atomic Lore commit으로 남겼다.
17. Current closure evidence와 다음 챕터 계획을 이 canonical handoff에 남긴다.
18. Final residue audit에서 과거 RED가 남긴 fake agy temp roots 10개를 발견해
    제거하고, fake CLI child failure path에 process-exit cleanup을 추가한 뒤
    prefix inventory `[]`를 재확인했다.

## 저장소 source of truth

### Dusk

- Path:
  `/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk`
- Branch: `main`
- Pre-chapter HEAD:
  `a0953e6c506ec3aa5e92db13a8a0822c07781e9f`
- Concurrent unrelated commit:
  `f0ffe96105681c18477eeb3a3ce08fa7f7e5104d`
- Initial compatibility commit:
  `48ff37d742bc047b11ce5e8120d856462313a4e0`
- Hostile remediation commit:
  `93ffa72310491eae709e1a4d98435a15fae9cfd1`
- Live auth remediation commit:
  `2e98b4149292a07633d35d190361e251e41221ca`
- Canonical mobile-plan commit:
  `a6f33eb49c8155deb22601ada62ea354179bfce5`
- HEAD before the final residue-remediation commit:
  `a6f33eb49c8155deb22601ada62ea354179bfce5`
- Canonical handoff containing commit:

  ```bash
  git log -1 --format=%H -- \
    SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
  ```

  The containing commit hash is not embedded in its own bytes because that would create
  recursive self-reference. Resolve it from Git after commit.

- Index before handoff staging: clean
- Task-owned unique paths in this chapter: 6
  - `SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_ai_runtime_live_provider.js`
  - `SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js`
  - `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js`
  - `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_qa.js`
  - `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js`
  - `SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md`

### Runtime

- Path: `/Users/prodigykim/Developer/prodigy-ai-runtime`
- Branch: `main`
- HEAD: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Remote: `origin`
  (`https://github.com/prodigykimm-png/prodigy-ai-runtime.git`)
- `origin/main...main`: `0 0`
- Worktree/index: clean
- Tag: annotated unsigned `v0.1.0`
- Tag object: `1248461a1a2152a9a0e0ad045994337873c1dc90`
- Tag target: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Runtime source, tag, Release, visibility와 assets changed: false

## 검증한 테스트와 실제 QA 결과

### Supported Obsidian identity

```text
Bundle ID: md.obsidian
Version: 1.13.7
Executable SHA-256:
cd0cc4be064df6e9e8ff9473a38c6ceb0edcba40df4e36423524a53bbea04751
```

The exact tuple is asserted before cloned app launch.

### Syntax and trust unit gate

Commands:

```bash
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_ai_runtime_live_provider.js

node --test \
  --test-name-pattern='installed real Obsidian identity|owned trust prompt identity|trust receipt rejects' \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js
```

Results:

- Syntax: pass
- Trust identity/order unit tests: `3/3`
- Fake agy/Codex child auth relay tests: `4/4`

### Standalone real Obsidian

Command:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
```

Result: `1/1`

Observed:

- Trust prompt present and task-owned vault matched: true
- Sequence:
  `appearance subscription 1 < appearance 2 < removal subscription 3 <
  app ready 4 < native trigger 5 < click 6 < removal 7`
- Native trust click: true
- Cancel click: false
- Prompt remaining: `0`
- Cleanup marker/global counts: `0/0`
- Trust lifecycle operations: all fulfilled
- Fixture readiness before/after: exact true
- Fixture setup actions after trust: `[]`
- Runtime manifest/load/enable persistence: exact true
- Handshake:
  - plugin ID: `prodigy-ai-runtime`
  - runtime version: `0.1.0`
  - protocol version: `1.0.0`
  - protocol hash:
    `e14b93848a72e1b20247701f1f25c5aef6164400785e8c8482b4705d3c99ce51`
- Settings active tab: `prodigy-ai-runtime`
- Empty profile direct paragraphs: `2`
- Profile sections: `0`
- Password inputs: `0`
- Project result: `capability_unavailable`
- Browser HTTP(S) attempts from CDP attach: `0`
- Node/browser provider network attempts: `0`
- Disposable vault changed paths: `[]`
- Protected process continuity: exact
- Runtime root removed and port reusable: true

### Project consumers

Commands and results:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_ai_runtime_canary.js
# 3/3

node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_ai_runtime_real_obsidian.js
# 1/1

PRODIGY_RUN_LIVE_AI=1 node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_ai_runtime_live_provider.js
# 1/1
```

Live receipt:

- Consumer: `project.workflow_draft`
- Provider profile: `codex`
- Route: `desktop-cli`
- Consent-declined provider calls: `0`
- Grant persisted before request: true
- Completed workflow items: `8`
- Cancellation: `cancel_requested`
- Invalid-route provider calls: `0`
- Grant invalidated after route change: true
- Vault content writes: `0`
- Prompt/response persistence hits: `0`

### Shared harness regression attribution

Current full command:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js
```

Current result: `44/49`, five existing Auction/Region expansion failures:

1. Expected Hub count `8`, current `9`
2. Expected fixture manifest count `9`, current `10`
3. Expected structural rows `48`, current `54`
4. Expected visual rows `256`, current `288`
5. `Region` is absent from the workspace manifest during the all-Hub real run

Isolated parent `a0953e6` result: `38/46`, eight failures.

- The same five Auction/Region failures were already present.
- Parent also failed the stale Obsidian `1.10.x` pin and two fake agy Node-global
  assumptions.
- This chapter fixes those three compatibility failures and adds one Codex relay test.
- Parent Project real surface: `1/1`.
- Current Project real surface after opt-in scoping: `1/1`.
- Temporary parent worktree was removed.

The five remaining failures are not accepted as green. They are explicitly attributed to
the concurrent Auction/Region expansion and are outside this AI Runtime chapter's paths.

### Runtime release gate

Command:

```bash
npm --prefix "$HOME/Developer/prodigy-ai-runtime" run verify:release
```

Results:

- Strict TypeScript: pass
- Runtime/release tests: `35/35`
- Build: pass
- Repeated artifact byte identity: pass
- ZIP SHA-256:
  `720c4516e67d9e7e3a98d74b6796b11afa56a11cdc4bcdb63dc7e00ad7a559f8`
- Receipt SHA-256:
  `9f2054f8392c1a6bd84ed936d2e3236ddc04bb5c59b478c9c194c22835b17827`

### Release and installer QA

Command:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_qa.js
```

Result: `2/2`

- Clean release ZIP load: pass
- Project deterministic `capability_unavailable`: pass
- Upgrade/rollback/reinstall: pass
- Durable config exact preservation: pass
- Stale grant revival: false
- Browser/Node network attempts: `0`
- Protected process continuity: exact
- Disposable vault byte audit: equal
- Temporary roots removed: true

### Local and GitHub publication audits

Command:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_audit.js \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_publication_audit.js
```

Result: `2/2`

- Runtime Git/artifact source truth: pass
- Hosted CI identity and required steps: pass
- Tag/Release exact identity: pass
- Downloaded/local asset byte identity: pass
- Download and task temp cleanup: pass

## Secret, prompt, response, write and residue audit

- Main-vault grants: `0`
- Secret value artifact hits: `0`
- Prompt/response diagnostic hits: `0`
- Raw stdout/stderr hits: `0`
- Browser HTTP(S) attempts from page-target CDP attach: `0`
- Node provider network attempts: `0`
- Vault source/canonical writes: `0`
- Disposable vault changed paths: `[]`
- Main-vault installed artifacts changed: false
- Task temporary artifact residue: `0`
- Synthetic residue hits: `0`
- Installer transaction residue: `0`
- Closure parent worktree residue: `0`
- Existing Obsidian/Aside process continuity: exact
- Reusable task ports: true

Installed main-vault artifact hashes remained:

```text
main.js       a546f22bd4f06b205b8071e7bab91e177f6cd97323872fff04ba75e92de3874d
manifest.json 1dbd8c0992a4f1b169f609061600203ba763a2f0f96fd82a52a14a354070fdb5
versions.json 00de9a24ddbfb27db6fcea40d8cd3cab67b61264f25ccbd889abec98830ae470
```

## 미검증 또는 외부 조건

1. HTTPS Tailscale relay URL이 없어 live mobile relay network call은 미검증이다.
2. Physical iPhone/iPad QA는 미검증이다.
3. Browser HTTP(S) counter begins at page-target CDP attach. Packet-level OS capture
   before attach was not performed; launch flags and host resolver rules deny background
   external networking.
4. Installer power loss/process kill at every filesystem instruction boundary는
   미검증이다.
5. GitHub Release는 platform상 mutable하다. Current identity/digests는 verified지만
   replacement policy는 platform lock이 아니라 project policy다.
6. Repository는 private, no-license이며 public visibility 승인은 없다.
7. Published seven-commit history에는 local-machine author email이 있다.
8. Live GitHub audit는 `gh` auth와 network availability에 의존한다.
9. Shared harness의 five Auction/Region failures는 parent baseline과 동일하며 해당
   concurrent chapter에서 해결해야 한다.

## 현재 worktree의 unrelated 변경

Final pre-handoff snapshot에서 다음 7개 tracked modification은 다른 작업자의 active
work이며 모두 unstaged다.

- `SYSTEM/AI/Skills/prodigy-review/tests/home/test_home_action_queue.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_literal_git_archive.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_release_gate.js`
- `SYSTEM/CI/release-gate-manifest.json`
- `SYSTEM/CI/task16-final-receipt-verifier.js`
- `SYSTEM/TEMPLATE/FORMAT/template_auction_case.md`
- `SYSTEM/Views/home-action-queue.js`

Untracked path snapshot: `1,585`.

Counts are snapshots, not authority. Future work must run live Git status again.
Never use `git add -A` or `git add .`; stage exact task-owned paths only.

## Hostile 자체피드백에서 발견하고 해결한 내용

### High

1. **Touched shared harness suite가 red인데 closure가 baseline attribution 없이
   complete로 표시됐다.**
   - Isolated `a0953e6` worktree와 current tree에서 full suite를 실행했다.
   - Remaining five failures가 Auction/Region expansion baseline과 동일함을
     증명했다.
   - Stale version과 fake agy fixture 세 failure는 해결했다.
2. **Trust action이 generic non-cancel button이었다.**
   - Exact bundle/version/executable hash와 button order/class fingerprint를
     결합했다.
   - Reversed order와 warning-class negative fixtures를 추가했다.
3. **Modal removal만으로 trust success를 과장했다.**
   - Native target click, cancel click false, ordered removal, plugin lifecycle
     fulfilled를 별도 receipt로 검증한다.
   - Handoff는 authoritative hidden trust flag를 주장하지 않는다.
4. **Shared harness 모든 caller에서 trust action을 실행해 Project를 회귀시켰다.**
   - `trustOnboarding: "required"` opt-in으로 제한했다.
   - Parent/current Project real surface `1/1`을 확인했다.

### Medium

5. **Plugin readiness가 mutation 후 booleans만 보고했다.**
   - `before`, explicit `actions`, `after`를 분리했다.
6. **Source string test가 ordering을 실제로 증명하지 못했다.**
   - Runtime sequence receipt validator와 mutation tests로 교체했다.
7. **Cleanup failure를 swallow했다.**
   - Primary/cleanup 오류를 보존하고 marker/global zero를 post-cleanup에서
     assertion한다.
8. **Network interception이 onboarding 뒤에서 시작했다.**
   - Page-target attach 직후로 이동하고 scope를 정확히 기록했다.
9. **Version만 pin하고 executable bytes는 pin하지 않았다.**
   - Bundle ID/version/SHA-256 tuple을 exact assertion한다.
10. **Settings observer가 synchronous trigger failure에서 leak될 수 있었다.**
    - Shared cleanup을 success, timeout과 throw 경로에 적용했다.
11. **Translated empty-state prose가 semantic gate였다.**
    - Exact active tab, runtime profile count `0`, two direct paragraphs, profile section
      `0`, password input `0`을 machine gate로 사용한다.
    - Korean copy는 manual visual observation으로만 기록한다.
12. **Live Codex가 disposable HOME에서 auth를 찾지 못하고 90초 provider timeout에
    도달했다.**
    - Explicit `codexAuthProbe`가 Codex child에만 실제 auth HOME을 전달한다.
    - Electron/vault HOME은 task-owned로 유지한다.
    - Per-call CDP ceiling을 in-page bound보다 5초 길게 설정했다.
13. **과거 fake agy RED가 process exit 전에 temp root cleanup에 도달하지 못했다.**
    - Fake agy/Codex child가 temp root 생성 직후 process-exit cleanup을 등록한다.
    - 기존 leaked roots 10개를 exact task prefix로 제거했다.
    - Auth relay tests `4/4` 후 closure temp prefix inventory `[]`를 확인했다.

### Finding → verification mapping

| Finding | Verification |
|---|---|
| Wrong trust action | classifier negative fixtures |
| Observer ordering | trust receipt mutation tests + real sequence `1..7` |
| Cleanup | `trustCleanup {clean:true, marker_count:0, global_count:0}` |
| Shared blast radius | parent/current Project real `1/1` |
| Early network gap | `networkObservation.started_before_onboarding === true` |
| Binary drift | exact supported identity tuple |
| Live Codex auth | fake relay tests `4/4`, live acceptance `1/1` |
| Suite attribution | parent `38/46`, current `44/49` |
| Fake CLI failure residue | process-exit cleanup + final prefix inventory `[]` |

## 다음 챕터 — Mobile Relay Activation

### 상태

`blocked_on_external_prerequisites`

### 정확한 목표

Administrator-approved HTTPS Tailscale relay와 physical iPhone/iPad에서:

1. one successful `structured-strict` mobile request,
2. one separate cancellable request,
3. exact two relay requests with no retry/fallback,
4. secret/prompt/response/vault persistence `0`

을 실제 device receipt로 증명한다.

### 작업 범위

1. 관리자 승인 metadata만으로 relay URL, server identity, owner와 test device를
   확인한다.
2. Token value를 출력하지 않고 SecretStorage ID 존재만 검증한다.
3. Runtime relay adapter에 success/cancellation request-count RED를 먼저 추가한다.
4. Disposable mobile profile에만 device-local relay route를 설정한다.
5. Physical mobile Obsidian handshake를 verified protocol tuple과 비교한다.
6. Successful structured request를 정확히 한 번 실행한다.
7. 별도 request를 trigger 전에 cancellation event를 구독한 뒤 취소한다.
8. Relay/server receipt에서 total requests `2`, retries `0`, fallback `0`을
   확인한다.
9. Device/runtime/server diagnostics와 artifacts에서 secret/prompt/response를
   감사한다.
10. Desktop release, Project fail-closed와 live Codex regression을 다시 실행한다.
11. Hostile review, remediation, atomic Lore commit과 새 handoff를 남긴다.

### 위험 요소

- Relay token value가 shell history, logs, diagnostics나 screenshots에 노출될 수 있다.
- Wrong `.ts.net` host나 deployment owner에 요청할 수 있다.
- Mobile adapter가 desktop CLI로 fallback하거나 desktop process를 spawn할 수 있다.
- Client retry와 relay retry가 중첩되어 duplicate requests가 생길 수 있다.
- Cancellation race가 completed request를 cancelled로 오표기할 수 있다.
- Physical device backgrounding과 network transition이 timing-dependent 결과를 만들
  수 있다.
- Relay diagnostics가 prompt/response/raw headers를 저장할 수 있다.
- Device-local route가 live Dusk profile 또는 다른 device와 동기화될 수 있다.
- 승인 없이 runtime version, tag, Release 또는 GitHub visibility를 변경할 수 있다.

### 선행 조건

다음 모두가 실제 evidence로 준비되기 전에는 구현·network call을 시작하지 않는다.

1. Administrator-approved `https://<approved-host>.ts.net/...` relay URL
2. Relay server deployment ID, executable/container digest와 owner
3. Disposable relay token이 저장된 SecretStorage ID — value는 절대 출력하지 않음
4. Physical iPhone 또는 iPad와 disposable vault/profile
5. Server-side request-count/cancellation metadata receipt capability
6. External network call과 physical-device QA 승인
7. Runtime `main@d438053`과 current private Release를 변경하지 않는 범위 확인

Prerequisite validation stop:

- 하나라도 없거나 identity가 모호하면 `blocked_on_external_prerequisites`로 중단한다.
- Token value를 command argument, environment echo, file 또는 chat에 넣지 않는다.

### Stop condition

- Approved relay URL/server/device identity가 exact receipt에 결속된다.
- Physical mobile Obsidian handshake가 plugin ID/runtime/protocol tuple과 일치한다.
- Successful structured request: `1`
- Separate cancellation request: `1`
- Total relay requests: `2`
- Retries, duplicate calls, desktop CLI spawns, cross-provider fallback: `0`
- Cancellation status가 truthful terminal state다.
- Secret/prompt/response/raw headers/stdout/stderr persistence: `0`
- Vault source/canonical writes: `0`
- Device-local route가 다른 profile/device로 전파되지 않는다.
- Desktop release gate `35/35`, Project fail-closed, live Codex acceptance가 green이다.
- Temporary device/server artifacts와 synthetic residue: `0`
- Atomic Lore commit과 current canonical handoff가 남는다.

### 첫 번째로 읽을 파일

```text
AGENTS.md
SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
SYSTEM/docs/Prodigy_AI_Runtime_Cold_Verification_v1.json
SYSTEM/docs/Prodigy_AI_Runtime_Migration_Receipt_v1.json
SYSTEM/docs/Prodigy_AI_Runtime_Local_Release_Audit_v0.1.json
SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_ai_runtime_live_provider.js
~/Developer/prodigy-ai-runtime/AGENTS.md
~/Developer/prodigy-ai-runtime/src/adapters/relay.ts
~/Developer/prodigy-ai-runtime/src/config.ts
~/Developer/prodigy-ai-runtime/src/main.ts
~/Developer/prodigy-ai-runtime/tests/adapters.test.ts
```

### 첫 번째로 실행할 명령

Read-only source truth:

```bash
git status --short --branch
git log -5 --oneline --decorate
git diff --cached --name-only
git status --short --untracked-files=no
git -C "$HOME/Developer/prodigy-ai-runtime" status --short --branch
git -C "$HOME/Developer/prodigy-ai-runtime" log -5 --oneline --decorate
git -C "$HOME/Developer/prodigy-ai-runtime" rev-parse HEAD
git -C "$HOME/Developer/prodigy-ai-runtime" \
  rev-list --left-right --count origin/main...main
```

Prerequisite validation, without token value:

```bash
test -n "$PRODIGY_APPROVED_RELAY_URL"
node -e 'const u=new URL(process.env.PRODIGY_APPROVED_RELAY_URL);if(u.protocol!=="https:"||!u.hostname.endsWith(".ts.net"))process.exit(1)'
test -n "$PRODIGY_RELAY_DEPLOYMENT_ID"
test -n "$PRODIGY_RELAY_SECRET_ID"
test -n "$PRODIGY_PHYSICAL_DEVICE_ID"
```

Do not export or echo the token value. The environment variables above are metadata IDs
only.

First focused RED after prerequisites:

```bash
npm --prefix "$HOME/Developer/prodigy-ai-runtime" test -- \
  --test-name-pattern='mobile relay live request accounting'
```

### 예상 시간과 예상 토큰

- Prerequisite evidence and identity validation:
  `0.5~1시간`, `5k~10k tokens`
- Test-first relay request/cancellation accounting:
  `1.5~3시간`, `18k~30k tokens`
- Physical device and relay server QA:
  `1~2시간`, `10k~20k tokens`
- Desktop regression, privacy/residue audit and hostile review:
  `1~2시간`, `12k~20k tokens`
- Handoff and atomic Lore commit:
  `0.5시간`, `4k~8k tokens`
- Total active work:
  `4.5~8.5시간`, `49k~88k tokens`
- External waiting time for approvals/device/server is excluded and unbounded.

## 절대 건드리면 안 되는 파일과 상태

- Current unrelated tracked/untracked Dusk worktree
- Main Dusk `.obsidian/plugins/prodigy-ai-runtime/data.json` grants `0`
- Main-vault installed `main.js`, `manifest.json`, `versions.json`
- Live Dusk vault trust/plugin enablement state
- Existing Obsidian/Aside processes, profiles, windows, listeners와 ports
- Runtime `main@d438053`, `v0.1.0` tag와 Release assets
- GitHub private visibility와 no-license state
- SecretStorage values와 device-local route values
- Prompt, response, schema payload, Authorization header, raw stdout/stderr
- Vault source/canonical runtime read/write prohibition
- Private/mixed/highly-private stdin-only route boundary
- Cross-provider fallback prohibition

Forbidden:

- `git add -A`, `git add .`, destructive reset/checkout, amend, force push
- Token value echo, argv transport, file persistence or chat inclusion
- Live Dusk vault에서 mobile route/trust/plugin state 자동 조작
- Fixed sleep, foreground polling loop, timing-luck assertion
- 승인 없는 GitHub write, tag move, Release replacement or visibility change
