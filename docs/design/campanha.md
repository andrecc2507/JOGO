# Campanha principal (v0.3 — implementada de ponta a ponta)

Junta os três textos de [fontes/](fontes/): [roteiro principal](fontes/campanha_roteiro_principal.md),
[nós da história](fontes/campanha_nos_da_historia.md) e [sete selos](fontes/campanha_sete_selos.md).
Quando eles divergem, a escolha feita aqui está marcada com **(escolha)** e as dúvidas estão no fim.

**Implementado:** a campanha inteira é jogável — Prólogo (8 missões) e Atos 1–8 (65 missões, 73 no
total), com briefing e falas finais, escolhas, códice (60 documentos), recrutas da história e
epílogo com variações. Missões em dados (`src/game/data/story/cap*.json`), regras puras em
`world/story.ts` e `world/story_battle.ts`, diálogo em `scenes/shared/story_dialog.ts`, diário e
códice em `scenes/world_map/journal_screen.ts`. As tabelas abaixo são o desenho original; onde a
revisão mudou algo, vale a seção seguinte e os arquivos de dados.

## Revisão da história (v0.3)

Mudanças feitas ao implementar, para tirar clichês e amarrar os atos:

- **O comandante é o "Lote 1".** Vinte anos atrás, o Templo de Aster usou 24 crianças como
  condutores para abrir o Selo da Carne; só uma sobreviveu, com a marca de sete traços no pulso.
  O Capitão **Edran** a tirou do porão, a criou como órfão de guerra e trancou a porta. O
  medalhão do P1 tem o mesmo símbolo da cicatriz. O Devorador "conhece" o comandante porque o
  provou e não terminou de comer — e, na memória devolvida pelo Arquivista (7.8), o menino de seis
  anos olhou de volta e disse **não**. Daí "Porque ele me conhece" (8.4) e o discurso da 8.1.
- **Edran** vira mentor e personagem jogável (1.6). A líder rebelde ganha nome e passado:
  **Maela de Arven**, que serviu sob o comandante ("Eu servi sob seu comando").
- **O rei não busca a própria imortalidade:** quer salvar a **rainha Elenya**, que está morrendo.
  Moraeth usa isso. Na 3.8 a rainha se joga entre o rei e a porta (escolha da 3.3: prometer ou
  recusar não deixar) e morre; o rei é puxado para o Vazio e volta na 6.6 metade homem, metade
  fresta, pedindo para ser parado (escolha: libertá-lo ou executá-lo).
- **Moraeth é trágico, não um vilão de manual:** é sobrevivente de **Ysmar**, um mundo já comido.
  A filha, **Nhaela**, "dormiu e não acordou"; ele acredita que, dando outro mundo ao Devorador,
  recebe o dele de volta. O diário (2.6) começa sempre com "Minha Nhaela"; o quarto dela está no
  palácio invertido (5.7); Nhaela está entre os sobreviventes que a resistência resgata (5.6). Na
  6.7 ele descobre que a fome mentia (escolha: poupá-lo ou entregá-lo à justiça).
- **A princesa Lirael é herdeira dos arquitetos dos Selos:** os primeiros reis de Valdoria ergueram
  os Sete Selos (Arquivo Real, 3.2). Por isso ela desperta na 3.8, segura a Passagem na 5.4 e
  ativa o Selo VII do lado humano na 8.8.
- **O Viajante é o espelho de Moraeth:** também perdeu o mundo; Moraeth escolheu alimentar a fome,
  o Viajante escolheu andar. Entra na equipe na 6.4.
- **O Devorador** é a fome que ficou no corte quando os antigos dividiram a realidade; o **Vazio** é
  a metade esquecida — corredor entre infinitos mundos. Os Atos 5–6 contam isso em camadas
  (5.1 o Vazio · 5.7 Ysmar · 6.2 a marca é uma assinatura · 6.5 o que é o Devorador).
