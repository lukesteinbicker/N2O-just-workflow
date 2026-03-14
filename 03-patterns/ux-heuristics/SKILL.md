---
name: ux-heuristics
version: "1.0.0"
description: "Consult this skill automatically when writing or reviewing UI code. Provides 28 principle-based UX heuristic rules organized by category. Assessed by the frontend review agent. Triggers: UX review, heuristics check, UI quality, layout review, accessibility check."
argument-hint: <file-or-pattern>
---

# UX Heuristics

28 principle-based rules for evaluating UI quality. Assessed by the frontend review agent during UX reviews.

## Two-Tier System

| Tier | Location | Contents |
|------|----------|----------|
| General | This file (`03-patterns/ux-heuristics/SKILL.md`) | Principle-based rules. No pixel values. Universal across projects. |
| Project-specific | `.claude/ui-heuristics.md` (populated by detect-project) | Concrete values (spacing scale, font sizes, breakpoints, color tokens). Overrides and extends the general tier. |

Rules in this file are intentionally principle-based. Project-specific pixel values, token names, and breakpoints belong in the project tier.

## Rules by Category

### Info Architecture

| ID | Severity | Principle |
|----|----------|-----------|
| `arch-01` | warning | Related items must be visually grouped. Grouping should reflect the user's mental model, not the data model. |
| `arch-02` | warning | Lists exceeding 8 items should be organized into named categories, tabs, or progressive disclosure. |
| `arch-03` | warning | Page should have clear visual hierarchy -- most important information is most prominent. |

### Density

| ID | Severity | Principle |
|----|----------|-----------|
| `density-01` | warning | Spacing between related items should be noticeably less than spacing between unrelated groups. |
| `density-02` | info | Data-dense views should minimize decorative whitespace without sacrificing readability. |
| `density-03` | info | Content-heavy views should maximize reading comfort -- narrower line width, more vertical spacing. |

### Accessibility

| ID | Severity | Principle |
|----|----------|-----------|
| `a11y-01` | critical | All interactive elements must have a visible focus indicator meeting WCAG 2.1 AA. |
| `a11y-02` | critical | Text contrast must meet WCAG 2.1 AA: >=4.5:1 normal text, >=3:1 large text/UI components. |
| `a11y-03` | critical | Information must not be conveyed by color alone -- pair with icon, text, pattern, or position. |
| `a11y-04` | warning | Every form input must have a visible, associated label. Placeholder is not a label. |
| `a11y-05` | critical | Modals and sheets must trap focus and be dismissible via Escape. |
| `a11y-06` | warning | Page must have logical heading hierarchy (h1 -> h2 -> h3, no skips). |

### Overflow

| ID | Severity | Principle |
|----|----------|-----------|
| `overflow-01` | critical | Page must not horizontal-scroll at its target viewport width. |
| `overflow-02` | warning | Unbounded content (lists, tables, text) must have truncation, pagination, or virtualization. |
| `overflow-03` | info | Long text must truncate with mechanism to see full text (tooltip, expand, detail view). |

### Empty States

| ID | Severity | Principle |
|----|----------|-----------|
| `empty-01` | warning | Zero-data must show descriptive message explaining what would appear and how to add data. |
| `empty-02` | warning | Loading must provide visual feedback. Prefer skeleton/shimmer over spinners for content areas. |
| `empty-03` | warning | Errors must show clear message with actionable recovery path. |

### Navigation

| ID | Severity | Principle |
|----|----------|-----------|
| `nav-01` | warning | Current location must be visually indicated in navigation. |
| `nav-02` | info | Primary views reachable within 2 clicks from any page. |
| `nav-03` | critical | Back button and browser history must work correctly. Client-side nav must update URL. |

### Consistency

| ID | Severity | Principle |
|----|----------|-----------|
| `consistency-01` | warning | Similar elements must be styled consistently across the application. |
| `consistency-02` | warning | Interaction patterns must be predictable -- similar actions work the same way everywhere. |

### Feedback

| ID | Severity | Principle |
|----|----------|-----------|
| `feedback-01` | warning | User actions must produce visible feedback within 100ms. |
| `feedback-02` | critical | Destructive actions must require confirmation. |
| `feedback-03` | info | Success states must be clearly communicated (not just absence of error). |

### Forms

| ID | Severity | Principle |
|----|----------|-----------|
| `forms-01` | warning | Validation errors must appear near the relevant field, not just form top. |
| `forms-02` | info | Required fields must be visually distinguished from optional. |
| `forms-03` | critical | Form submission must be possible via keyboard. |

## Severity Matrix

| Level | Meaning | Examples |
|-------|---------|----------|
| **critical** | Blocks functionality, violates WCAG A, crashes, data loss risk | Missing focus trap, no keyboard submit, broken back button, horizontal overflow, missing contrast, destructive action without confirmation |
| **warning** | Degrades usability, violates WCAG AA, misleading UI, poor info architecture | Missing labels, no empty state, inconsistent patterns, no loading feedback, poor grouping |
| **info** | Polish, best practice, WCAG AAA, minor inconsistency | Truncation UX, decorative spacing, success feedback, field distinction |

## Assessment Methods

| Method | Rules | Notes |
|--------|-------|-------|
| Programmatic (axe-core) | `a11y-01` through `a11y-06` | Checked via axe-core, confirmed by vision agent |
| Vision agent | All other rules | Programmatic agent provides supporting data (DOM structure, CSS values) |

## Usage Notes

- The frontend review agent runs these heuristics automatically during UX reviews.
- Findings are reported in `file:line rule-id severity — description` format.
- To suppress a finding, add `<!-- ux-ignore rule-id -->` above the relevant JSX or `// ux-ignore rule-id` in the component.
- Project-specific overrides in `.claude/ui-heuristics.md` take precedence over general rules when both apply.
- This skill complements `web-design-guidelines`, which provides web interface guidelines. This skill is the N2O-specific heuristics layer.
