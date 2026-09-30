import type { System } from '@core';
import { Velocity } from '../../components';
import { Wander } from './wander.component';

/** IA simples: troca de direção aleatoriamente a cada 0,5–2s. */
export function createWanderSystem(): System {
  return {
    id: 'wander',
    phase: 'logic',
    update(dt, { world, rng }) {
      for (const [, wander, velocity] of world.query(Wander, Velocity)) {
        wander.timer -= dt;
        if (wander.timer > 0) continue;
        wander.timer = rng.range(0.5, 2);
        const angle = rng.range(0, Math.PI * 2);
        velocity.x = Math.cos(angle) * wander.speed;
        velocity.y = Math.sin(angle) * wander.speed;
      }
    },
  };
}