- **Barões com identidade própria**, cada um preso a um Selo rachado:
  - **Vorgath, o Pastor de Ossos** (Carne): era médico num mundo sem nome; costura enxertos de
    muitos mundos num "rebanho" onde ninguém fica sozinho. Chama reforços e se cura.
  - **Ixalle, a Mãe-Coro** (Vínculo): feita das almas de Vila do Musgo (a Cidade Vazia da 4.2);
    fala com mil vozes. Escolha: libertar as vozes ou destruir o coro.
  - **O Arquivista** (Memória): come nomes; guardava os seis primeiros anos do comandante. Some
    (camuflado) e caça quem está sozinho.
- **Escolhas com consequência:** resposta da cerimônia (P1); emboscar ou seguir a carroça (1.3);
  entregar as Crianças da Lua a Maela ou a Ostran (1.4: muda falas no Ato 2/4 e se Maela entra na
  equipe); promessa à rainha (3.3); destino do rei (6.6) e de Moraeth (6.7); coro de Ixalle (7.6);
  discurso final (8.1). O epílogo junta tudo.
- **Deserção (1.8) usa a lealdade:** heróis com lealdade abaixo de 30 ficam com o rei.
- **Véu:** em 100, o Selo rompe antes da hora — as missões que faltavam no capítulo se perdem
  (marcadas no diário) e o clímax abre na hora; o epílogo lembra das cicatrizes.
- **Alianças (Ato 4):** uma por capital (Silvânia, Hiemária, Marenhal, Sahrim, Aurélia); a da
  capital que virou base é dispensada.
- Recrutas da história (vão para a reserva, traço de personalidade próprio): Edran (1.6), Maela
  (1.8, se as crianças foram para ela), Lirael (3.8), Orun (4.9), Viajante (6.4).

### Sistemas ligados à campanha (v0.4)

- **Tutorial no Prólogo** (`data/story/tutorial.json`): cada missão P1–P8 traz cartas de lição na
  batalha; o mapa libera viagem (1 missão), loja e taverna (2), recrutamento (3) e serviços (4).
- **Conversas na base** (`data/story/camp.json`): 12 escritas (Edran, Maela, Lirael, Orun, Viajante e
  pares) e as de vínculo, que surgem quando dois heróis sobem de nível de vínculo.
- **Missões pessoais** (`data/story/personal.json`, ★ no mapa): Vinte e Três Nomes (Edran), Ana
  (Maela), A Coroa sem Trono (Lirael), A Fenda (Orun), Um Nome (Viajante — Caelan). Cada uma libera a
  suprema do kit único do personagem (`data/skills/story_kits.json`).
- **Escolhas com peso mecânico:**
  - 1.4 (crianças com Maela ou com Ostran) → missão exclusiva no Ato 2: *Arven Se Levanta* (recruta
    Brann de Arven) ou *A Enfermaria Sitiada*;
  - 4.1 (socorrer Cristália ou Vel'Qadar) → a outra capital **cai de vez** (sem loja, recrutamento,
    serviço e aliança; ruína no mapa) e abre *As Ruínas de…*, em que o senhor sobrevivente
    (Seraphine ou Nassira) entra na equipe; a capital-base nunca cai;
  - batalhas decisivas (3.7, 6.8, 8.2): o herói com lealdade < 25 **trai** na 3ª rodada;
  - 8.8: **três finais** — O Guardião do Vazio, A Última Arquiteta (Lirael deixa a equipe) e A Ponte
    Vigiada (só com Moraeth poupado ou o coro libertado), cada um com epílogo próprio.
- **Mapas feitos à mão** (`mapgen/story_maps.ts`): 1.7, 3.6, 3.8, 8.3 (o chão desaba uma coluna por
  rodada) e 8.8.

### Como as missões funcionam

