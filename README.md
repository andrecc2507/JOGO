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

## Como jogar

- **Menu:** Novo jogo · Continuar · Editor de mapas · Batalha rápida (dev).
- **Mapa-mundo:** clique para selecionar esquadrão/local; **botão direito** num local move o esquadrão;
  **Espaço** pausa, **1–4** mudam a velocidade; roda = zoom; arrastar com botão direito = mover o mapa.
  Capitais têm Loja, Taverna (contratos e rumores) e Recrutamento; cidades menores têm Estalagem.
  O **Quartel** gerencia fichas, atributos, habilidades, equipamento, aparência e esquadrões.
- **Batalha:** a barra de ação enche pela Velocidade; na sua vez, tudo congela. Mover + agir, ou só agir
  (só mover deixa a próxima barra em 50%). **Q/E** giram a câmera, roda = zoom, **Esc** cancela.
- **Dev mode:** botão **DEV** (ou **F2**/**`**) abre ações de teste da tela atual: ouro, tempo, atos,
  teleporte, encontros por raridade, esquadrão de teste, vencer/perder, revelar mapa, aplicar elementos…
- **Áudio:** trilhas e efeitos sintetizados ao vivo (Web Audio, sem arquivos). Botão 🔊 para volume; **M** silencia.
- **Editor de mapas:** pinta terreno, altura, objetos, superfícies, nuvens e spawns tile a tile; gera por
  bioma com semente; salva no navegador, exporta/importa JSON e testa a batalha no mapa.

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
    data/              conteúdo em JSON (classes, habilidades, combos, itens, inimigos, países)
    rules/             personagem, progressão estilo Ragnarok, recrutamento (lógica pura)
    battle/            motor tático: mapa, elementos, visão, turnos por barra de ação, IA
    mapgen/            gerador de mapas por bioma + armazenamento do editor
    world/             continente, campanha (tempo, esquadrões, contratos), encontros
    render/            isométrico com rotação, pixel art em código, mapa-mundo
    scenes/            boot, main_menu, world_map, battle, map_editor
    audio/             música ambiente e efeitos sonoros procedurais
    dev/               dev mode e esquadrão de teste
    state/             estado que atravessa cenas + save
    systems/           sistemas ECS por frame (catalog.ts)
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
