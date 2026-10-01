# Árvores de habilidades (rosa das classes)

Fontes de design (texto + canvas): [Arqueiro](fontes/arqueiro.md) ([canvas](fontes/arqueiro.canvas)),
[Clérigo](fontes/clerigo.md) ([canvas](fontes/clerigo.canvas)), [Ladino](fontes/ladino.md)
([canvas](fontes/ladino.canvas)), [Mago](fontes/mago.md) ([canvas](fontes/mago.canvas)).

| classe | evoluções | híbridas | habilidades |
|--------|-----------|----------|-------------|
| Arqueiro | Sniper, Trapper, Arqueiro Arcano, Druida | Especialista, Ranger, Guardião Rúnico, Atirador Rúnico | 80 |
| Clérigo | Monge, Sacerdote, Inquisidor, Paladino | Zelote, Guardião da Fé, Taumaturgo Sombrio, Templário | 80 |
| Ladino | Assassino, Mercenário, Ninja, Sabotador | Sicário, Algoz, Venenista, Contrabandista | 80 |
| Mago | Elementalista (+6 caminhos), Cronomante, Gravitacional, Necromante | Invocador, Cataclisma, Manipulador, Entropia | 120 |
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

Status novos: Postura ancorada, Encantamento veloz (−30% MP), Invulnerável, Provocado (a IA só
ataca quem provocou), Selo de Martírio (devolve o dano), Exposto (esquiva zerada), Dormindo (perde o turno, acorda com dano), Arma encantada,
Inabalável (Postura do Demônio).

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

### Faltam no design

- **Gravitacional** (evolução do Mago, leste) — nó criado vazio.
- **10 habilidades do Mago central** — por enquanto o nó base usa as 6 magias antigas.
- Os centros do Ladino, do Arqueiro e do Clérigo também usam as habilidades antigas da classe.
