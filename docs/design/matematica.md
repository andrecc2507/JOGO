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
| atributos iniciais | 1 em cada + 25 pontos distribuídos pela vocação da classe |
| pontos de atributo por nível | `3 + ⌊nível / 5⌋` (nível 2: 3 · nível 30: 9 · nível 60: 15) — 519 do 2 ao 60 |
| custo para subir um atributo | `⌊(valor − 1) / 10⌋ + 2` (2 até 10, 3 até 20, … 11 no 91) |
| pontos de habilidade | 1 por nível + 1 inicial para recrutas de classe (aprende ou fortalece, até Nv 5) |
| XP para o próximo nível | `40 × nível^1,6` |

Nível e atributos ficam separados: o nível dá pontos, vida e MP de base; os atributos dão identidade.
Com o custo crescente, no nível 60 um atributo puro chega a ~90 (quase nada no resto) e uma build
equilibrada fica em ~70 + ~50.

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

- só mover: a barra recomeça em 50%;
- agir: recomeça em `0 − 100 × (custo de tempo − 1)`. **Custo de tempo** (`timeMult`) é da
  habilidade: 1 = normal, 1,5 = demora 50% mais (todas as supremas), 0,7 = ação rápida.

Lento, veloz, frenesi e perícias de velocidade multiplicam a taxa. A rodada (ambiente, zonas,
regeneração) vira a cada 12 s.

## Simulação (dano por ação × dano por tempo)

`rules/balance_sim.ts` monta personagens com a build automática da classe em cada nível e mede com o
motor de verdade. DPA = dano médio do ataque básico (com acerto e crítico) contra um Arqueiro do mesmo
nível; habilidade = poder 6; DPM = dano por minuto do básico. Golpes = ataques básicos para
derrubar o alvo médio (Arqueiro), o tanque (Guerreiro) e a fera de menor raridade daquele nível.
Os testes (`tests/game/stats.test.ts`) garantem que o alvo médio sempre cai entre 2 e 10 golpes.

