# Sprites prontos e animações

As unidades nascem com pixel art gerada em código (`render/sprites.ts`). Uma criatura pode trocar
isso por arte pronta (ex.: feita no Ludo.ai), com uma animação por pose. O que faltar cai para a
pose mais próxima e, no fim, para a imagem parada; sem arte nenhuma, segue a pixel art.

## Formato das imagens

- PNG com fundo transparente, **1 pixel por pixel de arte** (sem ampliar), olhando **para a direita**
  (o jogo espelha quando a unidade vira), pés encostados na borda de baixo.
- Animação = **tira horizontal** de quadros do mesmo tamanho, de preferência do mesmo tamanho da
  imagem parada (a escala na tela vem da imagem parada e do campo "Tamanho" da criatura).

## Onde ficam

```
public/assets/sprites/criaturas/<id>.png            imagem parada (retrato e reserva)
public/assets/sprites/criaturas/<id>/<pose>.png     uma tira por pose
public/assets/sprites/criaturas/<id>/skill_<id>.png animação própria de uma habilidade
```

E uma entrada em `src/game/data/sprite_art.json` (a chave é o id da criatura):

```json
"urso_chifre": {
  "base": "assets/sprites/criaturas/urso_chifre.png",
  "anims": {
    "idle": 4,
    "move": 6,
    "jump": { "frames": 5, "fps": 12 },
    "hurt": 3,
    "fallen": 4,
    "dead": 6,
    "attack": 5,
    "cast": 5,
    "skill:investida_de_chifres": 8
  }
}
```

O número é a quantidade de quadros. Na forma longa: `frames`, `fps`, `loop` e `sheet` (outro caminho).
Um teste confere que todo arquivo citado existe em `public/`.

## Poses

| Pose     | Quando                                         | Padrão         | Se faltar          |
|----------|------------------------------------------------|----------------|--------------------|
| `idle`   | parado                                         | 6 fps, laço    | imagem parada      |
| `move`   | andando, investidas                            | 10 fps, laço   | `idle`             |
| `jump`   | subindo/descendo degrau, saltos                | 10 fps, 1 vez  | `move`             |
| `hurt`   | 0,4 s depois de sofrer dano (reinicia a cada golpe) | 12 fps, 1 vez | `idle`         |
| `fallen` | com o estado Derrubado                         | 8 fps, 1 vez   | `idle`             |
| `dead`   | morto (com `dead`, o corpo fica no chão)       | 8 fps, 1 vez   | `fallen`           |
| `attack` | usando habilidade física / ataque básico       | 12 fps, 1 vez  | `idle`             |
| `cast`   | usando magia                                   | 10 fps, 1 vez  | `attack`           |
| `skill:<id>` | usando aquela habilidade                   | 12 fps, 1 vez  | `attack`/`cast`    |

Prioridade quando várias valem: morto > habilidade > dano > pulo/andar > caído > parado
(`resolvePose` em `render/sprite_anims.ts`). Animações "1 vez" seguram o último quadro.

No Bestiário, o seletor **Animação** da prévia mostra cada pose (✓ própria, ↪ reserva usada,
— só a imagem parada); as que tocam uma vez repetem a cada 2 s.
