# Prodigy OS LLM Wiki runtime audit — 2026-09-09

## 1. FINAL VERDICT

**BROKEN — 사용자가 요청한 Source → 질문 → 인용 답변 → Proposal → Human Review 기준.**

부분 구현과 기존 생성 결과는 존재한다. 따라서 CONTRACT-ONLY가 아니다. `local_llm_wiki`의 실체는 **B: runtime은 존재하지만 일부 단계만 연결됨**이다. 현재 제품은 질문에 답하는 Wiki와 자료를 정리하는 Wiki의 경로가 분리되어 있고, 자료 정리 provider도 현재 머신에서 실행되지 않는다.

검증 범위: 실행 중인 Dusk Obsidian, 실제 Hub와 JavaScript, 로컬 corpus와 job 상태, 실제 provider 요청 2회, 읽기 전용 canary와 검색 질의, 관련 단위 테스트. 타사 제품은 공식 문서/저장소의 공개 기능을 비교했으며 직접 운용 성능을 측정하지 않았다. 시장 제품이 모두 성숙하거나 오류가 없다고 가정하지 않았다.

이번 작업은 audit와 failure proof다. **운영 코드·provider 설정·canonical 데이터는 수정하지 않았다.** Git commit/push/release 없음. 산출물은 이 폴더에만 추가했다. 실제 provider 진단은 공용 runtime의 메모리 diagnostics와 격리 임시 디렉터리 생성/정리 경로를 사용했으며 batch cache 쓰기나 canonical writer를 호출하지 않았다. UI 검색 상태는 기본 verified/빈 검색으로 복원했다.

## 2. PRIMARY FAILURE POINT

### 지정한 vertical canary에서 첫 FAIL

기존 시험용 `INBOX/Prodigy Wiki QA 임시.md`(파일시스템 이름은 NFD, 317 bytes)를 사용했다. 원문에 있는 지시문도 신뢰하지 않는 source data로 취급했다.

1. `llmwiki-user-source-selector.js::eligibleInboxPath` → PASS.
2. `llmwiki-analysis-scope.js::createAnalysisScope` → PASS.
3. `llmwiki-chunk-manifest.js::createChunkManifest` → PASS.
4. `llmwiki-wiki-read-adapter.js::buildSnapshot` → 실행 성공, 그러나 INBOX 행 0개.
5. `browseRead({mode:"literature",query:"Prodigy Wiki QA"})` → **FAIL: total=0**.

**Primary Failure Point: source intake corpus와 query corpus 사이 연결.** `SYSTEM/Views/llmwiki-wiki-read-adapter.js:187`의 `prefixMetadata`/`rowFrom`은 INBOX를 받지 않는다. 반면 현재 자료 선택과 `HUB/50 Knowledge.md:1514::runDocumentPlan`은 INBOX Markdown에 한정된다. INBOX를 verified Knowledge로 취급해야 한다는 뜻이 아니다. 미승인 source를 supporting evidence로 질문하는 경로가 빠져 있다는 뜻이다.

### 별도로 증명한 실제 provider 직접 장애

`SYSTEM/Views/llmwiki-batch-provider.js:194::createBatchAnalysisProvider`
→ `prodigy-ai-consumer-runtime.js::requestStructured`
→ `prodigy-ai-client.js::requestStructured`
→ `.obsidian/plugins/prodigy-ai-runtime/main.js:125::createCliAdapter`
→ `runProcess({command:"agy",shell:false})`.

실제 Wiki binding: `antigravity`, model `gemini-3.8-flash-low`, route `desktop-cli`. `buildAdapter`의 기본 executable은 `agy` (`main.js:2819`). Obsidian의 PATH는 `/usr/bin:/bin:/usr/sbin:/sbin`; 실행 파일은 `/Users/prodigykim/.local/bin/agy`에 있다.

```text
spawnSync agy ENOENT
status: null
runtime receipt: transport_error
Wiki result: provider_unavailable
```

동일 Obsidian 프로세스에서 `agy --version`을 spawn하여 ENOENT를 확인했다. 절대 경로를 shell에서 실행하면 `1.1.27`이다. 실제 provider 요청은 synthetic-alpha 795 bytes에서 14ms, INBOX QA 317 bytes에서 10.5ms 만에 실패했다. 첫 runtime receipt는 5ms, retry_count=0, provider_request_id=null이다. 응답 JSON이나 schema 검증에 도달한 실패가 아니다.

증거: [canary-node.json](canary-node.json), [provider-live.txt](provider-live.txt), [canary-qa-provider.txt](canary-qa-provider.txt), [provider-executable.txt](provider-executable.txt), [provider-diagnostics.txt](provider-diagnostics.txt).

## 3. END-TO-END PIPELINE

아래 경로는 모두 저장소 상대경로다. `V/`는 `SYSTEM/Views/`다. **UNWIRED는 해당 vertical flow에서 연결이 없다는 뜻이며 모듈 자체가 없다는 뜻이 아니다.** upstream 실패로 실행하지 못한 parser 등을 FAIL로 단정하지 않았다.

