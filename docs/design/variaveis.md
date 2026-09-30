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
| `capital_services` | só as capitais têm interação: taverna, loja e recrutamento | capitais | ✅ |
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
| `classes` | classes jogáveis | Aprendiz (inicial) → Guerreiro, Arqueiro, Mago, Clérigo, Ladrão | ✅ |
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
| `skill_freedom` | pontos podem ir para qualquer direção da rosa, sem restrição de caminho | livre | ✅ |
| `respec` | redistribuir pontos de atributo/habilidade | não existe | ✅ |
| `recruitment` | recrutamento nas capitais, com lista de candidatos (estilo Xenonauts) | capitais | ✅ |
| `apprentice` | classe inicial genérica "Aprendiz"; ao passar do 1º nível o jogador escolhe a classe | ✅ | ✅ |
| `apprentice_promotion` | nível exato em que o Aprendiz escolhe a classe | 2 (provisório) | ❓ |
| `capital_recruits` | cada capital oferece também recrutas da sua classe, nível 1–2, com build já direcionada (ex.: magos com mais INT) | ✅ | ✅ |
| `starting_points` | todo personagem começa com pontos de atributo já distribuídos | 20 (provisório) | ✅ |
| `apprentice_spread` | Aprendizes vêm com distribuição variada que sugere uma classe (ex.: 12 FOR → guerreiro) | ✅ | ✅ |
| `recruit_cost` | custo em ouro; quanto maior o nível do recruta, mais caro (valores ❓) | ouro, cresce com o nível | ✅ |
| `apprentice_availability` | Aprendizes disponíveis em todas as capitais | todas | ✅ |
| `recruit_refresh` | a lista de candidatos de cada capital se renova | mensal | ✅ |
| `recruit_pool_size` | quantos candidatos por capital | | ❓ |
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
| `basic_actions` | ações básicas de todos (estilo Baldur's Gate): atacar, defender, usar item, arremessar item, esconder-se, prontidão; voar e entrar sob a terra para quem tiver a capacidade | ✅ | ✅ |
| `overwatch` | prontidão: em vez de agir, o personagem fica de prontidão e age se um inimigo entrar no alcance / linha de visão | ✅ | ✅ |
| `overwatch_triggers` | prontidão dispara uma vez; habilidades futuras (ex.: evolução Sniper) disparam mais | 1 | ✅ |
| `wounds` | pós-batalha: quem perdeu muito HP fica ferido e afastado por dias proporcionais ao HP perdido | ✅ | ✅ |
| `wound_formula` | dias de ferimento em função do HP perdido | | ❓ |
| `hidden` | qualquer personagem pode se esconder se nenhum inimigo o vê; Ladrão tem bônus para esconder-se mesmo à vista | ✅ | ✅ |
| `hidden_reveal` | no turno do escondido, aparecem os cones de visão inimigos; entrar num cone revela o personagem | ✅ | ✅ |
| `hidden_skills` | habilidades especiais que ignoram a revelação (ex.: evolução Ninja, passo da sombra) | futuro | ❓ |
| `combo` | dois personagens próximos com habilidades que combinam executam uma habilidade nova juntos (ver 4.1) | ✅ | ✅ |
| `combo_cost` | a barra do parceiro também é zerada; em troca, ele "fura a fila" e age junto com quem iniciou | ✅ | ✅ |
| `combo_range` | distância definida por combo (uns à distância, outros lado a lado) | por combo | ✅ |
| `elements` | todos os elementos existem e interagem entre si e com o terreno (ver [elementos.md](elementos.md)) | ✅ | ✅ |
| `element_matrix` | lista final de elementos, superfícies e interações | proposta em elementos.md | ❓ |
| `height` | atacar de cima dá mais alcance e mais acerto (não necessariamente mais dano) | ✅ | ✅ |
| `jump` | altura máxima que se sobe: 1 tile por padrão; algumas classes sobem mais (ex.: Ninja) | 1 | ✅ |
| `victory_conditions` | por missão (estilo XCOM): eliminar todos, derrotar alvo específico, extrair VIP, sequestrar, fugir de uma região | por missão | ✅ |

### 4.1 Combos

Inspirado nas técnicas duplas do Chrono Trigger.

- Dois personagens próximos, cada um com uma habilidade que combina com a do outro.
- Quem age primeiro inicia o combo; a ação do parceiro acontece junto, mesmo que ele
  esteja no fim da fila.
- O resultado é uma habilidade nova, mais forte que as duas separadas.
- Os combos são definidos junto com as habilidades, na criação de cada skill.

| habilidade A | habilidade B | combo |
|--------------|--------------|-------|
| Bola de Fogo (Mago) | Vendaval (Mago, vento) | Onda Flamejante — dano de fogo em área |
| Toque de Fogo (Mago) | Estocada (Guerreiro, avança em linha reta e acerta o primeiro inimigo) | Estocada Flamejante — ataque em linha com dano físico + fogo |

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
