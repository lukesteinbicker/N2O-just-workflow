# Phase 2: Flatten skills and simplify structure
> Consolidate `02-agents/`, `03-patterns/`, and `.claude/skills/design/` into a single `skills/` directory. Update the manifest-driven sync to match.

## How things work today

**This repo is a framework source, not a project.** It syncs into target projects via `n2o sync`.

**Skill source locations** (canonical definitions):
- `02-agents/{pm-agent,tdd-agent,bug-workflow,code-health,frontend-review,detect-project}/SKILL.md`
- `03-patterns/{react-best-practices,ux-heuristics}/SKILL.md`
- `.claude/skills/design/{18 micro-skills}/SKILL.md` (untracked, no source outside .claude)

**In this repo**, `.claude/skills/` has symlinks pointing back to `02-agents/` and `03-patterns/` so Claude Code can discover them during framework development.

**In target projects**, `n2o sync` **copies** skills from `02-agents/` and `03-patterns/` into the project's `.claude/skills/`. Projects don't use symlinks — they get full copies, protected by MD5 checksums so local customizations aren't overwritten.

**The sync flow**:
```
Framework repo                          Target project
02-agents/pm-agent/SKILL.md    ──copy──▸  .claude/skills/pm-agent/SKILL.md
03-patterns/react.../SKILL.md  ──copy──▸  .claude/skills/react.../SKILL.md
```

**`n2o-manifest.json`** declares `"02-agents/**"` and `"03-patterns/**"` as framework_files. The `n2o` script's `sync_directory()` function iterates these paths and copies them into `.claude/skills/` in the target project.

**`scripts/lint-skills.sh`** has hardcoded bash arrays referencing skill names and expected phases.

**`scripts/sync-skill-versions.sh`** scans `02-agents/` and `03-patterns/` for SKILL.md frontmatter to extract versions.

## What changes

1. **Move all skill sources to `skills/`** — `02-agents/*` and `03-patterns/*` become `skills/*`. The agent/pattern distinction adds no value; they're all skills with SKILL.md files.
2. **Move design micro-skills from `.claude/skills/design/` to `skills/design/`** — Give them a proper canonical source location instead of living only in `.claude/`.
3. **Update symlinks in `.claude/skills/`** — Point to `../../skills/` instead of `../../02-agents/` etc.
4. **Update `n2o-manifest.json`** — Change `"02-agents/**"` and `"03-patterns/**"` to `"skills/**"`.
5. **Update `n2o` script sync logic** — The `sync_directory()` calls reference `02-agents` and `03-patterns` paths. Change to `skills`.
6. **Update `lint-skills.sh` and `sync-skill-versions.sh`** — Update scan paths.
7. **Update `CLAUDE.md`** — Skill path references change.
8. **Consolidate `01-getting-started/`** — 6 overlapping docs → 1-2 files. This directory isn't synced to projects, it's just framework documentation.
9. **Delete `web-design-guidelines`** — Symlink already deleted, source dir empty. Remove all references.

## Impact on target projects

**None.** Target projects receive skills into `.claude/skills/` regardless of where they live in the framework repo. The destination path doesn't change — only the source path in the framework repo changes. The next `n2o sync` after this change will work identically; checksums will match because file contents haven't changed.

## Steps

1. Create `skills/` at repo root
2. Move each skill directory:
   - `02-agents/pm-agent/` → `skills/pm-agent/`
   - `02-agents/tdd-agent/` → `skills/tdd-agent/`
   - `02-agents/bug-workflow/` → `skills/bug-workflow/`
   - `02-agents/code-health/` → `skills/code-health/`
   - `02-agents/frontend-review/` → `skills/frontend-review/`
   - `02-agents/detect-project/` → `skills/detect-project/`
   - `03-patterns/react-best-practices/` → `skills/react-best-practices/`
   - `03-patterns/ux-heuristics/` → `skills/ux-heuristics/`
   - `.claude/skills/design/` → `skills/design/`
3. Delete `02-agents/`, `03-patterns/`
4. Recreate `.claude/skills/` symlinks pointing to `../../skills/*`
5. Update `n2o-manifest.json`:
   ```diff
   - "02-agents/**",
   - "03-patterns/**",
   + "skills/**",
   ```
6. Update `n2o` script — grep for `02-agents` and `03-patterns` in sync logic, replace with `skills`
7. Update `scripts/lint-skills.sh` — change scan paths
8. Update `scripts/sync-skill-versions.sh` — change scan paths
9. Update `CLAUDE.md` skill path references
10. Consolidate `01-getting-started/` into `docs/` (1-2 files)
11. Delete empty `03-patterns/web-design-guidelines/`, remove stale references

## Files

### New
```
skills/                        (new canonical skill source directory)
docs/                          (consolidated getting-started docs)
```

### Move
```
02-agents/*           → skills/*
03-patterns/*         → skills/*
.claude/skills/design → skills/design
```

### Delete
```
02-agents/                     (after move)
03-patterns/                   (after move)
01-getting-started/            (after consolidation)
.claude/skills/web-design-guidelines  (broken symlink)
03-patterns/web-design-guidelines/    (empty dir)
```

### Edit
```
n2o-manifest.json              (framework_files paths)
n2o                            (sync_directory paths)
scripts/lint-skills.sh         (scan paths)
scripts/sync-skill-versions.sh (scan paths)
CLAUDE.md                      (skill path references)
.claude/skills/                (recreate symlinks)
```

## Verification

- `ls skills/*/SKILL.md` lists all 8+ skills
- All `.claude/skills/` symlinks resolve: `find .claude/skills -type l -not -exec test -e {} \; -print` returns nothing
- `n2o sync` into a test project still copies skills correctly
- `scripts/lint-skills.sh` passes
- `scripts/sync-skill-versions.sh` extracts versions from new paths
- No references to `02-agents` or `03-patterns` remain outside git history and specs/done
