# Prodigy AI Runtime Extraction Preflight v1

## 문서 상태

- 상태: 실행 승인 전 architecture preflight 완료
- 목적: Prodigy OS의 AI provider 실행 계층을 외부 Obsidian 플러그인 `prodigy-ai-runtime`으로 이전한다.
- 우선순위: 일관성, 사용성, 개인정보 경계, 재설계 방지
- AI consumer 영역: Auction, Project, Knowledge, Reading, Journal, Prodigy Wiki
- deterministic host: Home — 자체 AI consumer 없음
- 제외 영역: 공공데이터 collector, Todoist, Kakao 등 비-LLM transport

이 문서는 구현 도중 책임 경계나 migration 순서를 다시 설계하지 않도록 현재 production 코드의 병목을 먼저 고정한다.

---

## 1. 최종 책임 경계

### Workspace가 소유한다

- 사용자 action과 현재 화면 상태
- 입력 범위 선택
- 외부 전송에 대한 사용자 동의
- prompt의 목적과 domain 지시
- domain JSON Schema
- provider 응답의 domain 검증
- deterministic fallback
- 의미 단위 cache와 replay
- 결과 검토, 승인, 저장
- source/canonical/object write 권한

### `prodigy-ai-runtime`이 소유한다

- provider와 model registry
- provider+model capability certification
- consumer 요구조건에 따른 provider resolution
- SecretStorage
- HTTP, desktop CLI, mobile relay transport
- transport timeout과 cancellation
- exact in-flight request dedupe
- provider queue와 concurrency
- transport error taxonomy
- metadata-only request receipt
- provider 설정과 진단 UI
- adapter별 실제 cold provider 검증

### 절대 경계

1. 플러그인은 domain store를 import하지 않는다.
2. 플러그인은 prompt의 의미를 해석하지 않는다.
3. 플러그인은 vault path를 입력으로 받지 않는다.
4. 플러그인은 vault 문서를 직접 읽거나 쓰지 않는다.
5. 플러그인은 결과를 자동 반영하지 않는다.
6. 신규 AI 기능 추가에 provider adapter 수정이 필요하면 설계 오류다.
7. 신규 provider 추가에 workspace 수정이 필요하면 설계 오류다.

Obsidian plugin은 기술적으로 `app.vault`에 접근할 수 있으므로, 플러그인 source audit와 테스트에서 `app.vault`, `vault.read`, `vault.modify` 사용을 금지한다. SecretStorage adapter만 plugin main이 소유하고 transport에는 vault/app 객체를 전달하지 않는다.

---

## 2. 현재 AI consumer inventory

| Consumer ID | 영역 | 현재 구현 | 요청 | 민감도 | 실패 시 | 결과 권한 |
|---|---|---|---|---|---|---|
| `project.workflow_draft` | Project | `project-workflow-draft-service.js` | strict structured | private | 입력 유지 | 초안만 |
| `reading.question` | Reading | `reading-question-ai.js` | strict structured | private | 기본 질문 유지 | 제안만 |
| `reading.thinking_delta` | Reading | `reading-thinking-delta-ai.js` | strict structured | private | before/after 유지 | 제안만 |
| `journal.daily_reflection` | Journal | `daily-reflection-ai.js` | strict structured | highly-private | 저장된 일기 유지 | 검토 후 반영 |
| `journal.weekly_filter` | Journal | `weekly-filter-ai.js` | strict structured | highly-private | deterministic review 유지 | 검토 후 병합 |
| `journal.monthly_validation` | Journal | `monthly-validation-ai.js` | strict structured | highly-private | 월간 상태 유지 | 검토 후 저장 |
| `auction.decision_support` | Auction | `auction-ai-decision-support.js` | strict structured | mixed-private | deterministic projection 유지 | 조언만 |
| `auction.research_summary` | Auction | `auction-real-estate-research.js` | strict structured | internal | 검증된 package 유지 | 요약만 |
| `auction.region_experience` | Auction | `region-experience-ai.js` | strict structured | highly-private | 입력 유지 | 검토 후 반영 |
| `knowledge.source_batch` | Knowledge | `knowledge-source-batch-service.js` | strict structured | mixed | 사용자 원문 유지 | 요약만 |
| `knowledge.explorer_brief` | Knowledge | `knowledge-explorer-brief-service.js` | strict structured | internal | deterministic brief | 표시만 |
| `wiki.batch_analysis` | Prodigy Wiki | `llmwiki-batch-provider.js` | strict structured | private | proposal 없음 | 검토 proposal |
| `wiki.page_plan` | Prodigy Wiki | `HUB/50 Knowledge.md` | strict structured | private | compile 차단 | 계획 proposal |
| `wiki.article_compile` | Prodigy Wiki | `HUB/50 Knowledge.md` | strict structured | private | preview 없음 | preview만 |
| `shared.ai_inspector` | 미사용 | `ai-inspector.js` | chat text | private | 비활성 | chat만 |

