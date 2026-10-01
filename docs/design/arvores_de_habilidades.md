# Árvores de habilidades (rosa das classes)

Fontes de design: [`fontes/ladino.md`](fontes/ladino.md) + [`ladino.canvas`](fontes/ladino.canvas),
[`fontes/mago.md`](fontes/mago.md) + [`mago.canvas`](fontes/mago.canvas).
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
mínimo; o **bônus de MP** do nó (ex.: Elementalista +40) entra ao aprender a 1ª habilidade dele.
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

Status novos: Exposto (esquiva zerada), Dormindo (perde o turno, acorda com dano), Arma encantada,
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

### Faltam no design

- **Gravitacional** (evolução do Mago, leste) — nó criado vazio.
- **10 habilidades do Mago central** — por enquanto o nó base usa as 6 magias antigas.
- O Ladino central também usa as 3 habilidades antigas (Golpe Furtivo, Frasco Venenoso, Passo Sombrio).
