# Prodigy AI Runtime — Canonical Next Chapter Handoff

## 현재 결론

`Obsidian Harness Compatibility` 챕터를 종료했다.

- Obsidian `1.13.7`의 Korean first-open trust onboarding을 copy literal 없이
  `.modal.mod-trust-folder` 구조로 식별한다.
- Trust prompt appearance observer와 exact DOM-removal observer를 native CDP click
  전에 구독한다.
- Fresh disposable vault에서 prompt 부재나 DOM shape drift는 pass가 아니라 bounded
  RED가 된다.
- Trust action은 task-owned cloned app/profile/vault에서만 실행되고 live Dusk vault는
  변경하지 않는다.
- External runtime manifest load, global plugin enablement, persisted enable state,
  plugin instance를 독립 evidence로 확인한다.
- Standalone settings route는 `app.setting.activeTab.id === "prodigy-ai-runtime"`과
  connected `containerEl`로 선택한다.
- Empty-profile shipped state와 password input 부재를 실제 settings DOM에서 확인한다.
- Runtime handshake, Project `capability_unavailable`, release ZIP install,
  installer upgrade/rollback, publication audit가 회귀 없이 통과한다.
- Existing Obsidian/Aside process continuity, disposable vault byte equality,
  port reuse와 temp cleanup이 최종 QA에서 모두 통과했다.
- 다른 작업자의 Dusk 변경은 수정·stage·삭제·복원하지 않았다.

Canonical evidence:

- `SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js`
- `SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md`

## Source of truth

### Dusk

- Path:
  `/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk`
- Branch: `main`
- Pre-chapter HEAD:
  `a0953e6c506ec3aa5e92db13a8a0822c07781e9f`
- Canonical handoff HEAD: 이 파일을 마지막으로 수정한 commit. 다음 명령으로
  resolve한다.

  ```bash
  git log -1 --format=%H -- SYSTEM/docs/Prodigy_AI_Runtime_Next_Chapter_Handoff.md
  ```

- Index before chapter commit: clean
- Task-owned paths before chapter commit: exact 4 paths above
- Unrelated tracked modifications before chapter commit: 10, all unstaged
- Untracked paths before chapter commit: 1,586

### Runtime

- Path: `/Users/prodigykim/Developer/prodigy-ai-runtime`
- Branch: `main`
- HEAD: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Remote: `origin`
  (`https://github.com/prodigykimm-png/prodigy-ai-runtime.git`)
- Remote sync: `origin/main...main = 0 0`
- Worktree: clean
- Tag object: `1248461a1a2152a9a0e0ad045994337873c1dc90`
- Tag target: `d4380537a4a1766b21cc7540a57ba9ee270ef635`
- Runtime source, tag, Release와 hosted assets는 이 챕터에서 변경하지 않았다.

### Installed main-vault artifact

Read-only final hashes:

```text
main.js       a546f22bd4f06b205b8071e7bab91e177f6cd97323872fff04ba75e92de3874d
manifest.json 1dbd8c0992a4f1b169f609061600203ba763a2f0f96fd82a52a14a354070fdb5
versions.json 00de9a24ddbfb27db6fcea40d8cd3cab67b61264f25ccbd889abec98830ae470
```

- Main-vault grants: `0`
- Installed artifact changed: false

## Test-first 구현

### 재현한 RED

Focused baseline:

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
```

Result before implementation:

- Tests: `0/1`
- Exact obstruction: Korean trust prompt remained as the first
  `.modal-container`.
- Settings assertion received
  `이 보관함의 작성자를 신뢰하시나요?` surface instead of the runtime tab.

Additional source-truth drift:

- Installed Obsidian: `1.13.7`
- Existing unit pin: `1.10.x`

### 구현한 경계

1. `classifyOwnedTrustPrompt(root)`:
   - `.modal.mod-trust-folder` exact cardinality
   - `.modal-container.mod-confirmation` parent identity
   - exact title/button-container structure
   - exact two buttons, one `.mod-cancel`, one trust action
   - input absence
   - Korean/English/German copy에 독립
2. Prompt appearance observer:
   - app layout readiness를 기다리기 전에 구독
   - fresh disposable vault에서 prompt 부재는
     `TASK13A_OWNED_PROMPT_APPEAR_TIMEOUT`
   - `app.vault.adapter.getBasePath()`를 task-owned disposable vault와 비교
3. Prompt removal:
   - DOM-removal observer와 trusted-click listener를 trigger 전에 구독
   - native CDP `mousePressed`/`mouseReleased`
   - success/failure 모두 observer, timer, marker와 globals cleanup
4. Plugin evidence:
   - manifest present
   - global enablement
   - enabled persistence
   - plugin instance present
5. Settings evidence:
   - exact active plugin tab ID
   - connected route container
   - manifest-name heading
   - exact shipped empty-profile state
   - profile section count `0`
   - password input count `0`
6. App readiness observer:
   - success path에서도 observer와 timeout을 제거
7. Obsidian compatibility:
   - public bundle metadata와 exact current supported version `1.13.7` pin

## 최종 검증

### Harness unit and syntax

```bash
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/real_obsidian_harness.js
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js
node --check \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js

