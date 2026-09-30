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
| `capital_bonus` | bônus diferente conforme a capital escolhida (vai existir; conteúdo a definir) | sim | ❓ |
| `capital_leaders` | cada capital tem um líder (classe única) que pode entrar na equipe | 5 | ✅ |
| `capital_services` | só as capitais têm interação: taverna e loja | capitais | ✅ |
| `taverns` | NPCs nas tavernas das capitais dão dicas | capitais | ✅ |
| `other_cities` | as 4 outras cidades de cada país são pontos de descanso com estalagem | ponto de descanso | ✅ |
| `rest_effect` | na estalagem: recupera HP e MP; ferimentos curam 2× mais rápido | ✅ | ✅ |
| `rest_cost` | custo em ouro para ficar na estalagem | pouco ouro; valor ❓ | ❓ |
| `rest_wound_speed` | multiplicador de cura de ferimentos na estalagem (ex.: 5 dias → 2,5) | 2× | ✅ |
| `inverted_world` | mapa espelhado/distorcido do continente no Ato 6+ | só 3 capitais | ✅ |
| `country_identity` | cada país é a terra natal de uma classe (tabela 1.1) | nomes provisórios | ✅ |
| `country_names` | nomes definitivos dos países e capitais | | ❓ |
| `resources` | recursos do jogador | só ouro (por enquanto) | ✅ |
| `day_counter` | contador de dias (usado no Ato 7 antes do despertar) | | ❓ |

### 1.1 Países e capitais

Nomes provisórios. Cada capital é o centro de uma classe.

| id provisório | capital | classe | bioma / característica | status |
|---------------|---------|--------|------------------------|--------|
| `pais_arqueiros` | Capital dos Arqueiros | Arqueiro | floresta | ✅ |
| `pais_magos` | Capital dos Magos | Mago | montanhas de neve | ✅ |
| `pais_guerreiros` | Capital dos Guerreiros | Guerreiro | cidade portuária | ✅ |
| `pais_ladroes` | Guilda dos Ladrões | Ladrão | deserto | ✅ |
| `pais_clerigos` | Capital dos Clérigos | Clérigo | planície; capital comercial e religiosa | ✅ |

As 5 cidades de cada país seguem o bioma do país (ex.: todas as cidades dos Magos ficam na neve).

### 1.2 Mapa e deslocamento

Visual no estilo Chrono Trigger; pontos de passagem entre cidades como em Final Fantasy Tactics.

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `squads` | o jogador pode ter vários esquadrões andando pelo mapa ao mesmo tempo | vários | ✅ |
| `squad_count_max` | máximo de esquadrões simultâneos | sem limite | ✅ |
| `squad_size` | personagens por esquadrão (ver `party_size`, Bloco 2) | 6 | ✅ |
| `travel_input` | escolhe o esquadrão, clica no destino (point & click) | ✅ | ✅ |
| `travel_visual` | o esquadrão anda visualmente pelo mapa enquanto o tempo passa | ✅ | ✅ |
| `travel_time` | tempo de viagem pré-definido por trecho | | ❓ |
| `waypoints` | pequenos pontos entre cidades (nem cidade, nem descanso) | sim | ✅ |
| `waypoint_encounters` | encontros aleatórios acontecem nos pontos entre cidades | sim | ✅ |
| `encounter_chance` | chance fixa (%) de encontro durante o caminho | valor ❓ | ❓ |
| `encounter_rarity` | encontros sorteiam a raridade dos inimigos | comum, raro, épico (% ❓) | ✅ |
| `time_flow` | tempo corre sozinho, com pausar, acelerar e desacelerar (estilo Xenonauts) | ✅ | ✅ |
| `time_speeds` | velocidades disponíveis | | ❓ |

### 1.3 Biomas

| bioma | país | particularidades (terreno, monstros de encontros aleatórios…) | status |
|-------|------|------------------------------------------------------------------|--------|
| floresta | Arqueiros | | ❓ |
| montanhas de neve | Magos | | ❓ |
| costa / portuário | Guerreiros | | ❓ |
| deserto | Ladrões | | ❓ |
| planície | Clérigos | | ❓ |

## Bloco 2 — Classes e atributos

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `classes` | classes jogáveis | Guerreiro, Arqueiro, Mago, Clérigo, Ladrão | ✅ |
| `attributes` | atributos primários | Força, Destreza, Inteligência, Vitalidade, Constituição, Velocidade | ✅ |
| `attribute_effects` | o que cada atributo afeta | tabela 2.1 | ✅ |
| `mp_source` | atributo que define MP | Inteligência | ✅ |
| `accuracy_source` | atributo de acerto | Destreza (⚠ reforça arqueiros; revisar no balanceamento) | ✅ |
| `evasion_source` | atributo de esquiva | Velocidade | ✅ |
| `crit_source` | crítico não vem de atributo: chance base baixa, aumentada só por itens | base baixa (valor ❓) | ✅ |
| `move_range` | alcance de movimento fixo por classe (itens podem aumentar no futuro); valores ❓ | por classe | ✅ |
| `class_role` | papel de cada classe no combate | tabela 2.2 | ✅ |
| `class_change` | avanços de classe pela rosa das classes (ver [rosa_das_classes.md](rosa_das_classes.md)) | sim | ✅ |
| `unique_classes` | personagens da história têm classe única (ex.: classe Princesa, classe Xamã) | sim | ✅ |
| `party_size` | personagens por esquadrão (pode mudar no balanceamento) | 6 | ✅ |
| `battle_roster` | o esquadrão inteiro entra na batalha | todos | ✅ |

