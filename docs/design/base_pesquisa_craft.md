# Base, pesquisa, fabricação e joias da alma (rascunho para debate)

> **Status: v0.3 — direção aprovada (2026-10-02), ainda não implementada.** As decisões fechadas estão
> no GDD (D12, D20, D47, D54, D56, D57 e D62–D70). Os números da seção 13 são genéricos, para
> balancear jogando.
> Referências: XCOM (pesquisa que destrava fabricação e história, interrogatório, Projeto Avatar),
> Xenonauts (tempo correndo no mapa, materiais de alienígenas abatidos).

## 1. O ciclo

```
batalha ──► drops (materiais, joias, documentos, prisioneiros)
   ▲              │
   │              ├─► venda (ouro)
   │              ▼
   │         PESQUISA (materiais + dias)
   │              ├─► bônus contra a criatura / família
   │              ├─► receitas de fabricação
   │              ├─► joias da alma utilizáveis
   │              └─► avanço da história (análise, interrogatório)
   │              ▼
   └──── FABRICAÇÃO (materiais + ouro + dias) ─► armas, armaduras, acessórios, utilitários
```

Ouro continua sendo o recurso único **da economia**; os materiais são **chaves** (o que você
derrotou define o que você pode pesquisar e fabricar). Isso faz o jogador caçar feras de propósito.

## 2. Decisões atuais que mudam

| decisão | hoje | proposta |
|---------|------|----------|
| D12 Base | esconderijo vira base no Ato 4 | a base nasce no fim do Ato 1 (esconderijo) com poucas instalações; no Ato 4 ela cresce (líderes das capitais, defesa) |
| D20 Recursos | só ouro | ouro + materiais (drops) |
| D54 Itens | sem fabricação | fabricação destravada por pesquisa |
| D56 Consumíveis | somem ao usar | utilitários **não somem**: 1 uso por batalha, recarregam depois; melhorar aumenta usos/efeito |

## 3. Drops

| tipo | de quem | chance (provisória) | para quê |
|------|---------|---------------------|----------|
| material comum | toda fera | 60–90%, 1–2 un. | pesquisa, fabricação, venda |
| material raro | toda fera | 10–20% | receitas melhores, melhorias |
| troféu | épicas e lendárias | 100% (1 por espécie) | itens únicos e pesquisa de chefe |
| joia da alma | toda fera | 0,5% comum → 3% lendária | habilidade da besta (seção 6) |
| documentos / objetos | humanos, missões | roteiro | pesquisa de história |
| prisioneiro | humano capturado | ação de captura | interrogatório |

- **Materiais por família, não por espécie** (ex.: glândula de veneno vem de serpentes, aranhas e
  escorpiões): ~25 materiais em vez de 130. Cada espécie ainda tem a sua **pesquisa** própria.
- Drops só entram no estoque quando o esquadrão volta à base (regra atual D54).

### Perdas e recuperação

- **Herói morto em combate:** os companheiros recolhem tudo o que ele levava (equipamento,
  utilitários, joias) e o esquadrão carrega de volta.
- **Esquadrão dizimado:** os itens se perdem, mas fica um **marcador no mapa** no local da derrota.
  Outro esquadrão que chegar lá **recupera** os itens.
- **O marcador expira em 4 dias.** Conta: a maior viagem do mapa (entre duas estradas em lados
  opostos) leva ~38 h = 1,6 dia na velocidade atual → arredonda para 2 dias, mais 2 dias para se
  preparar e partir. Assim ninguém é punido por morrer do outro lado do mapa. Se o mapa ou a
  velocidade de viagem mudarem, a conta é refeita (regra: maior viagem arredondada para cima + 2).

### Famílias de material (proposta inicial)