Active consumer는 14개다. `shared.ai_inspector`는 현재 workspace manifest에서 mount되지 않는다. v1 migration 대상에서 제외하고 재사용 전에 별도 consumer manifest를 요구한다.

### Migration 전에 제거한 consumer

`home.morning_brief`는 사용자 결정에 따라 plugin migration 대상에서 제외하고 완전히 제거했다.

- `morning-brief-service.js` 삭제
- Home mount-time provider call 삭제
- Morning result cache 소비 삭제
- Morning Brief UI와 dead selector 삭제
- 생성된 Focus proposal 소비 삭제
- Home action queue는 실제 Object 상태와 사람이 승인·고정한 Focus만 사용
- disposable Obsidian 390px/1440px에서 provider call 0, Morning surface 0 확인

Home manifest가 아직 공통 provider service를 로드하는 이유는 Home에서 열 수 있는 `project.workflow_draft`의 legacy dependency 때문이다. 이는 Project consumer migration에서 제거한다.

---

## 3. Provider+model capability 현황

현재 config의 `capabilities`는 선언값이지 실측 인증값이 아니다.

| Provider | Adapter | 현재 model | Route | 선언 structured mode | 현재 실측 |
|---|---|---|---|---|---|
| LM Studio | OpenAI-compatible | Qwen 3.5 9B | remote/local-compatible | JSON Schema, strict 표기 | unavailable |
| Gemini | Gemini HTTP | Gemini 3.5 Flash | external HTTP | JSON Schema | transport 성공, Wiki `invalid_outcome` |
| Codex | desktop CLI | runtime default | desktop exec | JSON prompt, strict 표기 | unavailable |
| Antigravity | CLI/relay | Gemini 3.6 Flash Medium | desktop CLI/mobile relay | JSON Schema, strict 표기 | 과거 성공, 현재 unavailable |
| Groq | OpenAI-compatible | GPT-OSS 120B | external HTTP | JSON mode | secret 미설정 |
| OpenRouter | OpenAI-compatible | Ox Alpha | external HTTP | JSON mode | unavailable |
| MiMo | OpenAI-compatible | MiMo V2.5 Pro | external HTTP | JSON mode | secret 미설정 |
| OpenCode Go | OpenAI-compatible | 미설정 | external HTTP | JSON mode | config 미완성 |
| Custom OpenAI-compatible | OpenAI-compatible | 미설정 | custom HTTP | JSON mode | config 미완성 |

### Capability는 provider가 아니라 provider+model+route에 부여한다

필수 capability:

- `chat-text`
- `structured-loose`
- `structured-strict`
- `long-context`
- `local-route`
- `external-route`
- `desktop-exec`
- `mobile-relay`
- `cancellable`
- `streaming` — v1에서는 미지원 가능
- maximum input/schema/output bytes
- context window
- cost/rate metadata
- certification timestamp

`strictStructuredOutput: true`만으로 `structured-strict`를 부여하지 않는다. capability corpus를 실제로 통과한 provider+model+route 조합만 인증한다.

---

## 4. Consumer manifest

Workspace는 provider를 선택하지 않고 요구조건을 선언한다.

```js
{
  schema_version: 1,
  consumer_id: "reading.question",
  contract_version: 1,
  capability: "structured-strict",
  sensitivity: "private",
  route_policy: "local-preferred",
  consent_cadence: "standing-grant-with-explicit-action",
  background_allowed: false,
  max_input_bytes: 65536,
  max_schema_bytes: 32768,
  timeout_ms: 60000
}
```