- Marcador dourado ◆ no mapa (**!** nova, **…** já lida) e rastreador no canto superior esquerdo.
- Menu do local → "📖 código título" → briefing; com esquadrão no local, "Começar".
- Batalhas de história: inimigos com nome de personagem, **chefes com fases** (limiar de vida →
  fala, cura, estados, reforços), **ondas de reforço** por rodada (e antes, se o campo esvaziar),
  **aliados controlados pela IA**, VIP, objetivos de Interagir, infiltração, limite de rodadas e
  mapa do **mundo invertido** (paleta violeta).
- Nível dos inimigos = max(missão − 3, 60% missão + 40% esquadrão) (`data/story/rules.json`).
- Ouro e XP: nível × 12 e nível × 8, mais as recompensas da missão.
- Derrota: a missão continua disponível.

## Espinha: os Sete Selos

O mundo humano e o mundo invertido eram um só plano. Para conter uma entidade (o Devorador), os
antigos dividiram a realidade e criaram **Sete Selos** — leis que mantêm os mundos separados. O
clero acredita que os Selos aprisionam a humanidade longe da vida eterna; o conselheiro usa essa
doutrina para convencer o rei a rompê-los. **(escolha: lista do texto dos Selos, no lugar de
"Observação… Despertar" do roteiro principal.)**

| Selo | protege | ao romper | primeiro indício | revelação | Barão ligado |
|------|---------|-----------|------------------|-----------|--------------|
| I — Carne | a vida física | mutações, corrupção | Prólogo (medalhão) | 1.7 (rompe no santuário) | I — Vorgath, o Pastor de Ossos |
| II — Memória | identidades e lembranças | ecos, ilusões | Ato 2 (tavernas) | 2.7 | III — O Arquivista |
| III — Vínculo | as almas | abduções | 2.3 (a mensagem) | 4.2 | II — Ixalle, a Mãe-Coro |
| IV — Forma | a matéria | realidade deformada | Ato 3 | 4.7 | — |
| V — Passagem | a fronteira | portais permanentes, o Muro Negro | 3.6 | 5.4 | — |
| VI — Nome | cada mundo como realidade própria | mundos sobrepostos | Ato 5 | 6.3 | — |
| VII — Horizonte | a separação total | entrada do Devorador | 6.8 | 8.8 | — |

O jogador **vê** os Selos muito antes de **entender**: símbolo religioso → marca de culto →
mecanismo mágico → lei da realidade → a única coisa que segura o Devorador.

## Como a campanha usa os sistemas do jogo

| sistema | papel na história |
|---------|-------------------|
| Mapa-mundo e tempo | missões principais aparecem como marcadores; o tempo corre entre elas |
| Tavernas | rumores por ato, informação incompleta que muda como a missão é jogada |
| Documentos | coletados em missões; formam o **códice**; alguns abrem a próxima missão |
| Pesquisa (a partir do Ato 2) | analisar objetos (medalhão, pulseira, fragmento de selo), interrogar prisioneiros (2.4, 2.5) — portão das missões principais |
| Captura | P4/1.x apresentam; 2.4 e 2.5 são de captura |
| Base | nasce no fim do Ato 1 (esconderijo); vira Quartel-General da Resistência em 4.1; postos avançados no Ato 7 |
| Contador do Véu | ver abaixo |
| Coberturas destrutíveis | focos, altares e o pilar (2.7, 3.4, 5.4, 8.5, 8.8) |

### Contador do Véu (o "contador de ritual" do design)

- Liga no fim do Ato 2 (2.8, quando o plano real é revelado). Sobe com o tempo e com ações do culto
  no mapa; desce com missões de atraso (sabotar ritual, destruir altar, resgatar sequestrados,
  retaliação).
- Mede **quanto falta para o culto forçar o próximo Selo**. Cada ato rompe um Selo no seu clímax;
  se o contador chegar a 100 antes, o Selo rompe **antes da hora**: o ato é antecipado e a história
  segue um ramo "e se" (ex.: uma capital é consumida e não vira aliada, uma cidade vira território
  inimigo, um personagem não é salvo). **Sem game over.**
