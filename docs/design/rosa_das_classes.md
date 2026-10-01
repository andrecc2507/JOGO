# Rosa das classes (árvore de habilidades e avanço de classe)

Carro-chefe do jogo. Cada classe tem sua própria árvore em forma de rosa dos ventos.
Nome e simbologia provisórios; a ideia é buscar inspiração temática nos escritos
ocultistas de Aleister Crowley.

## Formato

```
            NO            N            NE
         híbrido     evolução 1     híbrido
                          │
      O  evolução 4 ── CLASSE BASE ── evolução 2  L
                          │
         híbrido     evolução 3     híbrido
            SO            S            SE
```

- **Centro:** a classe base do personagem.
- **Pontos cardeais (N, L, S, O):** as 4 evoluções principais da classe.
- **Diagonais (NE, SE, SO, NO):** subclasses híbridas, que misturam as duas evoluções vizinhas
  (é aqui que entra o multiclasse).
- Todas as 5 classes seguem esse formato.
- Antes da rosa existe o **Aprendiz**, classe inicial genérica que escolhe uma das 5 classes ao passar do 1º nível.

## Exemplo: Guerreiro

| direção | caminho | tipo |
|---------|---------|------|
| centro | Guerreiro | classe base |
| N | Berserker | evolução |
| L | Duelista | evolução |
| S | Templário | evolução |
| O | Guerreiro Arcano | evolução |
| NE | Berserker + Duelista | híbrida |
| SE | Templário + Duelista | híbrida |
| SO | Templário + Guerreiro Arcano | híbrida |
| NO | Berserker + Guerreiro Arcano | híbrida |

Nomes das híbridas: a definir.

## Evoluções já definidas em outras classes

| classe | evolução | observação |
|--------|----------|------------|
| Arqueiro | Druida | adestra feras e luta com familiares |
| Clérigo | Monge | luta com as mãos (depois soqueiras) |
| Clérigo | (nome a definir) | estilo templário, usa maça e escudo |

Observação: o Guerreiro já tem uma evolução chamada Templário. A evolução do Clérigo precisa de
outro nome (ex.: Cruzado, Paladino, Inquisidor).

## Regras

- **Liberdade total:** o jogador investe pontos em qualquer direção da rosa, quantas quiser,
  na ordem que quiser. É possível montar builds ótimas ou ruins.
- **Sem reset:** não há redistribuição de pontos. Errou a build, recruta ou treina outro personagem.
- **Sem guia:** o jogo não sugere builds nem aponta o caminho certo.

## Árvores implementadas

Ladino e Mago estão no jogo, com editor próprio — ver [`arvores_de_habilidades.md`](arvores_de_habilidades.md).
Regra provisória para híbridas: 1 habilidade aprendida em cada evolução vizinha.

## Perguntas abertas
- O que desbloqueia uma híbrida (pontos nas duas evoluções vizinhas? nada?).
- Existe exigência de nível para evoluções e híbridas, ou tudo está aberto desde o início?
- Demais evoluções das outras 4 classes (e a direção do Druida na rosa do Arqueiro).
