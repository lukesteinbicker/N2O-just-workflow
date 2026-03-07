# Storybook Setup Recipe

> Quick setup guide for adding Storybook to a React + TypeScript project, with dark theme support and integration protocol for automated workflows.

## Quick Install

```bash
# Initialize Storybook (auto-detects framework)
npx storybook@latest init

# Install recommended addons
npm install -D @storybook/addon-essentials @storybook/addon-a11y
```

## Framework-Specific Notes

### Next.js (App Router)

Use the `@storybook/nextjs` framework adapter. This handles:
- Next.js image optimization (`next/image`)
- App Router navigation (`next/navigation`)
- CSS Modules and Tailwind CSS
- Server Components (renders as client in Storybook)

```ts
// .storybook/main.ts
const config: StorybookConfig = {
  framework: '@storybook/nextjs',
  // ...
};
```

### Vite / React

Use `@storybook/react-vite` instead. The story templates in this recipe work with both frameworks.

## Required Addons

| Addon | Purpose |
|-------|---------|
| `@storybook/addon-essentials` | Controls, docs, viewport, backgrounds, actions |
| `@storybook/addon-a11y` | Accessibility audit panel (axe-core) |

Optional but recommended:
| Addon | Purpose |
|-------|---------|
| `@storybook/addon-interactions` | Step-through play function debugging |
| `@storybook/addon-coverage` | Code coverage for stories |

## Importing Project Styles

To ensure components render with your project's styles, import your global stylesheet in `.storybook/preview.ts`:

```ts
// .storybook/preview.ts
import '../src/app/globals.css'; // Adjust path to your project's global CSS
```

This is critical for Tailwind CSS projects -- without it, components will render unstyled.

## Dark Theme Support

If your project uses a dark theme, see `.storybook/theme.ts` for configuring Storybook's UI to match. The preview decorator in `preview.ts` shows how to apply your project's dark mode class to the story canvas.

## Story Templates

See `story-templates/` for three patterns:

1. **component.stories.tsx** -- Basic component with args and variant coverage
2. **interactive.stories.tsx** -- Component with play functions for interaction testing
3. **complex.stories.tsx** -- Component needing providers (Apollo, theme, auth, etc.)

## StoryGenerator Interface

See `StoryGenerator.ts` for the programmatic interface used by `/detect-project` to auto-generate stories. v1 supports React/TypeScript; the interface is designed to extend to Vue and Svelte.

---

## Storybook Integration Protocol

Automated workflows (e.g., `/detect-project`, visual regression, review agents) follow this protocol to interact with a running Storybook instance.

### 1. Check if Storybook Is Running

```bash
curl -sf http://localhost:${STORYBOOK_PORT:-6006} > /dev/null 2>&1
```

If the request succeeds, Storybook is already running. Skip to step 3.

### 2. Start Storybook (If Not Running)

```bash
npx storybook dev --port ${STORYBOOK_PORT:-6006} --no-open &
```

Wait for Storybook to be ready (poll the health endpoint, up to 60 seconds):

```bash
timeout=60
elapsed=0
until curl -sf http://localhost:${STORYBOOK_PORT:-6006} > /dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ $elapsed -ge $timeout ]; then
    echo "WARNING: Storybook failed to start within ${timeout}s"
    break
  fi
done
```

The start command and port are configurable via `.claude/review-config.json`:

```json
{
  "storybook_port": 6006,
  "storybook_start_command": "npx storybook dev --port 6006 --no-open"
}
```

### 3. Discover Stories

Fetch the story index:

```bash
curl -s http://localhost:${STORYBOOK_PORT:-6006}/index.json
```

This returns a JSON manifest of all stories with their IDs, titles, and component paths.

### 4. Navigate and Screenshot

For each story, construct the iframe URL:

```
http://localhost:${STORYBOOK_PORT:-6006}/iframe.html?id=${STORY_ID}&viewMode=story
```

Use a headless browser (Playwright, Puppeteer) to navigate and capture screenshots.

### 5. Graceful Degradation

If Storybook fails to start or the story index is unavailable:

- **Log a warning** -- do not fail the entire workflow
- **Skip component baselines** -- visual regression for components is skipped
- **Continue with other checks** -- linting, type checking, and page-level screenshots still proceed
- **Report the gap** -- include "Storybook unavailable -- component baselines skipped" in the summary

This ensures workflows remain useful even when Storybook is not configured or has build errors.
