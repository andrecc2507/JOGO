# Árvores de habilidades (rosa das classes)

Fontes de design (texto + canvas): [Arqueiro](fontes/arqueiro.md) ([canvas](fontes/arqueiro.canvas)),
[Clérigo](fontes/clerigo.md) ([canvas](fontes/clerigo.canvas)), [Guerreiro](fontes/guerreiro.md)
([canvas](fontes/guerreiro.canvas)), [Ladino](fontes/ladino.md) ([canvas](fontes/ladino.canvas)),
[Mago](fontes/mago.md) ([canvas](fontes/mago.canvas)). Ajustes globais:
[reações únicas](fontes/ajuste_das_reacoes.md) e [ritmo da batalha](fontes/ajustes_de_batalha.md).

| classe | evoluções | híbridas | habilidades |
|--------|-----------|----------|-------------|
| Arqueiro | Sniper, Trapper, Arqueiro Arcano, Druida | Especialista, Ranger, Guardião Rúnico, Atirador Rúnico | 80 |
| Clérigo | Monge, Sacerdote, Inquisidor, Paladino | Zelote, Guardião da Fé, Taumaturgo Sombrio, Templário | 80 |
| Guerreiro | Espadachim, Arcano, Berserker, Escudeiro | Duelista, Mestre de Batalha, Defensor, Campeão | 80 |
| Ladino | Assassino, Mercenário, Ninja, Sabotador | Sicário, Algoz, Venenista, Contrabandista | 80 |
| Mago | Elementalista (+6 caminhos), Cronomante, Gravitacional, Necromante | Invocador, Cataclisma, Manipulador, Entropia | 130 |
Dados do jogo: `src/game/data/skills/trees/<classe>.json`, editáveis em **Menu → Árvores de habilidades**.

## Estrutura: teias

Cada classe é uma **teia**: a classe base no centro e, saindo dela, uma fila de habilidades por
subclasse — Habilidade 1 colada no centro, a última na ponta. O nome da subclasse aparece ao fundo,
ao longo da fila, só como guia (não é clicável). Desenho: `scenes/shared/skill_web.ts`, usado no
Quartel e no editor; a direção de cada fila vem do canvas de design.

| tipo | o que é | abre quando |
|------|---------|-------------|
| `base` | a classe (centro): **sem habilidades a aprender**, só a passiva inata e os bônus | sempre |
| `evolucao` | pontos cardeais (Assassino, Ninja, Elementalista, Cronomante…) | sempre |
| `hibrida` | diagonais, mistura de duas evoluções (Sicário = Assassino + Ninja…) | a **3ª habilidade** de cada teia de origem (`unlockAt`) |
| `ramo` | sub-caminho de uma evolução (os 6 caminhos do Elementalista) | a última habilidade da teia de origem (`unlockAt`) |

Regras (`rules/skill_tree.ts`):

- Os pontos de habilidade (1 por nível + 1 a cada 5 níveis = 72 no nível 60) vão direto nas
  habilidades: o 1º ponto aprende (Nv 1) e cada ponto seguinte fortalece, até o **Nv 5**.
- Estrutura fixa de cada teia: reação sempre na 5ª posição (uma só), suprema no fim (NV 30; híbridas
  NV 40), e a habilidade anterior precisa estar no nível 1-2-2-3-3-3-4-4-5 — a linha reta até a
  suprema custa 28 pontos. Detalhes e a lista das trocas em `auditoria_habilidades.md`.
- Cada nível deixa a habilidade um pouco mais forte, no ritmo do exemplo do design (Estocada 1,2× da
  Força no Nv 1, 1,3× no Nv 2, 1,4× no Nv 3…): poder ×1,00 / 1,08 / 1,17 / 1,25 / 1,33 (`rankMult`).
  Vale para dano, cura e os bônus numéricos das passivas.
- **Pré-requisitos:** por enquanto cada habilidade pede a anterior na teia. O campo `requires` de cada
  habilidade (seletor *pré-requisito* no editor) troca isso por outra habilidade ou por nenhuma — os
  pré-requisitos definitivos serão decididos depois.
- Supremas (★) mantêm um NV mínimo do personagem; as outras habilidades não têm (a teia dita o ritmo).
- Os **bônus de classe** de cada subclasse (ex.: cada classe do Guerreiro e do Clérigo dá +10% de HP,
  Elementalista +40 MP) entram ao aprender a 1ª habilidade dela; os da classe base valem sempre.
- Saves antigos: as habilidades das classes básicas saem da ficha e o ponto gasto nelas volta.

### Passivas das classes base

| classe | passiva inata |
|--------|---------------|
| Guerreiro — Vigor de Batalha | +10% Força, +10% HP |
| Mago — Erudição Arcana | +10% Inteligência, +10% MP |
| Arqueiro — Olho de Falcão | +10% Destreza; sem se mover no turno, +15 de acerto (`steadyAim`) |
| Clérigo — Devoção | +10% Inteligência, +10% HP |
| Ladino — Sombra Ágil | +10% Velocidade; uma vez por batalha, esconder-se é ação livre (`freeHide`) |