### Manifest 변경 규칙

- sensitivity 증가: 권한 재확인
- local에서 external route로 변경: 권한 재확인
- provider profile revision 변경: 권한 재확인
- capability 강화: provider 재인증
- contract major 변경: client/plugin compatibility 확인
- 신규 consumer: 최초 사용 권한 확인

---

## 5. Client와 plugin protocol

Vault에는 provider-neutral facade만 남긴다.

```text
SYSTEM/Views/prodigy-ai-client.js
```

### Discovery

```js
const plugin = app.plugins.getPlugin("prodigy-ai-runtime");
const handshake = plugin?.api?.getHandshake();
```

Workspace가 plugin global이나 transport module을 직접 참조하지 않는다. 테스트는 client에 fake runtime을 주입한다.

### Handshake

```js
{
  plugin_id: "prodigy-ai-runtime",
  runtime_version: "1.0.0",
  protocol_version: "1.0.0",
  consumer_manifest_range: ">=1 <2",
  runtime_epoch: "random-per-load",
  protocol_hash: "sha256",
  capabilities: []
}
```

- protocol major mismatch: 해당 AI action만 비활성
- plugin absent: deterministic 기능은 정상 유지
- plugin reload: runtime epoch 변경
- old epoch에서 도착한 응답: client가 폐기
- plugin disable 중 요청: `runtime_unavailable`

### Runtime API v1

```text
getHandshake()
getStatus()
listProviders()
listModels()
resolveProvider(requirements)
requestStructured(request)
requestChat(request)
cancel(requestId)
getRequestStatus(requestId)
openSettings()
subscribeStatus(listener)
```

### Request identity

```text
consumer_id
owner_session_id
operation_id
attempt_id
request_id = hash(위 필드)
```

- 동일한 실행 중 `request_id`만 coalesce한다.
- 완료 response는 plugin이 cache하지 않는다.
- 명시적 retry는 새 `attempt_id`를 사용한다.
- provider가 달라지는 fallback은 허용하지 않는다.

### Response envelope

```js
{
  protocol_version: "1.0.0",
  runtime_epoch: "...",
  request_id: "...",
  status: "completed",
  payload: {},
  receipt: {
    consumer_id: "reading.question",
    attempt_id: "...",
    provider_profile_hash: "...",
    provider_key: "gemini",
    model: "gemini-3.5-flash",
    route_class: "external-http",
    capability: "structured-strict",
    input_hash: "...",
    input_bytes: 1234,
    schema_hash: "...",
    started_at: "...",
    ended_at: "...",
    latency_ms: 1234,
    error_code: null,
    provider_request_id: null,
    usage_source: "unknown",
    input_tokens: null,
    output_tokens: null,
    cost: null,
    queue_ms: 0,
    retry_count: 0
  }
}
```

`payload`는 consumer에게 반환하지만 plugin log에는 저장하지 않는다.

---

## 6. Consent와 authority 정책

### 매 실행마다 범위 동의

- `wiki.batch_analysis`
- `wiki.page_plan`
- `wiki.article_compile`
- `knowledge.source_batch`

Wiki의 현재 range-bound consent receipt를 유지한다. plugin은 route grant와 profile revision만 검사하며 Wiki의 source scope authority를 가져가지 않는다.

### 명시 action + consumer standing grant

- Project workflow
- Reading question
- Reading thinking delta
- Daily Reflection
- Weekly Filter
- Monthly Validation
- Auction decision support
- Region Experience

최초 사용 시 다음을 표시한다.

```text
기능
전송 데이터 종류
provider/model
local 또는 external
이번 권한이 유지되는 범위
```

AI 버튼에는 이후에도 현재 provider와 route를 확인할 수 있어야 한다.

### Deterministic 기본 + 명시 AI action

- Auction Research Summary
- Knowledge Explorer Brief

Home의 자동 provider 호출은 migration 전에 제거했다. Auction Research Summary는 아직 modal render 중 자동 호출하므로 명시 action으로 바꾼다.

