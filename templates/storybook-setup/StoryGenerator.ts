/**
 * StoryGenerator — Interface for auto-generating Storybook stories.
 *
 * Used by /detect-project to scan component files and generate
 * story files programmatically. v1 implements React/TypeScript.
 * The interface is designed to extend to Vue and Svelte via
 * framework-specific adapters.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a single prop on a component. */
export interface PropInfo {
  /** Prop name */
  name: string;
  /** TypeScript type as a string (e.g., 'string', "'primary' | 'secondary'") */
  type: string;
  /** Whether the prop is required */
  required: boolean;
  /** Default value, if detectable */
  defaultValue?: string;
  /** JSDoc description, if present */
  description?: string;
}

/** Metadata extracted from a component file. */
export interface ComponentMeta {
  /** Display name of the component (e.g., 'Badge') */
  name: string;
  /** Absolute path to the component file */
  filePath: string;
  /** Relative import path for the story file (e.g., './badge') */
  importPath: string;
  /** Detected props / interface */
  props: PropInfo[];
  /** Whether the component uses hooks that need providers */
  needsProviders: boolean;
  /** Specific providers detected (e.g., ['ApolloProvider', 'ThemeProvider']) */
  detectedProviders: string[];
  /** Whether the component has existing stories */
  hasExistingStories: boolean;
  /** Storybook title path (e.g., 'Primitives/Badge') */
  storyTitle: string;
}

/** Result of generating a story file. */
export interface GenerateResult {
  /** Path where the story file should be written */
  storyPath: string;
  /** Generated story file content */
  content: string;
  /** Whether manual setup is needed (providers, mock data) */
  needsManualSetup: boolean;
  /** Reasons why manual setup is needed */
  manualSetupReasons: string[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Framework adapter for story generation.
 *
 * v1: React/TypeScript implementation.
 * Future: Vue adapter (reads defineProps), Svelte adapter (reads export let).
 */
export interface StoryGenerator {
  /** Which framework this adapter handles */
  framework: 'react' | 'vue' | 'svelte';

  /**
   * Detect component metadata from a file path.
   * Returns null if the file is not a component (e.g., a utility, hook, or type file).
   */
  detect(componentPath: string): ComponentMeta | null;

  /**
   * Generate story file content from component metadata.
   */
  generate(meta: ComponentMeta): GenerateResult;
}

// ---------------------------------------------------------------------------
// React/TypeScript Implementation (v1)
// ---------------------------------------------------------------------------

/**
 * React/TypeScript story generator.
 *
 * Detection strategy:
 *   1. Read the file and look for a default export or named export of a function
 *      that returns JSX (React.FC, function component, arrow component).
 *   2. Find the props interface/type by looking for:
 *      - `interface ${Name}Props`
 *      - `type ${Name}Props =`
 *      - Inline props in the function signature
 *   3. Parse prop names, types, required/optional, and defaults.
 *   4. Check for provider dependencies by scanning imports for context/client usage.
 *
 * Generation strategy:
 *   1. Choose template: basic (no providers), complex (needs providers).
 *   2. Generate a Default story with sensible arg defaults:
 *      - string props: component name or prop name
 *      - boolean props: true
 *      - enum/union props: first option
 *      - callback props: fn() (from @storybook/test)
 *   3. Generate an AllVariants story if a variant/type prop with union type is found.
 *   4. Generate edge case stories (empty string, long text) for string props.
 *   5. If providers are detected, wrap in decorators and flag for manual review.
 */
export class ReactStoryGenerator implements StoryGenerator {
  framework = 'react' as const;

  detect(componentPath: string): ComponentMeta | null {
    // Implementation sketch:
    //
    // 1. Read file content
    // 2. Check for JSX return (tsx file with React component pattern)
    // 3. Skip if: only type exports, hook file (use*.ts), test file, story file
    // 4. Extract component name from default export or largest named export
    // 5. Find props interface/type
    // 6. Parse individual props
    // 7. Scan imports for provider dependencies
    // 8. Determine story title from file path (e.g., src/components/ui/badge.tsx -> Primitives/Badge)
    //
    // Return null if not a component file.

    throw new Error('Not implemented — this is a template for agent-driven generation');
  }

  generate(meta: ComponentMeta): GenerateResult {
    // Implementation sketch:
    //
    // 1. Build imports section
    //    - import type { Meta, StoryObj } from '@storybook/react'
    //    - import { fn } from '@storybook/test' (if callback props exist)
    //    - import { Component } from './component'
    //
    // 2. Build meta object
    //    - component, title, tags: ['autodocs']
    //    - argTypes for enum/union props (control: 'select')
    //    - args for callback props (fn())
    //
    // 3. Build Default story with sensible defaults
    //
    // 4. Build AllVariants story if variant prop detected
    //
    // 5. Build edge case stories for string props
    //
    // 6. If providers needed, wrap in decorators and add to manualSetupReasons
    //
    // 7. Assemble file content string

    throw new Error('Not implemented — this is a template for agent-driven generation');
  }
}
