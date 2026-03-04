# Ask Panel — Layer 3 Intelligence

> Chat panel for natural language queries against the N2O data platform, powered by assistant-ui + Claude + GraphQL.

| Field | Value |
|-------|-------|
| Status | Active |
| Owner | Wiley |
| Last Updated | 2026-03-03 |
| Depends On | `data-platform.md` (Layer 1 — complete) |
| Enables | Roadmap Goal 8 (Ubiquitous Access), natural language project queries |

---

## Current State

- Layer 1 (GraphQL API) is live: 65+ fields, 30+ views, 11 tables, Apollo Server on port 4000
- Dashboard (Next.js 16) is live on port 4001: Streams, Tasks, Activity, Health pages
- Sidebar is icon-only (w-12), no expand/collapse mechanism
- No chat UI exists, no `@assistant-ui/react` installed, no API routes in dashboard
- No LLM integration backend

## Vision

An admin-only "Ask N2O" chat panel (Ramp-style) accessible from any dashboard page. Admins type natural language questions about their developer data, Claude generates GraphQL queries against the existing API, and answers stream back with optional data tables and charts.

## Design

### UX (reference: `ask-panel-ux-reference.md`)

- **Trigger**: "Ask N2O" button at bottom-left of sidebar (sparkle icon)
- **Panel**: right-side, ~350px, slides in. Sidebar stays icon-only (already collapsed)
- **Header**: "New chat" label, expand-to-fullscreen, close (X)
- **Body**: greeting + suggested questions, then conversation thread
- **Input**: "Ask a question" placeholder, send icon
- **Layout**: panel is layout-level (accessible from every page, persists across navigation)
- **Theme**: Palantir dark, consistent with existing dashboard

### Architecture

```
User question
  → dashboard API route (POST /api/ask)
    → Claude API (streaming, with GraphQL schema as system context)
      → Claude calls query_ontology tool
        → API route executes GraphQL against localhost:4000
        → Returns result to Claude
      → Claude calls generate_chart tool (optional)
        → Returns chart spec to frontend
    → Streams response back to assistant-ui
  → assistant-ui renders: text (markdown), data tables, charts
```

### Key Technical Decisions

1. **Chat backend as Next.js API route** (not a separate service) — lives in the dashboard, shares the environment
2. **assistant-ui LocalRuntime** — manages chat state client-side, streams from API route
3. **GraphQL schema as LLM context** — curated summary with query names, descriptions, and example queries (not raw introspection JSON)
4. **Tool execution server-side** — API route executes GraphQL queries on behalf of Claude, not the client
5. **Generative UI** — tool call results (data tables, charts) rendered as React components inline in the chat via assistant-ui's makeAssistantToolUI

## Out of Scope

- Layer 2 (Rules Engine) integration — adds `execute_rule` tool later
- Dynamic dashboard generation — stretch goal for v2
- Multi-user auth — admin-only, single-user for now
- Conversation persistence — in-memory only for v1

## Implementation Plan

| # | Task | Done When |
|---|------|-----------|
| 1 | Chat backend: API route + schema context + query_ontology tool | API route accepts question, streams Claude response, executes GraphQL queries |
| 2 | Chat frontend: assistant-ui panel + sidebar trigger + Generative UI | Panel opens/closes from sidebar, streams messages, renders tool results inline |
| 3 | Polish: suggested questions, generate_chart tool, date range filters | Suggested questions work, charts render inline, time-windowed queries work |

## Open Questions

1. ~~Chat UI library?~~ **Resolved**: assistant-ui (`@assistant-ui/react`)
2. ~~Separate route vs panel?~~ **Resolved**: Layout-level panel (not a route), accessible from every page
