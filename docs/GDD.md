# Game Design Document

> Documento vivo. Decisões fechadas ficam aqui; valores numéricos ficam em
> [design/variaveis.md](design/variaveis.md) até serem aprovados e irem para `src/game/data/`.

## Visão
- **Gênero:** estratégia no mapa do continente + batalhas táticas por turnos.
- **Pitch:** _a definir_
- **Plataforma:** navegador (desktop).

## Decisões fechadas

| # | tema | decisão | data |
|---|------|---------|------|
| D1 | Tecnologia | TypeScript + Vite, sem engine (ver `docs/ARCHITECTURE.md`) | 2026-09-30 |
| D2 | Visual das batalhas | Isométrico 2D com câmera que gira, estilo Final Fantasy Tactics | 2026-09-30 |
| D3 | Mundo | 1 continente, 1 Citadela central, 5 estados ao redor, 5 cidades por estado | 2026-09-30 |
| D4 | Processo | Definir as variáveis bloco a bloco antes de implementar cada sistema | 2026-09-30 |

## Ordem de definição (blocos)

| bloco | tema | status |
|-------|------|--------|
| 1 | Mundo (continente, Citadela, estados, cidades) | em definição |
| 2 | Loop estratégico (o que o jogador faz no mapa) | aberto |
| 3 | Tempo | aberto |
| 4 | Personagens | aberto |
| 5 | Batalha: regras | aberto |
| 6 | Batalha: câmera e visual | aberto |
| 7 | Itens e economia | aberto |
| 8 | Narrativa e progressão da campanha | aberto |
