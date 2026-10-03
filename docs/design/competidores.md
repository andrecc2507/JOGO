# O que falta frente a XCOM 2, Xenonauts 2 e Baldur's Gate 3 (mapa e batalha)

> **Status (D117):** todos os 15 itens foram implementados — ver a seção "Como ficou" no fim.

Levantamento de 2026-10-03, depois de D116 (prédios, desabamento e luz). Primeiro o que **já temos**,
para não repetir; depois o que falta, como implementar no nosso código e o toque próprio de Valdoria.

## Já temos (paridade ou além)
Cobertura meia/inteira com flanco (XCOM) · prontidão/overwatch · esconder e cones de visão · fumaça e
clarão · armadilhas com visibilidade por time · superfícies e nuvens que reagem entre si (BG3: fogo,
água, óleo, gelo, lama, eletricidade) · objetos e paredes destrutíveis · prédios com andares, janelas,
portas, escadas e desabamento (Xenonauts) · bônus de altura no acerto e no alcance · ataque de
oportunidade · combos entre heróis e de orbes · captura/interrogatório · moral, lealdade e vínculos ·
dia/noite com luz · barra de ação (ATB) com andar–agir–andar · voltar turno.

## O que falta — por prioridade (impacto ÷ esforço)

| # | Mecânica (de onde vem) | Como implementar aqui | Toque de Valdoria |
|---|---|---|---|
| 1 | **Empurrar e arremessar** (BG3) | Ação bônus "Empurrar" (1 casa, teste FOR×FOR) e "Arremessar" (objeto leve ou criatura pequena). Reusa `settleStructures`/`fallDamage`: empurrar do telhado = dano de queda; empurrar no fogo/água aplica a superfície. Módulo `battle/shove.ts`. | Gigantes e ursos arremessam **aliados** para cima de telhados (combo de posicionamento). |
| 2 | **Barris e objetos que reagem** (BG3, XCOM) | Props novos: barril de óleo (derrama óleo ao quebrar), barril de pólvora alquímica (explode em raio 2, dano e quebra peças), lustre/corrente (cai na casa de baixo ao acertar a corrente → `crushDamage`). Campo `onBreak` em `PropDef`. | Pólvora alquímica da guilda de Vel'Qadar; lustres no palácio de Solenne e na Citadela. |
| 3 | **Supressão** (XCOM, Xenonauts) | Ação de arqueiro/besteiro: alvo fica "Suprimido" (−30 acerto, não pode se mover sem tomar tiro de reação). Reusa `triggerOverwatch` com alvo único. | "Chuva de setas" que crava flechas no chão e vira terreno difícil. |
| 4 | **Emboscada / fase oculta** (XCOM) | Encontro começa com o esquadrão escondido; inimigos em **grupos patrulhando** (pods) que só "ativam" ao ver alguém. Estado `pod` na IA e rotas de patrulha no mapa. | Encontros noturnos começam ocultos de graça. A luz (tochas) quebra o oculto, o que dá peso real à noite. |
| 5 | **Tiro que erra continua** (Xenonauts) | Errou → o projétil segue a linha (`rayBlocked`/`lineTiles`) e acerta a primeira peça, objeto ou unidade no caminho (fogo amigo realista). Hoje só a cobertura é atingida. | Flechas que erram cravam na parede e dá para recolher depois da batalha (material). |
| 6 | **Arremesso em arco** (Xenonauts, BG3) | Granadas e poções atiradas por cima de muros: trajetória em parábola com teste de altura livre (`freeSpan`). Poção de cura atirada cura em área. | Frascos do alquimista misturam elementos no ar (combo de superfícies no impacto). |
| 7 | **Luz e escuridão para furtividade** (BG3) | Esconder tem bônus em casa escura e penalidade em casa iluminada (`litTiles`). Item tocha: +visão, mas revela quem a carrega. Sinalizador ilumina área por 3 turnos. | Ladinos de Valdoria apagam lampiões com uma flecha para criar rotas escuras. |
| 8 | **Sangrando / estabilizar** (XCOM) | Herói a 0 de vida cai "Sangrando" por 3 turnos; aliado adjacente estabiliza (Interagir) ou carrega o corpo (anda com a velocidade reduzida). Liga com `ferimentos`. | Clérigos de Aster revivem com "Chama de Aster" (custo: ferimento permanente leve). |
| 9 | **Concentração** (BG3) | Buffs/zonas fortes exigem concentração: se o conjurador sofre dano, teste de VIT/INT ou perde o efeito. Flag `concentration` em `SkillDef`. | Rituais do Vazio: interromper o conjurador inimigo desfaz o portal. |
| 10 | **Vantagem/desvantagem** (BG3) | Rolar o acerto duas vezes e ficar com o melhor/pior (altura muito maior, alvo cego, escuridão). Em `stats.physicalHitChance` como modificador nomeado. | Orbes da alma podem dar "vantagem" no primeiro golpe da batalha. |
| 11 | **Construção tática** (único) | Habilidades que criam **peças**: muralha de pedra (geomante), rampa de gelo, trepadeira que vira escada (druida), barricada de escudos (guerreiro). Tudo já existe no modelo `stack` — basta `castSkill` empilhar `Slab`s. | Assinatura do jogo: o mapa é moldado pela magia de cada capital. |
| 12 | **Inimigo recorrente que aprende** (XCOM: os Escolhidos) | Um rival do Vazio aparece em batalhas aleatórias, foge com 30% de vida, ganha resistência ao elemento que mais o feriu. Ficha em `world/`, com fraquezas descobertas por interrogatório. | O Arauto do Vazio, que fala com o esquadrão e lembra das batalhas (crônica emergente). |
| 13 | **Interagir com o cenário** (BG3) | Alavancas (abrem portões e pontes levadiças), portas trancadas (arrombar, chave ou explodir), passagens secretas (teste de percepção), sinos que alertam os inimigos. Props com `interact` e alvo vinculado. | Sinos da Citadela: tocar atordoa os mortos-vivos do Ato 5. |
| 14 | **Perceber armadilhas** (BG3) | Chance por turno de ver armadilhas inimigas a até 3 casas (DES/INT); quem as vê pode desarmar (Interagir) e reaproveitar. | O Trapper vê todas as armadilhas e rouba as do inimigo. |
| 15 | **Gravidade invertida** (único) | Nos mapas do Vazio (Atos 6–8), `settle` cai **para cima** e o dano de queda vira "dano de subida"; empurrar alguém o lança ao teto. Parâmetro de direção em `stack.settle`. | Fecha o arco do mundo invertido com uma mecânica que nenhum concorrente tem. |

