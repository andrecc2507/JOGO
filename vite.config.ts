import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': dir('./src/core'),
      '@game': dir('./src/game'),
      '@ui': dir('./src/ui'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
