# CLAUDE.md

Jogo em TypeScript + Vite, sem engine. Leia `docs/ARCHITECTURE.md` antes de mudanças estruturais.

- Comandos: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.
- Novo sistema: `npm run new:system -- <nome> [--phase=...] [--deps=a,b]`, depois adicione o id à cena.
- `src/core` é genérico e não importa `src/game` nem `src/ui`.
- Eventos, domínios de dados e parâmetros de cena são tipados por declaration merging
  (`EventMap`, `DataCatalog`, `SceneParams`).
- Aleatoriedade sempre via `ctx.rng`; teclas sempre via ações em `game/config/input.config.ts`;
  balanceamento em `game/data/`.
- Docs e comentários em português; identificadores em inglês; arquivos em snake_case.
- Rode `npm test && npm run typecheck` antes de commitar.
