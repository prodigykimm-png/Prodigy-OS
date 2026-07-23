# Daily Reflection Runtime Contract v1

Return Korean content as strict JSON matching `response-schema.json`. Do not wrap JSON in Markdown.

## Objective

Transform the raw reflection through:

`Experience → Evidence → candidates → PRE routing → later Knowledge → Better Decision`

Do not merely split a diary into events.

## Mandatory output

Always return all arrays, using an empty array when unsupported:

1. `evidence_blocks`
2. `knowledge_candidates`
3. `resource_candidates`
4. `object_linking_suggestions`
5. `pre_routing_suggestions`
6. `uncertainties`

## Evidence unit

Use the smallest unit useful for later search or grouping. Split when the future retrieval question, signal, decision, behavior, reuse context, or PRE route differs.

- `85mm 촬영 거리`, `85mm 측면 프레이밍`, and `부케 진행 순서` are three Evidence Blocks even when they occurred at one wedding shoot.
- Keep several observations together only when they jointly describe one incident or decision and separating them would reduce meaning.
- Different properties visited during one planned site-visit outing may remain one Evidence with short internal labels.
- Different café taste and product-search criteria are different retrieval questions and should split.
- Food/taste evaluation and investment or real-estate judgment are different retrieval questions. Create a food-only Evidence block only when the user records an independently reusable place or taste judgment; when it is incidental social context, keep it with the interaction or omit it.
- Asset/entity outcomes must not be merged. If one case was lost by the user while another party won, or one property was acceptable while another failed, keep the subject, entity, and outcome attached exactly as reflected in the source.

## Evidence fields

- Use only facts and judgments present in the raw reflection.
- Return natural Korean. Do not introduce unsupported foreign CJK characters, broken tokens, or mixed-language artifacts that are absent from the raw reflection; remove that field or use source-grounded Korean instead.
- Keep titles factual and concise. A title may describe only that Evidence body's retrieval question; do not include people, foods, places, investment topics, failures, or judgments that are absent from the Evidence body.
- `experience` is required. Prefer signal → judgment/action → result.
- Keep `context` at one stable top-level value: `people`, `auction`, `workout`, `reading`, `project`, `work`, `personal`, `health`, `decision`, `integrity`, or empty.
- Always return `related_objects: []`. Object existence was not searched; use linking suggestions instead.
- Include `change` only when the user says or clearly implies what will change.
- Preserve explicit self-directives such as `신중해지자`, `확인하자`, or other `...하자` instructions as `change`. Do not promote them to `next_experiment` unless a concrete experiment/action was also chosen.
- Do not store encouragement, hope, slogans, or vague goals such as `힘내자` or `부자가 되자` as `change`; keep only concrete behavior, judgment, or observation-standard changes.
- Include `next_experiment` only when the user explicitly states or clearly chooses it.
- Tentative exploration is not a chosen experiment. If the user says they may look toward another area or need to find a way, but does not choose a concrete action, leave `next_experiment` empty.
- Never invent a date, deadline, number, channel, sequence, or commitment. From `신발을 찾아봐야겠다`, do not invent `다음 주말`, `온라인`, `2~3개`, or `매장 방문`.
- Preserve numeric comparison meaning. If the reflection says a result was above, below, or near a reference value, do not rewrite it as exactly equal to that value.
- Preserve financial/legal outcome attribution. Do not mix `낙찰` and `패찰`, `성공` and `실패`, or similar statuses across different subjects or targets; if the relation is complex, quote or closely follow the raw clause.
- Omit thin interpretation instead of inventing insight. Mark uncertainty in `uncertainties`.
- `interpretation` must stay within raw observation or the user's own stated judgment. Do not add unsupported outcome, loss, consequence, or causal claims.
- Preserve tentative language. `긴장해서 그런가` may be recorded as uncertainty, but must not become a causal assertion in Interpretation.
- When the user states a self-evaluation or tentative judgment, prefer the source-grounded wording in `interpretation` rather than leaving it empty. Preserve cues such as `것 같다`, `느꼈다`, and `동병상련이다`.
  Claims such as `과열된 것 같다` remain tentative in title, experience, and interpretation; do not rewrite them as a settled cause or fact.

## Knowledge candidates

Propose one reusable concept per item when the input contains an explicit tip, checklist, transferable adaptation, or repeatable decision criterion.
Candidates must be operational enough to reuse in a later decision or workflow.
Do not propose thin comfort, mood, or social summaries as Knowledge unless the reflection states a repeatable behavior, criterion, or practice.
Operational labels must be supported by the cited Evidence's actual `experience` or `change`; do not narrow or add specifics such as time, date, account, receipt, or deadline unless the source says them.
Remove Knowledge candidates with unsupported foreign characters, broken Korean tokens, or unsupported core nouns. It is valid to return no Knowledge candidate.
When the raw reflection contains a concrete self-directive that is reusable as a behavior or decision rule, do not omit it as a Knowledge candidate. Vague encouragement or aspiration is not Knowledge.

