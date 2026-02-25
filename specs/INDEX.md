# Spec Registry

> What exists, what's been built, and what hasn't.

## Status Legend

| Status | Meaning |
|--------|---------|
| **Done** | Fully implemented and shipped |
| **Partial** | Some implementation exists, more planned |
| **Active** | Living document, actively maintained |
| **Designed** | Spec complete, implementation not started |
| **Draft** | Spec in progress, design incomplete |
| **Not Started** | Identified, no design or implementation yet |

---

## All Specs

| Spec | Status | Goal | Dependencies | Description |
|------|--------|------|-------------|-------------|
| [n2o-roadmap.md](n2o-roadmap.md) | Active | — | — | Master roadmap: 8 goals, dependency map, implementation phases |
| [rollout-goals.md](rollout-goals.md) | Active | — | — | Four adoption goals: available, improveable, data-complete, accelerating |
| [metrics-definition.md](metrics-definition.md) | Active | 7 | observability | Eight leadership metrics bridging Output/Hour x Tool Leverage |
| [observability.md](observability.md) | Done | 7 | — | workflow_events table, n2o stats CLI, 11 analytics views |
| [skill-quality.md](skill-quality.md) | Partial | 6 | observability | Skill measurement framework: tokens, duration, blow-up factors |
| [coordination.md](coordination.md) | Partial | 4, 5 | — | Multi-agent coordination goals A-H: isolation, claiming, merging, routing |
| [data-platform.md](data-platform.md) | Draft | 7 | observability, workflow-dashboard, coordination | Three-layer platform: Ontology, Rules Engine, Intelligence |
| [rules-engine.md](rules-engine.md) | Draft | 6 | data-platform | Multi-signal reasoning: deterministic extractors → learned weights → LLM |
| [workflow-coach.md](workflow-coach.md) | Draft | 6 | observability, skill-quality | Proactive coaching: workflow, system/environment, tool recommendations |
| [observatory-v2.md](observatory-v2.md) | Draft | 7 | observability | RADAR maturity model, equation tree, measurement blind spots |
| [developer-twin.md](developer-twin.md) | Designed | 4 | coordination | Developer model: loaded context, skill profile, trajectory, availability |
| [parallel-playbook.md](parallel-playbook.md) | Designed | 5 | coordination, agent-teams | Automated orchestrator: 5 patterns, multi-tier execution, iterative re-planning |
| [agent-teams.md](agent-teams.md) | Not Started | 5 | coordination | Claude Code Agent Teams integration: auto-teaming, tmux, quality hooks |
| [workflow-dashboard.md](workflow-dashboard.md) | Not Started | 7, 8 | observability | Next.js dashboard: sprint progress, task board, velocity charts |
| [subscription-management.md](subscription-management.md) | Not Started | 8 | — | Admin CLI for per-developer Claude subscription tracking |

---

## By Execution Status

**Done**: observability
**Partial**: skill-quality, coordination
**Active**: n2o-roadmap, rollout-goals, metrics-definition
**Designed**: developer-twin, parallel-playbook
**Draft**: data-platform, rules-engine, workflow-coach, observatory-v2
**Not Started**: agent-teams, workflow-dashboard, subscription-management
