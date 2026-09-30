import type { SystemCatalog } from '@core';
import { createDebugOverlaySystem } from './debug_overlay/debug_overlay.system';
import { createMovementSystem } from './movement/movement.system';
import { createPlayerControlSystem } from './player_control/player_control.system';
import { createPlaytimeSystem } from './playtime/playtime.system';
import { createShapeRenderSystem } from './shape_render/shape_render.system';
import { createWanderSystem } from './wander/wander.system';
// <new-system-import>

/**
 * Catálogo de TODOS os sistemas do jogo (id → fábrica).
 * Cenas escolhem quais usar pelo id; dependências são resolvidas automaticamente.
 * `npm run new:system <nome>` adiciona entradas aqui sozinho.
 */
export const SYSTEM_CATALOG: SystemCatalog = {
  debug_overlay: createDebugOverlaySystem,
  movement: createMovementSystem,
  player_control: createPlayerControlSystem,
  playtime: createPlaytimeSystem,
  shape_render: createShapeRenderSystem,
  wander: createWanderSystem,
  // <new-system-entry>
};