As antigas habilidades das classes básicas (Estocada, Bola de Fogo, Cura…) foram removidas. Os combos
agora usam os Raios do Elementalista e o Golpe Feroz do Espadachim; recrutas de classe chegam com 1
ponto para a 1ª habilidade de uma teia.

## Valores genéricos (para balancear depois)

| | custo | NV mínimo do personagem |
|--|-------|-------------------------|
| habilidade comum | 6 MP | — |
| habilidade forte | 10 MP | — |
| suprema (★) | 20 MP | 25 evolução / 30 ramo / 40 híbrida |
| passiva / reação | 0 | — |
| raios do Elementalista | 4 MP | — |

Poder, alcance e recarga seguem a descrição (leve, médio, massivo) com números redondos.

## Como as habilidades funcionam

As habilidades das árvores usam **os mesmos blocos de efeito das criaturas** (ver
[`bestiario.md`](bestiario.md)), mais os blocos criados para elas:

| bloco | usado em |
|-------|----------|
| `backstab` (pelas costas ou invisível) | Golpe de Misericórdia, Ataque do Ponto Cego |
| `pending` (age depois / repete) | Dinamite, Grande Bombarda, Execução Sombria, Tsunami, Asteroide, Big Bang; canalizações Tempestade, Nevasca, Terremoto, Supernova, Tornado, Terreno Amaldiçoado, Áreas do Manipulador |
| `imbue` (arma encantada) | Lâmina Envenenada, Lâmina de Chakra, Munição Incendiária, Combustão Externa, Ninjutsu Tóxico, Lâminas Peçonhentas, Pólvora no Coldre |
| `trap` (armadilha) | Fio de Tropeço, Disparo de Abrolhos |
| `wall` / `destroyProps` | Parede de Pedra, Parede de Gelo / Grande Bombarda, Big Bang |
| `chain` (ricochete) | Arco Voltaico, Efeito Borboleta |
| `consume`, `detonate` | Paralisia Condutora / Catalisar Mutação, Decaimento Acelerado |
| `execute`, `critIfDebuffs` | Toque do Ceifador / Dose Letal |
| `swap`, `gaugeShift`, `rewind`, `extraTurn`, `extend` | Distorção Espacial / Paradoxo / Volte / Avançar, Passo de Brisa / Dilação de Efeito |
| invocações (`@clone`, Servo Esquelético, Elemental Invocado) | Clones de Sombra, Ilusão Fatal, Servos Esqueléticos, Possuir Alma |
| passivas novas | Anatomia Letal (`critDamage`), Aproveitar a Brecha (`onCritReset`), Contrato de Sangue (`onKill`), Absorver Alma (`onAnyDeath`), Estopim Curto (`onHitCooldown`), Perícias (`elementBoost`), descontos de MP (`mpDiscount`), Fluxo Espiritual (`mpRegen`), Transferência de Dor (`shareWithSummons`), Pacto de Sangue (`cheatDeath`), Perícia em Almas / Laço Vital, Morte Sutil (`silentStrike`), Toxina Persistente |
| reações novas | `mitigate` (Escudo de Chamas, Fluidez, Névoa de Fuga), `riposte` (Ripostar, Finta Ilusória), gatilho `summon` (Suborno Mecânico), `once` (Forma Elétrica), cura pelo dano (Reverter Dano) |

**Regras das armadilhas:** armam só no fim do turno de quem as colocou (antes disso, pisar não
dispara). Armadas, ferem qualquer um que pise — aliados também (fogo amigo), e a explosão com raio
pega todos em volta. Quem já está em cima de uma armadilha armada a dispara no início do próprio
turno (Armadilha Abrupta). Cada lado só vê as próprias: o jogador vê as suas no mapa (⚙ tracejada
enquanto arma); as do inimigo são invisíveis. A IA desvia das do próprio time e não conhece as do
jogador.

**Trapper sem reação:** no lugar da reação, a 5ª habilidade do Trapper é a passiva **Gênio do Campo
de Batalha** (`fieldTraps`): na formação inicial, antes de qualquer ação, ele distribui pelo mapa
1/2/3/4/5 armadilhas (o nível da habilidade), escolhendo entre os tipos de armadilha que já aprendeu
na árvore (clicar de novo numa casa tira a armadilha). Essas só armam depois que todas as unidades
tiverem tido a vez pelo menos uma vez. Em emboscada não há formação, então também não há armadilhas.

**Formação inicial:** a área ocupa ⌈largura × 5/12⌉ × ⌈altura × 5/12⌉ casas (`DEPLOY_FRACTION`,
entre 1/3 e metade do mapa), do lado do esquadrão.

Blocos criados para Arqueiro e Clérigo: `perTile` (dano por distância), `through` (tiro que
atravessa a fila), `vortex` (puxa para o centro), `homing` (ignora cobertura), `currentHpPct`,
armadilhas com raio e quantidade (`trap.radius`, `trap.count`), `triggerTraps`, `clearTraps`,
`trapRefund`, `allyShield`, `burstAround` (Cura Punitiva, Luz Protetora), `intercept` (Interceder,
Reflexo Protetor, Aura de Redenção), `healBoost`, `moveBonus`, `senseStatus`, `elementLifesteal`,
aura em aliados (Aura de Devoção), invocação inicial do jogador (lobo do Ranger) e Torreta Mecânica.

