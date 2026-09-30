# Game Design Document

> Documento vivo. Decisões fechadas ficam aqui; valores numéricos ficam em
> [design/variaveis.md](design/variaveis.md) até serem aprovados e irem para `src/game/data/`.
> O mapa mental original está em [design/esqueleto.canvas](design/esqueleto.canvas) (Obsidian Canvas).

## Visão
- **Gênero:** RPG tático — mapa do continente + batalhas por turnos em grade isométrica.
- **Pitch:** _a definir_
- **Plataforma:** navegador (desktop).
- **Referências visuais:** Ragnarok Online, Alabaster Dawn; câmera de batalha estilo Final Fantasy Tactics.

## Decisões fechadas

| # | tema | decisão | data |
|---|------|---------|------|
| D1 | Tecnologia | TypeScript + Vite, sem engine (ver `docs/ARCHITECTURE.md`) | 2026-09-30 |
| D2 | Visual das batalhas | Isométrico 2D com câmera que gira, estilo Final Fantasy Tactics | 2026-09-30 |
| D3 | Mundo | 1 continente, 1 Citadela central, 5 estados ao redor, 5 cidades por estado | 2026-09-30 |
| D4 | Processo | Definir as variáveis bloco a bloco antes de implementar cada sistema | 2026-09-30 |
| D5 | Classes | Guerreiro, Arqueiro, Mago, Curandeiro, Ladrão | 2026-09-30 |
| D6 | Progressão | Pontos de atributo distribuídos pelo jogador ao subir de nível, estilo Ragnarok | 2026-09-30 |
| D7 | Encontros | Programados (história, contratos) e aleatórios (emboscadas, feras) | 2026-09-30 |
| D8 | História | Organizada em atos com missões; side quests "Lendas" dão itens únicos | 2026-09-30 |
| D9 | Feras | Existem feras adestráveis e não adestráveis | 2026-09-30 |
| D10 | Visual | Sprites no estilo Ragnarok / Alabaster Dawn; personalização de personagem bem básica | 2026-09-30 |

## Estrutura (do mapa mental)

```
Brainstorm
├─ Mecânicas
│  ├─ Combate
│  │  ├─ HUD: linha do tempo · barra de skills e ações · previsão de movimento
│  │  ├─ Variáveis: iniciativa
│  │  ├─ Ações básicas
│  │  ├─ Status: ferimentos · escondido
│  │  └─ Combo
│  ├─ Mapa e recursos → Mundo
│  └─ Progressão do personagem → distribuir pontos ao upar (estilo Ragnarok)
├─ Encontros
│  ├─ Programados: história · contratos
│  └─ Aleatórios: emboscadas · feras
├─ História
│  ├─ Atos → missões
│  ├─ História central
│  ├─ Side quests (Lendas) → recompensas em itens únicos
│  └─ Personagens
├─ Classes
│  ├─ Atributos
│  ├─ Guerreiro · Arqueiro · Mago · Curandeiro · Ladrão
│  ├─ Inimigos NPCs
│  └─ Feras (adestráveis e não)
└─ Som e visual
   ├─ VFX: sprites, magias e animações → gráficos tipo Ragnarok/Alabaster Dawn → personalização básica
   └─ SFX · música · animações de batalha
```

## Ordem de definição (blocos)

| bloco | tema | status |
|-------|------|--------|
| 1 | Mundo, mapa e recursos | em definição |
| 2 | Classes e atributos | aberto |
| 3 | Progressão do personagem | aberto |
| 4 | Combate | aberto |
| 5 | Encontros | aberto |
| 6 | Inimigos e feras | aberto |
| 7 | História, atos e missões | aberto |
| 8 | Som e visual | aberto |
