# Variáveis do jogo

Registro de todas as variáveis de design, bloco a bloco.

**Status:** ✅ decidido · 🟡 proposta (aguardando aprovação) · ❓ em aberto (sem proposta)
**Origem:** `godot:<arquivo>` = valor que existia no projeto antigo · `novo` = sugestão nova.

Quando um bloco inteiro estiver ✅, os valores vão para `src/game/data/` e o sistema é implementado.

---

## Bloco 1 — Mundo

### 1.1 Estrutura

| variável | descrição | valor | status | origem |
|----------|-----------|-------|--------|--------|
| `continents` | quantidade de continentes | 1 | ✅ | decisão D3 |
| `citadel_count` | Citadela central | 1 | ✅ | decisão D3 |
| `state_count` | estados ao redor da Citadela | 5 | ✅ | decisão D3 |
| `cities_per_state` | cidades por estado | 5 | ✅ | decisão D3 |
| `total_locations` | locais no mapa (25 cidades + Citadela) | 26 | ✅ | derivado |
| `citadel_role` | o que é a Citadela | hub neutro e base do jogador (QG) | 🟡 | godot: Interposto Central / Auréa (capital HUB) |
| `state_capital` | cada estado tem 1 capital entre suas 5 cidades | sim | 🟡 | novo |
| `city_links` | cidades ligadas por rotas (grafo) | cada cidade liga a 2–3 vizinhas; cada estado tem 1–2 cidades ligadas à Citadela e 1 a cada estado vizinho | 🟡 | godot: `regions.links` |
| `layout` | disposição dos estados | anel de 5 estados em volta da Citadela (pentágono) | 🟡 | novo |

### 1.2 Variáveis de cada cidade

Herdadas das regiões do Godot. Todas numa escala 0–100.

| variável | significado | inicial | status | origem |
|----------|-------------|---------|--------|--------|
| `stability` | ordem pública; alta é bom | 40–80 | 🟡 | godot: `regions.initial_state` |
| `pressure` | tensão acumulada; alta gera crises | 15–60 | 🟡 | godot |
| `infiltration` | presença inimiga oculta | 10–35 | 🟡 | godot |
| `rifts` | fendas ativas (inteiro, não 0–100) | 0–1 | 🟡 | godot |
| `biome` | terreno das batalhas na cidade | city, village, forest, mountain, swamp, desert, port | 🟡 | godot: `world_map.locations.biome_id` |
| `city_type` | função da cidade | capital, porto, mina, fronteira, distrito, passagem | 🟡 | godot: `regions.type` |
| `tags` | modificadores de missão/facção | HUB, LAW, CULT, CHOKEPOINT, ROUTE_CONTROL, … | 🟡 | godot: `regions.tags` |

### 1.3 Variáveis de cada estado

| variável | significado | valor | status | origem |
|----------|-------------|-------|--------|--------|
| `relation` | relação com o jogador (−100 a 100) | início 0 (±5) | 🟡 | godot: `factions.relation` |
| `color` | cor no mapa | 5 cores distintas | 🟡 | godot: `act0_map.color` |
| `agenda` | o que o estado valoriza | ex.: FAITH, MILITARY, TRADE | 🟡 | godot: `factions.agenda_tags` |
| `pressure` | média/soma das cidades ou valor próprio? | ❓ | ❓ | godot tinha pressão por país (`act0_rules`) |

### 1.4 Perguntas abertas do bloco 1

1. **Nomes e identidade dos 5 estados.** O Godot tinha 3 países (Reino do Norte, Liga do Leste,
   República do Sul) e 3 facções (Clero Solar, Arsenal Imperial, Liga dos Mercadores).
   Reaproveitamos esses e criamos mais 2, ou cada estado é uma facção?
2. **Citadela:** é o QG do jogador, uma potência neutra, ou os dois?
3. **O Rasgo e as fendas** continuam sendo a ameaça central do mundo?
4. **Pressão por estado:** é a média das cidades ou uma variável própria?
5. **Cidades podem cair** (ser perdidas para o inimigo)? Se sim, com qual condição?