| família | material comum | material raro | exemplos |
|---------|----------------|---------------|----------|
| roedores e pequenos mamíferos | pelagem | dente afiado | Esquilo-Farpa, Lebre, Furão |
| canídeos | couro de lobo | presa | Lobo-da-Silvia, Coiote, Chacal |
| felinos | pelagem fina | garra | Gato-de-Musgo, Leopardo-das-Neves |
| ursídeos e grandes feras | couro grosso | garra pesada | Urso-Pardo, Yeti, Urso-Polar |
| cervídeos e chifrudos | couro | chifre | Cervo-da-Folha, Caribu, Touro-Galo |
| aves | pena | pena rara | Coruja, Falcão, Abutre |
| serpentes | escama | glândula de veneno | Víbora-Cipó, Serpente-do-Sol |
| aracnídeos e escorpiões | quitina | glândula de veneno | Aranha, Tarântula, Escorpião |
| répteis e anfíbios | escama | pele viscosa | Lagarto-Armado, Rã, Iguana |
| crustáceos e conchas | carapaça | pérola | Caranguejo, Tartaruga, Quelone |
| peixes e cefalópodes | escama marinha | tinta | Arraia, Lula, Polvo, Tubarão |
| fadas e espíritos | pó feérico | essência espiritual | Fadas, Espíritos, Fantasmas |
| plantas e fungos | fibra | esporo | Fungo-Caminhante, Ent, Espantalho |
| golens e elementais | fragmento de pedra / gelo / vidro | núcleo elemental | Golens, Elemental-de-Vidro |
| dragões e serpes | escama de dragão | sangue de dragão | Wyvern, Dragão-da-Clareira |
| criaturas míticas | — | troféu da espécie | Esfinge, Mantícora, Gorgona, Hidra |

Mais um material elemental por elemento da criatura (cinza de fogo, cristal de gelo…), para as
receitas mágicas. A lista final sai junto da tabela de drops no Bestiário.
- A tabela de drops fica na ficha da criatura, editável no Bestiário.

## 4. Pesquisa

Instalação: **Biblioteca** (ou Arquivo) na base. Sem base, não há pesquisa.

| categoria | exige | resultado | exemplo |
|-----------|-------|-----------|---------|
| Estudo de criatura | N materiais da espécie (ex.: 5) | ficha completa no bestiário, +10% dano/acerto contra ela, receitas da família | Cobra-Víbora → Antídoto |
| Estudo de material | N unidades | receitas | Glândula ×5 → receita "3 glândulas = Antídoto" |
| Joias da alma | 1 joia | "aprende" a usar a joia daquela espécie (seção 6) | Joia do Urso-Chifre |
| História | objeto, documento ou prisioneiro | próxima missão principal, rumores, mapa | analisar gema, interrogar oficial |
| Técnica | pesquisas anteriores | armas/armaduras de nível maior | Aço temperado |

- Fila com **dias** de trabalho; o tempo do mapa corre (pressão real).
- **Proposta de identidade:** heróis parados na base podem ser designados para pesquisar ou forjar
  (Mago/Clérigo aceleram pesquisa, Guerreiro/Ladino aceleram forja). Dá uso a quem está ferido ou
  na reserva, sem precisar de cientistas genéricos.
- Pesquisas de história são o **portão** das missões principais (como no XCOM).

## 5. Fabricação

Categorias: armas, armaduras, acessórios, utilitários e **itens mágicos** (com joia de forja).

Instalação: **Forja/Oficina**. Receitas destravadas por pesquisa; custo = materiais + ouro + dias.

- **Armas e armaduras** fabricadas são melhores que as da loja no mesmo nível, ou têm efeito
  próprio (lâmina de presa de víbora: envenena; couraça de escamas: resistência a fogo).
- **Utilitários** (3 espaços por herói): não somem. Cada um tem **usos por batalha** (1 no Nv 1);
  depois da batalha recarregam. **Melhorar** (fabricar a versão +) aumenta usos ou efeito:
  Antídoto → Antídoto+ (2 usos) → Antídoto++ (cura também veneno da área).
- **Melhoria de itens existentes** consome materiais (armas +1…+5).