### Local route 판정

`authMode: none`, provider 이름, `LM Studio`라는 label만으로 local로 보지 않는다. 실제 인증된 endpoint/route가 loopback 또는 device-local인지로 판정한다. 현재 LM Studio profile은 Tailscale URL을 사용할 수 있으므로 external route다.

---

## 7. Retry, cache, cancellation ownership

| 책임 | 소유자 |
|---|---|
| 입력 선택과 동의 | Consumer |
| operation identity | Consumer/client |
| 의미 단위 cache | Consumer |
| warm replay | Consumer |
| provider resolution | Plugin |
| provider queue | Plugin |
| transport timeout | Plugin |
| transport attempt | Plugin, 기본 1회 |
| exact in-flight dedupe | Plugin |
| user retry | Consumer |
| domain response 검증 | Consumer |

### 금지

- 429/5xx 뒤 다른 provider로 자동 fallback
- timeout 뒤 자동 재호출
- plugin의 completed-response semantic cache
- consumer와 plugin의 이중 timeout race
- disposed mount에 late result 적용

### Cancellation 상태

```text
cancelled_confirmed
cancel_requested
outcome_unknown
```

HTTP adapter나 CLI가 실제 중단됐는지 증명할 수 없으면 `cancelled`라고 거짓 보고하지 않는다.

---

## 8. Config와 SecretStorage migration

현재 `ProdigyConfigService`는 다음을 한 파일에 혼합한다.

- AI provider config
- Project workflow preset
- Todoist secret ID
- Region Intelligence secret ID
- LLM Wiki profile

전체 서비스를 plugin으로 이동하면 안 된다.

### Plugin으로 이동

- AI provider profiles
- model selection
- AI route binding
- AI provider secret IDs
- per-consumer overrides
- AI settings UI

### Vault에 유지

- workflow presets
- Todoist
- Region/public-data secrets
- non-AI settings

### Device split

Sync 가능한 profile:

```text
provider type
model policy
consumer override
capability preference
```

Device-specific binding:

```text
CLI executable path
local endpoint
mobile relay endpoint
secret readiness
health result
```

### Migration sequence

1. 기존 AI config를 secret 값 없이 snapshot/hash한다.
2. Vault migration coordinator가 sanitized AI config를 plugin에 전달한다.
3. plugin이 기존 SecretStorage ID의 존재만 확인한다.
4. plugin config hash와 route readiness를 검증한다.
5. plugin을 AI config의 유일한 authority로 전환한다.
6. 임시 bridge가 plugin AI config와 vault workflow config를 합쳐 legacy consumer에 제공한다.
7. consumer를 한 개씩 migration한다.
8. 각 cutover 뒤 현재 plugin config를 legacy 형식으로 export 가능한지 rollback 테스트한다.
9. 모든 consumer가 이전된 후 bridge를 제거한다.
10. 한 release window 뒤 sealed old AI config를 제거한다.

Secret 값은 migration JSON, receipt, log, test fixture에 포함하지 않는다. 기존 stable SecretStorage ID를 재사용한다.

`fallbackProvider`는 migration하지 않는다.

---

## 9. Desktop CLI와 mobile relay

### P0: Codex cwd

현재 Codex adapter는 vault root를 process cwd로 사용한다. 이는 선택된 prompt만 전달한다는 경계를 깨뜨린다.

모든 CLI adapter는:

- 비어 있는 isolated temporary directory에서 실행
- prompt를 stdin 또는 안전한 argv로만 전달
- shell 사용 금지
- vault path 전달 금지
- process 환경 allowlist
- 종료 후 temporary directory 제거

### Executable discovery

GUI로 실행된 Obsidian의 PATH를 신뢰하지 않는다.

순서:

1. 사용자가 설정한 검증된 absolute path
2. app bundle의 공식 executable
3. 알려진 Homebrew/npm/user-local 경로
4. safe realpath와 실행 가능 여부 확인
5. 미발견 시 `executable_missing`

login shell command interpolation은 사용하지 않는다.

### Mobile

