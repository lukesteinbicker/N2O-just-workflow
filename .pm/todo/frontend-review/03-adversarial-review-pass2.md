# Adversarial Review (Second Pass): Frontend Review Sprint

**Date**: 2026-03-07
**Status**: All 15 decisions applied to spec

## Decisions

| Q | Theme | Decision | Summary |
|---|-------|----------|---------|
| 1 | Core Loop | A | First run report-only; subsequent runs auto-fix. Inline messaging. |
| 2 | Core Loop | A | Final iteration always runs all three agents. |
| 3 | Core Loop | A | Derive affected_agents from finding's source_agents + file-type rules. |
| 4 | Performance | A | Scope computed styles to semantic elements, sample repeated, cap 500. |
| 5 | Performance | A (modified) | 30 steps, priority ordering, 30-minute wall clock (not 15). |
| 6 | Performance | A | Track token usage per sub-agent per iteration, write to workflow_events. |
| 7 | Environment | A | Pluggable auth strategies: none, storage_state, script, dev_bypass. |
| 8 | Environment | A | Explicit Storybook protocol: check port, start, discover, screenshot. |
| 9 | Environment | A+B merged | Configurable data seeding: sequential (<12GB) or parallel (≥12GB), detected on setup. |
| 10 | Environment | B | Fresh browser.newContext() per burn-in run for full isolation. |
| 11 | Output | A | JSON report + markdown summary. PM agent reads JSON status field. |
| 12 | Output | A | Auto-updated last_verified date on suppressions. 90-day staleness warning. |
| 13 | Output | A | Generate draft flow, present for approval. Store in .claude/review-flows/. |
| 14 | New Gap | A | Git-based conflict detection. Skip conflicted files, report clearly. |
| 15 | Performance | A | Primary viewport full 5-pass. Secondaries get layout-only pass. Cross-viewport dedup. |
