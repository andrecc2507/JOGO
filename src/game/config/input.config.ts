import type { InputBindings } from '@core';

/** Mapa de ações → teclas. Adicione ações novas aqui e use `input.isDown('acao')` nos sistemas. */
export const INPUT_BINDINGS: InputBindings = {
  confirm: ['Enter', 'PadA'],
  cancel: ['Escape', 'PadB'],
  pause: ['Space', 'PadStart'],
  undo_turn: ['KeyZ', 'PadY'],
  speed_1: ['Digit1'],
  speed_2: ['Digit2'],
  speed_3: ['Digit3'],
  speed_4: ['Digit4'],
  rotate_left: ['KeyQ', 'PadLB'],
  rotate_right: ['KeyE', 'PadRB'],
  pan_up: ['KeyW', 'ArrowUp', 'PadUp', 'PadRUp'],
  pan_down: ['KeyS', 'ArrowDown', 'PadDown', 'PadRDown'],
  pan_left: ['KeyA', 'ArrowLeft', 'PadLeft', 'PadRLeft'],
  pan_right: ['KeyD', 'ArrowRight', 'PadRight', 'PadRRight'],
  debug_toggle: ['F3'],
};