Blocos criados para o Guerreiro: `physBoost`/`magicBoost` (perícias), `haste` (barra mais rápida),
`chargeEvery` (Carga Estática: a cada N golpes, explosão), `lastStand` (Fúria Indomável),
`reachBonus` (Perícia em Lanças), `guardZone` (Muralha de Piques ataca quem entra no alcance),
`interrupt` (cancela canalizações), `shieldFromLost` (Ignorar a Dor), `defScaling` (Pancada de
Escudo soma a defesa ao dano) e `intercept.once` (Interpor).
Status novos do Guerreiro: Frenesi (+30% de dano e defesa; ao acabar, lento e desarmado),
Preparado (próximo golpe crítico), Vulnerável (+20% de dano recebido), Sem reação e Protegido (−50%).

Status novos: Postura ancorada, Encantamento veloz (−30% MP), Invulnerável, Provocado (a IA só
ataca quem provocou), Selo de Martírio (devolve o dano), Exposto (esquiva zerada), Dormindo (perde o turno, acorda com dano), Arma encantada,
Inabalável (Postura do Demônio).

## Reação única por batalha

Regra global (`CLASS_REACTIONS_ONCE` em `battle/creature_fx.ts`): **toda** reação de árvore de
classe — de todas as classes — dispara **uma vez por batalha** e sem sorteio (não há mais chance
de 25–40%). As habilidades de reação das feras do bestiário seguem as regras da própria ficha.

**Janela de decisão:** quando o gatilho de uma reação de um personagem do jogador acontece, a
batalha pausa e pergunta "Usar <reação>?". *Não usar* leva o golpe e guarda a reação; *Usar* a
gasta. Inimigos humanos com árvore (IA) usam sempre. Por baixo (`battle/reaction_prompt.ts`), a ação
é desfeita até a pergunta e repetida com a resposta — o RNG volta ao mesmo ponto, então tudo até ali
acontece igual.

Em troca do uso único, todas as reações ficaram mais fortes. As do documento de ajustes:

| reação | ajuste |
|--------|--------|
| Passo Sombrio (Assassino) | esquiva + invisível; próximo golpe crítico que silencia (`prime`) |
| Ripostar Combativa (Mercenário) | contra-ataca com as duas armas (`hits: 2`) e ganha Adrenalina |
| Substituição (Ninja) | teleporta; o tronco explode em fumaça 3×3 que cega |
| Detonação Defensiva (Sabotador) | empurra 4 m todos à frente e quebra a armadura |
| Desvanecer (Sicário) | anula a magia e guarda 50% do dano para o próximo golpe (`store`) |
| Finta Ilusória (Algoz) | deixa um clone de sombra que luta por 2 turnos |
| Névoa de Fuga (Venenista) | anula 100% e deixa gás venenoso 3×3 |
| Suborno Mecânico (Contrabandista) | toma a invocação até o fim da batalha (`convert`) |
| Forma Elétrica, Escudo de Chamas, Parede de Ar, Estilhaçar, Fluidez Corporal, Fortalecer Defesas | evasão total + veloz; 50% e queimadura em área; reflete e derruba; crítico que congela os vizinhos; anula, reposiciona e +20% MP; escudo de granito no grupo |
| Tiro de Alívio (Sniper) | enraíza 2 turnos, recua 4 m e camufla |
| Escudo de Éter (Arqueiro Arcano) | anula a magia, converte 100% em MP e zera a recarga da suprema |
| Sensor de Movimento (Especialista) | cancela o avanço, revela invisíveis e a torreta dispara |
| Corte Retaliador (Espadachim) | contra-ataque crítico garantido, Sangramento e Músculo cortado (−50% de dano físico, 2 turnos) |
| Instinto de Batalha (Mestre de Batalha) | esquiva; o atacante fica Vulnerável (+20% de dano) até o fim |
| Escudo Refletor (Defensor) | reflete a magia com o dobro do dano (`reflectMult`) e atordoa |

As demais, reforçadas no mesmo espírito:

