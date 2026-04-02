import { create } from '@storybook/theming/create';

/**
 * Custom Storybook UI theme — matches the project's dark theme.
 *
 * This controls the Storybook chrome (sidebar, toolbar, panels),
 * not the story canvas itself. For story canvas theming, use the
 * decorators in preview.ts.
 *
 * Adjust the colors below to match your project's design tokens.
 * Common sources:
 *   - CSS custom properties in globals.css (--background, --primary, etc.)
 *   - Tailwind config (theme.extend.colors)
 *   - shadcn/ui components.json
 */
export default create({
  base: 'dark',

  // Brand
  brandTitle: 'Project Storybook',
  // brandUrl: 'https://your-project.com',
  // brandImage: '/logo.svg',
  // brandTarget: '_self',

  // UI colors
  appBg: '#1C2127',
  appContentBg: '#252A31',
  appBorderColor: '#3D4751',
  appBorderRadius: 2,

  // Typography
  fontBase: '"Geist Sans", "Inter", system-ui, sans-serif',
  fontCode: '"Geist Mono", "JetBrains Mono", monospace',

  // Text colors
  textColor: '#F5F5F5',
  textInverseColor: '#1C2127',
  textMutedColor: '#9DA5AD',

  // Toolbar colors
  barTextColor: '#9DA5AD',
  barSelectedColor: '#2D72D2',
  barBg: '#252A31',
  barHoverColor: '#2D72D2',

  // Form colors
  inputBg: '#1C2127',
  inputBorder: '#3D4751',
  inputTextColor: '#F5F5F5',
  inputBorderRadius: 2,

  // Color for boolean controls, etc.
  colorPrimary: '#2D72D2',
  colorSecondary: '#2D72D2',
});
