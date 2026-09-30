/** Constantes globais do jogo. Valores de balanceamento ficam em data/, não aqui. */
export const GAME_CONFIG = {
  title: 'JOGO',
  width: 960,
  height: 540,
  background: '#0f1117',
  fixedDt: 1 / 60,
  save: { version: 1, migrations: {} },
} as const;
