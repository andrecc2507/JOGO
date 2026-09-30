# Adicionando sistemas e conteúdo

## Novo sistema

```bash
npm run new:system -- combat --phase=logic --deps=movement
```

Isso cria `src/game/systems/combat/combat.system.ts`, um teste em
`tests/game/systems/combat.test.ts` e registra no `catalog.ts`. Depois:

1. Implemente `update`/`render`/`init` no arquivo gerado.
2. Componentes só deste sistema: `systems/combat/combat.component.ts`.
   Componentes usados por vários sistemas: `game/components/`.
3. Eventos emitidos: declare no topo do arquivo do sistema:
   ```ts
   declare module '@core/events/event_map' {
     interface EventMap { 'combat:hit': { target: number; damage: number } }
   }
   ```
4. Adicione `'combat'` ao array `systems` da cena que o usa.
5. Estado que deve ir para o save: implemente `serialize`/`deserialize`.
6. `npm test && npm run typecheck`.

Checklist de um bom sistema:
- Uma responsabilidade (movimento, combate, IA…), sem saber da UI.
- Sem `Math.random` — use `ctx.rng`.
- Sem acesso a teclas — use ações de `ctx.input` (config em `config/input.config.ts`).
- Sem números mágicos de balanceamento — leia de `ctx.data`.

## Novo domínio de dados

1. `src/game/data/items/items.json` — array de objetos com `id` único.
2. Tipo em `src/game/data/types.ts` e entrada em `DataCatalog`:
   ```ts
   export interface ItemDef { id: string; name: string; price: number }
   declare module '@core/data/data_registry' {
     interface DataCatalog { actors: ActorDef; items: ItemDef }
   }
   ```
3. Registre em `src/game/data/index.ts`: `data.register('items', items as ItemDef[])`.

## Nova cena

1. `src/game/scenes/<nome>/<nome>.scene.ts` estendendo `Scene`.
2. Id + parâmetros em `scenes/scene_params.ts`.
3. Registre em `scenes/index.ts`.
4. Navegue com `ctx.scenes.go('<nome>', params)`.

## Nova ação de input

Adicione em `src/game/config/input.config.ts` e use `input.isDown('acao')`,
`input.justPressed('acao')` ou `input.axis('neg', 'pos')`.

## Novo asset

Arquivo em `public/assets/...` e entrada em `src/game/assets.manifest.ts`.
Use com `ctx.assets.image('chave')` + `renderer.image(...)`.
