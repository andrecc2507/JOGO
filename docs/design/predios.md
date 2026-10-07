# Prédios, andares e luz

## Modelo
- Cada coluna do mapa = chão (bloco de 0 até `h`, indestrutível) + **peças empilhadas** (`Tile.up`):
  paredes, lajes, telhados. Cada peça é um bloco maciço de `b` até `h` com resistência por material
  (`TERRAIN[t].hp`).
- Os **vãos** entre as peças são o espaço: vão de 2+ níveis = andar (dá para ficar de pé); vão de
  2 no térreo com `door` = porta (fechada bloqueia a visão; abre ao passar ou com 🚪 Porta, ação livre);
  vão de 1 nível = **janela** (a visão e os tiros passam, ninguém passa).
- Andar = 3 níveis (2 de vão + 1 de laje). Até 20 andares (`MAX_BUILD_HEIGHT`).
- Célula = (x, y, nível). Nível 0 = topo do chão; k = topo da peça k. Unidade guarda `z` (altura onde
  pisa; ausente = chão). Regra simplificada: **uma unidade por coluna**.

## Movimento
- Passo entre colunas: diferença de altura dentro do salto e espaço livre para o corpo nas duas
  colunas (não se salta através de teto nem de parede).
- **Escada** (`ladder`): sem limite de salto para entrar/sair da coluna e liga os andares dela por
  dentro (alçapão até o telhado). Casas e torres trazem escada interna; casas de adobe, escada de fora.
- **Voando**: ignora a diferença de altura (sobe em telhados e torres). **Salto**: telhado de 1 andar
  (3 níveis) é alcançável com salto 3.

## Visão e névoa
- Linha de visão em 3D: paredes, lajes, telhados e portas fechadas cortam; janelas e portas abertas, não.
- Dentro de casa (sob teto) há névoa **mesmo de dia**: é preciso abrir a porta, olhar pela janela ou entrar.
- Corte de andar: com a unidade ativa sob teto, a câmera esconde o que está acima do andar dela;
  PageUp/PageDown sobem e descem o corte (batalha e editor).

## Destruição e desabamento
- Ataque básico mira paredes (acerto garantido); habilidades de área causam ×1,5 nas peças na altura do centro.
- Peça sem apoio cai: apoio vem de baixo (em cadeia até o chão) ou dos lados por até `SPAN` = 3 casas de balanço.
- Queda de 2+ níveis vira **escombro** (metade da espessura); o que estava embaixo é esmagado.
- Unidades: quem estava em cima despenca (`fallDamage`); quem estava embaixo é soterrado (`crushDamage`)
  e fica em cima dos escombros. Números em `balance.json` → `collapse`.

## Mirar no chão e luz
- Magias/tiros de alvo único podem mirar **no chão** (sem rolar acerto) com +2 de alcance: acertam o
  objeto ou a parede da casa; fogo em chão que não pega deixa **brasas** (luz por 3 turnos).
- À noite, fogo, brasas, lampiões (raio 3), fogueiras (3), cristais, lava, portais e quem está queimando
  iluminam em volta; casas iluminadas são vistas de até 14 casas (com linha de visão).
- Projéteis iluminam o trajeto na animação. Números em `balance.json` → `light`.
