# Roteiro de builds

Cada build tem duas partes:
- **No papel:** o que você decide e escreve antes. As fichas no fim deste documento ajudam.
- **No código:** o que eu implemento quando o papel estiver pronto.

A ordem segue a regra que combinamos: primeiro fechar mecânicas, depois conteúdo, e só então
a história. Uma build só começa quando o papel da anterior estiver fechado.

---

## Build 0.1 — Protótipo jogável ✅ (atual)
Mapa-mundo com tempo e esquadrões, capitais, estalagem, contratos, encontros, batalha isométrica
com barra de ação, elementos, combos, escondido, prontidão, Quartel, dev mode, editor de mapas e áudio.

## Build 0.2 — Escala e números base
Com 1 tile = 1 m e movimento de 6 m, vários valores atuais ficam pequenos demais.

**No papel**
- Tamanho dos mapas de batalha. Hoje são 12–15 m de lado, e um personagem cruza meio mapa num turno.
  Sugestão para avaliar: de 24×24 a 32×32 m.
- Quanto vale 1 nível de altura (0,5 m? 1 m?) e quantos metros cada personagem sobe (salto).
- Alcances em metros: arco (hoje 5–6), varinha (4), magias (1–6), arremesso (4), visão (8),
  cone de detecção (6).
- Ajuste de movimento por classe, se houver (ex.: Ladrão 7 m, Mago 5 m), ou todos em 6 m.
- Atributos iniciais, HP e MP base de cada classe.
- Fórmulas: enchimento da barra, acerto, esquiva, dano físico e mágico, crítico, dias de ferimento.
- Velocidades do tempo no mapa, duração das viagens, custo da estalagem, chance de encontro
  e chance de fuga.

**No código:** aplicar a nova escala, mapas maiores (com câmera e minimapa se precisar) e a tabela
de números num único arquivo de balanceamento.

## Build 0.3 — Habilidades das classes base
**No papel** (ficha de habilidade para cada uma)
- Habilidades do Aprendiz (se tiver) e das 5 classes base, com nível mínimo de cada uma.
- Lista de status completa, incluindo os não letais e de concussão que você citou.
- Todos os combos entre as classes base: quem combina com quem, distância, resultado.
- Quais habilidades liberam escudo (Guerreiro) e duas armas (Ladrão).

**No código:** motor de efeitos genérico (em vez de casos especiais), árvore de aprendizado,
combos vindos só dos dados.

## Build 0.4 — Rosa das classes (evoluções)
O carro-chefe: 5 classes × (4 evoluções + 4 híbridas) = **40 caminhos**. Dá para fazer uma classe por vez (0.4a, 0.4b…).

**Em andamento:** Arqueiro, Clérigo, Guerreiro e Ladino (8 caminhos e 80 habilidades cada) e Mago
(8 caminhos + 6 ramos elementais, 130 habilidades) já estão no jogo com valores genéricos e editor
próprio (Menu → Árvores de habilidades) — ver [`arvores_de_habilidades.md`](arvores_de_habilidades.md).
Reações das árvores são de **uso único por batalha**. Falta: o Mago central.

**No papel** (ficha de evolução)
- Nome das 4 evoluções e das 4 híbridas de cada classe. Já existem: Guerreiro → Berserker, Duelista,
  Templário, Guerreiro Arcano; Arqueiro → Druida; Clérigo → Monge e uma evolução templária sem nome
  (que precisa de outro nome, porque Templário já é do Guerreiro).
- Como se abre cada ponta da rosa: nível, pontos investidos, missão, item?
- Habilidades e passivas de cada caminho.
- Mecânicas próprias: adestrar e familiares (Druida), prontidão múltipla (Sniper), passo sombrio e
  escalar alto (Ninja), luta com as mãos (Monge), voar e ir sob a terra (quem pode?).
- Simbologia da rosa (inspiração em Crowley) e o nome definitivo do sistema.

**No código:** tela da rosa, desbloqueios, novas mecânicas e a IA usando tudo isso.

