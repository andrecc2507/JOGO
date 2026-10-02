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
| D12 | Base | No fim do Ato 1 o jogador escolhe uma capital como esconderijo, que vira a base (pesquisa e forja, poucas instalações); no Ato 4 ela cresce. Ver [design/base_pesquisa_craft.md](design/base_pesquisa_craft.md) | 2026-10-02 |
| D13 | Campanha | Prólogo + 8 atos (número provisório); segunda metade no mundo invertido | 2026-09-30 |
| D14 | Dicas | NPCs em tavernas dão pistas da missão principal e das Lendas | 2026-09-30 |
| D15 | Easter eggs | Mensagens subliminares ocultas, sem impacto na jogabilidade | 2026-09-30 |
| D16 | Países | Cada país é a terra de uma classe: Arqueiros (floresta), Magos (montanhas de neve), Guerreiros (cidade portuária), Ladrões (guilda no deserto), Clérigos (planície, capital comercial e religiosa). As 5 cidades de cada país seguem o bioma do país. Nomes provisórios | 2026-09-30 |
| D17 | Mapa | Mapa estilo Chrono Trigger: vários esquadrões; point & click no destino; esquadrão anda visualmente enquanto o tempo passa | 2026-09-30 |
| D18 | Viagem | Pontos de passagem entre cidades (estilo FFT) onde acontecem encontros aleatórios | 2026-09-30 |
| D19 | Cidades | Só as capitais têm interação (taverna, loja e recrutamento); as outras 4 cidades são pontos de descanso | 2026-09-30 |
| D20 | Recursos | Ouro (economia) + materiais de drop por família (chaves de pesquisa e fabricação; também vendáveis) | 2026-10-02 |
| D21 | Tempo | Tempo corre sozinho no mapa, com pausar / acelerar / desacelerar (estilo Xenonauts) | 2026-09-30 |
| D22 | Esquadrões | Sem limite de esquadrões viajando ao mesmo tempo | 2026-09-30 |
| D23 | Descanso | Estalagem nos pontos de descanso: custa pouco ouro, recupera HP e MP, ferimentos curam 2× mais rápido | 2026-09-30 |
| D24 | Encontros | Chance fixa de encontro no caminho; nível = média do esquadrão; faixas comum / raro / épico / lendário; emboscadas fazem o inimigo agir primeiro; sempre dá para tentar fugir | 2026-09-30 |
| D25 | Atributos | Força (corpo a corpo), Destreza (distância, acerto), Inteligência (magia, MP), Vitalidade (HP), Constituição (defesa), Velocidade (barra de ação, esquiva) | 2026-09-30 |
| D26 | Turnos | Barra de ação estilo Chrono Trigger (sem pontos de ação): enche conforme a Velocidade; cheia = 1 ação + o deslocamento inteiro, gasto em partes antes e depois da ação (andar 3, agir, andar o resto); agir não encerra o turno; unidades rápidas podem agir 2× antes das lentas | 2026-10-02 |
| D27 | Sem agir | Encerrar o turno sem agir (só andando ou esperando) deixa a próxima barra em 50% | 2026-10-02 |
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
| D39 | Recrutamento | Nas capitais, lista de candidatos (estilo Xenonauts): Aprendizes genéricos (escolhem a classe ao passar do 1º nível) e recrutas da classe da capital, nível 1–2, com build já direcionada. Todos chegam com pontos de atributo pré-distribuídos. Custa ouro (mais caro quanto maior o nível); Aprendizes em todas as capitais; a Citadela Real recruta só Aprendizes; lista renova todo mês. Contrato aceito aparece como pergaminho no local da missão | 2026-10-02 |
| D40 | Ações básicas | Estilo Baldur's Gate: atacar, defender, usar item, arremessar item, esconder-se, prontidão (overwatch); voar e ir sob a terra para quem puder | 2026-09-30 |
| D41 | Ferimentos | Pós-batalha: dias afastado proporcionais ao HP perdido | 2026-09-30 |
| D42 | Escondido | Qualquer um pode se esconder fora da visão inimiga (Ladrão tem bônus); cones de visão aparecem no turno do escondido; entrar num cone revela | 2026-09-30 |
| D43 | Combos | Personagens próximos com habilidades compatíveis fazem uma técnica combinada na vez de quem age primeiro (estilo Chrono Trigger) | 2026-09-30 |
| D44 | Altura | De cima: mais alcance e acerto. Subida máxima de 1 tile por padrão; algumas classes sobem mais | 2026-09-30 |
| D45 | Combo (custo) | A barra do parceiro também zera, mas ele fura a fila e age junto; distância definida por combo | 2026-09-30 |
| D46 | Prontidão | Dispara uma vez no primeiro inimigo que se mover dentro do alcance, até o próximo turno. Pode usar a arma ou preparar uma habilidade de dano: o MP é pago ao preparar e, se ninguém vier, a magia se desfaz sem devolver o MP | 2026-10-02 |
| D47 | Vitória | Condições por missão: eliminar todos, alvo específico, extrair VIP, sequestrar, fugir. Tipos de missão do XCOM 2 adaptados: Resgatar VIP, Extrair VIP, Neutralizar VIP, Incursão de suprimentos, Roubar/atrasar, Destruir altar/comandante, Retaliação (ver [design/base_pesquisa_craft.md](design/base_pesquisa_craft.md#10-tipos-de-missão-inspirados-no-xcom-2)) | 2026-10-02 |
| D48 | Elementos | Todos os elementos existem e interagem entre si e com o terreno (ver [design/elementos.md](design/elementos.md)) | 2026-09-30 |
| D49 | Sistema de elementos | Aprovados: Fogo, Água, Gelo, Eletricidade, Vento, Terra, Veneno, Luz, Sombra; superfícies (chamas, poça, água eletrificada, gelo, vapor, lama, veneno, óleo); status (molhado, queimando, congelado, eletrocutado, envenenado, enlameado); clima do bioma e líquidos escorrendo | 2026-09-30 |
| D50 | Cidades (interface) | Interação nas capitais só por telas/menus (estilo FFT); contratos no quadro da taverna | 2026-09-30 |
| D51 | Contratos | No quadro da taverna de cada capital; 3 por capital por ato (provisório), somem ao fim do ato; pagam ouro, itens e XP; vários esquadrões podem cumprir contratos em capitais diferentes | 2026-09-30 |
| D52 | Inimigos | Animais, feras e humanos; humanos usam as classes do jogador com builds aleatórias coerentes com a classe; monstros respeitam o bioma | 2026-09-30 |
| D53 | Equipamento | 2 mãos (arma + secundária), 1 armadura, 1 acessório e 3 espaços de itens de campo por personagem (estilo Chrono Trigger + XCOM). Maioria das armas usa as duas mãos; habilidades liberam escudo ou duas armas | 2026-09-30 |
| D54 | Itens | Raridades comum / raro / épico / lendário; fabricação destravada por pesquisa; inventário único na base; itens obtidos fora só entram nele quando o esquadrão volta | 2026-10-02 |
| D55 | Armas por classe | Guerreiro: espadas · Ladrão: facas · Arqueiro: arcos · Mago: varinhas e bastões · Clérigo: bastões (amplificam magia e cura). Evoluções mudam a arma (ex.: Monge luta com as mãos) | 2026-09-30 |
| D56 | Lojas | Toda capital vende itens gerais básicos; a capital de cada classe vende os melhores itens daquela classe. Utilitários (inclusive poções) não somem: usos por batalha, recarregam depois; melhorias por fabricação | 2026-10-02 |
| D57 | Perdas | Herói morto em combate: os companheiros recolhem os itens dele. Esquadrão dizimado: os itens se perdem, mas fica um marcador no mapa por 4 dias (maior viagem do mapa + 2 dias) e outro esquadrão pode ir lá recuperá-los. O ouro é único e compartilhado por todos os esquadrões | 2026-10-02 |
| D58 | Música | Orquestral de fantasia com tom sombrio, variando por local e batalha | 2026-09-30 |
| D59 | Produção | Projeto de uma pessoa só; toda a produção (código, arte, som) feita com o Claude, sem orçamento | 2026-09-30 |
| D60 | Escala | 1 tile = 1 metro; alcances, visão e áreas medidos em metros | 2026-09-30 |
| D61 | Movimento | Movimento base dos personagens: 6 metros (6 tiles) | 2026-09-30 |
| D62 | Drops | Feras deixam material comum, material raro, troféu (épicas/lendárias) e, raramente, joia da alma; humanos deixam documentos e podem ser capturados | 2026-10-02 |
| D63 | Pesquisa | Na Biblioteca da base: gasta materiais e dias; resultados: bônus contra a criatura, receitas, joias, avanço da história (análise de objetos, interrogatório); é o portão das missões principais | 2026-10-02 |
| D64 | Fabricação | Na Forja: materiais + ouro + dias; armas, armaduras, acessórios, utilitários e itens mágicos; melhorias de itens existentes | 2026-10-02 |
| D65 | Joias da alma | Drop raríssimo de feras; uma pesquisa por besta para aprender a usar. Tipo escolhido à mão por espécie. Joia de habilidade: espaço próprio, dá a habilidade-assinatura da besta. Joia de forja: ingrediente de armas, armaduras e acessórios mágicos | 2026-10-02 |
| D66 | Trabalho na base | Heróis parados na base aceleram pesquisa (Mago, Clérigo) e forja (Guerreiro, Ladino) | 2026-10-02 |
| D67 | Captura | Qualquer herói pode render um humano com pouca vida; corda/rede melhoram; o prisioneiro vai para a Prisão e é interrogado (pesquisa de história) | 2026-10-02 |
| D68 | Instalações | Quartel, Biblioteca, Forja, Enfermaria, Prisão, Santuário, Rede de informantes; construir custa ouro e dias; o esconderijo escolhido dá um bônus | 2026-10-02 |
| D69 | Pressão | Contador de ritual (0–100) a partir da revelação do plano inimigo (fim do Ato 2); sobe com o tempo e ações inimigas, desce com missões de atraso; em 100 o ato é antecipado e a história segue um ramo "e se" — sem game over | 2026-10-02 |
| D70 | Missões novas | Peças comuns: Interagir (abrir cela, pegar baú, decifrar), VIP e civis (aliados sem controle), limite de rodadas, início escondido | 2026-10-02 |
| D71 | Campanha | Prólogo + 8 atos × 8 missões; os Sete Selos (Carne, Memória, Vínculo, Forma, Passagem, Nome, Horizonte) são a espinha; ver [design/campanha.md](design/campanha.md) | 2026-10-02 |
| D72 | Prólogo | Viagem de apresentação às 5 capitais e seus senhores (tutorial do mapa); depois a revolta de Arven e a noite das carroças | 2026-10-02 |
| D73 | Barões | Três, um por capital do mundo invertido, cada um ligado a um Selo: Senhor das Profundezas (Carne), Rainha do Enxame (Vínculo), O Arquivista (Memória) | 2026-10-02 |
| D74 | Alianças | No Ato 4, uma missão própria por capital aliada (as 4 que não são a base) | 2026-10-02 |
| D75 | Nomes | Países e capitais com nome fantasia, sem a classe no nome: "Silvânia — Lar dos Arqueiros" (capital Verdelume), etc.; nomes de personagens provisórios em design/campanha.md | 2026-10-02 |
| D76 | Lealdade e moral | Lealdade sobe com uso, equipamento, nível e atenção; moral cai ao ver mortes em combate; moral baixa derruba a lealdade aos poucos | 2026-10-02 |
| D77 | Ataque de oportunidade | Só corpo a corpo: sair do alcance de um inimigo adjacente provoca um golpe (1 por turno de quem ataca), com indicador no caminho ao mover (estilo Baldur's Gate). À distância, só a Prontidão reage a movimento | 2026-10-02 |
| D78 | Personagens da história | Viram jogáveis em certos momentos, como 7º, 8º e 9º membros do esquadrão; Academia de Treino na base guarda as habilidades do comandante (tamanho da equipe e outros bônus) | 2026-10-02 |
| D79 | Hub sem painéis fixos | Clicar num local abre um menu pequeno (estilo botão direito): "Mover para cá" lista os esquadrões ao passar o mouse e pede confirmação; com esquadrão presente, a capital mostra Loja, Taverna, Recrutamento e o serviço próprio. Painéis de esquadrões e de local removidos; menu ☰ ao lado da data dá Quartel, Esquadrões, Base, Bestiário conhecido e Academia | 2026-10-02 |
| D80 | Serviço de cada capital | Verdelume: conhecimento das bestas e Marca do Caçador; Bastiamar: refino de armas e armaduras; Cristália: refino de itens mágicos; Vel'Qadar: Mercado Negro; Solenne: a definir | 2026-10-02 |
| D81 | Mapa em estilo de fantasia | Atlas de pergaminho e nanquim: costa orgânica com linhas de eco no mar, florestas, montanhas, dunas e colinas por bioma, serras nas fronteiras, rosa dos ventos e nomes das regiões | 2026-10-02 |
| D82 | Enfermaria de Solenne | Esquadrão parado em Solenne sara ferimentos 2× mais rápido, recupera tudo e restaura a moral | 2026-10-02 |
| D83 | Escolta | Até 6 escoltados (feridos, aprendizes) viajam com o esquadrão além dos 6 combatentes; não lutam nem ganham XP; escapam para a base se o esquadrão cair | 2026-10-02 |
| D84 | Estandarte | Nome, cor e emblema de cada esquadrão escolhidos pelo jogador | 2026-10-02 |
| D85 | Regra dos 5 golpes | Com atributos iguais (FOR/DES/INT de ataque = VIT do alvo), o ataque básico tira 1/5 da vida: ataque = arma + poder(atributo) + 3×nível; vida = fator da classe × 5 × (arma de referência + poder(VIT) + 3×nível). VIT só dá vida; resistência física vem da armadura | 2026-10-02 |
| D86 | Ferimentos pela menor vida | Fica ferido quem chegou abaixo de 50% da vida em algum momento da luta, mesmo curado depois; dias = ⌈(1 − menor fração) × 6⌉ | 2026-10-02 |
| D87 | Escala das habilidades | Magias com ataque mágico (INT), físicas com ataque físico (FOR; DES com arco e faca), curas com INT; bastão golpeia com FOR | 2026-10-02 |
| D88 | Escala por subclasse | Cada teia define os atributos das suas habilidades (Berserker FOR; Espadachim Arcano FOR + INT; Sniper DES; Arqueiro Arcano INT; Atirador Rúnico DES + INT…); pesos mistos normalizados para render o mesmo que o puro na build máxima | 2026-10-02 |
| D89 | Tela "Evoluir" | Teia de habilidades em tela cheia, em estilo de página de runas (LoL antigo) com traço de mapa: fundo azul-noite, astrolábio e rosa dos ventos dourados, engastes com glifo do tipo e marcas de nível; atributos num canto e painel da habilidade no outro. Aberta pelo botão ✦ Evoluir do Quartel | 2026-10-02 |
| D90 | Forma fortificada | Habilidade ativa no Nv 5 ganha versão fortificada (mais MP, um bônus: golpe duplo, área, ricochete, estado, execução, roubo de vida…); na batalha aparecem Normal e Fortificada; segredo revelado pelo treino, com dicas na taverna | 2026-10-02 |
| D91 | Teia com ícones, zoom e zigue-zague | Ícone por elemento/tipo e selo de forma; zoom no cursor e arrasto; filas em zigue-zague | 2026-10-02 |
| D92 | Área de formação | Retângulo de ⌈largura/3⌉ × ⌈altura/3⌉ casas do lado do esquadrão | 2026-10-02 |

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