node --test \
  --test-name-pattern='installed real Obsidian identity|owned trust prompt identity|harness startup arms trust' \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_harness.js
```

Results:

- Syntax: pass
- Focused unit tests: `3/3`

### Standalone real Obsidian surface

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_real_obsidian.js
```

Result: `1/1`

Observed:

- trust prompt present: true
- surface: `mod-trust-folder`
- vault ownership: true
- appearance/removal subscriptions before trigger: true
- native trusted click: true
- prompt remaining: `0`
- runtime manifest loaded: true
- plugin enable persisted: true
- plugin instance loaded: true
- handshake plugin ID: `prodigy-ai-runtime`
- runtime version: `0.1.0`
- protocol version: `1.0.0`
- protocol hash:
  `e14b93848a72e1b20247701f1f25c5aef6164400785e8c8482b4705d3c99ce51`
- active settings tab: `prodigy-ai-runtime`
- empty-profile text:
  `이전된 AI provider profile이 없습니다.`
- profile sections: `0`
- password inputs: `0`
- Project result: `capability_unavailable`
- browser network attempts: `0`

### Concurrent process ownership

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_real_obsidian_concurrent_ownership.js
```

Result: `4/4`

- Two concurrent disposable harnesses cleaned only their own exact process trees.
- Protected existing process identity remained exact.
- Ports were reusable.

### Runtime release gate

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
- Browser/OS network attempts: `0`
- Protected process continuity: exact
- Disposable vault byte audit: equal
- Temp roots removed: true

### Local and GitHub publication audits

```bash
node --test \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_release_audit.js \
  SYSTEM/AI/Skills/prodigy-review/tests/shared/test_prodigy_ai_runtime_publication_audit.js
