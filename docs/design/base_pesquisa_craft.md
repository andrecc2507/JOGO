# Base, pesquisa, fabricação e joias da alma (rascunho para debate)

> **Status: rascunho v0.1.** Nada aqui está implementado nem entra no GDD antes de aprovado.
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
- Drops só entram no estoque quando o esquadrão volta à base (regra atual D54); esquadrão
  dizimado perde o que carregava (D57).
- A tabela de drops fica na ficha da criatura, editável no Bestiário.

## 4. Pesquisa

Instalação: **Biblioteca** (ou Arquivo) na base. Sem base, não há pesquisa.

| categoria | exige | resultado | exemplo |
|-----------|-------|-----------|---------|
| Estudo de criatura | N materiais da espécie (ex.: 5) | ficha completa no bestiário, +10% dano/acerto contra ela, receitas da família | Cobra-Víbora → Antídoto |
| Estudo de material | N unidades | receitas | Glândula ×5 → receita "3 glândulas = Antídoto" |
| Joias da alma | 1 joia | destrava a joia daquela espécie (seção 6) | Joia do Urso-Chifre |
| História | objeto, documento ou prisioneiro | próxima missão principal, rumores, mapa | analisar gema, interrogar oficial |
| Técnica | pesquisas anteriores | armas/armaduras de nível maior | Aço temperado |

- Fila com **dias** de trabalho; o tempo do mapa corre (pressão real).
- **Proposta de identidade:** heróis parados na base podem ser designados para pesquisar ou forjar
  (Mago/Clérigo aceleram pesquisa, Guerreiro/Ladino aceleram forja). Dá uso a quem está ferido ou
  na reserva, sem precisar de cientistas genéricos.
- Pesquisas de história são o **portão** das missões principais (como no XCOM).

## 5. Fabricação

Instalação: **Forja/Oficina**. Receitas destravadas por pesquisa; custo = materiais + ouro + dias.

- **Armas e armaduras** fabricadas são melhores que as da loja no mesmo nível, ou têm efeito
  próprio (lâmina de presa de víbora: envenena; couraça de escamas: resistência a fogo).
- **Utilitários** (3 espaços por herói): não somem. Cada um tem **usos por batalha** (1 no Nv 1);
  depois da batalha recarregam. **Melhorar** (fabricar a versão +) aumenta usos ou efeito:
  Antídoto → Antídoto+ (2 usos) → Antídoto++ (cura também veneno da área).
- **Melhoria de itens existentes** consome materiais (armas +1…+5).

## 6. Joias da alma (diferencial)

- Toda fera tem chance mínima de deixar a **joia da alma** da sua espécie.
- Uma joia só pode ser equipada **depois de pesquisada** (cada espécie, uma vez).
- Equipada, dá **uma habilidade da besta de origem** (a habilidade-assinatura da espécie), usando
  os atributos de quem equipa (passa pela matemática central, `rules/stats.ts`).
- **Espaço próprio** na ficha (1 por herói; um 2º com melhoria da base ou nível alto).
- **Joias repetidas** fortalecem a joia (Nv 1–5, como as habilidades), em vez de virar lixo.
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

## 11. Em aberto

1. Base já no fim do Ato 1 (muda D12)?
2. Materiais por família (~25) ou por espécie (~130)?
3. Quem acelera pesquisa/forja: tempo puro, heróis designados ou cientistas contratados?
4. Utilitários: melhoria dá mais usos, mais efeito ou os dois? Poções da loja também passam a recarregar?
5. Joias: habilidade fixa por espécie ou o herói escolhe entre as da besta? Espaço próprio?
6. Captura: ação de qualquer herói ou só com item/habilidade?
7. O que acontece com os utilitários e joias de um herói que morre (morte permanente)?
