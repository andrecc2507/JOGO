# Sistema matemático

Fonte de design: [sistema matemático central (v0.2)](fontes/sistema_matematico.md). Referência:
Ragnarok Online clássico (pré-renovação), **sem Sorte**. Tudo é calculado em um lugar só —
`src/game/rules/stats.ts` — com os números em `src/game/data/balance.json`. Nenhuma habilidade
faz conta de personagem por conta própria: elas informam poder, escala e custo de tempo, e o motor faz o resto.

## Atributos

| atributo | faz | não faz |
|----------|-----|---------|
| **FOR** Força | poder físico (espadas e armas de força) | carga, conjuração, velocidade, esquiva |
| **DES** Destreza | precisão; poder de arcos e facas; um pouco de esquiva | reduzir tempo de conjuração |
| **VEL** Velocidade | frequência de ações na linha do tempo; esquiva | não é ASPD de MMORPG |
| **INT** Inteligência | poder mágico (varinhas, bastões, magias, cura), MP, resistência mágica | |
| **VIT** Vitalidade | vida (entra na fórmula da vida com a mesma curva de poder da FOR) | reduzir dano (isso é a armadura) |

**Poder de um atributo** (curva do Ragnarok): `poder = valor + ⌊valor / 10⌋²` → 10 = 11, 20 = 24,
30 = 39, 40 = 56, 50 = 75, 70 = 119, 90 = 171. Especializar compensa, mas cada ponto custa mais
(abaixo).

## Regra dos 5 golpes (âncora do balanceamento)

**Com atributos iguais, um ataque básico tira 1/5 da vida.** Um herói de **FOR 1** contra um
inimigo de **VIT 1**, no mesmo nível, com a arma de referência e sem armadura, precisa de
**exatamente 5 ataques básicos**. O mesmo vale para FOR 30 contra VIT 30, FOR 60 contra VIT 60,
em qualquer nível — e para DES (arcos, facas) e INT (varinha) contra VIT.

```
ataque = arma + poder(atributo de ataque) + 3 × nível
vida   = fator da classe × 5 × (arma de referência + poder(VIT) + 3 × nível)
```

- `poder(x) = x + ⌊x/10⌋²` (curva do Ragnarok, abaixo); `arma de referência = 7 + 0,2 × nível`
  (7 no nível 1, 19 no 60 — a arma "esperada" para o nível).
- Com atributo de ataque = VIT, arma = arma de referência e fator 1: `vida ÷ ataque = 5`.
- O que tira a luta de 5 golpes: **especialização** (FOR 40 contra VIT 15 derruba em ~3;
  VIT 40 contra FOR 15 aguenta ~8), **armadura** (`armadura/(armadura+50)`), **fator da classe**
  (Guerreiro 1,3 · Clérigo 1,15 · Arqueiro, Ladino e Aprendiz 1 · Mago 0,95), **arma** melhor ou
  pior que a de referência, **habilidades** (poder 6 = 1,6×), crítico, elemento e cobertura.
- O `3 × nível` está no ataque e na vida ao mesmo tempo: com o nível, a diferença entre atributos
  pesa menos e as lutas não encurtam no fim do jogo.
- Feras seguem a mesma regra; o fator delas vem da vida de design do bestiário
  (`vida ÷ (20 + 8 × nível mínimo) ÷ 1,8`, a fera comum mediana = 1) × raridade.

Números em `balance.json` (`attack`, `hp.hitsToKill`), fórmulas em `stats.maxHp`,
`stats.rawPower`, `stats.referenceWeapon` e `stats.levelAttack`. O teste
`regra dos 5 golpes` garante o caso FOR 1 × VIT 1 e os pares iguais em vários níveis.

## Nível e pontos

