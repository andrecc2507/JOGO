import { normalize, type System } from '@core';
import { PlayerControlled, Velocity } from '../../components';

/** Converte input do jogador em velocidade. */
export function createPlayerControlSystem(): System {
  return {
    id: 'player_control',
    phase: 'input',
    update(_dt, { world, input }) {
      const dir = normalize({
        x: input.axis('move_left', 'move_right'),
        y: input.axis('move_up', 'move_down'),
      });
      for (const [, control, velocity] of world.query(PlayerControlled, Velocity)) {
        velocity.x = dir.x * control.speed;
        velocity.y = dir.y * control.speed;
      }
    },
  };
}
