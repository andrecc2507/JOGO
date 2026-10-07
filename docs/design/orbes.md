# Orbes da alma — habilidade de cada criatura

Cada criatura deixa (raramente) um orbe da alma. Pesquisado no Santuário, o orbe vai num dos
**dois espaços de orbe** do herói (separados do acessório) e dá a ele a habilidade abaixo, com
nível 1–5 (fortalecer com orbes repetidos). As fichas ficam em `data/bestiary/creatures.json`
(`drops.jewel`); `tools/define_orbs.cjs` aplica as definições deste documento.

A habilidade é a mesma que a criatura usa em batalha: mudar um orbe muda a fera também.
Os combos entre orbes serão definidos depois (por enquanto há só as regras genéricas por
elemento em `data/skills/orb_combos.json`).

## Mecânicas novas

| Bloco (`fx`) | O que faz | Exemplos |
|---|---|---|
| `free` | **Ação sem custo**: não gasta a ação do turno (vale antes ou depois de agir). | Olhar Hipnótico, Velocidade Máxima, Reabsorção, Salto Solar, Runas de Proteção |
| `cloud` | **Fumaça de habilidade com efeito**: anda 1 casa por turno de quem lançou, na direção escolhida, até sair do mapa. Turva o tiro (−40 de acerto, menos entre vizinhos) e aplica o efeito em quem está dentro (quem lançou não sofre). | Gás fétido (cega), esporos (confunde), nevasca (lento), vapor fervente (queima), chama fria (queima mana), tinta (cega), névoa de sangue (sangra) |
| `cloudFollow` | Aura de nuvem que acompanha quem lançou por N turnos. | Predador da Lua (névoa lunar: +50% de crítico dentro; quem lançou enxerga através) |
| `imbue.charges` | **Próximo golpe**: o efeito vale só para os próximos N golpes (ataque ou habilidade). | Toxina Paralisante, Foice Maldita |
| `facingOnly` | Só atinge quem está olhando para quem usou. | Olhar Hipnótico, Sopro de Neve |
| `dashThrough` | Salta em linha até o tile, golpeando cada inimigo no caminho. | Salto Cortante |
| `fromAbove` | Dano extra se quem salta estava mais alto que o alvo. | Bote das Alturas |
| `iceBridge` | Ponte de gelo em escada (+1 e +2 de altura) por 3 turnos; quem estiver em cima quando derrete cai e se fere. | Passo Invernal |
| `breakShield` | Destrói escudos de vida e a proteção do alvo. | Golpe de Presa |
| `maxMpCut` | Corta a mana máxima do alvo pelo resto da batalha. | Toque Arrepiante |
| `gaugeRefund` | Alvo quase morto devolve parte da barra de ação. | Frenesi Sangrento |
| `spareAllies` | A área não atinge aliados. | Flash Ofuscante, rugidos e gargalhadas |
| `surface: 'geada'` | Congela o chão mesmo sem água. | Vento Ártico |
| status `condenado` | **Veneno Mortal**: morre quando o efeito acaba; antídoto ou purificação curam; lendários e chefes são imunes. | Quimera-da-Mata |
| status `musgo` | Regenera 8% por turno se não foi atingido na rodada. | Armadura de Musgo |
| status `runico` | Imune a dano mágico. | Runas de Proteção |
| reação `icewall` | Anula o tiro e ergue uma parede de gelo na direção de quem atirou. | Barreira Rúnica de Gelo |
| passivas | `jumpTo` (altura de salto), `noOpportunity` (sem ataque de oportunidade), `autoHide` (some em arbustos), `vsWeakest` (+dano no mais ferido), `noSurprise` (sem emboscada nem bônus de costas), `frontGuard` (tiro pela frente), `pierceGuard` (flechas, adagas, perfurantes), `furyHaste` (barra mais rápida com pouca vida), `chase` (+1 m a cada 2 m que a presa fugir) | Cervo, Raposa-do-Líquen, Silfídeo, Abutre, Lebre, Touro-Galo, Bisão, Yeti, Lobo-Cinzento |