| | valor |
|--|-------|
| nível máximo | **60** |
| teto de atributo | **60** |
| custo para subir um atributo | `⌊(valor − 1) / 10⌋ + 2` (2 até 10, 3 até 20, … 7 de 51 a 59) |
| total de pontos de atributo | **696** = custo exato da build-alvo do nível 60: **60 / 50 / 40 / 30 / 10** (partindo de 1 em cada): 263 + 194 + 135 + 86 + 18 |
| pontos no nível 1 | **54** (pagos com o mesmo custo: ~+27 nos atributos, pela vocação da classe) |
| pontos por nível ganho | `3 + ⌊(nível + 2) / 4⌋` — 4 no nível 2, 6 no 10, 11 no 30, 18 no 60 (642 do 2 ao 60) |
| pontos de habilidade | **72**: 1 inicial + 1 por nível + 1 a cada 5 níveis (aprende ou fortalece, até Nv 5); o Aprendiz guarda o seu até a promoção. Dá duas supremas (28 cada) e meia teia de outra |
| XP para o próximo nível | `40 × nível^1,6` |

A build-alvo (`progression.targetBuild` em `balance.json`) define o total: trocar os números recalcula
o total e os pontos iniciais sozinhos (`TOTAL_ATTRIBUTE_POINTS` e `STARTING_ATTRIBUTE_POINTS` em
`rules/stats.ts`). O ganho cresce com o nível, como no Ragnarok: os níveis altos rendem mais pontos,
mas cada ponto também custa mais.


## Derivados

| valor | fórmula |
|-------|---------|
| vida máxima | `fator da classe × 5 × (arma de referência + poder(VIT) + 3 × nível)` × bônus de subclasse |
| MP máximo | `(base da classe + nível × MP/nível + bônus de subclasse) × (1 + INT × 2%)` × bônus |
| ataque físico | `arma + poder(atributo da arma) + 3 × nível` — espada, bastão e garras: FOR · arco e faca: DES |
| ataque mágico | `varinha/bastão + poder(INT) + 3 × nível` (o ataque básico da varinha é mágico) |
| precisão (HIT) | `nível + DES + equipamento` |
| esquiva (FLEE) | `nível + ⌊VEL / 3⌋ + ⌊DES / 5⌋ + equipamento` |
| resistência física | `armadura / (armadura + 50)`, no máximo 80% (a VIT já está na vida) |
| resistência mágica | `INT / (INT + 150)`, no máximo 70% |
| crítico | 3% (feras 5%) + equipamento + habilidades; multiplicador 1,5× |
| intervalo de ação | `450 / (VEL + 25)` segundos — VEL 5 = 15 s, VEL 20 = 10 s (**provisório**) |

Fator de vida (`hpFactor`) e MP por nível (`mpPerLevel`) ficam em `classes.json`:
Guerreiro 1,3 / 1, Clérigo 1,15 / 2,2, Arqueiro 1 / 1,2, Ladino 1 / 1,2, Mago 0,95 / 2,5.

## Pipeline de um golpe

1. **Poder bruto** = base da arma + Σ poder(atributo) × peso + 3 × nível. O peso padrão é 1 no
   atributo da arma (ou INT nas magias); a ficha pode trocar com `scaling` (ex.: lâmina arcana
   FOR 0,7 + INT 0,7).
2. **Multiplicador da habilidade** = `1 + poder da ficha × 0,1` (ataque básico = 1; poder 6 = 1,6×;
   suprema 16 = 2,6×), vezes o **nível da habilidade** (×1,00 a ×1,33).
3. **Modificadores ofensivos**: inspirado, frenesi, perícias, passivas…
4. **Resistência** do alvo (física ou mágica), depois de **penetração** e estados (quebrado,
   fortificado) mexerem na defesa efetiva.
5. **Elemento** (molhado + raio = 2×, fogo em gelo = 1,5× …), defender (½), congelado (+30% físico).
6. **Acerto**: físico `80 + precisão − esquiva` (+6 por degrau de altura, −10 se defendendo,
   −20/−40 de cobertura), entre 5% e 95%; magia `95 − (esquiva − nível) × 0,25`, entre 60% e 99%.
7. **Crítico** ×1,5 (+ dano crítico das passivas). Dano final arredondado, mínimo 1.

**Cura** = `((poder(INT) + 3 × nível) × 0,6 + bônus de cura) × multiplicador da habilidade` (+ % da
vida do alvo, quando a ficha tiver).

