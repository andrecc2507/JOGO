# Gameplay de comandante: proposta (mapa, territórios e atos)

> **Status:** proposta para aprovação (2026-10-03). Nada daqui está implementado ainda. Cada item
> tem um número (C1, C2…) para aprovar, cortar ou ajustar um por um, como foi feito com
> [competidores.md](competidores.md).

Objetivo: a camada de comandante ter a mesma profundidade da batalha. Hoje o mapa é um lugar
por onde se passa entre lutas. A proposta é que ele vire um **tabuleiro de decisões**: o que
defender, o que deixar cair, por onde viajar, com que suprimentos e em quem confiar. E que as regras
**mudem a cada ato**, acompanhando a história (de comandante do rei a fugitivo, líder rebelde,
general de uma aliança e, por fim, invasor do mundo invertido).

## O que já existe (a base)

- **Mapa:** grafo de 1200 × 820 com a Citadela no centro, 5 capitais num anel de raio ~285 e 4
  cidades por país, ligadas por estradas com pontos de passagem. Um bioma por país (floresta, neve,
  costa, deserto, planície). Do centro a uma capital se viaja em ~13 horas de jogo.
- **Tempo** corre com pausa e 3 velocidades; esquadrões ilimitados andam em paralelo; encontros com
  30% de chance por ponto de passagem; estalagem; dia e noite.
- **Capitais:** loja, taverna (rumores), recrutamento, 3 contratos cada (7 modelos), serviço único
  (Pavilhão dos Caçadores, refino, mercado negro, enfermaria).
- **Base** (a partir do Ato 1): quartel, biblioteca, forja, enfermaria, prisão, santuário e rede de
  informantes; pesquisa, fabricação, joias da alma, captura e interrogatório.
- **Contador do Véu** (Ato 3+), missões de atraso do culto, capitais que caem por escolha (4.1),
  lealdade, moral, vínculos, crônica e rival recorrente.

O que falta é **pressão e consequência no próprio mapa**: território que muda de dono, inimigos que
se movem, recursos escassos, informação incompleta e escolhas entre várias crises ao mesmo tempo.

## Pilares

1. **Escassez:** tempo, ouro, suprimentos e heróis nunca bastam para tudo. Toda semana há mais
   crises do que esquadrões.
2. **Informação incompleta:** o mapa tem névoa; rumores e batedores revelam, mas nem sempre
   corretamente.
3. **Consequência visível:** províncias mudam de cor, vilas queimam, rotas fecham, capitais caem.
4. **Cada ato muda as regras:** um sistema novo por ato e um que sai de cena, para a campanha
   não virar rotina.
5. **A batalha nasce do mapa:** bioma, transição, clima, hora, estrutura da província e preparo
   (emboscada, suprimentos) definem o campo de batalha.

---

## Parte 1: Mapa expandido