| 단계 / 판정 | 실제 파일·심볼 | 호출 주체 → 입력 → 출력 → 다음 연결 | persistent side effect |
|---|---|---|---|
| Source discovery — PASS | `V/llmwiki-user-source-selector.js::listInboxSources, eligibleInboxPath` | Hub 자료 선택 → INBOX `.md`, metadata/원문 → 선택 가능한 source → pinSelection | 없음; 파일 읽기/hash |
| Source pinning — PASS(구현), canary scope PASS | 같은 파일 `pinSelection`; `V/llmwiki-analysis-scope.js::createAnalysisScope` | 선택 source → path/hash/text/범위 → 고정 scope → chunk manifest | 없음 |
| Ingest projection — PASS | `V/llmwiki-chunk-manifest.js::createChunkManifest` | batch analyzer → scope → exact coverage chunks/hash → cache lookup | 함수는 없음 |
| Query corpus discovery — FAIL(canary 미포함) | `V/knowledge-explorer-hub-projection.js::collectRecords`; `V/knowledge-explorer-data-source.js::index`; `V/llmwiki-wiki-read-adapter.js::buildSnapshot,rowFrom` | Hub `collectSnapshot` (`HUB/50 Knowledge.md:3353`) → Dataview assets/candidates → metadata snapshot → browse | 없음; ingest corpus와 연결 없음 |
| Snapshot publish — PASS(구현) | `V/llmwiki-wiki-read-service.js::publishSnapshot` | surface.refresh → collector를 두 번 호출 → revision 일치 snapshot → browseRead | 메모리 snapshot/cache만 |
| Lexical query — PASS/FAIL 혼재 | `V/llmwiki-wiki-surface.js::applyBrowse`; `V/llmwiki-wiki-read-adapter.js::browseRead`; `V/llmwiki-query-readonly.js::queryRead,score` | 검색 submit → query/mode/snapshot → ranked rows; 자료 제목 성공, 전체/대기 scope 오류 → UI 목록 | 없음 |
| Advanced retrieval — DEAD / UNWIRED(query) | `V/llmwiki-retrieval-service.js::create,retrieve`; `V/llmwiki-wiki-read-service.js::createRetrievalReadService` | trusted canonical reader 요구 → lexical/structured/relation/hint 후보 → revalidate → shortlist | 없음. production Hub는 일반 create 사용; retrieve/전용 reader 생성의 production caller 없음 |
| Query context assembly — NOT IMPLEMENTED(연결된 경로) | query/surface/read modules에 provider request 없음 | 목록에서 본문 hydrate는 가능하지만 query+근거 묶음을 LLM으로 전달하는 caller 없음 | 없음 |
| Ingest context assembly — PASS(실제 호출 준비) | `V/llmwiki-batch-provider.js::batchAnalysisProvider`; `V/llmwiki-evidence-candidates.js::createSemantic` | analyzer chunks/candidate IDs → keyed evidence + prompt/COMPACT_SCHEMA → consumer runtime | 함수는 없음 |
| Provider — FAIL | 위 Primary Failure Point | prompt/schema → runtime-selected CLI → ENOENT → transport_error | runtime 진단은 메모리; 임시 실행 폴더 정리 |
| Parsing — UNWIRED(query), ingest 실호출 미도달 | plugin `parseJson,structuredPayload`; `V/llmwiki-ai-runtime-transport.js::validateResponse` | CLI/stdout 또는 HTTP JSON → payload → schema | 없음 |
| Schema/anchor validation — UNWIRED(query), ingest 실호출 미도달 | plugin structured validation; `V/llmwiki-batch-provider.js::validateResponse`; `V/llmwiki-evidence-anchor.js::anchorQuote` | payload/chunk/evidence key → 검증된 span artifacts → materializer | 함수는 없음 |
| Cited answer — UNWIRED | `V/llmwiki-query-readonly.js::resultFrom`; `V/llmwiki-page-plan-feedback.js::querySourceOnly` | 전자는 검색 결과, 후자는 이미 만든 plan의 source-only claims 검색. 일반 LLM 답변이 아님 | 없음. 실제 자료 검색 citation 배열은 비어 있음 |
| Proposal — UNWIRED(query), ingest 구현 존재 | `HUB/50 Knowledge.md:851::runCanonicalBatch`; `V/llmwiki-inbox-proposal-materializer.js::materialize`; `V/llmwiki-document-compiler.js` | validated artifacts → source-bound proposals / holds → plan/compile | materialize는 없음; Hub analyzer는 job/cache/coverage, plan은 cache snapshot 저장 |
| Human Review handoff — UNWIRED(canary), UI 구현 존재 | Hub `activateDocumentPlanReview` → `llmwiki-run-controller.js::openPreparedRiskReview` → `llmwiki-lifecycle-view.js::renderReview`/`llmwiki-risk-approval-review-view.js::mountRiskApprovalReview` | compiled proposals → branded approval packets → 검토 화면 | run 메모리 + 명시적 ingest/review recovery cache |
| 승인 이후 — 미실행 | `V/llmwiki-risk-review-controller.js::approve`; `V/llmwiki-operation-writer.js`; `V/llmwiki-deterministic-commit.js::commitApprovedCanonical` | human approval → payload/revision/authority 재검증 → writer | 승인된 canonical/audit만. 이번 실행 없음 |

### CONTRACT ONLY / DEAD 구분