**Confusão** agora tem peso: um confuso tem 35% de chance de acertar quem está colado no alvo,
aliados também (Nuvem de Esporos, Riso Agudo, Canto Melancólico).

## 🌲 Floresta

| Criatura | Raridade | Orbe | Tipo | Efeito |
|---|---|---|---|---|
| Esquilo-Farpa | Comum | Acrobacia Arbórea | Passiva | Passiva: +20 de esquiva com uma árvore ao lado. |
| Cervo-da-Folha | Comum | Salto Aprimorado | Passiva | Passiva: salta desníveis de até 5 de altura. |
| Javali-Casca-Grossa | Comum | Fúria Cega | Passiva | Passiva: abaixo de metade da vida, seus ataques causam 40% mais dano. |
| Texugo-da-Névoa | Comum | Cortina Fétida | Fumaça | Fumaça: libera um gás cinzento (raio 2) que cega quem estiver dentro. O gás anda 1 casa por turno seu, na direção que você escolher. |
| Coruja-Silenciosa | Comum | Pio Atordoante | Ativa | Som agudo que quebra a concentração: interrompe magias em preparo e silencia o alvo por 1 turno. |
| Víbora-Cipó | Comum | Toxina Paralisante | Buff | Buff: o próximo golpe (ataque ou habilidade) injeta veneno e deixa o alvo Lento por 2 turnos. |
| Raposa-do-Líquen | Comum | Veloz | Passiva | Passiva: anda sem provocar ataques de oportunidade nem perseguição. |
| Aranha-Tecer-Teia | Comum | Disparar Teia | Ativa | Lança teias pegajosas que prendem os pés do alvo no chão (Imobilizado por 2 turnos). |
| Urso-Pardo-das-Cavas | Comum | Rugido Intimidador | Ativa | Rugido em raio 3: os inimigos ficam Apavorados por 1 turno (não atacam). |
| Lobo-da-Silvia | Comum | Tática de Flanqueio | Passiva | Passiva: +30% de dano se outro aliado estiver colado no mesmo alvo. |
| Silfídeo do Âmbar | Raro | Camuflagem de Folhas | Passiva | Passiva: desaparece de vista assim que encosta num arbusto ou árvore. |
| Urso-Chifre (Ouroboro) | Raro | Armadura de Musgo | Buff | Buff: por 3 turnos, recupera 8% da vida no início de cada turno se não foi atingido na rodada. |
| Víbora das Sombras (Vespéris) | Raro | Veneno do Eclipse | Ativa | Mordida cujo veneno apaga a visão: Cegado por 3 turnos e envenenado. |
| Fada-Lamparina | Raro | Flash Ofuscante | Ativa | Clarão intenso em raio 2: cega todos os inimigos ao redor (aliados não são afetados). |
| Fungo-Caminhante | Raro | Nuvem de Esporos | Fumaça | Fumaça: esporos (raio 2) que deixam Confuso quem estiver dentro — os golpes podem acertar os próprios aliados. Anda 1 casa por turno seu. |
| Gato-de-Musgo | Raro | Purificação Natural | Ativa | Remove todos os efeitos negativos de si mesmo. |
| Fantasmas da Copa | Raro | Gargalhada Ecoante | Ativa | Gargalhada em raio 3: drena 8 de mana dos inimigos e os deixa Apavorados por 1 turno. |
| Cão-Feérico | Raro | Uivo Sincronizado | Buff | Uivo em raio 4: os aliados ficam Velozes por 2 turnos (barra de ação mais rápida e +2 m). |
| Ent-Guardião | Épico | Coração da Floresta | Passiva | Passiva: ao cair, vira uma semente protegida por casca. Se não for destruída em 3 rodadas, renasce com 50% da vida (uma vez por batalha). |
| Quimera-da-Mata | Épico | Veneno Mortal | Ativa | Picada da cauda de cobra: condena o alvo, que morre no início do 3º turno dele se o veneno não for curado (antídoto ou purificação). Lendários e chefes são imunes. |
| Aracne-Mãe | Épico | Fios do Destino | Ativa | Liga sua vida aos 2 inimigos mais próximos: o dano que você sofre é dividido com eles. Os fios rompem se eles se afastarem demais um do outro. |
| Lobo-Guará-Gigante | Épico | Predador da Lua | Fumaça | Aura de névoa escura (raio 2) que o acompanha por 3 turnos: inimigos dentro ficam cegos e erram muito contra ele; ele enxerga normalmente e ganha +50% de crítico dentro dela. |
| Coruja-da-Lua | Épico | Olhar Hipnótico | Sem custo | Sem custo de ação: atordoa um inimigo que esteja olhando para ela. |
| O Ancião Verde (Leshy) | Lendário | Fusão com a Mata | Buff | Funde-se à mata: some de vista e regenera 8% da vida por turno durante 3 turnos. |
| Dragão-da-Clareira (Yggdrak) | Lendário | Drenagem Vital de Raiz | Ativa | Finca as garras na terra: drena vida e reforços dos inimigos em raio 2 (5×5) e transforma o dano em escudo de vida. |

