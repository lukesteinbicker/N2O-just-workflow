# Workflow Coach

**Status**: Draft
**Depends on**: Observability (Goal 7), Skill Quality (Goal 6)
**Related**: `specs/workflow-dashboard.md` (visualization), `specs/observability.md` (data collection)

---

## Vision

A system that observes how developers work and proactively coaches them toward better patterns. Not a dashboard you look at — a thing that looks at you and tells you what to change.

Examples of what it would say:
- "You're running 2 parallel sessions. Developers who run 6-8 on similar tasks complete sprints 3x faster."
- "Your last 5 sessions averaged 45k tokens each. That's 2x the median. Try breaking prompts into smaller, more specific requests."
- "You're spending 40% of tokens in the RED phase. The target is 15-20%. Your test specifications may be too vague."
- "You haven't used `/tdd-agent` this sprint. It reduces blow-up ratio by 30% on tasks like yours."
- "Your machine has 4GB free RAM. Claude Code performs better with 8GB+. Close browser tabs or switch to a lighter editor."
- "You're typing prompts manually. Wispr Flow users on this team complete tasks 25% faster."

The system should feel like a senior engineer who's been watching over your shoulder — not judgmental, just observant, with specific actionable advice.

---

## Three Layers

The coaching spans three layers, each requiring different instrumentation:

### Layer 1: Workflow Coaching (what we can do now)

Observes patterns in session transcripts and task data. All data already exists in SQLite.

**Signals available today:**
- Session count and parallelization (main sessions vs subagents)
- Token usage per session and per task
- Tool call patterns (Read/Edit/Bash frequency, ordering)
- Phase durations (time in RED vs GREEN vs REFACTOR)
- Skill invocations (which skills, how often, which were skipped)
- Estimation accuracy and blow-up ratios
- Sprint velocity trends
- Reversion frequency (status going backward)

**Example heuristics:**
- `sessions < 3 AND pending_tasks > 5` → "Try running more sessions in parallel"
- `avg_tokens_per_session > 2 * median` → "Your sessions are token-heavy. Try smaller, focused requests"
- `skill_invocations['tdd-agent'] == 0 AND task_type IN ('frontend', 'database')` → "Consider using /tdd-agent"
- `phase_duration['RED'] > 0.4 * total_duration` → "You're spending too long in RED. Write more specific test specs"
- `blow_up_ratio > 2.0 for 3+ tasks` → "Your estimates are consistently 2x off. Pad by 2x or decompose further"
- `reversions > 2 on same task` → "This task has bounced back twice. Consider blocking it and scoping smaller"

**Where it surfaces:** Session hook (already runs at startup). Print 1-2 tips, max. No wall of text.

### Layer 2: System/Environment Coaching (requires native app)

Observes machine state and development environment. Cannot be done from bash.

**Signals needed:**
- RAM usage and available memory
- CPU utilization
- Number of open applications/windows
- Active browser and tab count
- Terminal emulator in use (iTerm2 vs Terminal.app vs Warp vs integrated)
- Input method (keyboard typing speed patterns, voice input detection)
- Display setup (single monitor vs multi-monitor)
- Network latency to Claude API

**Why this matters:** Many performance bottlenecks aren't workflow issues — they're environment issues. A developer struggling with slow responses might just need to close Chrome, or their VPN is adding 200ms latency, or they're on a machine with 8GB RAM running 3 VS Code instances.

**Requires:** A lightweight native process that can read system metrics. Menubar app (Tauri or Electron).

### Layer 3: Tool Recommendation (requires knowledge base)

Suggests tools and techniques the developer might not know about. This is the "you should be using Wispr Flow" layer.

**Requires:**
- A curated catalog of tools, techniques, and configurations
- Mapping from observed friction patterns to tool recommendations
- Some way to know what the developer already uses (to avoid suggesting what they have)

**Examples:**
- Slow typing speed + long prompts → "Try Wispr Flow for voice-to-text prompts"
- Single Claude Code window → "Claude Code supports multiple concurrent sessions via separate terminal tabs"
- No `.claude/settings.json` customization → "You can configure model preferences and hooks in settings"
- Using `git add .` frequently → "tdd-agent enforces selective staging — reduces accidental commits"
- Large context windows with many files → "Try the Explore subagent for codebase navigation instead of reading files manually"

**This is the hardest layer** because the recommendation catalog must be manually curated and kept current. It's a content problem as much as an engineering problem.

---

## Architecture Considerations

### Option A: Embedded in N2O (Layer 1 only)

```
Session starts → n2o-session-hook.sh runs → queries SQLite → applies heuristics → prints tips
```

- **Pros:** Zero new infrastructure. Uses existing session hook. Ships in a day.
- **Cons:** Can only see workflow data. No system metrics. No persistent UI. Tips only appear at session start.
- **Best for:** Validating whether coaching changes behavior at all.

### Option B: Tauri Menubar App (All 3 layers)

```
┌──────────────────────────────────┐
│  Tauri App (menubar)             │
│                                  │
│  ┌────────────┐  ┌────────────┐ │
│  │ SQLite     │  │ System     │ │
│  │ Reader     │  │ Monitor    │ │
│  │ (Layer 1)  │  │ (Layer 2)  │ │
│  └─────┬──────┘  └─────┬──────┘ │
│        │               │        │
│        ▼               ▼        │
│  ┌─────────────────────────────┐│
│  │ Heuristic Engine            ││
│  │ Rules + optional LLM call   ││
│  └─────────────┬───────────────┘│
│                │                │
│                ▼                │
│  ┌─────────────────────────────┐│
│  │ Notification / UI           ││
│  │ - Menubar icon with badge   ││
│  │ - Click to expand tips      ││
│  │ - Settings panel            ││
│  └─────────────────────────────┘│
└──────────────────────────────────┘
```

