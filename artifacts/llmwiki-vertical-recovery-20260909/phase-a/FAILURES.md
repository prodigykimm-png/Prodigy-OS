# 기존 49개 실패 영향 분류 — Phase A

수정하지 않았다. 49개 이름 모두 이번 targeted 재실행에서 다시 실패했다. 이전 baseline/final 상세는 48개가 시간·line 정규화 후 일치, 1개는 child process 종료 stack만 다르고 핵심 actual review_ready / expected outcome_unknown가 같다. 숫자 동일성만으로 판단하지 않았다.

1. **관련 — P2/계약 확인** · source/cache/citation
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_chunk_coverage.js:195:1`
   duplicate occurrences retain distinct instances and conservatively miss cache continuity
   같은 semantic text의 별도 instance cache를 기대 0 대신 2건 재사용. lookup은 instance_id+text_hash를 검사한다. question 경로는 이 cache를 쓰지 않음; 오인용으로 단정 불가.

2. **미확인 — P1 검증 공백** · provider/proposal/trust gate
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_evaluation_matrix.js:302:1`
   Given the complete Task20 corpus, When the production single-run gate executes, Then every owned Section 5 metric is green and later real-screen QA stays typed
   Task20 gate가 provider_schema_violation·deterministic_validation_bypassed로 실패. 다른 scenario도 연쇄 미도달; 실제 무단 쓰기 성공이 증명된 것은 아님. 유효 fixture 선행 조건과 각 안전 assertion을 복구해 독립 확인 필요.

3. **미확인 — P1 검증 공백** · provider/proposal/trust gate
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_evaluation_matrix.js:398:1`
   Given unchanged corpus oracles, When each named production scenario dependency breaks, Then that named scenario turns red
   Task20 gate가 provider_schema_violation·deterministic_validation_bypassed로 실패. 다른 scenario도 연쇄 미도달; 실제 무단 쓰기 성공이 증명된 것은 아님. 유효 fixture 선행 조건과 각 안전 assertion을 복구해 독립 확인 필요.

4. **미확인 — P1 검증 공백** · provider/proposal/trust gate
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_evaluation_matrix.js:438:1`
   Given a shape-valid false-merge service that reports an incorrect commit, When the gate evaluates it, Then false_merge and Task20 turn red
   Task20 gate가 provider_schema_violation·deterministic_validation_bypassed로 실패. 다른 scenario도 연쇄 미도달; 실제 무단 쓰기 성공이 증명된 것은 아님. 유효 fixture 선행 조건과 각 안전 assertion을 복구해 독립 확인 필요.

5. **미확인 — P1 검증 공백** · provider/proposal/trust gate
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_evaluation_matrix.js:475:1`
   Given altered independent persistence, When approved request bytes are written and read back, Then approval equality turns red
   Task20 gate가 provider_schema_violation·deterministic_validation_bypassed로 실패. 다른 scenario도 연쇄 미도달; 실제 무단 쓰기 성공이 증명된 것은 아님. 유효 fixture 선행 조건과 각 안전 assertion을 복구해 독립 확인 필요.

6. **미확인 — P1 검증 공백** · provider/proposal/trust gate
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_evaluation_matrix.js:492:1`
   Given false merge reports ok true with rejected status and no effects, When evaluated, Then misleading rejection is red
   Task20 gate가 provider_schema_violation·deterministic_validation_bypassed로 실패. 다른 scenario도 연쇄 미도달; 실제 무단 쓰기 성공이 증명된 것은 아님. 유효 fixture 선행 조건과 각 안전 assertion을 복구해 독립 확인 필요.

7. **미확인 — P1 검증 공백** · provider/proposal/trust gate
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_evaluation_matrix.js:504:1`
   Given false merge attempts one isolated write before rejecting, When evaluated, Then observed writer accounting makes it red
   Task20 gate가 provider_schema_violation·deterministic_validation_bypassed로 실패. 다른 scenario도 연쇄 미도달; 실제 무단 쓰기 성공이 증명된 것은 아님. 유효 fixture 선행 조건과 각 안전 assertion을 복구해 독립 확인 필요.

8. **관련 — P1 검증 공백** · consent/cancel/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_failure_modes.js:712:1`
   malformed, prompt-shaped, consent-mutated, selected-conflict, and non-create rows stay preview-only with exact zero effects
   unknown_request_metadata에서 선행 유효 요청 자체가 거절되어 악성 입력·late completion 본시험에 미도달. 오류를 오래된 테스트로 단정하지 않음.

