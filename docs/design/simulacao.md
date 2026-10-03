# Simulação em massa (balanceamento)

Gerado por `npm run sim` (600 batalhas IA × IA: 5 heróis montados por subclasse × 6 inimigos do bestiário no mesmo nível; mapas de natureza e cidades com prédios e barris; 35% à noite com patrulhas).

- Vitórias do esquadrão: **85%**
- Rodadas por batalha (média): **5.4**
- Batalhas sem fim (700 turnos): **0** · erros: **0**

## Uso das mecânicas (total nas batalhas)

| Mecânica | Vezes |
|---|---|
| empurrões | 137 |
| quedas | 14 |
| explosões de pólvora | 234 |
| desabamentos | 9 |
| supressões | 568 |
| tiros perdidos que acertam | 31 |
| confinamentos | 1 |
| concentração quebrada | 96 |
| caídos sangrando | 1117 |
| estabilizações | 419 |
| sangrou até a morte | 280 |
| portas abertas | 52 |
| construções | 13 |
| lustres | 0 |
| arremessos | 359 |
| sinos | 0 |

## Subclasses (dano e cura por batalha, abates, sobrevivência)

| Subclasse | Batalhas | Contribuição (1 = média) | Dano/batalha | % por habilidade | Lançamentos | Cura/batalha | Abates | Sobreviveu |
|---|---|---|---|---|---|---|---|---|
| ladrao/algoz | 32 | **1.64** | 872 | 95% | 3.4 | 6 | 1.63 | 81% |
| arqueiro/ranger | 29 | **1.44** | 759 | 38% | 2.1 | 92 | 0.83 | 100% |
| mago/cataclisma | 28 | **1.38** | 759 | 13% | 2.1 | 0 | 1.57 | 89% |
| ladrao/ninja | 99 | **1.35** | 594 | 73% | 2.8 | 4 | 1.07 | 66% |
| ladrao/viper | 37 | **1.32** | 745 | 73% | 2.7 | 20 | 1.24 | 100% |
| clerigo/inquisidor | 129 | **1.32** | 636 | 90% | 3.1 | 5 | 1.57 | 77% |
| mago/necro | 102 | **1.32** | 552 | 68% | 2.2 | 16 | 0.92 | 70% |
| ladrao/sicario | 40 | **1.30** | 580 | 92% | 3.1 | 114 | 1.02 | 100% |
| clerigo/monge | 136 | **1.28** | 536 | 68% | 3.7 | 103 | 1.18 | 67% |
| arqueiro/arcano | 112 | **1.25** | 595 | 98% | 3.1 | 6 | 1.34 | 72% |
| guerreiro/campeao | 42 | **1.22** | 725 | 70% | 2.6 | 6 | 1.79 | 95% |
| clerigo/zelote | 31 | **1.19** | 723 | 73% | 2.1 | 27 | 1.48 | 100% |
| ladrao/contrabandista | 31 | **1.18** | 662 | 29% | 2.3 | 2 | 1.52 | 87% |
| mago/manipulador | 39 | **1.18** | 731 | 76% | 3.2 | 4 | 1.44 | 92% |
| arqueiro/sniper | 116 | **1.09** | 503 | 76% | 2.9 | 4 | 1.56 | 83% |
| ladrao/mercenario | 116 | **1.08** | 472 | 76% | 3.1 | 26 | 1.31 | 69% |
| mago/gravitacional | 110 | **1.05** | 440 | 76% | 2.8 | 3 | 1.07 | 72% |
| mago/elementalista | 153 | **1.05** | 480 | 88% | 3.0 | 10 | 1.17 | 66% |
| guerreiro/espadachim | 115 | **1.04** | 445 | 61% | 2.6 | 4 | 1.21 | 77% |
| ladrao/assassino | 112 | **1.02** | 464 | 66% | 2.1 | 3 | 1.29 | 64% |
| clerigo/sacerdote | 115 | **1.01** | 140 | 48% | 4.0 | 409 | 0.23 | 76% |
| arqueiro/guardiao_runico | 37 | **0.96** | 496 | 79% | 3.4 | 172 | 1.14 | 97% |
| guerreiro/arcano | 124 | **0.96** | 407 | 87% | 2.7 | 4 | 1.27 | 78% |
| ladrao/sabotador | 127 | **0.94** | 390 | 7% | 1.7 | 1 | 0.91 | 61% |
| mago/invocador | 44 | **0.94** | 596 | 5% | 2.5 | 0 | 0.07 | 100% |
| arqueiro/especialista | 29 | **0.89** | 475 | 84% | 2.4 | 5 | 1.34 | 97% |
| guerreiro/berserker | 98 | **0.88** | 408 | 62% | 2.5 | 2 | 1.24 | 74% |
| arqueiro/trapper | 110 | **0.85** | 387 | 80% | 2.1 | 2 | 0.89 | 62% |
| arqueiro/druida | 115 | **0.84** | 223 | 90% | 3.5 | 179 | 0.65 | 70% |
| guerreiro/duelista | 41 | **0.80** | 436 | 69% | 3.5 | 9 | 0.90 | 100% |
| arqueiro/atirador_runico | 40 | **0.79** | 448 | 75% | 2.8 | 4 | 1.07 | 100% |
| clerigo/paladino | 124 | **0.76** | 315 | 77% | 2.7 | 7 | 0.66 | 70% |
| clerigo/taumaturgo | 36 | **0.60** | 294 | 51% | 2.9 | 138 | 0.50 | 97% |
| guerreiro/escudeiro | 103 | **0.55** | 235 | 50% | 2.6 | 1 | 0.45 | 74% |
| mago/entropia | 36 | **0.48** | 312 | 100% | 3.6 | 12 | 0.78 | 100% |
| guerreiro/mestre | 26 | **0.47** | 227 | 74% | 2.7 | 2 | 0.69 | 100% |
| clerigo/guardiao_fe | 24 | **0.45** | 232 | 61% | 2.9 | 33 | 0.58 | 100% |
| mago/tempo | 99 | **0.43** | 204 | 46% | 2.7 | 0 | 0.47 | 66% |
| clerigo/templario | 27 | **0.42** | 119 | 27% | 3.5 | 350 | 0.07 | 96% |
| guerreiro/defensor | 36 | **0.39** | 211 | 65% | 3.1 | 38 | 0.47 | 100% |

