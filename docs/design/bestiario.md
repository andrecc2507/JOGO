# Bestiário

Fonte de design: [`fontes/bestiario_original.md`](fontes/bestiario_original.md) — 125 criaturas, 25 por bioma.
Fichas do jogo: `src/game/data/bestiary/creatures.json` (editáveis em Menu → Bestiário).

| categoria do design | raridade no jogo | por bioma | faixa de NV típica |
|---------------------|------------------|-----------|--------------------|
| Animais básicos     | Comum            | 10        | 1–20               |
| Criaturas mágicas   | Raro             | 8         | 8–36               |
| Épicas              | Épico            | 5         | 30–62              |
| Lendárias           | Lendário         | 2         | 60–99              |

Extra: **Tentáculo do Kraken** (`summonOnly`) — só aparece invocado pelo Kraken.

## Como uma ficha vira números

A ficha descreve a criatura **no nível mínimo**. Ao aparecer num nível maior, atributos, HP e XP
crescem na proporção `(10 + nível) / (10 + nível mínimo)` (`levelScale` em `battle/units.ts`);
a Velocidade sobe +0,3 por nível.

Os valores iniciais foram gerados por papel (ágil, caçador, bruto, tanque, conjurador, suporte) e
raridade, e depois simulados (ver “Balanceamento”). São **provisórios**: ajuste no editor.

| raridade | HP × | poder das habilidades × | XP × |
|----------|------|-------------------------|------|
| Comum    | 1,8  | 1,0                     | 1    |
| Raro     | 1,9  | 1,4                     | 1,6  |
| Épico    | 3,3  | 2,0                     | 4    |
| Lendário | 2,6  | 1,7                     | 10   |

## Habilidades

Cada habilidade tem **tipo**, alcance, poder, recarga, formato (alvo único, raio, linha, cone),
elemento, status no alvo e **efeitos avançados** (`fx`). O motor não tem código por criatura:
toda habilidade é uma combinação dos blocos abaixo (`SkillFx` em `data/types.ts`). O editor mostra
um resumo gerado a partir dos dados (o que o motor realmente faz) acima de cada habilidade.

| tipo | o que faz |
|------|-----------|
| `physical` / `ranged` / `magic` | ataque (físico usa FOR + arma natural; magia usa INT) |
| `buff` / `heal` | status ou cura em aliados na área |
| `utility` | efeito em si (esconder, teleportar, escudo, limpar status…) |
| `summon` | invoca criaturas |
| `passive` | sempre ativa |
| `reaction` | dispara sozinha ao sofrer um golpe (limite por rodada) |

### Blocos de efeito (`fx`)

| bloco | efeito |
|-------|--------|
| `noDamage` | só aplica status (chance ~85% ajustada pela INT) |
| `hits` | vários golpes por uso |
| `push` / `pull` | empurra / puxa N m (bater em obstáculo fere) |
| `retreat` | recua N m depois de atacar |
| `leap` / `behind` | salta para perto do alvo / surge atrás dele antes de golpear |
| `pierce` | ignora parte da defesa |
| `lifesteal`, `mpBurn`, `dispel`, `breakItem` | rouba vida, queima MP, remove reforços, destrói um utilitário |
| `vs` | multiplicador contra alvos com status (`ferido`, `fraco`, `na_agua`, `el:sombra`…) |
| `fromHiding` | multiplicador se a criatura estava escondida |
| `randomTargets` (+ `spareOne`) | atinge N inimigos aleatórios em qualquer lugar (99 = todos) |
| `grab` | o status `preso`/`aprisionado` fica preso à criatura: solta se ela cair ou levar golpe ≥ 12% da vida (ou do elemento em `releaseOn`) |
| `link` | Fios do Destino: divide o dano recebido com N inimigos |
| `drainToShield`, `shield` | dano drenado vira escudo / escudo direto |
| `surface` | deixa elemento no chão (fogo, água, gelo, veneno, fumaça…) |
| `hide`, `teleport`, `cleanse`, `healPct`, `self`, `reveal` | utilidades |
| `requires` | só pode usar na situação (neve, parada, pouca vida…) |
| `evasion` + `when`, `reduce`, `immune`, `ignoreOnce`, `absorb` | defesas passivas |
| `fury`, `pack`, `flank`, `critBonus`, `pierce` (passiva), `vs` (passiva) | ofensivas passivas |
| `regen` + `when` | regeneração (ex.: só parada, só na água, só se não foi atingida) |
| `fly`, `seeHidden`, `pursuit`, `focusWeak`, `bloodSense` | movimento e comportamento |
| `aura` | a cada rodada aplica status/dano nos inimigos próximos (99 = arena toda) |
| `revive` | vira semente/ovo; se não for destruída a tempo, renasce (`unless`: elemento que impede) |
| `deathBurst` | explode ao cair |
| `minionShield` | imune enquanto suas invocações vivem |
| `summonStart`, `summonEvery`, `summonAt` | invocações no início, a cada N rodadas, ou em 75/50/25% da vida |
| `stances` | ciclo de posturas (dano, esquiva, imune a magia, roubo de vida, regeneração, elemento, espinhos) |
| `special` | `karma`, `momentum`, `hourglass`, `thermal_shock`, `tide_growth`, `hydra`, `storm_eye`, `pain_echo`, `frozen_blood`, `straw_cloak` |

