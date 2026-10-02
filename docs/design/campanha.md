# Campanha principal (v0.2 — decisões de 2026-10-02 aplicadas)

Junta os três textos de [fontes/](fontes/): [roteiro principal](fontes/campanha_roteiro_principal.md),
[nós da história](fontes/campanha_nos_da_historia.md) e [sete selos](fontes/campanha_sete_selos.md).
Quando eles divergem, a escolha feita aqui está marcada com **(escolha)** e as dúvidas estão no fim.
Nada disso está implementado ainda.

## Espinha: os Sete Selos

O mundo humano e o mundo invertido eram um só plano. Para conter uma entidade (o Devorador), os
antigos dividiram a realidade e criaram **Sete Selos** — leis que mantêm os mundos separados. O
clero acredita que os Selos aprisionam a humanidade longe da vida eterna; o conselheiro usa essa
doutrina para convencer o rei a rompê-los. **(escolha: lista do texto dos Selos, no lugar de
"Observação… Despertar" do roteiro principal.)**

| Selo | protege | ao romper | primeiro indício | revelação | Barão ligado |
|------|---------|-----------|------------------|-----------|--------------|
| I — Carne | a vida física | mutações, corrupção | Prólogo (medalhão) | 1.7 (rompe no santuário) | I — Senhor das Profundezas |
| II — Memória | identidades e lembranças | ecos, ilusões | Ato 2 (tavernas) | 2.7 | III — O Arquivista |
| III — Vínculo | as almas | abduções | 2.3 (a mensagem) | 4.3 | II — Rainha do Enxame |
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
| Barões | Vorgath, Senhor das Profundezas · Ixalle, Rainha do Enxame · O Arquivista |
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
| Aurélia — Lar dos Clérigos | Solenne | Sumo-Prelado Ostran Lúmen | enfermaria e fé: ferimentos e moral |

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

| peça | usada em | existe? |
|------|----------|---------|
| missões principais no mapa, com texto antes/depois | todas | não (só contratos) |
| investigação: mapa sem combate obrigatório, Interagir com objetos e NPCs | P5, 1.2, 1.3, 4.3, 4.7, 5.7 | não |
| documentos e códice | P2 em diante | não |
| rumores de taverna por ato | todas | parcial (rumores aleatórios) |
| infiltração com alarme e reforços | P8, 1.4, 1.5, 2.6, 3.1 | parcial (escondido existe) |
| terceira facção e aliados IA | 1.4, 3.7, 8.1 | não |
| VIP, civis, crianças | P1, 1.4, 1.6, 1.7, 3.3, 5.6 | não |
| perseguição | 2.3 | não |
| objetivos simultâneos | 3.4, 4.5, 7.5 | não |
| spawns por rodada, focos destrutíveis | 2.7, 3.5, 4.2, 5.4, 8.5 | coberturas destrutíveis sim; spawns não |
| chefes com fases | 1.7, 2.8, 3.8, 7.x, 8.6–8.8 | não |
| escolhas com consequência | 1.4, 1.8, 4.5 | não |
| captura e interrogatório | P4, P6, 2.4, 2.5 | não (desenhado) |
| base, pesquisa, forja | Ato 2 em diante | não (desenhado) |
| postos avançados | Ato 7 | não |
| mapas especiais (palácio, templo em níveis, tiles somem, duas camadas) | 1.7, 3.8, 8.3, 8.8 | não |

## Tropas: lealdade, moral e personagens da história

- **Lealdade** (por herói): sobe quando o herói é usado em missões, bem equipado, sobe de nível e
  recebe atenção do comandante; decide quem segue o comandante na deserção (1.8) e mais tarde.
- **Moral** (por herói): cai ao ver aliados morrerem em combate; moral baixa por muito tempo faz a
  lealdade cair aos poucos.
- **Personagens da história** (princesa, senhores das capitais, shaman, Viajante) viram jogáveis em
  certos momentos e entram como 7º, 8º e 9º membros do esquadrão.
- **Academia de Treino** (instalação da base, como a Escola de Guerrilha do XCOM): habilidades do
  comandante — aumentar o tamanho da equipe e outros bônus da árvore do comandante (a definir).

## Pendente

1. Escolhas com consequência (1.4, 1.8, 4.x) e os ramos "e se": ficam para o pacote "e se". Antes,
   a história reta precisa estar pronta.
2. A missão de aliança de cada uma das 5 capitais (a 4ª prova) e o problema local de cada capital no
   prólogo.
3. Árvore do comandante na Academia de Treino.