## 6. Joias da alma (diferencial)

- Toda fera tem chance mínima de deixar a **joia da alma** da sua espécie.
- **Uma pesquisa por besta:** a primeira joia de cada espécie precisa ser pesquisada para a base
  "aprender" a usá-la; depois disso, todas as joias daquela espécie servem.
- Cada espécie define o **tipo** da sua joia, **escolhido à mão, monstro por monstro**, no
  Bestiário:
  - **Joia de habilidade:** equipada num **espaço próprio** da ficha (1 por herói; um 2º com
    melhoria da base ou nível alto), dá a **habilidade-assinatura da besta**, calculada com os
    atributos de quem equipa (matemática central, `rules/stats.ts`). Repetidas fortalecem a joia
    (Nv 1–5, como as habilidades).
  - **Joia de forja (essência):** não vira habilidade; vai para a Forja como ingrediente de
    **armas, armaduras e acessórios mágicos**, com bônus próprios da besta (ex.: essência do
    Ifrit → espada com dano de fogo e imunidade a queimadura).
- Raridade da fera = poder da joia; joias épicas/lendárias exigem nível mínimo do herói.

## 7. Base

| instalação | faz | quando |
|------------|-----|--------|
| Quartel | tropas e equipamento (já existe) | sempre |
| Biblioteca | pesquisa | fim do Ato 1 |
| Forja | fabricação e melhorias | fim do Ato 1 |
| Enfermaria | ferimentos curam mais rápido | upgrade |
| Prisão | guarda prisioneiros para interrogatório | Ato 2 |
| Santuário | afinar e fortalecer joias da alma | após a 1ª joia pesquisada |
| Rede de informantes | mais contratos, revela missões e portais | upgrade |

- Construir custa ouro + dias; poucos espaços no começo (escolhas), mais espaços no Ato 4.
- A capital escolhida como esconderijo dá um bônus (ideia do adendo): ex. Magos = pesquisa mais
  rápida, Guerreiros = forja mais barata.

## 8. Captura e interrogatório

- Ação nova contra humanos com pouca vida (ex.: ≤ 25%) e adjacentes: **Render/Amarrar**
  (ou item utilitário de corda/rede). O prisioneiro volta com o esquadrão.
- Missões de vitória "sequestrar" (D47 já prevê) usam isso.
- Interrogar na Prisão = pesquisa de história.

## 9. Pressão do mapa (depois)

Aparece quando o jogador entende o plano real do inimigo (fim do Ato 2: o ser interdimensional).
Contador de **ritual** que avança com o tempo e com ações inimigas no mapa (sequestros, portais);
missões de **atrasar** recuam o contador (seção 10). Liga com o "contador de dias" já previsto no
Ato 7.

## 10. Tipos de missão (inspirados no XCOM 2)

Usados pela história, pelos contratos e pelas missões de atraso do ritual. A coluna "base no jogo"
mostra o que já existe e o que falta.

| missão | objetivo | começa | base no jogo |
|--------|----------|--------|--------------|
| **Resgatar VIP** | libertar o VIP de uma cela ou carroça e levá-lo até a zona de fuga | escondido | escondido e zona de fuga existem; falta **Interagir** (abrir cela) e unidade **VIP** escoltada |
| **Extrair VIP** | levar o VIP, que começa junto do esquadrão, até a zona de fuga em X rodadas | à vista | zona de fuga e rodadas existem; falta o VIP |
| **Neutralizar VIP** | eliminar **ou render** um alvo importante e evacuar | escondido | vitória "alvo" existe; render vem da captura (D67) |
| **Incursão de suprimentos** | recolher baús espalhados antes que sejam destruídos, ou tomar uma carroça de suprimentos | à vista | falta **Interagir** (pegar baú) e objetos com contagem |
| **Roubar / atrasar** | chegar a um arquivo, círculo de runas ou altar e **decifrar/roubar** em X rodadas | escondido | falta **Interagir** com duração (canalizar 1–2 turnos) |
| **Destruir altar / comandante** | destruir um objeto específico ou eliminar o comandante | à vista | coberturas destrutíveis e vitória "alvo" já existem |
| **Retaliação** | defender civis num vilarejo atacado por cultistas; salvar o mínimo de N civis | à vista, inimigos já no mapa | falta **civis** (unidades neutras que fogem) e contagem de salvos |

