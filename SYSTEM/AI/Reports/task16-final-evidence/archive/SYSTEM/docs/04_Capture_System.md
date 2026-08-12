# Prodigy OS Capture System v2.0

> "Capture는 빠르게, 구조화는 AI가, 결정은 사람이."

## Purpose

Capture는 정보를 즉시 저장하는 경로가 아니라, 검토 가능한 Object 변경 제안을 만드는 시작점이다. 사람은 최소한만 입력하고 AI는 구조화를 제안한다. 제안은 서로 분리된 두 번의 trusted user interaction, 즉 Review 시작과 그 뒤의 Confirm을 통과하기 전에는 canonical Object를 변경하지 않는다.

상세 원칙: [00_Constitution.md](00_Constitution.md) Article 3.

## Canonical executable states

외부에 보이는 정상 상태 순서는 정확히 다음 다섯 개다.

```text
capture_started -> ai_proposal -> human_review -> human_confirmed -> object_committed
```

상태별 terminal outcome은 정확히 `rejected`, `cancelled`, `no_change`, `stale`, `conflict`, `error`다. Lock, authorization, write request 같은 구현 메타데이터는 private이며 public state를 추가하지 않는다.

| Current | Event | Next | Attempted canonical mutations | Accepted committed writes |
|---|---|---|---:|---:|
| `capture_started` | `propose` | `ai_proposal` | 0 | 0 |
| `ai_proposal` | `begin_review` | `human_review` | 0 | 0 |
| `human_review` | `confirm` | `human_confirmed` | 0 | 0 |
| `human_confirmed` | `commit` after verified write | `object_committed` | 1 | 1 |
| `human_review` | `reject` | `rejected` | 0 | 0 |
| eligible pre-commit state | `cancel` | `cancelled` | 0 | 0 |
| `ai_proposal` or `human_review` | `mark_no_change` | `no_change` | 0 | 0 |
| eligible pre-commit state | `mark_stale` | `stale` | 0 | 0 |
| eligible pre-commit state | `mark_conflict` | `conflict` | 0 | 0 |
| eligible pre-commit state | `fail` | `error` | 0 | 0 |

A thrown canonical adapter, wrong returned path/revision, or post-write reread/hash mismatch is **1 attempted canonical mutation / 0 accepted committed writes**. Pre-confirm, Reject, Cancel, expiry, disposal, stale preflight, lock conflict, and mutation-boundary revision conflict are **0 attempted canonical mutations / 0 accepted committed writes**. There is no retry.

## Two separate trusted interactions

1. The first click or Enter/Space activation creates, binds, and renders the exact proposal. The visible state is `human_review`; authorization is absent and writes are zero.
2. A later click or Enter/Space activation on Confirm for the same live mount, session, proposal, target, payload, and revision may enter `human_confirmed` and invoke the writer once.
3. Reject and Cancel are separate trusted controls and terminal no-write outcomes.

No click, handler call, shortcut, AI response, prior selection, or test helper may perform Review and Confirm together. Review UI shows canonical target, exact stable payload summary/diff, proposal ID, internally computed payload SHA-256, current revision/conflict context, and Confirm/Reject/Cancel. It uses native focusable controls, preserves CJK payloads, wraps within responsive surfaces, and fails closed after mount disposal.

Review evidence binds review ID, human identity, timestamp, mount session, proposal ID, canonical target, internally computed payload SHA-256, and current revision. Confirmation references that exact review and repeats every binding. Caller-supplied actor identity and payload hash are forbidden.

## Writer contract

`SYSTEM/Views/capture-state-contract.js` owns the state enum, transition table, review/confirmation evidence, payload binding, and rollback identity. It hashes canonical JSON `{ target_path, payload }` internally.

`SYSTEM/Views/capture-action-runtime.js` accepts only genuine `isTrusted` click or Enter/Space events observed inside a live mount. Intents and confirmation capabilities expire, are single-use, and are invalid after disposal or across mount/session/proposal/target/payload boundaries.

`SYSTEM/Views/capture-authorized-writer.js` owns target locking and the single-use canonical request. The mutation adapter must consume that request and compare `expected_revision` immediately inside its mutation boundary. After one attempted mutation, the writer requires the returned path, a canonical reread, and matching SHA-256 bytes before issuing a payload-free receipt and `object_committed`.

Receipts preserve proposal, review, confirmation, authorization, revision, and rollback identifiers but never copy payload bodies or personal memo content.

## Covered proposal-required flows

The two-interaction contract applies to Home Object Creator writes, People creation, Workout program creation/import/replacement save, running import, nutrition import, Daily missing-People creation proposals, and Knowledge PARA Area/Documentation creation. `ParaObjectCreatorService.executeAction`, `createArea`, and `createDocumentation` cannot mutate without consuming the canonical write request at the mutation boundary.

Daily missing-People handoff creates only a proposal. Daily approval cannot create a person. A separate rendered People review and later Confirm are required.

## Intentional manual operational-write carve-outs

These user-authored operational controls are not AI/Capture proposals and remain intentionally direct:

- **People manual operations:** memo append/remove, interaction append/remove, explicit property/note edit, and explicit delete/trash.
- **Approved existing-person insight append:** Daily may append an already human-approved insight only to an existing People Object; a missing person remains a Capture proposal.
- **Workout manual operations and edits:** direct workout/session/run/nutrition logging and explicit operational edits performed by the user. Program/replacement and running/nutrition **imports** remain Capture proposals.

This carve-out does not permit AI auto-creation, missing-person creation, imports, or proposal-shaped calls to bypass Capture authority.

## Aside Capture and YAML

Aside may structure Auction Object proposals but never decides or writes them. It preserves source evidence and fills only verifiable template Properties; unknown values remain blank and are never inferred.

## Non-responsibilities

Capture AI is a **read-only Assistant**. It preserves a minimal `citation-bundle` and operates under **no automatic approval**: it does not make investment decisions, approve Knowledge, write Decision/Review, infer unknown values, or replace human confirmation.

## Principles

1. Capture starts within three seconds.
2. Structure is proposed without asking the user to choose Folder, Tag, Property, or Workflow.
3. Only an explicitly reviewed and separately confirmed proposal can become an Object.
4. Failed or rejected proposals preserve evidence and perform no accepted committed write.

**Version:** 2.0
**Status:** Active
**Supersedes:** Capture System v1.0