- `SYSTEM/AI/Skills/llmwiki-librarian/runtime-contract.json`: 서비스 이름과 필수 field 선언. 서비스 프로세스/endpoint 등록 아님.
- `llmwiki-librarian-contract.js::evaluateInteraction`: 실제 JS 함수지만 generic summary와 빈 graph/lint/contradiction payload를 조립하는 conformance helper. provider/retrieval 없음; 확인된 caller는 테스트. **DEAD / UNWIRED(product), conformance-only**.
- `references/provider-prompt.md`, `provider-response-schema.json`: legacy proposal transport 계약. 현재 batch 분석은 `llmwiki-batch-provider.js::COMPACT_SCHEMA`를 사용한다. 현재 ingest prompt의 근거로 README를 대신 사용하지 않았다.
- `local_llm_wiki`라는 이름 자체는 contract에 있지만 전체 시스템은 실행 가능한 Hub/Views/plugin으로 구성된다. 이름 부재를 전체 runtime 부재로 확대하지 않았다.

### Corpus / index

- intake: INBOX `.md`; Processed/Private/Protected/Sensitive, private metadata, 민감 내용 제외. `analysis-scope`는 ZETA/LITERATURE와 FLEETING도 허용하지만 현재 Golden UI selector/runDocumentPlan은 INBOX 전용이다.
- browse: `ZETA/PERMANENT/`, `ZETA/LITERATURE/`, candidate roots. 현재 runtime candidate root는 `ZETA/CANDIDATES/`와 legacy roots다. Object/PARA 업무 자료는 이 검색 corpus에 자동 편입되지 않는다. reviewed Wiki는 `PARA/RESOURCES/Prodigy Wiki`의 별도 receipt index로 표시된다.
- 실제 vault metadata 재구성: Markdown 1,048, Explorer assets 319, Wiki rows 28 = Literature 4 + maintenance Knowledge 24, verified 0. 전체 vault type 집계에는 템플릿/보관본이 섞이므로 canonical 파일 수와 구분했다.
- 현재 `ZETA/PERMANENT` 24개 파일이 있지만 `.llmwiki-audit/immutable/head.json`은 없다. 실제 trusted read adapter 결과도 rows=[] (246.6ms). 자동 verified 승격은 금지. 각 파일의 과거 승인 유무를 이 검사만으로 단정하지 않는다.
- 일반 browse collector는 canonical bytes/immutable authority를 공급하지 않는다. `canonicalTrustFor`는 receipt/bytes를 요구한다. 승인 자료가 나중에 생겨도 이 projection 경계의 authority 전달을 따로 검증해야 한다.
- 본문은 상세 선택 때 lazy hydrate한다. query용 metadata row에는 canary와 Literature 본문이 없다. `summary`가 frontmatter에 없으면 본문 `**Summary:**`는 색인되지 않는다. `connections`는 query의 canonical relation으로 자동 변환되지 않는다.
- browse projection은 refresh/mount 시 full metadata rebuild, hydrate cache는 path/mtime/revision 기준 메모리 캐시다. disk vector index 없음. ingest는 content/request/chunk hash 기반 incremental cache와 job/pack receipts 존재.
- stale 방어: publish 이중 수집, hydrate revision 검사, retrieval 후보 revalidate, reviewed index source hash 비교. 다만 mount snapshot만으로 파일의 모든 최신 변경을 지속 반영한다고 보장할 수 없다.
- watcher는 현재 Hub `vault.on("create")`의 INBOX 생성 이벤트다. modify/delete/rename를 포괄하는 ingest watcher는 아니다. source diff/변경 범위 재분석 UI는 존재한다.
- 현재 verified corpus는 실제로 비어 있다. 전체 캐시가 stale하다고 단정할 증거는 없다. 과거 작업은 49개: pending 5, blocked 22, review_ready 21, resolved 1. `review_ready` 저장값을 지금의 실행 성공으로 계산하지 않았다.

## 4. ROOT CAUSES (5개)

| 원인 | Evidence | Impact / Severity | 최소 Fix |
|---|---|---|---|
| 1. intake→query 연결 누락 | INBOX QA eligibility/scope/chunk PASS, browse 0; query submit에 provider caller 없음 | 질문→인용 답변→proposal 불가능 / P0 | 기존 source 범위와 read-only query UI를 연결. supporting/verified 구분 유지; 기존 provider/proposal/review 함수를 명시적 질문 action에 연결 |
| 2. CLI executable 탐색 실패 | 앱 PATH, `spawnSync agy ENOENT`, 실제 요청 transport_error | 실제 LLM 분석 불가 / P0 | 같은 antigravity profile의 device executable을 확인된 절대 경로로 설정하고 공식 재인증. provider 변경/fallback 아님 |
| 3. blocked 재시도 연결 누락 | analyzer NO_CALL_STATES; Hub resume/retry→runGoldenWiki→runPlan에 explicit_retry 전달 없음; 현재 job blocked/provider_calls=0 | 다시 누르면 같은 차단 상태 재사용 / P0 | 사용자가 누른 retry intent를 기존 claimExplicitRetry까지 전달; outcome_unknown은 별도 재조정 유지 |
| 4. retrieval contract/projection 불일치 | all/pending→fleeting_note scope, query TYPES에는 없음; 본문·connections 누락; verified 0 | 전체 검색 오류, 본문 recall 손실, 관련 지식 오검색 / P0(all)/P1(quality) | 기존 type vocabulary에 맞춘 mode delegation; 승인되지 않은 source 본문을 선택 범위 내 read-only 검색; authority reader 연결 |
| 5. 실패 코드와 단계 정보 손실 | mapTransportError(rate_limited/secret_missing/timeout/schema_invalid) 모두 provider_unavailable; Hub는 blocked; UI 일반 오류 | 사용자가 수정 행동을 선택할 수 없음 / P1 | runtime error_code와 원 단계 보존, ENOENT/인증/한도/JSON/schema/근거없음/재시도 대기 구분 |