9. **관련 — P1 검증 공백** · consent/cancel/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_failure_modes.js:974:1`
   cancelled runs reject late and repeated completions while misleading success fields remain inert
   unknown_request_metadata에서 선행 유효 요청 자체가 거절되어 악성 입력·late completion 본시험에 미도달. 오류를 오래된 테스트로 단정하지 않음.

10. **관련 — P1 검증 공백** · navigation/review state
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_hub_remount_persistence.js:1:1`
   SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_hub_remount_persistence.js
   Hub source regex assertion이 먼저 실패. 실제 remount 보존 시험까지 도달하지 못함. 상태 전이 결과 기준으로 검증해야 함.

11. **관련 — P1 검증 공백** · provider/parser/shared contract
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_operation_classifier.js:298:1`
   provider schema exposes the typed-operation contract and runs in a codec-free browser VM with strict UTF-8
   browser fixture selectProviderProfile(request_metadata.provider_key)가 거절됨. typed-operation parser 본시험 이전 실패. 현재 질문의 compact 경로와 legacy consumer 영향 분리 필요.

12. **관련 — P1 검증 공백** · canonical writer/citation
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_operation_contract.js:455:1`
   canonical assembly and verification reject raw operation proxies/getters with zero side effects and no JSON round trips
   canonical source_citations.0.evidence_quote가 unknown_source_citation_field로 거절됨. fail-closed이나 유효 fixture 이후 proxy/getter 안전 검증 공백.

13. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:138:1`
   Given selected sources and an explicit user action, When direct consent is issued and invoked, Then one bounded request is permitted without raw text in the artifact
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

14. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:171:1`
   Given consent for one provider key, When the provider key changes, Then consent is invalidated before transport
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

15. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:178:1`
   Given consent for one selected source, When another selected source is added, Then consent is invalidated before transport
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

16. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:188:1`
   Given consent for extracted text, When instruction-shaped extracted text changes, Then it is hashed as data and invalidates consent
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

17. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:196:1`
   Given consent for an outbound policy, When source text inclusion changes, Then consent is invalidated before transport
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

18. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:203:1`
   Given consent for one run, When replayed under another run, Then consent is invalidated before transport
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

19. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:210:1`
   Given credentials or cookies in the outbound policy, When consent or invocation is attempted, Then both fail before transport
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

20. **관련 — P1 검증 공백** · provider/consent/scope
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_outbound_consent.js:221:1`
   Given OmniRoute is configured but not selected for this run, When consent is issued, Then only an explicit run selection can authorize OmniRoute
   unknown_request_metadata 또는 consent_required가 기대 consent_mismatch/credentials_forbidden보다 앞서 반환. 모두 거절 결과이며 무단 전송 증거 아님. 현재 runtime consent와 feature legacy 계약 정합성 확인 필요.

21. **관련 — P1 검증 공백** · proposal/trust
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_productization_rebaseline.js:207:1`
   Baseline characterization: create-only trust invariants remain observable
   create-only baseline이 unknown_request_metadata에서 실패. 신뢰 경계 회귀 oracle가 유효 baseline을 갖지 못함.

22. **관련 — P2/계약 확인** · shared provider consumer
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_provider_selection.js:7:1`
   LLM Wiki inherits the global provider and rejects feature-specific overrides
   global provider key 기대 codex 대비 빈 값. 실제 Wiki는 runtime-selected antigravity로 동작; 설정 없는 테스트와 실제 consumer 경로를 구별해야 함.

