import type { InputBindings } from '@core';

/** Mapa de ações → teclas. Adicione ações novas aqui e use `input.isDown('acao')` nos sistemas. */
export const INPUT_BINDINGS: InputBindings = {
  move_up: ['KeyW', 'ArrowUp'],
  move_down: ['KeyS', 'ArrowDown'],
  move_left: ['KeyA', 'ArrowLeft'],
  move_right: ['KeyD', 'ArrowRight'],
  confirm: ['Enter', 'Space'],
  cancel: ['Escape'],
  continue: ['KeyC'],
  debug_toggle: ['F3'],
};