- No Ato 7 vira o **contador de dias do Despertar** (o roteiro já prevê); no Ato 8, a barra do
  Selo VII dentro da batalha final (ali, zerar é derrota da batalha).

## Nomes (provisórios, gerados)

| quem / onde | nome |
|-------------|------|
| reino central e sua sede | Reino de Valdoria · Citadela Real |
| rei · rainha · princesa | Rei Ottovar III · Rainha Elenya · Princesa Lirael |
| conselheiro | Conselheiro Moraeth |
| velho shaman | Ancião Orun |
| o Viajante | sem nome |
| mentor do comandante · líder rebelde | Capitão Edran · Maela de Arven |
| mundo e filha de Moraeth | Ysmar · Nhaela |
| Barões | Vorgath, o Pastor de Ossos · Ixalle, a Mãe-Coro · O Arquivista |
| cidade da revolta / templo | Arven (era Moinhos, em Aurélia) · Templo de Aster |
| cidade do Ato 6 e da taverna de exemplo | Valen (era Enseada, em Marenhal) |

**Países e capitais** (formato "Nome fantasia — Lar dos …"; a função única de cada capital aparece
como bônus de esconderijo e, mais tarde, nas alianças):

| país — epíteto | capital | senhor(a) | função única (futura) |
|----------------|---------|-----------|------------------------|
| Silvânia — Lar dos Arqueiros | Verdelume | Ilwen Folhaverde, Guardiã do Bosque | batedores: revelam encontros e emboscadas no mapa |
| Hiemária — Lar dos Magos | Cristália | Arquimaga Seraphine Vael | saber arcano: pesquisa mais rápida |
| Marenhal — Lar dos Guerreiros | Bastiamar | Almirante Dravan Corvo-de-Ferro | forja e armaduras; rotas por mar |
| Sahrim — Lar dos Ladinos | Vel'Qadar | Nassira, a Mão Velada | informantes e mercado negro (melhor venda de materiais, contratos ilegais) |
| Aurélia — Lar dos Clérigos | Solenne | Sumo-Prelado Ostran Lúmen | enfermaria: ferimentos 2× mais rápido e moral restaurada |

**Serviço de cada capital (implementado, `world/capital_services.ts`, números em
`data/world/capitals.json`)** — aparece no menu do local quando há um esquadrão lá:

- **Verdelume — Pavilhão dos Caçadores:** registra o que se sabe de cada besta abatida. Ficha (1
  abate, grátis) → Atributos (5 abates, 40 ouro) → Habilidades (10, 90) → **Marca do Caçador** (20,
  180): +5% de dano e +5% de crítico contra a espécie. O **Bestiário conhecido** (menu ☰) mostra
  só o que foi registrado.
- **Bastiamar — refino de armas e armaduras** (+1…+5): arma +10% de ataque por nível; armadura e
  escudo +12% de defesa por nível (mínimo +1). Custo em ouro cresce com o nível e o preço do item.
- **Cristália — refino de itens mágicos** (+1…+5): acessórios e itens de joia de forja; +1 em cada
  bônus de atributo por nível.
- **Vel'Qadar — Mercado Negro:** 6 itens raros/épicos por mês, 40% mais caros; compra espólio
  pagando 30% a mais.
- **Solenne — Enfermaria:** esquadrão parado na capital (combatentes e escolta) sara ferimentos 2×
  mais rápido, se recupera por completo e tem a moral restaurada ao valor de referência a cada dia.

**Esquadrões** — além dos 6 combatentes, cada esquadrão leva uma **escolta** de até 6 (feridos e
aprendizes): viajam junto, se curam no caminho e na estalagem, não lutam e não ganham XP. Se o
esquadrão for dizimado, os escoltados escapam e voltam à base. Cada esquadrão escolhe nome, cor e
emblema do estandarte (menu da bandeira → Estandarte).

## Prólogo — O Comandante do Reino