## Build 0.5 — Bestiário e facções inimigas (em andamento)

Já existe: tela do Bestiário (Menu → Bestiário) com ficha editável, prévia em combate, retrato e teste de
batalha; faixa de nível; XP por criatura; habilidades com recarga. **125 criaturas** (25 por bioma) com
pixel art, habilidades, reações, invocações e as mecânicas diferenciadas de épicos e lendários — ver
[`bestiario.md`](bestiario.md). Falta: tamanho real em tiles, drops por criatura, pets do jogador.
**No papel** (ficha de criatura)
- Por bioma: criaturas comuns, raras, épicas e lendárias, com elemento, habilidades, se é
  adestrável, e drops.
- Facções humanas por fase: rebeldes, milícia, bandidos, soldados do rei, clero, cultistas,
  soldados corrompidos.
- Criaturas do vazio: tipos, comportamento e fraquezas.
- Comportamento de IA por tipo (bando, emboscada, atirador, líder que convoca).

**No código:** tabelas de encontro por bioma, IA por comportamento, drops.

## Build 0.6 — Itens e economia
**No papel** (ficha de item)
- Armas, armaduras e acessórios por classe e raridade.
- Lendários únicos: as homenagens a animes, com nome, visual e efeito próprios.
- Consumíveis e arremessáveis.
- Preços e fontes de ouro (contratos, encontros, vendas) contra os gastos (recrutas, estalagem,
  equipamento), para decidir quanto ouro o jogador deve ter em cada ato.
- Bônus de cada capital escolhida como esconderijo.

**No código:** catálogo completo, tabelas de saque e as lojas por capital com essas listas.

## Build 0.7 — Motor de missões e narrativa
Sem conteúdo de história ainda: é a "máquina" que vai rodar a história.

**No papel**
- Tipos de missão e condições de vitória. Hoje existem eliminar, alvo, fuga e sobreviver. Faltam
  sequestrar, escoltar ou extrair VIP, interrogar, sabotar, investigar.
- Como os diálogos aparecem (retrato + texto? escolhas?).
- Eventos dentro da batalha, como achar um documento, reforços chegando ou o mapa mudando.
- Lealdade, confiança e moral das tropas (ideia do adendo): entra ou não?
- Como o jogador escolhe a capital-esconderijo.

**No código:** missões roteirizadas com mapas feitos no editor, sistema de diálogo, flags de
história, gatilhos de ato e NPCs de taverna com dicas ligadas à história.

## Build 0.8 — Prólogo + Ato 1 (fatia vertical)
**No papel** (ficha de missão)
- Prólogo: apresentação do comandante, combate de teste, mecânica de mundo.
- 5 a 8 missões do Ato 1: objetivo, mapa, inimigos, aliados, recompensa, descoberta, escolha,
  consequência.
- A deserção: quem segue o comandante e quem fica.
- Contratos do Ato 1 em cada capital (3 × 5).

**No código:** o Ato 1 inteiro jogável de ponta a ponta.

## Build 0.9 — Arte e som v1
**No papel**
- Estilo final: pixel art própria, pacote gratuito de uso livre, ou misto.
- Lista de sprites (classes, evoluções, inimigos), tiles por bioma e efeitos.
- Retratos dos personagens da história (gerados por IA fora daqui).
- Temas musicais: um por país, batalha, chefe, mundo invertido.

