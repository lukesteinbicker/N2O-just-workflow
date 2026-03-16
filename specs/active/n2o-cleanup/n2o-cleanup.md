# Clean up N2O framework
> Remove bloat, flatten structure, rewrite CLI in Go, add OAuth for remote DB.

## Reference

Read [workflow-reference.md](workflow-reference.md) first — it documents how the entire framework operates and what must not break.

## Phases

| Phase | Spec | What it does |
|-------|------|-------------|
| 1 | [n2o-cleanup-phase1-gutting.md](n2o-cleanup-phase1-gutting.md) | Delete Supabase, coordination scripts, test shell scripts, stale specs/docs |
| 2 | [n2o-cleanup-phase2-flatten.md](n2o-cleanup-phase2-flatten.md) | Flatten skills into single directory, clean up manifest and CLAUDE.md |
| 3 | [n2o-cleanup-phase3-go-cli.md](n2o-cleanup-phase3-go-cli.md) | Rewrite `n2o` as a Go CLI with Cobra + Charmbracelet |
| 4 | [n2o-cleanup-phase4-oauth.md](n2o-cleanup-phase4-oauth.md) | Add OAuth login + sync task data to/from external app API |
| 5 | [n2o-cleanup-phase5-collect.md](n2o-cleanup-phase5-collect.md) | `n2o task *` commands replace raw SQL + lazy transcript parsing |
| 6 | [n2o-cleanup-phase6-async.md](n2o-cleanup-phase6-async.md) | Async/overnight workflow: run agents on remote infra (PR review, sprint exec, code health) |

## Ordering

Phases 1-2 are independent cleanup — do them first so the Go rewrite starts from a clean base.
Phase 3 is the big one. Phase 4 layers on top of 3. Phase 5 layers on top of 3 (uses Go adapter interface) but is independent of 4.

Phase 6 depends on phases 3-5 (needs Go CLI, OAuth, and task commands as foundation).

**Phase 4 is split into two stages:**
- **4a (do now)**: OAuth login, event log, Postgres write path, CLI push/pull sync. This is everything the CLI needs.
- **4b (deferred)**: Tinybird setup, CDC pipeline, materialized views, dashboard endpoints. This is analytics-only — the CLI doesn't reference Tinybird directly. Build when the web app dashboard is ready.

## Decision: Why SQLite (not DuckDB)

DuckDB is 15-124x slower than SQLite for the CLI's dominant workload (single-row PK lookups and updates). It also blocks concurrent readers during writes and has higher startup/memory overhead. The analytics views run on hundreds of rows — SQLite handles them in single-digit milliseconds. DuckDB's columnar engine only shines at millions of rows.

## Decision: Why Go + Cobra

| Criteria | Go + Cobra | Rust + Clap | Node + Commander | Python + Typer | Deno + Cliffy |
|---|---|---|---|---|---|
| Single binary | 10-15 MB | 3-8 MB | No (or 50-80 MB hack) | No | 50-80 MB |
| Zero runtime deps | Yes | Yes | No (needs Node) | No (needs Python) | Yes |
| SQLite (no CGo) | modernc.org/sqlite | rusqlite (bundled) | better-sqlite3 (native) | built-in | WASM (new) |
| OAuth ecosystem | golang.org/x/oauth2 | oauth2 crate | mature | mature | thin |
| Terminal UX | Charmbracelet (best) | fragmented | chalk/ora | Rich | Cliffy |
| Dev speed | Medium | Slow | Fast | Fast | Medium |
| Startup | ~5ms | ~2ms | ~150ms | ~300ms | ~150ms |

Go wins on distribution (single binary, zero deps), terminal UX (Charmbracelet), and startup speed. The `gh` CLI uses this exact stack.
