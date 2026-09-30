# Variáveis do jogo

Registro das variáveis de design, bloco a bloco, seguindo o mapa mental
([esqueleto.canvas](esqueleto.canvas)).

**Status:** ✅ decidido · ❓ em aberto

Quando um bloco inteiro estiver ✅, os valores vão para `src/game/data/` e o sistema é implementado.

---

## Bloco 1 — Mundo, mapa e recursos

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `continents` | continentes | 1 | ✅ |
| `citadel_count` | Citadela central | 1 | ✅ |
| `state_count` | estados ao redor da Citadela | 5 | ✅ |
| `cities_per_state` | cidades por estado | 5 | ✅ |
| `total_locations` | 25 cidades + Citadela | 26 | ✅ |
| `citadel_role` | o que é a Citadela para o jogador | | ❓ |
| `state_identity` | nome/tema de cada estado e relação entre eles | | ❓ |
| `city_data` | o que cada cidade guarda (dono, recursos, perigo…) | | ❓ |
| `resources` | quais recursos existem no mapa | | ❓ |
| `travel` | como o grupo se move no mapa (livre, por rotas, custo de tempo) | | ❓ |
| `map_changes` | o mapa muda durante o jogo? | | ❓ |

## Bloco 2 — Classes e atributos

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `classes` | classes jogáveis | Guerreiro, Arqueiro, Mago, Curandeiro, Ladrão | ✅ |
| `attributes` | lista de atributos | | ❓ |
| `attribute_effects` | o que cada atributo afeta | | ❓ |
| `class_role` | papel de cada classe no combate | | ❓ |
| `class_change` | existe troca/evolução de classe (ex.: classes avançadas)? | | ❓ |
| `party_size` | personagens no grupo / em batalha | | ❓ |

## Bloco 3 — Progressão do personagem

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `stat_allocation` | pontos distribuídos pelo jogador ao upar | estilo Ragnarok | ✅ |
| `points_per_level` | pontos ganhos por nível | | ❓ |
| `stat_cost_curve` | custo cresce com o valor do atributo (como no Ragnarok)? | | ❓ |
| `max_level` | nível máximo | | ❓ |
| `xp_sources` | de onde vem XP | | ❓ |
| `skill_progression` | como se ganham habilidades | | ❓ |
| `customization` | personalização visual | bem básica | ✅ |

## Bloco 4 — Combate

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `initiative` | ordem dos turnos definida por iniciativa | sim | ✅ |
| `initiative_formula` | como a iniciativa é calculada | | ❓ |
| `turn_timeline` | HUD mostra a linha do tempo dos próximos turnos | sim | ✅ |
| `action_bar` | HUD com barra de skills e ações | sim | ✅ |
| `move_preview` | previsão de movimento antes de confirmar | sim | ✅ |
| `basic_actions` | ações disponíveis a todos (mover, atacar, defender, item, esperar…) | | ❓ |
| `action_economy` | quantas ações por turno (ex.: 1 movimento + 1 ação, ou pontos) | | ❓ |
| `status_list` | status existentes | ferimentos, escondido, … | ❓ |
| `wounds` | como funcionam os ferimentos (duram após a batalha?) | | ❓ |
| `hidden` | como se esconde e como é revelado | | ❓ |
| `combo` | o que é um combo (ataques em sequência, ações combinadas entre aliados…) | | ❓ |
| `height` | efeito da altura do terreno | | ❓ |
| `victory_conditions` | condições de vitória/derrota | | ❓ |

## Bloco 5 — Encontros

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `scheduled_types` | encontros programados | história, contratos | ✅ |
| `random_types` | encontros aleatórios | emboscadas, feras | ✅ |
| `random_trigger` | quando um encontro aleatório acontece | | ❓ |
| `contract_source` | onde se pegam contratos | | ❓ |
| `contract_rewards` | o que contratos pagam | | ❓ |

## Bloco 6 — Inimigos e feras

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `enemy_npcs` | inimigos humanoides | | ❓ |
| `beasts` | feras | adestráveis e não adestráveis | ✅ |
| `taming` | como se adestra uma fera | | ❓ |
| `tamed_role` | o que a fera adestrada faz (luta junto, montaria…) | | ❓ |

## Bloco 7 — História, atos e missões

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `structure` | história central dividida em atos com missões | sim | ✅ |
| `act_count` | quantidade de atos | | ❓ |
| `legends` | side quests "Lendas" | recompensam itens únicos | ✅ |
| `characters` | personagens da história | | ❓ |

## Bloco 8 — Som e visual

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `art_reference` | referência de arte | Ragnarok Online, Alabaster Dawn | ✅ |
| `battle_camera` | câmera de batalha | isométrica, gira estilo FFT | ✅ |
| `vfx` | sprites, magias e animações | | ❓ |
| `sfx_music` | efeitos sonoros e música | | ❓ |