| # | Proposta | Como implementar | Toque de Valdoria |
|---|---|---|---|
| C1 | **Mundo ~3× maior com províncias.** O mapa passa de grafo de cidades a ~60 províncias (polígonos de Voronoi), cada uma com bioma, dono, população e um local principal (cidade, vila, forte, ruína, covil). Câmera com zoom, arrasto e minimapa. | `world/layout.ts` gera províncias por semente fixa (ou carrega um mapa feito no editor). As estradas continuam como grafo; cada aresta registra o terreno que atravessa. | Ilustração de mapa antigo, com selos de cera nas capitais. |
| C2 | **Distâncias reais.** Capitais a 3–5 dias da Citadela, vizinhas a 2–3 dias entre si e as terras distantes a 7–12 dias. Viajar vira uma decisão. | Escala nova em `TRAVEL_SPEED` e na geometria; os pontos de passagem ficam a cerca de meio dia um do outro. | — |
| C3 | **Terreno conforme o bioma.** Velocidade por terreno: estrada 1,0; planície 0,85; floresta 0,65; deserto 0,6; neve 0,5; pântano 0,45; montanha só pelos passos. Também é possível viajar fora da estrada (mais lento, menos patrulhas, mais feras). | Peso das arestas por terreno no Dijkstra (`shortestPath`); ordem de viagem "pela estrada / pelo mato". | — |
| C4 | **Transições de bioma.** Na fronteira entre dois países, as províncias de orla misturam os dois biomas, nas criaturas e no mapa de batalha (gradiente de ruído no `mapgen`). Seis transições: **taiga** (floresta+neve), **charneca** (planície+floresta), **estepe** (planície+deserto), **mangue** (costa+floresta), **costa gelada** (neve+costa) e **oásis** (deserto+costa). | Tabela de transições em `data/world/biomes.json`; encontros sorteados das duas tabelas; `generateMap` aceita `biome` + `blend`. | Cada transição tem 1–2 criaturas próprias (híbridas das duas regiões). |
| C5 | **Biomas novos nas terras distantes**, fora do reino e para além das fronteiras, só para lendas, contratos e masmorras: **Pântano** (Brejo Cinzento), **Cordilheira vulcânica** (Picos de Cinza), **Selva** (Mata Rubra), **Geleira** (Teto do Mundo), **Ermo de cristal** (ruínas arcanas), **Arquipélago** (só de barco) e **Terra morta** (tocada pelo Vazio, a partir do Ato 4). | Cada bioma: 15–25 criaturas, terreno e objetos de batalha, materiais próprios, 1 masmorra fixa e 1–2 lendas. | Cada um guarda um fragmento da história dos Selos (códice). |
| C6 | **Masmorras** (estilo BG3, com desgaste): vários andares em sequência; entre um andar e outro só se descansa num acampamento (uma vez); cura e magia não voltam por completo. O último andar tem chefe e espólio único. É possível sair no meio, mas o progresso fica pela metade. | Sequência de `BattleSetup` com estado persistente (vida, MP, itens gastos); mapas com prédios e cavernas em níveis (`stack.ts` já sustenta). | Masmorras ligadas aos Selos e aos Barões (Ato 7). |
| C7 | **Clima e estações.** O mês vira estação: inverno congela rios (atalhos novos) e fecha passos de montanha; primavera inunda vaus; verão deixa o deserto mortal sem água; tempestades fecham o mar. O clima entra na batalha (neve, chuva, neblina). | `world/season.ts`; o clima vai para `BattleSetup` (o motor já tem dia/noite e superfícies). | Festivais por estação nas capitais (eventos). |

## Parte 2: Mecânicas gerais de comandante (valem em todos os atos)

