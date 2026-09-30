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
| `citadel` | reino-citadela central, sede do rei; selada por magia negra a partir do Ato 4 | 1 | ✅ |
| `country_count` | países ao redor da Citadela | 5 | ✅ |
| `cities_per_country` | cidades por país (uma é a capital) | 5 | ✅ |
| `total_locations` | 25 cidades + Citadela | 26 | ✅ |
| `player_base` | capital escolhida como esconderijo no fim do Ato 1 | 1 das 5 capitais | ✅ |
| `capital_bonus` | bônus diferente conforme a capital escolhida | | ❓ |
| `capital_leaders` | cada capital tem um líder que entra na equipe no Ato 4 | 5 | ✅ |
| `taverns` | cidades com taverna e NPCs que dão dicas | | ❓ |
| `inverted_world` | mapa espelhado/distorcido do continente no Ato 6+ | só 3 capitais | ✅ |
| `country_identity` | cada país é a terra natal de uma classe (tabela 1.1) | nomes provisórios | ✅ |
| `country_names` | nomes definitivos dos países e capitais | | ❓ |
| `city_data` | o que cada cidade guarda (dono, recursos, perigo…) | | ❓ |
| `resources` | quais recursos existem no mapa | | ❓ |
| `travel` | como o grupo se move no mapa (livre, por rotas, custo de tempo) | | ❓ |
| `day_counter` | contador de dias (usado no Ato 7 antes do despertar) | | ❓ |

### 1.1 Países e capitais

Nomes provisórios. Cada capital é o centro de uma classe.

| id provisório | capital | classe | bioma / característica | status |
|---------------|---------|--------|------------------------|--------|
| `pais_arqueiros` | Capital dos Arqueiros | Arqueiro | floresta | ✅ |
| `pais_magos` | Capital dos Magos | Mago | montanhas de neve | ✅ |
| `pais_guerreiros` | Capital dos Guerreiros | Guerreiro | cidade portuária | ✅ |
| `pais_ladroes` | Guilda dos Ladrões | Ladrão | deserto | ✅ |
| `pais_clerigos` | Capital dos Clérigos | Clérigo / Curandeiro | cidade comercial e religiosa; bioma ❓ | 🟡 |

Perguntas abertas: bioma do país dos clérigos; se a classe se chama Clérigo ou Curandeiro;
se as outras 4 cidades de cada país seguem o bioma da capital.

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

Resumo completo em [historia.md](historia.md).

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `structure` | Prólogo + atos com missões | Prólogo + 8 atos (provisório) | ✅ |
| `legends` | side quests "Lendas" | recompensam itens únicos | ✅ |
| `bosses` | barões + chefe final | 3 barões + Devorador de Mundos em fases | ✅ |
| `battle_discoveries` | documentos achados em batalha revelam a trama | | ❓ |
| `troop_loyalty` | lealdade / confiança / moral individuais das tropas | | ❓ |
| `desertion_split` | na deserção, quem segue o comandante | | ❓ |
| `act1_missions` | missões do Ato 1 (5–8 sugeridas) | | ❓ |

## Bloco 8 — Som e visual

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `art_reference` | referência de arte | Ragnarok Online, Alabaster Dawn | ✅ |
| `battle_camera` | câmera de batalha | isométrica, gira estilo FFT | ✅ |
| `vfx` | sprites, magias e animações | | ❓ |
| `sfx_music` | efeitos sonoros e música | | ❓ |
