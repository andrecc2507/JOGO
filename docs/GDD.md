# Game Design Document

> Documento vivo. Decisões fechadas ficam aqui; valores numéricos ficam em
> [design/variaveis.md](design/variaveis.md) até serem aprovados e irem para `src/game/data/`.
> O mapa mental original está em [design/esqueleto.canvas](design/esqueleto.canvas) (Obsidian Canvas).

## Visão
- **Gênero:** RPG tático — mapa do continente + batalhas por turnos em grade isométrica.
- **Pitch:** um RPG tático medieval que começa como uma guerra civil e gradualmente se transforma
  em uma guerra interdimensional. Ver [design/historia.md](design/historia.md).
- **Plataforma:** navegador (desktop).
- **Referências:** Baldur's Gate (ações básicas), XCOM / Xenonauts (esquadrão, prontidão), Ragnarok Online e Alabaster Dawn (visual), Final Fantasy Tactics (câmera de batalha),
  Chrono Trigger (NPCs em tavernas dão dicas), Chaves de Salomão (temática de demônios).

## Pilares

1. **RPG à moda antiga.** Liberdade total, sem passo a passo, sem setas apontando o caminho.
   O jogador pode acertar e errar; errar tem custo real (como nas primeiras temporadas do Ragnarok).
   Dicas existem, mas vêm do mundo (NPCs nas tavernas), não da interface.
2. **Guerra civil que vira guerra interdimensional.**
3. **Personalização profunda** pela rosa das classes.
4. **Elementos sistêmicos.** Os elementos interagem entre si e com o terreno seguindo lógica física
   (fogo + água = vapor; água + eletricidade = choque; vento amplifica fogo).
5. **Clareza acima de beleza.** O gráfico não é o carro-chefe: precisa ser agradável e, acima de tudo,
   deixar claro o que acontece no mapa e nas interações elementais. O carro-chefe é história + mecânicas.

> Ordem de trabalho: fechar todas as mecânicas antes de detalhar a história e as missões.

## Decisões fechadas