### Provider audit 상세

- selector: ProdigyAIClient → runtime consumer binding, capability/certification/grant로 결정. `resolveProvider` ready는 executable이 실제 실행 가능하다는 health check가 아니다.
- direct: `llmwiki-provider-contract.js::selectProviderProfile` 입력으로 허용되지만 출력은 `provider_mode:"runtime"`. direct provider 고정 의미를 잃는다.
- omniroute: 같은 함수에서 `invalid_provider_mode`. contract에 선언돼 있지만 현재 feature selectable route는 **UNWIRED**. OmniRoute 서버가 로컬에 존재하는지와 이 기능의 연결 유무는 별개다.
- secrets: HTTP profile은 `app.secretStorage`의 secret ID로 로드. CLI는 격리 cwd에서 인증된 도구 실행. secret 값은 읽거나 출력하지 않았다.
- model: runtime profile에서 결정. batch job frozen identity는 `prodigy-ai-runtime/runtime-resolved`로 저장되어 실제 model revision을 충분히 구분하지 못할 수 있다. 현 장애의 원인으로 확정하지는 않았다.
- request: compact chunk/evidence JSON + strict schema; selected canary만 전송 시도. 현 semantic extraction prompt는 query answer prompt가 아니다.
- timeout: consumer manifest는 batch/page_plan/article_compile 각각 120,000ms. legacy normalized timeout과 별도로 runtime이 manifest deadline을 실제 사용한다.
- retry/fallback: 자동 retry 0, fallback 0. 무단 provider hop을 하지 않는 것은 올바르다. 필요한 것은 명시적 retry의 연결이다.
- parsing: CLI `parseJson`/HTTP `structuredPayload`; HTTP non-2xx와 JSON parse 분기 존재. 이번 live는 ENOENT에서 종료되어 parser 성공/실패나 schema reject를 주장할 수 없다.
- runtime diagnostics는 최대 100개 메모리 ring이며 latency/input/schema hash/error_code를 보존한다. Hub 사용자 화면은 이 원인을 충분히 노출하지 않는다.

### Contract strictness

**필수 field가 이번 실패의 원인이라는 증거는 없다.** 실제 LLM 응답이 없다. `required_packet_fields`의 production 사용처도 확인되지 않았고 현재 COMPACT_SCHEMA는 status/results/chunk_key/outcome/items를 받는다.

| 구분 | 필드 / 판단 |
|---|---|
| 저장·승인 안전에 필요한 결합 | run_id, proposal_id, payload_hash, status/kind, citations+locators, human approval binding. 현재 revision 재검증도 유지. 모델이 hash/approval을 신뢰 있게 발급하는 것이 아니라 local deterministic assembly가 소유해야 함 |
| 검토에서 유용하지만 추출 응답의 liveness 전제일 필요는 없음 | confidence, contradictions/refusals(없으면 없음/미검사 명시), entity_links/theme_links/material_links, graph, lint. 명시적 충돌이나 거절을 삭제하자는 뜻이 아님 |
| “구현 없는데 mandatory여서 live 전체 reject” | 이번 실행에서 입증된 항목 없음. conformance helper의 graph/lint/contradictions 일부는 빈 값 또는 단순 패턴 결과이며 실제 탐지 성능의 증거가 아님 |

현재 actual validation은 exact quote/evidence key·허용 candidate·span·금지 write/approval field를 검증한다. 이를 유지한다. schema 단순화부터 시작하는 복구안은 기각한다.

## 5. BOTTLENECKS

- **P0 우선순위 1:** 현재 동일 provider executable 경로 복구 + 실제 canary 요청/응답 확인.
- **P0 우선순위 2:** blocked job에 대한 explicit retry 전달. 기존 캐시를 삭제하여 우회하지 않는다.
- **P0 우선순위 3:** all/pending 검색 오류와 source→query→proposal 연결. 앞의 두 개만 고쳐도 “질문하는 Wiki”는 아직 완성되지 않는다.
- **P1 우선순위 4:** 본문/locator 제공, 원인별 오류와 복구 행동, 실제 trusted corpus/지원 자료 수 분리.
- **P1 우선순위 5:** query/propose 경로에서 ingest cache/plan/preview writer를 실수로 호출하지 않도록 기존 operation boundary로 분리. 현재 Golden 생성은 preview/receipt를 실제 파일에 쓴다. 이를 read-only query로 재사용하면 계약 위반이다.
- P2: 한국어 조사/동의어와 stopword 처리, 제한된 link expansion, source 변경 이벤트, 재분석 비용 표시.
- P3: vector DB, graph visualization, community detection, multi-chat, deep research, 자동 background mutation. 이번 복구 제외.

### Retrieval quality — 실제 mounted UI 함수 호출

