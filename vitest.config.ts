import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/**'], // tests/ is the existing puppeteer suite
    environment: 'node',
    globals: false,
  },
});
