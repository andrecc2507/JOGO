# JOGO

Jogo em **TypeScript** rodando no navegador, sem engine: núcleo próprio com ECS,
sistemas plugáveis, cenas, input por ações, save versionado e conteúdo em JSON.

## Começando

```bash
npm install
npm run dev          # servidor local com hot reload
npm test             # testes (Vitest)
npm run typecheck    # checagem de tipos
npm run build        # build de produção em dist/
```

Controles da demo: **Enter** novo jogo · **C** continuar · **WASD/setas** mover ·
**Esc** salvar e voltar ao menu · **F3** painel de debug.

## Estrutura

```
src/
  main.ts              ponto de entrada (monta jogo + UI)
  core/                motor genérico — não conhece nada do jogo
    ecs/               World, entidades, componentes, queries
    events/            EventBus tipado + catálogo de eventos (EventMap)
    systems/           interface System + SystemRegistry (dependências e fases)
    scenes/            Scene (World + sistemas próprios) e SceneManager
    loop/              GameLoop com passo fixo
    input/             Input baseado em ações (rebind por configuração)
    render/            Renderer Canvas 2D com resolução lógica
    assets/            carregamento e cache de imagens/áudio/json
    save/              SaveService com versão e migrações
    data/              DataRegistry (conteúdo por domínio/id)
    utils/             logger, RNG determinístico, matemática
  game/                o jogo em si
    config/            constantes e mapa de teclas
    components/        componentes compartilhados
    systems/           um sistema por pasta + catalog.ts (registro)
    scenes/            boot, main_menu, gameplay…
    prefabs/           fábricas de entidades a partir de data/
    data/              conteúdo em JSON + tipos dos domínios
    assets.manifest.ts lista de assets carregados no boot
  ui/                  camada DOM sobre o canvas (HUD, menus complexos)
public/assets/         sprites, áudio, fontes
tests/                 testes do core e do jogo
tools/                 geradores (ex.: new-system)
docs/                  arquitetura, convenções, design do jogo
```

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) — como as peças se encaixam
- [Adicionando sistemas e conteúdo](docs/ADDING_FEATURES.md) — passo a passo
- [Convenções](docs/CONVENTIONS.md) — nomes, pastas, regras
- [Game Design](docs/GDD.md) — o jogo em si
- [Variáveis de design](docs/design/variaveis.md) — valores bloco a bloco