23. **관련 — P1 검증 공백** · provider/Human Review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_review_surface.js:57:1`
   Given the corrected provider response, When the controller packet reaches the real review view, Then a claim, source locator, and explicit approval control are visible
   runtime_unavailable, provider 0. review 자체의 고장 증거는 아니며 실제 Canary review로 일부 보완.

24. **관련 — P1 검증 공백** · Hub/review/approve/retry/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_hub_production_integration.js:144:1`
   actual Hub startup reaches risk review and approve preserves Task13 outcome while writing once
   failed 대 consent_required 선행 불일치로 승인·정확한 쓰기·shadow-write observer 검증 미도달. 승인 동작은 Phase A 실환경에서 실행하지 않음.

25. **관련 — P1 검증 공백** · Hub/review/approve/retry/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_hub_production_integration.js:171:1`
   approved production Hub create records canonical audit and Git while compensation stays ineligible
   failed 대 consent_required 선행 불일치로 승인·정확한 쓰기·shadow-write observer 검증 미도달. 승인 동작은 Phase A 실환경에서 실행하지 않음.

26. **관련 — P1 검증 공백** · Hub/review/approve/retry/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_hub_production_integration.js:196:1`
   production Hub retries failed create Git exactly once without repeating canonical audit or refresh
   failed 대 consent_required 선행 불일치로 승인·정확한 쓰기·shadow-write observer 검증 미도달. 승인 동작은 Phase A 실환경에서 실행하지 않음.

27. **관련 — P1 검증 공백** · Hub/review/approve/retry/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_hub_production_integration.js:223:1`
   actual Hub revision and reject buttons route without action_unavailable and stale actions stay inert
   failed 대 consent_required 선행 불일치로 승인·정확한 쓰기·shadow-write observer 검증 미도달. 승인 동작은 Phase A 실환경에서 실행하지 않음.

28. **관련 — P1 검증 공백** · Hub/review/approve/retry/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_hub_production_integration.js:250:1`
   Hub app.vault observer catches an executor shadow write omitted from its receipt
   failed 대 consent_required 선행 불일치로 승인·정확한 쓰기·shadow-write observer 검증 미도달. 승인 동작은 Phase A 실환경에서 실행하지 않음.

29. **관련 — P1 검증 공백** · Hub/review/approve/retry/concurrency
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_risk_hub_production_integration.js:269:1`
   actual Hub batch button binds exact set, preserves one Task13 outcome, and writes both selected files
   failed 대 consent_required 선행 불일치로 승인·정확한 쓰기·shadow-write observer 검증 미도달. 승인 동작은 Phase A 실환경에서 실행하지 않음.

30. **무관 — 범위 밖** · auction shared consumer
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_scope_fidelity.js:455:1`
   Task 14 scope preserves the protected auction conflict, normal index, archive, and INBOX boundary
   protected auction 파일 고정 hash 불일치. 질문 파이프라인 실패로 연결된 증거 없음. 사용자 기존 변경을 되돌리지 않음.

31. **관련 — P1 가능/추가 분리 필요** · batch proposal/archive/stale
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js:137:1`
   grouping: Task9 proposals group by source with holds and drafts carried
   그룹 수 2/3, preselection 0/1, operation_id undefined, unresolved_holds로 archive 부적격. 실제 다중 operation 보존 문제 가능; 단일 질문은 다른 materializer 경로. 테스트가 틀렸다고 결론 내리지 않음.

32. **관련 — P1 가능/추가 분리 필요** · batch proposal/archive/stale
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js:151:1`
   selection matrix: only safe creates preselected; updates/merges/conflicts unselected
   그룹 수 2/3, preselection 0/1, operation_id undefined, unresolved_holds로 archive 부적격. 실제 다중 operation 보존 문제 가능; 단일 질문은 다른 materializer 경로. 테스트가 틀렸다고 결론 내리지 않음.

33. **관련 — P1 가능/추가 분리 필요** · batch proposal/archive/stale
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js:267:1`
   explicitly selected risky update flows through retained risk commit, not the custom writer
   그룹 수 2/3, preselection 0/1, operation_id undefined, unresolved_holds로 archive 부적격. 실제 다중 operation 보존 문제 가능; 단일 질문은 다른 materializer 경로. 테스트가 틀렸다고 결론 내리지 않음.

34. **관련 — P1 가능/추가 분리 필요** · batch proposal/archive/stale
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js:329:1`
   one stale operation does not block unrelated approved operations and stays reviewable
   그룹 수 2/3, preselection 0/1, operation_id undefined, unresolved_holds로 archive 부적격. 실제 다중 operation 보존 문제 가능; 단일 질문은 다른 materializer 경로. 테스트가 틀렸다고 결론 내리지 않음.