| nível | classe | vida | MP | DPA | habilidade | acerto | ação a cada | DPM | golpes (médio) | golpes (tanque) | golpes (fera) |
|------:|--------|-----:|---:|----:|-----------:|-------:|------------:|----:|---------------:|----------------:|---------------|
| 1 | Guerreiro | 74 | 9 | 24 | 38 | 82% | 17.3 s | 82 | 2 | 4 | 2 (Esquilo-Farpa) |
| 1 | Arqueiro | 45 | 11 | 31 | 50 | 95% | 15 s | 125 | 2 | 3 | 2 (Esquilo-Farpa) |
| 1 | Mago | 35 | 96 | 27 | 44 | 94% | 13.2 s | 123 | 2 | 3 | 2 (Esquilo-Farpa) |
| 1 | Clérigo | 55 | 34 | 23 | 45 | 76% | 15.5 s | 88 | 2 | 4 | 2 (Esquilo-Farpa) |
| 1 | Ladino | 41 | 11 | 20 | 32 | 90% | 12.2 s | 97 | 3 | 4 | 3 (Esquilo-Farpa) |
| 10 | Guerreiro | 244 | 19 | 32 | 51 | 82% | 17.3 s | 111 | 4 | 8 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Arqueiro | 116 | 25 | 35 | 55 | 95% | 12.9 s | 162 | 4 | 8 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Mago | 93 | 207 | 34 | 55 | 93% | 12.9 s | 159 | 4 | 7 | 6 (Urso-Pardo-das-Cavas) |
| 10 | Clérigo | 195 | 67 | 31 | 62 | 74% | 15.5 s | 119 | 4 | 8 | 7 (Urso-Pardo-das-Cavas) |
| 10 | Ladino | 108 | 23 | 24 | 38 | 91% | 10.7 s | 132 | 5 | 11 | 8 (Urso-Pardo-das-Cavas) |
| 20 | Guerreiro | 464 | 31 | 52 | 83 | 80% | 16.7 s | 187 | 4 | 9 | 11 (Golem de Gelo Maciço) |
| 20 | Arqueiro | 200 | 40 | 49 | 79 | 95% | 11.8 s | 249 | 4 | 11 | 12 (Golem de Gelo Maciço) |
| 20 | Mago | 157 | 439 | 55 | 88 | 92% | 11.8 s | 279 | 4 | 9 | 9 (Golem de Gelo Maciço) |
| 20 | Clérigo | 360 | 114 | 41 | 87 | 71% | 14.5 s | 171 | 5 | 11 | 16 (Golem de Gelo Maciço) |
| 20 | Ladino | 182 | 37 | 36 | 58 | 95% | 9.6 s | 227 | 6 | 15 | 16 (Golem de Gelo Maciço) |
| 30 | Guerreiro | 829 | 43 | 58 | 93 | 84% | 16.1 s | 216 | 5 | 13 | 32 (Mamute-Rúnico) |
| 30 | Arqueiro | 309 | 55 | 64 | 102 | 95% | 10 s | 382 | 5 | 13 | 29 (Mamute-Rúnico) |
| 30 | Mago | 233 | 661 | 74 | 119 | 92% | 11.5 s | 386 | 4 | 10 | 21 (Mamute-Rúnico) |
| 30 | Clérigo | 620 | 167 | 43 | 95 | 68% | 14.1 s | 184 | 7 | 17 | 43 (Mamute-Rúnico) |
| 30 | Ladino | 276 | 52 | 45 | 72 | 95% | 7.4 s | 366 | 7 | 18 | 44 (Mamute-Rúnico) |
| 40 | Guerreiro | 1256 | 55 | 79 | 127 | 84% | 15 s | 317 | 5 | 15 | 26 (Dragão-da-Clareira) |
| 40 | Arqueiro | 422 | 75 | 80 | 128 | 95% | 8.2 s | 587 | 5 | 16 | 25 (Dragão-da-Clareira) |
| 40 | Mago | 306 | 992 | 96 | 153 | 90% | 11.5 s | 499 | 5 | 12 | 18 (Dragão-da-Clareira) |
| 40 | Clérigo | 1005 | 233 | 61 | 145 | 63% | 14.1 s | 262 | 7 | 18 | 39 (Dragão-da-Clareira) |
| 40 | Ladino | 374 | 66 | 49 | 79 | 95% | 6 s | 493 | 8 | 27 | 43 (Dragão-da-Clareira) |
| 50 | Guerreiro | 1686 | 66 | 101 | 161 | 87% | 14.5 s | 416 | 5 | 19 | 25 (Dragão-da-Clareira) |
| 50 | Arqueiro | 539 | 93 | 104 | 166 | 95% | 6.9 s | 903 | 5 | 19 | 24 (Dragão-da-Clareira) |
| 50 | Mago | 394 | 1139 | 131 | 210 | 89% | 11 s | 716 | 4 | 13 | 16 (Dragão-da-Clareira) |
| 50 | Clérigo | 1447 | 309 | 70 | 180 | 58% | 13.6 s | 310 | 7 | 22 | 41 (Dragão-da-Clareira) |
| 50 | Ladino | 474 | 80 | 60 | 97 | 95% | 5.1 s | 716 | 9 | 34 | 44 (Dragão-da-Clareira) |
| 60 | Guerreiro | 2127 | 80 | 122 | 196 | 87% | 14.1 s | 522 | 5 | 17 | 25 (Dragão-da-Clareira) |
| 60 | Arqueiro | 655 | 116 | 135 | 216 | 95% | 7 s | 1152 | 5 | 17 | 24 (Dragão-da-Clareira) |
| 60 | Mago | 481 | 1500 | 156 | 250 | 88% | 10.2 s | 917 | 4 | 12 | 16 (Dragão-da-Clareira) |
| 60 | Clérigo | 1589 | 403 | 95 | 247 | 57% | 13.2 s | 429 | 7 | 18 | 37 (Dragão-da-Clareira) |
| 60 | Ladino | 579 | 95 | 73 | 117 | 95% | 4.5 s | 965 | 9 | 31 | 44 (Dragão-da-Clareira) |


Leitura: o Ladino bate menos por ação, mas age a cada ~4,5 s no fim do jogo (o Guerreiro, a cada
~14 s); o Mago tem o maior dano por ação e a menor vida; o Guerreiro aguenta 2–4× mais que o alvo
médio. Feras comuns caem em 2–8 golpes; raras (~12), épicas e lendárias (16–44) são chefes para o
esquadrão.

## Bestiário na escala nova

- A faixa de níveis do design (1–99) foi comprimida para 1–60: `nível novo = 1 + (nível − 1) × 59/98`.
- Constituição virou Vitalidade (fica o maior dos dois).
- Vida das feras: `(20 + 8 × nível mínimo) × papel × raridade`, crescendo na faixa por
  `(10 + nível) / (10 + nível mínimo)`. Feras usam as mesmas fórmulas de precisão, esquiva,
  resistência e linha do tempo dos personagens.

## Próximos passos de balanceamento

- Itens de nível alto: hoje as armas vão só até ataque 18, então no fim do jogo o atributo domina o dano.
- Afinar o intervalo de ação (450/(VEL+25)) e o custo de tempo de cada habilidade com a simulação.
- Custos de habilidade por nível (hoje 1 ponto por nível), pré-requisitos de atributo e resistências
  por elemento/estado.
