import type { System } from '@core';

/** F3 alterna um painel com FPS, entidades e ordem dos sistemas. */
export function createDebugOverlaySystem(): System {
  let visible = import.meta.env.DEV;
  let fps = 0;
  let last = performance.now();
  return {
    id: 'debug_overlay',
    phase: 'late',
    update(_dt, { input }) {
      if (input.justPressed('debug_toggle')) visible = !visible;
    },
    render(_alpha, { renderer, world, systems, clock }) {
      const now = performance.now();
      fps = fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1;
      last = now;
      if (!visible) return;
      const lines = [
        `FPS ${fps.toFixed(0)}  tick ${clock.tick}`,
        `entidades ${world.entityCount}`,
        `sistemas ${systems.order.join(' → ')}`,
      ];
      renderer.rect(4, 4, 700, lines.length * 18 + 8, 'rgba(0,0,0,0.6)');
      lines.forEach((l, i) => renderer.text(l, 10, 17 + i * 18, { size: 12, color: '#9ccc65', font: 'monospace' }));
    },
  };
}
