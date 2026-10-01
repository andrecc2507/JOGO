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

## Estrutura

Cada classe tem uma árvore com **nós**:

| tipo | o que é | abre quando |
|------|---------|-------------|
| `base` | a classe (centro da rosa); guarda as habilidades antigas de `skills.json` em `legacySkills` | sempre |
| `evolucao` | pontos cardeais (Assassino, Ninja, Elementalista, Cronomante…) | sempre (liberdade total) |
| `hibrida` | diagonais, mistura de duas evoluções (Sicário = Assassino + Ninja…) | 1 habilidade aprendida em **cada** pai |
| `ramo` | sub-caminho de uma evolução (os 6 caminhos do Elementalista) | 1 habilidade aprendida no pai |

Regras provisórias (`rules/skill_tree.ts`): cada habilidade custa 1 ponto de habilidade e tem NV
mínimo; os **bônus de classe** do nó entram ao aprender a 1ª habilidade dele — MP fixo
(ex.: Elementalista +40) ou percentuais (`bonus`: HP, MP, acerto, velocidade, dano mágico; ex.:
cada classe do Clérigo dá +10% de HP, Sniper +10% de acerto).
A posição de cada nó vem do canvas de design (usada no diagrama do editor).

## Valores genéricos (para balancear depois)

| | custo | NV mínimo (evolução / ramo / híbrida) |
|--|-------|----------------------------------------|
| habilidade comum | 6 MP | 5 / 8 / 20 |
| habilidade forte | 10 MP | 5 / 8 / 20 |
| suprema (★) | 20 MP | 25 / 30 / 40 |
| passiva / reação | 0 | igual às comuns |
| raios do Elementalista | 4 MP | 1 |

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
| Subterfúgio (Trapper) | recua 3 camuflado; a isca solta fumaça que cega |
| Forma de Esquilo (Druida) | foge 3, fica veloz e cura metade do golpe |
| Comando: Proteger! (Ranger) | o companheiro bloqueia o golpe inteiro e as feras agem |
| Mimetismo da Selva (Guardião Rúnico) | reaparece camuflado; próximo disparo crítico que silencia |
| Dobra Espacial (Atirador Rúnico) | joga os adjacentes 6 tiles para trás e atordoa |

Indicador: losango ciano ao lado da barra de vida enquanto a reação está pronta; cinza e riscado
depois de gasta (também aparece na ficha da unidade).

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

- **10 habilidades do Mago central** — por enquanto o nó base usa as 6 magias antigas.
- Os centros do Ladino, do Arqueiro e do Clérigo também usam as habilidades antigas da classe.
