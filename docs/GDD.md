# Game Design Document

> Documento vivo. Decisões fechadas ficam aqui; valores numéricos ficam em
> [design/variaveis.md](design/variaveis.md) até serem aprovados e irem para `src/game/data/`.

## Visão
- **Gênero:** estratégia de campanha + combate tático por turnos (herdeiro do projeto Godot "Cortex Tactics").
- **Pitch:** comandar um esquadrão que responde às crises de um continente dividido, escolhendo quais
  ameaças enfrentar e quais ignorar — e lutar as batalhas em grade isométrica.
- **Plataforma:** navegador (desktop).

## Decisões fechadas

| # | tema | decisão | data |
|---|------|---------|------|
| D1 | Tecnologia | TypeScript + Vite, sem engine (ver `docs/ARCHITECTURE.md`) | 2026-09-30 |
| D2 | Visual do combate | Isométrico 2D com câmera que gira, estilo Final Fantasy Tactics | 2026-09-30 |
| D3 | Mundo | 1 continente, 1 Citadela central, 5 estados ao redor, 5 cidades por estado | 2026-09-30 |
| D4 | Processo | Definir variáveis bloco a bloco antes de implementar cada sistema | 2026-09-30 |

## Camadas do jogo
1. **Estratégica (campanha):** mapa do continente, tempo, pressão/crises, missões, estados, base.
2. **Tática (batalha):** grade isométrica com altura, turnos, PA, habilidades, cobertura.
3. **Gestão (base/esquadrão):** personagens, classes, equipamento, progressão.

## Ordem de definição (blocos)

| bloco | tema | status |
|-------|------|--------|
| 1 | Mundo (continente, Citadela, estados, cidades) | em definição |
| 2 | Tempo e calendário | aberto |
| 3 | Pressão, crises e ameaça | aberto |
| 4 | Missões | aberto |
| 5 | Estados/facções e diplomacia | aberto |
| 6 | Personagens: atributos e classes | aberto |
| 7 | Combate: grade, turnos, PA, acerto e dano | aberto |
| 8 | Câmera e visual isométrico | aberto |
| 9 | Itens e economia | aberto |
| 10 | Base (QG) e progressão | aberto |
| 11 | Atos e narrativa | aberto |

## Referência: projeto Godot
O código antigo continua acessível no histórico git (branch `main` antes da migração).
Havia versões conflitantes de várias regras (dois mapas-mundo, dois conjuntos de classes,
`data/` vs `content/`); as propostas em `variaveis.md` apontam de onde vem cada valor e
quando há conflito.
