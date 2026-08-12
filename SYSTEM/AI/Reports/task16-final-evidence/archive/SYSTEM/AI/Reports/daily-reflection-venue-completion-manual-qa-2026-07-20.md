# Daily Reflection Venue and Completion Manual QA Matrix

Date: 2026-07-20 (Asia/Seoul)

| Scenario | Expected result | Evidence | Verdict |
| --- | --- | --- | --- |
| Observed 국민연금 컨벤션홀 wedding Evidence proposed as `venue` | Normalizes and remains handoff-eligible | `test_daily_reflection_candidate_policy.js`; direct runtime repro | PASS |
| General place proposed as `resource` | Normalizes as `resource`; is not venue-eligible | `test_daily_reflection_candidate_policy.js`; direct runtime repro | PASS |
| Generic Resource object creation | No automatic object creation path | `test_place_candidate_store.js` (8/8) and handoff policy | PASS |
| Unfinished current Daily | Primary `오늘 증거 검토·확정` is visible and opens existing proposal/Evidence flow | `test_journal_dashboard.js` | PASS |
| Evidence confirmation succeeds | Dashboard refreshes from 작성 중 to 완료 and hides the action | `test_journal_dashboard.js` | PASS |
| Evidence save fails | Dashboard remains 작성 중 and retains the action | `test_journal_dashboard.js` | PASS |
| Knowledge approval distinction | Completion action does not present Knowledge approval; later handoff remains separate | `test_journal_dashboard.js`; `test_daily_reflection_modal.js` | PASS |
| Live Obsidian desktop/narrow layout | Confirm labels, interaction, error notice, and no clipping after new modules load | Existing app pane was serving the prior already-open script; no write was attempted | NOT RUN |

## Module and Loader Checks

| Check | Expected result | Verdict |
| --- | --- | --- |
| Daily extraction modules | Policy, contract, links, handoff, and façade load in dependency order | PASS — browser-style Hub-order execution |
| Journal extraction modules | Modal, completion action, dashboard, and façade load in dependency order | PASS — browser-style Hub-order execution |
| Hub loader | New scripts load before `daily-reflection-ai.js` and `journal-view.js` | PASS — `HUB/70 Journal.md` review + load-order execution |
| Public façade APIs | Existing DailyReflectionAI/JournalView consumers continue to resolve | PASS — direct Daily tests and workspace consistency |

## Live QA prerequisite

Close any unsaved editor or proposal modal, then refresh or reopen `HUB/70 Journal.md` so DataviewJS reloads the new script order. Verify the unfinished current Daily at desktop and narrow widths, click the primary action only through the review flow, and cancel rather than confirm when using real personal data.

No real Daily, PARA, or ZETA content was written during this QA pass.
