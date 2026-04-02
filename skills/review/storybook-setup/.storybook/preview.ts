import type { Preview } from '@storybook/react';

// Import your project's global styles so components render correctly.
// Adjust this path to match your project layout.
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    // Sensible defaults for controls
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    // Default viewport (optional — uncomment to set a default)
    // viewport: { defaultViewport: 'responsive' },

    // Default background — set to match your project's bg color
    // backgrounds: {
    //   default: 'dark',
    //   values: [
    //     { name: 'dark', value: '#1C2127' },
    //     { name: 'light', value: '#F5F5F5' },
    //   ],
    // },
  },

  // Global decorators — applied to every story.
  //
  // Dark theme setup:
  // If your project uses a CSS class on <html> or <body> to activate dark mode
  // (e.g., Tailwind's `class="dark"`), apply it here so all stories render
  // in the correct theme.
  decorators: [
    (Story) => (
      <div className="dark" style={{ minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],

  // Tags — enable autodocs for all stories tagged with 'autodocs'
  tags: ['autodocs'],
};

export default preview;