## 🌾 Planície

| Criatura | Raridade | Orbe | Tipo | Efeito |
|---|---|---|---|---|
| Lebre-da-Grama | Comum | Audição Aguçada | Passiva | Passiva: nunca é pega de surpresa — enxerga escondidos, golpes de esconderijo ou pelas costas não ganham bônus contra ela, e o esquadrão não sofre emboscadas. |
| Cachorro-da-Pradaria-Gigante | Comum | Assobio de Alerta | Buff | Assobio em raio 3: os aliados ficam Fortificados (+50% de defesa) por 2 turnos. |
| Falcão-Caçador | Comum | Grito Agudo | Ativa | Grito agudo: interrompe magias em preparo e silencia o alvo por 1 turno. |
| Cavalo-Selvagem-dos-Pampas | Comum | Relincho Desafiador | Buff | Fica Veloz por 2 turnos (barra de ação mais rápida e +2 m). |
| Antilocapra-Velo | Comum | Salto de Longa Distância | Ativa | Salta por cima de tudo e de todos até um ponto a 6 casas. |
| Coiote-da-Estepes | Comum | Uivo de Caça | Buff | Uivo em raio 4: os aliados ficam Afiados (+25% de crítico) por 2 turnos. |
| Abutre-Cinzento | Comum | Sentir a Morte | Passiva | Passiva: +10% de dano contra o inimigo com menos vida (não vale se só resta um). |
| Furão-dos-Campos | Comum | Corpo Flexível | Reação | Reação: o corpo flexível escapa de golpes críticos. |
| Touro-Galo | Comum | Carapaça de Bisão | Passiva | Passiva: a pele frontal reduz em 50% o dano de ataques à distância vindos da frente. |
| Rã-Saltadora-dos-Campos | Comum | Pele Escorregadia | Passiva | Passiva: imune a ser agarrada, imobilizada ou aprisionada. |
| Gato-de-Chifre dos Pampas | Raro | Cerco Veloz | Buff | Gira em volta do alvo criando ilusões de velocidade: +30 de esquiva até o próximo turno ou até o verdadeiro ser golpeado. |
| Espantalho-Ancião | Raro | Foice Maldita | Buff | Buff: o próximo ataque ou magia carrega energia maldita — o alvo não recebe cura por 3 turnos. |
| Rinoceronte-da-Grama | Raro | Carga Terrestre | Ativa | Investida em linha que derruba paredes, obstáculos e barreiras mágicas (remove escudos e reforços de quem for atingido). |
| Centauro-Nômade | Raro | Velocidade Máxima | Sem custo | Sem custo de ação: ganha mais um deslocamento completo neste turno. |
| Cavalinho-de-vento | Raro | Forma Intangível | Buff | Vira pura brisa: imune a dano físico por 1 turno. |
| Víbora-Relâmpago | Raro | Rastro Elétrico | Passiva | Passiva: estática na pele — a cada rodada, inimigos colados ficam Eletrocutados e sofrem 3% da vida em dano. |
| Fada-dos-Campos | Raro | Poeira do Riso | Ativa | O alvo cai na gargalhada e perde os ataques físicos por 1 turno. |
| Cão-de-Corte | Raro | Salto Cortante | Ativa | Salta em linha até um ponto a 5 casas (vence até 3 de altura), rasgando com as garras todo inimigo no caminho. |
| Mantícora-das-Estepes | Épico | Rugido de Leão | Ativa | Rugido em raio 3: atordoa todos os inimigos da área. |
| Gorgona-Errante | Épico | Reflexo Condenado | Reação | Reação: espelhos de sal flutuantes — 50% de chance de um golpe bater num espelho e voltar inteiro para quem atacou (até 3 por rodada). |
| Pássaro-Trovão Menor | Épico | Sobrecarga de Estática | Ativa | Magnetiza dois inimigos com cargas opostas: ficam Eletrocutados e Marcados (a marca explode ao acabar). |
| Bisão-Monstro | Épico | Pele Impenetrável | Passiva | Passiva: reduz em 75% o dano de flechas, adagas e golpes perfurantes. |
| Espírito-do-Trigo | Épico | Reabsorção de Nutrientes | Sem custo | Sem custo de ação: suga a energia do solo e recupera 15% da vida. |
| O Corredor do Horizonte | Lendário | Dilema do Tempo | Ativa | Desacelera o tempo de todos os inimigos menos um, sorteado: os outros ficam Lentos por 2 turnos e esse um enfrenta você sozinho. |
| Quirin-da-Alvorada | Lendário | Salto Solar | Sem custo | Sem custo de ação: teleporta-se num feixe de luz para qualquer ponto a até 10 casas. |