Peças novas que essas missões pedem (todas reutilizáveis):

- **Interagir:** ação de herói adjacente a um objeto (abrir cela, pegar baú, decifrar runas);
  algumas levam turnos.
- **VIP / civis:** unidades aliadas sem controle direto (seguem o herói mais próximo ou fogem);
  se morrerem, a missão falha (VIP) ou conta como perda (civis).
- **Limite de rodadas** visível no painel de objetivo.
- **Início escondido** para o esquadrão inteiro (mecânica de esconder já existe).

Missões de atraso do ritual: Roubar/atrasar, Destruir altar, Resgatar VIP (sequestrados) e
Retaliação. Cada uma recua o contador conforme a seção 13.

## 11. Ordem de implementação sugerida

1. Materiais + tabela de drops por criatura (no editor do Bestiário) + estoque.
2. Base mínima (Biblioteca + Forja) ao fim do Ato 1 (com atalho de dev).
3. Pesquisa: fila, dias, pré-requisitos, resultados.
4. Fabricação + utilitários com usos por batalha e melhorias.
5. Joias da alma (espaço, pesquisa, habilidade, fortalecer).
6. Captura + Prisão + pesquisas de história.
7. Instalações extras e bônus do esconderijo.
8. Contador de ritual.

## 12. Decidido (2026-10-02)

- Base nasce no fim do Ato 1 e cresce no Ato 4.
- Materiais por família (~25); pesquisa por espécie.
- Heróis parados na base aceleram pesquisa (Mago, Clérigo) e forja (Guerreiro, Ladino).
- Todo utilitário recarrega depois da batalha, inclusive as poções da loja; a melhoria pode dar
  mais usos ou mais efeito, conforme a receita.
- Joias: uma pesquisa por besta; joia de habilidade (habilidade fixa da espécie, espaço próprio)
  ou joia de forja (itens mágicos), conforme a espécie.
- Captura: ação de qualquer herói contra humano com pouca vida; corda/rede melhoram.
- Herói morto: companheiros recolhem os itens. Esquadrão dizimado: itens perdidos com marcador
  no mapa por 4 dias, recuperáveis por outro esquadrão.
- Tipo de joia (habilidade ou forja): escolhido à mão, espécie por espécie, no Bestiário.
- Números genéricos agora (seção 13), balanceados jogando.
- Tipos de missão do XCOM 2 adaptados (seção 10).

## 13. Números genéricos (provisórios)

**Drops (por fera derrotada)**

| | comum | raro | épico | lendário |
|--|------:|-----:|------:|---------:|
| material comum da família | 75%, 1–2 un. | 80%, 1–2 | 90%, 2–3 | 100%, 2–4 |
| material raro da família | 10% | 15% | 25% | 40% |
| material elemental | 15% | 20% | 30% | 50% |
| troféu da espécie | — | — | 100% | 100% |
| joia da alma | 0,5% | 1% | 2% | 3% |

**Venda (ouro por unidade):** material comum 5 · raro 25 · elemental 15 · troféu 150 · joia 300.

**Pesquisa**

| projeto | exige | dias |
|---------|-------|-----:|
| Estudo de criatura | 3 abates da espécie + 3 materiais da família | 2 / 4 / 6 / 10 (comum → lendária) |
| Estudo de material | 5 unidades | 3 |
| Joia da alma | 1 joia | 5 / 7 / 10 / 14 |
| História | objeto, documento ou prisioneiro | 3–7 (roteiro) |
| Técnica | pesquisas anteriores + 200–800 ouro | 7–14 |