### Reações

`on`: golpe físico, corpo a corpo, à distância, magia, qualquer, crítico, pesado (≥ 15% da vida).
`do`: esquiva, anula, reflete, contra-ataca, pune o atacante (dano/status), esquiva e recua,
troca dois inimigos de lugar, divide-se (invoca uma cópia). Padrão: 1 vez por rodada.

### Status novos

Sangramento, Atordoado, Lento (lento + lento = imobilizado), Imobilizado, Derrubado, Apavorado,
Desarmado, Silenciado, Confuso, Armadura quebrada, Ferida aberta (sem cura), Agarrado, Aprisionado,
Marcado (explode ao expirar), Fortificado, Veloz, Afiado, Regenerando, Camuflado, Refletindo magia,
Intangível, Duplicatas, Enfraquecido, Itens congelados, Adormecido (semente/ovo).

## Mecânicas diferenciadas (épicos e lendários)

| criatura | no jogo |
|----------|---------|
| Ent-Guardião — Coração da Floresta | vira semente com 12% da vida; se sobreviver 3 turnos, revive com 50% |
| Quimera — Alternância de Mentes | postura muda a cada rodada: Leão (+30% dano), Bode (imune a magia), Cobra (rouba vida) |
| Aracne-Mãe — Fios do Destino | liga a vida a 2 inimigos por 3 rodadas; rompe se eles se afastarem > 6 m |
| Lobo-Guará — Predador da Lua | aura: inimigos a 3 m ficam cegos; +50% de crítico |
| Coruja-da-Lua — Inversão de Gravidade | alvos imobilizados e marcados: caem (dano) quando a marca expira |
| Leshy — Fusão com a Mata / Prole | some e regenera; invoca 4 Fungos + 2 Ursos-Chifre e fica imune enquanto vivem; renasce, salvo se morto por fogo |
| Yggdrak — Drenagem Vital | drena a área, remove reforços e converte em escudo |
| Mantícora — Voo Predatório | agarra (aprisionado) e marca: a vítima despenca quando a marca expira |
| Gorgona — Reflexo Condenado | 50% de chance de ricochete, até 3 espelhos por rodada |
| Pássaro-Trovão — Sobrecarga | marca + eletrocuta 2 inimigos; a carga explode ao expirar |
| Bisão-Monstro — Estouro Inercial | acumula embalo a cada rodada sem golpe pesado (+35% por nível, até 4) |
| Espírito-do-Trigo — Estações | Primavera (cura), Verão (fogo), Outono (enfraquece), Inverno (fortificado + espinhos) |
| Corredor — Dilema do Tempo | todos os inimigos ficam lentos, menos um |
| Quirin — Balança do Carma | quem mais o feriu na rodada é marcado: seus golpes o curam por 2 rodadas |
| Yeti — Abraço Isotérmico | aprisiona e drena vida; fogo nele solta a vítima |
| Wyvern — Teto de Gelo | estalactites em 3 inimigos ao acaso, deixando gelo |
| Remorhaz — Choque Térmico | gelo nele explode a carapaça (dano de fogo em área) e ele passa a sofrer +50% de dano físico |
| Caminhante-das-Montanhas — Célula | prisão de gelo (aprisionado) que solta com golpe forte no gigante |
| Mamute-Rúnico — Ressonância | reflete magias por 3 rodadas |
| Cryon — Olho da Tempestade | por 4 rodadas, quem estiver a mais de 2 m do olho (que se move) sofre frio |
| Skadi — Sangue Congelado | ao perder metade da vida, o chão vira gelo num raio de 3 m |
| Verme das Dunas — Engolir Vivo | aprisiona até o verme levar golpe forte ou cair |
| Golem-de-Arenito — Ampulheta | se o grupo não causar 25% da vida dele em 4 rodadas, ele recupera tudo o que perdeu |
| Fênix — Cinzas Renascidas | explode ao cair e vira ovo; renasce em 2 turnos com 50% e fortalecida |
| Apopis — Areia Movediça Global | puxa todos 3 m e enlameia |
| Ifrit — Calor Opressivo | aura na arena toda: queimando a cada rodada |
| Megalo — Arrasto para o Abismo | aprisiona até levar golpe forte |
| Hidra — Regeneração Decapitada | em 66% e 33% da vida ganha uma cabeça (+1 bote), salvo se o golpe for de fogo ou veneno |
| Tratador de Ondas — Balanço da Maré | Fluxo (+30% dano) ↔ Refluxo (+30 esquiva, cura) a cada 3 rodadas |
| Caminhante-das-Marés — Absorção | água (poça ou golpe) o faz crescer: +20% de vida e +10% de dano, até 5× |
| Kraken — Alvos Múltiplos / Cardume | começa com 4 tentáculos e é imune enquanto houver invocações; em 75/50/25% invoca lulas e tubarões |
| Scylla — Eco de Dor / Crias | metade do dano mágico recebido volta num inimigo aleatório; invoca sereias e caranguejos no início e a cada 5 rodadas |

