import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { spriteDevServer } from './tools/sprite_dev_server';

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // Caminhos relativos: o build em dist/ funciona em qualquer hospedagem estática.
  base: './',
  // No `npm run dev`, o importador de sprites do Bestiário grava direto no projeto.
  plugins: [spriteDevServer(dir('.'))],
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