| # | tema | decisão | data |
|---|------|---------|------|
| D1 | Tecnologia | TypeScript + Vite, sem engine (ver `docs/ARCHITECTURE.md`) | 2026-09-30 |
| D2 | Visual das batalhas | Isométrico 2D com câmera que gira, estilo Final Fantasy Tactics | 2026-09-30 |
| D3 | Mundo | 1 continente, reino-citadela central, 5 países ao redor, 5 cidades por país (uma é a capital) | 2026-09-30 |
| D4 | Processo | Definir as variáveis bloco a bloco antes de implementar cada sistema | 2026-09-30 |
| D5 | Classes | Guerreiro, Arqueiro, Mago, Clérigo, Ladrão (Curandeiro renomeado para Clérigo) | 2026-09-30 |
| D6 | Progressão | Igual ao Ragnarok: nível máximo 99; a cada nível, pontos de atributo (quantidade fixa, custo crescente) + 1 ponto de habilidade para a árvore | 2026-09-30 |
| D7 | Encontros | Programados (história, contratos) e aleatórios (emboscadas, feras) | 2026-09-30 |
| D8 | História | Organizada em atos com missões; side quests "Lendas" dão itens únicos | 2026-09-30 |
| D9 | Feras | Feras adestráveis (inclusive lendárias) pelo Druida, evolução do Arqueiro: deixar com HP baixo e tentar (pode falhar). Familiares não ocupam vaga, ganham XP, morrem de vez; o limite cresce com o nível do Druida por passiva, sem chegar a 4–5 | 2026-09-30 |
| D10 | Visual | Inspiração Chrono Trigger (Akira Toriyama), Ragnarok e Alabaster Dawn, com designs próprios. Personalização: cabelo, cor do cabelo, cor da pele. Equipamento não aparece no sprite (exceto aura de alguns lendários). Retratos só para personagens da história | 2026-09-30 |
| D11 | Protagonista | Comandante do rei que deserta no fim do Ato 1 e passa a liderar a rebelião | 2026-09-30 |
| D12 | Base | O jogador escolhe uma capital como esconderijo, que vira sua base a partir do Ato 4 | 2026-09-30 |
| D13 | Campanha | Prólogo + 8 atos (número provisório); segunda metade no mundo invertido | 2026-09-30 |
| D14 | Dicas | NPCs em tavernas dão pistas da missão principal e das Lendas | 2026-09-30 |
| D15 | Easter eggs | Mensagens subliminares ocultas, sem impacto na jogabilidade | 2026-09-30 |
| D16 | Países | Cada país é a terra de uma classe: Arqueiros (floresta), Magos (montanhas de neve), Guerreiros (cidade portuária), Ladrões (guilda no deserto), Clérigos (planície, capital comercial e religiosa). As 5 cidades de cada país seguem o bioma do país. Nomes provisórios | 2026-09-30 |
| D17 | Mapa | Mapa estilo Chrono Trigger: vários esquadrões; point & click no destino; esquadrão anda visualmente enquanto o tempo passa | 2026-09-30 |
| D18 | Viagem | Pontos de passagem entre cidades (estilo FFT) onde acontecem encontros aleatórios | 2026-09-30 |
| D19 | Cidades | Só as capitais têm interação (taverna, loja e recrutamento); as outras 4 cidades são pontos de descanso | 2026-09-30 |
| D20 | Recursos | Só ouro, por enquanto | 2026-09-30 |
| D21 | Tempo | Tempo corre sozinho no mapa, com pausar / acelerar / desacelerar (estilo Xenonauts) | 2026-09-30 |
| D22 | Esquadrões | Sem limite de esquadrões viajando ao mesmo tempo | 2026-09-30 |
| D23 | Descanso | Estalagem nos pontos de descanso: custa pouco ouro, recupera HP e MP, ferimentos curam 2× mais rápido | 2026-09-30 |
| D24 | Encontros | Chance fixa de encontro no caminho; nível = média do esquadrão; faixas comum / raro / épico / lendário; emboscadas fazem o inimigo agir primeiro; sempre dá para tentar fugir | 2026-09-30 |
| D25 | Atributos | Força (corpo a corpo), Destreza (distância, acerto), Inteligência (magia, MP), Vitalidade (HP), Constituição (defesa), Velocidade (barra de ação, esquiva) | 2026-09-30 |
| D26 | Turnos | Barra de ação estilo Chrono Trigger (sem pontos de ação): enche conforme a Velocidade; cheia = mover + agir ou só agir; a ação encerra o turno; unidades rápidas podem agir 2× antes das lentas | 2026-09-30 |
| D27 | Só mover | Mover sem agir encerra o turno e a próxima barra começa em 50% | 2026-09-30 |
| D28 | Movimento | Alcance de movimento fixo por classe (itens podem aumentar no futuro) | 2026-09-30 |
| D29 | Modo espera | Quando a barra de um personagem enche, ele é selecionado e o tempo da batalha congela até o jogador encerrar o turno | 2026-09-30 |
| D30 | Crítico | Chance base baixa, aumentada apenas por itens | 2026-09-30 |
| D31 | Esquadrão | 6 personagens por esquadrão (provisório) | 2026-09-30 |
| D32 | Avanço de classe | Carro-chefe do jogo: "rosa das classes" — centro = classe base, 4 cardeais = evoluções, 4 diagonais = híbridas (multiclasse). Ver [design/rosa_das_classes.md](design/rosa_das_classes.md) | 2026-09-30 |
| D33 | Classes únicas | Personagens da história (princesa, xamã, líderes das capitais) têm classes únicas | 2026-09-30 |
| D34 | Batalha | Esquadrão inteiro luta junto, com visão compartilhada (estilo XCOM / Xenonauts) | 2026-09-30 |
| D35 | Papéis | Guerreiro (frente), Arqueiro (distância), Mago (magia em área), Clérigo (cura/suporte), Ladrão (furtivo, rápido) | 2026-09-30 |
| D36 | Experiência | XP base da missão para quem sobrevive + XP por inimigo derrotado; suporte sobe mais devagar | 2026-09-30 |
| D37 | Morte | HP zerado = morte permanente | 2026-09-30 |
| D38 | Builds | Pontos livres em qualquer direção da rosa; sem redistribuição (respec); errou, recruta outro personagem | 2026-09-30 |
| D39 | Recrutamento | Nas capitais, lista de candidatos (estilo Xenonauts): Aprendizes genéricos (escolhem a classe ao passar do 1º nível) e recrutas da classe da capital, nível 1–2, com build já direcionada. Todos chegam com pontos de atributo pré-distribuídos. Custa ouro (mais caro quanto maior o nível); Aprendizes em todas as capitais; lista renova todo mês | 2026-09-30 |
| D40 | Ações básicas | Estilo Baldur's Gate: atacar, defender, usar item, arremessar item, esconder-se, prontidão (overwatch); voar e ir sob a terra para quem puder | 2026-09-30 |
| D41 | Ferimentos | Pós-batalha: dias afastado proporcionais ao HP perdido | 2026-09-30 |
| D42 | Escondido | Qualquer um pode se esconder fora da visão inimiga (Ladrão tem bônus); cones de visão aparecem no turno do escondido; entrar num cone revela | 2026-09-30 |
| D43 | Combos | Personagens próximos com habilidades compatíveis fazem uma técnica combinada na vez de quem age primeiro (estilo Chrono Trigger) | 2026-09-30 |
| D44 | Altura | De cima: mais alcance e acerto. Subida máxima de 1 tile por padrão; algumas classes sobem mais | 2026-09-30 |
| D45 | Combo (custo) | A barra do parceiro também zera, mas ele fura a fila e age junto; distância definida por combo | 2026-09-30 |
| D46 | Prontidão | Dispara uma vez (habilidades futuras podem ampliar) | 2026-09-30 |
| D47 | Vitória | Condições por missão: eliminar todos, alvo específico, extrair VIP, sequestrar, fugir | 2026-09-30 |
| D48 | Elementos | Todos os elementos existem e interagem entre si e com o terreno (ver [design/elementos.md](design/elementos.md)) | 2026-09-30 |
| D49 | Sistema de elementos | Aprovados: Fogo, Água, Gelo, Eletricidade, Vento, Terra, Veneno, Luz, Sombra; superfícies (chamas, poça, água eletrificada, gelo, vapor, lama, veneno, óleo); status (molhado, queimando, congelado, eletrocutado, envenenado, enlameado); clima do bioma e líquidos escorrendo | 2026-09-30 |
| D50 | Cidades (interface) | Interação nas capitais só por telas/menus (estilo FFT); contratos no quadro da taverna | 2026-09-30 |
| D51 | Contratos | No quadro da taverna de cada capital; 3 por capital por ato (provisório), somem ao fim do ato; pagam ouro, itens e XP; vários esquadrões podem cumprir contratos em capitais diferentes | 2026-09-30 |
| D52 | Inimigos | Animais, feras e humanos; humanos usam as classes do jogador com builds aleatórias coerentes com a classe; monstros respeitam o bioma | 2026-09-30 |
| D53 | Equipamento | 2 mãos (arma + secundária), 1 armadura, 1 acessório e 3 espaços de itens de campo por personagem (estilo Chrono Trigger + XCOM). Maioria das armas usa as duas mãos; habilidades liberam escudo ou duas armas | 2026-09-30 |
| D54 | Itens | Raridades comum / raro / épico / lendário; sem fabricação; inventário único na base; itens obtidos fora só entram nele quando o esquadrão volta | 2026-09-30 |
| D55 | Armas por classe | Guerreiro: espadas · Ladrão: facas · Arqueiro: arcos · Mago: varinhas e bastões · Clérigo: bastões (amplificam magia e cura). Evoluções mudam a arma (ex.: Monge luta com as mãos) | 2026-09-30 |
| D56 | Lojas | Toda capital vende itens gerais básicos; a capital de cada classe vende os melhores itens daquela classe. Consumíveis somem ao usar | 2026-09-30 |
| D57 | Perdas | Só um esquadrão dizimado perde os itens que carregava (ouro gasto não volta); se um membro morre, os itens dele seguem com o esquadrão. O ouro é único e compartilhado por todos os esquadrões | 2026-09-30 |
| D58 | Música | Orquestral de fantasia com tom sombrio, variando por local e batalha | 2026-09-30 |
| D59 | Produção | Projeto de uma pessoa só; toda a produção (código, arte, som) feita com o Claude, sem orçamento | 2026-09-30 |
| D60 | Escala | 1 tile = 1 metro; alcances, visão e áreas medidos em metros | 2026-09-30 |
| D61 | Movimento | Movimento base dos personagens: 6 metros (6 tiles) | 2026-09-30 |

