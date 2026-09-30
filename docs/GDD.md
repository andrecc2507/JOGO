# Game Design Document

> Documento vivo. Decisões fechadas ficam aqui; valores numéricos ficam em
> [design/variaveis.md](design/variaveis.md) até serem aprovados e irem para `src/game/data/`.
> O mapa mental original está em [design/esqueleto.canvas](design/esqueleto.canvas) (Obsidian Canvas).

## Visão
- **Gênero:** RPG tático — mapa do continente + batalhas por turnos em grade isométrica.
- **Pitch:** um RPG tático medieval que começa como uma guerra civil e gradualmente se transforma
  em uma guerra interdimensional. Ver [design/historia.md](design/historia.md).
- **Plataforma:** navegador (desktop).
- **Referências:** Ragnarok Online e Alabaster Dawn (visual), Final Fantasy Tactics (câmera de batalha),
  Chrono Trigger (NPCs em tavernas dão dicas), Chaves de Salomão (temática de demônios).

## Decisões fechadas

| # | tema | decisão | data |
|---|------|---------|------|
| D1 | Tecnologia | TypeScript + Vite, sem engine (ver `docs/ARCHITECTURE.md`) | 2026-09-30 |
| D2 | Visual das batalhas | Isométrico 2D com câmera que gira, estilo Final Fantasy Tactics | 2026-09-30 |
| D3 | Mundo | 1 continente, reino-citadela central, 5 países ao redor, 5 cidades por país (uma é a capital) | 2026-09-30 |
| D4 | Processo | Definir as variáveis bloco a bloco antes de implementar cada sistema | 2026-09-30 |
| D5 | Classes | Guerreiro, Arqueiro, Mago, Clérigo, Ladrão (Curandeiro renomeado para Clérigo) | 2026-09-30 |
| D6 | Progressão | Pontos de atributo distribuídos pelo jogador ao subir de nível, estilo Ragnarok | 2026-09-30 |
| D7 | Encontros | Programados (história, contratos) e aleatórios (emboscadas, feras) | 2026-09-30 |
| D8 | História | Organizada em atos com missões; side quests "Lendas" dão itens únicos | 2026-09-30 |
| D9 | Feras | Existem feras adestráveis e não adestráveis | 2026-09-30 |
| D10 | Visual | Sprites no estilo Ragnarok / Alabaster Dawn; personalização de personagem bem básica | 2026-09-30 |
| D11 | Protagonista | Comandante do rei que deserta no fim do Ato 1 e passa a liderar a rebelião | 2026-09-30 |
| D12 | Base | O jogador escolhe uma capital como esconderijo, que vira sua base a partir do Ato 4 | 2026-09-30 |
| D13 | Campanha | Prólogo + 8 atos (número provisório); segunda metade no mundo invertido | 2026-09-30 |
| D14 | Dicas | NPCs em tavernas dão pistas da missão principal e das Lendas | 2026-09-30 |
| D15 | Easter eggs | Mensagens subliminares ocultas, sem impacto na jogabilidade | 2026-09-30 |
| D16 | Países | Cada país é a terra de uma classe: Arqueiros (floresta), Magos (montanhas de neve), Guerreiros (cidade portuária), Ladrões (guilda no deserto), Clérigos (planície, capital comercial e religiosa). As 5 cidades de cada país seguem o bioma do país. Nomes provisórios | 2026-09-30 |
| D17 | Mapa | Mapa estilo Chrono Trigger: vários esquadrões; point & click no destino; esquadrão anda visualmente enquanto o tempo passa | 2026-09-30 |
| D18 | Viagem | Pontos de passagem entre cidades (estilo FFT) onde acontecem encontros aleatórios | 2026-09-30 |
| D19 | Cidades | Só as capitais têm interação (taverna e loja); as outras 4 cidades são pontos de descanso | 2026-09-30 |
| D20 | Recursos | Só ouro, por enquanto | 2026-09-30 |
| D21 | Tempo | Tempo corre sozinho no mapa, com pausar / acelerar / desacelerar (estilo Xenonauts) | 2026-09-30 |
| D22 | Esquadrões | Sem limite de esquadrões viajando ao mesmo tempo | 2026-09-30 |
| D23 | Descanso | Estalagem nos pontos de descanso: custa pouco ouro, recupera HP e MP, ferimentos curam 2× mais rápido | 2026-09-30 |
| D24 | Encontros | Chance fixa de encontro no caminho; inimigos sorteados por raridade (comum, raro, épico) | 2026-09-30 |
| D25 | Atributos | Força (corpo a corpo), Destreza (distância), Inteligência (magia), Vitalidade (HP), Constituição (defesa), Velocidade (barra de ação) | 2026-09-30 |
| D26 | Turnos | Barra de ação estilo Chrono Trigger (sem pontos de ação): enche conforme a Velocidade; cheia = mover + agir ou só agir; a ação encerra o turno; unidades rápidas podem agir 2× antes das lentas | 2026-09-30 |

## Estrutura (do mapa mental)

```
Brainstorm
├─ Mecânicas
│  ├─ Combate
│  │  ├─ HUD: linha do tempo · barra de skills e ações · previsão de movimento
│  │  ├─ Variáveis: velocidade → barra de ação (ATB)
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
│  ├─ Guerreiro · Arqueiro · Mago · Clérigo · Ladrão
│  ├─ Inimigos NPCs
│  └─ Feras (adestráveis e não)
└─ Som e visual
   ├─ VFX: sprites, magias e animações → gráficos tipo Ragnarok/Alabaster Dawn → personalização básica
   └─ SFX · música · animações de batalha
```

## Ordem de definição (blocos)

| bloco | tema | status |
|-------|------|--------|
| 1 | Mundo, mapa e recursos | estrutura fechada; faltam números |
| 2 | Classes e atributos | em definição |
| 3 | Progressão do personagem | aberto |
| 4 | Combate | aberto |
| 5 | Encontros | aberto |
| 6 | Inimigos e feras | aberto |
| 7 | História, atos e missões | em definição |
| 8 | Som e visual | aberto |