## Habilidades que a IA tem e nunca usa (64 de 313)

Sentença de Ferro (`inquisidor_sentenca_de_ferro`, 196×) · Armadilha de Espinhos (`trapper_armadilha_de_espinhos`, 168×) · Marca do Pecado (`inquisidor_marca_do_pecado`, 129×) · Barril de Óleo (`sabotador_barril_de_oleo`, 127×) · Regeneração Sombria (`necro_regeneracao_sombria`, 102×) · Volte (`tempo_volte`, 99×) · Estigma de Lentidão (`inquisidor_estigma_de_lentidao`, 83×) · Areia nos Olhos (`mercenario_areia_nos_olhos`, 75×) · Dilação de Efeito (`tempo_dilacao_de_efeito`, 61×) · Pressão Gravitacional (`gravitacional_pressao_gravitacional`, 59×) · Cobrança (`mercenario_cobranca`, 42×) · Munição Pesada (`sniper_municao_pesada`, 42×) · Empalar (`campeao_empalar`, 42×) · Lança Bumerangue (`campeao_lanca_bumerangue`, 42×) · Salto (`duelista_salto`, 41×) · Passo da Névoa (`duelista_passo_da_nevoa`, 41×) · Munição Instável (`atirador_runico_municao_instavel`, 40×) · Área de Haste (`manipulador_area_de_haste`, 39×) · Área de Slow (`manipulador_area_de_slow`, 39×) · Área Antimagia (`manipulador_area_antimagia`, 39×) · Distorção Espacial (`manipulador_distorcao_espacial`, 39×) · Praga Radiante (`taumaturgo_praga_radiante`, 36×) · Expurgo Espiritual (`inquisidor_expurgo_espiritual`, 35×) · Transmissão Rúnica (`arcano_transmissao_runica`, 34×) · Gatilho Remoto (`trapper_gatilho_remoto`, 31×) · Isolamento Tático (`trapper_isolamento_tatico`, 31×) · Gancho de Albatroz (`contrabandista_gancho_de_albatroz`, 31×) · Paradoxo (`tempo_paradoxo`, 30×) · Mina de Prospecção Laser (`especialista_mina_de_prospeccao_laser`, 29×) · Armadilha de Esporos Alucinógenos (`ranger_armadilha_de_esporos_alucinogenos`, 29×) · Radiação Estelar (`cataclisma_radiacao_estelar`, 28×) · Pancada de Escudo (`escudeiro_pancada_de_escudo`, 27×) · Luz Protetora (`templario_luz_protetora`, 27×) · Golpe Coordenado (`mestre_golpe_coordenado`, 26×) · Golpe Exaustivo (`mestre_golpe_exaustivo`, 26×) · Comando de Ataque (`mestre_comando_de_ataque`, 26×) · Passo do Guardião (`guardiao_fe_passo_do_guardiao`, 24×) · Correntes Espectrais (`invocador_correntes_espectrais`, 23×) · Sacrifício Espiritual (`invocador_sacrificio_espiritual`, 23×) · Desafio de Honra (`duelista_desafio_de_honra`, 23×)

## Como ler

- Cada herói segue uma teia como um jogador faria: distribui atributos pelos pesos da teia (`scaling`), aprende
  as teias-mãe até destravar a híbrida e fortalece as habilidades até o Nv 3 (evoluções) e depois o Nv 5.
- Contribuição mede **dano + cura** relativos à média da batalha (invocações contam para quem invocou). Tanques
  (templário, guardião da fé, defensor, escudeiro) e controladores (cronomante) ficam naturalmente abaixo de 1:
  o valor deles (absorver golpes, atrasar, enfraquecer) não vira número. A sobrevivência alta é o sinal certo.
- O peso dos atributos (`scaling`) define **em que investir**, não a força: pela regra de
  [matematica.md](matematica.md), toda escala dá o mesmo poder na build máxima (90–100). A alavanca de força é
  `powerMult` no nó da teia, que multiplica o dano das habilidades dela no motor.
- Controle (lentidão, exaustão, silêncio, prender) também não vira número: Mestre de Batalha, Entropia e
  Cronomante gastam boa parte das ações em estados e aparecem abaixo de 1 mesmo com `powerMult` alto.
- A lista de habilidades nunca usadas mede a cobertura da IA (base e evolução contam juntas). As que sobram são
  utilidades de nicho (voltar no tempo, trocar de lugar, teleporte fora de perseguição, áreas de apoio).
- Com 600 batalhas, diferenças de ±0,1 são ruído.