## Estrutura (do mapa mental)

```
Brainstorm
├─ Mecânicas
│  ├─ Combate
│  │  ├─ HUD: linha do tempo · barra de skills e ações · previsão de movimento
│  │  ├─ Variáveis: velocidade → barra de ação (ATB)
│  │  ├─ Ações básicas
│  │  ├─ Status: ferimentos · escondido · status elementais
│  │  ├─ Elementos: interações sistêmicas com o terreno
│  │  └─ Combo
│  ├─ Mapa e recursos → Mundo
│  └─ Progressão do personagem → distribuir pontos ao upar (estilo Ragnarok)
├─ Encontros
│  ├─ Programados: história · contratos
│  └─ Aleatórios: emboscadas · feras
├─ História
│  ├─ Atos → missões
│  ├─ História central
│  ├─ Side quests (Lendas) → recompensas em itens únicos
│  └─ Personagens
├─ Classes
│  ├─ Atributos
│  ├─ Aprendiz (inicial) → Guerreiro · Arqueiro · Mago · Clérigo · Ladrão
│  ├─ Inimigos NPCs
│  └─ Feras (adestráveis e não)
└─ Som e visual
   ├─ VFX: sprites, magias e animações → gráficos tipo Ragnarok/Alabaster Dawn → personalização básica
   └─ SFX · música · animações de batalha
```

