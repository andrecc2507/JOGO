# Elementos e interações

Diferencial do jogo: os elementos interagem entre si e com o terreno de forma sistêmica,
seguindo uma lógica física reconhecível. Todos os elementos existem.

## Exemplos definidos

| elemento | + | resultado |
|----------|---|-----------|
| Fogo | Água | vapor no campo de batalha |
| Fogo | natureza (grama, madeira, árvores) | incêndio |
| Água | Eletricidade | água eletrificada, dá choque em quem está nela |
| Vento | Fogo | amplifica o fogo |

---

## Sistema completo (aprovado em 2026-09-30)

Valores numéricos (dano, duração, chances) ficam para o balanceamento.
Combinações marcadas com "?" estão aprovadas como ideia, mas o efeito exato será detalhado depois.

### Elementos

| elemento | ideia |
|----------|-------|
| Fogo | dano, queima, espalha em vegetação |
| Água | molha, apaga fogo, conduz eletricidade |
| Gelo | congela água e alvos molhados, cria chão escorregadio |
| Eletricidade | dano, atordoa, se propaga pela água |
| Vento | empurra, espalha fogo e nuvens, dispersa névoa |
| Terra | cria obstáculos e altura, vira lama com água |
| Veneno | dano contínuo, nuvem inflamável |
| Luz | cura/sagrado; revela escondidos |
| Sombra | trevas/interdimensional; ajuda a esconder |

### Superfícies e nuvens no mapa

| superfície / nuvem | origem | efeito |
|--------------------|--------|--------|
| Chamas | Fogo em vegetação, óleo ou veneno | dano a quem passa; se espalha |
| Poça d'água | Água | molha quem pisa; conduz eletricidade |
| Água eletrificada | Eletricidade na poça | choque em quem está nela |
| Gelo | Gelo na poça | escorregadio; pode prender quem estava na poça |
| Vapor / névoa | Fogo na água | bloqueia linha de visão (ajuda a esconder) |
| Lama | Água na terra | reduz movimento |
| Nuvem de veneno | Veneno | dano contínuo; explode com fogo |
| Óleo | item arremessado | escorregadio; muito inflamável |

### Matriz de interações

| | Fogo | Água | Gelo | Eletricidade | Vento | Terra | Veneno |
|---|---|---|---|---|---|---|---|
| **Fogo** | — | vapor, apaga o fogo | derrete em água | — | fogo amplificado e espalhado | — | explosão |
| **Água** | | — | congela | água eletrificada | — | lama | dilui a nuvem |
| **Gelo** | | | — | — | nevasca? | — | — |
| **Eletricidade** | | | | — | tempestade? | aterramento (anula) | — |
| **Vento** | | | | | — | tempestade de areia? | empurra a nuvem |
| **Terra** | | | | | | — | — |

### Status nas unidades

| status | causa | efeito sugerido |
|--------|-------|-----------------|
| Molhado | água, chuva | +dano de eletricidade e gelo; imune a queimar |
| Queimando | fogo | dano por turno; apagado por água |
| Congelado | gelo em alvo molhado | perde o próximo turno |
| Eletrocutado | eletricidade | barra de ação enche mais devagar |
| Envenenado | veneno | dano por turno |
| Enlameado | lama | movimento reduzido |

### Ideias extras
- Líquidos escorrem para tiles mais baixos (usa a altura do terreno).
- Clima do bioma altera elementos: chuva deixa todos molhados; neve facilita congelar;
  deserto dificulta água.
- Luz e Sombra conversam com o sistema de escondido.
