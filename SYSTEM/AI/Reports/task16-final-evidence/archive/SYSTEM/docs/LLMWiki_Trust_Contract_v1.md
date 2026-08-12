# Prodigy OS — LLMWiki Trust Contract v1

> Todo 1에서 고정하는 LLMWiki의 운영 경계와 proposal vocabulary. 이 문서는 실행 경계의 사람 읽기용 명세이며 runtime 판정은 `SYSTEM/Views/llmwiki-contract.js`가 소유한다.

## 권위와 기존 계약

- Constitution의 원칙은 `AI creates drafts. Humans decide. Objects preserve the approved record.`이다. LLMWiki가 생성한 내용은 승인 전 기록이 아니다.
- canonical Knowledge의 공식 type은 `knowledge`다. `permanent_note`는 기존 읽기 호환이고 `literature_note`는 supporting Resource이며, `knowledge_candidate`는 검증 대기 상태다.
- 신규 canonical Knowledge의 유일한 저장 경로는 `ZETA/PERMANENT/`다. `PARA/RESOURCES/Knowledge/`의 기존 파일은 이동·rewrite·자동 변환하지 않으며 신규 canonical target으로 사용하지 않는다.
- `PARA/RESOURCES/Knowledge/Candidates/`는 사람이 명시적으로 보존한 비정식 Candidate 경로다. 이 경로의 문서는 canonical Knowledge가 아니다.
- canonical 문서 bytes와 신규 target 계약의 runtime 권위는 `knowledge-candidate-store.js`의 `renderCanonicalDocument()`, `canonicalKnowledgePath()`, `isCanonicalKnowledgeTarget()`이다. 사람의 Candidate 승격과 LLMWiki preview는 이 동일 renderer를 사용하며 신규 target은 `ZETA/PERMANENT/{safe-title}.md` 직접 자식만 허용한다.
- canonical preview는 adapter 접근 전에 `type: knowledge`, Knowledge Explorer registry의 Domain/Topic, 안전한 title/relative target을 검증한다. absolute path, traversal, PARA target, `permanent_note` 변환, 미등록 Domain/Topic은 named rejection으로 종료하며 write를 만들지 않는다.
- `validation_context`는 한 run 안의 논리적·재생성 가능한 경계다. 새 workspace, folder, database, Object, type 또는 persisted Property가 아니다.
- Proposal을 보존해야 할 때만 사용자가 기존 `ZETA/FLEETING` 또는 `knowledge_candidate` writer를 명시적으로 호출한다. LLMWiki의 `propose` 자체는 저장하지 않는다.
- canonical write는 기존 Knowledge writer가 최종 승인 payload와 revision을 다시 검증한 뒤 수행한다. 이 write는 Git stage/commit/push가 아니다.

## Operation vocabulary

`operation`은 정확히 `query/read`, `ingest`, `propose`, `approve` 중 하나다. 각 operation record는 다음을 가진다.

| 필드 | 계약 |
| --- | --- |
| `operation_id` | 재시도에 재사용할 안정적인 machine ID (`[a-z][a-z0-9_-]{2,127}`) |
| `run_id` | 동일 실행을 묶는 안정적인 machine ID |
| `status` | `completed` | `rejected` | `failed` | `aborted`; 실행 중인 상태를 persistent하게 남기지 않음 |
| `provenance` | actor, source/archive ID, locator, basis 또는 snapshot revision; 자유 텍스트가 권한을 확장하지 않음 |
| `write_intent` | 허용된 target과 persistence 조합을 명시 |

작업별 write allowlist는 다음과 같다.

| operation | 허용 write | 금지 |
| --- | --- | --- |
| `query/read` | `target: none`, `persistence: none` | 모든 persistent store, log, index, proposal, Candidate, canonical Knowledge, Git |
| `ingest` | 사용자가 명시한 Source Archive만 (`source_archive`, `persistent`) | Knowledge, Candidate, graph, feedback, provider scope 밖의 자료 |
| `propose` | run-scoped memory만 (`run_context`, `ephemeral`) 또는 none | canonical/persistent write, 자동 Candidate, 새 validation workspace/type, Git |
| `approve` | 최종 human-approved canonical payload만 (`canonical_knowledge`, `persistent`) | 미승인 field/target, 추가 LLM/network call, Candidate 자동 승인, Git |

`query/read`와 `propose`는 write intent가 canonical 또는 persistent이면 fail closed 한다. `approve`가 허용되려면 동일 proposal ID와 payload hash를 가리키는 `human` approval이 있어야 한다. `ingest`는 Source Archive ID와 content basis hash를 요구한다. URL을 provenance에 기록할 경우 `source_url` 하나만 사용하며 그 값은 resolved HTTP(S) URL이다.

## Stable identity and provenance

