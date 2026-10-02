# Base, pesquisa, fabricação e joias da alma (rascunho para debate)

> **Status: v0.2 — direção aprovada (2026-10-02), ainda não implementada.** As decisões fechadas estão
> no GDD (D12, D20, D54, D56, D57 e D62–D69); os números (chances, dias, custos) são provisórios.
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
- A definir: o marcador expira depois de um tempo? A recuperação pode ter um encontro (saqueadores,
  as feras que venceram)?

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
- Cada espécie define o **tipo** da sua joia:
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
missões de **atrasar** (sabotar rituais, resgatar sequestrados) recuam o contador. Liga com o
"contador de dias" já previsto no Ato 7. A detalhar.

## 10. Ordem de implementação sugerida

1. Materiais + tabela de drops por criatura (no editor do Bestiário) + estoque.
2. Base mínima (Biblioteca + Forja) ao fim do Ato 1 (com atalho de dev).
3. Pesquisa: fila, dias, pré-requisitos, resultados.
4. Fabricação + utilitários com usos por batalha e melhorias.
5. Joias da alma (espaço, pesquisa, habilidade, fortalecer).
6. Captura + Prisão + pesquisas de história.
7. Instalações extras e bônus do esconderijo.
8. Contador de ritual.

## 11. Decidido (2026-10-02)

- Base nasce no fim do Ato 1 e cresce no Ato 4.
- Materiais por família (~25); pesquisa por espécie.
- Heróis parados na base aceleram pesquisa (Mago, Clérigo) e forja (Guerreiro, Ladino).
- Todo utilitário recarrega depois da batalha, inclusive as poções da loja; a melhoria pode dar
  mais usos ou mais efeito, conforme a receita.
- Joias: uma pesquisa por besta; joia de habilidade (habilidade fixa da espécie, espaço próprio)
  ou joia de forja (itens mágicos), conforme a espécie.
- Captura: ação de qualquer herói contra humano com pouca vida; corda/rede melhoram.
- Herói morto: companheiros recolhem os itens. Esquadrão dizimado: itens perdidos com marcador
  no mapa, recuperáveis por outro esquadrão.

## 12. Ainda em aberto

1. Marcador de itens perdidos: expira? Tem encontro para recuperar?
2. Quais espécies dão joia de habilidade e quais dão joia de forja (critério: raridade, tipo de
   habilidade ou escolha manual no Bestiário)?
3. Números: chances de drop, dias de pesquisa/forja, custos, quantos espaços na base.
4. Contador de ritual: gatilho exato, ritmo e missões de atraso.
