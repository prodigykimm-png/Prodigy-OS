---
type: knowledge_candidate
candidate_id:
status: saved
title: <% tp.file.title %>
statement:
reason:
source_type: daily_evidence
source_evidence_ids: []
source_objects: []
source_note:
application_trigger:
application_contexts: []
confidence: low
suggested_domain:
suggested_topics: []
connections: []
invalidation_conditions: []
approval_note:
promotion_target:
promoted_knowledge:
created: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
updated: <% tp.file.creation_date("YYYY-MM-DD[T]HH:mm") %>
---
<!-- 제텔카스텐 · 지식 구축 계층: 이 템플릿은 지식 성장·검증·보존 흐름에 속합니다. PARA 실행 계층과 구분됩니다. -->

# <% tp.file.title %>

## 지식 문장

-

## 제안 이유

-

## 출처

- Evidence 본문을 복사하지 않고 Evidence ID와 실제 Object 링크만 연결합니다.

## 출처 메모

- 직접 학습은 학습 맥락을, 학습 자료는 정확한 Literature Source 링크를 남깁니다. 자료 원문 전문은 복사하지 않습니다.

## 적용 조건

-

## 무효화 조건

- 이 지식이 더 이상 유효하지 않게 되는 조건을 사람이 작성합니다.

## 연결된 Region

- exact canonical Region wikilink(`[[PARA/RESOURCES/Auction Regions/<시도-시군구>]]`)만 connections에 저장합니다. 본문·좌표·모호한 지명은 Region link를 만들지 않습니다.

## 승인 메모

-