---

## Bloco 2 — Tempo e calendário

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `time_model` | tempo real com pausa ou por turnos de dia | tempo real com pausa e velocidades | 🟡 | godot: `map_screen` (multiplicador de velocidade) |
| `time_speeds` | velocidades disponíveis | pausa, 1×, 2×, 4× | 🟡 | godot |
| `minutes_per_real_second` | ritmo do relógio em 1× | ❓ | ❓ | godot: `time_minutes` |
| `days_per_week` | dias por semana (briefing semanal) | 7 | 🟡 | godot: `weekly_brief` |
| `daily_tick_order` | ordem de processamento diário | variáveis globais → fendas → infiltração → quadro de missões → timers → alertas → gates | 🟡 | godot: `WorldState.advance_day` |

## Bloco 3 — Pressão, crises e ameaça

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `pressure_range` | limites | 0–100 | 🟡 | godot: `act0_rules` |
| `pressure_start` | inicial | 10 | 🟡 | godot: `act0_rules` |
| `pressure_spawn_thresholds` | limiares que geram crises | 25 / 50 / 75 | 🟡 | godot: `act0_rules` |
| `pressure_do_delta` | ao cumprir a missão | −12 | 🟡 | godot: `act0_rules` |
| `pressure_ignore_delta` | ao ignorar a missão | +10 | 🟡 | godot: `act0_rules` |
| `pressure_decay_per_day` | decaimento natural | −2 | 🟡 | godot: `act0_rules` |
| `threat_tier` | nível de ameaça global | 1–3 | 🟡 | godot: `world_state` |
| `rift_effects` | efeito diário de cada fenda | −estabilidade, +pressão | 🟡 | godot: `WorldState.escalate_rifts` (valores ❓) |

## Bloco 4 — Missões

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `board_size` | cartas no quadro | 3–6 (cresce com ameaça) | 🟡 | godot: `mission_board` |
| `mission_spawn_hours` | intervalo entre missões | 24–72 h | 🟡 | godot: `act0_rules` |
| `max_active_per_state` | missões simultâneas por estado | 2 | 🟡 | godot: `act0_rules` |
| `card_fields` | o que cada carta mostra | risco, recompensa, efeitos FAZER, efeitos IGNORAR, prazo, tags | 🟡 | godot |
| `mission_types` | tipos | mapear fenda, invadir covil de culto, defender passagem, caçar âncora, … | 🟡 | godot: `mission_templates` |
| `squad_size` | personagens por missão | ❓ | ❓ | — |

## Bloco 5 — Estados/facções e diplomacia

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `relation_range` | limites | −100 a 100 | 🟡 | godot: `factions` |
| `relation_drift` | deriva diária | −1 base; +1 acima de 25–40 | 🟡 | godot: `factions.drift_rules` |
| `faction_events` | eventos aleatórios por facção | chance 12–18%/dia | 🟡 | godot: `events.json` |
| `relation_gates` | relação libera sistemas | 20–30 → ações básicas/diplomacia; 55–60 → lei marcial | 🟡 | godot: `factions.gates` |

## Bloco 6 — Personagens: atributos e classes

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `attributes` | atributos primários | FOR, DES, AGI, VIT, INT | 🟡 | godot: `classes.base_stats` |
| `classes` | classes jogáveis | Guerreiro, Arcano, Arqueiro, Mercenário, Patrulheiro | 🟡 | godot: `classes.json` (⚠ conflito: `skills.json` usa Vanguarda/Batedor/…) |
| `builds_per_class` | especializações | 4 (ex.: Guerreiro → Berserk, Guardião, Guerreiro Arcano, Monge) | 🟡 | godot: `classes.builds` |
| `base_hp` | vida base | Guerreiro 26, Arcano 18, … | 🟡 | godot |
| `base_mp` | mana base | Guerreiro 4, Arcano 12, … | 🟡 | godot |
| `max_level` | nível máximo | ❓ | ❓ | — |
| `xp_curve` | XP por nível | ❓ | ❓ | — |
| `points_per_level` | pontos de atributo/habilidade | ❓ | ❓ | godot: `stat_points`, `skill_points` |
| `skill_web` | árvore de habilidades | teia por classe | 🟡 | godot: `skills_web.json`, `notes/skill_webs_completas.md` |