- plugin manifest는 mobile을 지원한다.
- Node/child_process adapter는 lazy-load한다.
- Codex CLI는 mobile에서 unsupported route다.
- Antigravity는 versioned relay를 통해서만 mobile 실행한다.
- HTTP adapter는 Obsidian request API를 사용한다.
- device별 route readiness를 별도로 유지한다.

### Relay protocol 보강

현재 relay는 request ID/version/cancel/status가 없고 동시에 한 요청만 처리한다.

v1 relay는 다음을 포함해야 한다.

- protocol version
- request ID
- provider/model capability identity
- server-side deadline
- bounded queue
- queue position 또는 deterministic busy
- request status
- cancellation 또는 `outcome_unknown`
- model allowlist
- prompt/schema/output byte limits
- token rotation
- metadata-only health/diagnostic

---

## 10. Error와 observability

### Plugin transport error taxonomy

```text
configuration_missing
secret_missing
executable_missing
login_required
route_unreachable
rate_limited
quota_exhausted
model_unavailable
schema_unsupported
request_too_large
timeout
cancelled_confirmed
cancel_requested
outcome_unknown
transport_error
malformed_transport_response
runtime_unavailable
protocol_mismatch
```

`invalid_outcome`, citation 오류, domain field 누락은 plugin 오류가 아니라 consumer domain validation 오류다.

### Persist 가능한 metadata

- request/consumer/attempt ID
- provider profile hash
- provider key/model
- route class/capability
- prompt/schema/output hash와 byte count
- 시작/종료/latency/queue time
- transport status와 error code
- provider request ID
- provider가 실제 보고한 usage와 cost

### Persist 금지

- prompt
- response payload
- schema body
- secret
- authorization/cookie
- vault path
- source text
- raw stdout/stderr

CLI stderr는 메모리에서 분류한 뒤 exit code/signal/error code만 저장한다.

Usage는 `provider_reported`, `estimated`, `unknown`을 구분한다. 알 수 없는 cost를 0으로 기록하지 않는다.

Plugin settings에는 metadata-only 최근 요청, provider readiness, queue, 사용량을 표시하고 clear/export 기능을 제공한다.

---

## 11. Bottleneck register

### P0 — 구현 전에 반드시 고정

| ID | 병목 | 결정된 해법 | Gate |
|---|---|---|---|
| D1 | Morning Brief 중복 HTTP transport | **해결됨:** consumer와 service 삭제 | Home provider call 0 real QA |
| D2 | 전역 default provider가 feature 요구 무시 | consumer capability resolution | provider matrix test |
| D3 | generic/Region endpoint 정책 중복 | plugin transport policy 단일화 | endpoint adversarial test |
| H1 | Reading이 manifest에 없는 global provider에 의존 | 모든 workspace가 client를 명시 로드 | fresh realm bootstrap |
| H2 | DataviewJS/JS Engine realm 차이 | call-time plugin discovery | 양 host real QA |
| H3 | mount disposal과 요청 취소 불일치 | owner signal 의무화 | stale result test |
| C1 | Home cache miss 자동 외부전송 | **해결됨:** AI consumer 제거 | provider call 0 real QA |
| C2 | Auction modal render 자동 외부전송 | 명시 AI action | modal open call 0 |
| C3 | Journal/Region 고민감 데이터 global route | sensitivity route grant | external consent test |
| C4 | `authMode:none`을 local로 오인 | certified route로 판정 | Tailscale external test |
| R1 | 429/5xx 자동 cross-provider fallback | 자동 fallback 제거 | provider identity stable |
| R2 | consumer/plugin 이중 timeout | plugin deadline 단일화 | one deadline test |
| R3 | Project/Reading/Auction cancellation 공백 | owner signal | close/remount cancellation |
| M1 | AI/비AI config와 secret 혼합 | AI subset만 추출 | non-AI config hash 유지 |
| M2 | migration 중 config authority 이중화 | plugin 단일 authority + bridge | dual-write 0 |
| M3 | sync profile/device route 혼합 | 두 layer 분리 | desktop/mobile fixture |
| M4 | plugin no-vault-read와 config import 충돌 | vault coordinator가 sanitized import | plugin vault API audit |
| V1 | 별도 repo protocol drift | API semver+hash handshake | mismatch recovery |
| V2 | unversioned global plugin API | plugin-manager discovery | unload/reload test |
| V3 | iCloud 내부 nested repo/symlink 위험 | 별도 repo + built artifact 설치 | packaging audit |
| P1 | Codex가 vault root에서 실행 | isolated temporary cwd | no vault path test |
| P2 | GUI PATH와 hardcoded CLI 경로 | safe executable discovery | GUI launch test |
| P3 | device route 미분리 | per-device readiness | device binding test |
| P4 | relay version/status/cancel 없음 | relay protocol v1 | relay conformance |
| O1 | 공통 request receipt 없음 | metadata envelope | all-consumer receipt |
| O2 | `provider_unavailable` 과도한 축약 | stable error taxonomy | diagnostic matrix |
| O3 | plugin data에 secret 저장 위험 | SecretStorage only | secret byte scan |
| T1 | 기존 테스트가 global service에 결합 | client seam test-first | no direct service imports |
| T2 | global pollution이 hidden dependency를 감춤 | isolated fresh-realm test | Reading standalone pass |
| T3 | live test 조합 폭발 | capability corpus + representative smoke | bounded matrix |
| T4 | config rollback harness 없음 | import/export/rollback fixture | lossless rollback |