## ❄️ Neve

| Criatura | Raridade | Orbe | Tipo | Efeito |
|---|---|---|---|---|
| Lebre-Ártica | Comum | Velocidade Branca | Passiva | Passiva: +25 de esquiva sobre neve ou gelo. |
| Raposa-do-Gelo | Comum | Audição Subterrânea | Passiva | Passiva: guia-se pelo som dos passos — enxerga e ataca normalmente alvos escondidos ou invisíveis. |
| Coruja-das-Neves | Comum | Nevasca Branda | Fumaça | Fumaça: cria uma nevasca (raio 1) que deixa Lento quem estiver dentro. Anda 1 casa por turno seu, na direção que você escolher. |
| Pinguim-Imperador-da-Geleira | Comum | Grito de Bando | Buff | Grito de bando: os aliados colados ficam Fortificados (+50% de defesa) por 2 turnos. |
| Arminho-da-Neve | Comum | Frenesi Sangrento | Ativa | Ataca normalmente; se o alvo estiver abaixo de 30% da vida, recupera 25% da barra de ação. |
| Caribu-da-Tundra | Comum | Resistência ao Frio | Passiva | Passiva: imune a Lento e Congelado. |
| Leopardo-das-Neves | Comum | Bote das Alturas | Ativa | Salta sobre a presa (até 5 casas) e cai ao lado dela; vindo de um ponto mais alto que o alvo, causa 150% de dano. |
| Morsa-da-Presa-de-Ferro | Comum | Golpe de Presa | Ativa | As presas de ferro rasgam escudos: destrói escudos de vida e proteção do alvo, remove reforços e quebra a armadura. |
| Lobo-Cinzento-do-Norte | Comum | Perseguição Implacável | Passiva | Passiva: golpeia quem foge do lado dele e ganha +1 m de movimento no próximo turno a cada 2 m que o alvo fugir. |
| Foca-Leopardo | Comum | Mordida Arrastante | Ativa | Morde, agarra e arrasta o alvo 1 casa para perto. |
| Uivador do Gelo | Raro | Passo Invernal | Ativa | Ergue uma ponte de gelo em escada (2 casas: +1 e +2 de altura) por 3 turnos — degrau e cobertura. Quem estiver em cima quando ela derrete cai e se fere. |
| Espectro da Nevasca | Raro | Toque Arrepiante | Ativa | Atravessa o peito do alvo: queima 6 de mana e corta 25% da mana máxima dele até o fim da batalha. |
| Golem de Gelo Maciço | Raro | Runas de Proteção | Sem custo | Sem custo de ação: runas no peito anulam todo dano mágico por 2 turnos. |
| Fada-do-Gelo (Dryas) | Raro | Riso Agudo | Ativa | Riso agudo em raio 3: os inimigos ficam Confusos por 2 turnos — trocam de alvo e podem acertar os próprios aliados. |
| Serpente-da-Geada | Raro | Sopro de Neve | Ativa | Rajada de vento frio em cone: cega quem estiver olhando de frente para ela. |
| Urso-Polar-Rúnico | Raro | Carapaça Rúnica | Passiva | Passiva: magias de gelo o curam em vez de ferir; outras magias causam 30% menos dano. |
| Cão-da-Tundra | Raro | Hálito Crio-gênico | Ativa | Sopro frio focado em cone: trava as pernas do inimigo no chão (Imobilizado). |
| Espírito-da-Lanterna-Azul | Raro | Fogo Frio | Fumaça | Zona de chama azul (raio 1) que queima a mana de quem está dentro em vez da vida. Anda 1 casa por turno seu. |
| Yeti (O Abominável) | Épico | Fúria Branca | Passiva | Passiva: a barra de ação enche cada vez mais rápido conforme perde vida (até +80% perto do fim). |
| Wyvern-da-Geada | Épico | Vento Ártico | Ativa | Bate as asas num cone de ar gelado: empurra, deixa Lento, tem 30% de chance de congelar e cobre o chão de gelo. |
| Remorhaz Menor | Épico | Erupção de Vapor | Fumaça | Fumaça: nuvem de vapor fervente (raio 2) que queima quem estiver dentro; quem a criou enxerga normalmente nela. Anda 1 casa por turno seu. |
| Caminhante-das-Montanhas | Épico | Célula de Congelamento | Ativa | Isola um inimigo numa prisão de gelo: ele não age e sofre dano de frio até ser libertado (um golpe forte no captor quebra a cela). |
| Mamute-Rúnico | Épico | Barreira Rúnica de Gelo | Reação | Reação: anula um ataque à distância erguendo uma parede de cristais de gelo na direção de quem atirou (até 2 por rodada). |
| O Coração da Nevasca (Cryon) | Lendário | O Olho da Tempestade | Ativa | Invoca uma nevasca sobre o mapa inteiro por 3 rodadas, menos num círculo pequeno que se move (o olho). Inimigos fora do olho sofrem frio a cada rodada. |
| Skadi, a Loba-Alfa | Lendário | Sangue Congelado | Passiva | Passiva: ao cair abaixo de metade da vida, o sangue congela o chão em volta em poças de gelo afiadas. |