| reação | ajuste |
|--------|--------|
| Eco de Esquiva (Cronomante) | recua 3, fica veloz e zera a recarga da Parada Temporal |
| Inversão G (Gravitacional) | anula o projétil e o atirador fica Esmagado 2 turnos |
| Nexo de Projéteis (Manipulador) | devolve com o dobro do dano e derruba |
| Reverter Dano (Entropia) | todo o dano vira cura; o atacante fica enfraquecido |
| Escudo Contra Magia (Arcano) | anula, silencia o conjurador e +20% MP |
| Contra-Ataque (Escudeiro) | pancada crítica que atordoa |
| Forma Etérea (Duelista) | intangível + veloz; próximo golpe crítico |
| Ripostar (Duelista) | contra-ataque crítico; atacante vulnerável 3 turnos |
| Postura do Casulo (Monge) | anula o projétil, fortificado 2 turnos, próximo golpe crítico |
| Anulação Rúnica (Inquisidor) | anula, silencia 2 turnos e +20% MP |
| Escudo Reluzente (Paladino) | bloqueia e cega todos os adjacentes 2 turnos |
| Esquiva Flamejante (Zelote) | esquiva e deixa um círculo de fogo |
| Contra-Ataque de Escudo (Guardião da Fé) | pancada crítica que atordoa |
| Reversão de Sorte (Taumaturgo) | anula; atacante enfraquecido, Taumaturgo afiado |
| Espelho Divino (Templário) | reflete o dobro e dá escudo ao grupo |
| Forma de Esquilo (Druida) | foge 3, fica veloz e cura metade do golpe |
| Comando: Proteger! (Ranger) | o companheiro bloqueia o golpe inteiro e as feras agem |
| Mimetismo da Selva (Guardião Rúnico) | reaparece camuflado; próximo disparo crítico que silencia |
| Dobra Espacial (Atirador Rúnico) | joga os adjacentes 6 tiles para trás e atordoa |

Indicador: losango ciano ao lado da barra de vida enquanto a reação está pronta; cinza e riscado
depois de gasta (também aparece na ficha da unidade).

## Pacote de ajustes 2

Pedido em [ajustes (pacote 2)](fontes/ajustes_pacote_2.md):

- **Iniciado no Estudo dos Elementos** (Elementalista): um ponto libera os seis raios (Fogo, Água,
  Terra, Eletricidade, Ar, Gelo), que acompanham o nível dele; os caminhos elementais abrem a partir
  dele. Habilidades concedidas usam o campo `grantedBy` e não ocupam lugar na teia.
- **Barras de ação** estilo Chrono Trigger: o tempo passa na tela (4 s da linha do tempo por segundo
  real, `battleSecondsPerRealSecond`), barra amarela sob cada personagem e no painel superior, que
  mostra heróis × inimigos em posição fixa (sem "ordem"); clicar no retrato foca a câmera.
- **Linha de tiro**: ao mirar, linha tracejada até o tile sob o cursor — sobre um inimigo visível ela
  aparece sempre, mesmo quando não dá para atacar. Se algo a corta, o obstáculo fica em vermelho com ✖
  e o nome dele (Árvore, Muro, terreno mais alto, fumaça…); longe demais, a linha fica laranja com
  "FORA DE ALCANCE", e o painel mostra a distância e o alcance.
- **Alcance** com brilho que pulsa; **formação inicial** (casas verdes) antes da primeira ação,
  exceto em emboscadas; **desfazer movimento** enquanto nada aconteceu no caminho (sem dano,
  armadilha, reação nem inimigo novo à vista).
- **"!"** sobre quem é avistado ao sair do esconderijo.
- **Fogo amigo** em áreas, cones e linhas (nunca em quem lança; a IA evita); **buffs semelhantes não
  acumulam** (fortificado/protegido, inspirado/frenesi, duplicatas/intangível — o novo substitui) e
  escudos ficam no maior valor.
- **Feras**: recarga mínima de 2 turnos nas habilidades e IA que prefere o ataque básico
  (`aiSkillBias` 0,75).
- **Registro** minimizável, arrastável e com os nomes das habilidades explicados ao passar o mouse.
- **Roupas por subclasse** (`render/outfits.ts`): a teia com mais habilidades aprendidas define a roupa
  (cores, chapéu/elmo/capuz e detalhe). **Terra** e **madeira** ganharam textura.
- **Arsenal** (Menu → Arsenal): editor de armas e equipamentos com prévia de balanceamento. As edições
  do bestiário, das árvores e do arsenal valem desde a abertura do jogo.

## Encenação da batalha

Pedido em [ritmo da batalha](fontes/ajustes_de_batalha.md). Nada mais é instantâneo:

1. **Foco**: a câmera desliza até quem age (início do turno e cada ação, estilo XCOM).
2. **Nome**: janela azul com o nome de quem age e da ação (inspirada no Chrono Trigger).
3. **Preparação**: magias reúnem energia em volta do conjurador; golpes dão um passo à frente.
4. **Efeito**: animação escolhida por `animFor()` (`render/anim_style.ts`) a partir do tipo, formato
   e elemento — corte, garras, estocada, giro, investida, salto, flecha, chuva de flechas, raio,
   orbe, feixe, cone, explosão, meteoro, cura, bênção, fumaça, teleporte, invocação, armadilha,
   concentração, grito. A ficha pode forçar uma pelo campo `anim` (seletor **Animação** no editor).
5. **Impacto**: o motor resolve a ação nesse instante; faíscas na cor do elemento, tremor de tela e
   clarão em críticos, meteoros e raios (`render/battle_fx.ts`).

- **Caminhada** a `moveSpeed(VEL)` tiles/s (3 a 9; mais Velocidade, mais rápido), com pulinho a
  cada passo e salto suave em degraus.
- **Avisos**: "🔥 Em chamas", "❄ Congelado", "🟫 Lamaçal", "💧 Alagado", "🌫 Fumaça", "☠ Gás
  venenoso"… sobem acima da área (um por tipo), e cada estado novo aparece sobre a unidade, em fila
  (`battle/notices.ts`).
