import * as path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@latch/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/tests/unit/**/*.test.ts', '**/src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json'],
    },
  },
})