**No código:** trocar a arte provisória, interface com a identidade visual final e trilhas por região.
Já existe a encenação das ações (foco da câmera, nome da ação, animações por tipo de habilidade,
avisos de ambiente e de estado, cobertura) — ver [`arvores_de_habilidades.md`](arvores_de_habilidades.md#encenação-da-batalha).

## Build 0.10 — Atos 2 e 3
Missões de investigação, sabotagem, sequestro e interrogatório; rainha e princesa como agentes
secretas; soldados corrompidos; a batalha no salão do rei; morte da rainha; classe **Princesa**.

## Build 0.11 — Ato 4
Portais atacando capitais (eventos no mapa com prazo), abdução de humanos, muro de magia negra na
Citadela, a mudança da base para o esconderijo, os 5 líderes de capital entrando na equipe (classes
únicas) e o velho xamã.

## Build 0.12 — Atos 5 e 6
Citadela arruinada e o pilar, o portal, o **mundo invertido** (mesmo continente distorcido, só 3
capitais, ecos de batalhas antigas, versões alternativas), **O Viajante**, rei e conselheiro
corrompidos.

## Build 0.13 — Atos 7 e 8
Contador de dias até o despertar, conquista de territórios e postos avançados no vazio, os **3
barões** (cada um mudando o jeito de jogar) e o **Devorador de Mundos** em 5 fases que alteram as
regras. Final.

## Build 0.14 — Lendas e conteúdo extra
Side quests "Lendas" por país, itens únicos, mais rumores de taverna e as mensagens subliminares
inspiradas nas Chaves de Salomão.

## Build 1.0 — Polimento e lançamento
Balanceamento com testes de jogo, vários slots de save, opções (atalhos, tamanho do texto,
volume), desempenho, tutorial mínimo no prólogo (sem guiar demais, pelo pilar do RPG à moda antiga)
e publicação (itch.io ou GitHub Pages).

---

## O que falta além de habilidades, bestiário, missões e história

| área | falta | build |
|------|-------|-------|
| Escala | mapas, alcances e visão em metros | 0.2 |
| Números | fórmulas e valores por classe | 0.2 |
| Classes | rosa das classes (40 caminhos) e classes únicas (Princesa, Xamã, 5 líderes) | 0.4, 0.10, 0.11 |
| Mecânicas | adestrar e familiares, voar, ir sob a terra, escudo, duas armas, golpes não letais | 0.3, 0.4 |
| Missões | tipos que faltam: sequestrar, escoltar VIP, interrogar, sabotar, investigar | 0.7 |
| Narrativa | diálogos, eventos em batalha, flags de história, gatilhos de ato | 0.7 |
| Mundo | escolha e bônus da capital-esconderijo, mudança de base, nomes definitivos dos países | 0.6, 0.8 |
| Mundo | portais nas capitais, muro da Citadela, mundo invertido, territórios e postos avançados, contador de dias | 0.11–0.13 |
| Chefes | mecânicas dos barões e do Devorador | 0.13 |
| Economia | catálogo de itens, lendários únicos, saque, preços | 0.6 |
| Tropas | lealdade, confiança e moral (confirmar) | 0.7 |
| Arte e som | sprites, tiles, retratos, animações, trilhas finais | 0.9 |
| Sistema | slots de save, opções, publicação | 1.0 |

---

## Fichas para preencher no papel

**Habilidade**
Nome · classe/evolução · nível mínimo · custo de MP · alcance (m) · área (m, forma) · alvo
(inimigo, aliado, tile, si mesmo) · tipo (físico, à distância, mágico, cura, suporte) · elemento ·
poder · efeitos e status (duração) · combina com (habilidade, resultado, distância) · descrição.

**Evolução da rosa**
Classe base · direção (N, L, S, O ou diagonal) · nome · fantasia (1 frase) · como desbloqueia ·
arma · 3–6 habilidades · passiva · mecânica única.

**Criatura**
Nome · bioma(s) · raridade · nível típico · atributos (FOR, DES, INT, VIT, CON, VEL) · HP ·
movimento (m) · ataque · alcance · elemento, fraqueza e resistência · habilidades · comportamento
· adestrável? · drops.

**Item**
Nome · tipo (arma, armadura, acessório, consumível) · classe · raridade · preço · atributos ·
efeito especial · onde se obtém.

**Missão**
Ato · nome · tipo e condição de vitória · local e mapa · inimigos · aliados · classes disponíveis ·
recompensa · descoberta narrativa · escolha do jogador · consequência · mecânica nova apresentada.