- **Alcance**: ao escolher Atacar, uma habilidade ou item, o alcance aparece em laranja claro e os
  alvos válidos em laranja forte.
- **Cobertura** (`battle/cover.ts`): obstáculo ou degrau colado no alvo, do lado de onde vem o tiro,
  reduz o acerto de ataques físicos à distância — parcial −20% (caixa, arbusto, cacto, rocha,
  degrau +1), total −40% (muro, árvore, pinheiro, degrau +2). Flanquear e o corpo a corpo ignoram;
  magias também. Ao planejar o movimento, escudos (meio ou cheio) aparecem nas bordas do tile.
- **Ataque de oportunidade** (D77): sair do alcance corpo a corpo de um inimigo provoca um golpe dele
  (um por turno de quem ataca; arqueiros e magos não dão — à distância, só a Prontidão reage). Ao
  planejar o movimento, a casa de onde se sai fica vermelha com ⚔! e o painel diz quem vai atacar;
  o golpe é encenado no passo em que acontece, como a Prontidão.
- **Coberturas destrutíveis** (`battle/props.ts`): todo objeto tem resistência (arbusto 15, caixa e
  cacto 30, árvore e pinheiro 60, rocha 120, muro 150). Quebram com o ataque básico mirado nelas
  (acerto garantido, sem crítico; só o jogador mira objetos), com habilidades de dano em área e com
  tiros que erram um alvo protegido (a cobertura leva o dano médio do tiro). Danificadas mostram uma
  barra; ao quebrar somem e a cobertura acaba.

Gravitacional (Mago, leste, +35 MP): Horizonte de Eventos (`vortex` para o centro), Buraco Negro
(zona de 3 turnos que prende e aplica **Esmagado** — ataques à distância só alcançam o vizinho),
Voar (status **Voando**: ignora elevação, lama, superfícies e armadilhas), Pressão Gravitacional
(concentração: zona que imobiliza, conjurador parado), Quasar (suprema, ignora 50% da defesa),
Massa Crítica (`massBoost`: +15% por inimigo extra perto do alvo, em habilidades do Gravitacional
ou que puxam), Repulsão Rúnica (empurra 3), Inversão G (reação única contra projéteis físicos),
Singularidade Instável (linha que atravessa, puxa para o fim e causa dano) e Órbita Escudo.

### Aproximações (ainda não é a mecânica completa)

- Canalizações não quebram por dano: o conjurador fica imobilizado enquanto a zona age.
- Tornados de Fogo/Ar e o Relógio Explosivo não andam: viram zona/bomba no ponto escolhido.
- Parede de Gelo/Pedra vira rocha permanente (sem HP próprio); Muralha de Fogo é fogo no chão.
- Dança dos Pardais atinge tudo ao redor (sem percorrer o trajeto).
- Carga Magnética, Colapso Vital, Labirinto de Espelhos, Ponto Zero, Inversão de Polaridade,
  Antimagia, Ancorar Espaço: viraram marcas, silêncio, cegueira, lentidão ou esquiva.
- Passivas "na próxima magia" (Dínamo, Ciclo Hidrológico, Fluxo de Shinobi, Dobra do Tempo,
  Poeira Estelar) dão um status curto ao conjurar ou desconto de MP.
- Habilidades de "uma vez por batalha" e "ação bônus" foram mapeadas para reação única e ação extra.

Aproximações do Arqueiro e do Clérigo: Calibragem de Mira, Desvio Fluido e Zelo Punitivo viram
crítico fixo; Engenharia de Campo vira desconto de MP (não há limite de armadilhas); Resguardo e
Corrente de Fé são ativas (escudo/regeneração) em vez de reações em aliados; Semente Rúnica regenera
e protege; Reversão de Sorte anula golpes ao acaso; Bonsai Protetor é rocha permanente; Égide Sagrada
torna os aliados próximos invulneráveis por 1 turno; Quebra-Postura queima MP.

Aproximações do Guerreiro: Escudo Contra Magia é só a reação que anula (sem a defesa mágica extra);
Domo Protetor protege quem está junto e imobiliza o Defensor; Comando de Ataque adianta a barra do
aliado; Tempestade Rúnica é zona elétrica que tira a reação de quem está dentro.

### Faltam no design

- Pré-requisitos definitivos de cada habilidade (hoje: a anterior na teia).

## Evoluções (Nv 3 e Nv 5) — mecânicas novas nas teias

Além da forma fortificada (Nv 5, secreta), algumas habilidades ganham **evoluções autorais**: uma
versão nova, que aparece na batalha **ao lado** da original (mesma recarga, mesmo nível), quando a
habilidade chega ao Nv 3/5 — ou quando outra perícia chega ao nível pedido (ex.: Perícia em Fogo Nv 3
→ Raio de Fogo ganha a versão supressão). Dados em `data/skills/trees/*.json` (`evolve`), liberação em
`rules/skill_tree.ts` (`unlockedEvolutions`). Passivas evoluídas viram uma passiva a mais.