실행 명령·출력: [ui-queries.json](ui-queries.json), 실행기 [ui-queries.py](ui-queries.py). 별도 metadata probe [live-corpus.json](live-corpus.json). 테스트에서 답변 모델은 호출되지 않으므로 **hallucination은 평가 불가**이며, 결과가 없다는 사실을 “환각 없음”으로 과장하지 않는다.

| 질의 유형 / query | top result / source path | locator·relevance·citation / abstain |
|---|---|---|
| 정확 키워드 `Einstein` | `ZETA/LITERATURE/Einstein, A. (1931). On Imagination and Knowledge.md`, 1건 | 제목 relevance 높음. citations=[]; 파일 열기와 문장 locator citation은 다름 |
| 표현 변경/본문 `creative thinking` | 없음 | 실제 원문에 존재하는 표현인데 0건. semantic 회수 이전에 본문 색인 실패 |
| 연결 Knowledge `Imagination as a Foundation of Discovery` | `ZETA/LITERATURE/synthetic-alpha.md`, 총 4건 | target은 실제 source의 connections 값. top은 무관; substring OR/stopword 영향. 연결 탐색 아님; citations=[] |
| 충돌 자료 찾기 `imagination sufficient grounding` | Einstein source 1건 | 원문에 imagination 주장과 knowledge grounding 비판 공존. 제목 imagination 매치만으로 회수; 충돌 추출/조정은 수행 안 됨 |
| 관련 자료 없음 `ZXQ987_UNRELATED` | 없음 | empty 정상. LLM abstain/no_change packet 생성은 없음 |
| 모드 오류 `all: synthetic-alpha` | 오류 | invalid_scope_type. empty와 다름 |

충돌 시험은 독립된 서로 상충하는 두 출처를 가진 검증된 corpus가 아니며, source 내부 주장/비판 사례다. 따라서 cross-source contradiction detection의 성능은 **현재 비교 불가**다. 실제로 없던 충돌 자료를 만들어 성공으로 기록하지 않았다.

현재 규모에서는 metadata/선택 source 본문+keyword+제한적 link만으로 먼저 개선할 수 있다. vector가 없어서 실패한 것이 아니다.

### Human Review

실제 진입점은 존재한다. `activateDocumentPlanReview` → `openPreparedRiskReview` → risk review view로 연결되므로 “UI가 전혀 없음”은 오판이다. 다만 이번 canary는 provider부터 막혔고 query에서 이 화면으로 이어지지 않아 **Product Failure**다.

- create/update/merge/noop 차이, 변경 전/후, 위험, 충돌 상태, 출처 보기, 원문 열기 구현.
- approve/reject/수정 요청 구현. 현재 risk view에 독립된 defer action은 없고 hold/미선택 또는 검토 대기를 사용한다.
- legacy synthetic review demo의 6가지 kind 표시를 현재 live 검토의 증거로 계산하지 않았다.
- 현재 risk UI는 위험·provenance 중심이며 confidence를 일관된 explicit/inferred/low 설명으로 보여주는지는 확인되지 않았다.
- 현재 Golden “검토하기”는 generated preview workbench를 열고, 검토된 문서는 별도 reviewed store에 저장한다. 그것이 canonical Knowledge 승인 완료를 의미하지 않는다.
- 승인 이후 writer/revision 재검증 코드는 추적했으나 사용자 승인을 대신 눌러 검증하지 않았다.

### Observability

| 상태 | backend / 현재 사용자 경험 |
|---|---|
| corpus empty | empty/no_verified_answer 존재. UI는 “조건에 맞는 결과가 없습니다.”로 근거 부족/verified 0/필터 제외를 합침 |
| indexing / indexing failed | loading/error 존재; 실패 상세가 snapshot_failed/일반 재시도 문구로 축약 |
| provider unavailable | live transport_error→provider_unavailable→일반 실패. executable 경로 안내 없음 |
| provider rate limited | runtime rate_limited 존재; 현 batch mapper는 provider_unavailable로 손실 |
| schema invalid | runtime/validator 코드 존재; 현 mapper에서 일반 provider 실패로 손실 가능. live 미도달 |
| no relevant evidence | query empty. grounded answer abstain이 아님 |
| proposal generated / waiting review | review_ready, review/complete UI 있음. 현재 canary 미도달 |
| stale proposal | revision/hash mismatch, source_changed/stale, revision 요청 구현 |
| deterministic commit failed | 실패 outcome/compensation/recovery 구현. live 승인 미실행 |

### Performance

[canary-node.json](canary-node.json)의 Node cold module 포함 측정과 [live-corpus.json](live-corpus.json)의 Obsidian metadata probe를 구분한다. CLI subprocess wall time은 모델/retrieval latency가 아니다.

| 단계 | 관측 |
|---|---|
| corpus discovery + Explorer projection | 8.8ms, 실제 vault metadata 1,048 rows 재구성; production collector 전체 latency는 별도 확정 안 함 |
| Wiki snapshot projection | 2.7ms |
| canary scope / chunk projection | 1.62 / 1.42ms (Node, module load 포함) |
| lexical retrieval | metadata probe 0–0.4ms (브라우저 timer 해상도, 0은 무료라는 뜻 아님) |
| trusted finalized authority read | 246.6ms, 결과 0 |
| context assembly | provider wrapper total에 포함; 독립 계측 없음 |
| provider wrapper / actual runtime receipt | 14ms / 5ms, 실패. QA wrapper 10.5ms, 실패 |
| parsing / schema / proposal / new review handoff | upstream 중단으로 live 측정 불가 |

