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
| **VIT** Vitalidade | vida e resistência física (a antiga Constituição foi absorvida) | |

**Poder de um atributo** (curva do Ragnarok): `poder = valor + ⌊valor / 10⌋²` → 10 = 11, 20 = 24,
30 = 39, 40 = 56, 50 = 75, 70 = 119, 90 = 171. Especializar compensa, mas cada ponto custa mais
(abaixo).

## Nível e pontos

| | valor |
|--|-------|
| nível máximo | **60** |
| teto de atributo | **60** |
| custo para subir um atributo | `⌊(valor − 1) / 10⌋ + 2` (2 até 10, 3 até 20, … 7 de 51 a 59) |
| total de pontos de atributo | **696** = custo exato da build-alvo do nível 60: **60 / 50 / 40 / 30 / 10** (partindo de 1 em cada): 263 + 194 + 135 + 86 + 18 |
| pontos no nível 1 | **54** (pagos com o mesmo custo: ~+27 nos atributos, pela vocação da classe) |
| pontos por nível ganho | `3 + ⌊(nível + 2) / 4⌋` — 4 no nível 2, 6 no 10, 11 no 30, 18 no 60 (642 do 2 ao 60) |
| pontos de habilidade | **60**: 1 inicial + 1 por nível (aprende ou fortalece, até Nv 5); o Aprendiz guarda o seu até a promoção |
| XP para o próximo nível | `40 × nível^1,6` |

A build-alvo (`progression.targetBuild` em `balance.json`) define o total: trocar os números recalcula
o total e os pontos iniciais sozinhos (`TOTAL_ATTRIBUTE_POINTS` e `STARTING_ATTRIBUTE_POINTS` em
`rules/stats.ts`). O ganho cresce com o nível, como no Ragnarok: os níveis altos rendem mais pontos,
mas cada ponto também custa mais.

Vida base das classes subiu 25 (Guerreiro 70, Arqueiro 60, Mago 53, Clérigo 57, Ladino 57, Aprendiz 55)
para que nenhum golpe do começo do jogo derrube um herói de uma vez.

## Derivados

| valor | fórmula |
|-------|---------|
| vida máxima | `(base da classe + nível × vida/nível) × (1 + VIT × 2%)` × bônus de subclasse |
| MP máximo | `(base da classe + nível × MP/nível + bônus de subclasse) × (1 + INT × 2%)` × bônus |
| ataque físico | `ataque da arma + poder(atributo da arma)` — espada: FOR · arco e faca: DES · varinha e bastão: INT |
| poder mágico | `ataque da varinha/bastão + poder(INT)` |
| precisão (HIT) | `nível + DES + equipamento` |
| esquiva (FLEE) | `nível + ⌊VEL / 3⌋ + ⌊DES / 5⌋ + equipamento` |
| resistência física | `1 − (1 − VIT/(VIT+150)) × (1 − armadura/(armadura+50))`, no máximo 80% |
| resistência mágica | `INT / (INT + 150)`, no máximo 70% |
| crítico | 3% (feras 5%) + equipamento + habilidades; multiplicador 1,5× |
| intervalo de ação | `450 / (VEL + 25)` segundos — VEL 5 = 15 s, VEL 20 = 10 s (**provisório**) |

Vida e MP por nível de cada classe ficam em `classes.json` (`hpPerLevel`, `mpPerLevel`):
Guerreiro 10 / 1, Clérigo 8 / 2,2, Arqueiro 7 / 1,2, Ladino 7 / 1,2, Mago 6 / 2,5.

## Pipeline de um golpe

1. **Poder bruto** = base da arma + Σ poder(atributo) × peso. O peso padrão é 1 no atributo da arma
   (ou INT nas magias); a ficha pode trocar com `scaling` (ex.: lâmina arcana FOR 0,7 + INT 0,7).
2. **Multiplicador da habilidade** = `1 + poder da ficha × 0,1` (ataque básico = 1; poder 6 = 1,6×;
   suprema 16 = 2,6×), vezes o **nível da habilidade** (×1,00 a ×1,33).
3. **Modificadores ofensivos**: inspirado, frenesi, perícias, passivas…
4. **Resistência** do alvo (física ou mágica), depois de **penetração** e estados (quebrado,
   fortificado) mexerem na defesa efetiva.
5. **Elemento** (molhado + raio = 2×, fogo em gelo = 1,5× …), defender (½), congelado (+30% físico).
6. **Acerto**: físico `80 + precisão − esquiva` (+6 por degrau de altura, −10 se defendendo,
   −20/−40 de cobertura), entre 5% e 95%; magia `95 − (esquiva − nível) × 0,25`, entre 60% e 99%.
