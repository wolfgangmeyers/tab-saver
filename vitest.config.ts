import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['module'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