```

Result: `2/2`

- Runtime Git and artifact source truth: pass
- Hosted CI identity and successful required steps: pass
- GitHub tag/Release exact identity: pass
- Downloaded/local asset byte identity: pass
- Download root removal and task temp inventory: pass

## Hostile 자체피드백과 해결

### High

1. **Prompt 부재가 synthetic success가 될 수 있었다.**
   - Fresh fixture에서는 prompt를 required로 만들었다.
   - Prompt shape/selector drift나 delayed absence는 bounded RED다.
2. **Prompt appearance를 app-ready 후 snapshot만 했다.**
   - Appearance observer를 app layout readiness 전에 구독한다.
3. **Click preparation/dispatch failure에서 observer와 globals cleanup이 늦었다.**
   - Node-side `try/finally`와 browser cleanup handle을 추가했다.
4. **Fixture plugin readiness가 boolean 하나로 합쳐졌다.**
   - manifest/global enable/persisted enable/plugin instance를 분리했다.

### Medium

5. **Prompt ownership이 generic DOM shape에만 의존했다.**
   - Exact cloned executable/profile/process ownership에 더해 active vault base path를
     disposable fixture path에 결속했다.
6. **Settings empty state가 shell presence만으로 green이 될 수 있었다.**
   - Active tab identity, connected route, exact shipped empty state, zero profile section,
     zero password input을 함께 요구한다.
7. **App readiness success path의 observer/timer cleanup이 불완전했다.**
   - resolve/reject 모두 동일 cleanup을 사용한다.
8. **Obsidian version test가 current compatibility를 pin하지 않았다.**
   - `1.13.7` exact compatibility pin으로 교체했다.

### 기각한 과잉 지적

- Shared harness의 trust action은 live vault가 아니라 exact cloned
  executable/profile/vault ownership 아래에서만 수행한다.
- Protected process continuity는 모든 real-surface test의 `close()`에서 executable
  digest, PID/start/PGID와 listeners를 다시 비교한다.
- Korean/English trust copy allowlist는 locale drift를 재도입하므로 사용하지 않는다.

## 알려진 비차단 Dusk 회귀

이번 변경과 무관한 공용 harness 전체 파일 실행에는 기존 9-Hub/fixture drift가 있다.
Task-owned diff에서 이 파일들을 수정하지 않았다.

- `HUBS.length`: expected `8`, current `9`
- fixture manifest count: expected `9`, current `10`
- structural rows: expected `48`, current `54`
- visual rows: expected `256`, current `288`
- Region workspace manifest 미정합
- 기존 agy fake-child fixture의 `dispatchEvent` Node-global 가정 2건

Project Wizard real-surface tests도 duplicated processor surface에서 stale
`[data-project-action="open-wizard"]`를 선택해 timeout한다. Release ZIP의 actual
Project `capability_unavailable` gate는 통과했다. 위 broad Dusk 회귀는 concurrent
Auction/Region/Harness 작업과 결합되어 있어 이 AI Runtime 챕터에서 수정하지 않았다.

## 현재 unrelated Dusk worktree

다음 10개 tracked modification은 모두 다른 작업자의 active work이며 unstaged다.

- `HUB/10 Auction.md`
- `SYSTEM/AI/Skills/prodigy-review/tests/home/test_home_action_queue.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_consolidation_literal_git_archive.js`
- `SYSTEM/AI/Skills/prodigy-review/tests/test_release_gate.js`
- `SYSTEM/CI/release-gate-manifest.json`
- `SYSTEM/CI/task16-final-receipt-verifier.js`
- `SYSTEM/TEMPLATE/FORMAT/template_auction_case.md`
- `SYSTEM/Views/auction-hub-styles.js`
- `SYSTEM/Views/auction-native-scenes.js`
- `SYSTEM/Views/home-action-queue.js`

Untracked paths: `1,586`.

Future work는 live `git status`를 다시 source of truth로 사용해야 한다.
`git add -A`와 `git add .`는 금지하고 exact task-owned paths만 stage한다.

## 보안·privacy·write·residue 감사

- Secret value persistence hits: `0`
- Prompt/response persistence hits: `0`
- Raw stdout/stderr persistence hits: `0`
- Browser network attempts: `0`
- OS network attempts: `0`
- Vault source/canonical writes: `0`
- Main-vault grants changed: false
- Main-vault installed artifacts changed: false
- Task-owned temp residue: `0`
- Disposable vault changed paths: `[]`
- Existing Obsidian/Aside continuity: exact

## 이번 챕터 stop condition

- [x] Korean trust obstruction `0/1` RED 재현
- [x] Locale-agnostic trust surface identity
- [x] Appearance/removal observer before trigger
- [x] Fixed sleep/polling delay 없음
- [x] Bounded deterministic native trust action
- [x] External manifest/load/enable evidence 분리
- [x] Verified handshake ID/version/protocol hash
- [x] Exact settings route and plugin identity
- [x] Empty profile state visible
- [x] Password input absent
- [x] Project `capability_unavailable`
- [x] Publication and installer QA regression green
- [x] Secret/network/write/temp counters zero
- [x] Existing process and port continuity exact
- [x] Unrelated Dusk changes untouched and unstaged
- [x] Atomic Lore commit과 current canonical handoff

## 다음 챕터 — Mobile Relay Activation

### 상태

`blocked_on_external_prerequisites`

### 선행 조건

다음 조건이 모두 준비되기 전에는 구현이나 external call을 시작하지 않는다.

1. 관리자 승인된 HTTPS Tailscale relay URL
2. Relay server identity와 deployment owner
3. Disposable test token을 저장할 SecretStorage ID
4. Physical iPhone 또는 iPad test device
5. Private repository visibility와 v0.1.0 Release를 변경하지 않는 범위 확인

### 정확한 목표

Configured HTTPS relay를 통해 mobile `structured-strict` request를 실제 1회 실행하고,
desktop CLI가 mobile에 노출되지 않으며 secret/prompt/response가 persistence나
diagnostics에 남지 않는 것을 증명한다.

### Stop condition

- Relay URL은 HTTPS이고 approved Tailscale identity에 결속된다.
- Token은 SecretStorage ID로만 참조되고 receipt/log에 값이 없다.
- Physical mobile Obsidian이 runtime handshake를 완료한다.
- Mobile request가 configured relay를 정확히 1회 호출한다.
- Desktop CLI process spawn은 `0`이다.
- Cross-provider fallback은 `0`이다.
- Prompt/response/secret persistence와 vault source writes는 `0`이다.
- Cancellation과 bounded timeout을 실제 device에서 관찰한다.
- Existing desktop release and Project fail-closed regressions remain green.
- 결과를 새 version/Release 없이 atomic Lore commit과 canonical handoff에 기록한다.

## 절대 건드리면 안 되는 상태

- Unrelated tracked/untracked Dusk worktree
- Main Dusk vault trust/plugin state와 installed artifact
- Existing Obsidian/Aside processes, profiles, windows와 listeners
- Runtime `main@d438053`, `v0.1.0` tag와 Release assets
- GitHub private visibility와 no-license state
- SecretStorage values와 device-local route values
- Prompt, response, schema payload, raw stdout/stderr
- Vault source/canonical files
- Cross-provider fallback prohibition

금지:

- `git add -A`, `git add .`, destructive reset/checkout, amend, force push
- Live Dusk vault에서 trust onboarding 또는 plugin enablement 자동 조작
- Fixed sleep, foreground polling loop, timing-luck assertion
- 승인 없는 GitHub write, tag 이동, Release replacement, visibility 변경