Mecânicas trazidas (ver `docs/design/competidores.md`): **supressão** (alvo Suprimido: −25 de acerto,
não se esconde e leva tiro se sair do lugar, até o próximo turno de quem suprime), **empurrão/arremesso**
(`knock`: joga o alvo N casas — cai de telhados, bate em paredes), **construção** (muralha, barricada,
rampa, pilar, trepadeira/escada; algumas temporárias), **concentração** (zonas e reforços fortes
caem se o conjurador apanhar feio), **vantagem** (rola duas vezes: de cima, escondido), **demolição**
(dano multiplicado em paredes e objetos), **escalada**, **cura em cadeia**, **luz** (flecha sinalizadora).

| Teia | Habilidade | Libera com | Evolução |
|------|------------|-----------|----------|
| Sniper | Tiro de Longo Alcance | Nv 3 | **Supressão de Longo Alcance** (supressão) — Tiro de contenção de muito longe: pouco dano, mas o alvo fica Suprimido — sair da cobertura custa um tiro. |
| Sniper | Posição de Tiro | Nv 3 | **Olhos no Telhado** (vantagem) — De qualquer ponto mais alto que o alvo, os tiros têm vantagem (rola duas vezes). |
| Sniper | Tiro na Cabeça | Nv 5 | **Tiro do Alto** (vantagem) — Do alto, o tiro na cabeça tem vantagem e atravessa toda a armadura. |
| Arqueiro Arcano | Flecha de Luz | Nv 3 | **Flecha Sinalizadora** (luz) — A flecha fica cravada brilhando: ilumina raio 2 por 3 turnos (revela à noite). |
| Druida | Chamado das Raízes | Nv 3 | **Raízes Escaláveis** (construção) — Raízes sobem pela parede e viram escada natural por 4 rodadas (sobe-se em qualquer telhado). |
| Especialista | Tiro de Metralha | Nv 3 | **Metralha de Contenção** (supressão) — Cone de estilhaços que prende todos no lugar (Suprimidos). |
| Guardião Rúnico | Flecha de Vinhas | Nv 3 | **Ponte de Vinhas** (construção) — Vinhas trançadas formam uma rampa de 3 degraus por 3 rodadas. |
| Monge | Passo Ágil | Nv 3 | **Corrida nas Paredes** (escalada) — O monge corre pelas paredes: sobe em prédios e muralhas sem escada. |
| Monge | Soco de Impacto | Nv 3 | **Palma Arremessadora** (empurrão) — O golpe de ki arremessa o alvo 3 casas. |
| Sacerdote | Prece de Cura | Nv 3 | **Prece em Cadeia** (cura em cadeia) — A prece encontra o ferido mesmo sem linha de visão e salta para mais 2 aliados feridos. |
| Inquisidor | Chama Herética | Nv 3 | **Fogo de Contenção** (supressão) — Chamas sagradas sustentadas: menos dano, alvo Suprimido. |
| Paladino | Impacto do Brasão | Nv 3 | **Brasão Arremessador** (empurrão) — O brasão arremessa o alvo 2 casas. |
| Guardião da Fé | Postura da Montanha | Nv 3 | **Raiz da Montanha** (firmeza) — Além da postura, fica Ancorado: não pode ser empurrado nem arremessado. |
| Berserker | Ataque Giratório | Nv 3 | **Giro Arremessador** (empurrão) — O giro joga longe todos em volta (1 casa). |
| Berserker | Sangue nos Olhos | Nv 3 | **Arremessa-Companheiro** (arremesso) — O berserker pode arremessar aliados ao lado até telhados (o aliado usa "Ser arremessado"). |
| Escudeiro | Parede de Escudos | Nv 3 | **Barricada de Escudos** (construção) — Finca escudos e tábuas numa barricada de 3 casas (meia cobertura, 3 rodadas) a até 2 casas. |
| Escudeiro | Pancada de Escudo | Nv 3 | **Pancada Arremessadora** (empurrão) — A pancada arremessa o alvo 2 casas (cai de telhados, bate em paredes). |
| Duelista | Salto | Nv 3 | **Salto Acrobático** (escalada) — Salto mais longo (6 casas), até o topo de muros e telhados. |
| Campeão | Investida do Céu | Nv 5 | **Queda do Céu** (vantagem) — Saltando de cima, a investida tem vantagem e racha o chão (dano duplo em paredes). |
| Assassino | Emboscada | Nv 5 | **Emboscada Perfeita** (vantagem) — Saltando das sombras: vantagem e +20% de crítico. |
| Assassino | Dardo Imobilizante | Nv 3 | **Dardo das Sombras** (vantagem) — Disparado escondido, o dardo tem vantagem (rola duas vezes). |
| Mercenário | Arremesso de Adaga | Nv 3 | **Adagas de Contenção** (supressão) — Duas adagas fincadas aos pés do alvo: pouco dano, alvo Suprimido. |
| Ninja | Passo Transgressor | Nv 3 | **Corre-Telhados** (escalada) — O ninja escala paredes e prédios sem escada. |
| Sabotador | Carga de Dinamite | Nv 5 | **Carga de Demolição** (demolição) — Carga moldada para fundações: dano triplo em paredes e objetos. |
| Sabotador | Arquiteto da Destruição | Nv 3 | **Mestre Demolidor** (demolição) — Todo golpe do sabotador causa o dobro em paredes, lajes e objetos. |
| Mestre dos Selos | Ofuda de Cura | Nv 3 | **Ofudas em Revoada** (cura em cadeia) — Um maço inteiro de talismãs: salta para até 4 aliados feridos. |
| Mestre dos Selos | Kunai Selada | Nv 3 | **Kunais de Contenção** (supressão) — Versão supressão: duas kunais cravadas aos pés do alvo — menos dano, alvo Suprimido até o seu próximo turno. |
| Mestre dos Selos | Passo da Raposa | Nv 5 | **Passo Duplo da Raposa** (mobilidade) — O passo da raposa fica pronto de novo a cada turno. |
| Mestre dos Selos | Sino de Proteção | Nv 3 | **Sino Ressonante** (concentração) — O sino continua tocando: raio 2 e 2 turnos de proteção, mantido por concentração. |
| Mestre dos Selos | Selo de Contenção | Nv 3 | **Selo Explosivo** (demolição) — O selo vira bomba (kibaku fuda): explode na rodada seguinte em raio 1 com fogo — dano dobrado em paredes e objetos. |
| Mestre dos Selos | Barreira de Talismãs | Nv 3 | **Santuário de Talismãs** (construção) — Barreira de 5 casas por 3 rodadas. |
| Mestre dos Selos | Bênção da Raposa | Nv 3 | **Faro da Kitsune** (percepção) — A raposa fareja: vê inimigos escondidos. |
| Besteiro Gêmeo | Rajada Dupla | Nv 3 | **Fogo de Cobertura** (supressão) — Versão supressão: três virotes rápidos e imprecisos — o alvo fica Suprimido até o seu próximo turno. |
| Besteiro Gêmeo | Virote Explosivo | Nv 5 | **Virote de Pólvora Alquímica** (demolição) — Explosão de raio 2 que triplica o dano em paredes — derruba casas. |
| Besteiro Gêmeo | Virote de Gancho | Nv 3 | **Corda de Escalada** (escalada) — Crava o gancho no alto: a coluna vira escada por 3 rodadas. |
| Contrabandista | Gancho de Albatroz | Nv 3 | **Gancho de Escalada** (escalada) — Fixa uma corda no alto: a coluna vira escada por 3 rodadas. |
| Elementalista | Raio de Eletricidade | Perícia em Eletricidade Nv 3 | **Corrente Contínua** (supressão) — Versão supressão: um fio elétrico ininterrupto prende o alvo no lugar (Suprimido) e o deixa eletrocutado. |
| Elementalista | Raio de Fogo | Perícia em Fogo Nv 3 | **Rajada de Fogo** (supressão) — Versão supressão: o mago sustenta uma rajada de raios menores — menos dano e menos precisão, mas o alvo fica Suprimido até o próximo turno do mago (se sair do lugar, leva mais um raio). |
| Elementalista | Raio de Ar | Perícia em Ar Nv 3 | **Lufada Arremessadora** (empurrão) — Rajada de vento que arremessa o alvo 3 casas para trás. |
| Elementalista | Raio de Gelo | Perícia em Gelo Nv 3 | **Rampa de Gelo** (construção) — Ergue uma rampa de gelo eterno de 3 degraus na direção do alvo: sobe-se em telhados e muralhas. Derrete em 3 rodadas. |
| Elementalista | Raio de Água | Perícia em Água Nv 3 | **Jato de Pressão** (empurrão) — A água sai como um aríete: empurra o alvo 2 casas (cai de telhados, bate em paredes). |
| Elementalista | Raio de Terra | Perícia em Terra Nv 3 | **Erguer Pilar** (construção) — Levanta um pilar de rocha de 3 níveis: cobertura, mirante ou parede de última hora (4 rodadas). |
| Caminho do Ar | Safanão | Nv 3 | **Safanão Brutal** (empurrão) — O safanão vira ventania: arremessa quem estiver no cone 2 casas (queda de telhados dói). |
| Caminho do Gelo | Parede de Gelo | Nv 3 | **Muralha de Gelo Eterno** (construção) — Muralha de gelo de 4 casas e 2 níveis que bloqueia passagem e visão por 3 rodadas. |
| Caminho da Terra | Parede de Pedra | Nv 3 | **Muralha de Pedra** (construção) — Uma muralha de verdade: 5 casas de largura, 3 níveis de altura. Cobertura inteira, bloqueia passagem e visão — e pode ser derrubada. |
| Caminho da Terra | Arremesso de Rocha | Nv 3 | **Rocha Demolidora** (demolição) — Rocha maciça que estoura paredes (dano triplo em peças de prédio e objetos). |
| Caminho da Terra | Terremoto | Nv 5 | **Terremoto Demolidor** (demolição) — O tremor racha fundações: dano triplo em paredes e objetos — prédios inteiros desabam. |
| Cronomante (Tempo) | Acelerar | Nv 3 | **Bolha de Pressa** (concentração) — Acelera todos os aliados em raio 1, por concentração. |
| Gravitacional | Voar | Nv 3 | **Levitação em Grupo** (concentração) — Faz voar todos os aliados em raio 1 — mantido por concentração (dano no mago pode desfazê-la). |
| Gravitacional | Repulsão Rúnica | Nv 3 | **Onda Repulsora** (empurrão) — Repulsão que arremessa todos em volta 2 casas — ideal para jogar inimigos de cima de torres. |

