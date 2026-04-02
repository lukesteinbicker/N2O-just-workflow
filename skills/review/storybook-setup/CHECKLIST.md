# Storybook Integration Checklist

> Step-by-step checklist for adding Storybook to an existing N2O project.

## Setup

- [ ] Install Storybook: `npx storybook@latest init`
- [ ] Install a11y addon: `npm install -D @storybook/addon-a11y`
- [ ] Copy config from `templates/storybook-setup/.storybook/` to your project's `.storybook/`
- [ ] Import your project's `globals.css` in `.storybook/preview.ts`
- [ ] Verify Storybook starts: `npx storybook dev --port 6006`

## Configuration

- [ ] Set `storybook_port` in `.claude/review-config.json` (default: 6006)
- [ ] Set `storybook_start_command` in `.claude/review-config.json`
- [ ] Add `storybook-static/` to `.gitignore`

## Story Generation

- [ ] Run `/detect-project` — section 9 auto-generates stories for your components
- [ ] Review generated stories for components needing manual mock data (Apollo, auth, etc.)
- [ ] Verify stories render: open Storybook and check each story

## Frontend Review Integration

Once Storybook is set up, `/frontend-review` automatically:
- Starts Storybook if not running (waits up to 60s)
- Discovers stories via the story index endpoint
- Takes component-level screenshot baselines
- Uses baselines for visual regression detection on subsequent runs

**Without Storybook**: The review agent still works — it skips component baselines and uses structural DOM assertions (element visibility, counts, layout, axe-core) instead. You lose component-level visual regression but keep all other checks.

## Troubleshooting

**Storybook won't start**: Check that your `.storybook/main.ts` framework is correct (e.g., `@storybook/nextjs` for Next.js projects).

**Stories fail to render**: Components using server-only imports (`"use server"`) or Next.js-specific features need the `@storybook/nextjs` framework adapter.

**Missing providers**: Components using Apollo, auth, or theme contexts need wrapper decorators. See `templates/storybook-setup/story-templates/complex.stories.tsx` for the pattern.
