# Phase 3: Rewrite `n2o` CLI in Go
> Replace the 2,883-line bash script AND all helper scripts with a single Go binary using Cobra + Charmbracelet.

## What changes

1. **New Go module** — `cmd/n2o/` with Cobra command structure mirroring existing subcommands.
2. **Drop `jq` dependency** — Go's `encoding/json` replaces all jq usage.
3. **Drop `sqlite3` CLI dependency** — `modernc.org/sqlite` (pure Go, no CGo) handles all DB ops.
4. **Better UX** — Charmbracelet Lip Gloss for styled output, Huh for interactive prompts during `n2o setup`.
5. **Absorb all helper scripts** — Every surviving script becomes a subcommand or internal function. No more shelling out to bash. The `scripts/` directory is deleted from the framework.
6. **Delete the bash `n2o` script** — replaced entirely.

## Commands to port (from bash `n2o` script)

| Command | Complexity | What it does |
|---------|-----------|-------------|
| `setup` | Low | Write `~/.n2o/config.json`, prompt for framework path |
| `init` | Medium | Scaffold `.pm/`, `.claude/`, templates into a project |
| `sync` | High | Manifest-driven file sync with checksum protection |
| `pin` | Low | Write version pin to project config |
| `check` | Medium | Validate project health (tables, views, files, skill markers) |
| `stats` | Medium | Query SQLite for sprint/session/tool stats |
| `version` | Low | Show or bump version, tag git |
| `help` | Free | Cobra auto-generates this |

> **Removed**: `migrate` — auto-runs on DB open, no standalone command needed. `lint skills` and `lint files` — absorbed into `n2o check` and `/code-health` skill.

## Scripts to absorb

After phase 1 deletes Supabase/coordination/transcript scripts, these survive:

| Script | Becomes | Why |
|--------|---------|-----|
| `n2o-session-hook.sh` (12 KB) | Absorbed into CLI init | Context injection (developer name, concurrent sessions, git status) happens lazily on first `n2o` command per session. No dedicated hook command needed. |
| `n2o-config.sh` (700 B) | `internal/config/` | Exports config vars. Becomes a Go package — no script needed. |
| `lint-skills.sh` (7 KB) | Part of `n2o check` | Validates SKILL.md phase markers. Also available via `/code-health`. |
| `lint-file-size.sh` (6 KB) | Part of `n2o check` | File size enforcement. Also available via `/code-health`. |
| `sync-skill-versions.sh` (2 KB) | Part of `n2o sync` | Extracts SKILL.md frontmatter versions into DB. Runs as a sync post-step. |
| `sync.sh` (1 KB) | Deleted | Thin wrapper around `n2o sync`. Redundant. |
| `git/commit-task.sh` (unknown) | `n2o commit` | Task-aware git commit with conventional format. Shells out to `git` but all logic is in Go. |

## Session hook removal

Today `.claude/settings.json` has 7 hooks calling bash scripts. After the Go rewrite, **no hooks are needed**. All context injection, transcript parsing, and event flushing happen lazily on first `n2o` command invocation per session.

`n2o init` and `n2o sync` should **remove** stale hook entries from `.claude/settings.json` rather than adding new ones.

## Steps

1. `go mod init github.com/lukes/n2o`
2. Set up Cobra root command + subcommands in `cmd/n2o/`
3. Port `setup` and `version` first (simplest, validates the stack)
4. Port `init` — template scaffolding, `.claude/skills/` symlink creation
5. Port `sync` — manifest parsing, checksum diffing, file copying, skill version extraction
6. Implement auto-migration on DB open (absorbs `migrate` script)
7. Port `check` (absorbs `lint-skills.sh` + `lint-file-size.sh`) and `stats`
8. Port `commit` — absorb `git/commit-task.sh` (shells out to `git` for actual operations)
9. Implement lazy init — first `n2o` call per session prints context (developer, sessions, git status)
11. Add shell completion generation (`n2o completion bash/zsh/fish`)
12. Add `Makefile` or `goreleaser` config for cross-platform builds
13. Delete the bash `n2o` script
14. Delete `scripts/` directory entirely
15. Update `n2o-manifest.json` — remove `"scripts/**"` from framework_files
16. Update `.claude/settings.json` template — remove all N2O hooks (no hooks needed)
17. Update README with install instructions (`go install` or binary download)

## Project structure

```
cmd/
  n2o/
    main.go
    cmd/
      root.go          (Cobra root, global flags)
      setup.go
      init.go
      sync.go
      pin.go
      check.go         (project health + lint: skill markers, file sizes)
      stats.go
      version.go
      commit.go        (← git/commit-task.sh)
internal/
  config/
    config.go          (read/write ~/.n2o/config.json, .pm/config.json — absorbs n2o-config.sh)
  manifest/
    manifest.go        (parse n2o-manifest.json, checksum logic)
  db/
    db.go              (SQLite connection, auto-migrate on open)
  sync/
    sync.go            (file sync engine, diff, copy — absorbs sync.sh + sync-skill-versions.sh)
  check/
    skills.go          (SKILL.md phase marker validation)
    filesize.go        (file size enforcement)
    health.go          (table/view/file existence checks)
  git/
    commit.go          (task-aware conventional commits)
  ui/
    ui.go              (Lip Gloss styles, spinners, prompts)
go.mod
go.sum
Makefile
```

## Impact on target projects

**Breaking change**: Projects currently have `scripts/` copied into them by `n2o sync`. After this change:
- `scripts/` is no longer synced (removed from `n2o-manifest.json` framework_files)
- `.claude/settings.json` hooks are removed entirely (no N2O hooks needed)
- Projects need `n2o` binary on PATH instead of relying on copied bash scripts

**Migration path**: `n2o sync` should detect old hook entries in `.claude/settings.json` and remove them. Old `scripts/` in projects can be left alone (they're project-owned copies) or cleaned up with `n2o check --fix`.

## Dependencies

```
github.com/spf13/cobra          — CLI framework
github.com/charmbracelet/lipgloss — Styled terminal output
github.com/charmbracelet/huh     — Interactive forms/prompts
modernc.org/sqlite               — Pure Go SQLite (no CGo)
```

## Files

### New
```
cmd/n2o/                (Go CLI source)
internal/               (Go internal packages)
go.mod, go.sum
Makefile
```

### Delete
```
n2o                     (bash script, 2883 lines)
scripts/                (entire directory — all absorbed into Go binary)
```

### Edit
```
n2o-manifest.json       (remove "scripts/**" from framework_files)
templates/              (update .claude/settings.json hook command)
README.md               (install instructions)
CLAUDE.md               (update CLI reference)
.gitignore              (add Go build artifacts)
```

## Verification

- `go build ./cmd/n2o/` produces a working binary
- All commands work: `n2o setup`, `init`, `sync`, `pin`, `check`, `stats`, `version`, `commit`
- `n2o check` validates skill markers, file sizes, table existence, and project health
- `n2o sync --dry-run` matches behavior of bash version
- Auto-migration runs on first DB access (no standalone migrate command)
- First `n2o` call in a session prints context info (developer, concurrent sessions, git status)
- No hooks in `.claude/settings.json` — `n2o sync` removes stale hook entries
- Binary size < 20 MB
- Cross-compile: `GOOS=linux go build` and `GOOS=darwin go build` both succeed
- No `scripts/` directory in newly initialized projects
- Existing projects: `n2o sync` auto-migrates hook format in `.claude/settings.json`