## Roteiro

Próximas builds em [design/roadmap.md](design/roadmap.md).

## Implementação (2026-09-30)

Primeira versão jogável com todas as mecânicas fechadas: mapa-mundo com tempo e vários esquadrões,
capitais (loja, taverna, recrutamento), estalagem, contratos por ato, encontros por raridade, batalha
isométrica com barra de ação, combos, elementos sistêmicos, escondido, prontidão, morte permanente,
ferimentos, progressão estilo Ragnarok, Quartel, dev mode e editor de mapas. Valores numéricos são
provisórios. Ainda não implementado: rosa das classes (evoluções), Druida/familiares, voar/ir sob a
terra, história e missões. Áudio: trilhas e efeitos procedurais provisórios (Web Audio).

## Ordem de definição (blocos)

| bloco | tema | status |
|-------|------|--------|
| 1 | Mundo, mapa e recursos | estrutura fechada; faltam números |
| 2 | Classes e atributos | estrutura fechada; faltam números |
| 3 | Progressão do personagem | estrutura fechada; faltam números |
| 4 | Combate | estrutura fechada; faltam números |
| 5 | Encontros | estrutura fechada; faltam números |
| 6 | Inimigos e feras | estrutura fechada; bestiário com 125 criaturas (`design/bestiario.md`) |
| 7 | História, atos e missões | em definição |
| 8 | Som e visual | estrutura fechada; falta o pipeline de arte |
| 9 | Itens e equipamento | estrutura fechada; faltam números |
