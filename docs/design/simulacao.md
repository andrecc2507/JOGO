# Simulação em massa (balanceamento)

Gerado por `npm run sim` (600 batalhas IA × IA: 5 heróis montados por subclasse × 6 inimigos do bestiário no mesmo nível; mapas de natureza e cidades com prédios e barris; 35% à noite com patrulhas).

- Vitórias do esquadrão: **72%**
- Rodadas por batalha (média): **6.5**
- Batalhas sem fim (700 turnos): **0** · erros: **0**

## Uso das mecânicas (total nas batalhas)

| Mecânica | Vezes |
|---|---|
| empurrões | 165 |
| quedas | 9 |
| explosões de pólvora | 287 |
| desabamentos | 8 |
| supressões | 337 |
| tiros perdidos que acertam | 29 |
| confinamentos | 0 |
| concentração quebrada | 43 |
| caídos sangrando | 1741 |
| estabilizações | 545 |
| sangrou até a morte | 568 |
| portas abertas | 49 |
| construções | 5 |
| lustres | 0 |
| arremessos | 915 |
| sinos | 0 |

## Subclasses (dano e cura por batalha, abates, sobrevivência)

| Subclasse | Batalhas | Contribuição (1 = média) | Dano/batalha | Cura/batalha | Abates | Sobreviveu |
|---|---|---|---|---|---|---|
| clerigo/inquisidor | 116 | **1.41** | 636 | 1 | 1.76 | 78% |
| mago/necro | 110 | **1.40** | 609 | 16 | 1.35 | 61% |
| ladrao/mercenario | 103 | **1.38** | 583 | 40 | 1.57 | 44% |
| arqueiro/sniper | 115 | **1.31** | 599 | 2 | 1.69 | 70% |
| ladrao/ninja | 115 | **1.31** | 554 | 1 | 0.83 | 53% |
| mago/gravitacional | 118 | **1.29** | 566 | 3 | 1.19 | 62% |
| clerigo/sacerdote | 126 | **1.23** | 239 | 640 | 0.31 | 64% |
| ladrao/contrabandista | 37 | **1.22** | 849 | 1 | 1.30 | 68% |
| ladrao/sicario | 37 | **1.19** | 664 | 2 | 1.27 | 54% |
| ladrao/algoz | 35 | **1.18** | 712 | 0 | 1.34 | 57% |
| ladrao/sabotador | 115 | **1.15** | 529 | 1 | 0.95 | 43% |
| ladrao/assassino | 126 | **1.12** | 526 | 1 | 1.30 | 38% |
| guerreiro/berserker | 120 | **1.09** | 462 | 2 | 1.34 | 73% |
| mago/elementalista | 120 | **1.08** | 474 | 2 | 1.39 | 48% |
| arqueiro/arcano | 101 | **1.03** | 482 | 1 | 0.85 | 54% |
| guerreiro/espadachim | 107 | **1.02** | 576 | 1 | 1.18 | 64% |
| ladrao/viper | 27 | **0.96** | 560 | 1 | 1.00 | 52% |
| guerreiro/arcano | 100 | **0.96** | 411 | 3 | 0.95 | 74% |
| arqueiro/guardiao_runico | 27 | **0.93** | 487 | 2 | 0.78 | 70% |
| clerigo/monge | 95 | **0.90** | 302 | 100 | 0.51 | 49% |
| arqueiro/atirador_runico | 50 | **0.89** | 522 | 1 | 1.02 | 68% |
| mago/manipulador | 34 | **0.86** | 467 | 0 | 1.06 | 68% |
| arqueiro/especialista | 31 | **0.83** | 483 | 0 | 1.13 | 61% |
| mago/entropia | 35 | **0.82** | 397 | 2 | 1.03 | 66% |
| clerigo/paladino | 112 | **0.79** | 285 | 21 | 0.71 | 59% |
| arqueiro/druida | 130 | **0.78** | 193 | 195 | 0.45 | 55% |
| arqueiro/ranger | 36 | **0.78** | 464 | 5 | 1.03 | 61% |
| arqueiro/trapper | 115 | **0.78** | 346 | 2 | 0.70 | 40% |
| mago/invocador | 37 | **0.77** | 392 | 0 | 0.76 | 68% |
| guerreiro/duelista | 47 | **0.73** | 425 | 1 | 0.79 | 79% |
| guerreiro/mestre | 35 | **0.73** | 428 | 0 | 0.77 | 83% |
| guerreiro/campeao | 33 | **0.71** | 355 | 0 | 0.67 | 94% |
| guerreiro/escudeiro | 124 | **0.71** | 277 | 1 | 0.70 | 56% |
| guerreiro/defensor | 41 | **0.70** | 455 | 1 | 0.68 | 73% |
| mago/cataclisma | 38 | **0.67** | 488 | 0 | 1.05 | 71% |
| mago/tempo | 111 | **0.66** | 303 | 0 | 0.86 | 52% |
| clerigo/taumaturgo | 32 | **0.45** | 274 | 0 | 0.28 | 66% |
| clerigo/zelote | 44 | **0.44** | 223 | 0 | 0.36 | 64% |
| clerigo/templario | 31 | **0.42** | 233 | 1 | 0.42 | 77% |
| clerigo/guardiao_fe | 34 | **0.41** | 199 | 0 | 0.41 | 71% |

## Como ler

- Contribuição mede **dano + cura** relativos à média; tanques (templário, guardião da fé, defensor, escudeiro) e
  suportes de controle ficam naturalmente abaixo de 1, porque o valor deles (absorver golpes, atrasar, enfraquecer)
  não vira número. A sobrevivência alta deles é o sinal certo.
- Alavanca de ajuste: `powerMult` no nó da teia (`data/skills/trees/*.json`) multiplica o golpe inteiro das
  habilidades da teia. Ele mexe pouco em teias cujo dano vem do ataque básico e da arma (corpo a corpo), então
  a diferença que sobra entre corpo a corpo e à distância é de papel (exposição, alcance), não de poder.
- A IA não usa confinamento e quase não constrói: essas habilidades valem mais nas mãos do jogador do que aqui.

