# Chromatic Integration (Optional)

> Automated visual regression testing via Chromatic. Free tier: 5,000 snapshots/month.

## What Chromatic Does

Chromatic captures a screenshot of every story on every push and diffs it against the baseline. When a visual change is detected, it creates a review for approval or rejection. This catches unintended UI regressions before they reach production.

## Setup

### 1. Connect Your Repository

1. Go to [chromatic.com](https://www.chromatic.com/) and sign in with GitHub/GitLab/Bitbucket.
2. Create a new project and link it to your repository.
3. Copy the project token.

### 2. Install Chromatic

```bash
npm install -D chromatic
```

### 3. Add the Project Token

Store the token as a secret in your CI environment:

```bash
# GitHub Actions
# Add CHROMATIC_PROJECT_TOKEN as a repository secret in Settings > Secrets

# Local testing (one-time)
export CHROMATIC_PROJECT_TOKEN=chpt_xxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Run Your First Build

```bash
npx chromatic --project-token=$CHROMATIC_PROJECT_TOKEN
```

This uploads all your stories as the initial baseline. Subsequent runs will diff against this baseline.

### 5. CI Integration

#### GitHub Actions

```yaml
# .github/workflows/chromatic.yml
name: Chromatic

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for Chromatic to detect changes

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          # Optional: only run on changes to component files
          # onlyChanged: true
```

## Configuration

### Ignoring Stories

Some stories should not trigger visual diffs (e.g., animation-heavy, randomly generated):

```tsx
export const AnimatedLoader: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
};
```

### Viewport Testing

Capture stories at multiple viewport widths:

```tsx
export const Responsive: Story = {
  parameters: {
    chromatic: { viewports: [320, 768, 1200] },
  },
};
```

### Delay for Async Content

Wait for async content to load before capturing:

```tsx
export const WithAsyncData: Story = {
  parameters: {
    chromatic: { delay: 500 }, // milliseconds
  },
};
```

## Free Tier Limits

| Feature | Free Tier |
|---------|-----------|
| Snapshots per month | 5,000 |
| Browsers | Chrome |
| Parallel builds | 1 |
| History retention | 30 days |

For most projects, 5,000 snapshots/month is sufficient. Each story at each viewport counts as one snapshot. To stay within limits:
- Use `onlyChanged: true` in CI to only snapshot stories affected by the current change.
- Set `chromatic: { disableSnapshot: true }` on stories that do not need visual regression (animations, randomized content).
- Limit viewport testing to stories that are actually responsive.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails with "No stories found" | Ensure `stories` glob in `.storybook/main.ts` matches your file paths |
| Snapshots look wrong (missing styles) | Import `globals.css` in `.storybook/preview.ts` |
| Too many snapshots | Use `onlyChanged` flag and disable snapshots on non-visual stories |
| Fonts not loading | Add font files to `.storybook/public/` or use `staticDirs` in main.ts |
