# Convenções

## Nomes
- Arquivos e pastas: `snake_case` (`player_control.system.ts`).
- Sufixos: `.system.ts`, `.component.ts`, `.scene.ts`, `.test.ts`.
- Ids de sistemas, cenas e dados: `snake_case`, iguais ao nome da pasta/arquivo.
- Eventos: `'dominio:acao'` (`'combat:hit'`, `'scene:changed'`).
- Componentes: `PascalCase` (`Transform`, `Health`).
- Fábricas de sistema: `createXxxSystem()`.

## Regras de dependência
- `core/` nunca importa `game/` ou `ui/`.
- Sistemas não importam outros sistemas (exceto tipos). Use componentes, eventos
  ou `ctx.systems.get` com `dependsOn`.
- Cenas orquestram; lógica de jogo mora em sistemas.
- UI não altera o World: emite eventos.

## Código
- TypeScript estrito; evite `any` fora do core.
- Comentários e documentação em português; identificadores em inglês.
- Componentes são dados puros (objetos simples, serializáveis).
- Todo sistema novo vem com teste (o gerador já cria um).

## Git
- Commits pequenos e descritivos, um sistema/feature por vez.
- `npm test && npm run typecheck` antes de subir.