35. **관련 — P1 가능/추가 분리 필요** · batch proposal/archive/stale
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js:377:1`
   all-no-change, full-defer and partial unresolved sources never archive
   그룹 수 2/3, preselection 0/1, operation_id undefined, unresolved_holds로 archive 부적격. 실제 다중 operation 보존 문제 가능; 단일 질문은 다른 materializer 경로. 테스트가 틀렸다고 결론 내리지 않음.

36. **관련 — P1 가능/추가 분리 필요** · batch proposal/archive/stale
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js:546:1`
   full resolution then exact byte-identical move touching only expected paths
   그룹 수 2/3, preselection 0/1, operation_id undefined, unresolved_holds로 archive 부적격. 실제 다중 operation 보존 문제 가능; 단일 질문은 다른 materializer 경로. 테스트가 틀렸다고 결론 내리지 않음.

37. **관련 — P1 검증 공백** · ingest/source/controller
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task11_single_path_cutover.js:97:1`
   selected-source explicit run routes as a one-source batch through the same analyzer
   golden_wiki_unavailable. 해당 Hub fixture가 실제 analyzer에 도달하는지 선행 검증 필요.

38. **관련 — P1 관측 공백** · status/provider/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task12_lifecycle_surface.js:79:1`
   inherited provider/model/readiness and pack/review state are read-only and machine-addressable
   기대 provider/readiness DOM node가 null. 현재 live 전송 상태 오표시를 별도 실제 UI에서 확인.

39. **무관 — P2 표시** · workspace tab typography
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task12_lifecycle_surface.js:318:1`
   workspace tab separator suffixes are atomic semantic spans
   separator suffix DOM span 개수 0/1. source/provider/citation 안전 gate와 직접 관련 없음.

40. **관련 — P1 확인** · retry/job history
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task13_restart_recovery.js:50:1`
   true process A/B production harness proves restart, partial apply, stale recovery, and changed-identity retry
   실제 analyzer 성공 후 retry parent를 review_ready로 변경(llmwiki-batch-analyzer.js:463-465). model A outcome_unknown가 사라짐. 중복 intent의 provider 총 2회/자식 1개 assertion은 통과 후 parent 보존 assertion에서 실패.

41. **관련 — P1 확인** · retry/job history
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task13_restart_recovery.js:117:1`
   analyzer changed-identity retry links the exact-source parent and duplicate intent performs one provider request
   실제 analyzer 성공 후 retry parent를 review_ready로 변경(llmwiki-batch-analyzer.js:463-465). model A outcome_unknown가 사라짐. 중복 intent의 provider 총 2회/자식 1개 assertion은 통과 후 parent 보존 assertion에서 실패.

42. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:66:1`
   P1 unavailable production provider fails visibly and typed without a network or key assumption
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

43. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:77:1`
   P1 provider authority fields fail before review and permanent writes
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

44. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:85:1`
   P1 canonical batch provider reaches review without controller test options
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

45. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:94:1`
   P1 risk approval commits once through Task13 and persists exact follow-up truth
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

46. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:209:1`
   P1 Inbox privacy is derived locally and protected/People sources never call outbound
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

47. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:221:1`
   P1 failed analysis retry executes the provider again instead of replaying false completion
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

48. **관련 — P1 검증 공백** · provider/privacy/retry/review
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task15_production_audit.js:233:1`
   P1 retry lifecycle actions dispatch explicit retry runs without fallback
   runtime_unavailable 대 transport_unavailable 및 undefined operation 배열로 실패. runtime 준비 실패와 실제 privacy/authority/retry 동작을 분리할 유효 harness 필요.

49. **관련 — P1 검증 공백** · provider preflight/shared
   `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_unconfigured_provider_preflight.js:1:1`
   SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_unconfigured_provider_preflight.js
   preflight.configured 읽기에서 undefined TypeError (line44). 미설정 사용자 경험의 검증이 실행되지 않음.