### Escala das habilidades (revisão)

Nenhuma habilidade (das 456 das teias e das 459 do bestiário) tem conta própria: todas passam pelo
mesmo poder bruto, escolhido pelo tipo:

| tipo | escala com | base |
|------|-----------|------|
| magia (`magic`) | **ataque mágico**: poder(INT) | varinha ou bastão, se empunhado |
| físico corpo a corpo (`physical`) | **ataque físico**: poder(FOR) — ou DES com faca | arma |
| físico à distância (`ranged`) | **ataque físico**: poder(DES) com arco/faca, FOR nos demais | arma |
| cura (`heal`) | poder(INT) × 0,6 | bônus de cura do equipamento |
| feras | poder(FOR) no físico, poder(INT) na magia | garras/presas da fera |

### Escala por subclasse

Cada teia (subclasse) define com que atributos escalam as suas habilidades físicas (e à distância),
mágicas e de cura — campo `scaling` do nó em `data/skills/trees/*.json`; uma habilidade pode ter o
próprio `scaling` por cima. Regra de equilíbrio: **puro = peso 1 num atributo**; misto = pesos que,
na build máxima (60/50/40/30/10, maior valor no maior peso), somam o mesmo poder (~93–96). Assim o
híbrido não bate mais que o especialista: ele ganha versatilidade e paga investindo em dois
atributos. A magia mista (com FOR ou DES) soma a arma empunhada; a magia pura só soma varinha ou
bastão. Entre parênteses: o poder da escala na build máxima.

| classe | subclasse | físico / à distância | magia | cura |
|--------|-----------|----------------------|-------|------|
| Arqueiro | Sniper | DES 1 (96) | — | — |
| Arqueiro | Trapper | DES 0,7 + INT 0,35 (93) | — | — |
| Arqueiro | Arqueiro Arcano | DES 0,55 + INT 0,55 (94) | INT 1 (96) | — |
| Arqueiro | Druida | DES 0,55 + INT 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Arqueiro | Especialista | DES 0,85 + INT 0,15 (93) | — | — |
| Arqueiro | Ranger | DES 0,8 + INT 0,25 (96) | INT 0,65 + DES 0,45 (96) | — |
| Arqueiro | Guardião Rúnico | DES 0,55 + INT 0,55 (94) | INT 0,85 + DES 0,15 (93) | — |
| Arqueiro | Atirador Rúnico | DES 0,55 + INT 0,55 (94) | DES 0,55 + INT 0,55 (94) | — |
| Clérigo | Monge | FOR 0,7 + VEL 0,35 (93) | — | — |
| Clérigo | Sacerdote | — | INT 1 (96) | INT 1 (96) |
| Clérigo | Inquisidor | FOR 0,55 + INT 0,55 (94) | INT 1 (96) | — |
| Clérigo | Paladino | FOR 0,7 + VIT 0,35 (93) | INT 0,55 + FOR 0,55 (94) | — |
| Clérigo | Zelote | FOR 0,65 + INT 0,45 (96) | — | — |
| Clérigo | Guardião da Fé | FOR 0,7 + VIT 0,35 (93) | — | — |
| Clérigo | Taumaturgo Sombrio | — | INT 1 (96) | INT 1 (96) |
| Clérigo | Templário | FOR 0,55 + INT 0,55 (94) | — | INT 0,75 + VIT 0,3 (94) |
| Guerreiro | Espadachim | FOR 0,7 + DES 0,35 (93) | — | — |
| Guerreiro | Arcano | FOR 0,55 + INT 0,55 (94) | INT 0,55 + FOR 0,55 (94) | — |
| Guerreiro | Berserker | FOR 1 (96) | FOR 1 (96) | — |
| Guerreiro | Escudeiro | FOR 0,65 + VIT 0,45 (96) | FOR 0,65 + VIT 0,45 (96) | — |
| Guerreiro | Duelista | FOR 0,55 + DES 0,35 + INT 0,25 (93) | — | — |
| Guerreiro | Mestre de Batalha | FOR 0,85 + DES 0,15 (93) | FOR 1 (96) | — |
| Guerreiro | Defensor | FOR 0,55 + VIT 0,35 + INT 0,25 (93) | INT 0,65 + VIT 0,45 (96) | INT 0,55 + VIT 0,55 (94) |
| Guerreiro | Campeão | FOR 0,75 + VIT 0,35 (98) | — | — |
| Ladino | Assassino | DES 0,65 + FOR 0,45 (96) | — | — |
| Ladino | Mercenário | FOR 0,7 + DES 0,35 (93) | — | — |
| Ladino | Ninja | DES 0,7 + VEL 0,35 (93) | INT 0,65 + DES 0,45 (96) | — |
| Ladino | Sabotador | DES 0,7 + INT 0,35 (93) | INT 0,55 + DES 0,55 (94) | — |
| Ladino | Sicário | DES 0,7 + FOR 0,35 (93) | INT 0,55 + DES 0,55 (94) | — |
| Ladino | Algoz | FOR 0,6 + DES 0,5 (95) | — | — |
| Ladino | Venenista (Viper) | DES 1 (96) | INT 0,55 + DES 0,55 (94) | INT 0,55 + DES 0,55 (94) |
| Ladino | Contrabandista | DES 1 (96) | — | — |
| Mago | Elementalista | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Caminho da Eletricidade | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Caminho do Fogo | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Caminho do Ar | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Caminho do Gelo | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Caminho da Água | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Caminho da Terra | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Cronomante (Tempo) | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Gravitacional | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Necromante | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Invocador | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Cataclisma | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Manipulador | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |
| Mago | Entropia | INT 0,55 + FOR 0,55 (94) | INT 1 (96) | INT 1 (96) |

