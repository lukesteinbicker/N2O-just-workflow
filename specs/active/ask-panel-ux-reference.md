# Ask Panel — UX Reference

> Design reference for the N2O "Ask" chat panel. Based on Ramp's "Ask Ramp" pattern.

## Reference: Ramp

**Before (sidebar expanded):**
- Full sidebar with nav labels visible
- "Ask Ramp" button at the very bottom-left of the sidebar (sparkle icon + text)
- Main content fills the remaining width

**After (chat open):**
- Sidebar auto-collapses to icon-only (~50px) to make room
- Right-side chat panel slides in (~350px wide)
- Main content compresses slightly between collapsed sidebar and chat panel
- Chat panel header row: "New chat" dropdown, compose/new-chat icon, expand-to-fullscreen icon, close (X) icon
- Chat body: "Hi Wiley, how can I help?" greeting, followed by suggested question chips with icons
- Privacy/disclaimer note below suggestions
- Chat input at bottom: "Ask a question" placeholder, attachment icon, microphone icon, send arrow icon

**Close behavior:**
- Clicking X on the chat panel closes it
- Sidebar restores to expanded state
- Main content returns to full width

## N2O Adaptation

- Trigger: "Ask N2O" button at bottom-left of our existing sidebar (sparkle icon)
- Panel: right-side, ~350px, same collapse/expand behavior as Ramp
- Greeting: "What would you like to know?" with suggested questions based on current data:
  - "How's the current sprint?"
  - "Who has capacity?"
  - "Show me today's activity"
  - "Which tasks blew up?"
- Input: "Ask a question" with send icon (skip mic/attachment for v1)
- Header: "New chat" label, expand-to-fullscreen, close (X)
- The panel is a layout-level component — accessible from every page, not a route
- Panel state (open/closed) should persist across page navigation
- Palantir dark theme consistent with existing dashboard

## Key Implementation Notes

- Use `@assistant-ui/react` with `LocalRuntime` + `ChatModelAdapter`
- Panel component lives at `dashboard/src/components/ask-panel.tsx`
- Sidebar trigger in existing `dashboard/src/components/sidebar.tsx`
- Sidebar collapse/expand state managed via React context or Zustand
- assistant-ui's `Thread`, `ThreadMessages`, `Composer` components handle the chat UI
- Generative UI: tool call results (data tables, charts) render inline in the chat