### 2.1 Atributos

| atributo | sigla | efeito principal |
|----------|-------|------------------|
| Força | FOR | dano corpo a corpo |
| Destreza | DES | dano à distância; acerto |
| Inteligência | INT | dano mágico; MP |
| Vitalidade | VIT | HP |
| Constituição | CON | defesa |
| Velocidade | VEL | velocidade de enchimento da barra de ação (ver Bloco 4); esquiva |

### 2.2 Classes básicas

| classe | papel |
|--------|-------|
| Guerreiro | linha de frente, aguenta dano, corpo a corpo |
| Arqueiro | dano à distância, bom acerto |
| Mago | dano mágico em área, frágil |
| Clérigo | cura e suporte |
| Ladrão | rápido, ataques furtivos, usa o status "escondido" |

Valores por classe (atributos iniciais, HP/MP base, alcance de movimento) ficam para o balanceamento.

## Bloco 3 — Progressão do personagem

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `stat_allocation` | pontos de atributo distribuídos pelo jogador ao upar | estilo Ragnarok | ✅ |
| `max_level` | nível máximo | 99 | ✅ |
| `stat_points_per_level` | pontos de atributo por nível: quantidade fixa (não cresce com o nível) | 5 (provisório) | ✅ |
| `stat_cost_curve` | custo para subir um atributo cresce com o valor atual (como no Ragnarok) | crescente; fórmula ❓ | ✅ |
| `skill_points_per_level` | pontos de habilidade por nível, gastos na árvore da classe | 1 | ✅ |
| `skill_tree` | árvore em rosa dos ventos por classe: centro = base, cardeais = evoluções, diagonais = híbridas (ver [rosa_das_classes.md](rosa_das_classes.md)) | ✅ | ✅ |
| `xp_curve` | XP necessário por nível | ❓ | ❓ |
| `xp_mission_base` | XP base da missão, dado a todos que sobreviveram | por missão | ✅ |
| `xp_per_kill` | XP extra por inimigo derrotado, para quem derrotou | por inimigo | ✅ |
| `xp_example` | missão 100 XP + 10 por abate: Mago 2 abates = 120; Guerreiro 3 = 130; Clérigo 0 = 100 | exemplo | ✅ |
| `customization` | personalização visual | bem básica | ✅ |

Consequência aceita: classes de suporte (Clérigo) sobem de nível mais devagar, por abaterem menos inimigos.

## Bloco 4 — Combate

| variável | descrição | valor | status |
|----------|-----------|-------|--------|
| `turn_system` | barra de ação que enche com o tempo (ATB estilo Chrono Trigger); sem pontos de ação | ✅ | ✅ |
| `atb_fill` | a barra enche mais rápido quanto maior a Velocidade | proporcional a VEL | ✅ |
| `atb_formula` | fórmula exata de enchimento | | ❓ |
| `turn_options` | com a barra cheia: mover + agir, ou só agir; a ação sempre encerra o turno | ✅ | ✅ |
| `move_only` | só se mover e encerrar sem agir: a próxima barra começa em 50% (balancear depois) | 50% | ✅ |
| `extra_turns` | personagem muito mais rápido pode agir 2× antes de um inimigo lento | sim | ✅ |
| `atb_mode` | modo espera: quando a barra de um personagem enche, ele é selecionado automaticamente e todas as barras congelam até o jogador encerrar o turno | espera | ✅ |
| `turn_timeline` | HUD mostra a linha do tempo dos próximos turnos | sim | ✅ |
| `action_bar` | HUD com barra de skills e ações | sim | ✅ |
| `move_preview` | previsão de movimento antes de confirmar | sim | ✅ |
| `basic_actions` | ações disponíveis a todos (mover, atacar, defender, item, esperar…) | | ❓ |
| `status_list` | status existentes | ferimentos, escondido, … | ❓ |
| `permadeath` | HP zerado = personagem morto de vez | sim | ✅ |
| `nonlethal` | habilidades não letais / de concussão | futuro | ❓ |
| `wounds` | como funcionam os ferimentos (duram após a batalha?) | | ❓ |
| `hidden` | como se esconde e como é revelado | | ❓ |
| `combo` | o que é um combo (ataques em sequência, ações combinadas entre aliados…) | | ❓ |
| `shared_vision` | visão compartilhada entre o esquadrão (neblina de guerra, estilo XCOM/Xenonauts) | sim | ✅ |
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