O teste `escala das habilidades por subclasse` garante que todas ficam entre 90 e 100.

**Ajuste de força por teia (`powerMult`).** Como a escala só decide *em que* investir, a força de
cada subclasse é ajustada à parte: `powerMult` no nó multiplica o dano das habilidades da teia
(`dano × powerMult`, no mesmo ponto em que entram inspiração, resistência e elemento). Os valores
saem da simulação em massa (`npm run sim`, [simulacao.md](simulacao.md)); ausente = 1.

Correção feita na revisão: o **bastão** passou a golpear com FOR (como a maça do Ragnarok). Antes,
golpes físicos de Clérigo e Mago com bastão escalavam com INT. A INT continua sendo a das magias e
das curas; a varinha segue disparando magia no ataque básico. Arcos e facas escalam com DES, como no
Ragnarok.

## Ferimentos

Só fica ferido quem **chegou abaixo de 50% da vida em algum momento da luta** — mesmo que tenha
sido curado depois por poção, Clérigo ou habilidade. Dias de ferimento =
`⌈(1 − menor fração de vida) × 6⌉`: 49% → 4 dias, 25% → 5, quase morto → 6. Números em
`balance.json` (`wounds`), fórmula em `stats.woundDays`.

## Linha do tempo

Cada unidade enche a barra em `intervalo de ação` segundos. Depois de agir:

- sem agir (só andou ou esperou): a barra recomeça em 50%;
- agir: recomeça em `0 − 100 × (custo de tempo − 1)`. **Custo de tempo** (`timeMult`) é da
  habilidade: 1 = normal, 1,5 = demora 50% mais (todas as supremas), 0,7 = ação rápida.

Lento, veloz, frenesi e perícias de velocidade multiplicam a taxa. A rodada (ambiente, zonas,
regeneração) vira a cada 12 s.

## Quedas e desabamentos

- **Queda**: quem cai de mais níveis do que o salto aguenta (salto + 1) perde 6% da vida máxima por
  nível a mais (`fallDamage`). Voando não sofre.
- **Esmagado**: peça de prédio que cai em cima de alguém tira 25% da vida máxima + 4 por nível de
  espessura (`crushDamage`); a unidade fica em cima dos escombros.
- **Paredes**: golpes em peças de construção usam o mesmo poder bruto dos objetos (`structureDamage`);
  habilidades de área causam ×1,5 nas peças. Resistência por material em `TERRAIN[t].hp`.

