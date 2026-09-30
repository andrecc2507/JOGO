import type { DataRegistry, Entity, World } from '@core';
import { ActorRef, PlayerControlled, Shape, Transform, Velocity } from '../components';

/** Prefabs montam entidades a partir das definições em data/. */
export function spawnActor(world: World, data: DataRegistry, defId: string, x: number, y: number): Entity {
  const def = data.get('actors', defId);
  const e = world.spawn();
  world
    .add(e, ActorRef, { defId })
    .add(e, Transform, { x, y })
    .add(e, Velocity, { x: 0, y: 0 })
    .add(e, Shape, { kind: def.shape, size: def.size, color: def.color });
  return e;
}

export function spawnPlayer(world: World, data: DataRegistry, x: number, y: number): Entity {
  const e = spawnActor(world, data, 'player', x, y);
  world.add(e, PlayerControlled, { speed: data.get('actors', 'player').speed });
  return e;
}