7. **Crítico** ×1,5 (+ dano crítico das passivas). Dano final arredondado, mínimo 1.

**Cura** = `(poder(INT) × 0,6 + bônus de cura) × multiplicador da habilidade` (+ % da vida do alvo,
quando a ficha tiver).

## Linha do tempo

Cada unidade enche a barra em `intervalo de ação` segundos. Depois de agir:

- sem agir (só andou ou esperou): a barra recomeça em 50%;
- agir: recomeça em `0 − 100 × (custo de tempo − 1)`. **Custo de tempo** (`timeMult`) é da
  habilidade: 1 = normal, 1,5 = demora 50% mais (todas as supremas), 0,7 = ação rápida.

Lento, veloz, frenesi e perícias de velocidade multiplicam a taxa. A rodada (ambiente, zonas,
regeneração) vira a cada 12 s.

## Simulação (dano por ação × dano por tempo)

`rules/balance_sim.ts` monta personagens com a build automática da classe em cada nível e mede com o
motor de verdade. DPA = dano médio do ataque básico (com acerto e crítico) contra um Arqueiro do mesmo
nível; habilidade = poder 6; DPM = dano por minuto do básico. Golpes = ataques básicos para
derrubar o alvo médio (Arqueiro), o tanque (Guerreiro) e a fera de menor raridade daquele nível.
Os testes (`tests/game/stats.test.ts`) garantem que o alvo médio sempre cai entre 2 e 12 golpes.

| nível | classe | vida | MP | DPA | habilidade | acerto | ação a cada | DPM | golpes (médio) | golpes (tanque) | golpes (fera) |
|------:|--------|-----:|---:|----:|-----------:|-------:|------------:|----:|---------------:|----------------:|---------------|
| 1 | Guerreiro | 108 | 9 | 25 | 41 | 81% | 17.3 s | 87 | 3 | 5 | 2 (Esquilo-Farpa) |
| 1 | Arqueiro | 72 | 12 | 25 | 41 | 94% | 15.5 s | 98 | 3 | 5 | 2 (Esquilo-Farpa) |
| 1 | Mago | 63 | 99 | 21 | 34 | 94% | 13.2 s | 97 | 4 | 6 | 2 (Esquilo-Farpa) |
| 1 | Clérigo | 89 | 33 | 20 | 38 | 77% | 15.5 s | 76 | 4 | 6 | 3 (Esquilo-Farpa) |
| 1 | Ladino | 68 | 11 | 20 | 32 | 90% | 12.9 s | 92 | 4 | 6 | 3 (Esquilo-Farpa) |
| 10 | Guerreiro | 290 | 19 | 34 | 55 | 79% | 17.3 s | 120 | 5 | 9 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Arqueiro | 148 | 25 | 35 | 55 | 95% | 13.2 s | 157 | 5 | 10 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Mago | 122 | 276 | 34 | 55 | 93% | 12.9 s | 159 | 5 | 9 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Clérigo | 242 | 67 | 30 | 62 | 74% | 15.5 s | 118 | 5 | 10 | 7 (Urso-Pardo-das-Cavas) |
| 10 | Ladino | 137 | 23 | 30 | 48 | 93% | 11.5 s | 156 | 5 | 11 | 6 (Urso-Pardo-das-Cavas) |
| 20 | Guerreiro | 534 | 31 | 49 | 79 | 78% | 15.5 s | 190 | 5 | 11 | 11 (Golem de Gelo Maciço) |
| 20 | Arqueiro | 240 | 41 | 51 | 81 | 95% | 11.5 s | 263 | 5 | 12 | 11 (Golem de Gelo Maciço) |
| 20 | Mago | 190 | 673 | 57 | 91 | 92% | 11.8 s | 289 | 5 | 9 | 9 (Golem de Gelo Maciço) |
| 20 | Clérigo | 456 | 115 | 42 | 89 | 70% | 14.1 s | 177 | 6 | 12 | 15 (Golem de Gelo Maciço) |
| 20 | Ladino | 217 | 38 | 41 | 66 | 95% | 9.2 s | 271 | 6 | 14 | 14 (Golem de Gelo Maciço) |
| 30 | Guerreiro | 912 | 43 | 69 | 110 | 81% | 15.5 s | 265 | 5 | 13 | 26 (Mamute-Rúnico) |
| 30 | Arqueiro | 351 | 55 | 75 | 121 | 95% | 9.6 s | 471 | 5 | 13 | 24 (Mamute-Rúnico) |
| 30 | Mago | 275 | 805 | 78 | 124 | 91% | 11.5 s | 403 | 5 | 11 | 20 (Mamute-Rúnico) |
| 30 | Clérigo | 770 | 171 | 44 | 97 | 68% | 14.1 s | 187 | 8 | 19 | 40 (Mamute-Rúnico) |
| 30 | Ladino | 310 | 52 | 48 | 76 | 95% | 6.9 s | 413 | 7 | 21 | 41 (Mamute-Rúnico) |
| 40 | Guerreiro | 1339 | 56 | 93 | 150 | 83% | 14.5 s | 385 | 5 | 16 | 21 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Arqueiro | 476 | 73 | 82 | 132 | 95% | 7.8 s | 634 | 6 | 21 | 24 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Mago | 393 | 699 | 93 | 148 | 90% | 9.8 s | 569 | 5 | 15 | 18 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Clérigo | 1074 | 244 | 70 | 168 | 62% | 13.2 s | 320 | 7 | 19 | 33 (Dragão-da-Clareira (Yggdrak)) |
| 40 | Ladino | 418 | 66 | 52 | 84 | 95% | 5.6 s | 566 | 9 | 33 | 40 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Guerreiro | 1608 | 66 | 117 | 188 | 84% | 14.5 s | 485 | 6 | 19 | 20 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Arqueiro | 607 | 100 | 91 | 146 | 95% | 6.1 s | 899 | 7 | 27 | 28 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Mago | 572 | 1101 | 87 | 138 | 88% | 8.2 s | 635 | 7 | 20 | 22 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Clérigo | 1477 | 312 | 71 | 168 | 62% | 12.5 s | 343 | 9 | 26 | 37 (Dragão-da-Clareira (Yggdrak)) |
| 50 | Ladino | 529 | 81 | 76 | 122 | 95% | 4.9 s | 926 | 8 | 32 | 33 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Guerreiro | 2484 | 87 | 105 | 168 | 82% | 12.2 s | 517 | 8 | 24 | 24 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Arqueiro | 806 | 139 | 92 | 146 | 95% | 4.9 s | 1124 | 9 | 31 | 30 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Mago | 743 | 983 | 83 | 133 | 86% | 6.6 s | 752 | 10 | 28 | 26 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Clérigo | 2126 | 363 | 73 | 161 | 67% | 9.2 s | 480 | 11 | 29 | 39 (Dragão-da-Clareira (Yggdrak)) |
| 60 | Ladino | 754 | 118 | 89 | 142 | 95% | 4.9 s | 1080 | 9 | 33 | 33 (Dragão-da-Clareira (Yggdrak)) |