### Concentração e arco nas habilidades base

- **Concentração**: Nevasca, Tempestade, Terremoto, Terreno Amaldiçoado, Áreas de Haste/Slow/Antimagia
  (mago); Formação de Combate, Tempestade Rúnica, Domo Protetor (guerreiro); Elo Protetor, Consagrar
  Solo, Égide Sagrada, Maldição do Silêncio (clérigo).
- **Arco (por cima de muros)**: Carga de Dinamite, Grande Bombarda, Bomba de Fumaça Sufocante, Bomba de
  Gás Neurotóxico, Frasco de Ácido, Relógio de Corda Explosivo, Granada de Pulso.
- **Supressão**: Tiro de Supressão (Atirador Rúnico) agora suprime de verdade.

## Subclasses refeitas do Ladino

- **Mestre dos Selos** (antigo Sicário; Assassino + Ninja), inspirado na Kiriko: Ofuda de Cura
  (talismã que procura o aliado sem linha de visão e salta para mais 2), Kunai Selada (+30% crítico),
  Passo da Raposa (ação livre: reaparece ao lado de um aliado, através de paredes), Sino de Proteção
  (Invulnerável + limpa estados ruins em área), Talismã Reflexo (reação), Pés de Raposa (escala
  paredes), Selo de Contenção, Barreira de Talismãs (muralha mágica temporária), Bênção da Raposa e a
  suprema Corrida da Kitsune (trilha que acelera, inspira e limpa aliados).