| # | Proposta | De onde vem | Como implementar |
|---|---|---|---|
| C8 | **Névoa do mapa e reconhecimento.** Províncias que ninguém visitou ficam escondidas, e a ameaça nelas é uma estimativa ("bando de 4–7, nível ~12"). Batedores, torres e a rede de informantes revelam. | Xenonauts (radar) | Estado `known/seen` por província; a precisão da informação cai com o tempo desde a última visita. |
| C9 | **Suprimentos.** Cada esquadrão carrega rações (e água no deserto) que se gastam por dia. Fora da estrada gasta mais. Sem suprimento, a moral cai, o HP não volta e os ferimentos pioram. Compra em cidades, caça (encontro com feras dá carne) e depósitos. | Xenonauts, sobrevivência | Campo `supplies` no `Squad`; consumo em `advanceHours`; item "carroça" amplia a carga. |
| C10 | **Territórios.** Cada província tem **dono** (Coroa, Resistência, Culto, Vazio, Neutro), **controle** (0–100) e **medo** (0–100). Missões, contratos, guarnições e eventos mexem nesses números. Províncias aliadas rendem ouro, recrutas, suprimentos e informação. Medo em 100 faz a província cair para quem a ameaçava. | XCOM (pânico do conselho), Xenonauts (financiamento) | `world/territory.ts` puro; cor do mapa por dono; relatório mensal com renda e perdas. |
| C11 | **Forças inimigas que se movem no mapa:** patrulhas da Coroa, caravanas do culto, bandos de feras e incursões do Vazio andam com destino e prazo (atacar vila, levar prisioneiros, erguer altar). Dá para interceptar com um esquadrão. Se chegarem, a consequência acontece. | Xenonauts (OVNIs), XCOM | Entidade `Force` com rota no grafo; o encontro vira batalha com preparo (C14). |
| C12 | **Operações do inimigo (planos do mês).** Todo mês o inimigo revela 3 planos ("Sobretaxa em Aurélia", "Ritual na Taiga", "Caça ao comandante"). Só dá para frustrar 1 ou 2; os outros entram em vigor por 30 dias como modificadores. | XCOM 2 (Eventos Sombrios) | `data/world/enemy_ops.json` com efeito em regras puras e uma missão para frustrar cada um. |
| C13 | **Crises simultâneas.** Missões chegam em grupos de 2–3 com prazo, e escolher uma deixa as outras expirarem (com consequência no território). | XCOM (sequestros) | Contratos com `expiresAt` e efeito ao expirar. |
| C14 | **Preparo antes do combate.** Ao interceptar, escolhe-se como entrar: emboscada (se houver batedor e luz: inimigo surpreso), cerco (bloqueia a fuga), negociação (teste de carisma/traço) ou recuar. Suprimentos e cansaço viram estados iniciais. | BG3, Xenonauts | Opções no diálogo de encontro; mapeia para `ambush`, `patrol`, estados iniciais. |
| C15 | **Reputação com facções.** 5 capitais, Clero, Guilda (ladinos), Resistência e o povo comum. Afeta preços, recrutas, contratos exclusivos, alianças (Ato 4) e finais. Escolhas em missões e eventos mexem nela. | BG3 (aprovação), XCOM | `world/reputation.ts`; aparece no menu de cada capital. |
| C16 | **Aprovação dos companheiros da história.** Edran, Maela, Lirael, Orun e o Viajante reagem às escolhas do comandante (como a lealdade, mas por personagem e com falas). Aprovação baixa: discute, recusa missões e pode partir; alta: libera conversas e uma passiva única. | BG3 | Estende `world/loyalty.ts` e `camp.json` com gatilhos por escolha. |
| C17 | **Eventos de viagem com teste.** Encontros que não são luta (ponte quebrada, peregrinos doentes, mercador suspeito, ruína à beira da estrada), com escolhas e teste de atributo do esquadrão (FOR para empurrar a carroça, INT para ler a runa, traços de personalidade abrindo opções). | BG3, FTL | `data/world/events.json` + resolvedor puro; resultado em ouro, itens, ferimentos, reputação e pistas. |
| C18 | **Postos avançados.** Construir na província: torre de vigia (revela), depósito (suprimento), enfermaria de campo, refúgio (descanso seguro), passagem rúnica (viagem rápida entre postos, a partir do Ato 5). Custam manutenção mensal e podem ser atacados (missão de defesa). | XCOM 2 (contatos e repetidores) | `world/outposts.ts`; a defesa usa os mapas com prédios. |
| C19 | **Capitães de esquadrão (árvore do comandante).** Cada esquadrão tem um líder que dá bônus de viagem e uma aura em batalha (marcha forçada, olho de batedor, intendente, inspirar). A Academia de Treino da base ensina essas habilidades (o pendente nº 4 da campanha). | XCOM (Escola de Guerrilha) | Campo `captainId`; árvore em `data/base/commander.json`. |
| C20 | **Economia com 4 recursos:** ouro (como hoje), suprimentos (C9), **influência** (gasta em diplomacia, alianças e anistias) e **informação** (gasta para revelar planos do inimigo, localizar alvos e abrir missões principais). | XCOM 2 (Intel) | Contadores na `Campaign`; a rede de informantes da base passa a gerar informação. |
| C21 | **Defesa e cerco.** Quando o inimigo ataca uma província aliada, uma capital ou a base, abre uma missão de defesa com prazo. Ignorar custa a província. O cerco a uma capital tem várias ondas e o preparo (muros, barricadas, aliados IA) vem das escolhas no mapa. | XCOM (base), Xenonauts | Usa ondas, aliados IA e construção (`build.ts`). |
| C22 | **Ferimentos, fadiga e rodízio.** Esquadrão viajando sem descanso acumula fadiga (menos barra de ação e acerto); o rodízio de heróis entre esquadrões e a base passa a importar. | XCOM 2 (cansaço) | Fadiga por herói ligada a moral e ferimentos existentes. |