Leitura: com o teto de 60 nos atributos, o dano por ação para de crescer perto do nível 40, enquanto
a vida segue subindo com o nível — no fim do jogo o alvo médio leva 8–11 golpes (antes 4–9). Armas de
nível alto são a alavanca prevista para isso. O Ladino continua o que age mais vezes (~5 s); o Mago tem
o maior dano por ação no meio do jogo e a menor vida; o Guerreiro aguenta 2–3× mais que o alvo médio.

## Bestiário na escala nova

- A faixa de níveis do design (1–99) foi comprimida para 1–60: `nível novo = 1 + (nível − 1) × 59/98`.
- Constituição virou Vitalidade (fica o maior dos dois).
- Vida das feras: `(20 + 8 × nível mínimo) × papel × raridade`, crescendo na faixa por
  `(10 + nível) / (10 + nível mínimo)`. Feras usam as mesmas fórmulas de precisão, esquiva,
  resistência e linha do tempo dos personagens.

## Encontros de novatos

Até o nível **4** (`encounters.noviceLevel`) o esquadrão é novato: grupos de 2–3 inimigos, sem emboscada,
nenhuma fera acima do nível do esquadrão (a folga de nível vale 1 a cada 4 níveis depois, até 3) e
humanos (bandidos, rebeldes) sem habilidades de teia — só ataque básico e passivas. Humanos genéricos
usam suas habilidades sempre no Nv 1. Um teste garante que, nesses níveis, nenhum golpe possível de um
inimigo tira mais de 60% da vida de um herói (sem crítico).

## Próximos passos de balanceamento

- Itens de nível alto: hoje as armas vão só até ataque 18, então no fim do jogo o atributo domina o dano.
- Afinar o intervalo de ação (450/(VEL+25)) e o custo de tempo de cada habilidade com a simulação.
- Custos de habilidade por nível (hoje 1 ponto por nível), pré-requisitos de atributo e resistências
  por elemento/estado.