## Simulação (dano por ação × dano por tempo)

`rules/balance_sim.ts` monta personagens com a build automática da classe em cada nível e mede com o
motor de verdade. DPA = dano médio do ataque básico (com acerto e crítico) contra um Arqueiro do mesmo
nível; habilidade = poder 6; DPM = dano por minuto do básico. Golpes = ataques básicos para
derrubar o alvo médio (Arqueiro), o tanque (Guerreiro) e a fera de menor raridade daquele nível.
Os testes (`tests/game/stats.test.ts`) garantem que o alvo médio sempre cai entre 2 e 12 golpes.

| nível | classe | vida | MP | DPA | habilidade | acerto | ação a cada | DPM | golpes (médio) | golpes (tanque) | golpes (fera) |
|------:|--------|-----:|---:|----:|-----------:|-------:|------------:|----:|---------------:|----------------:|---------------|
| 1 | Guerreiro | 125 | 9 | 29 | 46 | 81% | 17.3 s | 100 | 3 | 5 | 2 (Esquilo-Farpa) |
| 1 | Arqueiro | 70 | 12 | 29 | 46 | 94% | 15.5 s | 111 | 3 | 5 | 2 (Esquilo-Farpa) |
| 1 | Mago | 62 | 99 | 25 | 39 | 94% | 13.2 s | 112 | 3 | 6 | 3 (Esquilo-Farpa) |
| 1 | Clérigo | 118 | 33 | 8 | 42 | 77% | 15.5 s | 30 | 8 | 18 | 7 (Esquilo-Farpa) |
| 1 | Ladrão | 65 | 11 | 23 | 37 | 90% | 12.9 s | 107 | 3 | 6 | 3 (Esquilo-Farpa) |
| 10 | Guerreiro | 465 | 19 | 65 | 103 | 79% | 17.3 s | 224 | 4 | 7 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Arqueiro | 230 | 25 | 65 | 103 | 95% | 13.2 s | 293 | 4 | 8 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Mago | 204 | 276 | 62 | 99 | 93% | 12.9 s | 291 | 4 | 8 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Clérigo | 427 | 67 | 35 | 116 | 74% | 15.5 s | 136 | 7 | 13 | 12 (Urso-Pardo-das-Cavas) |
| 10 | Ladrão | 215 | 23 | 60 | 96 | 93% | 11.5 s | 312 | 4 | 8 | 6 (Urso-Pardo-das-Cavas) |
| 20 | Guerreiro | 858 | 31 | 111 | 177 | 78% | 15.5 s | 429 | 4 | 7 | 9 (Golem de Gelo Maciço) |
| 20 | Arqueiro | 410 | 41 | 111 | 177 | 95% | 11.5 s | 577 | 4 | 8 | 10 (Golem de Gelo Maciço) |
| 20 | Mago | 361 | 673 | 111 | 178 | 92% | 11.8 s | 563 | 4 | 8 | 10 (Golem de Gelo Maciço) |
| 20 | Clérigo | 819 | 115 | 60 | 192 | 70% | 14.1 s | 255 | 7 | 13 | 19 (Golem de Gelo Maciço) |
| 20 | Ladrão | 380 | 38 | 101 | 162 | 95% | 9.2 s | 661 | 4 | 9 | 10 (Golem de Gelo Maciço) |
| 30 | Guerreiro | 1394 | 43 | 173 | 276 | 81% | 15.5 s | 669 | 4 | 7 | 17 (Mamute-Rúnico) |
| 30 | Arqueiro | 595 | 55 | 166 | 265 | 95% | 9.6 s | 1039 | 4 | 8 | 19 (Mamute-Rúnico) |
| 30 | Mago | 532 | 805 | 157 | 252 | 91% | 11.5 s | 819 | 4 | 9 | 21 (Mamute-Rúnico) |
| 30 | Clérigo | 1315 | 171 | 70 | 224 | 68% | 14.1 s | 300 | 9 | 16 | 41 (Mamute-Rúnico) |
| 30 | Ladrão | 555 | 52 | 144 | 230 | 95% | 6.9 s | 1247 | 4 | 10 | 22 (Mamute-Rúnico) |
| 40 | Guerreiro | 1904 | 56 | 250 | 399 | 83% | 14.5 s | 1032 | 4 | 8 | 12 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Arqueiro | 795 | 73 | 203 | 325 | 95% | 7.8 s | 1573 | 4 | 11 | 15 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Mago | 727 | 699 | 195 | 312 | 90% | 9.8 s | 1199 | 4 | 10 | 16 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Clérigo | 1683 | 244 | 101 | 365 | 62% | 13.2 s | 458 | 8 | 18 | 34 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Ladrão | 740 | 66 | 184 | 295 | 95% | 5.6 s | 1991 | 5 | 12 | 17 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Guerreiro | 2214 | 66 | 322 | 515 | 84% | 14.5 s | 1330 | 4 | 9 | 11 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Arqueiro | 975 | 100 | 250 | 399 | 95% | 6.1 s | 2464 | 4 | 12 | 16 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Mago | 983 | 1101 | 207 | 331 | 88% | 8.2 s | 1516 | 5 | 12 | 18 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Clérigo | 2235 | 312 | 128 | 399 | 62% | 12.5 s | 613 | 8 | 18 | 31 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Ladrão | 915 | 81 | 250 | 400 | 95% | 4.9 s | 3035 | 4 | 12 | 16 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Guerreiro | 3128 | 87 | 335 | 536 | 82% | 12.2 s | 1653 | 4 | 9 | 13 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Arqueiro | 1210 | 139 | 279 | 446 | 95% | 4.9 s | 3418 | 5 | 12 | 17 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Mago | 1211 | 983 | 222 | 355 | 86% | 6.6 s | 2010 | 6 | 14 | 21 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Clérigo | 3053 | 363 | 171 | 427 | 67% | 9.2 s | 1120 | 8 | 14 | 28 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Ladrão | 1160 | 118 | 299 | 478 | 95% | 4.9 s | 3624 | 5 | 11 | 16 (Dragão-da-Clareira (Yggdrak)) |