## Tipos de habilidade que faltam
- **Controle de campo**: muralhas, rampas e pontes criadas na hora (item 11); paredes de vento que
  desviam projéteis.
- **Mobilidade vertical**: gancho/corda (puxa até o telhado), salto heroico (cair do alto causando dano
  em área com o próprio peso), voo curto.
- **Manipulação de objetos**: telecinese (arremessar barris e lustres), "Desabar" (dano extra a fundações).
- **Ação bônus**: empurrar, beber poção, trocar arma, abrir porta (já livre), mergulhar a arma no fogo
  (imbuir com a superfície ao lado).
- **Reações novas**: "Contra-empurrão", "Segurar a borda" (não cai quando empurrado), "Escudo de
  aliado" (troca de lugar com o aliado que ia ser atingido).
- **Informação**: marcar alvo (aliados ganham acerto), revelar área (sinalizador), escutar através
  de paredes (mostra a silhueta de inimigos dentro de casas).

## Ordem sugerida
1. Empurrar/arremessar + barris/lustres (aproveita a física recém-feita e é a interação mais lembrada de BG3).
2. Construção tática (identidade própria, pouco código novo).
3. Supressão + tiro que erra continua.
4. Emboscada com patrulhas + luz/escuridão na furtividade.
5. O resto conforme a campanha pedir (rival recorrente, gravidade invertida no Ato 6).

## Como ficou (D117)

| Item | Onde |
|------|------|
| Empurrar (FOR × FOR), arremessar objetos, arremessar aliado | `battle/tactics.ts` (`shove`, `throwProp`), `battle/build.ts` (`launch`); botões 💪 Empurrar, 🪣 Arremessar, 🦍 Ser arremessado |
| Barris de óleo/pólvora, lustre | `PropDef.onBreak` + `tactics.propBroke/explode`; 🎯 Derrubar lustre |
| Supressão | `fx.suppress`, status Suprimido (`tactics.suppress`, `suppressedMove`) |
| Patrulhas e emboscada noturna | `battle/patrol.ts` (`assignPods`, `checkAlerts`); encontros noturnos começam ocultos |
| Tiro que erra continua | `tactics.strayShot` |
| Arremesso em arco, poção arremessada | `tactics.arcReach`, `fx.arc`, `useItem` |
| Luz e furtividade, tocha, sinalizador | `tactics.hideLightMod`, itens `tocha`/`sinalizador` |
| Sangrando, estabilizar, carregar | `battle/downed.ts`; ✚ Estabilizar, 🧍 Carregar/Largar |
| Concentração | `battle/concentration.ts`, `fx.concentration` |
| Vantagem/desvantagem | `engine.advantageOf`, `stats.advantageChance` |
| Construção tática | `battle/build.ts`, `fx.build` |
| Rival recorrente | `world/rival.ts`, `data/world/rival.json` |
| Cenário interativo e perceber armadilhas | `battle/scenery.ts`; 🔍 Procurar |
| Gravidade invertida | `engine.settleStructures`/`tactics.pushStep` com `state.inverted` |
| Evoluções Nv 3/5 | `TreeSkill.evolve`, `rules/skill_tree.unlockedEvolutions` |
