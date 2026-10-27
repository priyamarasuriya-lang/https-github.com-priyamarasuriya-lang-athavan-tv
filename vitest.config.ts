import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    // Integration tests share one test database, so test files run serially.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'ui', include: ['tests/unit/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['tests/setup/ui.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/integration.ts'],
          globalSetup: ['tests/setup/integration-global.ts'],
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