## 🏜️ Deserto

| Criatura | Raridade | Orbe | Tipo | Efeito |
|---|---|---|---|---|
| Rato-Canguru | Comum | Salto de Esquiva | Reação | Reação: salta para longe de um golpe corpo a corpo. |
| Víbora-chifruda | Comum | Toxina Desidratante | Ativa | Veneno que resseca: envenena por 3 turnos e queima 6 de mana. |
| Lagarto-Armado | Comum | Carapaça Espinhosa | Reação | Reação: quem o golpeia corpo a corpo se fere nos espinhos (até 3 por rodada). |
| Falcão-do-Deserto | Comum | Ataque Térmico | Ativa | Mergulha numa corrente de ar quente sobre um alvo a até 6 casas. |
| Camelo-de-Guerra | Comum | Corcova de Reserva | Passiva | Passiva: com pouca vida, a água guardada na corcova o regenera 6% por turno. |
| Escorpião-da-Areia | Comum | Injeção de Toxina | Ativa | Ferroada que paralisa (Imobilizado por 1 turno) e envenena por 3 turnos. |
| Raposa-Feneco | Comum | Mordida de Distração | Ativa | Mordida rápida que distrai: o alvo fica Silenciado por 1 turno. |
| Abutre-do-Sol | Comum | Foco no Fraco | Passiva | Passiva: +50% de dano contra alvos quase mortos (abaixo de 30% da vida) ou sem mana. |
| Hiena-Panda | Comum | Risada Histérica | Ativa | Risada em raio 3 que abala a guarda dos inimigos: armadura quebrada por 2 turnos. |
| Tarântula-das-Dunas | Comum | Bote do Alçapão | Ativa | Puxa o alvo 2 casas para perto e o imobiliza; vindo do esconderijo, +50% de dano. |
| Escorpião-Obsidiana | Raro | Carapaça Espelhada | Reação | Reação: a carapaça de vidro devolve a magia recebida para quem a lançou. |
| Nômades de Poeira | Raro | Forma de Turbilhão | Reação | Reação: vira um turbilhão de areia e anula um golpe físico. |
| Serpente-do-Sol | Raro | Brilho Solar | Ativa | Brilho solar em raio 2: cega e queima os inimigos ao redor. |
| Chacal-de-Anúbis | Raro | Mordida Espectral | Ativa | Mordida mágica que atravessa qualquer armadura e arranca os reforços do alvo. |
| Gato-das-Esfinges | Raro | Leitura de Mente | Reação | Reação: lê a intenção do atacante e se esquiva de um golpe. |
| Fada-da-Miragem | Raro | Roubo de Reflexos | Reação | Reação: ao ser atacada, troca dois inimigos de lugar com uma miragem. |
| Elemental-de-Vidro | Raro | Foco de Luz (Laser) | Ativa | Concentra a luz num feixe em linha de 7 casas. |
| Sapo-da-Chama | Raro | Salto Explosivo | Ativa | Salta sobre o alvo e explode em chamas em raio 1, incendiando o chão. |
| Verme das Dunas (Devorador) | Épico | Engolir Vivo | Ativa | Engole o alvo: ele fica Aprisionado (não age e sofre dano) por 3 turnos ou até um golpe forte soltá-lo. |
| Esfinge-Guardiã | Épico | Sopro de Areia do Tempo | Ativa | Sopro de areia do tempo em cone: envelhece a armadura (quebrada) e enfraquece os inimigos. |
| Lamia-da-Areia | Épico | Drenagem de Sangue Frio | Ativa | Morde e drena 60% do dano em vida; dano dobrado em alvos presos ou imobilizados. |
| Golem-de-Arenito | Épico | Arremesso de Obelisco | Ativa | Arremessa um obelisco a até 7 casas, esmagando o alvo e quem estiver colado nele. |
| Pássaro-do-Sol (Fênix Menor) | Épico | Cinzas Renascidas | Passiva | Passiva: ao cair, explode em chamas e renasce das cinzas com 50% da vida depois de 2 rodadas (se não destruírem o ovo). |
| O Devorador de Cidades (Apopis) | Lendário | Areia Movediça Global | Ativa | Transforma o chão em areia movediça: todos os inimigos são puxados, enlameados e ficam Lentos. |
| Ifrit Ancestral (O Senhor do Fogo) | Lendário | Calor Opressivo | Passiva | Passiva: um calor que queima todos os inimigos do mapa a cada rodada. |