## Parte 3: Por ato (cada ato muda as regras)

Cada ato **liga um sistema novo** (marcado ★) e **muda a cara do mapa**.

### Prólogo — O Comandante do Reino
- Mapa pequeno e seguro (só o reino central e as estradas das capitais); sem territórios nem
  névoa. Ensina viagem, suprimentos (C9) e eventos de viagem (C17).
- ★ **Reputação com as capitais** (C15) começa aqui: como o comandante resolve o problema de cada
  senhor define a confiança inicial do Ato 4.

### Ato 1 — Rebeldes (comandante do rei)
- ★ **Favor da Coroa:** metas mensais (reprimir revoltas, escoltar coletores de impostos). Cumprir
  dá ouro e equipamento; recusar baixa o Favor. O jogador sente o peso de servir.
- **Territórios aparecem** (C10), em duas cores: Coroa e Rebeldes. Reprimir uma revolta ganha a
  província para a Coroa, mas aumenta o medo. Isso vira munição moral para a deserção.
- ★ **Suspeita** (oculta): investigar as crianças, ler documentos e poupar rebeldes acumulam
  pistas. Na 1.8, Favor, Suspeita e lealdade decidem quem segue o comandante e quanto da tropa e do
  ouro ele leva.

### Ato 2 — Teoria da Conspiração (fugitivo)
- ★ **Procurado:** cada província tem nível de procura (0–5). Caçadores da Coroa patrulham (C11).
  Viajar à noite e fora da estrada reduz a chance de ser visto; disfarces (itens) e esconderijos
  (C18, só refúgio) ajudam.
- ★ **Quadro de investigação:** a informação (C20) liga pistas, e cada missão principal precisa de
  N pistas. Rumores de taverna, interrogatórios e eventos rendem pistas, umas falsas e outras
  verdadeiras.
- Economia apertada: sem pagamento da Coroa. Contratos do mercado negro e da Guilda.
- No fim, o **Véu liga** (como hoje) e entra o primeiro **plano do inimigo** (C12).

### Ato 3 — Protejam o Reino (guerra civil)
- ★ **Linhas de frente:** exércitos (Coroa corrompida × Resistência) viram peças no mapa com força
  e moral. A cada semana, a frente avança conforme a força. O comandante não move exércitos:
  fortalece ou enfraquece com missões (saquear suprimentos, matar um oficial, proteger a ponte),
  como as operações da resistência de XCOM 2.
- **Disputa de território quente:** províncias trocam de dono toda semana; perder a vila de um
  recruta da história gera fala e moral.
- O assalto ao palácio (3.7–3.8) tem **missões de preparo**: cada uma tirada antes enfraquece a
  batalha final (menos ondas, aliados extras, portões abertos).

### Ato 4 — Incursões e União (aliança)
- ★ **Portais** (como os OVNIs de Xenonauts): abrem no mapa com tempo para "amadurecer". Portal
  maduro faz incursão (C21), sequestra população (Selo III) e espalha **Terra morta** (C5) pelas
  províncias vizinhas.
- ★ **Diplomacia:** a confiança de cada capital (C15) + influência (C20) compram a aliança. Cada
  aliança dá tropa (aliados IA em batalha), serviço e território. Capital com medo em 100 **cai**
  (amplia a escolha da 4.1 que já existe).
- A base vira **QG da Resistência**: mais espaços de instalação e o 1º posto avançado (C18).

### Ato 5 — Combate ao Mal (o outro mundo)
- ★ **Mapa duplo:** o mundo invertido é uma camada espelhada do mapa, com travessias por portais e
  pelo Muro. Lá, suprimentos não se compram e o dia não volta (noite perpétua com luz própria).
- ★ **Corrupção:** cada dia no Vazio soma corrupção ao herói. Pouca dá poderes (passiva sombria);
  muita, mutações negativas. Limpa-se no santuário da base. O jogador escolhe quanto risco correr.
- Evacuação de sobreviventes (5.6) vira **escolta no mapa** (caravana lenta que precisa chegar).

### Ato 6 — Ao Desconhecido (expedição)
- ★ **Outro continente:** mapa novo, quase todo em névoa, com os biomas distantes (C5). Sem base,
  só **acampamento de expedição** móvel (instalações reduzidas que viajam).