## Bloco 7 — Combate

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `pa_max` | pontos de ação por turno | 30 (⚠ custos de habilidade eram 2–6, escala a revisar) | 🟡 | godot: `unit.gd` |
| `turn_order` | ordem dos turnos | por velocidade (SPD) | 🟡 | godot |
| `move_cost` | PA por casa | ❓ | ❓ | godot: `tactical_controller` |
| `jump` | altura que sobe/desce | 1 | 🟡 | godot: `unit.gd` |
| `vision_range` | alcance de visão | 9 | 🟡 | godot: `unit.gd` |
| `cover` | cobertura | meia / total; Hunker converte meia em total | 🟡 | godot: `abilities.gd` |
| `overwatch` | vigília | custo 3 PA, encerra o turno | 🟡 | godot |
| `opportunity_attack` | ataque de oportunidade | 1 por turno | 🟡 | godot: `oa_used_this_turn` |
| `hit_zones` | mira por parte do corpo | sim | 🟡 | godot: `unit.hit_zones` |
| `damage_types` | tipos de dano | perfurante, explosivo, derretimento | 🟡 | godot: `damage.gd` |
| `damage_formula` | dano final | max(1, dano × variação × crítico − armadura efetiva) × multiplicadores | 🟡 | godot: `damage.gd` |
| `crit_mult` | multiplicador de crítico | 1,5 | 🟡 | godot |
| `statuses` | estados | queimadura, enraizado, entrincheirado, … | 🟡 | godot: `unit.STATUS_DEFS` |
| `map_size` | tamanho da grade | ❓ | ❓ | godot: chunks 10×10 |

## Bloco 8 — Câmera e visual isométrico

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `projection` | projeção | isométrica 2:1 | 🟡 | decisão D2 |
| `camera_rotation` | giro da câmera | 4 ângulos, passos de 90° (estilo FFT) | 🟡 | decisão D2 |
| `height_levels` | andares/altura visíveis | ❓ | ❓ | godot: camadas com PageUp/PageDown |
| `zoom` | níveis de zoom | ❓ | ❓ | godot: `camera_rig` |
| `art_style` | arte | ❓ (placeholder geométrico até definir) | ❓ | — |

## Bloco 9 — Itens e economia

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `currency` | moeda | ouro | 🟡 | godot |
| `equipment_slots` | espaços de equipamento | arma, armadura, … ❓ | 🟡 | godot: `unit.equipped` |
| `item_tiers` | níveis de item | 1–3 | 🟡 | godot: `items.json` |
| `price_range` | preços | 110–140 no tier 2 | 🟡 | godot |

## Bloco 10 — Base (QG) e progressão

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `buildings` | construções | curandeiro, loja, dojo, recrutamento | 🟡 | godot: `world_state.buildings` |
| `building_levels` | níveis | começa em 1; máximo ❓ | 🟡 | godot |
| `general_skills` | habilidades do comandante | teia do general | 🟡 | godot: `general_skill_web` |

## Bloco 11 — Atos e narrativa

| variável | descrição | proposta | status | origem |
|----------|-----------|----------|--------|--------|
| `acts` | atos da campanha | Sinais → Guerra Justa → Lei Marcial → Reverso | 🟡 | godot: `campaign_acts.json` |
| `act_triggers` | o que avança o ato | dia, nível de ameaça, fendas, flags | 🟡 | godot |
| `gates` | sistemas liberados por ato | quadro de missões, ações básicas, diplomacia, lei marcial | 🟡 | godot |
