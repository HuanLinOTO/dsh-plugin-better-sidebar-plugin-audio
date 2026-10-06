import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // Node is the default; the browser-half specs opt into jsdom with a
    // `// @vitest-environment jsdom` file comment.
    environment: 'node',
    globals: false,
    testTimeout: 15000,
  },
})
