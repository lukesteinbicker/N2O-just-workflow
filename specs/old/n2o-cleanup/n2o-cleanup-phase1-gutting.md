# Phase 1: Gut dead code and bloat
> Delete Supabase integration, coordination scripts, test shell scripts, and stale artifacts.

## What changes

1. **Delete Supabase integration** — client, schema, config references, 3 test files. This was a premature distributed coordination layer that isn't needed yet.
2. **Delete coordination scripts** — `scripts/coordination/` (10 scripts, 140 KB). Most depend on Supabase. The ones that don't (worktree, merge-queue) can be rebuilt later if needed.
3. **Delete test shell scripts** — `tests/` (23 files, ~500 KB). These are bash integration tests for a bash CLI that's being rewritten in Go. They become throwaway.
4. **Delete stale specs** — Archive `specs/done/` and remove active specs for deleted features (coordination, developer-twin, full-transcript-sync, data-platform, workflow-dashboard, etc.).
5. **Delete misc bloat** — `gitignore` (stale copy), `BENEFITS.md`, `.DS_Store` files, `CHANGELOG.md`.
6. **Clean migrations** — Remove migrations for deleted features (Supabase columns, transcript sync, SMS companion, developer time tracking).

## Steps

1. Delete `scripts/coordination/` directory entirely
2. Delete `scripts/linear-sync.sh`
   - **Keep** `scripts/collect-transcripts.sh` (absorbed in phase 5)
   - **Keep** `scripts/live-feed-hook.sh` (absorbed in phase 5)
3. Delete `tests/` directory entirely
4. Delete Supabase references from `n2o` script (init prompts, config loading)
5. Move `specs/done/` contents to a git tag or just delete — they're in git history
6. Review `specs/active/` — delete specs for features we just removed
7. Delete `gitignore`, `BENEFITS.md`, `CHANGELOG.md`
8. Add `.DS_Store` to `.gitignore`
9. Remove migrations 009 (supabase-columns), 011 (drop-stale-tables), 012 (developer-time-tracking), 013 (sms-companion), and any others tied to deleted features
10. Remove Supabase config block from `.pm/config.json`

## Files

### Delete entirely
```
scripts/coordination/          (10 files, 140 KB)
scripts/linear-sync.sh         (10 KB)
tests/                         (23 files, ~500 KB)
specs/done/                    (archive)
gitignore                      (stale copy)
BENEFITS.md
CHANGELOG.md
```

### Edit
```
n2o                            (remove Supabase init prompts, config refs)
.pm/config.json                (remove supabase block)
.gitignore                     (add .DS_Store)
```

### Delete selectively
```
.pm/migrations/009-*           (supabase columns)
.pm/migrations/011-*           (drop stale tables)
.pm/migrations/012-*           (developer time tracking)
.pm/migrations/013-*           (sms companion)
specs/active/coordination.md
specs/active/developer-twin.md
specs/active/full-transcript-sync.md
specs/active/data-platform.md
specs/active/workflow-dashboard.md
specs/active/dashboard-vision.md
specs/active/observatory-v2.md
specs/active/subscription-management.md
```

## Verification

- `n2o` script still runs (setup, init, sync, check commands work)
- No references to "supabase" remain outside git history
- Repo size drops significantly
- `grep -r "supabase" .` returns nothing (excluding .git)