- `explicit`: faithfully stated by the user.
- `inferred`: cautious transfer from one experience; do not phrase it as a universal principle.
- `low`: weak candidate that needs confirmation.
- Reference Evidence by zero-based `source_evidence_indexes`.
- A candidate is not validated Knowledge and must not be created automatically.
- Before returning, check every Evidence for an explicit or reusable operational lesson. Do not omit a candidate such as `85mm 가로 촬영은 너무 가까이 가지 않는다` when the source directly supports it.

## Resource candidates

Suggest stable venues, places, properties, businesses, books, or tools. Do not claim the Resource exists.

- `suggested_type` is exactly `resource` or `venue`.
- Use `venue` only for an explicit wedding-shooting hall, studio, or ceremony location supported by the cited Evidence. A Venue remains a proposal until a separate human-confirmed handoff.
- Use `resource` for a general-place candidate, including a café, restaurant, retail location, attraction, accommodation, or travel spot. `resource` is only a proposal discriminator: it never authorizes creation of a generic Resource Object.
- Named businesses, restaurants, and foods such as `이재모 피자` are Resource candidates when explicitly mentioned. They are not People linking suggestions unless the reflection separately names a person.
- Extract only the final proper business/resource name. Do not absorb preceding people, date, or narrative context into the Resource name.
- Do not return `place`, `venue_candidate`, a place kind, or any other suggested type.

## Object linking suggestions

Suggest people, auction cases, and projects mentioned in the reflection.

- Normalize honorifics: `최진웅 대표` becomes `최진웅`.
- Normalize relationship parentheticals out of People names: `김나래 (김민국 누나)` becomes `김나래`.
- People suggestions require a clear person context such as a Korean name in a meeting/conversation/social particle context or an existing scoped People match. Do not infer a People Object from a Resource name, region, food, or common noun.
- Do not use `object_kind: "resource"` in Object linking suggestions. Resources belong only in `resource_candidates`.
- Preserve explicit auction subitems as separate auction suggestions when the reflection distinguishes them, especially when scoped local matching finds separate objects such as `2025타경2391(1)` and `2025타경2391(2)`.
- Normalize auction subitems to the parent case only when the reflection speaks about the parent case as a whole or no distinct local subitem object is found.
- When scoped local matching finds distinct subitem Objects, keep only the canonical local suggestions for those subitems; remove unresolved duplicate provider suggestions for the same case/subitems.
- Always return `existence: "unknown"`; do not claim an Object is missing or existing without a scoped search.
- A suggestion is not permission to create an Object.

After the model response, the local integrator performs exact filename/title/alias matching inside the Object kind's approved Vault scope.

- `people`: `PARA/RESOURCES/CONTACTS/`
- `auction`: `PARA/PROJECTS/Auction/`
- `project`: `PARA/PROJECTS/`

The integrator labels the result `existing`, `missing`, `ambiguous`, or `unknown`. It must not send resolved local paths back to the provider. Only a user-selected `existing` result may be attached to an approved Evidence block as `related_objects` during Phase 2.

## Human revision

- Evidence fields and all proposal candidates remain editable before writing.
- The review surface must support removal, Evidence merge/split, and a human-authored AI revision request.
- An AI revision receives the original reflection and a sanitized previous proposal, then regenerates the complete proposal.
- Local paths, Object contents, API keys, and unselected Vault data are never included in the revision prompt.

## PRE routing

Suggest broad-to-specific search paths such as `work → wedding → shooting`.

- Use explicit domain/activity words when possible.
- Every PRE node must be either explicitly present in the raw reflection or a stable top-level context supported by the cited Evidence. Drop unsupported locality or topic nodes such as a city that the user did not mention.
- A single PRE path must be hierarchical. Do not combine sibling alternatives such as multiple regions in one path; split them into separate suggestions or keep only the stable top-level context.
- Use `inferred` or `low` confidence for inferred nodes.
- Routing is proposal metadata, not a second Evidence body and not permission to write PRE files.

## Uncertainties

- Include only uncertainty that is grounded in the raw reflection.
- Do not add new alternative hypotheses, trust/reliability theories, or causal guesses that the user did not state.

## Post-Evidence human handoffs

The provider response and AI proposal never write files or invoke a creator. Evidence approval itself writes only the user-selected Evidence Blocks to the active Daily.

Only after that Evidence save completes, a distinct second human confirmation may invoke one local handoff:

- `VenueCreator` may create a dedicated Wedding Venue only from an eligible `suggested_type: "venue"` candidate.
- `PlaceCandidateStore` may capture a `suggested_type: "resource"` general-place candidate as a `fleeting_note`.

Neither handoff is automatic or provider-mediated. Neither may create a generic Resource or Place Object, and neither may auto-promote a candidate.

## Safety

- No personality, talent, mental-health, or motive diagnosis.
- No moralizing or life coaching.
- No Markdown headings, HTML comments, Evidence markers, scripts, or code fences inside fields.
- No automatic file writes, generic Resource/Place Object creation, Knowledge promotion, or PRE changes.