- Bônus do estudo de criatura: +10% de dano e +10 de acerto contra a espécie.
- Heróis designados: cada um −15% do tempo (até 3); Mago e Clérigo contam em dobro na pesquisa,
  Guerreiro e Ladino na forja. Herói designado não viaja nem luta.

**Fabricação**

| item | materiais | ouro | dias |
|------|-----------|------|-----:|
| utilitário Nv 1 | 3–5 | 50 | 1 |
| melhoria de utilitário (+ / ++) | 5 / 8 | 100 / 200 | 2 / 3 |
| arma/armadura comum | 4 | 50% do preço de loja equivalente | 2 |
| arma/armadura rara | 6 + 1 raro | 50% | 4 |
| arma/armadura épica | 8 + 2 raros | 50% | 7 |
| item mágico (com joia de forja) | 6 + joia | 400 | 10 |
| melhoria de arma/armadura +1…+5 | 2 / 4 / 6 / 8 / 10 | 100 × nível | 1 × nível |

- Utilitários: Nv 1 = 1 uso por batalha; + = 2 usos; ++ = 2 usos e efeito maior.

**Joias da alma:** nível mínimo do herói 1 / 15 / 30 / 45 (comum → lendária); fortalecer até
Nv 5 gasta 1 / 1 / 2 / 3 joias repetidas.

**Base**

| | valor |
|--|------|
| espaços no fim do Ato 1 | 4 (Quartel, Biblioteca, Forja + 1 livre) |
| espaços no Ato 4 | 8 |
| Enfermaria | 300 ouro, 5 dias (ferimentos curam 2× mais rápido) |
| Prisão | 400 ouro, 6 dias (2 prisioneiros) |
| Santuário | 500 ouro, 7 dias |
| Rede de informantes | 600 ouro, 7 dias (+1 contrato por capital) |
| nível 2 de qualquer instalação | 2× o custo |

**Captura:** alvo humano com ≤ 25% da vida, adjacente; 50% de chance (corda +20%, rede +35%);
falhar gasta a ação.

**Contador de ritual (0–100):** +1 por dia; +5 por ação inimiga no mapa (sequestro, portal);
missão de atraso bem-sucedida −10 (Retaliação −15, Destruir altar −20). **Chegar a 100 não é
derrota:** o ato é antecipado e a história segue um ramo "e se" (o que acontece quando o inimigo
chega antes). Sem game over pelo contador; os ramos são escritos junto com a história.

## 14. Ferramentas de dev (implementadas)

- **Materiais** (`data/materials/materials.json`): 17 famílias, 42 materiais (comuns, raros e 9
  elementais), padrões de drop por raridade e preços de troféu/joia. Regras puras em
  `rules/drops.ts` (tabela padrão, valor esperado por abate, fontes de cada material, sorteio).
- **Bestiário → aba Drops:** família de material, tabela (material, chance, quantidade), troféu,
  joia da alma (chance, tipo **a definir / habilidade / forja**, habilidade que dá ou bônus de forja)
  e o valor esperado por abate. Todas as 126 feras começam com a tabela padrão e joia "a definir";
  invocações não deixam nada.
- **Menu principal → Materiais e drops:** lista de materiais com as feras que os deixam (chance,
  quantidade, biomas), joias da alma de todas as espécies por raridade (com o tipo escolhido),
  troféus e um resumo dos padrões. Edita nome, descrição e preço dos materiais; clicar numa fera
  abre a aba Drops dela no Bestiário.

**No jogo (implementado):** ao vencer, cada fera derrotada sorteia seus drops; o espólio fica com o
esquadrão até ele voltar à base (estoque da base); abates por espécie são contados (para a
pesquisa); espólio vende nas lojas das capitais e aparece no Quartel. Esquadrão dizimado deixa um
🎒 no mapa com contagem regressiva de 4 dias; outro esquadrão que chegar lá recolhe tudo.

