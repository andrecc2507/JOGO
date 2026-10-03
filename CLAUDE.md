# CLAUDE.md

Jogo em TypeScript + Vite, sem engine. Leia `docs/ARCHITECTURE.md` antes de mudanças estruturais.

- Comandos: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.
- Novo sistema: `npm run new:system -- <nome> [--phase=...] [--deps=a,b]`, depois adicione o id à cena.
- `src/core` é genérico e não importa `src/game` nem `src/ui`.
- Eventos, domínios de dados e parâmetros de cena são tipados por declaration merging
  (`EventMap`, `DataCatalog`, `SceneParams`).
- Aleatoriedade sempre via `ctx.rng`; teclas sempre via ações em `game/config/input.config.ts`;
  balanceamento em `game/data/`.
- Toda conta de atributo, dano, acerto e linha do tempo passa por `game/rules/stats.ts` (números em
  `game/data/balance.json`, explicação em `docs/design/matematica.md`); habilidades não fazem conta própria.
- Regras de jogo vivem em módulos puros (`game/rules`, `game/battle`, `game/world`); cenas só orquestram.
  Valores de design vêm de `docs/design/variaveis.md` e ficam em `game/data/*.json` ou constantes nomeadas.
- `window.__jogo` expõe o Engine para testes no navegador (Playwright) e depuração.
- Docs e comentários em português; identificadores em inglês; arquivos em snake_case.
- Rode `npm test && npm run typecheck` antes de commitar.