**(decidido)** O prólogo é uma **viagem de apresentação**: como comandante do rei, o jogador visita
as cinco capitais e conhece seus senhores. Serve de tutorial do mapa (viagem, encontros, taverna,
loja, recrutamento) e planta a relação com cada senhor — no Ato 4 será preciso conquistar a
confiança deles para virar contra o rei.

| # | missão | tipo | o que acontece |
|---|--------|------|----------------|
| P1 | A Cerimônia | escolta urbana | patente na Praça Imperial; rei, rainha, princesa e conselheiro ("Uma resposta curiosa."); três ladrões atacam uma carroça. O rei envia o comandante às capitais |
| P2–P6 | Os Senhores das Capitais | uma por capital, em qualquer ordem | viajar até a capital, resolver um problema local com combate e conhecer o senhor (personalidade, o que valoriza, a função única da capital). Na primeira estrada, bandidos deixam cair um **medalhão** com um símbolo estranho (Selo I) |
| P7 | A Ordem | combate | volta à Citadela: "Uma revolta começou em Arven." Milícia, camponeses e desertores; "Vocês não sabem o que estão defendendo!"; o líder foge; um prisioneiro: "Pergunte ao rei onde estão as crianças." |
| P8 | A Noite das Carroças | infiltração sem combate | relatório ao conselheiro ("Não mencione crianças desaparecidas."); à noite, carroças fechadas saem da cidade, batidas dentro; não dá para interferir |

## Ato 1 — Rebeldes ("Eles estão errados" → "Eu estava lutando do lado errado")

| # | missão | tipo | o que acontece | mecânica nova |
|---|--------|------|----------------|---------------|
| 1.1 | Cinzas de Arven | combate | humanos com classes como as do jogador; "Eu servi sob seu comando." | inimigos humanos com build |
| 1.2 | O Templo Fechado | investigação | casa do líder e templo de Aster: pulseira infantil, sangue no porão, documento "Transporte autorizado. 12 indivíduos. Destino: Santuário Interno." | Interagir (baús, documentos) |
| 1.3 | Crianças da Lua | investigação | famílias, ferreiro ("correntes demais"), taverna ("toda terça uma carroça…", "o velho Edran") | pistas de taverna mudam a missão |
| 1.4 | A Carroça da Meia-Noite | infiltração → combate de 3 lados | seguir a carroça sem ser visto; rebeldes atacam para libertar as crianças; capitão: "Matem as crianças se necessário." | terceira facção, proteger civis, escolha |
| 1.5 | O Arquivo | infiltração | registros de transporte "Aprovado pelo Clero"; alarme chama reforços | alarme/reforços |
| 1.6 | O Desertor | escolta | Capitão Edran: "O rei não começou isso. Mas ele sabe."; entrega uma **chave militar** | VIP |
| 1.7 | O Santuário Profundo | resgate + chefe | a chave abre o santuário selado; crianças usadas como condutores; chefe **Sacerdote Custódio**; o **Selo I rompe em parte**; uma criatura observa pelo portal e some; documentos: Ordem do Véu, Projeto Ascensão, Sétimo Selo | resgatar VIP (crianças), chefe |
| 1.8 | A Deserção | escolha + fuga | comandante superior com carta do conselheiro ("O rei deve continuar acreditando…"); o rei manda executar os líderes rebeldes; recusa ("Eu sou o reino." / "Não mais."); fuga com parte das tropas; **escolha da capital-esconderijo** | escolha, fuga (extração) |

## Ato 2 — Teoria da Conspiração ("Quem está por trás?")