Leitura (com a regra dos 5 golpes): especialista contra alvo médio (Arqueiro, VIT baixa e sem
armadura) cai em 3–5 golpes; contra o tanque (Guerreiro, VIT alta), 5–14. O Clérigo bate pouco no
básico (bastão com FOR baixa) e vive das magias e curas. Feras épicas e lendárias são lutas longas
de propósito (chefes de área).

## Bestiário na escala nova

- A faixa de níveis do design (1–99) foi comprimida para 1–60: `nível novo = 1 + (nível − 1) × 59/98`.
- Constituição virou Vitalidade (fica o maior dos dois).
- Vida das feras: regra dos 5 golpes com o fator da fera (`vida de design ÷ (20 + 8 × nível
  mínimo) ÷ 1,8`) × raridade, usando a VIT da fera no nível dela. Feras usam as mesmas fórmulas de precisão, esquiva,
  resistência e linha do tempo dos personagens.

## Encontros de novatos

Até o nível **4** (`encounters.noviceLevel`) o esquadrão é novato: grupos de 2–3 inimigos, sem emboscada,
nenhuma fera acima do nível do esquadrão (a folga de nível vale 1 a cada 4 níveis depois, até 3) e
humanos (bandidos, rebeldes) sem habilidades de teia — só ataque básico e passivas. Humanos genéricos
usam suas habilidades sempre no Nv 1. Um teste garante que, nesses níveis, nenhum golpe possível de um
inimigo tira mais de 65% da vida de um herói (sem crítico).

## Próximos passos de balanceamento

- Itens de nível alto: hoje as armas vão só até ataque 18, então no fim do jogo o atributo domina o dano.
- Afinar o intervalo de ação (450/(VEL+25)) e o custo de tempo de cada habilidade com a simulação.
- Custos de habilidade por nível (hoje 1 ponto por nível), pré-requisitos de atributo e resistências
  por elemento/estado.