- **Besteiro Gêmeo** (antigo Algoz; Mercenário + Ninja): duas **bestas de mão** (arma nova
  `besta_mao`: o ataque dispara dois virotes de 60%). Rajada Dupla (→ Fogo de Cobertura, supressão),
  Ambidestria, Rolamento Acrobático (ação livre), Virote Explosivo (demolição), Saque Rápido (reação que
  suprime o atirador), Ricochete, Virote de Gancho (→ Corda de Escalada), Saraivada (em arco), Dança
  das Bestas e a suprema Tempestade de Aço.
- Saves antigos: as habilidades do Sicário/Algoz viram as novas na mesma posição da teia
  (`data/skills/renamed.json`).

## Forma fortificada (habilidade no Nv 5) — segredo do treino

Toda habilidade **ativa** de teia que chega ao **Nv 5** desperta uma segunda versão, a
**fortificada**: custa mais MP (`⌈MP × 1,5⌉ + 2`), bate um pouco mais (×1,15; supremas ×1,3) e ganha
um "algo a mais", escolhido pelo tipo, forma e elemento da habilidade (`rules/empower.ts`, números
em `data/skills/empower.json`):

| tipo | bônus possíveis |
|------|-----------------|
| golpe/tiro/magia de alvo único | golpe duplo · vira explosão em área (raio 1, pega aliados) · ricochete em +2 inimigos (à distância e magia) · execução abaixo de 20% (físico) · estado do elemento (queimando, lento, eletrocutado, molhado, imobilizado, derrubado, cego, enfraquecido, envenenado) ou do golpe (sangrando, guarda quebrada, atordoado) · roubo de vida 30% (físico e sombra) · +30% de crítico (só quando não há outro) |
| área (raio/cone) | área +1 |
| investida (linha) | impacto final explode ao redor do alvo |
| magia de efeito (poder 0) | efeito dura mais e alcança quem está ao redor |
| cura | alvo único → cura em área (raio 1); área → área +1 e escudo nos curados |
| reforço | +1 de raio (alcança aliados) e +2 turnos |
| utilidade | efeito +1 turno e recarga −1 |
| invocação | uma criatura a mais |

Na batalha, a habilidade no Nv 5 aparece duas vezes: **Normal** e **✦ Fortificada** (as duas dividem
a recarga). É segredo: a ficha só mostra o bônus quando a habilidade chega ao Nv 5 (com um aviso
"transcendeu!"); antes disso, só os rumores da taverna dão pistas ("golpe repetido mil vezes deixa de
ser golpe…").

## Visual da teia (tela "Evoluir")

Cada habilidade tem um ícone gravado (o elemento manda no desenho — chama, floco, raio, gota, rocha,
vento, sol, lua, peçonha; sem elemento, o tipo — espada, flecha, estrela, cruz, setas, olho, losango,
seta circular, pata) e um selo no canto para a forma (área, cone, linha). As filas seguem em
zigue-zague. Roda do mouse dá zoom no cursor (até 4×), arrastar move a teia, e os botões + − ⟲ fazem
o mesmo.
