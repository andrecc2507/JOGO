# Variáveis do jogo

Registro das variáveis de design, bloco a bloco.

**Status:** ✅ decidido · ❓ em aberto

Quando um bloco inteiro estiver ✅, os valores vão para `src/game/data/` e o sistema é implementado.

---

## Bloco 1 — Mundo

### 1.1 Estrutura

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `continents` | quantidade de continentes | 1 | ✅ |
| `citadel_count` | Citadela central | 1 | ✅ |
| `state_count` | estados ao redor da Citadela | 5 | ✅ |
| `cities_per_state` | cidades por estado | 5 | ✅ |
| `total_locations` | locais no mapa (25 cidades + Citadela) | 26 | ✅ |
| `citadel_role` | o que é a Citadela para o jogador | | ❓ |
| `state_capital` | cada estado tem uma capital? | | ❓ |
| `connections` | como os locais se ligam (rotas, fronteiras, livre) | | ❓ |
| `layout` | disposição dos estados no continente | | ❓ |

### 1.2 Perguntas abertas

1. **Quem é o jogador** nesse mundo (governante da Citadela, líder de um esquadrão, mercenário…)?
2. **O que é a Citadela** — base do jogador, poder neutro, alvo a conquistar?
3. **Identidade dos 5 estados** — nomes, temas, e se são aliados, rivais ou inimigos.
4. **O que cada cidade tem** — quais números/estados uma cidade guarda (ex.: dono, população, recursos, ameaça).
5. **O mapa muda** — cidades trocam de dono, são destruídas, surgem novas?

---

## Blocos seguintes

Serão detalhados quando o bloco anterior estiver fechado.

- **Bloco 2 — Loop estratégico:** o que o jogador faz no mapa e o que leva a uma batalha.
- **Bloco 3 — Tempo:** turnos ou tempo real com pausa; duração de uma campanha.
- **Bloco 4 — Personagens:** atributos, classes, tamanho do esquadrão, progressão.
- **Bloco 5 — Batalha, regras:** turnos, ações, movimento, acerto, dano, altura, condição de vitória.
- **Bloco 6 — Batalha, câmera e visual:** projeção, giro da câmera, zoom, estilo de arte.
- **Bloco 7 — Itens e economia:** recursos, equipamento, lojas.
- **Bloco 8 — Narrativa e progressão da campanha:** história, fases, final.
