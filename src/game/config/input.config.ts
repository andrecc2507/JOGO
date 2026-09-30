import type { InputBindings } from '@core';

/** Mapa de ações → teclas. Adicione ações novas aqui e use `input.isDown('acao')` nos sistemas. */
export const INPUT_BINDINGS: InputBindings = {
  confirm: ['Enter'],
  cancel: ['Escape'],
  pause: ['Space'],
  speed_1: ['Digit1'],
  speed_2: ['Digit2'],
  speed_3: ['Digit3'],
  speed_4: ['Digit4'],
  rotate_left: ['KeyQ'],
  rotate_right: ['KeyE'],
  pan_up: ['KeyW', 'ArrowUp'],
  pan_down: ['KeyS', 'ArrowDown'],
  pan_left: ['KeyA', 'ArrowLeft'],
  pan_right: ['KeyD', 'ArrowRight'],
  debug_toggle: ['F3'],
};
