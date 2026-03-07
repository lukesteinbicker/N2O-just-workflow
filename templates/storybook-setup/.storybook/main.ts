import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  // Discover stories in src/ — adjust globs to match your project layout
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],

  // Addons — essentials for controls/docs, a11y for accessibility audits
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
  ],

  // Framework — use @storybook/nextjs for Next.js projects
  // For Vite projects, change to: '@storybook/react-vite'
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },

  // Static assets — serve from public/ like Next.js does
  staticDirs: ['../public'],

  // TypeScript — use react-docgen for prop table generation
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
};

export default config;