## 🌊 Costa

| Criatura | Raridade | Orbe | Tipo | Efeito |
|---|---|---|---|---|
| Gaivota-Ladra | Comum | Grito Irritante | Buff | Grito em raio 4 que confunde a mira: os aliados ganham duplicatas ilusórias (+30 de esquiva) por 1 turno. |
| Caranguejo-Eremita-da-Praia | Comum | Retrair na Concha | Reação | Reação: recolhe-se na concha e anula um golpe físico. |
| Pelicano-Pescador | Comum | Bolsa de Captura | Ativa | Agarra o alvo com a bolsa do bico: ele fica preso (não se move e sofre dano). |
| Iguana-Marinha | Comum | Mordida de Algas | Ativa | Mordida suja de algas: abre uma ferida que impede cura por 3 turnos. |
| Tartaruga-Casco-de-Ferro | Comum | Defesa de Carapaça | Passiva | Passiva: o casco reduz em 50% o dano à distância e em 15% o dano físico. |
| Arraia-Lixa | Comum | Ferrão de Cauda | Ativa | Ferroada que atordoa; vindo do esconderijo, +50% de dano. |
| Enguia-da-Rocha | Comum | Choque de Enguia | Ativa | Descarga elétrica no alvo ao lado: Eletrocutado por 2 turnos e dano 80% maior se ele estiver molhado ou na água. |
| Cão-d'Água-Casteleiro | Comum | Nado de Resgate | Ativa | Resgata um aliado a até 4 casas: cura 15% da vida e remove efeitos negativos. |
| Estrela-do-Mar-Espinhosa | Comum | Toxina de Contato | Reação | Reação: quem a toca corpo a corpo fica Lento por 2 turnos (até 3 por rodada). |
| Lula-da-Costa | Comum | Nuvem de Tinta | Fumaça | Fumaça: jato de tinta (raio 2) que cega quem estiver dentro. Anda 1 casa por turno seu. |
| Sereia das Rochas (Craca) | Raro | Canto Melancólico | Ativa | Canto que atrai: puxa o alvo 3 casas e o deixa Confuso por 1 turno. |
| Caranguejo-Recife | Raro | Recolher-se em Coral | Reação | Reação: recolhe-se no coral e anula qualquer golpe (1 por rodada). |
| Leviatã Menor (Serpente Costeira) | Raro | Jato de Alta Pressão | Ativa | Jato d'água em linha de 6 casas que ignora metade da armadura. |
| Fada-do-Mar (Nereida) | Raro | Bênção de Oxigênio | Buff | Abençoa um aliado: remove efeitos negativos e o deixa Veloz por 2 turnos. |
| Cavalo-Marinho-Ancião | Raro | Sopro de Bolhas Ácidas | Ativa | Cone de bolhas ácidas que corroem a armadura (quebrada por 2 turnos). |
| Espírito-da-Espuma | Raro | Cura Salgada | Ativa | Espuma curativa em raio 3: cura 15% da vida dos aliados. |
| Tubarão-da-Névoa | Raro | Sentido de Sangue | Passiva | Passiva: fica Veloz enquanto algum inimigo sangra e causa 30% mais dano em quem sangra. |
| Polvo-Mímico-Mágico | Raro | Tentáculos Mágicos | Ativa | Tentáculos de sombra agarram um alvo a até 4 casas. |
| Tubarão-Megalo | Épico | Mordida Estraçalhadora | Ativa | Mordida brutal que deixa o alvo sangrando por 4 turnos. |
| Hidra Costeira | Épico | Botes Múltiplos | Ativa | Várias cabeças atacam ao mesmo tempo: golpeia todos os inimigos em raio 2. |
| Tratador de Ondas (Tritão Combatente) | Épico | Grito de Comando | Buff | Grito de comando em raio 4: os aliados ficam Afiados (+25% de crítico) por 3 turnos. |
| Quelone-Ilha | Épico | Casco-Ilha | Passiva | Passiva: o casco do tamanho de uma ilha reduz em 35% todo dano físico e à distância. |
| Caminhante-das-Marés | Épico | Prisão de Bolha | Ativa | Prende um inimigo numa bolha d'água: Aprisionado por 2 turnos. |
| O Despertar do Kraken | Lendário | Tinta Cegante Abissal | Fumaça | Fumaça: tinta abissal sobre todos os inimigos — cegos, e cada um preso numa nuvem de tinta que anda 1 casa por turno seu. |
| Scylla, a Devoradora de Naus | Lendário | Nevoeiro de Sangue | Fumaça | Fumaça: névoa de sangue (raio 2) que faz sangrar quem estiver dentro. Anda 1 casa por turno seu. |