| # | missão | tipo | o que acontece | mecânica nova |
|---|--------|------|----------------|---------------|
| 2.1 | O Exílio | viagem/fuga | chegar ao esconderijo sem ser pego; **a base nasce** (Quartel, Biblioteca, Forja) | base, pesquisa, forja |
| 2.2 | O Dinheiro do Templo | roubo | registros financeiros numa mansão: nobres financiam templos | Roubar/atrasar |
| 2.3 | O Mensageiro | perseguição | "O terceiro selo será aberto quando a lua alcançar sua posição." | alvo que foge pela borda |
| 2.4 | O Nobre | captura | sequestrar um nobre; interrogatório: "Ele já entregou o reino." | captura + Prisão |
| 2.5 | O Confessor | captura | sacerdote: "Não adoramos um demônio. Abrimos uma porta." | — |
| 2.6 | O Conselheiro | infiltração | correspondências: ele manipula rei, clero e nobres — mas também responde a alguém | — |
| 2.7 | O Ritual | destruir foco | portal aberto gera criaturas a cada X rodadas; primeira criatura interdimensional; **Selo II** aparece | spawns por rodada |
| 2.8 | O Véu | chefe | Guardião do Véu; o ser não quer ser invocado, quer **atravessar**; mensagem da princesa; **liga o Contador do Véu** | contador |

## Ato 3 — Rebeldes! Protejam o Reino ("O que o conselheiro quer?")

| # | missão | tipo | o que acontece |
|---|--------|------|----------------|
| 3.1 | A Princesa | infiltração (sem alarme) | encontro secreto: "Meu pai mudou depois que começou a ouvir o conselheiro." |
| 3.2 | O Arquivo Real | roubo | o rei participa dos rituais por vontade própria (vida eterna) |
| 3.3 | A Rainha | escolta secreta | "Quero salvar o homem que ele era." |
| 3.4 | Sangue no Altar | 3 objetivos simultâneos | destruir 3 altares; soldados corrompidos (mutações, armaduras fundidas) |
| 3.5 | O Exército Corrompido | defesa | criaturas entram a cada rodada; escolher onde posicionar |
| 3.6 | A Porta | evento + combate | o conselheiro abre um pequeno portal (indício do Selo V); primeiro olhar do Devorador |
| 3.7 | Assalto ao Palácio | combate com aliados IA | rebeldes, agentes da princesa, soldados da rainha |
| 3.8 | O Salão Oval | chefe em 3 fases | rei humano → corrompido → portal; a rainha morre; **a princesa desperta**; recuo; a Citadela é perdida |

## Ato 4 — Incursões e União ("O que ataca o mundo?")

| # | missão | tipo | o que acontece |
|---|--------|------|----------------|
| 4.1 | Retorno | defesa | primeira incursão de portais na base; a base vira **Quartel-General da Resistência** (mais espaços) |
| 4.2 | A Cidade Vazia | investigação | roupas, comida na mesa, nenhum corpo; um **eco de alma**: "Fomos levados." (**Selo III**) |
| 4.3–4.6 | Alianças | **uma missão própria por capital** (as 4 que não são a base), em qualquer ordem | cada senhor conhecido no prólogo pede uma prova diferente: defender a capital de um senhor desconfiado, impedir uma guerra civil com duas frentes, resgatar um senhor capturado (criaturas usam humanos como hospedeiros), e a quarta conforme a capital. O que o jogador fez no prólogo e a lealdade conquistada facilitam |
| 4.7 | A Cidade que Não Existia | investigação | cidade de um mapa antigo que ninguém conhece; versão distorcida nas ruínas; **a princesa reconhece o símbolo** (**Selo IV**) |
| 4.8 | O Shaman | expedição | Ancião Orun: "Porque vocês não são os primeiros."; explica o Selo IV |

As missões de aliança são escritas por capital (não por "Norte/Leste/Sul"), já que a base varia.

## Ato 5 — Combate ao Mal ("Existem outros mundos?")

5.1 O Outro Mundo (tutorial de portal) · 5.2 A Barreira · 5.3 A Praça Central · 5.4 O Pilar (3 focos
antes do núcleo; ao destruí-lo, remove a última âncora — **Selo V**) · 5.5 A Queda do Muro (proteger
o shaman) · 5.6 Os Sobreviventes (evacuar civis) · 5.7 O Palácio Vazio (exploração sem combate) ·
5.8 A Travessia (proteger o shaman X rodadas).