- ★ **Mundos sobrepostos (Selo VI):** algumas províncias **trocam de bioma** de um dia para o
  outro (a floresta vira geleira); rotas abrem e fecham. Os batedores ficam valendo ouro.
- Primeiro contato com as capitais invertidas: reputação nova, do zero.

### Ato 7 — Caça aos Barões (conquista)
- ★ **Domínios dos Barões:** três regiões fortificadas, cada uma com fortalezas (masmorras, C6) e
  postos inimigos. Conquistar postos libera os **postos avançados de verdade** (cura, recrutamento,
  armazém, teleporte e defesa, que hoje são só narrativos).
- ★ **Barões que reagem** (como os Escolhidos de XCOM 2): o Barão cujo domínio é atacado contra-ataca
  postos; matar um Barão deixa os outros mais agressivos e com nova habilidade. A ordem escolhida
  muda a dificuldade.
- O **contador de dias do Despertar** substitui o Véu: cada dia sem progresso custa.

### Ato 8 — O Aniquilador (marcha final)
- ★ **Mesa de guerra:** tudo o que foi juntado na campanha (alianças, senhores, recrutas da
  história, reputação, postos, território) vira **forças** a distribuir entre as frentes da marcha
  final (8.1 "escolher comandantes"). Cada frente é resolvida por um esquadrão (batalha) ou por
  cálculo (frente sem herói); o resultado muda a batalha final em duas camadas.
- Sem sistemas novos: é o ato da **colheita**. O que foi construído paga agora.

## Parte 4: Contratos e conteúdo distante

| # | Proposta |
|---|---|
| C23 | **Contratos por tipo de lugar**, além dos 7 modelos de hoje: caça com recompensa (fera nomeada, com rastros no mapa), limpar covil, escoltar caravana (viagem + emboscada), entrega com prazo, reconhecimento (revelar 3 províncias), defender vila, sabotar fortificação, resgatar um explorador perdido numa masmorra. |
| C24 | **Quadro de contratos por facção:** a Coroa (até o Ato 1), a Guilda, o Clero, a Resistência e as capitais aliadas, cada um com seus tipos e com reputação mínima. |
| C25 | **Lendas** (side quests de item único, D8) ancoradas nos biomas distantes: 2 por bioma, com pistas espalhadas em tavernas e eventos. |
| C26 | **Recompensas de exploração:** primeira visita a uma província distante dá códice, material raro ou uma ficha do bestiário; mapa de tesouro (item) aponta uma masmorra escondida. |

## Parte 5: Ordem sugerida de implementação

1. **Fundação do mapa:** C1–C4 (províncias, distâncias, terreno, transições) + C8 (névoa). Tudo
   o mais se apoia nisso.
2. **Pressão:** C9 (suprimentos), C10 (territórios), C11 (forças que se movem), C13 (crises
   simultâneas), C14 (preparo do combate).
3. **Política:** C15–C16 (reputação e aprovação), C20 (influência e informação), C12 (planos do
   inimigo).
4. **Conteúdo:** C5–C7 (biomas distantes, masmorras, estações), C17 (eventos), C23–C26 (contratos e
   lendas).
5. **Por ato:** os ★ de cada ato, em ordem (Prólogo → Ato 8), cada um com teste e simulação.
6. **Ferramentas:** editor do mapa-mundo (províncias, estradas, locais) no mesmo estilo do editor de
   mapas de batalha, e simulação de campanha (`npm run sim:campanha`), que roda meses de jogo com
   decisões automáticas para medir economia, território e ritmo.

## Decisões para você

1. **Formato do mapa:** províncias em polígonos (proposto) ou hexágonos? Polígonos parecem mais
   "mapa antigo"; hexágonos são mais legíveis para disputa de território.
2. **Mapa gerado ou feito à mão?** Proposta: o reino feito à mão (fixo, ligado à história) e as
   terras distantes geradas por semente.
3. **Exércitos no Ato 3:** o jogador só influencia (proposto) ou também move exércitos?
4. **Corrupção no Ato 5:** pode ser permanente (mutações que ficam) ou sempre curável?