### P1 — 해당 phase exit 전에 해결

- endpoint/provider identity drift
- feature-specific recovery copy와 transport code 혼합
- semantic fallback과 provider fallback 용어 충돌
- dynamic Region loader
- same workspace multi-leaf identity 충돌
- plugin disable/update 중 stale response
- cross-realm AbortSignal
- outcome-unknown retry 비용
- cache authority 혼합
- SecretStorage alias와 last-provider migration
- settings UI 분리
- protocol/runtime/consumer schema version 구분
- stable/dev distribution과 rollback
- relay queue/concurrency
- mobile suspension
- capability별 byte limit
- metadata retention
- truthful unknown usage/cost
- prompt/response log 방지
- migration dual-call 방지

### P2 — retirement 전 해결

- dormant AI Inspector 처리
- Home에서 여는 Project Wizard의 legacy provider module 의존
- old config retention 기간
- minimum Obsidian version 확정
- feature copy 국제화/한국어 UX

---

## 12. Test strategy

### Plugin unit

- protocol validation
- provider resolution
- capability certification
- queue and priority
- byte limits
- cancellation states
- metadata receipt
- log privacy
- config migration

### Adapter conformance corpus

각 adapter는 다음을 독립적으로 검증한다.

- chat text
- structured loose
- structured strict
- malformed response
- timeout
- cancel
- auth missing
- login missing
- executable missing
- rate limit
- quota
- model unavailable
- request too large

### Consumer contract

모든 consumer에서:

- 정확한 payload 포함/제외
- sensitivity와 consent cadence
- deterministic fallback
- domain response validation
- plugin call 정확히 1회
- legacy transport call 0회
- provider failure 시 사용자 입력 유지
- write는 사용자 승인 전 0회

### Host integration

- DataviewJS
- JS Engine
- fresh realm
- multiple leaves
- plugin absent
- plugin late load
- plugin disable
- plugin reload
- protocol mismatch
- stale runtime epoch

### Migration

- old config fixture import
- non-AI config 불변
- secret value serialization 0
- plugin single authority
- rollback export
- per-consumer cutover rollback

### Live release

- desktop HTTP
- desktop CLI
- mobile HTTP
- mobile relay
- capability class별 대표 consumer
- Wiki selected-range cold/warm
- synthetic cleanup receipt

실제 provider test는 deterministic main regression과 분리한다. provider uptime 때문에 일반 CI가 flaky해지면 안 된다.

---

## 13. Migration execution order

### Architecture preflight

이 문서와 consumer/capability matrix를 고정한다.

### Wiki closure

1. Wiki acceptance를 provider-neutral core로 rebaseline한다.
2. 실제 provider cold/warm gate는 plugin release gate로 이동한다.
3. 실패한 cold runner와 synthetic cache를 정리한다.
4. deterministic adapter로 outbound range, consent, replay, hash를 검증한다.
5. source/canonical write 0과 기존 50-item review 불변을 감사한다.
6. 현재 Wiki 기능을 별도 완료 처리한다.