- **Pros:** Full system access. Background monitoring. Rich UI for trends. ~5-10MB binary (Tauri).
- **Cons:** Separate install. Must be kept in sync with N2O data model. Cross-platform concerns.
- **Tech:** Rust backend (Tauri) + web frontend (React/Svelte). SQLite reader via rusqlite. System metrics via sysinfo crate.

### Option C: Electron App

Same as Option B but with Electron instead of Tauri.

- **Pros:** Faster to scaffold (all JS). Larger ecosystem.
- **Cons:** ~150MB binary. Higher memory footprint. Ironic to have a "you're running out of RAM" coach that itself uses 200MB.
- **Recommendation:** Prefer Tauri unless the team is JS-only.

### Recommended Path

**Start with Option A** (embedded, Layer 1 only). This validates:
1. Whether developers actually change behavior based on tips
2. Which heuristics produce useful vs annoying advice
3. What the right frequency/timing is for surfacing coaching

If Option A proves valuable, **build Option B** (Tauri app) to add Layers 2 and 3. The heuristic engine from Option A carries over — you're just adding new signal sources and a better UI.

---

## Intelligence: Rules vs LLM

### Rule-based (start here)

Hardcoded heuristics with thresholds. Predictable, fast, no token cost.

```
IF avg_tokens_per_session > 40000 AND session_count > 5:
  tip = "Your sessions are token-heavy. Try breaking work into smaller requests."
  confidence = 0.8
```

**Pros:** Instant. Free. Deterministic. Easy to debug and tune.
**Cons:** Can only detect patterns you've already thought of. Thresholds need tuning.

### LLM-analyzed (add later)

Feed a summary of recent session data to Claude and ask for insights.

```
"Here's a developer's last 10 sessions: [token counts, tool patterns, phase durations,
blow-up ratios]. What workflow improvements would you suggest?"
```

**Pros:** Can discover novel patterns. Handles nuance. Natural language output.
**Cons:** Costs tokens. Adds latency. Non-deterministic. Could hallucinate bad advice.

### Hybrid (recommended eventual state)

- **Rules** run every session startup (free, instant, reliable for known patterns)
- **LLM analysis** runs weekly or on-demand (`n2o coach --analyze`) for deeper insights
- Rules catch the obvious stuff; LLM catches the subtle stuff

---

## Data Gaps

What we collect today vs what we'd need:

| Signal | Have it? | Source | Notes |
|--------|----------|--------|-------|
| Session count / parallelization | Yes | transcripts table | Main sessions vs subagents |
| Token usage per session | Yes | transcripts table | input + output tokens |
| Tool call frequency | Yes | workflow_events table | Per tool, per session |
| Skill invocations | Partial | workflow_events (skill_name) | Captured but not surfaced well in stats |
| Phase durations | Yes | workflow_events (phase_entered) | Only for sessions that use skills |
| Estimation accuracy | Yes | tasks table | estimated_hours vs actual |
| Blow-up ratios | Yes | estimation_accuracy view | Per developer |
| Sprint velocity | Yes | sprint_velocity view | Per sprint |
| Reversion count | Yes | tasks table | reversions column, auto-incremented |
| RAM / CPU usage | No | Needs native app | sysinfo crate (Tauri) or os module (Electron) |
| Window/tab count | No | Needs native app | OS-specific APIs |
| Input method | No | Hard to detect | Could infer from typing patterns in transcripts |
| Network latency | No | Needs ping/timing | Could measure API response times from transcripts |
| Tool catalog (Layer 3) | No | Manual curation | Needs a knowledge base of tools + mapping rules |

---

## Relationship to Existing Specs

- **`workflow-dashboard.md`**: The dashboard is a visualization tool (you look at it). The coach is a proactive advisor (it talks to you). They share the same data but serve different purposes. The dashboard could eventually include a "recommendations" panel powered by the coach engine.

- **`observability.md`**: Observability is the data collection layer. The coach is a consumer of that data. Better observability → better coaching. The skill_usage view bug (grouping by tool_name instead of skill_name) should be fixed regardless — it affects both stats and coaching.

- **`skill-quality.md`**: Skill quality metrics feed directly into coaching. If a developer isn't using skills that would help them, or is using skills inefficiently (high token usage, low precision), the coach should surface that.

---

## Open Questions

1. **Frequency:** How often should tips appear? Every session? Only when something notable changes? Configurable?
2. **Dismissal:** Should tips be dismissable ("don't show me this again")? If so, where's that state stored?
3. **Personalization:** Same tips for everyone, or calibrated per developer based on their history?
4. **Opt-in vs opt-out:** Should coaching be on by default, or something developers explicitly enable?
5. **Measurement:** How do we know if coaching is working? Track behavior change after a tip is shown?
6. **Privacy:** System monitoring (RAM, open apps) is sensitive. How transparent should this be? Opt-in only?
7. **Knowledge base maintenance:** Who keeps the tool recommendation catalog current? How often does it need updating?
8. **Multi-project:** If a developer works on 3 N2O projects, do they get tips per-project or aggregated?

---

## Non-Goals (for now)

- Real-time interruptions during a session (too disruptive)
- Automated actions (coach should advise, not act)
- Team-level coaching (start with individual, add team later)
- Integration with external notification systems (Slack, email)
- Gamification (leaderboards, streaks, badges)