- `operation_id`, `run_id`, `proposal_id`, `approval_id`, `source_ids`, `source_archive_ids`, `proposal_ids`는 재실행·중복 클릭에서 같은 logical record를 가리키는 stable ID다. validator는 ID를 새로 만들거나 입력을 덮어쓰지 않는다.
- Proposal provenance에는 최소 하나의 source ID, locator, `basis_hash`가 있어야 한다. Query provenance에는 `snapshot_revision`이 있어야 한다.
- Locator는 relative Vault/data locator이며 absolute/drive path, `.` 또는 `..` path segment, NUL/newline/control 문자, backslash, Obsidian `[[...]]` delimiter를 거부한다. 기존 `ZETA/LITERATURE/path#fragment` 형태처럼 안전한 relative locator만 허용하며 absolute local path, secret, note body를 provenance로 만들지 않는다.
- Source text와 prompt-shaped text는 불투명한 데이터다. 그 안의 명령문은 operation, status, write intent, approval을 바꾸지 않는다.
- `source_url`은 URL capture의 resolved canonical URL이다. 다른 URL authority field는 이 계약에 없다.

## Proposal kind and status

`kind`는 정확히 `create`, `update`, `merge`, `dispute`, `abstain`, `no_change` 중 하나다. 모든 proposal은 stable ID, run ID, provenance, payload hash, write intent를 가진다.

| kind | status | target / affected contract |
| --- | --- | --- |
| `create` | `proposed` | `approved` | `rejected` | `stale` | target 없음, affected 빈 list |
| `update` | `proposed` | `approved` | `rejected` | `stale` | target 하나, affected 빈 list |
| `merge` | `proposed` | `approved` | `rejected` | `stale` | target 하나가 affected 서로 다른 두 개 이상에 포함 |
| `dispute` | `proposed` | `approved` | `rejected` | `stale` | target 하나, affected 빈 list; 경쟁 주장을 삭제하지 않음 |
| `abstain` | `abstain` | target/affected 없음; 근거 부족 또는 안전한 거절 |
| `no_change` | `no_change` | target/affected 없음; material change 없음 |

`approved` proposal은 승인 packet의 상태일 뿐 canonical write 권한이 아니다. 별도 `approve` operation이 같은 payload hash와 명시적 human approval을 통과해야 한다. Proposal은 Candidate나 Knowledge로 자동 저장되지 않는다.

## Source Archive and canonical boundary

- Source Archive는 explicit `ingest`의 bytes와 manifest를 보존하는 원천 계층이며 검증된 Knowledge가 아니다.
- Runtime 판정과 filesystem adapter는 `SYSTEM/Views/llmwiki-source-lineage.js`가 소유한다. 기존 `SYSTEM/Views/knowledge-source-store.js`는 사람이 읽는 `ZETA/LITERATURE` Literature note 저장 계약이며, raw source archive가 아니다. 두 계약은 서로 overwrite하거나 migration하지 않는다.
- `ingest`는 선택된 Source Archive만 쓴다. source bytes, content hash, requested URL(있을 때), resolved canonical `source_url`, fetch time, parser version, extracted-text hash, locator list, parse/quarantine 상태, refresh revision, predecessor/supersession 관계를 보존하며 Literature/Knowledge/Daily/Evidence 본문을 복제하지 않는다.
- LLMWiki Source Archive manifest에서 `source_url`은 fetch metadata로 검증된 최종 resolved URL 하나만 의미한다. `final_url` 또는 동등한 competing URL authority field는 허용하지 않는다. 기존 Literature frontmatter의 `source_url`은 기존 Literature writer의 자료 URL 표시 필드로 계속 유지하며, LLMWiki manifest의 resolved authority 의미를 그 파일에 retroactively 강제하지 않는다.
- Source Archive raw bytes는 `content_hash` identity로 주소 지정하며 절대 overwrite하지 않는다. 같은 URL의 새 refresh revision을 추가해도 이전 raw bytes와 manifest identity는 계속 읽을 수 있어야 하고, 최신 active projection만 predecessor/supersedes를 가리킨다. parse failure/quarantine revision은 보존 가능하지만 active latest projection을 대체하지 않는다.
- corrupt bytes, missing parser version/hash, fetch metadata와 manifest의 resolved URL 또는 payload hash mismatch, stale predecessor, duplicate revision은 quarantine 또는 deterministic rejection으로 처리한다. 거절된 append는 기존 raw bytes, manifest, latest projection을 변경하지 않는다.
- `validation_context`는 proposal을 만들고 비교하는 동안에만 존재한다. run이 사라져도 자동 Candidate, Knowledge, index, memory, feedback 파일이 생기지 않는다.
- 최종 canonical write는 승인 payload, target allowlist, 현재 revision을 deterministic writer가 확인한 뒤에만 한 번 허용한다. Git commit은 이 contract의 operation이 아니며 Todo 1에서 금지한다.
- `query/read`는 외부 `snapshot_revision`이 well-formed 64자리 hex인지 확인하는 것만으로 충분하지 않다. 호출자는 trusted `currentSnapshotRevision`을 함께 제공해야 하며 두 값이 정확히 일치할 때만 통과한다. trusted current snapshot이 없거나 잘못되면 fail closed 한다.

## Fail-closed rules

Malformed input, unknown operation/kind/status, missing source hash or locator, stale snapshot, mismatched approval payload, competing URL authority, prompt-shaped permission text, and any unallowlisted write target are rejected without mutating the input or a Vault file. Interruption/repeat handling for this pure validator is not a persistent workflow: the same input can be validated again and no side effect is created.