정상 end-to-end total은 없다. 현재 긴 대기의 원인이 model 성능이라는 증거도 없다. 측정 가능한 local 구간에서는 authority read가 가장 길며, 기능 liveness의 주 병목은 호출 누락과 실패 복구다. architecture complexity 자체가 성능 원인이라고 단정할 수 없다.

## 6. MARKET COMPARISON

비교는 “현재 사용자가 완료할 수 있는 일” 기준. 외부 제품은 공개 문서에 근거한 capability 비교이며, 사용성 A/B 실험이나 정확도 벤치마크가 아니다. 우세 판정은 특히 trust boundary의 설계상 차이와 실제 관측을 구분한다.

- [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki): source/wiki 검색, 선택적 vector, graph 확장, context assembly, citation, persistent queue 및 retry/progress를 공개한다. 자동 ingest 편의와 Prodigy의 승인 전 canonical 금지는 서로 다른 제품 선택이다.
- [Karpathy LLM Wiki 원문](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): 지속되는 Wiki를 ingest/query/lint로 축적하는 패턴이다. 서비스 SLA나 완성된 UI 제품으로 비교하지 않는다.
- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/index/overview/): 문서→entity/relation/community summary를 만드는 indexing pipeline. Prodigy보다 그래프 기반 종합 질의 토대는 넓지만 개인 Workspace review 제품은 아니다.
- [NotebookLM의 source-grounded 질문·citation 안내](https://blog.google/innovation-and-ai/products/notebooklm-beginner-tips/): 질문 후 관련 원문 구절로 돌아가는 사용자 흐름의 비교 기준. 자동으로 완벽한 사실 검증을 한다고 간주하지 않는다.
- ledger 참고 [SamurAIGPT/llm-wiki-agent](https://github.com/SamurAIGPT/llm-wiki-agent), [sdyckjq-lab/llm-wiki-skill](https://github.com/sdyckjq-lab/llm-wiki-skill): 지속 Wiki 운영과 agent workflow 참고. ledger의 AutoRAG/OWNtology 항목도 reference/conformance이며 설치된 runtime이 아니다.

표의 값은 모두 Prodigy 기준이다. `비교 불가`는 UI/운영 범위가 다르거나 이번에 판단 근거가 부족하다는 뜻이다.

| 사용자 가치 | nashsu | Karpathy 패턴 | GraphRAG | NotebookLM류 | ledger Wiki agent류 |
|---|---|---|---|---|---|
| A 자료 입력 마찰 | Prodigy 열세 | 현재 비교 불가 | 현재 비교 불가 | Prodigy 열세 | Prodigy 열세 |
| B 처리 상태 가시성 | Prodigy 열세 | 현재 비교 불가 | 현재 비교 불가 | Prodigy 열세 | 현재 비교 불가 |
| C 검색 체감 | Prodigy 열세 | Prodigy 열세 | Prodigy 열세 | Prodigy 열세 | Prodigy 열세 |
| D citation 신뢰성(지금 이용 가능성) | Prodigy 열세 | 현재 비교 불가 | 현재 비교 불가 | Prodigy 열세 | 현재 비교 불가 |
| E 신규 자료/기존 지식 통합 | Prodigy 열세 | Prodigy 열세 | Prodigy 열세 | 현재 비교 불가 | Prodigy 열세 |
| F contradiction 처리 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 |
| G canonical 쓰기 전 human review 경계 | Prodigy 우세(설계) | Prodigy 우세(설계) | 현재 비교 불가 | 현재 비교 불가 | Prodigy 우세(설계) |
| H incremental update 사용자 완료 | Prodigy 열세 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 |
| I failure recovery | Prodigy 열세 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 |
| J 장기 가치 축적 | Prodigy 열세(현재 차단) | Prodigy 열세 | 현재 비교 불가 | Prodigy 열세 | Prodigy 열세 |
| K Workspace 판단 연결 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 | 현재 비교 불가 |

Prodigy에는 Workspace/판단 연결 코드가 있지만 이번 canary는 활용까지 도달하지 못했다. 따라서 K를 단순히 아키텍처 그림만으로 우세라고 하지 않는다.

### 기능 격차 판단

난이도/유지보수는 현재 repo 기준 상대 추정이다. “지금 구현”은 신규 체계가 아니라 기존 경로 복구를 뜻한다.

| 기능 | 현재 존재 | 지금 문제를 해결하는가 | 난이도 / 유지보수 | 결정 |
|---|---|---|---|---|
| persistent ingest queue | 있음: batch job/pack/cache, 49 jobs | 새 queue보다 blocked 복구가 필요 | 낮음 / 낮음(수선) | 지금 구현: 기존 retry 연결 |
| incremental hashing/cache | 있음: chunk/request/content hash | 재호출 절약; 이번 ENOENT는 해결 못 함 | 낮음 / 중간 | 지금은 유지·동일 canary 재검증 |
| source watcher | create만; 수정 범위 점검 UI 있음 | source 변경 가시성 개선 | 중간 / 중간 | 나중에 modify/rename/delete |
| retry queue | durable blocked+명시 retry 소유권 존재 | 직접 해결 | 낮음~중간 / 낮음 | 지금 구현: intent 전달, 자동 retry 추가 아님 |
| hybrid keyword/vector | keyword 있음, vector는 hint hook 수준 | 본문 누락부터 해결해야 함 | 높음 / 높음 | vector 나중에 |
| graph traversal | canonical relation/hints 코드; query UNWIRED | 연결 질의에 일부 도움 | 중간 / 중간 | 본문 검색 후 제한적 적용 |
| graph visualization | 현재 query 제품에 확인 못 함 | 현재 장애 해결 안 됨 | 중간 / 중간 | 이번 범위 불필요 |
| community detection | 구현 확인 못 함 | 28-row browse에 이득 입증 없음 | 높음 / 높음 | 불필요(현재) |
| knowledge gap detection | quality gap/lint/maintenance 모듈; production triggers=[] | 전역 지식 gap 탐지와 다름 | 중간 / 높음 | 나중에 |
| contradiction detection | conflicts/dispute/gates 있음 | 충돌을 보여주는 계약은 가치; 자동 탐지 live 미검증 | 중간 / 높음 | 지금은 보존, 탐지 확장은 나중에 |
| multi-conversation chat | 연결된 Wiki chat 없음 | 먼저 단일 질문 완주 필요 | 중간 / 중간 | 나중에 |
| web clipper | Wiki 전용 연결 확인 못 함 | intake 편의만 개선 | 중간 / 중간 | 나중에 |
| PDF/Office/ePub ingest | current selector `.md`; 범용 extractor live 미확인 | 현재 Markdown canary 장애와 무관 | 높음 / 높음 | 나중에 |
| API | 내부 JS API 존재; Wiki service endpoint 없음 | 새 endpoint는 해결 아님 | 중간 / 중간 | 신규 API 불필요 |
| MCP | skill/contract 있음; 실제 Wiki MCP endpoint 확인 못 함 | UI flow부터 복구 | 중간 / 중간 | 나중에 |
| deep research | Wiki query 경로에 없음 | 외부 자료 확대는 현 병목과 무관 | 높음 / 높음 | 나중에 |
| background maintenance | follower/scan 있음, Hub empty triggers/records | 현재 실질 탐지 효과 제한 | 중간 / 높음 | 자동 mutation 추가 불필요 |

## 7. WHAT PRODIGY MUST KEEP

- source는 untrusted data, provider/model/도구/승인 권한을 넓힐 수 없음.
- proposal과 approved canonical을 분리하고 human 승인 후 deterministic writer가 payload/revision/authority를 재검증하는 경계.
- quote anchor, source hash, plan/packet binding, stale rejection, 재시도 소유권과 중복 호출 억제.
- supporting Literature / reviewed Wiki / verified Knowledge 구분. verified 0을 해결하려고 기존 문서를 자동 승인하면 안 됨.
- 키워드/metadata/local Markdown의 단순성. vector/새 Framework/Generic Engine 없이 먼저 복구 가능.

이것들은 보존할 강점이며 현재 사용자 flow가 작동한다는 증거를 대신하지 않는다.

## 8. WHAT PRODIGY IS MISSING

사용자는 “내 자료가 왜 검색되지 않는지”, “AI가 연결돼 있는데 왜 바로 실패하는지”, “이어서 하기를 눌러도 왜 같은 상태인지”를 알 수 없다. source 목록, 검색 목록, preview/plan, reviewed index, canonical review가 여러 화면/상태로 나뉘어 같은 source의 완료 여부를 추적하기 어렵다.

핵심 결손은 새로운 그래프 화면이 아니라 **선택한 source에 질문 → 원문 구절로 돌아갈 수 있는 답변 → 그 답변으로 만든 proposal을 검토**하는 한 경로다. 아무 결과 없음, 근거 없음, 검색 corpus 제외, 검증된 지식 없음, 실행 파일 없음이 구분되어야 한다.

## 9. MINIMUM RECOVERY PLAN

모든 단계를 한 번에 구현했다고 선언하지 않는다. 다음 순서가 최소 복구 범위다.

1. **동일 provider device route 수선.** `prodigy-ai-runtime.api.setDeviceRoute("antigravity", {executable:"/Users/prodigykim/.local/bin/agy"})`는 후보 수정이다. 적용 전 현재 route의 다른 필드를 보존해야 한다. 공식 setDeviceRoute는 이 profile의 certification/grants를 무효화하고 runtime을 rebuild한다 (`main.js:1030,2936`). 이후 공식 certifyProfile, 해당 consumer의 명시적 전송 동의가 필요하다. 공용 profile이므로 이번 audit에서 전역 설정을 고치거나 인증을 우회하지 않았다. 절대 경로로 실행 가능하다는 것만 검증했으며 그 model/API의 다음 응답 성공은 미검증이다.
2. **Hub retry wiring.** `HUB/50 Knowledge.md::dispatchLifecycleAction/runGoldenWiki/getGoldenWikiOrchestrator.runPlan`와 `V/llmwiki-golden-wiki-orchestrator.js::run`에서 explicit retry/intent ID를 기존 `runDocumentPlan→runCanonicalBatch→claimExplicitRetry`에 보존. 사용자 1회 retry→자식 job 최대 1개; 자동 loop 없음. stale source/outcome_unknown은 별도 처리.
3. **검색 mode 호환.** `V/llmwiki-wiki-read-adapter.js::browseRead/TYPE_BY_MODE`와 `V/llmwiki-query-readonly.js::TYPES/TYPE_MODE` 중 기존 pending 계약에 맞는 최소 수정. 이미 있는 fleeting_note를 임의로 canonical로 승격하거나 삭제하지 않는다. all/pending/maintenance/legacy 모드를 함께 확인.
4. **선택 source 본문을 읽기 전용 근거로 연결.** `HUB/50 Knowledge.md::collectSnapshot`/`V/llmwiki-wiki-read-service.js`에서 선택 source 범위와 hash를 읽고, `V/llmwiki-wiki-surface.js`의 질문 action을 기존 `llmwiki-ai-runtime-transport.js` proposal transport/기존 review controller로 연결. query는 in-memory payload만 사용. ingest `runGoldenWiki`를 호출하여 cache/preview를 쓰는 우회는 금지. 기존 proposal claim/citation 구조로 답변 표시; 새 canonical schema 없음.
5. **에러 보존.** `V/llmwiki-batch-provider-input.js::mapTransportError`와 `V/llmwiki-ui-recovery.js`, 필요 시 Hub failure envelope에 runtime code/failed stage/request ID/재시도 가능 조건을 보존. secret/stdout 원문 노출 없이 ENOENT, 한도, 인증, parser, schema를 구분.

예상 변경 표면은 공용 route 1개 + Hub + 기존 Views 4–6개 수준이며 구현/테스트 과정에서 확정해야 한다. “한 줄 수정으로 전체 복구”라고 약속할 수 없다. contract 문서/새 engine/새 Object/Vector DB는 복구 선행 조건이 아니다.

종료 조건: 기존 QA source를 선택하고 동일 질문으로 실제 LLM citation을 확인한 뒤, **canonical/source/persistent query writes=0**인 상태에서 새 proposal이 실제 Human Review 화면에 나타날 것. approve는 사용자가 결정한다.

## 10. CANARY RESULT

### Before

- INBOX QA source: eligibility/scope/chunk PASS; query corpus에서 제외되어 첫 FAIL.
- 보조 Literature canary synthetic-alpha: 제목 1건 검색, 본문 정확 문구 0, citation=[]; 전체 모드는 invalid_scope_type.
- 실제 provider: synthetic-alpha 14ms 및 동일 INBOX QA 10.5ms, 모두 provider_unavailable. native spawn ENOENT.
- proposal/validation/review: live downstream 미도달. mock 응답을 넣어 통과로 만들지 않음.
- 현재 기존 상가 run: planning/blocked/provider_calls=0. job 상태로 재현 원인을 연결.

### After

**운영 수정 없음 — 상태는 동일하게 실패.** “After PASS”는 없다. 읽기 전용 Node canary, mounted UI 모드 오류, 실제 provider 진단으로 failure proof를 남겼다. 관련 unit 18/18 PASS는 component regression 증거일 뿐 vertical 성공이 아니다.

### 재현 명령과 산출물

```sh
node artifacts/llmwiki-runtime-audit-20260909/canary.cjs
python3 artifacts/llmwiki-runtime-audit-20260909/ui-queries.py
node --test SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_query_readonly.js SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_skill_contract.js SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_wiki_ai_runtime_consumers.js SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_prodigy_wiki_controller.js
```

`canary.cjs`는 runtime 모듈에 실제 source bytes를 입력하며 결과 JSON 외에는 저장하지 않는다. metadata corpus probe는 실제 Obsidian metadata로 입력을 재구성한 검사이고, mounted UI 검사와 구분한다. `ui-queries.py`는 mounted surface 함수로 검색한 결과를 남긴다. 진단 명령 기록/원본 출력은 JSON/TXT에 보존했다. provider 호출용 command는 [provider-command.md](provider-command.md)에 기록한다.

| 구간 | 생성 artifact / retry / fallback / error |
|---|---|
| local eligibility→manifest→query | canary-node.json; retry=0/fallback=0; 검색 제외 assertion FAIL, exception 아님 |
| mounted UI query | ui-queries.json/ui-query.txt; provider=0, write=0; invalid_scope_type |
| real provider | provider-live.txt/canary-qa-provider.txt/provider-diagnostics.txt; 호출 각 1, 자동 retry=0/fallback=0; transport_error→provider_unavailable |
| native executable | provider-executable.txt; provider 호출 아님; spawnSync ENOENT, status=null |
| parser/validation/proposal/review | 새 provider payload/새 proposal artifact 없음; upstream 실패로 실행 못 함; latency/retry/fallback N/A |

## 11. FINAL PRODUCT RECOMMENDATION

**C. Fix runtime + retrieval.** 여기서 retrieval은 본문·source 범위·검색 mode·query caller를 바로잡는 일이며 Vector DB 도입이 아니다.

A(runtime only)는 executable/retry를 고쳐도 질문→답변 연결이 없어서 부족하다. B(runtime+ingest UX)도 source를 더 쉽게 넣는 것만으로 검색 제외/본문 미색인을 해결하지 못한다. D(재설계)는 필요하다는 증거가 없다.

현재는 일상적으로 질문하고 판단에 재사용하는 LLM Wiki로 신뢰하기 어렵다. 자료 정리 모듈과 승인 경계를 보존하고, 새 기능보다 **한 source의 인용 질문과 검토 도달**을 제품 완료 기준으로 삼아야 한다.
