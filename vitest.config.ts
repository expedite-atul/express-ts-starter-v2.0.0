import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Creates the test database (if needed) and applies migrations once per run.
    globalSetup: ['./tests/setup/global-setup.ts'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