## Ato 6 — Ao Desconhecido ("Quem é o Devorador?")

6.1 O Outro Continente · 6.2 A Cidade Invertida (taverna vazia com o símbolo do Ato 1) · 6.3 As Três
Capitais (duas foram consumidas — **Selo VI**) · 6.4 O Viajante ("Alguém que chegou tarde.") ·
6.5 A Guerra dos Mundos ("É o que sobrou quando o mundo de vocês foi separado.") · 6.6 O Rei
Corrompido · 6.7 O Conselheiro (nunca controlou a criatura) · 6.8 O Despertar ("Ele já está aqui.";
**Selo VII** em risco).

## Ato 7 — Cace os Barões ("Quem são seus generais?")

Contador de dias do Despertar; **postos avançados** (cura, recrutamento, armazém, teleporte, defesa).
**(decidido: três Barões, um por capital do mundo invertido, cada um ligado a um Selo.)**

| # | missão | o que acontece |
|---|--------|----------------|
| 7.1 | A Primeira Cabeça | primeiro posto avançado |
| 7.2 | Sob a Terra | buracos no mapa; inimigos somem e reaparecem |
| 7.3 | **Barão I — Vorgath, Senhor das Profundezas** (Carne; Rek'Sai) | humanoide que conversa e vira criatura subterrânea |
| 7.4 | O Céu | segundo posto; ataques aéreos |
| 7.5 | A Horda | defender 3 posições; General do Enxame |
| 7.6 | **Barão II — Ixalle, Rainha do Enxame** (Vínculo; Bel'Veth) | voa, cria unidades, transforma as menores |
| 7.7 | O Arquivo Vivo | terceiro posto; unidades "esquecem" habilidades por turnos |
| 7.8 | **Barão III — O Arquivista** (Memória; Kha'Zix) | apaga-se da memória das unidades (invisível), caça quem está isolado; depois: "E agora ele não precisa mais esperar." — **DESPERTAR: 3 DIAS** |

## Ato 8 — O Aniquilador ("O Devorador pode ser parado?")

8.1 Marcha Final (escolher comandantes) · 8.2 O Último Posto (sobreviver X rodadas) · 8.3 O Caminho
do Devorador (tiles somem) · 8.4 O Coração ("Porque ele me conhece.") · 8.5 O Despertar (destruir os
focos) · 8.6 O Aniquilador, fase I · 8.7 O Fim dos Mundos, fase II · 8.8 O Último Selo: o **Selo VII
precisa ser ativado dos dois lados ao mesmo tempo** — mapa em duas camadas (princesa e exércitos no
mundo humano; protagonista no invertido; shaman segura a conexão); a barra do Selo VII não pode
zerar.

**Epílogo:** o portal fecha; o Viajante fica:

> "Este mundo é apenas um mundo de transição — o Vazio —, um meio de caminho que conecta a
> infinitos outros. Agora vocês já sabem como chegar aqui. Mas devo alertá-los: esta batalha, a
> morte dos Barões, não passará despercebida.
>
> Eles sabem que vocês sobreviveram."

Reconstrução; na taverna: "Acredito que ele apenas comprou algum tempo."; o primeiro símbolo na
parede. (O mundo invertido é a metade esquecida da realidade, que virou o Vazio: o meio do caminho
entre os mundos.)

## Regras de escrita (dos textos)

- Cada missão tem uma função mecânica **e** uma narrativa; cada ato responde uma pergunta e cria outra.
- Tavernas e documentos dão informação incompleta, que muda como a missão pode ser jogada.
- Nunca explicar o que pode ser descoberto. Referências ocultas só como easter eggs.
- Sidequests nunca competem com a principal (passado de personagem, lenda, item único…).

## Peças de jogo que a história pede

| peça | usada em | existe? (v0.3) |
|------|----------|---------|
| missões principais no mapa, com texto antes/depois | todas | sim |
| investigação: mapa sem combate obrigatório, Interagir com objetos e NPCs | P5, 1.2, 1.3, 4.3, 4.7, 5.7 | não |
| documentos e códice | P2 em diante | sim |
| rumores de taverna por ato | todas | sim (1 rumor do capítulo + 2 gerais) |
| infiltração com alarme e reforços | P8, 1.4, 1.5, 2.6, 3.1 | sim (início escondido + onda de reforço) |
| terceira facção e aliados IA | 1.4, 3.7, 8.1 | sim (aliados IA) |
| VIP, civis, crianças | P1, 1.4, 1.6, 1.7, 3.3, 5.6 | sim |
| perseguição | 2.3 | sim (alvo + limite de rodadas) |
| objetivos simultâneos | 3.4, 4.5, 7.5 | sim |
| spawns por rodada, focos destrutíveis | 2.7, 3.5, 4.2, 5.4, 8.5 | sim (ondas; focos = runas) |
| chefes com fases | 1.7, 2.8, 3.8, 7.x, 8.6–8.8 | sim |
| escolhas com consequência | 1.4, 1.8, 4.5 | sim (marcas, falas, recrutas, epílogo) |
| captura e interrogatório | P4, P6, 2.4, 2.5 | sim |
| base, pesquisa, forja | Ato 2 em diante | sim |
| postos avançados | Ato 7 | só narrativo |
| mapas especiais (palácio, templo em níveis, tiles somem, duas camadas) | 1.7, 3.8, 8.3, 8.8 | não (mapas gerados; 8.3 usa fuga com limite de rodadas) |

## Tropas: lealdade, moral e personagens da história

- **Lealdade** (por herói): sobe quando o herói é usado em missões, bem equipado, sobe de nível e
  recebe atenção do comandante; decide quem segue o comandante na deserção (1.8) e mais tarde.
- **Moral** (por herói): cai ao ver aliados morrerem em combate; moral baixa por muito tempo faz a
  lealdade cair aos poucos.
- **Implementado** (`world/loyalty.ts`, números em `data/base/loyalty.json`), ambos de 0 a 100,
  começando em 50 (lealdade) e 70 (moral):
  - por batalha, cada sobrevivente: lealdade +2 (+1 se vitória) e +3 por nível ganho; moral +5 na
    vitória, −10 na derrota e −15 por aliado morto;
  - por dia: a moral volta ao valor de referência (70), +3/dia descansando (base ou estalagem) ou
    +1/dia viajando; moral < 30 tira 0,5 de lealdade por dia, < 15 tira 1; herói parado na reserva
    perde 0,1/dia; herói com ≥ 3 dos 4 espaços principais equipados ganha 0,2/dia;
  - **Conversar** no Quartel (atenção do comandante): +3 lealdade e +6 moral, a cada 7 dias, com o
    esquadrão parado;
  - por ora só aparece na ficha (barras no Quartel); os efeitos (quem segue na deserção, quem
    abandona, bônus em combate) ficam para o pacote da história.
- **Personagens da história** (princesa, senhores das capitais, shaman, Viajante) viram jogáveis em
  certos momentos e entram como 7º, 8º e 9º membros do esquadrão.
- **Academia de Treino** (instalação da base, como a Escola de Guerrilha do XCOM): habilidades do
  comandante — aumentar o tamanho da equipe e outros bônus da árvore do comandante (a definir).

## Pendente

1. Mapas feitos à mão para as demais missões (hoje só 1.7, 3.6, 3.8, 8.3 e 8.8) e o mapa em duas
   camadas da 8.8.
2. Ramos "e se" mais fundos para o Véu (hoje: missões perdidas, marca no diário e linha no epílogo).
3. Postos avançados do Ato 7 como sistema (hoje só narrativos).
4. Árvore do comandante na Academia de Treino.
5. Retratos dos personagens (hoje ícones) e trilhas por ato.