### Aproximações (o motor ainda não tem a mecânica completa)

- **Tamanho > 1 tile** continua só visual: toda criatura ocupa 1 tile.
- **Comandar a Fera** (Leshy): ainda não há pets do jogador; vira confusão + medo.
- **Olhar Sedutor** (Lamia): confusão + enfraquecido (não troca de lado).
- **Guia Enganoso / Canto Melancólico / Guia para o Abismo**: puxam o alvo e confundem.
- **Mapa interno do Verme** e **cristais do Ifrit**: viraram aprisionamento e aura simples.
- **Ampulheta**: no lugar de quebrar o objeto, o grupo precisa causar 25% da vida do golem.
- Armas "derretidas"/"quebradas" viram Armadura quebrada / Desarmado temporários.

### Habilidades criadas por falta de descrição (propostas — revisar)

- **Foca-Leopardo**: Bote do Gelo Fino, Nado Gélido, Mordida Arrastante.
- **Caranguejo-Recife**: Recolher-se em Coral, Pinça de Recife (só Invocar Corrente veio no arquivo).
- **Polvo-Mímico-Mágico**: Mimetismo, Voz Copiada, Tentáculos Mágicos.
- **Quelone-Ilha**: Casco-Ilha, Mordida Abissal, Maré Viva, Vida do Casco, Afundar.
- **Esfinge-Guardiã** não tem mecânica diferenciada no arquivo (ficou com 4 habilidades).

## Balanceamento (simulação)

Cada criatura no NV mínimo contra 4 membros do mesmo nível (6 para lendárias), IA dos dois lados,
3 batalhas cada:

| grupo | rodadas | vitórias do esquadrão | membros perdidos por luta |
|-------|---------|-----------------------|---------------------------|
| 3 comuns | 2,3 | 100% | 0,05 |
| 2 raros | 3,6 | 94% | 0,4 |
| 1 épico | 5,0 | 91% | 0,8 |
| 1 lendário (vs 6) | 5,9 | 20% | 2,9 |

Lendárias funcionam como MVPs: as invocações decidem a luta. Encontros só trazem feras cuja faixa
começa até 3 níveis acima do encontro (`LEVEL_SLACK`); sem nenhuma que caiba, a raridade desce.

Constantes do motor (`battle/creature_fx.ts`): `MAX_SUMMONS` 8, `SUMMON_LEVEL_GAP` 12,
`SUMMON_START_DELAY` 2, `AREA_FALLOFF` 0,7, `GRAB_BREAK_PCT` 0,12, `MARK_PCT` 0,15,
`DOT_PCT` sangramento 5% · agarrado 6% · aprisionado 8%.
