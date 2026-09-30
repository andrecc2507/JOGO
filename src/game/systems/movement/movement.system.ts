import { clamp, type System } from '@core';
import { Transform, Velocity } from '../../components';

/** Integra velocidade em posição e mantém tudo dentro da tela. */
export function createMovementSystem(): System {
  return {
    id: 'movement',
    phase: 'physics',
    update(dt, { world, renderer }) {
      for (const [, t, v] of world.query(Transform, Velocity)) {
        t.x = clamp(t.x + v.x * dt, 0, renderer.width);
        t.y = clamp(t.y + v.y * dt, 0, renderer.height);
      }
    },
  };
}
