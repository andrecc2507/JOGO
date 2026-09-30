import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Caminhos relativos: o build em dist/ funciona em qualquer hospedagem estática.
  base: './',
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
