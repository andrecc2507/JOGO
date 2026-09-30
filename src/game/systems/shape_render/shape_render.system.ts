import type { System } from '@core';
import { Shape, Transform } from '../../components';

/** Desenha entidades com Shape. Placeholder até existirem sprites. */
export function createShapeRenderSystem(): System {
  return {
    id: 'shape_render',
    phase: 'late',
    render(_alpha, { world, renderer }) {
      for (const [, t, shape] of world.query(Transform, Shape)) {
        if (shape.kind === 'circle') renderer.circle(t.x, t.y, shape.size, shape.color);
        else renderer.rect(t.x - shape.size / 2, t.y - shape.size / 2, shape.size, shape.size, shape.color);
      }
    },
  };
}