Wiki 완료와 AI Runtime migration을 같은 완료 조건으로 묶지 않는다.

### Client contract

1. failing contract tests
2. consumer manifest schema
3. plugin discovery/handshake
4. fake runtime
5. absent/mismatch/reload recovery

### Plugin foundation

1. 별도 `prodigy-ai-runtime` repository
2. protocol/transport tests
3. structured/chat/cancel/queue
4. provider adapters
5. config/SecretStorage/settings
6. capability conformance

### Consumer migration

1. Project workflow — 단순 canary
2. Reading
3. Journal
4. Auction
5. Knowledge non-Wiki
6. Prodigy Wiki

각 consumer는 별도 atomic commit과 rollback gate를 갖는다.

Project migration은 Home에서 Project Wizard를 여는 경로도 함께 검증한다. Home 자체에는 새 AI consumer를 추가하지 않는다.

### Retirement

1. in-vault provider runtime 제거
2. workspace manifest provider dependency 제거
3. temporary config/runtime bridge 제거
4. direct AI HTTP/CLI call 0 감사
5. old AI config 제거

---

## 14. Consumer별 cutover acceptance

각 consumer migration은 다음을 모두 만족해야 완료다.

1. 기존 domain test 유지
2. fake plugin success/failure/cancel test
3. exact outbound payload test
4. 명시 consent/grant test
5. plugin call 1, legacy call 0
6. close/remount stale result 차단
7. provider unavailable UX
8. deterministic fallback 또는 사용자 입력 보존
9. write authority 불변
10. real Obsidian matching surface QA
11. rollback export 검증
12. atomic Lore commit

---

## 15. Repository와 배포 결정

- source repository: vault 밖의 별도 `prodigy-ai-runtime`
- plugin ID: `prodigy-ai-runtime`
- stable: GitHub release artifact
- development: BRAT 또는 local built artifact
- 설치 위치: `.obsidian/plugins/prodigy-ai-runtime`
- nested git repository: 금지
- symlink를 release 방식으로 사용: 금지
- canonical protocol schema: plugin repository
- vault client contract: protocol hash가 포함된 generated/vendored artifact
- 이전 known-good plugin release를 rollback용으로 유지

별도 repository의 실제 filesystem 위치는 구현 환경 선택일 뿐 protocol 설계를 바꾸지 않는다.

---

## 16. Definition of Ready

다음 조건이 충족되어야 구현을 시작한다.

- [x] 모든 active AI consumer inventory
- [x] dormant AI surface 분리
- [x] provider+model capability 공백
- [x] direct transport 중복
- [x] workspace host/lifecycle
- [x] consent/sensitivity/authority
- [x] retry/cache/cancellation
- [x] config/SecretStorage/rollback
- [x] protocol/version/distribution
- [x] desktop/mobile/relay
- [x] observability/cost/privacy
- [x] test matrix
- [x] P0별 결정과 exit gate

구현 중 새로운 P0가 발견되면 해당 consumer migration을 중지하고 이 문서에 decision을 추가한다. 이미 결정된 P0를 우회하는 임시 fallback이나 별도 transport는 만들지 않는다.

---

## 17. Definition of Done

- 14개 active consumer가 `ProdigyAIClient`만 사용
- workspace의 provider별 auth/HTTP/CLI/model routing 코드 0
- Morning Brief consumer·service·surface 0
- Home/Auction render-time 외부 호출 0
- 신규 consumer 추가에 plugin 수정 0
- 신규 provider 추가에 workspace 수정 0
- plugin absent/mismatch 시 deterministic 기능 정상
- prompt/response/secret persistent log 0
- plugin vault read/write 0
- provider 변경 시 route grant 재확인
- cross-provider automatic fallback 0
- desktop CLI isolated cwd
- mobile relay protocol v1
- provider+model capability certification
- 모든 consumer single-call/rollback acceptance
- 기존 Prodigy Wiki source/canonical write 0
- 기존 50-item review 불변
- legacy provider runtime과 manifest dependency 제거
- plugin과 vault repository의 atomic Lore commits