## 15. Base, pesquisa e forja (implementado)

- **Esconderijo:** ao chegar ao Ato 2 sem base, o jogador escolhe uma das 5 capitais (com o senhor
  e o bônus de cada uma). A base nasce com Quartel, Biblioteca e Forja. Regras em `world/base.ts`,
  números em `data/base/base.json`.
- **Bônus do esconderijo:** Silvânia corta emboscadas pela metade; Hiemária pesquisa 25% mais
  rápido; Marenhal forja 25% mais rápido e mais barato; Sahrim vende espólio por +50%; Aurélia já
  vem com Enfermaria.
- **Instalações:** Enfermaria (ferimentos 2× mais rápido), Prisão, Santuário, Rede de informantes
  (+1 contrato por capital); 4 espaços (8 no Ato 4); custam ouro e dias.
- **Trabalho:** heróis da reserva designados para Biblioteca ou Forja (15% cada, classe certa em
  dobro, máx. 60%).
- **Pesquisa:** estudo de material (5 unidades, 3 dias) destrava receitas; estudo de criatura
  (3 abates + 3 materiais da família) dá +10% de dano e +10 de acerto contra a espécie em batalha.
- **Forja:** 12 receitas (antídoto, unguento, pó de névoa, granada de cinza, cristal congelante,
  couraças, arco de chifre, lâmina de presa, espada de escama, amuleto de pena); Antídoto+ melhora
  o Antídoto (2 usos).
- **Utilitários recarregáveis:** itens de campo não somem; têm usos por batalha (padrão 1) e
  recarregam depois.

- **Joias da alma:** pesquisa por besta no Santuário (a joia não é gasta; o tipo precisa estar
  escolhido no Bestiário). Joia de habilidade: equipada no espaço de joia de um herói na base (nível
  mínimo 1/15/30/45), dá a habilidade escolhida da besta em batalha; fortalecer até Nv 5 funde 1/1/2/3
  repetidas (Santuário); remover devolve 1 joia. Joia de forja: peça base + joia + 6 materiais da
  família + 400 ouro, 10 dias → item épico "X de <besta>" com +3/+2 nos dois maiores atributos da
  besta e +2 de ataque/defesa, com o texto de bônus do Bestiário.

Falta: melhorias +1…+5 de armas e armaduras (exigem guardar o nível de cada peça), pesquisas de
técnica e de história.

## 16. Captura, Véu e peças de missão (implementado)

- **Render** (D67): humano adjacente com ≤ 25% da vida; 50% (+20 corda, +35 rede no espaço de item);
  falhar gasta a ação. Com Prisão (2 vagas) o rendido vira **interrogatório** na Biblioteca (3 dias:
  uma fala, um esconderijo de ouro, e é solto); sem Prisão, é solto.
- **Contador do Véu** (`world/veil.ts`): liga no Ato 3, +1/dia, +5 quando o culto age (chance
  semanal, gera uma missão de atraso 🜏 numa capital); missões de atraso recuam 10–20; em 100 o ato
  é antecipado e o ato fica registrado em `veil.broken` (ramo "e se" a escrever). Mostrado no topo
  do mapa.
- **Peças de missão**: início escondido, limite de rodadas, objetivos para **Interagir** (cela,
  baú, documentos, runas — alguns levam 2 ações), **VIP** (preso numa cela até alguém abrir; se
  morrer, a missão falha). Contratos novos: Roubar registros, Resgatar o preso, Incursão de
  suprimentos; atrasos do Véu: Sabotar o ritual (runas, 10 rodadas), Resgatar sequestrados.
- **Falta:** civis (Retaliação) e aliados controlados pela IA precisam de um terceiro time;
  perseguição, chefes com fases e escolhas ficam para as missões da história.

## 17. Ainda em aberto

1. Escolher o tipo de joia de cada espécie (no Bestiário).
2. Ramos "e se" do contador de ritual (com a história).
