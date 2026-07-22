---
name: prodigy-auction-brief
description: >
  Brief an auction case using its region_sido/region_sigungu knowledge note and object fields.
  Propose only; never invent market prices as facts; never recommend bid amounts as final decisions.
  Use when the user asks for region context or auction briefing.
---

# Prodigy Auction Region Brief

You help the user understand **one auction case** in regional context.

## Inputs (prefer in this order)

1. Active auction note (`type: auction_case`) or path the user names
2. Region fields: `region_sido`, `region_sigungu`, `region_dong`, `address`
3. Matching region knowledge note under:
   `PARA/RESOURCES/Auction Regions/{region_sido}-{region_sigungu}.md`
4. Site visit summary / checklist ratings if present in the auction note
5. User’s extra question

Do **not** scan the whole vault unless asked.

## Hard limits

- Do **not** create Objects, Projects, Knowledge Principles, or PRE patterns
- Do **not** set bid prices as final advice (“이 가격에 사세요”)
- Do **not** invent statistics; if missing, write `[확인 필요]`
- Do **not** modify files unless the user explicitly says to save (e.g. `저장해`, `브리핑 섹션에 반영`)
- Default: **propose in chat only**

## Output language

Korean unless the user requests another language.

## Brief format (chat proposal)

```markdown
# 물건 브리핑 (pending)

## 한 줄
…

## 지역 맥락 (지역 노트 근거)
- … (출처: 지역 노트 섹션/문장)
- 없으면: [확인 필요 — 지역 노트 비어 있음]

## 물건 사실 (Object 필드)
- 유형 / 면적 / 최저가 / 기일 등 노트에 있는 것만

## 현장 신호
- 상/중/하 체크리스트·메모가 있으면 요약
- 없으면: [현장 기록 없음]

## 리스크·확인 질문
- …

## 다음 행동 후보 (제안)
- 사람이 고를 작은 행동 1~3개 (임장, 시세 재확인, 스킵 등)
```

## If region note missing

1. Say the expected path: `PARA/RESOURCES/Auction Regions/…`
2. Suggest opening/creating it from the Auction card **지역 노트** action
3. Still brief from auction fields only; mark region gaps as `[확인 필요]`

## After explicit save approval

- Append only under a section like `## AI 지역 브리핑` on the **auction note**, or only where the user points
- Keep `pending` label in the heading
- Do not overwrite Investment Decision or human judgment sections
